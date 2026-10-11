const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const u = require('../field-utils.js');
const recovery = require('../field-recovery.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const source = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const copy = value => JSON.parse(JSON.stringify(value));
const seedContext = {};
vm.runInNewContext(source.slice(source.indexOf('const projects='), source.indexOf('const practiceMode=')) + ';this.seedData=seed;', seedContext);
const seed = copy(seedContext.seedData);

function classList() {
  const values = new Set();
  return {add: value => values.add(value), remove: value => values.delete(value), contains: value => values.has(value)};
}
function element() {
  return {classList: classList(), setAttribute() {}, append() {}, focus() {}, querySelectorAll() {return [];}, querySelector() {return null;}};
}
// Execute the actual application save/changeState/undo handlers, not duplicate implementations.
function actionHarness() {
  const nodes = new Map();
  const context = {
    state: copy(seed), FieldUtils: u, undoSnapshot: null, undoTimer: null,
    undoText: element(), undoBar: element(), undoBtn: element(), toast: element(),
    currentMore: '', writes: [], failure: null, renders: 0, updates: 0,
    setTimeout() {return 1;}, clearTimeout() {},
    document: {getElementById(id) {if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id);}},
    renderAll() {context.renders++;}, renderMore() {}, updateDeviceStatus() {context.updates++;},
    fieldStore: {save(value) {if (context.failure) throw context.failure; context.writes.push(copy(value));}}
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function clone(x)'), source.indexOf('\nfunction nav(id)')), context);
  return context;
}

async function entries(blob) {
  const buffer = Buffer.from(await blob.arrayBuffer());
  const out = {}; let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const length = buffer.readUInt32LE(offset + 18), nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28), start = offset + 30 + nameLength + extraLength;
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString();
    out[name] = buffer.subarray(start, start + length).toString();
    offset = start + length;
  }
  return out;
}

test('material parsing preserves inch, fractional and mixed-number dimensions before deduplication', () => {
  const descriptions = ['1" EMT', '2" EMT', '3/4" EMT', '1 1/4" EMT', '1-1/4" EMT'];
  const parsed = descriptions.map(u.parseMaterial);
  assert.deepEqual(parsed.map(item => item.desc), descriptions);
  assert.ok(parsed.every(item => item.qty === ''));
  assert.equal(u.mergeMaterials(parsed).length, descriptions.length);
});

test('explicit material counts preserve dimensions and received status when combined', () => {
  for (const [line, qty, desc] of [['(6) 1" EMT', '6', '1" EMT'], ['200 ft 3/4" PVC', '200 ft', '3/4" PVC'], ['6 ea 1 1/4" fittings', '6 ea', '1 1/4" fittings'], ['2 x 1" connectors', '2', '1" connectors']]) {
    assert.deepEqual(u.parseMaterial(line), {qty, desc, status: 'Needed'});
  }
  const needed = u.parseMaterial('(6) 1" EMT');
  const rows = u.mergeMaterials([needed, {...needed, qty: '2'}, {...needed, qty: '1', status: 'Received'}, u.parseMaterial('(8) 2" EMT')]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].qty, '6 + 2');
  assert.equal(rows[1].status, 'Received');
  assert.equal(rows[2].desc, '2" EMT');
});

test('failed transaction restores nested values, deletion, calibration and project selection', () => {
  const state = copy(seed), before = copy(state);
  const call = state.service.calls[0], project = state.projectData.silver;
  project.plans.push({id: 'p1', data: 'data:image/png;base64,AA==', measurements: []});
  before.projectData.silver.plans = copy(project.plans);
  const plan = project.plans[0], calls = state.service.calls;
  assert.throws(() => u.transaction(state, () => {
    state.currentProjectId = 'westlake'; call.status = 'Complete';
    project.crew = project.crew.slice(1); plan.pxPerFt = 42; plan.scaleSpace = 'image';
    plan.measurements.push({id: 'm1', feet: 5, scaleSpace: 'image'});
  }, () => {throw Error('QuotaExceededError');}), /QuotaExceededError/);
  assert.deepEqual(state, before);
  assert.equal(state.service.calls, calls);
  assert.equal(state.service.calls[0], call);
  assert.equal(project.plans[0], plan);
});

test('transaction returns an independent pre-change snapshot after a successful commit', () => {
  const state = {rows: [{id: 'one', status: 'Open'}]}; let writes = 0;
  const before = u.transaction(state, () => {state.rows[0].status = 'Closed';}, () => {writes++;});
  assert.equal(writes, 1); assert.equal(state.rows[0].status, 'Closed');
  assert.equal(before.rows[0].status, 'Open'); assert.notEqual(before.rows[0], state.rows[0]);
});

test('actual changeState rolls back repeated failed status changes and reports no success', () => {
  const h = actionHarness(), call = h.state.service.calls[0];
  h.failure = Error('Device full');
  const statuses = ['Scheduled', 'En Route', 'Arrived'];
  for (let i = 0; i < 2; i++) {
    assert.equal(h.changeState(() => {call.status = statuses[statuses.indexOf(call.status) + 1];}), false);
    assert.equal(call.status, 'Scheduled');
  }
  assert.equal(h.writes.length, 0); assert.equal(h.renders, 2);
  assert.match(h.toast.textContent, /Device full/);
  h.failure = null;
  assert.equal(h.changeState(() => {call.status = 'En Route';}), true);
  assert.equal(h.writes[0].service.calls[0].status, 'En Route');
});

test('actual Undo cannot erase a later successful save', () => {
  const h = actionHarness(), project = h.state.projectData.silver;
  h.changeState(() => {project.crew = project.crew.filter(c => c.id !== 'c1');}, {undo: 'Removed crew'});
  assert.ok(h.undoSnapshot); assert.equal(h.undoBar.classList.contains('show'), true);
  project.notes.push({id: 'new-note', body: 'Saved after deletion'});
  h.save();
  assert.equal(h.undoSnapshot, null); assert.equal(h.undoBar.classList.contains('show'), false);
  h.undoBtn.onclick();
  assert.equal(project.notes[0].body, 'Saved after deletion');
  assert.equal(project.crew.some(c => c.id === 'c1'), false);
  assert.equal(h.writes.length, 2);
});

test('failed Undo retains the committed state and can be retried', () => {
  const h = actionHarness(), originalCount = h.state.projectData.silver.crew.length;
  h.changeState(() => {h.state.projectData.silver.crew.pop();}, {undo: 'Removed crew'});
  h.failure = Error('Storage unavailable'); h.undoBtn.onclick();
  assert.equal(h.state.projectData.silver.crew.length, originalCount - 1);
  assert.ok(h.undoSnapshot);
  h.failure = null; h.undoBtn.onclick();
  assert.equal(h.state.projectData.silver.crew.length, originalCount);
  assert.equal(h.undoSnapshot, null);
});

test('opening an edit form invalidates Undo before captured record references can become stale', () => {
  const h = actionHarness();
  Object.assign(h, {modal: element(), modalTitle: element(), modalBody: element(), modalSave: element(), modalCancel: element(), modalBusy: false, modalClosing: false, modalDirty: false, modalTracksEdits: false, unsavedForm: null});
  h.document.createElement = element;
  const app = element();
  h.document.querySelector = () => app;
  h.document.activeElement = element();
  vm.runInContext(source.slice(source.indexOf('function openModal('), source.indexOf('\nmodal.setAttribute')), h);
  h.changeState(() => {h.state.projectData.silver.crew.pop();}, {undo: 'Removed crew'});
  h.openModal('Edit crew', '', () => {});
  assert.equal(app.inert, true);
  assert.equal(h.undoSnapshot, null);
  assert.equal(h.undoBar.classList.contains('show'), false);
});

test('completed callbacks no longer count as actionable attention', () => {
  assert.equal(Boolean(u.needsAttention({status: 'Complete', callback: true})), false);
  assert.equal(Boolean(u.needsAttention({status: 'Need Parts', callback: false})), true);
  assert.equal(Boolean(u.needsAttention({status: 'Scheduled', callback: true})), true);
  assert.equal(Boolean(u.needsAttention({status: 'Scheduled', callback: false})), false);
});

test('daily crew suggestions omit stale profile hours and absent crew', () => {
  const text = u.dailyCrew([{name: 'Onsite', status: 'On Site', area: 'Second floor', hours: 23}, {name: 'Offsite', status: 'Off', hours: 8}]);
  assert.match(text, /Onsite.*Second floor.*hours: ____/);
  assert.doesNotMatch(text, /23|Offsite|8/);
});

test('daily report text exports the saved date and edited report fields', () => {
  const report = {date: '2026-10-10', crew: 'Alex 7.5h', completed: 'Installed lighting', blockers: 'Need fittings', next: 'Inspect tomorrow', safety: 'Toolbox talk', weather: 'Rain'};
  const text = u.dailyReportText('Test project', report);
  for (const value of ['Test project', ...Object.values(report)]) assert.ok(text.includes(value));
  assert.match(text, /Review attendance, hours and completion before sharing/);
});

function reportHarness() {
  const h = actionHarness(); let nextId = 1;
  h.uid = prefix => prefix + '-' + nextId++;
  h.openModal = (title, body, onSave) => {h.reportTitle = title; h.reportBody = body; h.submitReport = onSave;};
  h.nav = () => {};
  vm.runInContext(source.slice(source.indexOf('function dailyReportForm('), source.indexOf('\nfunction downloadText(')), h);
  h.fillReport = values => {
    h.document.getElementById('reportDate').value = values.date;
    for (const key of ['crew', 'completed', 'blockers', 'next', 'safety', 'weather']) h.document.getElementById('report_' + key).value = values[key] || '';
  };
  return h;
}

test('actual report form persists edited text as a dated snapshot and updates the same report', () => {
  const h = reportHarness();
  h.dailyReportForm();
  h.fillReport({date: '2026-10-10', crew: 'Travis 7.5 hours', completed: '  Installed panels  ', weather: 'Rain'});
  h.submitReport();
  const report = h.state.projectData.silver.dailyReports[0], id = report.id;
  assert.equal(report.date, '2026-10-10');
  assert.equal(report.completed, 'Installed panels');
  assert.equal(h.writes[0].projectData.silver.dailyReports[0].crew, 'Travis 7.5 hours');
  h.state.projectData.silver.crew[0].hours = 24;
  h.state.projectData.silver.crew[0].name = 'Changed profile';
  assert.equal(report.crew, 'Travis 7.5 hours');
  h.dailyReportForm(report);
  h.fillReport({...report, completed: 'Installed and tested panels'});
  h.submitReport();
  assert.equal(h.state.projectData.silver.dailyReports.length, 1);
  assert.equal(h.state.projectData.silver.dailyReports[0].id, id);
  assert.equal(h.writes[1].projectData.silver.dailyReports[0].completed, 'Installed and tested panels');
});

test('actual report form refuses a duplicate date without replacing an existing report', () => {
  const h = reportHarness(), existing = {id: 'existing', date: '2026-10-09', crew: 'Original crew', completed: 'Original work'};
  h.state.projectData.silver.dailyReports = [existing];
  h.dailyReportForm();
  h.fillReport({date: '2026-10-09', crew: 'New crew', completed: 'Replacement work'});
  assert.throws(() => h.submitReport(), /already exists/);
  assert.equal(h.state.projectData.silver.dailyReports.length, 1);
  assert.equal(h.state.projectData.silver.dailyReports[0], existing);
  assert.equal(existing.completed, 'Original work');
  assert.equal(h.writes.length, 0);
});

const malformed = [
  ['material items null', p => {p.materials[0].items = null;}],
  ['null material item', p => {p.materials[0].items = [null];}],
  ['null progress row', p => {p.progress = [null];}],
  ['non-numeric progress', p => {p.progress[0].pct = '<img onerror=alert(1)>'; }],
  ['null plan', p => {p.plans = [null];}],
  ['invalid plan calibration', p => {p.plans = [{id: 'p1', sheet: 'E1', name: 'Plan', rev: '1', data: 'data:image/png;base64,AA==', pxPerFt: 'not-a-number', measurements: []}];}],
  ['invalid plan measurements', p => {p.plans = [{id: 'p1', sheet: 'E1', name: 'Plan', rev: '1', data: 'data:image/png;base64,AA==', pxPerFt: null, measurements: {length: 1}}];}],
  ['invalid reports collection', p => {p.dailyReports = {};}],
  ['null report', p => {p.dailyReports = [null];}],
  ['non-string report date', p => {p.dailyReports = [{id: 'r1', date: 123, crew: '', completed: ''}];}],
  ['non-string report content', p => {p.dailyReports = [{id: 'r1', date: '2026-10-10', crew: '', completed: {}}];}]
];
for (const [label, corrupt] of malformed) {
  test('recovery protects saved records with ' + label, async () => {
    const data = copy(seed); corrupt(data.projectData.silver);
    assert.throws(() => recovery.validate(data));
    const raw = JSON.stringify(data); let writes = 0;
    const store = recovery.createStore({getItem() {return raw;}, setItem() {writes++;}});
    assert.deepEqual(store.load(seed), seed);
    assert.equal(store.status().blocked, true);
    assert.match(store.status().warning, /protected/);
    assert.throws(() => store.save(seed), /protected/);
    assert.equal(writes, 0);
    const archive = await entries((await store.backup(seed)).blob);
    assert.equal(archive['last-saved-records.txt'], raw);
  });
}

test('legacy records without reports and a valid dated report remain readable', () => {
  assert.equal(recovery.validate(copy(seed)).currentProjectId, 'silver');
  const data = copy(seed);
  data.projectData.silver.dailyReports = [{id: 'r1', date: '2026-10-10', crew: 'Alex 7.5h', completed: 'Lighting', blockers: '', next: '', safety: '', weather: '', updatedAt: '2026-10-10T17:00:00.000Z'}];
  assert.equal(recovery.validate(data), data);
});
