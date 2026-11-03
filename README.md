# Kelebek Sınav Dağıtımı

Okulda sınavları **kelebek sistemi** ile yapmak için hazırlanmış, tarayıcıda çalışan bir uygulama.
Sınıf listelerini PDF olarak yüklersiniz. Uygulama öğrencileri, **aynı sınıftan iki öğrenci yan yana oturmayacak** şekilde salonlara dağıtır.

- Yüklenen her sınıf aynı zamanda bir **sınav salonudur**.
- Her salona, o sınıfın **mevcudu kadar** öğrenci yerleştirilir (30 kişilik 9/A sınıfına 30 öğrenci oturur).
- Kurulum gerekmez, internet de gerekmez. Öğrenci listeleri hiçbir sunucuya gönderilmez.

## Nasıl kullanılır?

1. Bu klasörü bilgisayarınıza indirin ve **`index.html`** dosyasını çift tıklayarak Chrome, Edge ya da Firefox ile açın.
   (İsterseniz GitHub Pages ile bir web adresinden de yayınlayabilirsiniz. Ayrıntısı aşağıda.)
2. **1. Sınıf listeleri:** e-Okul'dan aldığınız sınıf listesi PDF'lerini sürükleyip bırakın.
   - Bir PDF'te birden fazla sınıf olabilir. Sınıf adı sayfa başlığından (ör. `9. Sınıf / A Şubesi`) ya da dosya adından (ör. `9-A.pdf`) okunur.
   - Bir sınıfın kartına tıklayarak listeyi kontrol edebilir, sınıf adını düzeltebilir, öğrenci ekleyip silebilirsiniz.
   - PDF'iniz okunamazsa **Elle sınıf ekle** ile listeyi Excel'den kopyalayıp yapıştırabilirsiniz.
3. **2. Sınav bilgileri:** Okul adını, sınav adını, tarihi ve saati yazın. Sınıflardaki sıra düzenini seçin (yan yana 2/3/4 sıra, ikili ya da tekli sıra).
   Farklı düzende olan bir sınıf varsa o sınıfın kartından ayrıca ayarlayabilirsiniz.
4. **3. Dağıtım:** **Kelebek dağıtımını yap** düğmesine basın.
   - Sonucu beğenmezseniz **Yeniden karıştır ve dağıt** ile yeni bir dağıtım yapın.
   - Oturma planında iki öğrenciye sırayla tıklarsanız yerleri değişir. Örneğin gözlüklü bir öğrenciyi öne almak için bunu kullanabilirsiniz.

## Kurallar

| Kural | Durum |
|---|---|
| Aynı sınıftan iki öğrenci aynı sıraya (sıra arkadaşı) oturmaz | Her zaman sağlanır. Tek istisna: bir sınıfın mevcudu diğer tüm sınıfların toplamından fazlaysa bu matematiksel olarak imkânsızdır; uygulama sizi uyarır. |
| Önlü-arkalı, çapraz ve koridorun karşısında aynı sınıftan öğrenci olmaz | Mümkün olduğunca sağlanır. Normal bir okulda bu sayı genellikle 0 olur. |
| Öğrenci kendi sınıfında sınava girmez | İsteğe bağlıdır. Mevcutlar izin vermezse kural en az sayıda öğrenci için esnetilir ve sayısı gösterilir. |
| Aynı seviyeden (9/A ile 9/B gibi) öğrenciler yan yana oturmaz | İsteğe bağlıdır ve mümkün olduğunca uygulanır. |
| Her sınıfın öğrencileri salonlara dengeli dağılır | Her zaman uygulanır. |

Dağıtımdan sonra her kuralın kaç kez ihlal edildiği ekranda gösterilir. Planda kural dışı oturan öğrenciler **!** işaretiyle belirtilir.

## Çıktılar

- **Oturma planları:** Her salon için tahtaya göre sıra sıra yerleşim. Kapıya asmak ya da gözetmene vermek için kullanılır.
- **Salon yoklama listeleri:** Sıra no, öğrenci no, ad soyad, sınıf ve imza sütunu. Altında gözetmen imza alanları vardır.
- **Sınıflara göre liste:** Her sınıfın öğrencileri hangi salonda, hangi sırada sınava giriyor. Sınıflara duyurmak için kullanılır.
- **Öğrenci ara:** Ad ya da numara ile öğrencinin sınav yerini bulun.
- **Yazdır / PDF kaydet:** Her salon ya da sınıf ayrı bir A4 sayfaya basılır. Kartlardaki "Bu salonu yazdır" düğmesiyle tek sayfa da yazdırabilirsiniz.
- **Excel'e aktar (CSV):** Tüm dağıtımı Excel'de açılabilen bir dosya olarak indirir.

Yüklediğiniz listeler, ayarlar ve son dağıtım bu tarayıcıda saklanır. Sayfayı kapatıp açtığınızda kaldığınız yerden devam edersiniz.

## PDF hakkında

- PDF'in **metin içeren** bir PDF olması gerekir. e-Okul'dan "PDF olarak kaydet / yazdır" ile alınan listeler böyledir.
  Kâğıttan taranmış (fotoğraf) PDF'lerde metin olmadığı için okunamaz. Bu durumda uygulama sizi uyarır, listeyi elle yapıştırabilirsiniz.
- Öğrenci satırları "sıra no, öğrenci no, ad, soyad, cinsiyet" düzenindeki tablolardan tanınır. Sütun sırası biraz farklı olsa da genellikle doğru okunur. Yine de yükledikten sonra sayıları kontrol edin.
- `ornekler/` klasöründe deneme için hayali isimlerle hazırlanmış örnek PDF'ler var.

## Web adresinden yayınlama (GitHub Pages)

Depo ayarlarında **Settings → Pages → Branch: `main` / `(root)`** seçerseniz uygulama
`https://<kullanıcı-adı>.github.io/<depo-adı>/` adresinden açılır. Bu durumda da tüm işlemler kullanıcının tarayıcısında yapılır.

## Geliştirme

```
assets/parser.js   PDF'ten sınıf adı ve öğrenci listesi çıkarma
assets/assign.js   dağıtım algoritması (min-maliyetli akış + tavlama)
assets/app.js      arayüz
vendor/pdfjs/      Mozilla pdf.js 3.11.174 (Apache-2.0), internetsiz çalışmak için projeye dahil
tests/             testler ve örnek PDF üretici
```

Testleri çalıştırmak için `npm test` (Node 18+) komutunu kullanın. Örnek PDF'leri yeniden üretmek için `python3 tests/ornek_pdf_uret.py` (reportlab gerekir) komutunu kullanın.

**Algoritma özeti:** Önce her sınıftan her salona kaç öğrenci gideceği minimum maliyetli akış ile hesaplanır.
Bir salona bir sınıftan en fazla "sıra sayısı" kadar öğrenci gider. Kendi sınıfında oturma ve dengesiz dağılım maliyetle cezalandırılır.
Ardından her salonda öğrenciler önce sol, sonra sağ koltuklara sınıf blokları halinde dizilir. Bu dizilim sıra arkadaşı kuralını garanti eder.
Son olarak önlü-arkalı ve çapraz komşuluklar tavlama (simulated annealing) ile en aza indirilir.
