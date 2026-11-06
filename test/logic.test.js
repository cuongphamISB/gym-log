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
