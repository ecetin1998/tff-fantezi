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