/**
 * JDW Apex Herp — Lizard grid (brighter + smoother)
 * Sprite drawImage, soft ease, idle sleep.
 * pointer-events:none + z-index:0 under content — never blocks checkout.
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

  function makeSprite(size) {
    var s = document.createElement("canvas");
    var pad = 2;
    s.width = size + pad * 2;
    s.height = size + pad * 2;
    var c = s.getContext("2d");
    if (!c) return null;
    c.font = size + "px system-ui, Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.clearRect(0, 0, s.width, s.height);
    c.fillText(LIZARD, s.width / 2, s.height / 2);
    return s;
  }

  if (isMobile) {
    var c = document.createElement("canvas");
    c.id = "apex-particle-grid";
    c.setAttribute("aria-hidden", "true");
    c.style.cssText =
      "position:fixed;inset:0;width:100%;height:100%;z-index:0;" +
      "pointer-events:none;display:block;background:transparent;transform:translateZ(0);";
    function paintStatic() {
      if (!document.body) return;
      if (!c.parentNode) document.body.insertBefore(c, document.body.firstChild);
      var dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      var w = window.innerWidth;
      var h = window.innerHeight;
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
      c.style.width = w + "px";
      c.style.height = h + "px";
      var ctx = c.getContext("2d", { alpha: true });
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var sprite = makeSprite(13);
      if (!sprite) return;
      var gap = 58;
      var hw = sprite.width / 2;
      var hh = sprite.height / 2;
      ctx.globalAlpha = 0.45;
      for (var y = gap * 0.5; y < h; y += gap) {
        for (var x = gap * 0.5; x < w; x += gap) {
          ctx.drawImage(sprite, x - hw, y - hh);
        }
      }
      ctx.globalAlpha = 1;
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paintStatic);
    else paintStatic();
    window.addEventListener("resize", function () { paintStatic(); }, { passive: true });
    return;
  }

  var SPOT_RGB = "16, 185, 129";
  var SPOT_ALPHA = 0.08;
  var BASE_ALPHA = 0.62;
  var NEAR_ALPHA = 0.92;
  var GAP = 48;
  var RADIUS = 100;
  var RADIUS_SQ = RADIUS * RADIUS;
  var STRENGTH = 22;
  var EASE = 0.14;
  var FONT_PX = 13;
  var MAX_PARTICLES = 200;

  var canvas = document.createElement("canvas");
  canvas.id = "apex-particle-grid";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;z-index:0;" +
    "pointer-events:none;display:block;background:transparent;" +
    "transform:translateZ(0);will-change:transform;contain:strict;";

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
  ctx.imageSmoothingEnabled = true;

  var sprite = makeSprite(FONT_PX);
  var sprHW = sprite ? sprite.width / 2 : 8;
  var sprHH = sprite ? sprite.height / 2 : 8;

  var dpr = 1;
  var w = 0;
  var h = 0;
  var particles = [];
  var mouse = { x: -9999, y: -9999, active: false };
  var raf = 0;
  var running = true;
  var dirty = true;

  function rebuildGrid() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var gap = w < 1200 ? 52 : GAP;
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

  function kick() {
    dirty = true;
    if (!raf && running) raf = requestAnimationFrame(frame);
  }

  function onMove(e) {
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

  window.addEventListener("mousemove", onMove, { passive: true });
  window.addEventListener("mouseleave", onLeave, { passive: true });
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
    var active = mouse.active;
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
      if ((nx - p.x) * (nx - p.x) + (ny - p.y) * (ny - p.y) > 0.00025) moving = true;
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

    if (!sprite) {
      if (dirty) raf = requestAnimationFrame(frame);
      return;
    }

    if (!active) {
      ctx.globalAlpha = BASE_ALPHA;
      for (i = 0; i < n; i++) {
        p = list[i];
        ctx.drawImage(sprite, p.x - sprHW, p.y - sprHH);
      }
      ctx.globalAlpha = 1;
    } else {
      for (i = 0; i < n; i++) {
        p = list[i];
        var a = BASE_ALPHA;
        dx = p.x - mx;
        dy = p.y - my;
        distSq = dx * dx + dy * dy;
        if (distSq < RADIUS_SQ) {
          a = BASE_ALPHA + (NEAR_ALPHA - BASE_ALPHA) * (1 - distSq / RADIUS_SQ);
        }
        ctx.globalAlpha = a;
        ctx.drawImage(sprite, p.x - sprHW, p.y - sprHH);
      }
      ctx.globalAlpha = 1;
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
