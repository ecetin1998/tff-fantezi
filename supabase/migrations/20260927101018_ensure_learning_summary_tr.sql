-- Production applied as Supabase migration: 20260927101018 ensure_learning_summary_tr
-- Guarantees a readable Turkish fallback for every learning-log insert/update.

create or replace function private.ensure_learning_summary_tr()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.summary_tr is null or btrim(new.summary_tr)='' then
    new.summary_tr :=
      'Model öğrenmesi: '||
      coalesce(nullif(btrim(new.component),''),'genel')||
      case when nullif(btrim(new.segment),'') is not null then ' / '||btrim(new.segment) else '' end||
      case
        when new.applied_adjustment is not null then ' için '||new.applied_adjustment::text||' ayarı uygulandı.'
        when new.proposed_adjustment is not null then ' için '||new.proposed_adjustment::text||' ayarı önerildi.'
        else ' için yeni bir sinyal kaydedildi.'
      end;
  end if;
  return new;
end;
$$;

drop trigger if exists scout_learning_log_summary_tr_guard on public.scout_learning_log;
create trigger scout_learning_log_summary_tr_guard
before insert or update of summary_tr,component,segment,proposed_adjustment,applied_adjustment
on public.scout_learning_log
for each row execute function private.ensure_learning_summary_tr();
