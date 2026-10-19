/* app.js: UI, progress and quiz logic. The widget only renders steps[i]. */
const $ = s => document.querySelector(s);
const FAIL = ['dropped', 'delayed', 'timeout', 'reset'];
const TS = {c: ['CLOSED', 'SYN_SENT', 'ESTABLISHED', 'FIN_WAIT_1', 'FIN_WAIT_2', 'TIME_WAIT'], s: ['LISTEN', 'SYN_RCVD', 'ESTABLISHED', 'CLOSE_WAIT', 'LAST_ACK', 'CLOSED']};
const LAY = ['Application', 'Transport', 'Internet', 'Link'];
let save = {done: {}, all: false}, L = null, steps = [], i = 0, playing = false, timer = null, scn = 0, mods = {}, answered = {}, hdr = false, qs = null, liveOn = false, tried = false;
try { Object.assign(save, JSON.parse(localStorage.getItem('nja') || '{}')); } catch (e) {}
const persist = () => { try { localStorage.setItem('nja', JSON.stringify(save)); } catch (e) {} };
const THEME_DEFAULT = {bg:'#f2f5f3',panel:'#ffffff',side:'#f7f9f8',accent:'#4d7fa0',text:'#263642'};
const THEME_PRESETS = {sage:THEME_DEFAULT,paper:{bg:'#f5f1e8',panel:'#fffdf8',side:'#eee9dd',accent:'#668675',text:'#383a35'},blue:{bg:'#edf2f6',panel:'#ffffff',side:'#e3eaf0',accent:'#527c9d',text:'#2e3d4b'},night:{bg:'#19232c',panel:'#222f39',side:'#1d2932',accent:'#7fa99b',text:'#edf1ee'}};
function applyTheme(t,saveIt=true){const root=document.documentElement;[['bg','--bg'],['panel','--panel'],['side','--panel2'],['accent','--blue'],['text','--text']].forEach(([k,v])=>root.style.setProperty(v,t[k]||THEME_DEFAULT[k]));if(saveIt){try{localStorage.setItem('nja_theme',JSON.stringify(t))}catch(e){}}}
function readTheme(){try{return Object.assign({},THEME_DEFAULT,JSON.parse(localStorage.getItem('nja_theme')||'{}'))}catch(e){return {...THEME_DEFAULT}}}
function setThemeControls(t){$('#themeBg').value=t.bg;$('#themePanel').value=t.panel;$('#themeSide').value=t.side;$('#themeAccent').value=t.accent;$('#themeText').value=t.text}
function wireTheme(){const dlg=$('#appearanceDialog');let t=readTheme();applyTheme(t,false);setThemeControls(t);$('#appearance').onclick=()=>dlg.showModal();$('#appearanceClose').onclick=()=>dlg.close();$('#themeDone').onclick=()=>dlg.close();$('#themePreset').onchange=e=>{t={...THEME_PRESETS[e.target.value]};setThemeControls(t);applyTheme(t)};[['themeBg','bg'],['themePanel','panel'],['themeSide','side'],['themeAccent','accent'],['themeText','text']].forEach(([id,key])=>$('#'+id).oninput=e=>{t[key]=e.target.value;$('#themePreset').value='';applyTheme(t)});$('#themeReset').onclick=()=>{$('#themePreset').value='sage';t={...THEME_DEFAULT};setThemeControls(t);applyTheme(t)}};

const unlocked = l => l.id === 17 || save.all || LEVELS.filter(x => x.id < l.id && !x.todo).every(x => save.done[x.id]);

function buildMap() {
  const q = ($('#search').value || '').toLowerCase();
  $('#map').innerHTML = SECTIONS.map((s, k) => { const ls = LEVELS.filter(l => l.section === k && (l.title + ' ' + l.goal).toLowerCase().includes(q));
    return !ls.length ? '' : `<h3>${s}</h3>` + ls.map(l => { const lock = !unlocked(l), done = save.done[l.id], cur = L && L.id === l.id;
      return `<button class="lv ${lock ? 'lock' : ''} ${done ? 'done' : ''} ${cur ? 'on' : ''}" data-id="${l.id}"><i class="st">${done ? '\u2713' : lock ? '\ud83d\udd12' : cur ? '\u25cf' : l.todo ? '\u2026' : '\u25cb'}</i><span>L${l.id} ${l.title}</span></button>`; }).join(''); }).join('');
  const real = LEVELS.filter(l => !l.todo), n = real.filter(l => save.done[l.id]).length;
  $('#prog').style.width = 100 * n / real.length + '%'; $('#pct').textContent = `${n} of ${real.length} levels, ${Math.round(100 * n / real.length)}%`;
  homeHTML(); phase();
}
/* level map (home screen) and the Learn / Try / Quiz tracker in the top bar */
function homeHTML() {
  const stars = id => { const s = (save.score || {})[id] || 0; return '\u2605'.repeat(s) + '\u2606'.repeat(3 - s); };
  $('#homev').innerHTML = '<h2>Your learning path</h2>' + SECTIONS.map((s, k) => `<h3>${s}</h3><div class="grid">` + LEVELS.filter(l => l.section === k).map(l =>
    `<button class="card ${!unlocked(l) ? 'lock' : ''} ${save.done[l.id] ? 'done' : ''}" data-id="${l.id}"><small>Level ${l.id}</small><b>${l.title}</b><span>${l.goal}</span><div class="meta"><em class="tag">${l.todo ? 'Coming soon' : 'Interactive'}</em><span class="stars">${stars(l.id)}</span></div></button>`).join('') + '</div>').join('')
    + '<h3>Final challenge</h3><div class="grid"><div class="card boss lock"><small>Boss level</small><b>Debug the broken network</b><span>Unlocks after the last level. Coming soon.</span></div></div>';
}
function phase() {
  if (!L) return; const t = tried || (steps.length && i >= steps.length - 1), q = save.done[L.id];
  $('#phase').innerHTML = [['Learn', 1], ['Try', t], ['Quiz', q]].map(([n, d], k) => `<span class="${d ? 'ok' : ''}"><i>${d ? '\u2713' : k + 1}</i>${n}</span>`).join('');
}

function compute() {
  if (L.todo || L.live) steps = [];
  else if (L.widget === 'tcp') { const b = L.scenarios[scn].sc; steps = simulate(Object.keys(mods).length ? Object.assign({type: b.type}, mods) : b); }
  else steps = L.steps || [];
}
function openLevel(id) {
  const l = LEVELS.find(x => x.id === id); if (!l || !unlocked(l)) return;
  clearInterval(window.liveTimer); liveOn = !!l.live; L = l; tried = false; $('#homev').hidden = true; $('#sd').innerHTML = ''; $('#lvno').textContent = 'Level ' + l.id + ': ' + SECTIONS[l.section]; $('#ttl').textContent = l.title; scn = 0; mods = {}; answered = {}; qs = null; setPlay(false); compute(); i = 0;
  $('#goal').textContent = l.goal; $('#def').textContent = DEFINITIONS[l.id] || ''; $('#quiz').innerHTML = l.quiz ? '<button id="startq" class="cta">\ud83c\udfaf Take the quiz (3 questions)</button>' : '';
  $('#myth').innerHTML = l.myth ? `<b>Mythbuster</b><p>Myth: ${l.myth.myth}</p><button id="bust">Bust this myth</button>` : ''; $('#myth').style.display = l.myth ? '' : 'none';
  $('#whys').innerHTML = (l.whyChallenges || []).map((w, k) => `<button data-w="${k}">Why? ${w.question}</button><p hidden id="w${k}">${w.answer}</p>`).join('');
  $('#legend').textContent = l.widget === 'tcp' ? 'SYN: open. ACK: got it, ack = next number expected. FIN: finished sending. RST: abort. seq: number of this packet\'s first byte.' : '';
  buildMap(); tools(); $('#quiz').classList.toggle('ready', liveOn); render(); if (liveOn) WIDGETS[L.widget]($('#stage'), L);
}

function tools() {
  let h = '';
  if (L.widget === 'tcp') h += L.scenarios.map((s, k) => `<button data-s="${k}" class="${k === scn ? 'on' : ''}">${s.name}</button>`).join('');
  if (L.predict) h += '<label class="tog"><input type="checkbox" id="pred"> Predict mode</label>';
  if (L.breakit) h += `<span> Break it: </span><select id="psel" aria-label="Packet">${[...new Map(steps.filter(s => s.packet && !s.packet.late).map(s => [s.packet.n, s])).values()].map(s => `<option value="${s.packet.n}">#${s.packet.n} ${s.packet.flags}</option>`).join('')}</select>
    <button data-b="drop">Drop</button><button data-b="delay">Delay</button><button data-b="corrupt">Corrupt ack</button><button data-b="clear">Clear</button>`;
  if (L.extra) h += `<button data-x="1" class="on">${L.extraName}</button>`;
  $('#tools').innerHTML = h;
  $('#dots').innerHTML = steps.map((s, k) => `<button aria-label="Step ${k + 1}" class="${FAIL.includes(s.event) ? 'fail' : ''}" data-k="${k}"></button>`).join('');
}

const FL = f => f.split('-').map(x => `<b class="fl fl-${x}">${x}</b>`).join('');
const sdHTML = v => '<h4>Live TCP state diagram</h4>' + [['Client', TS.c, v.clientState], [v.peer, TS.s, v.serverState]].map(([n, a, cur]) =>
  `<div class="path"><small>${n}</small>${a.map(x => `<span class="${x === cur ? 'on' : ''}">${x}</span>`).join('<i>\u2192</i>')}</div>`).join('');
function widgetHTML(st, hid) {
  if (L.todo) return `<div class="soon"><h2>Coming in the next build</h2><p>${L.goal}</p></div>`;
  if (L.widget === 'layers') {
    const h = st.highlight || {}, col = (side, name) => `<div class="host"><h3>${name}</h3><div class="states">${LAY.map((n, k) => `<div class="lay ${h.side === side && h.layer === k ? 'act' : ''}">${n}</div>`).join('')}</div></div>`;
    return `<div class="hosts">${col('c', 'Sender')}<div class="mid"><div class="router ${h.side === 'w' ? 'act' : ''}">Router<small>reads IP only</small></div><div class="chips">${(st.chips || []).map(c => `<span class="ch">${c}</span>`).join('')}</div></div>${col('r', 'Receiver')}</div>`;
  }
  const v = hid && i > 0 ? steps[i - 1] : st, p = hid ? null : st.packet, bd = s => `<span class="badge st-${s}">${s}</span>`;
  let h = `<div class="hosts"><div class="host"><h3>Client</h3>${bd(v.clientState)}</div><div class="mid">${p ? `<button class="pkt ${p.from === 'client' ? 'l2r' : 'r2l'} ${FAIL.includes(st.event) ? 'bad' : ''}" data-pk="1" title="Click for header view">${FL(p.flags)}<small>seq ${p.seq} ack ${p.ack}</small></button><div class="arr">${p.from === 'client' ? '\u2192' : '\u2190'}</div><small class="ev-${st.event}">${st.event}</small>` : '<small>no packet</small>'}</div><div class="host"><h3>${v.peer}</h3>${bd(v.serverState)}</div></div>`;
  if (hdr && p) { const f = ['URG', 'ACK', 'PSH', 'RST', 'SYN', 'FIN'], b = (n, x, c = '') => `<div class="fld ${c}"><small>${n}</small><b>${x}</b></div>`;
    h += `<div class="hdrv"><h4>TCP header</h4><div class="flds">${b('Source port', p.from === 'client' ? 52000 : 80)}${b('Dest port', p.from === 'client' ? 80 : 52000)}${b('Sequence', p.seq)}${b('Ack', p.ack)}${b('Window', 64240)}</div><div class="flds">${f.map(x => b(x, p.flags.includes(x) ? 1 : 0, p.flags.includes(x) ? 'set' : '')).join('')}</div><p class="cap">${(st.explanation || '').split('. ')[0].replace(/\.$/, '')}.</p></div>`; }
  return h;
}

function render() {
  $('#stepno').textContent = liveOn ? 'Interactive' : steps.length ? `Step ${i + 1} of ${steps.length}` : '';
  chip(); phase();
  if (liveOn) { $('#sd').innerHTML = ''; return; }
  $('#quiz').classList.toggle('ready', i >= steps.length - 1);
  const st = steps[i] || {}, hid = !!($('#pred') && $('#pred').checked && st.quiz && !answered[i]);
  $('#stage').innerHTML = widgetHTML(st, hid);
  $('#sd').innerHTML = L.widget === 'tcp' && steps.length ? sdHTML(hid && i > 0 ? steps[i - 1] : st) : '';
  const ana = $('#ana').checked && L.analogy;
  $('#exp').textContent = L.todo ? '' : hid ? 'Make a prediction to see what happens next.' : (ana ? 'Analogy: ' + L.analogy : st.explanation || '');
  $('#why').textContent = hid || L.todo ? '' : st.why || '';
  const q = st.quiz, pq = $('#pq');
  pq.innerHTML = $('#pred') && $('#pred').checked && q ? `<strong>${q.question}</strong>` + (answered[i] ? `<p class="${answered[i].ok ? 'good' : 'nope'}">${answered[i].ok ? 'Correct!' : 'Not quite: ' + q.options[q.correctIndex]}</p>` : q.options.map((o, k) => `<button data-pq="${k}">${o}</button>`).join('')) : '';
  document.querySelectorAll('#dots button').forEach((b, k) => b.classList.toggle('cur', k === i));
}
const go = k => { if (!steps.length) return; i = Math.max(0, Math.min(steps.length - 1, k)); hdr = false; render(); };
function setPlay(v) { playing = v; clearTimeout(timer); $('#play').textContent = v ? 'Pause' : 'Play'; if (v) timer = setTimeout(tick, 100); }
function tick() { if (!playing) return; if (i >= steps.length - 1) return setPlay(false); go(i + 1); if ($('#pred') && $('#pred').checked && steps[i].quiz && !answered[i]) return setPlay(false); timer = setTimeout(tick, 1800 / +$('#speed').value); }

/* ---- quiz: 3 questions, pass with 2, options reshuffle on every attempt ---- */
const QUIZ_MEMES = {right:['Packet delivered. Brain: ACK! 📦','No retransmission needed. Nice work! ✅','Certified network navigator. 🧭','Your answer found the shortest path. 🎯','That concept is now cached. 💾','The bits are bit-ing. Great job! ✨'],wrong:['A wild distractor appeared. You can retry the concept! 🎲','That packet took the scenic route. Check the explanation and try again. 🗺️','NACK for now, knowledge loading… 🔄','Even routers need a reroute sometimes. Keep going! 🚦','A tiny bit flip in the answer. You’ve got this! 🧩','Not quite—this is how the network learns resilience. 💪']};
const shuffle = a => { a = a.slice(); for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; };
function startQuiz() { qs = {k: 0, score: 0, fb: null, q: L.quiz.map(q => { const idx = shuffle([0, 1, 2]); return {...q, opts: idx.map(x => q.options[x]), ci: idx.indexOf(q.correctIndex)}; })}; drawQuiz(); }
function drawQuiz() {
  const el = $('#quiz'), q = qs.q[qs.k], fb = qs.fb;
  if (!q) { const pass = qs.score >= 2;
    if (pass) { save.done[L.id] = true; save.score = save.score || {}; save.score[L.id] = Math.max(save.score[L.id] || 0, qs.score); persist(); buildMap(); }
    const nxt = LEVELS.find(x => x.id > L.id && unlocked(x));
    el.innerHTML = `<div class="res ${pass ? 'good' : 'nope'}"><b>${qs.score} of 3 correct</b><span>${pass ? (nxt ? `Level ${nxt.id} unlocked` : 'Level complete') : 'You need 2 of 3 to continue'}</span></div>`
      + (pass && nxt ? `<button data-go="${nxt.id}" class="cta">Continue to L${nxt.id}</button>` : '') + `<button id="startq" class="${pass ? '' : 'cta'}">Retry (options reshuffle)</button>`; return; }
  el.innerHTML = `<em>Question ${qs.k + 1} of 3</em><div class="qbar"><i style="width:${(qs.k + (fb ? 1 : 0)) * 33.3}%"></i></div><strong>${q.question}</strong>`
    + q.opts.map((o, k) => `<button data-qa="${k}" ${fb ? 'disabled' : ''} class="${fb ? (k === q.ci ? 'right' : k === fb.pick ? 'wrong' : '') : ''}"><span class="ltr">${'ABC'[k]}</span>${o}</button>`).join('')
    + (fb ? `<div class="meme-reaction ${fb.ok ? 'meme-right' : 'meme-wrong'}" aria-live="polite">${fb.meme}</div><div class="fb ${fb.ok ? 'good' : 'nope'}"><b>${fb.ok ? '\u2713 Correct.' : '\u2717 Not quite.'}</b> ${q.explanation}</div>`
      + (fb.ok ? '' : `<button id="xai" class="aibtn" ${AI.cfg.key ? '' : 'disabled title="Add an API key to enable"'}>Explain why <span class="ai">AI</span></button><div id="aiexp"></div>`)
      + `<button data-qn="1" class="cta">${qs.k === 2 ? 'See result' : 'Continue'}</button>` : '');
}

/* ---- wiring (event delegation, so re-rendering never loses handlers) ---- */
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
  if (d.id) openLevel(+d.id); if (d.go) openLevel(+d.go);
  if (d.x) { liveOn = true; $('#sd').innerHTML = ''; clearInterval(window.liveTimer); WIDGETS[L.extra]($('#stage'), L); }
  if (d.s !== undefined) { liveOn = false; clearInterval(window.liveTimer); scn = +d.s; mods = {}; compute(); i = 0; tools(); render(); }
  if (d.k !== undefined) { setPlay(false); go(+d.k); }
  if (d.pk) { hdr = !hdr; render(); }
  if (d.pq !== undefined) { answered[i] = {ok: +d.pq === steps[i].quiz.correctIndex}; render(); }
  if (d.w !== undefined) $('#w' + d.w).hidden = !$('#w' + d.w).hidden;
  if (b.id === 'bust') $('#myth').insertAdjacentHTML('beforeend', `<p class="good">Truth: ${L.myth.truth}</p>`), b.remove();
  if (b.id === 'startq') startQuiz(); if (b.id === 'xai') explainWhy(); if (b.id === 'urlbtn') openLevel(17); if (b.id === 'home') $('#homev').hidden = !$('#homev').hidden; if (b.id === 'gear') openSettings(); if (d.ask) tutor(d.ask);
  if (d.qa !== undefined) { const q = qs.q[qs.k], ok = +d.qa === q.ci, pool = ok ? QUIZ_MEMES.right : QUIZ_MEMES.wrong; qs.fb = {ok, pick: +d.qa, meme: pool[Math.floor(Math.random() * pool.length)]}; if (qs.fb.ok) qs.score++; drawQuiz(); }
  if (d.qn) { qs.k++; qs.fb = null; drawQuiz(); }
  if (d.b) { const n = +($('#psel') || {}).value;
    if (d.b === 'clear') mods = {}; else if (n) mods = d.b === 'corrupt' ? {corrupt: {n, field: 'ack'}} : {[d.b]: n};
    compute(); i = Math.max(0, steps.findIndex(s => s.packet && s.packet.n === n)); tools(); render(); }
});
$('#back').onclick = () => { setPlay(false); go(i - 1); }; $('#next').onclick = () => { setPlay(false); go(i + 1); };
$('#reset').onclick = () => { setPlay(false); answered = {}; go(0); };
$('#play').onclick = () => { if (playing) return setPlay(false); if (i >= steps.length - 1) go(0); setPlay(true); };
$('#ana').onchange = render; document.addEventListener('change', e => { if (e.target.id === 'pred') { answered = {}; render(); } });
$('#unl').checked = save.all; $('#unl').onchange = e => { save.all = e.target.checked; persist(); buildMap(); };
$('#search').oninput = buildMap;
$('#stage').addEventListener('input', () => { tried = true; phase(); }); $('#stage').addEventListener('click', () => { tried = true; phase(); });
{ const day = new Date().toDateString(), yest = new Date(Date.now() - 864e5).toDateString();
  if (save.last !== day) { save.streak = save.last === yest ? (save.streak || 0) + 1 : 1; save.last = day; persist(); }
  $('#streak').textContent = '\ud83d\udd25 ' + (save.streak || 1) + (save.streak > 1 ? ' day streak' : ' day'); }
wireTheme(); wireAI(); openLevel(1);
