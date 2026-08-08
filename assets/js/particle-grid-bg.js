/**
 * JDW Apex Herp — Interactive lizard grid background
 * Little 🦎 emotes on a grid with mouse repulsion + soft spotlight.
 *
 * LAYER GUARANTEE (do not remove):
 * - Canvas is position:fixed, inset:0, z-index:-1, pointer-events:none
 * - It NEVER captures clicks, hovers, or focus
 * - Buy buttons, dropdowns, cart, Stripe/PayPal, forms stay fully interactive
 */
(function () {
  "use strict";

  if (window.__apexParticleGrid) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  window.__apexParticleGrid = true;

  var LIZARD = "\uD83E\uDD8E"; // 🦎
  var SPOT_RGB = "16, 185, 129";
  var SPOT_ALPHA = 0.08;
  var BASE_ALPHA = 0.55;
  var NEAR_ALPHA = 0.92;

  var GAP = 36;
  var RADIUS = 120;
  var RADIUS_SQ = RADIUS * RADIUS;
  var STRENGTH = 48;
  var EASE = 0.12;
  var FONT_PX = 14;

  var canvas = document.createElement("canvas");
  canvas.id = "apex-particle-grid";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;" +
    "z-index:-1;pointer-events:none;display:block;" +
    "background:transparent;margin:0;padding:0;";

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

  var ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  var dpr = 1;
  var w = 0;
  var h = 0;
  var particles = [];
  var mouse = { x: -9999, y: -9999, active: false };
  var raf = 0;
  var running = true;

  function rebuildGrid() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
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

    var gap = w < 640 ? 42 : GAP;
    var cols = Math.ceil(w / gap) + 1;
    var rows = Math.ceil(h / gap) + 1;
    particles = [];
    var ox = (w - (cols - 1) * gap) * 0.5;
    var oy = (h - (rows - 1) * gap) * 0.5;
    for (var j = 0; j < rows; j++) {
      for (var i = 0; i < cols; i++) {
        var bx = ox + i * gap;
        var by = oy + j * gap;
        particles.push({ bx: bx, by: by, x: bx, y: by });
      }
    }
  }

  function onMove(e) {
    var t = e.touches && e.touches[0];
    mouse.x = t ? t.clientX : e.clientX;
    mouse.y = t ? t.clientY : e.clientY;
    mouse.active = true;
  }
  function onLeave() {
    mouse.active = false;
    mouse.x = -9999;
    mouse.y = -9999;
  }

  window.addEventListener("mousemove", onMove, { passive: true });
  window.addEventListener("touchmove", onMove, { passive: true });
  window.addEventListener("mouseleave", onLeave, { passive: true });
  window.addEventListener("touchend", onLeave, { passive: true });
  window.addEventListener("resize", function () { rebuildGrid(); }, { passive: true });

  document.addEventListener("visibilitychange", function () {
    running = !document.hidden;
    if (running && !raf) raf = requestAnimationFrame(frame);
  });

  function frame() {
    raf = 0;
    if (!running) return;

    var mx = mouse.x;
    var my = mouse.y;
    var active = mouse.active;
    var list = particles;
    var n = list.length;
    var i, p, dx, dy, distSq, dist, force, ang, tx, ty;

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
      p.x += (tx - p.x) * EASE;
      p.y += (ty - p.y) * EASE;
    }

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

    raf = requestAnimationFrame(frame);
  }

  function start() {
    mountCanvas();
    rebuildGrid();
    if (!raf) raf = requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
