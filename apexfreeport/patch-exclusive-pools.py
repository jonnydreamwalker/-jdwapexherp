#!/usr/bin/env python3
from pathlib import Path
import re
p = Path("admin/app.js")
t = p.read_text()
changed = False

t2, n = re.subn(
    r"function inView\(it\) \{[\s\S]*?\n  \}",
    """function inView(it) {
    var pool = itemPool(it);
    if (inventoryView === \"master\") return true;
    if (inventoryView === \"wholesale\") return pool === \"wholesale\" || pool === \"both\" || pool === \"dealer\";
    return pool === \"retail\";
  }""",
    t, count=1)
if n:
    t = t2
    changed = True
    print("inView ok")
else:
    print("inView skip")

new = """    // Exclusive: WHOLESALE tab only OR sales table - never both. Master shows all.
    if ($(\"p_wholesale\") && $(\"p_wholesale\").checked) {
      body.pool = \"wholesale\";
      body.dealerEligible = true;
      body.listed = false;
      if ($(\"p_listed\")) $(\"p_listed\").checked = false;
    } else {
      body.pool = \"retail\";
      body.dealerEligible = false;
      body.listed = !!($(\"p_listed\") && $(\"p_listed\").checked);
    }"""

t2, n = re.subn(
    r'if \(\$\("p_wholesale"\) && \$\("p_wholesale"\)\.checked\) \{[\s\S]*?body\.dealerEligible = false;\n    \}',
    new.strip(),
    t, count=1)
if n:
    t = t2
    changed = True
    print("save ok")
else:
    print("save NOT FOUND")

if '$(\"p_wholesale\").onchange' not in t and 'p_wholesale").onchange' not in t:
    needle = '$("p_save").onclick = saveProduct;'
    if needle in t:
        t = t.replace(needle, needle + """
  if ($(\"p_wholesale\")) {
    $(\"p_wholesale\").onchange = function () {
      if (this.checked && $(\"p_listed\")) $(\"p_listed\").checked = false;
    };
  }
  if ($(\"p_listed\")) {
    $(\"p_listed\").onchange = function () {
      if (this.checked && $(\"p_wholesale\") && $(\"p_wholesale\").checked) $(\"p_wholesale\").checked = false;
    };
  }""", 1)
        changed = True
        print("toggles ok")

if changed:
    p.write_text(t)
    print("WROTE admin/app.js")
else:
    print("no changes")
