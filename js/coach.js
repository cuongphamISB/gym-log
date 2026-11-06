// AI coach: bring-your-own-key, called straight from the phone. Nothing is sent unless the user taps a coach button.
(function () {
  'use strict';
  const L = self.L;

  const PRESETS = {
    anthropic: { label: 'Anthropic (Claude)', baseUrl: 'https://api.anthropic.com', model: 'claude-opus-5-5' },
    openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5-mini' },
    gemini: { label: 'Gemini (OpenAI-compatible)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash' },
    custom: { label: 'Endpoint OpenAI-compatible khác (Ollama, 9router…)', baseUrl: 'http://192.168.1.10:11434/v1', model: 'llama3.1' },
  };

  const SYSTEM = `Bạn là huấn luyện viên sức mạnh cho một người đã tập gym nhiều năm (không cần giải thích cơ bản).
Bối cảnh: tập ở nhà với dumbbell, dây kháng lực, xà/công viên; có cardio nhẹ. Mục tiêu: duy trì/tăng cơ, khoẻ, bền vững; giấc ngủ là ràng buộc lớn.
Dữ liệu dưới đây do app ghi: mỗi hiệp gồm kg × reps · RIR (reps còn dư). "(k)" = hiệp khởi động. Unilateral ghi reps bên A/B.
Nguyên tắc: dựa trên số liệu thực tế, nói ngắn gọn bằng tiếng Việt, ưu tiên 3–5 điểm quan trọng nhất, nêu rõ con số. Không bịa dữ liệu không có.`;

  const PROPOSAL_SPEC = `Sau phần nhận xét, trả về đúng MỘT khối \`\`\`json với cấu trúc:
{"summary": "1–2 câu tổng kết",
 "changes": [ {"templateId": "<id giáo án>", "action": "update"|"add"|"remove", "exerciseId": "<id bài có sẵn>",
   "sets": số, "repLow": số|null, "repHigh": số|null, "rest": giây, "reason": "lý do ngắn"} ]}
Chỉ dùng templateId/exerciseId có trong danh sách. "add" = thêm bài có sẵn vào giáo án. Tối đa 6 thay đổi; nếu không cần đổi thì "changes": [].`;

  function context(db, days = 42) {
    const ex = L.byId(db.exercises);
    let out = '# GIÁO ÁN HIỆN TẠI\n';
    const dn = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    for (const t of db.templates) {
      out += `- [${t.id}] ${t.name} (${(t.days || []).map(d => dn[d]).join(',') || 'linh hoạt'}): ` +
        t.items.map(i => `${(ex[i.exerciseId] || {}).name || i.exerciseId} [${i.exerciseId}] ${i.sets}×${i.repLow ? i.repLow + '–' + i.repHigh : '?'} nghỉ ${i.rest}s`).join('; ') + '\n';
    }
    const used = new Set(db.templates.flatMap(t => t.items.map(i => i.exerciseId)));
    const spare = db.exercises.filter(e => !used.has(e.id) && e.type !== 'info');
    if (spare.length) out += `Bài có sẵn chưa dùng: ${spare.map(e => `${e.name} [${e.id}]`).join(', ')}\n`;
    out += '\n# SỐ HIỆP NẶNG / NHÓM CƠ / TUẦN (chính=1, phụ=0.5)\n';
    const ms = L.muscleSetsByWeek(db, 6);
    for (const [wk, m] of Object.entries(ms)) out += `${wk}: ${Object.entries(m).map(([k, v]) => `${k} ${v}`).join(', ') || 'không tập'}\n`;
    const body = [...db.body].sort((a, b) => a.date.localeCompare(b.date)).slice(-8);
    if (body.length) out += `\n# CÂN NẶNG\n${body.map(b => `${b.date}: ${b.kg}kg`).join(', ')}\n`;
    out += '\n# NHẬT KÝ\n' + L.summaryText(db, days);
    return out;
  }

  async function call(cfg, key, system, user) {
    if (!cfg || !cfg.model) throw new Error('Chưa chọn model.');
    if (cfg.provider === 'anthropic') {
      if (!key) throw new Error('Chưa nhập API key.');
      const body = { model: cfg.model, max_tokens: 16000, system, messages: [{ role: 'user', content: user }] };
      const headers = {
        'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      };
      // Server-side refusal fallback on the models that support it.
      if (/^claude-(opus-5|sonnet-5-5|fable-5)/.test(cfg.model)) { body.fallbacks = 'default'; headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; }
      const r = await fetch((cfg.baseUrl || PRESETS.anthropic.baseUrl).replace(/\/$/, '') + '/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(j.error && j.error.message) || r.statusText}`);
      if (j.stop_reason === 'refusal') throw new Error('Model từ chối trả lời yêu cầu này.');
      const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      if (j.stop_reason === 'max_tokens' && !text) throw new Error('Hết giới hạn token trước khi trả lời.');
      return text;
    }
    const headers = { 'content-type': 'application/json' };
    if (key) headers.authorization = 'Bearer ' + key;
    const r = await fetch(cfg.baseUrl.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST', headers,
      body: JSON.stringify({ model: cfg.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(j.error && (j.error.message || j.error)) || r.statusText}`);
    return ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
  }

  function extractProposal(text) {
    const m = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*"changes"[\s\S]*\})/);
    if (!m) return null;
    try {
      const p = JSON.parse(m[1]);
      if (!Array.isArray(p.changes)) return null;
      return p;
    } catch (e) { return null; }
  }
  // Keep only changes that reference real templates/exercises.
  function validChanges(db, p) {
    const T = L.byId(db.templates), E = L.byId(db.exercises);
    return (p.changes || []).filter(c => T[c.templateId] && E[c.exerciseId] && ['update', 'add', 'remove'].includes(c.action)).map(c => ({
      ...c, sets: L.num(c.sets), repLow: L.num(c.repLow), repHigh: L.num(c.repHigh), rest: L.num(c.rest),
    }));
  }
  function applyChange(db, c) {
    const t = db.templates.find(x => x.id === c.templateId);
    const idx = t.items.findIndex(i => i.exerciseId === c.exerciseId);
    if (c.action === 'remove') { if (idx >= 0) t.items.splice(idx, 1); return; }
    const patch = {};
    for (const k of ['sets', 'repLow', 'repHigh', 'rest']) if (c[k] !== null && c[k] !== undefined) patch[k] = c[k];
    if (idx >= 0) Object.assign(t.items[idx], patch);
    else t.items.push(Object.assign({ exerciseId: c.exerciseId, sets: 3, repLow: 8, repHigh: 12, rest: 90 }, patch));
  }
  function describeChange(db, c) {
    const T = L.byId(db.templates), E = L.byId(db.exercises);
    const t = T[c.templateId], e = E[c.exerciseId];
    const cur = t.items.find(i => i.exerciseId === c.exerciseId);
    const fmt = x => x ? `${x.sets}×${x.repLow ? x.repLow + '–' + x.repHigh : '?'}, nghỉ ${x.rest}s` : '—';
    if (c.action === 'remove') return `${t.name}: bỏ ${e.name}`;
    const next = Object.assign({}, cur || { sets: 3, repLow: 8, repHigh: 12, rest: 90 });
    for (const k of ['sets', 'repLow', 'repHigh', 'rest']) if (c[k] !== null && c[k] !== undefined) next[k] = c[k];
    return c.action === 'add' || !cur ? `${t.name}: thêm ${e.name} (${fmt(next)})` : `${t.name} · ${e.name}: ${fmt(cur)} → ${fmt(next)}`;
  }

  async function review(db, cfg, key) {
    const text = await call(cfg, key, SYSTEM, context(db) + '\n\nNHIỆM VỤ: Đánh giá 4–6 tuần gần nhất (độ đều, tiến bộ từng bài chính, cân bằng nhóm cơ, hồi phục/giấc ngủ) và đề xuất chỉnh giáo án cho tuần tới.\n' + PROPOSAL_SPEC);
    const p = extractProposal(text);
    return { text: text.replace(/```json[\s\S]*?```/, '').trim(), proposal: p ? { summary: p.summary || '', changes: validChanges(db, p) } : null };
  }
  async function ask(db, cfg, key, question) {
    return { text: await call(cfg, key, SYSTEM, context(db) + '\n\nCÂU HỎI: ' + question), proposal: null };
  }

  self.Coach = { PRESETS, review, ask, applyChange, describeChange, context, extractProposal, validChanges };
})();
