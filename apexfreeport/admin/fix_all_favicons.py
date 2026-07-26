from pathlib import Path
import re

SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Crect width='512' height='512' fill='%23000'/%3E%3Ccircle cx='256' cy='256' r='220' fill='none' stroke='%2322c55e' stroke-width='28'/%3E%3Ctext x='256' y='230' text-anchor='middle' font-family='Arial Black,Helvetica,sans-serif' font-size='120' font-weight='900' fill='%2322c55e'%3EAPEX%3C/text%3E%3Cline x1='90' y1='255' x2='422' y2='255' stroke='%2322c55e' stroke-width='14'/%3E%3Ctext x='256' y='330' text-anchor='middle' font-family='Arial Black,Helvetica,sans-serif' font-size='72' font-weight='900' fill='%23fff'%3EFreePort%3C/text%3E%3C/svg%3E"
LINKS = (
    '<link rel="icon" type="image/svg+xml" href="' + SVG + '">\n'
    '<link rel="shortcut icon" href="' + SVG + '">\n'
    '<link rel="apple-touch-icon" href="' + SVG + '">'
)

def fix(path):
    p = Path(path)
    t = p.read_text()
    t = re.sub(r'\s*<script src="/admin/favicon-force\.js"></script>\s*', '\n', t)
    t = re.sub(r'\s*<link rel="icon"[^>]*>', '', t)
    t = re.sub(r'\s*<link rel="shortcut icon"[^>]*>', '', t)
    t = re.sub(r'\s*<link rel="apple-touch-icon"[^>]*>', '', t)
    if '</title>' in t:
        t = t.replace('</title>', '</title>\n' + LINKS, 1)
    else:
        t = t.replace('<head>', '<head>\n' + LINKS, 1)
    p.write_text(t)
    ok = 'image/svg+xml' in t and 'favicon-force' not in t
    print(path, 'OK' if ok else 'CHECK', 'svg=', 'image/svg+xml' in t, 'force=', 'favicon-force' in t)

for f in ['admin/login.html', 'admin/fulfillment.html', 'admin/index.html']:
    if Path(f).exists():
        fix(f)
    else:
        print('missing', f)
