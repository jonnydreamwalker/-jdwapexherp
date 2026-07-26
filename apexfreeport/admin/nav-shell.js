/** Apex FreePort — browser tab logo ONLY (never Herp / K9) */
(function ensureFreePortTabLogo() {
  var href = "/uploads/favicon.png?v=freeport-tab";
  var links = document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]');
  links.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
  function add(rel, h) {
    var el = document.createElement("link");
    el.setAttribute("rel", rel);
    el.setAttribute("type", "image/png");
    el.setAttribute("href", h || href);
    document.head.appendChild(el);
  }
  add("icon");
  add("shortcut icon");
  add("apple-touch-icon", "/uploads/apple-touch-icon.png?v=freeport-tab");
  var theme = document.querySelector('meta[name="theme-color"]');
  if (!theme) {
    theme = document.createElement("meta");
    theme.setAttribute("name", "theme-color");
    document.head.appendChild(theme);
  }
  theme.setAttribute("content", "#000000");
})();
