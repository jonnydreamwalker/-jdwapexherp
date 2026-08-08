(function () {
  var svg = "https://jdwapexherp.com/assets/images/apex-herp-favicon.svg?v=herpseal20260802";
  var png = "https://jdwapexherp.com/assets/images/gallery/Logo.png?v=herpseal20260802";
  document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]').forEach(function (n) {
    if (n.parentNode) n.parentNode.removeChild(n);
  });
  function add(rel, href, type, sizes) {
    var el = document.createElement("link");
    el.rel = rel;
    if (type) el.type = type;
    if (sizes) el.sizes = sizes;
    el.href = href;
    document.head.appendChild(el);
  }
  add("icon", svg, "image/svg+xml");
  add("icon", png, "image/png", "32x32");
  add("shortcut icon", png, "image/png");
  add("apple-touch-icon", png, "image/png", "180x180");

  if (!window.__apexParticleGrid && !document.querySelector('script[src*="particle-grid-bg"]')) {
    var s = document.createElement("script");
    s.src = "https://jdwapexherp.com/assets/js/particle-grid-bg.js?v=lizards4";
    s.defer = true;
    document.head.appendChild(s);
  }
})();
