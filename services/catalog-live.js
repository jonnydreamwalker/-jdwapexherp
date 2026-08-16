/** catalog-live: cart + FreePort catalog */
(function apexCartBootstrap() {
  function updateCartCount() {
    var cart = [];
    try { cart = JSON.parse(localStorage.getItem("jdw_cart") || "[]") || []; } catch (e) { cart = []; }
    var n = cart.reduce(function (s, i) {
      if (!i || typeof i !== "object") return s;
      return s + (Number(i.quantity) || 0);
    }, 0);
    document.querySelectorAll(".cart-count").forEach(function (b) { b.innerText = String(n); });
  }
  function renderCart() {
    var list = document.getElementById("cart-items-list");
    var totalEl = document.getElementById("cart-grand-total");
    if (!list) return;
    var cart = [];
    try { cart = JSON.parse(localStorage.getItem("jdw_cart") || "[]") || []; } catch (e) { cart = []; }
    cart = cart.filter(function (it) { return it && typeof it === "object" && it.sku; });
    try { localStorage.setItem("jdw_cart", JSON.stringify(cart)); } catch (e2) {}
    list.innerHTML = "";
    if (!cart.length) {
      list.innerHTML = '<p class="text-zinc-500 text-center py-8">Your cart is currently empty.</p>';
      if (totalEl) totalEl.innerText = "$0.00";
      updateCartCount();
      return;
    }
    var total = 0;
    cart.forEach(function (item, i) {
      var price = Number(item.price) || 0;
      var qty = Number(item.quantity) || 1;
      total += price * qty;
      var name = String(item.name || item.sku || "Item").replace(/</g, "<");
      list.innerHTML +=
        '<div class="flex justify-between items-center bg-zinc-950 border border-zinc-800 p-4 rounded-xl gap-3">' +
        '<div class="min-w-0"><h4 class="font-bold truncate">' + name + "</h4>" +
        '<p class="text-xs text-emerald-400">$' + price.toFixed(2) + " × " + qty +
        (item.preorder ? " · Preorder" : "") + "</p></div>" +
        '<button type="button" onclick="removeSingleCartItem(' + i + ')" class="text-red-400 flex-shrink-0" aria-label="Remove">' +
        '<i class="fas fa-trash-alt"></i></button></div>';
    });
    if (totalEl) totalEl.innerText = "$" + total.toFixed(2);
    updateCartCount();
  }
  function openCartModal() {
    try { if (typeof closeMobileMenu === "function") closeMobileMenu(); } catch (e) {}
    var m = document.getElementById("cart-modal");
    if (m) {
      m.classList.remove("hidden");
      m.classList.add("flex");
      document.body.style.overflow = "hidden";
    }
    renderCart();
  }
  function closeCartModal() {
    var m = document.getElementById("cart-modal");
    if (m) {
      m.classList.add("hidden");
      m.classList.remove("flex");
    }
    document.body.style.overflow = "";
  }
  function removeSingleCartItem(idx) {
    var cart = [];
    try { cart = JSON.parse(localStorage.getItem("jdw_cart") || "[]") || []; } catch (e) { cart = []; }
    cart = cart.filter(function (it) { return it && typeof it === "object" && it.sku; });
    cart.splice(idx, 1);
    localStorage.setItem("jdw_cart", JSON.stringify(cart));
    updateCartCount();
    renderCart();
  }
  function addToCart(nameOrItem, sku, price, preorder) {
    var item;
    if (nameOrItem && typeof nameOrItem === "object") {
      item = {
        name: nameOrItem.name || nameOrItem.sku || "Item",
        sku: nameOrItem.sku || "",
        price: Number(nameOrItem.price) || 0,
        quantity: Number(nameOrItem.quantity) || 1,
        preorder: !!nameOrItem.preorder
      };
    } else {
      item = {
        name: nameOrItem || sku || "Item",
        sku: sku || "",
        price: Number(price) || 0,
        quantity: 1,
        preorder: !!preorder
      };
    }
    if (!item.sku) return;
    var cart = [];
    try { cart = JSON.parse(localStorage.getItem("jdw_cart") || "[]") || []; } catch (e) { cart = []; }
    cart = cart.filter(function (it) { return it && typeof it === "object" && it.sku; });
    var found = cart.find(function (c) { return c.sku === item.sku; });
    if (found) found.quantity = (Number(found.quantity) || 1) + (Number(item.quantity) || 1);
    else cart.push(item);
    localStorage.setItem("jdw_cart", JSON.stringify(cart));
    updateCartCount();
  }
  window.updateCartCount = updateCartCount;
  window.renderCart = renderCart;
  window.openCartModal = openCartModal;
  window.closeCartModal = closeCartModal;
  window.removeSingleCartItem = removeSingleCartItem;
  window.addToCart = addToCart;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", updateCartCount);
  else updateCartCount();
})();
