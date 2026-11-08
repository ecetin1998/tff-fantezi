# MH11 kaynak doğrulaması ve kapatma engelleri — 9 Kasım 2026

**Durum: 9/9 futbol maçı bitti; 0/9 Fantasy kapanışı; 0/456 kesin oyuncu puanı.** Bu dosya değişken haftalık tahminleri veya geçmiş frozen backtest'i güncellemez. Aşağıdaki kayıtlar resmî TFF Fantasy puanı değil, **kısmi ve kaynak bağlantılı futbol olayları**dır.

## Maç sonuçları ve iki ayrı kimlik sistemi

İç maç ID'leri asla TFF maç ID'si sanılmamalı; eşleştirmeler `scout_match_external_ids` tablosuna takım çiftleriyle doğrulandı.

| İç ID | TFF ID | Maç | Skor | Kısmi oyuncu kaydı | Bilinen ilk 11 | Bilinen oyuna giren | Doğrulanmış GK kurtarışı |
| ---: | ---: | --- | :---: | ---: | ---: | ---: | ---: |
| 317874 | 317874 | Gaziantep – Kasımpaşa | 0–2 | 5 | 5 | 0 | 0 |
| 317875 | 317875 | Eyüpspor – Kocaelispor | 0–2 | 5 | 4 | 1 | 0 |
| 317876 | 317882 | Samsunspor – Konyaspor | 1–0 | 7 | 5 | 2 | 0 |
| 317877 | 317878 | Göztepe – Başakşehir | 1–2 | 9 | 7 | 2 | 0 |
| 317878 | 317880 | Galatasaray – Amed | 4–3 | 14 | 12 | 2 | 2 |
| 317879 | 317877 | Rizespor – Erzurumspor | 2–1 | 7 | 6 | 1 | 0 |
| 317880 | 317879 | Çorum FK – Fenerbahçe | 0–5 | 9 | 8 | 1 | 0 |
| 317881 | 317876 | Alanyaspor – Trabzonspor | 0–2 | 5 | 5 | 0 | 0 |
| 317882 | 317881 | Beşiktaş – Gençlerbirliği | 3–0 | 4 | 3 | 1 | 0 |
| **Toplam** | | **9 maç** | | **65** | **55** | **10** | **2** |

`scout_match_history.match_status` 9/9 `Bitti`, `fantasy_closure` ise 9/9 `Puan doğrulama bekleniyor`. `fixtures.is_finished` 9/9 true. Hiçbir maçın Fantasy kapanışı yapılmadı.

## Kaydedilen kaynaklı futbol olayları

- **27 normal gol + 1 kendi kalesine gol**. Mevcut Scout mevkileriyle gol bileşeni toplam **125 puan** (OG −2 içerir).
- **19 aday asist**, **26 sarı kart**, **1 ikinci-sarıdan kırmızı kart** (Gençlerbirliği / Metehan Baltacı). Kırmızı kart alan oyuncunun sarı kart sayısı **NULL** bırakıldı: çift sarı–kırmızı Fantasy hükmü doğrulanmadan iki kez kesinti yapılmamalı.
- Bilinen olayları *varsayımsal olarak* TFF puan katsayılarıyla toplarsak `125 + 19×3 − 26 − 3 = 153` çıkar. **Bu bir haftalık toplam Fantasy puanı değildir:** özellikle asist ataması, ikinci sarı/kırmızı, kaçan penaltılar, 60 dakika, temiz sayfa, gol yeme, bonuslar henüz kesinleştirilmedi.
- **55 bilinen ilk 11** oyuncusu (`started=true`, `verified_first_11=true`); **10 bilinen oyuna giren** oyuncu (`started=false`, `verified_substitution=true`). Kaydı olmayan oyuncuların `started=false` veya `minutes=0` olduğu **söylenemez**.
- **İki per-player kurtarış**: Galatasaray kalecisi Uğurcan Çakır **2**, Amed kalecisi Alban-Marc Lafont **3**. Her iki rakam [GNCScout maç listesi](https://www.gncscout.com/match/19746558-galatasaray-amed-sk) ve [MatchCalendar oyuncu istatistikleri](https://matchcalendar.football/tr/competition/super-lig/match/galatasaray-vs-amed/) kaynaklarıyla eşleştirildi. Diğer maçlarda yalnız takım toplamına dayanarak kaleci kurtarışı doldurulmadı.
- Kısmi satırlarda bilinmeyen goller/asistler/kartlar NULL kaldı. `evidence_status=partial`; hiçbirini resmî Fantasy kaydı olarak işaretlemeyin.

### Kontrol kaynakları

- [Gaziantep kulüp maç özeti](https://www.gaziantepfk.org/haberler/mac-sonucu-gaziantep-0-2-kasimpasa) — ilk 11, değişiklik ve kartlar.
- [Eyüpspor–Kocaelispor olay akışı](https://www.fotmob.com/tr/matches/kocaelispor-vs-eyupspor/bmsfk), [maç istatistikleri](https://www.futbolradar.com/mac/eyupspor-kocaelispor-7-kasim-2026.html).
- [Samsunspor–Konyaspor kadro](https://www.kamu1.net/mac/samsunspor-konyaspor-7-kasim-2026), [Konyaspor resmî raporu](https://www.konyaspor.org.tr/index.php/haber/samsunspor-1-0-tumosan-konyasporumuz3829).
- [Göztepe–Başakşehir olay akışı](https://www.futbolradar.com/mac/goztepe-basaksehir-7-kasim-2026).
- [Galatasaray resmî raporu](https://www.galatasaray.org/haber/futbol/galatasaray-4-3-amed-sportif-faaliyetler/61341), [ayrıntılı kadro](https://web-production-a0606.up.railway.app/tr/match/galatasaray-vs-amed-2026-11-07/lineups).
- [Rizespor–Erzurumspor DHA raporu](https://www.dha.com.tr/spor/caykur-rizespor-erzurumspor-fk-2-1-2977515).
- [Çorum FK resmî olay akışı](https://corumfk.com.tr/mac/2026-11-08-corum-fk-fenerbahce), [TFF maç kaydı](https://www.tff.org/Default.aspx?macId=317879&pageId=29).
- [Alanyaspor–Trabzonspor canlı anlatım](https://www.haber.com/spor/alanyaspor-trabzonspor-canli-anlatim-31714).
- [Beşiktaş–Gençlerbirliği AA raporu](https://www.aa.com.tr/tr/spor/besiktas-sahasindan-galibiyetle-ayrildi/4116284), [Beşiktaş maç kadrosu](https://www.bjk.com.tr/tr/mac_merkezi/canli/25506).

## Kapatmayı engelleyen TAM eksikler

1. **Kesin oynama/dakika verisi:** 65 kısmi kaydın hiçbirinde bitmiş resmî oyuncu dakikası yok (`minutes` tamamen NULL). Maç içi değişiklik dakikasını doğrudan kesin maç dakikası gibi yazmayın. Toplam 9×22=**198 ilk 11** olmalı; şu an yalnız **55'i** mevcut kayıtlarla eşlendi; en az **143 ilk 11 kaydı** daha doğrulanıp kaydedilmeli. Bu, yalnız ilk 11 eksikliği; ek oyuna girenler ve tüm yedekler ayrıca gerekli.
2. **Kadro/dakika 0 doğrulaması:** aktif **456 oyuncunun tamamı** için kaynaklı gerçekleşen süre veya gerçek DNP kanıtı şart. Henüz yalnız **65 kısmi oyuncu kaydı** var; diğerlerinin yokluğu 0 dk kanıtı değildir. İlgili `scout_player_weekly_points` tablosunda MH11 için **0 final satır** bulunuyor.
3. **Kaleci kurtarışları ve cezalar:** şimdilik 2 GK için per-player kurtarış mevcut, kalan maçların 16 ilk 11 kalecisi kaynaklı ve kimlik eşlemeli doğrulanmalı. Penaltı kurtarma, kırmızı kart (özellikle ikinci sarı) ve sarı kart ataması resmî Fantasy kurallarıyla eşleştirilmeli. Örn. Çorum maçında futbol web kaynaklarının takım isabetli şut/kurtarış toplamları birbiriyle tutarsız; doğrudan kaleciye yazılmadı.
4. **Fantasy oyununa göre kesin puan:** 19 aday asistin resmî oyun kredisi, kalan eksik asist/ceza, gol yememe, 2 gol yeme kesintisi, +1/+2 süre ve maçın en iyi 3 oyuncusuna bonus [3,2,1] eşleşmeli.
5. **Kaynak ve versiyon:** `scout_backtest_weeks` MH11 `live_frozen/status=open/actual_count=0`. `closureSource.mjs` MH11 için doğrudan kaynak türü `fresh_closed_actual` bekliyor; tarihsel MH8–10 owner-approved özel kaynakları MH11'e otomatik genişletmeyin. Fantasy resmî dışa aktarımı veya tam maç-oyuncu olay seti üzerinden bağımsız denetim olmadan `KAPANDI` yazılamaz.

### Toplu veri kaynağı uyarısı

Çevrimiçi [fport/super-lig-fantasy](https://huggingface.co/datasets/fport/super-lig-fantasy) seti birçok maç-oyuncu olayı içeriyor olsa da kaynak açıkça **resmî Fantasy puanlarının doğrulanmadığını** ve **ticari kullanım kısıtını** bildiriyor. Fantezi Lig Rehberi üyelikli/Pro bir ürün olduğu için o set canlı veri havuzuna toplu kopyalanmadı.

## Kapanışa hazır olma kontrolü (salt okunur)

```sql
SELECT
 (SELECT count(*) FROM public.scout_match_history WHERE gameweek=11 AND season='2026-27' AND match_status='Bitti') AS finished_matches,
 (SELECT count(*) FROM public.scout_match_history WHERE gameweek=11 AND season='2026-27' AND fantasy_closure='KAPANDI') AS fantasy_closed_matches,
 (SELECT count(*) FROM public.scout_match_player_evidence WHERE season='2026-27' AND gameweek=11) AS partial_actor_rows,
 (SELECT count(*) FROM public.scout_match_player_evidence WHERE season='2026-27' AND gameweek=11 AND verified_first_11) AS verified_starters,
 (SELECT count(*) FROM public.scout_match_player_evidence WHERE season='2026-27' AND gameweek=11 AND verified_substitution) AS verified_subs,
 (SELECT count(*) FROM public.scout_match_player_evidence WHERE season='2026-27' AND gameweek=11 AND minutes IS NOT NULL) AS exact_minutes,
 (SELECT count(*) FROM public.scout_match_player_evidence WHERE season='2026-27' AND gameweek=11 AND saves IS NOT NULL) AS per_keeper_saves,
 (SELECT count(*) FROM public.scout_player_weekly_points WHERE gameweek=11 AND is_final) AS final_fantasy_rows;
```

**Karar: MH11 futbol sonuçları kesin, Fantasy oyuncu puanları henüz değil.** 0/0 uydurarak modeli eğitmeyin, resmî çıktı olmadan 456 final satırı üretmeyin, `scout_close_live_backtest` ve MH12 canlı terfisini eksik veri üzerinden başlatmayın.
