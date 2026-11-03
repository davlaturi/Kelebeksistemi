/* Kelebek Sınav Dağıtımı – arayüz */
(function () {
  'use strict';

  const P = window.KelebekParser;
  const A = window.KelebekAssign;
  const STORE_KEY = 'kelebek-sinav.v1';

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
  }

  // ---------- durum ----------
  const DEFAULT_SETTINGS = {
    school: '', exam: '', date: '', time: '',
    deskCols: 3, seatsPerDesk: 2, avoidOwnRoom: true, avoidSameLevel: true,
  };
  let state = { classes: [], settings: { ...DEFAULT_SETTINGS }, result: null, stale: false };
  let view = 'plan';
  let selectedSeat = null; // {roomIdx, seatIdx}

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      state = {
        classes: Array.isArray(s.classes) ? s.classes : [],
        settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) },
        result: s.result || null,
        stale: !!s.stale,
      };
    } catch (e) { /* bozuk kayıt: yoksay */ }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* depolama kapalı */ }
  }

  // ---------- yardımcılar ----------
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let uidN = 0;
  const uid = (p) => p + Date.now().toString(36) + (uidN++).toString(36) + Math.random().toString(36).slice(2, 6);
  const collator = new Intl.Collator('tr', { numeric: true, sensitivity: 'base' });
  const hueOf = (idx) => Math.round((idx * 137.508 + 18) % 360);

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 3200);
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
  function included() { return state.classes.filter((c) => c.students.length > 0); }

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
        const parts = res.classes.map((c) => {
          const r = addParsedClass(c.name, c.students, f.name);
          return r.merged ? `${c.name} (mevcut listeye ${r.added} öğrenci eklendi)` : `${c.name}: ${r.added} öğrenci`;
        });
        setLine(line, f.name + ' → ' + parts.join(', '), 'ok');
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

  // ---------- örnek veri ----------
  function loadSample() {
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
    if (!state.classes.length) {
      list.innerHTML = '<div class="empty" style="grid-column:1/-1">Henüz sınıf yok. PDF yükleyin ya da “Örnek listelerle dene” ile uygulamayı tanıyın.</div>';
      sum.innerHTML = '';
      return;
    }
    const inc = included();
    const total = inc.reduce((a, c) => a + c.students.length, 0);
    sum.innerHTML = `<span><strong>${inc.length}</strong> sınıf = <strong>${inc.length}</strong> salon</span>` +
      `<span><strong>${total}</strong> öğrenci = <strong>${total}</strong> koltuk</span>` +
      `<span>Karta tıklayarak listeyi kontrol edin ve düzeltin.</span>`;
    list.innerHTML = state.classes.map((c, i) => `
      <button type="button" class="class-card${c.students.length ? '' : ' off'}" data-id="${esc(c.id)}" style="--h:${hueOf(i)}">
        <span class="sw"></span>
        <span class="nm">${esc(c.name)}</span>
        <span class="ct"><b>${c.students.length}</b> öğrenci · salon kapasitesi <b>${c.students.length}</b></span>
      </button>`).join('');
  }

  // ---------- düzenleyici ----------
  let editing = null; // {id|null, rows:[{id,no,name}]}
  function openEditor(id) {
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
        <td><input type="text" inputmode="numeric" data-f="no" value="${esc(s.no)}" aria-label="Öğrenci no"></td>
        <td><input type="text" data-f="name" value="${esc(s.name)}" aria-label="Adı soyadı"></td>
        <td><button type="button" class="icon-btn" data-del="${i}" aria-label="Satırı sil">×</button></td>
      </tr>`).join('') || '<tr><td colspan="4" class="hint">Liste boş. Öğrenci ekleyin ya da metin yapıştırın.</td></tr>';
  }
  function syncEditorInputs() {
    document.querySelectorAll('#e-rows tr[data-i]').forEach((tr) => {
      const r = editing.rows[+tr.dataset.i];
      tr.querySelectorAll('input').forEach((inp) => { r[inp.dataset.f] = inp.value.trim(); });
    });
  }
  function saveEditor() {
    syncEditorInputs();
    const name = $('#e-name').value.trim();
    if (!name) { $('#e-name').focus(); toast('Sınıf adını yazın.'); return; }
    const dup = state.classes.find((c) => c.id !== editing.id && collator.compare(c.name, name) === 0);
    if (dup) { toast('“' + name + '” adında başka bir sınıf var.'); return; }
    const students = editing.rows.filter((r) => r.name).map((r) => ({ id: r.id || uid('s'), no: r.no || '', name: r.name }));
    const cols = $('#e-cols').value ? parseInt($('#e-cols').value, 10) : null;
    if (editing.id) {
      const c = state.classes.find((x) => x.id === editing.id);
      c.name = name; c.students = students; c.deskCols = cols;
    } else {
      state.classes.push({ id: uid('c'), name, students, deskCols: cols, source: 'elle' });
    }
    sortClasses();
    markStale();
    save();
    closeEditor();
    renderAll();
  }
  function deleteClassFromEditor() {
    const btn = $('#e-delete');
    if (btn.dataset.confirm !== '1') {
      btn.dataset.confirm = '1';
      btn.textContent = 'Silmek için tekrar tıklayın';
      setTimeout(() => { btn.dataset.confirm = ''; btn.textContent = 'Sınıfı sil'; }, 3000);
      return;
    }
    btn.dataset.confirm = ''; btn.textContent = 'Sınıfı sil';
    state.classes = state.classes.filter((c) => c.id !== editing.id);
    markStale();
    save();
    closeEditor();
    renderAll();
  }

  // ---------- 2. ayarlar ----------
  function renderSettings() {
    const s = state.settings;
    $('#s-school').value = s.school;
    $('#s-exam').value = s.exam;
    $('#s-date').value = s.date;
    $('#s-time').value = s.time;
    $('#s-cols').value = String(s.deskCols);
    $('#s-spd').value = String(s.seatsPerDesk);
    $('#s-own').checked = !!s.avoidOwnRoom;
    $('#s-level').checked = !!s.avoidSameLevel;
  }
  function readSettings(ev) {
    const s = state.settings;
    const before = JSON.stringify([s.deskCols, s.seatsPerDesk, s.avoidOwnRoom, s.avoidSameLevel]);
    s.school = $('#s-school').value.trim();
    s.exam = $('#s-exam').value.trim();
    s.date = $('#s-date').value;
    s.time = $('#s-time').value;
    s.deskCols = parseInt($('#s-cols').value, 10) || 3;
    s.seatsPerDesk = parseInt($('#s-spd').value, 10) === 1 ? 1 : 2;
    s.avoidOwnRoom = $('#s-own').checked;
    s.avoidSameLevel = $('#s-level').checked;
    if (JSON.stringify([s.deskCols, s.seatsPerDesk, s.avoidOwnRoom, s.avoidSameLevel]) !== before) markStale();
    save();
    if (ev && ev.type === 'change') renderResult();
    else renderReportOnly();
  }

  // ---------- 3. dağıtım ----------
  function runDistribution() {
    const inc = included();
    if (!inc.length) { toast('Önce sınıf listelerini yükleyin.'); return; }
    try {
      const r = A.distribute(inc, {
        deskCols: state.settings.deskCols,
        seatsPerDesk: state.settings.seatsPerDesk,
        avoidOwnRoom: state.settings.avoidOwnRoom,
        avoidSameLevel: state.settings.avoidSameLevel,
      });
      state.result = r;
      state.stale = false;
      selectedSeat = null;
      save();
      renderResult();
      toast(inc.reduce((a, c) => a + c.students.length, 0) + ' öğrenci ' + inc.length + ' salona yerleştirildi.');
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
    return r.rooms.every((room) => room.seats.every((s) => si.has(s.studentId)));
  }

  function recomputeStats() {
    const r = state.result;
    const inc = state.classes;
    r.stats = A.evaluate(r.rooms, inc, { cols: state.settings.deskCols, spd: state.settings.seatsPerDesk });
  }

  function conflictSet(room) {
    const layout = A.seatLayout(room.seats.length, room.cols, room.spd);
    const bad = new Set();
    for (const e of layout.edges) {
      if ((e.kind === 'desk' || e.kind === 'side' || e.kind === 'front') && room.seats[e.a].classId === room.seats[e.b].classId) {
        bad.add(e.a); bad.add(e.b);
      }
    }
    return bad;
  }

  function renderResult() {
    const r = state.result;
    const has = !!r && resultValid();
    $('#btn-print').hidden = !has;
    $('#btn-csv').hidden = !has;
    $('#tabs').hidden = !has;
    $('#btn-run').textContent = has ? 'Yeniden karıştır ve dağıt' : 'Kelebek dağıtımını yap';
    const status = $('#result-status');
    if (!has) {
      status.innerHTML = r ? '<div class="log-item warn">Listelerde değişiklik yapıldığı için önceki dağıtım geçersiz. Yeniden dağıtım yapın.</div>' : '';
      $('#report').innerHTML = state.classes.length
        ? '<div class="empty">Listeler hazır olduğunda “Kelebek dağıtımını yap” düğmesine basın.</div>'
        : '<div class="empty">Dağıtım için önce sınıf listelerini yükleyin.</div>';
      return;
    }
    const st = r.stats;
    const pill = (n, label, zeroKind, kind) => `<span class="pill ${n === 0 ? zeroKind : kind}">${label}: <b>${n}</b></span>`;
    let html = '<div class="status-grid">' +
      pill(st.deskmate, state.settings.seatsPerDesk === 1 ? 'Yan yana aynı sınıf' : 'Aynı sırada aynı sınıf', 'ok', 'bad') +
      pill(st.frontBack, 'Önlü-arkalı aynı sınıf', 'ok', 'warn') +
      pill(st.aisle + st.diagonal, 'Çapraz / koridor komşusu aynı sınıf', 'ok', '') +
      (state.settings.avoidOwnRoom ? pill(st.ownRoom, 'Kendi sınıfında sınava giren', 'ok', 'warn') : '') +
      (state.settings.avoidSameLevel ? pill(st.sameLevelDeskmate, 'Aynı seviyeden sıra arkadaşı', 'ok', '') : '') +
      '</div>';
    if (state.stale) html += '<div class="log-item warn">Ayarlar ya da listeler dağıtımdan sonra değişti. Güncel hali için dağıtımı yeniden yapın.</div>';
    for (const w of r.warnings || []) html += `<div class="log-item warn">${esc(w)}</div>`;
    status.innerHTML = html;
    document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === view)));
    renderReportOnly();
  }

  function headerMeta() {
    const s = state.settings;
    const parts = [];
    if (s.school) parts.push(`<b>${esc(s.school)}</b>`);
    if (s.exam) parts.push(esc(s.exam));
    const when = [s.date ? new Date(s.date + 'T00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }) : '', s.time].filter(Boolean).join(' · ');
    if (when) parts.push(esc(when));
    return parts.join('<br>');
  }

  function renderReportOnly() {
    const r = state.result;
    if (!r || !resultValid()) return;
    const el = $('#report');
    if (view === 'plan') el.innerHTML = renderPlans();
    else if (view === 'yoklama') el.innerHTML = renderRoll();
    else if (view === 'sinif') el.innerHTML = renderByClass();
    else el.innerHTML = renderSearch();
    if (view === 'ara') {
      const inp = $('#q');
      inp.addEventListener('input', () => { $('#q-out').innerHTML = searchRows(inp.value); });
      inp.focus();
    }
  }

  function mixChips(room, ci) {
    const counts = new Map();
    for (const s of room.seats) counts.set(s.classId, (counts.get(s.classId) || 0) + 1);
    return [...counts.entries()]
      .map(([id, n]) => ({ c: ci.get(id), n }))
      .sort((a, b) => collator.compare(a.c.c.name, b.c.c.name))
      .map(({ c, n }) => `<span class="chip" style="--h:${hueOf(c.i)}">${esc(c.c.name)} <b>${n}</b></span>`).join('');
  }

  function renderPlans() {
    const r = state.result;
    const ci = classIndex();
    const si = studentIndex();
    return r.rooms.map((room, ri) => {
      const roomCls = ci.get(room.roomId);
      const bad = conflictSet(room);
      const desks = [];
      const spd = room.spd;
      const nDesks = Math.ceil(room.seats.length / spd);
      for (let d = 0; d < nDesks; d++) {
        const cells = [];
        for (let k = 0; k < spd; k++) {
          const idx = d * spd + k;
          const seat = room.seats[idx];
          if (!seat) { cells.push('<span class="seat empty-seat"></span>'); continue; }
          const stu = si.get(seat.studentId);
          const c = ci.get(seat.classId);
          const isSel = selectedSeat && selectedSeat.roomIdx === ri && selectedSeat.seatIdx === idx;
          cells.push(`<button type="button" class="seat${bad.has(idx) ? ' conflict' : ''}${isSel ? ' sel' : ''}" style="--h:${hueOf(c.i)}" data-room="${ri}" data-seat="${idx}" title="${esc(stu.s.name)} · ${esc(c.c.name)}">
            <span class="no">${seat.seatNo}</span>
            <span class="who">${esc(stu.s.name)}</span>
            <span class="cls">${esc(c.c.name)}${stu.s.no ? ' · ' + esc(stu.s.no) : ''}</span>
          </button>`);
        }
        desks.push(`<div class="desk${spd === 2 ? ' spd2' : ''}">${cells.join('')}</div>`);
      }
      return `<article class="sheet" data-room="${ri}">
        <div class="sheet-head">
          <div>
            <div class="sheet-sub">Sınav salonu · oturma planı</div>
            <div class="sheet-title">${esc(roomCls ? roomCls.c.name : room.name)} sınıfı</div>
          </div>
          <div class="meta">${headerMeta()}${headerMeta() ? '<br>' : ''}Kapasite: <b>${room.seats.length}</b> öğrenci</div>
          <div class="sheet-tools"><button type="button" class="btn small" data-print-room="${ri}">Bu salonu yazdır</button></div>
        </div>
        <div class="mix">${mixChips(room, ci)}</div>
        <div class="plan-scroll">
          <div class="board">Yazı tahtası · öğretmen masası</div>
          <div class="desks" style="grid-template-columns:repeat(${room.cols}, minmax(0,1fr))">${desks.join('')}</div>
        </div>
      </article>`;
    }).join('');
  }

  function renderRoll() {
    const r = state.result;
    const ci = classIndex();
    const si = studentIndex();
    return r.rooms.map((room, ri) => {
      const roomCls = ci.get(room.roomId);
      const rows = room.seats.map((seat) => {
        const stu = si.get(seat.studentId);
        const c = ci.get(seat.classId);
        return `<tr><td class="num">${seat.seatNo}</td><td class="num">${esc(stu.s.no)}</td><td>${esc(stu.s.name)}</td><td>${esc(c.c.name)}</td><td class="sign"></td></tr>`;
      }).join('');
      return `<article class="sheet" data-room="${ri}">
        <div class="sheet-head">
          <div>
            <div class="sheet-sub">Sınav salonu · yoklama listesi</div>
            <div class="sheet-title">${esc(roomCls ? roomCls.c.name : room.name)} sınıfı</div>
          </div>
          <div class="meta">${headerMeta()}${headerMeta() ? '<br>' : ''}Mevcut: <b>${room.seats.length}</b></div>
          <div class="sheet-tools"><button type="button" class="btn small" data-print-room="${ri}">Bu listeyi yazdır</button></div>
        </div>
        <div class="table-scroll"><table class="list">
          <thead><tr><th>Sıra no</th><th>Öğrenci no</th><th>Adı soyadı</th><th>Sınıfı</th><th>İmza</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <div class="signs"><div>Sınava girmeyen öğrenci sayısı</div><div>Gözetmen öğretmen – imza</div><div>Gözetmen öğretmen – imza</div></div>
      </article>`;
    }).join('');
  }

  function placements() {
    const r = state.result;
    const ci = classIndex();
    const out = new Map(); // studentId -> {room name, seatNo}
    for (const room of r.rooms) {
      const rc = ci.get(room.roomId);
      for (const s of room.seats) out.set(s.studentId, { room: rc ? rc.c.name : room.name, seatNo: s.seatNo });
    }
    return out;
  }

  function renderByClass() {
    const pl = placements();
    return included().map((c) => {
      const rows = c.students.slice()
        .sort((a, b) => collator.compare(a.no || '', b.no || '') || collator.compare(a.name, b.name))
        .map((s) => {
          const p = pl.get(s.id);
          return `<tr><td class="num">${esc(s.no)}</td><td>${esc(s.name)}</td><td><b>${esc(p ? p.room : '-')}</b></td><td class="num">${p ? p.seatNo : '-'}</td></tr>`;
        }).join('');
      return `<article class="sheet" data-class="${esc(c.id)}">
        <div class="sheet-head">
          <div>
            <div class="sheet-sub">Öğrencilerin sınav yerleri</div>
            <div class="sheet-title">${esc(c.name)} sınıfı öğrencileri</div>
          </div>
          <div class="meta">${headerMeta()}${headerMeta() ? '<br>' : ''}Öğrenci: <b>${c.students.length}</b></div>
          <div class="sheet-tools"><button type="button" class="btn small" data-print-class="${esc(c.id)}">Bu listeyi yazdır</button></div>
        </div>
        <div class="table-scroll"><table class="list">
          <thead><tr><th>Öğrenci no</th><th>Adı soyadı</th><th>Sınav salonu</th><th>Sıra no</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </article>`;
    }).join('');
  }

  function renderSearch() {
    return `<div class="search">
      <div class="field"><label for="q">Ad, soyad ya da numara</label><input id="q" type="text" placeholder="Örn. Yılmaz ya da 1234"></div>
      <div id="q-out">${searchRows('')}</div>
    </div>`;
  }
  function searchRows(q) {
    const pl = placements();
    const norm = (s) => String(s).toLocaleLowerCase('tr-TR');
    const nq = norm(q.trim());
    const rows = [];
    for (const c of included()) for (const s of c.students) {
      if (nq && !norm(s.name).includes(nq) && !String(s.no).includes(nq)) continue;
      const p = pl.get(s.id);
      rows.push({ s, c, p });
    }
    rows.sort((a, b) => collator.compare(a.s.name, b.s.name));
    if (!rows.length) return '<p class="hint">Eşleşen öğrenci yok.</p>';
    return `<div class="table-scroll"><table class="list">
      <thead><tr><th>Adı soyadı</th><th>Öğrenci no</th><th>Sınıfı</th><th>Sınav salonu</th><th>Sıra no</th></tr></thead>
      <tbody>${rows.slice(0, 300).map(({ s, c, p }) => `<tr><td>${esc(s.name)}</td><td class="num">${esc(s.no)}</td><td>${esc(c.name)}</td><td><b>${esc(p ? p.room : '-')}</b></td><td class="num">${p ? p.seatNo : '-'}</td></tr>`).join('')}</tbody>
    </table></div>${rows.length > 300 ? '<p class="hint">İlk 300 sonuç gösteriliyor; aramayı daraltın.</p>' : ''}`;
  }

  // ---------- yer değiştirme ----------
  function onSeatClick(ri, si) {
    if (!selectedSeat) { selectedSeat = { roomIdx: ri, seatIdx: si }; renderReportOnly(); return; }
    if (selectedSeat.roomIdx === ri && selectedSeat.seatIdx === si) { selectedSeat = null; renderReportOnly(); return; }
    const a = state.result.rooms[selectedSeat.roomIdx].seats[selectedSeat.seatIdx];
    const b = state.result.rooms[ri].seats[si];
    [a.studentId, b.studentId] = [b.studentId, a.studentId];
    [a.classId, b.classId] = [b.classId, a.classId];
    selectedSeat = null;
    recomputeStats();
    save();
    renderResult();
    toast('İki öğrencinin yeri değiştirildi.');
  }

  // ---------- dışa aktarma ----------
  function exportCsv() {
    const ci = classIndex();
    const si = studentIndex();
    const lines = [['Sınav salonu', 'Sıra no', 'Öğrenci no', 'Adı soyadı', 'Sınıfı']];
    for (const room of state.result.rooms) {
      const rc = ci.get(room.roomId);
      for (const s of room.seats) {
        const st = si.get(s.studentId);
        lines.push([rc ? rc.c.name : room.name, s.seatNo, st.s.no, st.s.name, ci.get(s.classId).c.name]);
      }
    }
    const csv = '﻿' + lines.map((l) => l.map((v) => {
      const t = String(v == null ? '' : v);
      return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    }).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kelebek-dagitim' + (state.settings.date ? '-' + state.settings.date : '') + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function printAll() {
    document.body.classList.remove('print-one');
    document.querySelectorAll('.print-target').forEach((e) => e.classList.remove('print-target'));
    window.print();
  }
  function printOne(sheet) {
    document.querySelectorAll('.print-target').forEach((e) => e.classList.remove('print-target'));
    sheet.classList.add('print-target');
    document.body.classList.add('print-one');
    window.print();
  }
  window.addEventListener('afterprint', () => document.body.classList.remove('print-one'));

  // ---------- olaylar ----------
  function renderAll() {
    renderClasses();
    renderSettings();
    renderResult();
  }

  function bind() {
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
    $('#btn-manual').addEventListener('click', () => openEditor(null));
    $('#btn-clear').addEventListener('click', (e) => {
      const b = e.currentTarget;
      if (b.dataset.confirm !== '1') {
        b.dataset.confirm = '1'; b.textContent = 'Emin misiniz? Tekrar tıklayın';
        setTimeout(() => { b.dataset.confirm = ''; b.textContent = 'Tüm sınıfları sil'; }, 3000);
        return;
      }
      b.dataset.confirm = ''; b.textContent = 'Tüm sınıfları sil';
      state.classes = []; state.result = null; state.stale = false;
      $('#import-log').innerHTML = '';
      save(); renderAll();
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

    // dağıtım
    $('#btn-run').addEventListener('click', runDistribution);
    $('#btn-print').addEventListener('click', printAll);
    $('#btn-csv').addEventListener('click', exportCsv);
    $('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-view]');
      if (!b) return;
      view = b.dataset.view;
      selectedSeat = null;
      renderResult();
    });
    $('#report').addEventListener('click', (e) => {
      const seat = e.target.closest('.seat[data-room]');
      if (seat) { onSeatClick(+seat.dataset.room, +seat.dataset.seat); return; }
      const pr = e.target.closest('[data-print-room],[data-print-class]');
      if (pr) printOne(pr.closest('.sheet'));
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && selectedSeat) { selectedSeat = null; renderReportOnly(); }
    });
  }

  load();
  bind();
  renderAll();
})();
