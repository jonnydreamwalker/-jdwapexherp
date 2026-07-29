(function () {
  var href = "https://jdwapexherp.com/assets/images/gallery/Logo.png?v=apexherp-20260729";
  function wipe() {
    document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]').forEach(function (n) {
      if (n.parentNode) n.parentNode.removeChild(n);
    });
  }
  function add(rel) {
    var el = document.createElement("link");
    el.rel = rel;
    el.type = "image/png";
    el.href = href;
    document.head.appendChild(el);
  }
  wipe();
  add("icon");
  add("shortcut icon");
  add("apple-touch-icon");
})();
