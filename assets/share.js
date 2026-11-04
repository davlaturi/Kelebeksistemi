/* Telefon için 1080 px genişliğinde, okunaklı PNG kâğıt hazırlama kartları. */
(function (root) {
  'use strict';
  function color(level) {
    return ({
      '9': { bg: '#fff0e4', ink: '#893b13', border: '#dfaa82' },
      '10': { bg: '#e6f5ea', ink: '#215b38', border: '#8fbd9c' },
      '11': { bg: '#f0eafa', ink: '#613b88', border: '#b5a0d1' },
      '12': { bg: '#e7f0fc', ink: '#244d80', border: '#93b1d6' },
    })[level] || { bg: '#eef2ef', ink: '#3c5545', border: '#acb9b0' };
  }
  function wrap(text, maxWidth, measure) {
    const lines = []; let line = '';
    for (const word of String(text || '').split(/\s+/)) {
      if (!word) continue;
      if (measure(word) > maxWidth) {
        if (line) { lines.push(line); line = ''; }
        for (const char of word) {
          if (line && measure(line + char) > maxWidth) { lines.push(line); line = ''; }
          line += char;
        }
      } else if (line && measure(line + ' ' + word) > maxWidth) { lines.push(line); line = word; }
      else line += (line ? ' ' : '') + word;
    }
    if (line) lines.push(line);
    return lines;
  }
  function paginate(rows, available) {
    const pages = []; let page = [], used = 0;
    for (const row of rows) {
      if (page.length && used + row.height > available) { pages.push(page); page = []; used = 0; }
      page.push(row); used += row.height;
    }
    if (page.length) pages.push(page);
    return pages.length ? pages : [[]];
  }
  async function images(data) {
    const canvas = document.createElement('canvas'); canvas.width = 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Görsel oluşturulamıyor.');
    const font = (size, weight = 400) => { ctx.font = weight + ' ' + size + 'px "Segoe UI", sans-serif'; };
    const lines = (text, size, width, weight = 400) => { font(size, weight); return wrap(text, width, (s) => ctx.measureText(s).width); };
    const title = lines(data.title, 46, 920, 700);
    const school = lines(data.school, 25, 920);
    const meta = [
      ...lines(data.exam && data.exam !== data.title ? data.exam : '', 27, 920),
      ...lines([data.date, data.time, data.lesson ? data.lesson + '. ders' : '', data.level].filter(Boolean).join(' · '), 27, 920),
      ...lines(data.headerNote || '', 27, 920),
      ...lines(data.distribution || '', 23, 920),
    ];
    const head = 255 + title.length * 56 + school.length * 34 + meta.length * 38;
    const rows = data.rooms.flatMap((r) => {
      const detail = lines(r.detail, 26, 760);
      const name = lines(r.room + ' salonu', 34, 760, 700);
      const badges = r.levels || [];
      const badgeHeight = Math.ceil(badges.length / 4) * 62;
      // Uzun listeler bile görsel sınırını aşmasın; aynı salonun devamı açıkça belirtilir.
      const maxDetail = Math.max(1, Math.floor((1600 - head - 155 - name.length * 44 - badgeHeight) / 34));
      const segments = [];
      for (let i = 0; i < Math.max(1, detail.length); i += maxDetail) {
        const part = detail.slice(i, i + maxDetail);
        segments.push({ ...r, name, badges, badgeHeight, detail: part, continued: i > 0, height: 44 + name.length * 44 + badgeHeight + part.length * 34 });
      }
      return segments;
    });
    const pages = paginate(rows, Math.max(180, 1600 - head - 145));
    const files = [];
    for (let pi = 0; pi < pages.length; pi++) {
      canvas.height = Math.max(800, head + pages[pi].reduce((n, r) => n + r.height, 0) + 145);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1080, canvas.height);
      ctx.fillStyle = '#12634c'; ctx.fillRect(0, 0, 1080, 14);
      const draw = (text, x, y, size, weight, color) => { font(size, weight); ctx.fillStyle = color; ctx.fillText(text, x, y); };
      draw('KELEBEK  /  KÂĞIT HAZIRLAMA', 70, 75, 24, 700, '#12634c');
      let y = 123;
      school.forEach((s) => { draw(s, 70, y, 25, 400, '#53635e'); y += 34; });
      title.forEach((s) => { draw(s, 70, y + 18, 46, 700, '#172b25'); y += 56; });
      y += 18;
      meta.forEach((s) => { draw(s, 70, y, 27, 400, '#53635e'); y += 38; });
      ctx.fillStyle = '#eaf5ef'; ctx.fillRect(70, y + 5, 940, 90);
      draw(data.total + ' KÂĞIT', 94, y + 61, 38, 700, '#12634c');
      draw(data.rooms.length + ' salon · ' + (pi + 1) + '/' + pages.length, 680, y + 58, 26, 600, '#12634c');
      y = head;
      for (const r of pages[pi]) {
        ctx.fillStyle = '#f6f9f7'; ctx.fillRect(55, y, 970, r.height - 12);
        ctx.fillStyle = '#b7cec0'; ctx.fillRect(55, y, 970, 2);
        ctx.fillStyle = '#267258'; ctx.fillRect(55, y, 6, r.height - 12); y += 38;
        r.name.forEach((s) => { draw(s, 70, y, 34, 700, '#172b25'); y += 44; });
        draw(r.continued ? 'devam' : String(r.total), 900, y - 44, r.continued ? 22 : 38, 700, '#12634c');
        r.badges.forEach((L, i) => {
          const c = color(L.level), x = 70 + (i % 4) * 237, top = y - 15 + Math.floor(i / 4) * 62;
          ctx.fillStyle = c.bg; ctx.fillRect(x, top, 222, 48);
          ctx.strokeStyle = c.border; ctx.lineWidth = 1; ctx.strokeRect(x, top, 222, 48);
          const label = L.label + ': ' + L.total;
          font(25, 700);
          const size = Math.min(25, 25 * 200 / Math.max(1, ctx.measureText(label).width));
          draw(label, x + 10, top + 32, size, 700, c.ink);
        });
        y += r.badgeHeight;
        r.detail.forEach((s) => { draw(s, 70, y, 26, 400, '#53635e'); y += 34; });
        y += 6;
      }
      draw('Her salon için ayrı hazırlayın.', 70, canvas.height - 75, 27, 600, '#172b25');
      draw('Kâğıtları ilgili salon zarfına koyunuz.', 70, canvas.height - 35, 25, 400, '#53635e');
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Görsel oluşturulamadı.');
      files.push(new File([blob], 'Kelebek-Kagit-Listesi-' + (pi + 1) + '.png', { type: 'image/png' }));
    }
    return files;
  }
  const api = { wrap, paginate, images, color };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KelebekShare = api;
})(typeof window !== 'undefined' ? window : this);
