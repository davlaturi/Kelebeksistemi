/*
 * Sınıf listesi PDF ayrıştırıcı.
 *
 * e-Okul ve benzeri sistemlerden alınan "Sınıf Listesi" PDF'lerinden
 * öğrenci numarası ve ad-soyad bilgisini çıkarır. Metin tabanlı PDF'ler
 * gereklidir (taranmış/fotoğraf PDF'lerde metin katmanı yoktur).
 *
 * Saf fonksiyonlar (parsePages, detectClassName, parseText) Node'da test
 * edilebilir; extractPdf tarayıcıda pdf.js (window.pdfjsLib) kullanır.
 */
(function (root) {
  'use strict';

  const UP = 'A-ZÇĞİÖŞÜÂÎÛ';
  const LETTERS = 'A-Za-zÇĞİÖŞÜÂÎÛçğıöşüâîûÄËÏÖÜäëïöü';
  const NAME_TOKEN = new RegExp('^[' + LETTERS + "][" + LETTERS + ".'’`-]*$");
  const GENDER = new Set(['E', 'K', 'ERKEK', 'KIZ', 'KADIN', 'BAY', 'BAYAN', 'ERKEK.', 'KIZ.']);
  const NOISE = new Set(['EVET', 'HAYIR', 'VAR', 'YOK', 'TC', 'T.C.']);
  // Bu kelimeleri içeren satırlar öğrenci değil başlık/alt bilgidir.
  const NOT_A_NAME = /^(SINIF|SINIFI|ŞUBE|ŞUBES[İI]|L[İI]STE|L[İI]STES[İI]|SAYFA|TOPLAM|YILI|ÖĞRET[İI]M|EĞ[İI]T[İI]M|MÜDÜR|LİSES[İI]|OKULU|DÖNEM|SINAV|TAR[İI]H|SAAT)$/u;

  function trUpper(s) { return String(s).toLocaleUpperCase('tr-TR'); }

  /** pdf.js metin öğelerini satırlara gruplar. */
  function groupRows(items) {
    const its = items
      .filter((i) => i && typeof i.str === 'string' && i.str.trim() !== '')
      .slice()
      .sort((a, b) => b.y - a.y || a.x - b.x);
    const rows = [];
    for (const it of its) {
      const tol = Math.max(2, (it.h || 10) * 0.45);
      const row = rows.length ? rows[rows.length - 1] : null;
      if (row && Math.abs(row.y - it.y) <= tol) row.items.push(it);
      else rows.push({ y: it.y, items: [it] });
    }
    for (const r of rows) r.items.sort((a, b) => a.x - b.x);
    return rows;
  }

  /**
   * Satırdaki öğeleri konumlarına göre birleştirir. Bazı PDF'lerde Türkçe
   * harfler (Ş, İ, Ğ, ı...) ayrı parçalar halinde gelir ("BÜ" "Ş" "RA");
   * aralarında boşluk yoksa bitişik yazılır ("BÜŞRA").
   */
  function lineText(row) {
    let out = '';
    let prev = null;
    for (const it of row.items) {
      const str = it.str;
      if (prev) {
        const h = it.h || prev.h || 10;
        const prevEnd = prev.x + (prev.w || 0);
        const gap = it.x - prevEnd;
        const glued = prev.w > 0 && gap < h * 0.18 && !/\s$/.test(prev.str) && !/^\s/.test(str);
        out += glued ? '' : ' ';
      }
      out += str;
      prev = it;
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  function tokenize(text) {
    return String(text)
      .replace(/ /g, ' ')
      .split(/[\s|;]+/)
      .map((t) => t.replace(/^[,()\[\]]+|[,()\[\]]+$/g, ''))
      .filter(Boolean);
  }

  /**
   * Bir satırdaki belirteçlerden öğrenci kayıtları üretir. Satır bir sayı ile
   * başlamalıdır (sıra no / okul no). Yan yana iki tablo varsa (aynı satırda
   * iki öğrenci) ikisini de yakalar.
   */
  function rowToStudents(tokens) {
    const recs = [];
    let cur = null;
    for (let raw of tokens) {
      const t = raw.replace(/[.)]$/, '');
      if (/^\d{1,7}$/.test(t)) {
        if (!cur) { cur = { nums: [], names: [] }; recs.push(cur); }
        else if (cur.names.length) { cur = { nums: [], names: [] }; recs.push(cur); }
        cur.nums.push(t);
      } else if (/^\d{11}$/.test(t)) {
        // T.C. kimlik no: yoksay
      } else if (NAME_TOKEN.test(raw)) {
        if (!cur) return []; // sayı ile başlamayan satır (başlık, alt bilgi)
        cur.names.push(raw);
      } else {
        // tarih, işaret vb.: yoksay
      }
    }
    const out = [];
    for (const r of recs) {
      const names = r.names.filter((n) => !NOISE.has(trUpper(n)));
      while (names.length && GENDER.has(trUpper(names[names.length - 1]))) names.pop();
      if (!r.nums.length || names.length < 2) continue;
      if (names.some((n) => NOT_A_NAME.test(trUpper(n)))) continue;
      const letters = names.join('').replace(/[^\p{L}]/gu, '').length;
      if (letters < 3) continue;
      const no = r.nums.length >= 2 ? r.nums[1] : r.nums[0];
      out.push({ no: String(parseInt(no, 10)), name: tidyName(names.join(' ')) });
    }
    return out;
  }

  function tidyName(s) {
    return s.replace(/\s+/g, ' ').trim();
  }

  const HEADER_HINT = new RegExp('(ADI|SOYADI|ÖĞRENC[İI]|NUMARA|C[İI]NS[İI]YET)', 'u');

  /** Metinden sınıf/şube adını bulur: "9. Sınıf / A Şubesi" -> "9/A" */
  function detectClassName(text) {
    const m = findClass(text);
    return m ? m.name : null;
  }

  /** Sınıf adını ve metindeki yerini döndürür: {name, start, end} */
  function findClass(text) {
    const T = trUpper(String(text));
    const L = '([' + UP + '])';
    const notLetter = '(?![' + UP + '0-9])';
    const patterns = [
      new RegExp('(\\d{1,2})\\s*\\.?\\s*SINIF[I]?\\s*[\\/\\-–]?\\s*\\(?' + L + '\\)?\\s*ŞUBES[İI]', 'u'),
      new RegExp('(HAZIRLIK)\\s*(?:SINIFI)?\\s*[\\/\\-–]?\\s*\\(?' + L + '\\)?\\s*ŞUBES[İI]', 'u'),
      new RegExp('(?:SINIF|ŞUBE)[İI]?\\s*(?:ADI)?\\s*[:：]\\s*(\\d{1,2})\\s*\\.?\\s*(?:SINIF)?\\s*[\\/\\-–.]?\\s*' + L + notLetter, 'u'),
      new RegExp('(\\d{1,2})\\s*\\.\\s*SINIF\\s*[\\/\\-–]?\\s*' + L + notLetter, 'u'),
      new RegExp('(?:^|[^0-9' + UP + '])(\\d{1,2})\\s*[\\/\\-–]\\s*' + L + notLetter, 'u'),
      new RegExp('(?:^|[^0-9' + UP + '])(\\d{1,2})' + L + notLetter + '(?:\\s*SINIF|\\s*ŞUBE)?', 'u'),
    ];
    for (const re of patterns) {
      const m = T.match(re);
      if (!m) continue;
      const g = m[1];
      if (/^\d+$/.test(g)) {
        const n = parseInt(g, 10);
        if (n < 1 || n > 12) continue;
      }
      const level = g === 'HAZIRLIK' ? 'Hazırlık' : String(parseInt(g, 10));
      const lead = m[0].length - m[0].replace(/^[^0-9A-ZÇĞİÖŞÜ]+/u, '').length;
      return { name: level + '/' + m[2], start: m.index + lead, end: m.index + m[0].length };
    }
    return null;
  }

  function classFromFileName(fileName) {
    const base = String(fileName || '').replace(/\.pdf$/i, '').replace(/[_]+/g, ' ');
    return detectClassName(base) || base.trim() || 'Sınıf';
  }

  /**
   * Sayfa öğelerinden sınıf listelerini çıkarır.
   * @param {Array<{items:Array<{str:string,x:number,y:number,h?:number}>}>} pages
   * @param {string} fileName
   * @returns {{classes:Array<{name:string, students:Array<{no:string,name:string}>}>, textFound:boolean}}
   */
  function parsePages(pages, fileName) {
    const groups = [];
    const byName = new Map();
    let current = null;
    let textFound = false;
    let usedFallback = false;
    const get = (name) => {
      let g = byName.get(name);
      if (!g) { g = { name, students: [] }; byName.set(name, g); groups.push(g); }
      return g;
    };
    for (const page of pages) {
      const rows = groupRows(page.items || []);
      if (rows.length) textFound = true;
      for (const row of rows) {
        const line = lineText(row);
        if (!line) continue;
        // Satırda sınıf adı var mı? (sayfa başlığı ya da "Sınıfı" sütunu)
        const m = findClass(line);
        const rest = m ? (line.slice(0, m.start) + ' ' + line.slice(m.end)) : line;
        const toks = tokenize(rest);
        const recs = toks.length && !(HEADER_HINT.test(trUpper(rest)) && !/^\d/.test(toks[0])) ? rowToStudents(toks) : [];
        if (!recs.length) {
          if (m) current = get(m.name); // başlık satırı: bundan sonraki öğrenciler bu sınıfın
          continue;
        }
        let target = m ? get(m.name) : current;
        if (!target) { target = get(classFromFileName(fileName)); usedFallback = true; current = target; }
        for (const st of recs) target.students.push(st);
      }
    }
    for (const g of groups) g.students = dedupe(g.students);
    return { classes: groups.filter((g) => g.students.length > 0), textFound, usedFallback };
  }

  function dedupe(list) {
    const seen = new Set();
    const out = [];
    for (const s of list) {
      const key = s.no ? 'n:' + s.no : 'a:' + trUpper(s.name);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
    return out;
  }

  /**
   * Yapıştırılan düz metinden öğrenci listesi. Her satır: "No Ad Soyad"
   * (başta sıra no olabilir; sekme/virgül/noktalı virgül ayırıcıları desteklenir).
   * Numarasız satırlar da kabul edilir.
   */
  function parseText(text) {
    const out = [];
    for (const line of String(text).split(/\r?\n/)) {
      const toks = tokenize(line.replace(/,/g, ' '));
      if (!toks.length) continue;
      const recs = rowToStudents(toks);
      if (recs.length) { out.push(...recs); continue; }
      const names = toks.filter((t) => NAME_TOKEN.test(t));
      if (names.length >= 2 && names.length === toks.length) out.push({ no: '', name: tidyName(names.join(' ')) });
    }
    return dedupe(out);
  }

  /** Tarayıcı: PDF dosyasını pdf.js ile okuyup sayfa öğelerini döndürür. */
  async function extractPdf(arrayBuffer) {
    const lib = root.pdfjsLib;
    if (!lib) throw new Error('PDF kütüphanesi yüklenemedi.');
    const doc = await lib.getDocument({ data: new Uint8Array(arrayBuffer), isEvalSupported: false }).promise;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      pages.push({
        items: tc.items.map((it) => ({
          str: it.str,
          x: it.transform[4],
          y: it.transform[5],
          h: Math.abs(it.transform[3]) || it.height || 10,
          w: it.width || 0,
        })),
      });
    }
    await doc.destroy();
    return pages;
  }

  const api = { parsePages, lineText, findClass, parseText, detectClassName, classFromFileName, groupRows, rowToStudents, tokenize, extractPdf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KelebekParser = api;
})(typeof self !== 'undefined' ? self : this);
