/* shared cart helpers for shop pages */
if (!localStorage.getItem("jdw_cart")) localStorage.setItem("jdw_cart", JSON.stringify([]));
function updateCartCount() {
  var c = JSON.parse(localStorage.getItem("jdw_cart")) || [];
  document.querySelectorAll(".cart-count").forEach(function (b) {
    b.innerText = c.reduce(function (s, i) { return s + i.quantity; }, 0);
  });
}
document.addEventListener("DOMContentLoaded", updateCartCount);
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
  var cart = JSON.parse(localStorage.getItem("jdw_cart")) || [];
  var list = document.getElementById("cart-items-list");
  var totalEl = document.getElementById("cart-grand-total");
  if (!list) return;
  list.innerHTML = "";
  if (!cart.length) {
    list.innerHTML = '<p class="text-zinc-500 text-center py-8">Cart empty.</p>';
    totalEl.innerText = "$0.00";
  } else {
    var total = 0;
    cart.forEach(function (item, i) {
      total += item.price * item.quantity;
      list.innerHTML +=
        '<div class="flex justify-between p-3 bg-zinc-950 border border-zinc-800 rounded-xl"><span>' +
        item.name +
        " ×" +
        item.quantity +
        '</span><button onclick="removeSingleCartItem(' +
        i +
        ')" class="text-red-400">✕</button></div>';
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
  var c = JSON.parse(localStorage.getItem("jdw_cart")) || [];
  c.splice(i, 1);
  localStorage.setItem("jdw_cart", JSON.stringify(c));
  updateCartCount();
  openCartModal();
}
