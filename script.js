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

const state = {
  wave: 1,
  timer: 29,
  castleHp: 100,
  courage: 0,
  coins: 25,
  selectedHero: "guardian",
  placedHeroes: [],
  hoveredTile: null,
  message: "원하는 타일을 클릭하세요. 타일 한 칸에는 영웅 한 명만 배치됩니다.",
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

const blockedDecorTiles = new Set([
  // 왼쪽 성문 장식
  "3,5", "4,5", "3,6", "4,6",
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
  rect(x - 14, y + 11, 28, 5, "rgba(0,0,0,0.25)");

  if (type === "guardian") {
    rect(x - 8, y - 14, 16, 28, "#3d72d8");
    rect(x - 7, y - 25, 14, 12, "#f0c18d");
    rect(x - 11, y - 31, 22, 7, "#f3f7ff");
    rect(x - 15, y - 5, 8, 17, "#a9c8ff");
    rect(x + 8, y - 4, 14, 5, "#e8e8e8");
    rect(x + 20, y - 7, 5, 11, "#f7f7f7");
  } else {
    rect(x - 8, y - 14, 16, 28, "#7a65d1");
    rect(x - 7, y - 25, 14, 12, "#f0c18d");
    rect(x - 11, y - 32, 22, 8, "#5a41a6");
  }

  rect(x - 4, y - 20, 3, 3, "#1d1d1d");
  rect(x + 4, y - 20, 3, 3, "#1d1d1d");
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

  rect(245, 538, 470, 34, "#f9f4e7");
  strokeRect(245, 538, 470, 34, "#2c2330", 4);
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
    strokeRect(T(hero.col) + 2, T(hero.row) + 2, TILE - 4, TILE - 4, "rgba(255,255,255,0.32)", 2);
  });
}

function drawHoveredTile() {
  if (!state.hoveredTile) return;

  const { col, row } = state.hoveredTile;
  const x = T(col);
  const y = T(row);

  if (!isInstallableTile(col, row)) {
    rect(x, y, TILE, TILE, "rgba(255,60,60,0.18)");
    strokeRect(x + 1, y + 1, TILE - 2, TILE - 2, "rgba(255,80,80,0.75)", 2);
    return;
  }

  if (isTileOccupied(col, row)) {
    rect(x, y, TILE, TILE, "rgba(255,180,40,0.18)");
    strokeRect(x + 1, y + 1, TILE - 2, TILE - 2, "rgba(255,180,40,0.85)", 2);
    return;
  }

  rect(x, y, TILE, TILE, "rgba(255,255,255,0.12)");
  strokeRect(x + 1, y + 1, TILE - 2, TILE - 2, "rgba(255,245,160,0.9)", 2);
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

function isInstallableTile(col, row) {
  if (isWaterTile(col, row)) return false;
  if (isForestTile(col, row)) return false;
  if (blockedDecorTiles.has(tileKey(col, row))) return false;
  return true;
}

function isTileOccupied(col, row) {
  return state.placedHeroes.some((hero) => hero.col === col && hero.row === row);
}

function getTileAreaName(col, row) {
  const pos = centerOfTile(col, row);
  const defenseArea = defenseZones.find((zone) => isInsideRect(pos, zone, 0));
  if (defenseArea) return defenseArea.name;
  if (isTileInsideArea(col, row, MAP.bridge)) return "다리 방어 타일";
  if (isTileInsideArea(col, row, MAP.pathZone)) return "몬스터 이동 경로";
  return "일반 지형 타일";
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
  const tile = getTileFromMousePos(pos);

  if (!tile) {
    state.message = "UI 영역이 아닌 맵 타일을 클릭해야 배치할 수 있습니다.";
    return;
  }

  const { col, row } = tile;

  if (!isInstallableTile(col, row)) {
    state.message = "물가, 숲, 성문, 장식물 타일에는 영웅을 배치할 수 없습니다.";
    return;
  }

  if (isTileOccupied(col, row)) {
    state.message = `이미 (${col}, ${row}) 타일에 영웅이 있습니다. 한 타일에는 한 명만 배치됩니다.`;
    return;
  }

  const center = centerOfTile(col, row);
  state.placedHeroes.push({
    col,
    row,
    x: center.x,
    y: center.y,
    type: state.selectedHero,
    areaName: getTileAreaName(col, row),
  });

  state.courage = Math.min(100, state.courage + 10);
  state.message = `${getTileAreaName(col, row)} (${col}, ${row})에 정확히 배치했습니다. 용기 ${state.courage}%`;
});

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "r") {
    state.placedHeroes = [];
    state.courage = 0;
    state.message = "배치가 초기화되었습니다. 원하는 타일을 다시 클릭해보세요.";
  }
});

render();
