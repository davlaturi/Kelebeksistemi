const assert = require('node:assert/strict');
const S = require('../assets/share.js');
const measure = (s) => [...s].length * 10;
for (const text of ['Türk Dili ve Edebiyatı', '9/A: 12 · 9/B: 8', 'Ç'.repeat(110)]) {
  const lines = S.wrap(text, 100, measure);
  assert.ok(lines.every((s) => measure(s) <= 100));
  assert.equal(lines.join('').replace(/\s/g, ''), text.replace(/\s/g, ''), 'Metin kırılırken içerik kaybolmamalı');
}
const rows = Array.from({ length: 29 }, (_, i) => ({ id: i, height: 110 + i % 3 * 34 }));
const pages = S.paginate(rows, 950);
assert.deepEqual(pages.flat(), rows);
assert.ok(pages.every((p) => p.reduce((n, r) => n + r.height, 0) <= 950));
assert.ok(pages.length > 1);
console.log('Telefon görseli metin kırma ve sayfalama testleri geçti.');
