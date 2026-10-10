/* Connection feedback and device export UI. No cloud mutations. */
(function () {
  'use strict';
  let exporting=false;
  function describe(s,online) {
    if(!online) return {label:'Device offline',detail:'Shared crew and documents are unavailable. Local records remain on this device.'};
    if(!s.configured) return {label:'Cloud setup unavailable',detail:s.error||'Cloud configuration is missing.'};
    if(!s.signedIn) return {label:'Cloud signed out',detail:'Sign in to check shared crew and documents. Device export does not need sign-in.'};
    if(s.healthy) return {label:'Cloud connected',detail:'Workspace and crew were reached successfully. Documents require their own successful download.'};
    return {label:'Cloud unavailable',detail:s.error||'Checking workspace access. Local records are not uploaded automatically.'};
  }
  function update() {
    const s=CrewCloud.status(), status=describe(s,navigator.onLine);
    document.querySelectorAll('[data-cloud-label]').forEach(x=>x.textContent=status.label);
    document.querySelectorAll('[data-cloud-detail]').forEach(x=>x.textContent=status.detail);
    document.querySelectorAll('[data-cloud-last]').forEach(x=>x.textContent=s.lastSuccess?new Date(s.lastSuccess).toLocaleString():'Not verified in this session');
    const banner=document.getElementById('cloudConnectionWarning');
    if(banner){banner.hidden=!(s.authorized&&!s.healthy);banner.querySelector('[data-cloud-warning-text]').textContent=status.detail;}
    const chip=document.getElementById('syncChip'), txt=document.getElementById('syncText');
    if(chip&&txt){chip.classList.toggle('offline',!s.healthy);txt.textContent=status.label;chip.title=status.detail;}
  }
  function render(content) {
    const count=state.syncQueue?.length||0;
    content.innerHTML=`<div class="permission-banner"><div><b data-cloud-label></b><small data-cloud-detail></small></div><span class="tag">v0.8.0</span></div>
      <p>Last successful workspace check: <span data-cloud-last></span></p>
      <div class="section-actions"><button class="small-btn" data-cloud-retry>Check connection</button><button class="small-btn orange" data-device-backup>Export this device</button></div>
      <p role="status" data-backup-status></p>
      <div class="tool-card"><h3>Device records</h3><p>Reports, notes, calendar entries, embedded photos and local drawing files are saved in this browser. The ZIP includes current local records and the last saved copy. It does not upload or remove anything.</p><p><b>${count} local change notices</b> — these are not a cloud upload queue. The old demo sync did not send records to a server.</p></div>
      <div class="tool-card"><h3>Shared documents and crew</h3><p>Shared originals and crew are separate from this device export. Use Documents Inbox to download originals while connected, and keep a separate database backup. Downloading a file does not make every document available offline.</p><button class="small-btn" data-route="documents">Open Documents Inbox</button></div>
      <div class="callout"><b>Keep a second copy.</b> Save the ZIP somewhere you can recover it if this device is lost. Export each device you use. Check that the file finished downloading before closing the app. This release exports backups; automatic restore is not included.</div>
      <p class="muted">A connection failure may be caused by the network, sign-in, permissions or a paused service. This screen cannot confirm a Supabase pause. No paid plan or background keep-alive is enabled.</p>`;
    update();
  }
  async function exportDevice() {
    if(exporting)return;
    exporting=true;
    const buttons=[...document.querySelectorAll('[data-device-backup]')];buttons.forEach(b=>b.disabled=true);
    const message=text=>document.querySelectorAll('[data-backup-status]').forEach(x=>x.textContent=text);
    message('Preparing this device’s records and drawings…');
    try {
      const snapshot=deepClone(state); // Capture unsaved application records before asynchronous work.
      const result=await RivetBackup.exportDevice(snapshot);
      const url=URL.createObjectURL(result.blob), a=document.createElement('a');
      a.href=url;a.download=`RivetOne-device-${new Date().toISOString().replace(/[:.]/g,'-')}.zip`;
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      const warnings=result.manifest.warnings;
      message(warnings.length ? `Download requested with ${warnings.length} warning(s): ${warnings.join(' ')} Check manifest.json in the ZIP.` : 'Download requested. Check your Downloads folder before closing RivetOne. Shared cloud records are not included.');
    } catch(e) {message(`Backup failed: ${e.message} Keep this tab open; do not reset or clear device data.`);}
    finally {exporting=false;buttons.forEach(b=>b.disabled=false);}
  }
  document.addEventListener('click',async event=>{
    const backup=event.target.closest('[data-device-backup]');if(backup){void exportDevice();return;}
    const retry=event.target.closest('[data-cloud-retry]');
    if(retry){retry.disabled=true;try{await CrewCloud.refresh();update();}finally{retry.disabled=false;}}
  });
  window.RivetConnection={update,render,describe};
  if(typeof module!=='undefined'&&module.exports)module.exports={describe};
})();
