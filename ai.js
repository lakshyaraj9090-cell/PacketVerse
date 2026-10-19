/* ai.js: optional AI layer. The whole site works without it; askAI returns null on any failure.
   Key and endpoint are stored in this browser only (localStorage, via the gear icon). Any OpenAI-compatible endpoint works,
   and Gemini (generativelanguage.googleapis.com/v1beta/openai/chat/completions) and Anthropic endpoints are detected automatically. Set the model name your provider uses. */
const AI = {get cfg() { let s = {}; try { s = JSON.parse(localStorage.getItem('nja_ai') || '{}'); } catch (e) {}
  Object.keys(s).forEach(k => { if (!s[k]) delete s[k]; });
  return Object.assign({endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', key: ''}, window.AI_CONFIG || {}, s); }};
const SYS = 'You are a patient networking tutor for a 2nd-year engineering student. Answer only about the current lesson step and closely related networking concepts, in at most 4 short plain sentences. If asked something unrelated, steer back to the lesson.';
const gq = s => document.querySelector(s);

/* Gemini: no max_tokens, because its thinking tokens count against the limit and cut answers off mid-sentence */
const gemBody = (system, user, model) => ({model, reasoning_effort: 'low', messages: [{role: 'system', content: system}, {role: 'user', content: user}]});
async function askAI(system, user, ms = 8000) {
  const c = AI.cfg; if (!c.key) return null;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms), ant = /anthropic\.com/.test(c.endpoint), gem = /generativelanguage/.test(c.endpoint);
  try {
    const r = await fetch(c.endpoint, {method: 'POST', signal: ctl.signal,
      headers: ant ? {'content-type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true'}
        : {'content-type': 'application/json', Authorization: 'Bearer ' + c.key},
      body: JSON.stringify(gem ? gemBody(system, user, c.model) : ant ? {model: c.model, max_tokens: 400, system, messages: [{role: 'user', content: user}]}
        : Object.assign({model: c.model, max_tokens: 800, messages: [{role: 'system', content: system}, {role: 'user', content: user}]}, gem ? {reasoning_effort: 'low'} : {}))});
    if (!r.ok) return null;
    const d = await r.json(); return ant ? d.content[0].text : d.choices[0].message.content;
  } catch (e) { return null; } finally { clearTimeout(t); }
}

/* what the learner is looking at right now: sent with every tutor question */
const ctx = () => { const st = (steps && steps[i]) || {};
  return `Level ${L.id} "${L.title}". ` + (st.explanation ? `Step ${i + 1}: ${st.explanation} Client state: ${st.clientState}. ${st.peer}: ${st.serverState}. ` + (st.packet ? `Packet in flight: ${st.packet.flags} seq=${st.packet.seq} ack=${st.packet.ack}, event ${st.event}.` : '') : L.goal); };
function chip() { const e = gq('#ctxchip'); if (!e || !L) return; const st = (steps && steps[i]) || {};
  e.textContent = liveOn || L.todo || !steps.length ? `Level ${L.id}, interactive` : `Level ${L.id}, Step ${i + 1}${st.serverState ? ', Server: ' + st.serverState : ''}`; }

async function tutor(q) {
  const log = gq('#chat'), add = (c, t) => { const p = document.createElement('p'); p.className = c; if (c === 'bot') p.innerHTML = '<span class="ai">AI</span> '; p.append(t); log.append(p); log.scrollTop = log.scrollHeight; return p; };
  add('me', q); const w = add('bot', 'Thinking...');
  const a = await askAI(SYS, `Context: ${ctx()}\nQuestion: ${q}`);
  w.lastChild.textContent = a || 'The AI is unavailable right now. Everything else still works.';
}

/* "What if" in plain English becomes a scenario object; the engine (not the AI) simulates it */
async function whatIf(q) {
  const msg = t => { gq('#wmsg').textContent = t; };
  if (L.widget !== 'tcp' || L.todo) return msg('Open a TCP level (L9, L10 or L12) to use What if.');
  msg('Working...');
  const a = await askAI('Convert the learner\'s what-if into ONE JSON object and output only JSON. Allowed forms: {"drop":N} {"delay":N} {"corrupt":{"n":N,"field":"ack"}} {"corrupt":{"n":N,"field":"flags"}}. N is a packet number from 1 to 6.', q);
  let m = null; try { m = JSON.parse((a || '').replace(/```json|```/g, '').trim()); } catch (e) {}
  const ok = n => Number.isInteger(n) && n >= 1 && n <= 6;
  if (m && ok(m.drop)) m = {drop: m.drop}; else if (m && ok(m.delay)) m = {delay: m.delay};
  else if (m && m.corrupt && ok(m.corrupt.n) && ['ack', 'flags'].includes(m.corrupt.field)) m = {corrupt: {n: m.corrupt.n, field: m.corrupt.field}}; else m = null;
  if (!m) return msg(a === null ? 'AI unavailable. Use the Break it controls instead.' : 'I could not turn that into a scenario. Try the Break it controls.');
  mods = m; compute(); i = 0; tools(); render(); msg('Scenario set: ' + JSON.stringify(m));
}

async function explainWhy() {
  const q = qs.q[qs.k], box = gq('#aiexp'); box.innerHTML = '<span class="ai">AI</span> Thinking...';
  const a = await askAI(SYS + ' Explain in at most 3 sentences why the chosen answer is wrong and give a hint, without stating the correct option word for word.', `Question: ${q.question}\nChosen: ${q.opts[qs.fb.pick]}\nCorrect: ${q.opts[q.ci]}`);
  box.innerHTML = '<span class="ai">AI</span> '; box.append(a || 'The AI is unavailable. The explanation above still applies.');
}

/* settings dialog */
function aiState() { document.querySelectorAll('#send,#wbtn,[data-ask]').forEach(b => { b.disabled = !AI.cfg.key; b.title = AI.cfg.key ? '' : 'Add an API key to enable'; }); }
function openSettings() { const c = AI.cfg; gq('#k').value = c.key; gq('#ep').value = c.endpoint; gq('#md').value = c.model;
  gq('#tst').textContent = 'Everything works without AI. The key stays in this browser only. Use the model name your provider expects.'; gq('#set').showModal(); }
function saveSettings() { try { localStorage.setItem('nja_ai', JSON.stringify({key: gq('#k').value.trim(), endpoint: gq('#ep').value.trim(), model: gq('#md').value.trim()})); } catch (e) {} aiState(); }
function wireAI() {
  gq('#send').onclick = () => { const v = gq('#qin').value.trim(); if (v) { gq('#qin').value = ''; tutor(v); } };
  gq('#qin').onkeydown = e => { if (e.key === 'Enter') gq('#send').click(); };
  gq('#wbtn').onclick = () => { const v = gq('#win').value.trim(); if (v) whatIf(v); };
  gq('#win').onkeydown = e => { if (e.key === 'Enter') gq('#wbtn').click(); };
  gq('#sbtn').onclick = () => { saveSettings(); gq('#set').close(); };
  gq('#cbtn').onclick = () => gq('#set').close();
  gq('#tbtn').onclick = async () => { saveSettings(); gq('#tst').textContent = 'Testing...';
    const r = await askAI('Reply with the single word OK.', 'ping'); gq('#tst').textContent = r ? 'Connected.' : 'Could not connect. Check the key, endpoint and model (some providers block calls from a browser).'; };
  aiState();
}
