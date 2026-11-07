// SVG chart builders (strings). Visual language follows a stage/zone colour scheme like fitness-watch apps:
// sleep stages, heart-rate zones, goal lines. Pure functions, no DOM.
(function () {
  'use strict';
  const C = {
    sleep: { d: '#4353e0', l: '#9483ff', r: '#61c7ff', a: '#ff8a4c', u: '#7b61f0' },
    sleepName: { d: 'Ngủ sâu', l: 'Ngủ nông', r: 'REM', a: 'Thức', u: 'Ngủ (không chia giai đoạn)' },
    zones: ['#45b4ff', '#36d16f', '#ffbb00', '#f5814f', '#ff5959'],
    steps: '#ffbb00', kcal: '#ff6e14', hr: '#ff5a5a', hrv: '#09d2df', grid: '#272c35', axis: '#8d95a3',
  };
  const pad2 = n => String(n).padStart(2, '0');
  const hm = epochMin => { const d = new Date(epochMin * 60000); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  const fx = n => n.toFixed(1);
  const svg = (W, H, body, label) => `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label || 'Biểu đồ'}">${body}</svg>`;
  const txt = (x, y, s, anchor = 'start', extra = '') => `<text x="${fx(x)}" y="${fx(y)}" text-anchor="${anchor}" ${extra}>${s}</text>`;

  // Sleep stages over the night: awake / REM / light / deep lanes.
  function hypnogram(seg) {
    if (!seg || !seg.length) return '';
    const W = 340, H = 168, L = 8, R = 8, T = 6, B = 22;
    const t0 = seg[0][0], t1 = Math.max(...seg.map(s => s[1]));
    const X = t => L + (t - t0) / Math.max(1, t1 - t0) * (W - L - R);
    const lanes = ['a', 'r', 'l', 'd'];
    const hasStages = seg.some(s => s[2] !== 'u');
    const laneH = (H - T - B) / (hasStages ? 4 : 1);
    let body = '';
    if (hasStages) lanes.forEach((k, i) => { body += `<line x1="${L}" x2="${W - R}" y1="${fx(T + laneH * (i + 1))}" y2="${fx(T + laneH * (i + 1))}" stroke="${C.grid}"/>`; });
    for (const [s, e, k] of seg) {
      const i = hasStages ? Math.max(0, lanes.indexOf(k === 'u' ? 'l' : k)) : 0;
      const w = Math.max(1, X(e) - X(s));
      body += `<rect x="${fx(X(s))}" y="${fx(T + laneH * i + 2)}" width="${fx(w)}" height="${fx(laneH - 4)}" rx="3" fill="${C.sleep[k] || C.sleep.u}"/>`;
    }
    // hour ticks
    const first = Math.ceil(t0 / 60) * 60;
    for (let t = first; t < t1; t += 60) {
      if (X(t) - L < 34 || W - R - X(t) < 34) continue;
      if (((t - first) / 60) % 2) continue;
      body += txt(X(t), H - 6, hm(t), 'middle');
    }
    body += txt(L, H - 6, hm(t0)) + txt(W - R, H - 6, hm(t1), 'end');
    return svg(W, H, body, 'Giai đoạn ngủ');
  }

  // Generic vertical bars. items: [{label, v, parts?: [[value, color]...], hi?}], opts: {color, target, unit, labelEvery}
  function bars(items, opts = {}) {
    const W = 340, H = 170, L = 6, R = 34, T = 14, B = 22;
    const vals = items.map(i => i.v || 0);
    const max = Math.max(opts.target || 0, ...vals, opts.min || 1) * 1.1;
    const n = items.length, slot = (W - L - R) / n, bw = Math.max(2, Math.min(22, slot * 0.62));
    const Y = v => T + (1 - v / max) * (H - T - B);
    let body = '';
    [0.5, 1].forEach(f => { const v = max / 1.1 * f; body += `<line x1="${L}" x2="${W - R}" y1="${fx(Y(v))}" y2="${fx(Y(v))}" stroke="${C.grid}"/>` + txt(W - R + 4, Y(v) + 3, fmtShort(v)); });
    if (opts.target) body += `<line x1="${L}" x2="${W - R}" y1="${fx(Y(opts.target))}" y2="${fx(Y(opts.target))}" stroke="${opts.color}" stroke-dasharray="4 3" opacity=".9"/>` + txt(W - R + 4, Y(opts.target) + 3, fmtShort(opts.target), 'start', `fill="${opts.color}"`);
    items.forEach((it, i) => {
      const x = L + slot * i + (slot - bw) / 2;
      if (it.parts) {
        let y = H - B;
        for (const [v, col] of it.parts) { if (!v) continue; const h = (H - T - B) * v / max; y -= h; body += `<rect x="${fx(x)}" y="${fx(y)}" width="${fx(bw)}" height="${fx(Math.max(0.5, h))}" fill="${col}"/>`; }
      } else if (it.v) {
        const h = H - B - Y(it.v);
        body += `<rect x="${fx(x)}" y="${fx(Y(it.v))}" width="${fx(bw)}" height="${fx(Math.max(1, h))}" rx="${fx(Math.min(4, bw / 2))}" fill="${opts.target && it.v >= opts.target ? opts.hitColor || opts.color : opts.color}" opacity="${it.hi ? 1 : 0.88}"/>`;
      }
      if (it.label && (i % (opts.labelEvery || 1) === 0)) body += txt(x + bw / 2, H - 6, it.label, 'middle');
    });
    return svg(W, H, body, opts.title);
  }
  function fmtShort(v) { return v >= 10000 ? (v / 1000).toFixed(0) + 'k' : v >= 1000 ? (v / 1000).toFixed(1).replace('.0', '') + 'k' : String(Math.round(v * 10) / 10); }

  // Min–max range bars with an average dot (heart rate per hour / per day).
  function rangeBars(items, opts = {}) {
    const W = 340, H = 170, L = 6, R = 30, T = 10, B = 22;
    const have = items.filter(i => i && i.max);
    if (!have.length) return '';
    const lo = Math.min(...have.map(i => i.min)) - 5, hi = Math.max(...have.map(i => i.max)) + 5;
    const Y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const n = items.length, slot = (W - L - R) / n, bw = Math.max(2, Math.min(10, slot * 0.5));
    let body = '';
    [lo + 5, Math.round((lo + hi) / 2), hi - 5].forEach(v => { body += `<line x1="${L}" x2="${W - R}" y1="${fx(Y(v))}" y2="${fx(Y(v))}" stroke="${C.grid}"/>` + txt(W - R + 4, Y(v) + 3, Math.round(v)); });
    if (opts.line) body += `<line x1="${L}" x2="${W - R}" y1="${fx(Y(opts.line))}" y2="${fx(Y(opts.line))}" stroke="${C.hrv}" stroke-dasharray="4 3"/>`;
    items.forEach((it, i) => {
      const x = L + slot * i + slot / 2;
      if (it && it.max) {
        body += `<rect x="${fx(x - bw / 2)}" y="${fx(Y(it.max))}" width="${fx(bw)}" height="${fx(Math.max(2, Y(it.min) - Y(it.max)))}" rx="${fx(bw / 2)}" fill="${opts.color || C.hr}" opacity=".75"/>`;
        if (it.avg) body += `<circle cx="${fx(x)}" cy="${fx(Y(it.avg))}" r="${fx(Math.max(1.6, bw / 2.4))}" fill="#fff"/>`;
      }
      if (it && it.label && i % (opts.labelEvery || 1) === 0) body += txt(x, H - 6, it.label, 'middle');
    });
    return svg(W, H, body, opts.title);
  }

  // Bedtime → wake-up range per night (sleep regularity). nights: [{label, start: epochMin, end: epochMin}]
  function regularity(nights) {
    const have = nights.filter(n => n && n.start);
    if (!have.length) return '';
    const W = 340, H = 170, L = 34, R = 8, T = 8, B = 22;
    // minutes after 18:00 local of the evening before
    const rel = em => { const d = new Date(em * 60000); let m = d.getHours() * 60 + d.getMinutes() - 18 * 60; if (m < 0) m += 1440; return m; };
    const lo = Math.max(0, Math.floor((Math.min(...have.map(n => rel(n.start))) - 30) / 60) * 60);
    const hi = Math.min(1440, Math.ceil((Math.max(...have.map(n => rel(n.end))) + 30) / 60) * 60);
    const Y = m => T + (m - lo) / Math.max(60, hi - lo) * (H - T - B);
    const n = nights.length, slot = (W - L - R) / n, bw = Math.max(3, Math.min(14, slot * 0.55));
    let body = '';
    for (let m = lo; m <= hi; m += 120) { const hh = (18 + m / 60) % 24; body += `<line x1="${L}" x2="${W - R}" y1="${fx(Y(m))}" y2="${fx(Y(m))}" stroke="${C.grid}"/>` + txt(L - 4, Y(m) + 3, `${pad2(hh)}:00`, 'end'); }
    nights.forEach((nt, i) => {
      const x = L + slot * i + slot / 2;
      if (nt && nt.start) { const a = rel(nt.start), b = rel(nt.end); body += `<rect x="${fx(x - bw / 2)}" y="${fx(Y(a))}" width="${fx(bw)}" height="${fx(Math.max(2, Y(b) - Y(a)))}" rx="${fx(bw / 2)}" fill="${C.sleep.l}" opacity=".85"/>`; }
      if (nt && nt.label && i % (nt.every || 1) === 0) body += txt(x, H - 6, nt.label, 'middle');
    });
    return svg(W, H, body, 'Giờ ngủ – giờ dậy');
  }

  // Workout heart-rate curve coloured by zone, with zone bands. series: [[sec, bpm]]
  function hrZoneCurve(series, maxHr, zones) {
    if (!series || series.length < 2) return '';
    const W = 340, H = 160, L = 6, R = 32, T = 8, B = 20;
    const t1 = series[series.length - 1][0];
    const vals = series.map(p => p[1]);
    const lo = Math.max(40, Math.min(...vals) - 8), hi = Math.max(...vals, Math.round(maxHr * 0.9)) + 4;
    const X = s => L + s / Math.max(1, t1) * (W - L - R), Y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    let body = '';
    zones.forEach(([, f], i) => { const v = f * maxHr; if (v > lo && v < hi) body += `<line x1="${L}" x2="${W - R}" y1="${fx(Y(v))}" y2="${fx(Y(v))}" stroke="${C.zones[i]}" stroke-dasharray="2 4" opacity=".55"/>` + txt(W - R + 4, Y(v) + 3, Math.round(v), 'start', `fill="${C.zones[i]}"`); });
    const zoneIdx = v => { let z = -1; zones.forEach(([, f], i) => { if (v / maxHr >= f) z = i; }); return z; };
    for (let i = 1; i < series.length; i++) {
      const [s0, v0] = series[i - 1], [s1, v1] = series[i];
      const z = zoneIdx((v0 + v1) / 2);
      body += `<line x1="${fx(X(s0))}" y1="${fx(Y(v0))}" x2="${fx(X(s1))}" y2="${fx(Y(v1))}" stroke="${z < 0 ? C.axis : C.zones[z]}" stroke-width="2.4" stroke-linecap="round"/>`;
    }
    const mins = Math.round(t1 / 60);
    body += txt(L, H - 4, '0′') + txt(X(t1 / 2), H - 4, Math.round(mins / 2) + '′', 'middle') + txt(X(t1), H - 4, mins + '′', 'end');
    return svg(W, H, body, 'Nhịp tim buổi tập');
  }

  self.Charts = { C, hypnogram, bars, rangeBars, regularity, hrZoneCurve, hm, fmtShort };
})();
