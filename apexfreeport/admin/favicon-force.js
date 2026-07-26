/** Force FreePort tab icon — beats browser cache and stale HTML link tags */
(function () {
  var href = "/favicon.svg?v=fp3";
  document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]').forEach(function (n) {
    if (n.parentNode) n.parentNode.removeChild(n);
  });
  ["icon", "shortcut icon", "apple-touch-icon"].forEach(function (rel) {
    var el = document.createElement("link");
    el.rel = rel;
    el.type = "image/svg+xml";
    el.href = href;
    document.head.appendChild(el);
  });
  var theme = document.querySelector('meta[name="theme-color"]');
  if (!theme) {
    theme = document.createElement("meta");
    theme.setAttribute("name", "theme-color");
    document.head.appendChild(theme);
  }
  theme.setAttribute("content", "#000000");
})();
