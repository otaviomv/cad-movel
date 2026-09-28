"use strict";

/*
  MOBILE CAD
  Motor 2D baseado em SVG.
  Unidade interna: milímetros.
*/

const svg = document.getElementById("cadSvg");
const objectsLayer = document.getElementById("objects");
const selectionLayer = document.getElementById("selectionLayer");

const coordX = document.getElementById("coordX");
const coordY = document.getElementById("coordY");

const commandHint = document.getElementById("commandHint");

const crosshair = document.getElementById("crosshair");

const toastEl = document.getElementById("toast");

let objects = [];
let selected = [];

let command = "select";

let drawingPoints = [];

let snapEnabled = true;
let gridEnabled = true;
let orthoEnabled = false;

let view = {
  x: 0,
  y: 0,
  scale: 2
};

let pointerState = {
  active: false,
  id: null,
  startScreen: null,
  startWorld: null
};

let panState = {
  active: false,
  startX: 0,
  startY: 0,
  viewX: 0,
  viewY: 0
};

let pinchState = null;

let history = [];
let historyIndex = -1;


/* =========================================================
   UTILIDADES
========================================================= */

function uid() {
  return "o_" + Date.now() + "_" + Math.random().toString(36).slice(2);
}

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function toast(message) {

  toastEl.textContent = message;

  toastEl.classList.add("show");

  clearTimeout(toastEl._timer);

  toastEl._timer = setTimeout(() => {
    toastEl.classList.remove("show");
  }, 1800);
}

function distance(a, b) {

  return Math.hypot(
    b.x - a.x,
    b.y - a.y
  );
}

function midpoint(a, b) {

  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function angle(a, b) {

  return Math.atan2(
    b.y - a.y,
    b.x - a.x
  );
}

function radToDeg(r) {
  return r * 180 / Math.PI;
}

function degToRad(d) {
  return d * Math.PI / 180;
}


/* =========================================================
   COORDENADAS
========================================================= */

function screenToWorld(clientX, clientY) {

  const rect = svg.getBoundingClientRect();

  const sx = clientX - rect.left;
  const sy = clientY - rect.top;

  const cx = rect.width / 2;
  const cy = rect.height / 2;

  return {
    x: view.x + (sx - cx) / view.scale,
    y: view.y + (sy - cy) / view.scale
  };
}

function worldToScreen(p) {

  const rect = svg.getBoundingClientRect();

  const cx = rect.width / 2;
  const cy = rect.height / 2;

  return {
    x: cx + (p.x - view.x) * view.scale,
    y: cy + (p.y - view.y) * view.scale
  };
}


/* =========================================================
   SNAP
========================================================= */

function getSnapPoints() {

  const points = [];

  for (const o of objects) {

    if (o.type === "line") {

      points.push(o.p1, o.p2);
      points.push(midpoint(o.p1, o.p2));

    } else if (o.type === "circle") {

      points.push(o.center);

      points.push({
        x: o.center.x + o.radius,
        y: o.center.y
      });

      points.push({
        x: o.center.x - o.radius,
        y: o.center.y
      });

      points.push({
        x: o.center.x,
        y: o.center.y + o.radius
      });

      points.push({
        x: o.center.x,
        y: o.center.y - o.radius
      });

    } else if (o.type === "rectangle") {

      points.push(...o.points);

    } else if (o.type === "polyline") {

      points.push(...o.points);

    }
  }

  return points;
}

function snapPoint(p) {

  if (!snapEnabled) return p;

  const candidates = getSnapPoints();

  let best = null;
  let bestDistance = Infinity;

  const tolerance = 14 / view.scale;

  for (const c of candidates) {

    const d = distance(p, c);

    if (d < tolerance && d < bestDistance) {

      best = c;
      bestDistance = d;
    }
  }

  if (best) {
    return clone(best);
  }

  return p;
}

function gridSnap(p) {

  if (!gridEnabled) return p;

  const step = view.scale < .7 ? 10 :
               view.scale < 1.5 ? 5 :
               1;

  return {
    x: Math.round(p.x / step) * step,
    y: Math.round(p.y / step) * step
  };
}

function getDrawingPoint(clientX, clientY) {

  let p = screenToWorld(clientX, clientY);

  p = gridSnap(p);

  p = snapPoint(p);

  if (
    orthoEnabled &&
    drawingPoints.length
  ) {

    const base = drawingPoints[drawingPoints.length - 1];

    const dx = Math.abs(p.x - base.x);
    const dy = Math.abs(p.y - base.y);

    if (dx > dy) {
      p.y = base.y;
    } else {
      p.x = base.x;
    }
  }

  return p;
}


/* =========================================================
   RENDER
========================================================= */

function clearLayer(layer) {

  while (layer.firstChild) {
    layer.removeChild(layer.firstChild);
  }
}

function makeSvg(tag, attrs = {}) {

  const el = document.createElementNS(
    "http://www.w3.org/2000/svg",
    tag
  );

  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }

  return el;
}

function render() {

  clearLayer(objectsLayer);
  clearLayer(selectionLayer);

  for (const o of objects) {

    let el = null;

    if (o.type === "line") {

      el = makeSvg("line", {
        x1: o.p1.x,
        y1: o.p1.y,
        x2: o.p2.x,
        y2: o.p2.y
      });

    }

    else if (o.type === "circle") {

      el = makeSvg("circle", {
        cx: o.center.x,
        cy: o.center.y,
        r: o.radius
      });

    }

    else if (o.type === "rectangle") {

      const xs = o.points.map(p => p.x);
      const ys = o.points.map(p => p.y);

      const minX = Math.min(...xs);
      const minY = Math.min(...ys);

      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);

      el = makeSvg("rect", {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
      });

    }

    else if (o.type === "polyline") {

      el = makeSvg("polyline", {
        points: o.points
          .map(p => `${p.x},${p.y}`)
          .join(" ")
      });

    }

    else if (o.type === "arc") {

      const p = arcEndpoint(o);

      const large = Math.abs(o.endAngle - o.startAngle) > Math.PI ? 1 : 0;

      const sweep = o.endAngle > o.startAngle ? 1 : 0;

      el = makeSvg("path", {
        d:
          `M ${p.start.x} ${p.start.y} ` +
          `A ${o.radius} ${o.radius} 0 ${large} ${sweep} ` +
          `${p.end.x} ${p.end.y}`
      });
    }

    else if (o.type === "spring") {

      el = makeSvg("polyline", {
        points: o.points
          .map(p => `${p.x},${p.y}`)
          .join(" ")
      });

    }

    else if (o.type === "dimension") {

      renderDimension(o);
      continue;
    }

    if (!el) continue;

    el.dataset.id = o.id;

    el.classList.add("cad-object");

    if (selected.includes(o.id)) {
      el.classList.add("selected");
    }

    objectsLayer.appendChild(el);
  }

  renderSelection();
}

function renderDimension(o) {

  const g = makeSvg("g");

  g.dataset.id = o.id;

  g.classList.add("dimension");

  const line = makeSvg("line", {
    x1: o.p1.x,
    y1: o.p1.y,
    x2: o.p2.x,
    y2: o.p2.y
  });

  const p1 = o.p1;
  const p2 = o.p2;

  const d = distance(p1, p2);

  const text = makeSvg("text", {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2 - 5,
    "text-anchor": "middle",
    class: "dimension-text"
  });

  text.textContent = `${d.toFixed(2)} mm`;

  g.appendChild(line);
  g.appendChild(text);

  objectsLayer.appendChild(g);
}

function renderSelection() {

  for (const id of selected) {

    const o = objects.find(x => x.id === id);

    if (!o) continue;

    const bounds = getBounds(o);

    if (!bounds) continue;

    const rect = makeSvg("rect", {
      x: bounds.minX - 3,
      y: bounds.minY - 3,
      width: bounds.maxX - bounds.minX + 6,
      height: bounds.maxY - bounds.minY + 6
    });

    rect.classList.add("selection-box");

    selectionLayer.appendChild(rect);
  }
}

function getBounds(o) {

  if (o.type === "line") {

    return {
      minX: Math.min(o.p1.x, o.p2.x),
      minY: Math.min(o.p1.y, o.p2.y),
      maxX: Math.max(o.p1.x, o.p2.x),
      maxY: Math.max(o.p1.y, o.p2.y)
    };
  }

  if (o.type === "circle") {

    return {
      minX: o.center.x - o.radius,
      minY: o.center.y - o.radius,
      maxX: o.center.x + o.radius,
      maxY: o.center.y + o.radius
    };
  }

  if (
    o.type === "rectangle" ||
    o.type === "polyline" ||
    o.type === "spring"
  ) {

    const xs = o.points.map(p => p.x);
    const ys = o.points.map(p => p.y);

    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys)
    };
  }

  if (o.type === "arc") {

    return {
      minX: o.center.x - o.radius,
      minY: o.center.y - o.radius,
      maxX: o.center.x + o.radius,
      maxY: o.center.y + o.radius
    };
  }

  return null;
}


/* =========================================================
   HISTÓRICO
========================================================= */

function saveHistory() {

  history = history.slice(0, historyIndex + 1);

  history.push(clone(objects));

  historyIndex++;

  if (history.length > 50) {
    history.shift();
    historyIndex--;
  }
}

function undo() {

  if (historyIndex <= 0) return;

  historyIndex--;

  objects = clone(history[historyIndex]);

  selected = [];

  render();
}

function redo() {

  if (historyIndex >= history.length - 1) return;

  historyIndex++;

  objects = clone(history[historyIndex]);

  selected = [];

  render();
}


/* =========================================================
   SELEÇÃO
========================================================= */

function objectFromElement(el) {

  const id = el?.dataset?.id;

  if (!id) return null;

  return objects.find(o => o.id === id);
}

function selectObject(o, additive = false) {

  if (!o) return;

  if (!additive) {
    selected = [];
  }

  if (!selected.includes(o.id)) {
    selected.push(o.id);
  }

  render();
  updateProperties();
}

function deleteSelected() {

  if (!selected.length) return;

  saveHistory();

  objects = objects.filter(
    o => !selected.includes(o.id)
  );

  selected = [];

  render();

  toast("Objeto apagado");
}


/* =========================================================
   COMANDOS
========================================================= */

function setCommand(c) {

  command = c;

  drawingPoints = [];

  document.querySelectorAll(".commandBar button")
    .forEach(btn => {

      btn.classList.toggle(
        "active",
        btn.dataset.command === c
      );

    });

  const messages = {

    select: "Toque em um objeto para selecionar",

    line: "Linha: toque no primeiro e segundo ponto",

    polyline: "Polilinha: toque nos pontos; toque duas vezes para finalizar",

    circle: "Círculo: centro → raio",

    arc: "Arco: centro → início → fim",

    rectangle: "Retângulo: canto 1 → canto 2",

    spring: "Mola: ponto inicial → ponto final",

    dimension: "Cota: toque nos dois pontos",

    measure: "Medir: toque nos dois pontos",

    move: "Mover: selecione um objeto e depois um ponto base",

    copy: "Copiar: selecione um objeto e depois um ponto base",

    rotate: "Rotacionar: selecione e informe ângulo",

    mirror: "Espelhar: selecione e defina o eixo",

    offset: "Offset: selecione uma linha ou círculo",

    delete: "Toque no objeto para apagar"
  };

  commandHint.textContent =
    messages[c] || "Selecione um comando";
}


/* =========================================================
   CRIAÇÃO
========================================================= */

function addObject(o) {

  o.id = uid();

  objects.push(o);

  saveHistory();

  render();
}

function createLine(p1, p2) {

  addObject({
    type: "line",
    p1: clone(p1),
    p2: clone(p2)
  });
}

function createCircle(center, radius) {

  addObject({
    type: "circle",
    center: clone(center),
    radius
  });
}

function createRectangle(p1, p2) {

  addObject({
    type: "rectangle",

    points: [
      {x: p1.x, y: p1.y},
      {x: p2.x, y: p1.y},
      {x: p2.x, y: p2.y},
      {x: p1.x, y: p2.y}
    ]
  });
}

function createPolyline(points) {

  addObject({
    type: "polyline",
    points: clone(points)
  });
}

function createSpring(p1, p2, coils = 12, amplitude = 5) {

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  const length = Math.hypot(dx, dy);

  if (length < 1) return;

  const ux = dx / length;
  const uy = dy / length;

  const px = -uy;
  const py = ux;

  const points = [];

  const samples = coils * 12;

  for (let i = 0; i <= samples; i++) {

    const t = i / samples;

    const along = length * t;

    const offset =
      Math.sin(t * coils * Math.PI * 2) *
      amplitude;

    points.push({
      x: p1.x + ux * along + px * offset,
      y: p1.y + uy * along + py * offset
    });
  }

  addObject({
    type: "spring",
    points,
    coils,
    amplitude
  });
}


/* =========================================================
   ARCO
========================================================= */

function arcEndpoint(o) {

  return {

    start: {
      x: o.center.x +
        Math.cos(o.startAngle) * o.radius,

      y: o.center.y +
        Math.sin(o.startAngle) * o.radius
    },

    end: {
      x: o.center.x +
        Math.cos(o.endAngle) * o.radius,

      y: o.center.y +
        Math.sin(o.endAngle) * o.radius
    }
  };
}


/* =========================================================
   TRANSFORMAÇÕES
========================================================= */

function translateObject(o, dx, dy) {

  if (o.p1) {
    o.p1.x += dx;
    o.p1.y += dy;
  }

  if (o.p2) {
    o.p2.x += dx;
    o.p2.y += dy;
  }

  if (o.center) {
    o.center.x += dx;
    o.center.y += dy;
  }

  if (o.points) {

    for (const p of o.points) {
      p.x += dx;
      p.y += dy;
    }
  }
}

function rotatePoint(p, center, angleRad) {

  const dx = p.x - center.x;
  const dy = p.y - center.y;

  return {

    x:
      center.x +
      dx * Math.cos(angleRad) -
      dy * Math.sin(angleRad),

    y:
      center.y +
      dx * Math.sin(angleRad) +
      dy * Math.cos(angleRad)
  };
}

function rotateObject(o, center, angleRad) {

  if (o.p1) {
    o.p1 = rotatePoint(o.p1, center, angleRad);
  }

  if (o.p2) {
    o.p2 = rotatePoint(o.p2, center, angleRad);
  }

  if (o.center) {
    o.center =
      rotatePoint(o.center, center, angleRad);
  }

  if (o.points) {

    o.points =
      o.points.map(p =>
        rotatePoint(p, center, angleRad)
      );
  }

  if (o.startAngle !== undefined) {
    o.startAngle += angleRad;
    o.endAngle += angleRad;
  }
}

function mirrorPoint(p, a, b) {

  const dx = b.x - a.x;
  const dy = b.y - a.y;

  const len2 = dx * dx + dy * dy;

  if (len2 === 0) return clone(p);

  const t =
    ((p.x - a.x) * dx +
     (p.y - a.y) * dy) / len2;

  const proj = {
    x: a.x + t * dx,
    y: a.y + t * dy
  };

  return {
    x: 2 * proj.x - p.x,
    y: 2 * proj.y - p.y
  };
}

function mirrorObject(o, a, b) {

  if (o.p1) {
    o.p1 = mirrorPoint(o.p1, a, b);
  }

  if (o.p2) {
    o.p2 = mirrorPoint(o.p2, a, b);
  }

  if (o.center) {
    o.center =
      mirrorPoint(o.center, a, b);
  }

  if (o.points) {

    o.points =
      o.points.map(p =>
        mirrorPoint(p, a, b)
      );
  }
}


/* =========================================================
   INPUT DIALOG
========================================================= */

const inputDialog =
  document.getElementById("inputDialog");

const dialogTitle =
  document.getElementById("dialogTitle");

const dialogFields =
  document.getElementById("dialogFields");

let dialogResolve = null;

function ask(title, fields) {

  return new Promise(resolve => {

    dialogResolve = resolve;

    dialogTitle.textContent = title;

    dialogFields.innerHTML = "";

    fields.forEach(field => {

      const div =
        document.createElement("div");

      div.className = "dialogField";

      div.innerHTML = `
        <label>${field.label}</label>
        <input
          id="field_${field.name}"
          type="${field.type || "number"}"
          value="${field.value ?? ""}"
          ${field.step ? `step="${field.step}"` : ""}
        >
      `;

      dialogFields.appendChild(div);
    });

    inputDialog.classList.remove("hidden");

    setTimeout(() => {

      dialogFields
        .querySelector("input")
        ?.focus();

    }, 50);
  });
}

function closeDialog(result) {

  inputDialog.classList.add("hidden");

  if (!dialogResolve) return;

  const resolve = dialogResolve;

  dialogResolve = null;

  resolve(result);
}

document.getElementById("dialogCancel")
  .onclick = () => closeDialog(null);

document.getElementById("dialogOK")
  .onclick = () => {

    const result = {};

    dialogFields
      .querySelectorAll("input")
      .forEach(input => {

        const name =
          input.id.replace("field_", "");

        result[name] =
          input.type === "number"
            ? Number(input.value)
            : input.value;
      });

    closeDialog(result);
  };


/* =========================================================
   COMANDOS POR TOQUE
========================================================= */

async function processPoint(p) {

  if (command === "select") return;

  if (command === "line") {

    drawingPoints.push(p);

    if (drawingPoints.length === 2) {

      createLine(
        drawingPoints[0],
        drawingPoints[1]
      );

      drawingPoints = [];
    }

    return;
  }

  if (command === "rectangle") {

    drawingPoints.push(p);

    if (drawingPoints.length === 2) {

      createRectangle(
        drawingPoints[0],
        drawingPoints[1]
      );

      drawingPoints = [];
    }

    return;
  }

  if (command === "circle") {

    if (!drawingPoints.length) {

      drawingPoints.push(p);

      commandHint.textContent =
        "Agora toque no ponto do raio";

      return;
    }

    const center = drawingPoints[0];

    const radius = distance(center, p);

    createCircle(center, radius);

    drawingPoints = [];

    commandHint.textContent =
      "Círculo criado";

    return;
  }

  if (command === "polyline") {

    drawingPoints.push(p);

    if (drawingPoints.length >= 2) {

      commandHint.textContent =
        "Continue tocando ou toque duas vezes para finalizar";
    }

    return;
  }

  if (command === "spring") {

    drawingPoints.push(p);

    if (drawingPoints.length === 2) {

      const result = await ask(
        "Parâmetros da mola",
        [
          {
            name: "coils",
            label: "Número de voltas",
            value: 12,
            step: 1
          },
          {
            name: "amplitude",
            label: "Amplitude (mm)",
            value: 5,
            step: .1
          }
        ]
      );

      if (result) {

        createSpring(
          drawingPoints[0],
          drawingPoints[1],
          Math.max(1, result.coils),
          Math.max(.1, result.amplitude)
        );
      }

      drawingPoints = [];
    }

    return;
  }

  if (command === "dimension") {

    drawingPoints.push(p);

    if (drawingPoints.length === 2) {

      addObject({
        type: "dimension",
        p1: clone(drawingPoints[0]),
        p2: clone(drawingPoints[1])
      });

      drawingPoints = [];
    }

    return;
  }

  if (command === "measure") {

    drawingPoints.push(p);

    if (drawingPoints.length === 2) {

      const d =
        distance(
          drawingPoints[0],
          drawingPoints[1]
        );

      const ang =
        radToDeg(
          angle(
            drawingPoints[0],
            drawingPoints[1]
          )
        );

      toast(
        `${d.toFixed(2)} mm | ${ang.toFixed(2)}°`
      );

      drawingPoints = [];
    }

    return;
  }

  if (
    command === "move" ||
    command === "copy"
  ) {

    if (!selected.length) {

      toast("Selecione primeiro um objeto");

      setCommand("select");

      return;
    }

    if (!drawingPoints.length) {

      drawingPoints.push(p);

      commandHint.textContent =
        "Agora toque no ponto de destino";

      return;
    }

    const base = drawingPoints[0];

    const dx = p.x - base.x;
    const dy = p.y - base.y;

    saveHistory();

    const originals =
      objects.filter(o =>
        selected.includes(o.id)
      );

    if (command === "copy") {

      const copies =
        originals.map(o => {

          const c = clone(o);

          c.id = uid();

          translateObject(c, dx, dy);

          return c;
        });

      objects.push(...copies);

    } else {

      for (const o of originals) {
        translateObject(o, dx, dy);
      }
    }

    drawingPoints = [];

    render();

    return;
  }

  if (command === "delete") {

    const target =
      findObjectNear(p);

    if (target) {

      selected = [target.id];

      deleteSelected();
    }

    return;
  }

  if (command === "rotate") {

    if (!selected.length) {

      const target =
        findObjectNear(p);

      if (target) {

        selected = [target.id];

        render();

        const r =
          await ask(
            "Rotacionar",
            [
              {
                name: "angle",
                label: "Ângulo (graus)",
                value: 90,
                step: 1
              }
            ]
          );

        if (r) {

          saveHistory();

          const center =
            getObjectCenter(target);

          rotateObject(
            target,
            center,
            degToRad(r.angle)
          );

          render();
        }
      }

      return;
    }
  }

  if (command === "mirror") {

    if (!selected.length) {

      toast("Selecione um objeto");

      setCommand("select");

      return;
    }

    drawingPoints.push(p);

    if (drawingPoints.length === 2) {

      const a = drawingPoints[0];
      const b = drawingPoints[1];

      saveHistory();

      for (const id of selected) {

        const o =
          objects.find(x => x.id === id);

        if (o) {
          mirrorObject(o, a, b);
        }
      }

      drawingPoints = [];

      render();
    }

    return;
  }

  if (command === "offset") {

    const target =
      findObjectNear(p);

    if (!target) {

      toast("Selecione uma linha ou círculo");

      return;
    }

    if (
      target.type !== "line" &&
      target.type !== "circle"
    ) {

      toast("Offset disponível para linha/círculo");

      return;
    }

    const result =
      await ask(
        "Offset",
        [
          {
            name: "distance",
            label: "Distância (mm)",
            value: 5,
            step: .1
          }
        ]
      );

    if (!result) return;

    const d = Math.abs(result.distance);

    if (target.type === "circle") {

      addObject({
        type: "circle",

        center: clone(target.center),

        radius:
          target.radius + d
      });

    } else {

      const dx =
        target.p2.x - target.p1.x;

      const dy =
        target.p2.y - target.p1.y;

      const len =
        Math.hypot(dx, dy);

      if (!len) return;

      const nx = -dy / len;
      const ny = dx / len;

      addObject({
        type: "line",

        p1: {
          x: target.p1.x + nx * d,
          y: target.p1.y + ny * d
        },

        p2: {
          x: target.p2.x + nx * d,
          y: target.p2.y + ny * d
        }
      });
    }
  }
}


/* =========================================================
   BUSCA DE OBJETO
========================================================= */

function pointToSegmentDistance(p, a, b) {

  const dx = b.x - a.x;
  const dy = b.y - a.y;

  const len2 = dx * dx + dy * dy;

  if (len2 === 0) {
    return distance(p, a);
  }

  let t =
    ((p.x - a.x) * dx +
     (p.y - a.y) * dy) / len2;

  t = Math.max(0, Math.min(1, t));

  return distance(
    p,
    {
      x: a.x + t * dx,
      y: a.y + t * dy
    }
  );
}

function objectDistance(o, p) {

  if (o.type === "line") {

    return pointToSegmentDistance(
      p,
      o.p1,
      o.p2
    );
  }

  if (o.type === "circle") {

    return Math.abs(
      distance(p, o.center) -
      o.radius
    );
  }

  if (
    o.type === "polyline" ||
    o.type === "spring"
  ) {

    let min = Infinity;

    for (
      let i = 0;
      i < o.points.length - 1;
      i++
    ) {

      min = Math.min(
        min,
        pointToSegmentDistance(
          p,
          o.points[i],
          o.points[i + 1]
        )
      );
    }

    return min;
  }

  if (o.type === "rectangle") {

    let min = Infinity;

    for (let i = 0; i < 4; i++) {

      const a = o.points[i];
      const b = o.points[(i + 1) % 4];

      min = Math.min(
        min,
        pointToSegmentDistance(p, a, b)
      );
    }

    return min;
  }

  return Infinity;
}

function findObjectNear(p) {

  const tolerance =
    18 / view.scale;

  let best = null;
  let bestD = Infinity;

  for (const o of objects) {

    const d =
      objectDistance(o, p);

    if (
      d < tolerance &&
      d < bestD
    ) {

      best = o;
      bestD = d;
    }
  }

  return best;
}

function getObjectCenter(o) {

  const b = getBounds(o);

  return {
    x: (b.minX + b.maxX) / 2,
    y: (b.minY + b.maxY) / 2
  };
}


/* =========================================================
   SVG POINTER
========================================================= */

svg.addEventListener("pointerdown", e => {

  if (e.pointerType === "touch") {

    if (e.isPrimary === false) return;
  }

  svg.setPointerCapture(e.pointerId);

  pointerState.active = true;
  pointerState.id = e.pointerId;

  pointerState.startScreen = {
    x: e.clientX,
    y: e.clientY
  };

  pointerState.startWorld =
    screenToWorld(
      e.clientX,
      e.clientY
    );

  const p =
    getDrawingPoint(
      e.clientX,
      e.clientY
    );

  if (command === "select") {

    const target =
      findObjectNear(p);

    if (target) {

      selectObject(
        target,
        e.shiftKey
      );

    } else {

      selected = [];

      render();
    }

  } else {

    processPoint(p);
  }

});

svg.addEventListener("pointermove", e => {

  const p =
    screenToWorld(
      e.clientX,
      e.clientY
    );

  coordX.textContent =
    p.x.toFixed(2);

  coordY.textContent =
    p.y.toFixed(2);

  const rect =
    svg.getBoundingClientRect();

  crosshair.style.left =
    `${e.clientX - rect.left}px`;

  crosshair.style.top =
    `${e.clientY - rect.top}px`;

  crosshair.style.display =
    "block";

  if (
    pointerState.active &&
    command === "select" &&
    e.buttons
  ) {

    /*
      Arraste com um dedo para pan
      somente quando não estiver sobre objeto.
    */
  }
});

svg.addEventListener("pointerup", e => {

  pointerState.active = false;

});

svg.addEventListener("pointerleave", () => {

  crosshair.style.display = "none";

});

svg.addEventListener("dblclick", e => {

  if (command === "polyline") {

    if (drawingPoints.length >= 2) {

      createPolyline(
        drawingPoints
      );

      drawingPoints = [];

      toast("Polilinha criada");
    }
  }
});


/* =========================================================
   ZOOM
========================================================= */

svg.addEventListener(
  "wheel",
  e => {

    e.preventDefault();

    const before =
      screenToWorld(
        e.clientX,
        e.clientY
      );

    const factor =
      e.deltaY < 0 ? 1.15 : .87;

    view.scale *= factor;

    view.scale =
      Math.max(.1, Math.min(30, view.scale));

    const after =
      screenToWorld(
        e.clientX,
        e.clientY
      );

    view.x += before.x - after.x;
    view.y += before.y - after.y;

    render();
  },
  {passive: false}
);


/* =========================================================
   PINCH
========================================================= */

svg.addEventListener("touchstart", e => {

  if (e.touches.length !== 2) return;

  const a = e.touches[0];
  const b = e.touches[1];

  const centerX =
    (a.clientX + b.clientX) / 2;

  const centerY =
    (a.clientY + b.clientY) / 2;

  const dist =
    Math.hypot(
      b.clientX - a.clientX,
      b.clientY - a.clientY
    );

  pinchState = {
    distance: dist,
    scale: view.scale,
    centerX,
    centerY
  };

}, {passive: false});

svg.addEventListener("touchmove", e => {

  if (
    e.touches.length !== 2 ||
    !pinchState
  ) return;

  e.preventDefault();

  const a = e.touches[0];
  const b = e.touches[1];

  const centerX =
    (a.clientX + b.clientX) / 2;

  const centerY =
    (a.clientY + b.clientY) / 2;

  const dist =
    Math.hypot(
      b.clientX - a.clientX,
      b.clientY - a.clientY
    );

  const factor =
    dist / pinchState.distance;

  const before =
    screenToWorld(
      centerX,
      centerY
    );

  view.scale =
    pinchState.scale * factor;

  view.scale =
    Math.max(.1, Math.min(30, view.scale));

  const after =
    screenToWorld(
      centerX,
      centerY
    );

  view.x += before.x - after.x;
  view.y += before.y - after.y;

  render();

}, {passive: false});

svg.addEventListener("touchend", () => {

  pinchState = null;

});


/* =========================================================
   BOTÕES
========================================================= */

document.querySelectorAll(
  ".commandBar button"
).forEach(btn => {

  btn.addEventListener("click", () => {

    setCommand(
      btn.dataset.command
    );
  });
});


document.getElementById("undoBtn")
  .onclick = undo;

document.getElementById("redoBtn")
  .onclick = redo;


document.getElementById("gridBtn")
  .onclick = () => {

    gridEnabled = !gridEnabled;

    document
      .getElementById("gridBtn")
      .classList.toggle(
        "active",
        gridEnabled
      );

    document
      .getElementById("grid")
      .style.display =
        gridEnabled ? "" : "none";
  };


document.getElementById("snapBtn")
  .onclick = () => {

    snapEnabled = !snapEnabled;

    document
      .getElementById("snapBtn")
      .classList.toggle(
        "active",
        snapEnabled
      );

    document.getElementById(
      "snapState"
    ).textContent =
      snapEnabled ? "ON" : "OFF";
  };


document.getElementById("orthoBtn")
  .onclick = () => {

    orthoEnabled = !orthoEnabled;

    document
      .getElementById("orthoBtn")
      .classList.toggle(
        "active",
        orthoEnabled
      );
  };


document.getElementById("zoomFitBtn")
  .onclick = zoomFit;


/* =========================================================
   FIT
========================================================= */

function zoomFit() {

  if (!objects.length) {

    view.x = 0;
    view.y = 0;
    view.scale = 2;

    render();

    return;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const o of objects) {

    const b = getBounds(o);

    if (!b) continue;

    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);

    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }

  const rect =
    svg.getBoundingClientRect();

  const width =
    Math.max(1, maxX - minX);

  const height =
    Math.max(1, maxY - minY);

  view.x =
    (minX + maxX) / 2;

  view.y =
    (minY + maxY) / 2;

  view.scale =
    Math.min(
      rect.width / (width * 1.25),
      rect.height / (height * 1.25)
    );

  view.scale =
    Math.max(.1, Math.min(30, view.scale));

  render();
}


/* =========================================================
   MENU
========================================================= */

const sideMenu =
  document.getElementById("sideMenu");

document.getElementById("menuBtn")
  .onclick = () => {

    sideMenu.classList.remove(
      "hidden"
    );
  };

document.getElementById("closeMenu")
  .onclick = () => {

    sideMenu.classList.add(
      "hidden"
    );
  };


/* =========================================================
   NOVO
========================================================= */

document.getElementById("newBtn")
  .onclick = () => {

    if (
      objects.length &&
      !confirm("Apagar o desenho atual?")
    ) {
      return;
    }

    objects = [];
    selected = [];

    history = [];
    historyIndex = -1;

    saveHistory();

    render();

    sideMenu.classList.add("hidden");

    toast("Novo desenho");
  };


/* =========================================================
   SALVAR LOCAL
========================================================= */

function projectData() {

  return {

    version: 1,

    unit: "mm",

    objects: clone(objects),

    view: clone(view),

    date: new Date().toISOString()
  };
}

function saveLocal() {

  localStorage.setItem(
    "mobileCAD_project",
    JSON.stringify(projectData())
  );

  toast("Projeto salvo neste aparelho");
}

document.getElementById("saveBtn")
  .onclick = saveLocal;


/* =========================================================
   ABRIR
========================================================= */

document.getElementById("openBtn")
  .onclick = () => {

    document
      .getElementById("fileInput")
      .click();
  };

document.getElementById("fileInput")
  .addEventListener(
    "change",
    e => {

      const file =
        e.target.files[0];

      if (!file) return;

      const reader =
        new FileReader();

      reader.onload = () => {

        try {

          const data =
            JSON.parse(reader.result);

          objects =
            Array.isArray(data.objects)
              ? data.objects
              : [];

          if (data.view) {
            view = data.view;
          }

          selected = [];

          history = [];

          historyIndex = -1;

          saveHistory();

          render();

          sideMenu.classList.add(
            "hidden"
          );

          toast("Projeto aberto");

        } catch {

          toast("Arquivo inválido");
        }
      };

      reader.readAsText(file);
    }
  );


/* =========================================================
   AUTO-RESTORE
========================================================= */

function restoreLocal() {

  try {

    const raw =
      localStorage.getItem(
        "mobileCAD_project"
      );

    if (!raw) {

      saveHistory();

      return;
    }

    const data =
      JSON.parse(raw);

    if (
      data &&
      Array.isArray(data.objects)
    ) {

      objects =
        data.objects;

      if (data.view) {
        view = data.view;
      }
    }

  } catch {}

  saveHistory();

  render();
}


/* =========================================================
   EXPORTAÇÃO SVG
========================================================= */

function exportSVG() {

  const cloneSvg =
    svg.cloneNode(true);

  cloneSvg
    .querySelector("#grid")
    ?.remove();

  cloneSvg
    .querySelector("#selectionLayer")
    ?.remove();

  cloneSvg.removeAttribute("id");

  const serializer =
    new XMLSerializer();

  const source =
    serializer.serializeToString(
      cloneSvg
    );

  const blob =
    new Blob(
      [source],
      {
        type: "image/svg+xml"
      }
    );

  downloadBlob(
    blob,
    "projeto-mobile-cad.svg"
  );
}

document.getElementById(
  "exportSvgBtn"
).onclick = () => {

  exportSVG();

  sideMenu.classList.add("hidden");
};


/* =========================================================
   DXF
========================================================= */

function dxfHeader() {

  return [
    "0",
    "SECTION",
    "2",
    "HEADER",
    "0",
    "ENDSEC",
    "0",
    "SECTION",
    "2",
    "ENTITIES"
  ].join("\n") + "\n";
}

function dxfFooter() {

  return [
    "0",
    "ENDSEC",
    "0",
    "EOF"
  ].join("\n") + "\n";
}

function dxfLine(o) {

  return [
    "0",
    "LINE",
    "8",
    "0",
    "10",
    o.p1.x,
    "20",
    -o.p1.y,
    "30",
    "0",
    "11",
    o.p2.x,
    "21",
    -o.p2.y,
    "31",
    "0"
  ].join("\n") + "\n";
}

function dxfCircle(o) {

  return [
    "0",
    "CIRCLE",
    "8",
    "0",
    "10",
    o.center.x,
    "20",
    -o.center.y,
    "30",
    "0",
    "40",
    o.radius
  ].join("\n") + "\n";
}

function dxfPolyline(points) {

  let out = [
    "0",
    "LWPOLYLINE",
    "8",
    "0",
    "90",
    points.length,
    "70",
    "0"
  ].join("\n") + "\n";

  for (const p of points) {

    out += [
      "10",
      p.x,
      "20",
      -p.y
    ].join("\n") + "\n";
  }

  return out;
}

function exportDXF() {

  let dxf = dxfHeader();

  for (const o of objects) {

    if (o.type === "line") {

      dxf += dxfLine(o);
    }

    else if (o.type === "circle") {

      dxf += dxfCircle(o);
    }

    else if (
      o.type === "polyline" ||
      o.type === "spring" ||
      o.type === "rectangle"
    ) {

      dxf += dxfPolyline(o.points);
    }

    else if (o.type === "arc") {

      dxf += [
        "0",
        "ARC",
        "8",
        "0",
        "10",
        o.center.x,
        "20",
        -o.center.y,
        "30",
        "0",
        "40",
        o.radius,
        "50",
        -radToDeg(o.startAngle),
        "51",
        -radToDeg(o.endAngle)
      ].join("\n") + "\n";
    }
  }

  dxf += dxfFooter();

  const blob =
    new Blob(
      [dxf],
      {
        type: "application/dxf"
      }
    );

  downloadBlob(
    blob,
    "projeto-mobile-cad.dxf"
  );
}

document.getElementById(
  "exportDxfBtn"
).onclick = () => {

  exportDXF();

  sideMenu.classList.add("hidden");
};


/* =========================================================
   DOWNLOAD
========================================================= */

function downloadBlob(blob, filename) {

  const url =
    URL.createObjectURL(blob);

  const a =
    document.createElement("a");

  a.href = url;
  a.download = filename;

  document.body.appendChild(a);

  a.click();

  a.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);

  toast("Arquivo exportado");
}


/* =========================================================
   PDF
========================================================= */

document.getElementById("printBtn")
  .onclick = () => {

    sideMenu.classList.add("hidden");

    window.print();
  };


/* =========================================================
   PROPRIEDADES
========================================================= */

const propertiesPanel =
  document.getElementById(
    "propertiesPanel"
  );

const propertiesContent =
  document.getElementById(
    "propertiesContent"
  );

document.getElementById(
  "propertiesBtn"
).onclick = () => {

  propertiesPanel.classList.toggle(
    "hidden"
  );

  updateProperties();
};

document.getElementById(
  "closeProperties"
).onclick = () => {

  propertiesPanel.classList.add(
    "hidden"
  );
};

function updateProperties() {

  if (selected.length !== 1) {

    propertiesContent.innerHTML =
      "<p>Nenhum objeto selecionado.</p>";

    return;
  }

  const o =
    objects.find(
      x => x.id === selected[0]
    );

  if (!o) return;

  let html = `
    <div class="property-row">
      <label>Tipo</label>
      <strong>${o.type}</strong>
    </div>
  `;

  if (o.type === "line") {

    html += `
      <div class="property-row">
        <label>X1</label>
        <input id="px1" value="${o.p1.x.toFixed(3)}">
      </div>

      <div class="property-row">
        <label>Y1</label>
        <input id="py1" value="${o.p1.y.toFixed(3)}">
      </div>

      <div class="property-row">
        <label>X2</label>
        <input id="px2" value="${o.p2.x.toFixed(3)}">
      </div>

      <div class="property-row">
        <label>Y2</label>
        <input id="py2" value="${o.p2.y.toFixed(3)}">
      </div>
    `;
  }

  if (o.type === "circle") {

    html += `
      <div class="property-row">
        <label>Centro X</label>
        <input id="pcx" value="${o.center.x.toFixed(3)}">
      </div>

      <div class="property-row">
        <label>Centro Y</label>
        <input id="pcy" value="${o.center.y.toFixed(3)}">
      </div>

      <div class="property-row">
        <label>Raio</label>
        <input id="pr" value="${o.radius.toFixed(3)}">
      </div>
    `;
  }

  html += `
    <button
      class="panel-action"
      id="applyProperties">
      Aplicar alterações
    </button>
  `;

  propertiesContent.innerHTML = html;

  document.getElementById(
    "applyProperties"
  ).onclick = () => {

    saveHistory();

    if (o.type === "line") {

      o.p1.x =
        Number(
          document.getElementById("px1").value
        );

      o.p1.y =
        Number(
          document.getElementById("py1").value
        );

      o.p2.x =
        Number(
          document.getElementById("px2").value
        );

      o.p2.y =
        Number(
          document.getElementById("py2").value
        );
    }

    if (o.type === "circle") {

      o.center.x =
        Number(
          document.getElementById("pcx").value
        );

      o.center.y =
        Number(
          document.getElementById("pcy").value
        );

      o.radius =
        Math.abs(
          Number(
            document.getElementById("pr").value
          )
        );
    }

    render();

    toast("Propriedades atualizadas");
  };
}


/* =========================================================
   TECLADO
========================================================= */

document.addEventListener(
  "keydown",
  e => {

    if (
      e.key === "Escape"
    ) {

      drawingPoints = [];

      setCommand("select");

      return;
    }

    if (
      e.ctrlKey &&
      e.key.toLowerCase() === "z"
    ) {

      e.preventDefault();

      undo();

      return;
    }

    if (
      e.ctrlKey &&
      e.key.toLowerCase() === "y"
    ) {

      e.preventDefault();

      redo();

      return;
    }

    if (
      e.key === "Delete" ||
      e.key === "Backspace"
    ) {

      deleteSelected();
    }
  }
);


/* =========================================================
   SERVICE WORKER
========================================================= */

if (
  "serviceWorker" in navigator
) {

  window.addEventListener(
    "load",
    () => {

      navigator.serviceWorker
        .register("sw.js")
        .catch(() => {});
    }
  );
}


/* =========================================================
   INICIALIZAÇÃO
========================================================= */

restoreLocal();

setCommand("select");

render();