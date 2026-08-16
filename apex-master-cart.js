/**
 * Apex master cart client — all storefronts (Herp / K9 / Feline)
 * Source of truth: FreePort /api/cart/*
 * Local mirror: localStorage jdw_cart (keeps existing UI working)
 * Cross-domain: shared cart id via ?cart= on sister links + localStorage apex_cart_id
 */
(function () {
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

  function getLocalId() {
    try {
      return localStorage.getItem(ID_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function setLocalId(id) {
    try {
      if (id) localStorage.setItem(ID_KEY, id);
    } catch (e) {}
  }

  function readLocalMirror() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]") || [];
    } catch (e) {
      return [];
    }
  }

  function writeLocalMirror(items) {
    try {
      var mirror = (items || []).map(function (it) {
        return {
          name: it.name,
          sku: it.sku,
          price: Number(it.price) || 0,
          quantity: Number(it.quantity) || 1,
          preorder: !!it.preorder,
          store: it.store || storeGuess()
        };
      });
      localStorage.setItem(LOCAL_KEY, JSON.stringify(mirror));
    } catch (e) {}
    try {
      if (typeof updateCartCount === "function") updateCartCount();
    } catch (e2) {}
    document.querySelectorAll(".cart-count").forEach(function (el) {
      var n = (items || []).reduce(function (s, it) {
        return s + (Number(it.quantity) || 0);
      }, 0);
      el.innerText = String(n);
    });
  }

  function api(method, path, body) {
    var opts = {
      method: method,
      headers: { "Content-Type": "application/json" }
    };
    if (body != null) opts.body = JSON.stringify(body);
    return fetch(API + path, opts).then(function (r) {
      return r.json().then(function (j) {
        return { ok: r.ok, status: r.status, j: j };
      });
    });
  }

  function ensureCartId() {
    var q = "";
    try {
      q = new URLSearchParams(location.search || "").get("cart") || "";
    } catch (e) {}
    if (q && /^c_[a-f0-9]{16,}$/i.test(q)) {
      setLocalId(q);
      return Promise.resolve(q);
    }
    var id = getLocalId();
    if (id) return Promise.resolve(id);
    return api("POST", "/api/cart", {}).then(function (x) {
      if (x.ok && x.j && x.j.id) {
        setLocalId(x.j.id);
        return x.j.id;
      }
      throw new Error("cart_create");
    });
  }

  function pull() {
    return ensureCartId().then(function (id) {
      return api("GET", "/api/cart/" + encodeURIComponent(id)).then(function (x) {
        if (x.status === 404) {
          return api("POST", "/api/cart", {}).then(function (c) {
            if (c.ok && c.j && c.j.id) {
              setLocalId(c.j.id);
              writeLocalMirror(c.j.items || []);
              return c.j;
            }
            throw new Error("cart_recreate");
          });
        }
        if (!x.ok) throw new Error("cart_get");
        writeLocalMirror(x.j.items || []);
        return x.j;
      });
    });
  }

  function mergeLocalIfNeeded(remote) {
    var local = readLocalMirror();
    if (!local.length) return Promise.resolve(remote);
    var remoteKeys = {};
    (remote.items || []).forEach(function (it) {
      remoteKeys[it.sku + "::" + (it.store || "herp")] = 1;
    });
    var missing = local.filter(function (it) {
      return !remoteKeys[it.sku + "::" + (it.store || storeGuess())];
    });
    if (!missing.length) return Promise.resolve(remote);
    return ensureCartId().then(function (id) {
      return api("POST", "/api/cart/" + encodeURIComponent(id) + "/merge", {
        items: missing.map(function (it) {
          return {
            sku: it.sku,
            name: it.name,
            price: it.price,
            quantity: it.quantity,
            store: it.store || storeGuess(),
            preorder: !!it.preorder
          };
        })
      }).then(function (x) {
        if (x.ok && x.j) {
          writeLocalMirror(x.j.items || []);
          return x.j;
        }
        return remote;
      });
    });
  }

  function addItem(name, sku, price, preorder, store) {
    var line = {
      name: name,
      sku: sku,
      price: Number(price) || 0,
      quantity: 1,
      preorder: !!preorder,
      store: store || storeGuess()
    };
    var local = readLocalMirror();
    var hit = false;
    local.forEach(function (it) {
      if (it.sku === line.sku && (it.store || storeGuess()) === line.store) {
        it.quantity = (Number(it.quantity) || 0) + 1;
        hit = true;
      }
    });
    if (!hit) local.push(line);
    writeLocalMirror(local);

    return ensureCartId()
      .then(function (id) {
        return api("POST", "/api/cart/" + encodeURIComponent(id) + "/items", line);
      })
      .then(function (x) {
        if (x.ok && x.j) {
          writeLocalMirror(x.j.items || []);
          return x.j;
        }
        return { items: local, ok: false };
      })
      .catch(function () {
        return { items: local, ok: false };
      });
  }

  function clearMaster() {
    writeLocalMirror([]);
    var id = getLocalId();
    if (!id) return Promise.resolve();
    return api("POST", "/api/cart/" + encodeURIComponent(id) + "/clear", {}).catch(function () {});
  }

  function stampSisterLinks() {
    var id = getLocalId();
    if (!id) return;
    document.querySelectorAll("a[href]").forEach(function (a) {
      try {
        var href = a.getAttribute("href") || "";
        if (!/jdwapex(herp|k9|feline)\.com/i.test(href)) return;
        var u = new URL(href, location.href);
        if (u.searchParams.get("cart") === id) return;
        u.searchParams.set("cart", id);
        a.setAttribute("href", u.toString());
      } catch (e) {}
    });
  }

  window.addToCart = function (name, sku, price, preorder) {
    addItem(name, sku, price, preorder, storeGuess());
  };

  window.apexCartPayload = function () {
    return readLocalMirror().map(function (i) {
      return {
        name: i.name,
        sku: i.sku,
        price: Number(i.price) || 0,
        quantity: Number(i.quantity) || 1,
        preorder: !!i.preorder,
        store: i.store || storeGuess()
      };
    });
  };

  var prevClear = window.clearApexCart;
  window.clearApexCart = function () {
    clearMaster();
    if (typeof prevClear === "function") {
      try { prevClear(); } catch (e) {}
    }
  };

  window.apexMasterCart = {
    ensure: ensureCartId,
    pull: pull,
    add: addItem,
    clear: clearMaster,
    apiBase: API,
    store: storeGuess
  };

  function boot() {
    ensureCartId()
      .then(function () { return pull(); })
      .then(function (remote) { return mergeLocalIfNeeded(remote || { items: [] }); })
      .then(function () { stampSisterLinks(); })
      .catch(function (e) {
        console.warn("apex-master-cart boot", e);
        try {
          if (typeof updateCartCount === "function") updateCartCount();
        } catch (e2) {}
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
