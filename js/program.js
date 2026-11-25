// Program v2 (2026-11-25): home gym — plate-loaded dumbbells (10 kg plates ×10 + 2/3/5 kg pairs), adjustable
// incline bench, resistance bands (7–11 kg + a lighter one), park bars for pull-ups/dips. 3 full-body sessions
// × 45–60′, priority chest/shoulders and back/lats. Weights are logged per dumbbell (kg/quả).
// Adds the extra exercises to SEED and replaces the template items; template ids stay so history and the
// weekday schedule carry over.
(function (root) {
  'use strict';
  const S = root.SEED;
  const g = (setup, how, cues, faults, safety) => ({ 'Setup': setup, 'Cách thực hiện': how, 'Cues chính': cues, 'Lỗi thường gặp': faults, 'An toàn / khi nào dừng': safety });
  const extra = [
    { id: 'x-csrow', name: 'Chest-supported DB Row', type: 'weight', muscles: ['Lưng', 'Vai', 'Tay trước'], focus: 'Lưng giữa, xô, vai sau. Nằm sấp trên ghế dốc nên lưng dưới được nghỉ, kéo nặng được.', dosage: '3 hiệp × 8–12 • nghỉ 90 giây • RIR 1–3.',
      guide: g(['Ghế dốc 30–45°, nằm sấp, ngực tì mép trên ghế.', 'Hai tay cầm tạ thả thẳng xuống, mũi chân chống sàn.'], ['Kéo khuỷu về phía hông, siết bả vai ở đỉnh 1 giây.', 'Hạ chậm đến khi vai duỗi hết.'], ['"Khuỷu về túi quần"', '"Ngực dính ghế"'], ['Nhấc ngực khỏi ghế để giật tạ.', 'Kéo bằng tay trước, khuỷu xoè ngang quá mức.'], ['Dừng nếu đau vai trước hoặc tê tay.']) },
    { id: 'x-ohtri', name: 'Overhead DB Triceps Extension', type: 'weight', muscles: ['Tay sau'], focus: 'Đầu dài tay sau, giãn dài ở trên đầu — bài tay sau tốt nhất với tạ đơn.', dosage: '2–3 hiệp × 10–15 • nghỉ 60 giây • RIR 1–2.',
      guide: g(['Ngồi ghế dựng thẳng, hai tay ôm một quả tạ sau đầu.'], ['Duỗi thẳng khuỷu lên trên đầu, hạ chậm xuống sau gáy.'], ['"Khuỷu chĩa lên trần"', '"Hạ sâu, duỗi hết"'], ['Khuỷu bè quá rộng.', 'Ưỡn lưng để đẩy.'], ['Dừng nếu đau khuỷu; giảm tạ, tăng reps.']) },
    { id: 'x-pushdown', name: 'Band Triceps Pushdown', type: 'band', muscles: ['Tay sau'], focus: 'Tay sau, dễ đẩy gần thất bại mà an toàn.', dosage: '2 hiệp × 12–20 • nghỉ 45 giây.',
      guide: g(['Móc dây lên cao (khung cửa/xà).'], ['Khuỷu ghim sát sườn, đẩy dây xuống đến duỗi hết, về chậm.'], ['"Khuỷu không đi đâu cả"'], ['Dùng vai/thân đè dây xuống.'], ['Kiểm tra móc dây chắc trước khi tập.']) },
    { id: 'x-hammer', name: 'Hammer Curl', type: 'weight', muscles: ['Tay trước'], focus: 'Cơ cánh tay + cánh tay quay, làm tay to theo chiều ngang.', dosage: '2 hiệp × 10–15 • nghỉ 45–60 giây.',
      guide: g(['Đứng, tạ cầm dọc (lòng bàn tay hướng vào nhau).'], ['Cuộn lên không xoay cổ tay, hạ chậm.'], ['"Khuỷu cố định"'], ['Vung người.'], ['Dừng nếu đau cổ tay.']) },
    { id: 'x-pullup', name: 'Pull-up / Chin-up', type: 'bodyweight', muscles: ['Lưng', 'Tay trước'], focus: 'Kéo dọc chính cho xô — cần xà công viên. Chưa đủ reps thì làm kéo chậm (negative) hoặc móc dây hỗ trợ.', dosage: '3–4 hiệp × 5–10 • nghỉ 2 phút • RIR 1–2.',
      guide: g(['Treo xà, tay rộng hơn vai (pull-up) hoặc ngửa tay rộng bằng vai (chin-up).'], ['Kéo ngực lên gần xà, hạ chậm đến duỗi gần hết.'], ['"Kéo khuỷu xuống túi quần"', '"Ngực lên xà"'], ['Đung đưa, kéo nửa vời.'], ['Dừng nếu đau khuỷu trong (chin-up).']) },
    { id: 'x-dip', name: 'Dips', type: 'bodyweight', muscles: ['Ngực', 'Tay sau', 'Vai'], focus: 'Ngực dưới + tay sau, cần xà kép công viên.', dosage: '3 hiệp × 6–12 • nghỉ 90 giây.',
      guide: g(['Chống thẳng tay trên xà kép, nghiêng người hơi về trước.'], ['Hạ đến khi vai ngang khuỷu, đẩy lên.'], ['"Vai xuống, ngực mở"'], ['Hạ quá sâu khi vai yếu.'], ['Dừng nếu đau đầu vai trước.']) },
  ];
  const have = new Set(S.exercises.map(e => e.id));
  for (const e of extra) if (!have.has(e.id)) S.exercises.push(Object.assign({ image: null }, e));
  // per-dumbbell weights for presses/rows/RDL
  const rename = { 'strength-a-0': 'Bench Press (tạ đơn / tạ đòn)', 'strength-c-1': 'Bulgarian / Split Squat', 'strength-b-0': 'Romanian Deadlift (tạ đơn)' };
  for (const e of S.exercises) if (rename[e.id]) e.name = rename[e.id];
  const it = (exerciseId, sets, repLow, repHigh, rest) => ({ exerciseId, sets, repLow, repHigh, rest });
  const V2 = {
    'strength-a': [it('strength-b-1', 3, 6, 10, 150), it('strength-a-1', 3, 8, 12, 90), it('outdoor-0', 3, 10, 15, 60), it('strength-a-2', 3, 8, 12, 90), it('strength-a-3', 3, 12, 20, 45), it('x-ohtri', 2, 10, 15, 60)],
    'strength-b': [it('strength-a-0', 3, 6, 10, 150), it('x-csrow', 3, 8, 12, 90), it('strength-b-0', 3, 8, 12, 120), it('strength-c-2', 3, 8, 12, 90), it('strength-b-3', 3, 12, 20, 45), it('strength-b-4', 2, 10, 15, 60)],
    'strength-c': [it('strength-c-0', 3, 10, 20, 60), it('outdoor-2', 3, 12, 15, 45), it('strength-a-1', 3, 10, 15, 75), it('strength-c-1', 3, 8, 12, 75), it('strength-a-3', 3, 12, 20, 45), it('x-hammer', 2, 10, 15, 45), it('x-pushdown', 2, 12, 20, 45)],
    'outdoor': [it('x-pullup', 4, 5, 10, 120), it('x-dip', 3, 6, 12, 90), it('outdoor-4', 3, 8, 15, 60), it('outdoor-1', 2, 12, 20, 45), it('outdoor-5', 2, 8, 12, 45)],
  };
  const NOTES = {
    'strength-a': 'Ngực trên • xô • chân • Thứ Hai',
    'strength-b': 'Ngực ngang • lưng giữa • hip hinge • vai • Thứ Tư',
    'strength-c': 'Đẩy + kéo nhẹ • chân 1 bên • tay • Thứ Sáu',
    'outdoor': 'Xà công viên: kéo xà, dips • Thứ Bảy (tuỳ chọn)',
  };
  for (const t of S.templates) if (V2[t.id]) { t.items = V2[t.id]; t.note = NOTES[t.id]; }
  // the GPT v1 exercise lists, to tell an untouched template from one the user edited
  root.PROGRAM_V1 = {
    'strength-a': ['strength-a-0', 'strength-a-1', 'strength-a-2', 'strength-a-3', 'strength-a-4'],
    'strength-b': ['strength-b-0', 'strength-b-1', 'strength-b-2', 'strength-b-3', 'strength-b-4'],
    'strength-c': ['strength-c-0', 'strength-c-1', 'strength-c-2', 'strength-c-3', 'strength-c-4'],
    'outdoor': ['outdoor-0', 'outdoor-1', 'outdoor-2', 'outdoor-3', 'outdoor-4', 'outdoor-5'],
  };
  root.PROGRAM_V2 = { templates: V2, notes: NOTES, renames: rename };
})(typeof self !== 'undefined' ? self : this);
