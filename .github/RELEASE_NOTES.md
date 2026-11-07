## Tablet ve telefonda

**`…-tablet.html`** dosyasını indirip açın. Uygulamanın tamamı bu tek dosyanın içinde; ayıklama ve internet gerekmez.

## PC'de kurulum

1. Aşağıdaki **Assets** bölümünden `Kelebek-Sinav-Dagitimi-….zip` dosyasını indirin.
2. ZIP'e sağ tıklayıp **Tümünü ayıkla** deyin. ZIP'in içinden doğrudan açarsanız PDF'ler okunmaz.
3. Çıkan klasördeki **`index.html`** dosyasını çift tıklayın. Chrome, Edge ya da Firefox'ta açılır.

Kurulum ve internet gerekmez. Öğrenci listeleri bilgisayardan dışarı çıkmaz.

## Bu sürümde (v1.27.0)

- **Kapı ve pencere ayarı öğretmen bakışıyla.** 2. adımdaki ayar artık "Kapı ve pencereler nerede?" diye soruyor; seçenekler öğretmen masasından bakışa göre yazılı: "pencereler SAĞDA, kapı solda" ya da "pencereler SOLDA, kapı sağda". Yeni kurulumlarda varsayılan "pencereler sağda".
- **Planda kapı ve pencere işareti.** Oturma planının iki yanında, yönlendirme afişindeki gibi KAPI ve PENCERE yazıyor. Altta "Plan, tahtaya bakan öğrencinin gözünden çizilmiştir" notu var. Afişin 2. adımında pencerelerin hangi tarafta olduğu da yazıyor.

## Önceki sürümde (v1.26.0)

- **Yalnızca ad soyad ve sınıf.** Bazı e-Okul listelerinde ad soyaddan sonra gelen "Erkek / Kız" ve "Yatılı / Gündüzlü / Paralı-Yatılı" sütunları ada ekleniyordu ("ZİKRETTİN YILMAZ Erkek Yatılı"). Artık alınmıyor. Daha önce yüklenmiş listelerdeki bu ekler uygulama açılınca kendiliğinden temizleniyor ve size bildiriliyor; kayıtlı sınavlar da düzeltiliyor.
- **Öğrenci yönlendirme afişi.** Dağıtım çıktılarına "Yönlendirme afişleri" eklendi; sınav evrakı paketinde de seçilebiliyor. Her salon için bir sayfa, kapıya oturma planının yanına asılır:
  - salon adı büyük harflerle;
  - "Yerinizi 3 adımda bulun": adınızı bulun → yüzünüzü tahtaya dönün (kapı hangi tarafınızda) → numaraları nasıl sayacağınız;
  - salon krokisi: tahta, kapı ve pencere, sıra grupları, "1. sıra en ön" ve "siz buradan bakıyorsunuz" işareti, 1 numara koyu;
  - ada göre sıralı liste: yer numarası ve "Kapı tarafı grubu · önden 3. sıra · sol koltuk" biçiminde yeri.
  Afişteki numaralar oturma planındakilerle aynıdır.

## Daha önce (v1.25.0)

- **📅 Planlanmış sınavlar.** 2. adımda (ve sarı **Sınav bilgileri** penceresinde) bir düğme var. Takvimle eklenen bütün sınavlar tek tabloda: tarih, ders saati, sınava giren şube sayısı, dersler, durum (Bugün / Seçili / ✓ Kayıtlı). **Seç** ile tarih, ders saati, şubeler ve salonlar hazır gelir. Geçmiş sınavlar ve bilgi notları katlanmış duruyor; kontrol edilmesi gerekenler en üstte tek kutuda.
- **Elle giriş eskisi gibi.** Planlanmış sınav seçmeden bilgileri elle girebilirsiniz. Seçiliyken tarihi ya da ders saatini elle değiştirirseniz bağlantı kendiliğinden kalkar ve size bildirilir. "Seçimi kaldır, elle gir" düğmesi de var.
- **Sade arayüz.**
  - 2. adımdaki büyük takvim kartı kaldırıldı; yerinde tek satır var: "Seçili: 5 Kasım 2026 Perşembe · 2. ders · 14 şube sınavda".
  - Dağıtım sayfasındaki takvim paneli tek satırlık özete indi; yalnız kontrol gerektiren uyarılar görünüyor. Şube grupları "Şubeleri göster" ile açılıyor.
  - "Kaynak: …" gibi bilgi notları artık uyarı olarak çıkmıyor; yalnız "teyit edin" gibi dikkat isteyen notlar ilgili günde gösteriliyor.
  - Şube seçiminde ders adları kaldırıldı; sınavı olmayan şubeler soluk ve "sınavsız" yazıyor.
  - Uyarı cümleleri kısaltıldı.

## Daha önce (v1.24.0)

- **Şablon değişse de okunur.** Takvim okuyucu artık şunları da tanıyor:
  - birden çok sayfa (örneğin her düzey ayrı sayfada; aynı tarih ve ders saatindeki şubeler birleşiyor), takvim içermeyen sayfalar atlanıyor;
  - "Şube", "Sınıf/Şube" gibi farklı başlıklar; başlık hiç yoksa şube adlarının olduğu sütun;
  - gerçek Excel tarih hücreleri, "3 Kasım 2026", yılsız "3 Kasım Salı" (yıl başlıktaki eğitim yılından alınıyor);
  - "2. Ders", "Ders 2", "2. Ders (10:40)" ya da yalnız saat; ders saati tarih hücresinin içinde de olabilir;
  - şube adları "9-A", "9/A", "9 A", "9A", "9. Sınıf / A Şubesi"; bir düzeyin tümü için tek satır ("9. Sınıflar").
  Tarih olmayan sütunlar ("Açıklama" gibi) ve şube olarak tanınamayan satırlar atlanıyor ve bildiriliyor.
- **Yükleme önizlemesi.** Dosya seçilince uygulama önce dosyadan ne anladığını gösteriyor: oturumlar, şube sayıları, dersler, listesi uygulamada olmayan şubeler, boş hücreler ve notlar. Siz **Onayla** demeden hiçbir şey kaydedilmiyor.
- **Takvime ekleme.** Yeni dosya eskisinin yerine geçmiyor, üzerine ekleniyor: aynı tarih ve ders saatindeki oturumlar güncelleniyor, diğerleri korunuyor. İsterseniz "Eski takvimi tamamen değiştir" de seçebilirsiniz. Salon onayları ve kayıtlı sınav bağlantıları korunuyor.
- **Boş şablon indir.** Uygulamanın okuduğu biçimde, yüklü şubelerinizle hazırlanmış bir Excel şablonu indirilebiliyor. İçinde "Kurallar" sayfası da var. Takvim kartında **Şablon kuralları** bölümü de bulunuyor.
- Geçmiş oturumlar takvim kartında katlanmış duruyor; şube adı eşleştirmesi farklı yazılmış eğik çizgi ve tire karakterlerine karşı güçlendirildi.

## Daha önce (v1.23.0)

- **Sınav takvimi (Excel).** 2. adımda **Sınav takvimini yükle** düğmesiyle şube bazındaki ortak sınav takvimi (.xlsx) yükleniyor. Dosya internetsiz, bilgisayarın içinde okunuyor. Tarihler, ders saatleri, her şubenin dersi ve tablonun altındaki notlar alınıyor. "—" ya da boş hücre "sınav yok" sayılıyor; boş hücreler ayrıca uyarı olarak gösteriliyor.
- **Oturum seçimi.** Takvim kartında gün gün oturumlar var (örn. "5 Kasım Perşembe · 2. ders · 14 şube sınavda"). Bir oturum seçilince tarih ve ders saati dolduruluyor. Sınavı olan şubeler dağıtıma ve salon olarak seçiliyor. Okul adı ve dönem/sınav adı boşsa takvim başlığından alınıyor. Oturum, sarı **Sınav bilgileri** penceresinden de seçilebiliyor.
- **Sınavı olan / olmayan şubeler.** Dağıtım sayfasında seçili oturum için şubeler gruplanıyor: sınavı olanlar (dersiyle), sınavı olmayanlar, takvimde olmayanlar, listesi yüklenmemiş olanlar.
- **Sınavı olmayan sınıf salon olmaz.** O saatte sınavı olmayan sınıfın öğrencileri kendi sınıfında olduğu için o sınıf salon listesinde kilitli (🔒) görünüyor. Salon olarak açmak sizin onayınıza bağlı: "Onay ver, salon yap" düğmesi onay soruyor. Onay o oturuma özel saklanıyor ve geri alınabiliyor.
- **Takvim denetimi.** Dağıtımdan önce şu durumlar bildiriliyor: listesi yüklenmemiş şube; sınavı olduğu hâlde seçilmeyen ya da sınavı olmadığı hâlde seçilen şube; takvimde boş hücre; o günle ilgili takvim notları; tarih/ders saati uyuşmazlığı; salonların yetmemesi; bir düzeyin sıra sayısını aşması (aynı düzeyden sıra arkadaşı kaçınılmaz). Gerektiğinde hangi sınavsız sınıfın salon olarak açılabileceği düğmeyle öneriliyor. Uyarılar dağıtımın durum çubuğuna da yazılıyor.
- **Çıktılarda ders adı.** Kâğıt hazırlama kartları, zarf etiketleri, öğretmenler odası listesi, sınav yerleri, WhatsApp özeti ve Excel (CSV) dosyasında her şubenin sınav dersi yazıyor. Tek ders varsa belge başlığında "Sınav dersi" görünüyor.
- **Kayıtla bağlantı.** Kaydedilen dağıtımlar takvimde "✓ kayıtlı" olarak işaretleniyor. Takvim yedek dosyasına da dahil.

## Daha önce (v1.22.0)

- **Elle öğrenci ekleme.** Sınıf listeleri sayfasındaki **Öğrenci ekle / sil** kutusunda öğrencinin adını yazıp şubesini seçin, **Öğrenciyi ekle**'ye basın (ya da Enter). Öğrenci şube listesine alfabetik sırayla eklenir. Aynı şubede aynı adla biri varsa önce uyarı çıkar; gerçekten ikinci kişiyse "Yine de ekle" deyin.
- **Silmeyi geri al.** Bir öğrenci silinince kutuda "Silindi: … · Geri al" satırı çıkar. Geri al, öğrenciyi aynı şubeye ve aynı yere geri koyar. Bu düğme sayfa açık kaldığı sürece görünür.
- Ekleme ya da geri alma sonrası hazır dağıtım "güncel değil" olarak işaretlenir; yeniden dağıtım yapmanız istenir.

## Daha önce (v1.21.0)

- **Öğrenci silme Sınıf listelerinde.** 1. adımda, şube kartlarının üstünde **Öğrenci sil** kutusu var. Öğrencinin adını yazınca eşleşen öğrenciler şubeleriyle birlikte listeleniyor. Aynı adlı iki öğrenci varsa ayrı satırlarda görünüyor. Yanlışlıkla silmeye karşı "Öğrenciyi sil" düğmesine iki kez basmak gerekiyor.
- Silme düğmesi "Öğrenci ara" sayfasından kaldırıldı; o sayfa artık yalnızca öğrencinin sınav yerini gösteriyor.
- Hazır bir dağıtım varken öğrenci silinirse dağıtım sıfırlanıyor ve yeniden dağıtım yapmanız isteniyor. Kayıtlı sınavlar değişmiyor.

## Daha önce (v1.20.0)

- **"Dağıtımı kilitle" öne çıktı.** Düğme Diğer menüsünden alındı, **Kaydet**'in hemen sağında duruyor. Kilitliyken sarı görünüyor ve "Dağıtım kilidini aç" yazıyor.
- **Çıktı tasarımı önizlemesi.** 2. adımdaki "Çıktı tasarımı" seçiminin altında, seçilen tasarımla basılmış örnek bir **oturma planı** ve **imza listesi** görünüyor. Tasarımı değiştirince önizleme hemen değişiyor. Önizlemede hayali öğrenciler var; okul adı ve sınav bilgileri sizin girdiğiniz gibi görünüyor.
- **Kapsamlı test.** Dağıtım, 1500 rastgele sanal okulda denendi: 1–5 düzey, düzey başına 1–8 şube, şube başına 5–42 öğrenci; tekli/ikili sıra, 2–4 sıra grubu, öğretmen kapasitesi, ek salonlar, "kendi sınıfında oturmasın" seçeneği. Bütün denemelerde herkes bir kez yerleşti ve salon kapasitesi aşılmadı. Yer yeterliyse aynı düzeyden sıra arkadaşı hiç çıkmadı.
- **Çıktıların verileri karşılaştırıldı.** Üç sanal okulda (703 öğrenci) oturma planı, imza listesi, sınav yerleri, kâğıt tablosu, zarf etiketleri, kâğıt hazırlama kartları, WhatsApp özeti ve Excel (CSV) dosyası satır satır karşılaştırıldı; uyuşmayan kayıt çıkmadı. Evrak paketinde her belge tek sayfaya sığdı. Çift taraflı baskıda her salon ve şube yeni bir kâğıttan başladı.

## Daha önce (v1.19.0)

- **Kurumsal belge tasarımı.** Tüm çıktılar ortak bir düzene geçti: üstte antet (okul adı), belge adı bandı ve sınav bilgileri kutusu var; altta belge numarası yer alıyor. İmza listesinde sıra numarası, kâğıt tablosunda "Hazırlayan / Kontrol eden" imza alanları eklendi.
- **Üç tasarım seçeneği.** 2. adımdaki "Çıktı tasarımı" ayarından seçiliyor:
  - **A · Kurumsal:** lacivert vurgulu.
  - **B · Resmî:** tamamen siyah-beyaz ve çerçeveli; fotokopiye en uygun olanı.
  - **C · Modern:** ferah, ince çizgili.
- **Tek sayfaya sığdırma düzeltmesi.** Çok kalabalık salonların imza listesi küçültülse de A4 sınırında kalıyor ve alt bilgi sonraki sayfaya taşıyordu; çift taraflı baskıda sıra kayıyordu. Küçültme artık ölçülerek yapılıyor.
- **Harf taşması düzeltmesi.** Art arda basılan sayfalarda bir sonraki sayfanın antetindeki İ/Ğ işaretleri önceki sayfanın altına basılıyordu; düzeltildi.

## Daha önce (v1.18.0)

- **Raporlar ekranın üstünden başlıyor.** Oturma planı, imza listesi ve sınav yerlerinin üstündeki büyük özet kutusu ile istatistik etiketleri kaldırıldı. Yerine tek satırlık bir durum çubuğu geldi: "✓ 174 öğrencinin hepsi yerleşti · aynı sırada aynı düzey yok". Ayrıntılar tıklanınca açılıyor; sorun varsa çubuk sarı oluyor ve sorunları yazıyor.
- **Düğmelerde önem sırası.** Öne yalnızca **Kaydet** ve **Sınav evrakını yazdır** çıktı. "Bu bölümü yazdır", "Excel'e aktar" ve "Dağıtımı kilitle" **Diğer ▾** menüsünde. Kilitliyken durum çubuğunda "🔒 Kilitli" yazıyor.
- **"Belirtilmedi" kalabalığı kalktı.** Girilmeyen sınav bilgileri başlıklara ve kâğıda yazılmıyor. Sınav adı ya da tarih eksikse dağıtım düğmesinin altında bir hatırlatma ve "Sınav bilgilerini gir" bağlantısı çıkıyor.
- **Dağıtım kodu sayfanın altında.** Kod başlıktan kaldırıldı; her sayfanın altında küçük yazıyla duruyor.
- **Sınav salonları.** Salon seçimi varsayılan olarak tek satır: "Salonlar: sınava girenlerle aynı (6 salon) · Değiştir". Açılınca şube seçiminden farklı, mavi salon kutucuklarıyla görünüyor.
- **Bildirimler** sağ altta, sarı "Sınav bilgileri" düğmesinin üstünde çıkıyor ve daha kısa süre görünüyor.
- **Sarı "Sınav bilgileri" düğmesi kaldı.** Her sayfadan tek tıkla sınav bilgilerini girip dağıtım yapılabiliyor. Sayfanın sonundaki içerik artık bu düğmenin altında kalmıyor.
- **Tablet düzeltmesi.** İçerik kısa olduğunda üst menü uzayıp boşluklu görünüyordu; düzeltildi.
- **Kâğıtta isimler** artık kelime ortasından bölünmüyor.

## Daha önce (v1.17.1)

- **Yan menü düzeltmesi.** Codex güncellemesinden sonra bazı bilgisayar ve tabletlerde yan menüye tıklayınca sayfa değişmiyordu. Bütün bölümler alt alta açık kalıyordu. Sebep, eski tarayıcılarda bulunmayan bir özelliğin (`Object.hasOwn`) kullanılmasıydı. Her tarayıcıda çalışan karşılığıyla değiştirildi ve bunu denetleyen bir test eklendi.

## Daha önce (v1.17.0)

Bu sürüm, Codex ile yapılan güncellemeleri içerir. Ayrıntılar depodaki `Guncelleme-Notlari.md` ve `Hata-Senaryolari-Denetimi.md` dosyalarında.

- **WhatsApp için kâğıt listesi.** Mesaj ve telefon görseli (PNG) hazırlanabiliyor. Düzey seçilebiliyor, her salon için düzey toplamları renkli etiketlerle gösteriliyor. Paylaşımda öğrenci adı yok.
- **Sınav bilgileri.** Sınav (1./2. Dönem, 1./2. Sınav), ders saati (1–8) ve ek başlık listeden seçiliyor. Bu bilgiler tüm çıktılara, CSV'ye, paylaşıma ve arşive aktarılıyor.
- **Dağıtım kilidi ve sürüm numarası.** Kilitli dağıtım değiştirilemiyor. Basılı evrak, CSV ve paylaşım aynı dağıtım numarasını taşıyor.
- **Dağıtım kontrol özeti.** Beklenen ve yerleşen öğrenci, tekrar ve kapasite denetimi var; salon bazında komşuluk uyarıları gösteriliyor.
- **İmza listesi.** Sınav kuralları ve gözetmen ad-soyad/imza alanı eklendi.
- **Sınav yerleri.** Sınıflar açılır listeler halinde görünüyor; her şubenin listesi tek A4 sayfa.
- **Oturma planı.** Her salonun planı her zaman tek sayfaya sığdırılıyor.
- **Menü.** Raporlar ayrı sayfalarda açılıyor; "Dağıtım ayarları"na tek tıkla dönülüyor.
- **Görünüm.** Beyaz tema ve belirgin düğmeler var. Harici yazı tipi yok; uygulama tamamen çevrimdışı çalışıyor.
- **Hata düzeltmeleri.** Tekli sıralarda daha iyi dağıtım yapılıyor. Hatalı ya da eksik veriler dağıtımdan önce denetleniyor. Depolama dolu olduğunda işlemler güvenle geri alınıyor.
- **Testler.** Kayıt/arşiv, paylaşım, kilit ve dağıtım doğruluğu testleri eklendi.

## Daha önce (v1.16.0)

- **WhatsApp'ta paylaş.** Kâğıt dağılımı telefona uygun bir mesaja dönüştürülüyor. Mesaj tüm düzeyler için ya da sadece bir düzeyin öğretmenleri için hazırlanabiliyor; tek tıkla WhatsApp'ta açılıyor ya da kopyalanıyor.
- **Sınav yerleri tek sayfa.** Krokiler kaldırıldı; her şubenin listesi tek kâğıda sığdırılıyor. Oturma planı ve imza listeleri de her zaman tek sayfa.
- **Öğrenci silme.** Öğrenci sınıf kartından, aramadan ya da oturma planından silinebiliyor; koltuğu boş kalıyor, yeniden dağıtım gerekmiyor.
- **Zarf etiketleri yeniden tasarlandı.** Etiketler sıkı ve kesik çizgili; bir sayfaya 8 etiket sığıyor.
- **"Şubeye göre" bölümü kaldırıldı.** Kâğıt hazırlama artık yalnızca salona göre.

## Daha önce (v1.15.0)

- **Tablet için tek dosya.** Tabletlerde index.html tek başına açılınca görünüm ve PDF okuyucu yüklenmiyordu. Her şeyi içinde taşıyan tek dosyalık sürüm eklendi.

## Daha önce (v1.14.0)

- **Çift taraflı yazdırma.** Her salonun ve şubenin evrakı ayrı bir kâğıttan başlıyor. Gereken yerlere boş sayfa ekleniyor; iki farklı salonun planı artık aynı kâğıdın iki yüzüne düşmüyor. Sayfalar basmadan önce ölçülüyor ve sınıra yakın olanlar küçültülüyor. Bu ayar 2. adımda ve sınav evrakı penceresinde açılıp kapatılabiliyor.
- **Düzey toplamları.** Kâğıt hazırlama kartlarında ve öğretmenler odası çıktısında her düzeyin toplam öğrenci/kâğıt sayısı, şube şube sayılar ve genel toplam yazıyor. Şube kartları düzeylere göre gruplanıyor.

## Daha önce (v1.13.0)

- **Sıra numarası.** Oturma planında her koltuğun sağ alt köşesinde öğrencinin sıra numarası iri yazıyla yazıyor. Aynı numara "Sınıflara göre sınav yerleri" listesinde, öğrenci aramada ve Excel çıktısında da "Sıra no" olarak yer alıyor.

## Daha önce (v1.12.0)

- **Kartlı öğretmenler odası listesi.** Liste artık ekrandaki kâğıt hazırlama kartlarının aynısı olarak basılıyor; yatay tablo kaldırıldı. Her kartta salon adı, şubeler ve iri sayılar var; yanlarında kalemle işaretlenecek kutular bulunuyor. Bir sayfaya 8 karta kadar sığıyor.

## Daha önce (v1.11.0)

- **Öğretmenler odası listesi.** "Öğretmenler odası için yazdır" düğmesi ve sınav evrakı penceresinde yeni bir seçenek eklendi.

## Daha önce (v1.10.0)

- **Kâğıt hazırlama kartları.** "Sınav kâğıdı dağıtımı" sayfasının en üstünde her salon için bir kart var. Kartta hangi şubeden kaç kâğıt konacağı iri yazıyla yazıyor. Kâğıtları koydukça satırları işaretliyorsunuz; zarf tamamlanınca kart yeşile dönüp "Zarf hazır" oluyor. "Şubeye göre" görünümünde her şubenin destesinin salonlara nasıl bölüneceği görünüyor. İşaretler kaydediliyor.

## Daha önce (v1.9.0)

- **Sınav evrakını yazdır.** Tek düğmeyle o oturumun tüm evrakı sırayla basılıyor: oturma planları, öğrenci imza listeleri, sınıflara göre sınav yerleri, kâğıt dağıtım tablosu ve zarf etiketleri. İstemediğiniz evrakı çıkarabilirsiniz. "PDF olarak kaydet" ile hepsi tek dosya oluyor. Kayıtlı sınavlarda da kullanılabiliyor.
- **Ad değişikliği.** "Salon yoklama listeleri" artık "Öğrenci imza listeleri" adıyla görünüyor.
- **Sığdırma.** İmza ve yer listeleri yazdırıldığında tek sayfaya sığacak şekilde sıkıştırıldı.

## Daha önce (v1.8.0)

- **"Dizi" yerine "sıra grubu".** Yan yana duran sıra grupları adıyla yazılıyor. 2. adımda şu üç seçenekten birini seçebilirsiniz:
  - Sol – Orta – Sağ
  - Kapı tarafı – Orta – Pencere tarafı
  - Pencere tarafı – Orta – Kapı tarafı
- **Sıra ve koltuk da açık yazılıyor.** Örnek: "Pencere tarafı · önden 3. sıra · kapı tarafı koltuk".
- **Mini kroki.** Sınıflara göre listede ve aramada her öğrencinin yanında salonun küçük bir krokisi var; öğrencinin koltuğu işaretli.
- **Planda etiketler.** Oturma planında grup adları sütunların üstünde, sıra numaraları da solda yazıyor.

## Daha önce (v1.7.0)

- **Sınav kâğıdı dağıtımı.** Yeni bir sayfada her salona hangi düzeyden ve hangi şubeden kaç kâğıt gideceği yazıyor. Satır ve sütun toplamları da var. Sayfada salon zarflarına yapıştırılacak etiketler de bulunuyor.
- **Salon özeti.** Her oturma planının ve yoklama listesinin üstünde o salondaki öğrencilerin düzey ve şubelere göre dağılımı görünüyor.
- **Kayıtlı sınavlarda da var.** Bu bilgiler kayıtlı sınavlarda da açılıp yazdırılabiliyor.

## Daha önce (v1.6.0)

- **Yan panel.** Menüler soldaki panelde. Panelde dört adım var: Sınıf listeleri, Sınav bilgileri, Dağıtım, Kayıtlı sınavlar. Dağıtım çıktıları (oturma planları, yoklama listeleri, sınıflara göre sınav yerleri, öğrenci arama) ve yedek düğmeleri de burada. Sağda her seferinde tek bir bölüm görünür; telefonda menü üstte durur.

## Daha önce (v1.5.0)

- **Salon seçimi.** Öğrencilerin oturacağı sınıflar, sınava giren şubelerden ayrı seçiliyor. İstemediğiniz sınıfları salon olmaktan çıkarabilirsiniz. O şubenin öğrencileri yine başka salonlarda sınava girer. Öğrencisi sınava girmeyen bir sınıfı da salon yapabilirsiniz.

## Daha önce (v1.4.0)

- **Kayıtlı sınavlar.** Her sınavın dağıtımını adı, tarihi ve saatiyle kaydedebilirsiniz. Haftalık ya da iki haftalık programın tüm sınavları haftalara göre listelenir. Her sınav istediğiniz an açılabilir, yazdırılabilir ve Excel'e aktarılabilir. Kayıtlar yedek dosyasına da girer.
- **Kapasite artık bir seçenek.** "Salon mevcudunu ben belirleyeceğim" işaretlenmezse önceki kural geçerlidir: her salona sınıf mevcudu kadar öğrenci oturur.

## Daha önce (v1.3.0)

- **Salon kapasitesi seçimi.** Dağıtımı iki şekilde yapabilirsiniz:
  - sınıf mevcuduna göre,
  - sizin belirlediğiniz mevcuda göre: her salona istediğiniz sayıyı yazın, 0 yazdığınız sınıf salon olmaz.
- **Boş koltuklar.** Koltuk sayısı fazla olursa boş koltuklar aynı düzeydeki öğrencileri ayırmak için kullanılıyor. Planda bir öğrenciyi boş koltuğa da taşıyabilirsiniz.

## Daha önce (v1.2.0)

- **Sınıflara göre sınav yerleri listesi.** Her şube için ayrı bir sayfa hazırlanıyor. Her öğrencinin salonu, sıra grubu, sırası ve koltuğu yazıyor. Sayfalar yazdırılabiliyor ve Excel'e aktarılabiliyor.
- **Yedek al / Yedekten yükle.** Veriler zaten tarayıcıya otomatik kaydediliyor. Artık bir dosyaya yedeklenip başka bir bilgisayara da taşınabiliyor.

## Daha önce (v1.1.0)

- **PDF okuma düzeltildi.** Türkçe harflerin parça parça yazıldığı e-Okul PDF'leri doğru okunuyor. Tek dosyadaki şubeler ayrı ayrı tanınıyor.
- **Şubeler gruplanıyor.** Şubeler düzeylere göre gruplanıyor ve dağıtıma girecekler elle seçilebiliyor.
- **Plan sadeleşti.** Oturma planında yalnızca öğrencinin adı ve sınıfı yazıyor.

## Neler var?

- Sınıf listesi PDF'lerini (e-Okul) okuma: sınıf adını başlıktan ya da dosya adından alır, çok sayfalı listeleri ve tek dosyada birden çok sınıfı okur.
- Her sınıf aynı zamanda bir sınav salonu olur ve mevcudu kadar öğrenci alır.
- **Aynı sınıf düzeyindeki (9/A, 9/B…) öğrenciler aynı sıraya oturmaz.** Önlü-arkalı ve çapraz da aynı düzeyden öğrenci gelmemesine çalışılır.
- Öğrenci kendi sınıfında oturabilir. İsterseniz bu bir ayarla yasaklanabilir.
- Çıktılar:
  - oturma planları,
  - imzalı salon yoklama listeleri,
  - sınıflara göre "kim nerede" listesi,
  - öğrenci arama,
  - A4 yazdırma / PDF kaydetme,
  - Excel'de açılan CSV.
- Planda iki öğrenciye tıklayarak yerlerini değiştirme.
