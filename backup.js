/* RivetOne v0.8.0: local-only export. No network, credentials or shared roster. */
(function (global) {
  'use strict';
  const VERSION = '0.8.0';
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
  function localState(value) {
    const copy=JSON.parse(JSON.stringify(value));
    if (!copy || typeof copy!=='object' || Array.isArray(copy)) throw new Error('Local records are not a valid object.');
    delete copy.crew; // Shared crew is never treated as a local backup.
    return copy;
  }
  function readDrawings() {
    return new Promise((resolve,reject)=>{
      const req=global.indexedDB.open('rivetone-files-v1'); let absent=false;
      req.onupgradeneeded=()=>{absent=true;req.transaction.abort();}; // Never create/migrate a database during export.
      req.onerror=()=>absent ? resolve([]) : reject(new Error('Cannot read device drawings. Backup was not created.'));
      req.onblocked=()=>reject(new Error('Another RivetOne tab is blocking drawing access. Close that tab and retry.'));
      req.onsuccess=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains('drawings')){db.close();resolve([]);return;}
        let tx; try{tx=db.transaction('drawings','readonly');}catch(e){db.close();reject(e);return;}
        const rows=[], cursor=tx.objectStore('drawings').openCursor();
        cursor.onsuccess=()=>{const c=cursor.result;if(c){rows.push({key:c.key,blob:c.value});c.continue();}};
        tx.oncomplete=()=>{db.close();resolve(rows);};
        tx.onabort=tx.onerror=()=>{db.close();reject(new Error('Drawing export failed. No backup was created.'));};
      };
    });
  }
  const jsonEntry=(name,data)=>({name,blob:new Blob([JSON.stringify(data,null,2)],{type:'application/json'})});
  async function build({current,stored,drawings,createdAt=new Date().toISOString()}) {
    const records=localState(current), warnings=[], entries=[jsonEntry('local-records.json',records)], files=[];
    let storedRecords=null;
    if(stored!==null){
      try{storedRecords=localState(JSON.parse(stored));entries.push(jsonEntry('last-saved-records.json',storedRecords));}
      catch {warnings.push('Previously saved local records could not be parsed; their raw value is preserved.');entries.push({name:'last-saved-records-raw.txt',blob:new Blob([stored])});}
    }
    const available=new Set(); let bytes=entries.reduce((n,x)=>n+x.blob.size,0);
    for(const [i,row] of drawings.entries()){
      if(!(row.blob instanceof Blob)) throw new Error('A drawing is unreadable. No backup was created.');
      bytes+=row.blob.size;
      if(bytes>MAX_BYTES) throw new Error('This device backup exceeds 128 MB. Save drawing originals separately before exporting.');
      const name=`drawings/${String(i+1).padStart(4,'0')}.bin`;
      entries.push({name,blob:row.blob});available.add(JSON.stringify(row.key));
      files.push({key:row.key,path:name,bytes:row.blob.size,type:row.blob.type,originalName:row.blob.name||null});
    }
    for(const plan of [...(records.plans||[]),...(storedRecords?.plans||[])]){
      if(plan.fileId && !available.has(JSON.stringify(plan.fileId))) warnings.push(`Missing local drawing: ${plan.sheet||plan.name||plan.fileId}`);
    }
    const manifest={format:'rivetone-device-backup',formatVersion:1,appVersion:VERSION,createdAt,
      scope:'This browser only. Includes in-memory local records, last-saved local records, embedded photos and local drawing bytes.',
      excluded:['Supabase shared documents','Shared crew and membership records','Sign-in tokens and passwords','Other devices and browsers'],
      warnings:[...new Set(warnings)],drawings:files,restore:'Keep this ZIP intact. Import/restore is not included in this release; a reviewed recovery is required.'};
    entries.push(jsonEntry('manifest.json',manifest));
    return {blob:await zip(entries),manifest};
  }
  async function exportDevice(current) {
    // Read only the known application record key. Never enumerate localStorage (auth tokens live there).
    let stored;try{stored=global.localStorage.getItem('rivetOneState');}catch{throw new Error('Device storage cannot be read. No backup was created.');}
    return build({current,stored,drawings:await readDrawings()});
  }
  global.RivetBackup={VERSION,exportDevice};
  if(typeof module!=='undefined' && module.exports) module.exports={zip,crc32,build,localState,exportDevice,readDrawings};
})(typeof window==='undefined'?globalThis:window);
