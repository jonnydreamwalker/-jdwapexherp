/**
 * JDW Apex Herp — Lizard grid (performance build)
 * GPU-friendly canvas, rAF only, mobile static/off.
 * pointer-events:none + z-index:-1 — never blocks checkout.
 */
(function () {
  "use strict";

  if (window.__apexParticleGrid) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  window.__apexParticleGrid = true;

  var LIZARD = "\uD83E\uDD8E";
  var isMobile =
    (window.matchMedia && window.matchMedia("(max-width: 768px)").matches) ||
    (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

  if (isMobile) {
    var c = document.createElement("canvas");
    c.id = "apex-particle-grid";
    c.setAttribute("aria-hidden", "true");
    c.style.cssText =
      "position:fixed;inset:0;width:100%;height:100%;z-index:-1;" +
      "pointer-events:none;display:block;background:transparent;" +
      "transform:translate3d(0,0,0);will-change:auto;";
    function paintStatic() {
      if (!document.body) return;
      if (!c.parentNode) document.body.insertBefore(c, document.body.firstChild);
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      var w = window.innerWidth;
      var h = window.innerHeight;
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
      c.style.width = w + "px";
      c.style.height = h + "px";
      var ctx = c.getContext("2d", { alpha: true });
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = "12px system-ui, Apple Color Emoji, Segoe UI Emoji, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = 0.35;
      var gap = 56;
      for (var y = gap * 0.5; y < h; y += gap) {
        for (var x = gap * 0.5; x < w; x += gap) {
          ctx.fillText(LIZARD, x, y);
        }
      }
      ctx.globalAlpha = 1;
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", paintStatic);
    } else {
      paintStatic();
    }
    window.addEventListener("resize", function () { paintStatic(); }, { passive: true });
    return;
  }

  var SPOT_RGB = "16, 185, 129";
  var SPOT_ALPHA = 0.07;
  var BASE_ALPHA = 0.5;
  var NEAR_ALPHA = 0.88;
  var GAP = 44;
  var RADIUS = 110;
  var RADIUS_SQ = RADIUS * RADIUS;
  var STRENGTH = 40;
  var EASE = 0.14;
  var FONT_PX = 13;
  var MAX_PARTICLES = 420;

  var canvas = document.createElement("canvas");
  canvas.id = "apex-particle-grid";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;z-index:-1;" +
    "pointer-events:none;display:block;background:transparent;" +
    "transform:translate3d(0,0,0);will-change:transform;contain:strict;";

  function mountCanvas() {
    if (canvas.parentNode) return;
    if (document.body) {
      if (document.body.firstChild) document.body.insertBefore(canvas, document.body.firstChild);
      else document.body.appendChild(canvas);
    } else {
      document.documentElement.appendChild(canvas);
    }
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
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = FONT_PX + "px system-ui, Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    var gap = w < 1100 ? 50 : GAP;
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
        particles.push({ bx: bx, by: by, x: bx, y: by });
      }
      if (particles.length >= MAX_PARTICLES) break;
    }
    dirty = true;
  }

  function onMove(e) {
    var t = e.touches && e.touches[0];
    mouse.x = t ? t.clientX : e.clientX;
    mouse.y = t ? t.clientY : e.clientY;
    mouse.active = true;
    dirty = true;
    if (!raf && running) raf = requestAnimationFrame(frame);
  }
  function onLeave() {
    mouse.active = false;
    mouse.x = -9999;
    mouse.y = -9999;
    dirty = true;
    if (!raf && running) raf = requestAnimationFrame(frame);
  }

  window.addEventListener("mousemove", onMove, { passive: true });
  window.addEventListener("mouseleave", onLeave, { passive: true });
  window.addEventListener("resize", function () { rebuildGrid(); if (!raf && running) raf = requestAnimationFrame(frame); }, { passive: true });

  document.addEventListener("visibilitychange", function () {
    running = !document.hidden;
    if (running && !raf) {
      dirty = true;
      raf = requestAnimationFrame(frame);
    }
  });

  function frame() {
    raf = 0;
    if (!running) return;

    var list = particles;
    var n = list.length;
    var mx = mouse.x;
    var my = mouse.y;
    var active = mouse.active;
    var i, p, dx, dy, distSq, dist, force, ang, tx, ty;
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
      var nx = p.x + (tx - p.x) * EASE;
      var ny = p.y + (ty - p.y) * EASE;
      if (Math.abs(nx - p.x) > 0.02 || Math.abs(ny - p.y) > 0.02) moving = true;
      p.x = nx;
      p.y = ny;
    }

    if (!dirty && !moving && !active) return;
    dirty = moving || active;

    ctx.clearRect(0, 0, w, h);

    if (active) {
      var g = ctx.createRadialGradient(mx, my, 0, mx, my, RADIUS);
      g.addColorStop(0, "rgba(" + SPOT_RGB + ", " + SPOT_ALPHA + ")");
      g.addColorStop(1, "rgba(" + SPOT_RGB + ", 0)");
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
      ctx.globalAlpha = a;
      ctx.fillText(LIZARD, p.x, p.y);
    }
    ctx.globalAlpha = 1;

    if (dirty) raf = requestAnimationFrame(frame);
  }

  function start() {
    mountCanvas();
    rebuildGrid();
    dirty = true;
    if (!raf) raf = requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
