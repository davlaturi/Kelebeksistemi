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
    school: '', exam: '', date: '', time: '',
    deskCols: 3, seatsPerDesk: 2, avoidOwnRoom: false, capacityMode: 'class', sideNames: 'lr',
  };
  let state = { classes: [], settings: { ...DEFAULT_SETTINGS }, result: null, stale: false, archive: [] };
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
        archive: Array.isArray(s.archive) ? s.archive : [],
      };
      if ((s.rulesVersion || 1) < RULES_VERSION) {
        // Eski kurallarla yapılmış dağıtımı ve varsayılanı güncelle
        state.settings.avoidOwnRoom = false;
        state.result = null;
        state.stale = false;
      }
    } catch (e) { /* bozuk kayıt: yoksay */ }
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...state, rulesVersion: RULES_VERSION }));
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
  function included() { return state.classes.filter((c) => c.students.length > 0 && c.selected !== false); }

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
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'kelebek-sinav' || !Array.isArray(data.classes)) throw new Error('Bu dosya bir Kelebek yedeği değil.');
      state = {
        classes: data.classes,
        settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
        result: (data.rulesVersion || 1) >= RULES_VERSION ? data.result || null : null,
        stale: !!data.stale,
        archive: Array.isArray(data.archive) ? data.archive : [],
      };
      selectedSeat = null;
      save();
      renderAll();
      toast(state.classes.length + ' şube ve ' + state.archive.length + ' kayıtlı sınav yedekten yüklendi.');
    } catch (e) {
      toast('Yedek yüklenemedi: ' + e.message);
    }
  }

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
    $('#nav-classes').textContent = state.classes.length ? String(state.classes.length) : '';
    $('#nav-classes').title = state.classes.length ? state.classes.length + ' şube' : '';
    if (!state.classes.length) {
      list.innerHTML = '<div class="empty" style="grid-column:1/-1">Henüz sınıf yok. PDF yükleyin ya da “Örnek listelerle dene” ile uygulamayı tanıyın.</div>';
      sum.innerHTML = '';
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
  }

  /** 3. adım: dağıtıma girecek şubeleri elle seçme */
  function renderPicker() {
    const box = $('#picker');
    const groups = byLevel(state.classes.filter((c) => c.students.length > 0));
    if (!groups.length) { box.innerHTML = ''; return; }
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
            <label class="pick-chip" style="--h:${levelHue(c.name)}"><input type="checkbox" data-pick-class="${esc(c.id)}" ${c.selected !== false ? 'checked' : ''}> ${esc(c.name)}</label>`).join('')}
          </div>
        </div>`;
      }).join('')}`;
    box.querySelectorAll('[data-mixed]').forEach((el) => { el.indeterminate = true; });
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
  function roomClasses() { return state.classes.filter((c) => c.students.length > 0 && c.useAsRoom !== false); }
  function capTotals() {
    const inc = included();
    const rooms = roomClasses();
    return { seats: rooms.reduce((a, c) => a + capOf(c), 0), students: inc.reduce((a, c) => a + c.students.length, 0), rooms: rooms.filter((c) => capOf(c) > 0).length };
  }

  function renderRoomPicker() {
    const box = $('#rooms-picker');
    const all = state.classes.filter((c) => c.students.length > 0);
    if (!all.length) { box.innerHTML = ''; return; }
    const groups = byLevel(all);
    const on = roomClasses();
    box.innerHTML = `
      <div class="pick-head">
        <strong>Sınav salonu olarak kullanılacak sınıflar</strong>
        <span class="hint">${on.length} salon seçili. İşaretini kaldırdığınız sınıfa öğrenci oturtulmaz; o şubenin öğrencileri yine sınava girer ve başka salonlara dağıtılır.</span>
        <span class="spacer"></span>
        <button type="button" class="btn ghost small" data-room-pick="all">Tümünü seç</button>
        <button type="button" class="btn ghost small" data-room-pick="same">Sınava girenlerle aynı</button>
      </div>
      ${groups.map((g) => {
        const n = g.classes.filter((c) => c.useAsRoom !== false).length;
        return `<div class="pick-row">
          <label class="pick-level"><input type="checkbox" data-room-level="${esc(g.level)}" ${n === g.classes.length ? 'checked' : ''} ${n > 0 && n < g.classes.length ? 'data-mixed="1"' : ''}> ${esc(g.label)}</label>
          <div class="pick-classes">${g.classes.map((c) => `
            <label class="pick-chip room-chip" style="--h:${levelHue(c.name)}"><input type="checkbox" data-room-class="${esc(c.id)}" ${c.useAsRoom !== false ? 'checked' : ''}> ${esc(c.name)}</label>`).join('')}
          </div>
        </div>`;
      }).join('')}`;
    box.querySelectorAll('[data-mixed]').forEach((el) => { el.indeterminate = true; });
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
        <td><button type="button" class="icon-btn" data-del="${i}" aria-label="Satırı sil">×</button></td>
      </tr>`).join('') || '<tr><td colspan="3" class="hint">Liste boş. Öğrenci ekleyin ya da metin yapıştırın.</td></tr>';
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
    $('#s-sides').value = s.sideNames || 'lr';
    $('#s-own').checked = !!s.avoidOwnRoom;
  }
  function readSettings(ev) {
    const s = state.settings;
    const before = JSON.stringify([s.deskCols, s.seatsPerDesk, s.avoidOwnRoom]);
    s.school = $('#s-school').value.trim();
    s.exam = $('#s-exam').value.trim();
    s.date = $('#s-date').value;
    s.time = $('#s-time').value;
    s.deskCols = parseInt($('#s-cols').value, 10) || 3;
    s.seatsPerDesk = parseInt($('#s-spd').value, 10) === 1 ? 1 : 2;
    s.sideNames = $('#s-sides').value || 'lr';
    s.avoidOwnRoom = $('#s-own').checked;
    if (JSON.stringify([s.deskCols, s.seatsPerDesk, s.avoidOwnRoom]) !== before) markStale();
    save();
    if (ev && ev.type === 'change') renderResult();
    else renderReportOnly();
  }

  // ---------- 3. dağıtım ----------
  function runDistribution() {
    const inc = included();
    if (!inc.length) { toast(state.classes.length ? 'Dağıtıma girecek en az bir şube seçin.' : 'Önce sınıf listelerini yükleyin.'); return; }
    try {
      const t = capTotals();
      if (t.seats < t.students) { toast(`Salonlar yetmiyor: ${t.students} öğrenci için ${t.seats} koltuk var. Daha fazla salon seçin ya da salon mevcudunu artırın.`); return; }
      const rooms = roomClasses().map((c) => ({ id: c.id, name: c.name, deskCols: c.deskCols, capacity: capOf(c) }));
      if (!rooms.some((x) => x.capacity > 0)) { toast('Sınav salonu olarak en az bir sınıf seçin.'); return; }
      const r = A.distribute(inc, {
        rooms,
        capacityMode: state.settings.capacityMode,
        deskCols: state.settings.deskCols,
        seatsPerDesk: state.settings.seatsPerDesk,
        avoidOwnRoom: state.settings.avoidOwnRoom,
      });
      state.result = r;
      state.stale = false;
      selectedSeat = null;
      save();
      renderResult();
      toast(inc.reduce((a, c) => a + c.students.length, 0) + ' öğrenci ' + r.rooms.length + ' salona yerleştirildi.');
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
    return r.rooms.every((room) => room.seats.every((s) => s.empty || si.has(s.studentId)));
  }

  function recomputeStats() {
    const r = state.result;
    const inc = state.classes;
    r.stats = A.evaluate(r.rooms, inc, { cols: state.settings.deskCols, spd: state.settings.seatsPerDesk });
  }

  function renderResult() {
    const r = state.result;
    const has = !!r && resultValid();
    $('#btn-print').hidden = !has;
    $('#btn-csv').hidden = !has;
    $('#btn-save').hidden = !has;
    $('#tabs').hidden = !has;
    $('#nav-result').textContent = has ? '✓' : '';
    $('#nav-result').title = has ? 'Dağıtım hazır' : '';
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
      pill(st.deskmate, state.settings.seatsPerDesk === 1 ? 'Yan yana aynı düzey' : 'Aynı sırada aynı düzey', 'ok', 'bad') +
      pill(st.frontBack, 'Önlü-arkalı aynı düzey', 'ok', 'warn') +
      pill(st.aisle + st.diagonal, 'Çapraz / koridor komşusu aynı düzey', 'ok', '') +
      (state.settings.avoidOwnRoom ? pill(st.ownRoom, 'Kendi sınıfında sınava giren', 'ok', 'warn') : `<span class="pill">Kendi sınıfında oturan: <b>${st.ownRoom}</b></span>`) +
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

  function sheetHead(sub, title, ri, kind) {
    const meta = headerMeta();
    return `<div class="sheet-head">
          <div>
            <div class="sheet-sub">${sub}</div>
            <div class="sheet-title">${esc(title)}</div>
          </div>
          <div class="meta">${meta}</div>
          <div class="sheet-tools"><button type="button" class="btn small" data-print-${kind}="${esc(ri)}">Yazdır</button></div>
        </div>`;
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
            cells.push(`<button type="button" class="seat vacant${isSelE ? ' sel' : ''}" data-room="${ri}" data-seat="${idx}"><span class="who">Boş</span></button>`);
            continue;
          }
          const stu = si.get(seat.studentId);
          const c = ci.get(seat.classId);
          const isSel = selectedSeat && selectedSeat.roomIdx === ri && selectedSeat.seatIdx === idx;
          cells.push(`<button type="button" class="seat${isSel ? ' sel' : ''}" style="--h:${levelHue(c.c.name)}" data-room="${ri}" data-seat="${idx}">
            <span class="who">${esc(stu.s.name)}</span>
            <span class="cls">${esc(c.c.name)}</span>
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
      return `<article class="sheet" data-room="${ri}">
        ${sheetHead('Sınav salonu · oturma planı', roomTitle(room, ci) + ' sınıfı', ri, 'room')}
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
  function renderPapers() {
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

    const classTable = `<div class="table-scroll"><table class="list matrix">
      <thead>
        <tr><th rowspan="2">Sınav salonu</th>${levels.map((L) => `<th class="grp" colspan="${L.classes.length}">${esc(levelLabel(L.lv))}</th>`).join('')}<th rowspan="2" class="num">Toplam</th></tr>
        <tr>${levels.map((L) => L.classes.map((c) => `<th class="num">${esc(c.name)}</th>`).join('')).join('')}</tr>
      </thead>
      <tbody>${rooms.map((x) => `<tr><td><b>${esc(x.title)}</b></td>${levels.map((L) => L.classes.map((c) => { const n = cell(x, c.id); return `<td class="num${n ? '' : ' zero'}">${n || '–'}</td>`; }).join('')).join('')}<td class="num"><b>${x.rc.total}</b></td></tr>`).join('')}</tbody>
      <tfoot><tr><th>Toplam</th>${levels.map((L) => L.classes.map((c) => `<th class="num">${colTotal(c.id)}</th>`).join('')).join('')}<th class="num">${grand}</th></tr></tfoot>
    </table></div>`;

    const labels = rooms.map((x) => `<div class="env">
        <div class="env-head"><span class="sheet-sub">Sınav kâğıdı zarfı</span><b>${esc(x.title)} salonu</b></div>
        <table class="env-table"><tbody>${x.rc.levels.map((L) => `
          <tr class="env-lv"><td>${esc(levelLabel(L.level))}</td><td class="num">${L.total}</td></tr>
          ${L.classes.map((c) => `<tr class="env-cl"><td>${esc(c.name)}</td><td class="num">${c.n}</td></tr>`).join('')}`).join('')}
        </tbody><tfoot><tr><td>Toplam</td><td class="num">${x.rc.total}</td></tr></tfoot></table>
      </div>`).join('');

    return `<article class="sheet" data-papers="1">
        ${sheetHead('Sınav kâğıdı dağıtımı', 'Salonlara göre kâğıt sayıları', 'all', 'papers')}
        <h3 class="sub-h">Sınıf düzeyine göre</h3>
        <p class="note">Her salona hangi düzeyden kaç sınav kâğıdı gideceğini gösterir.</p>
        ${levelTable}
        <h3 class="sub-h">Şubelere göre</h3>
        ${classTable}
      </article>
      <article class="sheet" data-papers="2">
        ${sheetHead('Sınav kâğıdı dağıtımı', 'Salon zarfı etiketleri', 'all2', 'papers')}
        <p class="note">Her salonun kâğıt zarfına yapıştırabilirsiniz.</p>
        <div class="env-grid">${labels}</div>
      </article>`;
  }

  /** Salon yoklama listesi: ad, sınıf, imza. */
  function renderRoll() {
    const r = state.result;
    const ci = classIndex();
    const si = studentIndex();
    return r.rooms.map((room, ri) => {
      const rows = room.seats.filter((seat) => !seat.empty).map((seat) => {
        const stu = si.get(seat.studentId);
        return `<tr><td>${esc(stu.s.name)}</td><td>${esc(ci.get(seat.classId).c.name)}</td><td class="sign"></td></tr>`;
      }).join('');
      return `<article class="sheet" data-room="${ri}">
        ${sheetHead('Sınav salonu · yoklama listesi', roomTitle(room, ci) + ' sınıfı', ri, 'room')}
        ${roomCountsLine(room)}
        <div class="table-scroll"><table class="list">
          <thead><tr><th>Adı soyadı</th><th>Sınıfı</th><th>İmza</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <div class="signs"><div>Gözetmen öğretmen – imza</div><div>Gözetmen öğretmen – imza</div></div>
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
          seat: spd === 2 ? seatSideName(side) : '',
        });
      });
    }
    return out;
  }

  /** Salonun küçük krokisi; öğrencinin koltuğu işaretli. */
  function miniMap(p) {
    const room = p.room0;
    const nDesks = Math.ceil(room.seats.length / p.spd);
    let cells = '';
    for (let r = 0; r < p.rows; r++) {
      for (let c = 0; c < p.cols; c++) {
        const d = r * p.cols + c;
        if (d >= nDesks) { cells += '<i class="mm-desk mm-none"></i>'; continue; }
        let inner = '';
        for (let k = 0; k < p.spd; k++) {
          const exists = d * p.spd + k < room.seats.length;
          inner += `<b class="${!exists ? 'mm-x' : (r === p.row && c === p.col && k === p.side) ? 'mm-me' : ''}"></b>`;
        }
        cells += `<i class="mm-desk${r === p.row && c === p.col ? ' mm-on' : ''}">${inner}</i>`;
      }
    }
    return `<span class="mm" role="img" aria-label="${esc(placeText(p))}"><span class="mm-board"></span><span class="mm-grid" style="grid-template-columns:repeat(${p.cols},auto)">${cells}</span></span>`;
  }

  /** Sınıflara göre liste: her şubenin öğrencileri hangi salonda, hangi sırada. */
  function renderByClass() {
    const pl = seatPlaces();
    const twin = state.result.rooms.some((r) => (r.spd || 2) === 2);
    return included().map((c) => {
      const rows = c.students.slice()
        .sort((a, b) => collator.compare(a.name, b.name))
        .map((s) => {
          const p = pl.get(s.id);
          if (!p) return `<tr><td>${esc(s.name)}</td><td>${esc(c.name)}</td><td colspan="${twin ? 5 : 4}">-</td></tr>`;
          return `<tr><td>${esc(s.name)}</td><td>${esc(c.name)}</td><td><b>${esc(p.room)}</b></td>` +
            `<td>${esc(p.group)}</td><td>Önden ${p.rowNo}. sıra</td>${twin ? `<td>${esc(p.seat)}</td>` : ''}<td class="mm-cell">${miniMap(p)}</td></tr>`;
        }).join('');
      return `<article class="sheet" data-class="${esc(c.id)}">
        ${sheetHead('Sınav yerleri', c.name + ' sınıfı öğrencileri', c.id, 'class')}
        <div class="table-scroll"><table class="list">
          <thead><tr><th>Adı soyadı</th><th>Sınıfı</th><th>Sınav salonu</th><th>Sıra grubu</th><th>Sıra</th>${twin ? '<th>Koltuk</th>' : ''}<th>Yeri</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <p class="note">${placeLegend()} Krokide üstteki çizgi tahtadır; öğrencinin koltuğu koyu renkle işaretlidir.</p>
      </article>`;
    }).join('');
  }

  function placeText(p) {
    return `Sıra grubu: ${p.group} · önden ${p.rowNo}. sıra${p.seat ? ' · ' + p.seat.toLocaleLowerCase('tr-TR') : ''}`;
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
      <thead><tr><th>Adı soyadı</th><th>Sınıfı</th><th>Sınav salonu</th><th>Yeri</th><th></th></tr></thead>
      <tbody>${rows.slice(0, 300).map(({ s, c, p }) => `<tr><td>${esc(s.name)}</td><td>${esc(c.name)}</td><td><b>${esc(p ? p.room : '-')}</b></td><td>${p ? esc(placeText(p)) : '-'}</td><td class="mm-cell">${p ? miniMap(p) : ''}</td></tr>`).join('')}</tbody>
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
    [a.empty, b.empty] = [b.empty, a.empty];
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
    const pl = seatPlaces();
    const lines = [['Sınıfı', 'Adı soyadı', 'Sınav salonu', 'Sıra grubu', 'Sıra (önden)', 'Koltuk']];
    for (const c of included()) {
      for (const s of c.students.slice().sort((a, b) => collator.compare(a.name, b.name))) {
        const p = pl.get(s.id);
        if (p) lines.push([c.name, s.name, p.room, p.group, p.rowNo, p.seat]);
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
    document.body.classList.remove('print-one', 'print-archive');
    document.querySelectorAll('.print-target').forEach((e) => e.classList.remove('print-target'));
    window.print();
  }
  function printOne(sheet) {
    document.querySelectorAll('.print-target').forEach((e) => e.classList.remove('print-target'));
    sheet.classList.add('print-target');
    document.body.classList.remove('print-archive');
    if (sheet.closest('#archive-view')) document.body.classList.add('print-archive');
    document.body.classList.add('print-one');
    window.print();
  }
  window.addEventListener('afterprint', () => document.body.classList.remove('print-one', 'print-archive'));

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
    const st = state.settings;
    if (!st.exam || !st.date) {
      toast('Kaydetmeden önce 2. adımda sınav adını ve tarihini yazın.');
      (st.exam ? $('#s-date') : $('#s-exam')).focus();
      return;
    }
    const used = new Set();
    for (const r of state.result.rooms) { used.add(r.roomId); for (const x of r.seats) if (x.classId) used.add(x.classId); }
    const classes = state.classes.filter((c) => used.has(c.id)).map((c) => ({
      id: c.id, name: c.name, selected: true, deskCols: c.deskCols || null,
      students: c.students.map((x) => ({ id: x.id, name: x.name })),
    }));
    const entry = {
      id: uid('a'),
      exam: st.exam, date: st.date, time: st.time || '', school: st.school || '',
      settings: { school: st.school, exam: st.exam, date: st.date, time: st.time, deskCols: st.deskCols, seatsPerDesk: st.seatsPerDesk, avoidOwnRoom: st.avoidOwnRoom, sideNames: st.sideNames },
      classes,
      result: JSON.parse(JSON.stringify(state.result)),
      savedAt: new Date().toISOString(),
    };
    const same = state.archive.findIndex((a) => a.exam === entry.exam && a.date === entry.date && a.time === entry.time);
    const before = state.archive.slice();
    if (same >= 0) { entry.id = state.archive[same].id; state.archive[same] = entry; } else state.archive.push(entry);
    if (!save()) { state.archive = before; return; }
    renderArchive();
    toast(same >= 0 ? '“' + entry.exam + '” kaydı güncellendi.' : '“' + entry.exam + '” kaydedildi. “Kayıtlı sınavlar” bölümünden istediğiniz an açabilirsiniz.');
  }

  const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const parseDay = (s) => (s ? new Date(s + 'T00:00') : null);
  function weekStart(d) { const x = dayStart(d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return x; }
  const fmtDay = (d, opt) => d.toLocaleDateString('tr-TR', opt || { day: 'numeric', month: 'long', weekday: 'long' });

  function renderArchive() {
    const box = $('#archive-list');
    $('#archive-count').textContent = state.archive.length ? String(state.archive.length) : '';
    document.querySelectorAll('#archive-filter button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === archiveFilter)));
    if (!state.archive.length) {
      box.innerHTML = '<div class="empty">Henüz kayıtlı sınav yok. Dağıtımı yaptıktan sonra “Bu dağıtımı kaydet” düğmesine basın. Haftalık ya da iki haftalık sınav programınızın tüm dağıtımları burada birikir.</div>';
      $('#archive-view').innerHTML = '';
      return;
    }
    const today = dayStart(new Date());
    const in14 = new Date(today); in14.setDate(in14.getDate() + 14);
    const list = state.archive.slice()
      .filter((a) => {
        const d = parseDay(a.date);
        if (archiveFilter === 'upcoming') return d && d >= today;
        if (archiveFilter === 'twoweeks') return d && d >= today && d < in14;
        if (archiveFilter === 'past') return d && d < today;
        return true;
      })
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) * (archiveFilter === 'past' ? -1 : 1));
    if (!list.length) {
      box.innerHTML = '<div class="empty">Bu görünümde sınav yok. “Tümü”nü seçerek bütün kayıtları görebilirsiniz.</div>';
    } else {
      const weeks = new Map();
      for (const a of list) {
        const d = parseDay(a.date);
        const ws = weekStart(d).toISOString().slice(0, 10);
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
              <div class="arch-when"><b>${esc(fmtDay(parseDay(a.date), { day: 'numeric', month: 'short' }))}</b><span>${esc(fmtDay(parseDay(a.date), { weekday: 'long' }))}${a.time ? ' · ' + esc(a.time) : ''}</span></div>
              <div class="arch-what"><b>${esc(a.exam)}</b><span>${n} öğrenci · ${a.result.rooms.length} salon</span></div>
              <div class="arch-act">
                <button type="button" class="btn small${isOpen ? ' primary' : ''}" data-arch-open="${esc(a.id)}">${isOpen ? 'Açık' : 'Aç'}</button>
                <button type="button" class="btn ghost small danger" data-arch-del="${esc(a.id)}">Sil</button>
              </div>
            </div>`;
          }).join('')}</div></div>`;
      }).join('');
    }
    renderArchiveView();
  }

  function renderArchiveView() {
    const box = $('#archive-view');
    const entry = state.archive.find((a) => a.id === archiveView);
    if (!entry) { box.innerHTML = ''; archiveView = null; return; }
    const when = [fmtDay(parseDay(entry.date), { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }), entry.time].filter(Boolean).join(' · ');
    const body = withEntry(entry, () => (archiveTab === 'plan' ? renderPlans() : archiveTab === 'yoklama' ? renderRoll() : archiveTab === 'evrak' ? renderPapers() : renderByClass()));
    box.innerHTML = `
      <div class="arch-head no-print">
        <div><div class="sheet-sub">Kayıtlı sınav</div><div class="sheet-title">${esc(entry.exam)}</div><div class="hint">${esc(when)}</div></div>
        <span class="spacer"></span>
        <button type="button" class="btn" data-arch-print="1">Yazdır / PDF kaydet</button>
        <button type="button" class="btn" data-arch-csv="1">Excel'e aktar (CSV)</button>
        <button type="button" class="btn ghost" data-arch-close="1">Kapat</button>
      </div>
      <nav class="tabs no-print" role="tablist">
        ${[['plan', 'Oturma planları'], ['yoklama', 'Salon yoklama listeleri'], ['sinif', 'Sınıflara göre sınav yerleri'], ['evrak', 'Sınav kâğıdı dağıtımı']].map(([v, l]) =>
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
    state.archive = state.archive.filter((a) => a.id !== btn.dataset.archDel);
    if (archiveView === btn.dataset.archDel) archiveView = null;
    save();
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
    $('#btn-backup').addEventListener('click', exportBackup);
    const rin = $('#restore-input');
    rin.addEventListener('change', () => { if (rin.files[0]) importBackup(rin.files[0]); rin.value = ''; });
    $('#btn-restore').addEventListener('click', () => rin.click());
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

    // kayıtlı sınavlar
    $('#btn-save').addEventListener('click', saveToArchive);
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
      if (t.dataset.archTab) { archiveTab = t.dataset.archTab; renderArchiveView(); }
      else if (t.dataset.archClose) { archiveView = null; renderArchive(); }
      else if (t.dataset.archCsv) withEntry(entry, exportCsv);
      else if (t.dataset.archPrint) {
        document.body.classList.remove('print-one');
        document.querySelectorAll('.print-target').forEach((x) => x.classList.remove('print-target'));
        document.body.classList.add('print-archive');
        window.print();
      } else if (t.dataset.printRoom != null || t.dataset.printClass != null || t.dataset.printPapers != null) printOne(t.closest('.sheet'));
    });

    // salon kapasitesi
    const capBox = $('#capacity');
    capBox.addEventListener('change', (e) => {
      if (e.target.id === 'cap-custom') {
        state.settings.capacityMode = e.target.checked ? 'custom' : 'class';
        markStale(); save(); renderCapacity(); renderResult();
      }
    });
    capBox.addEventListener('input', (e) => {
      const id = e.target.dataset.cap;
      if (!id) return;
      const c = state.classes.find((x) => x.id === id);
      if (!c) return;
      c.roomCap = e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0);
      markStale(); save();
      $('#cap-sum').innerHTML = capSummaryHtml();
    });
    capBox.addEventListener('click', (e) => {
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
      const b = e.target.closest('[data-room-pick]');
      if (!b) return;
      for (const c of state.classes) c.useAsRoom = b.dataset.roomPick === 'all' ? true : c.selected !== false;
      markStale(); save(); renderRoomPicker(); renderCapacity(); renderResult();
    });

    // şube seçimi
    $('#picker').addEventListener('change', (e) => {
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
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      for (const c of state.classes) c.selected = b.dataset.pick === 'all';
      markStale(); save(); renderPicker(); renderResult();
    });

    // dağıtım
    $('#btn-run').addEventListener('click', runDistribution);
    $('#btn-print').addEventListener('click', printAll);
    $('#btn-csv').addEventListener('click', exportCsv);
    $('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-view]');
      if (!b) return;
      view = b.dataset.view;
      selectedSeat = null;
      showPage('dagitim');
      renderResult();
    });
    $('#report').addEventListener('click', (e) => {
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
  let page = 'listeler';
  function pageFromHash() {
    const h = (location.hash || '').replace('#', '');
    return PAGES.includes(h) ? h : null;
  }
  function showPage(p, fromHash) {
    if (!PAGES.includes(p)) p = 'listeler';
    const changed = p !== page;
    page = p;
    document.querySelectorAll('[data-page]').forEach((sec) => { sec.hidden = sec.dataset.page !== p; });
    document.querySelectorAll('#side-nav .nav-item').forEach((b) => {
      if (b.dataset.go === p) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    $('#tabs').classList.toggle('active', p === 'dagitim');
    if (!fromHash && location.hash !== '#' + p) {
      try { history.replaceState(null, '', '#' + p); } catch (e) { /* file:// bazı tarayıcılarda */ }
    }
    if (changed) window.scrollTo(0, 0);
  }

  load();
  bind();
  renderAll();
  showPage(pageFromHash() || (state.result ? 'dagitim' : 'listeler'), true);
})();
