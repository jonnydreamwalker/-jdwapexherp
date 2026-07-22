/** Shared cart + nav helpers for service pages */
if (!localStorage.getItem("jdw_cart")) localStorage.setItem("jdw_cart", JSON.stringify([]));

/** Browser tab logo — same as index */
(function ensureTabLogo() {
  var href = "../assets/images/gallery/Logo.png";
  function setLink(rel, type) {
    var el = document.querySelector('link[rel="' + rel + '"]');
    if (!el) {
      el = document.createElement("link");
      el.setAttribute("rel", rel);
      if (type) el.setAttribute("type", type);
      document.head.appendChild(el);
    }
    el.setAttribute("href", href);
  }
  setLink("icon", "image/png");
  setLink("shortcut icon", "image/png");
  setLink("apple-touch-icon", null);
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
  polishServiceFooter();
});
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
        item.name +
        '</h4><p class="text-xs text-emerald-400">$' +
        item.price.toFixed(2) +
        " × " +
        item.quantity +
        '</p></div><button onclick="removeSingleCartItem(' +
        i +
        ')" class="text-red-400"><i class="fas fa-trash-alt"></i></button></div>';
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
function populatePayPalFormFields() { return true; }
function startSquarePayment() { alert("Square checkout — live keys in ApexFreePort."); }
function startStripePayment() { alert("Stripe checkout — live keys in ApexFreePort."); }

function polishServiceFooter() {
  var foot = document.querySelector("footer");
  if (!foot) return;
  if (!foot.querySelector(".fa-instagram")) {
    var cols = foot.querySelectorAll(".grid > div");
    if (cols.length >= 4) {
      cols[2].innerHTML =
        '<h4 class="font-bold text-emerald-400 mb-3">Company</h4><ul class="space-y-2 text-zinc-400">' +
        '<li><a href="../about.html" class="hover:text-emerald-400">About</a></li>' +
        '<li><a href="https://jonnydreamwalker.github.io/-jdwapexk9/" class="hover:text-emerald-400">Apex K9</a></li>' +
        '<li><a href="https://jonnydreamwalker.github.io/-jdwapexfeline/" class="hover:text-emerald-400">Apex Feline</a></li>' +
        '<li><a href="deals.html" class="hover:text-emerald-400">Deals</a></li></ul>';
      cols[3].innerHTML =
        '<h4 class="font-bold text-emerald-400 mb-3">Connect</h4>' +
        '<div class="flex flex-wrap gap-4 text-xl">' +
        '<a href="https://www.instagram.com/jonny_dreamwalker/" target="_blank" rel="noopener" class="text-zinc-400 hover:text-emerald-400" aria-label="Instagram"><i class="fab fa-instagram"></i></a>' +
        '<a href="https://www.tiktok.com/@jdwapexherp" target="_blank" rel="noopener" class="text-zinc-400 hover:text-emerald-400" aria-label="TikTok"><i class="fab fa-tiktok"></i></a>' +
        '<a href="https://x.com/JonnyDreamWalk" target="_blank" rel="noopener" class="text-zinc-400 hover:text-emerald-400" aria-label="X"><i class="fab fa-x-twitter"></i></a>' +
        '<a href="https://www.facebook.com/profile.php?id=61580875307761" target="_blank" rel="noopener" class="text-zinc-400 hover:text-emerald-400" aria-label="Facebook"><i class="fab fa-facebook"></i></a>' +
        '<a href="https://www.youtube.com/@JDWAHS" target="_blank" rel="noopener" class="text-zinc-400 hover:text-emerald-400" aria-label="YouTube"><i class="fab fa-youtube"></i></a>' +
        '<a href="https://linktr.ee/jonnydreamwalkerapexherpsupply" target="_blank" rel="noopener" class="text-zinc-400 hover:text-emerald-400" aria-label="Linktree"><i class="fas fa-link"></i></a>' +
        '</div><p class="text-zinc-600 mt-4 text-xs">© 2026 JonnyDreamwalker Apex Herp Supply</p>';
    }
  }
}
