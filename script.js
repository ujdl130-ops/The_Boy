const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

ctx.imageSmoothingEnabled = false;

const W = canvas.width;
const H = canvas.height;
const TILE = 32;

const state = {
  wave: 1,
  timer: 29,
  castleHp: 100,
  courage: 0,
  coins: 25,
  selectedHero: "guardian",
  placedHeroes: [],
  message: "방어 언덕이나 몬스터 이동 경로를 클릭해 영웅을 배치하세요.",
  messageTimer: 0,
  running: true,
};

const defenseZones = [
  { x: 248, y: 178, w: 464, h: 132, name: "북쪽 방어 언덕" },
  { x: 248, y: 358, w: 464, h: 132, name: "남쪽 방어 언덕" },
];

const pathZone = { x: 102, y: 168, w: 756, h: 376, name: "몬스터 이동 경로" };

const hillHeroSlots = [
  { x: 306, y: 226, kind: "hill", areaName: "북쪽 방어 언덕" },
  { x: 386, y: 226, kind: "hill", areaName: "북쪽 방어 언덕" },
  { x: 466, y: 226, kind: "hill", areaName: "북쪽 방어 언덕" },
  { x: 546, y: 226, kind: "hill", areaName: "북쪽 방어 언덕" },
  { x: 626, y: 226, kind: "hill", areaName: "북쪽 방어 언덕" },
  { x: 306, y: 406, kind: "hill", areaName: "남쪽 방어 언덕" },
  { x: 386, y: 406, kind: "hill", areaName: "남쪽 방어 언덕" },
  { x: 466, y: 406, kind: "hill", areaName: "남쪽 방어 언덕" },
  { x: 546, y: 406, kind: "hill", areaName: "남쪽 방어 언덕" },
  { x: 626, y: 406, kind: "hill", areaName: "남쪽 방어 언덕" },
];

const routeHeroSlots = [
  // 왼쪽 진입로
  { x: 166, y: 260, kind: "route", areaName: "왼쪽 진입 경로" },
  { x: 166, y: 342, kind: "route", areaName: "왼쪽 진입 경로" },
  { x: 166, y: 424, kind: "route", areaName: "왼쪽 진입 경로" },

  // 두 방어 언덕 사이의 중앙 경로
  { x: 286, y: 334, kind: "route", areaName: "중앙 이동 경로" },
  { x: 382, y: 334, kind: "route", areaName: "중앙 이동 경로" },
  { x: 478, y: 334, kind: "route", areaName: "중앙 이동 경로" },
  { x: 574, y: 334, kind: "route", areaName: "중앙 이동 경로" },
  { x: 670, y: 334, kind: "route", areaName: "중앙 이동 경로" },

  // 오른쪽 우회 경로
  { x: 770, y: 244, kind: "route", areaName: "오른쪽 이동 경로" },
  { x: 770, y: 342, kind: "route", areaName: "오른쪽 이동 경로" },
  { x: 770, y: 442, kind: "route", areaName: "오른쪽 이동 경로" },

  // 하단 다리 앞 경로
  { x: 286, y: 516, kind: "route", areaName: "하단 이동 경로" },
  { x: 398, y: 516, kind: "route", areaName: "하단 이동 경로" },
  { x: 510, y: 516, kind: "route", areaName: "하단 이동 경로" },
  { x: 622, y: 516, kind: "route", areaName: "하단 이동 경로" },
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

function drawGrass() {
  rect(0, 0, W, H, "#7fac47");

  for (let y = 0; y < H; y += TILE) {
    for (let x = 0; x < W; x += TILE) {
      const n = (x * 17 + y * 31) % 5;
      rect(x, y, TILE, TILE, n === 0 ? "#83b64f" : "#78a845");
      if ((x + y) % 96 === 0) {
        rect(x + 8, y + 12, 4, 4, "#6c9a3f");
        rect(x + 18, y + 6, 3, 3, "#91c35d");
      }
    }
  }
}

function drawWater() {
  // 상단 강, 왼쪽 강, 하단 강
  rect(0, 84, W, 84, "#19a9c9");
  rect(0, 168, 102, 376, "#159dbe");
  rect(0, 544, W, 64, "#18a7c9");

  for (let x = 0; x < W; x += 48) {
    rect(x + 6, 116, 28, 4, "#47cbe0");
    rect(x + 20, 574, 32, 4, "#48cee4");
  }
  for (let y = 190; y < 520; y += 48) {
    rect(28, y, 4, 26, "#48cee4");
    rect(68, y + 16, 4, 22, "#0e87a5");
  }

  // 강가 그림자
  rect(0, 78, W, 6, "#4f8c48");
  rect(0, 168, W, 6, "#4f8c48");
  rect(96, 168, 6, 376, "#4f8c48");
  rect(0, 538, W, 6, "#4f8c48");
}

function drawPath() {
  // 모래 길
  rect(102, 168, 756, 376, "#d7c779");
  rect(124, 190, 712, 332, "#dccc80");

  for (let x = 120; x < 850; x += 32) {
    for (let y = 184; y < 532; y += 32) {
      if ((x + y) % 64 === 0) rect(x + 8, y + 14, 10, 3, "#c6b66f");
      else rect(x + 14, y + 7, 4, 4, "#e2d38e");
    }
  }
}

function drawStoneDefenseZone(zone) {
  const { x, y, w, h } = zone;

  // 돌 테두리
  for (let i = 0; i < w; i += 24) {
    rect(x + i, y, 24, 20, i % 48 === 0 ? "#6f765d" : "#87906e");
    rect(x + i, y + h - 20, 24, 20, i % 48 === 0 ? "#59604d" : "#6f765d");
  }
  for (let i = 0; i < h; i += 24) {
    rect(x, y + i, 20, 24, i % 48 === 0 ? "#6f765d" : "#87906e");
    rect(x + w - 20, y + i, 20, 24, i % 48 === 0 ? "#59604d" : "#6f765d");
  }

  // 내부 잔디
  rect(x + 20, y + 20, w - 40, h - 40, "#83aa42");
  for (let gx = x + 28; gx < x + w - 28; gx += 28) {
    for (let gy = y + 32; gy < y + h - 30; gy += 28) {
      if ((gx + gy) % 56 === 0) rect(gx, gy, 5, 5, "#91bb4b");
    }
  }

  strokeRect(x + 20, y + 20, w - 40, h - 40, "#667544", 3);
}

function drawBridge(x, y) {
  rect(x, y, 88, 78, "#9c6732");
  for (let i = 0; i < 78; i += 12) rect(x, y + i, 88, 6, "#c58a48");
  rect(x - 6, y, 6, 78, "#734c2a");
  rect(x + 88, y, 6, 78, "#734c2a");
  strokeRect(x, y, 88, 78, "#51341e", 3);
}

function drawCastleAndProps() {
  // 왼쪽 출입구 건물
  rect(110, 170, 74, 70, "#c9d4c2");
  rect(122, 184, 50, 28, "#eef0dc");
  rect(116, 214, 62, 18, "#696d6e");
  strokeRect(110, 170, 74, 70, "#344045", 4);

  // 오른쪽 현수막
  rect(830, 92, 104, 146, "#f2ddaa");
  rect(812, 84, 22, 168, "#c84b32");
  rect(924, 84, 22, 168, "#c84b32");
  rect(812, 76, 134, 18, "#f0b84e");
  rect(812, 244, 134, 16, "#f0b84e");
  strokeRect(830, 92, 104, 146, "#b98644", 3);

  // 작은 가방/상자 장식
  rect(786, 252, 44, 38, "#8b5c2e");
  rect(794, 238, 28, 18, "#c48743");
  strokeRect(786, 252, 44, 38, "#4d321c", 4);

  // 뼈 표식
  rect(284, 60, 12, 48, "#fbfbfb");
  rect(266, 78, 48, 12, "#fbfbfb");
  rect(270, 58, 16, 16, "#fbfbfb");
  rect(294, 58, 16, 16, "#fbfbfb");
  rect(270, 98, 16, 16, "#fbfbfb");
  rect(294, 98, 16, 16, "#fbfbfb");
  rect(281, 74, 18, 18, "#fbfbfb");
  rect(286, 80, 4, 4, "#222");
  rect(294, 80, 4, 4, "#222");
}

function drawForest() {
  for (let x = 0; x < W; x += 26) {
    drawTree(x + 8, 582, 1);
  }
  for (let x = 0; x < W; x += 28) {
    drawTree(x + 2, 620, 0.9);
  }

  for (let y = 220; y < 520; y += 34) {
    drawTree(900, y, 0.9);
    drawTree(936, y + 14, 0.8);
  }

  for (let x = 20; x < 210; x += 48) {
    drawTree(x, 40, 0.8);
  }
}

function drawTree(x, y, s = 1) {
  const w = 24 * s;
  const h = 34 * s;
  rect(x + w * 0.38, y + h * 0.54, w * 0.22, h * 0.34, "#6b4a29");
  rect(x + w * 0.25, y + h * 0.34, w * 0.5, h * 0.36, "#3e7b43");
  rect(x + w * 0.15, y + h * 0.48, w * 0.7, h * 0.28, "#2f6639");
  rect(x + w * 0.35, y + h * 0.15, w * 0.3, h * 0.28, "#57934d");
}

function drawHeroLine() {
  const units = [
    { x: 130, y: 250, c: "#ff8f34", hat: true },
    { x: 130, y: 288, c: "#f36f27", hat: true },
    { x: 130, y: 326, c: "#d86a1c", hat: true },
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
  // 그림자
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
  // 일시정지 버튼
  rect(38, 24, 72, 72, "#4e5d92");
  strokeRect(38, 24, 72, 72, "#2c355c", 5);
  rect(62, 42, 12, 36, "#f5f1e7");
  rect(78, 42, 12, 36, "#f5f1e7");

  // 중앙 웨이브 패널
  rect(350, 14, 260, 82, "#f7f1df");
  rect(368, 4, 224, 18, "#f7f1df");
  strokeRect(350, 14, 260, 82, "#2e2a36", 5);
  text("WAVE 1", 480, 24, 14, "#2e2a36", "center");
  text("00:" + String(state.timer).padStart(2, "0"), 480, 58, 32, "#17151f", "center");

  // 시작/재생 버튼
  rect(850, 24, 72, 72, "#4e5d92");
  strokeRect(850, 24, 72, 72, "#2c355c", 5);
  ctx.beginPath();
  ctx.fillStyle = "#f5f1e7";
  ctx.moveTo(878, 42);
  ctx.lineTo(878, 78);
  ctx.lineTo(904, 60);
  ctx.closePath();
  ctx.fill();

  // 체력바
  rect(360, 106, 240, 22, "#23305f");
  rect(360, 106, 240 * (state.castleHp / 100), 22, "#2c61d6");
  strokeRect(360, 106, 240, 22, "#17213f", 3);
  text(`${state.castleHp}/100`, 480, 117, 16, "#f7f1df", "center");
}

function drawBottomUI() {
  rect(0, 578, W, 62, "rgba(20, 18, 24, 0.35)");

  // 체력/용기 바
  drawStatusBar(52, 590, 230, 28, "#d94c89", "❤", "성벽", `${state.castleHp}%`);
  drawStatusBar(338, 590, 230, 28, "#b55e21", "⚡", "용기", `${state.courage}%`);

  // 말풍선
  rect(285, 538, 390, 34, "#f9f4e7");
  strokeRect(285, 538, 390, 34, "#2c2330", 4);
  text(state.message, 480, 555, 13, "#17151f", "center");

  // 코인
  rect(44, 594, 150, 42, "#f9f4e7");
  strokeRect(44, 594, 150, 42, "#2c2330", 4);
  rect(60, 605, 18, 18, "#b24539");
  rect(65, 600, 8, 28, "#d66555");
  text(String(state.coins), 105, 615, 18, "#17151f", "left");

  // 영웅 소환 버튼
  rect(384, 590, 190, 46, "#f9f4e7");
  strokeRect(384, 590, 190, 46, "#2c2330", 4);
  text("영웅 배치", 479, 613, 17, "#17151f", "center");

  // 스킬 카드
  rect(790, 584, 104, 52, "#f9f4e7");
  strokeRect(790, 584, 104, 52, "#2c2330", 4);
  drawSlashIcon(842, 610);
}

function drawStatusBar(x, y, w, h, fill, icon, label, value) {
  rect(x, y, w, h, "#4a1732");
  rect(x, y, w * (parseInt(value) / 100), h, fill);
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

function drawSlotHighlights() {
  heroSlots.forEach((slot) => {
    const occupied = isSlotOccupied(slot);
    if (occupied) return;

    if (slot.kind === "route") {
      // 몬스터가 지나가는 모래 경로 위에 설치 가능한 자리
      rect(slot.x - 14, slot.y + 12, 28, 6, "rgba(75,45,18,0.28)");
      strokeRect(slot.x - 18, slot.y - 22, 36, 46, "rgba(255,232,132,0.42)", 2);
      rect(slot.x - 4, slot.y - 2, 8, 8, "rgba(255,232,132,0.55)");
    } else {
      // 기존 방어 언덕 위에 설치 가능한 자리
      rect(slot.x - 14, slot.y + 12, 28, 6, "rgba(255,255,255,0.18)");
      strokeRect(slot.x - 16, slot.y - 20, 32, 44, "rgba(255,255,255,0.18)", 2);
    }
  });
}

function drawGridShadow() {
  // 맵이 타일 기반이라는 느낌을 주는 매우 약한 그리드
  ctx.globalAlpha = 0.07;
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
  ctx.globalAlpha = 1;
}

function render() {
  ctx.clearRect(0, 0, W, H);

  drawGrass();
  drawWater();
  drawPath();
  defenseZones.forEach(drawStoneDefenseZone);
  drawBridge(770, 500);
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
  return defenseZones.find((zone) => isInsideRect(pos, zone, 20));
}

function isInsideFullDefenseZone(pos) {
  return defenseZones.some((zone) => isInsideRect(pos, zone, 0));
}

function getPlacementArea(pos) {
  const defenseArea = getDefenseArea(pos);
  if (defenseArea) {
    return { kind: "hill", name: defenseArea.name };
  }

  if (isInsideRect(pos, pathZone, 0) && !isInsideFullDefenseZone(pos)) {
    return { kind: "route", name: pathZone.name };
  }

  const clickedSlot = findNearestEmptySlot(pos, null, 30);
  if (clickedSlot) {
    return { kind: clickedSlot.kind, name: clickedSlot.areaName };
  }

  return null;
}

function isSlotOccupied(slot) {
  return state.placedHeroes.some((hero) => hero.x === slot.x && hero.y === slot.y);
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
    state.message = "방어 언덕이나 모래색 이동 경로를 클릭하면 영웅을 배치할 수 있습니다.";
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
  state.message = `${placeText}에 영웅이 합류했습니다. 용기 ${state.courage}%`;
});

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "r") {
    state.placedHeroes = [];
    state.courage = 0;
    state.message = "배치가 초기화되었습니다. 방어 언덕이나 이동 경로를 다시 클릭해보세요.";
  }
});

render();
