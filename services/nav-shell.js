if (!localStorage.getItem("jdw_cart")) localStorage.setItem("jdw_cart", JSON.stringify([]));
function updateCartCount() {
  var c = JSON.parse(localStorage.getItem("jdw_cart")) || [];
  document.querySelectorAll(".cart-count").forEach(function (b) {
    b.innerText = c.reduce(function (s, i) { return s + i.quantity; }, 0);
  });
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
  if (d.classList.contains("hidden")) {
    d.classList.remove("hidden");
    if (a) a.innerText = "▲";
  } else {
    d.classList.add("hidden");
    if (a) a.innerText = "▼";
  }
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
function addToCart(name, variant, price) {
  var cart = JSON.parse(localStorage.getItem("jdw_cart")) || [];
  var ex = cart.find(function (i) { return i.name === name && i.variant === variant; });
  if (ex) ex.quantity++;
  else cart.push({ name: name, variant: variant, price: price, quantity: 1 });
  localStorage.setItem("jdw_cart", JSON.stringify(cart));
  updateCartCount();
  alert(name + " added");
}
function openCartModal() {
  closeMobileMenu();
  var cart = JSON.parse(localStorage.getItem("jdw_cart")) || [];
  var list = document.getElementById("cart-items-list");
  var totalEl = document.getElementById("cart-grand-total");
  if (!list) return;
  list.innerHTML = "";
  if (!cart.length) {
    list.innerHTML = '<p class="text-zinc-500 text-center py-8">Your cart is currently empty.</p>';
    if (totalEl) totalEl.innerText = "$0.00";
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
        '</p></div><button type="button" onclick="removeSingleCartItem(' +
        i +
        ')" class="text-red-400"><i class="fas fa-trash-alt"></i></button></div>';
    });
    if (totalEl) totalEl.innerText = "$" + total.toFixed(2);
  }
  var modal = document.getElementById("cart-modal");
  if (modal) { modal.classList.remove("hidden"); modal.classList.add("flex"); }
}
function closeCartModal() {
  var modal = document.getElementById("cart-modal");
  if (modal) { modal.classList.add("hidden"); modal.classList.remove("flex"); }
}
function removeSingleCartItem(i) {
  var c = JSON.parse(localStorage.getItem("jdw_cart")) || [];
  c.splice(i, 1);
  localStorage.setItem("jdw_cart", JSON.stringify(c));
  updateCartCount();
  openCartModal();
}
