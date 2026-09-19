/* Shared originals and optional server-side AI review. Browser holds no AI key. */
(function () {
  'use strict';
  const bucket = 'rivet-documents';
  const types = {pdf:'application/pdf', jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', txt:'text/plain'};
  const extensions = {'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','text/plain':'txt'};
  function access(admin = false) {
    const context = CrewCloud.documentContext();
    if (!context || !CrewCloud.status().healthy || !navigator.onLine) throw new Error('Sign in and reconnect before opening shared documents.');
    if (admin && !CrewCloud.canManage()) throw new Error('Only a connected Admin can upload or approve documents.');
    return context;
  }
  function unchanged(context) {
    if (CrewCloud.documentContext()?.generation !== context.generation) throw new Error('Account changed. Reopen Documents after signing in.');
  }
  function unwrap(result) {
    if (result.error) {
      if (['42P01','PGRST202','PGRST205'].includes(result.error.code)) {
        throw new Error('Shared uploads are not installed yet. Your administrator must run the shared-documents setup first.');
      }
      throw new Error(result.error.message || 'Request failed. Check your connection and access.');
    }
    return result.data;
  }
  function validateFile(file) {
    if (!file || !file.size || file.size > 20 * 1024 * 1024) throw new Error('Choose a nonempty file up to 20 MB.');
    if (file.name.length > 255) throw new Error('Shorten the file name to 255 characters or less.');
    const ext = file.name.split('.').pop().toLowerCase(), mime = types[ext];
    if (!mime || (file.type && file.type !== mime)) throw new Error('Use PDF, JPG, PNG or plain TXT files.');
    return {mime, extension:extensions[mime]};
  }
  async function list(project) {
    const ctx = access(), rows = [];
    for (let offset = 0; ; offset += 200) {
      const batch = unwrap(await ctx.client.from('rivet_documents').select('*')
        .eq('workspace_id', ctx.workspaceId).eq('project_id', project)
        .order('created_at', {ascending:false}).order('id').range(offset, offset + 199));
      unchanged(ctx); rows.push(...batch);
      if (batch.length < 200) return rows;
    }
  }
  async function upload(project, file) {
    const ctx = access(true), {mime, extension} = validateFile(file);
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(project)) throw new Error('Choose a valid project.');
    const id = crypto.randomUUID(), path = `${ctx.workspaceId}/${id}/original.${extension}`;
    unwrap(await ctx.client.from('rivet_documents').insert({id, workspace_id:ctx.workspaceId,
      project_id:project, uploaded_by:ctx.userId, original_name:file.name,
      object_path:path, mime_type:mime, byte_size:file.size}).select('id').single());
    unchanged(ctx);
    try {
      unwrap(await ctx.client.storage.from(bucket).upload(path, file, {contentType:mime, upsert:false}));
      unchanged(ctx);
      const row = unwrap(await ctx.client.rpc('rivet_finish_document', {p_id:id}));
      unchanged(ctx); return row;
    } catch (e) {
      throw new Error(`${e.message} An incomplete entry may remain. Refresh the inbox and use Retry; do not upload a second copy.`);
    }
  }
  async function finish(row, file) {
    const ctx = access(true);
    // First recover the case where upload succeeded but the response was lost.
    const first = await ctx.client.rpc('rivet_finish_document', {p_id:row.id});
    unchanged(ctx);
    if (!first.error) return first.data;
    if (!file) throw new Error('Select the same original file to retry this incomplete upload.');
    const {mime} = validateFile(file);
    if (file.name !== row.original_name || file.size !== row.byte_size || mime !== row.mime_type) {
      throw new Error('The file does not match this incomplete entry. Choose the original file.');
    }
    unwrap(await ctx.client.storage.from(bucket).upload(row.object_path, file, {contentType:mime, upsert:false}));
    unchanged(ctx);
    const result = unwrap(await ctx.client.rpc('rivet_finish_document', {p_id:row.id}));
    unchanged(ctx); return result;
  }
  async function approve(row, values) {
    const ctx = access(true);
    const result = unwrap(await ctx.client.rpc('rivet_approve_document', {p_id:row.id,
      p_kind:values.kind, p_title:values.title.trim(), p_date:values.date || null,
      p_sheet:values.sheet.trim(), p_revision:values.revision.trim()}));
    unchanged(ctx); return result;
  }
  async function download(row) {
    const ctx = access();
    const blob = unwrap(await ctx.client.storage.from(bucket).download(row.object_path));
    unchanged(ctx); return blob;
  }
  async function analyze(row) {
    const ctx = access(true);
    if (row.status !== 'pending') throw new Error('Only pending originals can be reviewed by AI.');
    if (row.byte_size > 5 * 1024 * 1024) throw new Error('AI review supports up to 5 MB. You can still file this original manually.');
    const result = await ctx.client.functions.invoke('rivet-analyze-document', {
      body:{document_id:row.id,consent:true}
    });
    unchanged(ctx);
    if (result.error) {
      let message = 'AI review is unavailable. You can still file this original manually.';
      try {
        const body = await result.error.context?.json();
        if (typeof body?.error === 'string' && body.error.length < 300) message = body.error;
      } catch {}
      unchanged(ctx); throw new Error(message);
    }
    if (!result.data?.suggestion) throw new Error('AI did not return a suggestion. Use manual filing.');
    return result.data.suggestion;
  }
  window.RivetDocuments = {list, upload, finish, approve, download, analyze, validateFile};
})();
