const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const window = { NXT_CONFIG: { fields:{factory:"Werk",product_type:"Produkt",delivery_year:"Jahr"} } };
let serial = 0;
vm.runInNewContext(readFileSync("js/filters.js","utf8"), {
  window,
  crypto:{randomUUID:()=>String(++serial)},
  location:{search:""},
  URLSearchParams, URL, TextDecoder, Uint8Array, atob, btoa,
  history:{replaceState:()=>{}},
});
const f=window.NXT_FILTERS;
const globalFilters=[f.predicate("delivery_year","2018")];
const nodes={
 root:{id:"root",parentId:null},
 a:{id:"a",parentId:"root",predicate:f.predicate("factory","Essen")},
 b:{id:"b",parentId:"root",predicate:f.predicate("factory","Bonn")},
 child:{id:"child",parentId:"a",predicate:f.predicate("product_type","Type A")}
};
test("global filters apply to both sibling branches",()=>{
 const aa=f.resolve(globalFilters,nodes,"a",{}),bb=f.resolve(globalFilters,nodes,"b",{});
 assert.ok(aa.some(x=>x.value==="2018"));assert.ok(bb.some(x=>x.value==="2018"));
});
test("node local filters inherit into children but never siblings",()=>{
 const local={a:[f.predicate("product_type","Type B")]};
 const a=f.resolve(globalFilters,nodes,"a",local), b=f.resolve(globalFilters,nodes,"b",local);
 const c=f.resolve(globalFilters,nodes,"child",local);
 assert.equal(a.length,3);assert.equal(b.length,2);assert.equal(c.length,4);
 assert.ok(c.some(x=>x.value==="Type B"));assert.ok(!b.some(x=>x.value==="Type B"));
});
test("invalid field is rejected before it reaches the backend",()=>{
 assert.throws(()=>f.predicate("sql_fragment","anything"),/Unbekanntes/);
});
test("maximum filter count is enforced",()=>{
 assert.throws(()=>f.validate(Array.from({length:13},()=>f.predicate("factory","Essen"))),/Maximal/);
});
test("normalization is order insensitive",()=>{
 const a=[f.predicate("factory","Essen"),f.predicate("delivery_year","2018")];
 const b=[...a].reverse();
 assert.equal(f.filterKey(a),f.filterKey(b));
});
