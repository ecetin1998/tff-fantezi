# MH11 — 9 Kasım 2026 kaynaklı puan onarımı ve kapanış kapıları

**Durum: 456 oyuncu hesaplandı ama haftanın resmî/kesin Fantasy gerçekleşeni henüz yok.** 9 maç Bitti; 456/456 özel `scout_independent_score_candidates` tablosunda `provisional`. `scout_player_weekly_points` MH11 resmî/final = 0 ve `scout_backtest_weeks` MH11 hâlâ open.

## Düzeltme özeti

Önceden 713 temel + 79 tahminî bonus = **792 geçici puan** vardı. 28 golün maç dakikaları (9 maç) karşı takım defans/kalecilerinin gerçek sahada kalma aralıklarına karşı kontrol edildi. Skorlama motoru `model/simulateScout.js` on-pitch goal-conceded hesabını uygular (`isActiveAt`, `gc[i]`); eski hesap bazı yedekleri tüm maçın yediği gollerle cezalandırıyordu. **11 satır düzeltildi, temel +13 puan oldu. 726 temel + 79 bonus = 805 geçici puan**. Bonus 3/2/1 tie handling, ilk en az üç ödüllendirilmiş kişi; bütün 456 oyuncunun eski/yeni bonus sıralaması değişmedi. Bonuslar hâlâ resmî değil.

| Maç dahili ID | Oyuncu | Eski | Yeni |
| --- | --- | ---: | ---: |
| 317874 | Sabahattin Destici | 0 | 1 |
| 317877 | Arda Okan Kurtulan | 1 | 2 |
| 317878 | Wilfried Singo | 0 | 1 |
| 317878 | Lumbardh Dellova | 0 | 1 |
| 317878 | Mehmet Yeşil | -1 | 1 |
| 317878 | Ali Turap Bülbül | -1 | 0 |
| 317879 | Mustafa Yumlu | -1 | 0 |
| 317880 | Arda Hilmi Şengül | -1 | 1 |
| 317882 | Thalisson | 0 | 1 |
| 317882 | Fıratcan Üzüm | 0 | 1 |
| 317882 | Metehan Baltacı | -3 | -2 |

**Gol saatleri (internal fixture IDs; TFF external IDs farklı olabilir):** 
- 317874 Kasımpaşa: 3,21; 317875 Kocaelispor: 5,28; 317876 Samsunspor:39
- 317877 Göztepe:18 / Başakşehir:22,83
- 317878 Galatasaray:7,45,59,80 / Amed:62,65,92
- 317879 Rizespor:31,66 / Erzurumspor:37
- 317880 Fenerbahçe:12,21,56,63,74
- 317881 Trabzonspor:17,34; 317882 Beşiktaş:20,45,85.

Sources matched the match crosswalk in `scout_match_external_ids`. All 126 remaining defender on-pitch uncertainty flags (60 played, 66 DNP) independently recomputed without discrepancy and retired after original 11 changed. All 20 assist players / 22 assist events independently matched to public goal/assist timelines. Every evidence change has `[MH11_20261109_ON_PITCH_GOALS_AUDIT]`, `[MH11_ASSISTS_CROSS_VERIFIED_20261109]` or `[MH11_FULL_GOAL_CLOCK_RECONCILIATION_20261109]` in the row.

## Kapanışa kalan kesin doğrulamalar

1. **Süreler**: 270 played minutes inferred (165 substitution clocks,105 no-exit 90 minutes). Particularly Diogo Gonçalves, Mostafa Mohamed and Cengiz Ünder have clock 61; source-agreed 61 is above Fantasy 60 threshold, but official individual elapsed minutes feed unavailable. 178 DNP independently sourced.
2. **Kaleci kurtarışı**: 5 cross-provider disparities. Ataberk Dadakdeniz 3 (other 2) **±1 save point**, Deniz Dilmen 3 (other 2) **±1**, Zafer Görgen 2 vs1 **no points difference**, Marcos Felipe 2 vs1 **no points difference**, Ederson 9 vs8 **±1**. Ederson source inconsistencies: Çorum FK match stats report 9 keeper saves, 8 opponent SOT; cannot treat as definitive match-level validation. Source: https://corumfk.com.tr/mac/2026-11-08-corum-fk-fenerbahce and https://stadioo.app/tr/maclar/44b90cdc-e2fb-4712-93a3-de92b2f19081/analiz .
3. **Bonus**: 39 scored bonus recipients, 79 points from our simulation-style tie tiers; official TFF Fantasy match bonus not verified, potential changes after sourced cards/penalty/keeper resolution.
4. **Unconfirmed penalty events**, possible card or assist scorer adjudication, and independent finality/provenance. Observed assists 22 and on-pitch conceded corrections verified, but do not assume missing penalty event is proven zero.
5. **Technical promotion**: Must source-approve **456 final** `mh11_owner_approved_independent_score_events` weekly scores (never claim TFF official), close all 9 match Fantasy statuses, materialize 456 player + 18 team season summaries through MH11 without inventing unobserved advanced stats, close only original pre-kickoff frozen backtest; then verified MH12 `scout_match_history` 9 fixtures, QA, 50K and publish. `fixtures` already has 9 MH12 games; the model-specific table is empty.

**No unverified independent score transfer to official `scout_player_weekly_points`, no `is_final`, no backtest close and no MH12 simulation during this audit.** Never present provisional totals as official TFF Fantasy awarded score.

## 9 Kasım — Proje sahibinin 5 kaleci kurtarışını onaylaması

Proje sahibi MH11 için şu kurtarışları açıkça verdi: **Ataberk Dadakdeniz 3; Deniz Dilmen 3; Ederson 9; Zafer Görgen 3; Marcos Felipe 2.** Bunlar birinci elden kullanıcı teyitli spor istatistiğidir, **TFF Fantasy resmi verilmiş puanı olarak gösterilemez**.

Bu değerler `scout_independent_score_candidates` ve `scout_match_player_evidence` tablolarının her ikisine de kontrollü biçimde kaydedildi; beşine de `[MH11_GK_SAVE_OWNER_CONFIRMATION_20261109]` kaynak notu düşüldü. Dördü önceki değerleriyle aynıydı; **Zafer Görgen 2→3 kurtarış** değişimi `save_points` 0→1, `base_points` 2→3, `estimated_total` 2→3 değiştirdi. Diğer dört oyuncunun kurtarış / toplam puanları: Ataberk 3/2, Deniz 3/2, Ederson 9/9, Marcos Felipe 2/0. 3 kurtarışta 1 puan kuralı uygulanmıştır.

**Yeni MH11 taslak toplam: 727 temel + 79 tahminî bonus = 806 puan / 456 oyuncu.** Yeni base sıralamasında bonuslar yeniden denetlendi: **0 bonus uyuşmazlığı, 39 bonus alıcısı, 79 bonus puanı**. `keeper_save_disputed` etiketi beş satırdan kalktı, önceki kaynak anlaşmazlıkları `evidence_note` içinde korunuyor; tüm 456 satır `provisional` statüsünde, `official_fantasy_not_verified` flag'i devam ediyor.

**Kapanış kararı değişmedi:** MH11 9 maç için Fantasy `KAPANDI` sayısı 0; 456 oyuncunun `is_final` haftalık puan sayısı 0. Resmî bonus, oynanan dakikanın resmî dökümü ve puana etki edebilen diğer olayların doğrulanması/bağımsız skor dizisi sahibinin kesin onayı olmadan final bayraklarını kaldırma veya MH12'ye eğitim verisi olarak alma.
