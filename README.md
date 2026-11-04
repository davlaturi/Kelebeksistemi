# Kelebek Sınav Dağıtımı

Okulda sınavları **kelebek sistemi** ile yapmak için hazırlanmış, tarayıcıda çalışan bir uygulama.
Sınıf listelerini PDF olarak yüklersiniz. Uygulama öğrencileri, **aynı sınıf düzeyindeki (9'lar, 10'lar, 11'ler…) iki öğrenci yan yana oturmayacak** şekilde salonlara dağıtır. Öğrenci kendi sınıfında oturabilir, ama yanında kendi düzeyinden biri olmaz (9/A'daki bir öğrencinin yanına 9/A ya da 9/B'den biri oturmaz).

- Yüklenen her sınıf aynı zamanda bir **sınav salonudur**.
- Her salona, o sınıfın **mevcudu kadar** öğrenci yerleştirilir (30 kişilik 9/A sınıfına 30 öğrenci oturur).
- Kurulum gerekmez, internet de gerekmez. Öğrenci listeleri hiçbir sunucuya gönderilmez.

## Tablet ve telefonda

Release sayfasındaki **`Kelebek-Sinav-Dagitimi-…-tablet.html`** dosyasını indirip açın. Bu dosya stilleri, betikleri ve PDF okuyucuyu içinde taşır, tek başına çalışır. ZIP'teki `index.html` tablette tek başına açılırsa görünüm ve PDF okuma çalışmaz, çünkü tablet yanındaki klasörleri okuyamaz.

Tek dosyayı kendiniz üretmek için `python3 tools/tek-dosya.py` komutunu çalıştırın.

## Bilgisayarda (PC) kurulum

1. GitHub'da **Code → Download ZIP** ile dosyayı indirin.
2. ZIP'e sağ tıklayıp **Tümünü ayıkla** deyin. ZIP'in içinden doğrudan açarsanız PDF okuyucu yüklenmez.
3. Çıkan klasördeki **`index.html`** dosyasını çift tıklayın. Chrome, Edge ya da Firefox'ta açılır.
   İnternet bağlantısı gerekmez. Klasörü USB belleğe kopyalayıp başka bir bilgisayarda da kullanabilirsiniz.

## Nasıl kullanılır?

Menüler soldaki yan paneldedir: **1 Sınıf listeleri**, **2 Sınav bilgileri**, **3 Dağıtım** ve **4 Kayıtlı sınavlar**. Dağıtım yapıldıktan sonra oturma planları, yoklama listeleri, sınıflara göre sınav yerleri ve öğrenci arama, Dağıtım'ın altında listelenir. Yedek alma düğmeleri de yan panelin altındadır. Her bölümün sonundaki **Devam** düğmesi sizi sıradaki adıma götürür.


1. **`index.html`** dosyasını açın (yukarıya bakın).
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
| Aynı sınıf düzeyinden iki öğrenci aynı sıraya (sıra arkadaşı) oturmaz | Her zaman sağlanır. Tek istisna: bir düzeyin öğrenci sayısı diğer tüm düzeylerin toplamından fazlaysa bu matematiksel olarak imkânsızdır; uygulama sizi uyarır. |
| Önlü-arkalı aynı düzeyden öğrenci oturmaz | Mümkün olduğunca sağlanır. Normal bir okulda bu sayı genellikle 0 olur. |
| Çapraz ve koridorun karşısındaki komşu | En düşük öncelikli kuraldır; mümkün olduğunca farklı düzeyden olur. |
| Öğrenci kendi sınıfında oturabilir | Varsayılan budur. İsterseniz "kendi sınıfında sınava girmesin" seçeneğini açabilirsiniz. |
| Her sınıfın öğrencileri salonlara dengeli dağılır | Her zaman uygulanır. |

Sınıf düzeyi, sınıf adının başındaki sayıdan anlaşılır: `9/A`, `9-B`, `9C` hepsi 9. düzeydir. Planda **aynı renk aynı düzey** demektir.

Dağıtımdan sonra her kuralın kaç kez ihlal edildiği ekranda gösterilir. Planda kural dışı oturan öğrenciler **!** işaretiyle belirtilir.

## Çıktılar

Uygulamada ve çıktılarda öğrenci için yalnızca **adı soyadı** ve **sınıfı** yazar. Numara, cinsiyet ya da sıra no yazmaz.

- **Oturma planları:** Her salon için, tahtaya göre sıra sıra yerleşim gösterilir. Her koltukta öğrencinin adı ve sınıfı yazar. Sağ alt köşede iri harflerle **sıra numarası** yer alır. Numaralar önden arkaya ve soldan sağa sayılır; aynı numara sınav yerleri listesinde ve aramada da yazar.
- **Öğrenci imza listeleri:** Adı soyadı, sınıfı ve imza sütunu vardır.
- **Sınıflara göre sınav yerleri:** Her şube için ayrı bir sayfa hazırlanır. Her öğrenci için şunlar yazar: hangi salonda, **sıra no**, hangi **sıra grubunda** (Sol / Orta / Sağ ya da Kapı tarafı / Orta / Pencere tarafı), **önden kaçıncı sırada** ve sıranın hangi koltuğunda oturacağı. Her şubenin listesi tek sayfaya sığdırılır. Sıra gruplarının adını 2. Sınav bilgileri adımında seçersiniz. Oturma planında da grup adları sütunların üstünde, sıra numaraları da solda yazar. Sınıflara asmak ya da duyurmak için kullanabilirsiniz.
- **Sınav kâğıdı dağıtımı:** Kâğıtları kolayca dağıtmak için hazırlanmış bir sayfa. En üstte **kâğıt hazırlama kartları** vardır:
  - **Salona göre (zarf):** Her kart bir salonun zarfıdır. Örneğin "9/A salonu: 9/A 6, 9/B 5, 10/A 5… Toplam 30". Bir şubenin kâğıtlarını zarfa koyunca satırı işaretleyin. Bütün satırlar işaretlenince kart yeşile döner ve "Zarf hazır" yazar. Gözetmen zarfını alıp gider.
  - İşaretler dağıtımla birlikte saklanır, sayfayı kapatsanız da kaybolmaz.
  - **Düzey özeti:** Kartların üstünde her düzeyden toplam kaç öğrenci (kâğıt) olduğu yazar, yanında şube şube sayılar ve genel toplam vardır. Örnek: "9. sınıf 192: 9/A 28, 9/B 35…". Her salon kartının altında o salondaki düzey toplamları vardır.
  - **WhatsApp'ta paylaş:** Kâğıt dağılımını telefona uygun bir mesaj olarak hazırlar. Mesajı tüm düzeyler için ya da yalnızca bir düzeyin öğretmenleri için (ör. "9. sınıf öğretmenleri için") oluşturabilirsiniz. **WhatsApp'ta aç** ile doğrudan gönderebilir, **Mesajı kopyala** ile bir gruba yapıştırabilir ya da tablette **Paylaş…** düğmesini kullanabilirsiniz.
  - **Öğretmenler odası için yazdır:** Ekrandaki kartların aynısını, öğretmenler odasına asılacak şekilde basar. Her kartta salon adı, şubeler ve kâğıt sayıları yazar; yanlarında kalemle işaretlenecek kutular vardır. Bir sayfaya 8 karta kadar sığar.

  Kartların altında ayrıca şunlar var:
  - Her salona hangi sınıf düzeyinden kaç kâğıt gideceğini gösteren tablo.
  - Hangi şubeden kaç öğrenci olduğunu gösteren ayrıntılı tablo. Satır ve sütun toplamları da yazar.
  - Her salonun kâğıt zarfına yapıştırılacak etiketler.

  Ayrıca her oturma planının ve yoklama listesinin üstünde "Bu salonda: 9. sınıf 11 (9/A 6, 9/B 5)…" özeti yer alır.
- **Öğrenci ara:** Ada göre arayıp öğrencinin salonunu bulabilirsiniz.
- **Yazdır / PDF kaydet:** Her salon ayrı A4 sayfaya basılır. **Excel'e aktar (CSV)** ile tüm dağıtımı Excel'e alabilirsiniz.

## Öğrenci silme

Nakil giden ya da sınava girmeyecek bir öğrenciyi üç yerden silebilirsiniz:

- **Sınıf kartı:** Kartı açıp öğrencinin satırındaki **Sil** düğmesine basın.
- **Öğrenci ara:** Sonuçtaki **Öğrenciyi sil** düğmesine basın.
- **Oturma planı:** Öğrenciye tıklayın, çıkan çubukta **Öğrenciyi sil** düğmesine basın.

Silmek için düğmeye iki kez basılır. Dağıtım yapılmışsa öğrencinin koltuğu "Boş" kalır ve yeniden dağıtım gerekmez.

## Şubeler ve şube seçimi

- Yüklenen listelerdeki sınıflar şube şube ayrılır ve düzeylere göre gruplanır (9. sınıflar, 10. sınıflar…).
- Sınıf adı şu yerlerden okunur: sayfa başlığı ("9. Sınıf / A Şubesi"), her satırdaki "Sınıfı" sütunu ("9/A") ya da dosya adı.
- **3. Dağıtım** adımında iki ayrı seçim yaparsınız. İkisinde de tek tek şube seçebilir ya da bir düzeyin hepsini birden açıp kapatabilirsiniz.
  - **Öğrencileri sınava girecek şubeler:** Hangi şubelerin öğrencileri dağıtılacak?
  - **Sınav salonu olarak kullanılacak sınıflar:** Öğrenciler hangi sınıflara oturtulacak? İşaretini kaldırdığınız sınıfa hiç öğrenci oturtulmaz. O şubenin öğrencileri yine sınava girer ve başka salonlara dağıtılır. Öğrencileri sınava girmeyen bir sınıfı da salon olarak kullanabilirsiniz.
  - Salonları azaltınca koltuk yetmezse uygulama uyarır. Bu durumda daha fazla salon seçin ya da "Salon mevcudunu ben belirleyeceğim" ile kapasiteyi artırın.

## Salon kapasitesi

Varsayılan kural geçerlidir: her şube salonuna, o şubenin mevcudu kadar öğrenci oturur.

İsterseniz 3. Dağıtım adımında **Salon mevcudunu ben belirleyeceğim** seçeneğini işaretleyin. Bu seçenek işaretlenmezse varsayılan kural kullanılır. İşaretlerseniz:

- Her salonun yanına kaç öğrenci oturacağını yazarsınız. "Tüm salonlara" kutusuyla hepsine aynı sayıyı verebilirsiniz.
- 0 yazdığınız sınıf salon olarak kullanılmaz; o şubenin öğrencileri yine başka salonlara dağıtılır.
- Koltuk sayısı öğrenci sayısından fazlaysa salonlar orantılı dolar. Boş koltuklar aynı düzeydeki öğrencileri ayırmak için kullanılır ve planda "Boş" görünür.
- Koltuk yetmezse uygulama dağıtımı başlatmaz ve kaç öğrenci için yer eksik olduğunu söyler.

## Sınav evrakını tek seferde yazdırma

Dağıtımdan sonra **Sınav evrakını yazdır** düğmesine basın. Açılan pencerede o oturumun tüm evrakı seçili gelir. Her birinin yanında kaç sayfa tutacağı yazar:

1. Oturma planları: her salon için 1 sayfa
2. Öğrenci imza listeleri: her salon için 1 sayfa
3. Sınıflara göre sınav yerleri: her şube için 1 sayfa
4. Kâğıt dağıtım tablosu
5. Zarf etiketleri

İstemediklerinizin işaretini kaldırıp **Yazdır**'a basın. Seçtikleriniz bu sırayla, her biri yeni sayfadan başlayarak tek seferde basılır. Yazıcı penceresinde "PDF olarak kaydet"i seçerseniz tüm evrak tek bir PDF dosyası olur. Uygulama seçiminizi hatırlar. Aynı düğme **Kayıtlı sınavlar**'da açtığınız her sınavda da vardır.

Tek bir bölümü yazdırmak için **Bu bölümü yazdır**, tek bir sayfa için de o sayfanın **Yazdır** düğmesini kullanın.

## Çift taraflı yazdırma

2. Sınav bilgileri adımındaki **Çift taraflı yazdırıyorum** seçeneği varsayılan olarak açıktır. Aynı seçenek sınav evrakı penceresinde de vardır. Açıkken şöyle çalışır:

- **Ayrı kâğıt:** Her salonun ve her şubenin evrakı yeni bir kâğıdın ön yüzünden başlar. İki farklı salonun planı aynı kâğıdın iki yüzüne basılmaz.
- **Boş sayfa:** Tek sayfalık evrakın arkasına "çift taraflı yazdırma için boş bırakılmıştır" yazan bir sayfa eklenir. Birden çok sayfalık evrakın sayfaları ise aynı kâğıdın ön ve arka yüzüne sırayla basılır.
- **Ölçüm:** Basmadan önce her sayfa ölçülür. Sayfa sınırına çok yakın olanlar biraz küçültülür, böylece bir salonun planı iki kâğıda bölünmez.
- **Yazıcı ayarı:** Yazıcı penceresinde "Çift taraflı" (iki tarafa yazdır) ayarını da açmayı unutmayın.

Tek bir sayfayı **Yazdır** düğmesiyle bastığınızda boş sayfa eklenmez.

## Kayıtlı sınavlar (haftalık / iki haftalık program)

Her sınavın dağıtımını kaydedip daha sonra istediğiniz an açabilirsiniz.

1. 2. adımda sınav adını, tarihini ve saatini yazın.
2. Dağıtımı yapın ve **Bu dağıtımı kaydet** düğmesine basın.
3. Sıradaki sınav için bilgileri değiştirip aynı adımları tekrarlayın.

Kaydedilen sınavlar **4. Kayıtlı sınavlar** bölümünde haftalara göre sıralanır. Sayfanın üstündeki **Kayıtlı sınavlar** düğmesiyle de bu bölüme gidebilirsiniz.

- **Süzme:** Yaklaşan, Önümüzdeki 2 hafta, Geçmiş ya da Tümü.
- **Aç:** Sınavın oturma planlarını, yoklama listelerini ve sınıflara göre sınav yerlerini gösterir. Buradan yazdırabilir ya da Excel'e aktarabilirsiniz.
- **Kayıtlar bağımsızdır:** Her kayıt, kaydedildiği andaki öğrenci listesini saklar. Sonradan listeleri değiştirmeniz eski kayıtları bozmaz.
- **Güncelleme:** Aynı ad, tarih ve saatle tekrar kaydederseniz önceki kaydın yerine geçer.

## Kayıt ve yedek

Yüklediğiniz şubeler, ayarlar ve son dağıtım **otomatik olarak bu tarayıcıya kaydedilir**. Uygulamayı kapatıp açtığınızda listeleri yeniden yüklemeniz gerekmez.

İki durumda bu kayıt kaybolur:
- tarayıcı geçmişi ya da site verileri temizlenirse,
- başka bir bilgisayar ya da başka bir tarayıcı kullanılırsa.

Bu yüzden **Yedek al** düğmesiyle verileri (kayıtlı sınavlar dahil) bir `.json` dosyası olarak saklayın. Gerektiğinde **Yedekten yükle** ile geri getirebilirsiniz. Yedek dosyası öğrenci isimlerini içerir; güvenli bir yerde saklayın.

## PDF hakkında

- PDF'in **metin içeren** bir PDF olması gerekir. e-Okul'dan "PDF olarak kaydet / yazdır" ile alınan listeler böyledir.
  Kâğıttan taranmış (fotoğraf) PDF'lerde metin olmadığı için okunamaz. Bu durumda uygulama sizi uyarır, listeyi elle yapıştırabilirsiniz.
- Öğrenci satırları "sıra no, öğrenci no, ad, soyad, cinsiyet" düzenindeki tablolardan tanınır. Türkçe harflerin parça parça yazıldığı PDF'ler de doğru birleştirilir. Sütun sırası biraz farklı olsa da genellikle doğru okunur. Yine de yükledikten sonra sayıları kontrol edin.
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
