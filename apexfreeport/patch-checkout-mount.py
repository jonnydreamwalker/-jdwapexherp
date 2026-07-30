#!/usr/bin/env python3
from pathlib import Path
p = Path("server.js")
t = p.read_text()
if "checkout-routes" in t:
    print("already mounted")
else:
    t = t.replace(
        "app.listen(PORT,",
        'try { require("./checkout-routes")(app); console.log("Checkout routes loaded"); } catch (e) { console.log("Checkout:", e.message); }\napp.listen(PORT,',
        1,
    )
    p.write_text(t)
    print("mounted before listen")
