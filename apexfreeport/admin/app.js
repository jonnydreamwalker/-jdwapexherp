(function () {
  var store = "herp";
  var items = [];
  var categories = [];
  var filterCat = "";
  var inventoryView = "main";
  var wholesaleMode = false;
  var publicFeed = false;
  var pending = null;
  var editMode = false;
  var dragSku = null;
  function $(id) { return document.getElementById(id); }
  function setStatus(msg, kind) {
    var el = $("status");
    if (!el) return;
    el.textContent = msg;
    el.className = kind === "err" ? "err" : (kind === "ok" ? "ok" : "");
  }
  function esc(s) {
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(s == null ? "" : String(s)));
    return d.innerHTML.replace(/\"/g, "&#34;");
  }
  function itemPool(it) {
    if (!it) return "retail";
    var p = String(it.pool || it.channel || "").toLowerCase();
    if (p === "wholesale" || p === "dealer") return "wholesale";
    if (p === "both" || p === "all") return "both";
    var w = Number(it.weightLb) || 0;
    var n = String(it.name || "").toLowerCase();
    var m = n.match(/(\d+)\s*lb/);
    if (w >= 50 || (m && Number(m[1]) >= 50) || it.dealerEligible === true) return "wholesale";
    return "retail";
  }
  function inView(it) {
    var pool = itemPool(it);
    if (inventoryView === "master") return true;
    if (inventoryView === "wholesale") return pool === "wholesale" || pool === "both";
    return pool === "retail" || pool === "both";
  }
  function isListed(it) {
    if (it.listed === false || it.listed === "false") return false;
    if (it.hidden === true) return false;
    return true;
  }
  function itemImage(it) {
    if (!it) return "";
    if (it.image) return it.image;
    if (it.images && it.images.length) return it.images[0];
    return "";
  }
  function setPhotoPreview(src) {
    var img = $("p_photoImg");
    var ph = $("p_photoPlaceholder");
    if ($("p_image")) $("p_image").value = src || "";
    if (!img) return;
    if (src) { img.src = src; img.style.display = "block"; if (ph) ph.style.display = "none"; }
    else { img.removeAttribute("src"); img.style.display = "none"; if (ph) ph.style.display = "block"; }
  }
  function pricePerLb(dealer, lb) {
    var d = Number(dealer); var w = Number(lb);
    if (!(d > 0) || !(w > 0)) return null;
    return Math.round((d / w) * 100) / 100;
  }
  function updatePerLb() {
    var el = $("p_perLb");
    var price = Number($("p_dealerPrice") && $("p_dealerPrice").value) || 0;
    var lb = Number($("p_weightLb") && $("p_weightLb").value) || 0;
    var rate = pricePerLb(price, lb);
    var text = rate != null
      ? ("$/lb = $" + rate.toFixed(2) + "   ·   $" + price.toFixed(2) + " \u00f7 " + lb + " lb")
      : "$/lb: enter wholesale price + weight (no auto discount)";
    if (el) el.textContent = text;
    else {
      var w = $("p_weightLb");
      if (w && !document.getElementById("p_perLb")) {
        var p = document.createElement("p");
        p.id = "p_perLb";
        p.style.cssText = "grid-column:1/-1;margin:8px 0 0;padding:10px 12px;border-radius:10px;background:#422006;border:1px solid #f59e0b;color:#fde68a;font-weight:800;font-size:14px";
        p.textContent = text;
        var parent = w.closest(".grid2") || w.parentNode.parentNode;
        parent.appendChild(p);
      } else if (document.getElementById("p_perLb")) document.getElementById("p_perLb").textContent = text;
    }
  }
  function api(url, opts) {
    opts = opts || {}; opts.credentials = "same-origin"; opts.headers = opts.headers || {};
    if (opts.body && typeof opts.body === "object") {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(url, opts).then(function (r) {
      if (r.status === 401) { location.href = "/login"; throw new Error("401"); }
      return r.text().then(function (txt) {
        var j = null;
        try { j = txt ? JSON.parse(txt) : {}; } catch (e) { throw new Error("Bad JSON"); }
        if (!r.ok) throw new Error((j && (j.message || j.error)) || ("HTTP " + r.status));
        return j;
      });
    });
  }
  function openModal(id) { $(id).classList.add("open"); }
  function closeModal(id) { $(id).classList.remove("open"); }
  function openConfirm(title, msg, yesLabel, danger, fn) {
    $("confirmTitle").textContent = title;
    $("confirmTitle").className = danger ? "danger" : "warn";
    $("confirmMsg").textContent = msg;
    $("confirmYes").textContent = yesLabel || "Yes";
    $("confirmYes").className = danger ? "danger" : "";
    pending = fn; openModal("confirmModal");
  }
  function fillCats(sel, selected) {
    sel.innerHTML = "";
    var list = categories.length ? categories.slice() : ["Hardscape", "Lighting", "Substrates", "Nutrition", "Apparel", "Enclosures", "Heating", "Hardware"];
    if (selected && list.indexOf(selected) < 0) list.unshift(selected);
    list.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c; o.textContent = c;
      if (c === selected) o.selected = true;
      sel.appendChild(o);
    });
  }
  function updateSlogan() {
    var el = $("slogan"); if (!el) return;
    if (publicFeed) { el.textContent = "jdwapexherp.com feed is LIVE for this store."; el.className = "slogan live"; }
    else { el.textContent = "Flip the switch."; el.className = "slogan"; }
  }
  function renderTabs(stores) {
    var el = $("storeTabs"); if (!el) return; el.innerHTML = "";
    (stores || [{ id: "herp", name: "Apex Herp", count: items.length }]).forEach(function (s) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "tab" + (s.id === store ? " active" : "");
      b.textContent = (s.name || s.id) + " (" + (s.count != null ? s.count : 0) + ")";
      b.onclick = function () { store = s.id; filterCat = ""; load(); };
      el.appendChild(b);
    });
  }
  function renderChips() {
    var el = $("catChips"); if (!el) return; el.innerHTML = "";
    function chip(label, val) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "chip" + (filterCat === val ? " active" : "");
      b.textContent = label;
      b.onclick = function () { filterCat = val; renderTable(); renderChips(); };
      el.appendChild(b);
    }
    chip("All", ""); categories.forEach(function (c) { chip(c, c); });
  }
  function clearProductForm() {
    $("p_originalSku").value = ""; $("p_sku").value = ""; $("p_name").value = "";
    $("p_price").value = ""; $("p_qty").value = "0"; $("p_reserved").value = "0";
    $("p_location").value = ""; $("p_description").value = "";
    $("p_lane").value = "direct"; $("p_status").value = "active";
    if ($("p_listed")) $("p_listed").checked = true;
    if ($("p_dealerPrice")) $("p_dealerPrice").value = "";
    if ($("p_weightLb")) $("p_weightLb").value = "";
    if ($("p_photoFile")) $("p_photoFile").value = "";
    setPhotoPreview("");
    fillCats($("p_category"), categories[0] || "Hardscape");
    updatePerLb();
  }
  function openAdd() {
    editMode = false; $("productTitle").textContent = "Add product";
    $("productHint").textContent = "Enter the wholesale price you charge and the weight. FreePort calculates $/lb. No auto discount.";
    clearProductForm(); openModal("productModal"); setTimeout(function () { $("p_sku").focus(); }, 50);
  }
  function openEdit(sku) {
    var it = items.filter(function (x) { return x.sku === sku; })[0];
    if (!it) { setStatus("Product not found: " + sku, "err"); return; }
    editMode = true; $("productTitle").textContent = "Edit product";
    $("productHint").textContent = "Wholesale price is what you enter. $/lb = price \\u00f7 weight.";
    $("p_originalSku").value = it.sku; $("p_sku").value = it.sku || ""; $("p_name").value = it.name || "";
    fillCats($("p_category"), it.category || (categories[0] || "Hardscape"));
    $("p_lane").value = it.lane === "external" ? "external" : "direct";
    $("p_price").value = it.price != null ? Number(it.price) : 0;
    $("p_qty").value = it.qty != null ? Number(it.qty) : 0;
    $("p_reserved").value = it.reserved != null ? Number(it.reserved) : 0;
    $("p_status").value = it.status || "active"; $("p_location").value = it.location || "";
    $("p_description").value = it.description || "";
    if ($("p_listed")) $("p_listed").checked = isListed(it);
    if ($("p_dealerPrice")) $("p_dealerPrice").value = it.dealerPrice != null ? Number(it.dealerPrice) : "";
    if ($("p_weightLb")) $("p_weightLb").value = it.weightLb != null ? Number(it.weightLb) : "";
    if ($("p_photoFile")) $("p_photoFile").value = "";
    setPhotoPreview(itemImage(it));
    updatePerLb();
    openModal("productModal"); setTimeout(function () { $("p_name").focus(); }, 50);
  }
  function saveProduct() {
    var img = $("p_image") ? $("p_image").value.trim() : "";
    var dealerPrice = ($("p_dealerPrice") && $("p_dealerPrice").value !== "") ? Number($("p_dealerPrice").value) : null;
    var weightLb = ($("p_weightLb") && $("p_weightLb").value !== "") ? Number($("p_weightLb").value) : null;
    var body = {
      store: store, originalSku: $("p_originalSku").value.trim() || undefined,
      sku: $("p_sku").value.trim(), name: $("p_name").value.trim(),
      category: $("p_category").value, lane: $("p_lane").value,
      price: Number($("p_price").value) || 0, qty: Number($("p_qty").value) || 0,
      reserved: Number($("p_reserved").value) || 0, status: $("p_status").value,
      location: $("p_location").value.trim(), description: $("p_description").value,
      listed: $("p_listed") ? !!$("p_listed").checked : true,
      dealerPrice: dealerPrice, weightLb: weightLb, pricePerLb: pricePerLb(dealerPrice, weightLb),
      image: img, images: img ? [img] : []
    };
    if (weightLb != null && weightLb >= 50) {
      body.pool = body.listed ? "both" : "wholesale";
      body.dealerEligible = true;
    } else if (dealerPrice != null && dealerPrice > 0 && weightLb != null && weightLb > 0) {
      body.pool = body.listed ? "both" : "wholesale";
      body.dealerEligible = true;
    } else {
      body.pool = "retail"; body.dealerEligible = false;
    }
    if (!body.sku || !body.name) { setStatus("SKU and Name are required.", "err"); return; }
    if (body.dealerEligible && !(body.dealerPrice > 0)) {
      setStatus("Enter the wholesale price you charge — no auto discount is applied.", "err"); return;
    }
    if (body.dealerEligible && !(body.weightLb > 0)) {
      setStatus("Enter weight in pounds so $/lb can be calculated.", "err"); return;
    }
    setStatus("Saving " + body.sku + "\u2026");
    api("/api/inventory/item", { method: "POST", body: body }).then(function () {
      closeModal("productModal");
      var extra = body.pricePerLb != null ? (" \u00b7 $" + Number(body.pricePerLb).toFixed(2) + "/lb") : "";
      setStatus((editMode ? "Updated " : "Added ") + body.sku + extra, "ok");
      return load();
    }).catch(function (e) { setStatus(e.message, "err"); });
  }
  function setListed(sku, listed) {
    var it = items.filter(function (x) { return x.sku === sku; })[0];
    if (!it) return;
    api("/api/inventory/item", {
      method: "POST",
      body: {
        store: store, originalSku: sku, sku: sku, name: it.name, category: it.category,
        lane: it.lane, price: it.price, qty: it.qty, reserved: it.reserved, status: it.status,
        location: it.location, description: it.description, listed: listed,
        dealerPrice: it.dealerPrice, weightLb: it.weightLb, pricePerLb: it.pricePerLb,
        pool: it.pool, dealerEligible: it.dealerEligible,
        image: itemImage(it), images: it.images || (itemImage(it) ? [itemImage(it)] : [])
      }
    }).then(function () {
      setStatus(sku + (listed ? " shown on sales page" : " hidden from sales page"), "ok");
      return load();
    }).catch(function (e) { setStatus(e.message, "err"); });
  }
  function saveOrder() {
    var skus = Array.prototype.map.call($("tbody").querySelectorAll("tr[data-sku]"), function (r) {
      return r.getAttribute("data-sku");
    });
    if (!skus.length) return;
    api("/api/inventory/sort", { method: "POST", body: { store: store, skus: skus } })
      .then(function () { setStatus("Catalog order saved", "ok"); })
      .catch(function (e) { setStatus("Order save failed: " + e.message, "err"); });
  }
  function wireDrag(tb) {
    Array.prototype.forEach.call(tb.querySelectorAll("tr[data-sku]"), function (tr) {
      tr.draggable = true;
      tr.ondragstart = function (e) {
        if (e.target && e.target.closest && e.target.closest("button,a,input,select")) { e.preventDefault(); return false; }
        dragSku = tr.getAttribute("data-sku");
        tr.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", dragSku); } catch (err) {}
      };
      tr.ondragend = function () {
        tr.classList.remove("dragging");
        Array.prototype.forEach.call(tb.querySelectorAll(".drag-over"), function (r) { r.classList.remove("drag-over"); });
        dragSku = null;
      };
      tr.ondragover = function (e) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; tr.classList.add("drag-over"); };
      tr.ondragleave = function () { tr.classList.remove("drag-over"); };
      tr.ondrop = function (e) {
        e.preventDefault(); tr.classList.remove("drag-over");
        var from = dragSku;
        try { from = e.dataTransfer.getData("text/plain") || from; } catch (err) {}
        var to = tr.getAttribute("data-sku");
        if (!from || from === to) return;
        var fromTr = tb.querySelector('tr[data-sku="' + from.replace(/\"/g, "") + '"]');
        if (!fromTr) return;
        var rect = tr.getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) tb.insertBefore(fromTr, tr);
        else tb.insertBefore(fromTr, tr.nextSibling);
        saveOrder();
      };
    });
  }
  function updateQtyCell(tr, qty) {
    var strong = tr.querySelector("td strong");
    if (strong) strong.textContent = String(qty);
  }
  function adjustQty(sku, delta, tr) {
    var it = items.filter(function (x) { return x.sku === sku; })[0];
    var prev = it ? (Number(it.qty) || 0) : 0;
    var next = Math.max(0, prev + delta);
    if (it) it.qty = next;
    if (tr) updateQtyCell(tr, next);
    api("/api/inventory/adjust", { method: "POST", body: { store: store, sku: sku, delta: delta } })
      .then(function (r) {
        var q = r.item && r.item.qty != null ? r.item.qty : next;
        if (it) it.qty = q;
        if (tr) updateQtyCell(tr, q);
        setStatus(sku + " qty \u2192 " + q, "ok");
      })
      .catch(function (e) {
        if (it) it.qty = prev;
        if (tr) updateQtyCell(tr, prev);
        setStatus(e.message, "err");
      });
  }
  function renderTable() {
    var tb = $("tbody");
    var list = items.filter(function (it) {
      if (filterCat && String(it.category || "") !== filterCat) return false;
      if (!inView(it)) return false;
      return true;
    });
    var cols = wholesaleMode ? 10 : 7;
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="' + cols + '" style="color:#a1a1aa">' +
        (wholesaleMode ? "No wholesale SKUs yet. Add weight + wholesale price on a product." : "No products in this view.") +
        "</td></tr>";
      return;
    }
    var html = "";
    list.forEach(function (it) {
      var listed = isListed(it);
      var wh = (itemPool(it) === "wholesale" || itemPool(it) === "both") ? '<span class="ds-badge" style="background:#78350f;color:#fbbf24">WHOLESALE</span>' : "";
      var hid = listed ? "" : '<span class="hid-badge">HIDDEN</span>';
      var img = itemImage(it);
      var thumb = img ? '<img class="thumb" src="' + esc(img) + '" alt="">' : "";
      var saleBtn = listed
        ? '<button type="button" class="hide-btn" data-act="hide">Hide from site</button>'
        : '<button type="button" class="show-btn" data-act="show">Show on site</button>';
      var retail = (Number(it.price) || 0).toFixed(2);
      var dealer = it.dealerPrice != null && !isNaN(Number(it.dealerPrice)) ? Number(it.dealerPrice) : null;
      var lbNum = it.weightLb != null ? Number(it.weightLb) : null;
      var lb = lbNum != null && !isNaN(lbNum) ? String(lbNum) : "\u2014";
      var per = pricePerLb(dealer, lbNum);
      html += '<tr data-sku="' + esc(it.sku) + '">' +
        '<td><span class="grip" title="Drag to reorder">\u22ee\u22ee</span></td>' +
        '<td>' + thumb + '<div style="display:inline-block;vertical-align:middle"><div class="sku">' + esc(it.sku) + '</div><strong>' + esc(it.name) + "</strong>" + wh + hid + "</div></td>" +
        "<td>" + esc(it.category || "") + "</td>" +
        "<td>$" + retail + "</td>" +
        (wholesaleMode
          ? ('<td class="wh-only">' + (dealer != null ? ("$" + dealer.toFixed(2)) : "\u2014") + '</td>' +
             '<td class="wh-only">' + esc(lb) + '</td>' +
             '<td class="wh-only">' + (per != null ? ("$" + per.toFixed(2)) : "\u2014") + '</td>')
          : "") +
        '<td><button type="button" class="ghost" data-act="minus">\u2212</button> <strong>' + (it.qty || 0) + '</strong> <button type="button" class="ghost" data-act="plus">+</button></td>' +
        "<td>" + saleBtn + "</td>" +
        '<td><button type="button" class="secondary" data-act="edit">Edit</button> <button type="button" class="del" data-act="del">Delete</button></td></tr>';
    });
    tb.innerHTML = html;
    tb.querySelectorAll("[data-act]").forEach(function (btn) {
      btn.onclick = function () {
        var act = btn.getAttribute("data-act"); var tr = btn.closest("tr"); var sku = tr.getAttribute("data-sku");
        if (act === "plus" || act === "minus") { adjustQty(sku, act === "plus" ? 1 : -1, tr); return; }
        if (act === "hide") { setListed(sku, false); return; }
        if (act === "show") { setListed(sku, true); return; }
        if (act === "del") {
          openConfirm("Delete product?", "Delete " + sku + "?", "Delete", true, function () {
            api("/api/inventory/remove", { method: "POST", body: { store: store, sku: sku } }).then(load).catch(function (e) { setStatus(e.message, "err"); });
          }); return;
        }
        if (act === "edit") openEdit(sku);
      };
    });
    wireDrag(tb);
  }
  function load() {
    setStatus("Loading inventory for store: " + store + " \u2026");
    if ($("meta")) $("meta").textContent = "Loading\u2026";
    return api("/api/inventory?store=" + encodeURIComponent(store)).then(function (d) {
      items = Array.isArray(d.items) ? d.items : [];
      categories = Array.isArray(d.categories) ? d.categories : [];
      if (!categories.length && items.length) {
        var seen = {}; items.forEach(function (it) { var c = it.category || ""; if (c && !seen[c]) { seen[c] = 1; categories.push(c); } });
      }
      publicFeed = !!d.publicFeed; renderTabs(d.stores); renderChips(); renderTable(); updateSlogan();
      if ($("btnFeed")) $("btnFeed").textContent = "DON'T TOUCH \u00b7 Public feed " + (publicFeed ? "ON" : "OFF");
      if ($("meta")) $("meta").textContent = (d.storeName || store) + " \u00b7 " + items.length + " items \u00b7 feed " + (publicFeed ? "ON" : "OFF");
      setStatus("Loaded " + items.length + " products", "ok");
    }).catch(function (e) {
      setStatus("Load failed: " + e.message, "err");
      if ($("meta")) $("meta").textContent = "Load failed";
      $("tbody").innerHTML = '<tr><td colspan="7" style="color:#fecaca">Could not load inventory.</td></tr>';
    });
  }
  function setInventoryView(view) {
    inventoryView = view;
    wholesaleMode = (view === "wholesale");
    document.body.classList.toggle("wholesale-mode", view === "wholesale");
    if ($("btnWholesale")) {
      $("btnWholesale").classList.toggle("active", view === "wholesale");
    }
    if ($("viewHint")) {
      $("viewHint").textContent = view === "wholesale"
        ? "Wholesale \u00b7 price you enter \u00b7 $/lb calculated"
        : "Sales inventory";
      $("viewHint").style.color = view === "wholesale" ? "#fbbf24" : "";
    }
    filterCat = ""; renderChips(); renderTable();
  }
  if ($("confirmNo")) $("confirmNo").onclick = function () { closeModal("confirmModal"); pending = null; };
  if ($("confirmYes")) $("confirmYes").onclick = function () { var fn = pending; closeModal("confirmModal"); pending = null; if (fn) fn(); };
  if ($("confirmModal")) $("confirmModal").onclick = function (e) { if (e.target === $("confirmModal")) { closeModal("confirmModal"); pending = null; } };
  if ($("btnReload")) $("btnReload").onclick = function () { load(); };
  if ($("btnWholesale")) $("btnWholesale").onclick = function () {
    setInventoryView(wholesaleMode ? "main" : "wholesale");
  };
  if ($("btnFeed")) $("btnFeed").onclick = function () {
    var next = !publicFeed;
    openConfirm(next ? "Go LIVE?" : "Turn feed OFF?", next ? "Site goes LIVE." : "Shut public feed?", next ? "Go LIVE" : "Turn OFF", !next, function () {
      api("/api/admin/public-feed", { method: "POST", body: { store: store, enabled: next } }).then(load).catch(function (e) { setStatus(e.message, "err"); });
    });
  };
  if ($("btnCat")) $("btnCat").onclick = function () { $("cat_name").value = ""; openModal("catModal"); };
  if ($("cat_cancel")) $("cat_cancel").onclick = function () { closeModal("catModal"); };
  if ($("cat_save")) $("cat_save").onclick = function () {
    var name = $("cat_name").value.trim();
    if (!name) { setStatus("Category name required", "err"); return; }
    api("/api/inventory/category", { method: "POST", body: { store: store, name: name } }).then(function () { closeModal("catModal"); return load(); }).catch(function (e) { setStatus(e.message, "err"); });
  };
  if ($("btnAdd")) $("btnAdd").onclick = openAdd;
  if ($("p_cancel")) $("p_cancel").onclick = function () { closeModal("productModal"); };
  if ($("p_save")) $("p_save").onclick = saveProduct;
  if ($("p_dealerPrice")) $("p_dealerPrice").oninput = updatePerLb;
  if ($("p_weightLb")) $("p_weightLb").oninput = updatePerLb;
  if ($("productModal")) $("productModal").onclick = function (e) { if (e.target === $("productModal")) closeModal("productModal"); };
  if ($("catModal")) $("catModal").onclick = function (e) { if (e.target === $("catModal")) closeModal("catModal"); };
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeModal("productModal"); closeModal("catModal"); closeModal("confirmModal"); pending = null; }
  });
  load();
})();
