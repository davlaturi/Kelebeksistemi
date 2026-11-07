// PDF ayrıştırıcıyı örnek PDF'ler üzerinde dener:  node tests/parser.test.js
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const pdfjsLib = require('../vendor/pdfjs/pdf.min.js');
pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(__dirname, '../vendor/pdfjs/pdf.worker.min.js');
global.pdfjsLib = pdfjsLib;
const P = require('../assets/parser.js');

async function pagesOf(file) {
  const data = new Uint8Array(fs.readFileSync(file));
  const doc = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    pages.push({ items: tc.items.map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], h: Math.abs(it.transform[3]), w: it.width })) });
  }
  return pages;
}

(async () => {
  const dir = path.join(__dirname, '../ornekler');
  const expect = {
    '9-A.pdf': { '9/A': 30 },
    '9-B.pdf': { '9/B': 28 },
    '10-A.pdf': { '10/A': 41 },
    '10-B ve 11-A.pdf': { '10/B': 27, '11/A': 32 },
    '11-B.pdf': { '11/B': 25 },
  };
  const fx = path.join(__dirname, 'fixtures');
  expect['fixtures/document (9).pdf'] = { '9/A': 31, '9/B': 29, '10/A': 33 };
  expect['fixtures/okul-listesi.pdf'] = { '11/C': 20, '12/A': 22, '12/B': 18 };
  for (const [file, exp] of Object.entries(expect)) {
    const full = file.startsWith('fixtures/') ? path.join(fx, file.slice(9)) : path.join(dir, file);
    const res = P.parsePages(await pagesOf(full), path.basename(file));
    const got = Object.fromEntries(res.classes.map((c) => [c.name, c.students.length]));
    console.log(file, '->', JSON.stringify(got), '| örnek:', res.classes[0].students[0]);
    assert.deepStrictEqual(got, exp);
    for (const c of res.classes) for (const s of c.students) {
      assert.ok(/^\d+$/.test(s.no), 'numara: ' + JSON.stringify(s));
      assert.ok(!/(Erkek|Kız|KIZ|ERKEK)$/.test(s.name), 'cinsiyet temizlenmeli: ' + s.name);
      assert.ok(!/(^|\s)[ÇĞİÖŞÜçğıöşü](\s|$)/.test(s.name), 'harf parçalanmış: ' + s.name);
      assert.ok(!/\d|\//.test(s.name), 'adda sayı/sınıf kalmamalı: ' + s.name);
    }
  }
  // Sınıf adı tanıma
  const cases = {
    '9. Sınıf / A Şubesi Sınıf Listesi': '9/A',
    '10. SINIF / C ŞUBESİ': '10/C',
    'Sınıf: 11-B': '11/B',
    'Şube Adı: 12 / D': '12/D',
    '9A sınıf listesi': '9/A',
    'Hazırlık Sınıfı / A Şubesi': 'Hazırlık/A',
    '03.11.2026 Sayfa 1 / 2': null,
  };
  for (const [t, e] of Object.entries(cases)) assert.strictEqual(P.detectClassName(t), e, t);
  // Metin yapıştırma
  const pasted = P.parseText('1\t1234\tAhmet Yılmaz\tErkek\n2 1250 Ayşe Nur KAYA K\nMehmet Demir\n');
  assert.deepStrictEqual(pasted, [
    { no: '1234', name: 'Ahmet Yılmaz' },
    { no: '1250', name: 'Ayşe Nur KAYA' },
    { no: '', name: 'Mehmet Demir' },
  ]);
  // Cinsiyet ve yatılı/gündüzlü sütunları ada eklenmez; yalnız ad soyad alınır
  {
    const T = require('../assets/parser.js');
    assert.deepStrictEqual(T.rowToStudents(['1', '512', 'ZİKRETTİN', 'YILMAZ', 'Erkek', 'Yatılı']), [{ no: '512', name: 'ZİKRETTİN YILMAZ' }]);
    assert.deepStrictEqual(T.rowToStudents(['2', '513', 'AYŞE', 'NUR', 'KAYA', 'Kız', 'Gündüzlü']), [{ no: '513', name: 'AYŞE NUR KAYA' }]);
    assert.deepStrictEqual(T.rowToStudents(['3', '514', 'ECE', 'DEMİR', 'K', 'Paralı-Yatılı']), [{ no: '514', name: 'ECE DEMİR' }]);
    assert.strictEqual(T.cleanName('ZİKRETTİN YILMAZ Erkek Yatılı'), 'ZİKRETTİN YILMAZ');
    assert.strictEqual(T.cleanName('Deniz Erkek'), 'Deniz Erkek', 'en az iki sözcük kalmalı');
    assert.strictEqual(T.cleanName('Yatılı Kaya Demir'), 'Yatılı Kaya Demir', 'yalnız sondaki ekler atılır');
  }
  console.log('Ayrıştırıcı testleri geçti.');
})().catch((e) => { console.error(e); process.exit(1); });
