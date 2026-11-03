/*
 * Kelebek dağıtım algoritması.
 *
 * İki aşamada çalışır:
 *  1) Paylaştırma: Her sınıftan her salona kaç öğrenci gideceği, maksimum akış
 *     (max-flow) ile bulunur. Kısıtlar:
 *       - her salon tam kapasite dolar (kapasite = o sınıfın öğrenci sayısı),
 *       - bir sınıf düzeyinden (ör. 9/A+9/B+9/C) bir salona en fazla "sıra
 *         sayısı" kadar öğrenci gider (böylece aynı düzeyden iki öğrenci aynı
 *         sıraya oturmak zorunda kalmaz),
 *       - isteğe bağlı: öğrenci kendi sınıfında sınava girmez (varsayılan: girebilir),
 *       - sınıflar salonlara olabildiğince orantılı (dengeli) dağılır.
 *  2) Yerleştirme: Her salonda öğrenciler, aynı sınıf düzeyinden olanlar yan
 *     yana (sıra arkadaşı), önlü-arkalı ve çapraz komşu olmayacak şekilde yerleştirilir.
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

  const COST_OWN = 1000;      // öğrenci kendi sınıfında (yalnızca seçenek açıksa)
  const COST_DESK = 100000;   // aynı düzeyden iki kişi aynı sırada zorunlu

  /**
   * Sınıf -> salon öğrenci sayısı matrisini bulur (minimum maliyetli akış).
   * Kısıt: bir salona aynı sınıf düzeyinden (ör. tüm 9'lar) en fazla
   * "sıra sayısı" kadar öğrenci gider; böylece aynı düzeyden iki öğrenci aynı
   * sıraya oturmak zorunda kalmaz. Sınıflar salonlara dengeli dağılır.
   * @param {number[]} sizes  sınıf mevcutları
   * @param {number[]} caps   salon kapasiteleri
   * @param {number[]} owner  salonun sahibi olan sınıfın indeksi (yoksa -1)
   * @param {number[]} group  her sınıfın düzey indeksi
   * @param {{avoidOwnRoom:boolean, rnd:Function}} opts
   */
  function allocate(sizes, caps, owner, group, opts) {
    const K = sizes.length, R = caps.length;
    const G = Math.max(0, ...group) + 1;
    const N = sizes.reduce((a, b) => a + b, 0);
    const C = caps.reduce((a, b) => a + b, 0);
    if (C < N) throw new Error('Toplam salon kapasitesi (' + C + ') öğrenci sayısından (' + N + ') az. ' + (N - C) + ' öğrenci için daha yer gerekiyor.');
    // Kapasite öğrenci sayısından fazlaysa salonlar orantılı doldurulur.
    const fill = caps.map((c) => (c * N) / C);
    const deskCap = caps.map((c) => Math.ceil(c / 2));
    const own = (i, j) => opts.avoidOwnRoom && owner[j] === i;
    const neff = caps.map((_, j) => {
      let s = 0;
      for (let i = 0; i < K; i++) if (!own(i, j)) s += sizes[i];
      return s || N;
    });
    // Düğümler: S, sınıflar [0,K), düzey×salon [K, K+G*R), salonlar, T
    const GR = (g, j) => K + g * R + j;
    const RM = (j) => K + G * R + j;
    const S = K + G * R + R, T = S + 1;
    const mcf = new MinCostFlow(T + 1);
    const cells = [];
    const classOrder = shuffle(sizes.map((_, i) => i), opts.rnd);
    const roomOrder = shuffle(caps.map((_, j) => j), opts.rnd);
    for (const i of classOrder) mcf.addEdge(S, i, sizes[i], 0);
    for (const i of classOrder) {
      for (const j of roomOrder) {
        const base = own(i, j) ? COST_OWN : 0;
        const ub = Math.min(caps[j], sizes[i]);
        const target = own(i, j) ? 0 : Math.min(ub, Math.ceil((sizes[i] * fill[j]) / neff[j]));
        const t2 = Math.min(ub, target + 2);
        const es = [];
        for (const [cap, cost] of [[target, base], [t2 - target, base + 3], [ub - t2, base + 12]]) {
          if (cap > 0) es.push(mcf.addEdge(i, GR(group[i], j), cap, cost));
        }
        cells.push({ i, j, es });
      }
    }
    for (let g = 0; g < G; g++) for (const j of roomOrder) {
      mcf.addEdge(GR(g, j), RM(j), deskCap[j], 0);
      if (caps[j] > deskCap[j]) mcf.addEdge(GR(g, j), RM(j), caps[j] - deskCap[j], COST_DESK);
    }
    for (const j of roomOrder) {
      const f = Math.min(caps[j], Math.ceil(fill[j]));
      if (f > 0) mcf.addEdge(RM(j), T, f, 0);
      if (caps[j] > f) mcf.addEdge(RM(j), T, caps[j] - f, 6);
    }
    const res = mcf.run(S, T, N);
    if (res.flow !== N) throw new Error('Dağıtım bulunamadı.');

    const matrix = sizes.map(() => caps.map(() => 0));
    for (const c of cells) for (const e of c.es) matrix[c.i][c.j] += e.orig - e.cap;
    let ownCount = 0, deskOver = 0;
    for (let j = 0; j < R; j++) {
      const perG = new Array(G).fill(0);
      for (let i = 0; i < K; i++) {
        perG[group[i]] += matrix[i][j];
        if (owner[j] === i) ownCount += matrix[i][j];
      }
      for (const n of perG) deskOver += Math.max(0, n - deskCap[j]);
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
    const EMPTY = opts.empty;
    const pairCost = (x, y, w) => {
      if (EMPTY != null && (x === EMPTY || y === EMPTY)) return 0;
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

    const sizes = list.map((c) => c.students.length);
    // Salon kapasitesi: sınıf mevcudu (varsayılan) ya da öğretmenin belirlediği sayı.
    const custom = settings.capacityMode === 'custom';
    const capOf = (c) => {
      if (!custom || c.roomCap == null || c.roomCap === '') return c.students.length;
      return Math.max(0, Math.floor(Number(c.roomCap)) || 0);
    };
    // Salonlar: ayrıca verilmişse (settings.rooms) onlar, yoksa sınava giren şubelerin kendi sınıfları.
    const roomList = Array.isArray(settings.rooms)
      ? settings.rooms.map((r) => ({ id: r.id, name: r.name, deskCols: r.deskCols, cap: Math.max(0, Math.floor(Number(r.capacity)) || 0) }))
      : list.map((c) => ({ id: c.id, name: c.name, deskCols: c.deskCols, cap: capOf(c) }));
    const usable = roomList.filter((r) => r.cap > 0);
    if (!usable.length) throw new Error('Sınav salonu olarak en az bir sınıf seçin.');
    const caps = usable.map((r) => r.cap);
    const owner = usable.map((r) => list.findIndex((c) => c.id === r.id));
    const levels = list.map((c) => levelOf(c.name));
    const levelNames = [...new Set(levels)];
    const group = levels.map((l) => levelNames.indexOf(l));
    if (levelNames.length === 1) warnings.push('Tüm sınıflar aynı düzeyde (' + levelNames[0] + '); aynı düzeyden öğrencilerin yan yana oturması kaçınılmaz.');

    const alloc = allocate(sizes, caps, owner, group, { avoidOwnRoom: !!settings.avoidOwnRoom, rnd });
    if (alloc.ownRoomCount > 0) warnings.push(alloc.ownRoomCount + ' öğrenci kendi sınıfında sınava giriyor; salon kapasiteleri bunu tamamen önlemeye izin vermiyor.');
    if (alloc.deskOverflow > 0) warnings.push('Bir sınıf düzeyinin öğrenci sayısı salonlardaki sıra sayısına sığmıyor; bazı sıralarda aynı düzeyden iki öğrenci oturmak zorunda (' + alloc.deskOverflow + ' sıra).');

    // Her sınıfın öğrencilerini karıştırıp salonlara paylaştır.
    const pools = list.map((c) => shuffle(c.students, rnd));
    const takeIdx = list.map(() => 0);
    const EMPTY = levelNames.length;

    const rooms = usable.map((room, j) => {
      const counts = list.map((_, i) => alloc.matrix[i][j]);
      const roomCols = Math.max(1, room.deskCols || cols);
      const layout = seatLayout(caps[j], roomCols, spd);
      // Yerleşim düzey bazında yapılır: etiketler düzey indeksidir; boş koltuk ayrı etiket.
      const gCounts = levelNames.map(() => 0);
      for (let i = 0; i < list.length; i++) gCounts[group[i]] += counts[i];
      gCounts.push(caps[j] - gCounts.reduce((a, b) => a + b, 0));
      const labels = arrangeRoom(layout, gCounts, levelNames.concat(['']), { rnd, avoidSameLevel: false, empty: EMPTY });
      // Her düzeyin koltuklarına o düzeydeki sınıfların öğrencilerini karışık ver
      const byGroup = levelNames.map(() => []);
      for (let i = 0; i < list.length; i++) {
        for (const st of pools[i].slice(takeIdx[i], takeIdx[i] + counts[i])) byGroup[group[i]].push({ st, k: i });
        takeIdx[i] += counts[i];
      }
      const queues = byGroup.map((arr) => shuffle(arr, rnd));
      const seats = labels.map((g, s) => {
        const geo = layout.seats[s];
        const base = { seatNo: s + 1, desk: geo.desk + 1, side: geo.side, row: geo.row, col: geo.col };
        if (g === EMPTY) return { ...base, empty: true, classId: null, studentId: null };
        const { st, k } = queues[g].pop();
        return { ...base, classId: list[k].id, studentId: st.id };
      });
      return { roomId: room.id, name: room.name, capacity: caps[j], rows: layout.rows, cols: roomCols, spd, seats };
    });
    const placed = rooms.reduce((a, r) => a + r.seats.filter((x) => !x.empty).length, 0);
    const empty = rooms.reduce((a, r) => a + r.seats.length, 0) - placed;
    if (empty > 0) warnings.push(empty + ' koltuk boş kaldı; boş koltuklar aynı düzeyden öğrencileri ayırmak için kullanıldı.');

    const stats = evaluate(rooms, list, { cols, spd });
    return { seed, rooms, warnings, stats, createdAt: new Date().toISOString() };
  }

  /** Kural ihlallerini sayar: komşu öğrenciler aynı sınıf düzeyinde mi? */
  function evaluate(rooms, classes, geo) {
    const lvl = {};
    for (const c of classes) lvl[c.id] = levelOf(c.name);
    const out = { deskmate: 0, frontBack: 0, aisle: 0, diagonal: 0, sameClassDeskmate: 0, ownRoom: 0 };
    for (const room of rooms) {
      const layout = seatLayout(room.seats.length, room.cols || geo.cols, room.spd || geo.spd);
      for (const e of layout.edges) {
        const a = room.seats[e.a].classId, b = room.seats[e.b].classId;
        if (!a || !b || lvl[a] !== lvl[b]) continue;
        if (e.kind === 'desk' || e.kind === 'side') { out.deskmate++; if (a === b) out.sameClassDeskmate++; }
        else if (e.kind === 'front') out.frontBack++;
        else if (e.kind === 'aisle') out.aisle++;
        else out.diagonal++;
      }
      for (const s of room.seats) if (s.classId && s.classId === room.roomId) out.ownRoom++;
    }
    return out;
  }

  const api = { distribute, allocate, MinCostFlow, seatLayout, arrangeRoom, evaluate, levelOf, mulberry32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KelebekAssign = api;
})(typeof self !== 'undefined' ? self : this);
