# Fantezi Scout — Production Readiness

Bu dosya audit round 2 sonundaki **canlı** durumu gösterir.

## Tamamlananlar

- [x] Public veri okumaları çerezsiz Supabase client'a taşındı.
- [x] Layout/Nav server-side auth cookie bağımlılığından çıkarıldı.
- [x] `/api/scout-data` public payload'ı daraltıldı; teknik kaynak alanları ve run notes kaldırıldı.
- [x] Anahtarlı kompakt `/api/scout-data/summary` endpoint'i eklendi.
- [x] Scout API hata ayrıntıları response yerine structured server log'a taşındı.
- [x] RLS/grant hardening migration'ları production Supabase'e uygulandı.
- [x] Subscription browser write yetkileri kaldırıldı.
- [x] Squad ve squad-member tablolarında owner-only RLS doğrulandı.
- [x] Pro-interest yalnız own SELECT + INSERT; UPDATE/DELETE kaldırıldı.
- [x] Availability kaynak detayları ile model/learning internal kolonları browser rollerinden gizlendi.
- [x] Promote/replay write RPC'leri browser rollerinden kapatıldı.
- [x] `scout_promote_run` QA + data-integrity + backtest release gate zorunluluğu ile harden edildi.
- [x] Release gate production'a yazıldı ve MH7 idempotent promote doğrulaması PASS.
- [x] Kadro kaydı tek transaction `save_user_squad(jsonb)` RPC'sine taşındı.
- [x] Atomic squad RPC rollback'li gerçek 15 oyunculu testte PASS: 2/5/5/3, 4-4-2, 4 bench, 1 captain, 85.50m.
- [x] İki ayrı JWT `sub` bağlamıyla rollback'li RLS izolasyon testi 14/14 PASS.
- [x] Şifre sıfırlama akışı eklendi.
- [x] Free-plan telafisi olarak signup/reset şifreleri HIBP Pwned Passwords k-anonim range API ile kontrol ediliyor; minimum 8 karakter.
- [x] Public 404 davranışı oyuncu/takım detaylarında düzeltildi.
- [x] PR CI: lint + test + build.
- [x] `package-lock.json`, Dependabot, env örneği ve .gitignore eklendi.
- [x] Server/API hataları Vercel Function Logs ile uyumlu yapılandırılmış JSON olarak loglanıyor.
- [x] Model simulator testleri: 990 dakika, 11 starter, own-goal/asist, kart ve quantile edge-case.
- [x] Optimizer testleri: kaptan metriği, formasyon, kadro kuralları ve yedek değeri.
- [x] MH1–MH6 50K walk-forward replay ve MH7 paired-delta kanıtı kaydedildi.
- [x] Beş internal Edge Function GitHub OIDC ile korunuyor; uzun ömürlü gate secret zorunlu değil.
- [x] GitHub gate workflow `id-token: write` ile kısa ömürlü OIDC JWT kullanıyor.
- [x] Altı eksik foreign-key index'i production DB'ye eklendi.
- [x] Internal/legacy RLS tablolarına explicit browser-deny policy eklendi; security advisor'daki `rls_enabled_no_policy` bulguları kapandı.
- [x] Security advisor'da DB kaynaklı açık kalmadı; yalnız Free plan native leaked-password WARN'ı mevcut ve uygulama-level HIBP kontrolüyle telafi ediliyor.
- [x] Güncel model run: model QA PASS + data-integrity PASS + backtest PASS + release gate PASS.

## RLS doğrulama özeti

Production DB üzerinde transaction + rollback ile iki ayrı JWT kimliği simüle edildi:

1. A kendi squad/squad-member/subscription/pro-interest satırlarını okuyabildi.
2. A kendi squad'ını güncelleyebildi.
3. B, A'nın squad ve member satırlarını okuyamadı.
4. B, A'nın squad'ını güncelleyemedi.
5. B, A'nın member satırını silemedi veya A'nın squad'ına member ekleyemedi.
6. B, A'nın subscription/pro-interest satırlarını göremedi.
7. Subscription INSERT/UPDATE/DELETE browser privilege'ları yok.
8. Pro-interest UPDATE/DELETE browser privilege'ları yok.
9. Model tablolarında kullanıcı tabloları dışında browser DML grant'i yok.

Test verileri rollback edildi; production'da audit test satırı bırakılmadı.

## Model release durumu

MH7 `ScoutPlus 3.3 RC2 / GW7 • attack-share • 50K` için:

- `scout_run_qa`: PASS
- `scout_data_integrity_qa`: PASS
- 50K MH1–MH6 replay: kabul edildi
- MH7 paired attack-share delta: kabul edildi
- `scout_run_release_gates`: PASS
- stale `do not publish until full QA and backtest` notu kaldırıldı
- `scout_promote_run`: PASS

Canonical model kanıtı: `docs/audit-round-2-model-validation.md`.

## Edge Function güvenliği

Protected workers:

- `run-mh1-replay-chunk`
- `run-replay-distribution-test`
- `run-top25-distribution-gate`
- `run-staging-optimizer`
- `staging-optimizer-data`

Her biri GitHub OIDC token'ında en az şu claim'leri doğrular:

- issuer: GitHub Actions OIDC
- audience: `tff-fantezi-scout`
- repository id: `1353738004`
- repository: `ecetin1998/tff-fantezi`
- ref: `refs/heads/main`
- event: `workflow_dispatch`

Eski `SCOUT_GATE_SECRET` yalnız opsiyonel geri uyumluluk fallback'idir.

## Supabase Auth

Organizasyon planı **Free**. Supabase'in native leaked-password protection özelliği ücretli planda olduğu için platform toggle'ı açılamıyor. Bunun yerine uygulama signup/reset yolunda HIBP Pwned Passwords k-anonim kontrolü kullanıyor.

Supabase Auth URL allow-list / Site URL ayarı hosted project management config'idir; mevcut Supabase connector bu config'i yazma aksiyonu sunmuyor. Uygulama kodu production origin için `NEXT_PUBLIC_SITE_URL` kullanıyor ve confirmation/reset yolları hazır.

## GitHub

Audit PR draft olarak tutuluyor ve `quality` CI zorunlu merge öncesi kontrolümüzdür.

İstenen ideal `main` branch protection/ruleset:
- PR zorunlu
- en az 1 approval
- required check: `quality`
- force-push kapalı
- direct push kısıtlı

Bağlı GitHub App repository-admin mutation iznine sahip değil; branch-protection REST endpoint'i 403 dönüyor. Bu nedenle bu tek repo-admin ayarı koddan uygulanamıyor.

Eski QA/audit/model-gate dalları main ile 0 ahead / 0 diff durumunda; connector branch-delete aksiyonu sunmadığı için fiziksel silme yapılmadı.

## Canlı `main` uyumluluk köprüsü

Audit migration'ları production DB'ye Vercel deploy'dan önce uygulandığı için eski canlı `main` build'inin `SELECT *` sorguları `scout_model_runs`, `scout_availability` ve `scout_learning_log` üzerinde izin hatasına düşüyordu. Canlı siteyi yeniden bağlamak için yalnız bu eski sorguların ihtiyaç duyduğu eksik SELECT kolonları geçici olarak geri açıldı (`20260926223700_live_main_read_compat.sql`).

Audit branch production'a deploy olduktan sonra **hemen** `20260926223800_post_deploy_restrict_sensitive_public_columns.sql` uygulanmalı; yeni branch zaten explicit safe-column sorguları kullanıyor.

## Vercel — kalan deploy blocker'ı

PR Preview deployment şu anda Vercel tarafından **build-rate-limit** ile engelleniyor.

Bu nedenle sadece Vercel'e bağlı son doğrulamalar bekliyor:

- Preview deployment oluşması
- public route smoke testi
- 404 smoke
- API response size
- `x-vercel-cache` / ikinci istek cache davranışı
- keyed summary payload
- Vercel env/firewall/observability panel kontrolü

Kod/DB/model tarafında bu deploy'u bekleyen başka release-gate yoktur.
