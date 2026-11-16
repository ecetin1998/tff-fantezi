# MH12 veri güncelliği ve ücretsiz kaynak doğrulaması — 17 Kasım 2026

Bu belge **canlı Supabase** (`nnoagjayvrwyjtizhnfz`) üzerinden yapılan kaynak-denetim anlık görüntüsüdür. Veri tamamlama ve motor iyileştirmesi birbirinden ayrı tutulur; mevcut MH12 50K yayınını sessizce değiştirmez.

## Doğrulanan mevcut durum

- Güncel hedef MH12; son tamamen kapanmış hafta MH11 (9 maç).
- 456 aktif oyuncunun temel sezon istatistikleri MH11'e kadar; **456/456 oyuncunun kümülatif gelişmiş istatistikleri MH11'den geride**: 174 oyuncu MH7, 282 oyuncu MH9. Bunlar 0 değildir, farklı kaynak dönemleridir.
- 18 takımın genel sezon / yayınlanmış toplu istatistikleri MH11 seviyesinde. **18/18 takımın ayrıntılı taktik/olay profili MH5'te**. Toplu profil ile olay ayrıntılarının güncelliği eşit sayılmamalı.
- Aktif oyuncuların 6'sında rol güveni <0,8 veya boş.
- Doğrulanmış haftalık hücum gözlemleri MH8: 286, MH9: 282, MH10: 284, MH11: 277 satır. MH11 için xG bulunan 121, xA bulunan 183 satır. Gözlemi olmayan xG/xA **bilinmeyendir**; sıfır olarak doldurulamaz.
- MH11 ilk 11 taktik-rol gözlemleri 196; 9 maçın iki takım için teorik 198 başlangıç oyuncusundan 2 eksik. Kaynağa dayalı eşleştirme kontrol edilmeli.
- Aktif MH12 50K run hazır ve temel QA/gate alanları PASS. **Bu, ileri kaynak kapsamasının tam veya xFP ağırlıklarının optimal olduğunu kanıtlamıyor.**

## Eklenen, üretimi etkilemeyen araçlar

- `scripts/audit-source-freshness.sql`: güncel kapanmış MH'yi bulur; tüm aktif oyuncu/takım kaynak katmanlarını denetler; gelişmiş veri açığı olan her oyuncu/takım için ayrıntılı sıra oluşturur. Canlı DB üzerinde read-only çalıştırılarak doğrulandı.
- `scripts/highlightly-coverage-probe.mjs`: yalnız `HIGHLIGHTLY_API_KEY` ortam değişkeniyle sağlayıcıya bağlanır. `--date YYYY-MM-DD [--limit 1..9]` veya `--match-id <provider_id>` çalıştırılır. İlgili lig/maç için match box-score ve team statistics kapsamasını **salt okunur** ölçer; veri yazmaz. API key olmadan dış servis testi yapılamadı.

## Bedava API kabul ölçütü

Highlightly Basic ücretsiz planı günlük 100 istek sunuyor. Box-score; dakika, pozisyon, şut, kilit pas, kurtarış gibi alanları ve **varsa** xG/xA'yı taşıyabiliyor. Ancak 2026/27 Süper Lig için gerçek maç başına kapsama doğrulanmadı. Sadece belgeye bakarak eksikleri kapatılmış saymayacağız.

1. Önce MH11'den bir gerçek maçtaki iki takım ve 22 başlangıç oyuncusu, dakika ve bonus dışı skor olayları kaynağa karşı eşleştirilmeli.
2. xG/xA, şut, kilit pas, kurtarış gibi alanların gerçek doluluğu maç/oyuncu bazında belirlenmeli. Opsiyonel değer eksikse NULL kalmalı; 0 yalnız sağlayıcı açıkça 0 döndürürse yazılmalı.
3. Her dış maç/oyuncu kimliği iç sistemdeki doğru takım/oyuncuya bağlanmalı; isim eşleştirmesi tek başına yeterli değil. İki sağlayıcı çelişirse eski doğrulanmış değer sessizce değiştirilmemeli.
4. Yalnız kaynakça doğrulanmış, maç bitmiş satırlar ve doğru hafta için backfill; tarih/durum/provenance/zaman damgası korunmalı. MH12 oynanmadan MH12 performansı üretilemez; 11'e kadar olan sonuçlar modelin girdisidir.
5. Tüm kaynak katmanlarının kapsaması tamamlanınca yeni **aday** 50K koşu hazırlanmalı; tüm pozisyonlar için dakika, ilk 11, xFP MAE/bias, 6+ kalibrasyonu ve sıralama doğruluğu frozen geçmiş MH'lerde kıyaslanmalı. 0 dk/0 puan doğrulanmayanları başarı hanesine yazmayız; <30 dk ile ≥30 dk ayrıca raporlanır.
6. Tek maç tek şut outlier, savunmacı gol yememe değeri, rol değişikliği, kaleci kurtarışları, güncel form, xG/xA kaynak eskimesi ve takım-oyuncu korelasyonu için aday ağırlıklar **gerçek holdout** iyileşmesi sağlarsa QA + replay gate sonrası promote edilir; hemen canlıya kör ağırlık değişimi yapılmaz.

## Güvenlik ve açık engeller

- API anahtarı uygulama koduna, istemci ortamına, GitHub commit'ine veya loglara yazılmayacak; üretimde Supabase Secrets üzerinden kullanılacak.
- Highlightly ücretsiz katmanda Süper Lig 2026/27 verisi ve yeniden kullanım/uygulamada yayınlama izni **gerçek hesap ve kullanım şartlarıyla** doğrulanmalı.
- Ücretsiz API kapsaması yetersizse ücretli otomatik yükseltme yok; mevcut doğrulanmış kaynaklar korunur ve alternatif ücretsiz kaynak aranır.
- Bu dal **canlıyı değiştirmez**; dış API key henüz tanımlı olmadığı için boş gelişmiş alanlar bu PR ile doldurulmadı.
