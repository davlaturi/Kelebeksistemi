# Hata senaryoları denetimi — 3 Kasım 2026

## Düzeltilen hatalar
- Tekli sıralarda salonlar arası paylaştırma, ikili sıra varsayımını kullanıyordu. İki salonlu örnekte (kapasiteler 2 ve 3; düzey mevcutları 1 ve 4; üç sıra grubu) yan yana ihlal 2 iken 1 mümkün oluyordu. Tekli sıra geometrisine göre maliyet hesabı düzeltildi.
- Aynı düzeydeki öğrenciler boş koltuklarla ayrılmış olsa da kaçınılmaz ihlal uyarısı çıkabiliyordu. Uyarı artık gerçekleşen ihlal sayısına dayanıyor. Kendi salonuna yerleşme uyarısındaki kanıtlanmamış imkânsızlık iddiası kaldırıldı.
- Tekrarlanan/eksik öğrenci, sınıf ve salon kimlikleri; sonlu olmayan, negatif veya kesirli kapasite/sıra grubu girişleri dağıtımdan önce doğrulanıyor.
- Eksik öğrenci içeren güncel dağıtımlı yedekler ve takvimde olmayan tarihler reddediliyor.
- Yalnız salon olarak kullanılan sınıfın arşivde sınava katılan sınıf gibi kaydedilmesi düzeltildi; eski arşivler için uyumluluk korundu.
- Saklama alanı doluyken sınıf/arşiv silme, temizleme, dağıtım oluşturma ve koltuk değiştirme işlemlerinin bellekte uygulanıp başarı gösterilmesi engellendi.
- Listeler/ayarlar değiştiğinde eski dağıtımın yazdırılması, CSV aktarılması ve koltuk değişimi engelleniyor; yeniden dağıtım isteniyor. Arşiv çıktıları kendi kaydıyla çalışıyor.
- Bozulmuş yazdırma seçeneği kaydının pencereyi durdurması düzeltildi.

## Doğrulama
`npm test`: dağıtım, PDF ayrıştırma, veri saklama/yedek/arşiv, paylaşım ve regresyon testleri geçti.
96 tek salon + 180 iki salon senaryosu bağımsız tam arama ile karşılaştırıldı. Tekli/ikili sıra, farklı sıra grubu sayıları ve boş koltuklar kapsandı; testlerde birincil yan yana ihlal sayısı minimumla eşleşti. Bu, tüm büyük okul yerleşimleri veya ön/arka/çapraz komşuluk için küresel optimum ispatı değildir.

Testler Node ve sahte DOM ortamındadır. Gerçek tarayıcı etkileşimi ve fiziksel yazdırma bu denetimde doğrulanmadı. PDF ayrıştırma testlerinde Node ortamının canvas/font uyarıları görüldü; beklenen öğrenci verileri çıkarıldı ve testler geçti.

## Teslim
Kullanılan klasör, tek dosya HTML ve ZIP güncellendi. GitHub'a gönderim yapılmadı. Test verileri sentetiktir; kullanıcı verileri üzerinde silme/yeniden dağıtım yapılmadı.
