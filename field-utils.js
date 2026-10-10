/* Pure field workflow rules; no network or storage access. */
(function(g){
'use strict';
function localDate(date=new Date()){return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');}
function todayRows(rows,date=localDate()){return rows.filter(r=>r.date===date).slice().sort((a,b)=>(a.time||'').localeCompare(b.time||''));}
function safeLink(value){const url=new URL(String(value).trim());if(url.protocol!=='https:'||url.username||url.password)throw Error('Use an HTTPS website link without a username or password.');if([...url.searchParams.keys()].some(k=>/token|secret|password|signature|api.?key|^code$/i.test(k)))throw Error('Use a normal project link, not a temporary sign-in or secret link.');return url.href;}
function hours(value){const n=Number(value);if(!String(value).trim()||!Number.isFinite(n)||n<0||n>24)throw Error('Enter hours from 0 to 24.');return n;}
function mergeMaterials(items){const map=new Map();for(const item of items){const key=String(item.desc).trim().toLowerCase().replace(/\s+/g,' ')+'|'+item.status;if(!map.has(key))map.set(key,{...item});else{const cur=map.get(key);cur.qty=[cur.qty,item.qty].filter(Boolean).join(' + ');}}return [...map.values()];}
function imagePoint(x,y,boxWidth,boxHeight,imageWidth,imageHeight){if(!(imageWidth>0&&imageHeight>0))return null;const scale=Math.min(boxWidth/imageWidth,boxHeight/imageHeight),left=(boxWidth-imageWidth*scale)/2,top=(boxHeight-imageHeight*scale)/2;if(x<left||y<top||x>left+imageWidth*scale||y>top+imageHeight*scale)return null;return {x:(x-left)/scale,y:(y-top)/scale};}
function restore(target,source){
 if(Array.isArray(target)&&Array.isArray(source)){const prior=target.slice();target.splice(0,target.length,...source.map((v,i)=>{const old=v&&typeof v==='object'?(v.id?prior.find(x=>x?.id===v.id):prior[i]):null;if(old&&typeof old==='object'){restore(old,v);return old;}return v&&typeof v==='object'?JSON.parse(JSON.stringify(v)):v;}));return;}
 for(const k of Object.keys(target))if(!(k in source))delete target[k];
 for(const [k,v] of Object.entries(source)){if(v&&typeof v==='object'&&target[k]&&typeof target[k]==='object')restore(target[k],v);else target[k]=v&&typeof v==='object'?JSON.parse(JSON.stringify(v)):v;}
}
g.FieldUtils={localDate,todayRows,safeLink,hours,mergeMaterials,imagePoint,restore};if(typeof module!=='undefined'&&module.exports)module.exports=g.FieldUtils;
})(typeof window==='undefined'?globalThis:window);
