// Sınav takvimi (Excel) okuyucu testleri:  node tests/calendar.test.js
// Gerçek okul dosyası kullanılmaz; şablonla aynı yapıda sentetik bir .xlsx üretilir.
const assert = require('assert');
const zlib = require('zlib');
const C = require('../assets/calendar.js');

// --- DEFLATE: zlib ile karşılaştır ---
const rnd = (() => { let s = 7; return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648); })();
for (const size of [0, 1, 100, 5000, 70000]) {
  const text = Buffer.from(Array.from({ length: size }, () => 'aabbcçdeğ şubesi '[Math.floor(rnd() * 17)]).join(''));
  const noise = Buffer.from(Array.from({ length: size }, () => Math.floor(rnd() * 256)));
  for (const data of [text, noise]) for (const level of [0, 1, 9]) {
    const out = C.inflate(new Uint8Array(zlib.deflateRawSync(data, { level })));
    assert.ok(Buffer.from(out).equals(data), 'inflate ' + size + ' ' + level);
  }
}
assert.throws(() => C.inflate(new Uint8Array([0xff, 0xff])), /bozuk|eksik/);

// --- Basit ZIP yazıcı (deflate) ---
function crc32(buf) { let c, crc = 0xffffffff; for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function zip(files) {
  const parts = [], central = []; let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, 'utf8'), comp = zlib.deflateRawSync(raw), nm = Buffer.from(name);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8);
    h.writeUInt32LE(crc32(raw), 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nm.length, 26);
    parts.push(h, nm, comp);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc32(raw), 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, nm); off += 30 + nm.length + comp.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(Object.keys(files).length, 8); e.writeUInt16LE(Object.keys(files).length, 10);
  e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...parts, cd, e]));
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function xlsx(grid, merges) {
  const strings = [], idx = new Map();
  const si = (v) => { if (!idx.has(v)) { idx.set(v, strings.length); strings.push(v); } return idx.get(v); };
  const rows = grid.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => {
    if (v == null || v === '') return '';
    const ref = C.colName(c) + (r + 1);
    if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
    if (v.inline) return `<c r="${ref}" t="inlineStr"><is><t>${esc(v.inline)}</t></is></c>`;
    return `<c r="${ref}" t="s"><v>${si(v)}</v></c>`;
  }).join('')}</row>`).join('');
  return zip({
    '[Content_Types].xml': '<Types/>',
    'xl/workbook.xml': '<workbook xmlns:r="r"><sheets><sheet name="Takvim" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': `<sst>${strings.map((x) => /\n/.test(x) ? `<si><r><t>${esc(x.split('\n')[0])}</t></r><r><t xml:space="preserve">\n${esc(x.split('\n')[1])}</t></r></si>` : `<si><t>${esc(x)}</t></si>`).join('')}</sst>`,
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${rows}</sheetData>${merges ? `<mergeCells>${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}</worksheet>`,
  });
}

// Şablonla aynı yapı: başlık, Şube + tarihler (birleşik), ders saatleri, şubeler, notlar
const grid = [
  ['2026-2027 1. Dönem 1. Ortak Sınav Takvimi — Örnek Anadolu Lisesi'],
  [],
  ['Şube', '3.11.2026\nSalı', null, '4.11.2026\nÇarşamba', 46335, '12.11.2026'],
  [null, '2. Ders', '4. Ders', '3. Ders', '2. Ders', 'Ülke geneli'],
  ['9-A', 'Biyoloji', 'Tarih', '—', 'Kimya & Fizik', '—'],
  ['9-B', 'Biyoloji', '', '—', { inline: 'Kimya' }, '—'],
  ['10-A', '—', 'Tarih', 'Coğrafya', '—', '—'],
  ['12-A', '—', '—', 'Coğrafya', 'Din Kültürü', '—'],
  [],
  ['⚠ 4.11.2026 Coğrafya sınavı salonu idareyle teyit edilecek.'],
];
const cal = C.read(xlsx(grid, ['A1:F1', 'B3:C3', 'A3:A4']));
assert.match(cal.title, /Ortak Sınav Takvimi/);
assert.deepStrictEqual(cal.classes, ['9-A', '9-B', '10-A', '12-A']);
assert.deepStrictEqual(cal.sessions.map((s) => s.id), ['2026-11-03_2ders', '2026-11-03_4ders', '2026-11-04_3ders', '2026-11-09_2ders', '2026-11-12_c5']);
const [s1, s2, s3, s4, s5] = cal.sessions;
assert.deepStrictEqual(s1.exams, { '9-A': 'Biyoloji', '9-B': 'Biyoloji' });
assert.strictEqual(s1.lesson, '2'); assert.strictEqual(s1.label, '2. ders');
assert.deepStrictEqual(s2.exams, { '9-A': 'Tarih', '10-A': 'Tarih' }, 'birleşik tarih hücresi ikinci sütuna da yayılmalı');
assert.deepStrictEqual(s2.blanks, ['9-B']);
assert.deepStrictEqual(s3.exams, { '10-A': 'Coğrafya', '12-A': 'Coğrafya' });
assert.strictEqual(s4.date, '2026-11-09', 'Excel tarih sayısı');
assert.strictEqual(s4.exams['9-A'], 'Kimya & Fizik', 'XML kaçışları çözülmeli');
assert.strictEqual(s4.exams['9-B'], 'Kimya', 'satır içi metin');
assert.deepStrictEqual(s5.exams, {}); assert.strictEqual(s5.lesson, ''); assert.strictEqual(s5.label, 'Ülke geneli');
assert.strictEqual(cal.notes.length, 1); assert.match(cal.notes[0], /teyit/);
assert.ok(cal.problems.some((p) => /9-B hücresi boş/.test(p)));

// Şube adları
for (const [a, b] of [['9-A', '9-A'], ['9/A (örnek)', '9-A'], ['9. Sınıf / A Şubesi', '9-A'], ['10 - b', '10-B'], ['Hazırlık/C', 'HAZIRLIK-C'], ['11/İ', '11-İ'], ['5. ders', ''], ['Toplam', ''], ['13-A', '']]) {
  assert.strictEqual(C.classKey(a), b, a);
}
assert.strictEqual(C.parseDate('5.11.2026\nPerşembe'), '2026-11-05');
assert.strictEqual(C.parseDate('31.02.2026'), '');
assert.strictEqual(C.dayLabel('2026-11-05'), '5 Kasım 2026 Perşembe');

// Hatalı dosyalar anlaşılır mesaj vermeli
assert.throws(() => C.read(new Uint8Array([1, 2, 3])), /Excel/);
assert.throws(() => C.read(xlsx([['Ad', 'Soyad'], ['Ali', 'Kaya']])), /Şube/);
assert.throws(() => C.read(xlsx([['Şube', 'Pazartesi'], ['9-A', 'Fizik']])), /tarih/);
console.log('Sınav takvimi okuyucu testleri geçti.');
