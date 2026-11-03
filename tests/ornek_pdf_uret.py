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


TR_HARF = set("ÇĞİÖŞÜçğıöşü")


def parcali_yaz(c, x, y, metin, font="DV", boyut=9):
    """Türkçe harfleri ayrı metin parçaları olarak yazar (bazı e-Okul PDF'lerindeki gibi)."""
    parca = ""
    for ch in metin:
        if ch in TR_HARF:
            if parca:
                c.drawString(x, y, parca)
                x += pdfmetrics.stringWidth(parca, font, boyut)
                parca = ""
            c.drawString(x, y, ch)
            x += pdfmetrics.stringWidth(ch, font, boyut)
        else:
            parca += ch
    if parca:
        c.drawString(x, y, parca)


def parcali_pdf(path, siniflar):
    """Tek dosyada çok sınıf; harfler parçalı; başlık 'Sınıfı : 9. Sınıf / A Şubesi'."""
    c = canvas.Canvas(path, pagesize=A4)
    w, h = A4
    for sinif, sube, liste in siniflar:
        c.setFont("DVB", 11)
        parcali_yaz(c, 50, h - 60, "NECATİ ÖRNEK ANADOLU LİSESİ", "DVB", 11)
        c.setFont("DV", 10)
        parcali_yaz(c, 50, h - 80, f"Sınıfı : {sinif}. Sınıf / {sube} Şubesi", "DV", 10)
        y = h - 110
        c.setFont("DV", 9)
        for i, (no, ad, soyad, cins) in enumerate(liste, 1):
            y -= 16
            c.drawString(50, y, str(i))
            c.drawString(80, y, str(no))
            parcali_yaz(c, 130, y, f"{tr_upper(ad)} {tr_upper(soyad)}")
            parcali_yaz(c, 400, y, cins)
        c.showPage()
    c.save()


def okul_listesi_pdf(path, siniflar):
    """Tüm okul tek tabloda; her satırda 'Sınıfı' sütunu (ör. 10/B)."""
    c = canvas.Canvas(path, pagesize=A4)
    w, h = A4
    satirlar = [(f"{s}/{b}", o) for s, b, l in siniflar for o in l]
    rnd.shuffle(satirlar)
    y = h - 50
    c.setFont("DVB", 9)
    for x, t in zip([50, 80, 130, 190, 420], ["S.No", "Sınıfı", "Okul No", "Adı Soyadı", "Cinsiyeti"]):
        c.drawString(x, y, t)
    c.setFont("DV", 9)
    for i, (snf, (no, ad, soyad, cins)) in enumerate(satirlar, 1):
        y -= 15
        if y < 50:
            c.showPage(); c.setFont("DV", 9); y = h - 50
        for x, t in zip([50, 80, 130, 190, 420], [str(i), snf, str(no), f"{ad} {soyad}", cins]):
            c.drawString(x, y, t)
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
    fx = os.path.join(ROOT, "tests", "fixtures")
    os.makedirs(fx, exist_ok=True)
    parcali_pdf(os.path.join(fx, "document (9).pdf"),
                [("9", "A", ogrenciler(31, 3000)), ("9", "B", ogrenciler(29, 3400)), ("10", "A", ogrenciler(33, 3800))])
    okul_listesi_pdf(os.path.join(fx, "okul-listesi.pdf"),
                     [("11", "C", ogrenciler(20, 4200)), ("12", "A", ogrenciler(22, 4600)), ("12", "B", ogrenciler(18, 5000))])
    print("Örnekler:", sorted(os.listdir(OUT)), "Test:", sorted(os.listdir(fx)))


if __name__ == "__main__":
    main()
