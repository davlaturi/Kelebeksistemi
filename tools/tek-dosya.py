"""Uygulamayı tek bir HTML dosyasına paketler (tablet ve telefonlar için).

Stil, betikler ve PDF okuyucu (pdf.js ve işçisi) dosyanın içine gömülür;
dosya tek başına, internetsiz açılır.

Kullanım:  python3 tools/tek-dosya.py [çıktı.html]
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "dist", "Kelebek-Sinav-Dagitimi.html")


def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return f.read()


def safe_script(js):
    # Gömülü betik içinde </script> geçmesin
    return js.replace("</script", "<\\/script")


html = read("index.html")
css = read("assets/style.css")
html = html.replace('<link rel="stylesheet" href="assets/style.css">', "<style>\n" + css + "\n</style>")

worker = read("vendor/pdfjs/pdf.worker.min.js")
worker_boot = (
    "<script>(function(){try{var src=" + json.dumps(worker).replace("</", "<\\/") +
    ";var url=URL.createObjectURL(new Blob([src],{type:'text/javascript'}));"
    "window.__KELEBEK_WORKER__=url;}catch(e){}})();</script>"
)

for rel in ["vendor/pdfjs/pdf.min.js", "assets/parser.js", "assets/assign.js", "assets/share.js", "assets/calendar.js", "assets/app.js"]:
    tag = '<script src="%s"></script>' % rel
    if tag not in html:
        raise SystemExit("Bulunamadı: " + tag)
    body = safe_script(read(rel))
    if rel == "assets/app.js":
        body = body.replace(
            "window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';",
            "window.pdfjsLib.GlobalWorkerOptions.workerSrc = window.__KELEBEK_WORKER__ || 'vendor/pdfjs/pdf.worker.min.js';",
        )
        html = html.replace(tag, worker_boot + "\n<script>\n" + body + "\n</script>")
    else:
        html = html.replace(tag, "<script>\n" + body + "\n</script>")

if re.search(r'src="(assets|vendor)/', html):
    raise SystemExit("Gömülmeyen dosya kaldı")
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w", encoding="utf-8") as f:
    f.write(html)
print("Yazıldı:", out, round(os.path.getsize(out) / 1024), "KB")
