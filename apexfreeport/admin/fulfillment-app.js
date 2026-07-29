(function () {
  var orders = [], filter = "open", current = null;
  function $(id) { return document.getElementById(id); }
  function esc(s) { var d = document.createElement("div"); d.appendChild(document.createTextNode(s == null ? "" : String(s))); return d.innerHTML; }
  function api(url, opts) {
    opts = opts || {}; opts.credentials = "same-origin"; opts.headers = opts.headers || {};
    if (opts.body && typeof opts.body === "object") { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(opts.body); }
    return fetch(url, opts).then(function (r) {
      if (r.status === 401) { location.href = "/login"; throw new Error("401"); }
      var ct = r.headers.get("content-type") || "";
      if (ct.indexOf("json") >= 0) {
        return r.json().then(function (j) { if (!r.ok) throw new Error((j && j.error) || ("HTTP " + r.status)); return j; });
      }
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    });
  }
  function setStatus(msg, err) { var el = $("status"); el.textContent = msg; el.className = err ? "err" : ""; }
  function openPanel() { $("panelBack").classList.add("open"); }
  function closePanel() { $("panelBack").classList.remove("open"); current = null; }
  function serviceLabel(o) {
    var map = { ground: "Ground", priority: "USPS Priority", next_day: "Next Day Air", express: "Express" };
    return o.serviceLabel || map[o.service] || o.service || "ship";
  }
  function renderQueue() {
    var list = orders.filter(function (o) {
      if (filter === "open") return o.status === "open" || o.status === "paid" || o.status === "packing";
      if (filter === "shipped") return o.status === "shipped";
      if (filter === "fulfilled") return o.status === "fulfilled";
      return true;
    });
    var q = $("queue");
    if (!list.length) { q.innerHTML = '<p class="sub">No orders in this view.</p>'; return; }
    q.innerHTML = list.map(function (o) {
      var done = o.status === "fulfilled";
      var shipped = o.status === "shipped";
      var ds = o.hasDropShip;
      var trk = o.shipping && o.shipping.tracking ? o.shipping.tracking : "";
      return '<button type="button" class="order-btn' + (done ? " done" : "") + (shipped ? " shipped" : "") + (ds ? " drop" : "") + '" data-id="' + esc(o.id) + '">' +
        '<span class="check">' + (done ? "\u2713" : shipped ? "\u2192" : "") + '</span><span class="ob-main"><div class="ob-id">' + esc(o.id) +
        (ds ? ' <span class="badge ds">Drop ship</span>' : '') +
        (shipped ? ' <span class="badge shipped">Shipped</span>' : '') + '</div><div class="ob-name">' +
        esc((o.shipTo && o.shipTo.name) || "\u2014") + '</div>' +
        (trk ? '<div class="ob-meta">Tracking ' + esc(trk) + '</div>' : '') +
        '</span><span class="badge ' + esc(o.service || "") + '">' +
        esc(serviceLabel(o)) + '</span></button>';
    }).join("");
    q.querySelectorAll(".order-btn").forEach(function (btn) {
      btn.onclick = function () { openOrder(btn.getAttribute("data-id")); };
    });
  }
  function renderShipInfo(o) {
    var s = o.shipping;
    if (!s || !s.tracking) {
      return '<p class="sub">Not shipped yet. After Pirate Ship, click <strong>Mark shipped</strong> and paste tracking + insurance.</p>';
    }
    var url = s.trackingUrl || "#";
    var ins = Number(s.insuranceAmount) || 0;
    return '<div class="ship-box">' +
      '<div class="sub">Carrier</div><div style="font-weight:700">' + esc(s.carrier || "\u2014") + '</div>' +
      '<div class="sub" style="margin-top:8px">Tracking</div><div class="trk">' + esc(s.tracking) + '</div>' +
      (url && url !== "#" ? '<div style="margin-top:6px"><a href="' + esc(url) + '" target="_blank" rel="noopener">Track package \u2192</a></div>' : "") +
      '<div class="ins"><strong>Insurance:</strong> ' +
      (ins > 0 ? ("$" + ins.toFixed(2) + " \u00b7 " + esc(s.insuranceProvider || "Carrier")) : "None recorded") +
      (s.insuranceNotes ? (" \u00b7 " + esc(s.insuranceNotes)) : "") +
      "</div>" +
      (s.shippedAt ? '<div class="sub" style="margin-top:8px">Shipped ' + esc(String(s.shippedAt).replace("T", " ").slice(0, 16)) + " UTC</div>" : "") +
      (s.labelCost != null ? '<div class="sub">Label cost $' + Number(s.labelCost).toFixed(2) + "</div>" : "") +
      "</div>";
  }
  function openOrder(id) {
    var o = orders.filter(function (x) { return x.id === id; })[0];
    if (!o) return;
    current = o;
    var done = o.status === "fulfilled";
    var shipped = o.status === "shipped";
    $("pTitle").textContent = o.id;
    $("pSub").textContent = serviceLabel(o) + " \u00b7 " + String(o.status || "open").toUpperCase();
    $("pDropAlert").innerHTML = o.hasDropShip ? '<div class="alert"><strong>DROP SHIP</strong> \u2014 order supplier lines separately.</div>' : "";
    var st = o.shipTo || {};
    $("pShip").innerHTML = esc(st.name || "") + "<br>" + esc(st.line1 || "") +
      (st.line2 ? "<br>" + esc(st.line2) : "") +
      "<br>" + esc(st.city || "") + ", " + esc(st.state || "") + " " + esc(st.zip || "");
    $("pItems").innerHTML = (o.items || []).map(function (it) {
      return '<div class="item' + (it.dropShip ? " ds" : "") + '"><span>' + esc(it.name) +
        ' <span class="ob-id">' + esc(it.sku) + "</span></span><strong>\u00d7" + esc(it.qty) + "</strong></div>";
    }).join("") || "<p class='sub'>No items</p>";
    $("pBoxes").innerHTML = (o.boxes || []).map(function (b, i) {
      return '<div class="box"><div class="size">Box ' + (i + 1) + ": " + esc(b.size || "") + "</div></div>";
    }).join("") || "<p class='sub'>No box plan</p>";
    $("pHandling").innerHTML = (o.handling || []).map(function (h) {
      return '<span class="tag">' + esc(h) + "</span>";
    }).join("") || '<span class="sub">None</span>';
    $("pShipInfo").innerHTML = renderShipInfo(o);
    $("pNotes").innerHTML = (o.notes || []).map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") || "<li class='sub'>No notes</li>";
    var acts = "";
    if (!done) {
      acts += '<button type="button" class="print" id="btnPrint">Print pack slip</button>';
      if (!shipped) acts += '<button type="button" class="ship" id="btnShip">Mark shipped</button>';
      acts += '<button type="button" class="done" id="btnComplete">Mark complete</button>';
      if (shipped) acts += '<button type="button" class="secondary" id="btnUnship">Back to open</button>';
    } else {
      acts += '<button type="button" class="secondary" id="btnReopen">Reopen</button>';
    }
    acts += '<button type="button" class="ghost" id="btnClose2">Close</button>';
    $("pActions").innerHTML = acts;
    var pr = $("btnPrint"); if (pr) pr.onclick = function () { window.open("/api/fulfillment/orders/" + encodeURIComponent(o.id) + "/label", "_blank"); };
    var sh = $("btnShip"); if (sh) sh.onclick = function () { openShipModal(); };
    var cm = $("btnComplete"); if (cm) cm.onclick = function () {
      api("/api/fulfillment/orders/" + encodeURIComponent(o.id) + "/complete", { method: "POST", body: {} }).then(function () { closePanel(); return load(); });
    };
    var us = $("btnUnship"); if (us) us.onclick = function () {
      api("/api/fulfillment/orders/" + encodeURIComponent(o.id) + "/unship", { method: "POST", body: {} }).then(function () { return load().then(function () { openOrder(o.id); }); });
    };
    var ro = $("btnReopen"); if (ro) ro.onclick = function () {
      api("/api/fulfillment/orders/" + encodeURIComponent(o.id) + "/reopen", { method: "POST", body: {} }).then(load);
    };
    var c2 = $("btnClose2"); if (c2) c2.onclick = closePanel;
    openPanel();
  }
  function openShipModal() {
    if (!current) return;
    $("s_tracking").value = (current.shipping && current.shipping.tracking) || "";
    $("s_carrier").value = (current.shipping && current.shipping.carrier) || "USPS";
    $("s_insAmt").value = (current.shipping && current.shipping.insuranceAmount) || "";
    $("s_insProv").value = (current.shipping && current.shipping.insuranceProvider) || "";
    $("s_insNotes").value = (current.shipping && current.shipping.insuranceNotes) || "";
    $("s_labelCost").value = (current.shipping && current.shipping.labelCost != null) ? current.shipping.labelCost : "";
    $("shipBack").classList.add("open");
  }
  function closeShipModal() { $("shipBack").classList.remove("open"); }
  function load() {
    setStatus("Loading queue\u2026");
    return api("/api/fulfillment/orders").then(function (d) {
      orders = d.orders || [];
      var openN = orders.filter(function (o) { return o.status === "open" || o.status === "paid" || o.status === "packing"; }).length;
      var shipN = orders.filter(function (o) { return o.status === "shipped"; }).length;
      $("meta").textContent = openN + " open \u00b7 " + shipN + " shipped \u00b7 " + orders.length + " total";
      setStatus("Queue ready \u2014 " + openN + " open, " + shipN + " shipped.");
      renderQueue();
    }).catch(function (e) { setStatus("Load failed: " + e.message, true); });
  }
  document.querySelectorAll(".chip").forEach(function (c) {
    c.onclick = function () {
      document.querySelectorAll(".chip").forEach(function (x) { x.classList.remove("active"); x.classList.remove("shipped"); });
      c.classList.add("active");
      if (c.getAttribute("data-f") === "shipped") c.classList.add("shipped");
      filter = c.getAttribute("data-f");
      renderQueue();
    };
  });
  $("btnReload").onclick = load;
  $("btnClose").onclick = closePanel;
  $("panelBack").onclick = function (e) { if (e.target === $("panelBack")) closePanel(); };
  $("shipBack").onclick = function (e) { if (e.target === $("shipBack")) closeShipModal(); };
  $("s_cancel").onclick = closeShipModal;
  $("s_save").onclick = function () {
    if (!current) return;
    var tracking = $("s_tracking").value.trim();
    if (!tracking) { alert("Tracking number required"); return; }
    api("/api/fulfillment/orders/" + encodeURIComponent(current.id) + "/ship", {
      method: "POST",
      body: {
        carrier: $("s_carrier").value,
        tracking: tracking,
        insuranceAmount: $("s_insAmt").value,
        insuranceProvider: $("s_insProv").value,
        insuranceNotes: $("s_insNotes").value,
        labelCost: $("s_labelCost").value
      }
    }).then(function () {
      closeShipModal();
      return load().then(function () { openOrder(current.id); });
    }).catch(function (e) { alert(e.message); });
  };
  $("btnAddNote").onclick = function () {
    if (!current) return;
    var t = $("pNoteIn").value.trim(); if (!t) return;
    api("/api/fulfillment/orders/" + encodeURIComponent(current.id) + "/note", { method: "POST", body: { note: t } })
      .then(function () { $("pNoteIn").value = ""; return load().then(function () { openOrder(current.id); }); });
  };
  $("btnNew").onclick = function () { $("newBack").classList.add("open"); };
  $("n_cancel").onclick = function () { $("newBack").classList.remove("open"); };
  $("newBack").onclick = function (e) { if (e.target === $("newBack")) $("newBack").classList.remove("open"); };
  $("n_save").onclick = function () {
    var name = $("n_name").value.trim();
    var line1 = $("n_line1").value.trim();
    if (!name || !line1) { alert("Name and address required"); return; }
    var items = [];
    String($("n_items").value || "").split(/\n+/).forEach(function (line) {
      line = line.trim(); if (!line) return;
      var m = line.match(/^(\S+)\s*[x\u00d7]\s*(\d+)/i) || line.match(/^(\S+)\s+(\d+)$/);
      if (m) items.push({ sku: m[1], qty: parseInt(m[2], 10) });
      else items.push({ sku: line.split(/\s+/)[0], qty: 1 });
    });
    if (!items.length) { alert("Add at least one SKU line"); return; }
    var svc = $("n_service").value;
    var labels = { ground: "Ground", priority: "USPS Priority", next_day: "Next Day Air", express: "Express" };
    api("/api/fulfillment/orders", {
      method: "POST",
      body: {
        service: svc,
        serviceLabel: labels[svc] || svc,
        customer: { name: name, email: $("n_email").value.trim(), phone: $("n_phone").value.trim() },
        shipTo: {
          name: name,
          line1: line1,
          line2: $("n_line2").value.trim(),
          city: $("n_city").value.trim(),
          state: $("n_state").value.trim().toUpperCase(),
          zip: $("n_zip").value.trim(),
          country: "US"
        },
        items: items,
        paymentMethod: "manual",
        note: $("n_pay").value.trim() || undefined
      }
    }).then(function () {
      $("newBack").classList.remove("open");
      filter = "open";
      document.querySelectorAll(".chip").forEach(function (x) {
        x.classList.toggle("active", x.getAttribute("data-f") === "open");
      });
      return load();
    }).catch(function (e) { alert(e.message); });
  };
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closePanel(); closeShipModal(); $("newBack").classList.remove("open"); }
  });
  load();
})();
