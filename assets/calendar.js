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

  /** Çalışma kitabındaki bütün sayfalar: [{ name, rows: [[değer]], merges }] (birleşik hücreler doldurulur). */
  function readWorkbook(bytes) {
    const files = unzip(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
      (n) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(n));
    const text = (n) => (files[n] ? utf8(files[n]) : '');
    const wb = text('xl/workbook.xml');
    if (!wb) throw new Error('Dosya bir Excel (.xlsx) dosyası değil.');
    const rels = text('xl/_rels/workbook.xml.rels');
    const shared = [];
    const ss = text('xl/sharedStrings.xml');
    if (ss) { const re = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g; let m; while ((m = re.exec(ss))) shared.push(m[1] ? runsText(m[1]) : ''); }
    const tags = wb.match(/<sheet\b[^>]*>/g) || [];
    const sheets = [];
    tags.forEach((tag, i) => {
      const rid = attr(tag, 'r:id');
      let path = '';
      if (rid && rels) {
        const rel = (rels.match(new RegExp('<Relationship\\b[^>]*Id="' + rid + '"[^>]*>')) || [''])[0];
        const target = attr(rel, 'Target');
        if (target) path = target.charAt(0) === '/' ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
      }
      if (!files[path]) path = 'xl/worksheets/sheet' + (i + 1) + '.xml';
      if (!files[path]) return;
      sheets.push(readSheet(text(path), shared, attr(tag, 'name') || 'Sayfa' + (i + 1), attr(tag, 'state') === 'hidden'));
    });
    if (!sheets.length) {
      const any = Object.keys(files).filter((n) => /^xl\/worksheets\//.test(n)).sort();
      any.forEach((n, i) => sheets.push(readSheet(text(n), shared, 'Sayfa' + (i + 1), false)));
    }
    if (!sheets.length) throw new Error('Excel dosyasında çalışma sayfası bulunamadı.');
    return sheets;
  }
  function readSheet(sheet, shared, name, hidden) {
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
    return { name, rows, merges, hidden };
  }
  /** Geriye uyumluluk: ilk sayfa. */
  function readXlsx(bytes) { return readWorkbook(bytes)[0]; }

  // ---------- şube adı ----------
  const trUpper = (s) => String(s).replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase();
  /** "9-A", "9/A (örnek)", "9. Sınıf / A Şubesi", "9A", "Hazırlık-B" → "9-A", "HAZIRLIK-B"; tanınmazsa ''. */
  // Farklı eğik çizgi/tire karakterleri ve görünmez boşluklar tek biçime çevrilir
  const normName = (name) => trUpper(String(name || '').normalize ? String(name || '').normalize('NFC') : String(name || ''))
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '').replace(/[\u00A0\u2000-\u200A\u202F\u3000]/g, ' ')
    .replace(/[∕⁄／\\|]/g, '/').replace(/[‐‑‒–—―−﹣－]/g, '-').replace(/\s+/g, ' ').trim();
  function classKey(name) {
    const T = normName(name);
    const L = '([A-ZÇĞİÖŞÜ])(?![A-ZÇĞİÖŞÜ0-9])';
    let m = T.match(new RegExp('^(\\d{1,2})\\s*\\.?\\s*(?:SINIF[I]?)?\\s*[\\/\\-–.]?\\s*\\(?' + L));
    if (m && +m[1] >= 1 && +m[1] <= 12) return parseInt(m[1], 10) + '-' + m[2];
    m = T.match(new RegExp('^HAZIRLIK\\s*(?:SINIFI)?\\s*[\\/\\-–.]?\\s*\\(?' + L));
    if (m) return 'HAZIRLIK-' + m[1];
    return '';
  }
  /** Bütün düzeyi kapsayan satır: "9. Sınıflar", "9. sınıf", "Tüm 10'lar", "Hazırlık" → "9-*". */
  function levelKey(name) {
    const T = normName(name);
    // Yalnız sayı ("9") düzey sayılmaz; sıra numarasıyla karışmasın diye "sınıf"/"lar" ya da "Tüm" gerekir
    let m = T.match(/^TÜM\s+(\d{1,2})\s*\.?\s*(?:SINIF(?:LAR|I)?|'?(?:LAR|LER)|DÜZEY)?\s*(?:ŞUBELER(?:İ)?)?$/) ||
      T.match(/^(\d{1,2})\s*\.?\s*(?:SINIF(?:LAR|I)?|'?(?:LAR|LER)|DÜZEY)\s*(?:ŞUBELER(?:İ)?)?$/);
    if (m && +m[1] >= 1 && +m[1] <= 12) return parseInt(m[1], 10) + '-*';
    if (/^(?:TÜM\s+)?HAZIRLIK(?:\s*SINIF(?:LAR|I)?)?$/.test(T)) return 'HAZIRLIK-*';
    return '';
  }
  /** Takvim anahtarını okunur yazar: "9-A" → "9-A", "9-*" → "9. sınıflar (tümü)". */
  function keyLabel(k) {
    const m = /^(.+)-\*$/.exec(k);
    if (m) return (m[1] === 'HAZIRLIK' ? 'Hazırlık' : m[1] + '.') + ' sınıflar (tümü)';
    return k.replace(/^HAZIRLIK/, 'Hazırlık');
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
  /**
   * Tarih okur. Yıl yazılmamışsa yearOf(ay) ile tamamlanır
   * (ör. "2026-2027" eğitim yılı: Ağustos–Aralık 2026, Ocak–Temmuz 2027).
   */
  function parseDate(v, yearOf) {
    if (v && typeof v === 'object' && Number.isFinite(v.num)) {
      if (v.num < 30000 || v.num > 80000) return '';
      const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(v.num) * 86400000);
      return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    }
    const s = String(v || '');
    let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return iso(+m[1], +m[2], +m[3]);
    m = s.match(/(?:^|[^\d])(\d{1,2})\s*[./]\s*(\d{1,2})\s*[./]\s*(\d{4}|\d{2})(?!\d)/);
    if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
    const T = trUpper(s);
    m = T.match(/(\d{1,2})\s+([A-ZÇĞİÖŞÜ]+)(?:\s+(\d{4}))?/);
    if (m) {
      const mi = MONTHS.findIndex((x) => trUpper(x) === m[2]);
      if (mi >= 0 && (m[3] || yearOf)) return iso(m[3] ? +m[3] : yearOf(mi + 1), mi + 1, +m[1]);
    }
    if (yearOf) {
      // "3.11" ya da "03/11" ve yanında gün adı (ders saati "2." ile karışmasın diye gün adı aranır)
      m = s.match(/(?:^|[^\d])(\d{1,2})\s*[./]\s*(\d{1,2})(?![\d./])/);
      if (m && DAYS.some((d) => T.includes(trUpper(d)))) return iso(yearOf(+m[2]), +m[2], +m[1]);
    }
    return '';
  }
  const str = (v) => (v && typeof v === 'object' ? String(v.num) : String(v == null ? '' : v)).replace(/\s+/g, ' ').trim();
  const NO_EXAM = /^(—|–|-|−|_+|\.+|x|yok|sınav yok|ders yok|\/|\*)$/i;
  function dayLabel(date) {
    const [y, mo, d] = date.split('-').map(Number);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return d + ' ' + MONTHS[mo - 1] + ' ' + y + ' ' + DAYS[dt.getUTCDay()];
  }
  /** Ders saati metni: "2. Ders", "2.ders", "Ders 2", "2. ders (10:40)", "10:40", "Ülke geneli". */
  function parseLesson(text) {
    const lt = str(text);
    const lm = lt.match(/(\d)\s*\.?\s*ders/i) || lt.match(/ders\s*:?\s*(\d)(?!\d)/i) || lt.match(/^(\d)\s*\.?$/);
    const tm = lt.match(/(\d{1,2})[:.](\d{2})(?!\d)/);
    const time = tm && +tm[1] < 24 && +tm[2] < 60 ? pad(+tm[1]) + ':' + tm[2] : '';
    const lesson = lm && +lm[1] >= 1 && +lm[1] <= 8 ? lm[1] : '';
    return { lesson, time, label: lesson ? lesson + '. ders' : time || lt || 'Tüm gün' };
  }
  const FOLD = { Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U' };
  const slug = (t) => trUpper(t).replace(/[ÇĞİÖŞÜ]/g, (ch) => FOLD[ch]).replace(/[^A-Z0-9]+/g, '').slice(0, 20).toLowerCase() || 'gun';
  /** Eğitim yılı başlıktan ("2026-2027") ya da bugünden çıkarılır. */
  function yearResolver(title, today) {
    const m = String(title || '').match(/(20\d{2})\s*[-–/]\s*(20\d{2})/);
    if (m) return (month) => (month >= 8 ? +m[1] : +m[2]);
    const single = String(title || '').match(/\b(20\d{2})\b/);
    if (single) return () => +single[1];
    const t = today || new Date();
    const y = t.getFullYear(), mo = t.getMonth() + 1;
    // Bugüne en yakın: eğitim yılının ilk yarısındaysak bahar ayları gelecek yıla düşer
    return (month) => (mo >= 8 ? (month >= 8 ? y : y + 1) : (month >= 8 ? y - 1 : y));
  }
  const HEADER = /^(şube|şubeler|sınıf|sınıflar|şube\s*[\/\-]\s*sınıf|sınıf\s*[\/\-]\s*şube|şube adı|sınıfı|şubesi|sınıf\s*\/\s*şube adı)$/i;

  /**
   * Bir sayfadan takvim çıkarır. Sayfada takvim yoksa null döner.
   * Dönüş: { title, sessions:[{id,date,lesson,time,label,exams:{şube:ders},blanks:[şube]}], classes, notes, problems }
   */
  function parseSheet(sheet, opts) {
    opts = opts || {};
    const rows = sheet.rows;
    const cell = (r, c) => (rows[r] && rows[r][c] != null ? rows[r][c] : '');
    const width = Math.max(0, ...rows.map((r) => (r || []).length));
    const titleText = (() => { for (let r = 0; r < Math.min(rows.length, 5); r++) for (const v of rows[r] || []) { const t = str(v); if (t.length > 12 && !parseDate(t)) return t; } return ''; })();
    const yearOf = yearResolver(titleText || opts.title, opts.today);
    const dateAt = (r, c) => parseDate(cell(r, c), yearOf);
    // 1) Başlık satırı ve şube sütunu: "Şube" yazan hücre; yoksa altında şube adları olan sütun
    let hr = -1, cc = -1;
    for (let r = 0; r < Math.min(rows.length, 40) && hr < 0; r++) {
      for (let c = 0; c < (rows[r] || []).length; c++) if (HEADER.test(str(cell(r, c)))) { hr = r; cc = c; break; }
    }
    if (hr < 0) {
      // Şube sütunu: art arda en çok şube adı içeren sütun; başlık satırı, ilk şubenin üstünde tarih içeren satır
      let best = null;
      for (let c = 0; c < Math.min(width, 6); c++) {
        let first = -1, n = 0;
        for (let r = 0; r < rows.length; r++) if (classKey(str(cell(r, c))) || levelKey(str(cell(r, c)))) { if (first < 0) first = r; n++; }
        if (n >= 1 && (!best || n > best.n)) best = { c, first, n };
      }
      if (best) for (let r = best.first - 1; r >= Math.max(0, best.first - 4) && hr < 0; r--) {
        let dates = 0;
        for (let c = best.c + 1; c < width; c++) if (dateAt(r, c)) dates++;
        if (dates) { hr = r; cc = best.c; }
      }
    }
    if (hr < 0) return null;
    // 2) Ders saati satırı: başlığın altındaki satır şube adı değilse
    const below = str(cell(hr + 1, cc));
    const lessonRow = classKey(below) || levelKey(below) ? -1 : hr + 1;
    const cols = [], skipped = [];
    for (let c = cc + 1; c < width; c++) {
      const head = cell(hr, c);
      const date = dateAt(hr, c) || (lessonRow >= 0 ? dateAt(lessonRow, c) : '');
      if (!date) { const h = str(head); if (h && !skipped.includes(h)) skipped.push(h); continue; }
      // Ders saati: alttaki satır; yoksa tarih hücresinin içinde ("3.11.2026 Salı 2. Ders")
      let ls = parseLesson(lessonRow >= 0 ? cell(lessonRow, c) : '');
      if (!ls.lesson && !ls.time) {
        const inHead = parseLesson(str(head).replace(/\d{1,2}\s*[./]\s*\d{1,2}\s*[./]\s*\d{2,4}/, ''));
        if (inHead.lesson || inHead.time) ls = inHead;
      }
      cols.push({ c, date, lesson: ls.lesson, time: ls.time, label: ls.label });
    }
    if (!cols.length) return null;
    const start = lessonRow >= 0 ? lessonRow + 1 : hr + 1;
    const classes = [], problems = [], notes = [];
    if (skipped.length) problems.push((sheet.name ? sheet.name + ': ' : '') + 'Tarih olarak okunamayan sütun başlıkları atlandı: ' + skipped.slice(0, 6).join(', ') + (skipped.length > 6 ? '…' : '') + '.');
    const sessions = cols.map((x) => ({ id: x.date + '_' + (x.lesson ? x.lesson + 'ders' : x.time ? 't' + x.time.replace(':', '') : slug(x.label)),
      date: x.date, lesson: x.lesson, time: x.time, label: x.label, exams: {}, blanks: [] }));
    const seenKey = new Set();
    let ended = false;
    for (let r = start; r < rows.length; r++) {
      const head = str(cell(r, cc));
      const rowText = (rows[r] || []).map(str).filter(Boolean);
      if (!rowText.length) { if (classes.length) ended = true; continue; }
      const key = classKey(head) || levelKey(head);
      const hasSubjects = cols.some((x) => { const v = str(cell(r, x.c)); return v && !NO_EXAM.test(v); });
      if (!key || ended) {
        if (!ended && classes.length && hasSubjects && head && head.length < 25) problems.push('“' + head + '” satırı şube olarak tanınmadı; atlandı. Şube adını “9-A” biçiminde yazın.');
        else if (classes.length || ended || r > start + 1) notes.push(rowText.join(' '));
        continue;
      }
      if (seenKey.has(key)) { problems.push(head + ' takvimde iki kez geçiyor; ilk satır kullanıldı.'); continue; }
      seenKey.add(key); classes.push(key);
      cols.forEach((x, i) => {
        const v = str(cell(r, x.c));
        if (!v) sessions[i].blanks.push(key);
        else if (!NO_EXAM.test(v)) sessions[i].exams[key] = v;
      });
    }
    if (!classes.length) return null;
    return { title: titleText, sessions, classes, notes, problems };
  }

  /**
   * Bütün sayfalardaki takvimleri birleştirir. Aynı tarih ve ders saati birden çok
   * sütunda ya da sayfada geçerse şubeler tek oturumda toplanır.
   */
  function parseWorkbook(sheets, opts) {
    const found = [];
    for (const sh of sheets) { const t = parseSheet(sh, opts); if (t) found.push({ sheet: sh.name, ...t }); }
    if (!found.length) {
      const any = sheets.some((sh) => sh.rows.some((r) => (r || []).some((v) => HEADER.test(str(v)))));
      throw new Error(any ? 'Takvimde tarih bulunamadı. Tarihleri “3.11.2026” biçiminde “Şube” başlığıyla aynı satıra yazın.'
        : 'Takvimde “Şube” başlıklı sütun ya da şube satırı (örn. “9-A”) bulunamadı.');
    }
    const byId = new Map(), classes = [], notes = [], problems = [];
    for (const f of found) {
      for (const k of f.classes) if (!classes.includes(k)) classes.push(k);
      for (const n of f.notes) if (!notes.includes(n)) notes.push(n);
      problems.push(...f.problems);
      for (const ses of f.sessions) {
        const old = byId.get(ses.id);
        if (!old) { byId.set(ses.id, ses); continue; }
        for (const k of Object.keys(ses.exams)) {
          if (old.exams[k] && old.exams[k] !== ses.exams[k]) problems.push(dayLabel(ses.date) + ' ' + ses.label + ': ' + keyLabel(k) + ' için iki farklı ders yazılmış (' + old.exams[k] + ' / ' + ses.exams[k] + '); ilki kullanıldı.');
          else old.exams[k] = ses.exams[k];
        }
        old.blanks = old.blanks.filter((k) => !old.exams[k]).concat(ses.blanks.filter((k) => !old.exams[k] && !old.blanks.includes(k)));
      }
    }
    const sessions = [...byId.values()];
    sessions.forEach((x) => {
      x.blanks = x.blanks.filter((k) => !x.exams[k]);
      if (x.blanks.length && x.blanks.length < classes.length) problems.push(dayLabel(x.date) + ' ' + x.label + ': ' + x.blanks.map(keyLabel).join(', ') + ' hücresi boş; sınav yok sayıldı.');
    });
    sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.lesson || a.time || '9') < (b.lesson || b.time || '9') ? -1 : 1));
    return { title: found[0].title, sheets: found.map((f) => f.sheet), sessions, classes, notes, problems };
  }
  /** Eski adla tek sayfa çözümleme. */
  function parseCalendar(sheet, opts) { return parseWorkbook([sheet], opts); }
  function read(bytes, opts) { return parseWorkbook(readWorkbook(bytes), opts); }

  // ---------- boş şablon (.xlsx) üretimi ----------
  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) { let c = (crc ^ buf[i]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function utf8Bytes(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    const b = unescape(encodeURIComponent(s)), out = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
    return out;
  }
  function zipStore(files) {
    const parts = [], central = [];
    let off = 0;
    const le = (n, size) => { const a = new Uint8Array(size); for (let i = 0; i < size; i++) a[i] = (n >>> (8 * i)) & 0xff; return a; };
    const cat = (arr) => { const len = arr.reduce((a, x) => a + x.length, 0), o = new Uint8Array(len); let p = 0; for (const x of arr) { o.set(x, p); p += x.length; } return o; };
    for (const name of Object.keys(files)) {
      const data = utf8Bytes(files[name]), nm = utf8Bytes(name), crc = crc32(data);
      const local = cat([le(0x04034b50, 4), le(20, 2), le(0x0800, 2), le(0, 2), le(0, 4), le(crc, 4), le(data.length, 4), le(data.length, 4), le(nm.length, 2), le(0, 2), nm]);
      parts.push(local, data);
      central.push(cat([le(0x02014b50, 4), le(20, 2), le(20, 2), le(0x0800, 2), le(0, 2), le(0, 4), le(crc, 4), le(data.length, 4), le(data.length, 4), le(nm.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(off, 4), nm]));
      off += local.length + data.length;
    }
    const cd = cat(central);
    return cat([...parts, cd, le(0x06054b50, 4), le(0, 2), le(0, 2), le(central.length, 2), le(central.length, 2), le(cd.length, 4), le(off, 4), le(0, 2)]);
  }
  const xesc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function sheetXml(grid, merges, widths) {
    const rows = grid.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => (v == null || v === '' ? '' :
      `<c r="${colName(c)}${r + 1}" t="inlineStr"${r === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${xesc(v)}</t></is></c>`)).join('')}</row>`).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (widths ? '<cols>' + widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>' : '') +
      `<sheetData>${rows}</sheetData>` + (merges && merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '') + '</worksheet>';
  }
  /**
   * Uygulamanın okuduğu biçimde boş takvim şablonu üretir.
   * opts: { title, classes: [şube adı], dates: ['2026-11-03', ...], lessons: ['2. Ders', '4. Ders'] }
   */
  function buildTemplate(opts) {
    opts = opts || {};
    const classes = (opts.classes && opts.classes.length ? opts.classes : ['9-A', '9-B', '10-A', '11-A', '12-A']);
    const dates = opts.dates && opts.dates.length ? opts.dates : [];
    const lessons = opts.lessons && opts.lessons.length ? opts.lessons : ['2. Ders', '4. Ders'];
    const head = ['Şube'], sub = [''], merges = [];
    for (const d of dates) {
      const [y, mo, day] = d.split('-').map(Number);
      const label = day + '.' + mo + '.' + y + '\n' + DAYS[new Date(Date.UTC(y, mo - 1, day)).getUTCDay()];
      const startCol = head.length;
      lessons.forEach((l, i) => { head.push(i ? '' : label); sub.push(l); });
      if (lessons.length > 1) merges.push(colName(startCol) + '3:' + colName(startCol + lessons.length - 1) + '3');
    }
    const width = head.length;
    const grid = [[opts.title || 'Ortak Sınav Takvimi (Şube bazında)'], [], head, sub,
      ...classes.map((c) => [c, ...Array.from({ length: width - 1 }, () => '—')]), [],
      ['Not: Sınavı olmayan hücreye “—” yazın. Satır altına yazılan notlar uygulamada uyarı olarak gösterilir.']];
    const rules = [['Kelebek Sınav Dağıtımı — takvim şablonu kuralları'], [],
      ['1. İlk sütunun başlığı “Şube” olmalı; altına şubeleri “9-A”, “10/B” ya da “9. Sınıf / A Şubesi” biçiminde yazın.'],
      ['   Bir düzeyin bütün şubeleri için tek satır da yazabilirsiniz: “9. Sınıflar”.'],
      ['2. “Şube” ile aynı satıra tarihleri yazın (3.11.2026 ya da 3 Kasım 2026). Bir tarihin birden çok dersi varsa hücreleri birleştirin.'],
      ['3. Tarihlerin altındaki satıra ders saatini yazın: “2. Ders”, “4. Ders”, istenirse saatle “2. Ders (10:40)”.'],
      ['4. Şube satırında o oturumdaki dersin adını yazın. Sınav yoksa “—” yazın; boş bırakılan hücre uyarı verir.'],
      ['5. Tablonun altına yazılan satırlar not olarak okunur. Bu sayfa ve başlık içermeyen sayfalar okunmaz.'],
      ['6. Birden çok sayfa kullanılabilir (ör. her düzey ayrı sayfa); aynı tarih ve ders saatindeki şubeler birleştirilir.']];
    const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="13"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    return zipStore({
      '[Content_Types].xml': ct,
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sınav Takvimi" sheetId="1" r:id="rId1"/><sheet name="Kurallar" sheetId="2" r:id="rId2"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'xl/styles.xml': styles,
      'xl/worksheets/sheet1.xml': sheetXml(grid, ['A1:' + colName(Math.max(1, width - 1)) + '1', 'A3:A4'].concat(merges), [12].concat(Array.from({ length: width - 1 }, () => 18))),
      'xl/worksheets/sheet2.xml': sheetXml(rules, [], [120]),
    });
  }

  /**
   * Yeni takvimi var olanla birleştirir. Aynı kimlikli (tarih + ders saati) oturumlar
   * yenisiyle değişir, diğerleri korunur. mode: 'merge' | 'replace'.
   */
  function mergeCalendars(old, parsed, mode) {
    const now = new Date().toISOString();
    const source = { title: parsed.title || '', fileName: parsed.fileName || '', importedAt: now, sessions: parsed.sessions.length };
    if (!old || mode === 'replace') {
      return { title: parsed.title || '', fileName: parsed.fileName || '', importedAt: now, sessions: parsed.sessions, classes: parsed.classes,
        notes: parsed.notes, problems: parsed.problems, approvals: old && mode === 'replace' ? keepApprovals(old.approvals, parsed.sessions) : {}, sources: [source],
        report: { added: parsed.sessions.length, updated: 0, kept: 0 } };
    }
    // Aynı oturum: aynı kimlik ya da aynı tarih + ders saati + etiket (eski sürüm kimlikleri için)
    const sameKey = (x) => x.date + '|' + (x.lesson || '') + '|' + (x.time || '') + '|' + trUpper(x.label || '');
    const newKeys = new Set(parsed.sessions.map(sameKey));
    const renamed = {};
    for (const o of old.sessions) { const n = parsed.sessions.find((x) => sameKey(x) === sameKey(o)); if (n && n.id !== o.id) renamed[o.id] = n.id; }
    const newIds = new Set(parsed.sessions.map((x) => x.id));
    old = { ...old, sessions: old.sessions.filter((x) => !newKeys.has(sameKey(x)) || newIds.has(x.id) || !renamed[x.id]),
      approvals: Object.keys(old.approvals || {}).reduce((acc, k) => { acc[renamed[k] || k] = old.approvals[k]; return acc; }, {}) };
    const oldIds = new Set(old.sessions.map((x) => x.id).concat(Object.keys(renamed).map((k) => renamed[k])));
    const sessions = old.sessions.filter((x) => !newIds.has(x.id)).concat(parsed.sessions)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.lesson || a.time || '9') < (b.lesson || b.time || '9') ? -1 : 1));
    const union = (a, b) => a.concat(b.filter((x) => !a.includes(x)));
    return { title: parsed.title || old.title, fileName: parsed.fileName || old.fileName, importedAt: now, sessions,
      classes: union(old.classes, parsed.classes), notes: union(parsed.notes, old.notes), problems: parsed.problems,
      approvals: keepApprovals(old.approvals, sessions), sources: (old.sources || []).concat([source]).slice(-20),
      report: { added: parsed.sessions.filter((x) => !oldIds.has(x.id)).length, updated: parsed.sessions.filter((x) => oldIds.has(x.id)).length, kept: old.sessions.filter((x) => !newIds.has(x.id)).length, renamed } };
  }
  function keepApprovals(approvals, sessions) {
    const ids = new Set(sessions.map((x) => x.id)), out = {};
    for (const k of Object.keys(approvals || {})) if (ids.has(k)) out[k] = approvals[k];
    return out;
  }

  const api = { inflate, unzip, readXlsx, readWorkbook, parseCalendar, parseSheet, parseWorkbook, read, classKey, levelKey, keyLabel,
    parseDate, parseLesson, dayLabel, colName, buildTemplate, mergeCalendars, zipStore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.KelebekCalendar = api;
})();
