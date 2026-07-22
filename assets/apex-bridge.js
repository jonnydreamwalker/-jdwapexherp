/**
 * ApexFreePort bridge — jdwapexherp.com ↔ EC2 inventory node
 * Update APEX_API if your node IP / domain changes.
 */
(function (global) {
  var APEX_API = "http://3.14.14.127:3000";

  function getApiBase() {
    return (global.APEX_API_BASE || APEX_API).replace(/\/$/, "");
  }

  async function fetchStock() {
    var res = await fetch(getApiBase() + "/api/stock", {
      method: "GET",
      mode: "cors",
      cache: "no-store",
    });
    if (!res.ok) throw new Error("stock " + res.status);
    return res.json();
  }

  async function reportSale(sku, quantity) {
    var res = await fetch(getApiBase() + "/api/webhook/sale", {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: sku, quantity: quantity || 1 }),
    });
    if (!res.ok) throw new Error("sale " + res.status);
    return res.json();
  }

  function findItem(stock, sku) {
    if (!stock || !stock.items) return null;
    for (var i = 0; i < stock.items.length; i++) {
      if (stock.items[i].sku === sku) return stock.items[i];
    }
    return null;
  }

  /** Fill elements: data-apex-sku="HS-UFO-FLAT-01" data-apex-field="qty|status|lane" */
  async function paintStock() {
    try {
      var stock = await fetchStock();
      global.__APEX_STOCK__ = stock;
      var nodes = document.querySelectorAll("[data-apex-sku]");
      nodes.forEach(function (el) {
        var sku = el.getAttribute("data-apex-sku");
        var field = el.getAttribute("data-apex-field") || "qty";
        var item = findItem(stock, sku);
        if (!item) {
          el.textContent = field === "status" ? "Unknown" : "—";
          return;
        }
        if (field === "qty") el.textContent = String(item.qty);
        else if (field === "available")
          el.textContent = String(
            Math.max(0, (item.qty || 0) - (item.reserved || 0))
          );
        else if (field === "status") el.textContent = item.status || "active";
        else if (field === "lane") el.textContent = item.lane || "direct";
        else el.textContent = String(item[field] != null ? item[field] : "—");
      });
      var badge = document.getElementById("apex-bridge-status");
      if (badge) {
        badge.textContent = "Live inventory · " + (stock.warehouse || "ApexFreePort");
        badge.classList.remove("text-zinc-500");
        badge.classList.add("text-emerald-400");
      }
    } catch (e) {
      console.warn("ApexFreePort bridge:", e);
      var badge = document.getElementById("apex-bridge-status");
      if (badge) {
        badge.textContent = "Inventory offline";
        badge.classList.add("text-amber-400");
      }
    }
  }

  global.ApexBridge = {
    getApiBase: getApiBase,
    fetchStock: fetchStock,
    reportSale: reportSale,
    findItem: findItem,
    paintStock: paintStock,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", paintStock);
  } else {
    paintStock();
  }
})(window);
