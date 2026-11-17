-- Independent player-by-player medical/training news; never blindly convert
-- a training return into 100% availability. Entries expire by matchweek.
CREATE TABLE IF NOT EXISTS public.scout_verified_health_observations (
 season text NOT NULL,
 player_id integer NOT NULL REFERENCES public.scout_players(id),
 team_id bigint NOT NULL,
 first_gameweek integer NOT NULL,
 last_gameweek integer NOT NULL,
 availability_type text NOT NULL CHECK(availability_type IN('injuries','risk','baseline')),
 availability_probability numeric NOT NULL CHECK(availability_probability BETWEEN 0 AND 1),
 reason text NOT NULL,
 source_label text NOT NULL,
 source_url text NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(season,player_id,first_gameweek),
 CHECK(last_gameweek>=first_gameweek)
);
ALTER TABLE public.scout_verified_health_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scout_verified_health_observations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.scout_verified_health_observations TO service_role;

DO $$
BEGIN
 IF (SELECT count(*) FROM public.scout_players WHERE active=true
   AND ((id=1538 AND team_id=12 AND full_name='Can Bozdoğan')
    OR (id=467 AND team_id=15 AND full_name='Emre Kılınç')
    OR (id=301 AND team_id=10 AND full_name='Jonatan Noah Kemeseng Sonko Sundberg')
    OR (id=28 AND team_id=1 AND full_name='Wagner Fabrício Cardoso de Pina')))<>4
 THEN RAISE EXCEPTION 'Medical player names or club identities do not match'; END IF;
END $$;

INSERT INTO public.scout_verified_health_observations
 (season,player_id,team_id,first_gameweek,last_gameweek,availability_type,
  availability_probability,reason,source_label,source_url)
VALUES
 ('2026-27',1538,12,12,12,'injuries',0,
  'Ayak bileği kemik parçası ameliyatı • kulüp açıklamasına göre 6–12 hafta',
  'Çaykur Rizespor sağlık açıklaması',
  'https://www.cayhaber.net/caykur-rizesporda-can-bozdogan-ameliyat-edildi'),
 ('2026-27',467,15,12,12,'risk',0.75,
  'Sakatlık sonrası takımla antrenmana döndü • maç uygunluğu teyit bekliyor',
  'Samsunspor antrenman haberi 12.11.2026',
  'https://www.samsungazetesi.com/samsunsporda-mujdeli-haber-kaptan-geri-dondu'),
 ('2026-27',301,10,12,12,'injuries',0.5,
  'Yeni sakatlık bildirimi (06.11.2026) • dönüş zamanı teyitsiz',
  'WmR + Skorjet güncel kadro doğrulaması',
  'https://www.skorjet.net/takim/goztepe/sakatliklar'),
 ('2026-27',28,1,12,12,'injuries',0.5,
  'Kas sorunu • Eyüpspor maçına yetiştirilmesi bekleniyor, kesin değil',
  'WmR + Trabzonspor maç önü raporu',
  'https://www.haberts.com/trabzonsporda-eyupspor-oncesi-9-eksik-alarmi')
ON CONFLICT (season,player_id,first_gameweek) DO UPDATE
 SET availability_type=EXCLUDED.availability_type,
     availability_probability=EXCLUDED.availability_probability,
     reason=EXCLUDED.reason,
     source_label=EXCLUDED.source_label,
     source_url=EXCLUDED.source_url,
     verified_at=now();
