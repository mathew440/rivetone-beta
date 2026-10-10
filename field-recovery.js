/* Local Field Beta backup; never reads cloud credentials or other storage keys. */
(function(global){
'use strict';
const KEY='rivetone-final-v1', VERSION='0.10.0';
  const MAX_BYTES = 128 * 1024 * 1024;
  const encoder = new TextEncoder();
  const crcTable = Array.from({length:256}, (_, n) => {
    for (let k=0;k<8;k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const b of bytes) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  // Standard uncompressed ZIP; original bytes remain intact. No external library.
  async function zip(entries) {
    if (entries.length > 65535) throw new Error('Too many files for one backup.');
    const parts=[], directory=[]; let offset=0, total=0;
    for (const entry of entries) {
      const name=encoder.encode(entry.name), bytes=new Uint8Array(await entry.blob.arrayBuffer());
      total += bytes.length;
      if (total > MAX_BYTES) throw new Error('This device backup exceeds 128 MB. Save drawing originals separately before exporting.');
      if (!name.length || name.length>65535 || entry.name.split('/').some(p=>p==='..')) throw new Error('Invalid backup path.');
      const crc=crc32(bytes), header=new Uint8Array(30), h=new DataView(header.buffer);
      h.setUint32(0,0x04034b50,true); h.setUint16(4,20,true); h.setUint16(6,0x800,true);
      h.setUint16(12,33,true); h.setUint32(14,crc,true); h.setUint32(18,bytes.length,true); h.setUint32(22,bytes.length,true); h.setUint16(26,name.length,true);
      const central=new Uint8Array(46), c=new DataView(central.buffer);
      c.setUint32(0,0x02014b50,true); c.setUint16(4,20,true); c.setUint16(6,20,true); c.setUint16(8,0x800,true);
      c.setUint16(14,33,true); c.setUint32(16,crc,true); c.setUint32(20,bytes.length,true); c.setUint32(24,bytes.length,true); c.setUint16(28,name.length,true); c.setUint32(42,offset,true);
      parts.push(header,name,bytes); directory.push(central,name); offset+=header.length+name.length+bytes.length;
    }
    const directorySize=directory.reduce((n,x)=>n+x.length,0), end=new Uint8Array(22), e=new DataView(end.buffer);
    e.setUint32(0,0x06054b50,true); e.setUint16(8,entries.length,true); e.setUint16(10,entries.length,true);
    e.setUint32(12,directorySize,true); e.setUint32(16,offset,true);
    return new Blob([...parts,...directory,end],{type:'application/zip'});
  }

function validate(value){
 if(!value || !Array.isArray(value.projects) || !value.projects.length || !value.projectData || !['projects','service'].includes(value.mode)) throw Error('Unrecognized project data');
 if(!value.projects.some(p=>p.id===value.currentProjectId)) throw Error('Missing current project');
 for(const p of value.projects){const d=value.projectData[p.id];if(!d || !['crew','calendar','materials','workItems','messages','photos','plans','progress','notes','tm','safety'].every(k=>Array.isArray(d[k]))) throw Error('Incomplete project data');}
 if(!value.service || !['techs','vans','customers','calls'].every(k=>Array.isArray(value.service[k]))) throw Error('Incomplete service data');
 return value;
}
function createStore(storage){
 let blocked=false,raw=null,warning='',lastSaved=null,source='sample';
 return {
 load(seed){try{raw=storage.getItem(KEY);if(raw!==null){const data=validate(JSON.parse(raw));source='saved';return data;}}catch(e){blocked=true;warning='Saved data could not be read. Original storage is protected from replacement. Export a backup before recovery.';}return JSON.parse(JSON.stringify(seed));},
 save(value){if(blocked)throw Error(warning);try{if(storage.getItem(KEY)!==raw)throw Error('Another tab changed these records. Export this tab before reloading to avoid overwriting newer work.');const next=JSON.stringify(value);storage.setItem(KEY,next);raw=next;source='saved';warning='';lastSaved=new Date().toISOString();}catch(e){warning=e.message.startsWith('Another tab')?e.message:'Save failed: device storage is full or unavailable. Keep the form open and export your draft before closing.';throw Error(warning);}},
 status(){return {blocked,warning,lastSaved,source};},
 async backup(current){
 const warnings=[];let stored=raw;
 try{stored=storage.getItem(KEY);}catch{warnings.push('Storage could not be read; last known saved value is included when available.');}
 if(warning)warnings.push(warning);
 const manifest={format:'rivetone-field-backup',formatVersion:1,appVersion:VERSION,storageKey:KEY,createdAt:new Date().toISOString(),source,warnings,
 scope:'Current local Projects and Service records, including embedded photos and rendered plan images. This browser only.',
 excluded:['Supabase records and originals','Other devices or browser origins','Full PDF originals (this beta stores first-page images)','Sign-in credentials'],
 restore:'No automatic import. Keep this archive intact for reviewed recovery.'};
 const entries=[{name:'local-records.json',blob:new Blob([JSON.stringify(current,null,2)])},{name:'manifest.json',blob:new Blob([JSON.stringify(manifest,null,2)])}];
 if(stored!==null)entries.push({name:'last-saved-records.txt',blob:new Blob([stored])});
 return {blob:await zip(entries),manifest};
 }
 };
}
global.FieldRecovery={createStore,validate,VERSION};
if(typeof module!=='undefined' && module.exports)module.exports={createStore,validate,zip,crc32,VERSION};
})(typeof window==='undefined'?globalThis:window);
