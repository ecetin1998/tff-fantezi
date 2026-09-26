# Fantezi Scout

Süper Lig fantasy için canlı xFP, dakika/rol tahmini, maç olasılıkları, model kadrosu ve kişisel kadro analizi.

## Stack

- Next.js 16 App Router + React 19
- Supabase Auth + Postgres + RLS
- Vercel
- Model/replay yardımcıları: Node.js + Python

Canlı havuzda şu anda **449 aktif oyuncu** bulunuyor.

## Mimari

```text
kaynak veriler
    ↓
aday Scout run
    ↓
scout_run_qa + scout_data_integrity_qa
    ↓
walk-forward replay/backtest
    ↓
scout_run_release_gates
    ↓
scout_promote_run
    ↓
Supabase scout_* tabloları
    ↓
Next.js public data client → site / API
```

Tarayıcı yalnız publishable Supabase anahtarını kullanır. Service-role key ve diğer sunucu secret'ları frontend bundle'a girmez.

## Ortam değişkenleri

`.env.example` dosyasını temel alın:

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase proje URL'si.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — tarayıcıda kullanılabilen publishable key.
- `NEXT_PUBLIC_SITE_URL` — production site origin'i; ör. `https://tff-fantezi.vercel.app`.
- `SCOUT_DATA_API_KEY` — yalnız server-side tam/özet Scout API erişimi için. **NEXT_PUBLIC_ öneki verilmez.**

Internal Supabase Edge Function gate secret'ı Vercel env değildir. Supabase secret olarak `SCOUT_GATE_SECRET`, GitHub Actions tarafında GitHub Secret olarak aynı değerin `SCOUT_GATE_SECRET` adıyla tutulması gerekir.

## Kurulum

```bash
npm ci
npm run lint
npm test
npm run build
npm run dev
```

PR CI'sı lint + model testleri + production build çalıştırır. CI sırasında dış Supabase bağımlılığı `SCOUT_OFFLINE_BUILD=1` ile devreden çıkarılır; Vercel Preview gerçek environment ile ayrıca build edilir.

## Veri erişimi ve RLS

Public sayfalar `lib/supabase/public.js` içindeki çerezsiz client'ı kullanır. Kullanıcı oturumuna ait sorgular server/browser auth client'larında kalır.

Temel güvenlik sınırları:

- `scout_subscriptions`: authenticated kullanıcı yalnız kendi satırını okuyabilir; browser rolleri yazamaz.
- `scout_user_squads` / `scout_user_squad_members`: yalnız sahibi okuyup yazabilir.
- `scout_pro_interest`: kullanıcı yalnız kendi satırını ekleyip okuyabilir.
- Model tabloları browser rollerinde read-only'dir.
- Availability kaynak detayları ve model/learning teknik notları public kolon erişimine açık değildir.
- Promote/replay write RPC'leri service-role ile sınırlıdır.

Audit ve hardening SQL'leri `supabase/migrations/` altındadır.

## Kadro kaydetme

Kullanıcı kadrosu `save_user_squad(p_members jsonb)` RPC'siyle tek transaction içinde kaydedilir. Sunucu ve DB tarafında:

- 15 benzersiz ve aktif oyuncu,
- 2 KL / 5 DEF / 5 OS / 3 FOR,
- 100m bütçe,
- 11 ilk oyuncu + 4 sıralı yedek,
- tam 1 ilk-11 kaptanı,
- izin verilen formasyonlar

kontrol edilir.

`MAX_PER_CLUB` şu anda bilerek kapalıdır; oyun kuralı kesinleştirildiğinde tek sabitten açılabilir.

## Haftalık model yayın akışı

Yeni haftayı doğrudan current yapmayın.

1. Kaynak/fikstür/availability verisini güncelleyin.
2. Yeni bir candidate run üretin.
3. `scout_run_qa(run_id)` çalıştırın.
4. `scout_data_integrity_qa(run_id)` çalıştırın.
5. Güncel motorla deterministic replay/backtest çalıştırın.
6. Üç gate sonucu PASS ise `scout_run_release_gates` kaydını tamamlayın.
7. Son olarak yalnız service role ile `scout_promote_run(run_id)` çağırın.

`notes` içinde `do not publish` geçen veya backtest gate'i eksik bir run promote edilemez.

Planlanan otomasyon tasarımı `docs/model-refresh-design.md` dosyasındadır; schedule henüz bilinçli olarak kurulmamıştır.

## Scout Data API

### Public feed

`GET /api/scout-data?section=<section>`

Şema: `schema_version: "2.0"`.

Desteklenen public bölümler:

- `all`
- `players`
- `matches`
- `squads`
- `availability`
- `roles`
- `weekly`
- `performance`

Public cevaplarda run notes, availability `detail_source_*` alanları ve ham replay oyuncu hata kayıtları yoktur. Bilinmeyen query parametreleri veri cache anahtarına girmez. Veri katmanı 300 saniye cache edilir.

`section=performance` için `x-api-key: <SCOUT_DATA_API_KEY>` verilirse server-only tam performans payload'ı alınabilir. Anahtarsız çağrı yalnız kullanıcıya dönük özet performansı döndürür.

### Assistant summary feed

`GET /api/scout-data/summary?gw=7`

Bu endpoint her zaman `x-api-key` ister ve kadro kararı için kompakt alanları döndürür:

- en yüksek xFP oyuncuları,
- maç xG / 1-X-2 / clean-sheet olasılıkları,
- önerilen ve alternatif kadro,
- kritik availability kayıtları.

Hedef payload 50 KB altıdır.

## Deploy ve geliştirme süreci

- `main` üzerine doğrudan çalışma yapılmaz.
- Değişiklikler çalışma dalında anlamlı commit'ler halinde hazırlanır.
- PR'da `quality` check'i zorunlu olmalıdır.
- Vercel Preview'da smoke test tamamlanmadan merge yapılmaz.
- Model motoru değişiklikleri uygulama değişikliklerinden ayrı commit'te tutulur ve replay/QA kanıtı olmadan current run'a uygulanmaz.

Production panel ayarları ve manuel doğrulama listesi `docs/production-readiness.md` içindedir.
