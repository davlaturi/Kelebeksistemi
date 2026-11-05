/* Kelebek Sınav Dağıtımı – arayüz */
(function () {
  'use strict';

  const P = window.KelebekParser;
  const A = window.KelebekAssign;
  const STORE_KEY = 'kelebek-sinav.v1';
  const RULES_VERSION = 2; // 2: kısıt sınıf yerine sınıf düzeyi; kendi sınıfında oturmak serbest

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
  }

  // ---------- durum ----------
  const DEFAULT_SETTINGS = {
    school: '', exam: '', date: '', time: '', lesson: '', headerNote: '',
    deskCols: 3, seatsPerDesk: 2, avoidOwnRoom: false, capacityMode: 'class', sideNames: 'lr', duplex: true, docTheme: 'kurumsal', sessionId: '',
  };
  let state = { classes: [], settings: { ...DEFAULT_SETTINGS }, result: null, stale: false, archive: [], calendar: null };
  let view = 'plan';
  let selectedSeat = null; // {roomIdx, seatIdx}
  let storageBlocked = false;

  // Yedek verisini kullanmadan veya mevcut kaydın üzerine yazmadan doğrula.
  function validateState(data) {
    const object = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
    const require = (ok, message) => { if (!ok) throw new Error(message); };
    const text = (x) => typeof x === 'string' && x.trim().length > 0;
    const dateOK = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x;
    require(object(data), 'Kayıt nesnesi geçersiz.');
    const version = data.rulesVersion == null ? 1 : data.rulesVersion;
    require(Number.isInteger(version) && version >= 1 && version <= RULES_VERSION, 'Desteklenmeyen yedek sürümü.');
    function settings(s) {
      require(s == null || object(s), 'Sınav ayarları geçersiz.');
      const out = { ...DEFAULT_SETTINGS, ...s };
      for (const k of ['school', 'exam', 'date', 'time', 'lesson', 'headerNote']) require(typeof out[k] === 'string', 'Sınav bilgileri geçersiz.');
      require(!out.date || dateOK(out.date), 'Sınav tarihi geçersiz.');
      require(!out.time || /^([01]\d|2[0-3]):[0-5]\d$/.test(out.time), 'Sınav saati geçersiz.');
      require(/^[1-8]?$/.test(out.lesson), 'Ders seçimi geçersiz.');
      require([1, 2, 3, 4].includes(out.deskCols) && [1, 2].includes(out.seatsPerDesk), 'Sıra düzeni geçersiz.');
      require(['class', 'custom'].includes(out.capacityMode) && ['lr', 'doorL', 'doorR'].includes(out.sideNames), 'Salon ayarları geçersiz.');
      for (const k of ['duplex', 'avoidOwnRoom']) require(typeof out[k] === 'boolean', 'Sınav seçeneği geçersiz.');
      if (!['kurumsal', 'resmi', 'modern'].includes(out.docTheme)) out.docTheme = 'kurumsal';
      if (typeof out.sessionId !== 'string' || out.sessionId.length > 120) out.sessionId = '';
      return out;
    }
    function classes(list) {
      require(Array.isArray(list), 'Sınıf listesi geçersiz.');
      const ids = new Set(), students = new Map();
      for (const c of list) {
        require(object(c) && text(c.id) && text(c.name) && Array.isArray(c.students), 'Sınıf kaydı eksik veya geçersiz.');
        require(!ids.has(c.id), 'Tekrarlanan sınıf kimliği.'); ids.add(c.id);
        require(c.deskCols == null || [1, 2, 3, 4].includes(c.deskCols), 'Sınıf sıra düzeni geçersiz.');
        require(c.roomCap == null || c.roomCap === '' || (Number.isInteger(c.roomCap) && c.roomCap >= 0), 'Salon kapasitesi geçersiz.');
        for (const s of c.students) {
          require(object(s) && text(s.id) && text(s.name), 'Öğrenci kaydı eksik veya geçersiz.');
          require(!students.has(s.id), 'Tekrarlanan öğrenci kimliği.'); students.set(s.id, c.id);
        }
      }
      return { ids, students };
    }
    function result(r, list, st, stale) {
      if (r == null) return null;
      require(object(r) && Array.isArray(r.rooms) && r.rooms.length > 0, 'Dağıtım kaydı geçersiz.');
      const index = classes(list), rooms = new Set(), seen = new Set();
      let missing = false;
      for (const room of r.rooms) {
        require(object(room) && text(room.roomId) && !rooms.has(room.roomId) && Array.isArray(room.seats), 'Salon kaydı geçersiz.');
        rooms.add(room.roomId);
        if (!index.ids.has(room.roomId)) missing = true;
        require([1, 2, 3, 4].includes(room.cols) && [1, 2].includes(room.spd), 'Salon sıra düzeni geçersiz.');
        const layout = A.seatLayout(room.seats.length, room.cols, room.spd);
        room.rows = layout.rows; room.capacity = room.seats.length;
        room.seats.forEach((s, i) => {
          require(object(s), 'Koltuk kaydı geçersiz.');
          const geo = layout.seats[i];
          Object.assign(s, { seatNo: i + 1, desk: geo.desk + 1, side: geo.side, row: geo.row, col: geo.col });
          if (s.empty === true) { s.classId = null; s.studentId = null; return; }
          require(text(s.studentId) && text(s.classId) && !seen.has(s.studentId), 'Öğrenci yerleşimi geçersiz veya tekrarlanmış.');
          seen.add(s.studentId);
          if (index.students.get(s.studentId) !== s.classId) missing = true;
        });
      }
      if (missing && stale) return null;
      require(!missing, 'Dağıtımda bulunamayan öğrenci veya sınıf var.');
      if (!stale) {
        const expected = list.filter((c) => c.selected !== false).flatMap((c) => c.students.map((s) => s.id));
        require(expected.length === seen.size && expected.every((id) => seen.has(id)), 'Dağıtımda eksik veya sınava seçilmemiş öğrenci var.');
      }
      require(r.warnings == null || (Array.isArray(r.warnings) && r.warnings.every((w) => typeof w === 'string')), 'Dağıtım uyarıları geçersiz.');
      require(r.paperChecks == null || object(r.paperChecks), 'Kâğıt hazırlama işaretleri geçersiz.');
      require(r.locked == null || typeof r.locked === 'boolean', 'Dağıtım kilidi geçersiz.');
      require(r.subjects == null || (object(r.subjects) && Object.keys(r.subjects).every((k) => typeof r.subjects[k] === 'string')), 'Dağıtımın ders bilgisi geçersiz.');
      require(r.sessionId == null || (typeof r.sessionId === 'string' && r.sessionId.length <= 120), 'Dağıtımın takvim oturumu geçersiz.');
      require(r.distributionId == null || (text(r.distributionId) && r.distributionId.length <= 100), 'Dağıtım numarası geçersiz.');
      require(r.revision == null || (Number.isSafeInteger(r.revision) && r.revision > 0), 'Dağıtım sürümü geçersiz.');
      require(r.updatedAt == null || (typeof r.updatedAt === 'string' && Number.isFinite(Date.parse(r.updatedAt))), 'Dağıtım güncelleme zamanı geçersiz.');

      r.stats = A.evaluate(r.rooms, list, { cols: st.deskCols, spd: st.seatsPerDesk });
      return r;
    }
    function calendar(cal) {
      if (cal == null) return null;
      require(object(cal) && Array.isArray(cal.sessions) && Array.isArray(cal.classes), 'Sınav takvimi geçersiz.');
      const strList = (x) => Array.isArray(x) && x.every((v) => typeof v === 'string');
      require(strList(cal.classes) && (cal.notes == null || strList(cal.notes)) && (cal.problems == null || strList(cal.problems)), 'Sınav takvimi geçersiz.');
      const ids = new Set();
      for (const ses of cal.sessions) {
        require(object(ses) && text(ses.id) && ses.id.length <= 120 && !ids.has(ses.id) && dateOK(ses.date), 'Takvim oturumu geçersiz.');
        ids.add(ses.id);
        require(/^[1-8]?$/.test(ses.lesson || '') && typeof (ses.label || '') === 'string' && object(ses.exams), 'Takvim oturumu geçersiz.');
        require(Object.keys(ses.exams).every((k) => typeof ses.exams[k] === 'string'), 'Takvim dersleri geçersiz.');
        ses.lesson = ses.lesson || ''; ses.time = typeof ses.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(ses.time) ? ses.time : '';
        ses.blanks = strList(ses.blanks) ? ses.blanks : [];
      }
      require(cal.approvals == null || object(cal.approvals), 'Takvim onayları geçersiz.');
      const approvals = {};
      for (const k of Object.keys(cal.approvals || {})) if (ids.has(k) && strList(cal.approvals[k])) approvals[k] = cal.approvals[k];
      return { title: typeof cal.title === 'string' ? cal.title : '', fileName: typeof cal.fileName === 'string' ? cal.fileName : '',
        importedAt: typeof cal.importedAt === 'string' ? cal.importedAt : '', sessions: cal.sessions, classes: cal.classes,
        notes: cal.notes || [], problems: cal.problems || [], approvals,
        sources: Array.isArray(cal.sources) ? cal.sources.filter((x) => object(x)).map((x) => ({ title: String(x.title || ''), fileName: String(x.fileName || ''),
          importedAt: String(x.importedAt || ''), sessions: Number.isSafeInteger(x.sessions) ? x.sessions : 0 })).slice(-20) : [] };
    }
    // Çağıranın nesnesine de kısmi değişiklik bırakma.
    const copy = JSON.parse(JSON.stringify(data));
    classes(copy.classes);
    copy.settings = settings(copy.settings);
    require(copy.archive == null || Array.isArray(copy.archive), 'Sınav arşivi geçersiz.');
    const archive = copy.archive || [], archiveIds = new Set();
    for (const entry of archive) {
      require(object(entry) && text(entry.id) && !archiveIds.has(entry.id) && text(entry.exam), 'Arşiv kaydı geçersiz.');
      archiveIds.add(entry.id);
      require(dateOK(entry.date), 'Arşiv tarihi geçersiz.');
      entry.time = entry.time || '';
      require(typeof entry.time === 'string', 'Arşiv saati geçersiz.');
      classes(entry.classes); entry.settings = settings(entry.settings);
      // Eski arşivler yalnız salon olan şubeleri de seçili saklıyordu.
      if (entry.result && Array.isArray(entry.result.rooms)) {
        const participating = new Set(entry.result.rooms.flatMap((r) => Array.isArray(r && r.seats) ? r.seats.filter((s) => s && !s.empty).map((s) => s.classId) : []));
        entry.classes.forEach((c) => { c.selected = participating.has(c.id); });
      }
      entry.result = result(entry.result, entry.classes, entry.settings, false);
      require(entry.result !== null, 'Arşiv dağıtımı eksik.');
    }
    if (version < RULES_VERSION) copy.settings.avoidOwnRoom = false;
    return { classes: copy.classes, settings: copy.settings,
      result: version < RULES_VERSION ? null : result(copy.result, copy.classes, copy.settings, !!copy.stale),
      stale: version < RULES_VERSION ? false : !!copy.stale, archive, calendar: calendar(copy.calendar) };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      state = validateState(JSON.parse(raw));
    } catch (e) {
      storageBlocked = true;
      toast('Tarayıcı kaydı okunamadı; mevcut kayıt korunuyor. Geçerli bir yedek yükleyin. ' + e.message);
    }
  }
  function save(candidate = state, recovering = false) {
    if (storageBlocked && !recovering) {
      toast('Mevcut kayıt korunuyor; otomatik kayıt kapalı. Geçerli bir yedek yükleyin.');
      return false;
    }
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...candidate, rulesVersion: RULES_VERSION }));
      storageBlocked = false;
      return true;
    } catch (e) {
      if (typeof toast === 'function') toast('Kayıt yapılamadı: tarayıcı depolama alanı dolu olabilir. Eski kayıtlı sınavları silin ya da yedek alın.');
      return false;
    }
  }

  // ---------- yardımcılar ----------
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let uidN = 0;
  const uid = (p) => p + Date.now().toString(36) + (uidN++).toString(36) + Math.random().toString(36).slice(2, 6);
  const collator = new Intl.Collator('tr', { numeric: true, sensitivity: 'base' });
  const hueOf = (idx) => Math.round((idx * 137.508 + 18) % 360);
  /** Renkler sınıf düzeyine göre: aynı düzeydeki sınıflar aynı renk ailesinde. */
  function levelHue(name) {
    const levels = [...new Set(state.classes.map((c) => A.levelOf(c.name)))].sort(collator.compare);
    return hueOf(Math.max(0, levels.indexOf(A.levelOf(name))));
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2200);
  }

  function sortClasses() {
    state.classes.sort((a, b) => collator.compare(a.name, b.name));
  }
  function classIndex() {
    const m = new Map();
    state.classes.forEach((c, i) => m.set(c.id, { c, i }));
    return m;
  }
  function studentIndex() {
    const m = new Map();
    for (const c of state.classes) for (const s of c.students) m.set(s.id, { s, c });
    return m;
  }
  function included() { return state.classes.filter((c) => c.students.length > 0 && c.selected !== false); }

  // ---------- sınav takvimi ----------
  const CAL = window.KelebekCalendar;
  const ckey = (c) => (CAL ? CAL.classKey(c.name) : '');
  /** Seçili takvim oturumu (yoksa null). */
  function activeSession(st = state.settings) {
    const cal = state.calendar;
    if (!cal || !st || !st.sessionId) return null;
    return cal.sessions.find((x) => x.id === st.sessionId) || null;
  }
  const sessionTitle = (ses) => (CAL ? CAL.dayLabel(ses.date) : ses.date) + ' · ' + ses.label;
  /** Şubenin düzey anahtarı: "9/A" → "9-*" (takvimde "9. Sınıflar" satırı için). */
  const lkey = (c) => { const l = A.levelOf(c.name); return l ? trU(l) + '-*' : ''; };
  const trU = (x) => String(x).replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase();
  function examOf(c, ses = activeSession()) { return ses ? (ses.exams[ckey(c)] || ses.exams[lkey(c)] || '') : ''; }
  /** Şube takvimde var mı (kendi satırı ya da düzey satırıyla)? */
  function inCalendar(c, cal = state.calendar) { return !!cal && (cal.classes.includes(ckey(c)) || cal.classes.includes(lkey(c))); }
  function approvedRoom(c, ses = activeSession()) {
    return !!ses && !!state.calendar && (state.calendar.approvals[ses.id] || []).includes(c.id);
  }
  /** Takvime göre bu oturumda salon olamayan sınıf: sınavı yok ve onay verilmemiş. */
  function roomBlocked(c, ses = activeSession()) { return !!ses && !examOf(c, ses) && !approvedRoom(c, ses); }
  /** Oturumdaki şubeleri sınıflandırır. */
  function sessionGroups(ses = activeSession()) {
    const out = { exam: [], free: [], unknown: [], missing: [] };
    if (!ses) return out;
    const loaded = new Set();
    for (const c of state.classes) {
      if (!c.students.length) continue;
      loaded.add(ckey(c)); loaded.add(lkey(c));
      if (!inCalendar(c)) out.unknown.push(c);
      else if (examOf(c, ses)) out.exam.push(c);
      else out.free.push(c);
    }
    out.missing = Object.keys(ses.exams).filter((k) => !loaded.has(k));
    return out;
  }
  const keyLabel = (k) => (CAL ? CAL.keyLabel(k) : k);
  /**
   * Takvim denetimi: dağıtımdan önce bilinmesi gerekenler.
   * level: 'bad' dağıtımı engeller, 'warn' dikkat ister, 'info' bilgi verir.
   */
  function calendarIssues(ses = activeSession()) {
    const out = [];
    if (!ses) return out;
    const st = state.settings, g = sessionGroups(ses);
    if (!Object.keys(ses.exams).length) { out.push({ level: 'bad', text: 'Bu oturumda takvime göre okulda sınav yok.' }); return out; }
    if (st.date !== ses.date || (st.lesson || '') !== (ses.lesson || '')) out.push({ level: 'warn', text: 'Sınav bilgilerindeki tarih ya da ders saati takvimdeki oturumla uyuşmuyor. Oturumu yeniden seçin ya da bilgileri düzeltin.' });
    if (g.missing.length) out.push({ level: 'warn', text: 'Takvimde sınavı olan ' + g.missing.map(keyLabel).join(', ') + ' şubesinin listesi yüklü değil; bu öğrenciler dağıtıma girmiyor. Listeyi 1. adımda yükleyin.' });
    const notSel = g.exam.filter((c) => c.selected === false);
    if (notSel.length) out.push({ level: 'warn', text: notSel.map((c) => c.name + ' (' + examOf(c, ses) + ')').join(', ') + ': takvimde sınavı var ama dağıtıma seçilmedi.' });
    const extra = g.free.concat(g.unknown).filter((c) => c.selected !== false);
    if (extra.length) out.push({ level: 'warn', text: extra.map((c) => c.name).join(', ') + ': bu oturumda sınavı yok ama dağıtıma seçildi; öğrencileri sınav salonlarına yerleştirilecek.' });
    if (g.unknown.length) out.push({ level: 'info', text: g.unknown.map((c) => c.name).join(', ') + ' takvimde yok; sınavı yok sayıldı ve salon olarak kullanılmıyor.' });
    for (const k of ses.blanks || []) if (state.classes.some((c) => (ckey(c) === k || lkey(c) === k) && c.students.length && !examOf(c, ses))) out.push({ level: 'warn', text: keyLabel(k) + ' için takvimdeki hücre boş; sınavı yok sayıldı. Takvimi kontrol edin.' });
    const approved = state.classes.filter((c) => approvedRoom(c, ses));
    if (approved.length) out.push({ level: 'info', text: approved.map((c) => c.name).join(', ') + ': sınavı olmadığı hâlde onayınızla salon olarak kullanılıyor.' });
    const t = capTotals();
    if (t.students && t.seats < t.students) {
      const cands = g.free.concat(g.unknown).filter((c) => !approvedRoom(c, ses)).sort((a, b) => capOf(b) - capOf(a));
      out.push({ level: 'bad', text: 'Salonlar yetmiyor: ' + t.students + ' öğrenci için ' + t.seats + ' koltuk var (' + (t.students - t.seats) + ' eksik).' + (cands.length ? ' Sınavı olmayan bir sınıfı onayınızla salon olarak açabilirsiniz.' : ''), approve: cands.slice(0, 6) });
    } else if (t.students && st.seatsPerDesk !== 1) {
      const desks = roomClasses().reduce((a, c) => a + Math.ceil(capOf(c) / 2), 0);
      const lv = new Map();
      for (const c of included()) lv.set(A.levelOf(c.name), (lv.get(A.levelOf(c.name)) || 0) + c.students.length);
      for (const [l, n] of lv) if (n > desks) out.push({ level: 'warn', text: levelLabelOf(l) + ' öğrencileri (' + n + ') sıra sayısından (' + desks + ') fazla; en az ' + (n - desks) + ' sırada aynı düzeyden iki öğrenci oturacak. Önlemek için yaklaşık ' + (n - desks) * 2 + ' koltuk daha gerekir; sınavı olmayan sınıfları onayınızla salon olarak açabilirsiniz.', approve: g.free.filter((c) => !approvedRoom(c, ses)).sort((a, b) => capOf(b) - capOf(a)).slice(0, 4) });
      if (lv.size === 1 && !out.some((x) => /sıra sayısından/.test(x.text))) out.push({ level: 'info', text: 'Bu oturumda yalnızca ' + levelLabelOf([...lv.keys()][0]) + ' öğrencileri sınavda; aynı düzeyi ayırmak için boş koltuklar kullanılır.' });
    }
    const [y, m, d] = ses.date.split('-').map(Number);
    const dateText = d + '.' + m + '.' + y;
    for (const n of state.calendar.notes || []) if (n.includes(dateText) || n.includes(d + '.' + String(m).padStart(2, '0') + '.' + y)) out.push({ level: 'warn', text: 'Takvim notu: ' + n });
    return out;
  }
  const levelLabelOf = (lv) => (/^\d+$/.test(lv) ? lv + '. sınıf' : lv);
  /** Takvim başlığından dönem/sınav adı ("1. Dönem 1. Sınav") ve okul adı. */
  function calendarMeta(title) {
    const t = String(title || '');
    const m = t.match(/(\d)\.\s*Dönem\s*(\d)\./i);
    const sm = t.match(/[—–]\s*([^—–(]+?(?:Lisesi|Okulu|Koleji|Ortaokulu)[^—–(]*)/i);
    return { exam: m ? m[1] + '. Dönem ' + m[2] + '. Sınav' : '', school: sm ? sm[1].trim() : '' };
  }
  /** Oturumu seçer: tarih ve ders saatini doldurur, sınavı olan şubeleri dağıtıma ve salona alır. */
  function applySession(id) {
    if (!editAllowed()) { renderAll(); return false; }
    const ses = id && state.calendar ? state.calendar.sessions.find((x) => x.id === id) : null;
    const next = JSON.parse(JSON.stringify(state));
    next.settings.sessionId = ses ? ses.id : '';
    if (ses) {
      next.settings.date = ses.date;
      next.settings.lesson = ses.lesson || '';
      if (ses.time) next.settings.time = ses.time;
      const meta = calendarMeta(state.calendar.title);
      if (!next.settings.exam && meta.exam) next.settings.exam = meta.exam;
      if (!next.settings.school && meta.school) next.settings.school = meta.school;
      const ok = new Set((state.calendar.approvals[ses.id] || []));
      for (const c of next.classes) {
        const has = !!examOf(c, ses);
        c.selected = has;
        c.useAsRoom = has || ok.has(c.id);
      }
    }
    if (next.result) next.stale = true;
    if (!save(next)) return false;
    state = next; selectedSeat = null;
    renderAll();
    if (ses) {
      const g = sessionGroups(ses);
      toast(sessionTitle(ses) + ' seçildi: ' + g.exam.length + ' şube sınavda, ' + g.free.length + ' şube sınavsız.' + (g.missing.length ? ' ' + g.missing.length + ' şubenin listesi eksik.' : ''));
    }
    return true;
  }
  function setRoomApproval(id, on) {
    const ses = activeSession();
    const c = state.classes.find((x) => x.id === id);
    if (!ses || !c || !editAllowed()) return false;
    if (on && typeof window.confirm === 'function' && !window.confirm(c.name + ' bu oturumda (' + sessionTitle(ses) + ') sınava girmiyor; öğrencileri o saatte kendi sınıfında olabilir.\n\nBu sınıfı sınav salonu olarak açmayı onaylıyor musunuz?')) return false;
    const next = JSON.parse(JSON.stringify(state));
    const list = (next.calendar.approvals[ses.id] || []).filter((x) => x !== id);
    if (on) list.push(id);
    if (list.length) next.calendar.approvals[ses.id] = list; else delete next.calendar.approvals[ses.id];
    next.classes.find((x) => x.id === id).useAsRoom = on;
    if (next.result) next.stale = true;
    if (!save(next)) return false;
    state = next; renderAll();
    toast(on ? c.name + ' onayınızla sınav salonu olarak açıldı.' : c.name + ' salon onayı kaldırıldı.');
    return true;
  }
  let pendingCalendar = null;
  /** Excel'i okur ve önce önizleme gösterir; onaylanınca takvime eklenir. */
  async function importCalendar(file) {
    if (!file || !CAL) return;
    if (!editAllowed()) return;
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const parsed = CAL.read(buf, { title: state.calendar ? state.calendar.title : '' });
      parsed.fileName = file.name || '';
      previewCalendar(parsed);
    } catch (e) {
      toast('Takvim okunamadı: ' + e.message);
    }
  }
  /** Okunan takvimin özeti: kullanıcı, uygulamanın ne anladığını görüp onaylar. */
  function previewCalendar(parsed) {
    pendingCalendar = parsed;
    const old = state.calendar;
    const withExam = parsed.sessions.filter((x) => Object.keys(x.exams).length);
    const loaded = state.classes.filter((c) => c.students.length);
    const tmp = { classes: parsed.classes };
    const noList = parsed.classes.filter((k) => !loaded.some((c) => ckey(c) === k || lkey(c) === k));
    const notIn = loaded.filter((c) => !inCalendar(c, tmp));
    const oldIds = new Set(old ? old.sessions.map((x) => x.id) : []);
    const merged = old ? CAL.mergeCalendars(old, parsed, 'merge') : null;
    const rows = parsed.sessions.map((x) => {
      const n = Object.keys(x.exams).length;
      const tag = !old ? '' : oldIds.has(x.id) || (merged && Object.keys(merged.report.renamed).some((k) => merged.report.renamed[k] === x.id)) ? '<span class="pill warn">güncellenir</span>' : '<span class="pill ok">yeni</span>';
      return `<tr><td>${esc(CAL.dayLabel(x.date))}</td><td>${esc(x.label)}${x.time && x.lesson ? ' · ' + esc(x.time) : ''}</td><td class="num">${n || '–'}</td><td class="cal-subj">${esc(n ? subjectsSummary(x).join(', ') : 'Sınav yok')}</td><td>${tag}</td></tr>`;
    }).join('');
    $('#cal-dlg-body').innerHTML = `<h3>Takvim önizlemesi</h3>
      <p class="hint">${esc(parsed.fileName || '')}${parsed.sheets && parsed.sheets.length ? ' · sayfa: ' + esc(parsed.sheets.join(', ')) : ''}</p>
      <p><b>${esc(parsed.title || 'Başlıksız takvim')}</b></p>
      <div class="cal-dlg-sum"><span class="pill"><b>${withExam.length}</b> sınav oturumu</span><span class="pill"><b>${parsed.sessions.length - withExam.length}</b> sınavsız oturum</span><span class="pill"><b>${parsed.classes.length}</b> şube/düzey satırı</span>
        <span class="pill">${esc(CAL.dayLabel(parsed.sessions[0].date))} – ${esc(CAL.dayLabel(parsed.sessions[parsed.sessions.length - 1].date))}</span></div>
      <ul class="cal-notes">
        ${noList.length ? `<li class="warn">Listesi uygulamada olmayan: <b>${esc(noList.map(keyLabel).join(', '))}</b>. Bu şubelerin sınavı varsa öğrencileri dağıtılamaz; listelerini 1. adımda yükleyin.</li>` : `<li class="ok">Takvimdeki bütün şubelerin listesi uygulamada var.</li>`}
        ${notIn.length ? `<li class="info">Uygulamada olup takvimde olmayan: <b>${esc(notIn.map((c) => c.name).join(', '))}</b> (sınavı yok sayılır).</li>` : ''}
        ${parsed.problems.map((x) => `<li class="warn">${esc(x)}</li>`).join('')}
        ${parsed.notes.map((x) => `<li class="info">Not: ${esc(x)}</li>`).join('')}
      </ul>
      <div class="table-scroll cal-dlg-table"><table class="list"><thead><tr><th>Tarih</th><th>Ders saati</th><th class="num">Şube</th><th>Dersler</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      ${old ? `<fieldset class="cal-mode"><legend>Mevcut takvim: ${esc(old.title || old.fileName || 'Sınav takvimi')} (${old.sessions.length} oturum)</legend>
        <label class="check"><input type="radio" name="cal-mode" value="merge" checked> <span><b>Takvime ekle</b> — aynı tarih ve ders saatindeki ${merged.report.updated} oturum güncellenir, ${merged.report.added} yeni oturum eklenir, diğer ${merged.report.kept} oturum korunur.</span></label>
        <label class="check"><input type="radio" name="cal-mode" value="replace"> <span><b>Eski takvimi tamamen değiştir</b> — yalnız bu dosyadaki oturumlar kalır.</span></label></fieldset>` : ''}`;
    $('#cal-dlg-ok').textContent = old ? 'Onayla ve takvime ekle' : 'Onayla ve takvimi yükle';
    const dlg = $('#cal-dlg');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function closeCalendarDialog() {
    const dlg = $('#cal-dlg');
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
    pendingCalendar = null;
  }
  /** Önizlemesi onaylanan takvimi sisteme ekler. mode: 'merge' (varsayılan) | 'replace'. */
  function confirmCalendar(mode) {
    const parsed = pendingCalendar;
    if (!parsed || !editAllowed()) return false;
    const checked = document.querySelector('#cal-dlg input[name="cal-mode"]:checked');
    mode = mode || (checked && checked.value) || 'merge';
    const cal = CAL.mergeCalendars(state.calendar, parsed, mode);
    const report = cal.report; delete cal.report;
    const next = { ...state, calendar: cal, settings: { ...state.settings } };
    if (report.renamed && report.renamed[next.settings.sessionId]) next.settings.sessionId = report.renamed[next.settings.sessionId];
    if (!cal.sessions.some((x) => x.id === next.settings.sessionId)) next.settings.sessionId = '';
    // Kayıtlı sınavlar eski kimlikle tutuluyorsa yeni kimliğe bağlanır
    if (report.renamed) next.archive = state.archive.map((e) => (e.settings && report.renamed[e.settings.sessionId] ? { ...e, settings: { ...e.settings, sessionId: report.renamed[e.settings.sessionId] } } : e));
    const meta = calendarMeta(cal.title);
    if (!next.settings.school && meta.school) next.settings.school = meta.school;
    if (!next.settings.exam && meta.exam) next.settings.exam = meta.exam;
    if (!save(next)) return false;
    state = next;
    closeCalendarDialog();
    renderAll();
    const withExam = parsed.sessions.filter((x) => Object.keys(x.exams).length).length;
    toast(state.calendar.sources.length > 1 && mode !== 'replace'
      ? 'Takvime eklendi: ' + report.added + ' yeni, ' + report.updated + ' güncellenen oturum. Toplam ' + cal.sessions.length + ' oturum.'
      : 'Sınav takvimi yüklendi: ' + withExam + ' sınav oturumu, ' + cal.classes.length + ' şube. Dağıtım için bir oturum seçin.');
    return true;
  }
  /** Uygulamanın okuduğu biçimde boş şablon (.xlsx): yüklü şubeler ve önümüzdeki hafta. */
  function downloadTemplate() {
    const names = state.classes.filter((c) => c.students.length).map((c) => {
      const k = ckey(c); return k ? keyLabel(k) : c.name;
    });
    const uniq = names.filter((x, i) => names.indexOf(x) === i);
    const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
    const dates = [];
    for (let i = 0; i < 5; i++) { const x = new Date(d); x.setDate(d.getDate() + i); dates.push(localDateKey(x)); }
    const bytes = CAL.buildTemplate({ title: (state.settings.school ? state.settings.school + ' — ' : '') + 'Ortak Sınav Takvimi (Şube bazında)', classes: uniq.length ? uniq : null, dates });
    downloadFile('Sinav-Takvimi-Sablonu.xlsx', bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    toast('Boş şablon indirildi. Doldurup “Sınav takvimini yükle” ile ekleyin.');
  }
  function removeCalendar() {
    if (!editAllowed()) return;
    const next = { ...state, calendar: null, settings: { ...state.settings, sessionId: '' } };
    if (!save(next)) return;
    state = next; renderAll();
    toast('Sınav takvimi kaldırıldı. Şube ve salon seçimleri olduğu gibi kaldı.');
  }
  /** Bugünkü ya da sıradaki oturumlar (sınavı olanlar). */
  function upcomingSessions(limit = 3) {
    if (!state.calendar) return [];
    const today = localDateKey(new Date());
    return state.calendar.sessions.filter((x) => x.date >= today && Object.keys(x.exams).length).slice(0, limit);
  }
  const sessionSaved = (ses) => state.archive.some((a) => a.settings && a.settings.sessionId === ses.id);
  function sessionOptions(selected) {
    if (!state.calendar) return '';
    return '<option value="">Takvimden oturum seçin</option>' + state.calendar.sessions.map((x) => {
      const n = Object.keys(x.exams).length;
      return `<option value="${esc(x.id)}"${x.id === selected ? ' selected' : ''}${n ? '' : ' disabled'}>${esc(sessionTitle(x))} — ${n ? n + ' şube sınavda' : 'okulda sınav yok'}${sessionSaved(x) ? ' ✓' : ''}</option>`;
    }).join('');
  }
  function subjectsSummary(ses) {
    const m = new Map();
    for (const k of Object.keys(ses.exams)) m.set(ses.exams[k], (m.get(ses.exams[k]) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([sub, n]) => sub + (n > 1 ? ' (' + n + ')' : ''));
  }
  /** 2. adım: takvim kartı */
  function renderCalendar() {
    const box = $('#calendar-card');
    if (!box) return;
    const cal = state.calendar;
    if (!cal) {
      box.innerHTML = `<div class="cal-empty"><div><h3>Sınav takvimi</h3>
        <p class="hint">Şube bazındaki ortak sınav takvimini (Excel) yükleyin. Her oturumda sınavı olan şubeler dağıtıma, sınıfları salon olarak otomatik seçilir; sınavı olmayan sınıflar salon yapılmaz.</p></div>
        <div class="cal-actions"><label class="btn primary" for="cal-file">Sınav takvimini yükle (Excel)</label><button type="button" class="btn ghost small" data-cal-template="1">Boş şablon indir</button></div></div>
      <details class="cal-rules"><summary>Şablon kuralları</summary><ol>
        <li>İlk sütunun başlığı <b>Şube</b> olur; altına şubeler “9-A”, “10/B” ya da “9. Sınıf / A Şubesi” biçiminde yazılır. Bir düzeyin bütün şubeleri için tek satır da olur: “9. Sınıflar”.</li>
        <li><b>Şube</b> ile aynı satıra tarihler yazılır (3.11.2026 ya da 3 Kasım 2026). Bir günün birden çok dersi varsa hücreler birleştirilir.</li>
        <li>Tarihlerin altındaki satıra ders saati yazılır: “2. Ders”, “4. Ders”, istenirse saatle “2. Ders (10:40)”.</li>
        <li>Şube satırında o oturumdaki dersin adı yazılır. Sınav yoksa “—” yazılır; boş bırakılan hücre uyarı verir.</li>
        <li>Tablonun altındaki satırlar not olarak okunur ve ilgili günde uyarı olarak gösterilir.</li>
        <li>Birden çok sayfa olabilir (ör. her düzey ayrı sayfada); aynı tarih ve ders saatindeki şubeler birleştirilir. Takvim içermeyen sayfalar atlanır.</li>
        <li>Yeni takvim eskisinin üzerine eklenir: aynı tarih ve ders saatindeki oturumlar güncellenir, diğerleri korunur.</li>
      </ol></details>`;
      return;
    }
    const active = activeSession();
    const byDate = new Map();
    for (const x of cal.sessions) { if (!byDate.has(x.date)) byDate.set(x.date, []); byDate.get(x.date).push(x); }
    const loadedCls = state.classes.filter((c) => c.students.length);
    const missing = cal.classes.filter((k) => !loadedCls.some((c) => ckey(c) === k || lkey(c) === k));
    const notIn = loadedCls.filter((c) => !inCalendar(c));
    const today = localDateKey(new Date());
    const first = cal.sessions[0], last = cal.sessions[cal.sessions.length - 1];
    box.innerHTML = `<div class="cal-head"><div><span class="eyebrow">SINAV TAKVİMİ</span><h3>${esc(cal.title || 'Sınav takvimi')}</h3>
        <p class="hint">${cal.sessions.filter((x) => Object.keys(x.exams).length).length} sınav oturumu · ${cal.classes.length} şube · ${esc(CAL.dayLabel(first.date))} – ${esc(CAL.dayLabel(last.date))}${cal.fileName ? ' · ' + esc(cal.fileName) : ''}</p></div>
        <div class="cal-actions"><label class="btn small" for="cal-file">Takvim ekle / güncelle</label><button type="button" class="btn ghost small" data-cal-template="1">Boş şablon indir</button><button type="button" class="btn ghost small danger" data-cal-remove="1">Takvimi kaldır</button></div></div>
      ${cal.sources && cal.sources.length > 1 ? `<p class="hint cal-sources">Yüklenen dosyalar: ${cal.sources.map((x) => esc(x.fileName || x.title || 'takvim') + ' (' + x.sessions + ' oturum)').join(' · ')}</p>` : ''}
      ${missing.length || notIn.length || cal.problems.length || cal.notes.length ? `<ul class="cal-notes">
        ${missing.length ? `<li class="warn">Listesi yüklenmemiş şubeler: <b>${esc(missing.map(keyLabel).join(', '))}</b>. Bu şubelerin öğrencileri dağıtıma giremez.</li>` : ''}
        ${notIn.length ? `<li class="info">Takvimde olmayan şubeler: <b>${esc(notIn.map((c) => c.name).join(', '))}</b> (sınavı yok sayılır).</li>` : ''}
        ${cal.problems.map((x) => `<li class="warn">${esc(x)}</li>`).join('')}
        ${cal.notes.map((x) => `<li class="${/⚠|teyit|kontrol/i.test(x) ? 'warn' : 'info'}">${esc(x)}</li>`).join('')}
      </ul>` : ''}
      ${(() => {
        const dayHtml = ([date, list]) => `<div class="cal-day${date === today ? ' today' : ''}${date < today ? ' past' : ''}">
        <div class="cal-date">${esc(CAL.dayLabel(date))}${date === today ? ' <span class="pill">Bugün</span>' : ''}</div>
        ${list.map((x) => { const n = Object.keys(x.exams).length; const on = active && active.id === x.id; return `<button type="button" class="cal-ses${on ? ' on' : ''}${n ? '' : ' none'}" data-session-apply="${esc(x.id)}" ${n ? '' : 'disabled'} aria-pressed="${on}">
          <span class="cal-ses-l">${esc(x.label)}${sessionSaved(x) ? ' <span class="cal-saved" title="Bu oturumun dağıtımı kayıtlı">✓ kayıtlı</span>' : ''}</span>
          <span class="cal-ses-n">${n ? n + ' şube sınavda' : 'Sınav yok'}</span>
          ${n ? `<span class="cal-ses-s">${esc(subjectsSummary(x).slice(0, 3).join(', '))}${subjectsSummary(x).length > 3 ? '…' : ''}</span>` : ''}
        </button>`; }).join('')}
      </div>`;
        const all = [...byDate.entries()];
        const past = all.filter(([d]) => d < today && !(active && active.date === d)), next = all.filter((x) => !past.includes(x));
        return (next.length ? `<div class="cal-days">${next.map(dayHtml).join('')}</div>` : '<p class="hint">Takvimde bugünden sonra oturum yok.</p>') +
          (past.length ? `<details class="cal-past"${next.length ? '' : ' open'}><summary>Geçmiş oturumlar (${past.reduce((a, x) => a + x[1].length, 0)})</summary><div class="cal-days">${past.map(dayHtml).join('')}</div></details>` : '');
      })()}
      <details class="cal-rules"><summary>Şablon kuralları</summary><ol>
        <li>İlk sütunun başlığı <b>Şube</b> olur; altına şubeler “9-A”, “10/B” ya da “9. Sınıf / A Şubesi” biçiminde yazılır. Bir düzeyin bütün şubeleri için tek satır da olur: “9. Sınıflar”.</li>
        <li><b>Şube</b> ile aynı satıra tarihler yazılır (3.11.2026 ya da 3 Kasım 2026). Bir günün birden çok dersi varsa hücreler birleştirilir.</li>
        <li>Tarihlerin altındaki satıra ders saati yazılır: “2. Ders”, “4. Ders”, istenirse saatle “2. Ders (10:40)”.</li>
        <li>Şube satırında o oturumdaki dersin adı yazılır. Sınav yoksa “—” yazılır; boş bırakılan hücre uyarı verir.</li>
        <li>Tablonun altındaki satırlar not olarak okunur ve ilgili günde uyarı olarak gösterilir.</li>
        <li>Birden çok sayfa olabilir (ör. her düzey ayrı sayfada); aynı tarih ve ders saatindeki şubeler birleştirilir. Takvim içermeyen sayfalar atlanır.</li>
        <li>Yeni takvim eskisinin üzerine eklenir: aynı tarih ve ders saatindeki oturumlar güncellenir, diğerleri korunur.</li>
      </ol></details>`;
  }
  /** 3. adım: oturum paneli — sınavı olan / olmayan şubeler ve denetim. */
  function renderSessionPanel() {
    const box = $('#session-panel');
    if (!box) return;
    if (!state.calendar) { box.innerHTML = ''; box.className = 'picker no-print'; return; }
    const ses = activeSession();
    if (!ses) {
      const up = upcomingSessions();
      box.className = 'picker session-panel pending no-print';
      box.innerHTML = `<div class="pick-head"><span aria-hidden="true">📅</span><strong>Hangi oturum için dağıtım yapıyorsunuz?</strong></div>
        ${up.length ? `<div class="ses-quick">${up.map((x) => `<button type="button" class="btn small" data-session-apply="${esc(x.id)}">${esc(sessionTitle(x))} · ${Object.keys(x.exams).length} şube</button>`).join('')}</div>` : ''}
        <label class="ses-select">Tüm oturumlar <select data-session-select="1">${sessionOptions('')}</select></label>`;
      return;
    }
    const g = sessionGroups(ses);
    const issues = calendarIssues(ses);
    const chip = (c, sub) => `<span class="ses-chip" style="--h:${levelHue(c.name)}"><b>${esc(c.name)}</b>${sub ? ' <small>' + esc(sub) + '</small>' : ''}</span>`;
    box.className = 'picker session-panel no-print' + (issues.some((x) => x.level === 'bad') ? ' bad' : issues.some((x) => x.level === 'warn') ? ' warn' : '');
    box.innerHTML = `<div class="pick-head"><span aria-hidden="true">📅</span><strong>${esc(sessionTitle(ses))}</strong>
        <span class="spacer"></span><label class="ses-select">Oturum <select data-session-select="1">${sessionOptions(ses.id)}</select></label></div>
      <div class="ses-groups">
        <div class="ses-group exam"><h4>Sınavı olan şubeler <span>${g.exam.length}</span></h4><div>${g.exam.map((c) => chip(c, examOf(c, ses))).join('') || '<span class="hint">Yok</span>'}</div></div>
        <div class="ses-group free"><h4>Sınavı olmayan şubeler <span>${g.free.length}</span></h4><p class="hint">Kendi sınıflarında ders yapar; salon olarak kullanılmaz.</p><div>${g.free.map((c) => chip(c, approvedRoom(c, ses) ? 'onaylı salon' : '')).join('') || '<span class="hint">Yok</span>'}</div></div>
        ${g.unknown.length ? `<div class="ses-group unknown"><h4>Takvimde olmayan <span>${g.unknown.length}</span></h4><div>${g.unknown.map((c) => chip(c, '')).join('')}</div></div>` : ''}
        ${g.missing.length ? `<div class="ses-group missing"><h4>Listesi yüklenmemiş <span>${g.missing.length}</span></h4><div>${g.missing.map((k) => `<span class="ses-chip"><b>${esc(keyLabel(k))}</b> <small>${esc(ses.exams[k])}</small></span>`).join('')}</div></div>` : ''}
      </div>
      ${issues.length ? `<ul class="ses-issues">${issues.map((x) => `<li class="${x.level}">${x.level === 'bad' ? '⛔' : x.level === 'warn' ? '⚠' : 'ℹ'} ${esc(x.text)}${x.approve && x.approve.length ? `<div class="ses-approve">${x.approve.map((c) => `<button type="button" class="btn small" data-approve-room="${esc(c.id)}">${esc(c.name)} salon olsun (${capOf(c)} koltuk)</button>`).join('')}</div>` : ''}</li>`).join('')}</ul>` : '<p class="ses-ok">✓ Takvim denetimi: sorun yok. Sınavı olan şubeler seçildi, salonlar yalnızca sınavı olan sınıflardan oluşuyor.</p>'}`;
  }
  /** Dağıtımın ders bilgisi: şube kimliği → ders adı */
  function subjectOf(classId, r = state.result) { return (r && r.subjects && r.subjects[classId]) || ''; }

  /** Sınıfları düzeylere göre gruplar: [{level, label, classes}] */
  function byLevel(classes) {
    const map = new Map();
    for (const c of classes) {
      const lv = A.levelOf(c.name);
      if (!map.has(lv)) map.set(lv, []);
      map.get(lv).push(c);
    }
    return [...map.entries()]
      .sort((a, b) => collator.compare(a[0], b[0]))
      .map(([level, cls]) => ({ level, label: /^\d+$/.test(level) ? level + '. sınıflar' : cls[0].name.split(/[\/\-\s]/)[0], classes: cls }));
  }

  function editAllowed() {
    if (!state.result || !state.result.locked) return true;
    toast('Dağıtım kilitli. Değişiklik yapmak için önce Dağıtım kilidini aç düğmesine basın.');
    return false;
  }
  function stampResult(r, fresh = false) {
    if (fresh || !r.distributionId) r.distributionId = uid('D-').toUpperCase();
    r.revision = fresh ? 1 : (r.revision || 0) + 1;
    r.updatedAt = new Date().toISOString();
  }
  function distributionLabel(r = state.result) {
    if (!r) return '';
    const id = r.distributionId || ('ESKİ-' + (r.seed == null ? 'KAYIT' : r.seed));
    const timestamp = r.updatedAt || r.createdAt;
    const when = timestamp ? new Date(timestamp).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : 'Eski kayıt; zaman bilgisi yok';
    return 'Dağıtım ' + id + ' / v' + (r.revision || 1) + ' · ' + when;
  }
  function distributionAudit() {
    const expected = new Set(included().flatMap(c => c.students.map(s => s.id)));
    const seen = new Set(); let duplicates = 0, unexpected = 0, capacityErrors = 0;
    const rooms = (state.result ? state.result.rooms : []).map(room => {
      const seats = room.seats.filter(s => !s.empty);
      seats.forEach(s => { if (seen.has(s.studentId)) duplicates++; seen.add(s.studentId); if (!expected.has(s.studentId)) unexpected++; });
      const c = state.classes.find(c => c.id === room.roomId);
      if (!c || seats.length > capOf(c)) capacityErrors++;
      const stats = A.evaluate([room], state.classes, { cols: room.cols, spd: room.spd });
      return { name: c ? c.name : room.name, ...stats };
    });
    const missing = [...expected].filter(id => !seen.has(id)).length;
    return { expected: expected.size, placed: expected.size - missing, missing, duplicates, unexpected, capacityErrors, rooms };
  }
  /**
   * Rapor sayfalarının üstündeki tek satırlık durum çubuğu. Her şey yolundaysa
   * kısa bir onay; sorun varsa sorunlar yazar. Ayrıntılar tıklanınca açılır.
   */
  function statusBarHtml() {
    const r = state.result, st = r.stats, a = distributionAudit();
    const twin = state.settings.seatsPerDesk !== 1;
    const problems = [];
    if (state.stale) problems.push('Listeler ya da ayarlar değişti; yeniden dağıtım yapın');
    if (a.missing) problems.push(a.missing + ' öğrenci yerleşmedi');
    if (a.duplicates) problems.push(a.duplicates + ' öğrenci iki kez yerleşti');
    if (a.unexpected) problems.push(a.unexpected + ' seçilmemiş öğrenci yerleşti');
    if (a.capacityErrors) problems.push(a.capacityErrors + ' salonda kapasite aşıldı');
    if (st.deskmate) problems.push(st.deskmate + (twin ? ' sırada aynı düzeyden iki öğrenci var' : ' yerde aynı düzeyden öğrenciler yan yana'));
    if (st.frontBack) problems.push(st.frontBack + ' yerde aynı düzeyden öğrenciler önlü-arkalı');
    if (state.settings.avoidOwnRoom && st.ownRoom) problems.push(st.ownRoom + ' öğrenci kendi sınıfında');
    const ok = !problems.length;
    const main = ok
      ? `✓ ${a.placed} öğrencinin hepsi yerleşti · ${twin ? 'aynı sırada' : 'yan yana'} aynı düzey yok · önlü-arkalı aynı düzey yok`
      : '⚠ ' + problems.join(' · ');
    const info = [
      `<li>Yerleşen / beklenen öğrenci: <b>${a.placed} / ${a.expected}</b></li>`,
      `<li>Öğrenci tekrarı: <b>${a.duplicates ? a.duplicates : 'yok'}</b> · Salon kapasitesi: <b>${a.capacityErrors ? a.capacityErrors + ' salonda aşım' : 'uygun'}</b></li>`,
      `<li>Çapraz ya da koridorun karşısında aynı düzey: <b>${st.aisle + st.diagonal}</b> (sorun sayılmaz; mümkün olduğunca azaltılır)</li>`,
      `<li>Kendi sınıfında oturan öğrenci: <b>${st.ownRoom}</b>${state.settings.avoidOwnRoom ? '' : ' (izin veriliyor)'}</li>`,
      ...(r.warnings || []).filter((w) => !/aynı düzeyden iki öğrenci/.test(w)).map((w) => `<li>${esc(w)}</li>`),
    ];
    const rooms = a.rooms.filter((x) => x.deskmate || x.frontBack);
    return `<details class="status-bar ${ok ? 'ok' : 'warn'}"${ok ? '' : ' open'}>
      <summary><span class="status-main">${esc(main)}</span>${r.locked ? '<span class="status-lock">🔒 Kilitli</span>' : ''}<span class="status-more">Ayrıntılar</span></summary>
      <ul class="status-details">${info.join('')}
        ${rooms.length ? `<li>Komşuluk sorunu olan salonlar: ${rooms.map((x) => `<b>${esc(x.name)}</b> (yan yana ${x.deskmate}, önlü-arkalı ${x.frontBack})`).join(' · ')}</li>` : ''}
      </ul>
      <p class="status-code">${esc(distributionLabel())}</p>
    </details>`;
  }

  function auditHtml() {
    const a = distributionAudit();
    const good = !state.stale && !a.missing && !a.duplicates && !a.unexpected && !a.capacityErrors;
    const warnings = a.rooms.filter(r => r.deskmate || r.frontBack || r.aisle || r.diagonal);
    return `<section class="distribution-audit ${good ? 'valid' : 'attention'}" aria-label="Dağıtım kontrol özeti">
      <div class="audit-heading"><strong>Dağıtım kontrol özeti</strong><span>${state.result.locked ? 'Kilitli' : 'Düzenlemeye açık'}</span></div>
      <dl class="audit-readings">
        <div class="audit-placement"><dt>Yerleşen / beklenen öğrenci</dt><dd>${a.placed} <small>/ ${a.expected}</small></dd></div>
        <div class="${a.duplicates ? 'needs-check' : ''}"><dt>Öğrenci tekrarı</dt><dd>${a.duplicates ? a.duplicates + ' tekrarlı yerleşim' : 'Tekrar yok'}</dd></div>
        <div class="${a.capacityErrors ? 'needs-check' : ''}"><dt>Salon kapasitesi</dt><dd>${a.capacityErrors ? a.capacityErrors + ' salonda aşım' : 'Kapasite uygun'}</dd></div>
      </dl>
      ${a.missing || a.unexpected ? `<p class="audit-alert">Eksik öğrenci: ${a.missing} · Seçilmemiş öğrenci: ${a.unexpected}</p>` : ''}
      ${state.stale ? '<p class="audit-alert">Listeler veya ayarlar değişti. Yeniden dağıtım gerekli.</p>' : ''}
      ${warnings.length ? `<details><summary>Komşuluk uyarıları <b class="audit-badge">${warnings.length} salon</b></summary><ul>${warnings.map(r => `<li><b>${esc(r.name)}</b><span>Yan yana: ${r.deskmate} · Ön/arka: ${r.frontBack} · Çapraz/koridor: ${r.diagonal + r.aisle}</span></li>`).join('')}</ul></details>` : '<p>Aynı düzey komşuluk çakışması yok.</p>'}
      <p class="distribution-version">${esc(distributionLabel())}</p>
    </section>`;
  }
  function toggleDistributionLock() {
    if (!state.result) return;
    if (!state.result.locked) {
      if (!outputReady()) return;
      const a = distributionAudit();
      if (a.missing || a.duplicates || a.unexpected || a.capacityErrors) { toast('Önce dağıtım kontrolündeki veri veya kapasite sorunlarını giderin.'); return; }
    }
    const next = { ...state, result: { ...state.result, locked: !state.result.locked } };
    if (!save(next)) return;
    state = next; selectedSeat = null; renderResult();
    toast(state.result.locked ? 'Dağıtım kilitlendi. Yazdırma ve paylaşım açık.' : 'Dağıtım kilidi açıldı. Değişiklik yapabilirsiniz.');
  }

  function markStale() {
    if (state.result) state.stale = true;
  }

  // ---------- sınıf ekleme ----------
  function addParsedClass(name, students, source) {
    const existing = state.classes.find((c) => collator.compare(c.name, name) === 0);
    const mk = (s) => ({ id: uid('s'), no: s.no || '', name: s.name });
    if (existing) {
      const keys = new Set(existing.students.map((s) => s.no ? 'n' + s.no : 'a' + s.name.toLocaleUpperCase('tr-TR')));
      let added = 0;
      for (const s of students) {
        const k = s.no ? 'n' + s.no : 'a' + s.name.toLocaleUpperCase('tr-TR');
        if (keys.has(k)) continue;
        keys.add(k); existing.students.push(mk(s)); added++;
      }
      return { cls: existing, merged: true, added };
    }
    const cls = { id: uid('c'), name, students: students.map(mk), deskCols: null, source: source || '' };
    state.classes.push(cls);
    return { cls, merged: false, added: cls.students.length };
  }

  async function handleFiles(fileList) {
    if (!editAllowed()) return;
    const files = Array.from(fileList || []).filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    const log = $('#import-log');
    log.innerHTML = '';
    if (!files.length) { logLine('Yalnızca PDF dosyaları yüklenebilir.', 'bad'); return; }
    if (!window.pdfjsLib) { logLine('PDF okuyucu yüklenemedi. "vendor/pdfjs" klasörünün uygulamanın yanında olduğundan emin olun.', 'bad'); return; }
    for (const f of files) {
      const line = logLine(f.name + ' okunuyor…');
      try {
        const pages = await P.extractPdf(await f.arrayBuffer());
        const res = P.parsePages(pages, f.name);
        if (!res.textFound) {
          setLine(line, f.name + ': PDF içinde metin bulunamadı. Dosya taranmış (resim) olabilir; e-Okul\'dan PDF olarak yeniden alın ya da listeyi "Elle sınıf ekle" ile yapıştırın.', 'bad');
          continue;
        }
        if (!res.classes.length) {
          setLine(line, f.name + ': Öğrenci satırı bulunamadı. Listeyi "Elle sınıf ekle" ile yapıştırabilirsiniz.', 'warn');
          continue;
        }
        if (!editAllowed()) return;
        const parts = res.classes.map((c) => {
          const r = addParsedClass(c.name, c.students, f.name);
          return r.merged ? `${c.name} (mevcut listeye ${r.added} öğrenci eklendi)` : `${c.name}: ${r.added} öğrenci`;
        });
        if (res.usedFallback) {
          setLine(line, f.name + ' → ' + parts.join(', ') + '. Bu dosyada sınıf/şube adı bulunamadı; sınıf kartına tıklayıp adını düzeltin (ör. 9/A).', 'warn');
        } else {
          setLine(line, f.name + ' → ' + res.classes.length + ' şube: ' + parts.join(', '), 'ok');
        }
      } catch (e) {
        console.error(e);
        setLine(line, f.name + ': okunamadı (' + (e && e.message ? e.message : e) + ').', 'bad');
      }
    }
    sortClasses();
    markStale();
    save();
    renderAll();
  }
  function logLine(text, kind) {
    const d = document.createElement('div');
    d.className = 'log-item' + (kind ? ' ' + kind : '');
    d.textContent = text;
    $('#import-log').appendChild(d);
    return d;
  }
  function setLine(el, text, kind) { el.textContent = text; el.className = 'log-item' + (kind ? ' ' + kind : ''); }

  // ---------- yedek ----------
  function downloadFile(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function exportBackup() {
    const d = new Date();
    const stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const data = { app: 'kelebek-sinav', rulesVersion: RULES_VERSION, savedAt: d.toISOString(), ...state };
    downloadFile('kelebek-yedek-' + stamp + '.json', JSON.stringify(data, null, 1), 'application/json');
    toast('Yedek dosyası indirildi. Bu dosyayı saklayın.');
  }
  async function importBackup(file) {
    if (!editAllowed()) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.app !== 'kelebek-sinav') throw new Error('Bu dosya bir Kelebek yedeği değil.');
      const next = validateState(data);
      if (!editAllowed()) return;
      if (!save(next, true)) return;
      state = next;
      selectedSeat = null;
      archiveView = null;
      renderAll();
      toast(state.classes.length + ' şube ve ' + state.archive.length + ' kayıtlı sınav yedekten yüklendi.');
    } catch (e) {
      toast('Yedek yüklenemedi: ' + e.message);
    }
  }

  // ---------- örnek veri ----------
  function loadSample() {
    if (!editAllowed()) return;
    const ad = ['Ahmet', 'Ayşe', 'Mehmet', 'Zeynep', 'Mustafa', 'Elif', 'Emre', 'Merve', 'Yusuf', 'Büşra', 'Ömer', 'İrem', 'Kerem', 'Ece', 'Burak', 'Defne', 'Eren', 'Öykü', 'Çağan', 'Sude', 'Berk', 'Ilgın', 'Doğukan', 'Nazlı'];
    const soyad = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Öztürk', 'Aydın', 'Arslan', 'Doğan', 'Kılıç', 'Çetin', 'Koç', 'Kurt', 'Özkan', 'Polat', 'Güneş', 'Aksoy', 'Ünal', 'Işık'];
    const rnd = A.mulberry32(7);
    const spec = [['9/A', 30], ['9/B', 28], ['10/A', 32], ['10/B', 27], ['11/A', 31], ['12/A', 26]];
    let no = 100;
    for (const [name, n] of spec) {
      const st = [];
      for (let i = 0; i < n; i++) {
        no += 1 + Math.floor(rnd() * 7);
        st.push({ no: String(no), name: ad[Math.floor(rnd() * ad.length)] + ' ' + soyad[Math.floor(rnd() * soyad.length)] });
      }
      addParsedClass(name + ' (örnek)', st, 'örnek');
    }
    sortClasses();
    markStale();
    save();
    renderAll();
    toast('6 örnek sınıf eklendi. İsimler hayalidir.');
  }

  // ---------- 1. sınıf listesi ----------
  function renderClasses() {
    const list = $('#class-list');
    const sum = $('#class-summary');
    $('#btn-clear').hidden = state.classes.length === 0;
    $('#nav-classes').textContent = state.classes.length ? String(state.classes.length) : '';
    $('#nav-classes').title = state.classes.length ? state.classes.length + ' şube' : '';
    if (!state.classes.length) {
      list.innerHTML = '<div class="empty" style="grid-column:1/-1">Henüz sınıf yok. PDF yükleyin ya da “Örnek listelerle dene” ile uygulamayı tanıyın.</div>';
      sum.innerHTML = '';
      renderStudentDelete();
      return;
    }
    const all = state.classes.filter((c) => c.students.length > 0);
    const total = all.reduce((a, c) => a + c.students.length, 0);
    const groups = byLevel(state.classes);
    sum.innerHTML = `<span><strong>${groups.length}</strong> sınıf düzeyi</span>` +
      `<span><strong>${state.classes.length}</strong> şube</span>` +
      `<span><strong>${total}</strong> öğrenci</span>` +
      `<span>Bir şubeye tıklayarak listesini kontrol edin ve düzeltin.</span>`;
    list.innerHTML = groups.map((g) => `
      <div class="level-group">
        <h3 class="level-title">${esc(g.label)} <span>${g.classes.length} şube · ${g.classes.reduce((a, c) => a + c.students.length, 0)} öğrenci</span></h3>
        <div class="class-grid">${g.classes.map((c) => `
          <button type="button" class="class-card${c.students.length ? '' : ' off'}" data-id="${esc(c.id)}" style="--h:${levelHue(c.name)}">
            <span class="sw"></span>
            <span class="nm">${esc(c.name)}</span>
            <span class="ct"><b>${c.students.length}</b> öğrenci</span>
          </button>`).join('')}
        </div>
      </div>`).join('');
    renderPicker();
    renderStudentDelete();
  }

  /** 3. adım: dağıtıma girecek şubeleri elle seçme */
  function renderPicker() {
    const box = $('#picker');
    const groups = byLevel(state.classes.filter((c) => c.students.length > 0));
    if (!groups.length) { box.innerHTML = ''; renderSessionPanel(); return; }
    const ses = activeSession();
    const inc = included();
    const total = inc.reduce((a, c) => a + c.students.length, 0);
    box.innerHTML = `
      <div class="pick-head">
        <strong>Öğrencileri sınava girecek şubeler</strong>
        <span class="hint">${inc.length} şube seçili · ${total} öğrenci</span>
        <span class="spacer"></span>
        <button type="button" class="btn ghost small" data-pick="all">Tümünü seç</button>
        <button type="button" class="btn ghost small" data-pick="none">Hiçbirini seçme</button>
      </div>
      ${groups.map((g) => {
        const on = g.classes.filter((c) => c.selected !== false).length;
        return `<div class="pick-row">
          <label class="pick-level"><input type="checkbox" data-pick-level="${esc(g.level)}" ${on === g.classes.length ? 'checked' : ''} ${on > 0 && on < g.classes.length ? 'data-mixed="1"' : ''}> ${esc(g.label)}</label>
          <div class="pick-classes">${g.classes.map((c) => `
            <label class="pick-chip${ses && !examOf(c, ses) ? ' no-exam' : ''}" style="--h:${levelHue(c.name)}"${ses ? ` title="${esc(examOf(c, ses) || 'Bu oturumda sınavı yok')}"` : ''}><input type="checkbox" data-pick-class="${esc(c.id)}" ${c.selected !== false ? 'checked' : ''}> ${esc(c.name)}${ses ? ` <small>${esc(examOf(c, ses) || 'sınav yok')}</small>` : ''}</label>`).join('')}
          </div>
        </div>`;
      }).join('')}`;
    box.querySelectorAll('[data-mixed]').forEach((el) => { el.indeterminate = true; });
    renderSessionPanel();
    renderRoomPicker();
    renderCapacity();
  }

  // ---------- salon kapasitesi ----------
  const isCustomCap = () => state.settings.capacityMode === 'custom';
  function capOf(c) {
    if (!isCustomCap() || c.roomCap == null || c.roomCap === '') return c.students.length;
    return Math.max(0, Math.floor(Number(c.roomCap)) || 0);
  }
  /** Sınav salonu olarak kullanılacak sınıflar (öğrencilerinin sınava girmesinden bağımsız). */
  function roomClasses() { return state.classes.filter((c) => c.students.length > 0 && c.useAsRoom !== false && !roomBlocked(c)); }
  function capTotals() {
    const inc = included();
    const rooms = roomClasses();
    return { seats: rooms.reduce((a, c) => a + capOf(c), 0), students: inc.reduce((a, c) => a + c.students.length, 0), rooms: rooms.filter((c) => capOf(c) > 0).length };
  }

  let roomsOpen = false;
  function renderRoomPicker() {
    const box = $('#rooms-picker');
    const all = state.classes.filter((c) => c.students.length > 0);
    if (!all.length) { box.innerHTML = ''; return; }
    const on = roomClasses();
    const inc = included();
    const onIds = new Set(on.map((c) => c.id));
    const same = on.length === inc.length && inc.every((c) => onIds.has(c.id));
    const blockedN = all.filter((c) => roomBlocked(c)).length;
    const lockNote = blockedN ? ` · <span class="rooms-locked">🔒 sınavı olmayan ${blockedN} sınıf salon değil</span>` : '';
    const summary = (same
      ? `Salonlar: <b>sınava girenlerle aynı</b> (${on.length} salon)`
      : `Salonlar: <b>${on.length} salon seçildi</b>${inc.filter((c) => !onIds.has(c.id)).length ? ' · salon olmayan: ' + esc(inc.filter((c) => !onIds.has(c.id)).map((c) => c.name).join(', ')) : ''}${on.filter((c) => !inc.includes(c)).length ? ' · ek salon: ' + esc(on.filter((c) => !inc.includes(c)).map((c) => c.name).join(', ')) : ''}`) + lockNote;
    if (!roomsOpen) {
      box.className = 'picker rooms-picker closed no-print';
      box.innerHTML = `<div class="rooms-summary"><span class="rooms-icon" aria-hidden="true">🚪</span><strong>Sınav salonları</strong><span class="rooms-text">${summary}</span><span class="spacer"></span><button type="button" class="btn small" data-rooms-toggle="1">Değiştir</button></div>`;
      return;
    }
    box.className = 'picker rooms-picker open no-print';
    box.innerHTML = `
      <div class="pick-head">
        <span class="rooms-icon" aria-hidden="true">🚪</span><strong>Sınav salonları</strong>
        <span class="hint">Öğrencilerin oturacağı sınıfları seçin. Seçmediğiniz sınıfa öğrenci oturtulmaz; o şubenin öğrencileri yine sınava girer ve başka salonlara dağıtılır.</span>
        <span class="spacer"></span>
        <button type="button" class="btn ghost small" data-room-pick="all">Tümünü seç</button>
        <button type="button" class="btn ghost small" data-room-pick="same">Sınava girenlerle aynı</button>
        <button type="button" class="btn small" data-rooms-toggle="1">Kapat</button>
      </div>
      <div class="room-tiles">${byLevel(all).map((g) => `
        <div class="room-group"><span class="room-group-h">${esc(g.label)}</span>
          ${g.classes.map((c) => roomBlocked(c)
            ? `<div class="room-tile blocked"><span class="room-name">🔒 ${esc(c.name)}</span><small>Bu oturumda sınavı yok</small><button type="button" class="btn small" data-approve-room="${esc(c.id)}">Onay ver, salon yap</button></div>`
            : `<label class="room-tile${c.useAsRoom !== false ? ' on' : ''}${approvedRoom(c) ? ' approved' : ''}"><input type="checkbox" data-room-class="${esc(c.id)}" ${c.useAsRoom !== false ? 'checked' : ''}><span class="room-name">${esc(c.name)}</span><small>${c.students.length} koltuk${approvedRoom(c) ? ' · onaylı' : ''}</small>${approvedRoom(c) ? `<button type="button" class="btn ghost small" data-unapprove-room="${esc(c.id)}">Onayı kaldır</button>` : ''}</label>`).join('')}
        </div>`).join('')}
      </div>
      <p class="hint rooms-foot">${summary}</p>`;
  }
  function capSummaryHtml() {
    const t = capTotals();
    const diff = t.seats - t.students;
    const kind = diff < 0 ? 'bad' : diff > 0 ? 'warn' : 'ok';
    const msg = diff < 0 ? `${-diff} öğrenci için yer yok. Daha fazla salon seçin ya da “Salon mevcudunu ben belirleyeceğim” ile kapasiteyi artırın.`
      : diff > 0 ? `${diff} koltuk boş kalacak. Boş koltuklar aynı düzeydeki öğrencileri ayırmak için kullanılır.`
      : 'Koltuk sayısı öğrenci sayısına eşit.';
    return `<span class="pill ${kind}">Toplam koltuk: <b>${t.seats}</b></span><span class="pill">Öğrenci: <b>${t.students}</b></span><span class="pill">Salon: <b>${t.rooms}</b></span><span class="cap-msg ${kind}">${msg}</span>`;
  }
  function renderCapacity() {
    const box = $('#capacity');
    const inc = included();
    if (!inc.length) { box.innerHTML = ''; return; }
    const custom = isCustomCap();
    let html = `
      <div class="pick-head"><strong>Salon kapasitesi</strong>
        <span class="hint">${custom ? 'Salonlara sizin yazdığınız sayıda öğrenci oturacak.' : 'Şu an: her salona sınıf mevcudu kadar öğrenci oturur (varsayılan kural).'}</span></div>
      <label class="check cap-toggle"><input type="checkbox" id="cap-custom" ${custom ? 'checked' : ''}>
        <span><b>Salon mevcudunu ben belirleyeceğim</b><br><span class="hint">İşaretlemezseniz önceki kural geçerlidir: her şube salonuna o şubenin mevcudu kadar öğrenci oturur. İşaretlerseniz her salona kaç öğrenci oturacağını siz yazarsınız; 0 yazdığınız sınıf salon olarak kullanılmaz.</span></span></label>`;
    if (custom) {
      html += `
      <div class="cap-all">
        <label for="cap-all-n">Tüm salonlara</label>
        <input type="number" id="cap-all-n" min="0" max="200" inputmode="numeric" placeholder="Örn. 30">
        <button type="button" class="btn small" id="cap-all-btn">Uygula</button>
        <button type="button" class="btn ghost small" id="cap-reset">Mevcutlara döndür</button>
      </div>
      ${byLevel(roomClasses()).map((g) => `<div class="cap-row">
        <span class="pick-level">${esc(g.label)}</span>
        <div class="cap-items">${g.classes.map((c) => `
          <label class="cap-item" style="--h:${levelHue(c.name)}"><span>${esc(c.name)}</span>
            <input type="number" min="0" max="200" inputmode="numeric" data-cap="${esc(c.id)}" value="${capOf(c)}" aria-label="${esc(c.name)} salon kapasitesi">
            <small>mevcut ${c.students.length}</small></label>`).join('')}
        </div>
      </div>`).join('')}`;
    }
    html += `<div class="cap-sum" id="cap-sum">${capSummaryHtml()}</div>`;
    box.innerHTML = html;
  }

  // ---------- düzenleyici ----------
  let editing = null; // {id|null, rows:[{id,no,name}]}
  function openEditor(id) {
    if (!editAllowed()) return;
    $('#e-delete').dataset.confirm = ''; $('#e-delete').textContent = 'Sınıfı sil';
    const c = id ? state.classes.find((x) => x.id === id) : null;
    editing = { id: c ? c.id : null, rows: c ? c.students.map((s) => ({ ...s })) : [] };
    $('#editor-title').textContent = c ? 'Sınıfı düzenle' : 'Yeni sınıf';
    $('#e-name').value = c ? c.name : '';
    $('#e-cols').value = c && c.deskCols ? String(c.deskCols) : '';
    $('#e-delete').hidden = !c;
    $('#e-paste').value = '';
    renderEditorRows();
    const dlg = $('#editor');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    if (!c) $('#e-name').focus();
  }
  function closeEditor() {
    const dlg = $('#editor');
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
    editing = null;
  }
  function renderEditorRows() {
    $('#e-rows').innerHTML = editing.rows.map((s, i) => `
      <tr data-i="${i}">
        <td>${i + 1}</td>
        <td><input type="text" data-f="name" value="${esc(s.name)}" aria-label="Adı soyadı"></td>
        <td><button type="button" class="btn small danger" data-del="${i}" aria-label="${esc(s.name)} öğrencisini sil">Sil</button></td>
      </tr>`).join('') || '<tr><td colspan="3" class="hint">Liste boş. Öğrenci ekleyin ya da metin yapıştırın.</td></tr>';
  }
  function syncEditorInputs() {
    document.querySelectorAll('#e-rows tr[data-i]').forEach((tr) => {
      const r = editing.rows[+tr.dataset.i];
      tr.querySelectorAll('input').forEach((inp) => { r[inp.dataset.f] = inp.value.trim(); });
    });
  }
  function saveEditor() {
    if (!editAllowed()) return;
    syncEditorInputs();
    const name = $('#e-name').value.trim();
    if (!name) { $('#e-name').focus(); toast('Sınıf adını yazın.'); return; }
    const dup = state.classes.find((c) => c.id !== editing.id && collator.compare(c.name, name) === 0);
    if (dup) { toast('“' + name + '” adında başka bir sınıf var.'); return; }
    const students = editing.rows.filter((r) => r.name).map((r) => ({ id: r.id || uid('s'), no: r.no || '', name: r.name }));
    const cols = $('#e-cols').value ? parseInt($('#e-cols').value, 10) : null;
    const before = JSON.parse(JSON.stringify(state));
    if (editing.id) {
      const c = state.classes.find((x) => x.id === editing.id);
      c.name = name; c.students = students; c.deskCols = cols;
    } else {
      state.classes.push({ id: uid('c'), name, students, deskCols: cols, source: 'elle' });
    }
    sortClasses();
    markStale();
    if (!save()) { state = before; return; }
    closeEditor();
    renderAll();
  }
  function deleteClassFromEditor() {
    if (!editAllowed()) return;
    const btn = $('#e-delete');
    if (btn.dataset.confirm !== '1') {
      btn.dataset.confirm = '1';
      btn.textContent = 'Silmek için tekrar tıklayın';
      setTimeout(() => { btn.dataset.confirm = ''; btn.textContent = 'Sınıfı sil'; }, 3000);
      return;
    }
    btn.dataset.confirm = ''; btn.textContent = 'Sınıfı sil';
    const before = state;
    state = { ...state, classes: state.classes.filter((c) => c.id !== editing.id) };
    markStale();
    if (!save()) { state = before; return; }
    closeEditor();
    renderAll();
  }

  // ---------- 2. ayarlar ----------
  function renderSettings() {
    const s = state.settings;
    $('#s-school').value = s.school;
    const examSelect = $('#s-exam');
    examSelect.querySelectorAll('[data-legacy]').forEach((el) => el.remove());
    if (s.exam && !Array.from(examSelect.options).some((o) => o.value === s.exam)) {
      const option = document.createElement('option'); option.value = s.exam;
      option.textContent = s.exam + ' (önceki kayıt)'; option.dataset.legacy = '1'; examSelect.appendChild(option);
    }
    $('#s-exam').value = s.exam;
    $('#s-lesson').value = s.lesson || '';
    $('#s-header-note').value = s.headerNote || '';
    $('#s-date').value = s.date;
    $('#s-time').value = s.time;
    $('#s-cols').value = String(s.deskCols);
    $('#s-spd').value = String(s.seatsPerDesk);
    $('#s-sides').value = s.sideNames || 'lr';
    $('#s-duplex').checked = s.duplex !== false;
    $('#s-theme').value = s.docTheme || 'kurumsal';
    $('#s-own').checked = !!s.avoidOwnRoom;
    const sf = $('#session-field');
    if (sf) { sf.hidden = !state.calendar; $('#s-session').innerHTML = sessionOptions(s.sessionId); $('#s-session').value = s.sessionId || ''; }
    renderThemePreview();
    renderCalendar();
  }
  function readSettings(ev) {
    if (!editAllowed()) { renderSettings(); return; }
    if ($('#s-session') && state.calendar && ($('#s-session').value || '') !== (state.settings.sessionId || '')) {
      if (ev && ev.type === 'change') applySession($('#s-session').value);
      return;
    }
    const previousSettings = JSON.stringify(state.settings);
    const previousState = JSON.parse(JSON.stringify(state));
    const s = state.settings;
    const before = JSON.stringify([s.deskCols, s.seatsPerDesk, s.avoidOwnRoom]);
    s.school = $('#s-school').value.trim();
    s.exam = $('#s-exam').value.trim();
    s.lesson = $('#s-lesson').value;
    s.headerNote = $('#s-header-note').value.trim().slice(0, 160);
    s.date = $('#s-date').value;
    s.time = $('#s-time').value;
    s.deskCols = parseInt($('#s-cols').value, 10) || 3;
    s.seatsPerDesk = parseInt($('#s-spd').value, 10) === 1 ? 1 : 2;
    s.sideNames = $('#s-sides').value || 'lr';
    s.duplex = $('#s-duplex').checked;
    s.docTheme = $('#s-theme').value || 'kurumsal';
    s.avoidOwnRoom = $('#s-own').checked;
    if (JSON.stringify([s.deskCols, s.seatsPerDesk, s.avoidOwnRoom]) !== before) markStale();
    if (state.result && previousSettings !== JSON.stringify(s)) stampResult(state.result);
    if (!save()) { state = previousState; renderSettings(); return; }
    if (ev && ev.type === 'change') renderResult();
    else { renderReportOnly(); updateReminder(); }
    renderThemePreview();
  }

  // ---------- 3. dağıtım ----------
  function runDistribution() {
    if (!editAllowed()) return;
    const inc = included();
    const ses = activeSession();
    if (!inc.length) { toast(!state.classes.length ? 'Önce sınıf listelerini yükleyin.' : ses ? 'Bu oturumda sınavı olan şube seçili değil.' : 'Dağıtıma girecek en az bir şube seçin.'); return; }
    try {
      const t = capTotals();
      if (t.seats < t.students) {
        toast(`Salonlar yetmiyor: ${t.students} öğrenci için ${t.seats} koltuk var.` + (ses ? ' Sınavı olmayan sınıflar onayınız olmadan salon yapılmaz; Dağıtım sayfasındaki takvim panelinden onay verebilirsiniz.' : ' Daha fazla salon seçin ya da salon mevcudunu artırın.'));
        renderSessionPanel();
        return;
      }
      const rooms = roomClasses().map((c) => ({ id: c.id, name: c.name, deskCols: c.deskCols, capacity: capOf(c) }));
      if (!rooms.some((x) => x.capacity > 0)) { toast('Sınav salonu olarak en az bir sınıf seçin.'); return; }
      const r = A.distribute(inc, {
        rooms,
        capacityMode: state.settings.capacityMode,
        deskCols: state.settings.deskCols,
        seatsPerDesk: state.settings.seatsPerDesk,
        avoidOwnRoom: state.settings.avoidOwnRoom,
      });
      if (ses) {
        r.sessionId = ses.id;
        r.subjects = {};
        for (const c of inc) if (examOf(c, ses)) r.subjects[c.id] = examOf(c, ses);
        for (const x of calendarIssues(ses)) if (x.level !== 'info') r.warnings.push(/^Takvim/.test(x.text) ? x.text : 'Takvim: ' + x.text);
      }
      stampResult(r, true); r.locked = false;
      const next = { ...state, result: r, stale: false };
      if (!save(next)) return;
      state = next;
      selectedSeat = null;
      renderResult();
      showPage('plan');
      const calWarn = ses ? calendarIssues(ses).filter((x) => x.level === 'warn').length : 0;
      toast(inc.reduce((a, c) => a + c.students.length, 0) + ' öğrenci ' + r.rooms.length + ' salona yerleştirildi.' + (calWarn ? ' Takvim denetiminde ' + calWarn + ' uyarı var; durum çubuğunda görebilirsiniz.' : ''));
    } catch (e) {
      console.error(e);
      toast('Dağıtım yapılamadı: ' + e.message);
    }
  }

  /** Sonuçtaki öğrenciler hâlâ listelerde var mı? */
  function resultValid() {
    const r = state.result;
    if (!r) return false;
    const si = studentIndex();
    const seen = new Set(), roomIds = new Set(state.classes.map((c) => c.id));
    return r.rooms.every((room) => roomIds.has(room.roomId) && room.seats.every((s) => {
      if (s.empty) return true;
      const record = si.get(s.studentId);
      if (!record || record.c.id !== s.classId || seen.has(s.studentId)) return false;
      seen.add(s.studentId); return true;
    }));
  }
  function outputReady() {
    if (!resultValid()) { toast('Geçerli bir dağıtım yok. Yeniden dağıtım yapın.'); return false; }
    if (state.stale) { toast('Listeler veya ayarlar değişti. İşlemden önce yeniden dağıtım yapın.'); return false; }
    return true;
  }

  function recomputeStats() {
    const r = state.result;
    const inc = state.classes;
    r.stats = A.evaluate(r.rooms, inc, { cols: state.settings.deskCols, spd: state.settings.seatsPerDesk });
  }

  function updateReminder() {
    const miss = [!state.settings.exam && 'sınav adı', !state.settings.date && 'tarih'].filter(Boolean);
    const rem = $('#exam-reminder');
    rem.hidden = !miss.length || isReportPage(page);
    if (miss.length) rem.innerHTML = `${esc(miss.join(' ve ').replace(/^./, (c) => c.toLocaleUpperCase('tr-TR')))} girilmedi; çıktılarda görünmeyecek. <button type="button" class="link-btn" data-open-quick-exam="1">Sınav bilgilerini gir</button>`;
  }

  function renderResult() {
    const r = state.result;
    const has = !!r && resultValid();
    $('#btn-lock').hidden = !r;
    $('#btn-lock').textContent = r && r.locked ? '🔓 Dağıtım kilidini aç' : '🔒 Dağıtımı kilitle';
    $('#more-menu').hidden = !has;
    $('#btn-lock').classList.toggle('is-locked', !!(r && r.locked));
    $('#btn-lock').setAttribute('aria-pressed', String(!!(r && r.locked)));
    $('#btn-view-result').hidden = !has;
    $('#btn-print').hidden = !has;
    $('#btn-pack').hidden = !has;
    $('#btn-csv').hidden = !has;
    $('#btn-save').hidden = !has;
    $('#tabs').hidden = !has;
    $('#nav-result').textContent = has ? '✓' : '';
    $('#nav-result').title = has ? 'Dağıtım hazır' : '';
    $('#btn-run').textContent = has ? 'Yeniden karıştır ve dağıt' : 'Kelebek dağıtımını yap';
    updateReminder();
    const status = $('#result-status');
    if (!has) {
      status.innerHTML = r ? '<div class="log-item warn">Listelerde değişiklik yapıldığı için önceki dağıtım geçersiz. Yeniden dağıtım yapın.</div>' : '';
      $('#report').innerHTML = state.classes.length
        ? '<div class="empty">Listeler hazır olduğunda “Kelebek dağıtımını yap” düğmesine basın.</div>'
        : '<div class="empty">Dağıtım için önce sınıf listelerini yükleyin.</div>';
      return;
    }
    status.innerHTML = statusBarHtml();
    document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === view)));
    renderReportOnly();
  }

  /** Belgenin sınav bilgileri (boş olanlar yazılmaz). */
  function headerMeta(s = state.settings, result = state.result) {
    const date = s.date ? fmtDay(parseDay(s.date), { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }) : '';
    const subs = result && result.subjects ? [...new Set(Object.keys(result.subjects).map((k) => result.subjects[k]))] : [];
    const fields = [['Sınav', s.exam], ['Tarih', date], ['Saat', s.time], ['Ders', s.lesson && s.lesson + '. ders'], ['Sınav dersi', subs.length === 1 ? subs[0] : '']].filter(([, v]) => v);
    if (!fields.length && !s.headerNote) return '<div class="exam-identity empty-identity"></div>';
    return `<div class="exam-identity">
      ${fields.length ? `<dl class="doc-facts">${fields.map(([label, value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>` : ''}
      ${s.headerNote ? `<div class="identity-note">${esc(s.headerNote)}</div>` : ''}
    </div>`;
  }

  function renderReportOnly() {
    const r = state.result;
    if (!r || !resultValid()) return;
    const el = $('#report');
    if (view === 'plan') el.innerHTML = renderPlans();
    else if (view === 'yoklama') el.innerHTML = renderRoll();
    else if (view === 'sinif') el.innerHTML = renderByClass();
    else if (view === 'evrak') el.innerHTML = renderPapers();
    else el.innerHTML = renderSearch();
    if (view === 'ara') {
      const inp = $('#q');
      inp.addEventListener('input', () => { $('#q-out').innerHTML = searchRows(inp.value); });
      inp.focus();
    }
  }

  function roomTitle(room, ci) {
    const rc = ci.get(room.roomId);
    return rc ? rc.c.name : room.name;
  }

  /**
   * Kurumsal belge başlığı: üstte antet (okul adı), altında belge adı ve sınav
   * bilgileri; sayfanın en altında belge numarası. Bütün çıktılar bunu kullanır.
   */
  function sheetHead(scope, title, ri, kind, buttonLabel = 'Yazdır') {
    const st = state.settings;
    return `<header class="doc-head">
      <div class="doc-letterhead">
        <div class="doc-org">${st.school ? esc(st.school) : 'Sınav Evrakı'}</div>
        <div class="doc-unit">${st.school ? 'Sınav Evrakı' : 'Kelebek Sınav Dağıtımı'}</div>
      </div>
      <div class="doc-titlebar">
        <div class="doc-title"><span class="doc-kicker">${esc(scope)}</span><h3>${esc(title)}</h3></div>
        ${headerMeta()}
      </div>
      <div class="sheet-tools"><button type="button" class="btn small" data-print-${kind}="${esc(ri)}">${esc(buttonLabel)}</button></div>
    </header>${state.result ? `<footer class="sheet-code"><span>Belge No: ${esc(distributionLabel())}</span><span>Kelebek Sınav Dağıtım Sistemi</span></footer>` : ''}`;
  }
  /** Düzenleyen / onaylayan imza alanı. */
  function approvalBlock(left = 'Düzenleyen', right = 'Onaylayan') {
    return `<div class="doc-approval">${[left, right].map((t) => `<div><span class="doc-approval-t">${esc(t)}</span><span class="doc-approval-line">Adı Soyadı</span><span class="doc-approval-line">İmza</span></div>`).join('')}</div>`;
  }

  // ---------- çıktı tasarımı önizlemesi ----------
  /**
   * Seçilen çıktı tasarımını hayali bir salonla gösterir. Gerçek çıktıların
   * oluşturulduğu işlevler (renderPlans, renderRoll) kullanılır; böylece önizleme
   * yazdırılacak kâğıtla birebir aynı düzendedir. Kayıtlı veriye dokunmaz.
   */
  const PREVIEW_NAMES = ['Elif Yıldız', 'Kerem Aydın', 'Zeynep Kaya', 'Emre Doğan', 'Defne Çelik', 'Yusuf Arslan',
    'Ece Şahin', 'Burak Koç', 'Nazlı Polat', 'Ömer Kurt', 'Duru Aksoy', 'Efe Güneş'];
  function previewState(base) {
    const names = ['9/A', '10/B', '11/C'];
    const classes = names.map((name, i) => ({ id: 'onizleme-' + i, name, students: [], selected: true }));
    const order = [0, 1, 2, 0, 1, 2, 2, 0, 1, 2, 0, 1]; // sıra arkadaşları farklı düzeyde
    const seats = order.map((k, i) => {
      const stu = { id: 'onizleme-s' + i, name: PREVIEW_NAMES[i] };
      classes[k].students.push(stu);
      return { studentId: stu.id, classId: classes[k].id, seatNo: i + 1 };
    });
    const st = base.settings;
    return {
      classes,
      settings: { ...st,
        school: st.school || 'Örnek Anadolu Lisesi',
        exam: st.exam || '1. Dönem 1. Ortak Yazılı',
        date: st.date || '2026-11-12', time: st.time || '10:40', lesson: st.lesson || '3' },
      result: { rooms: [{ roomId: classes[0].id, name: names[0], cols: 3, spd: 2, seats }],
        distributionId: 'D-ORNEK', revision: 1, updatedAt: '2026-11-04T09:00:00.000Z' },
      stale: false, archive: [],
    };
  }
  function renderThemePreview() {
    const box = $('#theme-preview');
    if (!box) return;
    const theme = ($('#s-theme') && $('#s-theme').value) || state.settings.docTheme || 'kurumsal';
    const saved = state, savedSel = selectedSeat;
    let pages;
    try {
      state = previewState(saved); selectedSeat = null;
      pages = [['Oturma planı', renderPlans()], ['İmza listesi', renderRoll()]];
    } catch (e) {
      pages = [];
    } finally { state = saved; selectedSeat = savedSel; }
    box.innerHTML = pages.map(([label, html]) => `<figure class="tp-item">
        <div class="tp-paper"><div class="tp-scale"><div class="pack-out tp-doc" data-doc-theme="${esc(theme)}">${html}</div></div></div>
        <figcaption>${esc(label)}</figcaption>
      </figure>`).join('');
    fitThemePreview();
  }
  /** Önizleme kâğıtlarını kutunun genişliğine göre küçültür. */
  function fitThemePreview() {
    document.querySelectorAll('#theme-preview .tp-paper').forEach((paper) => {
      const inner = paper.querySelector('.tp-scale');
      const w = paper.clientWidth;
      if (!w || !inner) return;
      const z = w / inner.offsetWidth;
      inner.style.transform = 'scale(' + z + ')';
      // Sayfanın boş alt kısmını göstermeden içerik kadar yükseklik (en çok A4)
      const h = Math.min(inner.offsetWidth * 297 / 210, inner.offsetHeight + 12);
      paper.style.height = Math.round(h * z) + 'px';
    });
  }

  /** Oturma planı: her koltukta yalnızca öğrencinin adı ve sınıfı. */
  function renderPlans() {
    const r = state.result;
    const ci = classIndex();
    const si = studentIndex();
    return r.rooms.map((room, ri) => {
      const desks = [];
      const spd = room.spd;
      const nDesks = Math.ceil(room.seats.length / spd);
      for (let d = 0; d < nDesks; d++) {
        const cells = [];
        for (let k = 0; k < spd; k++) {
          const idx = d * spd + k;
          const seat = room.seats[idx];
          if (!seat) { cells.push('<span class="seat empty-seat"></span>'); continue; }
          if (seat.empty) {
            const isSelE = selectedSeat && selectedSeat.roomIdx === ri && selectedSeat.seatIdx === idx;
            cells.push(`<button type="button" class="seat vacant${isSelE ? ' sel' : ''}" data-room="${ri}" data-seat="${idx}"><span class="who">Boş</span><span class="sno">${seat.seatNo}</span></button>`);
            continue;
          }
          const stu = si.get(seat.studentId);
          const c = ci.get(seat.classId);
          const isSel = selectedSeat && selectedSeat.roomIdx === ri && selectedSeat.seatIdx === idx;
          cells.push(`<button type="button" class="seat${isSel ? ' sel' : ''}" style="--h:${levelHue(c.c.name)}" data-room="${ri}" data-seat="${idx}">
            <span class="who">${esc(stu.s.name)}</span>
            <span class="cls">${esc(c.c.name)}</span>
            <span class="sno" aria-label="Sıra no">${seat.seatNo}</span>
          </button>`);
        }
        desks.push(`<div class="desk${spd === 2 ? ' spd2' : ''}">${cells.join('')}</div>`);
      }
      // Sıra grubu başlıkları ve önden sıra numaraları
      const names = groupNames(room.cols);
      const gridCells = ['<span class="plan-corner"></span>'].concat(names.map((n) => `<span class="col-label">${esc(n)}</span>`));
      const rowsN = Math.ceil(desks.length / room.cols);
      for (let rr = 0; rr < rowsN; rr++) {
        gridCells.push(`<span class="row-label">${rr + 1}. sıra</span>`);
        for (let cc = 0; cc < room.cols; cc++) gridCells.push(desks[rr * room.cols + cc] || '<span></span>');
      }
      return `<article class="sheet" data-fit-one="1" data-room="${ri}">
        ${sheetHead('Sınav salonu · ' + roomTitle(room, ci), 'Oturma planı', ri, 'room')}
        ${roomCountsLine(room)}
        <div class="plan-scroll">
          <div class="board">Yazı tahtası · öğretmen masası</div>
          <div class="desks" style="grid-template-columns:auto repeat(${room.cols}, minmax(0,1fr))">${gridCells.join('')}</div>
        </div>
      </article>`;
    }).join('');
  }

  // ---------- sınav kâğıdı dağıtımı ----------
  /** Salondaki öğrencileri düzey ve şubeye göre sayar. */
  function roomCounts(room) {
    const ci = classIndex();
    const byClass = new Map();
    for (const s of room.seats) {
      if (s.empty || !s.classId) continue;
      byClass.set(s.classId, (byClass.get(s.classId) || 0) + 1);
    }
    const levels = new Map();
    for (const [id, n] of byClass) {
      const c = ci.get(id).c;
      const lv = A.levelOf(c.name);
      if (!levels.has(lv)) levels.set(lv, { level: lv, total: 0, classes: [] });
      const L = levels.get(lv);
      L.total += n;
      L.classes.push({ id, name: c.name, n });
    }
    const list = [...levels.values()].sort((a, b) => collator.compare(a.level, b.level));
    for (const L of list) L.classes.sort((a, b) => collator.compare(a.name, b.name));
    return { levels: list, total: list.reduce((a, L) => a + L.total, 0) };
  }
  const levelLabel = (lv) => (/^\d+$/.test(lv) ? lv + '. sınıf' : lv);

  /** Plan ve yoklama sayfalarının üstündeki kısa özet. */
  function roomCountsLine(room) {
    const rc = roomCounts(room);
    return `<div class="counts-line"><span class="counts-title">Bu salonda</span>${rc.levels.map((L) =>
      `<span class="chip" style="--h:${levelHue(L.classes[0].name)}"><b>${esc(levelLabel(L.level))}: ${L.total}</b>${L.classes.length > 1 || L.classes[0].name !== L.level ? ' (' + L.classes.map((c) => esc(c.name) + ' ' + c.n).join(', ') + ')' : ''}</span>`).join('')}
      <span class="counts-total">Toplam <b>${rc.total}</b> öğrenci</span></div>`;
  }

  /** Tüm salonlar için kâğıt dağıtım tablosu ve salon zarfı etiketleri. */
  function renderPapers(part) {
    const r = state.result;
    const ci = classIndex();
    const rooms = r.rooms.map((room, ri) => ({ room, ri, rc: roomCounts(room), title: roomTitle(room, ci) }));
    // Sütunlar: düzeyler ve altındaki şubeler
    const levelMap = new Map();
    for (const x of rooms) for (const L of x.rc.levels) {
      if (!levelMap.has(L.level)) levelMap.set(L.level, new Map());
      for (const c of L.classes) levelMap.get(L.level).set(c.id, c.name);
    }
    const levels = [...levelMap.entries()].sort((a, b) => collator.compare(a[0], b[0]))
      .map(([lv, m]) => ({ lv, classes: [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => collator.compare(a.name, b.name)) }));
    const cell = (x, id) => {
      for (const L of x.rc.levels) for (const c of L.classes) if (c.id === id) return c.n;
      return 0;
    };
    const lvTotal = (x, lv) => (x.rc.levels.find((L) => L.level === lv) || { total: 0 }).total;
    const colTotal = (id) => rooms.reduce((a, x) => a + cell(x, id), 0);
    const lvColTotal = (lv) => rooms.reduce((a, x) => a + lvTotal(x, lv), 0);
    const grand = rooms.reduce((a, x) => a + x.rc.total, 0);

    const levelTable = `<div class="table-scroll"><table class="list matrix">
      <thead><tr><th>Sınav salonu</th>${levels.map((L) => `<th class="num">${esc(levelLabel(L.lv))}</th>`).join('')}<th class="num">Toplam</th></tr></thead>
      <tbody>${rooms.map((x) => `<tr><td><b>${esc(x.title)}</b></td>${levels.map((L) => { const n = lvTotal(x, L.lv); return `<td class="num${n ? '' : ' zero'}">${n || '–'}</td>`; }).join('')}<td class="num"><b>${x.rc.total}</b></td></tr>`).join('')}</tbody>
      <tfoot><tr><th>Toplam</th>${levels.map((L) => `<th class="num">${lvColTotal(L.lv)}</th>`).join('')}<th class="num">${grand}</th></tr></tfoot>
    </table></div>`;

    const st = state.settings;
    const envMeta = [st.exam, st.date ? fmtDay(parseDay(st.date), { day: 'numeric', month: 'long', year: 'numeric' }) : '', st.time, st.lesson && st.lesson + '. ders'].filter(Boolean).join(' · ');
    const labels = rooms.map((x) => `<div class="env">
      <div class="env-head"><span>SALON ZARFI</span><b>${esc(x.title)}</b><strong>${x.rc.total}<small> kâğıt</small></strong></div>
      <div class="env-meta">${esc(envMeta)}</div>
      <div class="env-lines">${x.rc.levels.map((L) => `<div class="env-level"><b>${esc(levelLabel(L.level))} · ${L.total}</b><span>${L.classes.map((c) => `${esc(c.name)}${subjectOf(c.id) ? ' (' + esc(subjectOf(c.id)) + ')' : ''}: <strong>${c.n}</strong>`).join(' &nbsp; / &nbsp; ')}</span></div>`).join('')}</div>
      <div class="env-check">□ Kâğıt sayısı kontrol edildi &nbsp; □ Teslim alındı</div>
    </div>`).join('');

    const tableSheet = `<article class="sheet" data-papers="1">
        ${sheetHead('Sınav kâğıdı dağıtımı', 'Salonlara göre kâğıt sayıları', 'all', 'papers')}
        <h3 class="sub-h">Sınıf düzeyine göre</h3>
        <p class="note">Her salona hangi düzeyden kaç sınav kâğıdı gideceğini gösterir.</p>
        ${levelTable}
        ${approvalBlock('Hazırlayan', 'Kontrol eden')}
      </article>`;
    const labelSheet = `<article class="sheet" data-papers="2">
        ${sheetHead('Sınav kâğıdı dağıtımı', 'Salon zarfı etiketleri', 'all2', 'papers')}
        <p class="note">Her salonun kâğıt zarfına yapıştırabilirsiniz.</p>
        <div class="env-grid">${labels}</div>
      </article>`;
    if (part === 'table') return tableSheet;
    if (part === 'labels') return labelSheet;
    return renderSharePanel() + renderQuickPapers(rooms, levels) + tableSheet + labelSheet;
  }

  /**
   * Hızlı kâğıt listesi. 'room': her salonun zarfına hangi şubeden kaç kâğıt;
   * 'class': her şubenin kâğıt destesinden hangi salona kaç kâğıt.
   * Kutular, kâğıdı koydukça işaretlemek içindir (dağıtım kaydıyla saklanır).
   */
  function renderQuickPapers(rooms) {
    const checks = state.result.paperChecks || {};
    const cards = rooms.map((x) => {
      const lines = x.rc.levels.flatMap((L) => L.classes);
      const done = lines.filter((c) => checks[x.ri + '|' + c.id]).length;
      return `<div class="qcard${done === lines.length ? ' done' : ''}">
        <div class="qhead"><span class="qtitle">${esc(x.title)} salonu</span><span class="qtotal">${x.rc.total} kâğıt</span></div>
        <div class="room-level-totals" aria-label="Bu salondaki düzey toplamları">${x.rc.levels.map((L) => `<span><small>${esc(levelLabel(L.level))}</small><b>${L.total}</b></span>`).join('')}</div>
        ${lines.map((c) => `<label class="qline"><input type="checkbox" data-pc="${esc(x.ri + '|' + c.id)}" ${checks[x.ri + '|' + c.id] ? 'checked' : ''}><span class="qname">${esc(c.name)}${subjectOf(c.id) ? ' <small class="qsub">' + esc(subjectOf(c.id)) + '</small>' : ''}</span><span class="qn">${c.n}</span></label>`).join('')}
        <div class="qfoot">${done === lines.length ? 'Zarf hazır ✓' : done + ' / ' + lines.length + ' şube konuldu'}</div>
      </div>`;
    }).join('');
    return `<article class="sheet quick-sheet">${sheetHead('Kâğıt hazırlama', 'Salon zarfları', 'room', 'teacher', 'Öğretmenler odası için yazdır')}
      <p class="note">Her salonun zarfına aşağıdaki şubelerden belirtilen sayıda kâğıt koyun.</p>
      <button type="button" class="btn ghost small no-print" data-pclear="1">Hazır işaretlerini temizle</button>
      ${levelSummaryHtml()}<div class="qgrid">${cards}</div></article>`;
  }

  function paperResult(el) {
    if (el.closest('#archive-view')) {
      const entry = state.archive.find((a) => a.id === archiveView);
      return entry ? entry.result : null;
    }
    return state.result;
  }

  // Yalnız kâğıt sayıları paylaşılır; öğrenci kimliği ve adı bu modele alınmaz.
  function paperShareData(level) {
    const ci = classIndex();
    const rooms = state.result.rooms.map((room) => {
      const levels = roomCounts(room).levels.filter((L) => !level || L.level === level);
      return { room: roomTitle(room, ci), total: levels.reduce((n, L) => n + L.total, 0),
        levels: levels.map((L) => ({ level: L.level, label: levelLabel(L.level), total: L.total })),
        detail: levels.flatMap((L) => L.classes.map((c) => c.name + (subjectOf(c.id) ? ' ' + subjectOf(c.id) : '') + ': ' + c.n)).join(' · ') };
    }).filter((r) => r.total > 0);
    return { school: state.settings.school, title: state.settings.exam || 'Sınav kâğıdı hazırlama',
      exam: state.settings.exam, date: state.settings.date, time: state.settings.time,
      lesson: state.settings.lesson || '', headerNote: state.settings.headerNote || '',
      distribution: distributionLabel(),
      level: level ? levelLabel(level) : 'Tüm düzeyler', rooms,
      total: rooms.reduce((n, r) => n + r.total, 0) };
  }
  function paperShareText(data) {
    return ['*SINAV KÂĞIDI HAZIRLAMA*', data.school, '*' + data.title + '*',
      data.exam && data.exam !== data.title ? data.exam : '',
      [data.date, data.time, data.lesson ? data.lesson + '. ders' : '', data.level].filter(Boolean).join(' · '), data.headerNote || '', data.distribution || '', '',
      ...data.rooms.map((r) => '\n━━━━━━━━━━━━\n*' + r.room + ' salonu → ' + r.total + ' kâğıt*\n' +
        (r.levels || []).map((L) => '*' + L.label + ': ' + L.total + '*').join('  |  ') + '\nŞubeler: ' + r.detail),
      '', '*TOPLAM: ' + data.total + ' KÂĞIT*',
      'Her salon için kâğıtları ayrı hazırlayıp ilgili salon zarfına koyunuz.'].filter((x) => x !== '').join('\n');
  }
  function paperSharePreview(data) {
    return `<div class="share-phone"><div class="share-brand">KELEBEK / KÂĞIT HAZIRLAMA</div>
      <div class="share-heading"><span>${esc(data.school)}</span><h3>${esc(data.title)}</h3>
      ${data.exam && data.exam !== data.title ? `<p>${esc(data.exam)}</p>` : ''}
      <p>${esc([data.date, data.time, data.lesson ? data.lesson + '. ders' : '', data.level].filter(Boolean).join(' · '))}</p>
      ${data.headerNote ? `<p>${esc(data.headerNote)}</p>` : ''}<p class="distribution-version">${esc(data.distribution || '')}</p></div>
      <div class="share-total"><strong>${data.total}</strong><span>kâğıt hazırlanacak<br>${data.rooms.length} sınav salonu</span></div>
      <div class="share-room-list">${data.rooms.map((r) => `<div class="share-room"><div class="share-room-title"><b>${esc(r.room)} salonu</b><strong>${r.total}<small>kâğıt</small></strong></div>
        <div class="share-levels">${(r.levels || []).map((L) => { const c = window.KelebekShare.color(L.level); return `<span style="background:${c.bg};color:${c.ink};border-color:${c.border}">${esc(L.label)} <b>${L.total}</b></span>`; }).join('')}</div>
        <small class="share-detail">${esc(r.detail)}</small></div>`).join('')}</div>
      <p class="share-foot">Her salon için ayrı hazırlayın ve ilgili salon zarfına koyun.</p></div>`;
  }
  function renderSharePanel() {
    const levels = levelSummary().list;
    return `<section class="share-panel no-print"><div class="share-intro"><span class="eyebrow">ÖĞRETMEN PAYLAŞIMI</span><h3>WhatsApp için kâğıt listesi</h3>
      <p>Sınav başlığı, sınav bilgilerinden otomatik alınır. Düzeyi seçip dağıtımı paylaşın.</p></div>
      <div class="share-layout"><div class="share-controls">
        <label>Ders / sınav başlığı<input data-share-subject readonly aria-readonly="true" value="${esc(state.settings.exam)}" placeholder="Sınav bilgilerinden seçin"></label>
        <p class="hint">Bu başlığı değiştirmek için Sınav bilgileri bölümündeki dönem / sınav seçimini değiştirin.</p>
        <label>Sınava giren düzey<select data-share-level><option value="">Tüm düzeyler</option>${levels.map((L) => `<option value="${esc(L.level)}">${esc(levelLabel(L.level))}</option>`).join('')}</select></label>
        <button type="button" class="btn whatsapp" data-share-action="text">WhatsApp’ta mesaj olarak aç</button>
        <button type="button" class="btn" data-share-action="image">Telefon görseli hazırla / paylaş</button>
        <button type="button" class="btn ghost" data-share-action="copy">Mesajı kopyala</button>
        <p class="hint">WhatsApp’ta alıcıyı siz seçip gönderirsiniz. Görsel paylaşımı desteklenmiyorsa PNG indirilir; WhatsApp’a fotoğraf olarak ekleyebilirsiniz.</p>
        <p class="share-status" role="status" aria-live="polite"></p>
      </div><div data-share-preview>${paperSharePreview(paperShareData(''))}</div></div></section>`;
  }
  function shareDataFrom(panel) {
    const get = () => paperShareData(panel.querySelector('[data-share-level]').value);
    const entry = panel.closest('#archive-view') ? state.archive.find((a) => a.id === archiveView) : null;
    return entry ? withEntry(entry, get) : get();
  }
  function updateShare(e) {
    const panel = e.target.closest('.share-panel');
    if (!panel) return;
    panel.querySelector('[data-share-preview]').innerHTML = paperSharePreview(shareDataFrom(panel));
  }
  async function sharePaper(e) {
    const button = e.target.closest('[data-share-action]');
    if (!button) return;
    const panel = button.closest('.share-panel');
    if (!panel.closest('#archive-view') && state.stale) { toast('Paylaşmadan önce güncel listelerle yeniden dağıtım yapın.'); return; }
    const data = shareDataFrom(panel), text = paperShareText(data);
    const status = panel.querySelector('.share-status');
    try {
      if (button.dataset.shareAction === 'text') {
        window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
        status.textContent = 'WhatsApp mesajı açıldı. Alıcıyı seçip gönderin.';
      } else if (button.dataset.shareAction === 'copy') {
        if (!navigator.clipboard || !window.isSecureContext) {
          let area = panel.querySelector('.share-copy');
          if (!area) { area = document.createElement('textarea'); area.className = 'share-copy'; area.setAttribute('aria-label', 'Kopyalanacak WhatsApp mesajı'); panel.querySelector('.share-controls').appendChild(area); }
          area.value = text; area.focus(); area.select();
          status.textContent = 'Mesaj seçildi; kopyalayıp WhatsApp’a yapıştırın.';
        } else { await navigator.clipboard.writeText(text); status.textContent = 'Mesaj kopyalandı.'; }
      } else {
        const files = await window.KelebekShare.images(data);
        if (navigator.canShare && navigator.canShare({ files }) && navigator.share) {
          try {
            await navigator.share({ files, title: data.title });
            status.textContent = 'Görseller paylaşım menüsüne aktarıldı.';
            return;
          } catch (error) { if (error.name === 'AbortError') throw error; }
        }
        status.textContent = 'Görseller hazır. İndirip WhatsApp’a fotoğraf olarak ekleyin: ';
        files.forEach((file, i) => {
          const link = document.createElement('a'); link.href = URL.createObjectURL(file);
          link.download = file.name; link.className = 'btn small'; link.textContent = 'Görsel ' + (i + 1) + ' indir';
          status.appendChild(link);
        });
      }
    } catch (error) { status.textContent = error.name === 'AbortError' ? 'Paylaşım iptal edildi.' : 'Paylaşım tamamlanamadı. Mesajı kopyalama seçeneğini kullanabilirsiniz.'; }
  }

  /** Sınıf listesine elle tek öğrenci ekler. */
  function addStudent(name, classId, force) {
    if (!editAllowed()) return false;
    name = String(name || '').replace(/\s+/g, ' ').trim();
    const c = state.classes.find((x) => x.id === classId);
    if (!name) { toast('Öğrencinin adını ve soyadını yazın.'); return false; }
    if (!c) { toast('Öğrencinin şubesini seçin.'); return false; }
    if (!force && c.students.some((x) => collator.compare(x.name, name) === 0)) {
      toast('“' + name + '” zaten ' + c.name + ' listesinde. Aynı adla ikinci bir öğrenci eklemek için düğmeye tekrar basın.');
      return 'confirm';
    }
    const next = JSON.parse(JSON.stringify(state));
    next.classes.find((x) => x.id === c.id).students.push({ id: uid('s'), no: '', name });
    next.classes.find((x) => x.id === c.id).students.sort((a, b) => collator.compare(a.name, b.name));
    if (next.result) next.stale = true;
    if (!save(next)) return false;
    state = next; renderAll();
    toast(name + ' · ' + c.name + ' listesine eklendi.' + (state.result ? ' Güncel listeyle yeniden dağıtım yapın.' : ''));
    return true;
  }
  function onAddStudent() {
    const btn = $('#sa-add');
    const r = addStudent($('#sa-name').value, $('#sa-class').value, btn.dataset.confirm === '1');
    if (r === 'confirm') {
      btn.dataset.confirm = '1'; btn.textContent = 'Yine de ekle';
      setTimeout(() => { btn.dataset.confirm = ''; btn.textContent = 'Öğrenciyi ekle'; }, 4000);
      return;
    }
    btn.dataset.confirm = ''; btn.textContent = 'Öğrenciyi ekle';
    if (r) { $('#sa-name').value = ''; $('#sa-name').focus(); }
  }
  /** Bu oturumda son silinen öğrenciyi aynı şubeye geri koyar. */
  function undoDelete() {
    if (!lastDeleted || !editAllowed()) return;
    const c = state.classes.find((x) => x.id === lastDeleted.classId);
    if (!c) { lastDeleted = null; renderStudentDelete(); return; }
    const next = JSON.parse(JSON.stringify(state));
    const list = next.classes.find((x) => x.id === c.id).students;
    if (!list.some((x) => x.id === lastDeleted.student.id)) list.splice(Math.min(lastDeleted.index, list.length), 0, lastDeleted.student);
    if (next.result) next.stale = true;
    if (!save(next)) return;
    const name = lastDeleted.student.name;
    lastDeleted = null; state = next; renderAll();
    toast(name + ' · ' + c.name + ' listeye geri alındı.');
  }

  function deleteStudent(button) {
    if (!editAllowed()) return;
    const id = button.dataset.deleteStudent;
    const c = state.classes.find((cl) => cl.students.some((s) => s.id === id));
    if (!c) return;
    if (button.dataset.confirm !== '1') {
      button.dataset.confirm = '1'; button.textContent = 'Silmek için tekrar basın';
      setTimeout(() => { if (button.isConnected) { button.dataset.confirm = ''; button.textContent = 'Öğrenciyi sil'; } }, 4000);
      return;
    }
    const hadResult = !!state.result;
    const delIdx = c.students.findIndex((x) => x.id === id);
    const delStudent = { ...c.students[delIdx] };
    const next = JSON.parse(JSON.stringify(state));
    next.classes.find((cl) => cl.id === c.id).students = c.students.filter((s) => s.id !== id);
    next.result = null; next.stale = false;
    if (!save(next)) return;
    lastDeleted = { classId: c.id, index: delIdx, student: delStudent };
    state = next; selectedSeat = null; renderAll();
    const who = c.students.find((x) => x.id === id);
    toast((who ? who.name + ' · ' + c.name : 'Öğrenci') + ' silindi.' + (state.classes.length && hadResult ? ' Güncel listeyle yeniden dağıtım yapın.' : ''));
  }
  function onPaperCheck(e) {
    const t = e.target;
    if (!t.dataset || !t.dataset.pc) return false;
    const r = paperResult(t);
    if (!r) return true;
    r.paperChecks = r.paperChecks || {};
    if (t.checked) r.paperChecks[t.dataset.pc] = true; else delete r.paperChecks[t.dataset.pc];
    save();
    if (t.closest('#archive-view')) renderArchiveView(); else renderReportOnly();
    return true;
  }
  function onPaperClick(e) {
    const pt = e.target.closest('[data-print-teacher]');
    if (pt) {
      const entry = e.target.closest('#archive-view') ? state.archive.find((a) => a.id === archiveView) : null;
      if (!entry && !outputReady()) return true;
      const html = entry ? withEntry(entry, () => renderTeacherList(pt.dataset.printTeacher)) : renderTeacherList(pt.dataset.printTeacher);
      printHtml(html, entry ? { duplex: entry.settings.duplex !== false } : undefined);
      return true;
    }
    const c = e.target.closest('[data-pclear]');
    if (!c) return false;
    if (c) { const r = paperResult(c); if (r) { r.paperChecks = {}; save(); } }
    if (e.target.closest('#archive-view')) renderArchiveView(); else renderReportOnly();
    return true;
  }

  // ---------- sınav evrakı (tek seferde yazdırma) ----------
  const PACK_PARTS = [
    { key: 'plan', label: 'Oturma planları', hint: 'Her salon için 1 sayfa; salon kapısına asılır.' },
    { key: 'imza', label: 'Öğrenci imza listeleri', hint: 'Her salon için 1 sayfa; gözetmen öğrencilere imzalatır.' },
    { key: 'yer', label: 'Sınıflara göre sınav yerleri', hint: 'Her şube için 1 sayfa; öğrenciler yerini buradan öğrenir.' },
    { key: 'tablo', label: 'Kâğıt dağıtım tablosu', hint: 'Hangi salona hangi düzeyden ve şubeden kaç kâğıt gideceği.' },
    { key: 'zarf', label: 'Zarf etiketleri', hint: 'Her salonun kâğıt zarfına yapıştırılır.' },
    { key: 'odaSalon', label: 'Öğretmenler odası listesi (salona göre)', hint: 'Her salon zarfına hangi şubeden kaç kâğıt konacağı.', def: false },
  ];
  let packEntry = null; // null = çalışma alanındaki dağıtım; yoksa kayıtlı sınav
  function packChoice() {
    let c = null;
    try { c = JSON.parse(localStorage.getItem(STORE_KEY + '.pack') || 'null'); } catch (e) { c = null; }
    if (!c || typeof c !== 'object' || Array.isArray(c)) c = null;
    const out = {};
    for (const p of PACK_PARTS) out[p.key] = c && p.key in c ? c[p.key] !== false : p.def !== false;
    return out;
  }
  function buildPack(choice) {
    const parts = [];
    if (choice.plan) parts.push(renderPlans());
    if (choice.imza) parts.push(renderRoll());
    if (choice.yer) parts.push(renderByClass());
    if (choice.tablo) parts.push(renderPapers('table'));
    if (choice.zarf) parts.push(renderPapers('labels'));
    if (choice.odaSalon) parts.push(renderTeacherList('room'));
    return parts.join('');
  }
  function packCounts() {
    const r = state.result;
    const rooms = r.rooms.length;
    const used = new Set();
    for (const rm of r.rooms) for (const x of rm.seats) if (x.classId) used.add(x.classId);
    return { plan: rooms, imza: rooms, yer: used.size, tablo: 1, zarf: Math.max(1, Math.ceil(rooms / 9)), odaSalon: teacherPages('room') };
  }
  function openPack(entry) {
    if (!entry && !outputReady()) return;
    packEntry = entry || null;
    const run = (fn) => (packEntry ? withEntry(packEntry, fn) : fn());
    const counts = run(packCounts);
    const title = packEntry ? packEntry.exam : (state.settings.exam || 'Bu dağıtım');
    const ch = packChoice();
    $('#pack-title').textContent = title;
    $('#pack-list').innerHTML = PACK_PARTS.map((p) => `
      <label class="check pack-item"><input type="checkbox" data-pack="${p.key}" ${ch[p.key] ? 'checked' : ''}>
        <span><b>${p.label}</b> <span class="pill">${counts[p.key]} sayfa</span><br><span class="hint">${p.hint}</span></span></label>`).join('');
    $('#pack-duplex').checked = (packEntry ? packEntry.settings : state.settings).duplex !== false;
    updatePackTotal(counts);
    const dlg = $('#pack-dlg');
    dlg._counts = counts;
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function currentPackChoice() {
    const c = {};
    document.querySelectorAll('#pack-list [data-pack]').forEach((i) => { c[i.dataset.pack] = i.checked; });
    return c;
  }
  function updatePackTotal(counts) {
    const c = currentPackChoice();
    const n = PACK_PARTS.reduce((a, p) => a + (c[p.key] ? counts[p.key] : 0), 0);
    const dup = $('#pack-duplex').checked;
    $('#pack-total').textContent = n ? (dup ? `Yaklaşık ${n} sayfa; çift taraflı basılınca her salon/şube ayrı kâğıtta olur.` : `Yaklaşık ${n} sayfa yazdırılacak.`) : 'En az bir evrak seçin.';
    $('#pack-go').disabled = n === 0;
  }
  function closePack() {
    const dlg = $('#pack-dlg');
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  }
  /** Hazır HTML'i tek başına yazdırır (evrak kabını kullanır). */
  const PAGE_MM = 273; // A4 (297 mm) eksi üst/alt kenar boşluğu (2 × 12 mm)

  /**
   * Yazdırmaya hazırlar: her sayfa (salon, şube, liste) A4 genişliğinde ölçülür.
   * Sayfa sınırına çok yakın olanlar hafifçe küçültülür. Çift taraflı
   * yazdırmada sayfa sayısı tek olanların arkasına boş sayfa eklenir; böylece
   * her salon/şube yeni bir kâğıdın ön yüzünden başlar.
   */
  function preparePrint(html, duplex) {
    const box = $('#print-pack');
    box.dataset.docTheme = state.settings.docTheme || 'kurumsal';
    box.innerHTML = html;
    expandPrintSections(box);
    box.classList.add('measuring');
    const ruler = document.createElement('div');
    ruler.style.cssText = 'height:100mm;position:absolute;visibility:hidden';
    box.appendChild(ruler);
    const pxPerMm = ruler.getBoundingClientRect().height / 100 || 3.78;
    ruler.remove();
    // Kartlı sayfaları (öğretmenler odası, zarf etiketleri) sayfalara kendimiz böleriz;
    // tarayıcının kart taşırmasıyla sayfa sayısı şaşmasın.
    for (const sh of [...box.children].filter((el) => el.classList.contains('sheet'))) paginateGrid(sh, pxPerMm);
    const sheets = [...box.children].filter((el) => el.classList.contains('sheet'));
    let pagesTotal = 0;
    for (const sh of sheets) {
      sh.style.zoom = '';
      const mm = sh.getBoundingClientRect().height / pxPerMm;
      let ratio = mm / PAGE_MM;
      let pages = Math.max(1, Math.ceil(ratio - 0.001));
      // Sayfa sınırına çok yakınsa (taşacak gibi ya da az taşmış) küçült: belirsizlik kalmasın.
      if (sh.dataset.fitOne === '1') {
        // Küçültme doğrusal değil (uzun listelerde yarıya küçültmek yüksekliği tam yarıya indirmez);
        // sayfaya gerçekten sığana kadar ölçerek tekrar küçült.
        let z = Math.min(1, 0.96 / Math.max(ratio, 0.001));
        sh.style.zoom = z.toFixed(5);
        for (let k = 0; k < 12 && sh.getBoundingClientRect().height / pxPerMm > PAGE_MM * 0.95 && z > 0.3; k++) {
          z *= 0.95;
          sh.style.zoom = z.toFixed(5);
        }
        sh.dataset.pages = 1;
        pagesTotal++;
        continue;
      }
      const frac = ratio - Math.floor(ratio);
      if (ratio > 0.94 && (frac > 0.94 || (frac > 0 && frac < 0.12))) {
        const target = (frac > 0.94 ? Math.ceil(ratio) : Math.floor(ratio)) * 0.92;
        const z = Math.max(0.6, target / ratio);
        sh.style.zoom = z.toFixed(3);
        ratio *= z;
        pages = Math.max(1, Math.ceil(ratio - 0.001));
      }
      sh.dataset.pages = pages;
      pagesTotal += pages;
    }
    if (duplex) {
      // Aynı belgenin devam sayfaları (data-cont) tek parça sayılır.
      const groups = [];
      for (const sh of sheets) {
        if (sh.dataset.cont && groups.length) groups[groups.length - 1].push(sh); else groups.push([sh]);
      }
      for (const g of groups) {
        const pages = g.reduce((a, x) => a + (+x.dataset.pages || 1), 0);
        const sh = g[g.length - 1];
        if (pages % 2 === 1 && sh.nextElementSibling) {
          const blank = document.createElement('div');
          blank.className = 'blank-page';
          blank.innerHTML = '<span>Bu sayfa çift taraflı yazdırma için boş bırakılmıştır.</span>';
          sh.after(blank);
          pagesTotal++;
        }
      }
    }
    box.classList.remove('measuring');
    return pagesTotal;
  }

  function paginateGrid(sheet, pxPerMm) {
    const grid = sheet.querySelector('.qgrid, .env-grid');
    if (!grid) return;
    const pageH = PAGE_MM * pxPerMm * 0.96;
    if (sheet.getBoundingClientRect().height <= pageH) return;
    const cols = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length);
    const gap = parseFloat(getComputedStyle(grid).rowGap) || 0;
    const items = [...grid.children];
    const rows = [];
    let row = [];
    const flush = () => { if (row.length) rows.push({ items: row, h: Math.max(...row.map((el) => el.getBoundingClientRect().height)) }); row = []; };
    for (const el of items) {
      if (el.classList.contains('grid-span')) { flush(); row = [el]; flush(); continue; }
      row.push(el);
      if (row.length === cols) flush();
    }
    flush();
    // Düzey başlığı sayfanın son satırında kalmasın: başlığı sonraki satırla birlikte tut.
    for (let i = 0; i < rows.length - 1; i++) {
      if (rows[i].items.length === 1 && rows[i].items[0].classList.contains('grid-span')) {
        rows[i + 1] = { items: rows[i].items.concat(rows[i + 1].items), h: rows[i].h + gap + rows[i + 1].h, glued: true };
        rows.splice(i, 1);
      }
    }
    const head = grid.getBoundingClientRect().top - sheet.getBoundingClientRect().top;
    // Devam sayfalarında özet tablosu ve açıklama yok; üst kısım daha kısa.
    const sheetGap = parseFloat(getComputedStyle(sheet).rowGap) || 0;
    const dropped = [...sheet.querySelectorAll('.lvsum, .note')].reduce((a, el) => a + el.getBoundingClientRect().height + sheetGap, 0);
    const contHead = Math.max(0, head - dropped);
    const pages = [];
    let cur = [], used = head;
    for (const r of rows) {
      if (cur.length && used + r.h > pageH) { pages.push(cur); cur = []; used = contHead; }
      cur.push(r); used += r.h + gap;
    }
    if (cur.length) pages.push(cur);
    if (pages.length < 2) return;
    let anchor = sheet;
    pages.forEach((pg, i) => {
      const part = i === 0 ? sheet : sheet.cloneNode(true);
      const g = part.querySelector('.qgrid, .env-grid');
      g.innerHTML = '';
      for (const r of pg) for (const el of r.items) g.appendChild(i === 0 ? el : el.cloneNode(true));
      if (i > 0) part.querySelectorAll('.lvsum').forEach((n) => n.remove());
      if (i > 0) {
        part.dataset.cont = '1';
        const t = part.querySelector('.sheet-title');
        if (t) t.textContent = t.textContent.replace(/ \(devam.*\)$/, '') + ` (devam ${i + 1}/${pages.length})`;
        part.querySelectorAll('.note').forEach((n) => n.remove());
        anchor.after(part);
        anchor = part;
      }
    });
  }

  function printHtml(html, opts) {
    const duplex = opts && opts.single ? false : opts && typeof opts.duplex === 'boolean' ? opts.duplex : state.settings.duplex !== false;
    preparePrint(html, duplex);
    document.body.classList.add('print-pack');
    window.print();
  }

  /**
   * Öğretmenler odasına asılacak kâğıt listesi: ekrandaki kâğıt hazırlama
   * kartlarının salonlara göre basılı hali. Elle işaretlemek için boş kutular basılır.
   */
  function teacherCards(mode) {
    const r = state.result;
    const ci = classIndex();
    const rooms = r.rooms.map((room) => ({ title: roomTitle(room, ci), rc: roomCounts(room) }));
    return rooms.map((x) => {
      const lines = [];
      for (const L of x.rc.levels) for (const c of L.classes) lines.push({ label: c.name + (subjectOf(c.id) ? ' · ' + subjectOf(c.id) : ''), n: c.n, hue: levelHue(c.name) });
      return { title: x.title + ' salonu', total: x.rc.total, lines, levels: x.rc.levels.map((L) => ({ label: levelLabel(L.level), n: L.total })) };
    });
  }
  /** Kart düzeninin yaklaşık sayfa sayısı (dikey A4, 4 sütun). */
  function teacherPages(mode) {
    const cards = teacherCards(mode);
    if (!cards.length) return 1;
    const maxLines = Math.max(...cards.map((c) => c.lines.length));
    const perCol = Math.max(1, Math.floor(245 / (12 + maxLines * 5.2)));
    return Math.max(1, Math.ceil(cards.length / (4 * perCol)));
  }
  /** Düzey toplamları: her düzeyden ve şubeden kaç öğrenci (kâğıt) var. */
  function levelSummary() {
    const r = state.result;
    const ci = classIndex();
    const lv = new Map();
    for (const room of r.rooms) for (const L of roomCounts(room).levels) {
      if (!lv.has(L.level)) lv.set(L.level, { level: L.level, total: 0, classes: new Map() });
      const g = lv.get(L.level);
      g.total += L.total;
      for (const c of L.classes) g.classes.set(c.name, (g.classes.get(c.name) || 0) + c.n);
    }
    void ci;
    const list = [...lv.values()].sort((a, b) => collator.compare(a.level, b.level));
    return { list, total: list.reduce((a, g) => a + g.total, 0) };
  }
  function levelSummaryHtml() {
    const sm = levelSummary();
    return `<div class="lvsum">
      <table class="lvsum-t"><tbody>${sm.list.map((g) => {
        const first = [...g.classes.keys()][0] || g.level;
        return `<tr style="--h:${levelHue(first)}"><th><span class="qdot"></span>${esc(levelLabel(g.level))}</th><td class="lvsum-n">${g.total}</td>
          <td class="lvsum-c">${[...g.classes.entries()].sort((a, b) => collator.compare(a[0], b[0])).map(([n, k]) => `<span>${esc(n)} <b>${k}</b></span>`).join('')}</td></tr>`;
      }).join('')}</tbody>
      <tfoot><tr><th>Toplam</th><td class="lvsum-n">${sm.total}</td><td class="lvsum-c">öğrenci / kâğıt</td></tr></tfoot></table>
    </div>`;
  }

  function renderTeacherList(mode) {
    const cards = teacherCards(mode);
    const grand = cards.reduce((a, c) => a + c.total, 0);
    const sm = levelSummary();
    const cardHtml = (c) => `
        <div class="qcard tcard">
          <div class="qhead"${c.hue != null ? ` style="--h:${c.hue}"` : ''}><span class="qtitle">${c.hue != null ? '<span class="qdot"></span>' : ''}${esc(c.title)}</span><span class="qtotal"><b>${c.total}</b> kâğıt</span></div>
          ${c.levels ? `<div class="room-level-totals" aria-label="Bu salondaki düzey toplamları">${c.levels.map((x) => `<span><small>${esc(x.label)}</small><b>${x.n}</b></span>`).join('')}</div>` : ''}
          ${c.lines.map((l) => `<div class="qline"${l.hue != null ? ` style="--h:${l.hue}"` : ''}><span class="tbox"></span><span class="qname">${esc(l.label)}</span><span class="qn">${l.n}</span></div>`).join('')}
        </div>`;
    const gridItems = cards.map(cardHtml).join('');
    return `<article class="sheet teacher-sheet">
      ${sheetHead('Öğretmenler odası', 'Salonlara göre kâğıt hazırlama', 'oda-' + mode, 'papers')}
      <p class="note">Şubenizin satırındaki sayı kadar kâğıdı salon zarfına koyup kutuyu işaretleyin. Toplam ${grand} kâğıt.</p>
      ${levelSummaryHtml()}
      <div class="qgrid tgrid">${gridItems}</div>
    </article>`;
  }

  function printPack() {
    if (!packEntry && !outputReady()) return;
    const c = currentPackChoice();
    try { localStorage.setItem(STORE_KEY + '.pack', JSON.stringify(c)); } catch (e) { /* yoksay */ }
    const html = packEntry ? withEntry(packEntry, () => buildPack(c)) : buildPack(c);
    const duplex = $('#pack-duplex').checked;
    (packEntry ? packEntry.settings : state.settings).duplex = duplex;
    save();
    renderSettings();
    closePack();
    printHtml(html, { duplex });
  }

  /** Salon yoklama listesi: ad, sınıf, imza. */
  function renderRoll() {
    const r = state.result;
    const ci = classIndex();
    const si = studentIndex();
    return r.rooms.map((room, ri) => {
      const rows = room.seats.filter((seat) => !seat.empty).map((seat) => {
        const stu = si.get(seat.studentId);
        return `<tr><td class="num seat-no">${seat.seatNo}</td><td>${esc(stu.s.name)}</td><td>${esc(ci.get(seat.classId).c.name)}</td><td class="sign"></td></tr>`;
      }).join('');
      return `<article class="sheet roll-sheet" data-fit-one="1" data-room="${ri}">
        ${sheetHead('Sınav salonu · ' + roomTitle(room, ci), 'Öğrenci imza listesi', ri, 'room')}
        ${roomCountsLine(room)}
        <div class="table-scroll"><table class="list">
          <thead><tr><th class="num">Sıra</th><th>Adı soyadı</th><th>Sınıfı</th><th>İmza</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <footer class="exam-rules">
          <h3>SINAV KURALLARI:</h3>
          <ol>
            <li>Öğrenciler, kelebek sistemi oturma planında belirtilen yerlere oturtulur. Zorunlu durumlar dışında oturma düzeni değiştirilmez.</li>
            <li>Öğrencilerin kimlikleri ve sınıf bilgileri yoklama listesi üzerinden kontrol edilir.</li>
            <li>Kopya şüphesi veya sınav düzenini bozan durumlar, ilgili mevzuat ve okulun sınav uygulama esaslarına göre kayıt altına alınır.</li>
            <li>Sınava katılmayan öğrenciler yoklama listesinde açıkça belirtilir. Öğrencilerin gerekli imzaları kontrol edilir.</li>
          </ol>
          <div class="roll-certification">
            <div><b>Sınava giren</b><span class="count-box"></span></div>
            <div><b>Sınava girmeyen</b><span class="count-box"></span></div>
            <div><b>GÖZETMEN AD SOYAD</b><span class="write-line"></span></div>
            <div><b>İMZA</b><span class="write-line"></span></div>
          </div>
        </footer>
      </article>`;
    }).join('');
  }

  function placements() {
    const m = new Map();
    for (const [id, p] of seatPlaces()) m.set(id, p.room);
    return m;
  }

  // ---------- sıra grubu adları ----------
  /**
   * Yan yana duran sıra gruplarının adı (tahtaya bakarken soldan sağa).
   * sideNames: 'lr' = Sol/Orta/Sağ, 'doorL' = kapı solda, 'doorR' = kapı sağda.
   */
  function groupNames(cols, mode) {
    mode = mode || state.settings.sideNames || 'lr';
    const T = {
      lr: { 1: ['Orta'], 2: ['Sol', 'Sağ'], 3: ['Sol', 'Orta', 'Sağ'], 4: ['Sol', 'Orta sol', 'Orta sağ', 'Sağ'] },
      doorL: { 1: ['Orta'], 2: ['Kapı tarafı', 'Pencere tarafı'], 3: ['Kapı tarafı', 'Orta', 'Pencere tarafı'], 4: ['Kapı tarafı', 'Orta (kapıya yakın)', 'Orta (pencereye yakın)', 'Pencere tarafı'] },
      doorR: { 1: ['Orta'], 2: ['Pencere tarafı', 'Kapı tarafı'], 3: ['Pencere tarafı', 'Orta', 'Kapı tarafı'], 4: ['Pencere tarafı', 'Orta (pencereye yakın)', 'Orta (kapıya yakın)', 'Kapı tarafı'] },
    };
    return (T[mode] || T.lr)[cols] || Array.from({ length: cols }, (_, i) => (i + 1) + '. grup');
  }
  function seatSideName(side, mode) {
    mode = mode || state.settings.sideNames || 'lr';
    if (mode === 'lr') return side === 0 ? 'Sol koltuk' : 'Sağ koltuk';
    const leftDoor = mode === 'doorL';
    return (side === 0) === leftDoor ? 'Kapı tarafı koltuk' : 'Pencere tarafı koltuk';
  }

  /**
   * Öğrencinin salondaki yeri: sıra grubu (tahtaya bakarken soldan sağa),
   * önden kaçıncı sıra ve ikili sırada hangi koltuk.
   */
  function seatPlaces() {
    const r = state.result;
    const ci = classIndex();
    const out = new Map();
    for (const room of r.rooms) {
      const name = roomTitle(room, ci);
      const spd = room.spd || 2;
      const cols = room.cols || 3;
      const names = groupNames(cols);
      const rows = Math.ceil(Math.ceil(room.seats.length / spd) / cols);
      room.seats.forEach((s, idx) => {
        if (s.empty) return;
        const desk = Math.floor(idx / spd);
        const row = s.row != null ? s.row : Math.floor(desk / cols);
        const col = s.col != null ? s.col : desk % cols;
        const side = s.side != null ? s.side : idx % spd;
        out.set(s.studentId, {
          room: name, room0: room,
          col, row, side, cols, rows, spd,
          group: names[col],
          rowNo: row + 1,
          no: s.seatNo || idx + 1,
          seat: spd === 2 ? seatSideName(side) : '',
        });
      });
    }
    return out;
  }

  /** Salonun küçük krokisi; öğrencinin koltuğu işaretli. */
  /** Sınıflara göre liste: her şubenin öğrencileri hangi salonda, hangi sırada. */
  function expandPrintSections(container) {
    container.querySelectorAll('[data-class-body]').forEach((body) => { body.hidden = false; });
  }
  function toggleClassList(e) {
    const button = e.target.closest('[data-class-toggle]');
    if (!button) return;
    const body = button.closest('.student-locations').querySelector('[data-class-body]');
    body.hidden = !body.hidden;
    button.setAttribute('aria-expanded', String(!body.hidden));
  }
  function renderByClass() {
    const pl = seatPlaces();
    const twin = state.result.rooms.some((r) => (r.spd || 2) === 2);
    return included().map((c, classNo) => {
      const rows = c.students.slice()
        .sort((a, b) => collator.compare(a.name, b.name))
        .map((s) => {
          const p = pl.get(s.id);
          if (!p) return `<tr><td>${esc(s.name)}</td><td>${esc(c.name)}</td><td colspan="${twin ? 5 : 4}">-</td></tr>`;
          return `<tr><td>${esc(s.name)}</td><td>${esc(c.name)}</td><td><b>${esc(p.room)}</b></td>` +
            `<td class="no-cell">${p.no}</td><td>${esc(p.group)}</td><td>Önden ${p.rowNo}. sıra</td>${twin ? `<td>${esc(p.seat)}</td>` : ''}</tr>`;
        }).join('');
      const bodyId = 'class-list-' + (state.archive.some((a) => a.result === state.result) ? 'archive-' : 'current-') + classNo;
      return `<article class="sheet student-locations" data-fit-one="1" data-class="${esc(c.id)}">
        <div class="class-collapse-bar no-print">
          <button type="button" class="class-collapse-toggle" data-class-toggle aria-expanded="false" aria-controls="${bodyId}">
            <span class="class-collapse-arrow" aria-hidden="true">›</span><strong>${esc(c.name)}</strong><span class="class-collapse-count">${c.students.length} öğrenci</span>
          </button>
          <button type="button" class="btn small" data-print-class="${esc(c.id)}">Yazdır</button>
        </div>
        <div data-class-body id="${bodyId}" hidden>
        ${sheetHead('Şube · ' + c.name + (subjectOf(c.id) ? ' · ' + subjectOf(c.id) : ''), 'Öğrencilerin sınav yerleri', c.id, 'class')}
        <div class="table-scroll"><table class="list">
          <thead><tr><th>Adı soyadı</th><th>Sınıfı</th><th>Sınav salonu</th><th>Sıra no</th><th>Sıra grubu</th><th>Sıra</th>${twin ? '<th>Koltuk</th>' : ''}</tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <p class="note">${placeLegend()}</p>
        </div>
      </article>`;
    }).join('');
  }

  function placeText(p) {
    return `Sıra no ${p.no} · ${p.group} grubu · önden ${p.rowNo}. sıra${p.seat ? ' · ' + p.seat.toLocaleLowerCase('tr-TR') : ''}`;
  }
  function placeLegend() {
    const m = state.settings.sideNames || 'lr';
    return m === 'lr'
      ? 'Sıra grubu ve koltuk, öğrenci tahtaya bakarken sol ya da sağ olarak yazılmıştır.'
      : 'Sıra grubu ve koltuk, kapı ve pencereye göre yazılmıştır.';
  }

  function renderSearch() {
    return `<div class="search">
      <div class="field"><label for="q">Öğrenci adı</label><input id="q" type="text" placeholder="Örn. Yılmaz"></div>
      <div id="q-out">${searchRows('')}</div>
    </div>`;
  }
  function searchRows(q) {
    const pl = seatPlaces();
    const norm = (s) => String(s).toLocaleLowerCase('tr-TR');
    const nq = norm(q.trim());
    const rows = [];
    for (const c of included()) for (const s of c.students) {
      if (nq && !norm(s.name).includes(nq)) continue;
      rows.push({ s, c, p: pl.get(s.id) });
    }
    rows.sort((a, b) => collator.compare(a.s.name, b.s.name));
    if (!rows.length) return '<p class="hint">Eşleşen öğrenci yok.</p>';
    return `<div class="table-scroll"><table class="list">
      <thead><tr><th>Adı soyadı</th><th>Sınıfı</th><th>Sınav salonu</th><th>Yeri</th></tr></thead>
      <tbody>${rows.slice(0, 300).map(({ s, c, p }) => `<tr><td>${esc(s.name)}</td><td>${esc(c.name)}</td><td><b>${esc(p ? p.room : '-')}</b></td><td>${p ? esc(placeText(p)) : '-'}</td></tr>`).join('')}</tbody>
    </table></div>${rows.length > 300 ? '<p class="hint">İlk 300 sonuç gösteriliyor; aramayı daraltın.</p>' : ''}`;
  }

  /** Sınıf listeleri sayfasındaki "Öğrenci sil" arama sonuçları (tüm şubeler). */
  function studentDeleteRows(q) {
    const norm = (x) => String(x).toLocaleLowerCase('tr-TR');
    const nq = norm(String(q || '').trim());
    if (!nq) return '';
    const rows = [];
    for (const c of state.classes) for (const s of c.students) if (norm(s.name).includes(nq)) rows.push({ s, c });
    rows.sort((a, b) => collator.compare(a.s.name, b.s.name) || collator.compare(a.c.name, b.c.name));
    if (!rows.length) return '<p class="hint">Bu adla öğrenci bulunamadı.</p>';
    return `<ul class="sd-list">${rows.slice(0, 40).map(({ s, c }) => `<li>
        <span class="sd-name">${esc(s.name)}</span><span class="sd-class" style="--h:${levelHue(c.name)}">${esc(c.name)}</span>
        <button type="button" class="btn small danger" data-delete-student="${esc(s.id)}">Öğrenciyi sil</button>
      </li>`).join('')}</ul>${rows.length > 40 ? '<p class="hint">İlk 40 sonuç gösteriliyor; adı daha ayrıntılı yazın.</p>' : ''}`;
  }
  let lastDeleted = null; // {classId, index, student} — yalnız bu oturumda geri alınabilir
  function renderStudentDelete() {
    const box = $('#student-delete');
    if (!box) return;
    box.hidden = state.classes.length === 0;
    const sel = $('#sa-class');
    if (sel) {
      const prev = sel.value;
      sel.innerHTML = state.classes.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} (${c.students.length})</option>`).join('');
      if (state.classes.some((c) => c.id === prev)) sel.value = prev;
    }
    const undo = $('#sd-undo');
    if (undo) {
      const c = lastDeleted && state.classes.find((x) => x.id === lastDeleted.classId);
      undo.hidden = !c;
      undo.innerHTML = c ? `<span>Silindi: <b>${esc(lastDeleted.student.name)}</b> · ${esc(c.name)}</span> <button type="button" class="btn small" data-undo-delete="1">Geri al</button>` : '';
    }
    const q = $('#sd-q') ? $('#sd-q').value : '';
    $('#sd-out').innerHTML = studentDeleteRows(q);
  }

  // ---------- yer değiştirme ----------
  function onSeatClick(ri, si) {
    if (!editAllowed()) return;
    if (!outputReady()) return;
    if (!selectedSeat) { selectedSeat = { roomIdx: ri, seatIdx: si }; renderReportOnly(); return; }
    if (selectedSeat.roomIdx === ri && selectedSeat.seatIdx === si) { selectedSeat = null; renderReportOnly(); return; }
    const before = JSON.parse(JSON.stringify(state.result));
    const a = state.result.rooms[selectedSeat.roomIdx].seats[selectedSeat.seatIdx];
    const b = state.result.rooms[ri].seats[si];
    [a.studentId, b.studentId] = [b.studentId, a.studentId];
    [a.classId, b.classId] = [b.classId, a.classId];
    [a.empty, b.empty] = [b.empty, a.empty];
    // Salonlar arasında takas, önceden hazırlanmış zarf sayılarını değiştirebilir.
    if (selectedSeat.roomIdx !== ri) state.result.paperChecks = {};
    selectedSeat = null;
    recomputeStats();
    stampResult(state.result);
    if (!save()) { state.result = before; renderResult(); return; }
    renderResult();
    toast('İki öğrencinin yeri değiştirildi.');
  }

  // ---------- dışa aktarma ----------
  function csvCell(value) {
    let t = String(value == null ? '' : value);
    if (/^[\s]*[=+@-]/.test(t) || /^[\t\r\n]/.test(t)) t = "'" + t;
    return /[;"\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }
  function exportCsv() {
    if (!outputReady()) return;
    const ci = classIndex();
    const si = studentIndex();
    const pl = seatPlaces();
    const lines = [['Sınıfı', 'Adı soyadı', 'Sınav salonu', 'Sıra no', 'Sıra grubu', 'Sıra (önden)', 'Koltuk', 'Sınav', 'Tarih', 'Saat', 'Ders', 'Ek bilgi', 'Dağıtım sürümü', 'Sınav dersi']];
    for (const c of included()) {
      for (const s of c.students.slice().sort((a, b) => collator.compare(a.name, b.name))) {
        const p = pl.get(s.id);
        if (p) lines.push([c.name, s.name, p.room, p.no, p.group, p.rowNo, p.seat, state.settings.exam, state.settings.date, state.settings.time, state.settings.lesson ? state.settings.lesson + '. ders' : '', state.settings.headerNote, distributionLabel(), subjectOf(c.id)]);
      }
    }
    const csv = '﻿' + lines.map((l) => l.map(csvCell).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kelebek-dagitim' + (state.settings.date ? '-' + state.settings.date : '') + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /** Açık bölümün bütün sayfaları (her salon/şube ayrı kâğıda). */
  function printAll() {
    if (!outputReady()) return;
    let html;
    if (view === 'ara') html = `<article class="sheet">${sheetHead('Öğrenci arama', 'Sınav yerleri', 'ara', 'papers')}${$('#q-out').innerHTML}</article>`;
    else html = [...$('#report').children].filter((el) => el.classList.contains('sheet')).map((el) => el.outerHTML).join('');
    printHtml(html);
  }
  function printOne(sheet) {
    if (!outputReady()) return;
    printHtml(sheet.outerHTML, { single: true });
  }
  window.addEventListener('afterprint', () => {
    document.body.classList.remove('print-one', 'print-archive');
    if (document.body.classList.contains('print-pack')) {
      document.body.classList.remove('print-pack');
      $('#print-pack').innerHTML = '';
    }
  });

  // ---------- kayıtlı sınavlar ----------
  let archiveView = null;      // açık kaydın id'si
  let archiveTab = 'plan';
  let archiveFilter = 'upcoming';

  /** Kayıtlı bir sınavın verileriyle rapor fonksiyonlarını çalıştırır. */
  function withEntry(entry, fn) {
    const keep = { classes: state.classes, result: state.result, settings: state.settings, stale: state.stale };
    state.classes = entry.classes;
    state.result = entry.result;
    state.settings = { ...DEFAULT_SETTINGS, ...entry.settings };
    state.stale = false;
    const keepSel = selectedSeat; selectedSeat = null;
    try { return fn(); } finally { Object.assign(state, keep); selectedSeat = keepSel; }
  }

  function saveToArchive() {
    if (!state.result || !resultValid()) { toast('Önce dağıtımı yapın.'); return; }
    if (state.stale) { toast('Listeler veya ayarlar değişti. Kaydetmeden önce yeniden dağıtım yapın.'); return; }
    const st = state.settings;
    if (!st.exam || !st.date) {
      toast('Kaydetmeden önce 2. adımda sınav adını ve tarihini yazın.');
      showPage('bilgiler');
      (st.exam ? $('#s-date') : $('#s-exam')).focus();
      return;
    }
    const used = new Set();
    for (const r of state.result.rooms) { used.add(r.roomId); for (const x of r.seats) if (x.classId) used.add(x.classId); }
    const classes = state.classes.filter((c) => used.has(c.id)).map((c) => ({
      id: c.id, name: c.name, selected: c.selected !== false, deskCols: c.deskCols || null,
      students: c.students.map((x) => ({ id: x.id, name: x.name })),
    }));
    const entry = {
      id: uid('a'),
      exam: st.exam, date: st.date, time: st.time || '', school: st.school || '',
      settings: { ...st },
      classes,
      result: JSON.parse(JSON.stringify(state.result)),
      savedAt: new Date().toISOString(),
    };
    const same = state.archive.findIndex((a) => a.exam === entry.exam && a.date === entry.date && a.time === entry.time && (a.settings.lesson || '') === (st.lesson || ''));
    const before = state.archive.slice();
    if (same >= 0) { entry.id = state.archive[same].id; entry.printed = state.archive[same].printed === true && distributionLabel(state.archive[same].result) === distributionLabel(entry.result); state.archive[same] = entry; } else state.archive.push(entry);
    if (!save()) { state.archive = before; return; }
    renderArchive();
    toast(same >= 0 ? '“' + entry.exam + '” kaydı güncellendi.' : '“' + entry.exam + '” kaydedildi. “Kayıtlı sınavlar” bölümünden istediğiniz an açabilirsiniz.');
  }

  const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const localDateKey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const parseDay = (s) => (s ? new Date(s + 'T00:00') : null);
  function weekStart(d) { const x = dayStart(d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return x; }
  const fmtDay = (d, opt) => d.toLocaleDateString('tr-TR', opt || { day: 'numeric', month: 'long', weekday: 'long' });

  function examPassed(entry, now) {
    const day = localDateKey(now);
    const minute = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    return entry.date < day || (entry.date === day && !!entry.time && entry.time < minute);
  }
  function renderArchive(refreshView = true) {
    const box = $('#archive-list');
    $('#archive-count').textContent = state.archive.length ? String(state.archive.length) : '';
    document.querySelectorAll('#archive-filter button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === archiveFilter)));
    if (!state.archive.length) {
      box.innerHTML = '<div class="empty">Henüz kayıtlı sınav yok. Dağıtımı yaptıktan sonra “Bu dağıtımı kaydet” düğmesine basın. Haftalık ya da iki haftalık sınav programınızın tüm dağıtımları burada birikir.</div>';
      $('#archive-view').innerHTML = '';
      return;
    }
    const now = new Date(), today = dayStart(now);
    const in14 = new Date(today); in14.setDate(in14.getDate() + 14);
    const list = state.archive.slice()
      .filter((a) => {
        const d = parseDay(a.date);
        if (archiveFilter === 'upcoming') return !examPassed(a, now);
        if (archiveFilter === 'twoweeks') return !examPassed(a, now) && d < in14;
        if (archiveFilter === 'past') return examPassed(a, now);
        return true;
      })
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) * (archiveFilter === 'past' ? -1 : 1));
    if (!list.length) {
      box.innerHTML = '<div class="empty">Bu görünümde sınav yok. “Tümü”nü seçerek bütün kayıtları görebilirsiniz.</div>';
    } else {
      const weeks = new Map();
      for (const a of list) {
        const d = parseDay(a.date);
        const ws = localDateKey(weekStart(d));
        if (!weeks.has(ws)) weeks.set(ws, []);
        weeks.get(ws).push(a);
      }
      box.innerHTML = [...weeks.entries()].map(([ws, items]) => {
        const s0 = parseDay(ws), s1 = new Date(s0); s1.setDate(s1.getDate() + 6);
        const label = fmtDay(s0, { day: 'numeric', month: 'long' }) + ' – ' + fmtDay(s1, { day: 'numeric', month: 'long', year: 'numeric' }) + ' haftası';
        return `<div class="arch-week"><h3 class="level-title">${esc(label)} <span>${items.length} sınav</span></h3>
          <div class="arch-items">${items.map((a) => {
            const n = a.result.rooms.reduce((t, r) => t + r.seats.filter((x) => !x.empty).length, 0);
            const isOpen = archiveView === a.id;
            return `<div class="arch-item${isOpen ? ' open' : ''}">
              ${headerMeta({...a.settings, exam:a.exam, date:a.date, time:a.time}, null)}
              <div class="arch-what"><span>${n} öğrenci · ${a.result.rooms.length} salon</span>${examPassed(a, now) ? '<strong class="past-exam">Zamanı geçti</strong>' : ''}</div>
              <div class="arch-act">
                <button type="button" class="btn small print-mark" aria-pressed="${a.printed === true}" data-arch-mark="${esc(a.id)}">${a.printed === true ? '✓ Çıktısı alındı' : 'Çıktı alındı olarak işaretle'}</button>
                <button type="button" class="btn small${isOpen ? ' primary' : ''}" data-arch-open="${esc(a.id)}">${isOpen ? 'Açık' : 'Aç'}</button>
                <button type="button" class="btn ghost small danger" data-arch-del="${esc(a.id)}">Sil</button>
              </div>
            </div>`;
          }).join('')}</div></div>`;
      }).join('');
    }
    if (refreshView) renderArchiveView();
  }

  function renderArchiveView() {
    const box = $('#archive-view');
    const entry = state.archive.find((a) => a.id === archiveView);
    if (!entry) { box.innerHTML = ''; archiveView = null; return; }

    const body = withEntry(entry, () => (archiveTab === 'plan' ? renderPlans() : archiveTab === 'yoklama' ? renderRoll() : archiveTab === 'evrak' ? renderPapers() : renderByClass()));
    box.innerHTML = `
      <div class="arch-head no-print">
        <div><div class="sheet-sub">Kayıtlı sınav</div>${withEntry(entry, () => headerMeta())}</div>
        <span class="spacer"></span>
        <button type="button" class="btn primary" data-arch-pack="1">Sınav evrakını yazdır</button>
        <button type="button" class="btn" data-arch-print="1">Bu bölümü yazdır</button>
        <button type="button" class="btn" data-arch-csv="1">Excel'e aktar (CSV)</button>
        <button type="button" class="btn ghost" data-arch-close="1">Kapat</button>
      </div>
      <nav class="tabs no-print" role="tablist">
        ${[['plan', 'Oturma planları'], ['yoklama', 'Öğrenci imza listeleri'], ['sinif', 'Sınıflara göre sınav yerleri'], ['evrak', 'Dağıtımı paylaş/dışarı aktar']].map(([v, l]) =>
          `<button type="button" role="tab" data-arch-tab="${v}" aria-selected="${v === archiveTab}">${l}</button>`).join('')}
      </nav>
      <div class="arch-report">${body}</div>`;
  }

  function deleteArchive(btn) {
    if (btn.dataset.confirm !== '1') {
      btn.dataset.confirm = '1'; btn.textContent = 'Emin misiniz?';
      setTimeout(() => { if (btn.isConnected) { btn.dataset.confirm = ''; btn.textContent = 'Sil'; } }, 3000);
      return;
    }
    const next = { ...state, archive: state.archive.filter((a) => a.id !== btn.dataset.archDel) };
    if (!save(next)) return;
    state = next;
    if (archiveView === btn.dataset.archDel) archiveView = null;
    renderArchive();
    toast('Kayıt silindi.');
  }

  // ---------- olaylar ----------
  function renderAll() {
    renderClasses();
    renderSettings();
    renderResult();
    renderArchive();
  }

  function bindQuickExam() {
    const dialog = $('#quick-exam'), form = $('#quick-exam-form');
    $('#quick-exam-launch').addEventListener('click', () => {
      const fields = $('#settings fieldset').cloneNode(true);
      const locked = !!(state.result && state.result.locked);
      for (const el of fields.querySelectorAll('[id]')) el.id = 'quick-' + el.id;
      for (const label of fields.querySelectorAll('label[for]')) label.htmlFor = 'quick-' + label.htmlFor;
      for (const control of fields.querySelectorAll('[name]')) control.value = state.settings[control.name] || '';
      fields.disabled = locked;
      $('#quick-exam-fields').replaceChildren(fields);
      for (const button of form.querySelectorAll('[type=submit]')) button.disabled = locked;
      $('#quick-exam-hint').textContent = locked ? 'Etkin dağıtım kilitli. Düzenlemek için Dağıtım bölümünden kilidi açın.' : 'Etkin sınavı düzenliyorsunuz. Dağıtım, seçili şubeler ve salonlarla yapılır.';
      dialog.showModal();
    });
    $('#quick-exam-close').addEventListener('click', () => dialog.close());
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!editAllowed()) return;
      const settings = { ...state.settings };
      for (const control of form.querySelectorAll('[name]')) settings[control.name] = control.value.trim();
      if ((settings.sessionId || '') !== (state.settings.sessionId || '')) {
        dialog.close();
        if (applySession(settings.sessionId) && event.submitter && event.submitter.value === 'run') runDistribution();
        return;
      }
      if (JSON.stringify(settings) !== JSON.stringify(state.settings)) {
        const result = state.result && { ...state.result };
        if (result) stampResult(result);
        const next = { ...state, settings, result };
        if (!save(next)) return;
        state = next;
        renderSettings(); renderResult();
      }
      dialog.close();
      if (event.submitter && event.submitter.value === 'run') runDistribution();
      else toast('Sınav bilgileri kaydedildi.');
    });
  }

  function bind() {
    bindQuickExam();
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-open-quick-exam]')) { $('#quick-exam-launch').click(); return; }
      // "Diğer" menüsü: bir seçenek seçilince ya da dışarı tıklanınca kapanır
      const menu = $('#more-menu');
      if (menu && menu.open && (!menu.contains(e.target) || e.target.closest('.more-list button'))) menu.open = false;
    });
    let archiveMinute = '';
    setInterval(() => {
      const minute = Math.floor(Date.now() / 60000);
      if (minute !== archiveMinute && !document.querySelector('[data-page="arsiv"]').hidden && !document.hidden) {
        renderArchive(false); archiveMinute = minute;
      }
    }, 15000);
    const input = $('#file-input');
    input.addEventListener('change', () => { handleFiles(input.files); input.value = ''; });
    const drop = $('#drop');
    ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
    // Sayfanın başka yerine bırakılan dosyanın tarayıcıda açılmasını engelle
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());

    $('#btn-sample').addEventListener('click', loadSample);
    $('#btn-backup').addEventListener('click', exportBackup);
    const rin = $('#restore-input');
    rin.addEventListener('change', () => { if (rin.files[0]) importBackup(rin.files[0]); rin.value = ''; });
    $('#btn-restore').addEventListener('click', () => rin.click());
    $('#btn-manual').addEventListener('click', () => openEditor(null));
    $('#btn-clear').addEventListener('click', (e) => {
      if (!editAllowed()) return;
      const b = e.currentTarget;
      if (b.dataset.confirm !== '1') {
        b.dataset.confirm = '1'; b.textContent = 'Emin misiniz? Tekrar tıklayın';
        setTimeout(() => { b.dataset.confirm = ''; b.textContent = 'Tüm sınıfları sil'; }, 3000);
        return;
      }
      b.dataset.confirm = ''; b.textContent = 'Tüm sınıfları sil';
      const next = { ...state, classes: [], result: null, stale: false };
      if (!save(next)) return;
      state = next;
      $('#import-log').innerHTML = '';
      renderAll();
    });
    $('#class-list').addEventListener('click', (e) => {
      const card = e.target.closest('.class-card');
      if (card) openEditor(card.dataset.id);
    });

    // düzenleyici
    $('#editor-form').addEventListener('submit', (e) => { e.preventDefault(); saveEditor(); });
    $('#editor-x').addEventListener('click', closeEditor);
    $('#e-cancel').addEventListener('click', closeEditor);
    $('#e-delete').addEventListener('click', deleteClassFromEditor);
    $('#e-add').addEventListener('click', () => {
      syncEditorInputs();
      editing.rows.push({ id: uid('s'), no: '', name: '' });
      renderEditorRows();
      const inputs = document.querySelectorAll('#e-rows tr:last-child input');
      if (inputs[0]) inputs[0].focus();
    });
    $('#e-rows').addEventListener('click', (e) => {
      const b = e.target.closest('[data-del]');
      if (!b) return;
      syncEditorInputs();
      editing.rows.splice(+b.dataset.del, 1);
      toast('Öğrenci listeden çıkarıldı. Değişikliği uygulamak için Kaydet düğmesine basın.');
      renderEditorRows();
    });
    $('#e-paste-add').addEventListener('click', () => {
      syncEditorInputs();
      const rows = P.parseText($('#e-paste').value);
      if (!rows.length) { toast('Yapıştırılan metinde öğrenci satırı bulunamadı.'); return; }
      for (const r of rows) editing.rows.push({ id: uid('s'), no: r.no, name: r.name });
      $('#e-paste').value = '';
      renderEditorRows();
      toast(rows.length + ' öğrenci eklendi. Kaydetmeyi unutmayın.');
    });
    $('#editor').addEventListener('cancel', () => { editing = null; });

    // ayarlar
    const form = $('#settings');
    form.addEventListener('input', readSettings);
    form.addEventListener('change', readSettings);
    form.addEventListener('submit', (e) => e.preventDefault());

    // kayıtlı sınavlar
    $('#btn-save').addEventListener('click', saveToArchive);
    $('#btn-lock').addEventListener('click', toggleDistributionLock);
    window.addEventListener('resize', fitThemePreview);
    // yan panel ve "Devam" düğmeleri
    document.addEventListener('click', (e) => {
      const g = e.target.closest('[data-go]');
      if (g) showPage(g.dataset.go);
    });
    window.addEventListener('hashchange', () => showPage(pageFromHash(), true));
    $('#archive-filter').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-f]');
      if (!b) return;
      archiveFilter = b.dataset.f;
      renderArchive();
    });
    $('#archive-list').addEventListener('click', (e) => {
      const mark = e.target.closest('[data-arch-mark]');
      if (mark) {
        const next = { ...state, archive: state.archive.map(a => a.id === mark.dataset.archMark ? { ...a, printed: !a.printed } : a) };
        if (save(next)) { state = next; renderArchive(); }
        return;
      }
      const o = e.target.closest('[data-arch-open]');
      if (o) {
        archiveView = o.dataset.archOpen; archiveTab = 'plan';
        renderArchive();
        $('#archive-view').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const d = e.target.closest('[data-arch-del]');
      if (d) deleteArchive(d);
    });
    $('#archive-view').addEventListener('click', (e) => {
      const entry = state.archive.find((a) => a.id === archiveView);
      if (!entry) return;
      const t = e.target.closest('button');
      if (!t) return;
      if (onPaperClick(e)) return;
      if (t.dataset.archTab) { archiveTab = t.dataset.archTab; renderArchiveView(); }
      else if (t.dataset.archClose) { archiveView = null; renderArchive(); }
      else if (t.dataset.archCsv) withEntry(entry, exportCsv);
      else if (t.dataset.archPack) openPack(entry);
      else if (t.dataset.archPrint) {
        withEntry(entry, () => printHtml([...$('#archive-view .arch-report').children].filter((el) => el.classList.contains('sheet')).map((el) => el.outerHTML).join('')));
      } else if (t.dataset.printRoom != null || t.dataset.printClass != null || t.dataset.printPapers != null) withEntry(entry, () => printOne(t.closest('.sheet')));
    });

    // salon kapasitesi
    const capBox = $('#capacity');
    capBox.addEventListener('change', (e) => {
      if (!editAllowed()) { renderCapacity(); return; }
      if (e.target.id === 'cap-custom') {
        state.settings.capacityMode = e.target.checked ? 'custom' : 'class';
        markStale(); save(); renderCapacity(); renderResult();
      }
    });
    capBox.addEventListener('input', (e) => {
      if (!editAllowed()) { renderCapacity(); return; }
      const id = e.target.dataset.cap;
      if (!id) return;
      const c = state.classes.find((x) => x.id === id);
      if (!c) return;
      c.roomCap = e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0);
      markStale(); save();
      $('#cap-sum').innerHTML = capSummaryHtml();
    });
    capBox.addEventListener('click', (e) => {
      if (!editAllowed()) { renderCapacity(); return; }
      if (e.target.id === 'cap-all-btn') {
        const n = parseInt($('#cap-all-n').value, 10);
        if (!(n >= 0)) { toast('Önce bir sayı yazın.'); return; }
        for (const c of roomClasses()) c.roomCap = n;
      } else if (e.target.id === 'cap-reset') {
        for (const c of state.classes) c.roomCap = null;
      } else return;
      markStale(); save(); renderCapacity();
    });

    // salon seçimi
    $('#rooms-picker').addEventListener('change', (e) => {
      if (!editAllowed()) { renderRoomPicker(); return; }
      const t = e.target;
      if (t.dataset.roomClass) {
        const c = state.classes.find((x) => x.id === t.dataset.roomClass);
        if (c) c.useAsRoom = t.checked;
      } else if (t.dataset.roomLevel) {
        for (const c of state.classes) if (A.levelOf(c.name) === t.dataset.roomLevel) c.useAsRoom = t.checked;
      } else return;
      markStale(); save(); renderRoomPicker(); renderCapacity(); renderResult();
    });
    $('#rooms-picker').addEventListener('click', (e) => {
      if (e.target.closest('[data-rooms-toggle]')) { roomsOpen = !roomsOpen; renderRoomPicker(); return; }
      const ap = e.target.closest('[data-approve-room]');
      if (ap) { e.preventDefault(); setRoomApproval(ap.dataset.approveRoom, true); return; }
      const un = e.target.closest('[data-unapprove-room]');
      if (un) { e.preventDefault(); setRoomApproval(un.dataset.unapproveRoom, false); return; }
      if (!editAllowed()) { renderRoomPicker(); return; }
      if (e.target.closest('[data-rooms-toggle]')) { roomsOpen = !roomsOpen; renderRoomPicker(); return; }
      const b = e.target.closest('[data-room-pick]');
      if (!b) return;
      for (const c of state.classes) c.useAsRoom = b.dataset.roomPick === 'all' ? true : c.selected !== false;
      markStale(); save(); renderRoomPicker(); renderCapacity(); renderResult();
    });

    // şube seçimi
    $('#picker').addEventListener('change', (e) => {
      if (!editAllowed()) { renderPicker(); return; }
      const t = e.target;
      if (t.dataset.pickClass) {
        const c = state.classes.find((x) => x.id === t.dataset.pickClass);
        if (c) c.selected = t.checked;
      } else if (t.dataset.pickLevel) {
        for (const c of state.classes) if (A.levelOf(c.name) === t.dataset.pickLevel) c.selected = t.checked;
      } else return;
      markStale(); save(); renderPicker(); renderResult();
    });
    $('#picker').addEventListener('click', (e) => {
      if (!editAllowed()) { renderPicker(); return; }
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      for (const c of state.classes) c.selected = b.dataset.pick === 'all';
      markStale(); save(); renderPicker(); renderResult();
    });

    // dağıtım
    $('#btn-run').addEventListener('click', runDistribution);
    $('#btn-print').addEventListener('click', printAll);
    $('#btn-pack').addEventListener('click', () => openPack(null));
    $('#pack-list').addEventListener('change', () => updatePackTotal($('#pack-dlg')._counts));
    $('#pack-duplex').addEventListener('change', () => updatePackTotal($('#pack-dlg')._counts));
    $('#pack-go').addEventListener('click', printPack);
    $('#pack-cancel').addEventListener('click', closePack);
    $('#pack-x').addEventListener('click', closePack);
    $('#btn-csv').addEventListener('click', exportCsv);
    $('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-view]');
      if (!b) return;
      view = b.dataset.view;
      selectedSeat = null;
      showPage(view);
    });
    $('#report').addEventListener('change', onPaperCheck);
    for (const target of [$('#report'), $('#archive-view')]) {
      target.addEventListener('input', updateShare);
      target.addEventListener('click', sharePaper);
      target.addEventListener('click', toggleClassList);
    }
    $('#archive-view').addEventListener('change', onPaperCheck);
    $('#sd-q').addEventListener('input', renderStudentDelete);
    $('#cal-file').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; importCalendar(f); });
    let calRemoveArmed = 0;
    $('#calendar-card').addEventListener('click', (e) => {
      const b = e.target.closest('[data-session-apply]');
      if (b) { applySession(b.dataset.sessionApply); return; }
      if (e.target.closest('[data-cal-template]')) { downloadTemplate(); return; }
      const rm = e.target.closest('[data-cal-remove]');
      if (rm) {
        if (Date.now() - calRemoveArmed > 4000) { calRemoveArmed = Date.now(); rm.textContent = 'Kaldırmak için tekrar basın'; return; }
        calRemoveArmed = 0; removeCalendar();
      }
    });
    $('#cal-dlg-ok').addEventListener('click', () => confirmCalendar());
    $('#cal-dlg-cancel').addEventListener('click', closeCalendarDialog);
    $('#cal-dlg').addEventListener('cancel', () => { pendingCalendar = null; });
    $('#session-panel').addEventListener('click', (e) => {
      const b = e.target.closest('[data-session-apply]');
      if (b) { applySession(b.dataset.sessionApply); return; }
      const ap = e.target.closest('[data-approve-room]');
      if (ap) setRoomApproval(ap.dataset.approveRoom, true);
    });
    $('#session-panel').addEventListener('change', (e) => {
      if (e.target.dataset.sessionSelect) applySession(e.target.value);
    });
    $('#sa-add').addEventListener('click', onAddStudent);
    $('#sa-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onAddStudent(); } });
    $('#sd-undo').addEventListener('click', (e) => { if (e.target.closest('[data-undo-delete]')) undoDelete(); });
    $('#sd-out').addEventListener('click', (e) => {
      const del = e.target.closest('[data-delete-student]');
      if (del) deleteStudent(del);
    });
    $('#report').addEventListener('click', (e) => {
      if (onPaperClick(e)) return;
      const seat = e.target.closest('.seat[data-room]');
      if (seat) { onSeatClick(+seat.dataset.room, +seat.dataset.seat); return; }
      const pr = e.target.closest('[data-print-room],[data-print-class],[data-print-papers]');
      if (pr) printOne(pr.closest('.sheet'));
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && selectedSeat) { selectedSeat = null; renderReportOnly(); }
    });
  }

  // ---------- sayfalar (yan panel) ----------
  const PAGES = ['listeler', 'bilgiler', 'dagitim', 'arsiv'];
  const REPORT_PAGES = { plan: 'Oturma planları', yoklama: 'Öğrenci imza listeleri', sinif: 'Sınıflara göre sınav yerleri', evrak: 'Dağıtımı paylaş/dışarı aktar', ara: 'Öğrenci ara' };
  let page = 'listeler';
  // Object.hasOwn yalnız 2021 sonrası tarayıcılarda var; okuldaki eski tarayıcılarda menü çalışmıyordu.
  const isReportPage = (p) => Object.prototype.hasOwnProperty.call(REPORT_PAGES, p);
  function pageFromHash() {
    const h = (location.hash || '').replace('#', '');
    return PAGES.includes(h) || isReportPage(h) ? h : null;
  }
  function showPage(p, fromHash) {
    if (!PAGES.includes(p) && !isReportPage(p)) p = 'listeler';
    const isReport = isReportPage(p);
    const sectionPage = isReport ? 'dagitim' : p;
    const changed = p !== page;
    page = p;
    if (isReport) { view = p; selectedSeat = null; renderResult(); }
    document.querySelectorAll('[data-page]').forEach((sec) => { sec.hidden = sec.dataset.page !== sectionPage; });
    document.querySelectorAll('[data-distribution-setup]').forEach((el) => { el.hidden = isReport; });
    document.querySelectorAll('[data-report-actions]').forEach((el) => { el.hidden = !isReport; });
    $('#report').hidden = !isReport;
    $('#result-status').hidden = !isReport;
    updateReminder();
    $('#h-result').textContent = isReport ? REPORT_PAGES[p] : 'Dağıtım';
    $('#distribution-help').textContent = isReport
      ? 'Seçtiğiniz çıktı aşağıdadır. Diğer çıktılara sol menüden, salon seçimlerine “Dağıtım ayarları” düğmesinden ulaşabilirsiniz.'
      : 'Sınava girecek şubeleri ve kullanılacak salonları seçin; ardından dağıtımı başlatın.';
    document.querySelectorAll('#side-nav .nav-item').forEach((b) => {
      if (b.dataset.go === sectionPage) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    $('#tabs').classList.toggle('active', sectionPage === 'dagitim');
    document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(isReport && b.dataset.view === p)));
    if (!fromHash && location.hash !== '#' + p) {
      try { history.replaceState(null, '', '#' + p); } catch (e) { /* file:// bazı tarayıcılarda */ }
    }
    if (sectionPage === 'bilgiler') fitThemePreview();
    if (changed) window.scrollTo(0, 0);
  }

  load();
  bind();
  renderAll();
  showPage(pageFromHash() || (state.result ? 'dagitim' : 'listeler'), true);
})();
