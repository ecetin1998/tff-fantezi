# Canlı Draft — yayın ve doğrulama rehberi

Bu doküman `/draft` odalarının güvenli şekilde yayınlanması içindir. Oyuncu tahmin modeli, ana kadrolar ve üyelik katmanları değişmemelidir.

## Önkoşullar

- GitHub PR #341 CI: Lint, Test, Build, Route Runtime başarılı.
- Supabase proje kimliği: `nnoagjayvrwyjtizhnfz`.
- 2–8 katılımcı, 15'er oyuncu, 2 KL + 5 DEF + 5 OS + 3 FOR.
- Geliştirme dalındaki yeni migration'lar production DB'ye uygulanmadan **Cloudflare deployment yapmayın**.
- SQL Editor veya migration dağıtımı yalnız yetkili proje operatörü tarafından yürütülmelidir; sohbet içinde denenen migration aracı güvenlik kontrolü tarafından engellendi.

## Sırayla uygulanacak migration'lar

1. `supabase/migrations/20261021162000_four_player_live_draft.sql` — özel oda tabloları ve temel RPC'ler
2. `supabase/migrations/20261021163000_four_player_draft_pool.sql` — davet ekranı ve yalnızca izin verilen model alanları
3. `supabase/migrations/20261021164000_flexible_draft_rooms_auction_schema.sql` — 2–8 kişi, 100 kredi bütçe ve açık artırma tabloları
4. `supabase/migrations/20261021165000_server_timed_auction_actions.sql` — süre, teklifler, satış ve atomik kapanış

SQL Editor'da manuel çalıştırılan dosyalar migration history kaydı oluşturmaz; ardından CLI `db push` yapmadan önce `supabase_migrations.schema_migrations` ile sürüm geçmişini eşleştirin. Aynı `create table` betiklerini iki kez çalıştırmayın.

## Read-only doğrulama

```sql
select
 to_regclass('public.scout_draft_rooms') as rooms,
 to_regclass('public.scout_draft_teams') as teams,
 to_regclass('public.scout_draft_picks') as picks,
 to_regclass('public.scout_draft_auction_lots') as lots,
 to_regclass('public.scout_draft_auction_bids') as bids;

select p.proname,
 has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
 has_function_privilege('authenticated', p.oid, 'EXECUTE') as user_can_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like 'scout_draft_%'
order by p.proname;

select
 (select count(*) from public.scout_model_runs where is_current and status='ready') as ready_runs,
 (select count(*) from public.scout_players where active) as active_players;
```

Beklenen: bütün tablolar mevcut; bütün `scout_draft_*` RPC'lerinde `anon_can_execute=false`, `user_can_execute=true`. Tablo düzeyinde `anon` veya `authenticated` için doğrudan SELECT/INSERT/UPDATE/DELETE izni verilmemeli; RPC'ler `auth.uid()` ile oda üyeliğini doğrulamalıdır.

## Test kapıları

- 2, 4 ve 8 farklı kullanıcı/sekmede oda oluşturma, davet koduyla katılma ve kura.
- Snake ve Normal modlarda sıra doğruluğu; bir oyuncuya iki farklı takımın sahip olamaması; eksik kadro mevkilerinde seçimi reddetme.
- Açık artırmada 100 kredi ve eksik her kadro yeri için 1 kredi rezervi; eşzamanlı teklifler; 15 saniye / her geçerli teklif +5 saniye; süresi dolmuş teklifler reddedilmeli.
- Açık artırmada satış ve sonraki oyuncuya otomatik geçiş en az bir katılımcı odadayken çalışmalı. Kimse çevrimiçi değilken ilerlemek için sunucu planlayıcısı sonraki geliştirmedir.
- Ücretsiz kullanıcılara P90/6+ ve Pro analitik kolonları sızmamalı.
- Mobil 8 takım panosu ve uzun draftlarda performans.
- Oda oluşturulduğu andaki model run sabit kalmalı ve MH9 üretim verileri/ana kadrolar değişmemeli.

## Yayın

1. Migration ve kullanıcı testleri başarılıysa PR #341'i `main` dalına birleştirin.
2. GitHub Actions içinden **Cloudflare Workers deploy** iş akışını manuel `main` üzerinden çalıştırın.
3. Workflow `/api/health` yayın SHA kontrolünden ve üretim smoke testinden geçmeli.
4. `https://fanteziligrehberi.com/draft` sayfasında ücretsiz hesapla oda oluşturma ve dört cihazla teklif verme doğrulanmalı.
5. Herhangi bir kapı başarısızsa ilan etmeyin; canlı sitede daha önce çalışan ana özellikleri koruyun.
