alter table public.scout_learning_log add column if not exists summary_tr text;

update public.scout_learning_log
set summary_tr=case
  when component='Dağılım Kalibrasyonu' then 'Tahmin aralıkları son haftalarda beklenenden biraz dar kaldı; MH7 sonucu ile yeniden doğrulanacak.'
  when component in ('Roster / Active Pool','Kadro / Aktif Havuz') then 'Aktif olmayan oyuncuların pay tüketmesi engellendi ve aktif havuz yeniden doğrulandı.'
  when component='Takım / Venue' then 'Ev sahibi avantajına ek çarpan için yeterli kanıt bulunmadı; mevcut yaklaşım korundu.'
  when component='Maç Olay Dağılımı' then 'Daha geniş skor dağılımı test edildi ancak fantezi doğruluğunda kalıcı kazanç göstermedi.'
  when component='Dağılım / Upper Tail' then 'Yüksek skor bandını ayrı bir çarpanla şişirmek yerine dakika ve rol belirsizliğine odaklanıldı.'
  when component='Dakika / Rol Dağılımı' then 'Kararsız rol oyuncularında dakika dağılımı daha gerçekçi başlangıç/yedek senaryolarına ayrıldı.'
  when component='Savunma puan dağılımı' then 'Savunma puanı farklarının çoğu temiz kale olayının doğal değişkenliğinden geliyor; genel çarpan eklenmedi.'
  when component='Rol sürekliliği' then 'Düzenli ilk 11 oyuncularında geçmiş rol sürekliliği dakika tahminine daha güçlü taşınıyor.'
  else coalesce(summary_tr,signal)
end
where summary_tr is null or btrim(summary_tr)='';
