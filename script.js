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

const state = {
  wave: 1,
  timer: 29,
  castleHp: 100,
  courage: 0,
  coins: 25,
  selectedHero: "guardian",
  placedHeroes: [],
  message: "방어 언덕과 몬스터 이동 경로 타일에 영웅을 배치하세요.",
};

const MAP = {
  topRiver: { x: 0, y: T(3), w: W, h: T(2) },
  leftRiver: { x: 0, y: T(5), w: T(3), h: T(12) },
  bottomRiver: { x: 0, y: T(17), w: W, h: T(2) },
  pathZone: { x: T(3), y: T(5), w: T(24), h: T(12), name: "몬스터 이동 경로" },
  bridge: { x: T(23), y: T(15), w: T(3), h: T(2) },
  gate: { x: T(3), y: T(5), w: T(2), h: T(2) },
  banner: { x: T(26), y: T(3), w: T(3), h: T(4) },
};

const defenseZones = [
  { x: T(8), y: T(6), w: T(14), h: T(4), name: "북쪽 방어 언덕" },
  { x: T(8), y: T(11), w: T(14), h: T(4), name: "남쪽 방어 언덕" },
];

const hillHeroSlots = [
  { ...centerOfTile(10, 8), kind: "hill", areaName: "북쪽 방어 언덕" },
  { ...centerOfTile(12, 8), kind: "hill", areaName: "북쪽 방어 언덕" },
  { ...centerOfTile(14, 8), kind: "hill", areaName: "북쪽 방어 언덕" },
  { ...centerOfTile(16, 8), kind: "hill", areaName: "북쪽 방어 언덕" },
  { ...centerOfTile(18, 8), kind: "hill", areaName: "북쪽 방어 언덕" },
  { ...centerOfTile(10, 13), kind: "hill", areaName: "남쪽 방어 언덕" },
  { ...centerOfTile(12, 13), kind: "hill", areaName: "남쪽 방어 언덕" },
  { ...centerOfTile(14, 13), kind: "hill", areaName: "남쪽 방어 언덕" },
  { ...centerOfTile(16, 13), kind: "hill", areaName: "남쪽 방어 언덕" },
  { ...centerOfTile(18, 13), kind: "hill", areaName: "남쪽 방어 언덕" },
];

const routeHeroSlots = [
  { ...centerOfTile(4, 7), kind: "route", areaName: "왼쪽 진입 경로" },
  { ...centerOfTile(4, 9), kind: "route", areaName: "왼쪽 진입 경로" },
  { ...centerOfTile(4, 12), kind: "route", areaName: "왼쪽 진입 경로" },
  { ...centerOfTile(9, 10), kind: "route", areaName: "중앙 이동 경로" },
  { ...centerOfTile(12, 10), kind: "route", areaName: "중앙 이동 경로" },
  { ...centerOfTile(15, 10), kind: "route", areaName: "중앙 이동 경로" },
  { ...centerOfTile(18, 10), kind: "route", areaName: "중앙 이동 경로" },
  { ...centerOfTile(21, 10), kind: "route", areaName: "중앙 이동 경로" },
  { ...centerOfTile(24, 7), kind: "route", areaName: "오른쪽 이동 경로" },
  { ...centerOfTile(24, 10), kind: "route", areaName: "오른쪽 이동 경로" },
  { ...centerOfTile(24, 13), kind: "route", areaName: "오른쪽 이동 경로" },
  { ...centerOfTile(9, 16), kind: "route", areaName: "하단 이동 경로" },
  { ...centerOfTile(12, 16), kind: "route", areaName: "하단 이동 경로" },
  { ...centerOfTile(15, 16), kind: "route", areaName: "하단 이동 경로" },
  { ...centerOfTile(18, 16), kind: "route", areaName: "하단 이동 경로" },
  { ...centerOfTile(21, 16), kind: "route", areaName: "하단 이동 경로" },
];

const heroSlots = [...hillHeroSlots, ...routeHeroSlots];

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
  const { x, y, w, h } = MAP.bridge;
  rect(x, y, w, h, "#8f5a2a");

  for (let row = 0; row < h / TILE; row += 1) {
    for (let col = 0; col < w / TILE; col += 1) {
      rect(x + T(col), y + T(row), TILE - 2, TILE - 2, (col + row) % 2 === 0 ? "#b97b40" : "#a36a36");
      rect(x + T(col) + 5, y + T(row) + 4, TILE - 10, 4, "rgba(255,255,255,0.12)");
    }
  }

  rect(x, y, 4, h, "#6f4523");
  rect(x + w - 4, y, 4, h, "#6f4523");
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

function drawHeroLine() {
  const units = [
    { ...centerOfTile(4, 7), c: "#ff8f34", hat: true },
    { ...centerOfTile(4, 8), c: "#f36f27", hat: true },
    { ...centerOfTile(4, 9), c: "#d86a1c", hat: true },
  ];

  units.forEach((u) => drawTinyHero(u.x, u.y, u.c, u.hat));
}

function drawTinyHero(x, y, color, hat = false) {
  rect(x - 8, y - 10, 16, 18, color);
  rect(x - 6, y - 21, 12, 12, "#f2c28d");
  rect(x - 7, y - 23, 14, 4, "#3b2a20");
  rect(x - 12, y + 8, 8, 14, "#2f4055");
  rect(x + 4, y + 8, 8, 14, "#2f4055");
  if (hat) {
    rect(x - 14, y - 28, 28, 6, "#db3c24");
    rect(x - 8, y - 36, 16, 9, "#f2a23d");
  }
  rect(x - 3, y - 16, 3, 3, "#1d1d1d");
  rect(x + 4, y - 16, 3, 3, "#1d1d1d");
}

function drawPlacedHero(hero, index) {
  const bob = Math.sin(performance.now() / 300 + index) * 2;
  drawHeroBase(hero.x, hero.y + bob, hero.type);
}

function drawHeroBase(x, y, type) {
  rect(x - 18, y + 18, 36, 8, "rgba(0,0,0,0.25)");

  if (type === "guardian") {
    rect(x - 10, y - 18, 20, 34, "#3d72d8");
    rect(x - 8, y - 30, 16, 14, "#f0c18d");
    rect(x - 13, y - 36, 26, 8, "#f3f7ff");
    rect(x - 18, y - 8, 10, 20, "#a9c8ff");
    rect(x + 10, y - 5, 16, 6, "#e8e8e8");
    rect(x + 22, y - 9, 6, 14, "#f7f7f7");
  } else {
    rect(x - 10, y - 18, 20, 34, "#7a65d1");
    rect(x - 8, y - 30, 16, 14, "#f0c18d");
    rect(x - 13, y - 38, 26, 10, "#5a41a6");
  }

  rect(x - 4, y - 25, 3, 3, "#1d1d1d");
  rect(x + 4, y - 25, 3, 3, "#1d1d1d");
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
  text("00:" + String(state.timer).padStart(2, "0"), 480, 58, 32, "#17151f", "center");

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
}

function drawBottomUI() {
  rect(0, 578, W, 62, "rgba(20, 18, 24, 0.35)");

  drawStatusBar(52, 590, 230, 28, "#d94c89", "❤", "성벽", `${state.castleHp}%`);
  drawStatusBar(338, 590, 230, 28, "#b55e21", "⚡", "용기", `${state.courage}%`);

  rect(285, 538, 390, 34, "#f9f4e7");
  strokeRect(285, 538, 390, 34, "#2c2330", 4);
  text(state.message, 480, 555, 13, "#17151f", "center");

  rect(44, 594, 150, 42, "#f9f4e7");
  strokeRect(44, 594, 150, 42, "#2c2330", 4);
  rect(60, 605, 18, 18, "#b24539");
  rect(65, 600, 8, 28, "#d66555");
  text(String(state.coins), 105, 615, 18, "#17151f", "left");

  rect(384, 590, 190, 46, "#f9f4e7");
  strokeRect(384, 590, 190, 46, "#2c2330", 4);
  text("영웅 배치", 479, 613, 17, "#17151f", "center");

  rect(790, 584, 104, 52, "#f9f4e7");
  strokeRect(790, 584, 104, 52, "#2c2330", 4);
  drawSlashIcon(842, 610);
}

function drawStatusBar(x, y, w, h, fill, icon, label, value) {
  rect(x, y, w, h, "#4a1732");
  rect(x, y, w * (parseInt(value, 10) / 100), h, fill);
  strokeRect(x, y, w, h, "#261424", 3);
  text(icon, x + 18, y + 14, 22, "#fff", "center");
  text(label, x + 66, y + 14, 13, "#1b1420", "center");
  text(value, x + w - 36, y + 14, 14, "#1b1420", "center");
}

function drawSlashIcon(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.65);
  rect(-4, -32, 8, 64, "#ff7e2f");
  rect(-9, -30, 5, 58, "#fff4d2");
  rect(6, -24, 4, 48, "#d64635");
  ctx.restore();
}

function isSlotOccupied(slot) {
  return state.placedHeroes.some((hero) => hero.x === slot.x && hero.y === slot.y);
}

function drawSlotHighlights() {
  heroSlots.forEach((slot) => {
    if (isSlotOccupied(slot)) return;

    if (slot.kind === "route") {
      strokeRect(slot.x - 16, slot.y - 16, 32, 32, "rgba(255,230,130,0.55)", 2);
      rect(slot.x - 10, slot.y + 10, 20, 4, "rgba(76,44,18,0.35)");
      rect(slot.x - 3, slot.y - 3, 6, 6, "rgba(255,230,130,0.6)");
    } else {
      strokeRect(slot.x - 16, slot.y - 16, 32, 32, "rgba(255,255,255,0.32)", 2);
      rect(slot.x - 10, slot.y + 10, 20, 4, "rgba(255,255,255,0.18)");
    }
  });
}

function drawGridShadow() {
  ctx.save();
  ctx.globalAlpha = 0.1;
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

function render() {
  ctx.clearRect(0, 0, W, H);

  drawGrass();
  drawWater();
  drawPath();
  defenseZones.forEach(drawStoneDefenseZone);
  drawBridge();
  drawCastleAndProps();
  drawForest();
  drawHeroLine();
  drawSlotHighlights();
  state.placedHeroes.forEach(drawPlacedHero);
  drawGridShadow();
  drawTopUI();
  drawBottomUI();

  requestAnimationFrame(render);
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

function getDefenseArea(pos) {
  return defenseZones.find((zone) => isInsideRect(pos, zone, TILE));
}

function isInsideFullDefenseZone(pos) {
  return defenseZones.some((zone) => isInsideRect(pos, zone, 0));
}

function getPlacementArea(pos) {
  const defenseArea = getDefenseArea(pos);
  if (defenseArea) {
    return { kind: "hill", name: defenseArea.name };
  }

  if (isInsideRect(pos, MAP.pathZone, 0) && !isInsideFullDefenseZone(pos)) {
    return { kind: "route", name: MAP.pathZone.name };
  }

  const clickedSlot = findNearestEmptySlot(pos, null, 28);
  if (clickedSlot) {
    return { kind: clickedSlot.kind, name: clickedSlot.areaName };
  }

  return null;
}

function findNearestEmptySlot(pos, kind = null, maxDistance = Infinity) {
  let best = null;
  let bestDist = Infinity;

  heroSlots.forEach((slot) => {
    if (kind && slot.kind !== kind) return;
    if (isSlotOccupied(slot)) return;

    const dx = pos.x - slot.x;
    const dy = pos.y - slot.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist && dist <= maxDistance) {
      bestDist = dist;
      best = slot;
    }
  });

  return best;
}

canvas.addEventListener("click", (event) => {
  const pos = getMousePos(event);
  const area = getPlacementArea(pos);

  if (!area) {
    state.message = "방어 언덕이나 모래색 이동 경로 타일을 클릭하면 영웅을 배치할 수 있습니다.";
    return;
  }

  const slot = findNearestEmptySlot(pos, area.kind);
  if (!slot) {
    state.message = `${area.name}의 배치 슬롯이 모두 가득 찼습니다.`;
    return;
  }

  state.placedHeroes.push({ x: slot.x, y: slot.y, type: state.selectedHero, kind: slot.kind });
  state.courage = Math.min(100, state.courage + 10);

  const placeText = slot.kind === "route" ? "몬스터 이동 경로" : "방어 언덕";
  state.message = `${placeText} 타일에 영웅이 합류했습니다. 용기 ${state.courage}%`;
});

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "r") {
    state.placedHeroes = [];
    state.courage = 0;
    state.message = "배치가 초기화되었습니다. 방어 언덕이나 이동 경로 타일을 다시 클릭해보세요.";
  }
});

render();
