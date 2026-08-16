/**
 * Shared nav/cart shell for service pages + force Apex HERP tab icons only
 */
(function ensureTabLogo() {
  var iconSvg = "https://jdwapexherp.com/assets/images/apex-herp-favicon.svg?v=herpseal20260802";
  var iconPng = "https://jdwapexherp.com/assets/images/gallery/Logo.png?v=herpseal20260802";
  var apple = "https://jdwapexherp.com/assets/images/gallery/Logo.png?v=herpseal20260802";
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
  add("icon", iconSvg, "image/svg+xml");
  add("icon", iconPng, "image/png", "32x32");
  add("shortcut icon", iconPng, "image/png");
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
  var cart = JSON.parse(localStorage.getItem("jdw_cart") || "[]") || [];
  var n = cart.reduce(function (s, i) { return s + (i.quantity || 0); }, 0);
  document.querySelectorAll(".cart-count").forEach(function (b) { b.innerText = String(n); });
}
document.addEventListener("DOMContentLoaded", updateCartCount);

function toggleMobileMenu() {
  var m = document.getElementById("mobile-menu");
  if (!m) return;
  var i = document.getElementById("hamburger-icon");
  var open = m.classList.contains("hidden");
  if (open) {
    m.classList.remove("hidden");
    m.classList.add("flex");
    document.body.style.overflow = "hidden";
    if (i) i.className = "fas fa-times";
  } else {
    m.classList.add("hidden");
    m.classList.remove("flex");
    document.body.style.overflow = "";
    if (i) i.className = "fas fa-bars";
  }
}
function closeMobileMenu() {
  var m = document.getElementById("mobile-menu");
  var i = document.getElementById("hamburger-icon");
  if (m) {
    m.classList.add("hidden");
    m.classList.remove("flex");
  }
  document.body.style.overflow = "";
  if (i) i.className = "fas fa-bars";
}
function toggleMobileCats() {
  var c = document.getElementById("mobile-cats");
  var a = document.getElementById("mobile-cat-arrow");
  if (!c) return;
  c.classList.toggle("hidden");
  if (a) a.innerText = c.classList.contains("hidden") ? "\u25BC" : "\u25B2";
}
function toggleDropdown(e) {
  if (e) e.stopPropagation();
  var d = document.getElementById("category-dropdown");
  var a = document.getElementById("dropdown-arrow");
  if (!d) return;
  var isHidden = d.classList.contains("hidden");
  if (isHidden) {
    d.classList.remove("hidden");
    if (a) a.innerText = "\u25B2";
  } else {
    d.classList.add("hidden");
    if (a) a.innerText = "\u25BC";
  }
}
document.addEventListener("click", function (e) {
  var d = document.getElementById("category-dropdown");
  var a = document.getElementById("dropdown-arrow");
  if (!d) return;
  if (!d.contains(e.target) && !e.target.closest("[data-dropdown-toggle], [onclick*='toggleDropdown']")) {
    d.classList.add("hidden");
    if (a) a.innerText = "\u25BC";
  }
});

function openCartModal() {
  var m = document.getElementById("cart-modal");
  if (m) {
    m.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }
  if (typeof window.renderCart === "function") window.renderCart();
}
function closeCartModal() {
  var m = document.getElementById("cart-modal");
  if (m) m.classList.add("hidden");
  document.body.style.overflow = "";
}
function removeSingleCartItem(idx) {
  var cart = JSON.parse(localStorage.getItem("jdw_cart") || "[]") || [];
  cart.splice(idx, 1);
  localStorage.setItem("jdw_cart", JSON.stringify(cart));
  updateCartCount();
  if (typeof window.renderCart === "function") window.renderCart();
}
function addToCart(item) {
  var cart = JSON.parse(localStorage.getItem("jdw_cart") || "[]") || [];
  var found = cart.find(function (c) { return c.sku === item.sku; });
  if (found) found.quantity = (found.quantity || 1) + (item.quantity || 1);
  else cart.push(item);
  localStorage.setItem("jdw_cart", JSON.stringify(cart));
  updateCartCount();
}

window.toggleDropdown = toggleDropdown;
window.toggleMobileMenu = toggleMobileMenu;
window.closeMobileMenu = closeMobileMenu;
window.toggleMobileCats = toggleMobileCats;
window.openCartModal = openCartModal;
window.closeCartModal = closeCartModal;
window.removeSingleCartItem = removeSingleCartItem;
window.addToCart = addToCart;
window.updateCartCount = updateCartCount;

(function loadCookieConsent() {
  if (document.querySelector('script[src*="cookie-consent.js"]')) return;
  var s = document.createElement("script");
  s.src = "https://jdwapexherp.com/assets/js/cookie-consent.js?v=20260802b";
  s.defer = true;
  document.head.appendChild(s);
})();

(function loadParticleGrid() {
  if (window.__apexParticleGrid) return;
  if (document.querySelector('script[src*="particle-grid-bg"]')) return;
  var s = document.createElement("script");
  s.src = "https://jdwapexherp.com/assets/js/particle-grid-bg.js?v=lizards7";
  s.defer = true;
  document.head.appendChild(s);
})();

/* Site-wide label: Fuel Your Herps → Nutrition in every category dropdown */
(function renameNutritionLabels() {
  function run() {
    document.querySelectorAll('a[href*="nutrition.html"]').forEach(function (a) {
      var t = (a.textContent || "").trim();
      if (t.indexOf("Fuel Your Herps") >= 0) a.textContent = t.replace(/Fuel Your Herps/g, "Nutrition");
      if (t.indexOf("Fuel Your Herp") >= 0 && t.indexOf("Nutrition") < 0) a.textContent = t.replace(/Fuel Your Herp/g, "Nutrition");
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
