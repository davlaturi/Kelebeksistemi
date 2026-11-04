// Eski okul bilgisayarı ve tablet tarayıcılarında bulunmayan özellikler kodda kullanılmamalı.
// (Object.hasOwn yüzünden yan menü eski tarayıcılarda sayfa değiştirmiyordu.)
//   node tests/compat.test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const files = ['app.js', 'assign.js', 'parser.js', 'share.js'].map((f) => path.join(__dirname, '../assets', f));
const banned = [
  [/Object\.hasOwn\s*\(/, 'Object.hasOwn (Chrome 93+) → Object.prototype.hasOwnProperty.call'],
  [/\bstructuredClone\s*\(/, 'structuredClone (Chrome 98+) → JSON.parse(JSON.stringify(...))'],
  [/\.at\(\s*-?\d/, 'Array.prototype.at (Chrome 92+) → a[a.length - 1]'],
  [/\.(findLast|findLastIndex|toSorted|toReversed|toSpliced)\s*\(/, 'ES2023 dizi işlevleri (Chrome 110+)'],
  [/Object\.groupBy|Map\.groupBy/, 'groupBy (Chrome 117+)'],
  [/crypto\.randomUUID/, 'crypto.randomUUID (file:// ve eski tarayıcılarda yok)'],
];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  for (const [re, why] of banned) assert.ok(!re.test(src), path.basename(f) + ': ' + why);
}
console.log('Eski tarayıcı uyumluluk testi geçti.');
