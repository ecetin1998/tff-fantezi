# MH11 — KAYNAK-TABANLI GEÇİCİ FANTASY PUANLARI
**Hesap tarihi:** 9 Kasım 2026 · **Statü:** provisional / QA required · **Resmî TFF Fantezi puan dökümü değildir.**

Tüm 9 maç ve 456 aktif oyuncu için puan bileşenleri `docs/mh11-provisional-fantasy-scores-20261109.csv` dosyasına kaydedildi. **Bu CSV'yi haftalık kesin puan tablosuyla veya MH11 geçmiş model öğrenmesiyle karıştırmayın.** `scout_player_weekly_points` tablomuza final puan yazılmadı, `scout_backtest_weeks` MH11 hâlâ open ve MH12 aktivasyonu yapılmadı.

## Maç bazında hesaplanan geçici toplamlar

| Maç | Skor | Oyuna çıkan havuz oyuncusu | Bonus öncesi | Tahmini bonus | Geçici toplam |
|---|:---:|---:|---:|---:|---:|
| Gaziantep – Kasımpaşa | 0–2 | 32 | 80 | +10 | **90** |
| Eyüpspor – Kocaelispor | 0–2 | 30 | 78 | +7 | **85** |
| Samsunspor – Konyaspor | 1–0 | 31 | 79 | +13 | **92** |
| Göztepe – Başakşehir | 1–2 | 32 | 65 | +9 | **74** |
| Galatasaray – Amed | 4–3 | 32 | 70 | +9 | **79** |
| Rizespor – Erzurumspor | 2–1 | 31 | 65 | +7 | **72** |
| Çorum FK – Fenerbahçe | 0–5 | 30 | 102 | +7 | **109** |
| Alanyaspor – Trabzonspor | 0–2 | 29 | 86 | +7 | **93** |
| Beşiktaş – Gençlerbirliği | 3–0 | 31 | 88 | +10 | **98** |
| **Toplam** | | **278** | **713** | **+79** | **792** |

*Bu sayılar futbol maçına çıkan tüm aktif havuz oyuncularının ham puan toplamıdır; menajerin ilk 11'i, kaptanı veya yedekleri üzerinden hesaplanan kadro puanı değildir. Bonus toplamı 54 değil 79 çıkıyor çünkü sıralamada eşit puanlı oyuncular aynı sıranın bonusunu da alıyor ve resmî kural eşitliğe izin veriyor. Bu bonus sıralaması yalnız **aday taban puanlarına göre** tahmin edildi.*

## Nasıl hesaplandı?

Resmî [TFF Fantezi puan kuralları](https://tfffantezilig.com/yardim?tab=kurallar-1):

- Oyuncu 1–60 dakika arasında +1, **60 dakikadan fazla** +2. Gol: kaleci +10 / defans +6 / orta saha +5 / forvet +4. Asist +3.
- Kaleci ve defans: en az 60 dk ve maçta gol yememiş takım için +4; orta saha +1.
- GK kurtarışları: 3'te 1; GK/DEF yenilen her 2 gol için −1; sarı −1, kırmızı −3, kendi kalesine −2.
- Eksik penaltı kurtarışı/kaçırma olayları kaynakta doğrulanmadığından **hesaba katılamadı**. Bu "oyuncu penaltı kullanmadı" anlamına gelmez.
- Bonus: aday taban puanının maç içi sıralamasında +3/+2/+1; **eşit puanlılar aynı sıradan alır** (competition rank yaklaşımı). **Resmî bonus puanı değil.**
- Gol yeme cezası mevcut maçın takım toplamına göre hesaplandı. Oyuncu sahaya girmeden veya çıktıktan sonra yenilen gol için durum farklılaşabileceğinden bu yaklaşım ayrıca resmî Fantasy hesabıyla kontrol edilmeli.

### Kaynak ve tahmin sınıfları

- **178 oyuncu:** ilk 11 ve bütün oyuna giren oyuncuların tamamı çıkarılarak kaynaklı **0 dakika DNP**.
- **113 oyuncu:** ilk 11 ve bitmiş maç olay kaydına göre oyundan çıkmayan, tam maç geçirmiş **90 dakika**; 105'inde bu 90 dakika oyuncu istatistik sağlayıcısının ayrı resmî ihracı değil, maç olaylarından türetilmiştir.
- **165 oyuncu:** 82 sahadan çıkan + 82 giren + 1 kırmızı kart; erişilebilir FotMob, TFF ve maç akışı dakika kayıtlarından geçici dakika çıkarıldı. Değişiklik zamanında sağlayıcılar 83/84 gibi ayrıştığında **yüksek dakika** tercih edildi; devre arası `46'` → 45 dakika, uzatma içinde giren → minimum 1 dakika. Kaydedilen dakika resmi TFF oyuncu dakika istatistiği diye işaretlenmedi.
- Oyuncu havuzuna dahil edilmeyen 4 dış esame oyuncusu, 456 oyuncudan herhangi birine uydurulmadı.

### Üç çelişkili kaleci

| Oyuncu | Maç | Kaynak uyuşmazlığı | Geçici kurtarış |
|---|---|---|---:|
| Deniz Dilmen | Göztepe – Başakşehir | [Ludistat](https://www.ludistat.com/games/goztepe-vs-basaksehir-2026-11-07) 3, farklı sağlayıcı 2 | **3** |
| Zafer Görgen | Rize – Erzurumspor | [AA maç raporu](https://www.aa.com.tr/tr/spor/rizespor-sahasindan-galibiyetle-ayrildi/4116052) ve takım toplamı 2; diğer sağlayıcı 1 | **2** |
| Marcos Felipe | Çorum – Fenerbahçe | [Kulübün maç raporu](https://corumfk.com.tr/mac/2026-11-08-corum-fk-fenerbahce) 2, [Teleskor oyuncu satırı](https://www.teleskor.com.tr/mac/corum-fk-fenerbahce-34030/oyuncular) 2; diğer sağlayıcı 1 | **2** |

Bu üç kaleciden **hiçbirinde 0 kurtarışı doğrulayan kaynak yok**; bu nedenle 0 yazılmadı. Uyuşmazlık ve tercih `scout_match_player_evidence.evidence_note` içinde kalıcı notlandı. Daha önceki diğer kaynak farklılıkları (ör. Ataberk Dadakdeniz) ayrıca kesinleştirilmeli.

## Kapanış öncesi QA

1. TFF'nin oyuncu bazlı **kesin dakikaları** ile 165 türetilmiş süreyi ve 105 olaydan türetilmiş tam maçı karşılaştır.
2. Özellikle 60+ eşiği, maç içinde yenilen gol sayısı, ikinci sarı ve kendi kalesine gol kuralları için resmi Fantasy karşılaştırması yap.
3. 22 kaynaklı **aday asist**, 30 sarı kart, 1 kırmızı kart, 27 gol, 1 OG, 18 kaleci kurtarış kaydını ve olası penaltı olaylarını doğrula.
4. **Resmî Fantasy bonus ve puan dökümü** geldiğinde 456 oyuncu üzerinden örnek bazlı fark kontrolü yap; yalnız gerekli düzeltmelerden sonra `scout_player_weekly_points.is_final` / `scout_backtest_weeks` kapanışını gerçekleştir.
5. MH11'in 2 Kasım'da dondurulmuş tahminleri değiştirilemez. Yeni modelin ileri doğrulaması MH12+ üzerinde yapılır.

**Provisional toplam = 792, resmi kesin puan toplamı = henüz bilinmiyor.**
