# MH11 — Oyuncu katılımı ve puan kanıtı denetimi (9 Kasım 2026)

**Veritabanı doğrulaması:** `scout_match_history` 9/9 Bitti; `scout_match_player_evidence` içinde MH11 için **456/456 aktif oyuncunun her birinde bir kaynak kanıtı satırı** var. Bu **456 kesin Fantasy puanı** demek değildir. `scout_player_weekly_points` MH11: **0 final satır**, `scout_backtest_weeks`: open.

## Katılım sonucu

| Sınıf | Oyuncu | DB alanları | Kanıt seviyesi |
|---|---:|---|---|
| Maça ilk 11 başladı | **196** | `started=true`, `verified_first_11=true` | FotMob/TFF maç sonrası 18 takım esame karşılaştırması |
| Sonradan oyuna girdi | **82** | `started=false`, `verified_substitution=true` | 9 maçın TFF/SofaScore ve olay akışındaki 82 değişiklik |
| Oynamadı | **178** | `started=false`, `minutes=0` | 18 takımın ilk 11 + oyuna giren listesinde bulunmayan, 456 aktif havuzdaki oyuncular |
| **Toplam** | **456** | Hepsi `evidence_status=partial` | **Kesin Fantasy puanı değil** |

Tüm 18 kulübün 198 ilk 11 isminden **196'sı** mevcut aktif havuzla birebir veya güvenilir ad varyantıyla eşleşti. **Ömer Ceyhan (Eyüpspor)** ve **Arda Çelik (Gençlerbirliği)** mevcut havuzda değil; havuzdaki başka oyunculara yanlışlıkla bağlanmadı. Oyuna girenlerde **Berhan Şatlı (Eyüp)** ve **Mustafa Coşkun Tosun (Rize)** de havuz dışında olduğu için puan tablosuna eklenmedi.

### Maç bazlı eşleştirme

| Maç | Skor | İlk 11 | Yedekten giren | Oynamayan aktif havuz |
|---|:---:|---:|---:|---:|
| Gaziantep – Kasımpaşa | 0–2 | 22 | 10 | 21 |
| Eyüpspor – Kocaelispor | 0–2 | 21 | 9 | 19 |
| Samsunspor – Konyaspor | 1–0 | 22 | 9 | 17 |
| Göztepe – Başakşehir | 1–2 | 22 | 10 | 18 |
| Galatasaray – Amed | 4–3 | 22 | 10 | 19 |
| Rizespor – Erzurumspor | 2–1 | 22 | 9 | 20 |
| Çorum FK – Fenerbahçe | 0–5 | 22 | 8 | 22 |
| Alanyaspor – Trabzonspor | 0–2 | 22 | 7 | 21 |
| Beşiktaş – Gençlerbirliği | 3–0 | 21 | 10 | 21 |
| **Toplam** | | **196** | **82** | **178** |

## Dakika doğrulaması ve 60+ eşiği

`minutes` sayısal alanı şu anda **291 oyuncuda dolu**: **178** 0 dakika DNP, **113** tam 90 dakika kaynak/olay türevi. Tam 90 tahmininin 105'inde maç sonrası ilk 11 + bütün değişiklik/atılma olaylarıyla “oyundan çıkmadı” kontrolü yapıldı. Bu, dakika alanında **ayrı resmî Fantasy ihracı** değildir, kanıt statüsü partial kalır.

**165 oyuncunun kesin oynama dakikası henüz sayısal alanına yazılmadı**; 82 ilk 11 oyuncusunun çıkış saati, 82 yedekten girenin giriş saati ve 1 oyuncunun kırmızı kart dakikası kaynaklarda var. Bu olaylar `evidence_note` alanlarında korunuyor. Olay saatini birebir kesin Fantasy dakikası kabul etmeyin; örneğin 46. dakikada devre arası değişikliği 45 oynanmış dakika anlamına gelir, kaynaklar arasında 1–2 dakika oynaklık olabilir.

Sahaya giriş/çıkış saatlerine ±1 dakika emniyet payı bırakıldığında bu 164 oyuncudan **161'inin 60 dakika eşiği güvenle sınıflanır** (63 çıkan + 3 giren 60+, 16 çıkan + 79 giren 60 altı), **3 sınırda belirsiz**. Kırmızı kartla oyundan çıkan Metehan Baltacı, 22'de atıldığından 60 altı. Sayısal dakikayı nihai resmî kaynak olmadan doldurmayın.

## Kısmi futbol olayları

- **27 normal gol, 1 kendi kalesine gol**, futbol maçlarının 9/9 skorlarıyla eşleşiyor.
- Kaynaklı **22 aday asist**, **30 sarı kart**, **1 kırmızı kart**. Bu olaylar bağımsız futbol maç raporlarından geliyor, TFF Fantasy'nin resmî bonus/asist puanı dökümü değil.
- 9 Kasım düzeltmesi: **Jesurun Rak-Sakyi**'ye Gaziantep 0–2 Kasımpaşa maçında **1** gol pası eklendi ([Anadolu Ajansı](https://m.aa.com.tr/tr/spor/-kasimpasa-deplasmandan-3-puanla-ayrildi/4114663)); **Leandro Trossard** Beşiktaş 3–0 Gençlerbirliği maçında kaynaklı **3** asistle güncellendi ([Cumhuriyet](https://www.cumhuriyet.com.tr/spor/besiktas-uc-puani-3-golle-aldi-besiktas-3-0-genclerbirligi-2554474), [AA maç anlatımı](https://www.aa.com.tr/tr/spor/besiktas-sahasindan-galibiyetle-ayrildi/4116284)).
- **15/18 başlayan kaleci** için oyuncu kaynaklı kurtarış değeri kayıtlı, ancak bazıları kaynaklar arası uyuşmazlık nedeniyle **kesin değil**. Kalan **üç kaleci**: Deniz Dilmen (Göztepe–Başakşehir), Zafer Görgen (Rize–Erzurumspor), Marcos Felipe (Çorum–Fenerbahçe). Bu üçünde `saves=NULL` bırakıldı.
- **Özel çatışma:** Gaziantep kalecisi Ataberk Dadakdeniz için GNCScout / [FutbolRadar](https://www.futbolradar.com/mac/gaziantep-fk-kasimpasa-6-kasim-2026) **3 kurtarış**, [xg.football](https://xg.football/matches/gaziantep-fk-kasimpasa-2026-11-06) **2 kurtarış** bildiriyor. Veritabanındaki **3** resmî Fantasy doğrulanmış değildir; neden belirsiz notu ekli. Çorum maçında da Ederson için kulüp 9 kurtarış bildirirken farklı sağlayıcılar başka değer gösteriyor. Kaleci skorları yalnız kayıtlı sayıyla kesinleştirilmemeli.
- **Kart istisnası:** Metehan Baltacı ikinci sarıdan oyundan atıldı. Gerçek TFF Fantasy kırmızı + sarı katsayılarının aynı olaya uygulanması ayrıca doğrulanmalı.

## Başlıca çapraz kaynaklar

[TFF Gaziantep–Kasımpaşa resmî esame](https://www.tff.org/Default.aspx?macId=317874&pageId=29), [TFF Çorum–Fenerbahçe resmî esame](https://www.tff.org/Default.aspx?macId=317879&pageId=29), [TFF Beşiktaş–Gençlerbirliği](https://www.tff.org/Default.aspx?macId=317881&pageId=29), [FotMob Çorum–Fenerbahçe](https://www.fotmob.com/tr/matches/fenerbahce-vs-corum-fk/uribx74), [FutbolRadar Gaziantep–Kasımpaşa](https://www.futbolradar.com/mac/gaziantep-fk-kasimpasa-6-kasim-2026), [GNCScout Gaziantep–Kasımpaşa](https://www.gncscout.com/match/19746564-gaziantep-f-k-kasimpasa), [GNCScout Samsun–Konyaspor](https://www.gncscout.com/match/19746556-samsunspor-konyaspor), [GNCScout Galatasaray–Amed](https://www.gncscout.com/match/19746558-galatasaray-amed-sk).

**Tam kapanış için**: (1) 165 oyuncunun kesin dakika kaynağı, (2) 3 kalecinin belirsiz kurtarışları ve başka çelişkiler, (3) eksik olay/penaltı kart istisnaları, (4) resmî Fantasy bonus [3,2,1] ve asist kredisi ile (5) 456 oyuncu için tam ve doğru `scout_player_weekly_points` kaynağı gerekir. MH11 `scout_backtest_weeks` frozen 2 Kasım tahmini korunmalıdır. `scout_close_live_backtest` ve MH12 canlıya terfi, bunlar tamamlanmadan yapılmamalıdır.

### Son read-only kontrol

```sql
SELECT count(*) players,
 count(*) FILTER (WHERE verified_first_11=true) starters,
 count(*) FILTER (WHERE verified_substitution=true) subs,
 count(*) FILTER (WHERE minutes=0) dnp,
 count(*) FILTER (WHERE minutes=90) full90,
 count(*) FILTER (WHERE minutes IS NOT NULL) minute_evidence,
 count(*) FILTER (WHERE started=true AND saves IS NOT NULL) gk_saves,
 sum(coalesce(assists,0)) candidate_assists
FROM public.scout_match_player_evidence WHERE gameweek=11;
```
