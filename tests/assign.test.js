// Dağıtım algoritması testleri:  node tests/assign.test.js
// Kural: aynı sınıf düzeyindeki (9/A, 9/B, ...) öğrenciler yan yana oturmaz;
// öğrenci kendi sınıfında oturabilir.
const assert = require('assert');
const A = require('../assets/assign.js');

function mk(name, n) {
  return { id: name, name, students: Array.from({ length: n }, (_, i) => ({ id: name + '#' + i })) };
}
function check(spec, settings) {
  const classes = spec.map(([name, n]) => mk(name, n));
  const r = A.distribute(classes, { deskCols: 3, seed: 1, ...settings });
  const seen = new Set();
  r.rooms.forEach((room, j) => {
    assert.strictEqual(room.seats.length, spec[j][1], 'salon kapasitesi = sınıf mevcudu');
    for (const s of room.seats) {
      assert.ok(!seen.has(s.studentId), 'öğrenci iki kez yerleşmiş');
      seen.add(s.studentId);
    }
  });
  assert.strictEqual(seen.size, spec.reduce((a, b) => a + b[1], 0), 'her öğrenci yerleşmeli');
  // Sıra arkadaşlarını doğrudan say (evaluate'ten bağımsız)
  let sameLevelDesk = 0;
  for (const room of r.rooms) {
    const lay = A.seatLayout(room.seats.length, room.cols, room.spd);
    for (const e of lay.edges) {
      if (e.kind !== 'desk' && e.kind !== 'side') continue;
      if (A.levelOf(room.seats[e.a].classId) === A.levelOf(room.seats[e.b].classId)) sameLevelDesk++;
    }
  }
  assert.strictEqual(sameLevelDesk, r.stats.deskmate);
  return r;
}

// Tipik lise: her düzeyde birden çok şube. Aynı düzey yan yana olmamalı.
const school = [
  ['9/A', 32], ['9/B', 30], ['9/C', 31], ['10/A', 28], ['10/B', 35], ['10/C', 29],
  ['11/A', 31], ['11/B', 30], ['12/A', 27], ['12/B', 33],
];
for (let seed = 1; seed <= 5; seed++) {
  const r = check(school, { seed });
  assert.strictEqual(r.stats.deskmate, 0, 'aynı sırada aynı düzey');
  assert.strictEqual(r.stats.frontBack, 0, 'önlü-arkalı aynı düzey');
  assert.deepStrictEqual(r.warnings, []);
}

// Kendi sınıfında oturmak serbest (varsayılan); seçenek açılırsa engellenir.
const free = check(school, {});
assert.ok(free.stats.ownRoom >= 0);
const strict = check(school, { avoidOwnRoom: true });
assert.strictEqual(strict.stats.ownRoom, 0);
assert.strictEqual(strict.stats.deskmate, 0);

// Tekli sıra, 2'li ve 4'lü düzen
for (const s of [{ seatsPerDesk: 1 }, { deskCols: 2 }, { deskCols: 4 }]) {
  assert.strictEqual(check(school, s).stats.deskmate, 0, JSON.stringify(s));
}

// Tek sayılı ve küçük mevcutlar
assert.strictEqual(check([['9/A', 7], ['10/A', 5], ['11/A', 3]], {}).stats.deskmate, 0);

// İki düzey eşit büyüklükte: tam kelebek mümkün
const twoLevels = check([['9/A', 20], ['9/B', 20], ['10/A', 22], ['10/B', 18]], {});
assert.strictEqual(twoLevels.stats.deskmate, 0);

// Bir düzey diğerlerinin toplamından büyükse herkes yine yerleşir, uyarı verilir.
const skew = check([['9/A', 30], ['9/B', 30], ['10/A', 20]], {});
assert.ok(skew.warnings.some((w) => /aynı düzeyden iki öğrenci/.test(w)));
assert.ok(skew.stats.deskmate > 0);

// Tüm sınıflar aynı düzeyde
assert.ok(check([['9/A', 20], ['9/B', 20]], {}).warnings.some((w) => /aynı düzeyde/.test(w)));

// Aynı tohum aynı sonucu verir
const a = A.distribute([mk('9/A', 20), mk('10/A', 22), mk('11/A', 21)], { seed: 99 });
const b = A.distribute([mk('9/A', 20), mk('10/A', 22), mk('11/A', 21)], { seed: 99 });
assert.deepStrictEqual(a.rooms.map((r) => r.seats.map((s) => s.studentId)), b.rooms.map((r) => r.seats.map((s) => s.studentId)));

// Salon başına özel sıra düzeni
const cls = [mk('9/A', 24), mk('10/A', 24), mk('11/A', 24)];
cls[1].deskCols = 2;
assert.deepStrictEqual(A.distribute(cls, { seed: 3, deskCols: 3 }).rooms.map((r) => r.cols), [3, 2, 3]);

// Düzey tanıma
assert.strictEqual(A.levelOf('9/A'), '9');
assert.strictEqual(A.levelOf('10-B (örnek)'), '10');
assert.strictEqual(A.levelOf('Hazırlık/A'), A.levelOf('Hazırlık-B'));

// Öğretmenin belirlediği kapasite
function custom(spec, capsList, extra) {
  const classes = spec.map(([name, n], i) => ({ ...mk(name, n), roomCap: capsList[i] }));
  return A.distribute(classes, { seed: 5, capacityMode: 'custom', ...extra });
}
const spec4 = [['9/A', 30], ['9/B', 30], ['10/A', 30], ['11/A', 30]];
// Kapasite fazla: herkes yerleşir, boş koltuk kalır, aynı düzey yan yana olmaz
const more = custom(spec4, [36, 36, 36, 36]);
const placedIds = more.rooms.flatMap((r) => r.seats.filter((x) => !x.empty).map((x) => x.studentId));
assert.strictEqual(new Set(placedIds).size, 120);
assert.deepStrictEqual(more.rooms.map((r) => r.seats.length), [36, 36, 36, 36]);
assert.strictEqual(more.rooms.flatMap((r) => r.seats).filter((x) => x.empty).length, 24);
assert.strictEqual(more.stats.deskmate, 0);
// Salonlar orantılı dolar (her biri ~30)
for (const r of more.rooms) assert.ok(Math.abs(r.seats.filter((x) => !x.empty).length - 30) <= 2);
// 0 kapasiteli şube salon olmaz ama öğrencileri dağıtılır
const zero = custom(spec4, [40, 40, 0, 40]);
assert.strictEqual(zero.rooms.length, 3);
assert.strictEqual(zero.rooms.flatMap((r) => r.seats).filter((x) => !x.empty).length, 120);
assert.strictEqual(zero.stats.deskmate, 0);
// Kapasite yetersiz: anlaşılır hata
assert.throws(() => custom(spec4, [20, 20, 20, 20]), /kapasitesi \(80\) öğrenci sayısından \(120\) az/);
// Belirtilmeyen kapasite mevcut sayılır
const partial = custom(spec4, [null, '', 34, 30]);
assert.deepStrictEqual(partial.rooms.map((r) => r.seats.length), [30, 30, 34, 30]);
// Tek düzeyde kalabalık: boş koltuklar ayırıcı olur (9'lar 60, kapasite 120 -> ihlal yok)
const sep = custom([['9/A', 30], ['9/B', 30], ['10/A', 10]], [40, 40, 40]);
assert.strictEqual(sep.stats.deskmate, 0);

console.log('Dağıtım testleri geçti.');
