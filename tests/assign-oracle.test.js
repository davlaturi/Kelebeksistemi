const A=require('../assets/assign.js');
const assert=require('node:assert/strict');
const rnd=A.mulberry32(9876);
function minConflicts(counts,cap,cols,spd){
 const labels=[], remain=counts.concat([cap-counts.reduce((a,b)=>a+b,0)]), empty=counts.length; let best=Infinity;
 function visit(cost){
  if(cost>=best)return;
  const i=labels.length;if(i===cap){best=cost;return;}
  const prev=spd===2?(i%2===1?i-1:-1):(i%cols>0?i-1:-1);
  for(let k=0;k<remain.length;k++)if(remain[k]){
   const extra=prev>=0&&k!==empty&&labels[prev]===k?1:0;
   remain[k]--;labels.push(k);visit(cost+extra);labels.pop();remain[k]++;
  }
 }visit(0);return best;
}
const failures=[];let trials=0;
for(let spd of [1,2])for(let cols of [1,2,3,4])for(let t=0;t<12;t++){
 const cap=3+Math.floor(rnd()*6), n=1+Math.floor(rnd()*cap), counts=[0,0,0];
 for(let i=0;i<n;i++)counts[Math.floor(rnd()*3)]++;
 const classes=counts.map((n,k)=>({id:'c'+k,name:(9+k)+'/A',students:Array.from({length:n},(_,i)=>({id:k+'-'+i}))}));
 const r=A.distribute(classes,{seatsPerDesk:spd,deskCols:cols,seed:t+1,rooms:[{id:'hall',name:'Hall',capacity:cap}]});
 const seats=r.rooms[0].seats;const actual=seats.reduce((v,s,i)=>{const j=spd===2?(i%2===1?i-1:-1):(i%cols>0?i-1:-1);return v+(j>=0&&!s.empty&&!seats[j].empty&&s.classId===seats[j].classId?1:0)},0);
 assert.equal(actual,r.stats.deskmate);assert.equal(new Set(seats.filter(x=>!x.empty).map(x=>x.studentId)).size,n);
 const optimum=minConflicts(counts,cap,cols,spd);trials++;
 if(actual!==optimum)failures.push({spd,cols,cap,counts,seed:t+1,actual,optimum});
}
console.log(JSON.stringify({trials,failures},null,2));
const same=A.distribute([{id:'c',name:'9/A',students:[{id:'s1'},{id:'s2'}]}],{seed:1,rooms:[{id:'h',name:'Salon',capacity:4}]});
console.log('Single-level separated:',JSON.stringify({stats:same.stats,warnings:same.warnings}));

require("node:assert/strict").deepEqual(failures, [], "Yerleşim, bağımsız tam arama sonucuyla uyuşmalı");

assert.equal(same.stats.deskmate,0);
assert.ok(!same.warnings.some(w=>w.includes('kaçınılmaz')));
const base=[{id:'c',name:'9/A',students:[{id:'s'}]}];
for(const opts of [{deskCols:Infinity},{deskCols:-1},{rooms:[{id:'h',capacity:Infinity}]},{rooms:[{id:'h',capacity:2,deskCols:-2}]},{rooms:[{id:'h',capacity:2},{id:'h',capacity:2}]}]) assert.throws(()=>A.distribute(base,opts));
assert.throws(()=>A.distribute([{id:'c',name:'9/A',students:[{id:'s'},{id:'s'}]}]));
assert.throws(()=>A.distribute([base[0],base[0]]));
