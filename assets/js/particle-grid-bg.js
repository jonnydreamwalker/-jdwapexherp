/**
 * JDW Apex Herp — Interactive particle grid background
 * Brand: emerald #10b981 / #34d399 on zinc-950
 *
 * LAYER GUARANTEE (do not remove):
 * - Canvas is position:fixed, inset:0, z-index:-1, pointer-events:none
 * - It NEVER captures clicks, hovers, or focus
 * - Buy buttons, dropdowns, cart, Stripe/PayPal, forms stay fully interactive
 * - This is a permanent background layer only — not part of the UI hit-target tree
 */
(function () {
  "use strict";

  // Skip if already mounted or user prefers reduced motion
  if (window.__apexParticleGrid) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  window.__apexParticleGrid = true;

  // --- Brand colors (from assets/style.css :root) ---
  var DOT_RGB = "16, 185, 129"; // #10b981 emerald
  var DOT_ALPHA = 0.28;
  var DOT_ALPHA_NEAR = 0.55;
  var SPOT_ALPHA = 0.08; // crisp 8% epicenter lock

  // --- Physics / layout (cached, no layout thrash) ---
  var GAP = 28; // grid spacing px
  var RADIUS = 110; // repulsion + spotlight radius
  var RADIUS_SQ = RADIUS * RADIUS;
  var STRENGTH = 42; // max push distance
  var EASE = 0.12; // elastic snap (0–1)
  var DOT_R = 1.35;

  var canvas = document.createElement("canvas");
  canvas.id = "apex-particle-grid";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;" +
    "z-index:-1;pointer-events:none;display:block;" +
    "background:transparent;margin:0;padding:0;";
  // Insert as first body child so it sits behind every content block
  if (document.body.firstChild) {
    document.body.insertBefore(canvas, document.body.firstChild);
  } else {
    document.body.appendChild(canvas);
  }

  var ctx = canvas.getContext("2d", { alpha: true });
  var dpr = 1;
  var w = 0;
  var h = 0;
  var cols = 0;
  var rows = 0;
  /** @type {{bx:number,by:number,x:number,y:number}[]} */
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

    // Wider gap on small screens → fewer dots, locked FPS on mobile
    var gap = w < 640 ? 36 : GAP;
    cols = Math.ceil(w / gap) + 1;
    rows = Math.ceil(h / gap) + 1;
    particles = [];
    var ox = (w - (cols - 1) * gap) * 0.5;
    var oy = (h - (rows - 1) * gap) * 0.5;
    for (var j = 0; j < rows; j++) {
      for (var i = 0; i < cols; i++) {
        var bx = ox + i * gap;
        var by = oy + j * gap;
        // Cache base vectors — never recompute from DOM
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

  // Passive listeners on window only — canvas has pointer-events:none
  window.addEventListener("mousemove", onMove, { passive: true });
  window.addEventListener("touchmove", onMove, { passive: true });
  window.addEventListener("mouseleave", onLeave, { passive: true });
  window.addEventListener("touchend", onLeave, { passive: true });
  window.addEventListener(
    "resize",
    function () {
      rebuildGrid();
    },
    { passive: true }
  );

  // Pause when tab hidden to save CPU
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

    // Physics pass — only distance-check when cursor is on-screen
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
          // Smooth falloff: stronger near center
          force = ((RADIUS - dist) / RADIUS) * STRENGTH;
          ang = Math.atan2(dy, dx);
          tx = p.bx + Math.cos(ang) * force;
          ty = p.by + Math.sin(ang) * force;
        }
      }
      // Elastic snap toward target (base grid or repulsion offset)
      p.x += (tx - p.x) * EASE;
      p.y += (ty - p.y) * EASE;
    }

    // Draw
    ctx.clearRect(0, 0, w, h);

    // Radial spotlight under cursor (alpha 0.08 → 0 at radius edge)
    if (active) {
      var g = ctx.createRadialGradient(mx, my, 0, mx, my, RADIUS);
      g.addColorStop(0, "rgba(" + DOT_RGB + ", " + SPOT_ALPHA + ")");
      g.addColorStop(1, "rgba(" + DOT_RGB + ", 0)");
      ctx.fillStyle = g;
      ctx.fillRect(mx - RADIUS, my - RADIUS, RADIUS * 2, RADIUS * 2);
    }

    // Dots
    for (i = 0; i < n; i++) {
      p = list[i];
      var a = DOT_ALPHA;
      if (active) {
        dx = p.x - mx;
        dy = p.y - my;
        distSq = dx * dx + dy * dy;
        if (distSq < RADIUS_SQ) {
          // Slightly brighter near the dimple
          a = DOT_ALPHA + (DOT_ALPHA_NEAR - DOT_ALPHA) * (1 - distSq / RADIUS_SQ);
        }
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, DOT_R, 0, 6.283185307179586);
      ctx.fillStyle = "rgba(" + DOT_RGB + ", " + a + ")";
      ctx.fill();
    }

    raf = requestAnimationFrame(frame);
  }

  function start() {
    rebuildGrid();
    if (!raf) raf = requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
