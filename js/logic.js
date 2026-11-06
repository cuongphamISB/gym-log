// Pure data logic: no DOM, no storage. Shared by the app and by node tests.
(function (root) {
  'use strict';

  const SCHEMA = 1;
  const TYPES = {
    weight: { label: 'Tạ', fields: ['kg', 'reps', 'rir'] },
    unilateral: { label: 'Tạ 1 bên (A/B)', fields: ['kg', 'reps', 'repsB', 'rir'] },
    bodyweight: { label: 'Bodyweight', fields: ['kg', 'reps', 'rir'] },
    band: { label: 'Dây kháng lực', fields: ['band', 'reps', 'rir'] },
    timed: { label: 'Giữ thời gian', fields: ['kg', 'sec', 'rir'] },
    cardio: { label: 'Cardio / thời lượng', fields: ['min', 'km', 'rpe'] },
    info: { label: 'Chỉ hướng dẫn', fields: [] },
  };
  const MUSCLES = ['Ngực', 'Lưng', 'Vai', 'Tay trước', 'Tay sau', 'Đùi trước', 'Đùi sau', 'Mông', 'Bắp chân', 'Core'];

  const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = n => String(n).padStart(2, '0');
  function localDate(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); }
  function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return localDate(d); }
  function weekStart(s) { const d = parseDate(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return localDate(d); }
  // Number or null. Accepts "12,5" (Vietnamese decimal comma).
  function num(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim().replace(',', '.');
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  const round1 = n => Math.round(n * 10) / 10;

  function emptyDB() {
    return { schema: SCHEMA, exercises: [], templates: [], workouts: [], body: [], settings: defaultSettings() };
  }
  function defaultSettings() {
    return { kgStep: 1, autoRest: true, sound: true, vibrate: true, lastBackupAt: null, createdAt: new Date().toISOString() };
  }
  function seedDB(seed) {
    const db = emptyDB();
    db.exercises = clone(seed.exercises);
    db.templates = clone(seed.templates);
    return db;
  }
  // Refresh built-in exercises/templates from a newer seed without touching user data/edits.
  function mergeSeed(db, seed) {
    const have = new Set(db.exercises.map(e => e.id));
    for (const e of seed.exercises) {
      if (!have.has(e.id)) db.exercises.push(clone(e));
      else {
        const cur = db.exercises.find(x => x.id === e.id);
        if (!cur.custom) { cur.guide = e.guide; cur.image = e.image; cur.focus = cur.focus || e.focus; cur.dosage = cur.dosage || e.dosage; }
      }
    }
    const haveT = new Set(db.templates.map(t => t.id));
    for (const t of seed.templates) if (!haveT.has(t.id) && !(db.deletedTemplates || []).includes(t.id)) db.templates.push(clone(t));
    return db;
  }
  const clone = o => JSON.parse(JSON.stringify(o));

  // ---------- sets ----------
  function isDone(s) { return !!(s && s.done); }
  function isWork(s) { return isDone(s) && !s.warmup; }
  function setReps(s, type) {
    const a = num(s.reps), b = num(s.repsB);
    if (type === 'unilateral' && b !== null && a !== null) return Math.min(a, b);
    return a;
  }
  // Epley e1RM, only for loaded sets of 1–15 reps.
  function e1rm(s, type) {
    if (!(type === 'weight' || type === 'unilateral')) return null;
    const kg = num(s.kg), reps = setReps(s, type);
    if (!kg || !reps || reps < 1 || reps > 15) return null;
    return round1(reps === 1 ? kg : kg * (1 + reps / 30));
  }
  function setVolume(s, type) {
    const kg = num(s.kg);
    if (!kg) return 0;
    if (type === 'unilateral') return kg * ((num(s.reps) || 0) + (num(s.repsB) || 0));
    if (type === 'weight' || type === 'bodyweight') return kg * (num(s.reps) || 0);
    return 0;
  }
  // A set is "filled" when its main metric is present.
  function setFilled(s, type) {
    if (type === 'cardio') return num(s.min) !== null || num(s.km) !== null;
    if (type === 'timed') return num(s.sec) !== null;
    return num(s.reps) !== null;
  }
  function describeSet(s, type) {
    const p = [];
    const kg = num(s.kg);
    switch (type) {
      case 'cardio':
        if (num(s.min) !== null) p.push(num(s.min) + ' phút');
        if (num(s.km) !== null) p.push(num(s.km) + ' km');
        if (num(s.rpe) !== null) p.push('RPE ' + num(s.rpe));
        return p.join(' · ') || '—';
      case 'timed':
        return `${num(s.sec) ?? '–'}s${kg ? ' · +' + kg + 'kg' : ''}${num(s.rir) !== null ? ' · RIR ' + num(s.rir) : ''}`;
      case 'band':
        return `${s.band ? s.band + ' × ' : ''}${num(s.reps) ?? '–'}${num(s.rir) !== null ? ' · RIR ' + num(s.rir) : ''}`;
      case 'unilateral':
        return `${kg ?? '–'}kg × ${num(s.reps) ?? '–'}/${num(s.repsB) ?? '–'}${num(s.rir) !== null ? ' · RIR ' + num(s.rir) : ''}`;
      case 'bodyweight':
        return `${kg ? '+' + kg + 'kg × ' : 'BW × '}${num(s.reps) ?? '–'}${num(s.rir) !== null ? ' · RIR ' + num(s.rir) : ''}`;
      default:
        return `${kg ?? '–'}kg × ${num(s.reps) ?? '–'}${num(s.rir) !== null ? ' · RIR ' + num(s.rir) : ''}`;
    }
  }

  // ---------- workouts ----------
  const finished = db => db.workouts.filter(w => w.status === 'done');
  function sortedDesc(ws) { return [...ws].sort((a, b) => (b.date + (b.startedAt || '')).localeCompare(a.date + (a.startedAt || ''))); }

  function newWorkout(db, template, date = localDate()) {
    const exMap = byId(db.exercises);
    const items = template ? template.items.filter(it => exMap[it.exerciseId] && exMap[it.exerciseId].type !== 'info').map(it => newItem(db, exMap[it.exerciseId], it)) : [];
    return {
      id: uid('w'), status: 'active', templateId: template ? template.id : null, name: template ? template.name : 'Buổi tự do',
      date, startedAt: new Date().toISOString(), endedAt: null, durationMin: null, rpe: null, sleepH: null, notes: '', items,
    };
  }
  function newItem(db, ex, target) {
    const t = target || { sets: ex.type === 'cardio' ? 1 : 3, repLow: null, repHigh: null, rest: 90 };
    const n = Math.max(1, t.sets || 1);
    return {
      id: uid('i'), exerciseId: ex.id, name: ex.name, type: ex.type, note: '',
      target: { sets: t.sets, repLow: t.repLow, repHigh: t.repHigh, rest: t.rest || 90 },
      sets: Array.from({ length: n }, () => ({ done: false })),
    };
  }

  function exerciseHistory(db, exId, excludeId) {
    const out = [];
    for (const w of sortedDesc(finished(db))) {
      if (w.id === excludeId) continue;
      for (const it of w.items) if (it.exerciseId === exId && it.sets.some(isDone)) out.push({ workout: w, item: it });
    }
    return out;
  }
  function lastPerformance(db, exId, excludeId) { return exerciseHistory(db, exId, excludeId)[0] || null; }

  function bests(db, exId, excludeId) {
    let e = null, kg = null, reps = null;
    for (const { item } of exerciseHistory(db, exId, excludeId)) {
      for (const s of item.sets) {
        if (!isWork(s)) continue;
        const v = e1rm(s, item.type);
        if (v !== null && (e === null || v > e)) e = v;
        const k = num(s.kg);
        if (k !== null && (kg === null || k > kg)) kg = k;
        const r = setReps(s, item.type);
        if (r !== null && (reps === null || r > reps)) reps = r;
      }
    }
    return { e1rm: e, kg, reps };
  }
  // PR kinds achieved by `set` versus all finished workouts except the current one.
  function detectPR(db, workout, item, set) {
    if (!isWork(set)) return [];
    const b = bests(db, item.exerciseId, workout.id);
    // also compare with earlier sets in this same workout
    for (const it of workout.items) {
      if (it.exerciseId !== item.exerciseId) continue;
      for (const s of it.sets) {
        if (s === set || !isWork(s)) continue;
        const v = e1rm(s, it.type); if (v !== null && (b.e1rm === null || v > b.e1rm)) b.e1rm = v;
        const k = num(s.kg); if (k !== null && (b.kg === null || k > b.kg)) b.kg = k;
        const r = setReps(s, it.type); if (r !== null && (b.reps === null || r > b.reps)) b.reps = r;
      }
    }
    const hasHistory = exerciseHistory(db, item.exerciseId, workout.id).length > 0;
    if (!hasHistory) return [];
    const out = [];
    const v = e1rm(set, item.type), k = num(set.kg), r = setReps(set, item.type);
    if (v !== null && b.e1rm !== null && v > b.e1rm) out.push({ kind: 'e1rm', value: v, prev: b.e1rm });
    if (k !== null && k > 0 && b.kg !== null && k > b.kg) out.push({ kind: 'kg', value: k, prev: b.kg });
    if ((item.type === 'bodyweight' || item.type === 'band') && r !== null && b.reps !== null && r > b.reps && !k) out.push({ kind: 'reps', value: r, prev: b.reps });
    return out;
  }

  // Double progression based on the last session for this exercise.
  function suggestion(db, item, excludeId, kgStep = 1) {
    const last = lastPerformance(db, item.exerciseId, excludeId);
    const { repLow, repHigh } = item.target || {};
    if (!last) return null;
    const work = last.item.sets.filter(isWork);
    if (!work.length) return null;
    const type = item.type;
    if (type === 'cardio' || type === 'info') return null;
    if (type === 'timed') {
      const best = Math.max(...work.map(s => num(s.sec) || 0));
      return { text: `Lần trước tối đa ${best}s → thử ${best + 5}s`, sec: best + 5 };
    }
    const reps = work.map(s => setReps(s, type) || 0);
    const topKg = Math.max(...work.map(s => num(s.kg) || 0));
    const minR = Math.min(...reps);
    if (!repHigh) return { text: `Lần trước: ${work.map(s => describeSet(s, type)).join(', ')}` };
    if (minR >= repHigh) {
      if (type === 'weight' || type === 'unilateral') {
        const step = type === 'unilateral' || /DB|dumbbell/i.test(item.name) ? Math.max(kgStep, 1) : kgStep;
        return { text: `Đạt ${repHigh} reps mọi hiệp → tăng lên ${round1(topKg + step)}kg, về ${repLow || repHigh} reps`, kg: round1(topKg + step), reps: repLow, up: true };
      }
      if (type === 'band') return { text: `Đạt ${repHigh} reps mọi hiệp → đổi dây nặng hơn`, up: true };
      return { text: `Đạt ${repHigh} reps mọi hiệp → thêm tạ/biến thể khó hơn`, up: true };
    }
    if (repLow && minR < repLow) return { text: `Có hiệp dưới ${repLow} reps → giữ ${topKg ? topKg + 'kg' : 'mức cũ'}, ưu tiên đủ reps`, kg: topKg || null };
    return { text: `Giữ ${topKg ? topKg + 'kg' : 'mức cũ'}, cố thêm 1 rep (mục tiêu ${repHigh})`, kg: topKg || null, reps: Math.min(repHigh, minR + 1) };
  }

  function workoutStats(w) {
    let sets = 0, volume = 0, exercises = 0;
    for (const it of w.items) {
      const done = it.sets.filter(isWork);
      if (done.length) exercises++;
      if (it.type === 'cardio') continue; // cardio is not a "hard set"
      sets += done.length;
      for (const s of done) volume += setVolume(s, it.type);
    }
    return { sets, volume: Math.round(volume), exercises };
  }
  function durationOf(w) {
    if (num(w.durationMin) !== null) return num(w.durationMin);
    if (w.startedAt && w.endedAt) return Math.max(1, Math.round((new Date(w.endedAt) - new Date(w.startedAt)) / 60000));
    return null;
  }

  // Hard sets per muscle per week. Primary muscle = 1, secondary = 0.5.
  function muscleSetsByWeek(db, weeks = 8, today = localDate()) {
    const exMap = byId(db.exercises);
    const start = addDays(weekStart(today), -7 * (weeks - 1));
    const out = {};
    for (let i = 0; i < weeks; i++) out[addDays(start, 7 * i)] = {};
    for (const w of finished(db)) {
      if (w.date < start) continue;
      const wk = weekStart(w.date);
      if (!out[wk]) continue;
      for (const it of w.items) {
        const ms = (exMap[it.exerciseId] && exMap[it.exerciseId].muscles) || [];
        const n = it.sets.filter(isWork).length;
        if (!n || it.type === 'cardio') continue;
        ms.forEach((m, i) => { out[wk][m] = (out[wk][m] || 0) + n * (i === 0 ? 1 : 0.5); });
      }
    }
    return out;
  }
  function e1rmSeries(db, exId) {
    const pts = [];
    for (const { workout, item } of exerciseHistory(db, exId).reverse()) {
      let best = null, top = null;
      for (const s of item.sets.filter(isWork)) {
        const v = e1rm(s, item.type); if (v !== null && (best === null || v > best)) best = v;
        const k = num(s.kg); if (k !== null && (top === null || k > top)) top = k;
      }
      const reps = Math.max(0, ...item.sets.filter(isWork).map(s => setReps(s, item.type) || 0));
      pts.push({ date: workout.date, e1rm: best, kg: top, reps });
    }
    return pts;
  }
  function streakWeeks(db, today = localDate()) {
    const weeks = new Set(finished(db).map(w => weekStart(w.date)));
    let wk = weekStart(today), n = 0;
    if (!weeks.has(wk)) wk = addDays(wk, -7);
    while (weeks.has(wk)) { n++; wk = addDays(wk, -7); }
    return n;
  }

  // ---------- export ----------
  const CSV_COLS = ['date', 'workout', 'workout_id', 'exercise_id', 'exercise', 'type', 'muscle', 'set', 'warmup', 'kg', 'reps', 'reps_b', 'rir', 'rir_b', 'band', 'seconds', 'minutes', 'km', 'rpe', 'volume_kg', 'e1rm_kg', 'set_time', 'workout_start', 'duration_min', 'session_rpe', 'sleep_h', 'body_kg', 'set_note', 'exercise_note', 'workout_note'];
  function csvCell(v) {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  // One row per completed set. Unfinished (unchecked) sets are never exported.
  function toCSV(db) {
    const exMap = byId(db.exercises);
    const bodyByDate = {};
    for (const b of [...db.body].sort((a, b) => a.date.localeCompare(b.date))) bodyByDate[b.date] = b.kg;
    const bodyOn = d => { let v = null; for (const k of Object.keys(bodyByDate).sort()) { if (k <= d) v = bodyByDate[k]; } return v; };
    const rows = [CSV_COLS.join(',')];
    const ws = [...finished(db)].sort((a, b) => (a.date + (a.startedAt || '')).localeCompare(b.date + (b.startedAt || '')));
    for (const w of ws) {
      for (const it of w.items) {
        let n = 0;
        for (const s of it.sets) {
          if (!isDone(s)) continue;
          n++;
          const r = {
            date: w.date, workout: w.name, workout_id: w.id, exercise_id: it.exerciseId, exercise: it.name, type: it.type,
            muscle: ((exMap[it.exerciseId] || {}).muscles || [])[0] || '', set: n, warmup: s.warmup ? 1 : 0,
            kg: num(s.kg), reps: num(s.reps), reps_b: num(s.repsB), rir: num(s.rir), rir_b: num(s.rirB), band: s.band || '',
            seconds: num(s.sec), minutes: num(s.min), km: num(s.km), rpe: num(s.rpe),
            volume_kg: setVolume(s, it.type) || '', e1rm_kg: e1rm(s, it.type), set_time: s.at || '',
            workout_start: w.startedAt || '', duration_min: durationOf(w), session_rpe: num(w.rpe), sleep_h: num(w.sleepH),
            body_kg: bodyOn(w.date), set_note: s.note || '', exercise_note: it.note || '', workout_note: w.notes || '',
          };
          rows.push(CSV_COLS.map(c => csvCell(r[c])).join(','));
        }
      }
    }
    return '﻿' + rows.join('\r\n') + '\r\n';
  }
  function backupJSON(db) {
    return JSON.stringify({ type: 'GymLogBackup', schema: SCHEMA, exportedAt: new Date().toISOString(), data: db }, null, 1);
  }
  // Compact text for pasting into ChatGPT/Claude.
  function summaryText(db, days = 28, today = localDate()) {
    const from = addDays(today, -days + 1);
    const ws = sortedDesc(finished(db)).filter(w => w.date >= from).reverse();
    let out = `GYM LOG ${from} → ${today} (${ws.length} buổi)\n`;
    for (const w of ws) {
      const st = workoutStats(w);
      out += `\n## ${w.date} · ${w.name}` + [durationOf(w) && `${durationOf(w)}′`, num(w.rpe) !== null && `RPE ${w.rpe}`, num(w.sleepH) !== null && `ngủ ${w.sleepH}h`, st.volume && `vol ${st.volume}kg`].filter(Boolean).map(x => ' · ' + x).join('') + '\n';
      if (w.notes) out += `  ghi chú: ${w.notes}\n`;
      for (const it of w.items) {
        const done = it.sets.filter(isDone);
        if (!done.length) continue;
        out += `- ${it.name}: ${done.map(s => (s.warmup ? '(k) ' : '') + describeSet(s, it.type)).join(' | ')}${it.note ? ' — ' + it.note : ''}\n`;
      }
    }
    return out;
  }

  // ---------- import ----------
  function parseBackup(raw, seed) {
    if (raw && raw.type === 'GymLogBackup' && raw.data) {
      const d = raw.data;
      if (!Array.isArray(d.workouts) || !Array.isArray(d.exercises)) throw new Error('File backup thiếu dữ liệu.');
      return { kind: 'full', db: normalizeDB(d) };
    }
    if (raw && raw.type === 'FitnessCoachBackup' && raw.data && Array.isArray(raw.data.history)) {
      return { kind: 'legacy', ...importLegacyV4(raw.data, seed) };
    }
    throw new Error('Không nhận ra file. Cần file backup của app này hoặc FitnessCoach_v4_backup_*.json.');
  }
  function normalizeDB(d) {
    const db = Object.assign(emptyDB(), d);
    db.settings = Object.assign(defaultSettings(), d.settings || {});
    db.body = Array.isArray(d.body) ? d.body : [];
    db.schema = SCHEMA;
    return db;
  }
  // Old ChatGPT HTML v4: sets keyed by card index inside a session; cardio used reps=minutes, kg=km, rir=RPE.
  function importLegacyV4(data, seed) {
    const exMap = byId(seed.exercises);
    const tMap = byId(seed.templates);
    const workouts = [];
    const warnings = [];
    const convert = (rec, isDraft) => {
      const t = tMap[rec.session];
      const items = [];
      const keys = Object.keys(rec.sets || {}).map(Number).sort((a, b) => a - b);
      for (const idx of keys) {
        const arr = rec.sets[idx];
        if (!Array.isArray(arr) || !arr.length) continue;
        const exId = `${rec.session}-${idx}`;
        const ex = exMap[exId];
        if (!ex) { warnings.push(`Bỏ qua bài #${idx} của ${rec.session} (${rec.date}) vì không có trong danh mục.`); continue; }
        const target = t && t.items.find(i => i.exerciseId === exId);
        const it = { id: uid('i'), exerciseId: exId, name: ex.name, type: ex.type, note: '', target: target ? { ...target } : { sets: arr.length, rest: 90 }, sets: [] };
        for (const z of arr) {
          const s = { done: true, at: z.at || null };
          if (ex.type === 'cardio') { s.min = num(z.reps); s.km = num(z.kg); s.rpe = num(z.rir); }
          else {
            s.kg = num(z.kg); s.reps = num(z.reps); s.rir = num(z.rir);
            if (z.repsOther !== undefined && z.repsOther !== null) s.repsB = num(z.repsOther);
            if (z.rirOther !== undefined && z.rirOther !== null && z.rirOther !== '') s.rirB = num(z.rirOther);
          }
          it.sets.push(s);
        }
        items.push(it);
      }
      const ts = rec.timestamp || (items[0] && items[0].sets[0] && items[0].sets[0].at) || null;
      return {
        id: rec.id ? 'v4-' + rec.id : uid('w'), status: 'done', templateId: t ? t.id : null, name: (t ? t.name : rec.session) + (isDraft ? ' (nháp v4)' : ''),
        date: rec.date, startedAt: ts, endedAt: ts, durationMin: num(rec.duration), rpe: num(rec.rpe), sleepH: num(rec.sleep),
        notes: rec.notes || '', items, source: isDraft ? 'v4-draft' : 'v4',
      };
    };
    for (const rec of data.history) workouts.push(convert(rec, false));
    let drafts = 0;
    for (const [k, rec] of Object.entries(data.drafts || {})) {
      if (!rec || !Object.values(rec.sets || {}).some(a => Array.isArray(a) && a.length)) continue;
      const w = convert(rec, true); w.id = 'v4d-' + k.replace(/[^\w-]/g, '_');
      workouts.push(w); drafts++;
    }
    return { workouts, drafts, warnings };
  }
  // Merge imported workouts by id (re-importing the same file never duplicates).
  function mergeWorkouts(db, workouts) {
    const ids = new Set(db.workouts.map(w => w.id));
    let added = 0;
    for (const w of workouts) if (!ids.has(w.id)) { db.workouts.push(w); added++; }
    return added;
  }

  function byId(arr) { const o = {}; for (const x of arr) o[x.id] = x; return o; }

  const api = {
    SCHEMA, TYPES, MUSCLES, uid, localDate, parseDate, addDays, weekStart, num, round1, clone, byId,
    emptyDB, seedDB, mergeSeed, normalizeDB, newWorkout, newItem, isDone, isWork, setReps, e1rm, setVolume, setFilled, describeSet,
    finished, sortedDesc, exerciseHistory, lastPerformance, bests, detectPR, suggestion, workoutStats, durationOf,
    muscleSetsByWeek, e1rmSeries, streakWeeks, CSV_COLS, toCSV, backupJSON, summaryText, parseBackup, importLegacyV4, mergeWorkouts,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.L = api;
})(typeof self !== 'undefined' ? self : this);
