#!/usr/bin/env python3
"""Fix FreePort: qty arrow targets qty cell + drop-ship info sheet."""
from pathlib import Path
import re

# ---- app.js ----
p = Path("admin/app.js")
t = p.read_text()

t2, n = re.subn(
    r'function updateQtyCell\(tr, qty\) \{\s*var strong = tr\.querySelector\("td strong"\);\s*if \(strong\) strong\.textContent = String\(qty\);\s*\}',
    'function updateQtyCell(tr, qty) {\n    var el = tr.querySelector(".qty-val");\n    if (el) el.textContent = String(qty);\n  }',
    t,
    count=1,
)
if n:
    t = t2
    print("qty updateQtyCell ok")
elif ".qty-val" in t and "updateQtyCell" in t:
    print("qty updateQtyCell already")
else:
    print("qty updateQtyCell FAIL")

t2, n = re.subn(
    r"(<button type=\"button\" class=\"ghost\" data-act=\"minus\">[^<]*</button> )<strong>' \+ \(it\.qty \|\| 0\) \+ '</strong>( <button type=\"button\" class=\"ghost\" data-act=\"plus\">)",
    r'\1<strong class="qty-val">\' + (it.qty || 0) + \'</strong>\2',
    t,
    count=1,
)
if n:
    t = t2
    print("qty class ok")
elif "qty-val" in t:
    print("qty class already")
else:
    print("qty class FAIL")

if "p_msrp" not in t:
    t = t.replace(
        '$("p_dropShip").checked = false; $("p_supplier").value = ""; $("p_shippingTerms").value = "";',
        '$("p_dropShip").checked = false; $("p_supplier").value = ""; $("p_shippingTerms").value = "";\n'
        '    if ($("p_msrp")) $("p_msrp").value = "";\n'
        '    if ($("p_supplierSku")) $("p_supplierSku").value = "";\n'
        '    if ($("p_supplierUrl")) $("p_supplierUrl").value = "";\n'
        '    if ($("p_supplierCost")) $("p_supplierCost").value = "";\n'
        '    if ($("p_supplierNotes")) $("p_supplierNotes").value = "";\n'
        '    if ($("dropShipSheet")) $("dropShipSheet").style.display = "none";',
    )
    print("clear form ok")

old_edit = '$("p_dropShip").checked = ds; $("p_supplier").value = it.supplier || ""; $("p_shippingTerms").value = it.shippingTerms || "";'
if old_edit in t and "p_msrp" not in t[t.find("function openEdit") : t.find("function openEdit") + 1200]:
    t = t.replace(
        old_edit,
        old_edit
        + '\n    if ($("p_msrp")) $("p_msrp").value = it.msrp != null ? Number(it.msrp) : "";\n'
        '    if ($("p_supplierSku")) $("p_supplierSku").value = it.supplierSku || it.vendorSku || "";\n'
        '    if ($("p_supplierUrl")) $("p_supplierUrl").value = it.supplierUrl || it.orderUrl || "";\n'
        '    if ($("p_supplierCost")) $("p_supplierCost").value = it.supplierCost != null ? Number(it.supplierCost) : (it.cost != null ? Number(it.cost) : "");\n'
        '    if ($("p_supplierNotes")) $("p_supplierNotes").value = it.supplierNotes || it.orderNotes || "";\n'
        '    if ($("dropShipSheet")) $("dropShipSheet").style.display = ds ? "block" : "none";',
        1,
    )
    print("openEdit ok")

if "supplierSku:" not in t:
    t = t.replace(
        'dropShip: !!$("p_dropShip").checked, supplier: $("p_supplier").value.trim(),',
        'dropShip: !!$("p_dropShip").checked, supplier: $("p_supplier").value.trim(),\n'
        '      msrp: $("p_msrp") && $("p_msrp").value !== "" ? Number($("p_msrp").value) : null,\n'
        '      supplierSku: $("p_supplierSku") ? $("p_supplierSku").value.trim() : "",\n'
        '      supplierUrl: $("p_supplierUrl") ? $("p_supplierUrl").value.trim() : "",\n'
        '      supplierCost: $("p_supplierCost") && $("p_supplierCost").value !== "" ? Number($("p_supplierCost").value) : null,\n'
        '      supplierNotes: $("p_supplierNotes") ? $("p_supplierNotes").value.trim() : "",',
    )
    print("save body ok")

if 'p_dropShip").onchange' not in t:
    needle = '$("p_save").onclick = saveProduct;'
    if needle in t:
        t = t.replace(
            needle,
            needle
            + '\n  if ($("p_dropShip") && $("dropShipSheet")) {\n'
            '    $("p_dropShip").onchange = function () {\n'
            '      $("dropShipSheet").style.display = this.checked ? "block" : "none";\n'
            "    };\n"
            "  }",
            1,
        )
        print("toggle ok")

p.write_text(t)
print("app.js written")

# ---- index.html ----
h = Path("admin/index.html")
ht = h.read_text()
if 'id="dropShipSheet"' in ht:
    print("index already has dropShipSheet")
else:
    pat = r'<label class="rowlab"><input type="checkbox" id="p_dropShip"[\s\S]*?id="p_shippingTerms"[^>]*>'
    repl = (
        '<label class="rowlab"><input type="checkbox" id="p_dropShip" style="width:auto;accent-color:#f59e0b"> '
        '<span><strong>DROP SHIP</strong> — backend only; customers never see this. Opens supplier info sheet.</span></label>\n'
        '      <div id="dropShipSheet" style="display:none;margin-top:10px;padding:12px;border:1px solid #f59e0b55;border-radius:12px;background:#1c1917">\n'
        '        <p class="hint" style="color:#fbbf24;margin:0 0 10px;font-size:12px;font-weight:700">DROP SHIP INFO SHEET — where to order and codes (staff only)</p>\n'
        "        <label>Supplier / vendor name</label>\n"
        '        <input id="p_supplier" placeholder="Printful, local printer, Arcadia distributor…">\n'
        "        <label>Supplier order URL</label>\n"
        '        <input id="p_supplierUrl" placeholder="https://… order page or portal">\n'
        "        <label>Supplier SKU / order code</label>\n"
        '        <input id="p_supplierSku" placeholder="Their SKU, style code, or promo code">\n'
        '        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">\n'
        "          <div>\n"
        "            <label>Your cost ($)</label>\n"
        '            <input id="p_supplierCost" type="number" step="0.01" min="0" placeholder="0.00">\n'
        "          </div>\n"
        "          <div>\n"
        "            <label>MSRP ($)</label>\n"
        '            <input id="p_msrp" type="number" step="0.01" min="0" placeholder="0.00">\n'
        "          </div>\n"
        "        </div>\n"
        "        <label>Supplier shipping terms</label>\n"
        '        <input id="p_shippingTerms" placeholder="Supplier ships — rate on their terms">\n'
        "        <label>Notes (codes, account #, pack notes)</label>\n"
        '        <textarea id="p_supplierNotes" rows="3" placeholder="Account numbers, coupon codes, pack instructions, who to contact…"></textarea>\n'
        "      </div>"
    )
    ht2, n = re.subn(pat, repl, ht, count=1)
    if n:
        h.write_text(ht2)
        print("index drop sheet ok")
    else:
        print("index drop sheet FAIL")

# ---- server.js ----
s = Path("server.js")
st = s.read_text()
if "item.supplierSku" in st:
    print("server already has supplierSku")
else:
    idx = st.find('app.post("/api/inventory/item"')
    idx2 = st.find("applyPhotos(item, b);", idx if idx >= 0 else 0)
    if idx2 > 0:
        block = (
            '  if (b.msrp != null && b.msrp !== "") item.msrp = Number(b.msrp) || 0;\n'
            '  if (b.supplierSku != null) item.supplierSku = String(b.supplierSku || "");\n'
            '  if (b.supplierUrl != null) item.supplierUrl = String(b.supplierUrl || "");\n'
            '  if (b.supplierCost != null && b.supplierCost !== "") item.supplierCost = Number(b.supplierCost) || 0;\n'
            '  if (b.supplierNotes != null) item.supplierNotes = String(b.supplierNotes || "");\n'
            "  "
        )
        st = st[:idx2] + block + st[idx2:]
        s.write_text(st)
        print("server drop fields ok")
    else:
        print("server FAIL")

print("DONE")
