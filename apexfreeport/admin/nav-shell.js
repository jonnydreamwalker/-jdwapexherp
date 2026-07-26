/** Apex FreePort — tab icon + Herp-site selection highlight */
(function ensureFreePortShell() {
  var href = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Crect width='512' height='512' fill='%23000'/%3E%3Ccircle cx='256' cy='256' r='220' fill='none' stroke='%2322c55e' stroke-width='28'/%3E%3Ctext x='256' y='230' text-anchor='middle' font-family='Arial Black,Helvetica,sans-serif' font-size='120' font-weight='900' fill='%2322c55e'%3EAPEX%3C/text%3E%3Cline x1='90' y1='255' x2='422' y2='255' stroke='%2322c55e' stroke-width='14'/%3E%3Ctext x='256' y='330' text-anchor='middle' font-family='Arial Black,Helvetica,sans-serif' font-size='72' font-weight='900' fill='%23fff'%3EFreePort%3C/text%3E%3C/svg%3E";
  document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]').forEach(function (n) {
    if (n.parentNode) n.parentNode.removeChild(n);
  });
  function add(rel) {
    var el = document.createElement("link");
    el.setAttribute("rel", rel);
    el.setAttribute("type", "image/svg+xml");
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

  /* Same highlighter as jdwapexherp.com assets/style.css */
  if (!document.getElementById("fp-herp-selection")) {
    var s = document.createElement("style");
    s.id = "fp-herp-selection";
    s.textContent =
      ":root{--brand-blue-color:#10b981;--brand-white-color:#ffffff}" +
      "::selection{background-color:var(--brand-blue-color);color:var(--brand-white-color)}" +
      "::-moz-selection{background-color:var(--brand-blue-color);color:var(--brand-white-color)}";
    document.head.appendChild(s);
  }
})();
