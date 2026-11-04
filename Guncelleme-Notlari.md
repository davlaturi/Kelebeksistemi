# Kelebek — paylaşım ve arayüz güncellemesi

3 Kasım 2026

## Sınıflara göre sınav yerleri: açılır sınıf listeleri

Bu görünümde her sınıf başlangıçta kapalı bir satırdır. Sınıf adı, öğrenci sayısı
ve sağda bağımsız “Yazdır” düğmesi bulunur. Sınıf adına basınca öğrenci tablosu açılır;
yeniden basınca kapanır. Arşiv görünümünde de aynı düzen kullanılır.
Tek sınıf, tüm bölüm ve toplu evrak yazdırmada kapalı içerikler ölçümden önce
açılır; tam öğrenci tablosu basılır ve tek A4 ölçeklemesi korunur.
Varsayılan kapalılık, aç/kapat, erişilebilir genişleme durumu ve baskı öncesi
içeriğin açılması işlev testlerinden geçti. Fiziksel yazdırma test edilmedi.

## İmza listesi: sınav kuralları ve gözetmen alanı

Verilen dört sınav kuralı imza tablosunun sonuna, ince çizgiyle ayrılmış kompakt
bir bölüm olarak eklendi. Altında “GÖZETMEN AD SOYAD” ve “İMZA” alanları bulunur.
Liste, kurallar ve gözetmen alanı birlikte ölçülerek tek A4 sayfaya ölçeklenir;
öğrenci satırı silinmez veya kesilmez. Çok yüksek mevcutlarda yazı ve imza alanı
da küçülür. 1, 30, 60 ve 120 öğrencili sentetik listelerde satırların korunması,
kuralların sonda olması ve tek sayfa ölçekleme işareti test edildi. Fiziksel baskı
doğrulanmadı; A4 ve tarayıcı üst/alt bilgileri kapalı ayarı kullanılmalıdır.

## Paylaşım başlığının sınav seçimine bağlanması

“Ders / sınav başlığı” artık sınav bilgilerindeki seçimi otomatik gösterir ve
paylaşım bölümünde ayrıca düzenlenmez. Mesaj, önizleme ve PNG aynı başlığı kullanır.
Arşiv paylaşımında ilgili sınavın kayıtlı başlığı alınır. Menü ve sayfa başlığı
“Dağıtımı paylaş/dışarı aktar” olarak güncellendi. Otomatik başlık ve arşiv bağlamı testleri geçti.

## Menü geçişi düzeltmesi

Alt menü eskiden uzun dağıtım ayarlarının altındaki raporu değiştiriyordu; bu yüzden
ekranın üstünde görünür değişiklik olmuyordu. Oturma planı, imza listesi, sınav yerleri,
kâğıt dağıtımı ve öğrenci arama artık ayrı adres parçalarıyla açılır. Rapor seçilince
ayar listeleri gizlenir, başlık değişir ve görünüm yukarı alınır. “Dağıtım ayarları”
ile seçimlere dönülür; “Hazır dağıtımı görüntüle” mevcut sonucu açar. Yeni dağıtım
tamamlanınca oturma planı doğrudan açılır. Mobil alt menü erişimi korunur.
Beş rapor rotası, dört ana görünüm, ayarlara dönüş ve geçersiz rota davranışı
gerçek yönlendirme işlevleriyle, taklit DOM üzerinde regresyon testinden geçti.

## Sınav bilgileri formunun yerleşimi

Form üç bağımsız gruba ayrıldı: sınav bilgileri, salon düzeni, yazdırma ve kurallar.
Alanların satır yüksekliğine göre uzaması kaldırıldı; girişler ve seçiciler 46 px
yükseklikte hizalanır. Tarih/saat/ders aynı satırda; ek bilgi tam genişlikte ayrı
satırdadır. Mobilde iki ve tek sütuna geçiş tanımlandı. Seçicilerin kalın sol çizgileri
kaldırıldı; tutarlı kenarlık, odak vurgusu ve boşluklar kullanıldı. Pasif onay kutuları
yerine otomatik kuralları açıklayan bilgi alanı konuldu. Değiştirilebilir seçenekler
açıklamalı kartlardadır. 11 ayar alanının kimlikleri ve etiket bağlantıları korundu;
ayar aktarımı ve kayıt regresyonları geçti. Gerçek tarayıcı görüntüsü bu ortamda doğrulanamadı.

## WhatsApp düzey toplamları ve renkli ayırıcılar

WhatsApp mesajına, önizlemeye ve PNG görsellerine her salon için sınıf düzeyi
toplamları eklendi. Şube sayıları korunur. Tek düzey seçilirse yalnız o düzeyin
sayısı paylaşılır. Görsellerde 9. sınıf turuncu, 10. sınıf yeşil, 11. sınıf mor,
12. sınıf mavi etiketlerle; salonlar açık zemin ve yeşil kenar ayırıcıyla gösterilir.
Metin mesajında kalın toplamlar ve salon ayırıcıları kullanılır.
Toplamların korunması ve düzey filtresi regresyon testleri geçti. İki sayfalık
sentetik PNG örneği gerçek çizim işleviyle üretilip görsel olarak kontrol edildi.

## Son eklenenler: sınav bilgileri ve salon toplamları

- Sınav bilgileri dört seçenekli listeden seçilir: 1. Dönem 1./2. Sınav, 2. Dönem 1./2. Sınav.
- Ders saati 1–8 listesinden seçilir; gerçek saat alanı ayrıca korunur.
- İsteğe bağlı, 160 karakterlik ek başlık alanı eklendi.
- Bu bilgiler rapor başlıkları, zarf etiketleri, CSV, WhatsApp mesajı/önizlemesi/PNG,
  yedekler ve yeni arşiv kayıtlarına aktarılır. Eski arşiv kayıtları değişmez.
- Eski serbest sınav adları kaybolmaz; seçicide “önceki kayıt” olarak görünür.
- Aynı ad, tarih ve saatte farklı derslerdeki sınavlar birbirini ezmez.
- Salon kartlarında şube satırları korunurken sınıf düzeyi toplamları kartın üstünde
  kompakt, kalın sayılı bir şerit olarak gösterilir. Öğretmenler odası çıktısı da bu düzeni kullanır.
- Düz eylem düğmeleri koyu yeşil, ikincil düğmeler açık yeşil, ana işlemler turuncu,
  silme işlemleri kırmızı vurgulu hâle getirildi. Zemin beyazdır.

Doğrulama: Dört sınav × sekiz ders için başlık/etiket/paylaşım aktarımı; notların kaçışı,
yeniden açılışta korunması, arşiv çakışmasının önlenmesi ve salon düzey toplamları test edildi.
Mevcut algoritma, PDF, veri ve paylaşım testleri geçti. PNG örneği güncellenerek görsel kontrol edildi.
Gerçek tarayıcı ve fiziksel baskı doğrulaması için aşağıdaki sınırlar geçerlidir.

## Kullanım

`Kelebek-Sinav-Dagitimi.html` güncel, tek dosyalık uygulamadır. Eski uygulamada
**Yedek al**, bu dosyada **Yedekten yükle** adımlarını kullanarak verilerinizi taşıyabilirsiniz.

Dağıtım yapıldıktan sonra **Sınav kâğıdı dağıtımı → WhatsApp için kâğıt listesi**:

1. Ders/sınav başlığını yazın; paylaşılacak sınıf düzeyini seçin.
2. Önizlemede salon başına kâğıt sayıları ve şube kırılımlarını kontrol edin.
3. **WhatsApp’ta mesaj olarak aç** ile mesaj taslağını açın; alıcıyı seçip kendiniz gönderin.
4. **Telefon görseli hazırla / paylaş** ile PNG kartları üretin. Cihaz destekliyorsa
   paylaşım menüsü açılır; desteklemiyorsa her görsel için indirme bağlantısı görünür.
   İndirilen görseller WhatsApp’a fotoğraf olarak eklenebilir.
5. **Mesajı kopyala** da kullanılabilir. Yerel dosyada pano erişimi yoksa metin seçilerek sunulur.

Paylaşımda öğrenci adı veya numarası yoktur. Ders başlığı kullanıcı tarafından yazılır;
uygulamada öğretmen-ders görevlendirme verisi bulunmadığından otomatik öğretmen eşleştirmesi yapılmaz.
Uzun listeler aynı toplamı ve sayfa numarasını gösteren birden fazla telefon görseline bölünür.
Arşivde açılan sınavın paylaşımı o kaydın bağımsız dağıtımını kullanır.

## Yapılan düzenlemeler

- Beyaz zemin sabitlendi; işletim sisteminin koyu tema tercihi artık mavi/koyu zemin açmaz.
- Menü, seçili bölüm, temel eylemler, ayar alanları ve silme düğmeleri belirginleştirildi.
- Harici web fontları kaldırıldı; arayüz çevrimdışı sistem fontlarıyla çalışır.
- Öğrenci sınav yeri listelerinden ve aramadan küçük koltuk krokileri kaldırıldı.
  Salon, sıra numarası, sıra grubu ve koltuk metni kaldı. Salonun genel oturma planı korunur.
- Her şubenin sınav yeri listesi bir A4 sayfaya ölçülerek sığdırılır. Çok kalabalık
  şubelerde yazı küçülür. Yazıcıda A4 ve tarayıcı üst/alt bilgi kapalı tercih edilmelidir.
- Şubeye göre kâğıt dağıtımı/deste görünümü, şube matrisi ve buna ait yazdırma seçeneği kaldırıldı.
  Öğrencilerin kendi sınıflarına asılacak sınav yeri listesi bu değişikliğin dışında kalır.
- Zarf etiketleri iki sütunlu, salon adı ve toplamı büyük, şube sayıları aynı satırda
  gösterilen kompakt kartlara dönüştürüldü. Kâğıt kontrolü ve teslim kutuları eklendi.
- Öğrenci düzenleyicisinde açık **Sil** düğmesi bulunur; **Kaydet** ile uygulanır.
  Öğrenci aramasında **Öğrenciyi sil** iki tıklamayla kalıcı siler ve yeni dağıtım ister.
  Eski sınav arşivleri korunur; depolama başarısızsa silme geri alınır.

## Doğrulama

- Mevcut dağıtım ve PDF ayrıştırıcı testleri geçti.
- Kayıt, yedek, arşiv, düzeye göre paylaşım toplamları, öğrenci adlarının dışarıda
  tutulması, HTML kaçışı, kaldırılan görünümler ve silme/yeniden açılış testleri geçti.
- Görsel metin kırma ve uzun salon listelerinin sayfalama testleri geçti.
- Gerçek `assets/share.js` çizim işlevi Node Canvas ile çalıştırıldı;
  `WhatsApp-Sablon-Ornegi.png` sentetik verilerle üretildi ve görsel olarak incelendi.
- Tek dosya paketi yeniden üretildi; altı gömülü JavaScript betiği ayrıştırıldı.

Tarayıcı aracı önceki denemede yerel dosya protokolünü güvenlik politikasıyla engelledi.
Bu nedenle gerçek tarayıcı tıklamaları, WhatsApp gönderimi, fiziksel telefon paylaşımı
ve A4 sayfa kırılımları uçtan uca doğrulanmış değildir. Node/VM testleri görsel tarayıcı testi değildir.
GitHub'a gönderim veya canlı yayın yapılmadı. Kaynak paketinin içindeki testler yeniden çalıştırılabilir.


## Dağıtım kontrolü, kilit ve sürüm — 3 Kasım 2026
- Dağıtım kontrol özeti: beklenen/yerleşen öğrenci, tekrar, kapasite; açılır salon bazında komşuluk uyarıları.
- Dağıtımı kilitle / Dağıtım kilidini aç: kilit tarayıcı kaydında ve yedekte korunur. Kilitliyken listeler, ayarlar, salon seçimleri, yeniden dağıtım ve koltuk değişimi engellenir. Yazdırma/paylaşım açıktır.
- Her yeni dağıtımın ayrı numarası vardır. Yer değişimi veya başlık ayarı değişince sürüm ve güncelleme zamanı yenilenir. Kilit açma/kapama sürümü değiştirmez.
- Basılı evrak, CSV, WhatsApp mesajı ve PNG aynı sürüm bilgisini taşır; arşiv kendi kaydedilmiş sürümünü korur.
- Eski kayıtlarda eski dağıtım numarası ve mevcut oluşturma zamanı gösterilir; zaman yoksa açıkça belirtilir.
- Yeni regresyonlar ve mevcut testler geçti. WhatsApp PNG örneği gerçek paylaşım koduyla Node Canvas üzerinden üretildi ve görsel olarak incelendi. Gerçek tarayıcı etkileşimi ve fiziksel baskı bu çalışmada doğrulanmadı.
