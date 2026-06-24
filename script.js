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
    name: "근거리 유닛",
    shortName: "근거리",
    install: "ground",
    maxHp: 140,
    attack: 18,
    attackDelay: 0.65,
    body: "#3d72d8",
    hat: "#f3f7ff",
    description: "땅 타일에 설치 / 지상 적을 막고 전투",
  },
  ranged: {
    name: "원거리 유닛",
    shortName: "원거리",
    install: "hill",
    maxHp: 90,
    attack: 14,
    attackDelay: 0.75,
    range: TILE * 5,
    body: "#7a65d1",
    hat: "#5a41a6",
    description: "언덕 타일에 설치 / 공중 적 우선, 지상 적도 공격",
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
  selectedHero: "melee",
  placedHeroes: [],
  enemies: [],
  hoveredTile: null,
  message: "1: 근거리, 2: 원거리 선택. 원거리 유닛은 공중 적을 우선 요격하고 지상 적도 공격합니다.",
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
  enemyBase: { col: 4, row: 6 },       // 왼쪽 위 회색 건물 안쪽에서 스폰
  playerBase: { col: 24, row: 16 },    // 오른쪽 아래 갈색 건물 도착점
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

    // 지상 적은 타일을 기준으로 상하좌우만 이동합니다. 대각선 루트는 만들지 않습니다.
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
  // 왼쪽 위 회색 적 기지 건물
  "3,5", "4,5", "3,6", "4,6",
  // 오른쪽 아래 갈색 목표 건물
  "23,15", "24,15", "25,15", "23,16", "24,16", "25,16",
  // 오른쪽 현수막 / 상자 장식
  "26,3", "27,3", "28,3", "26,4", "27,4", "28,4", "26,5", "27,5", "28,5", "26,6", "27,6", "28,6", "24,7",
  // 뼈 표식 장식
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

function drawGrass() {
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const shade = (col + row) % 2 === 0 ? "#82b14b" : "#79a544";
      rect(T(col), T(row), TILE, TILE, shade);

      if ((col * 7 + row * 11) % 9 === 0) {
        rect(T(col) + 6, T(row) + 10, 4, 4, "#6f993e");
        rect(T(col) + 20, T(row) + 16, 3, 3, "#96c55f");
      }
    }
  }
}

function drawWaterRect(area, base, alt) {
  for (let y = area.y; y < area.y + area.h; y += TILE) {
    for (let x = area.x; x < area.x + area.w; x += TILE) {
      const shade = ((x / TILE) + (y / TILE)) % 2 === 0 ? base : alt;
      rect(x, y, TILE, TILE, shade);
      rect(x + 4, y + 10, 18, 3, "rgba(255,255,255,0.18)");
      rect(x + 14, y + 20, 12, 2, "rgba(255,255,255,0.14)");
    }
  }
}

function drawWater() {
  drawWaterRect(MAP.topRiver, "#1ab0d1", "#159bbb");
  drawWaterRect(MAP.leftRiver, "#169fc0", "#128fb0");
  drawWaterRect(MAP.bottomRiver, "#1aa8c8", "#1596b4");
}

function drawPath() {
  for (let y = MAP.pathZone.y; y < MAP.pathZone.y + MAP.pathZone.h; y += TILE) {
    for (let x = MAP.pathZone.x; x < MAP.pathZone.x + MAP.pathZone.w; x += TILE) {
      const shade = ((x / TILE) + (y / TILE)) % 2 === 0 ? "#d8c777" : "#cfbf6e";
      rect(x, y, TILE, TILE, shade);
      rect(x + 6, y + 7, 3, 3, "#e8d98e");
      rect(x + 19, y + 18, 4, 3, "#c6b562");
    }
  }

  // 지상 적의 상단/중앙/하단 타일 루트 표시
  GROUND_ROUTES.forEach((route) => {
    route.forEach((p, index) => {
      if (index === 0 || index === route.length - 1) return;
      rect(p.x - 4, p.y - 4, 8, 8, "rgba(130, 77, 28, 0.14)");
    });
  });

  drawTileGridArea(MAP.pathZone.x, MAP.pathZone.y, MAP.pathZone.w, MAP.pathZone.h, "rgba(120, 98, 42, 0.12)");
}

function drawStoneDefenseZone(zone) {
  for (let y = zone.y; y < zone.y + zone.h; y += TILE) {
    for (let x = zone.x; x < zone.x + zone.w; x += TILE) {
      const onBorder = (
        x === zone.x ||
        x === zone.x + zone.w - TILE ||
        y === zone.y ||
        y === zone.y + zone.h - TILE
      );

      if (onBorder) {
        const stone = ((x / TILE) + (y / TILE)) % 2 === 0 ? "#788064" : "#686f58";
        rect(x, y, TILE, TILE, stone);
        rect(x + 6, y + 8, 6, 4, "rgba(255,255,255,0.12)");
        rect(x + 18, y + 18, 4, 4, "rgba(0,0,0,0.12)");
      } else {
        const grass = ((x / TILE) + (y / TILE)) % 2 === 0 ? "#7fa844" : "#749a3f";
        rect(x, y, TILE, TILE, grass);
        rect(x + 8, y + 14, 4, 4, "#91ba4d");
      }
    }
  }

  drawTileGridArea(zone.x, zone.y, zone.w, zone.h, "rgba(43, 52, 33, 0.08)");
  strokeRect(zone.x, zone.y, zone.w, zone.h, "#556043", 2);
}

function drawBridge() {
  // 오른쪽 아래 갈색 목표 건물. 기존의 파란 성 박스 대신 실제 건물을 도착점으로 사용합니다.
  const { x, y, w, h } = MAP.bridge;
  rect(x, y, w, h, "#8f5a2a");

  for (let row = 0; row < h / TILE; row += 1) {
    for (let col = 0; col < w / TILE; col += 1) {
      rect(x + T(col), y + T(row), TILE - 2, TILE - 2, (col + row) % 2 === 0 ? "#b97b40" : "#a36a36");
      rect(x + T(col) + 5, y + T(row) + 4, TILE - 10, 4, "rgba(255,255,255,0.12)");
      rect(x + T(col) + 3, y + T(row) + 24, TILE - 6, 3, "rgba(0,0,0,0.15)");
    }
  }

  strokeRect(x, y, w, h, "#5b351b", 3);
}

function drawCastleAndProps() {
  const gate = MAP.gate;
  rect(gate.x, gate.y, gate.w, gate.h, "#ccd4c3");
  rect(gate.x + 4, gate.y + 4, gate.w - 8, TILE, "#eef0df");
  rect(gate.x + 8, gate.y + TILE + 6, gate.w - 16, TILE - 12, "#6c7073");
  strokeRect(gate.x, gate.y, gate.w, gate.h, "#364247", 3);

  const banner = MAP.banner;
  rect(banner.x, banner.y, banner.w, banner.h, "#f3dfac");
  rect(banner.x - 8, banner.y - 8, 8, banner.h + 16, "#c84e32");
  rect(banner.x + banner.w, banner.y - 8, 8, banner.h + 16, "#c84e32");
  rect(banner.x - 8, banner.y - 8, banner.w + 16, 8, "#efb84c");
  rect(banner.x - 8, banner.y + banner.h, banner.w + 16, 8, "#efb84c");
  strokeRect(banner.x, banner.y, banner.w, banner.h, "#b88744", 2);

  rect(T(24), T(7), TILE, TILE, "#8d5c2d");
  rect(T(24) + 6, T(7) - 10, TILE - 12, 12, "#c88b44");
  strokeRect(T(24), T(7), TILE, TILE, "#53341c", 2);

  rect(T(8) + 24, T(2), 12, 48, "#fafafa");
  rect(T(8), T(2) + 18, 60, 12, "#fafafa");
  rect(T(8) + 4, T(2), 14, 14, "#fafafa");
  rect(T(8) + 42, T(2), 14, 14, "#fafafa");
  rect(T(8) + 4, T(2) + 34, 14, 14, "#fafafa");
  rect(T(8) + 42, T(2) + 34, 14, 14, "#fafafa");
  rect(T(8) + 22, T(2) + 16, 18, 18, "#fafafa");
  rect(T(8) + 27, T(2) + 22, 4, 4, "#242424");
  rect(T(8) + 35, T(2) + 22, 4, 4, "#242424");

  // 적/성 텍스트 박스는 제거하고, 실제 건물 자체를 기지로 사용합니다.
}

function drawTree(x, y, s = 1) {
  const w = 24 * s;
  const h = 34 * s;
  rect(x + w * 0.38, y + h * 0.54, w * 0.22, h * 0.34, "#6b4a29");
  rect(x + w * 0.25, y + h * 0.34, w * 0.5, h * 0.36, "#3e7b43");
  rect(x + w * 0.15, y + h * 0.48, w * 0.7, h * 0.28, "#2f6639");
  rect(x + w * 0.35, y + h * 0.15, w * 0.3, h * 0.28, "#57934d");
}

function drawForest() {
  for (let col = 0; col < COLS; col += 1) {
    drawTree(T(col) + 4, T(18) + 4, 1);
    drawTree(T(col) + 2, T(19) - 2, 0.92);
  }

  for (let row = 7; row <= 15; row += 1) {
    drawTree(T(28) + 4, T(row) + 2, 0.9);
    drawTree(T(29), T(row) + 14, 0.8);
  }

  for (let col = 0; col < 6; col += 1) {
    drawTree(T(col) + 8, T(1) + (col % 2) * 6, 0.85);
  }
}

function drawHpBar(x, y, w, hp, maxHp, bg = "#3b1624", fill = "#65d15d") {
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  rect(x - w / 2, y, w, 5, bg);
  rect(x - w / 2, y, w * ratio, 5, fill);
  strokeRect(x - w / 2, y, w, 5, "rgba(0,0,0,0.45)", 1);
}

function drawPlacedHero(hero, index) {
  const bob = Math.sin(performance.now() / 300 + index) * 2;
  drawHeroBase(hero.x, hero.y + bob, hero.type);
  drawHpBar(hero.x, hero.y - 44 + bob, 28, hero.hp, hero.maxHp, "#421a2b", hero.type === "melee" ? "#65d15d" : "#78b7ff");
}

function drawHeroBase(x, y, type) {
  const info = HERO_TYPES[type];
  rect(x - 14, y + 11, 28, 5, "rgba(0,0,0,0.25)");

  if (type === "melee") {
    rect(x - 8, y - 14, 16, 28, info.body);
    rect(x - 7, y - 25, 14, 12, "#f0c18d");
    rect(x - 11, y - 31, 22, 7, info.hat);
    rect(x - 15, y - 5, 8, 17, "#a9c8ff");
    rect(x + 8, y - 4, 14, 5, "#e8e8e8");
    rect(x + 20, y - 7, 5, 11, "#f7f7f7");
  } else {
    rect(x - 8, y - 14, 16, 28, info.body);
    rect(x - 7, y - 25, 14, 12, "#f0c18d");
    rect(x - 11, y - 32, 22, 8, info.hat);
    rect(x + 9, y - 7, 13, 4, "#ffe7a4");
    rect(x + 19, y - 11, 4, 12, "#fff1bd");
  }

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
  text(info.install === "ground" ? "땅 전용" : "언덕 전용", button.x + 82, button.y + 34, 11, "#5a4b2c", "center");
}

function drawBottomUI() {
  rect(0, 578, W, 62, "rgba(20, 18, 24, 0.35)");

  drawStatusBar(52, 590, 210, 28, "#d94c89", "❤", "성벽", `${state.castleHp}%`);
  drawStatusBar(680, 590, 210, 28, "#b55e21", "⚡", "용기", `${state.courage}%`);

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

    // 돌 테두리는 설치 불가, 내부 초록 타일만 언덕으로 취급
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
  state.message = `WAVE ${wave} 시작! 원거리 유닛은 공중 적 우선, 지상 적도 공격합니다.`;
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

  // 공중 적은 타일 중심을 따라가지 않고 목표 건물까지 직선/대각선으로 자유 이동합니다.
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

  // 원거리 유닛은 공중요격 역할이므로 air1/air2를 먼저 노립니다.
  // 사거리 안에 공중 적이 없으면 지상 적도 공격합니다.
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
      // air2는 새로 추가된 특징이 잘 보이도록 지상 근거리 유닛을 우선 공격합니다.
      if (enemy.type === "air2" && a.type !== b.type) {
        return a.type === "melee" ? -1 : 1;
      }
      return distance(a, enemy) - distance(b, enemy);
    })[0];
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

  const center = centerOfTile(col, row);
  const info = HERO_TYPES[heroType];
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
  state.courage = Math.min(100, state.courage + 5);
  state.message = `${info.shortName}을 ${getTileAreaName(col, row)} (${col}, ${row})에 배치했습니다.`;
}

function setSelectedHero(type) {
  state.selectedHero = type;
  state.message = `${HERO_TYPES[type].name} 선택: ${HERO_TYPES[type].description}`;
}

function resetGame() {
  state.timer = 40;
  state.castleHp = 100;
  state.courage = 0;
  state.coins = 25;
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
