/** Shared cart + nav helpers for service pages */
window.APEX_API_BASE = "https://freeport.jdwapexherp.com";
try {
  localStorage.setItem("APEX_API_BASE", "https://freeport.jdwapexherp.com");
  localStorage.removeItem("__APEX_API_ACTIVE__");
} catch (e) {}

if (!localStorage.getItem("jdw_cart")) localStorage.setItem("jdw_cart", JSON.stringify([]));

/** Tab icons — match index favicon.png / apple-touch-icon.png (not full Logo) */
(function ensureTabLogo() {
  var base = (function () {
    var path = (location.pathname || "").replace(/\\/g, "/");
    if (path.indexOf("/services/") !== -1) return "../assets/images/";
    return "assets/images/";
  })();
  var icon = base + "favicon.png";
  var apple = base + "apple-touch-icon.png";
  document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]').forEach(function (n) {
    if (n.parentNode) n.parentNode.removeChild(n);
  });
  function add(rel, href, type, sizes) {
    var el = document.createElement("link");
    el.setAttribute("rel", rel);
    if (type) el.setAttribute("type", type);
    if (sizes) el.setAttribute("sizes", sizes);
    el.setAttribute("href", href);
    document.head.appendChild(el);
  }
  add("icon", icon, "image/png");
  add("shortcut icon", icon, "image/png");
  add("apple-touch-icon", apple, "image/png", "180x180");
  var theme = document.querySelector('meta[name="theme-color"]');
  if (!theme) {
    theme = document.createElement("meta");
    theme.setAttribute("name", "theme-color");
    document.head.appendChild(theme);
  }
  theme.setAttribute("content", "#000000");
})();

function updateCartCount() {
  var cart = JSON.parse(localStorage.getItem("jdw_cart")) || [];
  document.querySelectorAll(".cart-count").forEach(function (b) {
    b.innerText = cart.reduce(function (s, i) { return s + i.quantity; }, 0);
  });
}
document.addEventListener("DOMContentLoaded", function () {
  updateCartCount();
  if (typeof polishServiceFooter === "function") polishServiceFooter();
});
function toggleMobileMenu() {
  var m = document.getElementById("mobile-menu");
  if (!m) return;
  var i = document.getElementById("hamburger-icon");
  var open = m.classList.contains("hidden");
  if (open) {
    m.classList.remove("hidden"); m.classList.add("flex");
    document.body.style.overflow = "hidden";
    if (i) i.className = "fas fa-times";
  } else {
    m.classList.add("hidden"); m.classList.remove("flex");
    document.body.style.overflow = "";
    if (i) i.className = "fas fa-bars";
  }
}
function closeMobileMenu() {
  var m = document.getElementById("mobile-menu");
  var i = document.getElementById("hamburger-icon");
  if (m) { m.classList.add("hidden"); m.classList.remove("flex"); }
  document.body.style.overflow = "";
  if (i) i.className = "fas fa-bars";
}
function toggleMobileCats() {
  var c = document.getElementById("mobile-cats");
  var a = document.getElementById("mobile-cat-arrow");
  if (!c) return;
  c.classList.toggle("hidden");
  if (a) a.innerText = c.classList.contains("hidden") ? "▼" : "▲";
}
function toggleDropdown(e) {
  if (e) e.stopPropagation();
  var d = document.getElementById("category-dropdown");
  var a = document.getElementById("dropdown-arrow");
  if (!d) return;
  var isHidden = d.classList.contains("hidden");
  if (isHidden) { d.classList.remove("hidden"); if (a) a.innerText = "▲"; }
  else { d.classList.add("hidden"); if (a) a.innerText = "▼"; }
}
document.addEventListener("click", function (e) {
  var d = document.getElementById("category-dropdown");
  var a = document.getElementById("dropdown-arrow");
  if (!d) return;
  if (!d.contains(e.target) && !e.target.closest("[data-dropdown-toggle]")) {
    d.classList.add("hidden");
    if (a) a.innerText = "▼";
  }
});

/** Ensure Live Plants appears in category menus */
document.addEventListener("DOMContentLoaded", function ensureLivePlantsNav() {
  function addLink(container, href, label, className) {
    if (!container) return;
    var exists = false;
    container.querySelectorAll("a").forEach(function (a) {
      if ((a.getAttribute("href") || "").indexOf("plants") !== -1) exists = true;
    });
    if (exists) return;
    var a = document.createElement("a");
    a.href = href;
    a.className = className;
    a.textContent = label;
    var deals = null;
    container.querySelectorAll("a").forEach(function (x) {
      if ((x.textContent || "").toLowerCase().indexOf("deal") !== -1) deals = x;
    });
    if (deals) container.insertBefore(a, deals);
    else container.appendChild(a);
  }
  addLink(
    document.getElementById("category-dropdown"),
    "plants.html",
    "Live Plants",
    "block py-2 text-emerald-400 hover:text-emerald-300 font-semibold"
  );
  addLink(
    document.getElementById("mobile-cats"),
    "plants.html",
    "Live Plants",
    "block py-3 px-5 text-emerald-400 border-b border-zinc-800"
  );
});
