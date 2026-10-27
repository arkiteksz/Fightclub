const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(__dirname + '/public'));

const W = 1280, GROUND = 620, GRAV = 0.9;
const CHARS = {
  kaan:   { speed: 5,   jump: 17, hp: 100, mul: 1,    sp: 'proj' },
  zeynep: { speed: 7,   jump: 19, hp: 85,  mul: 0.85, sp: 'rush' },
  demir:  { speed: 3.6, jump: 15, hp: 130, mul: 1.25, sp: 'rise' },
};
// s: startup, a: active, r: recovery, d: hasar, rng: menzil, kb: geri itme, st: hitstun
const MOVES = {
  l:    { s: 4,  a: 3,  r: 8,  d: 5,  rng: 70,  kb: 4,  st: 12 },
  m:    { s: 8,  a: 4,  r: 14, d: 9,  rng: 90,  kb: 7,  st: 18 },
  h:    { s: 14, a: 5,  r: 22, d: 16, rng: 110, kb: 12, st: 26 },
  proj: { s: 12, a: 1,  r: 24, d: 8,  rng: 0,   kb: 6,  st: 16 },
  rush: { s: 6,  a: 10, r: 18, d: 10, rng: 70,  kb: 8,  st: 20 },
  rise: { s: 5,  a: 8,  r: 26, d: 14, rng: 60,  kb: 5,  st: 30, launch: true },
};
const KEYS = { i: 'l', o: 'm', p: 'h' };

const rooms = {};
const newRoom = () => ({ slots: [null, null], ph: 'wait', t: 0, pr: [], ev: [], winner: -1 });

function resetRound(r) {
  r.slots.forEach((p, i) => {
    if (!p) return;
    Object.assign(p, { x: i ? 880 : 400, y: GROUND, vx: 0, vy: 0, face: i ? -1 : 1,
      hp: CHARS[p.ch].hp, stun: 0, atk: null, cd: 0, downT: 0, motionT: 0,
      block: false, crouch: false, ar: 0, prev: {} });
  });
  r.pr = []; r.t = 0; r.winner = -1; r.ph = 'count';
}

function hit(dir, o, m, dmg, r) {
  if (o.hp <= 0) return;
  const blocked = o.block && o.stun <= 0 && !o.atk && o.y >= GROUND;
  o.hp = Math.max(0, o.hp - (blocked ? Math.ceil(dmg * 0.2) : dmg));
  o.stun = blocked ? Math.floor(m.st / 2) : m.st;
  o.atk = null;
  o.vx = dir * m.kb * (blocked ? 0.6 : 1);
  if (m.launch && !blocked) { o.vy = -11; o.y -= 2; }
  r.ev.push({ x: o.x, y: o.y - 70, b: blocked ? 1 : 0 });
}

function startAtk(p, k) {
  p.atk = { k, f: 0, hit: false };
  if (k === 'rise') p.vy = -14;
}

function runAtk(p, o, slot, r) {
  const a = p.atk, m = MOVES[a.k], c = CHARS[p.ch];
  const grounded = p.y >= GROUND;
  a.f++;
  const active = a.f > m.s && a.f <= m.s + m.a;
  if (a.k === 'rush') p.vx = a.f <= m.s + m.a ? p.face * 14 : 0;
  else if (a.k === 'rise') p.vx = p.face * 3;
  else if (grounded) p.vx = 0;
  if (active && m.rng) p.ar = m.rng;
  const dmg = Math.round(m.d * c.mul);
  if (a.k === 'proj') {
    if (a.f === m.s) r.pr.push({ x: p.x + p.face * 40, y: p.y - 80, vx: p.face * 10, o: slot, d: dmg });
  } else if (active && !a.hit) {
    const x1 = p.x + p.face * 20, x2 = p.x + p.face * (20 + m.rng);
    const overlapX = Math.min(Math.max(x1, x2), o.x + 25) - Math.max(Math.min(x1, x2), o.x - 25) > 0;
    if (overlapX && Math.abs(p.y - o.y) < 90) { a.hit = true; hit(p.face, o, m, dmg, r); }
  }
  if (a.f >= m.s + m.a + m.r) p.atk = null;
}

function update(p, o, slot, r, live) {
  const c = CHARS[p.ch], inp = live ? p.inp : {}, pv = p.prev;
  p.ar = 0;
  const grounded = p.y >= GROUND;
  if (p.cd > 0) p.cd--;
  if (p.hp <= 0) { p.atk = null; p.stun = 0; p.vx *= 0.9; p.block = false; p.crouch = false; }
  else if (p.stun > 0) { p.stun--; p.vx *= 0.88; p.atk = null; p.block = false; }
  else if (p.atk) { runAtk(p, o, slot, r); }
  else {
    if (grounded) p.face = o.x >= p.x ? 1 : -1;
    const fwd = p.face === 1 ? inp.r : inp.l, back = p.face === 1 ? inp.l : inp.r;
    const fwdPrev = p.face === 1 ? pv.r : pv.l;
    p.crouch = grounded && !!inp.d;
    p.block = grounded && !!back && !fwd;
    if (inp.d) p.downT = 20; else if (p.downT > 0) p.downT--;
    if (fwd && !fwdPrev && p.downT > 0) p.motionT = 20; else if (p.motionT > 0) p.motionT--;
    p.vx = p.crouch ? 0 : ((inp.r ? 1 : 0) - (inp.l ? 1 : 0)) * c.speed;
    if (inp.u && grounded && !p.crouch) p.vy = -c.jump;
    for (const key in KEYS) {
      if (inp[key] && !pv[key]) {
        if (p.motionT > 0 && p.cd <= 0) { startAtk(p, c.sp); p.cd = 45; p.motionT = 0; }
        else startAtk(p, KEYS[key]);
        break;
      }
    }
  }
  p.x += p.vx; p.vy += GRAV; p.y += p.vy;
  if (p.y >= GROUND) { p.y = GROUND; p.vy = 0; }
  p.x = Math.max(40, Math.min(W - 40, p.x));
  p.prev = Object.assign({}, inp);
}

function tick(r) {
  if (r.ph === 'count') { if (++r.t >= 180) { r.ph = 'fight'; r.t = 0; } }
  else if (r.ph === 'over') { if (++r.t >= 300) resetRound(r); }
  if (r.ph !== 'fight' && r.ph !== 'over') return;
  const [a, b] = r.slots, live = r.ph === 'fight';
  update(a, b, 0, r, live); update(b, a, 1, r, live);
  const dx = b.x - a.x;
  if (Math.abs(dx) < 50 && Math.abs(a.y - b.y) < 100) {
    const push = (50 - Math.abs(dx)) / 2 * (dx >= 0 ? 1 : -1);
    a.x = Math.max(40, a.x - push); b.x = Math.min(W - 40, b.x + push);
  }
  r.pr = r.pr.filter(pr => {
    pr.x += pr.vx;
    if (pr.x < -50 || pr.x > W + 50) return false;
    const t = r.slots[1 - pr.o];
    if (Math.abs(pr.x - t.x) < 35 && pr.y > t.y - 120 && pr.y < t.y) {
      hit(Math.sign(pr.vx), t, MOVES.proj, pr.d, r); return false;
    }
    return true;
  });
  if (live && (a.hp <= 0 || b.hp <= 0)) {
    r.ph = 'over'; r.t = 0;
    r.winner = a.hp <= 0 && b.hp <= 0 ? -1 : (a.hp <= 0 ? 1 : 0);
  }
}

function snap(r) {
  return {
    ph: r.ph, cd: Math.ceil((180 - r.t) / 60), w: r.winner,
    p: r.slots.map(p => p && { x: p.x, y: p.y, f: p.face, hp: p.hp, mhp: CHARS[p.ch].hp, ch: p.ch,
      cr: p.crouch, bl: p.block && p.stun <= 0, hs: p.stun > 0, ak: p.atk ? p.atk.k : null, ar: p.ar }),
    pr: r.pr.map(q => ({ x: q.x, y: q.y })),
    ev: r.ev,
  };
}

function leave(s) {
  const d = s.data;
  if (!d || !d.room) return;
  const r = rooms[d.room];
  if (r) {
    r.slots[d.slot] = null; s.leave(d.room);
    if (r.slots.every(x => !x)) delete rooms[d.room];
    else { resetRound(r); r.ph = 'wait'; }
  }
  s.data = {};
}

io.on('connection', socket => {
  socket.data = {};
  socket.on('join', d => {
    leave(socket);
    const name = String((d && d.room) || 'ana').trim().slice(0, 16) || 'ana';
    const ch = d && CHARS[d.ch] ? d.ch : 'kaan';
    const r = rooms[name] || (rooms[name] = newRoom());
    const i = r.slots.findIndex(s => !s);
    if (i < 0) return socket.emit('full');
    r.slots[i] = { id: socket.id, ch, inp: {} };
    socket.data = { room: name, slot: i };
    socket.join(name);
    resetRound(r);
    if (!r.slots.every(Boolean)) r.ph = 'wait';
    socket.emit('joined', { slot: i, room: name });
  });
  socket.on('input', inp => {
    const d = socket.data, r = d && rooms[d.room];
    if (!r || !r.slots[d.slot] || typeof inp !== 'object' || !inp) return;
    const p = r.slots[d.slot];
    p.inp = { u: !!inp.u, l: !!inp.l, r: !!inp.r, d: !!inp.d, i: !!inp.i, o: !!inp.o, p: !!inp.p };
  });
  socket.on('disconnect', () => leave(socket));
});

setInterval(() => {
  for (const name in rooms) {
    const r = rooms[name];
    tick(r);
    io.to(name).emit('s', snap(r));
    r.ev = [];
  }
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Sunucu: http://localhost:' + PORT));
