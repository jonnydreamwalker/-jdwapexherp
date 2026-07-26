/** Apex FreePort — tab icon matches login/header/footer logo */
(function ensureFreePortTabLogo() {
  var href = "/uploads/apexfreeport-logo.svg?v=fp-login";
  document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]').forEach(function (n) {
    if (n.parentNode) n.parentNode.removeChild(n);
  });
  function add(rel, type) {
    var el = document.createElement("link");
    el.setAttribute("rel", rel);
    el.setAttribute("type", type || "image/svg+xml");
    el.setAttribute("href", href);
    document.head.appendChild(el);
  }
  add("icon");
  add("shortcut icon");
  add("apple-touch-icon");
  var theme = document.querySelector('meta[name="theme-color"]');
  if (!theme) {
    theme = document.createElement("meta");
    theme.setAttribute("name", "theme-color");
    document.head.appendChild(theme);
  }
  theme.setAttribute("content", "#000000");
})();
