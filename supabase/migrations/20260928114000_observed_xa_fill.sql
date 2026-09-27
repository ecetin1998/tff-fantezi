begin;
create extension if not exists unaccent with schema extensions;

with src(team_id,source_name,xa_total,confidence,source_tag) as (
  values
(1,'Mohamed Salah',1.7,0.98,'fotmob_team_xa_2026-09-28'),
(1,'Aral Şimşir',1,0.98,'fotmob_team_xa_2026-09-28'),
(1,'Ernest Muçi',0.8,0.98,'fotmob_team_xa_2026-09-28'),
(1,'Mustafa Eskihellaç',0.6,0.98,'fotmob_team_xa_2026-09-28'),
(1,'Wagner Pina',0.6,0.98,'fotmob_team_xa_2026-09-28'),
(1,'Sidny Lopes Cabral',0.4,0.98,'fotmob_team_xa_2026-09-28'),
(1,'Metehan Mimaroğlu',0.2,0.98,'fotmob_team_xa_2026-09-28'),
(1,'Ozan Tufan',0.2,0.98,'fotmob_team_xa_2026-09-28'),
(1,'Paul Onuachu',0.2,0.98,'fotmob_team_xa_2026-09-28'),
(1,'Franculino',0.1,0.98,'fotmob_team_xa_2026-09-28'),
(1,'Chibuike Nwaiwu',0.1,0.98,'fotmob_team_xa_2026-09-28'),
(1,'Fabinho',0.1,0.98,'fotmob_team_xa_2026-09-28'),
(1,'Melih Kabasakal',0.1,0.98,'fotmob_team_xa_2026-09-28'),
(1,'Ruslan Malinovsky',0.1,0.98,'fotmob_team_xa_2026-09-28'),
(1,'Stefan Savić',0.1,0.98,'fotmob_team_xa_2026-09-28'),
(1,'André Onana',0,0.98,'fotmob_team_xa_2026-09-28'),
(1,'Benjamin Bouchouari',0,0.98,'fotmob_team_xa_2026-09-28'),
(1,'Cenk Özkacar',0,0.98,'fotmob_team_xa_2026-09-28'),
(1,'Noah Saviolo',0,0.98,'fotmob_team_xa_2026-09-28'),
(1,'Samet Akaydin',0,0.98,'fotmob_team_xa_2026-09-28'),
(5,'Ermal Krasniqi',1.8,0.98,'fotmob_team_xa_2026-09-28'),
(5,'Samuel Ballet',0.8,0.98,'fotmob_team_xa_2026-09-28'),
(5,'Mehmet Yeşil',0.7,0.98,'fotmob_team_xa_2026-09-28'),
(5,'Rayan Raveloson',0.7,0.98,'fotmob_team_xa_2026-09-28'),
(5,'Dia Saba',0.7,0.98,'fotmob_team_xa_2026-09-28'),
(5,'Gift Orban',0.5,0.98,'fotmob_team_xa_2026-09-28'),
(5,'Lumbardh Dellova',0.3,0.98,'fotmob_team_xa_2026-09-28'),
(5,'Mohamed Khalil',0.3,0.98,'fotmob_team_xa_2026-09-28'),
(5,'Furkan Soyalp',0.2,0.98,'fotmob_team_xa_2026-09-28'),
(5,'Amadou Cissé',0.2,0.98,'fotmob_team_xa_2026-09-28'),
(5,'Collins Sor',0.2,0.98,'fotmob_team_xa_2026-09-28'),
(5,'David Bates',0.1,0.98,'fotmob_team_xa_2026-09-28'),
(5,'Gökhan Gül',0.1,0.98,'fotmob_team_xa_2026-09-28'),
(5,'Umut Meraş',0.1,0.98,'fotmob_team_xa_2026-09-28'),
(5,'Alban Lafont',0,0.98,'fotmob_team_xa_2026-09-28'),
(5,'Ali Turap Bülbül',0,0.98,'fotmob_team_xa_2026-09-28'),
(5,'Cem Üstündag',0,0.98,'fotmob_team_xa_2026-09-28'),
(5,'Mbaye Diagne',0,0.98,'fotmob_team_xa_2026-09-28'),
(5,'Rayan Lutin',0,0.98,'fotmob_team_xa_2026-09-28'),
(7,'Deniz Türüc',1.6,0.92,'fotmob_team_xa_2026-09-21'),
(7,'Yhoan Andzouana',0.8,0.92,'fotmob_team_xa_2026-09-21'),
(7,'Diogo Gonçalves',0.5,0.92,'fotmob_team_xa_2026-09-21'),
(7,'Uğurcan Yazğılı',0.5,0.92,'fotmob_team_xa_2026-09-21'),
(7,'Jean-Luc Dompé',0.4,0.92,'fotmob_team_xa_2026-09-21'),
(7,'Melih İbrahimoğlu',0.4,0.92,'fotmob_team_xa_2026-09-21'),
(7,'Arthur Masuaku',0.3,0.92,'fotmob_team_xa_2026-09-21'),
(7,'Enis Bardhi',0.3,0.92,'fotmob_team_xa_2026-09-21'),
(7,'Jackson Muleka',0.3,0.92,'fotmob_team_xa_2026-09-21'),
(7,'Marko Jevtović',0.2,0.92,'fotmob_team_xa_2026-09-21'),
(7,'Adil Demirbağ',0.1,0.92,'fotmob_team_xa_2026-09-21'),
(7,'Ebrima Colley',0.1,0.92,'fotmob_team_xa_2026-09-21'),
(7,'Rajmund Tóth',0.1,0.92,'fotmob_team_xa_2026-09-21'),
(7,'Arif Boşluk',0,0.92,'fotmob_team_xa_2026-09-21'),
(7,'Bahadir Han Güngördü',0,0.92,'fotmob_team_xa_2026-09-21'),
(7,'Blaž Kramer',0,0.92,'fotmob_team_xa_2026-09-21'),
(7,'Chidozie Awaziem',0,0.92,'fotmob_team_xa_2026-09-21'),
(7,'Deniz Ertaş',0,0.92,'fotmob_team_xa_2026-09-21'),
(7,'Emir Bars',0,0.92,'fotmob_team_xa_2026-09-21'),
(7,'Enis Destan',0,0.92,'fotmob_team_xa_2026-09-21'),
(7,'Mostafa Mohamed',0,0.92,'fotmob_team_xa_2026-09-21'),
(7,'Rayyan Baniya',0,0.92,'fotmob_team_xa_2026-09-21'),
(15,'Emre Kilinç',1.1,0.98,'fotmob_team_xa_2026-09-26'),
(15,'Josafat Mendes',0.6,0.98,'fotmob_team_xa_2026-09-26'),
(15,'Celil Yüksel',0.6,0.98,'fotmob_team_xa_2026-09-26'),
(15,'Logi Tómasson',0.5,0.98,'fotmob_team_xa_2026-09-26'),
(15,'Yalçin Kayan',0.5,0.98,'fotmob_team_xa_2026-09-26'),
(15,'Saikuba Jarju',0.3,0.98,'fotmob_team_xa_2026-09-26'),
(15,'Elliot Watt',0.3,0.98,'fotmob_team_xa_2026-09-26'),
(15,'Samed Onur',0.3,0.98,'fotmob_team_xa_2026-09-26'),
(15,'Marius Mouandilmadji',0.2,0.98,'fotmob_team_xa_2026-09-26'),
(15,'Anto Sekongo',0.1,0.98,'fotmob_team_xa_2026-09-26'),
(15,'Igor Drapiński',0.1,0.98,'fotmob_team_xa_2026-09-26'),
(15,'Mohamed Bayo',0.1,0.98,'fotmob_team_xa_2026-09-26'),
(15,'Fatih Kaya',0,0.98,'fotmob_team_xa_2026-09-26'),
(15,'Afonso Sousa',0,0.98,'fotmob_team_xa_2026-09-26'),
(15,'Ali Diabaté',0,0.98,'fotmob_team_xa_2026-09-26'),
(15,'Antoine Makoumbou',0,0.98,'fotmob_team_xa_2026-09-26'),
(15,'Enes Albak',0,0.98,'fotmob_team_xa_2026-09-26'),
(15,'Gabriele Guarino',0,0.98,'fotmob_team_xa_2026-09-26'),
(15,'Haluk Mustafa Tan',0,0.98,'fotmob_team_xa_2026-09-26'),
(15,'Okan Kocuk',0,0.98,'fotmob_team_xa_2026-09-26'),
(15,'Strahinja Eraković',0,0.98,'fotmob_team_xa_2026-09-26'),
(15,'Tahsin Bülbül',0,0.98,'fotmob_team_xa_2026-09-26'),
(15,'Tanguy Coulibaly',0,0.98,'fotmob_team_xa_2026-09-26'),
(15,'Toni Borevković',0,0.98,'fotmob_team_xa_2026-09-26'),
(15,'Yunus Emre Çift',0,0.98,'fotmob_team_xa_2026-09-26'),
(17,'Gabriel Sara',2.3,0.99,'fotmob_team_xa_2026-09-27'),
(17,'Yunus Akgün',2.1,0.99,'fotmob_team_xa_2026-09-27'),
(17,'Victor Osimhen',0.8,0.99,'fotmob_team_xa_2026-09-27'),
(17,'Aleksey Batrakov',0.8,0.99,'fotmob_team_xa_2026-09-27'),
(17,'Barış Alper Yılmaz',0.8,0.99,'fotmob_team_xa_2026-09-27'),
(17,'Roland Sallai',0.8,0.99,'fotmob_team_xa_2026-09-27'),
(17,'Ismail Jakobs',0.7,0.99,'fotmob_team_xa_2026-09-27'),
(17,'Lucas Torreira',0.6,0.99,'fotmob_team_xa_2026-09-27'),
(17,'Abdülkerim Bardakci',0.6,0.99,'fotmob_team_xa_2026-09-27'),
(17,'Leroy Sané',0.6,0.99,'fotmob_team_xa_2026-09-27'),
(17,'Rafael Leão',0.6,0.99,'fotmob_team_xa_2026-09-27'),
(17,'Uğurcan Çakir',0.3,0.99,'fotmob_team_xa_2026-09-27'),
(17,'Davinson Sánchez',0.1,0.99,'fotmob_team_xa_2026-09-27'),
(17,'Deniz Gül',0.1,0.99,'fotmob_team_xa_2026-09-27'),
(17,'Eren Elmalı',0.1,0.99,'fotmob_team_xa_2026-09-27'),
(17,'Ilkay Gündogan',0,0.99,'fotmob_team_xa_2026-09-27'),
(17,'Jankat Yılmaz',0,0.99,'fotmob_team_xa_2026-09-27'),
(17,'Kaan Ayhan',0,0.99,'fotmob_team_xa_2026-09-27'),
(17,'Kazımcan Karataş',0,0.99,'fotmob_team_xa_2026-09-27'),
(17,'Lesley Ugochukwu',0,0.99,'fotmob_team_xa_2026-09-27'),
(17,'Mario Lemina',0,0.99,'fotmob_team_xa_2026-09-27'),
(17,'Renato Nhaga',0,0.99,'fotmob_team_xa_2026-09-27'),
(17,'Wilfried Singo',0,0.99,'fotmob_team_xa_2026-09-27'),
(6,'Kerem Aktürkoglu',1.4,0.98,'fotmob_team_xa_2026-09-25'),
(6,'Oğuz Aydın',1.2,0.98,'fotmob_team_xa_2026-09-25'),
(6,'Mason Greenwood',1,0.98,'fotmob_team_xa_2026-09-25'),
(6,'Archie Brown',1,0.98,'fotmob_team_xa_2026-09-25'),
(6,'Mattéo Guendouzi',0.9,0.98,'fotmob_team_xa_2026-09-25'),
(6,'İrfan Kahveci',0.6,0.98,'fotmob_team_xa_2026-09-25'),
(6,'Levent Mercan',0.6,0.98,'fotmob_team_xa_2026-09-25'),
(6,'N''Golo Kanté',0.6,0.98,'fotmob_team_xa_2026-09-25'),
(6,'Vedat Muriqi',0.5,0.98,'fotmob_team_xa_2026-09-25'),
(6,'Marco Asensio',0.5,0.98,'fotmob_team_xa_2026-09-25'),
(6,'Ismail Yüksek',0.3,0.98,'fotmob_team_xa_2026-09-25'),
(6,'Milan Škriniar',0.2,0.98,'fotmob_team_xa_2026-09-25'),
(6,'Romelu Lukaku',0.2,0.98,'fotmob_team_xa_2026-09-25'),
(6,'Mert Müldür',0.1,0.98,'fotmob_team_xa_2026-09-25'),
(6,'Nathan Aké',0.1,0.98,'fotmob_team_xa_2026-09-25'),
(6,'Nélson Semedo',0.1,0.98,'fotmob_team_xa_2026-09-25'),
(6,'Bartuğ Elmaz',0,0.98,'fotmob_team_xa_2026-09-25'),
(6,'Dorgeles Nene',0,0.98,'fotmob_team_xa_2026-09-25'),
(6,'Ederson',0,0.98,'fotmob_team_xa_2026-09-25'),
(6,'Kojo Peprah Oppong',0,0.98,'fotmob_team_xa_2026-09-25'),
(6,'Talisca',0,0.98,'fotmob_team_xa_2026-09-25'),
(6,'Tarık Çetin',0,0.98,'fotmob_team_xa_2026-09-25'),
(13,'Andreas Skov Olsen',1.3,0.8,'fotmob_team_xa_2026-09-07'),
(13,'Christopher Opéri',0.4,0.8,'fotmob_team_xa_2026-09-07'),
(13,'Eldor Shomurodov',0.4,0.8,'fotmob_team_xa_2026-09-07'),
(13,'Abbosbek Fayzullayev',0.3,0.8,'fotmob_team_xa_2026-09-07'),
(13,'Umut Bozok',0.3,0.8,'fotmob_team_xa_2026-09-07'),
(13,'Jakub Kaluzinski',0.2,0.8,'fotmob_team_xa_2026-09-07'),
(13,'Olivier Kemen',0.2,0.8,'fotmob_team_xa_2026-09-07'),
(13,'Jerome Opoku',0.1,0.8,'fotmob_team_xa_2026-09-07'),
(13,'Michal Karbownik',0.1,0.8,'fotmob_team_xa_2026-09-07'),
(13,'Ömer Ali Sahiner',0.1,0.8,'fotmob_team_xa_2026-09-07'),
(13,'Umut Günes',0.1,0.8,'fotmob_team_xa_2026-09-07'),
(13,'Yusuf Sari',0.1,0.8,'fotmob_team_xa_2026-09-07'),
(13,'Bertug Yildirim',0,0.8,'fotmob_team_xa_2026-09-07'),
(13,'Davie Selke',0,0.8,'fotmob_team_xa_2026-09-07'),
(13,'Deniz Dilmen',0,0.8,'fotmob_team_xa_2026-09-07'),
(13,'Emin Bayram',0,0.8,'fotmob_team_xa_2026-09-07'),
(13,'Hamza Güreler',0,0.8,'fotmob_team_xa_2026-09-07'),
(13,'Ivan Brnic',0,0.8,'fotmob_team_xa_2026-09-07'),
(13,'Muhammed Sengezer',0,0.8,'fotmob_team_xa_2026-09-07'),
(13,'Onur Ergün',0,0.8,'fotmob_team_xa_2026-09-07'),
(13,'Ousseynou Ba',0,0.8,'fotmob_team_xa_2026-09-07'),
(13,'Saba Kharebashvili',0,0.8,'fotmob_team_xa_2026-09-07'),
(9,'Orkun Kökcü',1.7,0.99,'fotmob_assists_xa_2026-09-27'),
(9,'Junior Olaïtan',1.2,0.99,'fotmob_assists_xa_2026-09-27'),
(9,'Leandro Trossard',1.4,0.99,'fotmob_assists_xa_2026-09-27'),
(9,'Emmanuel Agbadou',0.7,0.99,'fotmob_assists_xa_2026-09-27'),
(9,'Hyeon-Gyu Oh',0.4,0.99,'fotmob_assists_xa_2026-09-27'),
(9,'İlhan Fakılı',0.4,0.99,'fotmob_assists_xa_2026-09-27'),
(3,'Cláudio Winck',0.5,0.99,'fotmob_assists_xa_2026-09-27'),
(3,'Adrian Benedyczak',0.8,0.99,'fotmob_assists_xa_2026-09-27'),
(3,'Elson Mendes Da Silva',0.3,0.99,'fotmob_assists_xa_2026-09-27'),
(3,'Marcus Rafferty',0.3,0.99,'fotmob_assists_xa_2026-09-27'),
(3,'Adem Arous',0,0.99,'fotmob_assists_xa_2026-09-27'),
(4,'Show',0.6,0.8,'fotmob_assists_xa_2026-09-07'),
(4,'Gonçalo Sousa',0.4,0.8,'fotmob_assists_xa_2026-09-07'),
(4,'Ugur Yildiz',0.2,0.8,'fotmob_assists_xa_2026-09-07'),
(4,'Anfernee Dijksteel',0,0.8,'fotmob_assists_xa_2026-09-07'),
(11,'Franco Tongya',0.6,0.65,'fotmob_team_xa_2026-08-28'),
(11,'Firatcan Üzüm',0.4,0.65,'fotmob_team_xa_2026-08-28'),
(11,'Abdurrahim Dursun',0.2,0.65,'fotmob_team_xa_2026-08-28'),
(11,'Adama Traoré',0.2,0.65,'fotmob_team_xa_2026-08-28'),
(11,'Tiago Gouveia',0.2,0.65,'fotmob_team_xa_2026-08-28'),
(11,'Sékou Koita',0.1,0.65,'fotmob_team_xa_2026-08-28'),
(11,'Ogulcan Ülgün',0,0.65,'fotmob_team_xa_2026-08-28'),
(11,'Cheikh Niasse',0,0.65,'fotmob_team_xa_2026-08-28'),
(11,'Dimitrios Goutas',0,0.65,'fotmob_team_xa_2026-08-28'),
(11,'Ensar Kemaloglu',0,0.65,'fotmob_team_xa_2026-08-28'),
(11,'Irfan Egribayat',0,0.65,'fotmob_team_xa_2026-08-28'),
(11,'Moussa Kyabou',0,0.65,'fotmob_team_xa_2026-08-28'),
(11,'Ousmane Diabate',0,0.65,'fotmob_team_xa_2026-08-28'),
(11,'Pedro Pereira',0,0.65,'fotmob_team_xa_2026-08-28'),
(11,'Prince Martor Jr.',0,0.65,'fotmob_team_xa_2026-08-28'),
(11,'Salih Uçan',0,0.65,'fotmob_team_xa_2026-08-28'),
(11,'Zan Zuzek',0,0.65,'fotmob_team_xa_2026-08-28'),
(12,'Qazim Laçi',1.3,0.95,'fotmob_recent_xa_2026-09-26'),
(12,'Mithat Pala',0.8,0.95,'fotmob_recent_xa_2026-09-26'),
(12,'Emrecan Bulut',0.6,0.92,'fotmob_recent_xa_2026-09-26'),
(12,'Iustin Doicaru',0.3,0.75,'fotmob_xa_snapshot_2026-09'),
(18,'Alexandru Maxim',0.99,0.92,'fotmob_player_xa_2026-09'),
(18,'Deian Sorescu',0.8,0.8,'fotmob_league_xa_snapshot_2026-09'),
(18,'Kacper Kozlowski',0.5,0.8,'fotmob_league_xa_snapshot_2026-09'),
(18,'Drissa Camara',0.2,0.8,'fotmob_league_xa_snapshot_2026-09'),
(18,'Luis Pérez',0.1,0.8,'fotmob_league_xa_snapshot_2026-09'),
(18,'Victor Gidado',0.03,0.85,'fotmob_player_xa_2026-09'),
(18,'Ulrich Meleke',0.05,0.85,'fotmob_player_xa_2026-09'),
(2,'Guram Giorbelidze',0.5,0.8,'fotmob_league_xa_snapshot_2026-09'),
(2,'Martín Rodríguez',0.5,0.8,'fotmob_league_xa_snapshot_2026-09'),
(2,'Sefa Akgün',0.3,0.8,'fotmob_league_xa_snapshot_2026-09'),
(2,'Nihad Mujakic',0.2,0.85,'fotmob_player_xa_2026-09'),
(2,'Mustafa Fettahoglu',0.2,0.8,'fotmob_league_xa_snapshot_2026-09'),
(2,'Brandon Baiye',0.1,0.8,'fotmob_league_xa_snapshot_2026-09'),
(2,'Gyrano Kerk',0.1,0.8,'fotmob_league_xa_snapshot_2026-09'),
(2,'Orhan Ovacikli',0.1,0.8,'fotmob_league_xa_snapshot_2026-09'),
(8,'Gökhan Sazdagi',1.2,0.8,'fotmob_league_xa_snapshot_2026-09'),
(8,'Alexandros Kyziridis',0.5,0.8,'fotmob_league_xa_snapshot_2026-09'),
(8,'Cengiz Ünder',0.3,0.8,'fotmob_league_xa_snapshot_2026-09'),
(8,'Fredy',0.8,0.88,'fotmob_assists_xa_2026-09'),
(8,'Ahmed Ildız',0.3,0.8,'fotmob_league_xa_snapshot_2026-09'),
(8,'Jesús Ramírez',0.2,0.8,'fotmob_league_xa_snapshot_2026-09'),
(10,'Janderson',1,0.8,'fotmob_league_xa_snapshot_2026-09'),
(10,'Arda Kurtulan',0.4,0.8,'fotmob_league_xa_snapshot_2026-09'),
(10,'Alexis Antunes',0.4,0.8,'fotmob_league_xa_snapshot_2026-09'),
(10,'Efkan Bekiroglu',0.3,0.8,'fotmob_league_xa_snapshot_2026-09'),
(10,'Malcom Bokélé',0.3,0.8,'fotmob_league_xa_snapshot_2026-09'),
(10,'Novatus Miroshi',0.3,0.8,'fotmob_league_xa_snapshot_2026-09'),
(10,'Juan',0.3,0.8,'fotmob_league_xa_snapshot_2026-09'),
(10,'Rhaldney',0.2,0.8,'fotmob_league_xa_snapshot_2026-09'),
(10,'Taha Altikardes',0.2,0.8,'fotmob_league_xa_snapshot_2026-09'),
(10,'Allan Godói',0.1,0.8,'fotmob_league_xa_snapshot_2026-09'),
(10,'Sinclair Armstrong',0.1,0.8,'fotmob_league_xa_snapshot_2026-09'),
(16,'Charles-André Raux Yao',0.5,0.8,'fotmob_league_xa_snapshot_2026-09'),
(16,'Simone Giordano',0.3,0.8,'fotmob_league_xa_snapshot_2026-09'),
(16,'Talha Ülvan',0.2,0.8,'fotmob_league_xa_snapshot_2026-09'),
(16,'Abdelhamid Sabiri',0.1,0.8,'fotmob_league_xa_snapshot_2026-09'),
(16,'Ahmed Abdullahi',0.1,0.8,'fotmob_league_xa_snapshot_2026-09'),
(16,'Chandrel Massanga',0.1,0.8,'fotmob_league_xa_snapshot_2026-09'),
(16,'Konrad Michalak',0.1,0.8,'fotmob_league_xa_snapshot_2026-09')
), norm as (
  select *,lower(regexp_replace(extensions.unaccent(source_name),'[^a-zA-Z0-9]','','g')) nk from src
), candidates as (
  select n.*,p.id player_id,
    case
      when lower(regexp_replace(extensions.unaccent(coalesce(p.full_name,'')),'[^a-zA-Z0-9]','','g'))=n.nk then 1
      when lower(regexp_replace(extensions.unaccent(coalesce(p.display_name,'')),'[^a-zA-Z0-9]','','g'))=n.nk then 2
      when lower(regexp_replace(extensions.unaccent(coalesce(p.short_label,'')),'[^a-zA-Z0-9]','','g'))=n.nk then 3
      when lower(regexp_replace(extensions.unaccent(coalesce(p.full_name,'')),'[^a-zA-Z0-9]','','g')) like '%'||n.nk||'%' then 4
      else 99 end score
  from norm n join public.scout_players p on p.team_id=n.team_id and p.active=true
), best as (
  select *,row_number() over(partition by team_id,source_name order by score,player_id) rn
  from candidates where score<99
)
update public.scout_player_season_stats s
set xa_total=b.xa_total,
    xa_per90=case when coalesce(s.minutes,0)>0 then b.xa_total*90.0/s.minutes else 0 end,
    xa_source=b.source_tag,
    xa_confidence=b.confidence,
    advanced_updated_at=now(),
    updated_at=now()
from best b
where b.rn=1 and s.season='2026-27' and s.player_id=b.player_id;

with src(team_id,source_name,xa_per90,confidence,source_tag) as (
  values
(14,'Omar Ben Ali',0.25,0.9,'fotmob_xa90_2026-09'),
(14,'Florent Hadërgjonaj',0.21,0.9,'fotmob_xa90_2026-09'),
(14,'Gaïus Makouta',0.13,0.9,'fotmob_xa90_2026-09'),
(14,'Ibrahim Kaya',0.03,0.9,'fotmob_xa90_2026-09'),
(14,'Arda Usluoglu',0.02,0.9,'fotmob_xa90_2026-09'),
(14,'Ui-Jo Hwang',0.02,0.9,'fotmob_xa90_2026-09'),
(14,'Ümit Akdag',0.02,0.9,'fotmob_xa90_2026-09'),
(14,'Baran Gezek',0.01,0.9,'fotmob_xa90_2026-09'),
(14,'Nuno Lima',0.01,0.9,'fotmob_xa90_2026-09'),
(14,'Ruan',0.01,0.9,'fotmob_xa90_2026-09'),
(14,'Fidan Aliti',0,0.9,'fotmob_xa90_2026-09'),
(14,'Paulo Victor',0,0.9,'fotmob_xa90_2026-09')
), norm as (
  select *,lower(regexp_replace(extensions.unaccent(source_name),'[^a-zA-Z0-9]','','g')) nk from src
), candidates as (
  select n.*,p.id player_id,
    case
      when lower(regexp_replace(extensions.unaccent(coalesce(p.full_name,'')),'[^a-zA-Z0-9]','','g'))=n.nk then 1
      when lower(regexp_replace(extensions.unaccent(coalesce(p.display_name,'')),'[^a-zA-Z0-9]','','g'))=n.nk then 2
      when lower(regexp_replace(extensions.unaccent(coalesce(p.short_label,'')),'[^a-zA-Z0-9]','','g'))=n.nk then 3
      when lower(regexp_replace(extensions.unaccent(coalesce(p.full_name,'')),'[^a-zA-Z0-9]','','g')) like '%'||n.nk||'%' then 4
      else 99 end score
  from norm n join public.scout_players p on p.team_id=n.team_id and p.active=true
), best as (
  select *,row_number() over(partition by team_id,source_name order by score,player_id) rn
  from candidates where score<99
)
update public.scout_player_season_stats s
set xa_per90=b.xa_per90,
    xa_total=case when coalesce(s.minutes,0)>0 then b.xa_per90*s.minutes/90.0 else 0 end,
    xa_source=b.source_tag,
    xa_confidence=b.confidence,
    advanced_updated_at=now(),
    updated_at=now()
from best b
where b.rn=1 and s.season='2026-27' and s.player_id=b.player_id;

-- Contribution share uses current xG plus the observed xA portion where available.
with totals as (
  select p.team_id,
         sum(coalesce(s.xg_total,0)+coalesce(s.xa_total,0)) denom
  from public.scout_player_season_stats s
  join public.scout_players p on p.id=s.player_id
  where s.season='2026-27' and p.active=true
  group by p.team_id
)
update public.scout_player_season_stats s
set attack_contribution_share=
  case when t.denom>0 then (coalesce(s.xg_total,0)+coalesce(s.xa_total,0))/t.denom else 0 end,
  advanced_updated_at=coalesce(s.advanced_updated_at,now())
from public.scout_players p join totals t on t.team_id=p.team_id
where s.season='2026-27' and s.player_id=p.id and p.active=true;

commit;
