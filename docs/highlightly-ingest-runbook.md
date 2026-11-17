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
