/**
 * Apex storefront cart — local mirror + FreePort master cart
 * Survives page changes and (with ?cart= id) sister sites.
 */
(function apexCartBootstrap() {
  "use strict";

  var API = window.APEX_API_BASE || "https://freeport.jdwapexherp.com";
  var ID_KEY = "apex_cart_id";
  var LOCAL_KEY = "jdw_cart";

  function storeGuess() {
    try {
      var h = (location.hostname || "").toLowerCase();
      if (h.indexOf("k9") >= 0) return "k9";
      if (h.indexOf("feline") >= 0) return "feline";
    } catch (e) {}
    return window.APEX_STORE || "herp";
  }

  function getCartId() {
    try {
      var q = new URLSearchParams(location.search || "").get("cart") || "";
      if (q && /^c_[a-f0-9]{16,}$/i.test(q)) {
        localStorage.setItem(ID_KEY, q);
        return q;
      }
      return localStorage.getItem(ID_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function setCartId(id) {
    try {
      if (id) localStorage.setItem(ID_KEY, id);
    } catch (e) {}
  }

  function readLocal() {
    try {
      var cart = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]") || [];
      return cart.filter(function (it) {
        return it && typeof it === "object" && it.sku;
      });
    } catch (e) {
      return [];
    }
  }

  function writeLocal(items) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(items || []));
    } catch (e) {}
    updateCartCount();
  }

  function api(method, path, body) {
    var opts = { method: method, headers: { "Content-Type": "application/json" } };
    if (body != null) opts.body = JSON.stringify(body);
    return fetch(API + path, opts).then(function (r) {
      return r.json().then(function (j) {
        return { ok: r.ok, status: r.status, j: j };
      });
    });
  }

  function ensureCartId() {
    var id = getCartId();
    if (id) return Promise.resolve(id);
    return api("POST", "/api/cart", {}).then(function (x) {
      if (x.ok && x.j && x.j.id) {
        setCartId(x.j.id);
        return x.j.id;
      }
      throw new Error("cart_create");
    });
  }

  function updateCartCount() {
    var cart = readLocal();
    var n = cart.reduce(function (s, i) {
      return s + (Number(i.quantity) || 0);
    }, 0);
    document.querySelectorAll(".cart-count").forEach(function (b) {
      b.innerText = String(n);
    });
  }

  function renderCart() {
    var list = document.getElementById("cart-items-list");
    var totalEl = document.getElementById("cart-grand-total");
    if (!list) return;
    var cart = readLocal();
    writeLocal(cart);
    list.innerHTML = "";
    if (!cart.length) {
      list.innerHTML = '<p class="text-zinc-500 text-center py-8">Your cart is currently empty.</p>';
      if (totalEl) totalEl.innerText = "$0.00";
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
        '<div class="min-w-0"><h4 class="font-bold truncate">' +
        name +
        "</h4>" +
        '<p class="text-xs text-emerald-400">$' +
        price.toFixed(2) +
        " × " +
        qty +
        (item.preorder ? " · Preorder" : "") +
        (item.store && item.store !== "herp" ? " · " + item.store : "") +
        "</p></div>" +
        '<button type="button" onclick="removeSingleCartItem(' +
        i +
        ')" class="text-red-400 flex-shrink-0" aria-label="Remove">' +
        '<i class="fas fa-trash-alt"></i></button></div>';
    });
    if (totalEl) totalEl.innerText = "$" + total.toFixed(2);
  }

  function openCartModal() {
    try {
      if (typeof closeMobileMenu === "function") closeMobileMenu();
    } catch (e) {}
    var m = document.getElementById("cart-modal");
    if (m) {
      m.classList.remove("hidden");
      m.classList.add("flex");
      document.body.style.overflow = "hidden";
    }
    syncFromServer().then(renderCart).catch(renderCart);
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
    var cart = readLocal();
    var removed = cart[idx];
    cart.splice(idx, 1);
    writeLocal(cart);
    renderCart();
    if (!removed || !removed.sku) return;
    ensureCartId()
      .then(function (id) {
        var q = removed.store ? "?store=" + encodeURIComponent(removed.store) : "";
        return api("DELETE", "/api/cart/" + encodeURIComponent(id) + "/items/" + encodeURIComponent(removed.sku) + q);
      })
      .then(function (x) {
        if (x.ok && x.j && x.j.items) writeLocal(x.j.items);
        renderCart();
      })
      .catch(function () {});
  }

  function addToCart(nameOrItem, sku, price, preorder) {
    var item;
    if (nameOrItem && typeof nameOrItem === "object") {
      item = {
        name: nameOrItem.name || nameOrItem.sku || "Item",
        sku: nameOrItem.sku || "",
        price: Number(nameOrItem.price) || 0,
        quantity: Number(nameOrItem.quantity) || 1,
        preorder: !!nameOrItem.preorder,
        store: nameOrItem.store || storeGuess()
      };
    } else {
      item = {
        name: nameOrItem || sku || "Item",
        sku: sku || "",
        price: Number(price) || 0,
        quantity: 1,
        preorder: !!preorder,
        store: storeGuess()
      };
    }
    if (!item.sku) return;

    var cart = readLocal();
    var found = cart.find(function (c) {
      return c.sku === item.sku && (c.store || storeGuess()) === item.store;
    });
    if (found) found.quantity = (Number(found.quantity) || 1) + (Number(item.quantity) || 1);
    else cart.push(item);
    writeLocal(cart);

    ensureCartId()
      .then(function (id) {
        return api("POST", "/api/cart/" + encodeURIComponent(id) + "/items", item);
      })
      .then(function (x) {
        if (x.ok && x.j && x.j.items) writeLocal(x.j.items);
      })
      .catch(function () {});
  }

  function mergeLists(a, b) {
    var map = {};
    function key(it) {
      return String(it.sku) + "::" + String(it.store || "herp");
    }
    (a || []).concat(b || []).forEach(function (it) {
      if (!it || !it.sku) return;
      var k = key(it);
      if (!map[k]) {
        map[k] = {
          name: it.name,
          sku: it.sku,
          price: Number(it.price) || 0,
          quantity: Number(it.quantity) || 1,
          preorder: !!it.preorder,
          store: it.store || "herp"
        };
      } else {
        map[k].quantity = Math.max(map[k].quantity, Number(it.quantity) || 1);
        if (it.price) map[k].price = Number(it.price) || map[k].price;
        if (it.name) map[k].name = it.name;
      }
    });
    return Object.keys(map).map(function (k) {
      return map[k];
    });
  }

  function syncFromServer() {
    var local = readLocal();
    return ensureCartId().then(function (id) {
      var push =
        local.length > 0
          ? api("POST", "/api/cart/" + encodeURIComponent(id) + "/merge", { items: local })
          : Promise.resolve({ ok: true, j: null });
      return push
        .then(function () {
          return api("GET", "/api/cart/" + encodeURIComponent(id));
        })
        .then(function (x) {
          if (x.status === 404) {
            return api("POST", "/api/cart", {}).then(function (c) {
              if (c.ok && c.j && c.j.id) {
                setCartId(c.j.id);
                if (local.length) {
                  return api("POST", "/api/cart/" + encodeURIComponent(c.j.id) + "/merge", {
                    items: local
                  }).then(function (m) {
                    if (m.ok && m.j && m.j.items) writeLocal(m.j.items);
                    return m.j;
                  });
                }
                writeLocal([]);
                return c.j;
              }
              return null;
            });
          }
          if (x.ok && x.j) {
            var merged = mergeLists(local, x.j.items || []);
            writeLocal(merged);
            if (merged.length > (x.j.items || []).length) {
              return api("POST", "/api/cart/" + encodeURIComponent(id) + "/merge", {
                items: merged
              }).then(function (m) {
                if (m.ok && m.j && m.j.items) writeLocal(m.j.items);
                return m.j || x.j;
              });
            }
            return x.j;
          }
          return null;
        });
    });
  }

  function stampSisterLinks() {
    var id = getCartId();
    if (!id) return;
    document.querySelectorAll("a[href]").forEach(function (a) {
      try {
        var href = a.getAttribute("href") || "";
        if (!/jdwapex(herp|k9|feline)\.com/i.test(href)) return;
        var u = new URL(href, location.href);
        u.searchParams.set("cart", id);
        a.setAttribute("href", u.toString());
      } catch (e) {}
    });
  }

  window.updateCartCount = updateCartCount;
  window.renderCart = renderCart;
  window.openCartModal = openCartModal;
  window.closeCartModal = closeCartModal;
  window.removeSingleCartItem = removeSingleCartItem;
  window.addToCart = addToCart;
  window.apexCartSync = syncFromServer;

  function boot() {
    syncFromServer()
      .then(function () {
        stampSisterLinks();
        updateCartCount();
      })
      .catch(function () {
        updateCartCount();
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
