# Fantezi Scout — Production Readiness

Bu dosya public beta / Pro öncesindeki teknik kapıları ve manuel panel ayarlarını takip eder.

## Bu audit dalında tamamlananlar

- [x] Public veri okumaları çerezsiz Supabase client'a taşındı.
- [x] Layout/Nav server-side auth cookie bağımlılığından çıkarıldı.
- [x] `/api/scout-data` public payload'ı daraltıldı; teknik kaynak alanları ve run notes kaldırıldı.
- [x] Anahtarlı kompakt `/api/scout-data/summary` endpoint'i eklendi.
- [x] Scout API hata ayrıntıları response yerine structured server log'a taşındı.
- [x] RLS/grant audit SQL'i ve hardening migration'ı hazırlandı.
- [x] Promote/replay write RPC'leri browser rollerinden kapatılacak migration hazırlandı.
- [x] `scout_promote_run` için QA + data-integrity + backtest release gate tasarlandı.
- [x] Kadro kaydı tek transaction RPC'sine taşındı; UI ve server doğrulamaları eklendi.
- [x] Şifre sıfırlama akışı eklendi.
- [x] Public 404 davranışı oyuncu/takım detaylarında düzeltildi.
- [x] PR CI: lint + test + build.
- [x] `package-lock.json`, Dependabot, env örneği ve .gitignore eklendi.
- [x] Server/API hataları Vercel Function Logs ile uyumlu yapılandırılmış JSON olarak loglanıyor.
- [x] Model simulator testleri: 990 dakika, 11 starter, own-goal/asist, kart ve quantile edge-case.
- [x] Optimizer testleri: kaptan metriği, formasyon, kadro kuralları ve yedek değeri.

## Merge öncesi zorunlu manuel doğrulamalar

- [ ] SQL migration'ları panelde sırasıyla çalıştır.
- [ ] İki normal test hesabıyla RLS testini tamamla.
- [ ] Supabase Edge Function secret `SCOUT_GATE_SECRET` ekle.
- [ ] GitHub Secrets: `SCOUT_GATE_SECRET`, `SUPABASE_FUNCTIONS_URL`.
- [ ] Vercel env: `SCOUT_DATA_API_KEY`, `NEXT_PUBLIC_SITE_URL`, Supabase public env'leri.
- [ ] Vercel Firewall'da `/api/scout-data*` için IP tabanlı rate limit ekle.
- [ ] Supabase Auth leaked-password protection aç.
- [ ] Supabase Auth redirect URL'lerine production ve preview confirm/reset yollarını ekle.
- [ ] Preview smoke test listesinin tamamı PASS olsun.
- [ ] Güncel model commit'i için iki QA gate + güncel motor backtest PASS olsun.

## Auth redirect URL'leri

Production origin örneği:

- `https://tff-fantezi.vercel.app/confirm-email`
- `https://tff-fantezi.vercel.app/reset-password`

Özel domain bağlanınca aynı iki path özel domaine de eklenmeli.

Preview üzerinde auth test edilecekse yalnız kontrollü preview pattern'i ekleyin. Geniş ve gereksiz wildcard kullanmayın.

## Vercel

### Environment Variables

Production ve Preview için:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL` — production'da gerçek canonical origin
- `SCOUT_DATA_API_KEY` — server-only, rastgele ve uzun

`SCOUT_DATA_API_KEY` için `NEXT_PUBLIC_` öneki kullanılmaz.

### Firewall

Önerilen başlangıç kuralı:

- path: `/api/scout-data*`
- key: client IP
- başlangıç limiti: public feed için 60 istek/dakika/IP
- aşımda 429

Gerçek trafik gözlendikten sonra limit ayarlanmalı. Anahtarlı summary endpoint'i için daha düşük bir ayrı limit kullanılabilir.

### Observability

Vercel Observability / Function Logs açık tutulmalı. `api:scout-data`, `api:scout-data-summary`, `action:saveSquad:*`, `action:joinProWaitlist` scope'ları alarm/filtre için kullanılabilir.

### Ignored Build Step

Production deploy yalnız `main` merge'lerinden gelmeli. Preview deploylar çalışma dallarında kalır. Repo büyürse dokümantasyon-only commitleri için Vercel Ignored Build Step kullanılabilir; uygulama/model/migration değişikliklerini yanlışlıkla atlayacak geniş bir ignore kuralı yazılmamalıdır.

## GitHub

`main` için branch protection / ruleset:

- pull request zorunlu
- en az 1 approval
- merge öncesi branch güncel olmalı
- required status check: `quality`
- force-push kapalı
- branch deletion kapalı
- doğrudan push kısıtlı

Model gate workflow'u yalnız GitHub Secrets üzerinden internal Supabase function çağırır.

## Supabase Auth

Public beta öncesi:

- custom SMTP bağla ve confirmation/reset maillerini gerçek hesapla test et
- leaked password protection aç
- Site URL'yi canonical production origin yap
- confirmation ve reset redirect URL'lerini ekle

## RLS iki-hesap testi

Normal kullanıcı A ve B ile:

1. A kadro kaydeder, squad id alınır.
2. B A'nın squad satırını SELECT etmeye çalışır → 0 satır.
3. B A'nın squad member'larını SELECT/INSERT/UPDATE/DELETE etmeye çalışır → erişim yok.
4. A kendi kadrosunu okuyup günceller → başarılı.
5. A kendi subscription satırında INSERT/UPDATE/DELETE dener → başarısız.
6. A kendi subscription satırını SELECT eder → başarılı; B aynı satırı göremez.
7. A kendi `scout_pro_interest` satırını INSERT + SELECT edebilir; UPDATE/DELETE yapamaz.
8. anon model tablolarını yalnız izin verilen kolonlarla okuyabilir; write yapamaz.

## Model release kapısı

Model değişikliği production'a ancak:

1. candidate run,
2. `scout_run_qa` PASS,
3. `scout_data_integrity_qa` PASS,
4. aynı motor sürümüyle replay/backtest PASS,
5. release gate kaydı PASS,
6. `scout_promote_run`

sırasıyla çıkar.

Mevcut replay Edge Function'ı repo model motoruyla birebir eşleşmiyorsa onun sonucu yeni model commit'inin kanıtı olarak kabul edilmez.

## Açık kalan operasyon işleri

- [ ] SMTP
- [ ] panelde migration uygulaması
- [ ] iki hesaplı RLS testi
- [ ] Firewall rate limit
- [ ] branch protection
- [ ] Preview smoke testi
- [ ] model backtest/release gate
- [ ] production trafik sonrası log/alert eşikleri
