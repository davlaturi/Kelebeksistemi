// Zorlayıcı uçtan uca testler:  node tests/zorlu.test.js
//
// Uygulamanın gerçek kodu (app.js) sahte bir sayfa ortamında çalıştırılır; dağıtım
// uygulamanın kendi düğmesiyle (runDistribution) yapılır ve basılacak çıktıların HTML'i
// okunarak birbiriyle ve kurallarla karşılaştırılır:
//   - Sınava giren her öğrenci oturma planında, imza listesinde, afişte, sınav yerlerinde,
//     aramada ve Excel'de tam bir kez ve aynı salon/numarayla yer alır; girmeyen hiç yer almaz.
//   - Her salonda numaralar 1..kapasite (boş koltuklar dahil) eksiksizdir; 1 numara kapı
//     tarafındadır.
//   - Basılan planda (istatistikten bağımsız) aynı düzeyden yan yana / önlü-arkalı oturan
//     sayısı, uygulamanın bildirdiğiyle aynıdır; yer yeterliyse sıfırdır.
//   - Kâğıt tablosu, zarf, hazırlama kartı, öğretmenler odası ve WhatsApp sayıları tutar.
//   - Dağıtımdan sonra yapılan değişiklikler (ekleme, silme, düzenleme, takas, yön, kilit,
//     arşiv, yedek) çıktıları bozmaz ya da eski çıktının basılmasını engeller.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const A = require('../assets/assign.js');
process.env.TZ = 'Europe/Istanbul';
const source = fs.readFileSync(require.resolve('../assets/app.js'), 'utf8').replace(/\r\n/g, '\n');

// ---------- sahte sayfa ----------
function harness(initial) {
  let raw = initial || null;
  let lastBlob = '';
  const toasts = [];
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, { textContent: '', innerHTML: '', value: '', dataset: {}, hidden: false, checked: false,
      classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } }, focus() {}, setAttribute() {}, removeAttribute() {},
      showModal() {}, close() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], appendChild() {}, click() {}, remove() {} });
    return nodes.get(id);
  };
  const context = {
    window: { KelebekAssign: A, KelebekShare: require('../assets/share.js'), KelebekCalendar: require('../assets/calendar.js'),
      KelebekParser: require('../assets/parser.js'), addEventListener() {}, confirm: () => true, scrollTo() {} },
    document: { querySelector: node, querySelectorAll: () => [], createElement: () => node('a-' + Math.random()), body: { appendChild() {} }, addEventListener() {} },
    location: { hash: '' }, history: { replaceState() {} },
    localStorage: { getItem: () => raw, setItem: (_, v) => { raw = v; } },
    Blob: class { constructor(parts) { lastBlob = parts.join(''); } },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    setTimeout: () => 0, clearTimeout() {}, console, Date, Intl,
  };
  vm.createContext(context);
  const boot = "  load();\n  bind();\n  renderAll();\n  showPage(pageFromHash() || (state.result ? 'dagitim' : 'listeler'), true);";
  assert.ok(source.includes(boot), 'Test giriş noktası bulunmalı');
  vm.runInContext(source.replace(boot, `
    renderAll = renderArchive = renderResult = renderReportOnly = () => {};
    toast = (m) => { globalThis.__toasts.push(m); };
    globalThis.api = { validateState, load, save, runDistribution, renderPlans, renderRoll, renderPosters, renderByClass, renderPapers,
      renderTeacherList, searchRows, paperShareData, paperShareText, exportCsv, onSeatClick, addStudent, deleteStudent, openEditor, saveEditor,
      toggleDistributionLock, saveToArchive, withEntry, seatNumbers, applySession, setRoomApproval, outputReady, resultValid, distributionAudit,
      confirmSides, groupNames, cleanStudentNames, buildPack,
      get editing() { return editing; }, get state() { return state; }, set state(s) { state = s; } };
  `), Object.assign(context, { __toasts: toasts }));
  return { api: context.api, raw: () => raw, csv: () => lastBlob, toasts, node };
}

// ---------- HTML okuma ----------
const unesc = (s) => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
const sheets = (html, cls) => html.split('<article class="' + cls).slice(1);
const kicker = (sh) => unesc((sh.match(/<span class="doc-kicker">([\s\S]*?)<\/span>/) || [])[1] || '');
/** Oturma planı: her salon için koltuklar {row, col, k, no, name, cls, vacant} ve sıra grubu başlıkları. */
function parsePlans(html) {
  return sheets(html, 'sheet" data-fit-one="1" data-room="').map((sh) => {
    const room = kicker(sh).replace(/^Sınav salonu · /, '');
    const desksHtml = sh.slice(sh.indexOf('<div class="desks"'));
    const colLabels = [...desksHtml.matchAll(/<span class="col-label">([\s\S]*?)<\/span>/g)].map((m) => unesc(m[1]));
    const seats = [];
    let row = -1, col = 0;
    const re = /<span class="row-label">(\d+)\. sıra<\/span>|<div class="desk[^"]*">([\s\S]*?)<\/div>|<span><\/span>/g;
    let m;
    while ((m = re.exec(desksHtml))) {
      if (m[1]) { row = +m[1] - 1; col = 0; continue; }
      if (m[2] != null) {
        const cells = [...m[2].matchAll(/<(button|span) [^>]*class="seat([^"]*)"[^>]*>([\s\S]*?)<\/\1>/g)];
        cells.forEach((c, k) => {
          const inner = c[3];
          if (/empty-seat/.test(c[2])) return;
          const no = +unesc((inner.match(/<span class="sno"[^>]*>([\s\S]*?)<\/span>/) || [])[1] || 'NaN');
          const vacant = /vacant/.test(c[2]);
          seats.push({ row, col, k, no, vacant, name: vacant ? null : unesc(inner.match(/<span class="who"[^>]*>([\s\S]*?)<\/span>/)[1]),
            cls: vacant ? null : unesc(inner.match(/<span class="cls"[^>]*>([\s\S]*?)<\/span>/)[1]) });
        });
      }
      col++;
    }
    const total = +((sh.match(/<span class="counts-total">Toplam <b>(\d+)<\/b>/) || [])[1]);
    return { room, seats, colLabels, total };
  });
}
const rowsOf = (html) => [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => unesc(c[1])));
const tupleSort = (arr) => arr.map((x) => JSON.stringify(x)).sort();
const same = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);

// ---------- sanal okul ----------
const AD = ['Ali', 'Ayşe', 'İrem', 'Ilgın', 'Ömer', 'Çağla', 'Şule', 'Ümit', 'Ğanim', 'Deniz', 'Efe', 'Zeynep', 'Mehmet Ali', 'Ayşe Nur', 'Ece'];
const SOY = ['Yılmaz', 'Işık', 'İnce', 'Öztürk', 'Çelik', 'Şahin', 'Güneş', 'Doğan', "O'Neil", 'Kaya & Demir', 'Uzunismailoğulları Karahasanoğlu', '<b>Kalın</b>', '=1+1', 'Çetin;Koç', '"Tırnak"'];
function school(rnd, opts = {}) {
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const levels = opts.levels || ['9', '10', '11', '12', 'Hazırlık'].slice(0, ri(1, 5));
  const classes = [];
  let sid = 0;
  for (const lv of levels) for (let k = 0, n = ri(1, opts.maxBranches || 5); k < n; k++) {
    const name = lv + pick(rnd, ['/', '-', ' / ']) + 'ABCDEF'[k];
    const size = opts.size ? opts.size() : ri(1, 38);
    classes.push({ id: 'c' + classes.length, name, selected: true,
      students: Array.from({ length: size }, () => ({ id: 's' + (sid++), name: pick(rnd, AD) + ' ' + pick(rnd, SOY) })) });
  }
  return classes;
}
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
const rnd = A.mulberry32(20261107);

/** Bir dağıtımın bütün çıktılarını okur ve karşılaştırır. Dönüş: özet. */
function verifyOutputs(a, label) {
  const st = a.state, r = st.result, mode = st.settings.sideNames || 'lr';
  const ctx = label + ' (' + mode + ', ' + st.settings.deskCols + ' grup, ' + st.settings.seatsPerDesk + ' kişilik)';
  const cname = new Map(st.classes.map((c) => [c.id, c.name]));
  const included = st.classes.filter((c) => c.students.length && c.selected !== false);
  const expected = tupleSort(included.flatMap((c) => c.students.map((s) => [s.name, c.name])));
  const notIn = new Set(st.classes.filter((c) => !included.includes(c)).flatMap((c) => c.students.map((s) => s.id)));
  // Dağıtım kaydı: herkes bir kez, kapasite, sınava girmeyen yok
  const placedIds = r.rooms.flatMap((x) => x.seats.filter((s) => !s.empty).map((s) => s.studentId));
  assert.equal(new Set(placedIds).size, placedIds.length, 'öğrenci iki kez · ' + ctx);
  assert.ok(placedIds.every((id) => !notIn.has(id)), 'sınava girmeyen yerleşmiş · ' + ctx);

  // 1) Oturma planı
  const plans = parsePlans(a.renderPlans());
  assert.equal(plans.length, r.rooms.length, 'plan sayfası · ' + ctx);
  const truth = new Map(); // tuple anahtarı: name|cls|room|no
  const planTuples = [];
  let deskmate = 0, frontBack = 0;
  plans.forEach((pl, ri) => {
    const room = r.rooms[ri];
    assert.equal(pl.room, cname.get(room.roomId), 'salon adı · ' + ctx);
    const nos = pl.seats.map((s) => s.no).sort((x, y) => x - y);
    same(nos, Array.from({ length: room.seats.length }, (_, i) => i + 1), 'numaralar 1..kapasite eksiksiz · ' + pl.room + ' · ' + ctx);
    assert.equal(pl.total, pl.seats.filter((s) => !s.vacant).length, '"Toplam" öğrenci · ' + ctx);
    // 1 numara: en ön sıra, kapı sağdaysa en sağdaki sıranın sağ koltuğu, değilse en soldakinin sol koltuğu
    const first = pl.seats.find((s) => s.no === 1);
    const row0 = pl.seats.filter((s) => s.row === 0);
    assert.equal(first.row, 0, '1 numara en ön sırada · ' + ctx);
    const maxCol = Math.max(...row0.map((s) => s.col));
    if (mode === 'doorR') { assert.equal(first.col, maxCol, '1 numara kapı (sağ) tarafında · ' + ctx); assert.equal(first.k, Math.max(...row0.filter((s) => s.col === maxCol).map((s) => s.k))); }
    else { assert.equal(first.col, 0, '1 numara sol/kapı tarafında · ' + ctx); assert.equal(first.k, 0); }
    // Her sırada numaralar kapı tarafından artar; arkadaki sıranın bütün numaraları öndekilerden büyüktür
    const byRow = new Map();
    for (const s of pl.seats) { if (!byRow.has(s.row)) byRow.set(s.row, []); byRow.get(s.row).push(s); }
    let prevMax = 0;
    for (const rr of [...byRow.keys()].sort((x, y) => x - y)) {
      const list = byRow.get(rr).slice().sort((x, y) => (mode === 'doorR' ? (y.col - x.col) || (y.k - x.k) : (x.col - y.col) || (x.k - y.k)));
      list.forEach((s, i) => { if (i) assert.ok(s.no > list[i - 1].no, 'sıra içinde numara sırası · ' + ctx); });
      assert.ok(Math.min(...list.map((s) => s.no)) > prevMax, 'arka sıra numaraları büyük · ' + ctx);
      prevMax = Math.max(...list.map((s) => s.no));
    }
    // Basılan plandan bağımsız kural sayımı (aynı sıra / önlü-arkalı)
    const at = new Map(pl.seats.map((s) => [s.row + ':' + s.col + ':' + s.k, s]));
    const lv = (s) => (s && !s.vacant ? A.levelOf(s.cls) : null);
    for (const s of pl.seats) {
      if (s.vacant) continue;
      if (room.spd === 2 && s.k === 0) { const b = at.get(s.row + ':' + s.col + ':1'); if (lv(b) && lv(b) === lv(s)) deskmate++; }
      if (room.spd === 1) { const b = at.get(s.row + ':' + (s.col + 1) + ':0'); if (lv(b) && lv(b) === lv(s)) deskmate++; }
      const f = at.get((s.row + 1) + ':' + s.col + ':' + s.k); if (lv(f) && lv(f) === lv(s)) frontBack++;
    }
    for (const s of pl.seats) if (!s.vacant) { const t = [s.name, s.cls, pl.room, s.no]; planTuples.push(t); truth.set(JSON.stringify(t), s); }
    room._cols = pl.colLabels;
  });
  same(tupleSort(planTuples.map((t) => [t[0], t[1]])), expected, 'planda herkes bir kez · ' + ctx);
  assert.equal(deskmate, r.stats.deskmate, 'basılan plandaki yan yana aynı düzey = bildirilen · ' + ctx);
  assert.equal(frontBack, r.stats.frontBack, 'basılan plandaki önlü-arkalı aynı düzey = bildirilen · ' + ctx);
  const planSet = tupleSort(planTuples);

  // 2) İmza listesi: aynı kişiler, aynı numara, numara sırasıyla
  const rolls = sheets(a.renderRoll(), 'sheet roll-sheet"');
  const rollTuples = [];
  rolls.forEach((sh) => {
    const room = kicker(sh).replace(/^Sınav salonu · /, '');
    const rows = rowsOf(sh.slice(sh.indexOf('<tbody>'), sh.indexOf('</tbody>')));
    rows.forEach((x, i) => { if (i) assert.ok(+x[0] > +rows[i - 1][0], 'imza listesi numara sırası · ' + ctx); rollTuples.push([x[1], x[2], room, +x[0]]); });
  });
  same(tupleSort(rollTuples), planSet, 'imza listesi = plan · ' + ctx);

  // 3) Yönlendirme afişi: aynı kişiler/numara; "Nerede?" plandaki konumla aynı
  const posters = sheets(a.renderPosters(), 'sheet poster-sheet"');
  const posterTuples = [];
  posters.forEach((sh, ri) => {
    const room = unesc(sh.match(/<span class="poster-room">([\s\S]*?)<\/span>/)[1]);
    const lists = [...sh.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)].map((m) => m[1]).filter((b) => /pl-no/.test(b)).join('');
    for (const x of rowsOf(lists)) {
      const t = [x[0], x[1], room, +x[2]];
      posterTuples.push(t);
      const s = truth.get(JSON.stringify(t));
      assert.ok(s, 'afişteki kişi planda yok: ' + t.join(' ') + ' · ' + ctx);
      const g = r.rooms[ri]._cols[s.col];
      assert.ok(x[3].startsWith(g), 'afiş sıra grubu = plan sütunu · ' + ctx);
      assert.ok(x[3].includes('önden ' + (s.row + 1) + '. sıra'), 'afiş sıra hizası = plan · ' + ctx);
      if (r.rooms[ri].spd === 2) assert.ok(x[3].endsWith((s.k === 0 ? 'sol' : 'sağ') + ' koltuk'), 'afiş koltuk tarafı = plan · ' + ctx);
    }
    const marked = (sh.match(/pd-first">(\d+)</) || [])[1];
    assert.equal(marked, '1', 'afişte 1 numara işaretli · ' + ctx);
  });
  same(tupleSort(posterTuples), planSet, 'afiş = plan · ' + ctx);

  // 4) Sınıflara göre sınav yerleri (her şube bir sayfa, alfabetik)
  const locTuples = [];
  const coll = new Intl.Collator('tr', { numeric: true, sensitivity: 'base' });
  for (const sh of sheets(a.renderByClass(), 'sheet student-locations"')) {
    const rows = rowsOf(sh.slice(sh.indexOf('<tbody>'), sh.indexOf('</tbody>')));
    rows.forEach((x, i) => {
      if (i) assert.ok(coll.compare(rows[i - 1][0], x[0]) <= 0, 'sınav yerleri alfabetik · ' + ctx);
      locTuples.push([x[0], x[1], x[2], +x[3]]);
      const s = truth.get(JSON.stringify([x[0], x[1], x[2], +x[3]]));
      assert.ok(s, 'sınav yerlerindeki kişi planda yok · ' + ctx);
      assert.equal(x[5], 'Önden ' + (s.row + 1) + '. sıra', 'sınav yerleri sıra hizası · ' + ctx);
    });
  }
  same(tupleSort(locTuples), planSet, 'sınav yerleri = plan · ' + ctx);

  // 5) Öğrenci arama
  const searchTuples = rowsOf(a.searchRows('')).filter((x) => x.length >= 4).map((x) => [x[0], x[1], x[2], +(x[3].match(/^Sıra no (\d+)/) || [])[1]]);
  if (expected.length <= 300) same(tupleSort(searchTuples), planSet, 'arama = plan · ' + ctx);

  // 6) Excel (CSV)
  a.exportCsv();
  const csv = h.csv().replace(/^﻿/, '').split('\r\n').slice(1).map((l) => parseCsv(l));
  same(tupleSort(csv.map((x) => [x[1].replace(/^'/, ''), x[0], x[2], +x[3]])), planSet, 'Excel = plan · ' + ctx);
  for (const x of csv) for (const cell of x) assert.ok(!/^[=+@-]/.test(cell), 'Excel hücresi formül gibi başlamamalı: ' + cell);

  // 7) Kâğıt sayıları: tablo, zarf, hazırlama kartı, öğretmenler odası, WhatsApp
  const perRoom = new Map(plans.map((pl) => [pl.room, pl.seats.filter((s) => !s.vacant).length]));
  const grand = planTuples.length;
  const papers = a.renderPapers();
  const tfoot = (papers.slice(papers.indexOf('<table class="list matrix">')).match(/<tfoot>([\s\S]*?)<\/tfoot>/) || [])[1] || '';
  const lvsum = +((papers.match(/<tfoot><tr><th>Toplam<\/th><td class="lvsum-n">(\d+)<\/td>/) || [])[1]);
  const lvRows = [...(papers.match(/<table class="lvsum-t"><tbody>([\s\S]*?)<\/tbody>/) || ['', ''])[1].matchAll(/<td class="lvsum-n">(\d+)<\/td>/g)].reduce((x, m) => x + +m[1], 0);
  assert.equal(lvRows, grand, 'düzey özeti satırları toplamı · ' + ctx);
  assert.equal(lvsum, grand, 'düzey özeti toplamı · ' + ctx);
  const footNums = [...tfoot.matchAll(/<th class="num">(\d+)<\/th>/g)].map((m) => +m[1]);
  assert.equal(footNums[footNums.length - 1], grand, 'kâğıt tablosu genel toplam · ' + ctx);
  const envTotals = [...papers.matchAll(/<div class="env-head"><span>SALON ZARFI<\/span><b>([\s\S]*?)<\/b><strong>(\d+)<small>/g)].map((m) => [unesc(m[1]), +m[2]]);
  same(envTotals.map((x) => x[1]), plans.map((pl) => perRoom.get(pl.room)), 'zarf toplamları · ' + ctx);
  const cards = [...papers.matchAll(/<span class="qtitle">([\s\S]*?) salonu<\/span><span class="qtotal">(\d+) kâğıt/g)].map((m) => +m[2]);
  same(cards, plans.map((pl) => perRoom.get(pl.room)), 'hazırlama kartları · ' + ctx);
  const teacher = a.renderTeacherList('room');
  assert.match(teacher, new RegExp('Toplam ' + grand + ' kâğıt'), 'öğretmenler odası toplam · ' + ctx);
  const share = a.paperShareData('');
  assert.equal(share.total, grand, 'WhatsApp toplam · ' + ctx);
  assert.match(a.paperShareText(share), new RegExp('TOPLAM: ' + grand + ' KÂĞIT'), 'WhatsApp metni · ' + ctx);

  // 8) Kaçış: isimlerdeki işaretler HTML'yi bozmaz
  const all = a.renderPlans() + a.renderRoll() + a.renderPosters() + a.renderByClass();
  assert.ok(!/<b>Kalın<\/b>/.test(all), 'isimdeki HTML çalışmamalı · ' + ctx);
  return { students: grand, rooms: r.rooms.length, deskmate: r.stats.deskmate };
}
function parseCsv(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ';') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out;
}

let h; // geçerli sahte sayfa (CSV için)
const fresh = (classes, settings) => {
  h = harness();
  h.api.state = h.api.validateState({ classes, settings: { sidesConfirmed: true, ...settings }, result: null, archive: [] });
  return h.api;
};

// ===================== A) Rastgele okullar =====================
const summary = { runs: 0, done: 0, refused: 0, students: 0, rooms: 0, easyClash: 0 };
const TRIALS = Number(process.env.ZORLU_TRIALS || 120);
for (let t = 0; t < TRIALS; t++) {
  const classes = school(rnd);
  const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const settings = { sideNames: pick(rnd, ['lr', 'doorL', 'doorR']), deskCols: ri(1, 4), seatsPerDesk: rnd() < 0.25 ? 1 : 2, avoidOwnRoom: rnd() < 0.2 };
  if (rnd() < 0.3) { settings.capacityMode = 'custom'; classes.forEach((c) => { c.roomCap = pick(rnd, [null, c.students.length, c.students.length + ri(0, 15), 0]); }); }
  classes.forEach((c) => { if (rnd() < 0.12) c.selected = false; if (rnd() < 0.1) c.useAsRoom = false; if (rnd() < 0.15) c.deskCols = ri(1, 4); });
  const a = fresh(classes, settings);
  summary.runs++;
  a.runDistribution();
  if (!a.state.result) { summary.refused++; assert.ok(h.toasts.some((m) => /yetmiyor|en az bir|seçin|yükleyin/.test(m)), 'dağıtım yapılmadıysa sebep söylenmeli: ' + h.toasts.join(' | ')); continue; }
  summary.done++;
  const s = verifyOutputs(a, 'rastgele #' + t);
  summary.students += s.students; summary.rooms += s.rooms;
  // Yer bolsa (her düzey sıra sayısının yarısından azsa) yan yana aynı düzey olmamalı
  if (settings.seatsPerDesk === 2) {
    const desks = a.state.result.rooms.reduce((x, r) => x + Math.ceil(r.seats.length / 2), 0);
    const lv = new Map();
    for (const c of a.state.classes) if (c.students.length && c.selected !== false) lv.set(A.levelOf(c.name), (lv.get(A.levelOf(c.name)) || 0) + c.students.length);
    if (lv.size > 1 && [...lv.values()].every((n) => n <= 0.5 * desks) && s.deskmate) summary.easyClash++;
  }
}
assert.equal(summary.easyClash, 0, 'yer bolken aynı düzey yan yana oturmamalı');
assert.ok(summary.done > TRIALS * 0.5);

// ===================== B) Uç durumlar =====================
const mk = (spec, opt = {}) => spec.map(([name, n], i) => ({ id: 'k' + i, name, selected: true,
  students: Array.from({ length: n }, (_, j) => ({ id: 'k' + i + '-' + j, name: (opt.names ? opt.names(i, j) : 'Öğrenci ' + name + ' ' + (j + 1)) })) }));
// 1) Tek öğrenci, tek salon
{ const a = fresh(mk([['9/A', 1]]), { sideNames: 'doorR' }); a.runDistribution(); verifyOutputs(a, 'tek öğrenci'); }
// 2) Tek düzey (zorunlu çakışma): çıktılar yine tutarlı ve uyarı var
{ const a = fresh(mk([['9/A', 30], ['9/B', 28]]), { sideNames: 'doorL' }); a.runDistribution(); const s = verifyOutputs(a, 'tek düzey');
  assert.ok(s.deskmate > 0 && a.state.result.warnings.some((w) => /aynı düzeyden iki öğrenci/.test(w))); }
// 3) Tek sayılı kapasite, yarım sıra, yarım masa; 1 ve 4 sıra grubu; tekli sıra
for (const [cols, spd] of [[1, 2], [4, 2], [3, 1], [2, 1], [4, 1]]) for (const mode of ['doorR', 'doorL', 'lr']) {
  const a = fresh(mk([['9/A', 31], ['10/A', 29], ['11/A', 17], ['12/A', 7]]), { sideNames: mode, deskCols: cols, seatsPerDesk: spd });
  a.runDistribution(); verifyOutputs(a, 'düzen ' + cols + 'x' + spd);
}
// 4) Öğretmen kapasitesi: çok boş koltuk, 0 kapasiteli salon; boş koltuklar da numaralı
{ const cl = mk([['9/A', 20], ['10/A', 20], ['11/A', 20], ['12/A', 5]]); cl[0].roomCap = 40; cl[1].roomCap = 41; cl[2].roomCap = 0; cl[3].roomCap = 3;
  const a = fresh(cl, { sideNames: 'doorR', capacityMode: 'custom' }); a.runDistribution(); verifyOutputs(a, 'öğretmen kapasitesi');
  assert.ok(!a.state.result.rooms.some((r) => r.roomId === 'k2'), '0 kapasiteli sınıf salon olmamalı');
  assert.ok(parsePlans(a.renderPlans()).some((p) => p.seats.some((s) => s.vacant)), 'boş koltuk planda görünmeli'); }
// 5) Salona göre farklı sıra düzeni
{ const cl = mk([['9/A', 30], ['10/A', 30], ['11/A', 30]]); cl[0].deskCols = 2; cl[1].deskCols = 4;
  const a = fresh(cl, { sideNames: 'doorR', deskCols: 3 }); a.runDistribution(); verifyOutputs(a, 'salona özel düzen'); }
// 6) Aynı adlı öğrenciler (aynı şubede ve farklı şubelerde), çok uzun ve işaretli adlar
{ const names = (i, j) => (j % 3 === 0 ? 'Ali Kaya' : j % 3 === 1 ? 'Ayşe <i>Nur</i> & "Demir" =SUM(A1)' : 'Muhammed Mustafa Abdurrahman Uzunismailoğulları Karahasanoğlu');
  const a = fresh(mk([['9/A', 9], ['10/A', 9], ['11/A', 9]], { names }), { sideNames: 'doorR' }); a.runDistribution(); verifyOutputs(a, 'aynı ve zor adlar');
  assert.ok(!/<i>Nur<\/i>/.test(a.renderPosters()), 'afişte HTML çalışmamalı'); }
// 7) Boş şube, sınava girmeyen şube, yalnız salon olan şube
{ const cl = mk([['9/A', 25], ['10/A', 0], ['11/A', 20], ['12/A', 30]]); cl[2].selected = false;
  const a = fresh(cl, { sideNames: 'doorL' }); a.runDistribution(); verifyOutputs(a, 'girmeyen şube');
  const all = a.renderPlans() + a.renderRoll() + a.renderPosters() + a.renderByClass() + a.searchRows('');
  assert.ok(!/Öğrenci 11\/A/.test(all), 'sınava girmeyen şubenin öğrencisi çıktılarda olmamalı');
  assert.ok(a.state.result.rooms.some((r) => r.roomId === 'k2'), 'sınava girmeyen şubenin sınıfı yine salon olabilir'); }
// 8) Takvim: sınavı olmayan sınıf salon olmaz; onayla olur
{ const cl = mk([['9/A', 30], ['10/A', 30], ['11/A', 25], ['12/A', 28]]);
  const calendar = { title: 'Takvim', classes: ['9-A', '10-A', '11-A', '12-A'], notes: [], problems: [], approvals: {},
    sessions: [{ id: 'S', date: '2026-11-10', lesson: '2', label: '2. ders', exams: { '9-A': 'Fizik', '10-A': 'Fizik', '11-A': 'Fizik' }, blanks: [] }] };
  h = harness(); const a = h.api; a.state = a.validateState({ classes: cl, settings: { sidesConfirmed: true, sideNames: 'doorR' }, result: null, archive: [], calendar });
  a.applySession('S'); a.state.classes[3].useAsRoom = true; a.runDistribution(); verifyOutputs(a, 'takvim');
  assert.ok(!a.state.result.rooms.some((r) => r.roomId === 'k3'), 'sınavı olmayan 12/A salon olmamalı');
  a.setRoomApproval('k3', true); a.runDistribution(); verifyOutputs(a, 'takvim + onay');
  assert.ok(a.state.result.rooms.some((r) => r.roomId === 'k3'), 'onaylanan 12/A salon olmalı');
  // Kapasite yetmezse dağıtım yapılmaz, sebep söylenir
  a.setRoomApproval('k3', false); const cap = a.state.classes[0]; a.state.settings.capacityMode = 'custom'; cap.roomCap = 5;
  const prev = a.state.result; a.runDistribution(); assert.equal(a.state.result, prev, 'kapasite yetmezken eski dağıtım değişmemeli');
  assert.ok(h.toasts.some((m) => /Salonlar yetmiyor/.test(m))); }

// ===================== C) Dağıtımdan sonra değişiklikler =====================
{
  const base = () => { const a = fresh(mk([['9/A', 20], ['10/A', 21], ['11/A', 19]]), { sideNames: 'doorR' }); a.runDistribution(); return a; };
  // Öğrenci eklenirse eski dağıtım basılamaz (yeni öğrenci listelerde eksik kalmasın)
  { const a = base(); a.addStudent('Yeni Gelen', 'k0', true); assert.equal(a.state.stale, true);
    assert.equal(a.outputReady(), false, 'yeni öğrenci varken eski dağıtım yazdırılmamalı');
    assert.equal(a.distributionAudit().missing, 1, 'eksik öğrenci denetimde görünmeli');
    a.runDistribution(); verifyOutputs(a, 'ekleme sonrası'); assert.ok(a.renderPlans().includes('Yeni Gelen')); }
  // Öğrenci silinirse dağıtım sıfırlanır
  { const a = base(); const id = a.state.classes[1].students[0].id; a.deleteStudent({ dataset: { deleteStudent: id, confirm: '1' }, textContent: '' });
    assert.equal(a.state.result, null); }
  // Düzenleyicide öğrenci çıkarılırsa çıktılar basılamaz (bozuk plan basılmasın)
  { const a = base(); a.openEditor('k2'); a.editing.rows.pop(); a.saveEditor();
    assert.equal(a.resultValid(), false); assert.equal(a.outputReady(), false); }
  // Şube adı değişirse çıktılarda yeni ad görünür ama yeniden dağıtım istenir
  { const a = base(); a.openEditor('k0'); h.node('#e-name').value = '9/Z'; a.saveEditor();
    assert.equal(a.outputReady(), false, 'ad değişince yeniden dağıtım istenmeli'); }
  // Koltuk takası: çıktılar takası yansıtır, numaralar yerinde kalır
  { const a = base(); const r = a.state.result; const s0 = r.rooms[0].seats[0].studentId, s1 = r.rooms[1].seats[3].studentId;
    a.onSeatClick(0, 0); a.onSeatClick(1, 3);
    assert.equal(r.rooms[0].seats[0].studentId, s1); assert.equal(r.rooms[1].seats[3].studentId, s0);
    verifyOutputs(a, 'takas sonrası'); }
  // Kapı yönü değişince bütün çıktılarda numaralar birlikte değişir
  { const a = base(); const before = parsePlans(a.renderPlans())[0].seats.find((s) => s.no === 1);
    a.confirmSides('doorL'); const after = parsePlans(a.renderPlans())[0].seats.find((s) => s.no === 1);
    assert.notEqual(before.col, after.col); verifyOutputs(a, 'yön değişimi'); }
  // Kilit: takas, ekleme, yön değişimi yapılamaz
  { const a = base(); a.toggleDistributionLock(); const snap = JSON.stringify(a.state);
    a.onSeatClick(0, 0); a.onSeatClick(0, 1); a.addStudent('Kilitli', 'k0', true); a.confirmSides('doorL');
    assert.equal(JSON.stringify(a.state), snap, 'kilitliyken hiçbir şey değişmemeli'); }
  // Arşiv: kayıtlı sınav, sonradan yapılan değişikliklerden etkilenmez
  { const a = base(); a.state.settings.exam = '1. Dönem 1. Sınav'; a.state.settings.date = '2026-11-10'; a.saveToArchive();
    const entry = a.state.archive[0]; const archivedPlan = a.withEntry(entry, () => a.renderPlans());
    a.confirmSides('doorL'); a.runDistribution();
    assert.equal(a.withEntry(entry, () => a.renderPlans()), archivedPlan, 'kayıtlı sınavın planı değişmemeli');
    a.withEntry(entry, () => { const keep = a.state; verifyOutputs(a, 'arşiv'); assert.equal(a.state, keep); }); }
  // Yedek: kaydedilip geri yüklenince çıktılar birebir aynı
  { const a = base(); const plan = a.renderPlans(), roll = a.renderRoll(), post = a.renderPosters();
    const b = harness(h.raw()); b.api.load(); assert.equal(b.api.renderPlans(), plan); assert.equal(b.api.renderRoll(), roll); assert.equal(b.api.renderPosters(), post); }
}

// ===================== D) Ad temizliği gerçek soyadlarına dokunmamalı =====================
{
  const cl = mk([['9/A', 4]]);
  cl[0].students[0].name = 'Ayşe Nur Bay';        // "Bay" gerçek soyadı
  cl[0].students[1].name = 'Ali Can Erkek';        // elle yazılmış; durum sözcüğü yok
  cl[0].students[2].name = 'ZİKRETTİN YILMAZ Erkek Yatılı';
  cl[0].students[3].name = 'Ece Demir Kız Gündüzlü';
  const b = harness(JSON.stringify({ app: 'kelebek-sinav', rulesVersion: 2, classes: cl, settings: {}, result: null, archive: [] }));
  b.api.load();
  same(b.api.state.classes[0].students.map((x) => x.name), ['Ayşe Nur Bay', 'Ali Can Erkek', 'ZİKRETTİN YILMAZ', 'Ece Demir']);
}

// ===================== E) Büyük okul: 2000+ öğrenci, 60 salon =====================
{
  const spec = []; for (const lv of ['9', '10', '11', '12']) for (let k = 0; k < 15; k++) spec.push([lv + '/' + 'ABCDEFGHIJKLMNO'[k], 32 + (k % 6)]);
  const a = fresh(mk(spec), { sideNames: 'doorR' });
  const t0 = Date.now(); a.runDistribution(); const t1 = Date.now();
  const s = verifyOutputs(a, 'büyük okul'); const t2 = Date.now();
  assert.ok(t1 - t0 < 15000, 'dağıtım 15 sn içinde: ' + (t1 - t0));
  assert.equal(s.deskmate, 0);
  summary.big = { students: s.students, rooms: s.rooms, distributeMs: t1 - t0, outputsMs: t2 - t1 };
}

console.log('Zorlayıcı testler geçti: ' + summary.done + ' rastgele dağıtım (' + summary.students + ' öğrenci, ' + summary.rooms + ' salon), '
  + summary.refused + ' kapasite yetersiz; büyük okul ' + summary.big.students + ' öğrenci / ' + summary.big.rooms + ' salon, dağıtım ' + summary.big.distributeMs + ' ms.');
