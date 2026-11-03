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
    deskCols: 3, seatsPerDesk: 2, avoidOwnRoom: false, capacityMode: 'class', sideNames: 'lr', duplex: true,
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
    $('#s-duplex').checked = s.duplex !== false;
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
    s.duplex = $('#s-duplex').checked;
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
    $('#btn-pack').hidden = !has;
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

    const tableSheet = `<article class="sheet" data-papers="1">
        ${sheetHead('Sınav kâğıdı dağıtımı', 'Salonlara göre kâğıt sayıları', 'all', 'papers')}
        <h3 class="sub-h">Sınıf düzeyine göre</h3>
        <p class="note">Her salona hangi düzeyden kaç sınav kâğıdı gideceğini gösterir.</p>
        ${levelTable}
        <h3 class="sub-h">Şubelere göre</h3>
        ${classTable}
      </article>`;
    const labelSheet = `<article class="sheet" data-papers="2">
        ${sheetHead('Sınav kâğıdı dağıtımı', 'Salon zarfı etiketleri', 'all2', 'papers')}
        <p class="note">Her salonun kâğıt zarfına yapıştırabilirsiniz.</p>
        <div class="env-grid">${labels}</div>
      </article>`;
    if (part === 'table') return tableSheet;
    if (part === 'labels') return labelSheet;
    return renderQuickPapers(rooms, levels) + tableSheet + labelSheet;
  }

  /**
   * Hızlı kâğıt listesi. 'room': her salonun zarfına hangi şubeden kaç kâğıt;
   * 'class': her şubenin kâğıt destesinden hangi salona kaç kâğıt.
   * Kutular, kâğıdı koydukça işaretlemek içindir (dağıtım kaydıyla saklanır).
   */
  let paperMode = 'room';
  function renderQuickPapers(rooms, levels) {
    const r = state.result;
    const checks = r.paperChecks || {};
    const key = (ri, id) => ri + '|' + id;
    const ci = classIndex();
    let cards;
    if (paperMode === 'room') {
      cards = rooms.map((x) => {
        const lines = [];
        for (const L of x.rc.levels) for (const c of L.classes) lines.push({ id: c.id, name: c.name, n: c.n });
        const done = lines.filter((l) => checks[key(x.ri, l.id)]).length;
        const full = done === lines.length && lines.length > 0;
        return `<div class="qcard${full ? ' done' : ''}">
          <div class="qhead"><span class="qtitle">${esc(x.title)} salonu</span><span class="qtotal">${x.rc.total} kâğıt</span></div>
          ${lines.map((l) => `<label class="qline${checks[key(x.ri, l.id)] ? ' on' : ''}" style="--h:${levelHue(l.name)}">
            <input type="checkbox" data-pc="${esc(key(x.ri, l.id))}" ${checks[key(x.ri, l.id)] ? 'checked' : ''}>
            <span class="qname">${esc(l.name)}</span><span class="qn">${l.n}</span></label>`).join('')}
          <div class="qfoot">${full ? 'Zarf hazır ✓' : done + ' / ' + lines.length + ' şube konuldu'}</div>
        </div>`;
      }).join('');
    } else {
      const allClasses = [];
      for (const L of levels) for (const c of L.classes) allClasses.push(c);
      cards = allClasses.map((c) => {
        const lines = rooms.map((x) => {
          let n = 0;
          for (const L of x.rc.levels) for (const cc of L.classes) if (cc.id === c.id) n = cc.n;
          return { ri: x.ri, title: x.title, n };
        }).filter((l) => l.n > 0);
        const total = lines.reduce((a, l) => a + l.n, 0);
        const done = lines.filter((l) => checks[key(l.ri, c.id)]).length;
        const full = done === lines.length && lines.length > 0;
        return `<div class="qcard${full ? ' done' : ''}">
          <div class="qhead" style="--h:${levelHue(c.name)}"><span class="qtitle"><span class="qdot"></span>${esc(c.name)} kâğıtları</span><span class="qtotal">${total} kâğıt</span></div>
          ${lines.map((l) => `<label class="qline${checks[key(l.ri, c.id)] ? ' on' : ''}">
            <input type="checkbox" data-pc="${esc(key(l.ri, c.id))}" ${checks[key(l.ri, c.id)] ? 'checked' : ''}>
            <span class="qname">${esc(l.title)} salonuna</span><span class="qn">${l.n}</span></label>`).join('')}
          <div class="qfoot">${full ? 'Deste dağıtıldı ✓' : done + ' / ' + lines.length + ' salon'}</div>
        </div>`;
      }).join('');
    }
    void ci;
    const all = Object.keys(checks).filter((k) => checks[k]).length;
    return `<article class="sheet quick-sheet" data-papers="0">
      <div class="sheet-head">
        <div>
          <div class="sheet-sub">Kâğıt hazırlama</div>
          <div class="sheet-title">${paperMode === 'room' ? 'Hangi salona hangi şubeden kaç kâğıt' : 'Her şubenin kâğıtları hangi salona'}</div>
        </div>
        <div class="quick-tools no-print">
          <div class="seg" role="group" aria-label="Görünüm">
            <button type="button" data-pmode="room" aria-pressed="${paperMode === 'room'}">Salona göre (zarf)</button>
            <button type="button" data-pmode="class" aria-pressed="${paperMode === 'class'}">Şubeye göre (deste)</button>
          </div>
          <button type="button" class="btn small" data-print-teacher="${paperMode}">Öğretmenler odası için yazdır</button>
        </div>
      </div>
      <p class="note no-print">${paperMode === 'room'
        ? 'Her kart bir salonun zarfıdır. Şubenin kâğıtlarını koyduktan sonra satırı işaretleyin; tüm satırlar işaretlenince kart “Zarf hazır” olur.'
        : 'Her kart bir şubenin kâğıt destesidir. Desteyi salonlara ayırırken satırları işaretleyin.'}
        ${all ? ' <button type="button" class="btn ghost small" data-pclear="1">İşaretleri temizle</button>' : ''}</p>
      ${levelSummaryHtml()}
      <div class="qgrid">${cards}</div>
    </article>`;
  }

  function paperResult(el) {
    if (el.closest('#archive-view')) {
      const entry = state.archive.find((a) => a.id === archiveView);
      return entry ? entry.result : null;
    }
    return state.result;
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
      const html = entry ? withEntry(entry, () => renderTeacherList(pt.dataset.printTeacher)) : renderTeacherList(pt.dataset.printTeacher);
      printHtml(html);
      return true;
    }
    const m = e.target.closest('[data-pmode]');
    const c = e.target.closest('[data-pclear]');
    if (!m && !c) return false;
    if (m) paperMode = m.dataset.pmode;
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
    { key: 'oda', label: 'Öğretmenler odası listesi (şubeye göre)', hint: 'Öğretmenler odasına asılır; her şubenin kâğıtlarının hangi salona kaçar gideceği.' },
    { key: 'odaSalon', label: 'Öğretmenler odası listesi (salona göre)', hint: 'Her salon zarfına hangi şubeden kaç kâğıt konacağı.', def: false },
  ];
  let packEntry = null; // null = çalışma alanındaki dağıtım; yoksa kayıtlı sınav
  function packChoice() {
    let c = null;
    try { c = JSON.parse(localStorage.getItem(STORE_KEY + '.pack') || 'null'); } catch (e) { c = null; }
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
    if (choice.oda) parts.push(renderTeacherList('class'));
    if (choice.odaSalon) parts.push(renderTeacherList('room'));
    return parts.join('');
  }
  function packCounts() {
    const r = state.result;
    const rooms = r.rooms.length;
    const used = new Set();
    for (const rm of r.rooms) for (const x of rm.seats) if (x.classId) used.add(x.classId);
    return { plan: rooms, imza: rooms, yer: used.size, tablo: 1, zarf: Math.max(1, Math.ceil(rooms / 9)), oda: teacherPages('class'), odaSalon: teacherPages('room') };
  }
  function openPack(entry) {
    packEntry = entry || null;
    const run = (fn) => (packEntry ? withEntry(packEntry, fn) : fn());
    const counts = run(packCounts);
    const title = packEntry ? packEntry.exam : (state.settings.exam || 'Bu dağıtım');
    const ch = packChoice();
    $('#pack-title').textContent = title;
    $('#pack-list').innerHTML = PACK_PARTS.map((p) => `
      <label class="check pack-item"><input type="checkbox" data-pack="${p.key}" ${ch[p.key] ? 'checked' : ''}>
        <span><b>${p.label}</b> <span class="pill">${counts[p.key]} sayfa</span><br><span class="hint">${p.hint}</span></span></label>`).join('');
    $('#pack-duplex').checked = state.settings.duplex !== false;
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
    box.innerHTML = html;
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
    const duplex = opts && opts.single ? false : state.settings.duplex !== false;
    preparePrint(html, duplex);
    document.body.classList.add('print-pack');
    window.print();
  }

  /**
   * Öğretmenler odasına asılacak kâğıt listesi: ekrandaki kâğıt hazırlama
   * kartlarının basılı hali. 'room': her salonun zarfına hangi şubeden kaç
   * kâğıt; 'class': her şubenin kâğıtları hangi salona kaçar. Elle işaretlemek
   * için boş kutular basılır.
   */
  function teacherCards(mode) {
    const r = state.result;
    const ci = classIndex();
    const rooms = r.rooms.map((room) => ({ title: roomTitle(room, ci), rc: roomCounts(room) }));
    if (mode === 'room') {
      return rooms.map((x) => {
        const lines = [];
        for (const L of x.rc.levels) for (const c of L.classes) lines.push({ label: c.name, n: c.n, hue: levelHue(c.name) });
        return { title: x.title + ' salonu', total: x.rc.total, lines, levels: x.rc.levels.map((L) => ({ label: levelLabel(L.level), n: L.total })) };
      });
    }
    const cls = new Map();
    for (const x of rooms) for (const L of x.rc.levels) for (const c of L.classes) {
      if (!cls.has(c.id)) cls.set(c.id, { name: c.name, level: L.level, lines: [] });
      cls.get(c.id).lines.push({ label: x.title + ' salonuna', n: c.n });
    }
    return [...cls.values()].sort((a, b) => collator.compare(a.name, b.name))
      .map((c) => ({ title: c.name + ' kâğıtları', level: c.level, hue: levelHue(c.name), total: c.lines.reduce((t, l) => t + l.n, 0), lines: c.lines }));
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
          ${c.lines.map((l) => `<div class="qline"${l.hue != null ? ` style="--h:${l.hue}"` : ''}><span class="tbox"></span><span class="qname">${esc(l.label)}</span><span class="qn">${l.n}</span></div>`).join('')}
          ${c.levels ? `<div class="tlv">${c.levels.map((x) => `<span>${esc(x.label)}: <b>${x.n}</b></span>`).join('')}</div>` : ''}
        </div>`;
    let gridItems;
    if (mode === 'class') {
      gridItems = sm.list.map((g) => `<div class="grid-span tgroup-h">${esc(levelLabel(g.level))} şubeleri · toplam <b>${g.total}</b> kâğıt</div>` +
        cards.filter((c) => c.level === g.level).map(cardHtml).join('')).join('');
    } else gridItems = cards.map(cardHtml).join('');
    return `<article class="sheet teacher-sheet">
      ${sheetHead('Öğretmenler odası', mode === 'room' ? 'Hangi salona hangi şubeden kaç kâğıt' : 'Her şubenin kâğıtları hangi salona', 'oda-' + mode, 'papers')}
      <p class="note">${mode === 'room'
        ? 'Her kart bir salonun zarfıdır. Şubenizin satırındaki sayı kadar kâğıdı o salonun zarfına koyun ve kutuyu işaretleyin.'
        : 'Her kart bir şubenin kâğıt destesidir. Desteyi kartta yazan salonların zarflarına, yazan sayıda koyun ve kutuyu işaretleyin.'} Toplam ${grand} kâğıt.</p>
      ${levelSummaryHtml()}
      <div class="qgrid tgrid">${gridItems}</div>
    </article>`;
  }

  function printPack() {
    const c = currentPackChoice();
    try { localStorage.setItem(STORE_KEY + '.pack', JSON.stringify(c)); } catch (e) { /* yoksay */ }
    const html = packEntry ? withEntry(packEntry, () => buildPack(c)) : buildPack(c);
    state.settings.duplex = $('#pack-duplex').checked;
    save();
    renderSettings();
    closePack();
    printHtml(html);
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
        ${sheetHead('Sınav salonu · öğrenci imza listesi', roomTitle(room, ci) + ' sınıfı', ri, 'room')}
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
          no: s.seatNo || idx + 1,
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
          if (!p) return `<tr><td>${esc(s.name)}</td><td>${esc(c.name)}</td><td colspan="${twin ? 6 : 5}">-</td></tr>`;
          return `<tr><td>${esc(s.name)}</td><td>${esc(c.name)}</td><td><b>${esc(p.room)}</b></td>` +
            `<td class="no-cell">${p.no}</td><td>${esc(p.group)}</td><td>Önden ${p.rowNo}. sıra</td>${twin ? `<td>${esc(p.seat)}</td>` : ''}<td class="mm-cell">${miniMap(p)}</td></tr>`;
        }).join('');
      return `<article class="sheet" data-class="${esc(c.id)}">
        ${sheetHead('Sınav yerleri', c.name + ' sınıfı öğrencileri', c.id, 'class')}
        <div class="table-scroll"><table class="list">
          <thead><tr><th>Adı soyadı</th><th>Sınıfı</th><th>Sınav salonu</th><th>Sıra no</th><th>Sıra grubu</th><th>Sıra</th>${twin ? '<th>Koltuk</th>' : ''}<th>Yeri</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <p class="note">${placeLegend()} Krokide üstteki çizgi tahtadır; öğrencinin koltuğu koyu renkle işaretlidir.</p>
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
    const lines = [['Sınıfı', 'Adı soyadı', 'Sınav salonu', 'Sıra no', 'Sıra grubu', 'Sıra (önden)', 'Koltuk']];
    for (const c of included()) {
      for (const s of c.students.slice().sort((a, b) => collator.compare(a.name, b.name))) {
        const p = pl.get(s.id);
        if (p) lines.push([c.name, s.name, p.room, p.no, p.group, p.rowNo, p.seat]);
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

  /** Açık bölümün bütün sayfaları (her salon/şube ayrı kâğıda). */
  function printAll() {
    let html;
    if (view === 'ara') html = `<article class="sheet">${sheetHead('Öğrenci arama', 'Sınav yerleri', 'ara', 'papers')}${$('#q-out').innerHTML}</article>`;
    else html = [...$('#report').children].filter((el) => el.classList.contains('sheet')).map((el) => el.outerHTML).join('');
    printHtml(html);
  }
  function printOne(sheet) {
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
        <button type="button" class="btn primary" data-arch-pack="1">Sınav evrakını yazdır</button>
        <button type="button" class="btn" data-arch-print="1">Bu bölümü yazdır</button>
        <button type="button" class="btn" data-arch-csv="1">Excel'e aktar (CSV)</button>
        <button type="button" class="btn ghost" data-arch-close="1">Kapat</button>
      </div>
      <nav class="tabs no-print" role="tablist">
        ${[['plan', 'Oturma planları'], ['yoklama', 'Öğrenci imza listeleri'], ['sinif', 'Sınıflara göre sınav yerleri'], ['evrak', 'Sınav kâğıdı dağıtımı']].map(([v, l]) =>
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
      if (onPaperClick(e)) return;
      if (t.dataset.archTab) { archiveTab = t.dataset.archTab; renderArchiveView(); }
      else if (t.dataset.archClose) { archiveView = null; renderArchive(); }
      else if (t.dataset.archCsv) withEntry(entry, exportCsv);
      else if (t.dataset.archPack) openPack(entry);
      else if (t.dataset.archPrint) {
        printHtml([...$('#archive-view .arch-report').children].filter((el) => el.classList.contains('sheet')).map((el) => el.outerHTML).join(''));
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
      showPage('dagitim');
      renderResult();
    });
    $('#report').addEventListener('change', onPaperCheck);
    $('#archive-view').addEventListener('change', onPaperCheck);
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
