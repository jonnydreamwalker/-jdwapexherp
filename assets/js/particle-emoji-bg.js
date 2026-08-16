/**
 * JDW Apex — emoji particle grid + mouse spotlight
 * data-apex-bg="k9" → dog emojis | data-apex-bg="feline" → cat emojis
 * pointer-events:none · z-index:0 · never blocks clicks/checkout
 */
(function () {
  "use strict";

  if (window.__apexEmojiGrid) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var script = document.currentScript;
  var mode = (
    (script && script.getAttribute("data-apex-bg")) ||
    (document.body && document.body.getAttribute("data-apex-bg")) ||
    "k9"
  ).toLowerCase();

  var DOGS = ["🐕", "🐶", "🦮", "🐕‍🦺", "🐩"];
  var CATS = ["🐈", "🐱", "🐈‍⬛", "😺", "😸"];
  var EMOJIS = mode.indexOf("fel") >= 0 || mode.indexOf("cat") >= 0 ? CATS : DOGS;

  window.__apexEmojiGrid = true;

  var isMobile =
    (window.matchMedia && window.matchMedia("(max-width: 768px)").matches) ||
    (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

  var GAP = isMobile ? 64 : 56;
  var RADIUS = isMobile ? 0 : 110;
  var RADIUS_SQ = RADIUS * RADIUS;
  var STRENGTH = 18;
  var EASE = 0.12;
  var FONT = isMobile ? 16 : 20;
  var BASE_ALPHA = 0.55;
  var NEAR_ALPHA = 0.95;
  var SPOT_ALPHA = 0.08;
  var MAX_PARTICLES = isMobile ? 48 : 100;

  var canvas = document.createElement("canvas");
  canvas.id = "apex-emoji-grid";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;z-index:0;" +
    "pointer-events:none;display:block;background:transparent;" +
    "transform:translate3d(0,0,0);will-change:transform;contain:strict;";

  function mountCanvas() {
    if (canvas.parentNode) return;
    if (document.body) {
      if (document.body.firstChild) document.body.insertBefore(canvas, document.body.firstChild);
      else document.body.appendChild(canvas);
    } else document.documentElement.appendChild(canvas);
  }
  mountCanvas();

  var ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!ctx) return;

  var dpr = 1;
  var w = 0;
  var h = 0;
  var particles = [];
  var mouse = { x: -9999, y: -9999, active: false };
  var raf = 0;
  var running = true;
  var dirty = true;

  function rebuildGrid() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var gap = GAP;
    var cols = Math.ceil(w / gap) + 1;
    var rows = Math.ceil(h / gap) + 1;
    particles = [];
    var ox = (w - (cols - 1) * gap) * 0.5;
    var oy = (h - (rows - 1) * gap) * 0.5;
    var n = 0;
    for (var j = 0; j < rows; j++) {
      for (var i = 0; i < cols; i++) {
        if (particles.length >= MAX_PARTICLES) break;
        var bx = ox + i * gap;
        var by = oy + j * gap;
        particles.push({
          bx: bx,
          by: by,
          x: bx,
          y: by,
          emoji: EMOJIS[n % EMOJIS.length]
        });
        n++;
      }
      if (particles.length >= MAX_PARTICLES) break;
    }
    dirty = true;
  }

  function kick() {
    dirty = true;
    if (!raf && running) raf = requestAnimationFrame(frame);
  }

  function onMove(e) {
    if (isMobile) return;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
    kick();
  }
  function onLeave() {
    mouse.active = false;
    mouse.x = -9999;
    mouse.y = -9999;
    kick();
  }

  if (!isMobile) {
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseleave", onLeave, { passive: true });
  }
  window.addEventListener("resize", function () { rebuildGrid(); kick(); }, { passive: true });
  document.addEventListener("visibilitychange", function () {
    running = !document.hidden;
    if (running) kick();
  });

  function frame() {
    raf = 0;
    if (!running) return;

    var list = particles;
    var n = list.length;
    var mx = mouse.x;
    var my = mouse.y;
    var active = mouse.active && !isMobile;
    var i, p, dx, dy, distSq, dist, force, ang, tx, ty, nx, ny;
    var moving = false;

    for (i = 0; i < n; i++) {
      p = list[i];
      tx = p.bx;
      ty = p.by;
      if (active) {
        dx = p.bx - mx;
        dy = p.by - my;
        distSq = dx * dx + dy * dy;
        if (distSq < RADIUS_SQ && distSq > 0.0001) {
          dist = Math.sqrt(distSq);
          force = ((RADIUS - dist) / RADIUS) * STRENGTH;
          ang = Math.atan2(dy, dx);
          tx = p.bx + Math.cos(ang) * force;
          ty = p.by + Math.sin(ang) * force;
        }
      }
      nx = p.x + (tx - p.x) * EASE;
      ny = p.y + (ty - p.y) * EASE;
      if ((nx - p.x) * (nx - p.x) + (ny - p.y) * (ny - p.y) > 0.0002) moving = true;
      p.x = nx;
      p.y = ny;
    }

    if (!dirty && !moving && !active) return;
    dirty = moving || active;

    ctx.clearRect(0, 0, w, h);

    if (active) {
      var g = ctx.createRadialGradient(mx, my, 0, mx, my, RADIUS);
      g.addColorStop(0, "rgba(57, 255, 180, " + SPOT_ALPHA + ")");
      g.addColorStop(0.5, "rgba(180, 80, 255, " + SPOT_ALPHA * 0.5 + ")");
      g.addColorStop(1, "rgba(180, 80, 255, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(mx - RADIUS, my - RADIUS, RADIUS * 2, RADIUS * 2);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = FONT + "px Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif";

    for (i = 0; i < n; i++) {
      p = list[i];
      var a = BASE_ALPHA;
      if (active) {
        dx = p.x - mx;
        dy = p.y - my;
        distSq = dx * dx + dy * dy;
        if (distSq < RADIUS_SQ) {
          a = BASE_ALPHA + (NEAR_ALPHA - BASE_ALPHA) * (1 - distSq / RADIUS_SQ);
        }
      }
      ctx.globalAlpha = a;
      ctx.fillText(p.emoji, p.x, p.y);
    }
    ctx.globalAlpha = 1;

    if (dirty) raf = requestAnimationFrame(frame);
  }

  function start() {
    mountCanvas();
    rebuildGrid();
    kick();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
