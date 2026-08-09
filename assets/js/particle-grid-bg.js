/**
 * JDW Apex Herp — Neon radial dot grid (green → purple)
 * Interactive particle dots with mouse repulsion + soft spotlight.
 * pointer-events:none + z-index:0 under content — never blocks checkout/buttons.
 */
(function () {
  "use strict";

  if (window.__apexParticleGrid) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  window.__apexParticleGrid = true;

  var isMobile =
    (window.matchMedia && window.matchMedia("(max-width: 768px)").matches) ||
    (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

  /* Neon green → neon purple */
  var GREEN_H = 150;
  var PURPLE_H = 285;
  var SAT = 100;
  var LIGHT = 58;

  function hueAt(t) {
    t = Math.max(0, Math.min(1, t));
    return GREEN_H + (PURPLE_H - GREEN_H) * t;
  }

  function colorAt(t, alpha) {
    return "hsla(" + hueAt(t) + "," + SAT + "%," + LIGHT + "%," + alpha + ")";
  }

  var GAP = isMobile ? 52 : 46;
  var RADIUS = isMobile ? 0 : 90;
  var RADIUS_SQ = RADIUS * RADIUS;
  var STRENGTH = 16;
  var EASE = 0.14;
  var DOT_R = isMobile ? 1.6 : 2.1;
  var BASE_ALPHA = 0.82;
  var NEAR_ALPHA = 0.95;
  var SPOT_ALPHA = 0.07;
  var MAX_PARTICLES = isMobile ? 90 : 180;

  var canvas = document.createElement("canvas");
  canvas.id = "apex-particle-grid";
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
  var cx = 0;
  var cy = 0;
  var maxDist = 1;
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

    cx = w * 0.5;
    cy = h * 0.5;
    maxDist = Math.sqrt(cx * cx + cy * cy) || 1;

    var gap = GAP;
    var cols = Math.ceil(w / gap) + 1;
    var rows = Math.ceil(h / gap) + 1;
    particles = [];
    var ox = (w - (cols - 1) * gap) * 0.5;
    var oy = (h - (rows - 1) * gap) * 0.5;

    for (var j = 0; j < rows; j++) {
      for (var i = 0; i < cols; i++) {
        if (particles.length >= MAX_PARTICLES) break;
        var bx = ox + i * gap;
        var by = oy + j * gap;
        var dx = bx - cx;
        var dy = by - cy;
        var t = Math.sqrt(dx * dx + dy * dy) / maxDist;
        particles.push({ bx: bx, by: by, x: bx, y: by, t: t });
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
  window.addEventListener(
    "resize",
    function () {
      rebuildGrid();
      kick();
    },
    { passive: true }
  );
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
      g.addColorStop(0.55, "rgba(180, 80, 255, " + SPOT_ALPHA * 0.45 + ")");
      g.addColorStop(1, "rgba(180, 80, 255, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(mx - RADIUS, my - RADIUS, RADIUS * 2, RADIUS * 2);
    }

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
      ctx.beginPath();
      ctx.arc(p.x, p.y, DOT_R, 0, Math.PI * 2);
      ctx.fillStyle = colorAt(p.t, a);
      ctx.fill();
    }

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
