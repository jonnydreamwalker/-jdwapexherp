(function () {
  var store = "herp";
  var items = [];
  var categories = [];
  var filterCat = "";
  var publicFeed = false;
  var pending = null;
  var editMode = false;
  var dragSku = null;
  function $(id) { return document.getElementById(id); }
  function setStatus(msg, kind) {
    var el = $("status");
    el.textContent = msg;
    el.className = kind === "err" ? "err" : (kind === "ok" ? "ok" : "");
    el.id = "status";
  }
  function esc(s) {
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(s == null ? "" : String(s)));
    return d.innerHTML.replace(/"/g, "&#34;");
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
    $("p_image").value = src || "";
    if (src) {
      img.src = src;
      img.style.display = "block";
      ph.style.display = "none";
    } else {
      img.removeAttribute("src");
      img.style.display = "none";
      ph.style.display = "block";
    }
  }
  function api(url, opts) {
    opts = opts || {};
    opts.credentials = "same-origin";
    opts.headers = opts.headers || {};
    if (opts.body && typeof opts.body === "object") {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(url, opts).then(function (r) {
      if (r.status === 401) { location.href = "/login"; throw new Error("401"); }
      return r.text().then(function (txt) {
        var j = null;
        try { j = txt ? JSON.parse(txt) : {}; } catch (e) { throw new Error("Bad JSON"); }
        if (!r.ok) throw new Error((j && j.error) || ("HTTP " + r.status));
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
    pending = fn;
    openModal("confirmModal");
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
    var el = $("slogan");
    if (publicFeed) { el.textContent = "jdwapexherp.com feed is LIVE for this store."; el.className = "slogan live"; }
    else { el.textContent = "Flip the switch."; el.className = "slogan"; }
  }
  function renderTabs(stores) {
    var el = $("storeTabs"); el.innerHTML = "";
    var list = stores || [{ id: "herp", name: "Apex Herp", count: items.length }, { id: "k9", name: "Apex K9", count: 0 }, { id: "feline", name: "Apex Feline", count: 0 }];
    list.forEach(function (s) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "tab" + (s.id === store ? " active" : "");
      b.textContent = (s.name || s.id) + " (" + (s.count != null ? s.count : 0) + ")";
      b.onclick = function () { store = s.id; filterCat = ""; load(); };
      el.appendChild(b);
    });
  }
  function renderChips() {
    var el = $("catChips"); el.innerHTML = "";
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
    $("p_listed").checked = true;
    $("p_dropShip").checked = false; $("p_supplier").value = ""; $("p_shippingTerms").value = "";
    $("p_photoFile").value = "";
    setPhotoPreview("");
    fillCats($("p_category"), categories[0] || "Hardscape");
  }
  function openAdd() {
    editMode = false; $("productTitle").textContent = "Add product";
    $("productHint").textContent = "Create a full product record. Use Browse to attach a photo from your computer.";
    clearProductForm(); openModal("productModal"); setTimeout(function () { $("p_sku").focus(); }, 50);
  }
  function openEdit(sku) {
    var it = items.filter(function (x) { return x.sku === sku; })[0];
    if (!it) { setStatus("Product not found: " + sku, "err"); return; }
    editMode = true; $("productTitle").textContent = "Edit product"; $("productHint").textContent = "Update any field. Browse to replace the photo.";
    $("p_originalSku").value = it.sku; $("p_sku").value = it.sku || ""; $("p_name").value = it.name || "";
    fillCats($("p_category"), it.category || (categories[0] || "Hardscape"));
    $("p_lane").value = it.lane === "external" ? "external" : "direct";
    $("p_price").value = it.price != null ? Number(it.price) : 0;
    $("p_qty").value = it.qty != null ? Number(it.qty) : 0;
    $("p_reserved").value = it.reserved != null ? Number(it.reserved) : 0;
    $("p_status").value = it.status || "active"; $("p_location").value = it.location || "";
    $("p_description").value = it.description || "";
    $("p_listed").checked = isListed(it);
    var ds = !!(it.dropShip || it.lane === "external");
    $("p_dropShip").checked = ds; $("p_supplier").value = it.supplier || ""; $("p_shippingTerms").value = it.shippingTerms || "";
    $("p_photoFile").value = "";
    setPhotoPreview(itemImage(it));
    openModal("productModal"); setTimeout(function () { $("p_name").focus(); }, 50);
  }
  function saveProduct() {
    var img = $("p_image").value.trim();
    var body = {
      store: store, originalSku: $("p_originalSku").value.trim() || undefined,
      sku: $("p_sku").value.trim(), name: $("p_name").value.trim(),
      category: $("p_category").value, lane: $("p_lane").value,
      price: Number($("p_price").value) || 0, qty: Number($("p_qty").value) || 0,
      reserved: Number($("p_reserved").value) || 0, status: $("p_status").value,
      location: $("p_location").value.trim(), description: $("p_description").value,
      listed: !!$("p_listed").checked,
      dropShip: !!$("p_dropShip").checked, supplier: $("p_supplier").value.trim(),
      shippingTerms: $("p_shippingTerms").value.trim(),
      image: img,
      images: img ? [img] : []
    };
    if (body.dropShip) body.lane = "external";
    if (!body.sku || !body.name) { setStatus("SKU and Name are required.", "err"); return; }
    api("/api/inventory/item", { method: "POST", body: body }).then(function () {
      closeModal("productModal"); setStatus((editMode ? "Updated " : "Added ") + body.sku, "ok"); return load();
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
        dropShip: !!it.dropShip, supplier: it.supplier || "", shippingTerms: it.shippingTerms || "",
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
      .then(function () {
        setStatus("Catalog order saved — Apex Herp will match this list", "ok");
        return load();
      })
      .catch(function (e) { setStatus("Order save failed: " + e.message, "err"); });
  }
  function wireDrag(tb) {
    Array.prototype.forEach.call(tb.querySelectorAll("tr[data-sku]"), function (tr) {
      tr.draggable = true;
      tr.ondragstart = function (e) {
        if (e.target && e.target.closest && e.target.closest("button,a,input,select")) {
          e.preventDefault();
          return false;
        }
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
      tr.ondragover = function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        tr.classList.add("drag-over");
      };
      tr.ondragleave = function () { tr.classList.remove("drag-over"); };
      tr.ondrop = function (e) {
        e.preventDefault();
        tr.classList.remove("drag-over");
        var from = dragSku;
        try { from = e.dataTransfer.getData("text/plain") || from; } catch (err) {}
        var to = tr.getAttribute("data-sku");
        if (!from || from === to) return;
        var fromTr = tb.querySelector('tr[data-sku="' + from.replace(/"/g, "") + '"]');
        if (!fromTr) return;
        var rect = tr.getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) tb.insertBefore(fromTr, tr);
        else tb.insertBefore(fromTr, tr.nextSibling);
        saveOrder();
      };
    });
  }
  function renderTable() {
    var tb = $("tbody");
    var list = items.filter(function (it) { return !filterCat || String(it.category || "") === filterCat; });
    if (!list.length) { tb.innerHTML = '<tr><td colspan="7" style="color:#a1a1aa">No products in this view.</td></tr>'; return; }
    var html = "";
    list.forEach(function (it) {
      var listed = isListed(it);
      var ds = (it.dropShip || it.lane === "external") ? '<span class="ds-badge">DROP SHIP</span>' : "";
      var hid = listed ? "" : '<span class="hid-badge">HIDDEN</span>';
      var img = itemImage(it);
      var thumb = img ? '<img class="thumb" src="' + esc(img) + '" alt="">' : "";
      var saleBtn = listed
        ? '<button type="button" class="hide-btn" data-act="hide">Hide from site</button>'
        : '<button type="button" class="show-btn" data-act="show">Show on site</button>';
      html += '<tr data-sku="' + esc(it.sku) + '" class="' + (listed ? "" : "row-hidden") + '">' +
        '<td><span class="grip" title="Drag to reorder">⋮⋮</span></td>' +
        '<td>' + thumb + '<div style="display:inline-block;vertical-align:middle"><div class="sku">' + esc(it.sku) + '</div><strong>' + esc(it.name) + "</strong>" + ds + hid + "</div></td>" +
        "<td>" + esc(it.category || "") + "</td>" +
        "<td>$" + (Number(it.price) || 0).toFixed(2) + "</td>" +
        '<td><button type="button" class="ghost" data-act="minus">−</button> <strong>' + (it.qty || 0) + '</strong> <button type="button" class="ghost" data-act="plus">+</button></td>' +
        "<td>" + saleBtn + "</td>" +
        '<td><button type="button" class="secondary" data-act="edit">Edit</button> <button type="button" class="del" data-act="del">Delete</button></td></tr>';
    });
    tb.innerHTML = html;
    tb.querySelectorAll("[data-act]").forEach(function (btn) {
      btn.onclick = function () {
        var act = btn.getAttribute("data-act"); var tr = btn.closest("tr"); var sku = tr.getAttribute("data-sku");
        if (act === "plus" || act === "minus") {
          api("/api/inventory/adjust", { method: "POST", body: { store: store, sku: sku, delta: act === "plus" ? 1 : -1 } }).then(load).catch(function (e) { setStatus(e.message, "err"); }); return;
        }
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
    setStatus("Loading inventory for store: " + store + " …"); $("meta").textContent = "Loading…";
    return api("/api/inventory?store=" + encodeURIComponent(store)).then(function (d) {
      items = Array.isArray(d.items) ? d.items : [];
      categories = Array.isArray(d.categories) ? d.categories : [];
      if (!categories.length && items.length) {
        var seen = {}; items.forEach(function (it) { var c = it.category || ""; if (c && !seen[c]) { seen[c] = 1; categories.push(c); } });
      }
      publicFeed = !!d.publicFeed; renderTabs(d.stores); renderChips(); renderTable(); updateSlogan();
      $("btnFeed").textContent = "DON'T TOUCH · Public feed " + (publicFeed ? "ON" : "OFF");
      $("meta").textContent = (d.storeName || store) + " · " + items.length + " items · feed " + (publicFeed ? "ON" : "OFF");
      setStatus("Loaded " + items.length + " products · store " + store + " · feed " + (publicFeed ? "ON" : "OFF") + " · drag ⋮⋮ to reorder", "ok");
    }).catch(function (e) {
      setStatus("Load failed: " + e.message, "err"); $("meta").textContent = "Load failed";
      $("tbody").innerHTML = '<tr><td colspan="7" style="color:#fecaca">Could not load inventory.</td></tr>';
    });
  }
  $("confirmNo").onclick = function () { closeModal("confirmModal"); pending = null; };
  $("confirmYes").onclick = function () { var fn = pending; closeModal("confirmModal"); pending = null; if (fn) fn(); };
  $("confirmModal").onclick = function (e) { if (e.target === $("confirmModal")) { closeModal("confirmModal"); pending = null; } };
  $("btnReload").onclick = function () { load(); };
  $("btnFeed").onclick = function () {
    var next = !publicFeed;
    openConfirm(next ? "Go LIVE?" : "Turn feed OFF?", next ? "jdwapexherp.com will go LIVE with this store's inventory." : "Shut public feed for this store?", next ? "Go LIVE" : "Turn OFF", !next, function () {
      api("/api/admin/public-feed", { method: "POST", body: { store: store, enabled: next } }).then(load).catch(function (e) { setStatus(e.message, "err"); });
    });
  };
  $("btnCat").onclick = function () { $("cat_name").value = ""; openModal("catModal"); };
  $("cat_cancel").onclick = function () { closeModal("catModal"); };
  $("cat_save").onclick = function () {
    var name = $("cat_name").value.trim();
    if (!name) { setStatus("Category name required", "err"); return; }
    api("/api/inventory/category", { method: "POST", body: { store: store, name: name } }).then(function () { closeModal("catModal"); return load(); }).catch(function (e) { setStatus(e.message, "err"); });
  };
  $("btnAdd").onclick = openAdd;
  $("p_cancel").onclick = function () { closeModal("productModal"); };
  $("p_save").onclick = saveProduct;
  $("p_browse").onclick = function () { $("p_photoFile").click(); };
  $("p_clearPhoto").onclick = function () { $("p_photoFile").value = ""; setPhotoPreview(""); };
  $("p_photoFile").onchange = function () {
    var f = this.files && this.files[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { setStatus("Photo too large (max 8 MB). Compress and try again.", "err"); this.value = ""; return; }
    var reader = new FileReader();
    reader.onload = function () { setPhotoPreview(String(reader.result || "")); };
    reader.onerror = function () { setStatus("Could not read that file.", "err"); };
    reader.readAsDataURL(f);
  };
  $("productModal").onclick = function (e) { if (e.target === $("productModal")) closeModal("productModal"); };
  $("catModal").onclick = function (e) { if (e.target === $("catModal")) closeModal("catModal"); };
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeModal("productModal"); closeModal("catModal"); closeModal("confirmModal"); pending = null; }
  });
  load();
})();
