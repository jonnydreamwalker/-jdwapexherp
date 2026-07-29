(function () {
  var base = "https://jdwapexherp.com/assets/images/";
  var icon = base + "favicon.svg?v=20260729c";
  var apple = base + "gallery/Logo.png?v=apple-20260729";
  function wipe() {
    document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]').forEach(function (n) {
      if (n.parentNode) n.parentNode.removeChild(n);
    });
  }
  function add(rel, href, type, sizes) {
    var el = document.createElement("link");
    el.rel = rel;
    if (type) el.type = type;
    if (sizes) el.sizes = sizes;
    el.href = href;
    document.head.appendChild(el);
  }
  wipe();
  add("icon", icon, "image/svg+xml");
  add("shortcut icon", icon, "image/svg+xml");
  add("apple-touch-icon", apple, "image/png", "180x180");
  var theme = document.querySelector('meta[name="theme-color"]');
  if (!theme) {
    theme = document.createElement("meta");
    theme.setAttribute("name", "theme-color");
    document.head.appendChild(theme);
  }
  theme.setAttribute("content", "#000000");
})();
