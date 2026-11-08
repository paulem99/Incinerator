'use strict';
// The Incinerator: pixel player renderer. Everything is drawn into a 300x268 pixel buffer.
const API = window.incin;
const OW = 300, OH = 268;
const cv = document.getElementById('c'), cx = cv.getContext('2d'), img = cx.createImageData(OW, OH), B = img.data;

// ---------- seeded random + noise ----------
let sd = 11; const R = () => (sd = sd * 16807 % 2147483647) / 2147483647;
const P = { rd: [34, 16, 9], r1: [84, 37, 18], r2: [124, 56, 25], r3: [163, 80, 36], r4: [196, 108, 50], s2: [64, 62, 58], s3: [96, 92, 86], s4: [134, 128, 118], hi: [176, 168, 152] };
const sc = (c, s) => [c[0] * s, c[1] * s, c[2] * s];
function VN(w, h, cell) { const gw = Math.ceil(w / cell) + 2, g = []; for (let i = 0; i < gw * (Math.ceil(h / cell) + 2); i++) g.push(R()); return (x, y) => { const fx = x / cell, fy = y / cell, ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy, a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1]; return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty; }; }
function metal(n, f) { const r = n * 0.8 + f * 0.3; if (r > 0.66) return f > 0.6 ? P.r4 : f > 0.3 ? P.r3 : P.r2; if (r > 0.5) return f > 0.5 ? P.r2 : P.r1; return f > 0.75 ? P.s4 : f > 0.35 ? P.s3 : P.s2; }
const hsh = (a, b, c, d) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177) ^ Math.imul(d | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const oput = (x, y, c) => { if (x < 0 || y < 0 || x >= OW || y >= OH) return; const o = (y * OW + x) * 4; B[o] = c[0]; B[o + 1] = c[1]; B[o + 2] = c[2]; };
const shade = (x, y, f) => { if (x < 0 || y < 0 || x >= OW || y >= OH) return; const o = (y * OW + x) * 4; B[o] *= f; B[o + 1] *= f; B[o + 2] *= f; };
const clearAll = () => { B.fill(0); for (let i = 3; i < B.length; i += 4) B[i] = 255; };
const BL = [[58, 4, 6], [92, 8, 10], [124, 12, 14], [152, 22, 22]];

// ---------- Bloodrose-style pixel font ----------
const BFR = { A: ".111.,11.11,11.11,11.11,11111,11.11,11.11,11.11,11.11", B: "1111.,11.11,11.11,11.11,1111.,11.11,11.11,11.11,1111.", C: ".1111,11..1,11...,11...,11...,11...,11...,11..1,.1111", D: "1111.,11.11,11.11,11.11,11.11,11.11,11.11,11.11,1111.", E: "11111,11..1,11...,11.1.,1111.,11.1.,11...,11..1,11111", F: "11111,11..1,11...,11.1.,1111.,11.1.,11...,11...,111..", G: ".1111,11..1,11...,11...,11.11,11.11,11.11,11.11,.1111", H: "11.11,11.11,11.11,11.11,11111,11.11,11.11,11.11,11.11", I: "1111,.11.,.11.,.11.,.11.,.11.,.11.,.11.,1111", J: ".111,..11,..11,..11,..11,..11,..11,1.11,.11.", K: "11.11,11.11,11.1.,111..,11...,111..,11.1.,11.11,11.11", L: "11...,11...,11...,11...,11...,11...,11...,11..1,11111", M: "11...11,111.111,1111111,11.1.11,11.1.11,11...11,11...11,11...11,11...11", N: "11..11,111.11,111.11,11.111,11.111,11..11,11..11,11..11,11..11", O: ".111.,11.11,11.11,11.11,11.11,11.11,11.11,11.11,.111.", P: "1111.,11.11,11.11,11.11,1111.,11...,11...,11...,111..", Q: ".111.,11.11,11.11,11.11,11.11,11.11,11.11,11.1.,.11.1", R: "1111.,11.11,11.11,11.11,1111.,11.1.,11.11,11.11,11.11", S: ".1111,11..1,11...,111..,.111.,..111,...11,1..11,1111.", T: "111111,1.11.1,..11..,..11..,..11..,..11..,..11..,..11..,.1111.", U: "11.11,11.11,11.11,11.11,11.11,11.11,11.11,11.11,.111.", V: "11.11,11.11,11.11,11.11,11.11,11.11,.111.,.111.,..1..", W: "11...11,11...11,11...11,11.1.11,11.1.11,1111111,111.111,11...11,1.....1", X: "11.11,11.11,.111.,.111.,..1..,.111.,.111.,11.11,11.11", Y: "11..11,11..11,11..11,.1111.,..11..,..11..,..11..,..11..,.1111.", Z: "11111,1..11,...11,..11.,.11..,.11..,11...,11..1,11111", "0": ".111.,11.11,11.11,11.11,11.11,11.11,11.11,11.11,.111.", "1": ".11.,111.,.11.,.11.,.11.,.11.,.11.,.11.,1111", "2": ".111.,11.11,...11,...11,..11.,.11..,11...,11..1,11111", "3": "1111.,...11,...11,...11,.111.,...11,...11,...11,1111.", "4": "...11,..111,.1.11,1..11,11111,...11,...11,...11,..111", "5": "11111,11...,11...,1111.,...11,...11,...11,...11,1111.", "6": ".111.,11...,11...,1111.,11.11,11.11,11.11,11.11,.111.", "7": "11111,1..11,...11,..11.,..11.,.11..,.11..,.11..,.11..", "8": ".111.,11.11,11.11,11.11,.111.,11.11,11.11,11.11,.111.", "9": ".111.,11.11,11.11,11.11,.1111,...11,...11,...11,.111.", ":": "..,..,11,11,..,..,11,11,..", "/": "...1,...1,..11,..1.,.11.,.1..,11..,1...,1...", "-": "....,....,....,....,1111,....,....,....,....", ".": "..,..,..,..,..,..,..,11,11", " ": "...,...,...,...,...,...,...,...,...", "&": ".11..,1..1.,1..1.,.11..,.11.1,1..1.,1..1.,1..11,.11.1", "'": "11,11,1.,..,..,..,..,..,..", "\"": "11.11,11.11,1..1.,.....,.....,.....,.....,.....,.....", "(": "..11,.11.,11..,11..,11..,11..,11..,.11.,..11", ")": "11..,.11.,..11,..11,..11,..11,..11,.11.,11..", "!": "11,11,11,11,11,11,..,11,11", "?": ".111.,11.11,...11,..11.,.11..,.11..,.....,.11..,.11..", ",": "..,..,..,..,..,..,..,11,.1", ";": "..,..,11,11,..,..,11,11,.1", "+": "......,......,..11..,..11..,111111,111111,..11..,..11..,......", "#": ".1.1.,.1.1.,11111,.1.1.,.1.1.,11111,.1.1.,.1.1.,.....", "<": "...1,..11,.11.,11..,1...,11..,.11.,..11,...1", ">": "1...,11..,.11.,..11,...1,..11,.11.,11..,1...", "*": ".....,1.1.1,.111.,11111,.111.,1.1.1,.....,.....,.....", "=": "....,....,....,1111,....,1111,....,....,....", "_": "....,....,....,....,....,....,....,....,1111", "%": "11..1,11.11,...1.,..11.,..1..,.11..,.1...,11.11,1..11", "$": "..1..,.1111,111..,111..,.111.,..111,..111,1111.,..1..", "[": "111,11.,11.,11.,11.,11.,11.,11.,111", "]": "111,.11,.11,.11,.11,.11,.11,.11,111", "@": ".111.,1...1,1.111,1.1.1,1.111,1....,.111.,.....,....." };
const BF = {}; for (const k in BFR) BF[k] = BFR[k].split(',');
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-');
const glyph = (ch) => BF[ch] || BF['?'];
const bw = (str, s) => { let t = 0; for (const ch of str) t += (glyph(ch)[0].length + 1) * s; return Math.max(0, t - s); };
function bt(pl, str, x, y, s, col, o) {
  o = o || {}; const sh = o.sh, c0 = o.c0 ?? -1e9, c1 = o.c1 ?? 1e9, so = s > 1 ? s - 1 : 1, dk = s > 1 ? sc(col, 0.72) : col;
  for (const ch of str) {
    const g = glyph(ch), w = g[0].length;
    if (x > c1) break;
    if (x + w * s >= c0) {
      const plot = (px, py, c) => { if (px >= c0 && px < c1) pl(px, py, c); };
      if (sh) for (let r = 0; r < 9; r++) for (let c = 0; c < w; c++) if (g[r][c] === '1') for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) plot(x + c * s + a + so, y + r * s + b + so, sh);
      for (let r = 0; r < 9; r++) for (let c = 0; c < w; c++) if (g[r][c] === '1') { const edge = c === 0 || g[r][c - 1] !== '1'; for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) plot(x + c * s + a, y + r * s + b, edge && a === 0 ? dk : col); }
    }
    x += (w + 1) * s;
  }
}

// ---------- layout ----------
const SX = 27, SY = 25, SW = 158, SH = 98, BZ = 7, bx0 = SX - BZ, by0 = SY - BZ, bx1 = SX + SW + BZ, by1 = SY + SH + BZ;
const DX0 = 59, DY0 = 35, DW = 92, DH = 78, HW = 46, VOID = [4, 3, 3];
const DRX0 = 22, DRX1 = 190, DRW = DRX1 - DRX0, DRY = 137, DRH = 16, TRAYH = 104, RH = 11, ROWS = 7, SHW = DRW - 6;
const DECO = [160, 183, 206, 229];
const IX0 = 205, IX1 = 287, IY0 = 40, IY1 = 252, HX0 = 216, HX1 = 277, HY0 = 56, HY1 = 108, CX0 = 220, CX1 = 273, CY0 = 60, CY1 = 104, FW = CX1 - CX0, FH = CY1 - CY0, FLX0 = 238, FLX1 = 255, GX = 246, GY = 127, ASH0 = 196;
const WBY = 10, WBMIN = 262, WBCLOSE = 276, WBS = 11;

// ---------- dissolve order ----------
const OBW = OW / 2, operm = [...Array(OBW * (OH / 2)).keys()]; for (let i = operm.length - 1; i > 0; i--) { const j = R() * (i + 1) | 0; [operm[i], operm[j]] = [operm[j], operm[i]]; }
const obr = new Float32Array(operm.length); operm.forEach((b, k) => obr[b] = k / operm.length); const orank = (x, y) => obr[(y >> 1) * OBW + (x >> 1)];

// ---------- tile wall ----------
const TS = 8, TC = Math.ceil(OW / TS), TRW = Math.ceil(OH / TS), tv = []; for (let i = 0; i < TC * TRW; i++) { const b = 176 + R() * 18, k = R(); tv.push(k < 0.15 ? [b, b - 6, b - 28] : k < 0.25 ? [b - 10, b - 2, b - 8] : [b, b - 1, b - 6]); }
const tile = new Array(OW * OH), tn = VN(OW, OH, 14);
for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) { const gx = x % TS, gy = y % TS; let c; if (gx === TS - 1 || gy === TS - 1) c = [74, 71, 64]; else { const v = tv[((y / TS) | 0) * TC + ((x / TS) | 0)], e = (gx === 0 || gy === 0) ? 14 : (gx === TS - 2 || gy === TS - 2) ? -12 : 0, n = (R() - 0.5) * 10; c = [v[0] + e + n, v[1] + e + n, v[2] + e + n]; } const dx = (x - OW * 0.42) / (OW * 0.6), dy = (y - OH * 0.28) / (OH * 0.85), L = Math.max(0.3, 1.02 - (dx * dx + dy * dy) * 0.95); tile[y * OW + x] = sc(c, (0.6 + 0.4 * tn(x, y)) * L); }
const tset = (x, y, c) => { if (x >= 0 && y >= 0 && x < OW && y < OH) tile[y * OW + x] = c; }, tget = (x, y) => tile[y * OW + x];
for (let k = 0; k < 26; k++) { const x = R() * OW | 0, y0 = R() * OH * 0.6 | 0, len = 10 + (R() * 40 | 0); for (let j = 0; j < len && y0 + j < OH; j++) { const y = y0 + j, c = tget(x, y), f = 0.82 + 0.1 * (j / len); tset(x, y, [c[0] * f, c[1] * f * 0.96, c[2] * f * 0.85]); if (R() < 0.4 && x + 1 < OW) { const c2 = tget(x + 1, y); tset(x + 1, y, [c2[0] * 0.9, c2[1] * 0.88, c2[2] * 0.8]); } } }
for (let k = 0; k < 14; k++) { const x0 = (R() * TC | 0) * TS + 1, y0 = (R() * TRW | 0) * TS + 1, dir = R() < 0.5; for (let j = 0; j < 6; j++) { const x = dir ? x0 + j : x0 + 5 - j, y = y0 + j; if (x < OW && y < OH) tset(x, y, sc(tget(x, y), 0.45)); } }
const tsplat = (x0, y0, r) => { for (let y = -r - 2; y <= r + 2; y++) for (let x = -r - 2; x <= r + 2; x++) { const d = Math.hypot(x, y) + (R() - 0.5) * 1.6; if (d < r) tset(x0 + x, y0 + y, d < r * 0.5 ? BL[1] : BL[R() < 0.5 ? 2 : 1]); else if (d < r + 2 && R() < 0.15) tset(x0 + x, y0 + y, BL[2]); } };
const tdrip = (x, y, len) => { for (let j = 0; j < len; j++) tset(x, y + j, BL[R() < 0.3 ? 2 : 1]); tset(x, y + len, BL[0]); tset(x + 1, y + len, BL[0]); };
tsplat(12, 80, 3); tdrip(10, 82, 16); tdrip(13, 83, 9); for (let k = 0; k < 14; k++) tset(8 + (R() * 11 | 0), 60 + (R() * 50 | 0), BL[R() < 0.5 ? 2 : 3]);
tdrip(198, 40, 14); tdrip(201, 44, 8); for (let k = 0; k < 8; k++) tset(194 + (R() * 10 | 0), 30 + (R() * 30 | 0), BL[R() < 0.5 ? 2 : 3]);
tsplat(13, 200, 3); tdrip(11, 203, 14); tdrip(15, 204, 8); for (let k = 0; k < 10; k++) tset(120 + (R() * 40 | 0), 9 + (R() * 8 | 0), BL[R() < 0.5 ? 2 : 3]);
tdrip(196, 150, 18); tdrip(199, 156, 9); tdrip(290, 240, 12);
tdrip(SX + 40, by1, 5); tdrip(SX + 44, by1, 3); tdrip(SX + 121, by1, 6);
function drawTile(v) { for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) if (!v || v(orank(x, y))) oput(x, y, tile[y * OW + x]); }

// ---------- intro door ----------
const door = [], dn = VN(DW, DH, 8), streak = []; for (let x = 0; x < DW; x++) streak.push(R() < 0.22 ? [(R() * DH) | 0, 4 + (R() * 14 | 0)] : null);
for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) { let n = dn(x, y); const f = R(), hx = x % HW, st = streak[x]; if (st && y >= st[0] && y < st[0] + st[1]) n += 0.4; let s = 1; if (hx < 2 || hx > HW - 3 || y < 2 || y > DH - 3) s = 0.62; for (const b of [24, 50]) { if (y >= b && y < b + 4) s = y === b ? 1.3 : y === b + 3 ? 0.5 : 1.08; } door.push(sc(metal(n, f), s)); }
const dset = (x, y, c) => { if (x >= 0 && x < DW && y >= 0 && y < DH) door[y * DW + x] = c; };
const rivet = (set, x, y) => { set(x, y, P.hi); set(x + 1, y, P.s3); set(x, y + 1, P.s3); set(x + 1, y + 1, P.rd); };
for (let k = 0; k < 9; k++) { const x = R() * DW | 0, y = R() * DH | 0, l = 3 + (R() * 6 | 0); for (let j = 0; j < l; j++) dset(x + j, y + (j >> 1), P.s4); }
for (const h0 of [0, HW]) { for (let y = 5; y < DH - 4; y += 8) { rivet(dset, h0 + 3, y); rivet(dset, h0 + HW - 5, y); } for (const b of [24, 50]) for (let x = 8; x < HW - 8; x += 7) rivet(dset, h0 + x, b + 1); }
function splat(x0, y0, r) { for (let y = -r - 2; y <= r + 2; y++) for (let x = -r - 2; x <= r + 2; x++) { const d = Math.hypot(x, y) + (R() - 0.5) * 1.6; if (d < r) dset(x0 + x, y0 + y, d < r * 0.5 ? BL[1] : BL[R() < 0.5 ? 2 : 1]); else if (d < r + 2 && R() < 0.15) dset(x0 + x, y0 + y, BL[2]); } for (let k = 0; k < 7; k++) { const a = R() * 6.28, dd = r + 2 + R() * 6; dset(x0 + Math.round(Math.cos(a) * dd), y0 + Math.round(Math.sin(a) * dd), BL[R() < 0.5 ? 2 : 3]); } }
function drip(x, y, len) { for (let j = 0; j < len; j++) dset(x, y + j, BL[R() < 0.3 ? 2 : 1]); dset(x, y + len, BL[0]); dset(x + 1, y + len, BL[0]); dset(x, y + len + 1, BL[0]); }
splat(16, 34, 4); drip(13, 37, 14); drip(17, 38, 22); drip(20, 36, 9); splat(45, 18, 3); drip(43, 20, 12); drip(47, 20, 17); for (let k = 0; k < 10; k++) dset(50 + (R() * 14 | 0), 12 + (R() * 12 | 0), BL[R() < 0.5 ? 2 : 3]);
drip(30, 2, 8); drip(78, 2, 11); drip(57, 2, 5); splat(80, 66, 2); drip(79, 68, 8); drip(82, 67, 6);
const hx0 = 62, hy0 = 40; [[1, 1], [3, 0], [5, 0], [7, 1]].forEach(([fx, ft]) => { for (let y = ft; y < 4; y++) if (R() > 0.12) dset(hx0 + fx, hy0 + y, BL[2]); });
for (let y = 4; y < 9; y++) for (let x = 1; x < 8; x++) { if (y === 8 && (x === 1 || x === 7)) continue; if (R() > 0.1) dset(hx0 + x, hy0 + y, R() < 0.25 ? BL[1] : BL[2]); }
[[0, 5], [0, 6], [-1, 4], [-1, 3]].forEach(([x, y]) => dset(hx0 + x, hy0 + y, BL[2]));
for (let x = 1; x < 8; x++) { const len = 4 + (R() * 11 | 0); for (let j = 0; j < len; j++) if (R() > j / len * 0.7) dset(hx0 + x, hy0 + 9 + j, j > len * 0.6 ? BL[0] : BL[1]); }
for (let y = 0; y < DH; y++) { dset(HW - 1, y, P.rd); dset(HW, y, [14, 8, 5]); }
for (let y = 32; y < 46; y++) { const e = y === 32 || y === 45; dset(HW - 6, y, e ? P.rd : P.hi); dset(HW - 5, y, P.rd); dset(HW + 4, y, e ? P.rd : P.hi); dset(HW + 5, y, P.rd); }
const frm = new Map(), fset = (x, y, c) => frm.set(y * OW + x, c), fn = VN(OW, OH, 6);
for (let y = DY0 - 5; y < DY0 + DH + 5; y++) for (let x = DX0 - 5; x < DX0 + DW + 5; x++) { if (x >= DX0 && x < DX0 + DW && y >= DY0 && y < DY0 + DH) continue; const inner = x === DX0 - 1 || x === DX0 + DW || y === DY0 - 1 || y === DY0 + DH, outer = x === DX0 - 5 || x === DX0 + DW + 4 || y === DY0 - 5 || y === DY0 + DH + 4; fset(x, y, sc(metal(fn(x, y) * 0.9, R()), inner ? 0.4 : outer ? 0.55 : 0.85)); }
for (let x = DX0 - 1; x < DX0 + DW + 2; x += 9) { rivet(fset, x, DY0 - 3); rivet(fset, x, DY0 + DH + 2); } for (let y = DY0 + 4; y < DY0 + DH; y += 9) { rivet(fset, DX0 - 3, y); rivet(fset, DX0 + DW + 1, y); }
function drawDoor(open, shx, v) { const off = Math.round(open * HW); for (let y = DY0 - 5; y < DY0 + DH + 5; y++) for (let x = DX0 - 5; x < DX0 + DW + 5; x++) { if (v && !v(orank(x, y))) continue; let c = frm.get(y * OW + x); if (!c) { const lx = x - DX0 - shx, dy = (y - DY0) * DW; let sx = lx + off; if (sx >= 0 && sx < HW) c = door[dy + sx]; else { sx = lx - off; c = (sx >= HW && sx < DW) ? door[dy + sx] : VOID; } } oput(x, y, c); }
  for (let y = DY0 - 3; y < DY0 + DH + 7; y++) for (const x of [DX0 + DW + 5, DX0 + DW + 6]) if (!v || v(orank(x, y))) shade(x, y, 0.55); for (let x = DX0 - 3; x < DX0 + DW + 5; x++) for (const y of [DY0 + DH + 5, DY0 + DH + 6]) if (!v || v(orank(x, y))) shade(x, y, 0.55); }

// ---------- player border (cold steel, rust, blood) ----------
const bmap = new Map(), rn = VN(OW, OH, 7), rowO = [], colO = []; for (let i = 0; i < OW; i++) colO.push(R()); for (let i = 0; i < OH; i++) rowO.push(R());
const STEEL = [[104, 110, 118], [136, 143, 152], [170, 177, 187]], bset = (x, y, c) => bmap.set(y * OW + x, c), ring = (x, y) => Math.max(SX - 1 - x, x - (SX + SW), SY - 1 - y, y - (SY + SH));
for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) { if (x >= SX && x < SX + SW && y >= SY && y < SY + SH) continue; const dl = SX - 1 - x, dr = x - (SX + SW), dt = SY - 1 - y, db = y - (SY + SH), k = Math.max(dl, dr, dt, db), lt = (k === dl || k === dt) && !(k === dr || k === db), hz = k === dt || k === db; let c;
  if (k === 0) c = lt ? [14, 15, 18] : [56, 60, 66]; else if (k === 1) c = lt ? [20, 22, 26] : [196, 202, 210]; else if (k === BZ - 1) c = lt ? [228, 234, 242] : [24, 26, 30];
  else { const v = (hz ? rowO[y] : colO[x]) * 0.65 + R() * 0.35; c = STEEL[Math.min(2, v * 3 | 0)]; const m = rn(x, y) + (db > 0 ? 0.15 : 0) + R() * 0.12; if (m > 0.75) c = R() < 0.5 ? P.r3 : P.r2; else if (m > 0.68) c = R() < 0.5 ? P.r1 : P.r2; } bset(x, y, c); }
const bolt = (set, x, y, rk) => { set(x, y - 1, [160, 166, 174]); set(x - 1, y, [160, 166, 174]); set(x, y, [228, 234, 242]); set(x + 1, y, [56, 60, 66]); set(x, y + 1, [56, 60, 66]); set(x - 1, y - 1, [74, 78, 86]); set(x + 1, y + 1, [30, 32, 36]); if (rk && R() < 0.85) { const k2 = ring(x, y + 2); if (k2 >= 2 && k2 <= BZ - 2) set(x, y + 2, P.r2); const k3 = ring(x, y + 3); if (R() < 0.7 && k3 >= 2 && k3 <= BZ - 2) set(x, y + 3, P.r1); } };
const mx = (bx0 + bx1) >> 1, my = (by0 + by1) >> 1; [[bx0 + 3, by0 + 3], [bx1 - 4, by0 + 3], [bx0 + 3, by1 - 4], [bx1 - 4, by1 - 4], [mx, by0 + 3], [mx, by1 - 4], [bx0 + 3, my], [bx1 - 4, my]].forEach(([x, y]) => bolt(bset, x, y, 1));
const FPR = ["010", "101", "111", "010"], fp = (x, y) => FPR.forEach((row, r) => { for (let c = 0; c < 3; c++) if (row[c] === '1') bset(x + c, y + r, (r + c) % 2 ? BL[2] : BL[1]); });
fp(bx0 + 2, SY + 22); fp(bx0 + 2, SY + 31); fp(bx0 + 3, SY + 40); fp(bx0 + 2, SY + 50); for (let y = SY + 54; y < SY + 66; y++) for (const x of [bx0 + 3, bx0 + 4]) if (R() > (y - SY - 54) / 14) bset(x, y, BL[1]);
fp(SX + 6, by0 + 2); for (let x = SX + 92; x < SX + 136; x++) { const p = (x - SX - 92) / 44; for (let y = by0 + 2; y < by0 + 5; y++) if (R() > p * 0.85) bset(x, y, BL[R() < 0.6 ? 1 : 2]); }
for (let k = 0; k < 14; k++) { const x = bx0 + (R() * (bx1 - bx0) | 0), y = by0 + (R() * (by1 - by0) | 0), r = ring(x, y); if (r >= 2 && r <= BZ - 2) bset(x, y, BL[R() < 0.5 ? 2 : 3]); }
for (const x of [SX + 40, SX + 44, SX + 121]) for (let y = by1 - 5; y < by1; y++) bset(x, y, BL[1]);
const bez = [...bmap];
function drawBez(v) { for (const [i, c] of bez) { const x = i % OW, y = (i / OW) | 0; if (!v || v(orank(x, y))) oput(x, y, c); } for (let y = by0 + 2; y < by1 + 2; y++) for (const x of [bx1, bx1 + 1]) if (!v || v(orank(x, y))) shade(x, y, 0.5); for (let x = bx0 + 2; x < bx1; x++) for (const y of [by1, by1 + 1]) if (!v || v(orank(x, y))) shade(x, y, 0.5); }

// ---------- morgue drawers ----------
const INK = [40, 16, 14], PAPER = () => [214 - (R() * 14 | 0), 208 - (R() * 14 | 0), 190 - (R() * 14 | 0)];
function makeFront(label, withTag, seed) {
  const a = new Array(DRW * DRH), set = (x, y, c) => { if (x >= 0 && x < DRW && y >= 0 && y < DRH) a[y * DRW + x] = c; };
  for (let y = 0; y < DRH; y++) for (let x = 0; x < DRW; x++) { let c; if (y === 0 || x === 0) c = [214, 220, 228]; else if (y === DRH - 1 || x === DRW - 1) c = [24, 26, 30]; else { const v = rowO[(y + seed * 7) % OH] * 0.6 + R() * 0.4; c = STEEL[Math.min(2, v * 3 | 0)]; if (rn(x + DRX0 + seed * 13, y + 120) > 0.76) c = R() < 0.5 ? P.r2 : P.r1; } set(x, y, c); }
  [[3, 3], [DRW - 4, 3], [3, DRH - 4], [DRW - 4, DRH - 4]].forEach(([x, y]) => bolt(set, x, y, 0));
  for (let y = 4; y < 11; y++) { set(66, y, [70, 74, 80]); set(67, y, [50, 54, 60]); set(104, y, [70, 74, 80]); set(105, y, [50, 54, 60]); }
  for (let x = 66; x < 106; x++) { set(x, 6, [214, 220, 228]); set(x, 7, [150, 156, 164]); set(x, 8, [44, 46, 52]); }
  if (seed === 0 || seed === 3) for (let x = 72; x < 86; x++) for (let y = 6; y < 10; y++) if (R() < 0.55) set(x, y, BL[R() < 0.5 ? 1 : 2]);
  for (let y = 2; y < 14; y++) for (let x = 8; x < 51; x++) { const e = y === 2 || y === 13 || x === 8 || x === 50; set(x, y, e ? [60, 64, 70] : PAPER()); }
  if (label) bt((x, y, c) => { if (x >= 9 && x < 50 && y >= 3 && y < 13) set(x, y, c); }, label, 9 + ((41 - bw(label, 1)) >> 1), 3, 1, INK);
  if (withTag) {
    for (let y = 2; y < 14; y++) for (let x = 120; x < 164; x++) { const corner = (x < 123 && (y < 2 + (123 - x) || y > 13 - (123 - x))); if (corner) continue; set(x, y, (y === 2 || y === 13 || x === 163) ? [120, 108, 80] : [198, 186, 150]); }
    set(124, 7, [30, 26, 20]); set(124, 8, [30, 26, 20]);
    for (let x = 114; x < 124; x++) set(x, 7 + ((x & 1)), [160, 150, 120]);
    bt((x, y, c) => { if (x >= 126 && x < 163 && y >= 3 && y < 13) set(x, y, c); }, '+ MP3S', 127, 3, 1, INK);
  }
  return a;
}
const drF = makeFront('SONGS', true, 0);
const decoF = DECO.map((_, i) => makeFront('0' + (i + 2), false, i + 1));
const shT = new Array(SHW * TRAYH);
for (let y = 0; y < TRAYH; y++) for (let x = 0; x < SHW; x++) { const n = (R() - 0.5) * 14, f = (x === 54 || x === 108) ? 0.88 : (x === 55 || x === 109) ? 1.05 : (y === 52 ? 0.9 : 1), g = 1 - 0.12 * (y / TRAYH); shT[y * SHW + x] = [(204 + n) * f * g, (200 + n) * f * g, (188 + n) * f * g]; }
[[20, 70, 5], [130, 30, 4], [80, 90, 3], [150, 80, 3]].forEach(([x0, y0, r]) => { for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) { const d = Math.hypot(x, y) + (R() - 0.5) * 1.8, X = x0 + x, Y = y0 + y; if (d < r && X >= 0 && X < SHW && Y >= 0 && Y < TRAYH) shT[Y * SHW + X] = d < r * 0.4 ? [150, 72, 64] : [178, 122, 112]; } });
function drawFront(a, fy, v) { for (let y = 0; y < DRH; y++) for (let x = 0; x < DRW; x++) { const X = DRX0 + x, Y = fy + y; if (!v || v(orank(X, Y))) oput(X, Y, a[y * DRW + x]); } for (let x = DRX0 + 2; x <= DRX1 + 1; x++) { if (!v || v(orank(x, fy + DRH))) shade(x, fy + DRH, 0.5); if (!v || v(orank(x, fy + DRH + 1))) shade(x, fy + DRH + 1, 0.65); } for (let y = fy + 2; y < fy + DRH; y++) if (!v || v(orank(DRX1 + 1, y))) shade(DRX1 + 1, y, 0.5); }
function slot(y, v) { const dk = [10, 10, 12]; for (let x = DRX0 - 1; x <= DRX1; x++) if (!v || v(orank(x, y - 1))) oput(x, y - 1, dk); for (let yy = y - 1; yy <= y + DRH; yy++) { if (!v || v(orank(DRX0 - 1, yy))) oput(DRX0 - 1, yy, dk); if (!v || v(orank(DRX1, yy))) oput(DRX1, yy, dk); } }

// ---------- incinerator ----------
const incS = new Map(), iset = (x, y, c) => incS.set(y * OW + x, c), bricks = [], vents = [], inn = VN(OW, OH, 5), PAINT = [168, 164, 154], PSH = [24, 22, 20];
for (let y = 8; y < IY0; y++) for (let x = FLX0; x < FLX1; x++) { const u = (x - FLX0) / (FLX1 - FLX0 - 1); let c = u < 0.2 ? [112, 110, 106] : u < 0.7 ? [78, 76, 74] : [40, 39, 38]; if ((y - 8) % 12 < 2) c = sc(c, 1.18); c = sc(c, 0.7 + 0.3 * inn(x, y)); iset(x, y, c); }
for (let y = 8; y < IY0; y += 12) { iset(FLX0 + 2, y, [170, 166, 158]); iset(FLX1 - 3, y, [170, 166, 158]); }
for (let y = IY0; y < IY1; y++) for (let x = IX0; x < IX1; x++) { let c; if (x === IX0 || y === IY0) c = [100, 98, 94]; else if (x === IX1 - 1 || y === IY1 - 1) c = [20, 19, 18]; else { const n = (R() - 0.5) * 14; c = [54 + n, 52 + n, 50 + n]; c = sc(c, 0.75 + 0.35 * inn(x, y)); if (inn(x + 40, y) > 0.8) c = R() < 0.5 ? P.r1 : P.r2; if (y >= HY0 - 16 && y < HY0 && x >= HX0 - 2 && x < HX1 + 2 && R() < 0.75) c = sc(c, 0.5); if (y === 150 || y === 151) c = y === 150 ? [26, 25, 24] : [92, 90, 86]; } iset(x, y, c); }
for (let x = IX0 + 3; x < IX1 - 3; x += 8) { rivet(iset, x, IY0 + 2); rivet(iset, x, IY1 - 4); rivet(iset, x, 153); } for (let y = IY0 + 10; y < IY1 - 4; y += 10) { rivet(iset, IX0 + 2, y); rivet(iset, IX1 - 4, y); }
bt(iset, 'INCINERATOR', IX0 + ((IX1 - IX0 - bw('INCINERATOR', 1)) >> 1), 44, 1, PAINT, { sh: PSH });
for (let y = HY0 - 1; y <= HY1; y++) for (let x = HX0 - 1; x <= HX1; x++) if (x === HX0 - 1 || x === HX1 || y === HY0 - 1 || y === HY1) iset(x, y, [26, 26, 26]);
for (const hy of [HY0 + 8, HY1 - 14]) for (let y = hy; y < hy + 6; y++) for (let x = HX0 - 5; x < HX0 - 1; x++) iset(x, y, x === HX0 - 5 || y === hy ? [150, 150, 146] : [84, 84, 82]);
for (let y = 81; y < 86; y++) for (let x = HX1 + 1; x < HX1 + 6; x++) iset(x, y, y === 81 ? [170, 170, 166] : y === 85 ? [30, 30, 30] : [110, 110, 106]);
for (let y = HY0; y < HY1; y++) for (let x = HX0; x < HX1; x++) { if (x >= CX0 && x < CX1 && y >= CY0 && y < CY1) continue; const row = ((y - HY0) / 3) | 0, off = (row % 2) * 3, mort = (x - HX0 + off) % 6 === 5 || (y - HY0) % 3 === 2; const n = (R() - 0.5) * 16; const c = mort ? [60 + n * 0.3, 54 + n * 0.3, 48 + n * 0.3] : (R() < 0.5 ? [112 + n, 46 + n * 0.4, 30 + n * 0.3] : [128 + n, 56 + n * 0.4, 36 + n * 0.3]); bricks.push([x, y, sc(c, 0.8 + 0.25 * inn(x, y)), Math.max(CX0 - 1 - x, x - CX1, CY0 - 1 - y, y - CY1)]); }
for (let dy = -12; dy <= 12; dy++) for (let dx = -12; dx <= 12; dx++) { const d = Math.hypot(dx, dy); if (d > 12.4) continue; let c; if (d > 10.5) c = (dx + dy < 0) ? [150, 154, 160] : [50, 52, 56]; else { const n = (R() - 0.5) * 12; c = [206 + n, 200 + n, 184 + n]; if (inn(GX + dx + 70, GY + dy) > 0.75) c = sc(c, 0.8); } iset(GX + dx, GY + dy, c); }
for (let k = 0; k <= 10; k++) { const a = (-135 + 27 * k) * Math.PI / 180; for (let r = 8.2; r <= 10; r += 0.6) iset(GX + Math.round(Math.sin(a) * r), GY - Math.round(Math.cos(a) * r), k >= 7 ? [170, 30, 30] : [40, 34, 30]); }
for (let k = 0; k < 28; k++) { const a = (-135 + 270 * (0.7 + 0.3 * k / 27)) * Math.PI / 180; iset(GX + Math.round(Math.sin(a) * 9), GY - Math.round(Math.cos(a) * 9), [170, 30, 30]); }
bt(iset, 'VOL', 209, 123, 1, PAINT, { sh: PSH });
for (let y = ASH0; y < ASH0 + 30; y++) for (let x = 222; x < 271; x++) iset(x, y, y === ASH0 || x === 222 ? [120, 124, 130] : y === ASH0 + 29 || x === 270 ? [24, 24, 26] : sc([70, 72, 76], 0.8 + 0.3 * inn(x, y)));
for (const vy of [ASH0 + 7, ASH0 + 12, ASH0 + 17, ASH0 + 22]) for (let y = vy; y < vy + 2; y++) for (let x = 228; x < 264; x++) vents.push([x, y]);
for (let y = ASH0 + 12; y < ASH0 + 17; y++) for (let x = 265; x < 268; x++) iset(x, y, y === ASH0 + 12 ? [170, 174, 180] : [90, 94, 100]);
const FS = [[0, [8, 6, 6]], [6, [71, 15, 7]], [12, [143, 39, 7]], [18, [207, 79, 15]], [24, [223, 111, 15]], [28, [215, 135, 23]], [31, [205, 160, 40]], [34, [220, 200, 90]], [36, [255, 250, 235]]], FPAL = [];
for (let i = 0; i <= 36; i++) { let k = 0; while (k < FS.length - 2 && FS[k + 1][0] < i) k++; const [a, ca] = FS[k], [b, cb] = FS[k + 1], t = Math.min(1, (i - a) / (b - a)); FPAL.push([ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t]); }
const heat = new Uint8Array(FW * FH); let vol = 60;
function fireStep() { const base = Math.round(6 + vol / 100 * 30), d = 0.62 - vol / 100 * 0.24; for (let x = 0; x < FW; x++) heat[(FH - 1) * FW + x] = Math.max(0, Math.min(36, base - (Math.random() * 4 | 0) + 1)); for (let x = 0; x < FW; x++) for (let y = 1; y < FH; y++) { const src = y * FW + x, r = Math.random() * 3 | 0, dst = src - FW + (r - 1); if (dst < 0) continue; const h = heat[src] - (Math.random() < d ? 1 : 0) - (Math.random() < 0.06 ? 1 : 0); heat[dst] = h < 0 ? 0 : h; } }
for (let k = 0; k < 80; k++) fireStep();
function drawInc(v) { for (const [i, c] of incS) { const x = i % OW, y = (i / OW) | 0; if (!v || v(orank(x, y))) oput(x, y, c); } const g0 = vol / 100;
  for (const [x, y, c, d] of bricks) { if (v && !v(orank(x, y))) continue; const g = g0 * Math.max(0, 1 - d / 5) * 0.95; oput(x, y, [c[0] + 130 * g, c[1] + 55 * g, c[2] + 14 * g]); }
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) { const X = CX0 + x, Y = CY0 + y; if (v && !v(orank(X, Y))) continue; const bx = x % 8; let c = FPAL[heat[y * FW + x]]; if (bx === 6) { const f = FPAL[heat[y * FW + Math.max(0, x - 1)]]; c = [24 + f[0] * 0.35, 22 + f[1] * 0.35, 20 + f[2] * 0.35]; } else if (bx === 7) c = [22, 20, 18]; oput(X, Y, c); }
  const tv2 = performance.now() / 1000, vc = FPAL[Math.round(3 + g0 * 20 * (0.9 + 0.1 * Math.sin(tv2 * 9.1) * Math.sin(tv2 * 5.3)))]; for (const [x, y] of vents) if (!v || v(orank(x, y))) oput(x, y, vc);
  if (!v) { const a = (-135 + 270 * g0) * Math.PI / 180; for (let r = 0; r <= 9; r += 0.5) oput(GX + Math.round(Math.sin(a) * r), GY - Math.round(Math.cos(a) * r), r > 7 ? [170, 30, 30] : [36, 18, 16]); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) oput(GX + dx, GY + dy, dx + dy < 0 ? [150, 154, 160] : [80, 84, 90]); const s = String(Math.round(vol)); bt(oput, s, 283 - bw(s, 1), 123, 1, PAINT, { sh: PSH }); } }
function firelight() { if (vol <= 0) return; const tt = performance.now() / 1000, fl = 0.86 + 0.14 * Math.sin(tt * 11.3) * Math.sin(tt * 6.7 + 1.3), Rl = 40 + vol * 0.9, k0 = vol / 100 * 0.7 * fl, cl = 246, cy = 82; for (let y = Math.max(0, cy - Rl | 0); y < Math.min(OH, cy + Rl); y++) for (let x = Math.max(0, cl - Rl | 0); x < Math.min(OW, cl + Rl); x++) { if (x >= CX0 && x < CX1 && y >= CY0 && y < CY1) continue; if (x >= SX && x < SX + SW && y >= SY && y < SY + SH) continue; const d = Math.hypot(x - cl, (y - cy) * 1.1) / Rl; if (d >= 1) continue; const k = k0 * (1 - d) * (1 - d), o = (y * OW + x) * 4; B[o] += 255 * k; B[o + 1] += 105 * k; B[o + 2] += 28 * k; } }

// ---------- outer border: barbed wire + crawling things ----------
const ox0 = 4, oy0 = 4, ox1 = OW - 5, oy1 = OH - 5, owire = [], obarb = [], WC = () => R() < 0.18 ? (R() < 0.5 ? P.r2 : [150, 72, 32]) : (R() < 0.5 ? [84, 86, 90] : [118, 120, 124]);
for (let x = 1; x < OW - 1; x++) for (const yy of [oy0, oy1]) { const s = Math.round(Math.sin(x * 0.5)); owire.push([x, yy + s, WC()], [x, yy - s, WC()]); }
for (let y = 1; y < OH - 1; y++) for (const xx of [ox0, ox1]) { const s = Math.round(Math.sin(y * 0.5)); owire.push([xx + s, y, WC()], [xx - s, y, WC()]); }
const XB = [[-3, -3], [3, -3], [-2, -2], [2, -2], [-1, -1], [1, -1], [0, 0], [-1, 0], [1, 0], [-1, 1], [1, 1], [-2, 2], [2, 2], [-3, 3], [3, 3]], BC = (a, b) => R() < 0.15 ? [140, 66, 28] : (Math.abs(a) + Math.abs(b) <= 1 ? [170, 172, 176] : [92, 94, 98]);
for (let x0 = 10; x0 < OW - 8; x0 += 14) for (const yy of [oy0, oy1]) XB.forEach(([a, b]) => obarb.push([x0 + a, yy + b, BC(a, b)]));
for (let y0 = 12; y0 < OH - 10; y0 += 14) for (const xx of [ox0, ox1]) XB.forEach(([a, b]) => obarb.push([xx + b, y0 + a, BC(a, b)]));
function drawWire(v) { for (const [x, y] of owire) if (!v || v(orank(x, y))) shade(x + 1, y + 1, 0.6); for (const [x, y, c] of owire) if (!v || v(orank(x, y))) oput(x, y, c); }
function drawBarbs(v) { for (const [x, y] of obarb) if (!v || v(orank(x, y))) shade(x + 1, y + 1, 0.6); for (const [x, y, c] of obarb) if (!v || v(orank(x, y))) oput(x, y, c); }
const PA = ox1 - ox0, PB = oy1 - oy0, PL = 2 * (PA + PB);
function ppos(s) { s = ((s % PL) + PL) % PL; if (s < PA) return [ox0 + s, oy0, 0]; s -= PA; if (s < PB) return [ox1, oy0 + s, 1]; s -= PB; if (s < PA) return [ox1 - s, oy1, 2]; s -= PA; return [ox0, oy1 - s, 3]; }
const FV = [[1, 0], [0, 1], [-1, 0], [0, -1]], PV = [[0, 1], [-1, 0], [0, -1], [1, 0]];
function spr(L, x, y, d, px) { const [fx, fy] = FV[d], [qx, qy] = PV[d]; for (const [dx, dy, c] of px) L.push([Math.round(x + dx * fx + dy * qx), Math.round(y + dx * fy + dy * qy), c]); }
const SD = [40, 26, 18], SM = [86, 56, 34], SHL = [136, 94, 56];
function scorp(L, s, ph) { const [x, y, d] = ppos(s), px = []; for (let dx = -2; dx <= 2; dx++) px.push([dx, 0, SM], [dx, -1, SD], [dx, 1, SD]); px.push([0, 0, SHL], [3, 0, SM], [3, -1, SD], [3, 1, SD], [4, -1, SD], [5, -2, SD], [4, 1, SD], [5, 2, SD], [6, -2, SM], [6, -3, SD], [7, -2, SD], [6, 2, SM], [6, 3, SD], [7, 2, SD], [-3, 0, SM], [-4, 0, SD], [-5, 0, SM], [-6, -1, SD], [-6, -2, SM], [-5, -3, SD], [-4, -3, SHL]); for (const lx of [-2, -1, 0, 1]) { const sw = (lx + ph) & 1; px.push([lx, -2, SD], [lx - 1 + 2 * sw, -3, SD], [lx, 2, SD], [lx + 1 - 2 * sw, 3, SD]); } spr(L, x, y, d, px); }
const C1 = [132, 62, 22], C2 = [96, 42, 16], CHL = [176, 96, 40], CH = [54, 24, 10], CL = [70, 34, 14], CT = [190, 130, 70];
function centi(L, s0, sg, N, ph) { for (let j = N - 1; j >= 0; j--) { const [x, y, d0] = ppos(s0 - sg * j * 2), d = sg > 0 ? d0 : (d0 + 2) % 4, body = j % 2 ? C1 : C2, px = [[0, 0, j === 0 ? CH : CHL], [0, -1, body], [0, 1, body], [-1, 0, body], [-1, -1, C2], [-1, 1, C2]]; if (j === 0) px.push([1, 0, CH], [1, -1, CH], [1, 1, CH], [2, -2, CT], [3, -3, CT], [2, 2, CT], [3, 3, CT]); else { const a = (j + ph) & 1, lx = a ? 0 : -1, fw = a ? 1 : -1; px.push([lx, -2, CL], [lx + fw, -3, CT], [lx, 2, CL], [lx + fw, 3, CT]); } if (j === N - 1) px.push([-2, -2, CT], [-3, -3, CT], [-2, 2, CT], [-3, 3, CT]); spr(L, x, y, d, px); } }
function bugs(t) { const L = [], ph = Math.floor(t * 8) & 1; scorp(L, 60 + 10 * (t - Math.sin(t * 2.2) / 2.2), ph); centi(L, 380 + 16 * t, 1, 11, ph); centi(L, 820 - 12 * t, -1, 7, ph ^ 1); const seen = new Set(); for (const [x, y] of L) { const k = (y + 1) * OW + x + 1; if (!seen.has(k)) { seen.add(k); shade(x + 1, y + 1, 0.5); } } for (const [x, y, c] of L) oput(x, y, c); }

// ---------- window buttons ----------
const MINUS = ["00000", "00000", "00000", "00000", "11111", "11111", "00000"], CROSS = ["10001", "11011", "01110", "00100", "01110", "11011", "10001"];
function winButtons() {
  [[WBMIN, 'min', MINUS], [WBCLOSE, 'close', CROSS]].forEach(([x0, id, pat]) => {
    const hv = hover === id, pd = press === id;
    for (let y = 0; y < WBS; y++) for (let x = 0; x < WBS; x++) { const c = y === 0 || x === 0 ? [210, 216, 224] : (y === WBS - 1 || x === WBS - 1) ? [24, 26, 30] : pd ? [96, 100, 108] : [136, 143, 152]; oput(x0 + x, WBY + y, c); }
    for (let x = 0; x < WBS + 1; x++) shade(x0 + x + 1, WBY + WBS, 0.5); for (let y = 1; y < WBS + 1; y++) shade(x0 + WBS, WBY + y, 0.5);
    const ic = hv ? (id === 'close' ? [212, 40, 40] : [250, 250, 250]) : [36, 36, 40];
    pat.forEach((row, r) => { for (let c = 0; c < 5; c++) if (row[c] === '1') oput(x0 + 3 + c, WBY + 2 + r, ic); });
    hits.push({ id, x: x0, y: WBY, w: WBS, h: WBS });
  });
}

// ---------- settings gear + settings screen ----------
let setOpen = false, introOn = true, slDrag = null;
const GX0 = 11, GY0 = 11;
function gear() {
  const L = [], hv = hover === 'gear' || setOpen;
  for (let a = 0; a < 64; a++) { const an = a / 64 * Math.PI * 2; L.push([Math.round(GX0 + Math.cos(an) * 5.4), Math.round(GY0 + Math.sin(an) * 5.4), a % 3 ? [118, 120, 124] : [84, 86, 90]]); }
  for (let a = 0; a < 48; a++) { const an = a / 48 * Math.PI * 2, r = 3.9 + Math.sin(a * 1.6) * 0.8; L.push([Math.round(GX0 + Math.cos(an) * r), Math.round(GY0 + Math.sin(an) * r), a % 4 === 0 ? P.r2 : [96, 98, 102]]); }
  for (let k = 0; k < 8; k++) { const an = k / 8 * Math.PI * 2 + 0.2, bx = GX0 + Math.cos(an) * 7.6, by = GY0 + Math.sin(an) * 7.6; for (const [dx, dy] of [[-1, -1], [1, 1], [1, -1], [-1, 1], [0, 0]]) L.push([Math.round(bx + dx), Math.round(by + dy), (dx || dy) ? [150, 152, 156] : [196, 198, 202]]); }
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) L.push([GX0 + dx, GY0 + dy, [176, 178, 182]]);
  const seen = new Set(); for (const [x, y] of L) { const k = y * OW + x; if (!seen.has(k)) { seen.add(k); shade(x + 1, y + 1, 0.55); } }
  for (const [x, y, c] of L) oput(x, y, hv ? [Math.min(255, c[0] * 0.6 + 120), c[1] * 0.45, c[2] * 0.45] : c);
  if (upd && upd.state === 'ready') {
    // A fresh drop of blood under the gear: an update is waiting.
    const k = 0.5 + 0.5 * Math.sin(performance.now() / 1000 * Math.PI * 2 * 1.2), dc = [150 + 100 * k, 18 + 40 * k, 18 + 30 * k], dx = GX0 - 2, dy = GY0 + 9, DROP = [[1, 0], [1, 1], [0, 2], [1, 2], [2, 2], [0, 3], [1, 3], [2, 3], [1, 4]];
    for (const [a, b] of DROP) shade(dx + a + 1, dy + b + 1, 0.5);
    for (const [a, b] of DROP) oput(dx + a, dy + b, (a === 0 && b === 2) ? [255, 200, 200] : dc);
  }
  hits.push({ id: 'gear', x: GX0 - 9, y: GY0 - 9, w: 19, h: 19 });
}
const SETROWS = [
  { id: 'fps', label: 'FPS', min: 2, max: 60, get: () => fps, set: (v) => { fps = v; API.setSettings({ fps: v }); } },
  { id: 'fx', label: 'INTRO VOL', min: 0, max: 100, get: () => fxVolume, set: (v) => { fxVolume = v; API.setSettings({ fxVolume: v }); } },
  { id: 'crunch', label: 'CRUNCH', min: 0, max: 100, get: () => Math.round(sfxCrunch * 100), set: (v) => { sfxCrunch = v / 100; API.setSettings({ crunch: v }); } },
  { id: 'static', label: 'STATIC', min: 0, max: 100, get: () => Math.round(sfxStatic * 100), set: (v) => { sfxStatic = v / 100; API.setSettings({ static: v }); } }
];
function settingsScreen() {
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) sp(x, y, y % 2 ? SCB1 : SCB2);
  bt(sp, 'SETTINGS', 4, 2, 1, SCT, { sh: SHD });
  for (let x = 4; x < 154; x += 2) sp(x, 13, SCD);
  SETROWS.forEach((r, k) => {
    const y = 15 + k * 10, x0 = 60, x1 = 130, v = r.get(), f = (v - r.min) / (r.max - r.min), kx = x0 + Math.round(f * (x1 - x0 - 1)), wy = y + 4, hv = hover === 'set:' + r.id || slDrag === r.id;
    bt(sp, r.label, 4, y, 1, SC2, { sh: SHD2 });
    for (let x = x0; x < x1; x++) { const s = Math.round(Math.sin(x * 0.9) * 0.6); sp(x, wy + s, x <= kx ? SC1 : SCD); }
    for (let x = x0 + 4; x < x1; x += 8) { const c = x <= kx ? SC2 : SCD; sp(x - 1, wy - 2, c); sp(x + 1, wy - 2, c); sp(x - 1, wy + 2, c); sp(x + 1, wy + 2, c); }
    for (let a = -1; a < 2; a++) for (let b = -1; b < 2; b++) sp(kx + a, wy + b, hv ? [255, 230, 230] : SCK);
    const t = String(v); bt(sp, t, 154 - bw(t, 1), y, 1, SCT, { sh: SHD });
    hits.push({ id: 'set:' + r.id, x: SX + x0 - 3, y: SY + y - 1, w: x1 - x0 + 6, h: 11, srow: r, sx0: SX + x0, sx1: SX + x1 });
  });
  bt(sp, 'INTRO', 4, 57, 1, SC2, { sh: SHD2 }); btnText('set:intro', 40, 55, 30, 12, introOn ? 'ON' : 'OFF');
  bt(sp, 'SIZE', 80, 57, 1, SC2, { sh: SHD2 }); btnText('set:size-', 106, 55, 18, 12, '-'); btnText('set:size+', 128, 55, 18, 12, '+');
  if (upd) { const v = 'V' + upd.version; bt(sp, v, 4, 72, 1, SC2, { sh: SHD2 }); btnText('set:upd', 40, 70, 114, 12, updLabel()); }
  btnText('set:test', 4, 84, 80, 12, 'PLAY INTRO'); btnText('set:done', 100, 84, 54, 12, 'DONE');
}
// ---------- updates (GitHub Releases, see updater.js) ----------
let upd = null, pendingToast = null;
function updLabel() {
  const s = upd ? upd.state : 'idle';
  if (s === 'checking') return 'CHECKING...';
  if (s === 'downloading') return 'DOWNLOADING ' + Math.floor((upd.progress || 0) * 100) + '%';
  if (s === 'ready') return 'RESTART TO UPDATE';
  if (s === 'current') return 'UP TO DATE';
  if (s === 'error') return 'CHECK FAILED';
  return 'CHECK FOR UPDATES';
}
function onUpd(u) {
  if (!u) return;
  const was = upd && upd.state; upd = u;
  if (u.state === 'ready' && was !== 'ready') { const m = 'UPDATE ' + u.latest + ' READY. CLICK THE GEAR TO RESTART'; if (hudOn) toast(m, 8000); else pendingToast = m; }
  dirty();
}
function updAct() { if (!upd) return; if (upd.state === 'ready') API.updateApply(); else if (upd.state !== 'checking' && upd.state !== 'downloading') API.updateCheck(); }
function setSlider(h, x) { const r = h.srow, f = Math.max(0, Math.min(1, (x - h.sx0) / Math.max(1, h.sx1 - h.sx0 - 1))); r.set(Math.round(r.min + f * (r.max - r.min))); slDrag = r.id; dirty(); }
function replayIntro() { setOpen = false; if (introSrc) { try { introSrc.stop(); } catch { } } st = performance.now(); last = -1; playFx(5.4, introSfx).then((b) => { introSrc = b; }); }

// ---------- screen colours ----------
const RED = [212, 68, 68], SC1 = [212, 68, 68], SC2 = [160, 46, 46], SCT = [255, 140, 140], SCB1 = [26, 6, 6], SCB2 = [34, 9, 9], SCL = [255, 170, 170], SCD = [90, 26, 26], SCK = [255, 190, 190], SHD = [84, 12, 12], SHD2 = [62, 9, 9];
function enter() { const s = 3, str = 'ENTER', w = bw(str, s), x0 = (OW - w) >> 1, y0 = (OH - 27) >> 1; bt(oput, str, x0, y0, s, RED, { sh: [66, 6, 6] }); const cand = []; let xx = x0; for (const ch of str) { const g = BF[ch]; for (let c = 0; c < g[0].length; c++) if (g[8][c] === '1') cand.push(xx + c * s + 1); xx += (g[0].length + 1) * s; } for (let k = 0; k < 9; k++) { const x = cand[(hsh(k, 1, 2, 3) * cand.length) | 0], len = 2 + (hsh(k, 4, 5, 6) * 10 | 0); for (let j = 0; j < len; j++) oput(x, y0 + 27 + j, j < len - 1 ? [170, 40, 40] : [110, 20, 20]); } }
const sp = (x, y, c) => { if (x >= 0 && x < SW && y >= 0 && y < SH) oput(SX + x, SY + y, c); };
function patt(p, x, y, col, pl) { pl = pl || sp; p.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] === '1') pl(x + c, y + r, col); }); }
function marq(pl, s, x, y, fw, col, tn, sh) { const w = bw(s, 1); if (w <= fw) { bt(pl, s, x, y, 1, col, { sh }); return; } const over = w - fw, spd = 10, cyc = 1.5 + over / spd + 1.2, u = tn % cyc, off = u < 1.5 ? 0 : Math.min(over, (u - 1.5) * spd); bt(pl, s, x - Math.round(off), y, 1, col, { sh, c0: x, c1: x + fw }); }
const PLAY = ["10000", "11000", "11100", "11110", "11100", "11000", "10000"], PAUSE = ["11011", "11011", "11011", "11011", "11011", "11011", "11011"], PREV = ["1001001", "1011011", "1111111", "1011011", "1001001"], NEXT = ["1001001", "1101101", "1111111", "1101101", "1001001"];
const ICN = { note: "0000110,0000101,0000100,0000100,0111100,1111100,0111000".split(','), artist: "0011100,0111110,0111110,0011100,0000000,0111110,1111111".split(','), album: "0011100,0111110,1110111,1101011,1110111,0111110,0011100".split(','), year: "0100010,1111111,1000001,1010101,1000001,1010101,1111111".split(',') };
const TOETAG = ["011110", "100001", "101101", "100001", "100001", "100001", "011110"];

// ---------- library state ----------
let amReady = false, amAuth = false, amOffline = false, amUnsigned = false, amLoading = false, amCount = 0, amSongs = [], amRecent = [], cdmOk = true;
let localFiles = [], localFolder = null, localScan = null;
let lib = { songs: [], artists: [], albums: [], recent: [] };
const keyOf = (s) => norm(s).replace(/[^A-Z0-9]/g, '');
const sameSong = (a, b) => !!(a && b && a.src === b.src && (a.src === 'am' ? a.id === b.id : a.path === b.path));
const fmt = (s) => { s = Math.max(0, s || 0); const m = Math.floor(s / 60), ss = Math.floor(s % 60); return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss; };
const fmt2 = (s) => { s = Math.max(0, s || 0); return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); };
const byText = (f) => (a, b) => { const x = f(a), y = f(b); return x < y ? -1 : x > y ? 1 : 0; };
function rebuildLibrary() {
  const songs = [];
  for (const s of amSongs) songs.push({ src: 'am', id: s.id, catalogId: s.catalogId, title: s.title, artist: s.artist, album: s.album, year: s.year, duration: s.duration, art: s.art, track: s.track, disc: s.disc, addedRaw: s.added });
  for (const f of localFiles) songs.push({ src: 'local', path: f.path, title: f.title, artist: f.artist, album: f.album, year: f.year, duration: f.duration, track: f.track, disc: f.disc, added: f.added });
  for (const s of songs) { s.T = norm(s.title); s.A = norm(s.artist); s.L = norm(s.album); s.sortT = keyOf(s.title) || s.T; }
  songs.sort(byText(s => s.sortT));
  const am = new Map(), al = new Map();
  for (const s of songs) {
    const ak = keyOf(s.artist) || '?'; if (!am.has(ak)) am.set(ak, { name: s.A || 'UNKNOWN ARTIST', songs: [] }); am.get(ak).songs.push(s);
    const lk = (keyOf(s.album) || '?') + '|' + ak; if (!al.has(lk)) al.set(lk, { name: s.L || 'UNKNOWN ALBUM', artist: s.A, year: s.year, songs: [] }); al.get(lk).songs.push(s);
  }
  const trackSort = (a, b) => (a.disc || 0) - (b.disc || 0) || (a.track || 0) - (b.track || 0) || (a.sortT < b.sortT ? -1 : 1);
  const artists = [...am.values()].sort(byText(a => keyOf(a.name)));
  for (const a of artists) a.songs.sort((x, y) => (keyOf(x.album) < keyOf(y.album) ? -1 : keyOf(x.album) > keyOf(y.album) ? 1 : trackSort(x, y)));
  const albums = [...al.values()].sort(byText(a => keyOf(a.name)));
  for (const a of albums) a.songs.sort(trackSort);
  // Most recently added songs: Apple Music dates where available, recently-added albums otherwise, file dates for MP3s.
  const now = Date.now(), albumDate = new Map();
  amRecent.forEach((r) => { const t = r.added ? Date.parse(r.added) : NaN; albumDate.set(keyOf(r.name) + '|' + keyOf(r.artist), Number.isFinite(t) ? t : now - r.rank * 3600e3); });
  const rec = [];
  for (const s of songs) {
    let t = null;
    if (s.src === 'local') t = s.added;
    else if (s.addedRaw && Number.isFinite(Date.parse(s.addedRaw))) t = Date.parse(s.addedRaw);
    else { const d = albumDate.get(keyOf(s.album) + '|' + keyOf(s.artist)); if (d !== undefined) t = d - (s.disc || 0) * 1000 - (s.track || 0); }
    if (t) rec.push([t, s]);
  }
  rec.sort((a, b) => b[0] - a[0]);
  lib = { songs, artists, albums, recent: rec.slice(0, 300).map(r => r[1]) };
  dirty();
}

// ---------- playback ----------
const audio = new Audio(); audio.preload = 'auto';
let queue = [], qi = -1, cur = null, amActive = false;
const pb = { playing: false, time: 0, dur: 0 };
let toastMsg = null, toastUntil = 0;
function toast(m, ms) { toastMsg = norm(m); toastUntil = performance.now() + (ms || 4000); dirty(); try { API.log && API.log('toast: ' + m); } catch { } }
const gain = () => Math.pow(vol / 100, 1.6);
function applyVol() { audio.volume = Math.min(1, gain()); if (amReady) API.amCmd({ type: 'volume', value: gain() }); }
function playList(list, i) { if (!list || !list.length) return; queue = list.slice(); qi = Math.max(0, Math.min(i, queue.length - 1)); startCur(); }
function startCur() {
  cur = queue[qi]; if (!cur) return;
  pb.time = 0; pb.dur = cur.duration || 0; pb.playing = true;
  if (cur.src === 'local') {
    if (amActive) { API.amCmd({ type: 'pause' }); amActive = false; }
    audio.src = API.fileUrl(cur.path); audio.currentTime = 0;
    audio.play().catch(() => toast("CAN'T PLAY THIS FILE"));
  } else {
    audio.pause(); audio.removeAttribute('src'); audio.load();
    if (!amAuth) { toast('SIGN IN TO APPLE MUSIC FIRST'); pb.playing = false; return; }
    amActive = true;
    API.amCmd({ type: 'playSong', id: cur.id, catalogId: cur.catalogId });
  }
  applyVol(); loadArt(cur); dirty();
}
function next() { if (!queue.length) return; if (qi + 1 >= queue.length) { stopAll(); return; } qi++; startCur(); }
function prev() { if (!cur) return; if (pb.time > 3 || qi === 0) seek(0); else { qi--; startCur(); } }
function stopAll() { if (cur && cur.src === 'local') audio.pause(); else if (amActive) API.amCmd({ type: 'pause' }); pb.playing = false; dirty(); }
function toggle() {
  if (!cur) { const l = lib.songs; if (l.length) playList(l, 0); else openDrawer(true); return; }
  if (cur.src === 'local') { if (audio.paused) audio.play().catch(() => {}); else audio.pause(); }
  else API.amCmd({ type: pb.playing ? 'pause' : 'play' });
  pb.playing = !pb.playing; dirty();
}
function seek(t) { if (!cur) return; t = Math.max(0, Math.min(t, (pb.dur || 0) - 0.25)); if (cur.src === 'local') audio.currentTime = t; else API.amCmd({ type: 'seek', time: t }); pb.time = t; dirty(); }
audio.addEventListener('timeupdate', () => { if (cur && cur.src === 'local') pb.time = audio.currentTime; });
audio.addEventListener('durationchange', () => { if (cur && cur.src === 'local' && Number.isFinite(audio.duration)) pb.dur = audio.duration; });
audio.addEventListener('play', () => { if (cur && cur.src === 'local') { pb.playing = true; dirty(); } });
audio.addEventListener('pause', () => { if (cur && cur.src === 'local') { pb.playing = false; dirty(); } });
audio.addEventListener('ended', () => { if (cur && cur.src === 'local') next(); });
audio.addEventListener('error', () => { if (cur && cur.src === 'local' && audio.getAttribute('src')) { toast("CAN'T PLAY THIS FILE"); setTimeout(next, 1200); } });

// ---------- album art ----------
const artCache = new Map();
function artKey(t) { return t ? (t.src === 'local' ? 'local:' + t.path : (t.art || '')) : ''; }
function loadArt(t) {
  const k = artKey(t); if (!k || artCache.has(k)) return;
  artCache.set(k, 'loading');
  const p = t.src === 'local' ? API.localArt(t.path) : (t.art ? API.fetchArt(t.art) : Promise.resolve(null));
  p.then((data) => {
    if (!data) { artCache.set(k, null); dirty(); return; }
    const im = new Image();
    im.onload = () => { const c = document.createElement('canvas'); c.width = 50; c.height = 50; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, 50, 50); try { artCache.set(k, g.getImageData(0, 0, 50, 50).data); } catch { artCache.set(k, null); } if (artCache.size > 60) artCache.delete(artCache.keys().next().value); dirty(); };
    im.onerror = () => { artCache.set(k, null); dirty(); };
    im.src = data;
  }).catch(() => artCache.set(k, null));
}

// ---------- visualizer input (system audio loopback) ----------
let analyser = null, fdata = null, loopTried = false;
async function startLoopback() {
  if (loopTried) return; loopTried = true;
  try {
    const s = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
    s.getVideoTracks().forEach(t => t.stop());
    const tracks = s.getAudioTracks(); if (!tracks.length) return;
    const ac = new AudioContext(), src = ac.createMediaStreamSource(new MediaStream(tracks));
    analyser = ac.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.72; src.connect(analyser);
    fdata = new Uint8Array(analyser.frequencyBinCount);
  } catch { analyser = null; }
}
function bands(n, tn) {
  const out = new Array(n).fill(0);
  if (analyser && fdata) {
    analyser.getByteFrequencyData(fdata);
    const N = fdata.length; let any = 0;
    for (let k = 0; k < n; k++) { const a = Math.floor(Math.pow(N, k / n) * 0.9), b = Math.max(a + 1, Math.floor(Math.pow(N, (k + 1) / n) * 0.9)); let m = 0; for (let i = a; i < b && i < N; i++) m = Math.max(m, fdata[i]); out[k] = m / 255; any += m; }
    if (any > 0) return out;
  }
  if (!pb.playing) return out;
  for (let k = 0; k < n; k++) out[k] = Math.abs((Math.sin(tn * 5 + k * 0.9) * 0.5 + 0.5) * (0.55 + 0.45 * Math.sin(tn * 2.3 + k * 1.7)));
  return out;
}

// ---------- HUD ----------
let hover = null, press = null, hits = [], hudOn = false, mode = 'art';
function coverArt(x0, y0, t) {
  const d = artCache.get(artKey(t));
  if (d && d !== 'loading') { for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) { const o = (y * 50 + x) * 4; sp(x0 + 1 + x, y0 + 1 + y, [d[o], d[o + 1], d[o + 2]]); } return; }
  skullBox(x0, y0, performance.now() / 1000);
}
// Floating skull for songs without cover art. Every so often its jaw drops and it laughs.
const SKF = ["............4556553.............", ".........4555566655442..........", ".......44545565655543322........", "......4455556566655424432.......", "....34444555565655554233221.....", "...3445455556565655452433221....", "...4344545555556554544233322....", "..444455555565656554524333322...", ".33444454555555655454424332211..", ".34454555555656565545442433221..", ".43445455555555655454434332221..", "2344545555556565555454434332211.", "2334454545555555554544343322111.", "2344545555555565555454434332211.", "2334555656666555555555454432111.", "2344556566666565556555544442211.", "1334555222266555555522224432111.", ".23442111111256555211111123221..", ".23421100001125552110000112211..", ".23311000000125552100000011211..", ".23411000000125552100000011211..", ".2321100e0001245421000e0011111..", ".23321000001124542110000012111..", "4453211111112455542111111122321.", "3445332211224466643221122213221.", "4454433334445566655333212223322.", ".33433343545540004444423221211..", "..333343445541000144433222211...", "...3233334443100013334221211....", "....22333333333333333333211.....", "....23314161616161616141221.....", ".....331415151515151514121......", ".....231314141414141413111......"];
const SKJ = [".234.......................321..", ".234.......................321..", ".234.......................321..", ".234.......................321..", ".234.......................321..", ".234.......................321..", "..234.....................321...", ".....344315151515151513331......", "....23343141414141414133221.....", "....33442222222222222223321.....", ".....334444545554544333322......", ".....233445455555444433221......", ".......33444454544443322........", ".........2444455544332..........", "............2222222............."], SKJ_TOP = 26;
const SKP = {"0": [10, 7, 7], "1": [44, 34, 29], "2": [88, 76, 63], "3": [132, 120, 101], "4": [174, 164, 144], "5": [208, 199, 180], "6": [234, 227, 211], "7": [249, 245, 234]};
function skullBox(x0, y0, tn) {
  for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) { const n = (hsh(x, y, 7, 11) - 0.5) * 8; sp(x0 + 1 + x, y0 + 1 + y, [10 + n, 7 + n * 0.5, 7 + n * 0.5]); }
  const cyc = tn % 9, laugh = cyc > 7.2 ? (cyc - 7.2) / 1.8 : -1, chat = laugh >= 0 ? Math.floor(tn * 11) % 2 : 0;
  const bob = Math.round(Math.sin(tn * 2.1) * 2), sway = Math.round(Math.sin(tn * 0.8) * 1.2);
  const jawDrop = laugh >= 0 ? (chat ? 4 : 1) : 0, shake = laugh >= 0 ? -chat : 0;
  const sx = x0 + 1 + 9 + sway, sy = y0 + 1 + 2 + bob + shake;
  for (let x = 12; x < 40; x++) { const w = 13 - Math.abs(bob); if (Math.abs(x - 25 - sway) < w) { sp(x0 + 1 + x, y0 + 48, [30, 12, 12]); if (Math.abs(x - 25 - sway) < w - 3) sp(x0 + 1 + x, y0 + 49, [22, 9, 9]); } }
  const eye = laugh >= 0 ? [255, 70, 60] : [120 + Math.round(40 * Math.sin(tn * 3)), 18, 16];
  const drawRows = (rows, ox, oy) => rows.forEach((row, r) => { for (let c = 0; c < row.length; c++) { const ch = row[c]; if (ch === '.') continue; sp(ox + c, oy + r, ch === 'e' ? eye : SKP[ch]); } });
  drawRows(SKF, sx, sy);
  drawRows(SKJ, sx, sy + SKJ_TOP + jawDrop);
  if (laugh >= 0) { const rise = Math.round(laugh * 10), col = laugh < 0.7 ? SCT : SC2; bt(sp, 'HA', x0 + 39, y0 + 12 - rise, 1, col, { sh: [20, 4, 4] }); if (laugh > 0.3) bt(sp, 'HA', x0 + 2, y0 + 20 - Math.round((laugh - 0.3) * 10), 1, laugh < 0.85 ? SC1 : SC2, { sh: [20, 4, 4] }); }
}
function visBox(x0, y0, tn) { for (let y = 1; y < 51; y++) for (let x = 1; x < 51; x++) sp(x0 + x, y0 + y, y % 2 ? SCB1 : SCB2); const bs = bands(10, tn), base = y0 + 51; for (let k = 0; k < 10; k++) { const h = Math.max(1, Math.round(bs[k] * 48)), x1 = x0 + 1 + k * 5; for (let y = base - h; y < base; y++) for (let x = x1; x < x1 + 4; x++) sp(x, y, y === base - h ? SCT : (y % 2 ? SC2 : SC1)); } }
function btnBase(id, x, y, w, h) { const hv = hover === id, pd = press === id; for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const e = yy === y || yy === y + h - 1 || xx === x || xx === x + w - 1; if (e) sp(xx, yy, hv || pd ? SCT : SC2); else if (pd) sp(xx, yy, SC1); } hits.push({ id, x: SX + x, y: SY + y, w, h }); return pd ? SCB1 : (hv ? SCT : SC1); }
function btn(id, x, y, w, h, p) { const c = btnBase(id, x, y, w, h); patt(p, x + ((w - p[0].length) >> 1), y + ((h - p.length) >> 1), c); }
function btnText(id, x, y, w, h, s) { const c = btnBase(id, x, y, w, h); bt(sp, s, x + ((w - bw(s, 1)) >> 1), y + ((h - 9) >> 1), 1, c); }
function hud(tn) {
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) sp(x, y, y % 2 ? SCB1 : SCB2);
  const now = performance.now();
  if (toastMsg && now < toastUntil) marq(sp, toastMsg, 4, 2, 150, SCT, tn, SHD);
  else { toastMsg = null; bt(sp, 'NOW PLAYING', 4, 2, 1, SC2, { sh: SHD2 }); if (queue.length) { const tk = (qi + 1) + '/' + queue.length; bt(sp, tk, 154 - bw(tk, 1), 2, 1, SC2, { sh: SHD2 }); } }
  for (let x = 4; x < 154; x += 2) sp(x, 13, SCD);
  if (mode === 'art') coverArt(4, 16, cur); else visBox(4, 16, tn);
  for (let i = 0; i < 52; i++) { sp(4 + i, 16, SC2); sp(4 + i, 67, SC2); sp(4, 16 + i, SC2); sp(55, 16 + i, SC2); }
  const rows = cur ? [[ICN.note, norm(cur.title), SCT], [ICN.artist, norm(cur.artist), SC1], [ICN.album, norm(cur.album), SC1], [ICN.year, cur.year || '-', SC1]]
    : [[ICN.note, 'NOTHING ON', SCT], [ICN.artist, amUnsigned ? 'SET UP BELOW' : amReady && !amAuth ? 'SIGN IN BELOW' : 'OPEN DRAWER', SC2], [ICN.album, amLoading ? 'LOADING ' + amCount + ' SONGS' : '', SC2], [ICN.year, '', SC2]];
  rows.forEach(([ic, v, c], k) => { const y = 16 + k * 10; patt(ic, 61, y + 1, SC2); if (v) marq(sp, v, 71, y, 83, c, tn + k * 0.7, SHD); });
  if (pb.playing || Math.floor(tn * 2) % 2 === 0) bt(sp, fmt(pb.time), 61, 57, 2, SCT, { sh: SHD });
  const tot = '/' + fmt(pb.dur); bt(sp, tot, 154 - bw(tot, 1), 66, 1, SC2, { sh: SHD2 });
  const wx0 = 4, wx1 = 154, ww = wx1 - wx0, frac = pb.dur > 0 ? Math.min(1, pb.time / pb.dur) : 0, kx = wx0 + Math.round(frac * (ww - 1)), wy = 81;
  for (let x = wx0; x < wx1; x++) { const s = Math.round(Math.sin(x * 0.9) * 0.6); sp(x, wy + s, x <= kx ? SC1 : SCD); }
  for (let x = wx0 + 4; x < wx1; x += 8) { const c = x <= kx ? SC2 : SCD; sp(x - 1, wy - 2, c); sp(x + 1, wy - 2, c); sp(x - 1, wy + 2, c); sp(x + 1, wy + 2, c); }
  for (let a = -1; a < 2; a++) for (let b = -1; b < 2; b++) sp(kx + a, wy + b, hover === 'seek' ? [255, 230, 230] : SCK);
  hits.push({ id: 'seek', x: SX + wx0, y: SY + wy - 3, w: ww, h: 7 });
  btn('prev', 82, 86, 13, 12, PREV); btn('play', 98, 86, 15, 12, pb.playing ? PAUSE : PLAY); btn('next', 116, 86, 13, 12, NEXT); btnText('tog', 4, 86, 52, 12, mode === 'art' ? 'SHOW VIS' : 'SHOW ART'); btn('search', 133, 86, 21, 12, MAG);
}
function screen(q, tn) { if (q >= 1 && setOpen) { settingsScreen(); return; } if (q < 1) { const cxm = SW / 2, cym = SH / 2; let w, h; if (q < 0.35) { w = Math.max(2, SW * q / 0.35); h = 1; } else { w = SW; h = Math.max(1, SH * (q - 0.35) / 0.65); } const y0 = Math.round(cym - h / 2), y1 = y0 + Math.max(1, Math.round(h)), x0 = Math.round(cxm - w / 2), x1 = x0 + Math.round(w); for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) sp(x, y, h < 3 ? SCL : (y % 2 ? SCB1 : SCB2)); return; } hud(tn); }

// ---------- drawer contents ----------
const TABS = ['ARTISTS', 'ALBUMS', 'SONGS', 'RECENT'];
let searchQ = null, searchCache = { q: null, lib: null, res: [] };
const MAG = ["0111000", "1000100", "1000100", "1000100", "0111100", "0000110", "0000011"];
function startSearch() { searchQ = ''; scroll = 0; view = null; if (!drOpen) openDrawer(true); dirty(); }
function endSearch() { searchQ = null; scroll = 0; dirty(); }
function searchResults() {
  const q = norm(searchQ || '').trim();
  if (!q) return [];
  if (searchCache.q === q && searchCache.lib === lib) return searchCache.res;
  const toks = q.split(/\s+/).filter(Boolean), out = [];
  for (const s of lib.songs) {
    const hay = s.T + ' ' + s.A + ' ' + s.L;
    if (!toks.every((t) => hay.includes(t))) continue;
    const score = s.T.startsWith(q) ? 0 : s.T.includes(q) ? 1 : s.A.startsWith(q) ? 2 : s.A.includes(q) ? 3 : 4;
    out.push([score, s]);
  }
  out.sort((a, b) => a[0] - b[0] || (a[1].sortT < b[1].sortT ? -1 : 1));
  const res = out.slice(0, 400).map((r) => r[1]);
  searchCache = { q, lib, res };
  return res;
}
let tab = 'SONGS', view = null, scroll = 0, drOpen = false, drT = 0, sbDrag = null;
const scrolls = {};
function openDrawer(v) { if (drOpen === v) return; drOpen = v; if (!v) searchQ = null; drawerSfx(); dirty(); }
function setTab(t) { scrolls[viewKey()] = scroll; tab = t; view = null; scroll = scrolls[viewKey()] || 0; API.setSettings({ tab }); dirty(); }
function viewKey() { return tab + (view ? ':' + view.kind + ':' + view.key : ''); }
function currentRows() {
  const rows = [];
  if (searchQ !== null) {
    const res = searchResults();
    if (!norm(searchQ).trim()) rows.push({ kind: 'info', label: 'TYPE A SONG, ARTIST OR ALBUM' });
    else if (!res.length) rows.push({ kind: 'info', label: 'NO MATCHES' });
    res.forEach((s, i) => rows.push({ kind: 'song', s, list: res, i, label: s.T, right: fmt2(s.duration) }));
    return rows;
  }
  if (!view) {
    if (amUnsigned) rows.push({ kind: 'action', label: 'SET UP APPLE MUSIC', act: 'setup' });
    else if (amOffline) rows.push({ kind: 'action', label: 'APPLE MUSIC OFFLINE - RETRY', act: 'retry' });
    else if (amReady && !amAuth) rows.push({ kind: 'action', label: cdmOk ? 'SIGN IN TO APPLE MUSIC' : 'APPLE MUSIC NOT AVAILABLE', act: 'signin' });
    else if (!amReady && performance.now() - bootAt > 20000) rows.push({ kind: 'action', label: 'OPEN APPLE MUSIC WINDOW', act: 'showam' });
    if (amLoading) rows.push({ kind: 'info', label: 'LOADING APPLE MUSIC ' + amCount });
    if (localScan) rows.push({ kind: 'info', label: 'READING MP3S ' + localScan.done + '/' + localScan.total });
    if (!localFolder) rows.push({ kind: 'action', label: '+ ADD YOUR MP3 FOLDER', act: 'folder' });
  }
  if (view) {
    rows.push({ kind: 'back', label: '< ' + view.title });
    view.list.forEach((s, i) => rows.push({ kind: 'song', s, list: view.list, i, label: norm(s.title), right: fmt2(s.duration) }));
    return rows;
  }
  if (tab === 'ARTISTS') lib.artists.forEach(a => rows.push({ kind: 'artist', a, label: a.name, right: String(a.songs.length) }));
  else if (tab === 'ALBUMS') lib.albums.forEach(a => rows.push({ kind: 'album', a, label: a.name, right: a.year || '' }));
  else { const list = tab === 'SONGS' ? lib.songs : lib.recent; list.forEach((s, i) => rows.push({ kind: 'song', s, list, i, label: s.T, right: fmt2(s.duration) })); }
  if (rows.length === 0) rows.push({ kind: 'info', label: tab === 'RECENT' ? 'NOTHING ADDED RECENTLY' : 'NO MUSIC YET' });
  return rows;
}
function rowAction(r) {
  if (r.kind === 'song') playList(r.list, r.i);
  else if (r.kind === 'artist') { scrolls[viewKey()] = scroll; view = { kind: 'artist', key: r.a.name, title: r.a.name, list: r.a.songs }; scroll = 0; }
  else if (r.kind === 'album') { scrolls[viewKey()] = scroll; view = { kind: 'album', key: r.a.name + r.a.artist, title: r.a.name, list: r.a.songs }; scroll = 0; }
  else if (r.kind === 'back') { view = null; scroll = scrolls[viewKey()] || 0; }
  else if (r.act === 'signin') { if (cdmOk) API.showAppleMusic(true); else toast('WIDEVINE FAILED TO INSTALL. CHECK YOUR INTERNET'); }
  else if (r.act === 'folder') pickFolder();
  else if (r.act === 'retry') { amOffline = false; API.reloadAppleMusic(); toast('RECONNECTING TO APPLE MUSIC'); }
  else if (r.act === 'showam') API.showAppleMusic(false);
  else if (r.act === 'setup') API.openSetup();
  dirty();
}
async function pickFolder() { const f = await API.pickFolder(); if (f) { localFolder = f; localFiles = []; localScan = { done: 0, total: 0 }; rebuildLibrary(); toast('READING YOUR MP3S'); } }
function drawDrawer(v, live, tn) {
  const e = drT < 0.5 ? 2 * drT * drT : 1 - Math.pow(-2 * drT + 2, 2) / 2, off = Math.round(e * TRAYH), fy = DRY + off, top = fy - TRAYH;
  DECO.forEach((y, i) => { slot(y, v); drawFront(decoF[i], y, v); });
  slot(DRY, v);
  for (let y = DRY; y < fy; y++) for (let x = DRX0; x < DRX1; x++) { if (v && !v(orank(x, y))) continue; const lx = x - DRX0; let c; if (lx < 3 || lx >= DRW - 3) c = (lx === 0 || lx === DRW - 3) ? [196, 202, 210] : (lx === 2 || lx === DRW - 1) ? [40, 42, 48] : [136, 143, 152]; else c = shT[(y - top) * SHW + (lx - 3)]; oput(x, y, c); }
  if (off > 2 && live) {
    const clip = (x, y, c) => { if (y >= DRY && y < fy && x >= DRX0 + 3 && x < DRX1 - 3) oput(x, y, c); };
    // tabs, or the search line while searching
    const ws = TABS.map(t => bw(t, 1)), gap = Math.floor((SHW - 6 - ws.reduce((a, b) => a + b, 0)) / 3);
    let tx = DRX0 + 6; const ty = top + 2;
    if (searchQ !== null) {
      patt(MAG, DRX0 + 6, ty + 1, INK, clip);
      const qs = norm(searchQ), qx = DRX0 + 16, qmax = DRX1 - 22, qw = bw(qs, 1), sx = qw > qmax - qx - 4 ? qmax - 4 - qw : qx;
      bt(clip, qs, sx, ty, 1, INK, { c0: qx, c1: qmax });
      if (Math.floor(performance.now() / 450) % 2 === 0) for (let y = ty; y < ty + 9; y++) { clip(Math.min(qmax - 2, sx + qw + 2), y, BL[2]); }
      const xh = hover === 'search-x'; bt(clip, 'X', DRX1 - 15, ty, 1, xh ? BL[3] : [110, 96, 86]);
      if (drT > 0.95) hits.push({ id: 'search-x', x: DRX1 - 18, y: ty - 1, w: 12, h: 12 });
      for (let x = qx; x < qmax; x++) clip(x, ty + 10, BL[2]);
    } else TABS.forEach((t, i) => { const sel = t === tab && !view, hv = hover === 'tab' + t; bt(clip, t, tx, ty, 1, sel ? INK : hv ? [70, 50, 44] : [130, 120, 108]); if (t === tab) for (let x = tx - 1; x < tx + ws[i] + 1; x++) if (hsh(x, 3, 1, 1) > 0.15) { clip(x, ty + 10, BL[2]); if (hsh(x, 4, 1, 1) > 0.5) clip(x, ty + 11, BL[1]); } if (drT > 0.95) hits.push({ id: 'tab' + t, x: tx - 2, y: ty - 1, w: ws[i] + 4, h: 13 }); tx += ws[i] + gap; });
    for (let x = DRX0 + 4; x < DRX1 - 4; x++) if (hsh(x, 9, 9, 1) > 0.3) clip(x, top + 14, [120, 106, 96]);
    const rows = currentRows(), maxScroll = Math.max(0, rows.length - ROWS); scroll = Math.max(0, Math.min(scroll, maxScroll));
    const rightEdge = DRX1 - 8;
    for (let r = 0; r < ROWS; r++) {
      const idx = scroll + r; if (idx >= rows.length) break; const row = rows[idx], ry = top + 17 + r * RH; if (ry + 9 < DRY || ry >= fy) continue;
      const isP = row.kind === 'song' && sameSong(row.s, cur), hv = hover === 'row' + idx;
      if (isP) for (let y = ry - 1; y < ry + 10; y++) for (let x = DRX0 + 4; x < DRX1 - 5; x++) if (hsh(x, y, 3, 1) > 0.25) clip(x, y, hsh(x, y, 4, 1) < 0.5 ? [178, 118, 108] : [190, 140, 128]);
      const ink = isP ? [120, 10, 10] : (row.kind === 'action' ? (hv ? BL[3] : [130, 20, 20]) : row.kind === 'info' ? [110, 100, 90] : hv ? [10, 4, 4] : [52, 24, 20]);
      let lx = DRX0 + 6;
      if (row.kind === 'song' && row.s.src === 'local') { patt(TOETAG, lx, ry + 1, [150, 120, 70], clip); lx += 8; }
      const rw = row.right ? bw(row.right, 1) : 0, rx = rightEdge - rw;
      if (row.kind === 'back' || row.kind === 'action' || row.kind === 'info') bt(clip, row.label, lx, ry, 1, ink, { c1: DRX1 - 6 });
      else marq(clip, row.label, lx, ry, rx - 5 - lx, ink, hv ? tn : 0);
      if (row.right) bt(clip, row.right, rx, ry, 1, ink);
      if (hv && !isP && row.kind !== 'info') for (let x = DRX0 + 6; x < DRX1 - 8; x += 2) clip(x, ry + 10, [90, 60, 54]);
      if (drT > 0.95 && row.kind !== 'info') hits.push({ id: 'row' + idx, x: DRX0 + 3, y: ry - 1, w: DRW - 10, h: RH, row });
    }
    // scrollbar on the right rail
    if (rows.length > ROWS && drT > 0.95) {
      const trackY = top + 16, trackH = TRAYH - 18, th = Math.max(6, Math.round(trackH * ROWS / rows.length)), ty2 = trackY + Math.round((trackH - th) * (scroll / maxScroll));
      for (let y = trackY; y < trackY + trackH; y++) clip(DRX1 - 5, y, [150, 140, 128]);
      for (let y = ty2; y < ty2 + th; y++) { clip(DRX1 - 6, y, BL[2]); clip(DRX1 - 5, y, BL[3]); clip(DRX1 - 4, y, BL[1]); }
      hits.push({ id: 'sbar', x: DRX1 - 8, y: trackY, w: 6, h: trackH, trackY, trackH, th, maxScroll });
    }
  }
  drawFront(drF, fy, v);
  if (live) { hits.push({ id: 'drawer', x: DRX0, y: fy, w: DRW, h: DRH }); hits.push({ id: 'mp3s', x: DRX0 + 118, y: fy + 1, w: 47, h: 14 }); }
}

// ---------- sound ----------
let ac = null;
function getAC() { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); return ac; }
function build(oc) {
  const M = oc.createGain(); M.gain.value = 0.7; M.connect(oc.destination);
  const sr = oc.sampleRate, nb = oc.createBuffer(1, sr, sr), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const noise = (at, dur, freq, q, v, atk, hold) => { const s = oc.createBufferSource(); s.buffer = nb; s.loop = true; const f = oc.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; const g = oc.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(v, at + atk); if (hold) g.gain.setValueAtTime(v, at + dur * 0.85); g.gain.exponentialRampToValueAtTime(0.001, at + dur); s.connect(f).connect(g).connect(M); s.start(at); s.stop(at + dur + 0.05); return f; };
  const tone = (at, dur, f1, f2, type, v) => { const o = oc.createOscillator(); o.type = type; o.frequency.setValueAtTime(f1, at); o.frequency.exponentialRampToValueAtTime(f2, at + dur); const g = oc.createGain(); g.gain.setValueAtTime(v, at); g.gain.exponentialRampToValueAtTime(0.001, at + dur); o.connect(g).connect(M); o.start(at); o.stop(at + dur + 0.05); };
  return { noise, tone };
}
function crush(d, sr, c, s, fade) {
  const hold = 1 + Math.round(c * 14), q = Math.pow(2, Math.round(12 - c * 9) - 1), drv = 1 + c * 6; let h = 0;
  for (let i = 0; i < d.length; i++) { if (i % hold === 0) h = Math.tanh(d[i] * drv); d[i] = Math.round(h * q) / q; }
  let env = 0; for (let i = 0; i < d.length; i++) { env = Math.max(Math.abs(d[i]), env * 0.9996); let v = d[i] + (Math.random() * 2 - 1) * s * (0.025 + env * 0.3); if (Math.random() < s * 0.0012) v += (Math.random() * 2 - 1) * 0.7 * s; d[i] = v; }
  const gl = Math.round(s * 16 * d.length / (sr * 5)); for (let k = 0; k < gl; k++) { const p = Math.floor(Math.random() * d.length * 0.9), L = Math.floor(sr * (0.01 + Math.random() * 0.05)); if (Math.random() < 0.5) { for (let i = p; i < p + L && i < d.length; i++) d[i] *= 0.05; } else { const seg = Math.max(1, L >> 2); for (let i = p + seg; i < p + L && i < d.length; i++) d[i] = d[p + ((i - p) % seg)]; } }
  const fo = Math.floor(sr * Math.min(0.3, d.length / sr * 0.3)); for (let i = 0; i < d.length; i++) { let a = 0.85; if (fade) { if (i < fo * 0.3) a *= i / (fo * 0.3); if (i > d.length - fo) a *= (d.length - i) / fo; } d[i] = Math.max(-1, Math.min(1, d[i] * a)); }
}
let sfxCrunch = 0.7, sfxStatic = 0.7, introSrc = null, fxVolume = 35;
// Sound effects (intro, drawer) have their own level, set with the barbed-wire gear.
const fxGain = () => fxVolume / 100;
async function playFx(seconds, fn, staticMul) {
  try {
    const a = getAC(), sr = a.sampleRate, oc = new OfflineAudioContext(1, Math.round(sr * seconds), sr); fn(oc);
    const buf = await oc.startRendering(); crush(buf.getChannelData(0), sr, sfxCrunch, sfxStatic * (staticMul || 1), true);
    const b = a.createBufferSource(), g = a.createGain(); g.gain.value = fxGain(); b.buffer = buf; b.connect(g).connect(a.destination); b.start(); return b;
  } catch { return null; }
}
const T = { din: [0.3, 1.1], rat: [1.2, 1.45], open: [1.55, 2.4], fout: [2.5, 2.8], name: [2.9, 3.8], bez: [3.9, 4.3], scr: [4.4, 4.9] };
function introSfx(oc) {
  const { noise, tone } = build(oc);
  [1.22, 1.3, 1.38].forEach(a => { noise(a, 0.08, 1800, 3, 0.3, 0.005); tone(a, 0.1, 180, 90, 'square', 0.05); });
  const gf = noise(T.open[0], T.open[1] - T.open[0], 500, 2, 0.4, 0.12, true); for (let k = 0; k < 22; k++) gf.frequency.setValueAtTime(300 + Math.random() * 600, T.open[0] + k * 0.04);
  tone(T.open[1], 0.45, 90, 40, 'sine', 0.7); noise(T.open[1], 0.15, 300, 1, 0.5, 0.003); tone(T.open[1] + 0.02, 0.35, 1250, 1180, 'triangle', 0.07);
  const a = T.name[0], b = T.name[1], o = oc.createOscillator(), lp = oc.createBiquadFilter(), g = oc.createGain(); o.type = 'sawtooth'; o.frequency.value = 58; lp.type = 'lowpass'; lp.frequency.value = 500; g.gain.value = 0; o.connect(lp).connect(g).connect(oc.destination); for (let k = 0; k < 12; k++) g.gain.setValueAtTime(Math.random() < k / 12 ? 0.06 : 0, a + k * 0.026); g.gain.setValueAtTime(0.04, a + 0.33); g.gain.setValueAtTime(0, a + (b - a) * 0.92); o.start(a); o.stop(b + 0.05);
  for (let k = 0; k < 12; k++) if (Math.random() < 0.6) noise(a + k * 0.026, 0.03, 3500, 0.7, 0.25, 0.002);
  noise(a + 0.33, (b - a) * 0.92 - 0.33, 4000, 0.5, 0.05, 0.01, true);
  tone(T.bez[0] + 0.1, 0.3, 140, 55, 'sine', 0.5); noise(T.bez[0] + 0.1, 0.1, 900, 2, 0.3, 0.003); tone(T.bez[0] + 0.12, 0.25, 1600, 1550, 'triangle', 0.05);
  tone(T.scr[0], 0.25, 220, 880, 'sine', 0.12);
}
function drawerSfx() { playFx(1.0, (oc) => { const { noise, tone } = build(oc); const gf = noise(0, 0.45, 350, 1.5, 0.35, 0.04, true); for (let k = 0; k < 12; k++) gf.frequency.setValueAtTime(250 + Math.random() * 500, k * 0.035); for (let k = 0; k < 5; k++) noise(0.05 + k * 0.08, 0.04, 2200, 4, 0.15, 0.003); tone(0.45, 0.5, 110, 45, 'sine', 0.6); noise(0.45, 0.1, 800, 1, 0.35, 0.003); tone(0.46, 0.35, 950, 920, 'triangle', 0.06); }, 0.5); }

// ---------- main loop ----------
const pr = (t, [a, b]) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const bootAt = performance.now();
let fireAcc = 0, lastRender = performance.now();
let fps = 60, st = performance.now(), last = -1, fl = 0, pnow = performance.now(), introDone = false;
const dirty = () => { last = -1; };
function frame(now) {
  const dt = Math.min(0.25, (now - pnow) / 1000); pnow = now;
  const raw = (now - st) / 1000; hudOn = raw >= T.scr[1];
  if (hudOn && !introDone) { introDone = true; startLoopback(); if (pendingToast) { toast(pendingToast, 8000); pendingToast = null; } }
  const tg = drOpen ? 1 : 0; if (drT !== tg) { drT = Math.max(0, Math.min(1, drT + Math.sign(tg - drT) * dt * 2.2)); }
  const fi = Math.floor(raw * fps);
  if (fi !== last) {
    last = fi; fl++; const t = fi / fps; let ob = 0; hits = []; clearAll();
    fireAcc += Math.min(0.5, (now - lastRender) / 1000) * 15; lastRender = now; let fsN = Math.min(8, Math.floor(fireAcc)); fireAcc -= fsN; while (fsN-- > 0) fireStep();
    if (t < T.din[0]) { }
    else if (t < T.rat[0]) { const p = pr(t, T.din), v = r => r < p; drawTile(v); drawInc(v); drawDoor(0, 0, v); ob = v; }
    else if (t < T.open[0]) { drawTile(); drawInc(); drawDoor(0, t < T.rat[1] ? (fl % 2 ? 1 : -1) : 0); ob = 1; }
    else if (t < T.fout[0]) { const p = pr(t, T.open), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; drawTile(); drawInc(); drawDoor(e, p < 1 ? fl % 2 : 0); ob = 1; }
    else if (t < T.fout[1]) { const p = pr(t, T.fout), v = r => r >= p; drawTile(v); drawInc(v); drawDoor(1, 0, v); ob = v; }
    else if (t < T.name[0]) { }
    else if (t < T.name[1]) { const p = pr(t, T.name); if (p < 0.35 ? hsh(Math.floor(t * 15), 7, 7, 7) < p / 0.35 * 0.9 : p < 0.92) enter(); }
    else if (t < T.bez[0]) { }
    else if (t < T.bez[1]) { const p = pr(t, T.bez), v = r => r < p; drawTile(v); drawInc(v); drawDrawer(v, false, 0); drawBez(v); ob = v; }
    else if (t < T.scr[0]) { drawTile(); drawInc(); drawDrawer(null, false, 0); drawBez(); ob = 1; }
    else { const tn = now / 1000; drawTile(); drawInc(); drawDrawer(null, true, tn); drawBez(); screen(pr(t, T.scr), tn); ob = 1; }
    if (ob) { const v = ob === 1 ? null : ob; drawWire(v); if (ob === 1) bugs(t); drawBarbs(v); if (ob === 1) firelight(); }
    if (hudOn) { winButtons(); gear(); }
    cx.putImageData(img, 0, 0);
  }
  requestAnimationFrame(frame);
}

// ---------- input ----------
const toPix = (e) => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / r.width * OW), Math.floor((e.clientY - r.top) / r.height * OH)]; };
const hitAt = (x, y) => { for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) return h; } return null; };
const inInc = (x, y) => (x >= IX0 && x < IX1 && y >= IY0 && y < IY1) || (x >= FLX0 && x < FLX1 && y >= 8 && y < IY0);
const inTray = (x, y) => drT > 0.95 && x >= DRX0 && x < DRX1 && y >= DRY && y < DRY + TRAYH;
let volSave = null;
function setVol(n) { vol = Math.max(0, Math.min(100, Math.round(n))); applyVol(); clearTimeout(volSave); volSave = setTimeout(() => API.setSettings({ vol }), 400); dirty(); }
function seekToX(x) { const f = Math.min(1, Math.max(0, (x - (SX + 4)) / 149)); seek(f * (pb.dur || 0)); }
let lastY = 0, dragging = false;
function act(h) {
  const id = h.id;
  if (id === 'play') toggle(); else if (id === 'prev') prev(); else if (id === 'next') next();
  else if (id === 'tog') { mode = mode === 'art' ? 'vis' : 'art'; API.setSettings({ mode }); }
  else if (id === 'drawer') openDrawer(!drOpen);
  else if (id === 'mp3s') pickFolder();
  else if (id === 'min') API.minimize(); else if (id === 'close') API.close();
  else if (id === 'gear') setOpen = !setOpen;
  else if (id === 'search') { if (searchQ === null) startSearch(); else endSearch(); }
  else if (id === 'search-x') endSearch();
  else if (id === 'set:done') setOpen = false;
  else if (id === 'set:test') replayIntro();
  else if (id === 'set:upd') updAct();
  else if (id === 'set:intro') { introOn = !introOn; API.setSettings({ intro: introOn }); }
  else if (id === 'set:size-') API.scale(-1); else if (id === 'set:size+') API.scale(1);
  else if (id.startsWith('tab')) setTab(id.slice(3));
  else if (id.startsWith('row') && h.row) rowAction(h.row);
  dirty();
}
cv.addEventListener('pointermove', (e) => {
  const [x, y] = toPix(e);
  if (press === 'inc') { setVol(vol + (lastY - y) * 1.5); lastY = y; return; }
  if (slDrag && press && press.startsWith('set:') && press !== 'set:intro') { const h = hits.find((q) => q.id === press); if (h && h.srow) setSlider(h, x); return; }
  if (press === 'sbar' && sbDrag) { const f = (y - sbDrag.trackY - sbDrag.th / 2) / Math.max(1, sbDrag.trackH - sbDrag.th); scroll = Math.round(Math.max(0, Math.min(1, f)) * sbDrag.maxScroll); dirty(); return; }
  if (press === 'seek') { seekToX(x); return; }
  if (dragging) return;
  const h = hudOn ? hitAt(x, y) : null, id = h ? h.id : null;
  if (id !== hover) { hover = id; dirty(); }
  cv.style.cursor = !hudOn ? 'pointer' : inInc(x, y) ? 'ns-resize' : h ? 'pointer' : 'default';
});
cv.addEventListener('pointerleave', () => { if (!press && !dragging) { hover = null; dirty(); } });
cv.addEventListener('pointerdown', (e) => {
  startLoopback(); getAC();
  if (!hudOn) { if (introSrc) { try { introSrc.stop(); } catch { } } st = performance.now() - T.scr[1] * 1000; dirty(); return; }
  const [x, y] = toPix(e);
  try { cv.setPointerCapture(e.pointerId); } catch { }
  const h = hitAt(x, y);
  if (h) { press = h.id; if (h.srow) setSlider(h, x); if (h.id === 'seek') seekToX(x); if (h.id === 'sbar') { sbDrag = h; const f = (y - h.trackY - h.th / 2) / Math.max(1, h.trackH - h.th); scroll = Math.round(Math.max(0, Math.min(1, f)) * h.maxScroll); } dirty(); return; }
  if (inInc(x, y)) { press = 'inc'; lastY = y; return; }
  dragging = true; API.dragStart({ x: e.screenX - window.screenX, y: e.screenY - window.screenY });
});
cv.addEventListener('pointerup', (e) => {
  if (dragging) { dragging = false; API.dragEnd(); return; }
  const was = press; press = null; sbDrag = null; slDrag = null;
  if (was && was !== 'seek' && was !== 'inc' && was !== 'sbar' && !/^set:(fps|fx|crunch|static)$/.test(was)) { const [x, y] = toPix(e), h = hitAt(x, y); if (h && h.id === was) act(h); }
  dirty();
});
cv.addEventListener('lostpointercapture', () => { if (dragging) { dragging = false; API.dragEnd(); } });
cv.addEventListener('wheel', (e) => {
  if (!hudOn) return; const [x, y] = toPix(e);
  if (inInc(x, y)) { e.preventDefault(); setVol(vol + (e.deltaY < 0 ? 5 : -5)); }
  else if (inTray(x, y)) { e.preventDefault(); scroll += (e.deltaY > 0 ? 3 : -3); if (scroll < 0) scroll = 0; dirty(); }
}, { passive: false });
window.addEventListener('keydown', (e) => {
  startLoopback();
  if (!hudOn) { st = performance.now() - T.scr[1] * 1000; dirty(); return; }
  if (searchQ !== null) {
    if (e.key === 'Escape') { endSearch(); return; }
    if (e.key === 'Enter') { const r = searchResults(); if (r.length) playList(r, 0); return; }
    if (e.key === 'Backspace') { e.preventDefault(); searchQ = searchQ.slice(0, -1); scroll = 0; dirty(); return; }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); if (searchQ.length < 40) searchQ += e.key; scroll = 0; dirty(); return; }
  }
  if (e.ctrlKey && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); startSearch(); return; }
  if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) { if (API.showAppleMusicWindow) API.showAppleMusicWindow(); return; }
  if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) { if (API.openLog) API.openLog(); return; }
  if (e.ctrlKey && (e.key === '=' || e.key === '+')) { API.scale(1); return; }
  if (e.ctrlKey && e.key === '-') { API.scale(-1); return; }
  switch (e.key) {
    case ' ': e.preventDefault(); toggle(); break;
    case 'ArrowRight': seek(pb.time + 5); break;
    case 'ArrowLeft': seek(pb.time - 5); break;
    case 'ArrowUp': if (drOpen) { scroll = Math.max(0, scroll - 1); dirty(); } else setVol(vol + 5); break;
    case 'ArrowDown': if (drOpen) { scroll++; dirty(); } else setVol(vol - 5); break;
    case 'PageUp': scroll = Math.max(0, scroll - ROWS); dirty(); break;
    case 'PageDown': scroll += ROWS; dirty(); break;
    case 'n': case 'N': next(); break;
    case 'p': case 'P': prev(); break;
    case 'd': case 'D': openDrawer(!drOpen); break;
    case 'Escape': if (setOpen) { setOpen = false; dirty(); } else if (view) { view = null; dirty(); } else openDrawer(false); break;
    case '+': case '=': setVol(vol + 5); break;
    case '-': setVol(vol - 5); break;
  }
});
window.addEventListener('paste', (e) => { if (searchQ === null) return; const t = (e.clipboardData && e.clipboardData.getData('text')) || ''; searchQ = (searchQ + t.replace(/\s+/g, ' ')).slice(0, 40); scroll = 0; dirty(); });
API.onMediaKey((a) => { if (a === 'toggle') toggle(); else if (a === 'next') next(); else if (a === 'prev') prev(); else if (a === 'stop') stopAll(); });

// ---------- Apple Music events ----------
API.onAm((m) => {
  if (!m) return;
  switch (m.type) {
    case 'cdm': cdmOk = true; break;
    case 'unsigned': amUnsigned = true; dirty(); break;
    case 'ready': amReady = true; amOffline = false; amAuth = !!m.authorized; applyVol(); dirty(); break;
    case 'auth': amAuth = !!m.authorized; if (amAuth) toast('SIGNED IN TO APPLE MUSIC'); dirty(); break;
    case 'progress': amLoading = true; amCount = m.count; dirty(); break;
    case 'library': amLoading = false; amSongs = m.songs || []; amRecent = m.recent || []; rebuildLibrary(); if (amSongs.length) toast(amSongs.length + ' APPLE MUSIC SONGS LOADED'); break;
    case 'state':
      if (amActive && cur && cur.src === 'am') {
        pb.playing = !!m.playing; pb.time = m.time || 0; if (m.duration) pb.dur = m.duration;
        if (m.item && m.item.art && !cur.art) { cur.art = m.item.art; loadArt(cur); }
        dirty();
      }
      break;
    case 'ended': if (amActive && cur && cur.src === 'am') next(); break;
    case 'error':
      if (amUnsigned) { console.warn('Apple Music (unsigned): ' + JSON.stringify(m)); break; }
      if (m.where === 'widevine') { cdmOk = false; toast('WIDEVINE FAILED. APPLE MUSIC WILL NOT PLAY'); }
      else if (m.where === 'playSong' || m.where === 'playback') { toast("APPLE MUSIC WON'T PLAY THIS. IS THE APP SIGNED?", 6000); }
      else if (m.where === 'library') { amLoading = false; toast("COULDN'T LOAD YOUR APPLE MUSIC LIBRARY", 6000); }
      else if (m.where === 'playback-check') toast("APPLE MUSIC DIDN'T START. CTRL+SHIFT+L OPENS THE LOG", 8000);
      else if (m.where === 'load') { amOffline = true; toast('APPLE MUSIC IS OFFLINE', 5000); }
      console.warn('Apple Music: ' + JSON.stringify(m));
      dirty(); break;
  }
});
API.onLocal((l) => { localScan = null; localFolder = l.folder; localFiles = l.files || []; rebuildLibrary(); });
API.onLocalProgress((p) => { localScan = p; dirty(); });
API.onLocalError((e) => { localScan = null; toast("COULDN'T READ THAT FOLDER"); console.warn(e); });

// ---------- start ----------
(async function boot() {
  try {
    const s = await API.getSettings();
    vol = Number.isFinite(s.vol) ? s.vol : 60; fps = Math.max(2, Math.min(60, s.fps || 60)); sfxCrunch = (s.crunch ?? 70) / 100; sfxStatic = (s.static ?? 70) / 100; fxVolume = Number.isFinite(s.fxVolume) ? Math.max(0, Math.min(100, s.fxVolume)) : 35;
    if (TABS.includes(s.tab)) tab = s.tab; if (s.mode === 'vis' || s.mode === 'art') mode = s.mode;
    introOn = s.intro !== false;
    if (s.intro === false) st = performance.now() - T.scr[1] * 1000;
    const l = await API.getLocal(); localFolder = l.folder; localFiles = l.files || []; rebuildLibrary();
    if (s.intro !== false) playFx(5.4, introSfx).then(b => { introSrc = b; });
    if (API.updateGet) {
      API.onUpdate(onUpd);
      const u = await API.updateGet(); onUpd(u);
      if (u && s.lastVersion !== u.version) { if (s.lastVersion) pendingToast = 'UPDATED TO ' + u.version; API.setSettings({ lastVersion: u.version }); }
    }
  } catch (e) { console.error(e); }
  applyVol();
  requestAnimationFrame(frame);
  cv.focus();
})();
