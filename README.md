# Fantezi Scout

Süper Lig fantasy için canlı xFP, dakika/rol tahmini, maç olasılıkları, model kadrosu ve kişisel kadro analizi.

## Stack
- Next.js 16 App Router
- React 19
- Supabase Auth + Postgres + RLS
- Vercel-ready

## Canlı veri
Fresh – Kontrol Sürümü → `scout_*` Supabase tabloları. Site yalnızca publishable Supabase key kullanır; secret/service role frontend'e konmaz.

## Özellikler
- Ana dashboard ve model kadrosu
- 529 oyunculuk filtrelenebilir/sıralanabilir GW tahmini
- 9 maçlık olasılık modeli
- Email/şifre kayıt ve giriş
- 15 kişilik kullanıcı kadrosu: 2 GK / 5 DEF / 5 MID / 3 FWD, 100m bütçe validasyonu
- Canlı xFP ile tek-transfer önerisi
- Free / Pro erişim modeli
- Pro talep listesi (ödeme entegrasyonu öncesi dönüşüm ölçümü)

## Çalıştırma
```bash
npm install
npm run dev
```
