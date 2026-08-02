/** Shared cart + nav helpers for service pages */
window.APEX_API_BASE = "https://freeport.jdwapexherp.com";
try {
  localStorage.setItem("APEX_API_BASE", "https://freeport.jdwapexherp.com");
  localStorage.removeItem("__APEX_API_ACTIVE__");
} catch (e) {}

if (!localStorage.getItem("jdw_cart")) localStorage.setItem("jdw_cart", JSON.stringify([]));

/** Tab icons — Herp site only (never FreePort) */
(function ensureTabLogo() {
  var icon = "https://jdwapexherp.com/assets/images/favicon.svg";
  var apple = "https://jdwapexherp.com/assets/images/gallery/Logo.png";
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
function openCartModal() {
  closeMobileMenu();
  var cart = JSON.parse(localStorage.getItem("jdw_cart")) || [];
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
      total += item.price * item.quantity;
      list.innerHTML +=
        '<div class="flex justify-between items-center bg-zinc-950 border border-zinc-800 p-4 rounded-xl"><div><h4 class="font-bold">' +
        item.name + '</h4><p class="text-xs text-emerald-400">$' + item.price.toFixed(2) + " × " + item.quantity +
        '</p></div><button onclick="removeSingleCartItem(' + i + ')" class="text-red-400"><i class="fas fa-trash-alt"></i></button></div>';
    });
    totalEl.innerText = "$" + total.toFixed(2);
  }
  document.getElementById("cart-modal").classList.remove("hidden");
  document.getElementById("cart-modal").classList.add("flex");
}
function closeCartModal() {
  document.getElementById("cart-modal").classList.add("hidden");
  document.getElementById("cart-modal").classList.remove("flex");
}
function removeSingleCartItem(i) {
  var cart = JSON.parse(localStorage.getItem("jdw_cart")) || [];
  cart.splice(i, 1);
  localStorage.setItem("jdw_cart", JSON.stringify(cart));
  updateCartCount();
  openCartModal();
}
function addToCart(name, sku, price) {
  var cart = JSON.parse(localStorage.getItem("jdw_cart")) || [];
  var found = cart.find(function (x) { return x.sku === sku; });
  if (found) found.quantity += 1;
  else cart.push({ name: name, sku: sku, price: Number(price) || 0, quantity: 1 });
  localStorage.setItem("jdw_cart", JSON.stringify(cart));
  updateCartCount();
}
function startPayPalPayment() { startCheckout("/api/checkout/paypal", "PayPal"); }
function cartPayload() {
  var cart = JSON.parse(localStorage.getItem("jdw_cart")) || [];
  return cart.map(function (i) {
    return { name: i.name, sku: i.sku, price: Number(i.price) || 0, quantity: Number(i.quantity) || 1 };
  });
}
function freeportBase() {
  return window.APEX_API_BASE || localStorage.getItem("APEX_API_BASE") || "https://freeport.jdwapexherp.com";
}
function startCheckout(path, label) {
  var items = cartPayload();
  if (!items.length) { alert("Your cart is empty."); return; }
  fetch(freeportBase() + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: items,
      successUrl: location.origin + location.pathname + "?paid=1",
      cancelUrl: location.href
    })
  })
    .then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, j: j }; });
    })
    .then(function (x) {
      if (x.ok && x.j && x.j.url) { window.location.href = x.j.url; return; }
      alert((x.j && (x.j.message || x.j.error)) || (label + " is not available right now."));
    })
    .catch(function () {
      alert(label + " could not reach FreePort.");
    });
}
function startSquarePayment() { startCheckout("/api/checkout/square", "Square"); }
function startStripePayment() { startCheckout("/api/checkout/stripe", "Stripe"); }

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
  addLink(document.getElementById("category-dropdown"), "plants.html", "Live Plants", "block py-2 text-emerald-400 hover:text-emerald-300 font-semibold");
  addLink(document.getElementById("mobile-cats"), "plants.html", "Live Plants", "block py-3 px-5 text-emerald-400 border-b border-zinc-800");
});
