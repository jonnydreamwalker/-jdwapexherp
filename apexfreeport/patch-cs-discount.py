#!/usr/bin/env python3
"""CS discount on main inventory product modal — override password required."""
from pathlib import Path
import re

s = Path("server.js")
t = s.read_text()
t = t.replace('\\"', '"')

if "DISCOUNT_OVERRIDE" not in t:
    m = re.search(r"(const|var|let)\s+PASS\s*=", t)
    if m:
        t = (
            t[: m.start()]
            + 'const DISCOUNT_OVERRIDE = process.env.DISCOUNT_OVERRIDE_PASSWORD || process.env.ADMIN_PASSWORD || "change-me-apex";\n'
            + t[m.start() :]
        )
        print("DISCOUNT_OVERRIDE const")
    else:
        print("WARN: PASS not found")

if "discountOn:" not in t and "function publicItem" in t:
    t = t.replace(
        "price: Number(i.price) || 0,",
        "price: (i.discountOn && Number(i.salePrice) > 0) ? Number(i.salePrice) : (Number(i.price) || 0),\n"
        "    listPrice: Number(i.price) || 0,\n"
        "    salePrice: (i.discountOn && Number(i.salePrice) > 0) ? Number(i.salePrice) : null,\n"
        "    discountOn: !!(i.discountOn && Number(i.salePrice) > 0),",
        1,
    )
    print("publicItem sale")

block = r'''
  // CS discount — override password required to enable, change, or clear
  if (b.discountOn != null || b.salePrice != null) {
    var wantOn = !!(b.discountOn === true || b.discountOn === "true" || b.discountOn === 1);
    var wantSale = (b.salePrice != null && b.salePrice !== "") ? Number(b.salePrice) : null;
    var prevOn = !!item.discountOn;
    var prevSale = item.salePrice != null ? Number(item.salePrice) : null;
    var changing = (wantOn !== prevOn) || (wantOn && wantSale !== prevSale) || (!wantOn && prevOn);
    if (changing) {
      var op = String((b.overridePassword || b.discountPassword || "")).trim();
      if (!op || op !== String(DISCOUNT_OVERRIDE)) {
        return res.status(403).json({ error: "override_password_required", message: "Override password required to set or change CS discount." });
      }
    }
    item.discountOn = wantOn && wantSale != null && wantSale > 0;
    item.salePrice = item.discountOn ? wantSale : null;
  }
'''

if "override_password_required" not in t:
    inserted = False
    for needle in [
        "if (b.price != null) item.price = Number(b.price) || 0;",
        "item.price = Number(b.price) || 0;",
        "if (b.price != null) item.price = Number(b.price);",
    ]:
        if needle in t:
            t = t.replace(needle, needle + "\n" + block, 1)
            inserted = True
            print("discount save logic")
            break
    if not inserted:
        print("WARN: could not insert discount save logic")
else:
    print("discount logic already present")

s.write_text(t)

idx = Path("admin/index.html")
h = idx.read_text()
ui = '''
      <div class="list-box" id="csDiscountBox" style="grid-column:1/-1;border:1px solid #38bdf855;border-radius:12px;padding:12px;background:#0c1929;margin-top:8px">
        <p style="color:#7dd3fc;margin:0 0 8px;font-size:12px;font-weight:700">CS DISCOUNT — customer service sale price</p>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;text-transform:none;font-size:13px;color:#e0f2fe">
          <input type="checkbox" id="p_discountOn" style="width:auto;accent-color:#38bdf8">
          <span><strong>ENABLE SALE PRICE</strong> on the sales site</span>
        </label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
          <div>
            <label>Sale price ($)</label>
            <input id="p_salePrice" type="number" step="0.01" min="0" placeholder="19.99">
          </div>
          <div>
            <label>Override password</label>
            <input id="p_discountPass" type="password" autocomplete="new-password" placeholder="Required to set or change">
          </div>
        </div>
        <p style="margin:8px 0 0;font-size:11px;color:#64748b">Base Price stays the list price. Override password required to enable, change, or clear a discount.</p>
      </div>
'''
if 'id="p_discountOn"' not in h:
    if 'id="p_price"' in h:
        h2, n = re.subn(
            r'(<input id="p_price"[^>]*>\s*</div>)',
            r"\1" + ui,
            h,
            count=1,
        )
        if n:
            h = h2
            print("index discount UI after price")
        else:
            h = h.replace(
                '<div class="modal-actions">',
                ui + '\n    <div class="modal-actions">',
                1,
            )
            print("index discount UI before actions")
    else:
        print("WARN: no p_price in index")
    idx.write_text(h)
else:
    print("index already has discount UI")

app = Path("admin/app.js")
if app.exists():
    a = app.read_text()
    if "p_discountOn" not in a:
        a = a.replace(
            '$("p_listed").checked = true;',
            '$("p_listed").checked = true;\n'
            '    if ($("p_discountOn")) $("p_discountOn").checked = false;\n'
            '    if ($("p_salePrice")) $("p_salePrice").value = "";\n'
            '    if ($("p_discountPass")) $("p_discountPass").value = "";',
            1,
        )
        a = a.replace(
            '$("p_listed").checked = isListed(it);',
            '$("p_listed").checked = isListed(it);\n'
            '    if ($("p_discountOn")) {\n'
            "      var sale = it.salePrice != null && Number(it.salePrice) > 0;\n"
            "      var on = it.discountOn === true || sale;\n"
            '      $("p_discountOn").checked = !!on;\n'
            '      if ($("p_salePrice")) $("p_salePrice").value = sale ? Number(it.salePrice) : "";\n'
            '      if ($("p_discountPass")) $("p_discountPass").value = "";\n'
            "    }",
            1,
        )
        a = a.replace(
            'price: Number($("p_price").value) || 0,',
            'price: Number($("p_price").value) || 0,\n'
            '      discountOn: !!($("p_discountOn") && $("p_discountOn").checked),\n'
            '      salePrice: ($("p_salePrice") && $("p_salePrice").value !== "") ? Number($("p_salePrice").value) : null,\n'
            '      overridePassword: ($("p_discountPass") && $("p_discountPass").value) ? $("p_discountPass").value : "",',
            1,
        )
        a = a.replace(
            'if (!body.sku || !body.name) { setStatus("SKU and Name are required.", "err"); return; }',
            'if (!body.sku || !body.name) { setStatus("SKU and Name are required.", "err"); return; }\n'
            "    if (body.discountOn) {\n"
            '      if (!(body.salePrice > 0)) { setStatus("Sale price required when CS discount is enabled.", "err"); return; }\n'
            '      if (!body.overridePassword) { setStatus("Override password required to enable or change CS discount.", "err"); return; }\n'
            "    }",
            1,
        )
        app.write_text(a)
        print("app.js discount hooks")
    else:
        print("app.js already has discount")
else:
    print("no app.js")

print("DONE — CS discount ready")
print("Set DISCOUNT_OVERRIDE_PASSWORD in /etc/apexfreeport.env (defaults to ADMIN_PASSWORD)")
