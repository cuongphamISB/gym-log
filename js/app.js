(function () {
  'use strict';
  const L = self.L, Store = self.Store, Coach = self.Coach, SEED = self.SEED;
  const VERSION = '1.0.0';

  // ---------- helpers ----------
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const DOW_LONG = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const fmtDate = d => { const x = L.parseDate(d); return `${DOW[x.getDay()]}, ${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`; };
  const fmtLong = d => { const x = L.parseDate(d); return `${DOW_LONG[x.getDay()]}, ${x.toLocaleDateString('vi-VN')}`; };
  const mmss = s => { const a = Math.abs(Math.round(s)); return `${s < 0 ? '+' : ''}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`; };
  const daysSince = iso => iso ? (Date.now() - new Date(iso).getTime()) / 864e5 : Infinity;
  const fmtKg = n => n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + ' t' : Math.round(n) + ' kg';
  const I = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z"/></svg>',
  };
  const COLS = {
    weight: [['kg', 'kg', 'decimal'], ['reps', 'Reps', 'numeric'], ['rir', 'RIR', 'numeric']],
    unilateral: [['kg', 'kg', 'decimal'], ['reps', 'A', 'numeric'], ['repsB', 'B', 'numeric'], ['rir', 'RIR', 'numeric']],
    bodyweight: [['kg', '+kg', 'decimal'], ['reps', 'Reps', 'numeric'], ['rir', 'RIR', 'numeric']],
    band: [['band', 'Dây', 'text'], ['reps', 'Reps', 'numeric'], ['rir', 'RIR', 'numeric']],
    timed: [['sec', 'Giây', 'numeric'], ['kg', '+kg', 'decimal'], ['rir', 'RIR', 'numeric']],
    cardio: [['min', 'Phút', 'decimal'], ['km', 'km', 'decimal'], ['rpe', 'RPE', 'numeric']],
  };
  const NO_FILL = new Set(['rir', 'rpe']); // never auto-copied into a set
  const SLEEP = {
    good: ['Đủ ngủ', '≥7h', 'Tập đúng giáo án, ưu tiên kỹ thuật và đẩy tiến bộ.'],
    mid: ['Hơi thiếu', '6–7h', 'Giữ tạ, có thể bớt 1 hiệp/bài và để RIR 3–4.'],
    low: ['Thiếu ngủ', '<6h', 'Ưu tiên nghỉ. Nếu vẫn muốn: đi bộ hoặc mobility 10–20 phút.'],
  };

  // ---------- state ----------
  let db = null, aiKey = '', persisted = null, installEvt = null;
  const ui = { tab: 'today', stack: [], sleep: null, libSeg: 'ex', libQ: '', pickQ: '', progEx: null, coachBusy: false, coachResult: null };
  let rest = null; // {endAt,total,label,alerted}
  let wakeLock = null, audioCtx = null;
  const save = () => Store.saveSoon(db);
  const exMap = () => L.byId(db.exercises);
  const top = () => ui.stack[ui.stack.length - 1] || null;
  const wById = id => db.workouts.find(w => w.id === id);
  const activeWorkout = () => db.workouts.find(w => w.status === 'active');

  // ---------- navigation (Android back button closes pages) ----------
  function open(o) { ui.stack.push(o); history.pushState({ depth: ui.stack.length }, ''); render(); }
  function back() { if (ui.stack.length) history.back(); }
  function replaceTop(o) { ui.stack[ui.stack.length - 1] = o; render(); }
  window.addEventListener('popstate', e => {
    const d = (e.state && e.state.depth) || 0;
    while (ui.stack.length > d) ui.stack.pop();
    render();
  });

  // ---------- render ----------
  function render() {
    $('#app').innerHTML = ({ today: vToday, history: vHistory, progress: vProgress, library: vLibrary })[ui.tab]();
    document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
    renderPage();
    renderRest();
    syncWakeLock();
  }
  function renderPage() {
    const root = $('#page-root');
    const t = top();
    if (!t) { root.innerHTML = ''; document.body.style.overflow = ''; return; }
    document.body.style.overflow = 'hidden';
    const key = t.type + ':' + (t.id || '');
    const fn = PAGES[t.type];
    if (!fn) { root.innerHTML = ''; return; }
    let el = root.firstElementChild;
    const html = `<div class="page-in">${fn(t)}</div>`;
    if (el && el.dataset.key === key) { const st = el.scrollTop; el.innerHTML = html; el.scrollTop = st; }
    else { root.innerHTML = `<div class="page" data-key="${esc(key)}">${html}</div>`; }
  }
  function head(title, sub, right = '') {
    return `<div class="page-head"><button class="iconbtn" data-act="back" aria-label="Quay lại">${I.back}</button><div class="t"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div>${right}</div>`;
  }
  function thumb(ex, cls = '') {
    return ex && ex.image ? `<img src="${esc(ex.image)}" alt="" loading="lazy" class="${cls}">` : `<div class="ph">${esc(((ex && ex.name) || '?').slice(0, 1))}</div>`;
  }

  // ---------- TODAY ----------
  function vToday() {
    const today = L.localDate(), dow = new Date().getDay();
    const active = activeWorkout();
    const rec = db.templates.find(t => (t.days || []).includes(dow));
    const E = exMap();
    let h = `<div class="topbar"><div><div class="eyebrow">${DOW_LONG[dow]} · ${new Date().toLocaleDateString('vi-VN')}</div><h1>Hôm nay</h1></div><button class="iconbtn" data-act="open" data-page="settings" aria-label="Cài đặt">${I.gear}</button></div>`;
    if (!window.matchMedia('(display-mode: standalone)').matches) {
      h += `<div class="notice info"><b>Cài app ra màn hình chính</b> để mở như app thật, chạy offline và Chrome không tự xoá dữ liệu.${installEvt ? ` <button class="btn sm pri" style="margin-top:8px" data-act="install">Cài đặt</button>` : ' Chrome ⋮ → <b>Thêm vào màn hình chính</b> → Cài đặt.'}</div>`;
    }
    const nDone = L.finished(db).length;
    if (nDone && daysSince(db.settings.lastBackupAt) > 7) {
      h += `<div class="notice">Đã ${db.settings.lastBackupAt ? Math.floor(daysSince(db.settings.lastBackupAt)) + ' ngày' : 'lâu'} chưa sao lưu. <button class="btn sm" style="margin-top:8px" data-act="backup">Sao lưu ngay</button></div>`;
    }
    if (active) {
      const st = L.workoutStats(active);
      h += `<button class="active-banner" data-act="open" data-page="workout" data-id="${active.id}"><span class="pulse"></span><span class="grow">Đang tập: ${esc(active.name)}<br><small style="font-weight:600;opacity:.75">${st.sets} hiệp xong · bắt đầu ${new Date(active.startedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</small></span><span>Tiếp tục ›</span></button>`;
    }
    // week strip
    const ws = L.weekStart(today);
    const doneDates = new Set(L.finished(db).map(w => w.date));
    h += `<div class="card" style="padding:12px 14px"><div class="between"><span class="small muted" style="font-weight:600">Tuần này</span><span class="small"><b>${[...Array(7)].filter((_, i) => doneDates.has(L.addDays(ws, i))).length}</b> buổi · chuỗi <b>${L.streakWeeks(db)}</b> tuần</span></div><div class="row" style="justify-content:space-between;margin-top:10px">`;
    for (let i = 0; i < 7; i++) {
      const d = L.addDays(ws, i), on = doneDates.has(d), isT = d === today;
      const planned = db.templates.some(t => (t.days || []).includes(L.parseDate(d).getDay()));
      h += `<div style="text-align:center;flex:1"><div class="tiny ${isT ? '' : 'dim'}" style="font-weight:700">${DOW[L.parseDate(d).getDay()]}</div><div style="margin:4px auto 0;width:30px;height:30px;border-radius:10px;display:grid;place-items:center;font-weight:800;font-size:13px;${on ? 'background:var(--acc);color:var(--acc-ink)' : isT ? 'border:1.5px solid var(--tx)' : planned ? 'border:1px dashed var(--dim);color:var(--dim)' : 'background:var(--s2);color:var(--dim)'}">${on ? '✓' : L.parseDate(d).getDate()}</div></div>`;
    }
    h += `</div></div>`;
    // readiness
    h += `<div class="section-t"><h2>Ngủ đêm qua</h2></div><div class="grid3">` + Object.entries(SLEEP).map(([k, v]) => `<button class="chip ${ui.sleep === k ? 'on' : ''}" style="flex-direction:column;min-height:52px;border-radius:14px;justify-content:center;gap:0" data-act="sleep" data-v="${k}"><span>${v[0]}</span><span class="tiny" style="opacity:.7">${v[1]}</span></button>`).join('') + `</div>`;
    if (ui.sleep) h += `<p class="small" style="margin:8px 2px 0;color:${ui.sleep === 'good' ? 'var(--ok)' : 'var(--pr)'}">${SLEEP[ui.sleep][2]}</p>`;
    // recommended
    if (rec && !active) {
      const last = L.sortedDesc(L.finished(db)).find(w => w.templateId === rec.id);
      h += `<div class="section-t"><h2>Giáo án hôm nay</h2></div><div class="hero"><div class="eyebrow" style="color:var(--acc)">${esc(rec.note ? rec.note.split('•')[0] : 'Theo lịch')}</div><div class="big">${esc(rec.name)}</div><div class="small muted">${rec.items.length} bài · lần trước: ${last ? fmtDate(last.date) : 'chưa có'}</div><div class="ex-preview">${rec.items.map(i => `<span>${esc((E[i.exerciseId] || {}).name || '?')}</span>`).join('')}</div><button class="btn pri wide" data-act="start" data-tpl="${rec.id}">Bắt đầu buổi tập</button></div>`;
    }
    h += `<div class="section-t"><h2>${rec && !active ? 'Hoặc chọn buổi khác' : 'Bắt đầu buổi tập'}</h2></div><div class="tpl-grid">`;
    for (const t of db.templates) {
      if (rec && t.id === rec.id && !active) continue;
      h += `<button class="tpl" data-act="start" data-tpl="${t.id}"><span class="mark">${esc(t.short || t.name.slice(0, 1))}</span><b>${esc(t.name)}</b><span class="tiny muted">${t.items.length} bài${t.days && t.days.length ? ' · ' + t.days.map(d => DOW[d]).join(', ') : ''}</span></button>`;
    }
    h += `<button class="tpl" data-act="start" data-tpl=""><span class="mark">+</span><b>Buổi tự do</b><span class="tiny muted">Tự thêm bài khi tập</span></button></div>`;
    return h;
  }

  // ---------- HISTORY ----------
  function vHistory() {
    const ws = L.sortedDesc(L.finished(db));
    let h = `<div class="topbar"><div><div class="eyebrow">${ws.length} buổi đã lưu</div><h1>Lịch sử</h1></div><button class="iconbtn" data-act="open" data-page="settings" aria-label="Cài đặt">${I.gear}</button></div>`;
    if (!ws.length) return h + `<div class="empty"><b>Chưa có buổi nào</b>Bắt đầu một buổi ở tab Hôm nay, hoặc nhập backup cũ trong Cài đặt.</div>`;
    let month = '';
    for (const w of ws) {
      const d = L.parseDate(w.date);
      const m = `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
      if (m !== month) { h += `<div class="month">${m}</div>`; month = m; }
      const st = L.workoutStats(w), dur = L.durationOf(w);
      const prs = w.items.reduce((n, it) => n + it.sets.filter(s => s.pr && s.pr.length).length, 0);
      const cardio = w.items.filter(it => it.type === 'cardio').map(it => it.sets.filter(L.isDone).map(s => L.describeSet(s, 'cardio')).join(', ')).filter(Boolean);
      h += `<button class="hcard" data-act="open" data-page="view" data-id="${w.id}"><div class="row"><div class="d"><b>${d.getDate()}</b><small>${DOW[d.getDay()]}</small></div><div class="grow"><div class="between"><b class="ellipsis">${esc(w.name)}</b>${prs ? `<span class="badge pr">🏆 ${prs}</span>` : ''}</div><div class="small muted">${[dur && dur + ' phút', st.sets && st.sets + ' hiệp', st.volume && fmtKg(st.volume), ...cardio].filter(Boolean).join(' · ') || 'Không có hiệp'}</div><div class="tiny dim ellipsis" style="margin-top:2px">${esc(w.items.filter(it => it.sets.some(L.isDone)).map(it => it.name).join(' · '))}</div></div></div></button>`;
    }
    return h;
  }

  // ---------- PROGRESS ----------
  function vProgress() {
    const today = L.localDate();
    const fin = L.finished(db);
    let h = `<div class="topbar"><div><div class="eyebrow">Số liệu</div><h1>Tiến bộ</h1></div><button class="iconbtn" data-act="open" data-page="settings" aria-label="Cài đặt">${I.gear}</button></div>`;
    const last28 = fin.filter(w => w.date > L.addDays(today, -28));
    const ms = L.muscleSetsByWeek(db, 5, today);
    const wks = Object.keys(ms);
    const sumW = wk => Object.values(ms[wk]).reduce((a, b) => a + b, 0);
    const prevAvg = wks.slice(0, 4).reduce((a, wk) => a + sumW(wk), 0) / 4;
    h += `<div class="stats"><div class="stat"><div class="v num">${last28.length}</div><div class="k">buổi / 28 ngày</div></div><div class="stat"><div class="v num">${Math.round(prevAvg)}</div><div class="k">hiệp nặng / tuần (TB 4 tuần)</div></div><div class="stat"><div class="v num">${L.streakWeeks(db)}</div><div class="k">tuần liên tiếp</div></div></div>`;
    // coach
    h += `<button class="card" style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;margin-top:12px;border-color:#3d4d14;background:linear-gradient(160deg,#1b2210,#13161b)" data-act="open" data-page="coach"><span style="color:var(--acc);width:26px">${I.spark}</span><span class="grow"><b>AI Coach</b><br><span class="small muted">Đánh giá log, đề xuất chỉnh giáo án — bạn duyệt từng thay đổi</span></span><span class="dim">›</span></button>`;
    // heatmap
    h += `<div class="section-t"><h2>16 tuần gần nhất</h2></div><div class="card">${heatmap(today)}</div>`;
    // muscles
    const cur = ms[wks[wks.length - 1]];
    const muscles = [...new Set([...L.MUSCLES, ...wks.flatMap(wk => Object.keys(ms[wk]))])];
    const rows = muscles.map(m => ({ m, v: cur[m] || 0, avg: wks.slice(0, 4).reduce((a, wk) => a + (ms[wk][m] || 0), 0) / 4 })).filter(r => r.v || r.avg);
    const max = Math.max(10, ...rows.map(r => Math.max(r.v, r.avg)));
    h += `<div class="section-t"><h2>Hiệp nặng theo nhóm cơ</h2><span class="tiny muted">tuần này · <span style="opacity:.8">| TB 4 tuần</span></span></div><div class="card">`;
    h += rows.length ? rows.map(r => `<div class="mbar"><span>${esc(r.m)}</span><div class="track"><div class="fill" style="width:${r.v / max * 100}%"></div><div class="avg" style="left:${r.avg / max * 100}%"></div></div><b class="num" style="text-align:right">${+r.v.toFixed(1)}</b></div>`).join('') : '<p class="muted small" style="margin:0">Chưa có dữ liệu 5 tuần gần đây.</p>';
    h += `</div>`;
    // exercise progress
    const counts = {};
    for (const w of fin) for (const it of w.items) if (it.sets.some(L.isWork)) counts[it.exerciseId] = (counts[it.exerciseId] || 0) + 1;
    const exIds = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    h += `<div class="section-t"><h2>Theo bài tập</h2></div>`;
    if (!exIds.length) h += `<div class="card muted small">Tập vài buổi để thấy biểu đồ tiến bộ.</div>`;
    else {
      if (!ui.progEx || !counts[ui.progEx]) ui.progEx = exIds[0];
      const E = exMap();
      h += `<div class="chips" style="margin-bottom:10px">${exIds.map(id => `<button class="chip ${id === ui.progEx ? 'on' : ''}" data-act="progex" data-id="${id}">${esc((E[id] || {}).name || id)}</button>`).join('')}</div>`;
      h += `<div class="card">${exerciseProgress(ui.progEx)}<button class="btn sm wide" style="margin-top:10px" data-act="open" data-page="exercise" data-id="${ui.progEx}">Chi tiết bài</button></div>`;
    }
    // body weight
    const body = [...db.body].sort((a, b) => a.date.localeCompare(b.date));
    h += `<div class="section-t"><h2>Cân nặng</h2></div><div class="card"><div class="row"><input class="inp num" id="bodyKg" inputmode="decimal" placeholder="${body.length ? body[body.length - 1].kg : 'VD: 70,5'}" style="flex:1"><button class="btn pri" data-act="addBody">Lưu hôm nay</button></div>`;
    if (body.length > 1) h += `<div style="margin-top:12px">${lineChart(body.slice(-30).map(b => ({ x: b.date, y: b.kg })), 'kg')}</div>`;
    if (body.length) h += `<div class="small muted" style="margin-top:8px">Gần nhất: <b style="color:var(--tx)">${body[body.length - 1].kg} kg</b> (${fmtDate(body[body.length - 1].date)})${body.length > 1 ? ` · thay đổi ${(body[body.length - 1].kg - body[0].kg > 0 ? '+' : '') + L.round1(body[body.length - 1].kg - body[0].kg)} kg từ ${fmtDate(body[0].date)}` : ''}</div>`;
    h += `</div>`;
    return h;
  }
  function heatmap(today) {
    const start = L.addDays(L.weekStart(today), -7 * 15);
    const per = {};
    for (const w of L.finished(db)) {
      const s = L.workoutStats(w).sets + w.items.filter(it => it.type === 'cardio' && it.sets.some(L.isDone)).length * 4;
      per[w.date] = (per[w.date] || 0) + Math.max(1, s);
    }
    let cells = '';
    for (let i = 0; i < 16 * 7; i++) {
      const d = L.addDays(start, i), v = per[d] || 0;
      const lv = d > today ? 'future' : !v ? '' : v >= 20 ? 'l3' : v >= 10 ? 'l2' : 'l1';
      cells += `<i class="${lv} ${d === today ? 'today' : ''}" title="${d}"></i>`;
    }
    return `<div class="heat">${cells}</div><div class="between tiny dim" style="margin-top:8px"><span>${fmtDate(start)}</span><span>ít ▢ <span style="color:#9cc61f">■</span> <span style="color:var(--acc)">■</span> nhiều</span><span>hôm nay</span></div>`;
  }
  function metricFor(type) { return type === 'weight' || type === 'unilateral' ? ['e1rm', 'e1RM ước tính (kg)'] : type === 'timed' ? ['sec', 'giây tốt nhất'] : type === 'cardio' ? ['min', 'phút'] : ['reps', 'reps tốt nhất']; }
  function exerciseProgress(exId) {
    const ex = exMap()[exId]; if (!ex) return '';
    const hist = L.exerciseHistory(db, exId).reverse();
    const [k, label] = metricFor(ex.type);
    const pts = hist.map(({ workout, item }) => {
      const work = item.sets.filter(L.isWork);
      let y = null;
      for (const s of work) {
        const v = k === 'e1rm' ? L.e1rm(s, item.type) : k === 'reps' ? L.setReps(s, item.type) : L.num(s[k]);
        if (v !== null && (y === null || v > y)) y = v;
      }
      return { x: workout.date, y };
    }).filter(p => p.y !== null);
    const b = L.bests(db, exId);
    let h = `<div class="between"><b>${esc(ex.name)}</b><span class="tiny muted">${label}</span></div>`;
    h += pts.length > 1 ? lineChart(pts.slice(-24), '') : `<p class="small muted">Cần ít nhất 2 buổi để vẽ biểu đồ.</p>`;
    h += `<div class="grid3" style="margin-top:8px">${[['e1RM', b.e1rm && b.e1rm + ' kg'], ['Tạ nặng nhất', b.kg && b.kg + ' kg'], ['Reps nhiều nhất', b.reps]].map(([a, v]) => `<div><div class="tiny muted">${a}</div><b class="num">${v || '—'}</b></div>`).join('')}</div>`;
    return h;
  }
  function lineChart(pts, unit) {
    const W = 320, H = 130, P = { l: 30, r: 10, t: 12, b: 20 };
    const ys = pts.map(p => p.y), lo = Math.min(...ys), hi = Math.max(...ys);
    const pad = (hi - lo) * 0.15 || Math.max(1, hi * 0.05);
    const y0 = lo - pad, y1 = hi + pad;
    const X = i => P.l + (pts.length === 1 ? 0 : i * (W - P.l - P.r) / (pts.length - 1));
    const Y = v => P.t + (1 - (v - y0) / (y1 - y0)) * (H - P.t - P.b);
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
    const area = path + `L${X(pts.length - 1).toFixed(1)},${H - P.b}L${X(0).toFixed(1)},${H - P.b}Z`;
    const bestI = ys.indexOf(hi);
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Biểu đồ"><defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#d4ff3a" stop-opacity=".28"/><stop offset="1" stop-color="#d4ff3a" stop-opacity="0"/></linearGradient></defs>
      <line x1="${P.l}" x2="${W - P.r}" y1="${Y(hi)}" y2="${Y(hi)}" stroke="#272c35" stroke-dasharray="3 3"/><line x1="${P.l}" x2="${W - P.r}" y1="${Y(lo)}" y2="${Y(lo)}" stroke="#272c35" stroke-dasharray="3 3"/>
      <text x="${P.l - 4}" y="${Y(hi) + 3}" text-anchor="end">${+hi.toFixed(1)}</text><text x="${P.l - 4}" y="${Y(lo) + 3}" text-anchor="end">${+lo.toFixed(1)}</text>
      <path d="${area}" fill="url(#g)"/><path d="${path}" fill="none" stroke="#d4ff3a" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.map((p, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${i === bestI ? 4 : 2.6}" fill="${i === bestI ? '#ffb627' : '#d4ff3a'}"/>`).join('')}
      <text x="${P.l}" y="${H - 4}">${fmtDate(pts[0].x)}</text><text x="${W - P.r}" y="${H - 4}" text-anchor="end">${fmtDate(pts[pts.length - 1].x)}</text></svg>`;
  }

  // ---------- LIBRARY ----------
  function vLibrary() {
    let h = `<div class="topbar"><div><div class="eyebrow">${db.exercises.filter(e => e.type !== 'info').length} bài · ${db.templates.length} giáo án</div><h1>Bài & giáo án</h1></div><button class="iconbtn" data-act="open" data-page="settings" aria-label="Cài đặt">${I.gear}</button></div>`;
    h += `<div class="seg"><button class="${ui.libSeg === 'ex' ? 'on' : ''}" data-act="libseg" data-v="ex">Bài tập</button><button class="${ui.libSeg === 'tpl' ? 'on' : ''}" data-act="libseg" data-v="tpl">Giáo án</button></div>`;
    if (ui.libSeg === 'tpl') {
      h += `<div class="list">` + db.templates.map(t => `<button class="li" data-act="open" data-page="template" data-id="${t.id}"><div class="ph" style="color:var(--acc)">${esc(t.short || t.name.slice(0, 1))}</div><div class="grow"><b>${esc(t.name)}</b><span class="small muted">${t.items.length} bài${t.days && t.days.length ? ' · ' + t.days.map(d => DOW[d]).join(', ') : ''}</span></div><span class="chev">›</span></button>`).join('') + `</div>`;
      return h + `<button class="btn wide" data-act="newTpl">+ Giáo án mới</button>`;
    }
    h += `<input class="inp" id="libQ" type="search" placeholder="Tìm bài, nhóm cơ…" value="${esc(ui.libQ)}" style="margin-bottom:12px">`;
    h += `<div class="list" id="libList">${libraryList()}</div><button class="btn wide" data-act="open" data-page="exEdit" data-id="">+ Bài tập mới</button>`;
    return h;
  }
  function libraryList() {
    const q = ui.libQ.trim().toLowerCase();
    const list = db.exercises.filter(e => !q || (e.name + ' ' + (e.muscles || []).join(' ') + ' ' + (L.TYPES[e.type] || {}).label).toLowerCase().includes(q));
    if (!list.length) return `<div class="empty">Không tìm thấy.</div>`;
    return list.map(e => {
      const b = L.bests(db, e.id);
      return `<button class="li" data-act="open" data-page="exercise" data-id="${e.id}">${thumb(e)}<div class="grow"><b class="ellipsis">${esc(e.name)}</b><span class="small muted">${esc((e.muscles || []).join(', ') || L.TYPES[e.type].label)}${b.e1rm ? ` · e1RM ${b.e1rm}` : b.reps ? ` · max ${b.reps} reps` : ''}</span></div><span class="chev">›</span></button>`;
    }).join('');
  }

  // ---------- PAGES ----------
  const PAGES = {};

  PAGES.workout = t => {
    const w = wById(t.id);
    if (!w) return head('Không tìm thấy buổi tập');
    const editing = w.status === 'done';
    const st = L.workoutStats(w);
    let h = head(esc(w.name), editing ? 'Đang sửa buổi đã lưu' : `<span id="elapsed">${mmss((Date.now() - new Date(w.startedAt)) / 1000)}</span> · ${st.sets} hiệp xong`,
      editing ? `<button class="btn sm pri" data-act="back">Xong</button>` : `<button class="btn sm pri" data-act="open" data-page="finish" data-id="${w.id}">Kết thúc</button>`);
    h += `<div class="row" style="margin:6px 0 12px"><label class="small muted" for="wDate" style="white-space:nowrap">Ngày tập</label><input class="inp" id="wDate" type="date" value="${w.date}" data-wf="date" style="min-height:40px"><input class="inp" value="${esc(w.name)}" data-wf="name" aria-label="Tên buổi" style="min-height:40px"></div>`;
    if (!w.items.length) h += `<div class="empty"><b>Chưa có bài nào</b>Thêm bài để bắt đầu ghi hiệp.</div>`;
    w.items.forEach((it, idx) => { h += itemCard(w, it, idx); });
    h += `<button class="btn wide" data-act="pick" data-mode="workout" data-id="${w.id}">+ Thêm bài tập</button>`;
    if (!editing) h += `<button class="btn ghost danger wide" style="margin-top:10px" data-act="discard" data-id="${w.id}">Huỷ buổi này</button>`;
    return h;
  };

  function shortSet(s, type) {
    if (!s) return '';
    const n = L.num;
    switch (type) {
      case 'cardio': return [n(s.min) !== null && n(s.min) + '′', n(s.km) !== null && n(s.km) + 'km'].filter(Boolean).join(' ');
      case 'timed': return `${n(s.sec) ?? '–'}s`;
      case 'band': return `${s.band ? s.band + '×' : ''}${n(s.reps) ?? '–'}`;
      case 'unilateral': return `${n(s.kg) ?? '–'}×${n(s.reps) ?? '–'}/${n(s.repsB) ?? '–'}`;
      case 'bodyweight': return `${n(s.kg) ? '+' + n(s.kg) + '×' : ''}${n(s.reps) ?? '–'}`;
      default: return `${n(s.kg) ?? '–'}×${n(s.reps) ?? '–'}`;
    }
  }
  function placeholders(w, it, i, last, sug) {
    // previous done row in this workout > suggestion > same set last session
    const prevRow = it.sets.slice(0, i).reverse().find(s => L.isDone(s) && !s.warmup);
    const lastSet = last ? last.item.sets.filter(L.isDone)[i] || last.item.sets.filter(L.isWork).slice(-1)[0] : null;
    const ph = {};
    for (const [f] of COLS[it.type] || []) {
      let v = null;
      if (prevRow && prevRow[f] !== undefined && prevRow[f] !== '' && prevRow[f] !== null) v = prevRow[f];
      else if (sug && f === 'kg' && sug.kg) v = sug.kg;
      else if (sug && (f === 'reps' || f === 'repsB') && sug.reps) v = sug.reps;
      else if (sug && f === 'sec' && sug.sec) v = sug.sec;
      else if (lastSet && lastSet[f] !== undefined && lastSet[f] !== null && lastSet[f] !== '') v = lastSet[f];
      if (v !== null) ph[f] = String(v);
    }
    return { ph, lastSet };
  }
  function itemCard(w, it, idx) {
    const ex = exMap()[it.exerciseId] || { name: it.name, type: it.type };
    const cols = COLS[it.type] || COLS.weight;
    const last = L.lastPerformance(db, it.exerciseId, w.id);
    const sug = w.status === 'active' ? L.suggestion(db, it, w.id, db.settings.kgStep) : null;
    const tg = it.target || {};
    const tgt = it.type === 'cardio' ? '' : `${tg.sets || it.sets.length} × ${tg.repLow ? (tg.repLow === tg.repHigh ? tg.repLow : tg.repLow + '–' + tg.repHigh) : '?'} · nghỉ ${tg.rest || 90}s`;
    let h = `<div class="ex" id="it-${it.id}"><div class="ex-h">${thumb(ex)}<div class="grow"><b>${esc(it.name)}</b><span class="small muted">${esc(tgt)}${last ? ` · lần trước ${fmtDate(last.workout.date)}` : ''}</span></div>
      <div class="ex-tools"><button data-act="open" data-page="exercise" data-id="${it.exerciseId}" aria-label="Hướng dẫn">${I.info}</button><button data-act="moveItem" data-id="${w.id}" data-i="${idx}" data-d="-1" aria-label="Lên">${I.up}</button><button data-act="moveItem" data-id="${w.id}" data-i="${idx}" data-d="1" aria-label="Xuống">${I.down}</button><button data-act="rmItem" data-id="${w.id}" data-i="${idx}" aria-label="Xoá bài">${I.x}</button></div></div>`;
    if (sug && sug.text) h += `<div class="hint ${sug.up ? 'up' : ''}">${sug.up ? '↑ ' : '💡 '}${esc(sug.text)}</div>`;
    h += `<table class="sets"><thead><tr><th class="idx">#</th><th>Trước</th>${cols.map(c => `<th>${c[1]}</th>`).join('')}<th class="ok"></th></tr></thead><tbody>`;
    it.sets.forEach((s, i) => {
      const { ph, lastSet } = placeholders(w, it, i, last, sug);
      const n = it.sets.slice(0, i + 1).filter(x => !x.warmup).length;
      h += `<tr class="${s.done ? 'done' : ''}" data-row="${it.id}:${i}"><td class="idx"><button class="${s.warmup ? 'w' : ''}" data-act="warm" data-item="${it.id}" data-set="${i}" aria-label="Đổi hiệp khởi động">${s.warmup ? 'K' : n}</button></td><td class="prev">${esc(shortSet(lastSet, it.type)) || '—'}</td>`;
      for (const [f, , mode] of cols) {
        const v = s[f] === undefined || s[f] === null ? '' : s[f];
        h += `<td><input data-item="${it.id}" data-set="${i}" data-f="${f}" value="${esc(v)}" placeholder="${esc(NO_FILL.has(f) ? '' : ph[f] || '')}" data-ph="${esc(NO_FILL.has(f) ? '' : ph[f] || '')}" inputmode="${mode}" ${mode === 'text' ? 'type="text" maxlength="12"' : 'type="text"'} autocomplete="off" enterkeyhint="next"></td>`;
      }
      h += `<td class="ok"><button data-act="tick" data-item="${it.id}" data-set="${i}" aria-label="Hoàn thành hiệp">${I.check}</button>${s.pr && s.pr.length ? '<span class="pr-tag">PR</span>' : ''}</td></tr>`;
    });
    h += `</tbody></table><div class="ex-note"><input data-inote="${it.id}" value="${esc(it.note || '')}" placeholder="Ghi chú bài (đau, đổi tạ, cảm giác…)"></div>
      <div class="ex-foot"><button class="btn sm" data-act="addSet" data-item="${it.id}">+ Hiệp</button><button class="btn sm ghost" data-act="rmSet" data-item="${it.id}">− Hiệp</button></div></div>`;
    return h;
  }

  PAGES.finish = t => {
    const w = wById(t.id); if (!w) return head('');
    const st = L.workoutStats(w);
    const mins = Math.max(1, Math.round((Date.now() - new Date(w.startedAt)) / 60000));
    const prs = [];
    for (const it of w.items) for (const s of it.sets) if (s.pr && s.pr.length) prs.push(`${it.name}: ${L.describeSet(s, it.type)}`);
    const todayBody = db.body.find(b => b.date === w.date);
    let h = head('Kết thúc buổi', esc(w.name));
    h += `<div class="stats" style="margin-bottom:12px"><div class="stat"><div class="v num">${st.sets}</div><div class="k">hiệp nặng</div></div><div class="stat"><div class="v num">${st.volume ? fmtKg(st.volume) : '—'}</div><div class="k">khối lượng</div></div><div class="stat"><div class="v num">${prs.length}</div><div class="k">PR</div></div></div>`;
    if (prs.length) h += `<div class="card" style="border-color:#6b5112"><h3 style="color:var(--pr)">🏆 Kỷ lục mới</h3>${prs.map(p => `<div class="small">${esc(p)}</div>`).join('')}</div>`;
    h += `<div class="card"><div class="grid2"><div class="field"><label class="f">Thời lượng (phút)</label><input class="inp num" data-wf="durationMin" inputmode="numeric" value="${esc(w.durationMin ?? mins)}"></div><div class="field"><label class="f">Ngủ đêm qua (giờ)</label><input class="inp num" data-wf="sleepH" inputmode="decimal" value="${esc(w.sleepH ?? '')}" placeholder="VD: 6,5"></div></div>
      <label class="f">RPE cả buổi (1 nhẹ – 10 kiệt sức)</label><div class="chips" style="margin-bottom:12px">${[5, 6, 7, 8, 9, 10].map(v => `<button class="chip ${L.num(w.rpe) === v ? 'on' : ''}" data-act="rpe" data-id="${w.id}" data-v="${v}">${v}</button>`).join('')}</div>
      <div class="grid2"><div class="field"><label class="f">Nhịp tim TB (đồng hồ)</label><input class="inp num" data-wf="avgHr" inputmode="numeric" value="${esc(w.avgHr ?? '')}" placeholder="bpm"></div><div class="field"><label class="f">kcal (đồng hồ)</label><input class="inp num" data-wf="kcal" inputmode="numeric" value="${esc(w.kcal ?? '')}"></div></div>
      <div class="field"><label class="f">Cân nặng hôm nay (tuỳ chọn)</label><input class="inp num" id="finBody" inputmode="decimal" value="${todayBody ? todayBody.kg : ''}" placeholder="kg"></div>
      <div class="field" style="margin:0"><label class="f">Ghi chú buổi</label><textarea class="inp" data-wf="notes" placeholder="Phục hồi, đau mỏi, thay đổi…">${esc(w.notes || '')}</textarea></div></div>`;
    h += `<button class="btn pri wide" data-act="finish" data-id="${w.id}">Lưu buổi tập</button><p class="tiny muted" style="text-align:center">Hiệp chưa tick ✓ sẽ không được lưu.</p>`;
    return h;
  };

  PAGES.view = t => {
    const w = wById(t.id); if (!w) return head('Đã xoá');
    const st = L.workoutStats(w), dur = L.durationOf(w);
    let h = head(esc(w.name), fmtLong(w.date));
    const meta = [[dur, 'phút'], [st.sets, 'hiệp'], [st.volume ? fmtKg(st.volume) : null, 'khối lượng'], [w.rpe, 'RPE'], [w.sleepH, 'giờ ngủ'], [w.avgHr, 'bpm TB'], [w.kcal, 'kcal']].filter(m => m[0] !== null && m[0] !== undefined && m[0] !== '');
    h += `<div class="stats" style="grid-template-columns:repeat(${Math.min(4, meta.length || 1)},1fr);margin-bottom:12px">${meta.map(m => `<div class="stat"><div class="v num" style="font-size:20px">${esc(m[0])}</div><div class="k">${m[1]}</div></div>`).join('')}</div>`;
    if (w.notes) h += `<div class="card small">${esc(w.notes)}</div>`;
    for (const it of w.items) {
      const done = it.sets.filter(L.isDone);
      if (!done.length) continue;
      const ex = exMap()[it.exerciseId];
      h += `<div class="card"><div class="row" style="margin-bottom:8px">${thumb(ex, '')}<div class="grow"><b>${esc(it.name)}</b>${it.note ? `<div class="small muted">${esc(it.note)}</div>` : ''}</div></div>`;
      let n = 0;
      h += done.map(s => `<div class="between small" style="padding:5px 0;border-top:1px solid var(--line)"><span class="dim" style="width:26px">${s.warmup ? 'K' : ++n}</span><span class="grow num">${esc(L.describeSet(s, it.type))}</span>${L.e1rm(s, it.type) ? `<span class="tiny dim">e1RM ${L.e1rm(s, it.type)}</span>` : ''}${s.pr && s.pr.length ? '<span class="badge pr" style="margin-left:6px">PR</span>' : ''}</div>`).join('');
      h += `</div>`;
    }
    h += `<div class="grid2"><button class="btn" data-act="editW" data-id="${w.id}">Sửa</button><button class="btn" data-act="repeat" data-id="${w.id}">Tập lại buổi này</button><button class="btn" data-act="copyW" data-id="${w.id}">Copy text</button><button class="btn danger" data-act="delW" data-id="${w.id}">Xoá</button></div>`;
    return h;
  };

  PAGES.exercise = t => {
    const e = exMap()[t.id]; if (!e) return head('Không tìm thấy');
    let h = head(esc(e.name), esc(L.TYPES[e.type].label), `<button class="btn sm" data-act="open" data-page="exEdit" data-id="${e.id}">Sửa</button>`);
    if (e.image) h += `<img class="ex-img" src="${esc(e.image)}" alt="Minh hoạ ${esc(e.name)}">`;
    h += `<div class="row wrap" style="margin-bottom:10px">${(e.muscles || []).map((m, i) => `<span class="badge ${i === 0 ? 'acc' : ''}">${esc(m)}</span>`).join('')}</div>`;
    if (e.focus) h += `<p class="small muted" style="margin:0 0 6px">${esc(e.focus)}</p>`;
    if (e.dosage) h += `<p class="small" style="margin:0 0 12px">🎯 ${esc(e.dosage)}</p>`;
    if (e.type !== 'info' && L.exerciseHistory(db, e.id).length) {
      h += `<div class="card">${exerciseProgress(e.id)}</div>`;
      h += `<div class="section-t"><h2>Các buổi gần đây</h2></div><div class="card">` + L.exerciseHistory(db, e.id).slice(0, 8).map(({ workout, item }) => `<div style="padding:6px 0;border-bottom:1px solid var(--line)"><div class="between small"><b>${fmtDate(workout.date)}</b><span class="tiny dim">${esc(workout.name)}</span></div><div class="small muted num">${item.sets.filter(L.isDone).map(s => (s.warmup ? 'K ' : '') + shortSet(s, item.type)).join(' · ')}</div></div>`).join('') + `</div>`;
    }
    const g = e.guide || {};
    const keys = Object.keys(g).filter(k => (g[k] || []).length);
    if (keys.length) h += `<div class="section-t"><h2>Hướng dẫn</h2></div><div class="card" style="padding:0 16px">` + keys.map(k => `<details class="acc"><summary>${esc(k)}</summary><ul>${g[k].map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>`).join('') + `</div>`;
    return h;
  };

  PAGES.exEdit = t => {
    const e = t.id ? exMap()[t.id] : { name: '', type: 'weight', muscles: [], focus: '' };
    if (!e) return head('Không tìm thấy');
    const sel = t.draftMuscles || e.muscles || [];
    let h = head(t.id ? 'Sửa bài tập' : 'Bài tập mới', '');
    h += `<div class="card"><div class="field"><label class="f">Tên bài</label><input class="inp" id="exName" value="${esc(e.name)}"></div>
      <div class="field"><label class="f">Kiểu ghi</label><select class="inp" id="exType">${Object.entries(L.TYPES).map(([k, v]) => `<option value="${k}" ${e.type === k ? 'selected' : ''}>${v.label} — ${v.fields.join(', ') || 'không ghi'}</option>`).join('')}</select></div>
      <label class="f">Nhóm cơ (chọn nhóm chính trước)</label><div class="row wrap" style="margin-bottom:12px">${L.MUSCLES.concat(['Toàn thân', 'Cardio', 'Mobility']).map(m => { const i = sel.indexOf(m); return `<button class="chip ${i >= 0 ? 'on' : ''}" data-act="muscle" data-v="${esc(m)}">${i === 0 ? '★ ' : ''}${esc(m)}</button>`; }).join('')}</div>
      <div class="field" style="margin:0"><label class="f">Ghi chú / cue</label><textarea class="inp" id="exFocus">${esc(e.focus || '')}</textarea></div></div>
      <button class="btn pri wide" data-act="saveEx">Lưu</button>`;
    if (t.id && e.custom) h += `<button class="btn ghost danger wide" style="margin-top:10px" data-act="delEx" data-id="${e.id}">Xoá bài này</button>`;
    return h;
  };

  PAGES.template = t => {
    const tp = db.templates.find(x => x.id === t.id); if (!tp) return head('Không tìm thấy');
    const E = exMap();
    let h = head('Giáo án', esc(tp.name), `<button class="btn sm pri" data-act="start" data-tpl="${tp.id}">Bắt đầu</button>`);
    h += `<div class="card"><div class="field"><label class="f">Tên</label><input class="inp" data-tf="name" value="${esc(tp.name)}"></div>
      <label class="f">Ngày trong tuần (gợi ý ở tab Hôm nay)</label><div class="chips">${[1, 2, 3, 4, 5, 6, 0].map(d => `<button class="chip ${(tp.days || []).includes(d) ? 'on' : ''}" data-act="tday" data-v="${d}">${DOW[d]}</button>`).join('')}</div></div>`;
    tp.items.forEach((it, i) => {
      const e = E[it.exerciseId] || { name: it.exerciseId };
      h += `<div class="card" style="padding:12px 14px"><div class="row" style="margin-bottom:8px"><b class="grow ellipsis">${i + 1}. ${esc(e.name)}</b><div class="ex-tools"><button data-act="tmove" data-i="${i}" data-d="-1" aria-label="Lên">${I.up}</button><button data-act="tmove" data-i="${i}" data-d="1" aria-label="Xuống">${I.down}</button><button data-act="trm" data-i="${i}" aria-label="Bỏ">${I.x}</button></div></div>
        <div class="grid3" style="grid-template-columns:repeat(4,1fr);gap:8px">${[['sets', 'Hiệp'], ['repLow', 'Reps từ'], ['repHigh', 'đến'], ['rest', 'Nghỉ (s)']].map(([f, l]) => `<div><label class="f">${l}</label><input class="inp num" style="min-height:40px;text-align:center" inputmode="numeric" data-ti="${i}" data-tif="${f}" value="${esc(it[f] ?? '')}"></div>`).join('')}</div></div>`;
    });
    h += `<button class="btn wide" data-act="pick" data-mode="template" data-id="${tp.id}">+ Thêm bài</button><button class="btn ghost danger wide" style="margin-top:10px" data-act="delTpl" data-id="${tp.id}">Xoá giáo án</button>`;
    return h;
  };

  PAGES.picker = t => {
    let h = head('Chọn bài tập', t.mode === 'workout' ? 'Thêm vào buổi đang tập' : 'Thêm vào giáo án');
    h += `<input class="inp" id="pickQ" type="search" placeholder="Tìm hoặc gõ tên bài mới…" value="${esc(ui.pickQ)}" style="margin-bottom:12px"><div class="list" id="pickList">${pickList()}</div>`;
    return h;
  };
  function pickList() {
    const q = ui.pickQ.trim().toLowerCase();
    const list = db.exercises.filter(e => e.type !== 'info' && (!q || (e.name + ' ' + (e.muscles || []).join(' ')).toLowerCase().includes(q)));
    let h = list.map(e => `<button class="li" data-act="pickEx" data-id="${e.id}">${thumb(e)}<div class="grow"><b class="ellipsis">${esc(e.name)}</b><span class="small muted">${esc((e.muscles || []).join(', '))}</span></div><span class="chev">＋</span></button>`).join('');
    if (q && !db.exercises.some(e => e.name.toLowerCase() === q)) h += `<button class="li" data-act="pickNew"><div class="ph" style="color:var(--acc)">+</div><div class="grow"><b>Tạo bài “${esc(ui.pickQ.trim())}”</b><span class="small muted">Kiểu tạ, sửa sau trong thư viện</span></div></button>`;
    return h || '<div class="empty">Gõ tên để tạo bài mới.</div>';
  }

  PAGES.settings = () => {
    const s = db.settings;
    const fin = L.finished(db).length;
    let h = head('Cài đặt & dữ liệu', `${fin} buổi · ${db.exercises.length} bài`);
    h += `<div class="section-t"><h2>Xuất / sao lưu</h2></div><div class="card"><p class="small muted" style="margin-top:0">Lần sao lưu gần nhất: <b style="color:var(--tx)">${s.lastBackupAt ? new Date(s.lastBackupAt).toLocaleString('vi-VN') : 'chưa có'}</b></p>
      <div class="grid2"><button class="btn" data-act="backup">Sao lưu JSON</button><button class="btn" data-act="csv">Xuất CSV</button>${navigator.canShare ? `<button class="btn" data-act="shareBackup">Gửi backup (Drive, Zalo…)</button>` : ''}<button class="btn" data-act="copySummary">Copy log 4 tuần cho AI</button></div>
      <p class="tiny muted" style="margin-bottom:0">CSV: mỗi hiệp một dòng (ngày, bài, kg, reps, RIR, e1RM, khối lượng…), mở được bằng Excel/Sheets/pandas. JSON: bản sao đầy đủ để khôi phục.</p></div>`;
    h += `<div class="section-t"><h2>Nhập dữ liệu</h2></div><div class="card"><button class="btn wide" data-act="import">Nhập file backup…</button><p class="tiny muted" style="margin-bottom:0">Nhận file backup của app này (thay toàn bộ dữ liệu) hoặc <b>FitnessCoach_v4_backup_*.json</b> từ file HTML cũ (gộp thêm, không trùng lặp).</p>
      <button class="btn ghost wide" style="margin-top:8px" data-act="restoreSnap">Khôi phục bản tự lưu đầu ngày</button></div>`;
    h += `<div class="section-t"><h2>Bộ nhớ</h2></div><div class="card small"><div class="between"><span>Lưu bền (Chrome không tự xoá)</span><b style="color:${persisted ? 'var(--ok)' : 'var(--pr)'}">${persisted ? 'Đã bật' : persisted === false ? 'Chưa — hãy cài app ra màn hình chính' : 'Không rõ'}</b></div><div class="between" style="margin-top:6px"><span>Dung lượng dùng</span><b id="usage">…</b></div></div>`;
    h += `<div class="section-t"><h2>Khi tập</h2></div><div class="card" style="padding:4px 16px">
      <div class="switch"><span>Bước tăng tạ gợi ý</span><select class="inp" style="width:auto;min-height:38px" data-setting="kgStep">${[0.5, 1, 2, 2.5, 5].map(v => `<option ${s.kgStep === v ? 'selected' : ''} value="${v}">${v} kg</option>`).join('')}</select></div>
      <label class="switch"><span>Tự bật đồng hồ nghỉ khi tick hiệp</span><input type="checkbox" data-setting="autoRest" ${s.autoRest ? 'checked' : ''}></label>
      <label class="switch"><span>Âm báo hết giờ nghỉ</span><input type="checkbox" data-setting="sound" ${s.sound ? 'checked' : ''}></label>
      <label class="switch"><span>Rung khi hết giờ nghỉ</span><input type="checkbox" data-setting="vibrate" ${s.vibrate ? 'checked' : ''}></label></div>`;
    h += `<div class="section-t"><h2>Đồng hồ Xiaomi / Mi Fitness</h2></div><div class="card small muted">Web app không đọc được Health Connect. Khi kết thúc buổi, nhập nhịp tim TB, kcal và giờ ngủ từ Mi Fitness vào ô tương ứng — chúng có trong file CSV.</div>`;
    h += `<p class="tiny dim" style="text-align:center;margin-top:20px">Gym Log v${VERSION} · dữ liệu chỉ nằm trên máy này</p>`;
    setTimeout(async () => { const e = await Store.estimate(); const el = $('#usage'); if (el && e) el.textContent = (e.usage / 1048576).toFixed(1) + ' MB'; }, 0);
    return h;
  };

  PAGES.coach = () => {
    const c = db.settings.ai || {};
    const configured = c.provider && c.model && (aiKey || c.provider === 'custom');
    let h = head('AI Coach', configured ? `${esc((Coach.PRESETS[c.provider] || {}).label || c.provider)} · ${esc(c.model)}` : 'Chưa cấu hình');
    h += `<details class="card" ${configured ? '' : 'open'} style="padding:12px 16px"><summary style="font-weight:700;cursor:pointer">Cấu hình nhà cung cấp</summary><div style="margin-top:12px">
      <div class="field"><label class="f">Nhà cung cấp</label><select class="inp" id="aiProv">${Object.entries(Coach.PRESETS).map(([k, v]) => `<option value="${k}" ${c.provider === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
      <div class="field"><label class="f">Base URL</label><input class="inp" id="aiUrl" value="${esc(c.baseUrl || Coach.PRESETS[c.provider || 'anthropic'].baseUrl)}"></div>
      <div class="field"><label class="f">Model</label><input class="inp" id="aiModel" value="${esc(c.model || Coach.PRESETS[c.provider || 'anthropic'].model)}"></div>
      <div class="field"><label class="f">API key (chỉ lưu trên máy này, không nằm trong backup)</label><input class="inp" id="aiKey" type="password" autocomplete="off" value="${esc(aiKey)}"></div>
      <button class="btn pri wide" data-act="aiSave">Lưu cấu hình</button><p class="tiny muted" style="margin-bottom:0">Mỗi lần bấm sẽ gửi giáo án + log 6 tuần (không có key/tên bạn) tới nhà cung cấp đã chọn. Phí tính vào tài khoản API của bạn.</p></div></details>`;
    h += `<button class="btn pri wide" data-act="aiReview" ${ui.coachBusy || !configured ? 'disabled' : ''}>${ui.coachBusy ? '<span class="spinner"></span> Đang phân tích…' : '✦ Đánh giá 6 tuần & đề xuất giáo án'}</button>
      <div class="card" style="margin-top:12px"><label class="f">Hỏi coach</label><textarea class="inp" id="aiQ" placeholder="VD: Bench đứng 3 tuần, nên deload hay đổi rep range?"></textarea><button class="btn wide" style="margin-top:8px" data-act="aiAsk" ${ui.coachBusy || !configured ? 'disabled' : ''}>Gửi câu hỏi</button></div>`;
    const r = ui.coachResult;
    if (r) {
      if (r.error) h += `<div class="notice">${esc(r.error)}</div>`;
      else {
        h += `<div class="card"><div class="coach-out">${esc(r.text)}</div></div>`;
        if (r.proposal) {
          h += `<div class="section-t"><h2>Đề xuất thay đổi</h2></div><div class="card">${r.proposal.summary ? `<p class="small" style="margin-top:0">${esc(r.proposal.summary)}</p>` : ''}`;
          h += r.proposal.changes.length ? r.proposal.changes.map((ch, i) => `<label class="change"><input type="checkbox" data-change="${i}" ${ch.applied ? 'disabled checked' : 'checked'}><div><b class="small">${esc(Coach.describeChange(db, ch))}</b>${ch.applied ? ' <span class="badge ok">đã áp dụng</span>' : ''}<div class="tiny muted">${esc(ch.reason || '')}</div></div></label>`).join('') + `<button class="btn pri wide" style="margin-top:10px" data-act="aiApply">Áp dụng mục đã chọn</button>` : '<p class="small muted">Coach không đề xuất đổi giáo án.</p>';
          h += `</div>`;
        }
      }
    }
    const log = (db.coachLog || []).slice().reverse();
    if (log.length) h += `<div class="section-t"><h2>Trước đây</h2></div>` + log.map(x => `<details class="card" style="padding:12px 16px"><summary class="small" style="cursor:pointer"><b>${new Date(x.at).toLocaleDateString('vi-VN')}</b> · ${esc(x.q ? x.q.slice(0, 60) : 'Đánh giá & đề xuất')}</summary><div class="coach-out small" style="margin-top:8px">${esc(x.text)}</div></details>`).join('');
    return h;
  };

  // ---------- rest timer ----------
  function startRest(sec, label) {
    rest = { endAt: Date.now() + sec * 1000, total: sec, label, alerted: false };
    renderRest();
  }
  function renderRest() {
    const root = $('#rest-root');
    if (!rest) { root.innerHTML = ''; return; }
    root.innerHTML = `<div class="rest" id="restBox"><div class="clock" id="restClock">0:00</div><div class="grow small"><div class="muted tiny">Nghỉ</div><div class="ellipsis" style="font-weight:600">${esc(rest.label || '')}</div></div><button class="btn sm" data-act="restAdj" data-v="-15">−15</button><button class="btn sm" data-act="restAdj" data-v="15">+15</button><button class="btn sm pri" data-act="restStop">Bỏ</button><div class="bar" id="restBar"></div></div>`;
    tick();
  }
  function tick() {
    if (rest) {
      const left = (rest.endAt - Date.now()) / 1000;
      const c = $('#restClock'), bar = $('#restBar'), box = $('#restBox');
      if (c) c.textContent = mmss(left > 0 ? Math.ceil(left) : left);
      if (bar) bar.style.width = Math.max(0, Math.min(100, (left / rest.total) * 100)) + '%';
      if (box) box.classList.toggle('over', left <= 0);
      if (left <= 0 && !rest.alerted) { rest.alerted = true; alertRest(); }
      if (left < -180) { rest = null; renderRest(); }
    }
    const el = $('#elapsed');
    const t = top();
    if (el && t && t.type === 'workout') { const w = wById(t.id); if (w) el.textContent = mmss((Date.now() - new Date(w.startedAt)) / 1000); }
  }
  setInterval(tick, 500);
  function alertRest() {
    if (db.settings.vibrate && navigator.vibrate) navigator.vibrate([250, 120, 250, 120, 400]);
    if (db.settings.sound && audioCtx) {
      try {
        const t0 = audioCtx.currentTime;
        [0, 0.25, 0.5].forEach((d, i) => {
          const o = audioCtx.createOscillator(), g = audioCtx.createGain();
          o.frequency.value = i === 2 ? 1320 : 880; o.type = 'sine';
          g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.35, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.18);
          o.connect(g).connect(audioCtx.destination); o.start(t0 + d); o.stop(t0 + d + 0.2);
        });
      } catch (e) { /* ignore */ }
    }
  }
  function unlockAudio() {
    if (audioCtx) { if (audioCtx.state === 'suspended') audioCtx.resume(); return; }
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ }
  }

  // keep screen on while logging
  async function syncWakeLock() {
    const t = top();
    const want = t && t.type === 'workout' && (wById(t.id) || {}).status === 'active' && document.visibilityState === 'visible';
    try {
      if (want && !wakeLock && 'wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
      else if (!want && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { wakeLock = null; }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { syncWakeLock(); tick(); } });

  // ---------- toast / io ----------
  let toastT = null;
  function toast(msg, kind = '') {
    $('#toast-root').innerHTML = `<div class="toast ${kind}">${msg}</div>`;
    clearTimeout(toastT); toastT = setTimeout(() => { $('#toast-root').innerHTML = ''; }, kind === 'pr' ? 3800 : 2600);
  }
  function download(name, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Đã copy'); }
    catch (e) { const x = document.createElement('textarea'); x.value = text; document.body.appendChild(x); x.select(); document.execCommand('copy'); x.remove(); toast('Đã copy'); }
  }
  const stamp = () => L.localDate().replace(/-/g, '');
  function markBackup() { db.settings.lastBackupAt = new Date().toISOString(); save(); }

  // ---------- actions ----------
  function findItem(itemId) { const w = wById(top().id); return { w, it: w && w.items.find(i => i.id === itemId) }; }
  function readRowInputs(itemId, i) { return [...document.querySelectorAll(`input[data-item="${itemId}"][data-set="${i}"]`)]; }

  const ACT = {
    tab: b => { ui.tab = b.dataset.tab; window.scrollTo(0, 0); render(); },
    back: () => back(),
    open: b => { const page = b.dataset.page; if (page === 'picker') ui.pickQ = ''; open({ type: page, id: b.dataset.id || '' }); },
    install: async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; render(); },
    sleep: b => { ui.sleep = ui.sleep === b.dataset.v ? null : b.dataset.v; render(); },
    start: b => {
      const act = activeWorkout();
      if (act) { if (!confirm(`Đang có buổi "${act.name}" chưa kết thúc. Mở buổi đó?`)) return; while (ui.stack.length) ui.stack.pop(); history.replaceState({ depth: 0 }, ''); open({ type: 'workout', id: act.id }); return; }
      const tp = b.dataset.tpl ? db.templates.find(t => t.id === b.dataset.tpl) : null;
      const w = L.newWorkout(db, tp);
      if (ui.sleep) w.readiness = ui.sleep;
      db.workouts.push(w); save();
      while (ui.stack.length) ui.stack.pop();
      history.replaceState({ depth: 0 }, '');
      ui.tab = 'today';
      open({ type: 'workout', id: w.id });
    },
    tick: b => {
      unlockAudio();
      const { w, it } = findItem(b.dataset.item); if (!it) return;
      const i = +b.dataset.set, s = it.sets[i];
      if (s.done) { s.done = false; delete s.pr; save(); render(); return; }
      for (const inp of readRowInputs(it.id, i)) { if (inp.value.trim() === '' && inp.dataset.ph) inp.value = inp.dataset.ph; s[inp.dataset.f] = inp.value.trim(); }
      if (!L.setFilled(s, it.type)) { toast(it.type === 'cardio' ? 'Nhập số phút hoặc km' : it.type === 'timed' ? 'Nhập số giây' : 'Nhập số reps'); return; }
      if (it.type === 'unilateral' && L.num(s.repsB) === null) s.repsB = s.reps;
      s.done = true; s.at = new Date().toISOString();
      const prs = L.detectPR(db, w, it, s);
      if (prs.length) s.pr = prs.map(p => p.kind); else delete s.pr;
      save();
      if (prs.length) {
        const p = prs[0];
        toast(`🏆 PR ${p.kind === 'e1rm' ? 'e1RM' : p.kind === 'kg' ? 'tạ' : 'reps'}: ${p.value}${p.kind === 'reps' ? '' : ' kg'} (trước ${p.prev})`, 'pr');
        if (db.settings.vibrate && navigator.vibrate) navigator.vibrate([60, 40, 60]);
      }
      const isLast = it.sets.every(x => x.done);
      if (w.status === 'active' && db.settings.autoRest && it.type !== 'cardio') startRest((it.target && it.target.rest) || 90, isLast ? 'Bài tiếp theo' : it.name);
      render();
    },
    warm: b => { const { it } = findItem(b.dataset.item); if (!it) return; const s = it.sets[+b.dataset.set]; s.warmup = !s.warmup; if (s.done) { const { w } = findItem(b.dataset.item); const prs = L.detectPR(db, w, it, s); if (prs.length) s.pr = prs.map(p => p.kind); else delete s.pr; } save(); render(); },
    addSet: b => { const { it } = findItem(b.dataset.item); if (!it) return; it.sets.push({ done: false }); save(); render(); },
    rmSet: b => {
      const { it } = findItem(b.dataset.item); if (!it || !it.sets.length) return;
      const s = it.sets[it.sets.length - 1];
      if (s.done && !confirm('Xoá hiệp cuối (đã hoàn thành)?')) return;
      it.sets.pop(); save(); render();
    },
    moveItem: b => { const w = wById(b.dataset.id); const i = +b.dataset.i, j = i + +b.dataset.d; if (j < 0 || j >= w.items.length) return; [w.items[i], w.items[j]] = [w.items[j], w.items[i]]; save(); render(); },
    rmItem: b => { const w = wById(b.dataset.id); const it = w.items[+b.dataset.i]; if (it.sets.some(L.isDone) && !confirm(`Xoá ${it.name} và các hiệp đã ghi?`)) return; w.items.splice(+b.dataset.i, 1); save(); render(); },
    discard: b => { if (!confirm('Huỷ buổi này? Mọi hiệp đã ghi sẽ mất.')) return; db.workouts = db.workouts.filter(w => w.id !== b.dataset.id); rest = null; save(); back(); },
    pick: b => { ui.pickQ = ''; open({ type: 'picker', mode: b.dataset.mode, id: b.dataset.id }); },
    pickEx: b => addPicked(exMap()[b.dataset.id]),
    pickNew: () => {
      const name = ui.pickQ.trim(); if (!name) return;
      const e = { id: L.uid('x'), name, type: 'weight', muscles: [], focus: '', custom: true, image: null, guide: {} };
      db.exercises.push(e); addPicked(e);
    },
    rpe: b => { const w = wById(b.dataset.id); w.rpe = L.num(w.rpe) === +b.dataset.v ? null : +b.dataset.v; save(); render(); },
    finish: b => {
      const w = wById(b.dataset.id);
      for (const it of w.items) it.sets = it.sets.filter(L.isDone);
      w.items = w.items.filter(it => it.sets.length);
      if (!w.items.length && !confirm('Không có hiệp nào được tick ✓. Vẫn lưu buổi (chỉ thời lượng/ghi chú)?')) return;
      w.status = 'done'; w.endedAt = new Date().toISOString();
      for (const f of ['durationMin', 'sleepH', 'avgHr', 'kcal']) w[f] = L.num(w[f]);
      const bk = L.num(($('#finBody') || {}).value);
      if (bk) { db.body = db.body.filter(x => x.date !== w.date); db.body.push({ date: w.date, kg: bk }); }
      rest = null; save(); Store.flush();
      toast('Đã lưu buổi tập 💪');
      ui.stack.pop(); ui.stack[ui.stack.length - 1] = { type: 'view', id: w.id }; history.back();
    },
    editW: b => open({ type: 'workout', id: b.dataset.id }),
    repeat: b => {
      if (activeWorkout()) { toast('Đang có buổi chưa kết thúc'); return; }
      const src = wById(b.dataset.id);
      const w = L.newWorkout(db, null);
      w.name = src.name; w.templateId = src.templateId;
      w.items = src.items.map(it => ({ ...L.newItem(db, exMap()[it.exerciseId] || { id: it.exerciseId, name: it.name, type: it.type }, it.target), name: it.name, type: it.type }));
      w.items.forEach((it, k) => { it.sets = Array.from({ length: Math.max(1, src.items[k].sets.filter(s => !s.warmup).length) }, () => ({ done: false })); });
      db.workouts.push(w); save(); replaceTop({ type: 'workout', id: w.id });
    },
    copyW: b => { const w = wById(b.dataset.id); copy(`${w.date} · ${w.name}\n` + w.items.map(it => `- ${it.name}: ${it.sets.filter(L.isDone).map(s => (s.warmup ? '(k) ' : '') + L.describeSet(s, it.type)).join(' | ')}`).join('\n') + (w.notes ? `\nGhi chú: ${w.notes}` : '')); },
    delW: b => { const w = wById(b.dataset.id); if (!confirm(`Xoá buổi ${w.name} ngày ${fmtDate(w.date)}?`)) return; db.workouts = db.workouts.filter(x => x.id !== w.id); save(); back(); toast('Đã xoá'); },
    progex: b => { ui.progEx = b.dataset.id; render(); },
    addBody: () => { const v = L.num($('#bodyKg').value); if (!v || v < 20 || v > 300) { toast('Nhập cân nặng hợp lệ'); return; } const d = L.localDate(); db.body = db.body.filter(x => x.date !== d); db.body.push({ date: d, kg: v }); save(); render(); toast('Đã lưu cân nặng'); },
    libseg: b => { ui.libSeg = b.dataset.v; render(); },
    muscle: b => {
      const t = top(); const e = t.id ? exMap()[t.id] : null;
      const sel = t.draftMuscles || (e ? [...(e.muscles || [])] : []);
      const m = b.dataset.v, i = sel.indexOf(m);
      if (i >= 0) sel.splice(i, 1); else sel.push(m);
      t.draftName = $('#exName').value; t.draftType = $('#exType').value; t.draftFocus = $('#exFocus').value;
      t.draftMuscles = sel; render();
      $('#exName').value = t.draftName; $('#exType').value = t.draftType; $('#exFocus').value = t.draftFocus;
    },
    saveEx: () => {
      const t = top();
      const name = $('#exName').value.trim(); if (!name) { toast('Nhập tên bài'); return; }
      const data = { name, type: $('#exType').value, focus: $('#exFocus').value.trim() };
      let e = t.id ? exMap()[t.id] : null;
      if (t.draftMuscles) data.muscles = t.draftMuscles;
      if (e) Object.assign(e, data);
      else { e = Object.assign({ id: L.uid('x'), custom: true, image: null, guide: {}, muscles: [] }, data); db.exercises.push(e); }
      save(); back(); toast('Đã lưu');
    },
    delEx: b => {
      const used = L.finished(db).some(w => w.items.some(it => it.exerciseId === b.dataset.id));
      if (!confirm(used ? 'Bài này có trong lịch sử. Lịch sử vẫn giữ tên bài, nhưng bài sẽ biến khỏi thư viện. Xoá?' : 'Xoá bài này?')) return;
      db.exercises = db.exercises.filter(e => e.id !== b.dataset.id);
      for (const t of db.templates) t.items = t.items.filter(i => i.exerciseId !== b.dataset.id);
      save(); ui.stack.splice(-2); history.go(-2);
    },
    newTpl: () => { const t = { id: L.uid('t'), name: 'Giáo án mới', short: '', days: [], items: [] }; db.templates.push(t); save(); open({ type: 'template', id: t.id }); },
    tday: b => { const tp = db.templates.find(x => x.id === top().id); const d = +b.dataset.v; tp.days = (tp.days || []).includes(d) ? tp.days.filter(x => x !== d) : [...(tp.days || []), d]; save(); render(); },
    tmove: b => { const tp = db.templates.find(x => x.id === top().id); const i = +b.dataset.i, j = i + +b.dataset.d; if (j < 0 || j >= tp.items.length) return; [tp.items[i], tp.items[j]] = [tp.items[j], tp.items[i]]; save(); render(); },
    trm: b => { const tp = db.templates.find(x => x.id === top().id); tp.items.splice(+b.dataset.i, 1); save(); render(); },
    delTpl: b => { if (!confirm('Xoá giáo án này? Lịch sử không bị ảnh hưởng.')) return; db.templates = db.templates.filter(t => t.id !== b.dataset.id); db.deletedTemplates = [...(db.deletedTemplates || []), b.dataset.id]; save(); back(); },
    backup: () => { download(`GymLog_backup_${stamp()}.json`, L.backupJSON(db), 'application/json'); markBackup(); toast('Đã tải file backup'); render(); },
    csv: () => { download(`GymLog_sets_${stamp()}.csv`, L.toCSV(db), 'text/csv;charset=utf-8'); toast('Đã tải CSV'); },
    shareBackup: async () => {
      const f = new File([L.backupJSON(db)], `GymLog_backup_${stamp()}.json`, { type: 'application/json' });
      if (!navigator.canShare || !navigator.canShare({ files: [f] })) { ACT.backup(); return; }
      try { await navigator.share({ files: [f], title: 'Gym Log backup' }); markBackup(); render(); } catch (e) { /* cancelled */ }
    },
    copySummary: () => copy(L.summaryText(db, 28)),
    import: () => $('#importFile').click(),
    restoreSnap: async () => {
      const { db: snap, meta } = await Store.loadSnapshot();
      if (!snap) { toast('Chưa có bản tự lưu'); return; }
      if (!confirm(`Khôi phục dữ liệu về bản tự lưu ngày ${meta && meta.date}? (${(snap.workouts || []).filter(w => w.status === 'done').length} buổi). Thay đổi sau thời điểm đó sẽ mất.`)) return;
      db = L.mergeSeed(L.normalizeDB(snap), SEED); save(); render(); toast('Đã khôi phục');
    },
    restAdj: b => { if (rest) { rest.endAt += +b.dataset.v * 1000; rest.total = Math.max(rest.total, (rest.endAt - Date.now()) / 1000); rest.alerted = false; tick(); } },
    restStop: () => { rest = null; renderRest(); },
    aiSave: async () => {
      const provider = $('#aiProv').value;
      db.settings.ai = { provider, baseUrl: $('#aiUrl').value.trim(), model: $('#aiModel').value.trim() };
      aiKey = $('#aiKey').value.trim();
      await Store.put('aiKey', aiKey); save(); toast('Đã lưu cấu hình'); render();
    },
    aiReview: () => runCoach(() => Coach.review(db, db.settings.ai, aiKey), null),
    aiAsk: () => { const q = $('#aiQ').value.trim(); if (!q) { toast('Nhập câu hỏi'); return; } runCoach(() => Coach.ask(db, db.settings.ai, aiKey, q), q); },
    aiApply: () => {
      const r = ui.coachResult; if (!r || !r.proposal) return;
      let n = 0;
      document.querySelectorAll('input[data-change]').forEach(cb => { const ch = r.proposal.changes[+cb.dataset.change]; if (cb.checked && !ch.applied) { Coach.applyChange(db, ch); ch.applied = true; n++; } });
      save(); render(); toast(n ? `Đã áp dụng ${n} thay đổi vào giáo án` : 'Không có mục nào được chọn');
    },
  };
  function addPicked(e) {
    const t = top(); if (!e) return;
    if (t.mode === 'workout') {
      const w = wById(t.id);
      const tgt = (db.templates.find(x => x.id === w.templateId) || { items: [] }).items.find(i => i.exerciseId === e.id);
      const it = L.newItem(db, e, tgt);
      w.items.push(it);
      save(); back();
      setTimeout(() => { const el = document.getElementById('it-' + it.id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 120);
    } else {
      const tp = db.templates.find(x => x.id === t.id);
      tp.items.push({ exerciseId: e.id, sets: e.type === 'cardio' ? 1 : 3, repLow: e.type === 'cardio' ? null : 8, repHigh: e.type === 'cardio' ? null : 12, rest: 90 });
      save(); back();
    }
  }
  async function runCoach(fn, q) {
    ui.coachBusy = true; ui.coachResult = null; render();
    try {
      const r = await fn();
      ui.coachResult = r;
      db.coachLog = [...(db.coachLog || []), { at: new Date().toISOString(), q, text: r.text }].slice(-10);
      save();
    } catch (e) {
      ui.coachResult = { error: (e && e.message) || String(e) };
      if (/Failed to fetch|NetworkError/i.test(ui.coachResult.error)) ui.coachResult.error += ' — kiểm tra mạng, Base URL, hoặc endpoint có cho phép gọi từ trình duyệt (CORS) không.';
    }
    ui.coachBusy = false; render();
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const fn = ACT[b.dataset.act];
    if (fn) { e.preventDefault(); fn(b, e); }
  });
  document.addEventListener('input', e => {
    const t = e.target, d = t.dataset;
    if (d.item !== undefined && d.f) {
      const { it } = findItem(d.item); if (!it) return;
      const s = it.sets[+d.set]; s[d.f] = t.value.trim(); save();
    } else if (d.inote) { const { it } = findItem(d.inote); if (it) { it.note = t.value; save(); } }
    else if (d.wf) { const w = wById(top().id); if (w) { if (d.wf === 'date') { if (t.value) w.date = t.value; } else w[d.wf] = t.value; save(); } }
    else if (d.tf) { const tp = db.templates.find(x => x.id === top().id); if (tp) { tp[d.tf] = t.value; save(); } }
    else if (d.ti !== undefined) { const tp = db.templates.find(x => x.id === top().id); if (tp) { tp.items[+d.ti][d.tif] = L.num(t.value); save(); } }
    else if (t.id === 'libQ') { ui.libQ = t.value; $('#libList').innerHTML = libraryList(); }
    else if (t.id === 'pickQ') { ui.pickQ = t.value; $('#pickList').innerHTML = pickList(); }
  });
  document.addEventListener('change', e => {
    const t = e.target, k = t.dataset.setting;
    if (k) { db.settings[k] = t.type === 'checkbox' ? t.checked : Number(t.value); save(); }
    if (t.id === 'aiProv') { const p = Coach.PRESETS[t.value]; $('#aiUrl').value = p.baseUrl; $('#aiModel').value = p.model; }
  });
  // select-all on focus makes overwriting numbers one tap
  document.addEventListener('focusin', e => { if (e.target.matches('.sets input')) setTimeout(() => e.target.select(), 0); });
  // Enter on a set row jumps to the next input
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.matches('.sets input')) return;
    e.preventDefault();
    const all = [...document.querySelectorAll('.sets input')];
    const n = all[all.indexOf(e.target) + 1];
    if (n) n.focus(); else e.target.blur();
  });

  $('#importFile').addEventListener('change', async ev => {
    const f = ev.target.files && ev.target.files[0]; ev.target.value = '';
    if (!f) return;
    try {
      const r = L.parseBackup(JSON.parse(await f.text()), SEED);
      if (r.kind === 'full') {
        const n = r.db.workouts.filter(w => w.status === 'done').length;
        if (!confirm(`File có ${n} buổi. THAY THẾ toàn bộ dữ liệu hiện tại (${L.finished(db).length} buổi)?`)) return;
        db = L.mergeSeed(r.db, SEED);
      } else {
        const added = L.mergeWorkouts(db, r.workouts);
        alert(`Đã nhập ${added} buổi từ file v4 cũ${r.drafts ? ` (gồm ${r.drafts} nháp chưa xác nhận, có ghi "nháp v4")` : ''}.${r.warnings.length ? '\n\nCảnh báo:\n' + r.warnings.join('\n') : ''}${added < r.workouts.length ? `\n${r.workouts.length - added} buổi đã có sẵn nên bỏ qua.` : ''}`);
      }
      save(); Store.flush(); render(); toast('Nhập xong');
    } catch (e) { alert('Không nhập được: ' + e.message); }
  });
  window.addEventListener('store-error', () => toast('⚠️ Không lưu được vào bộ nhớ máy — hãy sao lưu JSON ngay!'));
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (ui.tab === 'today' && !top()) render(); });
  window.addEventListener('appinstalled', () => { installEvt = null; Store.persist().then(p => { persisted = p; }); render(); });

  // ---------- boot ----------
  async function boot() {
    let saved = null;
    try { saved = await Store.load(); aiKey = (await Store.get('aiKey')) || ''; }
    catch (e) { $('#app').innerHTML = `<div class="notice" style="margin-top:20px">Không mở được bộ nhớ của trình duyệt (${esc(e.message)}). Đừng dùng tab ẩn danh.</div>`; return; }
    db = saved ? L.mergeSeed(L.normalizeDB(saved), SEED) : L.seedDB(SEED);
    history.replaceState({ depth: 0 }, '');
    const act = activeWorkout();
    render();
    if (act) { open({ type: 'workout', id: act.id }); }
    save();
    Store.snapshotDaily(db, L.localDate()).catch(() => {});
    persisted = await Store.persist();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
      let had = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) toast('Đã có bản cập nhật — đóng & mở lại app để dùng'); had = true; });
    }
  }
  boot();
})();
