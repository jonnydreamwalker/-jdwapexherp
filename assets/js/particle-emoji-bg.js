/**
 * JDW Apex — emoji particle grid + mouse spotlight (K9 / Feline only)
 * data-apex-bg="k9" → dogs + tennis ball | data-apex-bg="feline" → yarn 🧶
 * Smooth path: pre-render emoji sprites once, drawImage each frame (same as herp lizards).
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

  var isFeline =
    mode.indexOf("fel") >= 0 || mode.indexOf("cat") >= 0 || mode.indexOf("yarn") >= 0;

  var DOGS = ["🐕", "🐶", "🦮", "🐕‍🦺", "🐩", "🎾"];
  var YARN = ["🧶", "🧶", "🧵", "🧶"];
  var EMOJIS = isFeline ? YARN : DOGS;

  window.__apexEmojiGrid = true;

  var isMobile =
    (window.matchMedia && window.matchMedia("(max-width: 768px)").matches) ||
    (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

  /* Performance knobs — match herp smoothness */
  var GAP = isMobile ? 56 : 56;
  var RADIUS = isMobile ? 0 : 120;
  var RADIUS_SQ = RADIUS * RADIUS;
  var STRENGTH = 16;
  var EASE = 0.14;
  var FONT_SIZE = isMobile ? 16 : 20;
  /* In the dark like herp lizards — only the spotlight reveals them */
  var BASE_ALPHA = 0.06;
  var NEAR_ALPHA = 0.92;
  var SPOT_ALPHA = 0.12;
  var MAX_PARTICLES = isMobile ? 90 : 280;
  var DPR_CAP = 1.25;

  function makeSprite(emoji, size) {
    var pad = 2;
    var s = document.createElement("canvas");
    s.width = size + pad * 2;
    s.height = size + pad * 2;
    var c = s.getContext("2d");
    if (!c) return null;
    c.font = size + "px system-ui, Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.clearRect(0, 0, s.width, s.height);
    c.fillText(emoji, s.width / 2, s.height / 2);
    return s;
  }

  var spriteCache = {};
  function getSprite(emoji) {
    if (!spriteCache[emoji]) spriteCache[emoji] = makeSprite(emoji, FONT_SIZE);
    return spriteCache[emoji];
  }

  /* Mobile: one static paint — no RAF loop */
  if (isMobile) {
    var c = document.createElement("canvas");
    c.id = "apex-emoji-grid";
    c.setAttribute("aria-hidden", "true");
    c.style.cssText =
      "position:fixed;inset:0;width:100%;height:100%;z-index:0;" +
      "pointer-events:none;display:block;background:transparent;" +
      "transform:translate3d(0,0,0);will-change:transform;contain:strict;";

    function paintStatic() {
      if (!document.body) return;
      if (!c.parentNode) document.body.insertBefore(c, document.body.firstChild);
      var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      var w = Math.max(window.innerWidth, 1);
      var h = Math.max(window.innerHeight, 1);
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
      c.style.width = w + "px";
      c.style.height = h + "px";
      var ctx = c.getContext("2d", { alpha: true });
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      var gap = GAP;
      var n = 0;
      for (var y = gap * 0.35; y < h + gap; y += gap) {
        for (var x = gap * 0.35; x < w + gap; x += gap) {
          if (n >= MAX_PARTICLES) break;
          var em = EMOJIS[n % EMOJIS.length];
          var sp = getSprite(em);
          if (sp) {
            ctx.globalAlpha = 0.12;
            ctx.drawImage(sp, x - sp.width / 2, y - sp.height / 2);
          }
          n++;
        }
        if (n >= MAX_PARTICLES) break;
      }
      ctx.globalAlpha = 1;
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paintStatic);
    else paintStatic();
    window.addEventListener("resize", paintStatic, { passive: true });
    return;
  }

  /* Desktop: sprite grid + spotlight + repulsion */
  var canvas = document.createElement("canvas");
  canvas.id = "apex-emoji-grid";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;top:0;left:0;right:0;bottom:0;width:100vw;height:100vh;z-index:0;" +
    "pointer-events:none;display:block;background:transparent;" +
    "transform:translate3d(0,0,0);will-change:transform;contain:strict;";

  function mountCanvas() {
    if (canvas.parentNode) return;
    if (document.body) {
      if (document.body.firstChild) document.body.insertBefore(canvas, document.body.firstChild);
      else document.body.appendChild(canvas);
    } else document.documentElement.appendChild(canvas);
  }

  var ctx = null;
  var dpr = 1;
  var w = 0;
  var h = 0;
  var particles = [];
  var mouse = { x: -9999, y: -9999, active: false };
  var raf = 0;
  var running = true;
  var dirty = true;

  function rebuildGrid() {
    mountCanvas();
    if (!ctx) {
      ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
      if (!ctx) return;
    }
    dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    w = Math.max(window.innerWidth, 1);
    h = Math.max(window.innerHeight, 1);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var gap = GAP;
    var cols = Math.ceil(w / gap) + 1;
    var rows = Math.ceil(h / gap) + 1;
    var ox = (w - (cols - 1) * gap) * 0.5;
    var oy = (h - (rows - 1) * gap) * 0.5;
    particles = [];
    var n = 0;
    for (var j = 0; j < rows; j++) {
      for (var i = 0; i < cols; i++) {
        if (particles.length >= MAX_PARTICLES) break;
        var bx = ox + i * gap;
        var by = oy + j * gap;
        var em = EMOJIS[n % EMOJIS.length];
        particles.push({
          bx: bx,
          by: by,
          x: bx,
          y: by,
          emoji: em,
          sprite: getSprite(em)
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
  window.addEventListener("resize", function () {
    rebuildGrid();
    kick();
  }, { passive: true });
  document.addEventListener("visibilitychange", function () {
    running = !document.hidden;
    if (running) kick();
  });

  function frame() {
    raf = 0;
    if (!running || !ctx) return;

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
      if ((nx - p.x) * (nx - p.x) + (ny - p.y) * (ny - p.y) > 0.0004) moving = true;
      p.x = nx;
      p.y = ny;
    }

    if (!dirty && !moving && !active) return;
    dirty = moving || active;

    ctx.clearRect(0, 0, w, h);

    if (active) {
      var g = ctx.createRadialGradient(mx, my, 0, mx, my, RADIUS);
      g.addColorStop(0, "rgba(57, 255, 180, " + SPOT_ALPHA + ")");
      g.addColorStop(0.45, "rgba(16, 185, 129, " + SPOT_ALPHA * 0.7 + ")");
      g.addColorStop(0.75, "rgba(180, 80, 255, " + SPOT_ALPHA * 0.5 + ")");
      g.addColorStop(1, "rgba(180, 80, 255, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(mx - RADIUS, my - RADIUS, RADIUS * 2, RADIUS * 2);
    }

    for (i = 0; i < n; i++) {
      p = list[i];
      if (!p.sprite) continue;
      var a = BASE_ALPHA;
      if (active) {
        dx = p.x - mx;
        dy = p.y - my;
        distSq = dx * dx + dy * dy;
        if (distSq < RADIUS_SQ) {
          var t = 1 - distSq / RADIUS_SQ;
          a = BASE_ALPHA + (NEAR_ALPHA - BASE_ALPHA) * t * t;
        }
      }
      if (a < 0.03) continue;
      ctx.globalAlpha = a;
      ctx.drawImage(p.sprite, p.x - p.sprite.width / 2, p.y - p.sprite.height / 2);
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
