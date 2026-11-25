// node --test test/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const L = require('../js/logic.js');
global.self = global;
require('../js/seed.js');
const SEED = global.SEED;

function doneWorkout(db, date, exId, sets, extra = {}) {
  const ex = db.exercises.find(e => e.id === exId);
  const t = db.templates.find(t => t.items.some(i => i.exerciseId === exId));
  const w = L.newWorkout(db, null, date);
  const it = L.newItem(db, ex, t.items.find(i => i.exerciseId === exId));
  it.sets = sets.map(s => ({ done: true, ...s }));
  w.items.push(it);
  Object.assign(w, { status: 'done', endedAt: w.startedAt }, extra);
  db.workouts.push(w);
  return w;
}

test('seed has stable ids and parsed targets', () => {
  const db = L.seedDB(SEED);
  assert.equal(db.exercises.length, 25);
  const a = db.templates.find(t => t.id === 'strength-a');
  assert.deepEqual(a.items[0], { exerciseId: 'strength-a-0', sets: 3, repLow: 8, repHigh: 12, rest: 90 });
  assert.ok(!db.templates.some(t => t.items.some(i => i.exerciseId === 'cardio-3')), 'info card not in templates');
});

test('num accepts comma decimal and rejects junk', () => {
  assert.equal(L.num('12,5'), 12.5);
  assert.equal(L.num(''), null);
  assert.equal(L.num('abc'), null);
  assert.equal(L.num(0), 0);
});

test('e1rm and volume per type', () => {
  assert.equal(L.e1rm({ kg: 20, reps: 10 }, 'weight'), 26.7);
  assert.equal(L.e1rm({ kg: 20, reps: 10, repsB: 8 }, 'unilateral'), 25.3); // uses weaker side
  assert.equal(L.e1rm({ kg: 20, reps: 20 }, 'weight'), null);
  assert.equal(L.e1rm({ kg: 10, reps: 10 }, 'band'), null);
  assert.equal(L.setVolume({ kg: 20, reps: 10, repsB: 9 }, 'unilateral'), 380);
});

test('CSV: one row per done set, skips unchecked, escapes, BOM', () => {
  const db = L.seedDB(SEED);
  const w = doneWorkout(db, '2026-11-02', 'strength-a-0', [{ kg: 20, reps: 10, rir: 2 }, { kg: 20, reps: 9, rir: 1, note: 'vai hơi đau, "nhẹ"' }], { notes: 'a,b' });
  w.items[0].sets.push({ done: false, kg: 99, reps: 1 });
  const csv = L.toCSV(db);
  assert.ok(csv.startsWith('﻿'));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0].replace('﻿', ''), L.CSV_COLS.join(','));
  assert.ok(lines[2].includes('"vai hơi đau, ""nhẹ"""'));
  assert.ok(lines[1].includes('"a,b"'));
  assert.ok(!csv.includes(',99,'));
});

test('legacy v4 import maps index->exercise id and cardio fields', () => {
  const raw = {
    type: 'FitnessCoachBackup', version: 4, data: {
      history: [
        { id: 'abc', date: '2026-10-01', session: 'strength-a', duration: '50', rpe: '7', sleep: '6.5', notes: 'ok', timestamp: '2026-10-01T01:00:00Z',
          sets: { 1: [{ kg: '14', reps: '10', rir: '2', repsOther: '9', rirOther: '1', at: 'x' }], 0: [{ kg: '20', reps: '8', rir: '' }] } },
        { id: 'def', date: '2026-10-02', session: 'cardio', sets: { 0: [{ kg: '3.2', reps: '25', rir: '4' }] } },
      ],
      drafts: { '2026-10-03|strength-b': { date: '2026-10-03', session: 'strength-b', sets: { 4: [{ kg: '8', reps: '12', rir: '2' }] } }, 'empty|x': { sets: {} } },
    },
  };
  const r = L.parseBackup(raw, SEED);
  assert.equal(r.kind, 'legacy');
  assert.equal(r.workouts.length, 3);
  assert.equal(r.drafts, 1);
  const a = r.workouts[0];
  assert.deepEqual(a.items.map(i => i.exerciseId), ['strength-a-0', 'strength-a-1']);
  assert.equal(a.items[1].sets[0].repsB, 9);
  assert.equal(a.items[1].sets[0].rirB, 1);
  assert.equal(a.items[0].sets[0].rir, null);
  assert.equal(a.durationMin, 50);
  const c = r.workouts[1].items[0].sets[0];
  assert.deepEqual([c.min, c.km, c.rpe], [25, 3.2, 4]);
  assert.equal(r.workouts[2].items[0].name, 'Biceps Curl');
  // re-import does not duplicate
  const db = L.seedDB(SEED);
  assert.equal(L.mergeWorkouts(db, r.workouts), 3);
  assert.equal(L.mergeWorkouts(db, L.parseBackup(raw, SEED).workouts), 0);
});

test('full backup roundtrip', () => {
  const db = L.seedDB(SEED);
  doneWorkout(db, '2026-11-02', 'strength-a-0', [{ kg: 20, reps: 10 }]);
  const r = L.parseBackup(JSON.parse(L.backupJSON(db)), SEED);
  assert.equal(r.kind, 'full');
  assert.equal(r.db.workouts.length, 1);
  assert.throws(() => L.parseBackup({ foo: 1 }, SEED));
});

test('double progression suggestion', () => {
  const db = L.seedDB(SEED);
  doneWorkout(db, '2026-11-02', 'strength-a-0', [{ kg: 20, reps: 12 }, { kg: 20, reps: 12 }, { kg: 20, reps: 12, warmup: false }]);
  const it = L.newItem(db, db.exercises[0], db.templates[0].items[0]);
  const s = L.suggestion(db, it, null, 1);
  assert.equal(s.kg, 21); assert.ok(s.up);
  doneWorkout(db, '2026-11-04', 'strength-a-0', [{ kg: 21, reps: 9 }, { kg: 21, reps: 8 }]);
  const s2 = L.suggestion(db, it, null, 1);
  assert.equal(s2.kg, 21); assert.equal(s2.reps, 9);
  doneWorkout(db, '2026-11-06', 'strength-a-0', [{ kg: 22, reps: 6 }]);
  assert.match(L.suggestion(db, it, null, 1).text, /dưới 8/);
});

test('PR detection ignores first-ever session and warmups', () => {
  const db = L.seedDB(SEED);
  const w1 = L.newWorkout(db, db.templates[0], '2026-11-01');
  w1.items[0].sets[0] = { done: true, kg: 20, reps: 10 };
  assert.deepEqual(L.detectPR(db, w1, w1.items[0], w1.items[0].sets[0]), []);
  w1.status = 'done';
  db.workouts.push(w1);
  const w2 = L.newWorkout(db, db.templates[0], '2026-11-03');
  const s = w2.items[0].sets[0] = { done: true, kg: 22, reps: 10 };
  const prs = L.detectPR(db, w2, w2.items[0], s);
  assert.deepEqual(prs.map(p => p.kind).sort(), ['e1rm', 'kg']);
  s.warmup = true;
  assert.deepEqual(L.detectPR(db, w2, w2.items[0], s), []);
});

test('weekly muscle sets: primary 1, secondary 0.5, warmups excluded', () => {
  const db = L.seedDB(SEED);
  doneWorkout(db, '2026-11-03', 'strength-a-0', [{ kg: 20, reps: 10 }, { kg: 20, reps: 10 }, { kg: 10, reps: 10, warmup: true }]);
  const m = L.muscleSetsByWeek(db, 2, '2026-11-05');
  assert.deepEqual(m['2026-11-02'], { 'Ngực': 2, 'Tay sau': 1, 'Vai': 1 });
  assert.equal(L.weekStart('2026-11-08'), '2026-11-02'); // Sunday belongs to the Monday week
});

test('mergeSeed keeps user edits and adds new built-ins', () => {
  const db = L.seedDB(SEED);
  db.exercises[0].name = 'My press';
  db.exercises.pop();
  L.mergeSeed(db, SEED);
  assert.equal(db.exercises.length, 25);
  assert.equal(db.exercises[0].name, 'My press');
});

// ---------- health + nutrition ----------
function rawHealth() {
  return {
    sleep: [
      { startDate: '2026-11-05T16:30:00.000Z', endDate: '2026-11-05T23:30:00.000Z', hasStageData: true, stages: [
        { stage: 'light', durationMinutes: 240 }, { stage: 'deep', durationMinutes: 90 }, { stage: 'rem', durationMinutes: 60 }, { stage: 'awake', durationMinutes: 30 }] },
      // same night written by another app without stages -> must be de-duplicated
      { startDate: '2026-11-05T16:35:00.000Z', endDate: '2026-11-05T23:20:00.000Z' },
    ],
    steps: [{ startDate: '2026-11-05T17:00:00.000Z', value: 8123.4 }],
    activeKcal: [{ startDate: '2026-11-05T17:00:00.000Z', value: 512 }],
    totalKcal: [],
    restHr: [{ startDate: '2026-11-06T01:00:00.000Z', value: 58 }, { startDate: '2026-11-06T05:00:00.000Z', value: 55 }],
    hrv: [],
    weight: [{ startDate: '2026-11-06T00:30:00.000Z', value: 70.84 }],
    workouts: [{ platformId: 'hc1', workoutType: 'strengthTraining', duration: 3000, totalEnergyBurned: 310.6, startDate: '2026-11-06T01:00:00.000Z', endDate: '2026-11-06T01:50:00.000Z', avgHr: 121, maxHr: 158 }],
  };
}

test('sleepByNight: wake-date bucketing, stages, de-dup', () => {
  const n = L.sleepByNight(rawHealth().sleep);
  const d = L.localDate(new Date('2026-11-05T23:30:00.000Z'));
  assert.deepEqual(Object.keys(n), [d]);
  assert.equal(n[d].asleepMin, 390);
  assert.equal(n[d].deepMin, 90);
  assert.equal(n[d].sessions, 1);
});

test('ingestHealth fills days, body weight (not over manual), and matches workouts', () => {
  const db = L.normalizeDB(L.seedDB(SEED));
  const w = doneWorkout(db, L.localDate(new Date('2026-11-06T01:10:00.000Z')), 'strength-a-0', [{ kg: 20, reps: 10 }]);
  w.startedAt = '2026-11-06T01:05:00.000Z'; w.endedAt = '2026-11-06T01:55:00.000Z';
  const r = L.ingestHealth(db, rawHealth());
  assert.equal(r.matched, 1);
  assert.equal(w.avgHr, 121); assert.equal(w.kcal, 311);
  const wd = L.localDate(new Date('2026-11-05T23:30:00.000Z'));
  assert.equal(db.health.days[wd].sleep.h, 6.5);
  assert.equal(db.body.length, 1); assert.equal(db.body[0].src, 'hc');
  // a manual weight on the same day is never overwritten; re-sync is idempotent
  db.body[0] = { date: db.body[0].date, kg: 71.5 };
  L.ingestHealth(db, rawHealth());
  assert.equal(db.body[0].kg, 71.5);
  assert.equal(db.health.sessions.length, 1);
});

test('readiness levels from sleep and resting HR baseline', () => {
  const db = L.normalizeDB(L.seedDB(SEED));
  const today = '2026-11-07';
  for (let i = 1; i <= 14; i++) db.health.days[L.addDays(today, -i)] = { restHr: 55 };
  db.health.days[today] = { sleep: { h: 7.4 }, restHr: 56 };
  assert.equal(L.readiness(db, today).level, 'good');
  db.health.days[today] = { sleep: { h: 5.5 }, restHr: 63 };
  const r = L.readiness(db, today);
  assert.equal(r.level, 'low'); assert.equal(r.rhrDelta, 8);
  assert.equal(L.readiness(L.normalizeDB(L.seedDB(SEED)), today), null);
});

test('nutrition targets: BMR fallback, watch TDEE, goal offsets, trend', () => {
  const db = L.normalizeDB(L.seedDB(SEED));
  const today = '2026-11-07';
  assert.equal(L.nutritionTargets(db, today).kcal, null);
  db.profile = { sex: 'male', heightCm: 180, age: 30 };
  db.body.push({ date: '2026-10-20', kg: 72 }, { date: '2026-10-27', kg: 71.5 }, { date: '2026-11-03', kg: 71 });
  assert.equal(L.bmr(db.profile, 71), 1690);
  let t = L.nutritionTargets(db, today);
  assert.equal(t.kcal, Math.round(1690 * 1.45 / 10) * 10);
  assert.equal(t.protein, 128);
  assert.equal(t.trend, -0.5);
  for (let i = 1; i <= 4; i++) db.health.days[L.addDays(today, -i)] = { totalKcal: 2600 };
  db.nutrition.goal = 'cut';
  t = L.nutritionTargets(db, today);
  assert.equal(t.tdee.value, 2600); assert.equal(t.kcal, 2200); assert.equal(t.protein, 142);
  db.nutrition.days[today] = { entries: [{ kcal: 600, p: 40 }, { kcal: '450,5', p: 30 }] };
  assert.deepEqual([L.intake(db, today).kcal, L.intake(db, today).protein], [1051, 70]);
  const csv = L.toDailyCSV(db).trim().split('\r\n');
  assert.equal(csv[0].replace('﻿', ''), L.DAILY_COLS.join(','));
  assert.ok(csv.some(l => l.startsWith(today) && l.includes(',1051,70,')));
});

test('detail health data: sleep segments, summed total kcal, hourly HR/steps, workout HR zones', () => {
  const db = L.normalizeDB(L.seedDB(SEED));
  const raw = rawHealth();
  raw.sleep[0].stages = [
    { stage: 'light', startDate: '2026-11-05T16:30:00.000Z', endDate: '2026-11-05T20:30:00.000Z', durationMinutes: 240 },
    { stage: 'deep', startDate: '2026-11-05T20:30:00.000Z', endDate: '2026-11-05T22:00:00.000Z', durationMinutes: 90 },
  ];
  raw.totalKcal = [{ startDate: '2026-11-06T01:00:00.000Z', value: 1200.4 }, { startDate: '2026-11-06T09:00:00.000Z', value: 1300.2 }];
  raw.hrHourly = [{ startDate: '2026-11-06T01:00:00.000Z', values: { min: 60, max: 150, average: 98.6 } }, { startDate: '2026-11-06T02:00:00.000Z', values: { min: 55, max: 80, average: 66 } }];
  raw.stepsHourly = [{ startDate: '2026-11-06T01:00:00.000Z', value: 1500 }];
  raw.workouts[0].hrSeries = [[0, 100], [30, 140], [60, 160], [90, 175]];
  L.ingestHealth(db, raw);
  const wd = L.localDate(new Date('2026-11-05T23:30:00.000Z'));
  assert.equal(db.health.days[wd].sleep.seg.length, 2);
  assert.equal(db.health.days[wd].sleep.seg[1][2], 'd');
  const d6 = L.localDate(new Date('2026-11-06T01:00:00.000Z'));
  assert.equal(db.health.days[d6].totalKcal, 2501);
  assert.equal(db.health.days[d6].hrMin, 55); assert.equal(db.health.days[d6].hrMax, 150);
  assert.deepEqual(Object.values(db.health.days[d6].stepsH), [1500]);
  assert.equal(db.health.sessions[0].hr.length, 4);
  // zones with max HR 190: 100=52%->z0, 140=73%->z2, 160=84%->z3, 175=92%->z4
  assert.deepEqual(L.zoneMinutes(db.health.sessions[0].hr, 190), [0.5, 0, 0.5, 0.5, 0.5]);
  assert.equal(L.maxHrFor({ profile: { age: 30 } }), 187);
});

test('sleepByNight keeps naps out of the night and joins split nights', () => {
  const n = L.sleepByNight([
    { startDate: '2026-11-22T18:04:00Z', endDate: '2026-11-23T00:00:00Z' },   // night part 1
    { startDate: '2026-11-23T00:40:00Z', endDate: '2026-11-23T02:04:00Z' },   // night part 2 (40 min gap)
    { startDate: '2026-11-23T09:48:00Z', endDate: '2026-11-23T10:13:00Z' },   // afternoon nap
  ]);
  const d = L.localDate(new Date('2026-11-23T02:04:00Z'));
  assert.equal(n[d].sessions, 2);
  assert.equal(n[d].napMin, 25);
  assert.equal(n[d].end, '2026-11-23T02:04:00Z');
  assert.equal(Math.round(n[d].asleepMin), 356 + 84);
});

test('ingestMiCloud: sleep with stages+score, resting HR, hourly HR, steps, watch workouts', () => {
  const db = L.normalizeDB(L.seedDB(SEED));
  const bed = 1795458900, wake = 1795483500; // 2026-11-24 local night
  const data = {
    sleepDaily: [{ time: 1795478400, value: JSON.stringify({ sleep_score: 87, avg_spo2: 96, segment_details: [
      { bedtime: bed, wake_up_time: wake, duration: 410, sleep_deep_duration: 154, sleep_light_duration: 153, sleep_rem_duration: 103, sleep_awake_duration: 0, avg_hr: 52, min_hr: 45, awake_count: 0 },
      { bedtime: 1795512000, wake_up_time: 1795513500, duration: 25 }] }) }],
    sleepRaw: [{ value: JSON.stringify({ bedtime: bed, avg_breath: 17, items: [{ start_time: bed, end_time: bed + 1200, state: 3 }, { start_time: bed + 1200, end_time: bed + 4000, state: 2 }, { start_time: bed + 4000, end_time: bed + 4300, state: 4 }] }) }],
    hrDaily: [{ time: 1795478400, value: JSON.stringify({ avg_hr: 57, avg_rhr: 69, min_hr: 45, max_hr: 102, fat_burning_hr_zone_duration: 600 }) }],
    restRaw: [{ value: JSON.stringify({ bpm: 59, date_time: 1795392000 }) }],
    hrRaw: [{ value: JSON.stringify({ time: 1795500000, bpm: 90 }) }, { value: JSON.stringify({ time: 1795500060, bpm: 110 }) }, { value: JSON.stringify({ time: 1795500120, bpm: 130 }) }],
    stepsDaily: [{ time: 1795478400, value: JSON.stringify({ steps: 3970, calories: 117, distance: 2543 }) }],
    sports: [{ sid: 'x', value: JSON.stringify({ start_time: 1795499990, end_time: 1795500200, duration: 210, calories: 30, avg_hrm: 110, max_hrm: 130, hrm_fat_burning_duration: 120, hrm_aerobic_duration: 60, train_effect: 2.1, train_load: 15, recover_time: 6, sport_type: 320 }) }],
  };
  // a Health Connect copy of the same workout must be replaced
  db.health.sessions.push({ id: 'hc1', start: new Date(1795499990000).toISOString(), end: new Date(1795500200000).toISOString(), avgHr: 1 });
  const r = L.ingestMiCloud(db, data);
  assert.equal(r.nights, 1); assert.equal(r.sessions, 1);
  const d = db.health.days['2026-11-24'];
  assert.equal(d.sleep.h, 6.8); assert.equal(d.sleep.score, 87); assert.equal(d.sleep.napMin, 25); assert.equal(d.sleep.breath, 17);
  assert.deepEqual(d.sleep.seg.map(s => s[2]), ['l', 'd', 'r']);
  assert.equal(d.restHr, 69); assert.equal(d.restHrEst, false); assert.deepEqual(d.hrZonesMin, [0, 10, 0, 0, 0]);
  assert.equal(d.steps, 3970); assert.equal(d.activeKcal, 117); assert.equal(d.distanceKm, 2.5);
  assert.equal(db.health.days['2026-11-23'].restHr, 59);
  assert.equal(db.health.sessions.length, 1);
  const s = db.health.sessions[0];
  assert.equal(s.src, 'mi'); assert.deepEqual(s.zonesMin, [0, 2, 1, 0, 0]); assert.equal(s.trainEffect, 2.1);
  assert.deepEqual(s.hr.map(p => p[1]), [90, 110, 130]);
  // idempotent
  L.ingestMiCloud(db, data); assert.equal(db.health.sessions.length, 1);
});

test('ingestMiCloud: stages found by overlap when raw night is shifted/split; stages kept across syncs', () => {
  const db = L.normalizeDB(L.seedDB(SEED));
  const bed = 1795545000, wake = bed + 6 * 3600;
  const daily = [{ time: 1795564800, value: JSON.stringify({ sleep_score: 80, segment_details: [{ bedtime: bed, wake_up_time: wake, duration: 350 }] }) }];
  const raw = [
    { value: JSON.stringify({ bedtime: bed + 120, wake_up_time: bed + 3 * 3600, items: [{ start_time: bed + 120, end_time: bed + 3600, state: 3 }, { start_time: bed + 3600, end_time: bed + 3 * 3600, state: 2 }] }) },
    { value: JSON.stringify({ bedtime: bed + 3 * 3600, wake_up_time: wake, items: [{ start_time: bed + 3 * 3600, end_time: wake, state: 4 }] }) },
  ];
  L.ingestMiCloud(db, { sleepDaily: daily, sleepRaw: raw });
  const d = Object.values(db.health.days).find(x => x.sleep);
  assert.deepEqual(d.sleep.seg.map(s => s[2]), ['l', 'd', 'r']);
  L.ingestMiCloud(db, { sleepDaily: daily, sleepRaw: [] });   // later sync without raw rows
  assert.deepEqual(d.sleep.seg.map(s => s[2]), ['l', 'd', 'r']);
});

test('Health Connect fills stages for a Mi night without them; HC workouts never duplicate Mi ones', () => {
  const db = L.normalizeDB(L.seedDB(SEED));
  const bed = 1795544400, wake = 1795572840;
  L.ingestMiCloud(db, { sleepDaily: [{ time: 1795564800, value: JSON.stringify({ sleep_score: 90, segment_details: [{ bedtime: bed, wake_up_time: wake, duration: 474 }] }) }], sleepRaw: [],
    sports: [{ sid: 's', value: JSON.stringify({ start_time: 1795500000, end_time: 1795503600, avg_hrm: 120 }) }] });
  const d = Object.values(db.health.days).find(x => x.sleep);
  assert.deepEqual(d.sleep.seg.map(x => x[2]), ['u']);
  const iso = t => new Date(t * 1000).toISOString();
  L.ingestHealth(db, { sleep: [{ startDate: iso(bed), endDate: iso(wake), hasStageData: true, stages: [
    { stage: 'light', startDate: iso(bed), endDate: iso(bed + 3600), durationMinutes: 60 }, { stage: 'deep', startDate: iso(bed + 3600), endDate: iso(wake), durationMinutes: 414 }] }],
    workouts: [{ platformId: 'hc', startDate: iso(1795500060), endDate: iso(1795503500), duration: 3440, hrSeries: [[0, 100], [30, 110]] }] });
  assert.equal(d.sleep.score, 90);                       // Mi totals kept
  assert.deepEqual(d.sleep.seg.map(x => x[2]), ['l', 'd']); // HC stages used
  assert.equal(db.health.sessions.length, 1);              // no duplicate
  assert.equal(db.health.sessions[0].hr.length, 2);        // HC HR curve copied onto the Mi session
  // next Mi sync without raw keeps the HC stages
  L.ingestMiCloud(db, { sleepDaily: [{ time: 1795564800, value: JSON.stringify({ sleep_score: 90, segment_details: [{ bedtime: bed, wake_up_time: wake, duration: 474 }] }) }], sleepRaw: [] });
  assert.deepEqual(d.sleep.seg.map(x => x[2]), ['l', 'd']);
});

test('progression v2: owned dumbbells, big jumps, RIR 0 grinding', () => {
  const db = L.normalizeDB(L.seedDB(SEED));
  db.settings.dumbbells = [4, 6, 8, 12];
  const ex = db.exercises.find(e => e.id === 'strength-c-2'); // DB Shoulder Press 8-12
  const tpl = db.templates.find(t => t.id === 'strength-c').items.find(i => i.exerciseId === ex.id);
  const it = L.newItem(db, ex, tpl);
  doneWorkout(db, '2026-11-13', ex.id, [{ kg: 6, reps: 12, rir: 2 }, { kg: 6, reps: 12, rir: 2 }]);
  assert.equal(L.suggestion(db, it, null, 1).kg, 8);              // next owned dumbbell, not 7
  doneWorkout(db, '2026-11-15', ex.id, [{ kg: 8, reps: 12, rir: 1 }, { kg: 8, reps: 12, rir: 2 }]);
  const s = L.suggestion(db, it, null, 1);                          // 8 -> 12 is +50%: grow reps first
  assert.equal(s.kg, 8); assert.match(s.text, /nhảy quá lớn/);
  doneWorkout(db, '2026-11-17', ex.id, [{ kg: 8, reps: 12, rir: 0 }, { kg: 8, reps: 12, rir: 1 }]);
  assert.match(L.suggestion(db, it, null, 1).text, /RIR 0/);        // ground out: hold the weight
  // barbell-type lift is not snapped to dumbbells
  const rdl = db.exercises.find(e => e.id === 'strength-b-0');
  doneWorkout(db, '2026-11-18', rdl.id, [{ kg: 80, reps: 12, rir: 2 }, { kg: 80, reps: 12, rir: 2 }]);
  assert.equal(L.suggestion(db, L.newItem(db, rdl, db.templates[1].items[0]), null, 2.5).kg, 82.5);
});

test('nextTemplate picks the strength template trained least recently', () => {
  const db = L.normalizeDB(L.seedDB(SEED));
  const mk = (id, date) => { const w = L.newWorkout(db, db.templates.find(t => t.id === id), date); w.status = 'done'; db.workouts.push(w); };
  mk('strength-a', '2026-11-10'); mk('strength-b', '2026-11-12'); mk('outdoor', '2026-11-14'); mk('strength-c', '2026-11-15');
  assert.equal(L.nextTemplate(db, '2026-11-18').due.id, 'strength-a');
});

test('program v2: replaces only untouched GPT templates, adds exercises, halves the 11/11 totals once', () => {
  const vm = require('vm');
  const ctx = { self: {} }; ctx.self.SEED = JSON.parse(JSON.stringify(SEED));
  vm.runInNewContext(require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'program.js'), 'utf8'), ctx);
  const db = L.normalizeDB(L.seedDB(SEED));               // old v1 templates as on the phone
  db.templates.find(t => t.id === 'strength-c').items.pop(); // user edited C: must stay untouched
  L.mergeSeed(db, ctx.self.SEED);
  assert.ok(db.exercises.some(e => e.id === 'x-csrow'));
  const w = doneWorkout(db, '2026-11-11', 'strength-b-0', [{ kg: 40, reps: 12 }, { kg: '80', reps: 8 }]);
  const r = L.migrateProgramV2(db, ctx.self.PROGRAM_V1, ctx.self.PROGRAM_V2, '2026-11-25');
  assert.deepEqual(r.templates.sort(), ['Outdoor / PowerBand', 'Strength A', 'Strength B']);
  assert.equal(db.templates.find(t => t.id === 'strength-b').items[1].exerciseId, 'x-csrow');
  assert.equal(db.templates.find(t => t.id === 'strength-c').items.length, 4);
  assert.deepEqual(w.items[0].sets.map(s => +s.kg), [20, 40]);
  const again = L.migrateProgramV2(db, ctx.self.PROGRAM_V1, ctx.self.PROGRAM_V2);
  assert.equal(again.kgFixed, 0); assert.deepEqual(w.items[0].sets.map(s => +s.kg), [20, 40]);
  assert.equal(db.exercises.find(e => e.id === 'strength-b-0').name, 'Romanian Deadlift (tạ đơn)');
});
