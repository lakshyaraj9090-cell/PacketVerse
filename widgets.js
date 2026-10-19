/* widgets.js: hands-on widgets. Each is WIDGETS[name](el, level) and calls say(explanation, why) as the learner plays.
   Levels opt in with live:true (widget replaces the stage) or extra:'name' (an extra button on a step-based level). */
const say = (a, b) => { $('#exp').textContent = a; $('#why').textContent = b || ''; };
const WIDGETS = {
  /* L2: sliders drive live delay, throughput and bandwidth-delay product */
  perf(el) {
    const S = [['bw', 'Bandwidth (Mbps)', 1, 1000, 10], ['dist', 'Distance (km)', 1, 20000, 1000], ['size', 'Packet size (bytes)', 100, 15000, 1500], ['spd', 'Propagation speed (km/s)', 100000, 300000, 200000]];
    el.innerHTML = S.map(([k, n, a, b, v]) => `<label class="sl">${n}: <b id="v_${k}"></b><input type="range" id="r_${k}" min="${a}" max="${b}" value="${v}"></label>`).join('') + '<table id="out"></table><svg id="pipe" viewBox="0 0 600 70"></svg>';
    const f = s => s < 1e-3 ? (s * 1e6).toFixed(1) + ' \u00b5s' : s < 1 ? (s * 1e3).toFixed(2) + ' ms' : s.toFixed(2) + ' s';
    const calc = () => {
      const g = k => +el.querySelector('#r_' + k).value; S.forEach(([k]) => el.querySelector('#v_' + k).textContent = g(k));
      const bw = g('bw') * 1e6, bits = g('size') * 8, tx = bits / bw, pr = g('dist') / g('spd'), rtt = 2 * pr, bdp = bw * rtt, thr = bits / (tx + rtt), n = Math.max(1, Math.ceil(bdp / bits));
      el.querySelector('#out').innerHTML = [['Transmission delay (size / bandwidth)', f(tx)], ['Propagation delay (distance / speed)', f(pr)], ['Total one-way latency', f(tx + pr)],
        ['Stop-and-wait throughput', (thr / 1e6).toFixed(3) + ' Mbps'], ['Bandwidth-delay product', (bdp / 8 / 1000).toFixed(1) + ' kB (' + n + ' packets)']].map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');
      const m = Math.min(n, 24), w = 580 / 24;
      el.querySelector('#pipe').innerHTML = '<rect x="10" y="15" width="580" height="40" rx="20" fill="none" stroke="#6fb1ff" stroke-width="2"/>' + Array.from({length: m}, (_, k) => `<rect x="${16 + k * w}" y="22" width="${w - 3}" height="26" rx="3" fill="#f2c14e"/>`).join('') + `<text x="300" y="68" fill="#93a5ba" font-size="11" text-anchor="middle">pipe filled by ${n} packet(s)${n > 24 ? ' (showing 24)' : ''}</text>`;
      say(`${tx > pr ? 'Transmission' : 'Propagation'} delay dominates here (${f(Math.max(tx, pr))}). It takes ${n} packet(s) in flight to keep this pipe full.`, 'Bandwidth shrinks transmission time, but no bandwidth can make a signal cross distance faster.');
    };
    el.oninput = calc; calc();
  },
  /* L3: flip bits and see which error-detection methods notice */
  bits(el) {
    el.innerHTML = '<label>Message bits: <input id="in" value="1011001" maxlength="16"></label><p class="hint">Click a bit to flip it in transit.</p><div id="bt" class="row"></div><table id="res"></table>';
    const par = b => [...b].filter(x => x === '1').length % 2;
    const chk = b => { let s = 0; for (let k = 0; k < b.length; k += 4) s += parseInt((b.slice(k, k + 4) + '000').slice(0, 4), 2); while (s > 15) s = (s & 15) + (s >> 4); return (~s) & 15; };
    const crc = b => { const a = [...b + '000'].map(Number); for (let k = 0; k < b.length; k++) if (a[k]) [1, 0, 1, 1].forEach((x, j) => a[k + j] ^= x); return a.slice(-3).join(''); };
    let flip = [], last = '';
    const draw = () => {
      const o = el.querySelector('#in').value.replace(/[^01]/g, ''); if (o !== last) { flip = []; last = o; }
      if (!o) { el.querySelector('#bt').innerHTML = ''; el.querySelector('#res').innerHTML = ''; return say('Type some bits (0 and 1) to begin.', ''); }
      const r = [...o].map((c, k) => flip[k] ? (c === '1' ? '0' : '1') : c).join('');
      el.querySelector('#bt').innerHTML = [...r].map((c, k) => `<button data-f="${k}" class="${flip[k] ? 'pkt bad' : ''}">${c}</button>`).join('');
      const M = [['Even parity', par(o), par(r)], ['Checksum (4-bit)', chk(o), chk(r)], ['CRC (x\u00b3+x+1)', crc(o), crc(r)]], n = flip.filter(Boolean).length;
      el.querySelector('#res').innerHTML = '<tr><th>Method</th><th>Sender</th><th>Receiver</th><th>Verdict</th></tr>' + M.map(m => `<tr><td>${m[0]}</td><td>${m[1]}</td><td>${m[2]}</td><td class="${n ? (m[1] !== m[2] ? 'good' : 'nope') : ''}">${n ? (m[1] !== m[2] ? 'caught' : 'MISSED') : 'no error'}</td></tr>`).join('');
      const miss = M.filter(m => m[1] === m[2]).map(m => m[0]);
      say(n ? `You flipped ${n} bit(s). ${miss.length ? 'Missed by: ' + miss.join(', ') + '.' : 'Every method caught it.'}` : 'No bits flipped yet. Click bits to corrupt the message.', 'Try flipping two bits: parity cannot see an even number of flips.');
    };
    el.oninput = draw; el.onclick = e => { const k = e.target.dataset.f; if (k !== undefined) { flip[+k] = !flip[+k]; draw(); } }; draw();
  },
  /* L6: CIDR calculator with binary view and a membership test */
  cidr(el) {
    el.innerHTML = '<div class="row"><label>IP <input id="ip" value="192.168.1.77"></label> / <input id="pf" type="number" min="0" max="32" value="26" style="width:64px"><label>Test IP <input id="t" value="192.168.1.100"></label></div><div id="o"></div>';
    const toN = s => { const p = s.trim().split('.'); return p.length !== 4 || p.some(x => !/^\d{1,3}$/.test(x) || +x > 255) ? null : p.reduce((a, x) => a * 256 + +x, 0); };
    const str = n => [24, 16, 8, 0].map(s => (n >>> s) & 255).join('.');
    const bin = (n, p) => [...(n >>> 0).toString(2).padStart(32, '0')].map((c, k) => `<span class="${k < p ? 'net' : 'hb'}">${c}</span>${k % 8 === 7 && k < 31 ? '.' : ''}`).join('');
    const calc = () => {
      const ip = toN(el.querySelector('#ip').value), p = +el.querySelector('#pf').value, o = el.querySelector('#o');
      if (ip === null || !Number.isInteger(p) || p < 0 || p > 32) { o.innerHTML = ''; return say('Enter a valid IPv4 address (four numbers from 0 to 255) and a prefix from 0 to 32.', ''); }
      const mask = p ? (0xFFFFFFFF << (32 - p)) >>> 0 : 0, net = (ip & mask) >>> 0, bc = (net | ~mask) >>> 0, hosts = p >= 31 ? (p === 31 ? 2 : 1) : 2 ** (32 - p) - 2;
      const tn = toN(el.querySelector('#t').value), inside = tn !== null && ((tn & mask) >>> 0) === net;
      o.innerHTML = `<p class="mono">${bin(ip, p)}<br><small>amber = network bits, grey = host bits</small></p><table><tr><td>Mask</td><td>${str(mask)}</td></tr><tr><td>Network</td><td>${str(net)}/${p}</td></tr><tr><td>Broadcast</td><td>${str(bc)}</td></tr><tr><td>Host range</td><td>${str(p >= 31 ? net : net + 1)} to ${str(p >= 31 ? bc : bc - 1)}</td></tr><tr><td>Usable hosts</td><td>${hosts}</td></tr><tr><td>Test IP inside?</td><td class="${inside ? 'good' : 'nope'}">${tn === null ? 'invalid test IP' : inside ? 'yes' : 'no'}</td></tr></table>`;
      say(`${str(net)}/${p} has ${hosts} usable host address(es). The first ${p} bits name the network, the other ${32 - p} name the host.`, 'Routers compare only the network bits, which keeps routing tables small.');
    };
    el.oninput = calc; calc();
  },
  /* L12 extra: congestion window, with the two loss reactions */
  cwnd(el) {
    el.innerHTML = '<div class="row"><button data-a="rtt">Next RTT</button><button data-a="to">Timeout loss</button><button data-a="dup">3 duplicate ACKs</button><button data-a="auto">Auto</button><button data-a="rs">Reset</button></div><svg id="g" viewBox="0 0 600 260"></svg>';
    let c, th, ph, pts; const init = () => { c = 1; th = 16; ph = 'Slow start'; pts = [{c: 1, e: 0, th}]; };
    const draw = () => {
      const dx = 560 / Math.max(20, pts.length), mx = Math.max(24, ...pts.map(p => p.c)), y = v => 240 - 220 * v / mx;
      el.querySelector('#g').innerHTML = `<line x1="30" y1="240" x2="590" y2="240" stroke="#2b3c52"/><line x1="30" y1="20" x2="30" y2="240" stroke="#2b3c52"/><line x1="30" x2="590" y1="${y(th)}" y2="${y(th)}" stroke="#6fb1ff" stroke-dasharray="5"/><text x="34" y="${y(th) - 4}" fill="#6fb1ff" font-size="11">ssthresh ${th}</text><polyline fill="none" stroke="#f2c14e" stroke-width="2" points="${pts.map((p, k) => `${30 + k * dx},${y(p.c)}`).join(' ')}"/>` + pts.map((p, k) => p.e ? `<circle cx="${30 + k * dx}" cy="${y(p.c)}" r="5" fill="#ff6b6b"/>` : '').join('') + `<text x="590" y="256" fill="#93a5ba" font-size="11" text-anchor="end">time (round trips)  |  cwnd now ${c}: ${ph}</text>`;
    };
    const act = a => {
      if (a === 'rtt') { if (ph === 'Slow start') { c *= 2; if (c >= th) { c = th; ph = 'Congestion avoidance'; } say(`Slow start: cwnd doubles every round trip (now ${c} segments).`, 'TCP starts small to probe the network, then grows fast.'); } else { c += 1; say(`Congestion avoidance: cwnd grows by 1 per round trip (now ${c}).`, 'Near the limit, TCP creeps upward to avoid causing loss.'); } }
      if (a === 'to') { th = Math.max(2, Math.floor(c / 2)); c = 1; ph = 'Slow start'; say(`Timeout: a severe signal. ssthresh becomes half of cwnd (${th}) and cwnd drops to 1, so slow start restarts.`, 'A timeout means the network may be badly congested, so TCP backs off hard.'); }
      if (a === 'dup') { th = Math.max(2, Math.floor(c / 2)); c = th; ph = 'Congestion avoidance'; say(`3 duplicate ACKs: a milder signal, since later packets still arrive. cwnd halves to ${c} and grows linearly.`, 'Fast retransmit resends the lost segment without waiting for a timeout.'); }
      pts.push({c, e: a === 'to' || a === 'dup' ? 1 : 0, th}); draw();
    };
    el.onclick = e => { const a = e.target.dataset.a; if (!a) return; clearInterval(window.liveTimer);
      if (a === 'rs') { init(); draw(); say('Press Next RTT to watch the window grow.', ''); } else if (a === 'auto') window.liveTimer = setInterval(() => act('rtt'), 700); else act(a); };
    init(); draw(); say('Press Next RTT to grow the window, then trigger a loss and compare the two reactions.', 'cwnd is how many segments TCP may have in flight at once.');
  },
  /* L9 extra: you play the server and build the reply yourself */
  beserver(el) {
    let isn, round, fb;
    const fresh = () => { isn = 100 + Math.floor(Math.random() * 9000); round = 0; fb = ''; draw(); };
    const draw = () => {
      if (round === 0) { say(`The client sends SYN with seq=${isn}. You are the server (your starting number is 5000). Build your reply and send it.`, 'Getting the flags and numbers right is exactly what TCP software does.');
        el.innerHTML = `<p>Reply packet:</p><div class="row">${['SYN', 'ACK', 'FIN', 'RST'].map(f => `<label class="tog"><input type="checkbox" data-f="${f}"> ${f}</label>`).join('')}<label>seq <input id="sq" type="number"></label><label>ack <input id="ak" type="number"></label><button data-send="1">Send</button></div><p class="${fb ? 'nope' : ''}">${fb}</p>`; }
      else if (round === 1) { say(`Your SYN-ACK arrived. The client is ESTABLISHED and sends 100 bytes of data with seq=${isn + 1}. What ack do you send back?`, 'ack always means "the next byte I expect".');
        el.innerHTML = `<p>Client data: seq=${isn + 1}, length 100</p><div class="row"><label>ack <input id="ak" type="number"></label><button data-send="1">Send</button></div><p class="${fb ? 'nope' : ''}">${fb}</p>`; }
      else { say('Connection open and data acknowledged. You just did what a real TCP stack does.', ''); el.innerHTML = '<p class="good">Well done! Both rounds correct.</p><button data-again="1">Play again with new numbers</button>'; }
    };
    el.onclick = e => {
      if (e.target.dataset.again) return fresh();
      if (!e.target.dataset.send) return;
      const fl = [...el.querySelectorAll('[data-f]')].filter(x => x.checked).map(x => x.dataset.f), ak = el.querySelector('#ak').value, sq = el.querySelector('#sq');
      if (round === 0) fb = !fl.includes('SYN') ? 'No SYN: you must also announce your own starting number.' : !fl.includes('ACK') ? 'No ACK: you must confirm the client\'s SYN.' : fl.length > 2 ? 'Extra flags: FIN and RST would close or abort the connection.'
        : +ak !== isn + 1 ? 'ack means "next number I expect". A SYN counts as one number.' : +sq.value !== 5000 ? 'Use your own starting number, 5000, as seq.' : '';
      else fb = +ak === isn + 101 ? '' : 'The client sent 100 bytes starting at its seq. The next byte you expect is after those.';
      if (!fb) round++; draw();
    };
    fresh();
  }
  ,lab(el, level) {
    const id=level.id;
    const data={
      4:['Reliable delivery lab','Choose a protocol and lose packet #3 to compare recovery.',['Stop-and-Wait','Go-Back-N','Selective Repeat']],
      5:['Shared medium and switching','Transmit on a shared channel or observe a switch learn MAC locations.',['ALOHA','CSMA/CD','Learning switch']],
      7:['Routing lab','Recompute the shortest path after a link failure.',['No failure','A–B fails','B–D fails']],
      8:['Transport protocol chooser','Pick an application and compare TCP and UDP behavior.',['Video call','File download','DNS lookup','Online game']],
      11:['TCP flow control lab','Send bytes into a receiver buffer, then let its application read.',['8 bytes','16 bytes','4 bytes']],
      13:['DNS and HTTP journey','Resolve a name, then inspect the HTTP response.',['GET /','GET /missing','POST /login']],
      14:['Cryptography workbench','Compare symmetric keys, public-key encryption and Diffie–Hellman.',['Symmetric key','Public-key encryption','Diffie–Hellman']],
      15:['Security and firewall lab','Evaluate a packet against a firewall policy.',['HTTPS to 443','HTTP to 80','SSH to 22','Unknown port 4444']],
      16:['Network applications and overlays','Trace common application architectures and their QoS needs.',['CDN video','Email','Peer-to-peer file','RPC service']]
    }[id]; let history=[],buf=0,cache=false;
    const desc={4:['Send packets 1–5. Packet 3 is lost.','Stop-and-Wait: each packet waits for its ACK; lost packet times out and is resent.','Go-Back-N: receiver discards out-of-order packets; sender retries packet 3 and everything after it.','Selective Repeat: receiver buffers later packets; sender retries only packet 3.'],5:['Several devices share a collision domain.','ALOHA transmits without listening; overlapping frames collide.','CSMA/CD listens first, detects collision, then uses random backoff.','Learning switch records source MAC → port and floods unknown destinations, then forwards known ones only.'],7:['Topology costs: A–B 2, B–D 2, A–C 5, C–D 1.','Dijkstra chooses A → B → D, cost 4.','A–B failure: alternate A → C → D, cost 6.','B–D failure: routers advertise the failure and converge on A → C → D.'],8:['Video call: UDP often favors freshness; app handles loss.','File download: TCP supplies ordered reliable bytes; QUIC can also provide reliability over UDP.','DNS: typically UDP first, TCP when response size or operation requires it.','Games: UDP for timely state; reliable channel for important actions.'],11:['TCP sequence numbers count bytes.','Send four bytes: receiver window shrinks by four.','At zero window, sender pauses to protect receiver buffer.','Application reads four bytes: receiver advertises more available window.'],13:['DNS cache miss: recursive resolver follows root → TLD → authoritative server.','A record returns an IP address; resolver caches it.','Browser connects and sends an HTTP request with a Host header.','200 means success; 404 means missing resource; POST submits data.'],14:['Symmetric: Alice and Bob use the same secret key; it must be shared safely.','Public-key: encrypt to recipient public key; only their private key decrypts.','Diffie–Hellman: exchange public values and independently derive matching shared secret.','Toy numbers are illustrative; real systems need strong parameters and authenticated exchange.'],15:['Packet arrives with destination port and protocol.','Firewall checks rules in order; unmatched traffic is denied by default.','TLS protects data in transit and authenticates a server; it does not replace firewall policy.','SSH protects remote administration; IPsec protects IP traffic; PGP can protect message content.'],16:['CDN: DNS steers client to nearby edge; cache serves video segments.','Email: SMTP sends; DNS MX identifies recipient mail server; IMAP retrieves.','P2P: peers discover each other and exchange verified chunks.','RPC: client encodes a method request; service executes and returns response. QoS needs vary by app.']};
    el.innerHTML='<h3>'+data[0]+'</h3><p>'+data[1]+'</p><div class="row"><label>Scenario <select id="labsel">'+data[2].map((x,i)=>'<option value="'+i+'">'+x+'</option>').join('')+'</select></label><button data-run>Run step</button><button data-clear>Reset</button></div><ol id="labout"></ol>';
    el.onclick=e=>{if(e.target.closest('[data-clear]')){history=[];buf=0;cache=false;}else if(e.target.closest('[data-run]')){let n=+el.querySelector('#labsel').value; if(id===11){buf=Math.min(16,buf+4);history.push('Sent bytes; next sequence advanced by 4. Receiver window: '+(16-buf)+' bytes.');}else if(id===13){history.push(cache?'DNS cache hit: reuse known address.':'DNS cache miss: recursive lookup returns and caches address.');cache=true;history.push(desc[id][1+n%3]);}else history.push(desc[id][Math.min(1+n,desc[id].length-1)]); if(id===4)history=desc[id].slice(0);if(id===5)history=desc[id].slice(0);if(id===7)history=desc[id].slice(0);if(id===8)history=desc[id].slice(0);if(id===14)history=desc[id].slice(0);if(id===15)history=desc[id].slice(0);if(id===16)history=desc[id].slice(0);if(id===11&&n===1){buf=Math.max(0,buf-4);history.push('Application reads four bytes. Window opens to '+(16-buf)+' bytes.');}}
      el.querySelector('#labout').innerHTML=history.map(x=>'<li>'+x+'</li>').join('');say(history.join(' '),id===11?'Flow control protects the receiver; congestion control protects the network.':'Change the scenario and run again to compare outcomes.');};say(data[1],'Use the controls to run the simulation.');
  }

  ,urlflow(el) {
    let steps=[],current=0,auto=null;
    el.innerHTML='<div class="url-lab"><div class="url-intro"><span class="eyebrow">LIVE NETWORK WALKTHROUGH</span><h2>Trace a website request</h2><p>Enter a public web URL. Choose a transport path, then follow the request and response one step at a time.</p></div><form id="urlform" class="url-form"><label for="urlinput">Website URL</label><div class="url-entry"><input id="urlinput" type="url" placeholder="https://www.youtube.com/watch?v=…" required autocomplete="url"><button class="cta" type="submit">Build simulation</button></div><div class="row url-options"><label>Example connection<select id="urlproto"><option value="tcp">HTTPS over TCP + TLS (HTTP/2 example)</option><option value="quic">HTTPS over QUIC (HTTP/3 example)</option></select></label><span class="hint">No request is sent to the website.</span></div></form><div id="urlnotice" class="url-notice"></div><div id="urlresult"></div></div>';
    const form=el.querySelector('#urlform'),result=el.querySelector('#urlresult'),notice=el.querySelector('#urlnotice');
    function build(raw,proto){let u;try{u=new URL(raw)}catch(e){notice.textContent='Enter a complete URL such as https://www.youtube.com/';return null}if(!['http:','https:'].includes(u.protocol)||u.username||u.password){notice.textContent='Use an http:// or https:// address without embedded username or password.';return null}
      const host=u.hostname,path=u.pathname+(u.search?'?…':''),secure=u.protocol==='https:',quic=proto==='quic',site=/youtube\.com|youtu\.be/i.test(host),sample='203.0.113.42';
      return {host,secure,quic,steps:[
        {title:'1 · Browser parses the URL',body:'Scheme: '+u.protocol.replace(':','').toUpperCase()+' · Host: '+host+' · Resource path: '+path+'. The browser identifies the destination name and whether the connection should be protected.',packet:'URL → hostname + path'},
        {title:'2 · DNS finds an address',body:'The browser or operating system checks its DNS cache. On a cache miss, a recursive resolver may query DNS hierarchy and return an address for '+host+'. This walkthrough uses '+sample+' as a documentation-only placeholder, not a lookup result.',packet:'DNS query → resolver → example answer'},
        {title:'3 · Choose a next hop',body:'The computer sends an IP packet toward its default gateway. A local Ethernet or Wi-Fi frame carries it to that next hop; routers then forward the IP packet toward the destination. Example route: your device → home/campus router → ISP → transit network → illustrative edge server.',packet:'Frame to gateway · IP destination stays the website address'},
        {title:quic?'4 · QUIC connection and TLS':'4 · TCP connection setup',body:quic?'The browser starts QUIC over UDP. QUIC combines transport setup with TLS 1.3 security negotiation; packet details vary by implementation and connection state.':'The browser opens TCP with SYN, SYN-ACK, ACK. For HTTPS, it then performs a TLS handshake to authenticate the server and agree on encryption keys.',packet:quic?'UDP + QUIC Initial · TLS 1.3 negotiation':'TCP SYN → SYN-ACK → ACK; then TLS handshake'},
        {title:'5 · Browser creates an HTTP request',body:'After connection setup, the browser creates an HTTP request for '+path+'. It includes the host name and other headers. '+(site?'A video site may request HTML, player code, manifests, and many media segments.':'A typical site may request HTML, scripts, styles, images, and API data.')+' Exact requests depend on the page and browser.',packet:'HTTP '+(u.pathname==='/'?'GET /':'GET '+u.pathname)+' · '+(quic?'HTTP/3 example':'HTTP/2 example')},
        {title:'6 · Request bytes travel as packets',body:quic?'QUIC carries encrypted streams in UDP datagrams. Link-layer frames are rebuilt for each local hop; routers inspect the IP destination and choose a next hop.':'TCP numbers byte ranges and acknowledges received data. Link-layer frames are rebuilt for each local hop; routers inspect the IP destination and choose a next hop.',packet:quic?'Encrypted QUIC packets inside UDP datagrams':'TCP segments with sequence numbers and acknowledgements'},
        {title:'7 · Server or edge processes the request',body:'A real service may route the request through load balancers, a CDN edge, caches, and application servers. The exact infrastructure for '+host+' cannot be inferred from its URL, so these are possible roles in a generic example.',packet:'Request reaches an illustrative service edge'},
        {title:'8 · Response returns to the browser',body:'The service sends an HTTP status and response data. The browser acknowledges transport data, reassembles it, decrypts HTTPS content, and passes it to the page renderer. Larger responses arrive across multiple packets or streams.',packet:site?'Page data and possible video manifest/media chunks → browser':'HTTP response packets → browser'},
        {title:'9 · The page makes more requests',body:'The first response often references other resources, causing additional DNS lookups or HTTP requests. A video page may request a manifest and then short media segments adaptively; other pages fetch scripts, images, fonts, and API responses.',packet:'Repeated request ↔ response cycles'}]};
    }
    function show(raw){clearInterval(auto);auto=null;const model=build(raw,el.querySelector('#urlproto').value);if(!model)return;steps=model.steps;current=0;notice.textContent='Simulation only: '+model.host+' is shown with a documentation-only sample IP and an example route. No DNS lookup or website request was performed.';draw(model);result.scrollIntoView({behavior:'smooth',block:'start'})}
    function draw(model){result.innerHTML='';const summary=document.createElement('div');summary.className='url-summary';summary.innerHTML='<div><small>DESTINATION HOST</small></div><strong></strong><span></span>';summary.querySelector('strong').textContent=model.host;summary.querySelector('span').textContent=(model.secure?'HTTPS secure connection':'HTTP connection')+' · '+(model.quic?'QUIC / HTTP/3 example':'TCP / HTTP/2 example');result.append(summary);
      const route=document.createElement('div');route.className='url-route';['Your device','Gateway','ISP / transit','Example edge'].forEach((x,i)=>{const n=document.createElement('div');n.className='url-node'+(i===0?' active':'');n.innerHTML='<i></i><span></span>';n.querySelector('span').textContent=x;route.append(n);if(i<3){const line=document.createElement('b');line.textContent='→';route.append(line)}});result.append(route);
      const nav=document.createElement('div');nav.className='url-nav';nav.innerHTML='<button data-urlback>← Previous</button><span></span><button data-urlplay>Play journey</button><button data-urlnext>Next step →</button>';result.append(nav);
      const card=document.createElement('article');card.className='url-step';card.innerHTML='<div class="url-step-head"><span class="eyebrow"></span><span class="url-packet"></span></div><h3></h3><p></p><div class="url-progress"><i></i></div>';result.append(card);
      function update(){const st=steps[current];nav.querySelector('span').textContent='Step '+(current+1)+' of '+steps.length;nav.querySelector('[data-urlback]').disabled=current===0;nav.querySelector('[data-urlnext]').disabled=current===steps.length-1;nav.querySelector('[data-urlplay]').textContent=auto?'Pause journey':current===steps.length-1?'Replay journey':'Play journey';card.querySelector('.eyebrow').textContent='NETWORK EVENT '+String(current+1).padStart(2,'0');card.querySelector('h3').textContent=st.title;card.querySelector('p').textContent=st.body;card.querySelector('.url-packet').textContent=st.packet;card.querySelector('.url-progress i').style.width=((current+1)/steps.length*100)+'%';route.querySelectorAll('.url-node').forEach((n,i)=>n.classList.toggle('active',i<=Math.min(3,Math.floor(current*4/steps.length))));say(st.body,'Every router forwards a packet toward the next hop. The exact route and service infrastructure vary in real networks.')}
      result.onclick=e=>{if(e.target.closest('[data-urlnext]')){current=Math.min(steps.length-1,current+1);update()}if(e.target.closest('[data-urlback]')){current=Math.max(0,current-1);update()}if(e.target.closest('[data-urlplay]')){if(auto){clearInterval(auto);auto=null;update()}else{if(current>=steps.length-1)current=0;update();auto=setInterval(()=>{if(current>=steps.length-1){clearInterval(auto);auto=null;update();return}current++;update()},2200);update()}}};update()
    }
    form.addEventListener('submit',e=>{e.preventDefault();show(el.querySelector('#urlinput').value)});el.querySelector('.url-entry button').addEventListener('click',e=>{e.preventDefault();if(form.reportValidity())show(el.querySelector('#urlinput').value)});notice.textContent='Illustrative model only: no DNS lookup, browser fetch, or packet transmission occurs. Routes, CDN choices, and negotiated protocols are examples; a URL does not reveal live network details.'
  }

};
