/* Stage 1: review and file shared originals. AI extraction is deliberately not simulated. */
(function () {
  'use strict';
  const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  function project() { return state.projects.find(p => p.id === state.currentProjectId); }
  function notice(host, message, bad = false) {
    host.textContent = message; host.className = bad ? 'crew-error' : 'muted';
  }
  function rowMarkup(row, admin) {
    const detail = [row.kind === 'plan' ? row.sheet : '', row.revision ? `Rev ${row.revision}` : '', row.document_date || ''].filter(Boolean).join(' • ');
    return `<article class="tool-card" style="margin:12px 0;overflow-wrap:anywhere">
      <h3>${e(row.title || row.original_name)}</h3>
      <p>${e(detail || row.kind)} • ${e(row.status === 'uploading' ? 'Incomplete upload' : row.status === 'pending' ? 'Needs Admin review' : 'Shared with workspace')}</p>
      <small>Original: ${e(row.original_name)} • ${(row.byte_size / 1048576).toFixed(2)} MB</small>
      <div class="section-actions">
      ${row.status !== 'uploading' ? `<button class="small-btn" data-doc-download="${e(row.id)}">Download original</button>` : ''}
      ${admin && row.status === 'pending' ? `<button class="small-btn orange" data-doc-review="${e(row.id)}">Review & file</button>` : ''}
      ${admin && row.status === 'uploading' ? `<button class="small-btn" data-doc-retry="${e(row.id)}">Retry incomplete upload</button>` : ''}
      </div></article>`;
  }
  function bindRows(host, rows, reload) {
    host.querySelectorAll('[data-doc-download]').forEach(button => button.onclick = async () => {
      const row = rows.find(r => r.id === button.dataset.docDownload);
      button.disabled = true;
      try {
        const blob = await RivetDocuments.download(row);
        if (!host.isConnected) return;
        const url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = row.original_name; a.rel = 'noopener'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      } catch (error) { if (host.isConnected) toast(error.message); }
      finally { button.disabled = false; }
    });
    host.querySelectorAll('[data-doc-review]').forEach(button => button.onclick = () => {
      if (!CrewCloud.canManage()) return toast('Only an online Admin can approve uploads.');
      const row = rows.find(r => r.id === button.dataset.docReview);
      openCrewDialog(`<h2 id="crewDialogTitle">Review & file original</h2>
        <p>${e(row.original_name)}</p><p class="muted">Choose the destination yourself. AI extraction is not connected.</p>
        <form id="documentReviewForm"><div class="form-grid">
          <div class="field full"><label for="doc-kind">File under</label><select id="doc-kind" name="kind" required>
            <option value="">Choose destination</option><option value="report">Daily Reports</option><option value="plan">Plans</option><option value="other">Other documents</option>
          </select></div>
          <div class="field full"><label for="doc-title">Title</label><input id="doc-title" name="title" maxlength="240" value="${e(row.original_name.slice(0,240))}" required></div>
          <div class="field"><label for="doc-date">Report / drawing date</label><input id="doc-date" type="date" name="date"></div>
          <div class="field"><label for="doc-sheet">Drawing sheet</label><input id="doc-sheet" name="sheet" maxlength="80" placeholder="E201"></div>
          <div class="field"><label for="doc-revision">Revision</label><input id="doc-revision" name="revision" maxlength="80"></div>
        </div><p class="muted">Approval makes the original visible to every member of this workspace, including Guests. This files the attachment; it does not extract hours, materials or other report fields.</p>
        <p id="doc-review-status" role="alert"></p><button type="submit" class="small-btn orange">Approve & share with workspace</button></form>`);
      const form = document.getElementById('documentReviewForm');
      form.elements.kind.onchange = () => {
        form.elements.date.required = form.elements.kind.value === 'report';
        form.elements.sheet.required = form.elements.kind.value === 'plan';
      };
      form.onsubmit = async event => {
        event.preventDefault(); if (form.dataset.busy) return;
        const values = Object.fromEntries(new FormData(form));
        if (!values.title.trim()) return notice(form.querySelector('[role=alert]'), 'Enter a title.', true);
        if (!confirm(`Share “${values.title.trim()}” with every member of this workspace?`)) return;
        form.dataset.busy = '1'; form.querySelector('[type=submit]').disabled = true;
        try {
          await RivetDocuments.approve(row, values);
          if (form.isConnected) closeCrewDialog();
          if (host.isConnected) await reload();
          toast('Original filed and shared.');
        } catch (error) { if (form.isConnected) notice(form.querySelector('[role=alert]'), error.message, true); }
        finally { delete form.dataset.busy; form.querySelector('[type=submit]').disabled = false; }
      };
    });
    host.querySelectorAll('[data-doc-retry]').forEach(button => button.onclick = () => {
      const row = rows.find(r => r.id === button.dataset.docRetry);
      openCrewDialog(`<h2 id="crewDialogTitle">Recover incomplete upload</h2><p>${e(row.original_name)}</p>
        <p>First try Finish upload. If the original is missing, choose the same file and try again.</p>
        <label for="doc-retry-file">Original file (only if needed)</label><input id="doc-retry-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.txt">
        <p id="doc-retry-status" role="alert"></p><button class="small-btn orange" id="doc-retry-submit">Finish upload</button>`);
      const retry = document.getElementById('doc-retry-submit'), message = document.getElementById('doc-retry-status');
      retry.onclick = async () => {
        retry.disabled = true;
        try {
          await RivetDocuments.finish(row, document.getElementById('doc-retry-file')?.files[0]);
          if (retry.isConnected) closeCrewDialog();
          if (host.isConnected) await reload();
        } catch (error) { if (message.isConnected) notice(message, error.message, true); }
        finally { retry.disabled = false; }
      };
    });
  }
  function renderInbox(content) {
    const active = project(), admin = CrewCloud.canManage();
    if (!active) { content.textContent = 'Choose a project first.'; return; }
    content.innerHTML = `<div class="callout"><b>${e(active.name)} • Shared Documents</b><br>
      Originals stay private to your workspace. Pending files are Admin-only; approved files are visible to all workspace members.<br>
      <b>AI sorting is not connected yet.</b> This first stage supports manual review and filing.</div>
      ${admin ? `<div class="drawing-upload" id="document-drop"><h3>Drop daily reports and prints here</h3>
        <label for="document-files">Choose files or drag them here</label><input id="document-files" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.txt">
        <p class="muted">PDF, JPG, PNG or TXT • up to 20 MB each • up to 10 files per batch</p>
        <button class="small-btn orange" id="document-upload">Upload to Admin review</button>
        <p id="document-upload-status" role="status" aria-live="polite"></p></div>` : '<p class="muted">Read-only shared documents. Only connected Admins can upload and approve.</p>'}
      <div class="section-actions"><button class="small-btn" id="document-refresh">Refresh shared documents</button></div>
      <p id="document-list-status" role="status"></p><div id="document-rows"></div>`;
    const listHost = content.querySelector('#document-rows'), listStatus = content.querySelector('#document-list-status');
    let loading = false, busy = false, selected = [], loadGeneration = 0;
    async function reload() {
      const gen = ++loadGeneration; loading = true;
      notice(listStatus, 'Loading shared documents…');
      try {
        const rows = await RivetDocuments.list(active.id);
        if (!content.isConnected || gen !== loadGeneration) return;
        const canEdit = CrewCloud.canManage();
        listHost.innerHTML = rows.map(row => rowMarkup(row, canEdit)).join('') || '<p>No shared documents for this project yet.</p>';
        notice(listStatus, `${rows.length} shared document entries • refreshed ${new Date().toLocaleTimeString()}`);
        bindRows(listHost, rows, reload);
      } catch (error) {
        if (content.isConnected && gen === loadGeneration) { listHost.replaceChildren(); notice(listStatus, error.message, true); }
      } finally { if (gen === loadGeneration) loading = false; }
    }
    content.querySelector('#document-refresh').onclick = () => { if (!busy && !loading) void reload(); };
    if (admin) {
      const input = content.querySelector('#document-files'), drop = content.querySelector('#document-drop');
      const button = content.querySelector('#document-upload'), status = content.querySelector('#document-upload-status');
      input.onchange = () => { selected = Array.from(input.files); notice(status, `${selected.length} files selected.`); };
      drop.ondragover = event => event.preventDefault();
      drop.ondrop = event => {
        event.preventDefault(); if (busy) return;
        selected = Array.from(event.dataTransfer.files); input.value = '';
        notice(status, `${selected.length} files selected: ${selected.map(f => f.name).join(', ')}`);
      };
      button.onclick = async () => {
        if (busy) return;
        if (!selected.length || selected.length > 10) return notice(status, 'Select between 1 and 10 files.', true);
        try { selected.forEach(file => RivetDocuments.validateFile(file)); }
        catch (error) { return notice(status, error.message, true); }
        busy = true; button.disabled = true; input.disabled = true;
        let completed = 0;
        try {
          const batch = selected.slice();
          for (const file of batch) {
            notice(status, `Uploading ${completed + 1} of ${batch.length}: ${file.name}`);
            await RivetDocuments.upload(active.id, file); completed++;
          }
          notice(status, `${completed} originals uploaded. Review them below before sharing.`);
        } catch (error) { notice(status, `${completed} completed. ${error.message}`, true); }
        finally {
          // Clear selection on failure too: retry the incomplete entry, not the batch.
          selected = []; input.value = ''; busy = false; button.disabled = false; input.disabled = false;
          if (content.isConnected) await reload();
        }
      };
    }
    void reload();
  }
  function mountSection(content, route) {
    const active = project(); if (!active) return;
    const host = document.createElement('section'); host.className = 'tool-card';
    host.innerHTML = `<h3>Shared ${route === 'plans' ? 'drawings' : 'report originals'}</h3>
      <button class="small-btn" data-route="documents">Open shared Documents Inbox</button>
      <p class="muted">Approved attachments are shared across this workspace. The existing beta tools below still save on this device.</p>
      <p data-shared-status role="status">Loading shared files…</p><div data-shared-rows></div>`;
    content.prepend(host);
    const status = host.querySelector('[data-shared-status]'), rowsHost = host.querySelector('[data-shared-rows]');
    async function reload() {
      try {
        const rows = (await RivetDocuments.list(active.id)).filter(row => row.status === 'approved' && row.kind === (route === 'plans' ? 'plan' : 'report'));
        if (!host.isConnected) return;
        notice(status, rows.length ? `${rows.length} shared originals` : 'No approved shared originals yet.');
        rowsHost.innerHTML = rows.map(row => rowMarkup(row, false)).join('');
        bindRows(rowsHost, rows, reload);
      } catch (error) { if (host.isConnected) notice(status, error.message, true); }
    }
    void reload();
  }
  window.RivetDocumentsUI = {renderInbox, mountSection};
})();
