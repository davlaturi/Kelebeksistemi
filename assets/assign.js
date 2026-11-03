/*
 * Kelebek dağıtım algoritması.
 *
 * İki aşamada çalışır:
 *  1) Paylaştırma: Her sınıftan her salona kaç öğrenci gideceği, maksimum akış
 *     (max-flow) ile bulunur. Kısıtlar:
 *       - her salon tam kapasite dolar (kapasite = o sınıfın öğrenci sayısı),
 *       - bir sınıftan bir salona en fazla "sıra sayısı" kadar öğrenci gider
 *         (böylece aynı sınıftan iki öğrenci aynı sıraya oturmak zorunda kalmaz),
 *       - isteğe bağlı: öğrenci kendi sınıfında sınava girmez,
 *       - sınıflar salonlara olabildiğince orantılı (dengeli) dağılır.
 *  2) Yerleştirme: Her salonda öğrenciler, aynı sınıftan olanlar yan yana
 *     (sıra arkadaşı), önlü-arkalı ve çapraz komşu olmayacak şekilde yerleştirilir.
 *     Sıra arkadaşı kuralı yapısal olarak garanti edilir; diğer komşuluklar
 *     tavlama (simulated annealing) ile en aza indirilir.
 *
 * Tarayıcıda `window.KelebekAssign`, Node'da `module.exports` olarak kullanılır.
 */
(function (root) {
  'use strict';

  // ---------- yardımcılar ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /** Sınıf adından seviye: "9/A" -> "9", "Hazırlık-B" -> "HAZIRLIK" */
  function levelOf(name) {
    const s = String(name || '').trim();
    const m = s.match(/^(\d{1,2})/);
    if (m) return m[1];
    const w = s.split(/[\s\/\-.]+/)[0] || s;
    return w.toLocaleUpperCase('tr-TR');
  }

  // ---------- minimum maliyetli akış ----------
  function MinCostFlow(n) {
    this.n = n;
    this.g = [];
    for (let i = 0; i < n; i++) this.g.push([]);
  }
  MinCostFlow.prototype.addEdge = function (u, v, cap, cost) {
    const a = { to: v, cap, cost, rev: this.g[v].length, orig: cap };
    const b = { to: u, cap: 0, cost: -cost, rev: this.g[u].length, orig: 0 };
    this.g[u].push(a);
    this.g[v].push(b);
    return a;
  };
  /** Ardışık en kısa yollar (SPFA). Akışı ve toplam maliyeti döndürür. */
  MinCostFlow.prototype.run = function (s, t, maxFlow) {
    const n = this.n, g = this.g;
    let flow = 0, cost = 0;
    const dist = new Array(n), inq = new Array(n), pv = new Array(n), pe = new Array(n);
    while (flow < maxFlow) {
      dist.fill(Infinity); inq.fill(false);
      dist[s] = 0;
      const q = [s]; inq[s] = true;
      for (let qi = 0; qi < q.length; qi++) {
        const u = q[qi]; inq[u] = false;
        const du = dist[u];
        const gu = g[u];
        for (let k = 0; k < gu.length; k++) {
          const e = gu[k];
          if (e.cap > 0 && du + e.cost < dist[e.to]) {
            dist[e.to] = du + e.cost; pv[e.to] = u; pe[e.to] = k;
            if (!inq[e.to]) { inq[e.to] = true; q.push(e.to); }
          }
        }
      }
      if (dist[t] === Infinity) break;
      let f = maxFlow - flow;
      for (let v = t; v !== s; v = pv[v]) f = Math.min(f, g[pv[v]][pe[v]].cap);
      for (let v = t; v !== s; v = pv[v]) {
        const e = g[pv[v]][pe[v]];
        e.cap -= f; g[v][e.rev].cap += f;
      }
      flow += f; cost += f * dist[t];
    }
    return { flow, cost };
  };

  const COST_OWN = 1000;      // öğrenci kendi sınıfında
  const COST_DESK = 100000;   // aynı sınıftan iki kişi aynı sırada zorunlu

  /**
   * Sınıf -> salon öğrenci sayısı matrisini bulur.
   * Önce sıra kuralını, sonra "kendi sınıfında olmasın" kuralını, en son
   * dengeli dağılımı gözeten minimum maliyetli akış kullanılır.
   * @param {number[]} sizes  sınıf mevcutları
   * @param {number[]} caps   salon kapasiteleri
   * @param {number[]} owner  salonun sahibi olan sınıfın indeksi (yoksa -1)
   * @param {{avoidOwnRoom:boolean, rnd:Function}} opts
   */
  function allocate(sizes, caps, owner, opts) {
    const K = sizes.length, R = caps.length;
    const N = sizes.reduce((a, b) => a + b, 0);
    const C = caps.reduce((a, b) => a + b, 0);
    if (N !== C) throw new Error('Toplam öğrenci sayısı (' + N + ') toplam salon kapasitesine (' + C + ') eşit değil.');
    const deskCap = caps.map((c) => Math.ceil(c / 2));
    const own = (i, j) => opts.avoidOwnRoom && owner[j] === i;
    // Orantılı hedef: salon j, kendi sınıfı dışındakilerden mevcutlarıyla orantılı alır.
    const neff = caps.map((_, j) => {
      let s = 0;
      for (let i = 0; i < K; i++) if (!own(i, j)) s += sizes[i];
      return s || N;
    });

    const S = K + R, T = K + R + 1;
    const mcf = new MinCostFlow(K + R + 2);
    const cells = [];
    const classOrder = shuffle(sizes.map((_, i) => i), opts.rnd);
    const roomOrder = shuffle(caps.map((_, j) => j), opts.rnd);
    for (const i of classOrder) mcf.addEdge(S, i, sizes[i], 0);
    for (const i of classOrder) {
      for (const j of roomOrder) {
        const base = own(i, j) ? COST_OWN : 0;
        const ub = Math.min(caps[j], sizes[i]);
        const dc = Math.min(deskCap[j], ub);
        const target = own(i, j) ? 0 : Math.min(dc, Math.ceil((sizes[i] * caps[j]) / neff[j]));
        const tiers = [];
        // [0, hedef] ücretsiz; hedefin 2 fazlasına kadar az; sonrası daha pahalı;
        // sıra sınırını aşan kısım çok pahalı.
        tiers.push([target, base]);
        tiers.push([Math.min(dc, target + 2) - target, base + 3]);
        tiers.push([dc - Math.min(dc, target + 2), base + 12]);
        tiers.push([ub - dc, base + COST_DESK]);
        const es = [];
        for (const [cap, cost] of tiers) if (cap > 0) es.push(mcf.addEdge(i, K + j, cap, cost));
        cells.push({ i, j, es });
      }
    }
    for (const j of roomOrder) mcf.addEdge(K + j, T, caps[j], 0);
    const res = mcf.run(S, T, N);
    if (res.flow !== N) throw new Error('Dağıtım bulunamadı.');

    const matrix = sizes.map(() => caps.map(() => 0));
    for (const c of cells) for (const e of c.es) matrix[c.i][c.j] += e.orig - e.cap;
    let ownCount = 0, deskOver = 0;
    for (let i = 0; i < K; i++) for (let j = 0; j < R; j++) {
      if (owner[j] === i) ownCount += matrix[i][j];
      deskOver += Math.max(0, matrix[i][j] - deskCap[j]);
    }
    return { matrix, ownRoomCount: opts.avoidOwnRoom ? ownCount : 0, deskOverflow: deskOver };
  }

  // ---------- salon geometrisi ----------
  /**
   * Oturma düzeni. Sıralar soldan sağa, önden arkaya numaralanır.
   * @param {number} cap   koltuk sayısı
   * @param {number} cols  bir sıra hizasındaki sıra (masa) sayısı
   * @param {number} spd   sıra başına öğrenci (1 veya 2)
   */
  function seatLayout(cap, cols, spd) {
    cols = Math.max(1, cols | 0);
    spd = spd === 1 ? 1 : 2;
    const seats = [];
    for (let s = 0; s < cap; s++) {
      const desk = Math.floor(s / spd);
      seats.push({ index: s, desk, side: s % spd, row: Math.floor(desk / cols), col: desk % cols });
    }
    const at = new Map();
    for (const st of seats) at.set(st.row + ':' + st.col + ':' + st.side, st.index);
    const get = (r, c, sd) => at.get(r + ':' + c + ':' + sd);
    const edges = [];
    const add = (a, b, w, kind) => { if (a !== undefined && b !== undefined && a !== b) edges.push({ a, b, w, kind }); };
    for (const st of seats) {
      const { row, col, side } = st;
      if (spd === 2) {
        if (side === 0) add(st.index, get(row, col, 1), 100, 'desk');           // sıra arkadaşı
        if (side === 1) add(st.index, get(row, col + 1, 0), 4, 'aisle');        // koridorun karşısı
        add(st.index, get(row + 1, col, side), 10, 'front');                     // önlü-arkalı
        add(st.index, get(row + 1, col, 1 - side), 1, 'diag');                   // çapraz
      } else {
        add(st.index, get(row, col + 1, 0), 60, 'side');                         // yan yana
        add(st.index, get(row + 1, col, 0), 10, 'front');
        add(st.index, get(row + 1, col + 1, 0), 2, 'diag');
        add(st.index, get(row + 1, col - 1, 0), 2, 'diag');
      }
    }
    const adj = seats.map(() => []);
    for (const e of edges) { adj[e.a].push(e); adj[e.b].push(e); }
    const rows = cap ? seats[cap - 1].row + 1 : 0;
    return { seats, edges, adj, rows, cols, spd };
  }

  /**
   * Bir salondaki koltuklara sınıf etiketleri yerleştirir.
   * @param {number[]} counts  her sınıftan bu salona gelecek öğrenci sayısı
   * @param {string[]} levels  sınıf seviyeleri (aynı seviye cezası için)
   */
  function arrangeRoom(layout, counts, levels, opts) {
    const cap = layout.seats.length;
    const rnd = opts.rnd;
    const levelFactor = opts.avoidSameLevel ? 0.12 : 0;
    const pairCost = (x, y, w) => {
      if (x === y) return w;
      if (levelFactor && levels[x] === levels[y]) return w * levelFactor;
      return 0;
    };

    // Başlangıç: önce tüm sol koltuklar, sonra sağ koltuklar; sınıflar büyükten
    // küçüğe ardışık bloklar halinde. Hiçbir sınıf sıra sayısını aşmadıkça
    // aynı sınıftan iki kişi aynı sıraya düşmez.
    const order = [];
    for (let side = 0; side < layout.spd; side++) {
      for (const st of layout.seats) if (st.side === side) order.push(st.index);
    }
    const classes = counts.map((c, k) => ({ k, c })).filter((x) => x.c > 0);
    const sorted = shuffle(classes, rnd).sort((a, b) => b.c - a.c);
    const init = new Array(cap);
    let p = 0;
    for (const { k, c } of sorted) for (let n = 0; n < c; n++) init[order[p++]] = k;

    const totalCost = (lab) => {
      let s = 0;
      for (const e of layout.edges) s += pairCost(lab[e.a], lab[e.b], e.w);
      return s;
    };
    const seatCost = (lab, s, k) => {
      let c = 0;
      for (const e of layout.adj[s]) {
        const o = e.a === s ? e.b : e.a;
        c += pairCost(k, lab[o], e.w);
      }
      return c;
    };
    const swapDelta = (lab, a, b) => {
      const ka = lab[a], kb = lab[b];
      if (ka === kb) return 0;
      const before = seatCost(lab, a, ka) + seatCost(lab, b, kb);
      lab[a] = kb; lab[b] = ka;
      const after = seatCost(lab, a, kb) + seatCost(lab, b, ka);
      lab[a] = ka; lab[b] = kb;
      return after - before;
    };

    if (cap < 2 || classes.length < 2) return init;

    let best = init.slice(), bestCost = totalCost(best);
    const restarts = 3;
    const iters = Math.max(4000, cap * 600);
    for (let r = 0; r < restarts && bestCost > 0; r++) {
      const lab = init.slice();
      let cost = totalCost(lab);
      let T = 12;
      const cool = Math.pow(0.02 / T, 1 / iters);
      for (let it = 0; it < iters; it++) {
        const a = Math.floor(rnd() * cap);
        const b = Math.floor(rnd() * cap);
        if (lab[a] === lab[b]) continue;
        const d = swapDelta(lab, a, b);
        if (d <= 0 || rnd() < Math.exp(-d / T)) {
          const t = lab[a]; lab[a] = lab[b]; lab[b] = t;
          cost += d;
          if (cost < bestCost) { bestCost = cost; best = lab.slice(); if (cost === 0) break; }
        }
        T *= cool;
      }
    }
    // Son rötuş: iyileştiren tüm takasları dene (yerel optimum).
    let improved = true;
    while (improved) {
      improved = false;
      for (let a = 0; a < cap; a++) {
        for (let b = a + 1; b < cap; b++) {
          if (best[a] === best[b]) continue;
          if (swapDelta(best, a, b) < 0) {
            const t = best[a]; best[a] = best[b]; best[b] = t;
            improved = true;
          }
        }
      }
    }
    return best;
  }

  /**
   * Ana giriş.
   * @param {Array<{id:string,name:string,students:Array<{id:string}>}>} classes
   *        Sınava giren sınıflar. Her sınıf aynı zamanda bir salondur ve
   *        kapasitesi kendi mevcuduna eşittir.
   * @param {{deskCols?:number, seatsPerDesk?:number, avoidOwnRoom?:boolean,
   *          avoidSameLevel?:boolean, seed?:number}} settings
   */
  function distribute(classes, settings) {
    settings = settings || {};
    const seed = settings.seed == null ? (Date.now() & 0x7fffffff) : settings.seed;
    const rnd = mulberry32(seed);
    const cols = Math.max(1, settings.deskCols || 3);
    const spd = settings.seatsPerDesk === 1 ? 1 : 2;
    const list = classes.filter((c) => c.students && c.students.length > 0);
    const warnings = [];
    if (list.length === 0) throw new Error('Dağıtım için en az bir sınıf listesi gerekli.');
    if (list.length === 1) warnings.push('Yalnızca bir sınıf var; aynı sınıftan öğrencilerin yan yana oturması kaçınılmaz.');

    const sizes = list.map((c) => c.students.length);
    const caps = sizes.slice();
    const owner = list.map((_, i) => i);
    const levels = list.map((c) => levelOf(c.name));

    const alloc = allocate(sizes, caps, owner, { avoidOwnRoom: !!settings.avoidOwnRoom, rnd });
    if (alloc.ownRoomCount > 0) warnings.push(alloc.ownRoomCount + ' öğrenci kendi sınıfında sınava giriyor; sınıf mevcutları bunu tamamen önlemeye izin vermiyor.');
    if (alloc.deskOverflow > 0) warnings.push('Bir sınıfın mevcudu diğer sınıfların toplamından fazla; bazı sıralarda aynı sınıftan iki öğrenci oturmak zorunda.');

    // Her sınıfın öğrencilerini karıştırıp salonlara paylaştır.
    const pools = list.map((c) => shuffle(c.students, rnd));
    const takeIdx = list.map(() => 0);

    const rooms = list.map((room, j) => {
      const counts = list.map((_, i) => alloc.matrix[i][j]);
      const roomCols = Math.max(1, room.deskCols || cols);
      const layout = seatLayout(caps[j], roomCols, spd);
      const labels = arrangeRoom(layout, counts, levels, { rnd, avoidSameLevel: !!settings.avoidSameLevel });
      // Etiketlere öğrenci ata
      const byClass = list.map(() => []);
      for (let i = 0; i < list.length; i++) {
        byClass[i] = pools[i].slice(takeIdx[i], takeIdx[i] + counts[i]);
        takeIdx[i] += counts[i];
      }
      const ptr = list.map(() => 0);
      const seats = labels.map((k, s) => {
        const st = byClass[k][ptr[k]++];
        const geo = layout.seats[s];
        return { seatNo: s + 1, classId: list[k].id, studentId: st.id, desk: geo.desk + 1, side: geo.side, row: geo.row, col: geo.col };
      });
      return { roomId: room.id, name: room.name, capacity: caps[j], rows: layout.rows, cols: roomCols, spd, seats };
    });

    const stats = evaluate(rooms, list, { cols, spd });
    return { seed, rooms, warnings, stats, createdAt: new Date().toISOString() };
  }

  /** Kural ihlallerini sayar (sonuç ekranında gösterilir, testlerde doğrulanır). */
  function evaluate(rooms, classes, geo) {
    const lvl = {};
    for (const c of classes) lvl[c.id] = levelOf(c.name);
    const out = { deskmate: 0, frontBack: 0, aisle: 0, diagonal: 0, sameLevelDeskmate: 0, ownRoom: 0 };
    for (const room of rooms) {
      const layout = seatLayout(room.seats.length, room.cols || geo.cols, room.spd || geo.spd);
      for (const e of layout.edges) {
        const a = room.seats[e.a].classId, b = room.seats[e.b].classId;
        if (a === b) {
          if (e.kind === 'desk' || e.kind === 'side') out.deskmate++;
          else if (e.kind === 'front') out.frontBack++;
          else if (e.kind === 'aisle') out.aisle++;
          else out.diagonal++;
        } else if ((e.kind === 'desk' || e.kind === 'side') && lvl[a] === lvl[b]) out.sameLevelDeskmate++;
      }
      for (const s of room.seats) if (s.classId === room.roomId) out.ownRoom++;
    }
    return out;
  }

  const api = { distribute, allocate, MinCostFlow, seatLayout, arrangeRoom, evaluate, levelOf, mulberry32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KelebekAssign = api;
})(typeof self !== 'undefined' ? self : this);
