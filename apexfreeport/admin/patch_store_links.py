from pathlib import Path

p = Path("admin/index.html")
t = p.read_text()

# 1) site link id
t = t.replace(
  '<a href="https://jdwapexherp.com" target="_blank" rel="noopener">Herp site</a>',
  '<a href="https://jdwapexherp.com" target="_blank" rel="noopener" id="siteLink">Herp site</a>',
  1
)

# 2) inject STORE_META after var store = "herp";
if "STORE_META" not in t:
    needle = 'var store = "herp";'
    insert = '''var store = "herp";
  var STORE_META = {
    herp: { name: "Apex Herp", siteUrl: "https://jdwapexherp.com", siteLabel: "Herp site", host: "jdwapexherp.com" },
    k9: { name: "Apex K9", siteUrl: "https://jonnydreamwalker.github.io/-jdwapexk9/", siteLabel: "K9 site", host: "Apex K9" },
    feline: { name: "Apex Feline", siteUrl: "https://jonnydreamwalker.github.io/-jdwapexfeline/", siteLabel: "Feline site", host: "Apex Feline" }
  };'''
    if needle in t:
        t = t.replace(needle, insert, 1)
        print("STORE_META injected")
    else:
        print("FAIL: store var not found")

# 3) updateSlogan + updateStoreChrome
if "updateStoreChrome" not in t:
    old = '''  function updateSlogan() {
    var el = $("slogan");
    if (publicFeed) { el.textContent = "jdwapexherp.com feed is LIVE for this store."; el.className = "slogan live"; }
    else { el.textContent = "Flip the switch."; el.className = "slogan"; }
  }'''
    new = '''  function updateStoreChrome() {
    var m = STORE_META[store] || STORE_META.herp;
    var a = $("siteLink");
    if (a) { a.href = m.siteUrl; a.textContent = m.siteLabel; }
  }
  function updateSlogan() {
    var m = STORE_META[store] || STORE_META.herp;
    var el = $("slogan");
    if (publicFeed) {
      el.textContent = m.host + " feed is LIVE for " + m.name + ".";
      el.className = "slogan live";
    } else {
      el.textContent = "Flip the switch · " + m.name;
      el.className = "slogan";
    }
    updateStoreChrome();
  }'''
    if old in t:
        t = t.replace(old, new, 1)
        print("slogan replaced")
    else:
        loose_old = 'if (publicFeed) { el.textContent = "jdwapexherp.com feed is LIVE for this store."; el.className = "slogan live"; }\n    else { el.textContent = "Flip the switch."; el.className = "slogan"; }'
        loose_new = '''var m = STORE_META[store] || STORE_META.herp;
    if (publicFeed) { el.textContent = m.host + " feed is LIVE for " + m.name + "."; el.className = "slogan live"; }
    else { el.textContent = "Flip the switch · " + m.name; el.className = "slogan"; }
    updateStoreChrome();'''
        if loose_old in t:
            t = t.replace(loose_old, loose_new, 1)
            t = t.replace(
                'function updateSlogan()',
                '''function updateStoreChrome() {
    var m = STORE_META[store] || STORE_META.herp;
    var a = $("siteLink");
    if (a) { a.href = m.siteUrl; a.textContent = m.siteLabel; }
  }
  function updateSlogan()''',
                1
            )
            print("slogan loose replaced")
        else:
            print("FAIL: slogan not found")

# 4) feed confirm
old_feed = 'next ? "jdwapexherp.com will go LIVE with this store\'s inventory." : "Shut public feed for this store?"'
new_feed = 'next ? ((STORE_META[store]||STORE_META.herp).name + " sales site will go LIVE with this inventory.") : ("Shut public feed for " + (STORE_META[store]||STORE_META.herp).name + "?")'
if old_feed in t:
    t = t.replace(old_feed, new_feed, 1)
    print("feed confirm patched")
else:
    print("WARN: feed confirm string not exact")

p.write_text(t)
print("siteLink", 'id="siteLink"' in t)
print("STORE_META", "STORE_META" in t)
print("updateStoreChrome", "updateStoreChrome" in t)
