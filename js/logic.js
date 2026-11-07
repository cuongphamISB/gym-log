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
    return {
      schema: SCHEMA, exercises: [], templates: [], workouts: [], body: [], settings: defaultSettings(),
      profile: { sex: 'male', heightCm: null, age: null }, nutrition: { goal: 'maintain', proteinPerKg: null, days: {} },
      health: { days: {}, sessions: [], lastSync: null },
    };
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
    db.profile = Object.assign({ sex: 'male', heightCm: null, age: null }, d.profile || {});
    db.nutrition = Object.assign({ goal: 'maintain', proteinPerKg: null, days: {} }, d.nutrition || {});
    db.health = Object.assign({ days: {}, sessions: [], lastSync: null }, d.health || {});
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

  // ---------- health (Health Connect via the Android app) ----------
  // Sleep sessions -> per wake-up date. Overlapping sessions from several writers are de-duplicated.
  function sleepByNight(samples) {
    const sorted = [...(samples || [])].sort((a, b) => (b.hasStageData ? 1 : 0) - (a.hasStageData ? 1 : 0) || (new Date(b.endDate) - new Date(b.startDate)) - (new Date(a.endDate) - new Date(a.startDate)));
    const kept = [];
    for (const s of sorted) {
      const a0 = +new Date(s.startDate), a1 = +new Date(s.endDate);
      if (!(a1 > a0)) continue;
      const dup = kept.some(k => { const b0 = +new Date(k.startDate), b1 = +new Date(k.endDate); return Math.min(a1, b1) - Math.max(a0, b0) > 0.5 * Math.min(a1 - a0, b1 - b0); });
      if (!dup) kept.push(s);
    }
    const out = {};
    const CODE = { deep: 'd', light: 'l', rem: 'r', awake: 'a', inBed: 'a', asleep: 'u' };
    const em = iso => Math.round(new Date(iso).getTime() / 60000); // epoch minutes
    for (const s of kept) {
      const d = localDate(new Date(s.endDate));
      const o = out[d] || (out[d] = { asleepMin: 0, inBedMin: 0, deepMin: 0, remMin: 0, lightMin: 0, awakeMin: 0, start: s.startDate, end: s.endDate, sessions: 0, seg: [] });
      if (s.stages && s.stages.length) for (const st of s.stages) { if (st.startDate && st.endDate) o.seg.push([em(st.startDate), em(st.endDate), CODE[st.stage] || 'u']); }
      else o.seg.push([em(s.startDate), em(s.endDate), 'u']);
      o.sessions++;
      if (s.startDate < o.start) o.start = s.startDate;
      if (s.endDate > o.end) o.end = s.endDate;
      const dur = (new Date(s.endDate) - new Date(s.startDate)) / 60000;
      o.inBedMin += dur;
      if (s.stages && s.stages.length) {
        for (const st of s.stages) {
          const m = st.durationMinutes || 0;
          if (st.stage === 'awake' || st.stage === 'inBed') o.awakeMin += m;
          else { o.asleepMin += m; if (st.stage === 'deep') o.deepMin += m; else if (st.stage === 'rem') o.remMin += m; else if (st.stage === 'light') o.lightMin += m; }
        }
      } else o.asleepMin += dur;
    }
    return out;
  }
  const median = a => { const s = a.filter(x => x !== null && x !== undefined && Number.isFinite(x)).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

  // raw = { sleep, steps, activeKcal, totalKcal, restHr, hrv, weight, workouts } as returned by the plugin.
  function ingestHealth(db, raw, nowIso = new Date().toISOString()) {
    const H = db.health || (db.health = { days: {}, sessions: [], lastSync: null });
    const day = d => H.days[d] || (H.days[d] = {});
    const nights = sleepByNight(raw.sleep);
    for (const [d, n] of Object.entries(nights)) {
      day(d).sleep = { h: round1(n.asleepMin / 60), inBedH: round1(n.inBedMin / 60), deepMin: Math.round(n.deepMin), remMin: Math.round(n.remMin), lightMin: Math.round(n.lightMin), awakeMin: Math.round(n.awakeMin), start: n.start, end: n.end, seg: n.seg.sort((a, b) => a[0] - b[0]) };
    }
    const agg = (arr, key) => { for (const s of arr || []) { const v = s.value; if (v === null || v === undefined || !Number.isFinite(v)) continue; day(localDate(new Date(s.startDate)))[key] = Math.round(v); } };
    agg(raw.steps, 'steps'); agg(raw.activeKcal, 'activeKcal');
    // total calories arrive as records: sum them per local day (only days actually covered are overwritten)
    const tk = {};
    for (const s of raw.totalKcal || []) if (Number.isFinite(s.value)) { const d = localDate(new Date(s.startDate)); tk[d] = (tk[d] || 0) + s.value; }
    for (const [d, v] of Object.entries(tk)) day(d).totalKcal = Math.round(v);
    // hourly heart rate [min, max, avg] and hourly steps, keyed by local hour
    for (const s of raw.hrHourly || []) {
      const v = s.values || {}; if (!Number.isFinite(v.max)) continue;
      const t = new Date(s.startDate), o = day(localDate(t));
      (o.hrH = o.hrH || {})[t.getHours()] = [Math.round(v.min), Math.round(v.max), Math.round(v.average)];
    }
    for (const o of Object.values(H.days)) if (o.hrH) { const hs = Object.values(o.hrH); o.hrMin = Math.min(...hs.map(x => x[0])); o.hrMax = Math.max(...hs.map(x => x[1])); }
    for (const s of raw.stepsHourly || []) {
      if (!Number.isFinite(s.value) || !s.value) continue;
      const t = new Date(s.startDate), o = day(localDate(t));
      (o.stepsH = o.stepsH || {})[t.getHours()] = Math.round(s.value);
    }
    const perDay = (arr, key, fn) => {
      const g = {};
      for (const s of arr || []) { const d = localDate(new Date(s.startDate)); (g[d] = g[d] || []).push(s.value); }
      for (const [d, vs] of Object.entries(g)) day(d)[key] = fn(vs);
    };
    perDay(raw.restHr, 'restHr', vs => Math.round(Math.min(...vs)));
    perDay(raw.hrv, 'hrv', vs => Math.round(vs.reduce((a, b) => a + b, 0) / vs.length));
    for (const s of raw.weight || []) {
      const d = localDate(new Date(s.startDate)), kg = round1(s.value);
      const cur = db.body.find(b => b.date === d);
      if (!cur) db.body.push({ date: d, kg, src: 'hc' });
      else if (cur.src === 'hc') cur.kg = kg; // never overwrite a manual entry
    }
    for (const w of raw.workouts || []) {
      const id = w.platformId || w.startDate;
      const rec = {
        id, type: w.workoutType, start: w.startDate, end: w.endDate, durationMin: Math.round((w.duration || 0) / 60),
        kcal: w.totalEnergyBurned ? Math.round(w.totalEnergyBurned) : null, km: w.totalDistance ? round1(w.totalDistance / 1000) : null,
        avgHr: w.avgHr || null, maxHr: w.maxHr || null, source: w.sourceName || w.sourceId || '',
      };
      if (w.hrSeries && w.hrSeries.length) rec.hr = w.hrSeries;
      const i = H.sessions.findIndex(x => x.id === id);
      if (i >= 0) H.sessions[i] = Object.assign(H.sessions[i], rec); else H.sessions.push(rec);
    }
    H.sessions.sort((a, b) => a.start.localeCompare(b.start));
    let matched = 0;
    for (const w of finished(db)) if (fillFromHealth(db, w)) matched++;
    H.lastSync = nowIso;
    return { nights: Object.keys(nights).length, sessions: (raw.workouts || []).length, matched };
  }
  // Watch session that overlaps a logged workout (by time, or same date if the log has no times).
  function matchSession(db, w) {
    const ss = (db.health && db.health.sessions) || [];
    if (w.startedAt && w.endedAt && w.endedAt > w.startedAt) {
      const a0 = +new Date(w.startedAt), a1 = +new Date(w.endedAt);
      let best = null, bestOv = 0;
      for (const s of ss) { const ov = Math.min(a1, +new Date(s.end)) - Math.max(a0, +new Date(s.start)); if (ov > bestOv) { bestOv = ov; best = s; } }
      if (best) return best;
    }
    const same = ss.filter(s => localDate(new Date(s.start)) === w.date);
    return same.length === 1 ? same[0] : null;
  }
  function fillFromHealth(db, w) {
    let changed = false;
    const s = matchSession(db, w);
    if (s) {
      if (num(w.avgHr) === null && s.avgHr) { w.avgHr = s.avgHr; changed = true; }
      if (num(w.kcal) === null && s.kcal) { w.kcal = s.kcal; changed = true; }
      if (s.maxHr && num(w.maxHr) === null) { w.maxHr = s.maxHr; changed = true; }
      w.hcSessionId = s.id;
    }
    const d = db.health && db.health.days[w.date];
    if (num(w.sleepH) === null && d && d.sleep) { w.sleepH = d.sleep.h; changed = true; }
    return changed;
  }
  // Recovery signal for a date: last night's sleep + resting HR / HRV against a 14-day baseline.
  function readiness(db, date = localDate()) {
    const days = (db.health && db.health.days) || {};
    const d = days[date] || {};
    const prev = [...Array(14)].map((_, i) => days[addDays(date, -i - 1)] || {});
    const rBase = median(prev.map(x => x.restHr)), hBase = median(prev.map(x => x.hrv));
    const sleepH = d.sleep ? d.sleep.h : null;
    const rhrDelta = d.restHr && rBase ? d.restHr - rBase : null;
    const hrvDelta = d.hrv && hBase ? Math.round((d.hrv - hBase) / hBase * 100) : null;
    if (sleepH === null && rhrDelta === null && hrvDelta === null) return null;
    let score = 0; const why = [];
    if (sleepH !== null) { if (sleepH < 6) { score -= 2; why.push(`ngủ ${sleepH}h`); } else if (sleepH < 7) { score -= 1; why.push(`ngủ ${sleepH}h`); } else why.push(`ngủ ${sleepH}h`); }
    if (rhrDelta !== null) { if (rhrDelta >= 7) { score -= 2; why.push(`nhịp tim nghỉ +${rhrDelta}`); } else if (rhrDelta >= 4) { score -= 1; why.push(`nhịp tim nghỉ +${rhrDelta}`); } }
    if (hrvDelta !== null && hrvDelta <= -20) { score -= 1; why.push(`HRV ${hrvDelta}%`); }
    return { level: score <= -2 ? 'low' : score < 0 ? 'mid' : 'good', sleepH, restHr: d.restHr || null, rhrDelta, hrv: d.hrv || null, hrvDelta, why, deepMin: d.sleep ? d.sleep.deepMin : null };
  }

  // Heart-rate zones as % of max HR (warm-up 50–60, fat burn 60–70, aerobic 70–80, anaerobic 80–90, max 90+).
  const HR_ZONES = [['Khởi động', 0.5], ['Đốt mỡ', 0.6], ['Aerobic', 0.7], ['Anaerobic', 0.8], ['Tối đa', 0.9]];
  function maxHrFor(db) { const a = db.profile && db.profile.age; return a ? Math.round(208 - 0.7 * a) : 190; }
  function zoneOf(bpm, maxHr) { const p = bpm / maxHr; let z = -1; HR_ZONES.forEach(([, lo], i) => { if (p >= lo) z = i; }); return z; }
  // series: [[sec, bpm]...] -> minutes spent in each zone (index 0..4); time below zone 1 is ignored
  function zoneMinutes(series, maxHr) {
    const out = [0, 0, 0, 0, 0];
    for (let i = 0; i < series.length; i++) {
      const dt = i + 1 < series.length ? Math.min(120, series[i + 1][0] - series[i][0]) : 30;
      const z = zoneOf(series[i][1], maxHr);
      if (z >= 0) out[z] += dt / 60;
    }
    return out.map(m => Math.round(m * 10) / 10);
  }

  // ---------- nutrition ----------
  const GOALS = { cut: { label: 'Giảm mỡ', kcal: -400, protein: 2.0 }, maintain: { label: 'Duy trì', kcal: 0, protein: 1.8 }, bulk: { label: 'Tăng cơ', kcal: 250, protein: 1.8 } };
  function latestWeight(db, date = localDate()) {
    const b = [...db.body].filter(x => x.date <= date).sort((x, y) => x.date.localeCompare(y.date));
    return b.length ? b[b.length - 1].kg : null;
  }
  function bmr(profile, kg) {
    const p = profile || {};
    if (!kg || !p.heightCm || !p.age) return null;
    return Math.round(10 * kg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'female' ? -161 : 5));
  }
  // Energy expenditure: watch total kcal if ≥3 recent days, else BMR×1.2 + watch active kcal, else BMR×1.45.
  function tdee(db, date = localDate()) {
    const days = (db.health && db.health.days) || {};
    const prev = [...Array(7)].map((_, i) => days[addDays(date, -i - 1)] || {});
    const tot = prev.map(x => x.totalKcal).filter(v => v > 800);
    const kg = latestWeight(db, date), b = bmr(db.profile, kg);
    if (tot.length >= 3) return { value: Math.round(tot.reduce((a, c) => a + c, 0) / tot.length), method: `TB ${tot.length} ngày từ đồng hồ` };
    const act = prev.map(x => x.activeKcal).filter(v => v > 0);
    if (b && act.length >= 3) return { value: Math.round(b * 1.2 + act.reduce((a, c) => a + c, 0) / act.length), method: `BMR×1.2 + vận động TB ${act.length} ngày` };
    if (b) return { value: Math.round(b * 1.45), method: 'ước tính BMR×1.45 (chưa có dữ liệu đồng hồ)' };
    return null;
  }
  function weightTrend(db, days = 21, date = localDate()) {
    const pts = db.body.filter(b => b.date > addDays(date, -days) && b.date <= date).map(b => [(parseDate(b.date) - parseDate(date)) / 864e5, b.kg]);
    if (pts.length < 3) return null;
    const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
    const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
    if (!sxx) return null;
    const slope = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / sxx;
    return Math.round(slope * 7 * 100) / 100; // kg per week
  }
  function nutritionTargets(db, date = localDate()) {
    const n = db.nutrition || {};
    const g = GOALS[n.goal || 'maintain'];
    const kg = latestWeight(db, date), t = tdee(db, date);
    return {
      goal: n.goal || 'maintain', kg, tdee: t,
      kcal: t ? Math.round((t.value + g.kcal) / 10) * 10 : null,
      protein: kg ? Math.round(kg * (n.proteinPerKg || g.protein)) : null,
      trend: weightTrend(db, 21, date),
    };
  }
  function intake(db, date) {
    const e = ((db.nutrition && db.nutrition.days && db.nutrition.days[date]) || {}).entries || [];
    return { kcal: Math.round(e.reduce((a, x) => a + (num(x.kcal) || 0), 0)), protein: Math.round(e.reduce((a, x) => a + (num(x.p) || 0), 0)), entries: e };
  }

  // One row per day: sleep, watch data, body weight, intake. For analysis next to the per-set CSV.
  const DAILY_COLS = ['date', 'sleep_h', 'deep_min', 'rem_min', 'awake_min', 'rest_hr', 'hrv_ms', 'steps', 'active_kcal', 'total_kcal', 'body_kg', 'intake_kcal', 'protein_g', 'workouts', 'hard_sets'];
  function toDailyCSV(db) {
    const days = (db.health && db.health.days) || {};
    const dates = new Set([...Object.keys(days), ...db.body.map(b => b.date), ...Object.keys((db.nutrition && db.nutrition.days) || {}), ...finished(db).map(w => w.date)]);
    const rows = [DAILY_COLS.join(',')];
    for (const d of [...dates].sort()) {
      const h = days[d] || {}, s = h.sleep || {}, it = intake(db, d), ws = finished(db).filter(w => w.date === d);
      const body = db.body.find(b => b.date === d);
      const r = { date: d, sleep_h: s.h, deep_min: s.deepMin, rem_min: s.remMin, awake_min: s.awakeMin, rest_hr: h.restHr, hrv_ms: h.hrv, steps: h.steps, active_kcal: h.activeKcal, total_kcal: h.totalKcal, body_kg: body && body.kg, intake_kcal: it.entries.length ? it.kcal : null, protein_g: it.entries.length ? it.protein : null, workouts: ws.length || null, hard_sets: ws.reduce((a, w) => a + workoutStats(w).sets, 0) || null };
      rows.push(DAILY_COLS.map(c => csvCell(r[c])).join(','));
    }
    return '﻿' + rows.join('\r\n') + '\r\n';
  }

  function byId(arr) { const o = {}; for (const x of arr) o[x.id] = x; return o; }

  const api = {
    SCHEMA, TYPES, MUSCLES, uid, localDate, parseDate, addDays, weekStart, num, round1, clone, byId,
    emptyDB, seedDB, mergeSeed, normalizeDB, newWorkout, newItem, isDone, isWork, setReps, e1rm, setVolume, setFilled, describeSet,
    finished, sortedDesc, exerciseHistory, lastPerformance, bests, detectPR, suggestion, workoutStats, durationOf,
    muscleSetsByWeek, e1rmSeries, streakWeeks, CSV_COLS, toCSV, backupJSON, summaryText, parseBackup, importLegacyV4, mergeWorkouts,
    sleepByNight, ingestHealth, matchSession, fillFromHealth, readiness, median, HR_ZONES, maxHrFor, zoneOf, zoneMinutes,
    GOALS, latestWeight, bmr, tdee, weightTrend, nutritionTargets, intake, DAILY_COLS, toDailyCSV,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.L = api;
})(typeof self !== 'undefined' ? self : this);
