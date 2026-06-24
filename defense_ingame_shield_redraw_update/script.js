const BUILD_VERSION = "20260624-27-ingame-shield";
console.log("tactical defense build:", BUILD_VERSION);

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

ctx.imageSmoothingEnabled = false;

const W = canvas.width;
const H = canvas.height;
const TILE = 32;
const COLS = W / TILE;
const ROWS = H / TILE;
const T = (n) => n * TILE;
const centerOfTile = (col, row) => ({ x: T(col) + TILE / 2, y: T(row) + TILE / 2 });
const tileKey = (col, row) => `${col},${row}`;

const HERO_TYPES = {
  melee: {
    name: "방패 메이든",
    shortName: "방패병",
    install: "ground",
    maxHp: 160,
    attack: 18,
    attackDelay: 0.65,
    cost: 1,
    body: "#3d72d8",
    hat: "#f3f7ff",
    description: "땅 타일에 설치 / 지상 적을 막고 전투 / 코스트 1",
  },
  ranged: {
    name: "원거리 유닛",
    shortName: "원거리",
    install: "hill",
    maxHp: 90,
    attack: 14,
    attackDelay: 0.75,
    cost: 3,
    range: TILE * 5,
    body: "#7a65d1",
    hat: "#5a41a6",
    description: "언덕 타일에 설치 / 공중 적 우선, 지상 적도 공격 / 코스트 3",
  },
};

const ENEMY_TYPES = {
  ground: {
    name: "지상 적",
    maxHp: 80,
    attack: 10,
    attackDelay: 0.9,
    speed: 42,
    baseDamage: 10,
    body: "#cf553b",
  },
  air1: {
    name: "공중 적 air1",
    maxHp: 62,
    attack: 8,
    attackDelay: 0.85,
    speed: 56,
    baseDamage: 12,
    range: TILE * 2.5,
    body: "#8c5bd6",
    label: "AIR1",
  },
  air2: {
    name: "공중 적 air2",
    maxHp: 72,
    attack: 9,
    attackDelay: 0.9,
    speed: 52,
    baseDamage: 14,
    range: TILE * 2.5,
    body: "#d96bb6",
    label: "AIR2",
  },
};

const state = {
  wave: 1,
  timer: 40,
  castleHp: 100,
  courage: 0,
  coins: 25,
  cost: 3,
  costFloat: 3,
  maxCost: 10,
  costRegenPerSecond: 1,
  selectedHero: "melee",
  placedHeroes: [],
  enemies: [],
  hoveredTile: null,
  message: "1: 방패병(코스트1), 2: 원거리(코스트3). 코스트는 1초마다 1씩 회복됩니다.",
  nextHeroId: 1,
  nextEnemyId: 1,
  spawnQueue: [],
  spawnIndex: 0,
  spawnTimer: 0,
  waveRunning: true,
  nextWaveTimer: 0,
  gameOver: false,
  gameClear: false,
  kills: 0,
  escaped: 0,
  lastTime: performance.now(),
  groundRouteCursor: 0,
};

const MAP = {
  topRiver: { x: 0, y: T(3), w: W, h: T(2) },
  leftRiver: { x: 0, y: T(5), w: T(3), h: T(12) },
  bottomRiver: { x: 0, y: T(17), w: W, h: T(2) },
  pathZone: { x: T(3), y: T(5), w: T(24), h: T(12), name: "몬스터 이동 경로" },
  bridge: { x: T(23), y: T(15), w: T(3), h: T(2) },
  gate: { x: T(3), y: T(5), w: T(2), h: T(2) },
  banner: { x: T(26), y: T(3), w: T(3), h: T(4) },
  enemyBase: { col: 4, row: 6 },
  playerBase: { col: 24, row: 16 },
};

const defenseZones = [
  { x: T(8), y: T(6), w: T(14), h: T(4), name: "북쪽 방어 언덕" },
  { x: T(8), y: T(11), w: T(14), h: T(4), name: "남쪽 방어 언덕" },
];

function makeGroundRoute(name, waypoints) {
  const route = [];

  waypoints.forEach((point, index) => {
    if (index === 0) {
      route.push({ ...centerOfTile(point.col, point.row), col: point.col, row: point.row, routeName: name });
      return;
    }

    const prev = waypoints[index - 1];
    const dc = Math.sign(point.col - prev.col);
    const dr = Math.sign(point.row - prev.row);
    if (dc !== 0 && dr !== 0) {
      throw new Error(`${name}에 대각선 이동 구간이 있습니다: (${prev.col},${prev.row}) -> (${point.col},${point.row})`);
    }

    let col = prev.col;
    let row = prev.row;
    while (col !== point.col || row !== point.row) {
      col += dc;
      row += dr;

      const blockedByHill = defenseZones.some((zone) => {
        const left = zone.x / TILE;
        const top = zone.y / TILE;
        const right = left + zone.w / TILE - 1;
        const bottom = top + zone.h / TILE - 1;
        return col >= left && col <= right && row >= top && row <= bottom;
      });

      if (blockedByHill) {
        throw new Error(`${name}이 언덕 타일을 지나갑니다: (${col},${row})`);
      }

      route.push({ ...centerOfTile(col, row), col, row, routeName: name });
    }
  });

  return route;
}

const GROUND_ROUTES = [
  makeGroundRoute("제일 위 길목", [
    { col: 4, row: 6 },
    { col: 6, row: 6 },
    { col: 6, row: 5 },
    { col: 22, row: 5 },
    { col: 22, row: 16 },
    { col: 24, row: 16 },
  ]),
  makeGroundRoute("가운데 길목", [
    { col: 4, row: 6 },
    { col: 7, row: 6 },
    { col: 7, row: 10 },
    { col: 22, row: 10 },
    { col: 22, row: 16 },
    { col: 24, row: 16 },
  ]),
  makeGroundRoute("맨 아래 길목", [
    { col: 4, row: 6 },
    { col: 7, row: 6 },
    { col: 7, row: 16 },
    { col: 24, row: 16 },
  ]),
];

const AIR_TARGETS = [
  centerOfTile(23, 15),
  centerOfTile(24, 16),
  centerOfTile(25, 16),
];

const blockedDecorTiles = new Set([
  "3,5", "4,5", "3,6", "4,6",
  "23,15", "24,15", "25,15", "23,16", "24,16", "25,16",
  "26,3", "27,3", "28,3", "26,4", "27,4", "28,4", "26,5", "27,5", "28,5", "26,6", "27,6", "28,6", "24,7",
  "8,2", "9,2", "8,3", "9,3",
]);

const uiBlockRects = [
  { x: 30, y: 16, w: 90, h: 90 },
  { x: 340, y: 0, w: 280, h: 132 },
  { x: 840, y: 16, w: 92, h: 92 },
  { x: 0, y: 536, w: W, h: 104 },
];

const heroButtons = {
  melee: { x: 304, y: 590, w: 158, h: 46 },
  ranged: { x: 494, y: 590, w: 158, h: 46 },
};

function rect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function strokeRect(x, y, w, h, color, lineWidth = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function text(value, x, y, size = 16, color = "#fff", align = "left") {
  ctx.fillStyle = color;
  ctx.font = `700 ${size}px monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(value, Math.round(x), Math.round(y));
}

function drawTileGridArea(x, y, w, h, stroke = "rgba(255,255,255,0.06)") {
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  for (let gx = x; gx <= x + w; gx += TILE) {
    ctx.beginPath();
    ctx.moveTo(gx, y);
    ctx.lineTo(gx, y + h);
    ctx.stroke();
  }
  for (let gy = y; gy <= y + h; gy += TILE) {
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x + w, gy);
    ctx.stroke();
  }
  ctx.restore();
}

function polygon(points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(Math.round(points[0].x), Math.round(points[0].y));
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(Math.round(points[i].x), Math.round(points[i].y));
  }
  ctx.closePath();
  ctx.fill();
}

function drawFloorTile(x, y, base, alt, line = "rgba(255,255,255,0.08)") {
  const col = x / TILE;
  const row = y / TILE;
  rect(x, y, TILE, TILE, (col + row) % 2 === 0 ? base : alt);
  rect(x + 2, y + TILE - 3, TILE - 4, 2, "rgba(0,0,0,0.12)");
  rect(x + TILE - 3, y + 2, 2, TILE - 4, "rgba(0,0,0,0.10)");
  strokeRect(x, y, TILE, TILE, line, 1);
}

function drawHazardStripe(x, y, w, h) {
  rect(x, y, w, h, "#2b2d33");
  for (let i = -h; i < w; i += 16) {
    polygon([
      { x: x + i, y },
      { x: x + i + 8, y },
      { x: x + i + 8 + h, y: y + h },
      { x: x + i + h, y: y + h },
    ], "#e2b94d");
  }
  strokeRect(x, y, w, h, "rgba(0,0,0,0.45)", 1);
}

function drawRaisedBlock(x, y, w, h, height, topA, topB, side, front) {
  rect(x + height, y + height + 4, w, h, "rgba(0,0,0,0.28)");
  polygon([
    { x: x + w, y },
    { x: x + w + height, y: y + height },
    { x: x + w + height, y: y + h + height },
    { x: x + w, y: y + h },
  ], side);
  polygon([
    { x, y: y + h },
    { x: x + w, y: y + h },
    { x: x + w + height, y: y + h + height },
    { x: x + height, y: y + h + height },
  ], front);

  for (let ty = y; ty < y + h; ty += TILE) {
    for (let tx = x; tx < x + w; tx += TILE) {
      drawFloorTile(tx, ty, topA, topB, "rgba(38,42,46,0.24)");
    }
  }

  rect(x, y, w, 5, "rgba(255,255,255,0.28)");
  rect(x, y + h - 5, w, 5, "rgba(0,0,0,0.18)");
  rect(x + w - 5, y, 5, h, "rgba(0,0,0,0.16)");
  strokeRect(x, y, w, h, "#353941", 3);
}



function drawGrass() {
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const x = T(col);
      const y = T(row);
      drawFloorTile(x, y, "#3b3f46", "#343941", "rgba(255,255,255,0.035)");

      if ((col * 5 + row * 7) % 11 === 0) {
        rect(x + 6, y + 6, 3, 3, "#6a7079");
        rect(x + 22, y + 21, 2, 2, "#20242b");
      }
    }
  }
}


function drawWaterRect(area, base, alt) {
  for (let y = area.y; y < area.y + area.h; y += TILE) {
    for (let x = area.x; x < area.x + area.w; x += TILE) {
      drawFloorTile(x, y, base, alt, "rgba(255,255,255,0.055)");
      rect(x + 5, y + 11, TILE - 10, 3, "rgba(255,255,255,0.10)");
      rect(x + 10, y + 22, TILE - 18, 2, "rgba(0,0,0,0.12)");
    }
  }
}


function drawWater() {
  drawWaterRect(MAP.topRiver, "#242a32", "#20262f");
  drawWaterRect(MAP.leftRiver, "#222832", "#1e242d");
  drawWaterRect(MAP.bottomRiver, "#242a32", "#20262f");
}





function drawWater() {
  drawWaterRect(MAP.topRiver, "#242a32", "#20262f");
  drawWaterRect(MAP.leftRiver, "#222832", "#1e242d");
  drawWaterRect(MAP.bottomRiver, "#242a32", "#20262f");
}

function drawPath() {
  for (let y = MAP.pathZone.y; y < MAP.pathZone.y + MAP.pathZone.h; y += TILE) {
    for (let x = MAP.pathZone.x; x < MAP.pathZone.x + MAP.pathZone.w; x += TILE) {
      drawFloorTile(x, y, "#d7d9d8", "#cfd2d2", "rgba(88,92,96,0.18)");
      if (((x / TILE) + (y / TILE)) % 5 === 0) {
        rect(x + 12, y + 12, 4, 4, "rgba(92,96,100,0.18)");
      }
    }
  }

  GROUND_ROUTES.forEach((route) => {
    route.forEach((p, index) => {
      if (index === 0 || index === route.length - 1) return;
      rect(p.x - 5, p.y - 5, 10, 10, "rgba(224,168,42,0.26)");
      strokeRect(p.x - 5, p.y - 5, 10, 10, "rgba(80,62,18,0.20)", 1);
    });
  });

  drawTileGridArea(MAP.pathZone.x, MAP.pathZone.y, MAP.pathZone.w, MAP.pathZone.h, "rgba(78,82,88,0.18)");
}



function drawStoneDefenseZone(zone) {
  const height = 14;
  drawRaisedBlock(zone.x, zone.y, zone.w, zone.h, height, "#9fa7a6", "#929a99", "#646a70", "#4e555c");

  for (let y = zone.y + TILE; y < zone.y + zone.h - TILE; y += TILE) {
    for (let x = zone.x + TILE; x < zone.x + zone.w - TILE; x += TILE) {
      drawFloorTile(x, y, "#7f9b65", "#748f5b", "rgba(24,50,24,0.13)");
      rect(x + 6, y + 6, TILE - 12, 4, "rgba(255,255,255,0.11)");
      rect(x + 6, y + TILE - 8, TILE - 12, 4, "rgba(0,0,0,0.12)");
    }
  }

  drawHazardStripe(zone.x + TILE, zone.y + zone.h - 7, zone.w - TILE * 2, 7);
  rect(zone.x + TILE, zone.y + 5, zone.w - TILE * 2, 4, "rgba(255,255,255,0.25)");
  strokeRect(zone.x + TILE, zone.y + TILE, zone.w - TILE * 2, zone.h - TILE * 2, "#526a45", 2);
}



function drawBridge() {
  const { x, y, w, h } = MAP.bridge;
  drawRaisedBlock(x, y, w, h, 10, "#8d5b32", "#7f4f29", "#55351f", "#4a2c19");
  for (let row = 0; row < h / TILE; row += 1) {
    for (let col = 0; col < w / TILE; col += 1) {
      const px = x + T(col);
      const py = y + T(row);
      rect(px + 3, py + 21, TILE - 6, 3, "rgba(0,0,0,0.18)");
      rect(px + TILE - 4, py + 3, 2, TILE - 6, "rgba(255,255,255,0.10)");
    }
  }
}



function drawCastleAndProps() {
  const gate = MAP.gate;
  drawRaisedBlock(gate.x, gate.y, gate.w, gate.h, 12, "#d9dcda", "#cdd1d0", "#747a82", "#606871");
  rect(gate.x + 8, gate.y + TILE + 4, gate.w - 16, TILE - 10, "#555d66");
  rect(gate.x + 12, gate.y + 8, gate.w - 24, 8, "rgba(255,255,255,0.5)");

  const banner = MAP.banner;
  drawRaisedBlock(banner.x, banner.y, banner.w, banner.h, 12, "#d9d1bd", "#cabf9f", "#8c6f46", "#735936");
  drawHazardStripe(banner.x, banner.y - 8, banner.w, 8);
  drawHazardStripe(banner.x, banner.y + banner.h, banner.w, 8);

  drawRaisedBlock(T(24), T(7), TILE, TILE, 8, "#916038", "#7f512c", "#5b3920", "#4a2d19");

  const skullX = T(8);
  const skullY = T(2);
  rect(skullX + 24, skullY, 12, 48, "#f4f5ef");
  rect(skullX, skullY + 18, 60, 12, "#f4f5ef");
  rect(skullX + 4, skullY, 14, 14, "#f4f5ef");
  rect(skullX + 42, skullY, 14, 14, "#f4f5ef");
  rect(skullX + 4, skullY + 34, 14, 14, "#f4f5ef");
  rect(skullX + 42, skullY + 34, 14, 14, "#f4f5ef");
  rect(skullX + 22, skullY + 16, 18, 18, "#f4f5ef");
  rect(skullX + 27, skullY + 22, 4, 4, "#242424");
  rect(skullX + 35, skullY + 22, 4, 4, "#242424");
}



function drawTree(x, y, s = 1) {
  const w = 30 * s;
  const h = 30 * s;
  rect(x + 6 * s, y + 6 * s, w, h, "rgba(0,0,0,0.26)");
  rect(x, y, w, h, "#363b43");
  rect(x + 4 * s, y + 4 * s, w - 8 * s, h - 8 * s, "#464c55");
  rect(x, y, w, 5 * s, "rgba(255,255,255,0.10)");
  rect(x + w - 5 * s, y, 5 * s, h, "rgba(0,0,0,0.18)");
  rect(x, y + h - 5 * s, w, 5 * s, "rgba(0,0,0,0.22)");
}



function drawForest() {
  for (let col = 0; col < COLS; col += 1) {
    drawTree(T(col) + 2, T(18) + 3, 1);
    drawTree(T(col) + 4, T(19) - 1, 0.92);
  }

  for (let row = 7; row <= 15; row += 1) {
    drawTree(T(28) + 2, T(row) + 2, 0.95);
    drawTree(T(29), T(row) + 12, 0.82);
  }

  for (let col = 0; col < 6; col += 1) {
    drawTree(T(col) + 6, T(1) + (col % 2) * 6, 0.86);
  }
}



function drawHpBar(x, y, w, hp, maxHp, bg = "#3b1624", fill = "#65d15d") {
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  rect(x - w / 2, y, w, 5, bg);
  rect(x - w / 2, y, w * ratio, 5, fill);
  strokeRect(x - w / 2, y, w, 5, "rgba(0,0,0,0.45)", 1);
}

function circle(x, y, r, fill, stroke = null, lineWidth = 2) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function ellipse(x, y, rx, ry, fill, stroke = null, lineWidth = 2) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function line(x1, y1, x2, y2, color, lineWidth = 2) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(Math.round(x1), Math.round(y1));
  ctx.lineTo(Math.round(x2), Math.round(y2));
  ctx.stroke();
  ctx.restore();
}

function drawIngameShieldMaiden(hero, index) {
  const time = performance.now() / 1000;
  const phase = time * 2.15 + hero.id * 0.7 + index * 0.35;
  const idle = Math.sin(phase);
  const breatheX = 1 + idle * 0.008;
  const breatheY = 1 - idle * 0.006;
  const y = hero.y + idle * 0.35;

  // 바닥 접지 그림자: 캐릭터가 타일 위에 실제로 서 있는 느낌을 주는 핵심 요소
  ellipse(hero.x, hero.y + 12, 23, 6, "rgba(0,0,0,0.30)");
  ellipse(hero.x - 4, hero.y + 11, 13, 3, "rgba(255,255,255,0.05)");

  ctx.save();
  ctx.translate(Math.round(hero.x), Math.round(y));
  ctx.scale(breatheX, breatheY);

  // 뒤쪽 망토와 머리카락
  polygon([
    { x: 1, y: -25 },
    { x: 19, y: -18 },
    { x: 13, y: 8 },
    { x: -3, y: 9 },
  ], "#526187");
  ellipse(14, -27, 13, 7, "#e985a6", "#7a3d55", 2);
  ellipse(19, -24, 10, 5, "#f0a0b8");

  // 오른손 도끼: 몸 뒤쪽에 작게 배치해서 원본 느낌만 살림
  line(5, -4, 24, -15, "#5a3b28", 3);
  polygon([
    { x: 23, y: -20 },
    { x: 35, y: -19 },
    { x: 29, y: -9 },
    { x: 22, y: -11 },
  ], "#cfd7e3");
  strokeRect(23, -20, 9, 10, "#5c6470", 1);

  // 다리와 발: 발끝을 y+12 근처에 맞춰 붕 뜨는 느낌 제거
  rect(-8, -3, 7, 15, "#b9c1ce");
  rect(3, -3, 7, 15, "#b9c1ce");
  rect(-11, 9, 12, 5, "#e2e7ef");
  rect(2, 9, 12, 5, "#e2e7ef");
  strokeRect(-8, -3, 7, 15, "#4d5360", 1);
  strokeRect(3, -3, 7, 15, "#4d5360", 1);

  // 몸통 갑옷
  polygon([
    { x: -8, y: -20 },
    { x: 9, y: -20 },
    { x: 13, y: 0 },
    { x: -11, y: 0 },
  ], "#d9dde7");
  strokeRect(-8, -20, 17, 20, "#505866", 2);
  rect(-7, -13, 15, 4, "#8fa3c8");
  rect(-8, -1, 20, 5, "#31527f");
  rect(-5, 4, 13, 7, "#24446d");
  rect(-11, -7, 5, 12, "#8b593c");
  rect(9, -7, 5, 12, "#8b593c");

  // 방패: 원본의 큰 사자 방패를 더 작고 타일 친화적으로 재해석
  ellipse(-16, -13, 15, 22, "#c99642", "#34262a", 3);
  ellipse(-16, -13, 11, 17, "#315b8c", "#e6c178", 2);
  circle(-16, -13, 5, "#d99b3e", "#5a341d", 1);
  rect(-20, -14, 8, 2, "#6f421f");
  rect(-18, -18, 4, 10, "#f0bd58");
  rect(-23, -31, 7, 8, "#d8dce5");
  rect(-24, 6, 7, 8, "#d8dce5");
  rect(-31, -16, 7, 7, "#d8dce5");

  // 얼굴과 헤어
  ellipse(2, -30, 11, 12, "#f0bf96", "#4e3032", 2);
  ellipse(-2, -38, 12, 6, "#ef8fae", "#7a3d55", 1);
  rect(-8, -34, 18, 5, "#ef8fae");
  rect(-9, -43, 21, 8, "#b7c1cf");
  strokeRect(-9, -43, 21, 8, "#4d5360", 2);
  rect(-6, -46, 15, 3, "#dfe6ee");
  polygon([
    { x: -9, y: -42 },
    { x: -16, y: -50 },
    { x: -14, y: -35 },
  ], "#d9b78b");
  polygon([
    { x: 11, y: -42 },
    { x: 18, y: -50 },
    { x: 16, y: -35 },
  ], "#d9b78b");

  // 표정은 크게 단순화해서 작은 화면에서도 읽히게 처리
  rect(-3, -30, 2, 2, "#2b1d23");
  rect(5, -30, 2, 2, "#2b1d23");
  rect(1, -25, 5, 1, "#8b3948");
  rect(11, -38, 4, 4, "#4b83d1");
  rect(13, -40, 2, 8, "#4b83d1");

  // 발 주변 접지 픽셀을 마지막에 얹어 캐릭터가 타일에 붙어 보이게 함
  rect(-12, 14, 25, 2, "rgba(0,0,0,0.18)");

  ctx.restore();

  drawHpBar(hero.x, hero.y - 49, 38, hero.hp, hero.maxHp, "#421a2b", "#65d15d");
}

function drawPlacedHero(hero, index) {
  if (hero.type === "melee") {
    drawIngameShieldMaiden(hero, index);
    return;
  }

  const bob = Math.sin(performance.now() / 300 + index) * 1.2;
  drawHeroBase(hero.x, hero.y + bob, hero.type);
  drawHpBar(hero.x, hero.y - 44 + bob, 28, hero.hp, hero.maxHp, "#421a2b", "#78b7ff");
}

function drawHeroBase(x, y, type) {
  const info = HERO_TYPES[type];

  rect(x - 14, y + 11, 28, 5, "rgba(0,0,0,0.25)");
  rect(x - 8, y - 14, 16, 28, info.body);
  rect(x - 7, y - 25, 14, 12, "#f0c18d");
  rect(x - 11, y - 32, 22, 8, info.hat);
  rect(x + 9, y - 7, 13, 4, "#ffe7a4");
  rect(x + 19, y - 11, 4, 12, "#fff1bd");

  rect(x - 4, y - 20, 3, 3, "#1d1d1d");
  rect(x + 4, y - 20, 3, 3, "#1d1d1d");
}

function drawEnemy(enemy) {
  const isAir = isAirEnemyType(enemy.type);
  const info = ENEMY_TYPES[enemy.type];
  const bob = isAir ? Math.sin(performance.now() / 160 + enemy.id) * 5 : 0;
  const x = enemy.x;
  const y = enemy.y + bob;

  if (enemy.type === "ground") {
    rect(x - 13, y + 10, 26, 6, "rgba(0,0,0,0.28)");
    rect(x - 10, y - 13, 20, 25, ENEMY_TYPES.ground.body);
    rect(x - 8, y - 24, 16, 12, "#9b3a31");
    rect(x - 13, y - 26, 7, 7, "#f2e9dd");
    rect(x + 6, y - 26, 7, 7, "#f2e9dd");
    rect(x - 5, y - 19, 3, 3, "#111");
    rect(x + 4, y - 19, 3, 3, "#111");
  } else {
    const wingColor = enemy.type === "air2" ? "#f0a2d0" : "#b68cf0";
    const headColor = enemy.type === "air2" ? "#963b82" : "#57318f";

    rect(x - 15, y + 14, 30, 6, "rgba(0,0,0,0.18)");
    rect(x - 12, y - 12, 24, 22, info.body);
    rect(x - 20, y - 8, 10, 7, wingColor);
    rect(x + 10, y - 8, 10, 7, wingColor);
    rect(x - 7, y - 23, 14, 12, headColor);
    rect(x - 4, y - 18, 3, 3, "#fff");
    rect(x + 4, y - 18, 3, 3, "#fff");
    text(info.label, x, y - 37, 9, "#f7f1df", "center");
  }

  drawHpBar(x, y - 34, 30, enemy.hp, enemy.maxHp, "#421a2b", enemy.type === "air2" ? "#ff9bd8" : isAir ? "#c98fff" : "#ffb15c");
}

function drawAttackEffects() {
  state.enemies.forEach((enemy) => {
    if (enemy.hitFlash > 0) {
      rect(enemy.x - 18, enemy.y - 22, 36, 36, "rgba(255,255,255,0.18)");
    }
  });
}

function drawTopUI() {
  rect(38, 24, 72, 72, "#4e5d92");
  strokeRect(38, 24, 72, 72, "#2c355c", 5);
  rect(62, 42, 12, 36, "#f5f1e7");
  rect(78, 42, 12, 36, "#f5f1e7");

  rect(350, 14, 260, 82, "#f7f1df");
  rect(368, 4, 224, 18, "#f7f1df");
  strokeRect(350, 14, 260, 82, "#2e2a36", 5);
  text(`WAVE ${state.wave}`, 480, 24, 14, "#2e2a36", "center");
  text("00:" + String(Math.max(0, Math.ceil(state.timer))).padStart(2, "0"), 480, 58, 32, "#17151f", "center");

  rect(850, 24, 72, 72, "#4e5d92");
  strokeRect(850, 24, 72, 72, "#2c355c", 5);
  ctx.beginPath();
  ctx.fillStyle = "#f5f1e7";
  ctx.moveTo(878, 42);
  ctx.lineTo(878, 78);
  ctx.lineTo(904, 60);
  ctx.closePath();
  ctx.fill();

  rect(360, 106, 240, 22, "#23305f");
  rect(360, 106, 240 * (state.castleHp / 100), 22, "#2c61d6");
  strokeRect(360, 106, 240, 22, "#17213f", 3);
  text(`${state.castleHp}/100`, 480, 117, 16, "#f7f1df", "center");

  text(`처치 ${state.kills}`, 670, 82, 15, "#f7f1df", "left");
  text(`통과 ${state.escaped}`, 670, 106, 15, "#f7f1df", "left");
}

function drawHeroSelectButton(type, button) {
  const selected = state.selectedHero === type;
  const info = HERO_TYPES[type];
  rect(button.x, button.y, button.w, button.h, selected ? "#fff6cf" : "#f9f4e7");
  strokeRect(button.x, button.y, button.w, button.h, selected ? "#e6b84b" : "#2c2330", selected ? 5 : 4);
  text(type === "melee" ? "1" : "2", button.x + 20, button.y + 23, 18, "#17151f", "center");
  text(info.shortName, button.x + 82, button.y + 17, 16, "#17151f", "center");
  text(`코스트 ${info.cost} · ${info.install === "ground" ? "땅" : "언덕"}`, button.x + 82, button.y + 34, 11, "#5a4b2c", "center");
}

function drawBottomUI() {
  rect(0, 578, W, 62, "rgba(20, 18, 24, 0.35)");

  drawStatusBar(52, 590, 210, 28, "#d94c89", "❤", "성벽", `${state.castleHp}%`);
  drawCostBar(680, 590, 210, 28);

  rect(245, 538, 470, 34, "#f9f4e7");
  strokeRect(245, 538, 470, 34, "#2c2330", 4);
  text(state.message, 480, 555, 13, "#17151f", "center");

  drawHeroSelectButton("melee", heroButtons.melee);
  drawHeroSelectButton("ranged", heroButtons.ranged);
}

function drawStatusBar(x, y, w, h, fill, icon, label, value) {
  rect(x, y, w, h, "#4a1732");
  rect(x, y, w * (parseInt(value, 10) / 100), h, fill);
  strokeRect(x, y, w, h, "#261424", 3);
  text(icon, x + 18, y + 14, 22, "#fff", "center");
  text(label, x + 66, y + 14, 13, "#1b1420", "center");
  text(value, x + w - 36, y + 14, 14, "#1b1420", "center");
}

function drawCostBar(x, y, w, h) {
  const ratio = Math.max(0, Math.min(1, state.cost / state.maxCost));
  rect(x, y, w, h, "#3a2b18");
  rect(x, y, w * ratio, h, "#e6b84b");
  strokeRect(x, y, w, h, "#261424", 3);
  text("◆", x + 18, y + 14, 20, "#fff6cf", "center");
  text("코스트", x + 72, y + 14, 13, "#1b1420", "center");
  text(`${state.cost}/${state.maxCost}`, x + w - 38, y + 14, 14, "#1b1420", "center");
}

function drawGridShadow() {
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = "#1f241d";
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += TILE) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += TILE) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlacedTileMarks() {
  state.placedHeroes.forEach((hero) => {
    strokeRect(T(hero.col) + 2, T(hero.row) + 2, TILE - 4, TILE - 4, hero.type === "melee" ? "rgba(120,210,100,0.55)" : "rgba(130,180,255,0.62)", 2);
  });
}

function drawHoveredTile() {
  if (!state.hoveredTile) return;

  const { col, row } = state.hoveredTile;
  const x = T(col);
  const y = T(row);
  const check = canPlaceHeroAt(col, row, state.selectedHero);

  if (!check.ok) {
    rect(x, y, TILE, TILE, "rgba(255,60,60,0.18)");
    strokeRect(x + 1, y + 1, TILE - 2, TILE - 2, "rgba(255,80,80,0.75)", 2);
    return;
  }

  rect(x, y, TILE, TILE, state.selectedHero === "melee" ? "rgba(120,255,120,0.13)" : "rgba(120,180,255,0.16)");
  strokeRect(x + 1, y + 1, TILE - 2, TILE - 2, state.selectedHero === "melee" ? "rgba(145,255,130,0.95)" : "rgba(130,190,255,0.95)", 2);
}

function render() {
  ctx.clearRect(0, 0, W, H);

  drawGrass();
  drawWater();
  drawPath();
  defenseZones.forEach(drawStoneDefenseZone);
  drawBridge();
  drawCastleAndProps();
  drawForest();
  drawGridShadow();
  drawPlacedTileMarks();
  drawHoveredTile();
  state.placedHeroes.forEach(drawPlacedHero);
  state.enemies.forEach(drawEnemy);
  drawAttackEffects();
  drawTopUI();
  drawBottomUI();
}

function getMousePos(event) {
  const rectInfo = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rectInfo.width;
  const scaleY = canvas.height / rectInfo.height;
  return {
    x: (event.clientX - rectInfo.left) * scaleX,
    y: (event.clientY - rectInfo.top) * scaleY,
  };
}

function isInsideRect(pos, rectInfo, padding = 0) {
  return (
    pos.x >= rectInfo.x + padding &&
    pos.x <= rectInfo.x + rectInfo.w - padding &&
    pos.y >= rectInfo.y + padding &&
    pos.y <= rectInfo.y + rectInfo.h - padding
  );
}

function isPointOnUI(pos) {
  return uiBlockRects.some((area) => isInsideRect(pos, area, 0));
}

function getTileFromMousePos(pos) {
  if (isPointOnUI(pos)) return null;

  const col = Math.floor(pos.x / TILE);
  const row = Math.floor(pos.y / TILE);

  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
  return { col, row };
}

function isTileInsideArea(col, row, area) {
  const x = T(col);
  const y = T(row);
  return x >= area.x && x < area.x + area.w && y >= area.y && y < area.y + area.h;
}

function isWaterTile(col, row) {
  return (
    isTileInsideArea(col, row, MAP.topRiver) ||
    isTileInsideArea(col, row, MAP.leftRiver) ||
    isTileInsideArea(col, row, MAP.bottomRiver)
  );
}

function isForestTile(col, row) {
  if (row >= 18) return true;
  if (col >= 28 && row >= 7 && row <= 15) return true;
  if (col <= 5 && row === 1) return true;
  return false;
}

function isBaseInstallableTile(col, row) {
  if (isWaterTile(col, row)) return false;
  if (isForestTile(col, row)) return false;
  if (blockedDecorTiles.has(tileKey(col, row))) return false;
  return true;
}

function isHillTile(col, row) {
  return defenseZones.some((zone) => {
    const left = zone.x / TILE;
    const top = zone.y / TILE;
    const right = left + zone.w / TILE - 1;
    const bottom = top + zone.h / TILE - 1;
    return col > left && col < right && row > top && row < bottom;
  });
}

function isGroundTile(col, row) {
  return isBaseInstallableTile(col, row) && !isHillTile(col, row);
}

function isTileOccupied(col, row) {
  return state.placedHeroes.some((hero) => hero.col === col && hero.row === row);
}

function canPlaceHeroAt(col, row, heroType) {
  if (!isBaseInstallableTile(col, row)) {
    return { ok: false, reason: "물가, 숲, 기지, 장식물 타일에는 배치할 수 없습니다." };
  }

  if (isTileOccupied(col, row)) {
    return { ok: false, reason: `이미 (${col}, ${row}) 타일에 영웅이 있습니다.` };
  }

  if (heroType === "melee" && !isGroundTile(col, row)) {
    return { ok: false, reason: "근거리 유닛은 땅 타일에만 배치할 수 있습니다." };
  }

  if (heroType === "ranged" && !isHillTile(col, row)) {
    return { ok: false, reason: "원거리 유닛은 언덕 내부 초록 타일에만 배치할 수 있습니다." };
  }

  return { ok: true, reason: "" };
}

function getTileAreaName(col, row) {
  const pos = centerOfTile(col, row);
  const defenseArea = defenseZones.find((zone) => isInsideRect(pos, zone, 0));
  if (defenseArea) return defenseArea.name;
  if (isTileInsideArea(col, row, MAP.bridge)) return "다리 방어 타일";
  if (isTileInsideArea(col, row, MAP.pathZone)) return "몬스터 이동 경로";
  return "일반 지형 타일";
}

function getHeroButtonAt(pos) {
  if (isInsideRect(pos, heroButtons.melee)) return "melee";
  if (isInsideRect(pos, heroButtons.ranged)) return "ranged";
  return null;
}

function chooseRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function isAirEnemyType(type) {
  return type === "air1" || type === "air2";
}

function spawnEnemy(type) {
  const info = ENEMY_TYPES[type];
  let route = null;

  if (type === "ground") {
    route = GROUND_ROUTES[state.groundRouteCursor % GROUND_ROUTES.length];
    state.groundRouteCursor += 1;
  }

  const start = type === "ground" ? route[0] : centerOfTile(MAP.enemyBase.col, MAP.enemyBase.row);
  const airTarget = isAirEnemyType(type) ? chooseRandom(AIR_TARGETS) : null;

  state.enemies.push({
    id: state.nextEnemyId,
    type,
    x: start.x,
    y: start.y,
    route,
    routeIndex: 0,
    routeName: route?.[0]?.routeName || (type === "air2" ? "공중 자유비행 air2" : "공중 자유비행 air1"),
    airTarget,
    progress: 0,
    hp: info.maxHp,
    maxHp: info.maxHp,
    attackTimer: 0,
    hitFlash: 0,
    reachedBase: false,
  });
  state.nextEnemyId += 1;
}

function buildWave(wave) {
  const result = [];
  const groundCount = 7 + wave * 2;
  const air1Count = 2 + wave;
  const air2Count = Math.max(1, wave);

  for (let i = 0; i < groundCount; i += 1) {
    result.push("ground");

    if (i % 3 === 2 && result.filter((type) => type === "air1").length < air1Count) {
      result.push("air1");
    }

    if (i % 5 === 4 && result.filter((type) => type === "air2").length < air2Count) {
      result.push("air2");
    }
  }

  while (result.filter((type) => type === "air1").length < air1Count) {
    result.push("air1");
  }

  while (result.filter((type) => type === "air2").length < air2Count) {
    result.push("air2");
  }

  return result;
}

function startWave(wave) {
  state.wave = wave;
  state.timer = 40 + wave * 5;
  state.spawnQueue = buildWave(wave);
  state.spawnIndex = 0;
  state.spawnTimer = 0.8;
  state.waveRunning = true;
  state.nextWaveTimer = 0;
  state.message = `WAVE ${wave} 시작! 코스트는 1초마다 1씩 회복됩니다. 방패병1 / 원거리3`;
}

function moveEnemyAlongRoute(enemy, dt) {
  const nextIndex = enemy.routeIndex + 1;
  const target = enemy.route?.[nextIndex];

  if (!target) {
    enemy.reachedBase = true;
    enemy.progress = 1;
    return;
  }

  const speed = ENEMY_TYPES[enemy.type].speed;
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const step = speed * dt;

  if (dist <= step) {
    enemy.x = target.x;
    enemy.y = target.y;
    enemy.routeIndex = nextIndex;
    enemy.progress = enemy.route ? enemy.routeIndex / Math.max(1, enemy.route.length - 1) : 0;
    return;
  }

  enemy.x += (dx / dist) * step;
  enemy.y += (dy / dist) * step;
  enemy.progress = enemy.route ? (enemy.routeIndex + (step / Math.max(dist, 1))) / Math.max(1, enemy.route.length - 1) : 0;
}

function moveAirEnemyFreely(enemy, dt) {
  const target = enemy.airTarget || centerOfTile(MAP.playerBase.col, MAP.playerBase.row);
  const speed = ENEMY_TYPES[enemy.type].speed;
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const step = speed * dt;

  if (dist <= step) {
    enemy.x = target.x;
    enemy.y = target.y;
    enemy.progress = 1;
    enemy.reachedBase = true;
    return;
  }
  enemy.x += (dx / dist) * step;
  enemy.y += (dy / dist) * step;
  enemy.progress = Math.max(enemy.progress, 1 - dist / Math.max(1, distance(centerOfTile(MAP.enemyBase.col, MAP.enemyBase.row), target)));
}

function getEnemyTile(enemy) {
  return {
    col: Math.floor(enemy.x / TILE),
    row: Math.floor(enemy.y / TILE),
  };
}

function findMeleeHeroOnTile(col, row) {
  return state.placedHeroes.find((hero) => hero.type === "melee" && hero.col === col && hero.row === row);
}

function findGroundEnemyOnTile(col, row) {
  return state.enemies.find((enemy) => {
    if (enemy.type !== "ground" || enemy.hp <= 0 || enemy.reachedBase) return false;
    const tile = getEnemyTile(enemy);
    return tile.col === col && tile.row === row;
  });
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function findRangedHeroTarget(hero) {
  const range = HERO_TYPES.ranged.range;

  const enemiesInRange = state.enemies
    .filter((enemy) => enemy.hp > 0 && !enemy.reachedBase && distance(hero, enemy) <= range);
  const airTarget = enemiesInRange
    .filter((enemy) => isAirEnemyType(enemy.type))
    .sort((a, b) => b.progress - a.progress)[0];

  if (airTarget) return airTarget;

  return enemiesInRange
    .filter((enemy) => enemy.type === "ground")
    .sort((a, b) => b.progress - a.progress)[0];
}

function findHeroTargetForAirEnemy(enemy) {
  const range = ENEMY_TYPES[enemy.type].range;
  return state.placedHeroes
    .filter((hero) => {
      if (hero.hp <= 0 || distance(hero, enemy) > range) return false;
      if (enemy.type === "air1") return hero.type === "ranged";
      if (enemy.type === "air2") return hero.type === "melee" || hero.type === "ranged";
      return false;
    })
    .sort((a, b) => {
      if (enemy.type === "air2" && a.type !== b.type) {
        return a.type === "melee" ? -1 : 1;
      }
      return distance(a, enemy) - distance(b, enemy);
    })[0];
}

function updateCost(dt) {
  if (state.gameOver || state.gameClear) return;
  state.costFloat = Math.min(state.maxCost, state.costFloat + state.costRegenPerSecond * dt);
  state.cost = Math.floor(state.costFloat);
}

function updateSpawning(dt) {
  if (!state.waveRunning || state.gameOver || state.gameClear) return;
  if (state.spawnIndex >= state.spawnQueue.length) return;

  state.spawnTimer -= dt;
  if (state.spawnTimer > 0) return;

  spawnEnemy(state.spawnQueue[state.spawnIndex]);
  state.spawnIndex += 1;
  state.spawnTimer = Math.max(0.45, 1.35 - state.wave * 0.12);
}

function updateEnemies(dt) {
  state.enemies.forEach((enemy) => {
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);

    if (enemy.hp <= 0 || enemy.reachedBase) return;

    if (enemy.type === "ground") {
      const tile = getEnemyTile(enemy);
      const blocker = findMeleeHeroOnTile(tile.col, tile.row);

      if (blocker) {
        enemy.attackTimer -= dt;
        if (enemy.attackTimer <= 0) {
          blocker.hp -= ENEMY_TYPES.ground.attack;
          enemy.attackTimer = ENEMY_TYPES.ground.attackDelay;
        }
        return;
      }

      moveEnemyAlongRoute(enemy, dt);
      return;
    }

    const targetHero = findHeroTargetForAirEnemy(enemy);
    if (targetHero) {
      enemy.attackTimer -= dt;
      if (enemy.attackTimer <= 0) {
        targetHero.hp -= ENEMY_TYPES[enemy.type].attack;
        enemy.attackTimer = ENEMY_TYPES[enemy.type].attackDelay;
      }
      return;
    }

    moveAirEnemyFreely(enemy, dt);
  });
}

function updateHeroes(dt) {
  state.placedHeroes.forEach((hero) => {
    hero.attackTimer -= dt;
    if (hero.hp <= 0) return;

    if (hero.type === "melee") {
      const target = findGroundEnemyOnTile(hero.col, hero.row);
      if (target && hero.attackTimer <= 0) {
        target.hp -= HERO_TYPES.melee.attack;
        target.hitFlash = 0.12;
        hero.attackTimer = HERO_TYPES.melee.attackDelay;
      }
      return;
    }

    if (hero.type === "ranged") {
      const target = findRangedHeroTarget(hero);
      if (target && hero.attackTimer <= 0) {
        target.hp -= HERO_TYPES.ranged.attack;
        target.hitFlash = 0.12;
        hero.attackTimer = HERO_TYPES.ranged.attackDelay;
      }
    }
  });
}

function cleanupDeadAndEscaped() {
  const beforeEnemyCount = state.enemies.length;

  state.enemies.forEach((enemy) => {
    if (enemy.reachedBase) {
      state.castleHp = Math.max(0, state.castleHp - ENEMY_TYPES[enemy.type].baseDamage);
      state.escaped += 1;
      state.message = `${ENEMY_TYPES[enemy.type].name}이 성에 도달했습니다! 성벽 HP ${state.castleHp}`;
    } else if (enemy.hp <= 0) {
      state.kills += 1;
      state.courage = Math.min(100, state.courage + 3);
    }
  });

  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0 && !enemy.reachedBase);

  const beforeHeroCount = state.placedHeroes.length;
  state.placedHeroes = state.placedHeroes.filter((hero) => hero.hp > 0);

  if (beforeHeroCount > state.placedHeroes.length) {
    state.message = "영웅이 쓰러졌습니다. 비어 있는 타일에 다시 배치하세요.";
  }

  if (state.castleHp <= 0 && !state.gameOver) {
    state.gameOver = true;
    state.message = "성벽이 무너졌습니다. R 키로 다시 도전하세요.";
  }

  return beforeEnemyCount !== state.enemies.length;
}

function updateWaveState(dt) {
  if (state.gameOver || state.gameClear) return;

  if (state.waveRunning) {
    state.timer = Math.max(0, state.timer - dt);
  }

  const allSpawned = state.spawnIndex >= state.spawnQueue.length;
  const noEnemies = state.enemies.length === 0;

  if (state.waveRunning && allSpawned && noEnemies) {
    state.waveRunning = false;

    if (state.wave >= 3) {
      state.gameClear = true;
      state.message = "모든 웨이브를 막아냈습니다! 소년은 조금 더 자신을 믿게 되었습니다.";
      return;
    }

    state.nextWaveTimer = 3;
    state.message = `WAVE ${state.wave} 방어 성공! ${Math.ceil(state.nextWaveTimer)}초 후 다음 웨이브가 옵니다.`;
  }

  if (!state.waveRunning && state.nextWaveTimer > 0) {
    state.nextWaveTimer -= dt;
    state.message = `다음 웨이브까지 ${Math.max(1, Math.ceil(state.nextWaveTimer))}초...`;

    if (state.nextWaveTimer <= 0) {
      startWave(state.wave + 1);
    }
  }
}

function update(dt) {
  if (state.gameOver || state.gameClear) return;

  updateCost(dt);
  updateSpawning(dt);
  updateEnemies(dt);
  updateHeroes(dt);
  cleanupDeadAndEscaped();
  updateWaveState(dt);
}

function gameLoop(now) {
  const dt = Math.min(0.05, (now - state.lastTime) / 1000);
  state.lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(gameLoop);
}

function placeHeroAt(col, row) {
  const heroType = state.selectedHero;
  const check = canPlaceHeroAt(col, row, heroType);

  if (!check.ok) {
    state.message = check.reason;
    return;
  }

  const info = HERO_TYPES[heroType];
  if (state.cost < info.cost) {
    state.message = `코스트가 부족합니다. ${info.shortName} 필요 ${info.cost}, 현재 ${state.cost}`;
    return;
  }

  const center = centerOfTile(col, row);
  state.placedHeroes.push({
    id: state.nextHeroId,
    col,
    row,
    x: center.x,
    y: center.y,
    type: heroType,
    hp: info.maxHp,
    maxHp: info.maxHp,
    attackTimer: 0,
    areaName: getTileAreaName(col, row),
  });

  state.nextHeroId += 1;
  state.costFloat = Math.max(0, state.costFloat - info.cost);
  state.cost = Math.floor(state.costFloat);
  state.courage = Math.min(100, state.courage + 5);
  state.message = `${info.shortName}을 ${getTileAreaName(col, row)} (${col}, ${row})에 배치했습니다. 남은 코스트 ${state.cost}`;
}

function setSelectedHero(type) {
  state.selectedHero = type;
  state.message = `${HERO_TYPES[type].name} 선택: ${HERO_TYPES[type].description}. 현재 코스트 ${state.cost}`;
}

function resetGame() {
  state.timer = 40;
  state.castleHp = 100;
  state.courage = 0;
  state.coins = 25;
  state.cost = 3;
  state.costFloat = 3;
  state.selectedHero = "melee";
  state.placedHeroes = [];
  state.enemies = [];
  state.hoveredTile = null;
  state.nextHeroId = 1;
  state.nextEnemyId = 1;
  state.kills = 0;
  state.escaped = 0;
  state.gameOver = false;
  state.gameClear = false;
  state.groundRouteCursor = 0;
  state.lastTime = performance.now();
  startWave(1);
}

canvas.addEventListener("mousemove", (event) => {
  const pos = getMousePos(event);
  state.hoveredTile = getTileFromMousePos(pos);
});

canvas.addEventListener("mouseleave", () => {
  state.hoveredTile = null;
});

canvas.addEventListener("click", (event) => {
  const pos = getMousePos(event);
  const clickedButton = getHeroButtonAt(pos);

  if (clickedButton) {
    setSelectedHero(clickedButton);
    return;
  }

  const tile = getTileFromMousePos(pos);

  if (!tile) {
    state.message = "UI 영역이 아닌 맵 타일을 클릭해야 배치할 수 있습니다.";
    return;
  }

  placeHeroAt(tile.col, tile.row);
});

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (key === "1") {
    setSelectedHero("melee");
    return;
  }

  if (key === "2") {
    setSelectedHero("ranged");
    return;
  }

  if (key === "r") {
    resetGame();
  }
});

startWave(1);
requestAnimationFrame(gameLoop);
