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
  if (!d.contains(e.target) && !e.target.closest('[onclick*="toggleDropdown"]')) {
    d.classList.add("hidden");
    if (a) a.innerText = "\u25BC";
  }
});
function openCartModal() {
  closeMobileMenu();
  var cart = JSON.parse(localStorage.getItem("jdw_cart") || "[]") || [];
  var list = document.getElementById("cart-items-list");
  var totalEl = document.getElementById("cart-grand-total");
  if (!list || !totalEl) return;
  list.innerHTML = "";
  if (!cart.length) {
    list.innerHTML = '<p class="text-zinc-500 text-center py-8">Your cart is currently empty.</p>';
    totalEl.innerText = "$0.00";
  } else {
    var total = 0;
    cart.forEach(function (item, i) {
      var preTag = item.preorder ? ' <span style="color:#38bdf8;font-size:10px;font-weight:800">PREORDER</span>' : '';
      total += item.price * item.quantity;
      list.innerHTML +=
        '<div class="flex justify-between items-center bg-zinc-950 border border-zinc-800 p-4 rounded-xl"><div><h4 class="font-bold">' +
        item.name + preTag +
        '</h4><p class="text-xs text-emerald-400">$' +
        item.price.toFixed(2) +
        " \u00d7 " +
        item.quantity +
        '</p></div><button type="button" onclick="removeSingleCartItem(' +
        i +
        ')" class="text-red-400"><i class="fas fa-trash-alt"></i></button></div>';
    });
    totalEl.innerText = "$" + total.toFixed(2);
  }
  var modal = document.getElementById("cart-modal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}
function closeCartModal() {
  var modal = document.getElementById("cart-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}
function removeSingleCartItem(i) {
  var cart = JSON.parse(localStorage.getItem("jdw_cart") || "[]") || [];
  cart.splice(i, 1);
  localStorage.setItem("jdw_cart", JSON.stringify(cart));
  updateCartCount();
  openCartModal();
}
function addToCart(name, sku, price, preorder) {
  var cart = JSON.parse(localStorage.getItem("jdw_cart") || "[]") || [];
  var found = cart.find(function (x) { return x.sku === sku; });
  if (found) {
    found.quantity += 1;
    if (preorder) found.preorder = true;
  } else {
    cart.push({ name: name, sku: sku, price: Number(price) || 0, quantity: 1, preorder: !!preorder });
  }
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
  s.src = "https://jdwapexherp.com/assets/js/particle-grid-bg.js?v=lizards6";
  s.defer = true;
  document.head.appendChild(s);
})();
