/* engine.js: pure simulation. simulate(scenario) returns an array of step snapshots; the UI only renders steps[i].
   scenario = {type:"open"|"close"|"udp"|"web", drop:n, delay:n, corrupt:{n,field:"ack"|"flags"}}  (n = packet number) */
function simulate(sc) {
  const S = {c: 'CLOSED', s: 'LISTEN', peer: 'Server', n: 0, steps: []};
  const key = who => who === 'client' ? 'c' : 's';
  const cap = t => t[0].toUpperCase() + t.slice(1);
  const push = o => S.steps.push(Object.assign({clientState: S.c, serverState: S.s, peer: S.peer, packet: null, quiz: null, why: ''}, o));
  const timeout = (who, what) => push({event: 'timeout',
    explanation: `${cap(who)} is still waiting for a reply to ${what}. Its retransmission timer (RTO) runs out, so it will send it again.`,
    why: 'Senders keep a timer for every unacknowledged packet. This is how TCP stays reliable on an unreliable network.'});

  // Sends one logical packet; handles loss, delay and corruption. Returns true if the exchange can continue.
  function tx(p) {
    let retrans = false, late = null;
    for (let t = 0; t < 4; t++) {
      const n = ++S.n, pk = {from: p.from, to: p.to, flags: p.flags, seq: p.seq, ack: p.ack, n, proto: p.proto || 'TCP', info: p.info, app: p.app};
      if (p.sState) S[key(p.from)] = p.sState;
      if (sc.drop === n) {
        push({event: 'dropped', packet: pk, explanation: `The ${p.flags} packet is lost on the way and never arrives.`,
          why: 'Routers drop packets when they are busy, and nobody tells the sender. It only notices the silence.'});
        if (p.udp) { push({event: 'timeout', explanation: 'UDP has no acknowledgements, so the sender is never told the datagram vanished and nothing is resent. Any retry would have to come from the application itself.', why: 'This is the price of UDP\'s speed: no setup, but no guarantees either.'}); return false; }
        if (p.onLoss) p.onLoss(); else timeout(p.from, `its ${p.flags}`);
        retrans = true; continue;
      }
      if (sc.delay === n && !p.udp) {
        push({event: 'delayed', packet: pk, explanation: `The ${p.flags} packet gets stuck in a slow part of the network.`,
          why: 'To the sender, a very late packet looks exactly like a lost one.'});
        timeout(p.from, `its ${p.flags}`); late = pk; retrans = true; continue;
      }
      if (sc.corrupt && sc.corrupt.n === n) {
        pk.bad = true;
        if (sc.corrupt.field === 'ack') pk.ack += 999; else pk.flags = p.flags === 'FIN' ? 'SYN' : 'FIN';
      }
      if (pk.bad && p.udp) {
        push({event: 'dropped', packet: pk, explanation: 'The datagram arrives damaged. UDP\'s checksum fails, so the receiver silently discards it and sends nothing back.', why: 'UDP detects damage but never reports or repairs it.'});
        return false;
      }
      if (pk.bad) {
        const why = sc.corrupt.field === 'ack' ? `its ack number (${pk.ack}) is not what the receiver expected (${p.ack})` : `a ${pk.flags} flag makes no sense in the receiver's current state`;
        push({event: 'delivered', packet: pk, explanation: `The packet arrives, but ${why}.`,
          why: 'Sequence and ack numbers are how TCP checks that a packet belongs to this conversation.'});
        const r = {from: p.to, to: p.from, flags: 'RST', seq: p.ack, ack: 0, n: ++S.n};
        S[key(p.to)] = p.to === 'server' ? 'LISTEN' : 'CLOSED'; S[key(p.from)] = 'CLOSED';
        push({event: 'reset', packet: r, explanation: `The ${p.to} rejects the packet and sends RST (reset). The half-open connection is torn down and the client ends up CLOSED. The connection failed.`,
          why: 'RST is TCP\'s emergency brake. It aborts at once, with no polite goodbye.'});
        return false;
      }
      if (p.rState) S[key(p.to)] = p.rState;
      push({event: retrans ? 'retransmit' : 'delivered', packet: pk, explanation: (retrans ? 'Retry: ' : '') + p.text, why: p.why, quiz: p.quiz || null});
      if (late) push({event: 'delivered', packet: Object.assign({}, late, {late: true}),
        explanation: 'The delayed original finally arrives. The receiver already handled this exchange, so it discards the duplicate.',
        why: 'Because delay looks like loss, TCP must be able to ignore duplicates.'});
      return true;
    }
    return false;
  }

  const inWeb = sc.type === 'web';
  const openFlow = () => {
    (inWeb ? () => {} : push)({event: 'sent', explanation: 'The client is CLOSED and the server is LISTENing on a port. No connection exists yet. Press Next or Play to open one.',
      why: 'Before any data can flow, both sides need to agree that a connection exists. That agreement is the three-way handshake.'});
    if (!tx({from: 'client', to: 'server', flags: 'SYN', seq: 1000, ack: 0, sState: 'SYN_SENT', rState: 'SYN_RCVD',
      text: 'The client asks to open a connection. It sends a SYN ("synchronize") carrying its starting sequence number, 1000. The server notes it and moves to SYN_RCVD.',
      why: 'Each side picks a starting sequence number so later data can be put in order.'})) return false;
    if (!tx({from: 'server', to: 'client', flags: 'SYN-ACK', seq: 5000, ack: 1001, rState: 'ESTABLISHED',
      text: 'The server agrees. SYN-ACK does two jobs: ack=1001 means "I got your 1000, send 1001 next", and seq=5000 is the server\'s own starting number. The client is now ESTABLISHED.',
      why: 'One packet both confirms the client\'s number and announces the server\'s.',
      quiz: {question: 'The server received SYN (seq=1000). What does it send back?', options: ['ACK only', 'SYN-ACK with ack=1001', 'FIN'], correctIndex: 1},
      onLoss: () => {
        timeout('client', 'its SYN');
        push({event: 'retransmit', packet: {from: 'client', to: 'server', flags: 'SYN', seq: 1000, ack: 0, n: ++S.n},
          explanation: 'The client resends its SYN with the same sequence number. The server, still in SYN_RCVD, recognises the duplicate and will answer again.',
          why: 'Retransmitted packets reuse the original sequence number, which is how the receiver spots duplicates.'});
      }})) return false;
    return tx({from: 'client', to: 'server', flags: 'ACK', seq: 1001, ack: 5001, rState: 'ESTABLISHED',
      text: 'The client confirms with ACK, ack=5001. Both sides are ESTABLISHED and can now send data.',
      why: 'Without this third packet the server could never be sure the client received its SYN-ACK.',
      quiz: {question: 'The client got the SYN-ACK. What completes the handshake?', options: ['A final ACK with ack=5001', 'Another SYN', 'Nothing, the server already knows'], correctIndex: 0}});
  };
  const closeFlow = (cs, ss) => {
    S.c = 'ESTABLISHED'; S.s = 'ESTABLISHED';
    push({event: 'sent', explanation: 'A connection is open and the client has finished sending its data. Now it will close the connection.',
      why: 'Each direction of a TCP connection is closed separately, which is why teardown takes four steps.'});
    if (!tx({from: 'client', to: 'server', flags: 'FIN', seq: cs, ack: ss, sState: 'FIN_WAIT_1', rState: 'CLOSE_WAIT',
      text: 'The client sends FIN: "I have nothing more to send." It moves to FIN_WAIT_1 and the server moves to CLOSE_WAIT.',
      why: 'FIN closes only the client-to-server direction. The server may still have data to send.'})) return false;
    if (!tx({from: 'server', to: 'client', flags: 'ACK', seq: ss, ack: cs + 1, rState: 'FIN_WAIT_2',
      text: 'The server acknowledges the FIN (ack=' + (cs + 1) + '). The client waits in FIN_WAIT_2 until the server is also done.',
      why: 'The ACK and the server\'s own FIN are separate, because the server might still be sending.',
      quiz: {question: 'The server received the client\'s FIN. What does it send first?', options: ['A FIN right away', 'An ACK', 'An RST'], correctIndex: 1}})) return false;
    if (!tx({from: 'server', to: 'client', flags: 'FIN', seq: ss, ack: cs + 1, sState: 'LAST_ACK', rState: 'TIME_WAIT',
      text: 'The server has finished too and sends its own FIN, moving to LAST_ACK. The client enters TIME_WAIT once it arrives.',
      why: 'Now both directions are closing.'})) return false;
    if (!tx({from: 'client', to: 'server', flags: 'ACK', seq: cs + 1, ack: ss + 1, rState: 'CLOSED',
      text: 'The client sends the last ACK (ack=' + (ss + 1) + '). The server receives it and is CLOSED. The client stays in TIME_WAIT.',
      why: 'The server is done, but the client can\'t be sure its last ACK arrived, so it waits.'})) return false;
    S.c = 'CLOSED';
    push({event: 'sent', explanation: 'After about two minutes (2 x MSL, twice the longest time a packet can live), TIME_WAIT ends and the client is CLOSED.',
      why: 'TIME_WAIT lets the client resend the last ACK if it was lost, and lets stray old packets die so they can\'t confuse a new connection on the same ports.',
      quiz: {question: 'Why does the client wait in TIME_WAIT before closing?', options: ['To resend the final ACK if lost and let old packets expire', 'The server asked it to wait', 'It is a leftover bug in TCP'], correctIndex: 0}});
    return true;
  };

  // ---- extra flows: DNS (UDP), live UDP call, HTTP over TCP, and the full website journey ----
  const dnsFlow = () => {
    S.peer = 'DNS server'; S.c = 'NO CONNECTION'; S.s = 'NO CONNECTION';
    push({event: 'sent', explanation: 'You type example.com into a browser. Computers route by IP address, so the first job is asking a DNS server for it. DNS uses UDP: no handshake, just one question and one answer.',
      why: 'Visiting a website is really several protocols working together. DNS comes first.'});
    if (!tx({from: 'client', to: 'server', flags: 'UDP', proto: 'DNS', udp: true, seq: 0, ack: 0, info: 'DNS query', app: 'Where is example.com?',
      text: 'The client sends one small UDP datagram to the DNS server: "What is the IP address of example.com?" There is no handshake first.',
      why: 'UDP skips setup, so a tiny question costs a single packet.'})) return false;
    return tx({from: 'server', to: 'client', flags: 'UDP', proto: 'DNS', udp: true, seq: 0, ack: 0, info: 'DNS answer', app: 'example.com = 93.184.216.34',
      text: 'The DNS server replies with the IP address, 93.184.216.34. The browser now knows where to connect.',
      why: 'Without an IP address the browser can go no further.',
      quiz: {question: 'Why is DNS usually sent over UDP instead of TCP?', options: ['A tiny question and answer does not need a handshake', 'UDP is more secure', 'TCP cannot carry text'], correctIndex: 0}});
  };
  const udpFlow = () => {
    S.peer = 'Call partner'; S.c = 'NO CONNECTION'; S.s = 'NO CONNECTION';
    push({event: 'sent', explanation: 'A live video call. The phone sends small chunks of audio as UDP datagrams. There is no handshake and no connection to set up.',
      why: 'Live media cares more about speed than perfection.'});
    for (let k = 1; k <= 3; k++) tx({from: 'client', to: 'server', flags: 'UDP', proto: 'UDP', udp: true, seq: 0, ack: 0, info: 'audio ' + k, app: 'audio chunk ' + k,
      text: `Audio chunk ${k} arrives and is played immediately. Nothing is acknowledged.`, why: 'No ACKs means the sender never waits.'});
    push({event: 'sent', explanation: 'The call carries on. If a chunk was lost you would hear a tiny glitch, but UDP never stops to resend it. No handshake, no ACKs, no retransmission.',
      why: 'TCP would have paused to resend the lost chunk, and the call would lag. For live audio, a late packet is worse than a missing one.',
      quiz: {question: 'A live call loses one audio packet. Which protocol suits it better?', options: ['UDP: a late packet is worse than a missing one', 'TCP: it never loses anything', 'Neither can work'], correctIndex: 0}});
    return true;
  };
  const httpFlow = () => tx({from: 'client', to: 'server', flags: 'PSH-ACK', proto: 'HTTP', seq: 1001, ack: 5001, app: 'GET /index.html',
      text: 'Over the open TCP connection the browser sends its HTTP request: GET /index.html. PSH tells the server to hand the data to the application right away.',
      why: 'HTTP rides on top of TCP and never has to worry about lost packets, because TCP handles that.',
      quiz: {question: 'Which protocol carries the HTTP request?', options: ['TCP, set up by the handshake', 'UDP', 'DNS'], correctIndex: 0}})
    && tx({from: 'server', to: 'client', flags: 'PSH-ACK', proto: 'HTTP', seq: 5001, ack: 1101, app: '200 OK + the web page',
      text: 'The server answers with the HTTP response: 200 OK and the page itself.', why: 'This is the actual content you asked for. Everything before it was setup.'})
    && tx({from: 'client', to: 'server', flags: 'ACK', seq: 1101, ack: 6461, text: 'The client acknowledges the page data (ack=6461). TCP guarantees it arrived complete and in order.',
      why: 'This is the reliability TCP adds on top of IP.'});
  const web = () => {
    if (!dnsFlow()) return;
    S.peer = 'Web server'; S.c = 'CLOSED'; S.s = 'LISTEN';
    push({event: 'sent', explanation: 'The browser has the IP address. HTTP needs a reliable connection, so it first opens a TCP connection to the web server.',
      why: 'DNS used UDP because the question was tiny. A web page needs TCP\'s reliability.'});
    if (openFlow() && httpFlow()) closeFlow(1101, 6461);
  };
  ({open: openFlow, close: () => closeFlow(1001, 5001), udp: udpFlow, web})[sc.type]();
  return S.steps;
}

