# MH9 kaynak uyuşmazlıkları ve kapanış engelleri — 27 Ekim 2026

**Kapsam:** 2026–27 MH9, TFF `macId` 317856–317864. Bu rapor PR #384 read-only GitHub Actions run `40407997343` kaynak kanıtlarından hazırlanmıştır; TFF Fantasy resmî oyuncu puanı çıktısı değildir. Production model, dondurulmuş MH9 tahminleri ve kullanıcı kadroları değiştirilmedi.

## FotMob kaynak kapsamı

| TFF ID | Ev / dep | Gol | Açıkça doğrulanan pozitif dakika | Kaynak kart olayı | Kaynak kaleci kurtarış kaydı |
| --- | --- | ---: | ---: | ---: | ---: |
| 317856 | Gaziantep – Erzurumspor | 1–3 | 31 | 2 | 2 |
| 317857 | Eyüpspor – Kasımpaşa | 0–1 | 32 | 2 | 2 |
| 317858 | Alanyaspor – Kocaelispor | 1–2 | 32 | 7 | 2 |
| 317859 | Rizespor – Trabzonspor | 3–4 | 32 | 4 | 2 |
| 317860 | Göztepe – Çorum FK | 2–0 | 32 | 2 | 2 |
| 317861 | Konyaspor – Gençlerbirliği | 2–0 | 32 | 4 | 2 |
| 317862 | Galatasaray – Fenerbahçe | 2–1 | 32 | 7 | 2 |
| 317863 | Beşiktaş – Başakşehir | 2–0 | 29 | 3 | 2 |
| 317864 | Samsunspor – Amed | 1–2 | 32 | 10 | 2 |
| **Toplam** | 9 kaynak maç | **27 gol** | **284** | **41** | **18** |

FotMob full-time score + takımlar + 22 ilk 11 eşleşmesi 9/9; 284 dakika kaydından 282'si mevcut **456 aktif Scout oyuncu kaydıyla** tam/provenance bağlantısına sahip. 9 özel ad uyuşmazlığı önceki MH8'den doğrulanmış **aynı FotMob provider ID + Scout ID + takım** eşleşmeleri kullanılarak giderildi; isimden tahmin edilmedi. 

## Çözülemeyen kaynak kimliği / havuz farklılıkları

| TFF maç | Provider ID | Kaynak oyuncu | Kaynak forma | Takım | Durum |
| --- | ---: | --- | ---: | --- | --- |
| 317857 | 1210346 | Atakan Müjde | 8 | Kasımpaşa | Aktif 456 oyuncu içinde eşleşen Scout ID yok |
| 317864 | 1598775 | Haluk Mustafa Tan | 29 | Samsunspor | Aktif 456 oyuncu içinde eşleşen Scout ID yok |

Bu iki kişi FotMob'un oynayan kayıtlarında var; aktif Scout havuzuna *otomatik eklenmeyecek*, başka oyuncuya eşleştirilmeyecek. Resmî Fantasy oyuncu havuzu/uygunluğu ayrıca kontrol edilmeli. Kalan **174 aktif Scout oyuncusu** için pozitif dakika tespit edilememesi, **0 dk oynadığına kanıt değildir**.

## Resmî Fantasy kuralları gerektiren olay incelemesi

- **317856 Gaziantep – Erzurumspor**: FotMob kaynak olayı `provider_event_id=14628142`, `Orhan Ovacıklı` kendi kalesine gol (`own_goal=true`), 70. dakika. Golü doğru tarafa say; gol + asist olarak yanlış kredilendirme; Fantasy uygulamasının kendi kalesine gol atfını kontrol et.
- **317861 Konyaspor – Gençlerbirliği**: `provider_event_id=14640251`, `Franco Tongya` kaçan penaltı kaydı. Kaleciye +5 vermeden önce penaltının gerçekten **kurtarıldığını** ayrı kanıtla; sırf kaçırıldı diye kaleci +5 yazma.
- **317864 Samsunspor – Amed**: `Afonso Sousa` 36. dk sarı + 37. dk `YellowRed`, `Mbaye Diagne` 60. dk sarı + 61. dk `YellowRed`. Son sarı/kırmızı skorlamasında iki kere kırmızı, eksik sarı veya yanlış çifte ceza oluşmamalı.
- **Bonus eşitlikleri:** Resmî TFF yardım sayfasına göre aynı baz puanı alan oyuncular aynı bonusu alır; sıralama sabit üç kişiyi zorlamaz. 3–3–2 gibi senaryoları koru. https://tfffantezilig.com/yardim?tab=kurallar-1

## Gelişmiş hücum istatistikleri

Read-only advanced extraction `40407997343` çıktısında **282** eşleştirilmiş oyuncuya ait kaynak kaydı var; alan bazında açıkça gözlenen sayılar:

| Alan | Kaynakta mevcut | Eksik, `null` |
| --- | ---: | ---: |
| xG | 128 | 154 |
| xA | 192 | 90 |
| Şut | 128 | 154 |
| İsabetli şut | 128 | 154 |
| Kilit pas | 264 | 18 |

Eksik metrik asla `0` değil; "bilinmiyor". TFF/SofaScore/Maçkolik veya başka lisanslı güvenilir kaynakla ayrı tamamlanmalı.

## Production yayınını engelleyen durumlar

- MH9 `scout_player_weekly_points`: **0/456** resmî/bağımsız olarak kabul edilmiş final satırı.
- `scout_verified_weekly_attack` MH9: **0** veritabanına işlenmiş satır. GitHub artifact içindeki gözlemler **henüz import edilmedi**.
- `scout_player_season_stats` MH9: **0/456**; MH9 takım sezon istatistikleri de güncellenmedi.
- `scout_match_history.fantasy_closure`: **0/9 KAPANDI**.
- MH10 `scout_model_runs`: **0**; yeni 50K, optimizer, yayın/önbellek adımlarına geçilmedi.
- Kaynak sonucun 9/9 oluşu tek başına resmî Fantasy oyuncu puanı, katkı/penaltı istisnası veya bonus onayı değildir.

**Dondurulmuş MH9 backtest ve kullanıcıların kayıtlı kadroları korunacak.** Eksik kaynaklar ve Fantasy final QA tamamlanmadığı sürece `source_kind=fresh_closed_actual`, `fantasy_closure=KAPANDI`, `scout_replay_weeks` kapanışı veya MH10 model promotion **yapılmayacak**.

Kaynaklar:
- https://github.com/ecetin1998/tff-fantezi/actions/runs/40407997343
- https://github.com/ecetin1998/tff-fantezi/pull/384
- https://www.tff.org/Default.aspx?macId=317856&pageID=29 (diğer resmî maç kimlikleri sırasıyla 317857–317864)
- https://tfffantezilig.com/yardim?tab=kurallar-1
