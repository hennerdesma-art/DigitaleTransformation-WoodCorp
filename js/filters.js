/* Shared filter state and normalized effective predicates: never let local predicates bleed into siblings. */
(function(global){
"use strict";
function predicate(field,value,id){
 if(!window.NXT_CONFIG?.fields[field]) throw Error("Unbekanntes Filterfeld");
 if(typeof value!=="string" || !value.trim() || value.length>200) throw Error("Ungueltiger Filterwert");
 return {id:id||crypto.randomUUID(),field,op:"eq",value:value.trim()};
}
function validate(filters){
 if(!Array.isArray(filters)||filters.length>12)throw Error("Maximal 12 Filter sind moeglich");
 return filters.map(f=>predicate(f.field,f.value,f.id));
}
function filterKey(filters) {return JSON.stringify(validate(filters).map(f=>[f.field,f.op,f.value]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));}
function resolve(globalFilters, nodesById, nodeId, local){
 const trail=[],seen=new Set();let cursor=nodeId;
 while(cursor && nodesById[cursor] && !seen.has(cursor)){
  seen.add(cursor);trail.unshift(nodesById[cursor]);
  cursor=nodesById[cursor].parentId;
 }
 const out=[...globalFilters];
 for(const node of trail){
  if(node.predicate)out.push(node.predicate);
  out.push(...(local[node.id]||[]));
 }
 return validate(out);
}
function parseShareState(){
 const hash=new URLSearchParams(location.search).get("view");
 if(!hash)return null;
 try{
  const raw=JSON.parse(decodeURIComponent(atob(hash.replace(/-/g,"+").replace(/_/g,"/"))));
  if(raw.version!==1 || typeof raw.selected!=="string")return null;
  return {global:validate(raw.global||[]),selected:raw.selected.slice(0,120)};
 }catch{return null}
}
function withShareState(globalFilters,selected){
 const state={version:1,global:validate(globalFilters),selected:String(selected||"root")};
 const payload=btoa(unescape(encodeURIComponent(JSON.stringify(state)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
 const url=new URL(location.href);url.searchParams.set("view",payload);url.searchParams.delete("invite");
 history.replaceState({nxt:true},"",url.pathname+url.search);
 return url.toString();
}
global.NXT_FILTERS=Object.freeze({predicate,validate,filterKey,resolve,parseShareState,withShareState});
})(window);
