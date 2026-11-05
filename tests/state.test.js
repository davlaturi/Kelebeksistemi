// Gerçek app.js işlevleri; DOM, indirme ve depolama test dublörleri kullanılır.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const A = require('../assets/assign.js');
process.env.TZ = 'Europe/Istanbul';
const source = fs.readFileSync(require.resolve('../assets/app.js'), 'utf8');
function harness(initial) {
  let raw = initial, fail = false;
  const nodes = new Map();
  const groups = new Map();
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, { textContent: '', innerHTML: '', dataset: {},
      classList: { toggle() {}, add() {}, remove() {} }, focus() {}, setAttribute() {},
      removeAttribute() {}, showModal() {} });
    return nodes.get(id);
  };
  const context = { window: { KelebekAssign: A, KelebekShare: require('../assets/share.js'), KelebekCalendar: require('../assets/calendar.js'), addEventListener() {}, confirm: () => true },
    document: { querySelector: node, querySelectorAll: (selector) => groups.get(selector) || [] },
    location: { hash: '' }, history: { replaceState: (_, __, hash) => { context.location.hash = hash; } },
    localStorage: { getItem: () => raw, setItem: (_, value) => { if (fail) throw Error('QuotaExceededError'); raw = value; } },
    setTimeout: () => 0, clearTimeout() {}, console, Date };
  vm.createContext(context);
  const boot = "  load();\n  bind();\n  renderAll();\n  showPage(pageFromHash() || (state.result ? 'dagitim' : 'listeler'), true);";
  const normalized = source.replace(/\r\n/g, '\n');
  assert.ok(normalized.includes(boot), 'Test giriş noktası bulunmalı');
  vm.runInContext(normalized.replace(boot, `
    renderAll = renderArchive = renderResult = renderReportOnly = () => {};
    globalThis.api = { validateState, importBackup, load, save, saveToArchive,
      onSeatClick, localDateKey, weekStart, csvCell, withEntry, openPack,
      paperShareData, paperShareText, paperSharePreview, renderByClass, renderPapers,
      renderSharePanel, searchRows, studentDeleteRows, deleteStudent, addStudent, undoDelete, buildPack,
      openEditor, saveEditor, get editing() { return editing; },
      readSettings, headerMeta, renderTeacherList, renderRoll, showPage, pageFromHash, toggleClassList, expandPrintSections,
      distributionAudit, auditHtml, renderThemePreview, applySession, setRoomApproval, calendarIssues, sessionGroups, roomClasses, capTotals, previewCalendar, confirmCalendar, toggleDistributionLock, distributionLabel, stampResult, runDistribution, loadSample,
      packChoice, deleteArchive, deleteClassFromEditor, resultValid, exportCsv, printAll, onSeatClick,
      get state() { return state; }, set state(s) { state = s; } };
  `), context);
  context.window.scrollTo = () => {};
  return { api: context.api, raw: () => raw, fail: (v) => { fail = v; }, node, groups };
}
function fixture() {
  const classes = ['9/A', '10/A'].map((name, k) => ({ id: 'c' + k, name,
    students: Array.from({ length: 4 }, (_, i) => ({ id: `s${k}-${i}`, name: `Örnek Öğrenci ${k}-${i}` })) }));
  const settings = { school: 'Örnek Okul', exam: 'Deneme', date: '2026-11-03', time: '09:00',
    deskCols: 3, seatsPerDesk: 2, duplex: false, sideNames: 'doorR' };
  return { app: 'kelebek-sinav', rulesVersion: 2, classes, settings,
    result: A.distribute(classes, { ...settings, seed: 7 }), stale: false, archive: [] };
}
const copy = (x) => JSON.parse(JSON.stringify(x));
(async () => {
  const h = harness(), a = h.api;
  const sections = ['listeler', 'bilgiler', 'dagitim', 'arsiv'].map((page) => ({ dataset: { page }, hidden: false }));
  const setup = [{ hidden: false }, { hidden: false }], reportActions = [{ hidden: true }];
  h.groups.set('[data-page]', sections);
  h.groups.set('[data-distribution-setup]', setup);
  h.groups.set('[data-report-actions]', reportActions);
  for (const route of ['plan', 'yoklama', 'sinif', 'evrak', 'ara']) {
    a.showPage(route);
    assert.equal(a.pageFromHash(), route);
    assert.equal(sections.find((s) => s.dataset.page === 'dagitim').hidden, false);
    assert.ok(sections.filter((s) => s.dataset.page !== 'dagitim').every((s) => s.hidden));
    assert.ok(setup.every((s) => s.hidden), 'Rapor açılırken uzun ayar listeleri gizlenmeli');
    assert.equal(h.node('#report').hidden, false);
    assert.equal(reportActions[0].hidden, false);
  }
  a.showPage('dagitim');
  assert.ok(setup.every((s) => !s.hidden));
  assert.equal(h.node('#report').hidden, true);
  assert.equal(h.node('#h-result').textContent, 'Dağıtım');
  for (const route of ['listeler', 'bilgiler', 'arsiv']) {
    a.showPage(route);
    assert.equal(sections.find((s) => s.dataset.page === route).hidden, false);
    assert.equal(sections.filter((s) => !s.hidden).length, 1);
  }
  a.showPage('gecersiz'); assert.equal(a.pageFromHash(), 'listeler');
  const data = fixture();
  const invalidDate = copy(data); invalidDate.settings.date = '2026-02-31';
  assert.throws(() => a.validateState(invalidDate), /tarih/i);
  const lost = copy(data); lost.result.rooms[0].seats[0] = { empty:true };
  assert.throws(() => a.validateState(lost), /öğrenci|yerleş/i);
  const badPreference = harness('true');
  assert.doesNotThrow(() => badPreference.api.packChoice());
  a.state = a.validateState(data);
  a.state.stale = true;
  assert.doesNotThrow(() => a.exportCsv(), 'Bayat dağıtım indirmeye ulaşmadan reddedilmeli');
  assert.match(h.node('#toast').textContent, /yeniden dağıtım/i);
  assert.doesNotThrow(() => a.printAll());
  a.state = a.validateState(data);
  a.saveToArchive();
  const savedArchive = JSON.stringify(a.state.archive);
  h.fail(true);
  a.deleteArchive({dataset:{confirm:'1',archDel:a.state.archive[0].id}});
  assert.equal(JSON.stringify(a.state.archive),savedArchive,'Depolama başarısızsa arşiv silinmemeli');
  a.openEditor('c0'); h.node('#e-delete').dataset.confirm='1';
  a.deleteClassFromEditor();
  assert.equal(a.state.classes.length,2,'Depolama başarısızsa sınıf silinmemeli');
  h.fail(false);
  a.state = a.validateState(data);
  a.state.classes.push({id:'roomOnly',name:'12/A',selected:false,students:[{id:'roomOnly-student',name:'Sınava Girmiyor'}]});
  a.state.result.rooms[0].roomId='roomOnly';
  a.saveToArchive();
  assert.equal(a.state.archive[0].classes.find(c=>c.id==='roomOnly').selected,false);
  const safeArchive = a.validateState({...copy(a.state),rulesVersion:2});
  assert.equal(safeArchive.archive[0].classes.find(c=>c.id==='roomOnly').selected,false);
  a.state = a.validateState(data);
  const roll = a.renderRoll();
  assert.equal((roll.match(/class="sheet roll-sheet" data-fit-one="1"/g) || []).length, 2);
  assert.equal((roll.match(/SINAV KURALLARI:/g) || []).length, 2);
  assert.equal((roll.match(/<li>/g) || []).length, 8);
  assert.ok(roll.includes('GÖZETMEN AD SOYAD') && roll.includes('İMZA'));
  const keepRollState = a.state;
  for (const count of [1, 30, 60, 120]) {
    const students = Array.from({length: count}, (_, i) => ({id:'roll'+i, name:'Örnek Öğrenci '+i}));
    a.state = { ...keepRollState, classes:[{id:'roll-class', name:'9/A', students}], result:{rooms:[{
      roomId:'roll-class', name:'9/A', seats:students.map((s)=>({studentId:s.id, classId:'roll-class'}))
    }]} };
    const html = a.renderRoll();
    assert.equal((html.match(/<td class="sign">/g)||[]).length, count, 'Tüm öğrenciler kalmalı');
    assert.equal((html.match(/data-fit-one="1"/g)||[]).length, 1, 'Liste ve kurallar aynı sayfa ölçeklemesine girmeli');
    assert.ok(html.indexOf('SINAV KURALLARI:') > html.indexOf('</table>'));
  }
  a.state = keepRollState;
  a.saveToArchive();
  assert.equal(a.state.archive.length, 1);
  assert.equal(a.state.archive[0].settings.duplex, false, 'Arşiv baskı ayarını korumalı');
  const snapshot = copy(a.state.archive[0]);
  a.state.classes[0].students[0].name = 'Değişti';
  assert.deepEqual(copy(a.state.archive[0]), snapshot, 'Arşiv bağımsız olmalı');
  a.state.settings.duplex = true;
  a.openPack(a.state.archive[0]);
  assert.equal(h.node('#pack-duplex').checked, false, 'Arşivin baskı ayarı seçilmeli');
  const exported = { ...copy(a.state), app: 'kelebek-sinav', rulesVersion: 2 };
  const restored = harness();
  await restored.api.importBackup({ text: async () => JSON.stringify(exported) });
  assert.deepEqual(copy(restored.api.state), copy(a.state), 'Yedek gidiş dönüşü');
  const reopened = harness(restored.raw()); reopened.api.load();
  assert.deepEqual(copy(reopened.api.state), copy(a.state), 'Yeniden açılış');

  const invalid = [null, {}, { ...data, rulesVersion: 99 }, { ...data, classes: [null] },
    { ...data, archive: [null] }, { ...data, settings: { deskCols: 0 } }];
  const duplicate = copy(data); duplicate.classes[1].students[0].id = duplicate.classes[0].students[0].id; invalid.push(duplicate);
  const missing = copy(data); missing.result.rooms[0].seats[0].studentId = 'missing'; invalid.push(missing);
  const repeated = copy(data); repeated.result.rooms[1].seats[0] = copy(repeated.result.rooms[0].seats[0]); invalid.push(repeated);
  for (const bad of invalid) {
    const before = JSON.stringify(restored.api.state), raw = restored.raw();
    await restored.api.importBackup({ text: async () => JSON.stringify(bad) });
    assert.equal(JSON.stringify(restored.api.state), before, 'Hatalı yedek belleği değiştirmemeli');
    assert.equal(restored.raw(), raw, 'Hatalı yedek kalıcı kaydı değiştirmemeli');
    assert.match(restored.node('#toast').textContent, /Yedek yüklenemedi/);
  }
  restored.fail(true);
  const before = JSON.stringify(restored.api.state), raw = restored.raw();
  await restored.api.importBackup({ text: async () => JSON.stringify(data) });
  assert.equal(JSON.stringify(restored.api.state), before);
  assert.equal(restored.raw(), raw);
  assert.match(restored.node('#toast').textContent, /Kayıt yapılamadı/);
  const broken = harness('{broken'); broken.api.load();
  assert.equal(broken.api.save(), false); assert.equal(broken.raw(), '{broken');
  await broken.api.importBackup({ text: async () => JSON.stringify(data) });
  assert.equal(broken.api.state.classes.length, 2);
  assert.equal(broken.api.save(), true);

  const stale = copy(data); stale.stale = true; stale.classes[0].students = [];
  assert.equal(a.validateState(stale).result, null, 'Silinen öğrencilerin eski dağıtımı kaldırılmalı');
  const old = copy(data); old.rulesVersion = 1; old.settings.avoidOwnRoom = true;
  const migrated = a.validateState(old);
  assert.equal(migrated.result, null); assert.equal(migrated.settings.avoidOwnRoom, false);
  a.state = a.validateState(data); a.state.stale = true; a.saveToArchive();
  assert.equal(a.state.archive.length, 0, 'Güncel olmayan dağıtım arşivlenmemeli');
  a.state.stale = false; a.state.result.paperChecks = { 'c0:c1': true };
  const idsBefore = a.state.result.rooms.flatMap((r) => r.seats.map((s) => s.studentId)).sort();
  a.onSeatClick(0, 0); a.onSeatClick(1, 0);
  assert.deepEqual(copy(a.state.result.paperChecks), {});
  assert.deepEqual(a.state.result.rooms.flatMap((r) => r.seats.map((s) => s.studentId)).sort(), idsBefore);
  assert.equal(a.localDateKey(a.weekStart(new Date('2026-11-03T12:00:00'))), '2026-11-02');
  assert.equal(a.csvCell('=1+1'), "'=1+1");
  assert.equal(a.csvCell('Öğrenci; Örnek'), '"Öğrenci; Örnek"');
  assert.equal(a.csvCell('Çağla Yılmaz'), 'Çağla Yılmaz');
  a.state = a.validateState(data);
  for (const exam of ['1. Dönem 1. Sınav', '1. Dönem 2. Sınav', '2. Dönem 1. Sınav', '2. Dönem 2. Sınav']) {
    for (let lesson = 1; lesson <= 8; lesson++) {
      const fields = { 's-school': 'Örnek Okul', 's-exam': exam, 's-date': '2026-11-03', 's-time': '09:00',
        's-lesson': String(lesson), 's-header-note': 'Süre: 40 dakika <A>', 's-cols': '3', 's-spd': '2', 's-sides': 'lr' };
      for (const [id, value] of Object.entries(fields)) h.node('#' + id).value = value;
      h.node('#s-own').checked = false; h.node('#s-duplex').checked = false;
      a.readSettings({ type: 'change' });
      assert.ok(a.headerMeta().includes(exam) && a.headerMeta().includes(lesson + '. ders'));
      assert.ok(a.headerMeta().includes('&lt;A&gt;'));
      const shared = a.paperShareData('9', 'Edebiyat');
      assert.equal(shared.title, exam, 'Paylaşım başlığı sınav seçiminden alınmalı');
      assert.equal(shared.lesson, String(lesson));
      assert.ok(a.paperShareText(shared).includes(exam) && a.paperShareText(shared).includes(lesson + '. ders'));
      assert.ok(a.paperSharePreview(shared).includes('&lt;A&gt;'));
      assert.ok(a.renderPapers('labels').includes(lesson + '. ders'));
    }
  }
  a.saveToArchive();
  a.state.settings.lesson = '7'; a.saveToArchive();
  assert.equal(a.state.archive.length, 2, 'Farklı derslerdeki sınavlar birbirinin üzerine yazılmamalı');
  const reloadedMeta = harness(h.raw()); reloadedMeta.api.load();
  assert.equal(reloadedMeta.api.state.settings.lesson, '7');
  assert.equal(reloadedMeta.api.state.archive[0].settings.lesson, '8');
  assert.equal(reloadedMeta.api.state.settings.headerNote, 'Süre: 40 dakika <A>');
  assert.equal(a.validateState(data).settings.lesson, '', 'Eski yedekler uyumlu kalmalı');
  const teacherHtml = a.renderTeacherList('room');
  assert.ok(teacherHtml.includes('room-level-totals'));
  assert.ok(teacherHtml.includes('<small>9. sınıf</small><b>2</b>'));
  assert.ok(teacherHtml.includes('<small>10. sınıf</small><b>2</b>'));
  assert.ok(teacherHtml.indexOf('room-level-totals') < teacherHtml.indexOf('class="qline"'));
  a.state = a.validateState(data);
  const share = a.paperShareData('9', 'Türk Dili ve Edebiyatı');
  assert.equal(share.total, 4, 'Yalnız seçilen düzeyin kâğıtları sayılmalı');
  assert.equal(share.rooms.reduce((n, r) => n + r.total, 0), 4);
  assert.ok(share.rooms.every((r) => !r.detail.includes('10/A')));
  const message = a.paperShareText(share);
  assert.equal(share.rooms.reduce((n, r) => n + r.levels.reduce((sum, L) => sum + L.total, 0), 0), 4);
  assert.ok(message.includes('*9. sınıf: 2*'));
  const allLevels = a.paperShareData('', 'Ortak sınav');
  for (const room of allLevels.rooms) {
    assert.equal(room.levels.reduce((n, L) => n + L.total, 0), room.total);
    assert.equal(room.levels.find((L) => L.level === '9').total, 2);
    assert.equal(room.levels.find((L) => L.level === '10').total, 2);
  }
  assert.ok(a.paperShareText(allLevels).includes('*10. sınıf: 2*'));
  assert.ok(a.paperSharePreview(allLevels).includes('share-levels'));
  assert.ok(message.includes(data.settings.exam) && message.includes('TOPLAM: 4 KÂĞIT'));
  assert.ok(a.renderSharePanel().includes('data-share-subject readonly'));
  const savedTitle = a.state.settings.exam;
  const archivedTitle = a.withEntry({ classes: a.state.classes, result: a.state.result, settings: { ...a.state.settings, exam: '2. Dönem 2. Sınav' } }, () => a.paperShareData('').title);
  assert.equal(archivedTitle, '2. Dönem 2. Sınav');
  assert.equal(a.state.settings.exam, savedTitle);
  for (const c of data.classes) for (const s of c.students) assert.ok(!message.includes(s.name), 'Paylaşım öğrenci adı içermemeli');
  const preview = a.paperSharePreview({ ...share, title: '<img src=x onerror=alert(1)>' });
  assert.ok(preview.includes('&lt;img') && !preview.includes('<img'), 'Paylaşım metni HTML olmamalı');
  const classHtml = a.renderByClass();
  assert.equal((classHtml.match(/data-class-toggle aria-expanded="false"/g) || []).length, 2);
  assert.equal((classHtml.match(/id="class-list-current-\d+" hidden/g) || []).length, 2);
  const body = { hidden: true };
  let expanded;
  const toggle = { closest: () => ({ querySelector: () => body }), setAttribute: (_, value) => { expanded = value; } };
  const event = { target: { closest: () => toggle } };
  a.toggleClassList(event); assert.equal(body.hidden, false); assert.equal(expanded, 'true');
  a.toggleClassList(event); assert.equal(body.hidden, true); assert.equal(expanded, 'false');
  a.expandPrintSections({ querySelectorAll: () => [body] });
  assert.equal(body.hidden, false, 'Kapalı sınıf listesi yazdırmadan önce ölçüm için açılmalı');
  assert.equal((classHtml.match(/data-fit-one="1"/g) || []).length, 2);
  assert.ok(!classHtml.includes('mm-cell') && !classHtml.includes('Krokide'));
  assert.ok(!a.searchRows('').includes('mm-cell'));
  assert.ok(!a.searchRows('').includes('data-delete-student'), 'Silme Öğrenci ara sayfasında değil');
  assert.equal(a.studentDeleteRows(''), '', 'Ad yazılmadan liste çıkmamalı');
  assert.ok(a.studentDeleteRows('Öğrenci 0-0').includes('data-delete-student="s0-0"'));
  assert.match(a.studentDeleteRows('yok-böyle-biri'), /bulunamadı/);
  const papers = a.renderPapers();
  assert.ok(papers.includes('data-share-action="text"') && papers.includes('SALON ZARFI'));
  assert.ok(!papers.includes('data-pmode') && !papers.includes('Şubeye göre') && !papers.includes('Şubelere göre'));
  assert.equal(a.buildPack({ oda: true }), '', 'Eski şube çıktısı tercihi uygulanmamalı');
  a.saveToArchive();
  const archiveBefore = JSON.stringify(a.state.archive);
  const button = { dataset: { deleteStudent: 's0-0' }, textContent: '' };
  a.deleteStudent(button);
  assert.equal(a.state.classes[0].students.length, 4, 'İlk tıklama yalnız onay istemeli');
  h.fail(true); a.deleteStudent(button);
  assert.equal(a.state.classes[0].students.length, 4, 'Kayıt başarısızsa silinmemeli');
  h.fail(false); a.deleteStudent(button);
  assert.equal(a.state.classes[0].students.length, 3);
  assert.equal(a.state.result, null);
  assert.equal(JSON.stringify(a.state.archive), archiveBefore, 'Eski sınavlar korunmalı');
  const afterDelete = harness(h.raw()); afterDelete.api.load();
  assert.equal(afterDelete.api.state.classes[0].students.length, 3, 'Silme kalıcı olmalı');
  // Yanlış silineni geri al ve elle öğrenci ekle
  const deletedName = 'Örnek Öğrenci 0-0';
  a.undoDelete();
  assert.equal(a.state.classes[0].students.length, 4, 'Geri al öğrenciyi geri koymalı');
  assert.ok(a.state.classes[0].students.some((x) => x.id === 's0-0' && x.name === deletedName));
  assert.equal(a.addStudent('  Yeni   Öğrenci ', 'c1'), true);
  assert.ok(a.state.classes[1].students.some((x) => x.name === 'Yeni Öğrenci'), 'Boşluklar düzeltilip eklenmeli');
  assert.equal(a.addStudent('Yeni Öğrenci', 'c1'), 'confirm', 'Aynı ad onay istemeli');
  assert.equal(a.addStudent('Yeni Öğrenci', 'c1', true), true);
  assert.equal(a.addStudent('', 'c1'), false); assert.equal(a.addStudent('Biri', 'yok'), false);
  h.fail(true); assert.equal(a.addStudent('Kayıtsız', 'c1'), false); h.fail(false);
  assert.ok(!a.state.classes[1].students.some((x) => x.name === 'Kayıtsız'), 'Kayıt başarısızsa eklenmemeli');
  for (let i = 0; i < 2; i++) { const yeni = a.state.classes[1].students.find((x) => x.name === 'Yeni Öğrenci');
    const b2 = { dataset: { deleteStudent: yeni.id, confirm: '1' }, textContent: '' }; a.deleteStudent(b2); }
  a.deleteStudent({ dataset: { deleteStudent: 's0-0', confirm: '1' }, textContent: '' });
  assert.equal(a.state.classes[0].students.length, 3);
  a.state = a.validateState(data); a.openEditor('c0'); a.editing.rows.pop();
  h.fail(true); a.saveEditor();
  assert.equal(a.state.classes[0].students.length, 4, 'Düzenleyicide başarısız kayıt silmeyi uygulamamalı');
  assert.ok(a.editing, 'Kayıt başarısızsa düzenleyici açık kalmalı');
  h.fail(false); a.saveEditor();
  assert.equal(a.state.classes[0].students.length, 3);
  assert.equal(a.state.stale, true);
  // Kilit, sürüm ve görünür kontrol özeti regresyonları.
  a.state = a.validateState(fixture());
  let audit = a.distributionAudit();
  assert.equal(audit.placed, 8); assert.equal(audit.expected, 8);
  assert.equal(audit.duplicates, 0); assert.equal(audit.capacityErrors, 0);
  assert.match(a.auditHtml(), /Tekrar yok/);
  a.stampResult(a.state.result, true);
  const firstId = a.state.result.distributionId;
  const firstLabel = a.distributionLabel();
  a.toggleDistributionLock(); assert.equal(a.state.result.locked, true);
  const lockedState = JSON.stringify(a.state);
  a.runDistribution(); a.onSeatClick(0, 0); a.loadSample(); a.openEditor('c0');
  a.deleteStudent({dataset:{studentDelete:'s0-0',confirm:'1'}});
  assert.equal(JSON.stringify(a.state), lockedState, 'Kilitli dağıtım değişmemeli');
  assert.equal(a.distributionLabel(), firstLabel, 'Kilit sürümü değiştirmemeli');
  const reloaded = harness(h.raw()); reloaded.api.load();
  assert.equal(reloaded.api.state.result.locked, true);
  h.fail(true); a.toggleDistributionLock(); assert.equal(a.state.result.locked, true);
  h.fail(false); a.toggleDistributionLock(); assert.equal(a.state.result.locked, false);
  a.onSeatClick(0,0); a.onSeatClick(1,0);
  assert.equal(a.state.result.distributionId, firstId);
  assert.equal(a.state.result.revision, 2);
  const label = a.distributionLabel();
  // Dağıtım kodu basılı evrakta kalır (başlık yerine sayfanın altında küçük yazıyla).
  assert.match(a.renderRoll(), /class="sheet-code"><span>Belge No: Dağıtım D-/);
  assert.doesNotMatch(a.headerMeta(), /Dağıtım D-/);
  assert.equal(a.paperShareData('').distribution, label);
  assert.ok(a.paperShareText(a.paperShareData('')).includes(label));
  assert.ok(a.paperSharePreview(a.paperShareData('')).includes(label));
  a.saveToArchive(); const archiveLabel = a.withEntry(a.state.archive[0], a.distributionLabel);
  a.stampResult(a.state.result);
  assert.equal(a.withEntry(a.state.archive[0], a.distributionLabel), archiveLabel);
  assert.notEqual(a.distributionLabel(), archiveLabel);
  a.state = a.validateState(fixture()); a.state.stale = true;
  a.toggleDistributionLock(); assert.ok(!a.state.result.locked);
  a.state = a.validateState(fixture());
  a.state.result.rooms[0].seats[0] = {...a.state.result.rooms[0].seats[1]};
  audit = a.distributionAudit(); assert.equal(audit.duplicates,1); assert.equal(audit.missing,1);
  a.state = a.validateState(fixture()); a.state.settings.capacityMode='custom'; a.state.classes[0].roomCap=1;
  assert.equal(a.distributionAudit().capacityErrors,1);
  a.toggleDistributionLock(); assert.ok(!a.state.result.locked);
  a.state = a.validateState(fixture());
  a.runDistribution(); const generatedId=a.state.result.distributionId;
  assert.ok(generatedId); assert.equal(a.state.result.revision,1);
  a.runDistribution(); assert.notEqual(a.state.result.distributionId,generatedId);
  const invalidLock=fixture(); invalidLock.result.locked='true';
  assert.throws(()=>a.validateState(invalidLock), /kilidi/);
  // Çıktı tasarımı önizlemesi kayıtlı dağıtıma ve ayarlara dokunmaz
  a.state = a.validateState(fixture());
  const beforePreview = JSON.stringify(a.state);
  h.node('#s-theme').value = 'resmi';
  a.renderThemePreview();
  assert.equal(JSON.stringify(a.state), beforePreview);
  const previewHtml = h.node('#theme-preview').innerHTML;
  assert.match(previewHtml, /class="pack-out tp-doc" data-doc-theme="resmi"/);
  assert.match(previewHtml, /Oturma planı/); assert.match(previewHtml, /Öğrenci imza listesi/);
  assert.doesNotMatch(previewHtml, /Örnek Öğrenci/, 'önizleme gerçek öğrenci adı göstermemeli');
  assert.match(previewHtml, /Örnek Okul/, 'girilen okul adı önizlemede görünür');
  h.node('#s-theme').value = '';
  // Sınav takvimi: oturum seçimi, sınavı olmayan sınıfın salon olmaması, onay
  {
    const hc = harness(), c = hc.api;
    const same = (x, y, m) => assert.equal(JSON.stringify(x), JSON.stringify(y), m);
    const classes = ['9/A', '9/B', '10/A', '12/A'].map((name, k) => ({ id: 'k' + k, name,
      students: Array.from({ length: 4 }, (_, i) => ({ id: `t${k}-${i}`, name: `Takvim Öğrenci ${k}-${i}` })) }));
    const calendar = { title: '2026-2027 1. Dönem 1. Ortak Sınav Takvimi — Örnek Anadolu Lisesi', classes: ['9-A', '9-B', '10-A', '11-A', '12-A'],
      notes: ['⚠ 4.11.2026 tarihli sınavın saati teyit edilecek.'], problems: [], approvals: {},
      sessions: [
        { id: 'S1', date: '2026-11-04', lesson: '2', label: '2. ders', exams: { '9-A': 'Biyoloji', '10-A': 'Biyoloji', '11-A': 'Biyoloji' }, blanks: ['12-A'] },
        { id: 'S2', date: '2026-11-05', lesson: '4', label: '4. ders', exams: { '12-A': 'Tarih' }, blanks: [] },
        { id: 'S3', date: '2026-11-12', lesson: '', label: 'Ülke geneli', exams: {}, blanks: [] },
      ] };
    c.state = c.validateState({ classes, settings: {}, result: null, archive: [], calendar });
    assert.ok(c.applySession('S1'));
    const st = c.state;
    assert.equal(st.settings.date, '2026-11-04'); assert.equal(st.settings.lesson, '2');
    assert.equal(st.settings.exam, '1. Dönem 1. Sınav'); assert.equal(st.settings.school, 'Örnek Anadolu Lisesi');
    same(st.classes.filter((x) => x.selected).map((x) => x.name), ['9/A', '10/A'], 'Yalnız sınavı olanlar seçilmeli');
    const g = c.sessionGroups();
    same([g.exam.length, g.free.length, g.missing], [2, 2, ['11-A']]);
    // Elle salon yapılmaya çalışılsa da sınavı olmayan sınıf salon olmaz
    st.classes.forEach((x) => { x.useAsRoom = true; });
    same(c.roomClasses().map((x) => x.name), ['9/A', '10/A']);
    const issues = c.calendarIssues().map((x) => x.text).join(' | ');
    assert.match(issues, /11-A şubesinin bu sınavı var ama listesi yüklü değil/);
    assert.match(issues, /12-A: takvimde bu hücre boş/);
    assert.match(issues, /Takvim notu/);
    c.runDistribution();
    same(c.state.result.rooms.map((r) => r.roomId).sort(), ['k0', 'k2']);
    same(c.state.result.subjects, { k0: 'Biyoloji', k2: 'Biyoloji' });
    assert.equal(c.state.result.sessionId, 'S1');
    assert.ok(c.state.result.warnings.some((w) => /^Takvim/.test(w)));
    assert.match(c.headerMeta(), /Sınav dersi.*Biyoloji/s);
    // Kapasite yetmezse sınavı olmayan sınıflar önerilir; onay olmadan salon açılmaz
    c.state.classes[1].selected = true; // 9/B sınavsız ama elle seçildi
    assert.ok(c.capTotals().seats < c.capTotals().students);
    const bad = c.calendarIssues().find((x) => x.level === 'bad');
    assert.ok(bad && bad.approve.some((x) => x.name === '12/A'));
    assert.ok(c.calendarIssues().some((x) => /9\/B şubesinin bu sınavı yok ama seçildi/.test(x.text)));
    assert.ok(c.setRoomApproval('k3', true), 'Onaylanınca salon açılmalı');
    same(c.state.calendar.approvals, { S1: ['k3'] });
    assert.ok(c.roomClasses().some((x) => x.name === '12/A'));
    assert.ok(c.calendarIssues().some((x) => /onayınızla salon/.test(x.text)));
    assert.ok(c.setRoomApproval('k3', false));
    assert.ok(!c.roomClasses().some((x) => x.name === '12/A'));
    // Oturum değişince seçim takvime göre yenilenir, eski dağıtım güncel değil olur
    assert.ok(c.applySession('S2'));
    same(c.state.classes.filter((x) => x.selected).map((x) => x.name), ['12/A']);
    assert.equal(c.state.stale, true);
    assert.ok(c.calendarIssues().some((x) => /yalnızca 12\. sınıf/.test(x.text) || /yan yana oturur/.test(x.text)));
    c.state.settings.sessionId = 'S3';
    assert.equal(c.calendarIssues()[0].level, 'bad');
    // Kayıt/yedek doğrulaması takvimi korur, bozuk takvimi reddeder
    const round = c.validateState(JSON.parse(JSON.stringify(c.state)));
    assert.equal(round.calendar.sessions.length, 3); assert.equal(round.settings.sessionId, 'S3');
    const broken = JSON.parse(JSON.stringify(c.state)); broken.calendar.sessions[0].date = '2026-02-31';
    assert.throws(() => c.validateState(broken), /Takvim oturumu/);
    const noCal = c.validateState({ classes, settings: {}, result: null, archive: [] });
    assert.equal(noCal.calendar, null);
    // Yeni şablon dosyası: önizleme → onay → mevcut takvime ekleme; eski kimlikli kayıt yeni kimliğe bağlanır
    {
      c.state = c.validateState({ classes, settings: {}, result: null, archive: [], calendar: { ...calendar,
        sessions: calendar.sessions.map((x) => (x.id === 'S3' ? { ...x, id: '2026-11-12_c13' } : x)), approvals: { '2026-11-12_c13': ['k3'] } } });
      c.state.settings.sessionId = '2026-11-12_c13';
      c.state.archive.push({ id: 'arc1', exam: 'Eski', date: '2026-11-12', settings: { ...c.state.settings, sessionId: '2026-11-12_c13' }, classes: [], result: null });
      const parsed = { title: '2026-2027 1. Dönem 2. Ortak Sınav Takvimi', fileName: 'ikinci.xlsx', sheets: ['Takvim'], notes: [], problems: [],
        classes: ['9-*', '10-A', '12-A'],
        sessions: [
          { id: '2026-11-12_ulkegeneli', date: '2026-11-12', lesson: '', time: '', label: 'Ülke geneli', exams: {}, blanks: [] },
          { id: '2027-01-05_2ders', date: '2027-01-05', lesson: '2', time: '', label: '2. ders', exams: { '9-*': 'Fizik', '10-A': 'Fizik' }, blanks: [] },
        ] };
      const before = JSON.stringify(c.state.calendar);
      c.previewCalendar(parsed);
      assert.match(hc.node('#cal-dlg-body').innerHTML, /Takvim önizlemesi/);
      assert.match(hc.node('#cal-dlg-body').innerHTML, /Takvime ekle/);
      assert.equal(JSON.stringify(c.state.calendar), before, 'Önizleme onaysız kaydetmemeli');
      assert.ok(c.confirmCalendar('merge'));
      const ids = c.state.calendar.sessions.map((x) => x.id);
      same(ids, ['S1', 'S2', '2026-11-12_ulkegeneli', '2027-01-05_2ders']);
      assert.equal(c.state.settings.sessionId, '2026-11-12_ulkegeneli', 'Seçili oturum yeni kimliğe taşınmalı');
      same(c.state.calendar.approvals['2026-11-12_ulkegeneli'], ['k3']);
      assert.equal(c.state.archive[0].settings.sessionId, '2026-11-12_ulkegeneli', 'Kayıtlı sınav yeni kimliğe bağlanmalı');
      assert.equal(c.state.calendar.sources.length, 1);
      // "9. Sınıflar" satırı bütün 9. sınıf şubelerine uygulanır
      assert.ok(c.applySession('2027-01-05_2ders'));
      same(c.state.classes.filter((x) => x.selected).map((x) => x.name), ['9/A', '9/B', '10/A']);
      assert.equal(c.sessionGroups().missing.length, 0);
      const reload = c.validateState({ ...JSON.parse(JSON.stringify(c.state)), archive: [] });
      assert.equal(reload.calendar.sources.length, 1);
      // Değiştir seçeneği eski oturumları bırakır
      c.previewCalendar(parsed); assert.ok(c.confirmCalendar('replace'));
      same(c.state.calendar.sessions.map((x) => x.id), ['2026-11-12_ulkegeneli', '2027-01-05_2ders']);
    }
    // Planlanmış sınav seçiliyken tarih elle değişirse bağlantı kalkar; elle giriş önceki gibi çalışır
    {
      c.state = c.validateState({ classes, settings: {}, result: null, archive: [], calendar });
      assert.ok(c.applySession('S1'));
      const set = (date, lesson) => { for (const [id, v] of Object.entries({ 's-school': 'Okul', 's-exam': '1. Dönem 1. Sınav', 's-date': date, 's-time': '', 's-lesson': lesson, 's-header-note': '', 's-cols': '3', 's-spd': '2', 's-sides': 'lr', 's-theme': 'kurumsal' })) hc.node('#' + id).value = v; };
      set('2026-11-04', '2'); c.readSettings({ type: 'change' });
      assert.equal(c.state.settings.sessionId, 'S1', 'Aynı tarih/ders bağlantıyı korumalı');
      set('2026-11-20', '2'); c.readSettings({ type: 'change' });
      assert.equal(c.state.settings.sessionId, '', 'Elle değişen tarih bağlantıyı kaldırmalı');
      assert.equal(c.state.settings.date, '2026-11-20');
      same(c.roomClasses().map((x) => x.name), ['9/A', '10/A'], 'Elle girişte salon seçimi kullanıcıda kalır');
    }
    // Kilitliyken oturum değiştirilemez
    c.state = c.validateState({ classes, settings: {}, result: null, archive: [], calendar });
    c.applySession('S1'); c.runDistribution(); c.toggleDistributionLock();
    const lockedCal = JSON.stringify(c.state);
    c.applySession('S2'); c.setRoomApproval('k3', true);
    assert.equal(JSON.stringify(c.state), lockedCal, 'Kilitli dağıtımda takvim seçimi değişmemeli');
  }
  console.log('Dağıtım özeti, kilit kalıcılığı, kilitli değişiklikler, sürüm, paylaşım ve arşiv regresyonları geçti.');
  console.log('Paylaşım sayıları/gizlilik, kaldırılan görünümler ve öğrenci silme regresyonları geçti.');
  console.log('Kayıt, arşiv, yedek, kota, göç, takas, tarih ve CSV regresyon testleri geçti.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
