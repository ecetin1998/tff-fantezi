# MH11 kaynak doğrulaması ve kapanış durumu — 8 Kasım 2026

Bu belge, **MH11 için kaynakları kontrol edilen maç sonuçları ve kısmi gol verileri** ile kapatmayı engelleyen eksikleri kaydeder. Resmî Fantasy oyuncu puanı çıktısı değildir. **Dondurulmuş MH11 backtest, 456 oyuncunun henüz doğrulanmamış sıfır dakikası, kadro sonuçları ve canlı model performansı değiştirilmedi.**

## Sonuçlar ve TFF maç ID eşleştirmesi

Sistemdeki iç `scout_match_history.match_id` ile TFF dış ID'si **aynı alan değildir**. Maçlar yalnız takım çiftleri ve saatleri ile doğrulanarak `scout_match_external_ids` tablosuna işlendi.

| İç maç ID | TFF ID | Maç | Skor |
| ---: | ---: | --- | :---: |
| 317874 | 317874 | Gaziantep – Kasımpaşa | 0–2 |
| 317875 | 317875 | Eyüpspor – Kocaelispor | 0–2 |
| 317876 | 317882 | Samsunspor – Konyaspor | 1–0 |
| 317877 | 317878 | Göztepe – Başakşehir | 1–2 |
| 317878 | 317880 | Galatasaray – Amed | 4–3 |
| 317879 | 317877 | Rizespor – Erzurumspor | 2–1 |
| 317880 | 317879 | Çorum FK – Fenerbahçe | 0–5 |
| 317881 | 317876 | Alanyaspor – Trabzonspor | 0–2 |
| 317882 | 317881 | Beşiktaş – Gençlerbirliği | 3–0 |

Sistem güncellemesi: `scout_match_history` 9/9 **Bitti**, **Puan doğrulama bekleniyor**; `fixtures.is_finished` 9/9 true. Bu **Fantasy KAPANDI değildir**.

Kaynaklar: [beIN MH11 fikstür](https://www.beinsports.com.tr/lig/super-lig/fikstur), [Çorum FK–Fenerbahçe TFF maç detayları](https://www.tff.org/Default.aspx?macId=317879&pageId=29), [Çorum FK resmî maç akışı](https://corumfk.com.tr/mac/2026-11-08-corum-fk-fenerbahce), [Galatasaray resmî maç haberi](https://www.galatasaray.org/haber/futbol/galatasaray-4-3-amed-sportif-faaliyetler/61341), [Eyüpspor–Kocaelispor beIN](https://beinsports.com.tr/haber/eyupspor-kocaelispor), [Alanyaspor–Trabzonspor beIN](https://www.beinsports.com.tr/mac-merkezi/corendon-alanyaspor-trabzonspor/1515834).

## Kısmi kaynaklı gol bileşeni

`scout_match_player_evidence` MH11 için **32 ayrı oyuncu-maç kısmi kayıt** içeriyor (9 maç; 24 gol kaydı, diğer 8 kaynaklı olay oyuncusu). Toplam **27 normal gol + 1 kendi kalesine gol**, tüm maç skorlarıyla mutabık. Oyuncuların Scout mevki tanımlarına göre Fantasy gol bileşeni: **125 puan**. Bu, **tüm oyuncuların haftalık Fantasy puanlarının toplamı değil**.

| İç maç ID | Normal gol | Kendi kalesine gol | Gol bileşeni |
| ---: | ---: | ---: | ---: |
| 317874 | 2 | 0 | +9 |
| 317875 | 2 | 0 | +10 |
| 317876 | 1 | 0 | +5 |
| 317877 | 3 | 0 | +13 |
| 317878 | 6 | 1 (Alban-Marc Lafont) | +27 |
| 317879 | 3 | 0 | +12 |
| 317880 | 5 | 0 | +25 |
| 317881 | 2 | 0 | +11 |
| 317882 | 3 | 0 | +13 |
| **Toplam** | **27** | **1** | **+125** |

Örnekler: Greenwood iki gol (MID, +10), İrfan Can Kahveci iki gol (MID, +10), Ali Sowe iki gol (FWD, +8), Vlahović iki gol (FWD, +8). **Kendi kalesine gol** cezası, Scout kaynak notundaki `own_goal=1` değeriyle açıkça etiketlidir. Veri tablosundaki `goals=0` o oyuncunun normal gol atmadığını ifade eder; OG cezası notlarda yer alır.

**Kısmi olay kanıtı ilavesi:** Maç zaman çizelgelerinden ayrıca **7 aday asist** (Çorum FK–Fenerbahçe 5; Alanyaspor–Trabzonspor 2) ve **2 sarı kart** (Mohamed Diomandé, Nélson Semedo) eşleştirildi. `Oğuz Aydın` gol kaydına asist eklendi; diğer 8 yeni oyuncu için kısmi satır açıldı. Bunlar yalnızca kaynaklı olaylardır; resmî Fantasy asist/bonus ataması olarak kabul edilmedi. Olay bazlı aday katkı: 7×3−2×1 = **+19**; gol katkısıyla birlikte **144 aday olay puanı** (tüm haftanın Fantasy skoru değildir).

**Eksik alanlar:** `minutes`, `started`, `red_cards`, `saves` henüz güvenle doğrulanmamıştır; çoğu oyuncu için `assists` ve `yellow_cards` da **NULL** kalmıştır, 0 yapılmamıştır. Bu nedenle dakika, gol yememe, yenilen gol, kurtarış, diğer kartlar, penaltı ve maç bonusları **henüz kesin hesaplanamaz**. Kaynakta adı geçmeyen oyuncuları 0 dakika veya 0 asist diye işaretlemeyin.

## Mevcut yayın ve kapanış kriterleri

- `scout_player_weekly_points` MH11 için **0 kesinleşmiş satır / 456 aktif oyuncu**.
- `scout_backtest_weeks` MH11 **open**, `actual_count=0`.
- `scout_match_history.fantasy_closure` **0/9 KAPANDI**.
- 456 oyuncunun **gerçek 0 dk** durumunu, yalnızca ilk 11 veya goller görülmedi diye çıkarmayın.
- `scout_player_season_stats` MH11 ve takım sezon istatistiklerinin tazelenmesi ayrıca doğrulanmalı.
- Resmî oyun bonusu ve asist yorumunu, saha dışı istatistik sağlayıcısının hesapladığı puanla karıştırmayın. [TFF Fantasy puan kuralları](https://tfffantezilig.com/yardim?tab=kurallar-1) referanstır.
- `scout_close_live_backtest` sadece doğru, maç öncesi dondurulmuş run ve **tüm** 456 final oyuncu satırı / kaynak katmanları geçtikten sonra çalıştırılabilir.
- Yeni MH12 50K koşusuna **eksik MH11 puanlarını sıfır sayıp** geçmeyin; öğrenme ve dakika hatası güvenilirliğini bozar.
- Bonus eşitlikleri, kendi kalesine gol, ceza ve kaleci kurtarışı Fantasy sistemine göre son kez karşılaştırılmalıdır.

## Read-only doğrulama sorgusu

```sql
SELECT m.gameweek,
 count(*) AS fixtures,
 count(*) FILTER (WHERE m.match_status='Bitti') AS finished,
 count(*) FILTER (WHERE m.fantasy_closure='KAPANDI') AS fantasy_closed
FROM public.scout_match_history m
WHERE m.season='2026-27' AND m.gameweek=11
GROUP BY m.gameweek;

SELECT count(*) AS evidence_players,
 count(*) FILTER (WHERE minutes IS NOT NULL) AS minutes_sourced,
 count(*) FILTER (WHERE assists IS NOT NULL) AS assists_sourced,
 count(*) FILTER (WHERE saves IS NOT NULL) AS saves_sourced
FROM public.scout_match_player_evidence
WHERE season='2026-27' AND gameweek=11;

SELECT count(*) AS final_actuals
FROM public.scout_player_weekly_points
WHERE gameweek=11 AND is_final=true;
```

**Kapanış kararı:** MH11 futbol skorları sonuçlandı ancak Fantasy doğrulaması tamamlanmadı. Skorları geriye çevirmeyin, oyuncu puanlarını varsayımla doldurmayın; `fantasy_closure` KAPANDI olmasın.
