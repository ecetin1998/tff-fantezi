# Fantezi Scout — Production Readiness

Bu dosya domain, auth ve ürünleştirme öncesi teknik kapıları tek yerde tutar.

## Şu an hazır

- Supabase current-run QA gate aktif: ready + 50K sim + projection/role coverage + 9 maç/18 takım + iki legal kadro geçmeden bir run current olamaz.
- Veritabanında tek bir current run bulunmasını zorlayan unique partial index aktif.
- Replay worker SECURITY DEFINER RPC'leri anon/authenticated rollerine kapalı; yalnız service role çağırabilir.
- Goal distribution config RLS altında.
- Backtest sayfası canlı production motorunu, walk-forward replay benchmarkını ve MH7+ live-frozen performansı ayrı gösterir.
- `/auth/confirm` e-posta doğrulama dönüşünü token hash, PKCE code veya browser session/hash akışlarında karşılar.
- Auth redirect URL üretimi `NEXT_PUBLIC_SITE_URL` varsa onu, yoksa gelen host/protocol bilgisini kullanır; özel domain geçişinde kod değişikliği gerekmez.

## Domain bağlanmadan önce

1. Vercel'e seçilen domaini ekle ve DNS doğrulamasını tamamla.
2. Production environment'a `NEXT_PUBLIC_SITE_URL=https://<domain>` ekle.
3. Supabase Auth URL Configuration içinde Site URL'yi production domaine geçir.
4. İzin verilen redirect URL'lerine en az `https://<domain>/auth/confirm` ve Vercel production fallback `/auth/confirm` adresini ekle.
5. Kayıt → e-posta → doğrulama → `/squad` → çıkış → tekrar giriş akışını gerçek bir test hesabıyla uçtan uca doğrula.

## E-posta / auth production kapıları

- Supabase'in varsayılan mail göndericisi development için kısıtlıdır. Public beta öncesi kendi SMTP sağlayıcımızı bağla.
- Custom SMTP sonrası confirmation ve resend akışlarını tekrar test et.
- Supabase Auth'ta leaked password protection özelliğini aç.
- User squad ve Pro-interest tablolarının RLS politikalarını tekrar advisor + manuel test ile doğrula.
- Şifre sıfırlama akışını public beta öncesi ekle/test et.

## Operasyon

- UI değişikliklerini tek tek değil, batch commit/deploy halinde çıkar.
- Model değişikliği önce staging run üretir; QA PASS olmadan current swap yok.
- MH7+ live-frozen tahminleri kickoff sonrası overwrite edilmez.
- Production deploy sonrası en az `/`, `/players`, `/teams`, `/matches`, `/squad`, `/backtest`, `/login` smoke test edilir.
- Hata takibi ve temel kullanım analitiği public beta öncesi eklenir.

## Ürünleştirme sonraki kapı

Ödeme/Pro planına ancak auth, custom domain, SMTP, RLS ve birkaç haftalık stabil model otomasyonu tamamlandıktan sonra geçilir.
