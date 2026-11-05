/**
 * Sınav takvimi: Excel (.xlsx) dosyasını okur ve oturumlara (tarih + ders saati)
 * çevirir. Dış kütüphane kullanmaz; dosya tarayıcıdan dışarı çıkmaz.
 *
 * Beklenen şablon (şube bazında):
 *   - Bir satırda "Şube" başlığı ve yanında tarihler (birleştirilmiş hücreler olabilir)
 *   - Altındaki satırda ders saatleri ("2. Ders", "Ülke geneli" ...)
 *   - Sonraki satırlarda şube adı (9-A, 10/B ...) ve her oturumdaki dersin adı;
 *     "—" ya da boş hücre o oturumda sınav olmadığı anlamına gelir.
 *   - Tablonun altındaki serbest metinler not olarak alınır.
 *
 * Tarayıcıda `window.KelebekCalendar`, Node'da `module.exports`.
 */
(function () {
  'use strict';

  // ---------- DEFLATE açıcı (RFC 1951) ----------
  const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  const CLORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  function tree(lengths, off, num) {
    const counts = new Uint16Array(16), symbols = new Uint16Array(num), offs = new Uint16Array(16);
    for (let i = 0; i < num; i++) counts[lengths[off + i]]++;
    counts[0] = 0;
    for (let i = 0, sum = 0; i < 16; i++) { offs[i] = sum; sum += counts[i]; }
    for (let i = 0; i < num; i++) if (lengths[off + i]) symbols[offs[lengths[off + i]]++] = i;
    return { counts, symbols };
  }
  let FIXED = null;
  function fixedTrees() {
    if (FIXED) return FIXED;
    const l = new Uint8Array(288);
    for (let i = 0; i < 144; i++) l[i] = 8;
    for (let i = 144; i < 256; i++) l[i] = 9;
    for (let i = 256; i < 280; i++) l[i] = 7;
    for (let i = 280; i < 288; i++) l[i] = 8;
    const d = new Uint8Array(30).fill(5);
    FIXED = { lit: tree(l, 0, 288), dist: tree(d, 0, 30) };
    return FIXED;
  }

  function inflate(src) {
    let pos = 0, bitbuf = 0, bitcnt = 0;
    let out = new Uint8Array(Math.max(1024, src.length * 4)), n = 0;
    const need = (k) => {
      if (n + k <= out.length) return;
      let size = out.length * 2;
      while (size < n + k) size *= 2;
      const bigger = new Uint8Array(size); bigger.set(out.subarray(0, n)); out = bigger;
    };
    const bits = (k) => {
      while (bitcnt < k) {
        if (pos >= src.length) throw new Error('Sıkıştırılmış veri eksik.');
        bitbuf |= src[pos++] << bitcnt; bitcnt += 8;
      }
      const v = bitbuf & ((1 << k) - 1);
      bitbuf >>>= k; bitcnt -= k;
      return v;
    };
    const decode = (t) => {
      let code = 0, first = 0, index = 0;
      for (let len = 1; len < 16; len++) {
        code |= bits(1);
        const count = t.counts[len];
        if (code - count < first) return t.symbols[index + (code - first)];
        index += count; first += count; first <<= 1; code <<= 1;
      }
      throw new Error('Sıkıştırılmış veri bozuk.');
    };
    let last = 0;
    do {
      last = bits(1);
      const type = bits(2);
      if (type === 0) {
        bitbuf = 0; bitcnt = 0;
        if (pos + 4 > src.length) throw new Error('Sıkıştırılmış veri eksik.');
        const len = src[pos] | (src[pos + 1] << 8);
        pos += 4;
        if (pos + len > src.length) throw new Error('Sıkıştırılmış veri eksik.');
        need(len); out.set(src.subarray(pos, pos + len), n); n += len; pos += len;
        continue;
      }
      let lit, dist;
      if (type === 1) ({ lit, dist } = fixedTrees());
      else if (type === 2) {
        const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
        const cl = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) cl[CLORDER[i]] = bits(3);
        const ct = tree(cl, 0, 19);
        const lens = new Uint8Array(hlit + hdist);
        for (let i = 0; i < hlit + hdist;) {
          const sym = decode(ct);
          if (sym < 16) { lens[i++] = sym; continue; }
          let rep, val = 0;
          if (sym === 16) { if (!i) throw new Error('Sıkıştırılmış veri bozuk.'); val = lens[i - 1]; rep = 3 + bits(2); }
          else if (sym === 17) rep = 3 + bits(3);
          else rep = 11 + bits(7);
          if (i + rep > hlit + hdist) throw new Error('Sıkıştırılmış veri bozuk.');
          while (rep--) lens[i++] = val;
        }
        lit = tree(lens, 0, hlit); dist = tree(lens, hlit, hdist);
      } else throw new Error('Sıkıştırılmış veri bozuk.');
      for (;;) {
        const sym = decode(lit);
        if (sym < 256) { need(1); out[n++] = sym; continue; }
        if (sym === 256) break;
        const li = sym - 257;
        if (li >= 29) throw new Error('Sıkıştırılmış veri bozuk.');
        const len = LBASE[li] + bits(LEXT[li]);
        const di = decode(dist);
        if (di >= 30) throw new Error('Sıkıştırılmış veri bozuk.');
        const d = DBASE[di] + bits(DEXT[di]);
        if (d > n) throw new Error('Sıkıştırılmış veri bozuk.');
        need(len);
        for (let k = 0; k < len; k++, n++) out[n] = out[n - d];
      }
    } while (!last);
    return out.subarray(0, n);
  }

  // ---------- ZIP ----------
  const u16 = (b, i) => b[i] | (b[i + 1] << 8);
  const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
  function utf8(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return decodeURIComponent(escape(s));
  }
  /** ZIP içindeki dosyaları {ad: Uint8Array} olarak verir (yalnız istenenler açılır). */
  function unzip(bytes, wanted) {
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Dosya bir Excel (.xlsx) dosyası değil.');
    const count = u16(bytes, eocd + 10);
    let p = u32(bytes, eocd + 16);
    const files = {};
    for (let k = 0; k < count; k++) {
      if (u32(bytes, p) !== 0x02014b50) throw new Error('Excel dosyası bozuk.');
      const method = u16(bytes, p + 10), csize = u32(bytes, p + 20);
      const nlen = u16(bytes, p + 28), elen = u16(bytes, p + 30), clen = u16(bytes, p + 32);
      const local = u32(bytes, p + 42);
      const name = utf8(bytes.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + elen + clen;
      if (wanted && !wanted(name)) continue;
      if (u32(bytes, local) !== 0x04034b50) throw new Error('Excel dosyası bozuk.');
      const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
      const data = bytes.subarray(start, start + csize);
      if (method === 0) files[name] = data;
      else if (method === 8) files[name] = inflate(data);
      else throw new Error('Excel dosyasının sıkıştırma biçimi desteklenmiyor.');
    }
    return files;
  }

  // ---------- XLSX ----------
  function xmlText(s) {
    return String(s)
      .replace(/_x([0-9A-Fa-f]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&#x([0-9A-Fa-f]+);/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(parseInt(d, 10)))
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }
  const attr = (s, name) => { const m = s.match(new RegExp('\\b' + name + '="([^"]*)"')); return m ? xmlText(m[1]) : null; };
  function runsText(xml) {
    const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
    let out = '';
    const re = /<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g;
    let m;
    while ((m = re.exec(clean))) out += m[1] ? xmlText(m[1]) : '';
    return out;
  }
  function colIndex(letters) {
    let n = 0;
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }
  function colName(i) {
    let s = '';
    for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  }
  function parseRef(ref) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref);
    return m ? { c: colIndex(m[1]), r: parseInt(m[2], 10) - 1 } : null;
  }

  /** İlk çalışma sayfasını { rows: [[metin]], name } olarak verir; birleştirilmiş hücreler doldurulur. */
  function readXlsx(bytes) {
    const files = unzip(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
      (n) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(n));
    const text = (n) => (files[n] ? utf8(files[n]) : '');
    const wb = text('xl/workbook.xml');
    if (!wb) throw new Error('Dosya bir Excel (.xlsx) dosyası değil.');
    const sheetTag = (wb.match(/<sheet\b[^>]*>/) || [''])[0];
    const sheetName = attr(sheetTag, 'name') || 'Sayfa1';
    const rid = attr(sheetTag, 'r:id');
    let path = 'xl/worksheets/sheet1.xml';
    const rels = text('xl/_rels/workbook.xml.rels');
    if (rid && rels) {
      const rel = (rels.match(new RegExp('<Relationship\\b[^>]*Id="' + rid + '"[^>]*>')) || [''])[0];
      const target = attr(rel, 'Target');
      if (target) path = target.charAt(0) === '/' ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    }
    if (!files[path]) path = Object.keys(files).filter((n) => /^xl\/worksheets\//.test(n)).sort()[0];
    if (!path) throw new Error('Excel dosyasında çalışma sayfası bulunamadı.');
    const shared = [];
    const ss = text('xl/sharedStrings.xml');
    if (ss) { const re = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g; let m; while ((m = re.exec(ss))) shared.push(m[1] ? runsText(m[1]) : ''); }
    const sheet = text(path);
    const rows = [];
    const set = (r, c, v) => { while (rows.length <= r) rows.push([]); rows[r][c] = v; };
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let m;
    while ((m = cellRe.exec(sheet))) {
      const a = m[1], body = m[2] || '';
      const ref = parseRef(attr(a, 'r') || '');
      if (!ref) continue;
      const t = attr(a, 't');
      const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let val = '';
      if (t === 's') val = v != null ? (shared[parseInt(v, 10)] || '') : '';
      else if (t === 'inlineStr') val = runsText(body);
      else if (t === 'b') val = v === '1' ? 'DOĞRU' : 'YANLIŞ';
      else if (v != null) { val = xmlText(v); if (t !== 'str' && t !== 'e' && /^-?\d+(\.\d+)?(E[-+]?\d+)?$/i.test(val)) val = { num: Number(val) }; }
      set(ref.r, ref.c, val);
    }
    const merges = [];
    const mre = /<mergeCell\b[^>]*ref="([A-Z]+\d+):([A-Z]+\d+)"/g;
    while ((m = mre.exec(sheet))) {
      const a = parseRef(m[1]), b = parseRef(m[2]);
      if (!a || !b) continue;
      merges.push({ r1: a.r, c1: a.c, r2: b.r, c2: b.c });
      const top = rows[a.r] && rows[a.r][a.c];
      for (let r = a.r; r <= b.r; r++) for (let c = a.c; c <= b.c; c++) if (r !== a.r || c !== a.c) set(r, c, top == null ? '' : top);
    }
    return { name: sheetName, rows, merges };
  }

  // ---------- şube adı ----------
  const trUpper = (s) => String(s).replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase();
  /** "9-A", "9/A (örnek)", "9. Sınıf / A Şubesi", "Hazırlık-B" → "9-A", "HAZIRLIK-B"; tanınmazsa ''. */
  function classKey(name) {
    const T = trUpper(String(name || '')).replace(/\s+/g, ' ').trim();
    const L = '([A-ZÇĞİÖŞÜ])(?![A-ZÇĞİÖŞÜ0-9])';
    let m = T.match(new RegExp('^(\\d{1,2})\\s*\\.?\\s*(?:SINIF[I]?)?\\s*[\\/\\-–.]?\\s*\\(?' + L));
    if (m && +m[1] >= 1 && +m[1] <= 12) return parseInt(m[1], 10) + '-' + m[2];
    m = T.match(new RegExp('^HAZIRLIK\\s*(?:SINIFI)?\\s*[\\/\\-–.]?\\s*\\(?' + L));
    if (m) return 'HAZIRLIK-' + m[1];
    return '';
  }

  // ---------- takvim ----------
  const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const pad = (n) => String(n).padStart(2, '0');
  function iso(y, mo, d) {
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return '';
    return y + '-' + pad(mo) + '-' + pad(d);
  }
  function parseDate(v) {
    if (v && typeof v === 'object' && Number.isFinite(v.num)) {
      if (v.num < 30000 || v.num > 80000) return '';
      const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(v.num) * 86400000);
      return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    }
    const s = String(v || '');
    let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return iso(+m[1], +m[2], +m[3]);
    m = s.match(/(\d{1,2})\s*[./]\s*(\d{1,2})\s*[./]\s*(\d{4})/);
    if (m) return iso(+m[3], +m[2], +m[1]);
    const T = trUpper(s);
    m = T.match(/(\d{1,2})\s+([A-ZÇĞİÖŞÜ]+)\s+(\d{4})/);
    if (m) { const mi = MONTHS.findIndex((x) => trUpper(x) === m[2]); if (mi >= 0) return iso(+m[3], mi + 1, +m[1]); }
    return '';
  }
  const str = (v) => (v && typeof v === 'object' ? String(v.num) : String(v == null ? '' : v)).replace(/\s+/g, ' ').trim();
  const NO_EXAM = /^(—|–|-|−|_+|\.+|x|yok|sınav yok|ders yok|\/)$/i;
  function dayLabel(date) {
    const [y, mo, d] = date.split('-').map(Number);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return d + ' ' + MONTHS[mo - 1] + ' ' + y + ' ' + DAYS[dt.getUTCDay()];
  }

  /**
   * Sayfa satırlarından takvim çıkarır.
   * Dönüş: { title, sessions:[{id,date,lesson,time,label,exams:{şube:ders},blanks:[şube]}], classes:[şube], notes:[metin], problems:[metin] }
   */
  function parseCalendar(sheet) {
    const rows = sheet.rows;
    const cell = (r, c) => (rows[r] && rows[r][c] != null ? rows[r][c] : '');
    let hr = -1, cc = -1;
    for (let r = 0; r < Math.min(rows.length, 15) && hr < 0; r++) {
      for (let c = 0; c < (rows[r] || []).length; c++) {
        if (/^(şube|sınıf|şube\s*\/\s*sınıf|sınıf\s*\/\s*şube|şube adı|sınıfı|şubesi)$/i.test(str(cell(r, c)))) { hr = r; cc = c; break; }
      }
    }
    if (hr < 0) throw new Error('Takvimde “Şube” başlıklı sütun bulunamadı. Şablondaki gibi ilk sütunun başlığı “Şube” olmalı.');
    const title = (() => { for (let r = 0; r < hr; r++) for (const v of rows[r] || []) if (str(v)) return str(v); return ''; })();
    const width = Math.max(...rows.slice(hr, hr + 2).map((r) => (r || []).length));
    // Ders saati satırı: başlığın altındaki satır, şube adı içermiyorsa
    const lessonRow = classKey(str(cell(hr + 1, cc))) ? -1 : hr + 1;
    const cols = [];
    for (let c = cc + 1; c < width; c++) {
      const date = parseDate(cell(hr, c)) || (lessonRow >= 0 ? parseDate(cell(lessonRow, c)) : '');
      if (!date) continue;
      const lt = lessonRow >= 0 ? str(cell(lessonRow, c)) : '';
      const lm = lt.match(/(\d)\s*\.?\s*ders/i) || (lt.match(/^(\d)$/) || null);
      const tm = lt.match(/(\d{1,2})[:.](\d{2})/);
      cols.push({ c, date, lesson: lm ? lm[1] : '', time: tm ? pad(+tm[1]) + ':' + tm[2] : '', label: lm ? lm[1] + '. ders' : (lt || 'Tüm gün') });
    }
    if (!cols.length) throw new Error('Takvimde tarih bulunamadı. Tarihler “3.11.2026” biçiminde “Şube” başlığıyla aynı satırda olmalı.');
    const start = lessonRow >= 0 ? lessonRow + 1 : hr + 1;
    const classes = [], problems = [], notes = [];
    const seenKey = new Set();
    const sessions = cols.map((x) => ({ id: x.date + '_' + (x.lesson ? x.lesson + 'ders' : 'c' + x.c), date: x.date, lesson: x.lesson, time: x.time, label: x.label, exams: {}, blanks: [] }));
    // Aynı tarih ve ders iki sütunda geçerse kimlik çakışmasın
    const ids = new Set();
    sessions.forEach((s, i) => { if (ids.has(s.id)) s.id += '_' + cols[i].c; ids.add(s.id); });
    let ended = false;
    for (let r = start; r < rows.length; r++) {
      const head = str(cell(r, cc));
      const rowText = (rows[r] || []).map(str).filter(Boolean);
      if (!rowText.length) { if (classes.length) ended = true; continue; }
      const key = classKey(head);
      if (!key || ended) { if (classes.length || ended) notes.push(rowText.join(' ')); continue; }
      if (seenKey.has(key)) { problems.push(head + ' takvimde iki kez geçiyor; ilk satır kullanıldı.'); continue; }
      seenKey.add(key); classes.push(key);
      cols.forEach((x, i) => {
        const v = str(cell(r, x.c));
        if (!v) sessions[i].blanks.push(key);
        else if (!NO_EXAM.test(v)) sessions[i].exams[key] = v;
      });
    }
    if (!classes.length) throw new Error('Takvimde şube satırı bulunamadı (örn. “9-A”).');
    sessions.forEach((s) => { if (s.blanks.length && s.blanks.length < classes.length) problems.push(dayLabel(s.date) + ' ' + s.label + ': ' + s.blanks.join(', ') + ' hücresi boş; sınav yok sayıldı.'); });
    sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.lesson || '9') < (b.lesson || '9') ? -1 : 1));
    return { title, sheet: sheet.name, sessions, classes, notes, problems };
  }

  function read(bytes) { return parseCalendar(readXlsx(bytes)); }

  const api = { inflate, unzip, readXlsx, parseCalendar, read, classKey, parseDate, dayLabel, colName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.KelebekCalendar = api;
})();
