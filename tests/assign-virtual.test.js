// Sanal okullarla dağıtım testi:  node tests/assign-virtual.test.js
// Rastgele (ama tohumu sabit) okullar üretir; her dağıtımda temel kuralları denetler:
// herkes bir kez yerleşir, kapasite aşılmaz, istatistik ve uyarılar tutarlıdır,
// yer yeterliyse aynı düzeyden sıra arkadaşı çıkmaz, "kendi sınıfında oturmasın"
// seçeneği mümkün olan en iyi sonucu verir.
const assert = require('assert');
const A = require('../assets/assign.js');

const TRIALS = Number(process.env.VIRTUAL_TRIALS || 160);
const rnd = A.mulberry32(20261104);
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const LEVELS = ['9', '10', '11', '12', 'Hazırlık'];
let sid = 0;

function school() {
  const classes = [];
  for (const lv of LEVELS.slice(0, ri(1, 5))) {
    for (let k = 0, n = ri(1, 5); k < n; k++) {
      classes.push({ id: 'c' + classes.length, name: lv + pick(['/', '-', ' / ']) + 'ABCDE'[k],
        students: Array.from({ length: ri(5, 36) }, () => ({ id: 's' + (sid++) })) });
    }
  }
  return classes;
}

/** Kendi sınıfına düşmeden yerleşebilecek en çok öğrenci (en büyük akış). */
function maxAwayFromOwnRoom(list, rooms) {
  const n = 2 + list.length + rooms.length, S = 0, T = n - 1;
  const cap = Array.from({ length: n }, () => new Array(n).fill(0));
  list.forEach((c, i) => {
    cap[S][1 + i] = c.students.length;
    rooms.forEach((rm, j) => { if (rm.id !== c.id) cap[1 + i][1 + list.length + j] = 1e9; });
  });
  rooms.forEach((rm, j) => { cap[1 + list.length + j][T] = rm.cap; });
  let flow = 0;
  for (;;) {
    const prev = new Array(n).fill(-1); prev[S] = S;
    const q = [S];
    while (q.length && prev[T] < 0) {
      const u = q.shift();
      for (let v = 0; v < n; v++) if (prev[v] < 0 && cap[u][v] > 0) { prev[v] = u; q.push(v); }
    }
    if (prev[T] < 0) return flow;
    let f = Infinity;
    for (let v = T; v !== S; v = prev[v]) f = Math.min(f, cap[prev[v]][v]);
    for (let v = T; v !== S; v = prev[v]) { cap[prev[v]][v] -= f; cap[v][prev[v]] += f; }
    flow += f;
  }
}

let done = 0, expectedErrors = 0;
for (let t = 0; t < TRIALS; t++) {
  const classes = school();
  const total = classes.reduce((a, c) => a + c.students.length, 0);
  const settings = { seed: ri(1, 1e9), deskCols: ri(2, 4), seatsPerDesk: rnd() < 0.2 ? 1 : 2, avoidOwnRoom: rnd() < 0.3 };
  const mode = rnd();
  if (mode < 0.25) {
    settings.capacityMode = 'custom';
    classes.forEach((c) => { c.roomCap = pick([null, '', c.students.length, c.students.length + ri(0, 12), Math.max(0, c.students.length - ri(0, 8)), 0]); });
  } else if (mode < 0.45) {
    const rooms = classes.filter(() => rnd() < 0.7).map((c) => ({ id: c.id, name: c.name, capacity: ri(20, 44) }));
    for (let k = 0, n = ri(0, 3); k < n; k++) rooms.push({ id: 'x' + k, name: 'Ek ' + k, capacity: ri(20, 44), deskCols: ri(2, 4) });
    settings.rooms = rooms;
  }
  if (rnd() < 0.15) classes.forEach((c) => { if (rnd() < 0.3) c.deskCols = ri(2, 4); });
  const ctx = 'deneme ' + t + ' ' + JSON.stringify(settings);

  let r;
  try { r = A.distribute(classes, settings); } catch (e) {
    assert.match(e.message, /öğrenci sayısından|en az bir sınıf/, ctx);
    expectedErrors++;
    continue;
  }
  done++;
  const classOf = new Map();
  classes.forEach((c) => c.students.forEach((s) => classOf.set(s.id, c.id)));
  const seen = new Set();
  let seats = 0;
  for (const room of r.rooms) {
    assert.strictEqual(room.seats.length, room.capacity, ctx);
    seats += room.seats.length;
    room.seats.forEach((s, i) => {
      assert.strictEqual(s.seatNo, i + 1, ctx);
      if (s.empty) return;
      assert.ok(classOf.has(s.studentId) && !seen.has(s.studentId), ctx);
      assert.strictEqual(classOf.get(s.studentId), s.classId, ctx);
      seen.add(s.studentId);
    });
  }
  assert.strictEqual(seen.size, total, 'herkes yerleşmeli · ' + ctx);
  assert.deepStrictEqual(A.evaluate(r.rooms, classes, { cols: settings.deskCols, spd: settings.seatsPerDesk }), r.stats, ctx);
  assert.strictEqual(r.stats.deskmate > 0, r.warnings.some((w) => /aynı düzeyden iki öğrenci/.test(w)), ctx);
  assert.strictEqual(seats > total, r.warnings.some((w) => /koltuk boş kaldı/.test(w)), ctx);

  let roomy = false;
  if (settings.seatsPerDesk === 2) {
    const desks = r.rooms.reduce((a, x) => a + Math.ceil(x.seats.length / 2), 0);
    const byLevel = {};
    classes.forEach((c) => { const l = A.levelOf(c.name); byLevel[l] = (byLevel[l] || 0) + c.students.length; });
    const counts = Object.values(byLevel);
    const bound = counts.reduce((a, n) => a + Math.max(0, n - desks), 0);
    assert.ok(r.stats.deskmate >= bound, ctx);
    if (counts.length > 1 && counts.every((n) => n <= 0.85 * desks)) assert.strictEqual(r.stats.deskmate, 0, 'yer yeterli · ' + ctx);
    roomy = counts.length > 2 && counts.every((n) => n <= 0.5 * desks);
  }
  if (settings.avoidOwnRoom) {
    const list = classes.filter((c) => c.students.length);
    const best = total - maxAwayFromOwnRoom(list, r.rooms.map((x) => ({ id: x.roomId, cap: x.capacity })));
    // Ana kural önceliklidir: kendi sınıfından kaçınmak aynı düzeyden sıra arkadaşı
    // doğuracaksa algoritma öğrenciyi kendi sınıfına koyabilir (ve uyarır).
    // Yer bolken kendi sınıfında oturan sayısı mümkün olan en az değerde olmalı.
    assert.ok(r.stats.ownRoom >= best, ctx);
    if (r.stats.ownRoom > 0) assert.ok(r.warnings.some((w) => /kendi sınıfında/.test(w)), ctx);
    if (roomy) assert.strictEqual(r.stats.ownRoom, best, 'kendi sınıfında oturan sayısı en az olmalı · ' + ctx);
  }
}
assert.ok(done > TRIALS * 0.6, 'denemelerin çoğu dağıtılabilmeli');
console.log('Sanal okul testleri geçti: ' + done + ' dağıtım, ' + expectedErrors + ' beklenen kapasite hatası.');
