/* Pure field workflow rules; no network or storage access. */
(function(g){
'use strict';
function localDate(date=new Date()){return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');}
function todayRows(rows,date=localDate()){return rows.filter(r=>r.date===date).slice().sort((a,b)=>(a.time||'').localeCompare(b.time||''));}
function safeLink(value){const url=new URL(String(value).trim());if(url.protocol!=='https:'||url.username||url.password)throw Error('Use an HTTPS website link without a username or password.');if([...url.searchParams.keys(),...new URLSearchParams(url.hash.replace(/^#(?:[^?]*\?)?/,'')).keys()].some(k=>/token|secret|password|signature|api.?key|^code$/i.test(k)))throw Error('Use a normal project link, not a temporary sign-in or secret link.');return url.href;}
function hours(value){const n=Number(value);if(!String(value).trim()||!Number.isFinite(n)||n<0||n>24)throw Error('Enter hours from 0 to 24.');return n;}
function mergeMaterials(items){const map=new Map();for(const item of items){const key=String(item.desc).trim().toLowerCase().replace(/\s+/g,' ')+'|'+item.status;if(!map.has(key))map.set(key,{...item});else{const cur=map.get(key);cur.qty=[cur.qty,item.qty].filter(Boolean).join(' + ');}}return [...map.values()];}
function imagePoint(x,y,boxWidth,boxHeight,imageWidth,imageHeight){if(!(imageWidth>0&&imageHeight>0))return null;const scale=Math.min(boxWidth/imageWidth,boxHeight/imageHeight),left=(boxWidth-imageWidth*scale)/2,top=(boxHeight-imageHeight*scale)/2;if(x<left||y<top||x>left+imageWidth*scale||y>top+imageHeight*scale)return null;return {x:(x-left)/scale,y:(y-top)/scale};}
function restore(target,source){
 if(Array.isArray(target)&&Array.isArray(source)){const prior=target.slice();target.splice(0,target.length,...source.map((v,i)=>{const old=v&&typeof v==='object'?(v.id?prior.find(x=>x?.id===v.id):prior[i]):null;if(old&&typeof old==='object'){restore(old,v);return old;}return v&&typeof v==='object'?JSON.parse(JSON.stringify(v)):v;}));return;}
 for(const k of Object.keys(target))if(!(k in source))delete target[k];
 for(const [k,v] of Object.entries(source)){if(v&&typeof v==='object'&&target[k]&&typeof target[k]==='object')restore(target[k],v);else target[k]=v&&typeof v==='object'?JSON.parse(JSON.stringify(v)):v;}
}

// Roll back an entire user action if persistence fails, preserving live references.
function transaction(state,change,persist){const before=JSON.parse(JSON.stringify(state));try{change();persist();return before;}catch(error){restore(state,before);throw error;}}
function parseMaterial(line){
 const text=String(line).trim();let qty='',desc=text;
 // A leading electrical size is not a count: 1" EMT and 1 1/4" EMT stay intact.
 const explicit=text.match(/^\(([^)]+)\)\s*(.+)$/)||text.match(/^(\d+(?:\.\d+)?\s*(?:ft|ea|each|boxes?|rolls?))\s+(.+)$/i)||text.match(/^(\d+(?:\.\d+)?)\s*[x×]\s+(.+)$/i);
 if(explicit){qty=explicit[1];desc=explicit[2];}
 return {desc,qty,status:'Needed'};
}
function needsAttention(call){return call.status!=='Complete'&&(call.callback||call.status==='Need Parts');}
function dailyCrew(crew){return crew.filter(c=>c.status==='On Site').map(c=>c.name+(c.area?' — '+c.area:'')+' — hours: ____').join('\n');}
function dailyReportText(project,report){return [project+' — Daily report',report.date,'Locally entered report. Review attendance, hours and completion before sharing.','',
 'CREW / HOURS',report.crew||'Not recorded','', 'WORK COMPLETED',report.completed||'Not recorded','', 'BLOCKERS / MATERIALS',report.blockers||'None recorded','',
 'NEXT SHIFT',report.next||'Not recorded','', 'SAFETY / INSPECTIONS',report.safety||'Not recorded','', 'WEATHER / CONDITIONS',report.weather||'Not recorded'].join('\n');}

g.FieldUtils={localDate,todayRows,safeLink,hours,mergeMaterials,imagePoint,restore,transaction,parseMaterial,needsAttention,dailyCrew,dailyReportText};if(typeof module!=='undefined'&&module.exports)module.exports=g.FieldUtils;
})(typeof window==='undefined'?globalThis:window);
