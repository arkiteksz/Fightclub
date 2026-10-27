const socket = io();
const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const GROUND = 620;
const COL = { kaan: '#e63946', zeynep: '#2ec4b6', demir: '#f4a261' };
const NAME = { kaan: 'KAAN', zeynep: 'ZEYNEP', demir: 'DEMİR' };
let chosen = 'kaan', me = -1, roomName = '', state = null, sparks = [];

document.querySelectorAll('#chars button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#chars button').forEach(x => x.classList.remove('sel'));
  b.classList.add('sel'); chosen = b.dataset.ch;
});
document.getElementById('join').onclick = () =>
  socket.emit('join', { room: document.getElementById('room').value, ch: chosen });
socket.on('joined', d => {
  me = d.slot; roomName = d.room;
  document.getElementById('lobby').hidden = true; cv.hidden = false;
});
socket.on('full', () => alert('Oda dolu, başka bir kod dene.'));
socket.on('s', s => {
  state = s;
  s.ev.forEach(e => sparks.push({ x: e.x, y: e.y, b: e.b, life: 12 }));
});

// --- Girdi ---
const MAP = { KeyW: 'u', KeyA: 'l', KeyD: 'r', KeyS: 'd', KeyI: 'i', KeyO: 'o', KeyP: 'p' };
const inp = { u: 0, l: 0, r: 0, d: 0, i: 0, o: 0, p: 0 };
function setKey(e, v) {
  const k = MAP[e.code];
  if (!k) return;
  e.preventDefault();
  if (inp[k] !== v) { inp[k] = v; socket.emit('input', inp); }
}
addEventListener('keydown', e => setKey(e, 1));
addEventListener('keyup', e => setKey(e, 0));
addEventListener('blur', () => { for (const k in inp) inp[k] = 0; socket.emit('input', inp); });

// --- Çizim ---
function drawPlayer(p, idx) {
  const h = p.cr ? 80 : 120, col = COL[p.ch];
  ctx.save();
  ctx.fillStyle = p.hs ? '#fff' : col;
  ctx.fillRect(p.x - 25, p.y - h, 50, h);
  ctx.beginPath(); ctx.arc(p.x, p.y - h - 14, 18, 0, 7); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.fillRect(p.x + p.f * 8 - 3, p.y - h - 20, 6, 6);
  const reach = p.ar || (p.ak ? 25 : 0);
  if (reach) {
    ctx.fillStyle = p.ar ? '#fff' : col;
    const x = p.f === 1 ? p.x + 15 : p.x - 15 - reach;
    ctx.fillRect(x, p.y - h + 25, reach, 16);
  }
  if (p.bl) {
    ctx.strokeStyle = '#4cc9f0'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(p.x + p.f * 20, p.y - 60, 55, p.f === 1 ? -1.2 : Math.PI - 1.2, p.f === 1 ? 1.2 : Math.PI + 1.2);
    ctx.stroke();
  }
  if (idx === me) { ctx.fillStyle = '#ffd60a'; ctx.fillText('▼ SEN', p.x - 22, p.y - h - 44); }
  ctx.restore();
}

function drawBar(p, idx) {
  const w = 480, x = idx === 0 ? 40 : 1280 - 40 - w, y = 30;
  ctx.fillStyle = '#333'; ctx.fillRect(x, y, w, 26);
  const pct = p.hp / p.mhp;
  ctx.fillStyle = pct > 0.3 ? '#4ade80' : '#ef4444';
  const bw = w * pct;
  ctx.fillRect(idx === 0 ? x : x + w - bw, y, bw, 26);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 18px system-ui';
  ctx.textAlign = idx === 0 ? 'left' : 'right';
  ctx.fillText(NAME[p.ch], idx === 0 ? x : x + w, y + 48);
}

function big(t, y = 340, size = 80) {
  ctx.textAlign = 'center'; ctx.font = `bold ${size}px system-ui`;
  ctx.fillStyle = '#000'; ctx.fillText(t, 642, y + 3);
  ctx.fillStyle = '#fff'; ctx.fillText(t, 640, y);
}

function draw() {
  requestAnimationFrame(draw);
  if (!state) return;
  const g = ctx.createLinearGradient(0, 0, 0, 720);
  g.addColorStop(0, '#1b1b3a'); g.addColorStop(1, '#3a1c4a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1280, 720);
  ctx.fillStyle = '#222'; ctx.fillRect(0, GROUND, 1280, 100);
  ctx.fillStyle = '#555'; ctx.fillRect(0, GROUND, 1280, 4);
  ctx.font = 'bold 16px system-ui'; ctx.textAlign = 'left';
  state.p.forEach((p, i) => { if (p) { drawPlayer(p, i); drawBar(p, i); } });
  ctx.fillStyle = '#ffb703';
  state.pr.forEach(q => { ctx.beginPath(); ctx.arc(q.x, q.y, 16, 0, 7); ctx.fill(); });
  sparks = sparks.filter(s => --s.life > 0);
  sparks.forEach(s => {
    ctx.strokeStyle = s.b ? '#4cc9f0' : '#ffd60a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(s.x, s.y, 30 - s.life * 1.5, 0, 7); ctx.stroke();
  });
  if (state.ph === 'wait') { big('Rakip bekleniyor...', 340, 48); ctx.font = '22px system-ui'; ctx.fillText('Oda kodu: ' + roomName, 640, 390); }
  if (state.ph === 'count') big(state.cd > 0 ? state.cd : 'DÖVÜŞ!');
  if (state.ph === 'over') big(state.w < 0 ? 'BERABERE' : (state.w === me ? 'KAZANDIN!' : 'KAYBETTİN'));
}
draw();
