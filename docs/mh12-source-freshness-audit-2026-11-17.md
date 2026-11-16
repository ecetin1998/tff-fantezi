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
- `scripts/highlightly-coverage-probe.mjs`: yalnız `HIGHLIGHTLY_API_KEY` ortam değişkeniyle sağlayıcıya bağlanır. `--date YYYY-MM-DD [--limit 1..9]` veya `--match-id <provider_id>` çalıştırılır. İlgili lig/maç için match box-score ve team statistics kapsamasını **salt okunur** ölçer; veri yazmaz. Bu raporun sonuna canlı Highlightly BASIC plan kapsam testinin doğrulanmış sonuçları eklendi.

## Bedava API kabul ölçütü

Highlightly Basic ücretsiz planı günlük 100 istek sunuyor. Box-score; dakika, pozisyon, şut, kilit pas, kurtarış gibi alanları ve **varsa** xG/xA'yı taşıyabiliyor. 2026/27 Süper Lig kapsaması canlı API'de doğrulandı (ligId 173537). Ancak 99 maçın her birindeki alanlar tek tek indirilip denetlenmeden *tüm gelişmiş istatistikler tamam* denemez.

1. Önce MH11'den bir gerçek maçtaki iki takım ve 22 başlangıç oyuncusu, dakika ve bonus dışı skor olayları kaynağa karşı eşleştirilmeli.
2. xG/xA, şut, kilit pas, kurtarış gibi alanların gerçek doluluğu maç/oyuncu bazında belirlenmeli. Opsiyonel değer eksikse NULL kalmalı; 0 yalnız sağlayıcı açıkça 0 döndürürse yazılmalı.
3. Her dış maç/oyuncu kimliği iç sistemdeki doğru takım/oyuncuya bağlanmalı; isim eşleştirmesi tek başına yeterli değil. İki sağlayıcı çelişirse eski doğrulanmış değer sessizce değiştirilmemeli.
4. Yalnız kaynakça doğrulanmış, maç bitmiş satırlar ve doğru hafta için backfill; tarih/durum/provenance/zaman damgası korunmalı. MH12 oynanmadan MH12 performansı üretilemez; 11'e kadar olan sonuçlar modelin girdisidir.
5. Tüm kaynak katmanlarının kapsaması tamamlanınca yeni **aday** 50K koşu hazırlanmalı; tüm pozisyonlar için dakika, ilk 11, xFP MAE/bias, 6+ kalibrasyonu ve sıralama doğruluğu frozen geçmiş MH'lerde kıyaslanmalı. 0 dk/0 puan doğrulanmayanları başarı hanesine yazmayız; <30 dk ile ≥30 dk ayrıca raporlanır.
6. Tek maç tek şut outlier, savunmacı gol yememe değeri, rol değişikliği, kaleci kurtarışları, güncel form, xG/xA kaynak eskimesi ve takım-oyuncu korelasyonu için aday ağırlıklar **gerçek holdout** iyileşmesi sağlarsa QA + replay gate sonrası promote edilir; hemen canlıya kör ağırlık değişimi yapılmaz.

## Güvenlik ve açık engeller

- API anahtarı uygulama koduna, istemci ortamına, GitHub commit'ine veya loglara yazılmayacak; üretimde Supabase Secrets üzerinden kullanılacak.
- Highlightly ücretsiz BASIC planında 2026/27 Süper Lig fixture, box-score, statistics ve lineups erişimi gerçek hesapla doğrulandı. Kullanım koşulları §6.1 uygulamalarda saklama/dağıtıma izin verir; API'nin doğrudan yeniden satılması/proxy edilmesi yasak. Veri kaynağı belirtilecek, aynı kaynağın önemli bölümünün rakip veritabanı olarak aynalanmasına gidilmeyecek.
- Ücretsiz API kapsaması yetersizse ücretli otomatik yükseltme yok; mevcut doğrulanmış kaynaklar korunur ve alternatif ücretsiz kaynak aranır.
- Bu dal **canlıyı değiştirmez**; API key Supabase Secrets içinde doğrulandı. API yalnız geçici sunucu tarafı testte kullanıldı, boş gelişmiş alanlar bu PR ile doldurulmadı.

## Canlı Highlightly API doğrulama sonuçları (16 Kasım 2026 21:25 UTC)

Anahtar yalnız Supabase Edge secret'ta okundu, dışarıya gönderilmedi. 39/100 günlük istek tüketildi, son yanıtta **61 istek** kalmıştı.

- **BASIC ücretsiz plan ve lig doğrulandı:** Türk Süper Lig için `leagueId=173537`, sezon 2026. ASCII `Super Lig` adı **sıfır sonuç** veriyor; `Süper Lig` ya da kalıcı leagueId kullanılmalı. Önceki sıfır sonuç yanlış arama filtresindendi.
- `GET /matches?leagueId=173537&season=2026` toplam **225 yayınlanmış fikstür** döndürdü (3 sayfa, sırasıyla 100+100+25). MH1–MH11'de **11 × 9 = 99/99** maç listelendi ve 99'u da `Finished` durumunda.
- Gerçek `/box-score/{id}` verisi **3 adet MH10–MH11 ve 5 adet MH1,3,5,7,9** maçında test edildi. 8/8 örnekte çalıştı. Çift takım toplamı her maçta 41–42 oyuncu; dakika, gol, asist, şut, kilit pas, kart, kurtarış alanları mevcut. İlk beş eski örnekte oynayan oyuncu sayıları 30–32 idi; tüm yedekler oynadı varsayılmamalı.
- MH1,3,5,7,9 için **5/5 örnek maçta** `/statistics/{id}` iki takım için ayrı ayrı **40 istatistik** döndürdü; xG ve xA dahil. MH11'deki 4/4 bağımsız maçın /statistics endpoint'i de aynı 40 metrikle çalıştı.
- MH11 için **4/4** `/lineups/{id}` iki takımın da 11 başlangıç oyuncusu ve formasyonunu döndürdü.
- Oyuncu `statistics` biçimi **nesne** (`p.statistics.expectedGoals`), dizi değil. İlk probe'daki Tip Hatası bu beklenti uyuşmazlığıydı; GitHub probe kodu düzeltildi. Opsiyonel oyuncu xG/xA null kalabiliyor; doğrulanmadan sıfır yapılmayacak.
- Canlı örnek: Çorum FK–Fenerbahçe MH11 maçında **Ederson 9 kurtarış** ve 0 gol yeme; sağlayıcının oyuncu/kaleci olay düzeyi gerçek ölçümleri var.

### Kaynaklar arası önemli fark — otomatik üzerine yazma YASAK

MH11'de mevcut bağımsız FotMob veri katmanı ile Highlightly aynı maçlar için küçük fakat **anlamlı** xG farkları gösterdi:

| MH11 maç | Mevcut FotMob ev xG / depl. xG | Highlightly ev xG / depl. xG |
|---|---|---|
| Galatasaray – Amed | 1.73 / 1.39 | 1.47 / 1.25 |
| Çorum – Fenerbahçe | 2.27 / 1.17 | 2.00 / 1.30 |
| Beşiktaş – Gençlerbirliği | 3.94 / 0.29 | 4.09 / 0.18 |

Bu farkların kaynağı sağlayıcı metrik yöntemleri olabilir. Kaynağı belli eski xG değerlerinin üzerine yazma, kaynak sürümlerini ayrı tut; model için aynı ölçek içinde tutarlı sağlayıcı seç. Puanlandırma resmî veri katmanıyla ayrı tutulmalı.

### Ücretsiz istek bütçesi

- Geriye dönük **99 maça** yalnız 1 box-score + 1 statistics sorgusu: **198 API isteği**, eski bütün maçlara lineup da istenirse **297 istek**. Fikstür listeleme + kalite doğrulama istekleri bunların üstüne eklenir. Ücretsiz 100/gün sınırından dolayı işlemler günlük kotaya bölünerek yapılabilir.
- Gelecek her haftada 9 maçı box-score + statistics + lineups ile almak **27 istek**; doğrulama ve yeniden denemeler için limit içinde geniş pay kalır.
- Günlük kotayı sıfırlamadan tekrar çağrılar yapma; maç bitmeden /box-score tamamlandı sayma; 429 olduğunda ertesi güne bırak.
- Bir sonraki adım: kimlik eşleme + kaynağın raw/staging saklanması + karşılaştırma QA; ardından 456 oyuncu ve 18 takımın ileri verilerini kaynak penceresi tutarlı biçimde MH11'e taşımak. Başarılı olunca ayrı candidate 50K/backtest.

