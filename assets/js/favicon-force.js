/** Force Apex Herp favicons + inject particle background (cache-busted). */
(function () {
  var svg = "https://jdwapexherp.com/assets/images/apex-herp-favicon.svg?v=herpseal20260802";
  var png = "https://jdwapexherp.com/assets/images/gallery/Logo.png?v=herpseal20260802";

  function setIcons() {
    var links = document.querySelectorAll('link[rel*="icon"], link[rel="apple-touch-icon"]');
    for (var i = 0; i < links.length; i++) links[i].parentNode.removeChild(links[i]);
    var a = document.createElement("link");
    a.rel = "icon";
    a.type = "image/svg+xml";
    a.href = svg;
    document.head.appendChild(a);
    var b = document.createElement("link");
    b.rel = "apple-touch-icon";
    b.href = png;
    document.head.appendChild(b);
  }

  if (!window.__apexParticleGrid && !document.querySelector('script[src*="particle-grid-bg"]')) {
    var s = document.createElement("script");
    /* jsDelivr picks up main faster than GitHub Pages edge cache */
    s.src = "https://cdn.jsdelivr.net/gh/jonnydreamwalker/-jdwapexherp@main/assets/js/particle-grid-bg.js?v=neondots2";
    s.defer = true;
    document.head.appendChild(s);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setIcons);
  else setIcons();
})();
