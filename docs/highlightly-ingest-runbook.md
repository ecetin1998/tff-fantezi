# Highlightly – Süper Lig veri aktarımı ve kaynak politikası

## Doğrulanan canlı durum (17 Kasım 2026)

- Supabase Secret HIGHLIGHTLY_API_KEY çalışıyor; ücretsiz BASIC planı günde 100 istek sunuyor.
- 2026-27 Süper Lig Highlightly lig kimliği 173537. ASCII Super Lig filtre sonuç döndürmez; leagueId kullanılmalı.
- MH1–MH11 için 99/99 tamamlanmış maç gerçek API fikstürüyle, hafta + iki takım + başlama saatiyle eşleştirildi.
- Önceki FotMob maç xG değerleri ile Highlightly xG değerleri birebir aynı değil. Karışık ve kaynağı belirtilmemiş xG ortalaması kullanılmaz.
- Oyuncu kutu skoru (dakika, gol, asist, şut, kilit pas, kurtarış, kart, xG/xA), iki takım için 40 metrik ve formasyon/ilk11 test edildi. xG/xA null olabilir: null sıfır değildir.
- Kaynak dakikaları bazen resmî maç dakikalarından farklıdır: bunlar official Fantasy weekly points verisinin üzerine yazılmaz.

## Canlı uygulama

- Edge Function: highlightly-sync, yalnız Supabase Vault cron token ile erişilebilir.
- Cron: fantezi-highlightly-supplementary-sync (job id 3); 04:15, 08:15, 12:15, 20:15 UTC (Türkiye 07:15, 11:15, 15:15, 23:15) saatlerinde çalıştırılır.
- Her çağrı maksimum 7 maçı tamamlar; dört çağrı toplamında 72 entegrasyon API isteği/gün, sağlayıcıda en az 10 istek güvenlik payı bırakılır.
- İşlem yarıda kesilirse eksik maçlar tekrar işlenir; API kimlikleri ve zaman damgaları korunur.
- Gelecekteki MH biten maçları aynı sistemde otomatik kaynak olarak toplanır; TFF resmî sonuç kaynağı değişmez.
- Veri katmanları: scout_highlightly_matches, scout_highlightly_player_matches, scout_highlightly_team_matches, scout_highlightly_lineups. Kaynak bazlı ayrı sezon rollupları mevcuttur.
- Tablolar ve görünümler RLS/grant ile browser rollerine kapalıdır. Anahtar yalnız Edge Secrets içinde, cron yetkisi Vault içinde saklanır.

## İzleme SQL

SELECT gameweek, count(*) AS fixtures, count(*) FILTER (WHERE box_done AND stats_done AND lineups_done) AS completed
FROM public.scout_highlightly_matches GROUP BY gameweek ORDER BY gameweek DESC;

SELECT quota_day, requests_used, daily_budget, provider_remaining, last_error
FROM public.scout_highlightly_sync_control;

SELECT count(*) AS player_entries, count(player_id) AS mapped, count(*)-count(player_id) AS unmatched
FROM public.scout_highlightly_player_matches;

## Model onay kapısı

Bu veri şu anda ayrı sağlayıcı kanalıdır. Oyuncu sezon advanced_through_gameweek ve takım ayrıntılı olay kanallarını, yalnızca Highlightly genel metrikleri var diye MH11'e taşımıyoruz. Geçmiş 99 maçın verileri dolduktan, oyuncu kimlikleri çözüldükten ve çoklu kaynak farkları kontrol edildikten sonra, xFP aday motoru 30+ dakika aktif oyuncular ve leakage-safe frozen holdout üzerinde test edilmelidir. Ancak başarılı QA, backtest ve aday 50K sonrası current model değişir.

İlk entegrasyon PR #462 ile ana dala birleştirildi. 17 Kasım'da MH12 kadro kapanışı (21 Kasım 12:30 TR) öncesi güvenlik payı için dördüncü cron çalışması eklendi. 16/99 tam veri aktarımı ve kalan 83 maç için her günlük tam kotada azami 24 maç ilerleme hedefleniyor. Teorik tamamlanma 20 Kasım 11:15 TR, ancak provider kota reseti, veri kapsaması ve başarısız istekler nedeniyle garanti değildir. 99/99 tamamlanması yeni xFP hesaplamasının tamamlandığı anlamına gelmez.

## Seçici geçmiş aktarım — 17 Kasım 2026

**Geçerli politika:** Bütün maçları yeniden çekmek yerine başka doğrulanmış kaynakta eksik kalan **endpointleri** tamamla. Bu karar veritabanındaki `scout_highlightly_fetch_requirements` görünümünde maç bazında ve gerçek veri üzerinden yeniden hesaplanır.

- **Oyuncu box score:** Aynı maç için en az 22 oyuncu ve en az 10 oyuncuda gözlemlenmiş xG/xA olan doğrulanmış `scout_verified_weekly_attack` varsa yeniden çağırma. Bunlar minimum *kapsam eşiği*; oyuncuların her opsiyonel metriğinin mevcut olduğunu ispatlamaz. Eksik mikro-metrikler sonraki QA'da ayrıca kontrol edilir.
- **Takım statistics:** `scout_verified_team_match_advanced` içinde her iki takımın xG, xGA, şut ve isabetli şutları mevcutsa yeniden çağırma. FotMob/Highlightly xG ölçekleri karıştırılmaz.
- **İlk 11:** Yakın geçmişte her iki takımın 11 doğrulanmış ilk 11 oyuncusu yoksa Highlightly lineup iste; daha eski MH1–MH6 ilk 11 isteklerini güncel rol modeline katkısı sınırlı olduğu için şimdilik ertele. Daha sonra gerektiğinde bu politika genişletilebilir.
- Yakalanan provider verileri source-specific kalır. Atlanan endpoint için `box_done`, `stats_done`, `lineups_done` bayraklarını sahte şekilde true yapma.

**Canlı kapsam ölçümü (17 Kasım 2026):** 99 tamamlanmış maçın 27'si mevcut verilerle yeterli; 16 maçın üç Highlightly endpointi de eskiden çekilmiş. İhtiyaç duyulan en az **63 box + 63 takım stats + 18 lineup = 144 API çağrısı**. Önceki kalan 83 maç × üç endpoint = 249 çağrıyla karşılaştırıldığında 105 çağrı azalıyor. Günlük toplam güvenlik sınırı 72 istek değişmedi.

İzleme sorgusu:

```sql
SELECT * FROM public.scout_highlightly_targeted_readiness;
SELECT gameweek, count(*) FILTER(WHERE need_box) box,
  count(*) FILTER(WHERE need_stats) stats,
  count(*) FILTER(WHERE need_lineups) lineups
FROM public.scout_highlightly_fetch_requirements
GROUP BY gameweek ORDER BY gameweek DESC;
```

**Çıkış kapısı:** `targeted_coverage_complete=true` yalnız kaynak bazında yeterli veri olduğunu gösterir. Oyuncu/team advanced sezon profili, kaynak karşılaştırma, kimlik QA, frozen holdout backtest ve yeni 50K bunlardan ayrı onaylanır. Aynı run sonuçlarının prod'a geçirildiği iddia edilmez.


## MH7 Gaziantep–Çorum FK kaynak anomalisi (17 Kasım 2026)

Maç: **317838**, Highlightly: **1348346459**, 11 Ekim 2026 (Gaziantep 0–3 Çorum).

Sağlayıcının gerçek yanıtı günlük ücretsiz bütçeden **tek tanı isteği** kullanılarak güvenli Vault kimlik doğrulaması altında incelendi:
- \`/box-score\`: 42 oyuncu kayıtlı, 32'si oynadı; hepsinde \`expectedGoals=null\` ve \`expectedAssists=null\`; diğer şut ve gol ölçümleri mevcut.
- \`/statistics\`: iki takım da dönüyor ancak **her takım için yalnız 15 metrik** var; hiçbirinde \`Expected Goals\` veya \`Expected Assists\` anahtarı yok.
- Gaziantep: 1 isabetli şut, 7 dışarı giden şut; Çorum: 7 isabetli şut, 4 dışarı giden şut. Dolayısıyla yanlış takım adını eşlemekten veya xG isminin büyük/küçük harf farkından kaynaklanmıyor.
- Eski kod \`rows.some(x=>x.xg===null)\` ile \`TEAM_ADVANCED_INCOMPLETE\` fırlatıyor. Bu, aynı çağrıyı tekrar tekrar yapıyor ve **ilk 11/formasyon kaydına hiç geçmiyordu**.
- Yeni kod kaynakta bulunan kısmi takım istatistiklerini kaydeder; xG/xA \`NULL\` kalır; uyarı \`SOURCE_TEAM_XG_UNAVAILABLE:<team_ids>\` olarak görünür; \`stats_done\` yalnız endpoint alındı demektir; sonraki lineups çağrısı normal devam eder.
- \`scout_highlightly_targeted_readiness\` view, iki takım için gerçek sayısal xG ve yeterli oyuncu xG/xA olmadan bu maçı **yeterli kaynak verisi var** saymaz. \`unresolved_provider_team_xg\` ve \`unresolved_provider_player_xg\` ayrı izlenir; API tekrarları aynı null değer için harcanmaz.
- Resmî fantasy puanları, mevcut MH12 50K tahminleri, kaynak bazlı xG serileri değiştirilmez. Alternatif sağlayıcı xG kullanılacaksa aynı tarih/pencere/sağlayıcı yöntemi kontrolü ve ölçüm ölçeği ayrıştırması zorunludur.


## MH7 Gaziantep–Çorum FK: eksik FotMob verilerinin doğrulanmış tamamlanması

**17 Kasım 2026, maç 317838 (11 Ekim 2026, Gaziantep 0–3 Çorum), FotMob matchId 5904758.**

- Kaynak: [FotMob maç](https://www.fotmob.com/tr/matches/gaziantep-fk-vs-corum-fk/tzrbrsj), arka uçta **güncel** \`/api/data/matchDetails?matchId=5904758\` üzerinden 200 durumlu, 264 KB civarında tam maç yanıtı doğrulandı. Eski \`/api/matchDetails\` uç noktası 404 dönüyor.
- Aynı FotMob kaydında takım **xG Gaziantep 0.99, Çorum 2.67**; şut **12/13**, isabetli şut **2/7**, net fırsat **2/3**, kurtarış **4/2**, sahip olma **%54/%46**. Tarih, takımlar, sonuç ve ilk 11 gerçek kayıttan doğrulandı.
- FotMob maç şut haritası 12+13 şuttaki \`expectedGoals\` toplamları: Gaziantep **0.9919**, Çorum **2.6728** (son ekranda iki ondalık 0.99/2.67). Bu, manuel olarak yaratılmış veya gol sayısından türetilmiş xG değildir.
- \`scout_verified_weekly_attack\`: **32 süre almış oyuncunun** özgün FotMob kimlikleri kanonik oyuncularla açık eşlendi. Bütün 32 kişi için xG (şut haritası toplamı veya doğrulanmış şut yoksa 0), xA, şut, isabetli şut, pozisyon hazırlama verisi işlendi. xA 25 kişide doğrudan görüntülenen değer, kalan 7 kişide gözlenen xG+xA ve katkı eksikliğinden çıkarılan sıfır olarak \`scout_verified_player_match_metric_provenance.xa_evidence\` içinde ayrıldı.
- \`scout_verified_team_match_advanced\`: 2 takım için FotMob kaynaklı ve maçla tutarlı toplu veriler; \`scout_verified_match_metric_provenance\`: 22 alanın URL ve hesap kaynağı. **Highlightly'ın xG/xA alanları hâlâ kaynağa özgü NULL kalır**; sağlayıcı eksikliği gizlenmez.
- Sontje Hansen'in “Misjonne Juniffer Naigelino Hansen” olduğu FIFA ve Opta Analyst kaynaklarıyla doğrulandı, kalıcı \`scout_highlightly_player_aliases\` kaydı sayesinde MH5–MH7'nin 3 oyuncu-maç kaydı doğru kişiye bağlandı.
- \`scout_highlightly_fetch_requirements\` artık bu maç için \`need_box=false\`, \`need_stats=false\` döndürür. Sağlayıcıdan eskiden alınan ilk 11/formasyon kayıtları durur; rollerin ayrı \`scout_player_tactical_role_observations\` tablosuna doğrulanmadan yazılması otomatik varsayılmaz.
- Fantezi puanlarını, canlı MH12 modelini veya oyuncu dakika geçmişini değiştirmez. Gelecekteki model kalibrasyonuna **kaynak penceresi ve geçmiş tahminlerin donmuş hali** doğrulandıktan sonra girer. xgEdge gibi farklı xG modelinin takım ve oyuncu xG değerleri FotMob ile karıştırılmaz.

SQL kontrol:
\`\`\`sql
SELECT team_id,xg,xga,shots,shots_on_target,keeper_saves,source_kind
FROM public.scout_verified_team_match_advanced WHERE match_id=317838 ORDER BY team_id;
SELECT team_id,count(*) AS played,sum(shots) AS shots,
 sum(shots_on_target) AS sot,round(sum(xg),4) AS source_xg,
 round(sum(xa),4) AS source_xa
FROM public.scout_verified_weekly_attack WHERE match_id=317838 GROUP BY team_id;
\`\`\`


## MH12 — Gece kota yenilenir yenilenmez hızlandırılmış aktarım (17–21 Kasım 2026)

- **Canlı Supabase cron job 4**: `fantezi-highlightly-mh12-night-sprint`, UTC `5,35 0-3 * * *`.
- **Türkiye saatleri:** **03.05, 03.35, 04.05, 04.35, 05.05, 05.35, 06.05, 06.35**. İlk yürütme **18 Kasım Çarşamba 03.05 TR**.
- Mevcut ana cron job 3 (`fantezi-highlightly-supplementary-sync`) **korunuyor**: 07.15, 11.15, 15.15, 23.15 TR.
- Böylece ücretsiz kaynak sağlayıcı kotası ve entegrasyonun yerel günlük sayacı UTC 00:00 / Türkiye 03:00 civarında yenilendiğinde, ilk gerçek istek 5 dakika sonra yapılır. Kaynağın günlük kotası yenilenmezse Edge Function kendisini koruyarak `provider_remaining<=10` sonrasında yeni istek yapmaz.
- Edge Function, **iki cron birlikte çalışsa bile** lease/lock ile çift çalışmayı reddeder ve günlük **72 isteği** aşmaz; sağlayıcıda **en az 10 istek rezervi** korunur. Başarılı her çalışmada bir seferde en fazla 7 maç işlenir.
- **Geçicidir:** 22 Kasım 2026'da ilk gece slotunda kendisini `cron.unschedule` ile kaldırır; ana kaynak senkronizasyonu devam eder. Gerektiğinde elle durdur: `SELECT cron.unschedule('fantezi-highlightly-mh12-night-sprint');`
- **17 Kasım akşamı gerçek baz:** 60/99 maç yeterli, 77 eksik endpoint API çağrısı (38 box +39 stats); 72/72 günlük yerel istek harcanmış, sağlayıcıda 28 kaldığı görülmüş. Yeni kota altında yaklaşık bir tam gün + kalan birkaç istek gerekir; eksik provider veri ve beklenmedik hatalar plana etki edebilir.
- **ÖNEMLİ:** Kaynak aktarımının bitmesi = 456 oyuncunun sezon advanced profili, 18 takımın profil senkronizasyonu, backtest ve MH12 yeni 50K simülasyonunun bitmesi **değildir**. Üretimde mevcut MH12 tahminleri korunur.
- Script: `scripts/highlightly-mh12-night-sprint.sql`.


## MH12: tüm 456 oyuncunun sakatlık ve ceza uygunluk denetimi — 18 Kasım 2026

- Kaynaklar: 456 aktif oyuncu, mevcut scout_availability, WmR ikinci kaynak gözlemleri, kanonik MH11 kart kayıtları, TFF PFDK/Tahkim tarihli cezalar ve bağımsız sağlık açıklamaları. Eski bir üçüncü taraf ceza satırı resmî tamamlanan cezayı uzatamaz.
- İlk audit: 436 uygun, 20 tutarsızlık (1 süresi bitmiş resmî ceza, 1 eksik resmî ceza, 3 uzun dönem iki kaynaklı sakatlıkta hatalı %50, 15 tek kaynaklı sakatlık riskinin hiç gösterilmemesi).
- TFF 29 Ekim: Abdülkerim Bardakcı (id=533) 2 maç MH10–11 tamam, MH12 cezasız. Archie Brown (id=182) 3 maç MH10–12, MH12 cezalı. Kaynak: https://www.tff.org/default.aspx?ftxtID=51771&pageID=246
- TFF 5 Kasım: Samuel Leo Beat Ballet (id=600) 3 maç MH11–13, MH12 cezalı. Tahkim 13 Kasım onadı. Kaynaklar: https://www.tff.org/default.aspx?ftxtID=51836&pageID=246 ve https://www.tff.org/default.aspx?ftxtID=51950&pageID=247
- Nwaiwu, Orkun Kökçü, Elson Mendes da Silva ve Metehan Baltacı resmî maç kartıyla ve çoklu kaynakla doğrulanıp MH12 cezaları korundu.
- Adil Demirbağ, Dimitrios Goutas ve Kamil Ahmet Çörekçi: 60+ gün ve iki kaynakla uzun sakatlık doğrulandığı için mevcut %50 ihtimal %0 yapıldı.
- Can Bozdoğan: Rizespor tarafından bildirilen ayak bileği ameliyatı ve 6–12 hafta sakatlık, %0. Emre Kılınç: antrenmana döndüğü doğrulandı fakat maça dönüş teyitli değil, %75 risk. Noah Sonko Sundberg ve Wagner Pina: yeni sakatlık/kas sorunları %50 risk. Kanıt ve geri alma için scout_verified_health_observations tablosu.
- Başka kaynaktaki 15 ancak birincil listede bulunmayan kişi: 12 kişi %65 belirsiz risk; 3 kişi bağımsız ek kaynakla değerlendirildi. Tek kaynaktan %0 sakatlık veya kesin %100 dönüş çıkarılmadı.
- Yeni güvenli altyapı: scout_verified_disciplinary_cases; scout_verified_health_observations; scout_availability_full_audit. 456/456 kayıt denetlendi; 21 değişiklik öncesi/sonrası snapshot scout_availability_bulk_audit_log içinde.
- Mevcut kaynak katmanı MH12 sonucu: 6 cezalı, 53 sakat, 12 teyit bekleyen risk, 385 normal; audit tutarsızlıkları sıfır. Bu kaynak QA durumudur; kesin maç kadrosu değildir.
- ÖNEMLİ: scout_player_projections halen 20 oyuncuda eski 50K tahminlerini taşıyor. Aday 50K yenileme ve tüm QA kapıları tamamlanmadan tahmin doğruluğu iddia edilmez. Cloudflare prod deploy manuel GH Actions ile gerçekleşir.

Kontrol SQL: SELECT audit_issue,count(*) FROM scout_availability_full_audit GROUP BY audit_issue;


## 18 Kasım 2026 — 99/99 tarihsel maç kaynağı tamamlandı

- Saat 10.15 Türkiye: doğrulanmış yeterli maç sayısı **96/99**, bekleyen **5** Highlightly API endpointi (MH1 maç 317790/317791/317792), günlük iç limit 72/72, sağlayıcı 28 ücretsiz istek.
- Kullanıcı onayıyla yalnız bir seferlik günlük iç sınır **72→80** yapılıp Vault kimlik doğrulamalı `highlightly-sync` manuel çağrıldı (pg_net request 966). 3 maç işlendi, **tam 5 API çağrısı** kullanıldı, HTTP 200, sağlayıcıda **23** kaldı, 0 API hata. Sınır tekrar **72** yapıldı; bugünkü `requests_used` audit değeri 77 olarak korunuyor. Haricî sağlayıcı rezervi 10 istek korundu.
- Highlightly her üç maçta box ve team stats uç noktalarını başarıyla yakaladı. Yalnız **MH1 Samsunspor 3–3 Göztepe** (17.08.2026, match 317792, Highlightly id 1348303909) 30 süre alan oyuncunun tamamında xG ve xA verisini NULL döndürdü. Daha fazla Highlightly tekrarına API harcamadık.
- Alternatif teyitli kaynak **FotMob matchDetails** `matchId=5904712` (kaynak: https://www.fotmob.com/api/data/matchDetails?matchId=5904712 ; sayfa https://www.fotmob.com/matches/goztepe-vs-samsunspor/14l32o ). Tam 3–3 maç, 2026-08-17, 40 oyuncu kaydı ve 41 şut ile doğrulandı.
- **Samsunspor xG 2.80** / FotMob şut haritası toplamı 2.7956, **Göztepe xG 1.71** / şut haritası toplamı ~1.7125. Şutlar **21–20**, kaleyi bulan **3–7**, maç sonunda 3–3. Kaynaklar takım advanced tablolarında 2/2 kaydedildi, 22 takım metriği alan bazlı URL denetimine yazıldı.
- **30/30 süre alan oyuncunun xG** verisi (şut başına FotMob xG veya hiç şut yoksa 0) kaynaklı eşlendi; **25 doğrudan xA**, **4 kaynaktaki katkısızlık ve xGI üzerinden teyitli sıfır**, **1 belirsiz xA**. Ogün Bayrak'ın 1 oluşturulan pozisyonu var ama API xA/xGI yayımlamıyor; bu yüzden `scout_verified_weekly_attack.xa=NULL`, `scout_verified_player_source_missing_metrics` tablosunda **ölçülmemiş** olarak izleniyor; sıfır uydurulmadı.
- Tarihsel oyuncu eşleştirmesi: Highlightly `Badra Diabbate Ali` (id 101699507) = FotMob `Ali Diabaté` (id 1883406) = kanonik `Ali Badra Diabaté` (id 441, Samsunspor); MH1–MH2'deki 2 bağlantı kaynakla doğrulanıp güncellendi, oyuncunun `active=false` mevcut durumu **değiştirilmedi**.
- **99/99** `scout_highlightly_targeted_readiness.sufficient_matches`, `targeted_coverage_complete=true`, `pending_box=0`, `pending_stats=0`, `pending_lineups=0`, `unresolved_provider_player_xg=0`, `unresolved_provider_team_xg=0`, `pending_api_calls_minimum=0`. Bu kaynak düzeyi yeterlilik ölçütüdür; Ogün xA ölçümündeki tekil kaynak eksikliği ayrıca işaretlenmiştir.
- **ÖNEMLİ:** `source_reconciled_to_player_and_team_profiles=false`; 456 oyuncu ve 18 takım gelişmiş sezon profilleri MH11'e taşınmış sayılmaz. Aktif MH12 50K tahminleri ve fantasy puanları bu veri aktarımında **değişmedi**. Kalibrasyon, sezon profili uzlaştırması ve sonrasında simülasyon yeniden koşusu ayrı QA kapılarıyla yapılmalıdır.
- Tekrarlanabilir SQL migration: `supabase/migrations/20261118103000_mh1_samsun_goztepe_fotmob_full_source.sql`, regresyon testi: `test/mh1-samsun-goztepe-fotmob-evidence.test.mjs`.
