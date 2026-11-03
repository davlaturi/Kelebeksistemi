"""Deneme amaçlı örnek sınıf listesi PDF'leri üretir (isimler hayalidir).

Kullanım:  python3 tests/ornek_pdf_uret.py
Çıktı:     ornekler/*.pdf
"""
import os
import random

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "ornekler")
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
pdfmetrics.registerFont(TTFont("DV", FONT))
pdfmetrics.registerFont(TTFont("DVB", FONT_B))

ERKEK = ["Ahmet", "Mehmet", "Mustafa", "Ali", "Hüseyin", "Emre", "Yusuf", "Ömer", "Burak", "Eren",
         "Kerem", "Çağan", "Doğukan", "İsmail", "Şahin", "Berk", "Görkem", "Uğur", "Alp", "Efe"]
KIZ = ["Ayşe", "Fatma", "Zeynep", "Elif", "Merve", "Büşra", "Esra", "Şeyma", "İrem", "Gökçe",
       "Ece", "Defne", "Öykü", "Çağla", "Ilgın", "Nazlı", "Duru", "Sude", "Yağmur", "Ebru"]
SOYAD = ["Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Yıldız", "Yıldırım", "Öztürk", "Aydın", "Özdemir",
         "Arslan", "Doğan", "Kılıç", "Aslan", "Çetin", "Kara", "Koç", "Kurt", "Özkan", "Şimşek",
         "Polat", "Erdoğan", "Güneş", "Aksoy", "Uçar", "Ünal", "Işık", "Bozkurt", "Gündüz", "Tekin"]

rnd = random.Random(2026)
used = set()


def tr_upper(s):
    return s.replace("i", "İ").replace("ı", "I").upper()


def ogrenciler(n, no_start):
    out = []
    nos = sorted(rnd.sample(range(no_start, no_start + 400), n))
    for no in nos:
        while True:
            kiz = rnd.random() < 0.5
            ad = rnd.choice(KIZ if kiz else ERKEK)
            if rnd.random() < 0.15:
                ad += " " + rnd.choice(KIZ if kiz else ERKEK)
            soyad = rnd.choice(SOYAD)
            if (ad, soyad) not in used:
                used.add((ad, soyad))
                break
        out.append((no, ad, soyad, "Kız" if kiz else "Erkek"))
    out.sort(key=lambda s: s[0])
    return out


def eokul_sayfa(c, sinif, sube, liste, sayfa, toplam_sayfa):
    w, h = A4
    c.setFont("DVB", 11)
    c.drawCentredString(w / 2, h - 50, "T.C.")
    c.drawCentredString(w / 2, h - 66, "ÖRNEK ANADOLU LİSESİ")
    c.setFont("DV", 10)
    c.drawCentredString(w / 2, h - 82, "2026-2027 Eğitim Öğretim Yılı")
    c.setFont("DVB", 12)
    c.drawCentredString(w / 2, h - 104, f"{sinif}. Sınıf / {sube} Şubesi Sınıf Listesi")
    y = h - 140
    cols = [50, 100, 190, 330, 470]
    c.setFont("DVB", 9)
    for x, t in zip(cols, ["S.No", "Öğrenci No", "Adı", "Soyadı", "Cinsiyeti"]):
        c.drawString(x, y, t)
    c.line(45, y - 4, w - 45, y - 4)
    c.setFont("DV", 9)
    for i, (no, ad, soyad, cins) in liste:
        y -= 17
        for x, t in zip(cols, [str(i), str(no), ad, soyad, cins]):
            c.drawString(x, y, t)
    c.setFont("DV", 8)
    c.drawString(50, 40, "03.11.2026")
    c.drawRightString(w - 50, 40, f"Sayfa {sayfa} / {toplam_sayfa}")
    c.showPage()


def eokul_pdf(path, siniflar):
    """Her sınıfı ayrı sayfa(lar)da basar; birden çok sınıf tek dosyada olabilir."""
    c = canvas.Canvas(path, pagesize=A4)
    sayfalar = []
    for sinif, sube, liste in siniflar:
        numarali = list(enumerate(liste, 1))
        for k in range(0, len(numarali), 36):
            sayfalar.append((sinif, sube, numarali[k:k + 36]))
    for idx, (sinif, sube, parca) in enumerate(sayfalar, 1):
        eokul_sayfa(c, sinif, sube, parca, idx, len(sayfalar))
    c.save()


def sade_pdf(path, baslik, liste):
    """Farklı bir düzen: 'Sınıf: 11-B', Ad Soyad tek sütun, imza sütunu."""
    c = canvas.Canvas(path, pagesize=A4)
    w, h = A4
    c.setFont("DVB", 14)
    c.drawString(50, h - 60, "Yoklama Listesi")
    c.setFont("DV", 11)
    c.drawString(50, h - 80, f"Sınıf: {baslik}")
    y = h - 115
    c.setFont("DVB", 10)
    for x, t in zip([50, 90, 160, 420], ["Sıra", "No", "Adı Soyadı", "İmza"]):
        c.drawString(x, y, t)
    c.setFont("DV", 10)
    for i, (no, ad, soyad, _) in enumerate(liste, 1):
        y -= 18
        c.drawString(50, y, f"{i}.")
        c.drawString(90, y, str(no))
        c.drawString(160, y, f"{ad} {tr_upper(soyad)}")
        c.line(420, y - 2, 540, y - 2)
    c.drawString(50, 40, f"Toplam: {len(liste)} öğrenci")
    c.showPage()
    c.save()


def main():
    os.makedirs(OUT, exist_ok=True)
    eokul_pdf(os.path.join(OUT, "9-A.pdf"), [("9", "A", ogrenciler(30, 100))])
    eokul_pdf(os.path.join(OUT, "9-B.pdf"), [("9", "B", ogrenciler(28, 500))])
    eokul_pdf(os.path.join(OUT, "10-A.pdf"), [("10", "A", ogrenciler(41, 900))])  # 2 sayfa
    # Tek dosyada iki sınıf
    eokul_pdf(os.path.join(OUT, "10-B ve 11-A.pdf"),
              [("10", "B", ogrenciler(27, 1300)), ("11", "A", ogrenciler(32, 1700))])
    sade_pdf(os.path.join(OUT, "11-B.pdf"), "11-B", ogrenciler(25, 2100))
    print("Örnekler:", sorted(os.listdir(OUT)))


if __name__ == "__main__":
    main()
