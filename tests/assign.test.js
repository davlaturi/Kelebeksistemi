// Dağıtım algoritması testleri:  node tests/assign.test.js
const assert = require('assert');
const A = require('../assets/assign.js');

function mk(name, n) {
  return { id: name, name, students: Array.from({ length: n }, (_, i) => ({ id: name + '#' + i })) };
}
function check(sizes, names, settings) {
  const classes = sizes.map((n, i) => mk(names[i], n));
  const r = A.distribute(classes, { deskCols: 3, avoidOwnRoom: true, avoidSameLevel: true, seed: 1, ...settings });
  const seen = new Set();
  r.rooms.forEach((room, j) => {
    assert.strictEqual(room.seats.length, sizes[j], 'salon kapasitesi = sınıf mevcudu');
    for (const s of room.seats) {
      assert.ok(!seen.has(s.studentId), 'öğrenci iki kez yerleşmiş');
      seen.add(s.studentId);
    }
  });
  assert.strictEqual(seen.size, sizes.reduce((a, b) => a + b, 0), 'her öğrenci yerleşmeli');
  return r;
}

const L = ['9/A', '9/B', '10/A', '10/B', '11/A', '11/B', '12/A', '12/B', '9/C', '10/C', '11/C', '12/C'];

// Tipik okul: hiçbir kural ihlali olmamalı
for (let seed = 1; seed <= 5; seed++) {
  const r = check([32, 30, 28, 35, 31, 29], L, { seed });
  assert.strictEqual(r.stats.deskmate, 0);
  assert.strictEqual(r.stats.frontBack, 0);
  assert.strictEqual(r.stats.ownRoom, 0);
}
const big = check([34, 33, 35, 30, 32, 31, 36, 29, 28, 30, 33, 34], L, {});
assert.strictEqual(big.stats.deskmate, 0);
assert.strictEqual(big.stats.ownRoom, 0);

// Tekli sıra ve 2'li / 4'lü düzen
for (const s of [{ seatsPerDesk: 1 }, { deskCols: 2 }, { deskCols: 4 }]) {
  const r = check([30, 27, 25, 33], L, s);
  assert.strictEqual(r.stats.deskmate, 0, JSON.stringify(s));
}

// Tek sayılı mevcutlar ve çok küçük sınıflar
assert.strictEqual(check([7, 5, 3], L, {}).stats.deskmate, 0);

// İki eşit sınıf: kendi sınıfında olmama kuralı sıra kuralıyla çelişir;
// sıra kuralı korunur, uyarı verilir.
const two = check([20, 20], L, {});
assert.strictEqual(two.stats.deskmate, 0);
assert.ok(two.warnings.length > 0);

// 25/26/27: kendi sınıfı kuralı tam sağlanamaz ama ihlal en az olmalı
const tri = check([25, 26, 27], ['9/A', '10/A', '11/A'], {});
assert.strictEqual(tri.stats.deskmate, 0);
assert.ok(tri.stats.ownRoom <= 2, 'kendi sınıfında kalan: ' + tri.stats.ownRoom);

// Bir sınıf diğerlerinin toplamından büyükse yine herkes yerleşmeli
const skew = check([30, 10], L, {});
assert.ok(skew.warnings.some((w) => /aynı sınıftan iki öğrenci/.test(w)));

// Aynı tohum aynı sonucu verir
const a = A.distribute([mk('9/A', 20), mk('10/A', 22), mk('11/A', 21)], { seed: 99 });
const b = A.distribute([mk('9/A', 20), mk('10/A', 22), mk('11/A', 21)], { seed: 99 });
assert.deepStrictEqual(a.rooms.map((r) => r.seats.map((s) => s.studentId)), b.rooms.map((r) => r.seats.map((s) => s.studentId)));

// Salon başına özel sıra düzeni
const cls = [mk('9/A', 24), mk('10/A', 24), mk('11/A', 24)];
cls[1].deskCols = 2;
const custom = A.distribute(cls, { seed: 3, deskCols: 3 });
assert.deepStrictEqual(custom.rooms.map((r) => r.cols), [3, 2, 3]);

console.log('Dağıtım testleri geçti.');
