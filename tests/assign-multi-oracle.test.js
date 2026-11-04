const A=require('../assets/assign.js');
const rnd=A.mulberry32(1313);const failures=[];
for(let t=0;t<180;t++){
 const spd=t%2+1, cols=1+(t%4), caps=[1+Math.floor(rnd()*4),1+Math.floor(rnd()*4)];
 const n=caps.reduce((a,b)=>a+b),counts=[0,0,0];for(let i=0;i<n;i++)counts[Math.floor(rnd()*3)]++;
 const cs=counts.map((n,k)=>({id:'c'+k,name:(9+k)+'/A',students:Array.from({length:n},(_,i)=>({id:k+'-'+i}))}));
 const r=A.distribute(cs,{seed:t+1,seatsPerDesk:spd,deskCols:cols,rooms:caps.map((capacity,k)=>({id:'h'+k,name:'H'+k,capacity}))});
 const prev=[];let offset=0;for(const cap of caps){for(let i=0;i<cap;i++)prev.push(spd===2?(i%2===1?offset+i-1:-1):(i%cols?offset+i-1:-1));offset+=cap;}
 const lab=[],rem=counts.slice();let best=Infinity;
 function go(cost){if(cost>=best)return;let i=lab.length;if(i===n){best=cost;return;}for(let k=0;k<3;k++)if(rem[k]){rem[k]--;lab.push(k);go(cost+(prev[i]>=0&&lab[prev[i]]===k?1:0));lab.pop();rem[k]++;}}
 go(0);if(r.stats.deskmate!==best) failures.push({t,spd,cols,caps,counts,actual:r.stats.deskmate,best});
}
console.log(JSON.stringify({trials:180,failures},null,2));

require("node:assert/strict").deepEqual(failures, [], "Yerleşim, bağımsız tam arama sonucuyla uyuşmalı");
