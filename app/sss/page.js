import Link from 'next/link'

export const metadata={
  title:'Süper Lig Fantezi SSS ve Rehber',
  description:'Fantezi Lig Rehberi nasıl kullanılır? xFP, xDakika, P25/P90, 6+ ihtimali, xG, xA, takım analizi, fantezi puanları ve kadro önerileri için güncel rehber.',
  keywords:[
    'Süper Lig fantezi','Süper Lig fantezi futbol','fantezi futbol Türkiye','xFP nedir',
    'fantezi puanları','kadro önerisi','xDakika','ilk 11 ihtimali','xG xA','fantezi futbol rehberi'
  ],
  alternates:{canonical:'/sss'},
  openGraph:{
    title:'Süper Lig Fantezi SSS ve Rehber',
    description:'Fantezi Lig Rehberi menüleri, fantezi futbol terimleri, xFP ve model metrikleri için güncel açıklamalı rehber.',
    url:'/sss',
  },
}

const quickStart=[
  ['1','Adayları bul','Oyuncu Analizi’nde xFP, İlk 11, xDakika ve tavan metrikleriyle oyuncu havuzunu daralt.'],
  ['2','Eşleşmeyi kontrol et','Maç Tahminleri ve Takım Analizi’nde rakip xG, galibiyet/gol yememe ihtimali ile hücum-savunma eşleşmesini birlikte oku.'],
  ['3','Kadroyu kur','Kadro Önerileri’ndeki Önerilen ve Agresif 11’i referans al; sonra Benim Kadrom’da 15 kişilik takımını düzenle.'],
]

const menuItems=[
  ['/', 'Ana Sayfa', 'Haftanın model özetini, öne çıkan oyuncuları ve hızlı karar kartlarını görürsün.'],
  ['/players', 'Oyuncu Analizi', 'Aktif oyuncuları xFP, İlk 11, xDakika, P25/P90, 6+ ihtimali, xG, xA, fiyat ve toplam puan gibi metriklerle karşılaştırırsın.'],
  ['/points', 'Fantezi Puanları', 'Kesinleşen haftalık fantezi puanlarını, toplam puanı ve oyuncuların hafta hafta formunu incelersin. 0 dakika oynanan maçlar oynadığı-maç ortalamalarını bozmaz.'],
  ['/matches', 'Maç Tahminleri', 'Takımların bu haftaki xG/rakip xG görünümünü, Ev sahibi-Beraberlik-Deplasman olasılıklarını ve fantezi açısından maç profilini görürsün.'],
  ['/squads', 'Kadro Önerileri', 'Modelin dengeli Önerilen Kadro’sunu ve daha yüksek tavanı hedefleyen Agresif 11’i; ilk 11, yedek, kaptan ve xFP ile birlikte görürsün.'],
  ['/squad', 'Benim Kadrom', 'Hesabınla 15 oyunculuk, 100m bütçeli takımını kurar; ilk 11, yedek sırası, kaptan ve yardımcı kaptan seçimlerini yönetirsin.'],
  ['/teams', 'Takım Analizi', 'Takımları haftanın rakibi, ev/deplasman, bu hafta xG, rakip xG, galibiyet, gol yememe, takım toplam xFP ve hücum/savunma eşleşmesine göre karşılaştırır ve filtrelersin.'],
  ['/availability', 'Sakatlık / Ceza Durumu', 'Sakat, cezalı, dönüş yapan veya oynama ihtimali düşen oyuncuların güncel uygunluk durumunu takip edersin.'],
  ['/roles', 'Rol & Dakika Takibi', 'İlk 11 ve dakika rolü yükselen/düşen oyuncuları, son maçlardaki kullanım değişimiyle birlikte görürsün.'],
  ['/pricing', 'Gelişmiş Üyelik', 'Deneme dönemindeki gelişmiş üyelik planını ve planlanan gelişmiş özellikleri görürsün. Şu anda gelişmiş üyelik talebi bekleme listesi üzerinden toplanıyor.'],
]

const glossary=[
  ['MH', 'Maç Haftası. Sitede maç haftası MH olarak kısaltılır. Örneğin MH7, sezonun 7. fantezi haftasıdır.'],
  ['KL / DEF / OS / FOR', 'Fantezi mevkileri: Kaleci, Defans, Orta Saha ve Forvet.'],
  ['Ev sahibi / Deplasman', 'Takımın ilgili fikstürü kendi sahasında mı yoksa deplasmanda mı oynadığını gösterir.'],
  ['xFP', 'Beklenen Fantezi Puanı; oyuncunun rolü, dakika beklentisi, rakip ve simülasyon dağılımı sonucunda oluşan ortalama beklenen fantezi puanıdır. Garanti puan değildir.'],
  ['Temel xFP', 'Bonus ve üst-dağılım katmanlarından önceki temel beklenen fantezi puanı bileşenidir. Daha teknik oyuncu detaylarında gösterilir.'],
  ['İlk 11 %', 'Oyuncunun maça ilk 11’de başlama olasılığına ilişkin model tahminidir.'],
  ['xDakika / xDk', 'Oyuncunun maçta alması beklenen dakika. Rotasyon, ilk 11 ihtimali, sakatlık/ceza ve güncel rol sinyalleri bu değeri etkiler.'],
  ['P25 / P75 / P90', 'Fantezi puan dağılımındaki yüzdelik eşiklerdir. P90, 90 dakika başına puan değildir; simülasyon sonuçlarının üst tavan bölgesini temsil eder.'],
  ['6+ %', 'Oyuncunun model dağılımında en az 6 fantezi puanına ulaşma olasılığıdır.'],
  ['xG', 'Beklenen Gol; gol pozisyonlarının kalitesini ve beklenen gol üretimini ölçer. Tek başına skor tahmini değildir.'],
  ['Rakip xG', 'Maç modelinde rakibin üretmesi beklenen gol seviyesidir. Savunma ve gol yememe görünümünü okurken kullanılır.'],
  ['xA', 'Beklenen Asist; bir oyuncunun ürettiği pasların asist olma beklentisini ölçen istatistiktir.'],
  ['Gol yememe', 'Takımın gol yemeden maçı tamamlama olasılığı veya gerçekleşen gol yememe durumu.'],
  ['F/P', 'Fiyat/performans göstergesi. Oyuncunun fiyatına göre model beklentisinin ne kadar verimli olduğunu karşılaştırmaya yardım eder.'],
  ['Hücum eşleşmesi', 'Rakibin savunma profiline göre takımın hücum tarafındaki haftalık eşleşme sinyalidir: Avantajlı, Dengeli veya Dezavantajlı.'],
  ['Savunma eşleşmesi', 'Rakibin hücum profiline göre takımın savunma/gol yememe tarafındaki haftalık eşleşme sinyalidir: Avantajlı, Dengeli veya Dezavantajlı.'],
  ['Puan aralığı', 'P25–P90 gibi aralıklar tek bir xFP sayısından daha geniş olası sonuç alanını gösterir. Fantezi puanı doğal olarak değişkendir.'],
  ['İlk 25', 'Yüksek skor adaylarını ortalama xFP’den ayrı bir üst-tavan katmanıyla tarar. Ana xFP hesabının veya kadro optimizasyonunun yerine geçmez.'],
  ['Kalite Kontrolü / GEÇTİ', 'Yeni model çıktısının veri bütünlüğü, aktif oyuncu kapsamı, dakika/rol ve yayın kontrollerini geçtiğini belirtir. Kontrolü geçmeyen aday sürüm yayınlanmaz.'],
]

const faqs=[
  ['Fantezi Lig Rehberi nedir?', 'Fantezi Lig Rehberi, Süper Lig fantezi kararlarını desteklemek için oyuncu, takım, fikstür, rol, dakika ve olasılık verilerini tek yerde birleştiren bağımsız bir analiz platformudur. Oyuncu xFP tahminleri, kadro önerileri, maç ve takım analizleri ile model performansını birlikte sunar.'],
  ['Fantezi Lig Rehberi resmî TFF sitesi mi?', 'Hayır. Fantezi Lig Rehberi bağımsız bir analiz platformudur ve resmî TFF ürünü değildir. Amaç, fantezi futbol oynarken veriyi daha anlaşılır ve karşılaştırılabilir hale getirmektir.'],
  ['Bir oyuncuyu seçerken ilk hangi metriklere bakmalıyım?', 'Önce xFP, İlk 11 %, xDakika ve rakip eşleşmesini birlikte oku. Sonra P90/6+ gibi tavan metrikleriyle risk-getiri profilini kontrol et. Fiyat ve toplam puan ise kararın bağlamını tamamlar.'],
  ['xFP yüksekse oyuncu kesin yüksek puan alır mı?', 'Hayır. xFP çok sayıda olası senaryonun ortalamasıdır. Gol, asist, kart, gol yememe, kurtarış, bonus ve dakika gibi olaylar tek maçta yüksek oynaklık yaratabilir. Bu yüzden xFP ile birlikte P25/P90, 6+ ihtimali ve dakika güvenini de okumak daha doğrudur.'],
  ['P90 neden xFP’den çok daha yüksek olabilir?', 'xFP ortalama beklentiyi, P90 ise yüksek tavan senaryosunu gösterir. Özellikle gol/asist potansiyeli yüksek fakat sonucu değişken oyuncularda P90 ile xFP arasında büyük fark olması normaldir.'],
  ['P90, oyuncunun 90 dakika başına puanı mı?', 'Hayır. Sitedeki P90 bir yüzdelik dağılım metriğidir; model simülasyonlarında üst tavan bölgesine giriş eşiğini ifade eder.'],
  ['Menajer kartları sitede nasıl çalışır?', 'Gelişmiş üyelikte Kadro Önerileri ve Benim Kadrom ekranlarından haftanın kartını seçebilirsin. Tripleks ve Dört Dörtlük kaptan puan çarpanını değiştirir; Tüm Takım Sahaya yedekleri puana dahil eder; Hücum 15 kişilik kadro dağılımını 2 KL / 3 DEF / 5 OS / 5 FOR yapar, haftalık bütçeyi 105m’ye çıkarır ve bu kadroyla kurulabilen dizilişleri açar; Limitsiz Bütçe bütçe sınırını kaldırır. Seçilen kart haftalık kadro kaydına eklenir.'],
  ['Önerilen Kadro ile Agresif 11 arasındaki fark nedir?', 'Önerilen Kadro daha dengeli biçimde yüksek beklenen puanı ve risk dağılımını hedefler. Agresif 11 ise xFP tabanını çok bozmadan daha yüksek tavan senaryosuna yönelir; P90 ve yüksek skor potansiyeline daha fazla ağırlık verir.'],
  ['Neden daha düşük xFP’li bir oyuncu Agresif 11’de olabilir?', 'Agresif 11 yalnız ortalama xFP’yi maksimize etmez. Üst senaryo potansiyeli, P90, gol/asist tavanı ve kaptanlık tavanı daha fazla önem kazanır. Bu nedenle ortalaması biraz düşük ama tavanı güçlü bir oyuncu seçilebilir.'],
  ['Hücumcu bekler ve farklı rolde oynayan oyuncular nasıl değerlendiriliyor?', 'Fantezi pozisyonu ile gerçek saha rolü aynı şey değildir. Model; bek, kanat bek, hibrit kanat, ileri çıkan savunmacı veya pozisyon dışı kullanılan oyuncuların takım hücum payını, xG/xA potansiyelini, dakika rolünü ve rakip eşleşmesini ayrı sinyaller olarak işler.'],
  ['Takım Analizi sayfasını nasıl okumalıyım?', 'Önce takımın bu haftaki rakibini ve ev/deplasman durumunu gör. Ardından Bu hafta xG ve Rakip xG ile maçın yönünü, Galibiyet ve gol yememe ihtimaliyle olasılık profilini, Toplam xFP ile oyuncu havuzunun genel fantezi potansiyelini değerlendir. Hücum ve Savunma eşleşmesi rozetleri bu yorumu ayrı ayrı özetler.'],
  ['Hücum ve savunma eşleşmesindeki “Avantajlı” ne demek?', 'Bu etiket tek başına takımın maçı kazanacağı anlamına gelmez. Hücum etiketi takımın rakip savunmasına karşı üretim koşullarını; savunma etiketi ise rakibin hücumuna karşı gol yememe/savunma koşullarını özetler.'],
  ['Bu hafta xG ile Rakip xG neden ayrı?', 'Bu hafta xG takımın beklenen hücum üretimini, Rakip xG ise karşı takımın beklenen üretimini gösterir. İkisini birlikte okumak hem hücumcular hem de kaleci/defans seçimleri için daha anlamlıdır.'],
  ['Sakat veya cezalı oyuncu neden bazen listede görünüyor?', 'Oyuncu havuzunda bulunması ile o hafta puan üretmesi farklı şeylerdir. Oynayamayacağı doğrulanan oyuncuların uygunluk ve dakika beklentisi düşürülür; kesin yok durumunda model pozitif xFP üretmemelidir. Dönüş yapan oyuncular ise dakika ve ilk 11 rolü yeniden dağıtılarak hesaba alınır.'],
  ['0 dakika oynanan maçlar oyuncu ortalamasını düşürüyor mu?', 'Haftalık fantezi performansında oyuncunun hiç süre almadığı 0 dakikalık maçlar, oynadığı-maç bazlı form ortalamalarında dışarıda tutulur. Böylece yedek kaldığı bir hafta sahadaki performans ortalamasını yapay biçimde aşağı çekmez.'],
  ['Kadro Önerileri ile Benim Kadrom arasındaki fark nedir?', 'Kadro Önerileri modelin otomatik oluşturduğu kadroları gösterir. Benim Kadrom ise hesabına bağlı kendi 15 kişilik takımını kurduğun, ilk 11 ve yedekleri yerleştirdiğin, kaptan/yardımcı kaptan seçtiğin kişisel çalışma alanıdır.'],
  ['Maç Tahminlerinde xG ve Ev sahibi/Beraberlik/Deplasman ne anlatıyor?', 'xG takımların üretmesi beklenen gol kalitesini; üçlü olasılık barı ise ev sahibi galibiyeti, beraberlik ve deplasman galibiyeti ihtimallerini gösterir. Bunlar kesin skor iddiası değil, olasılık dağılımının özetidir.'],
  ['Model hangi veriyi kullanıyor?', 'Model; güncel sezon performansı, takım hücum-savunma profili, oyuncu rolü ve dakika beklentisi, ilk 11 ihtimali, sakatlık/ceza durumu, fikstür, ev-deplasman, geçmiş fantezi çıktıları ve oyuncunun takım içindeki gol/asist payı gibi sinyalleri birlikte değerlendirir.'],
  ['Tahminler ne zaman güncelleniyor?', 'Yayındaki model yalnız yeni veri ve model zinciri gerekli kalite kontrollerini geçtiğinde değiştirilir. Yeni aday sürüm veri bütünlüğü ve kalite kontrollerinden geçer; başarısız olursa önceki çalışan sürüm korunur.'],
  ['Siteyi kullanmak için hesap açmak gerekiyor mu?', 'Hayır. Ziyaretçi olarak Oyuncu Analizi’nde xFP’ye göre ilk 15 oyuncuyu ve Maç Tahminleri’nde haftanın öne çıkan tek maçını görebilirsin. Ücretsiz hesap açınca tüm temel oyuncu havuzu, filtreler, tüm maç tahminleri ve Benim Kadrom açılır. Gelişmiş üyelik ise P25/P90, 6+ ihtimali, xG/xA, gelişmiş rol-dakika, Agresif 11 ve menajer kartı optimizasyonu gibi ileri analizleri açar.'],
  ['Gelişmiş üyelik şu anda aktif ücretli üyelik mi?', 'Deneme döneminde temel özellikler ücretsizdir. Gelişmiş üyelik için hedef özellikler ve hedef fiyat gösteriliyor; şu anda ücretli satış yerine gelişmiş üyelik talebi bekleme listesi üzerinden ölçülüyor.'],
]

function MenuCard({item,index}){
  const [href,title,description]=item
  return <Link className="faq-menu-card" href={href}>
    <span className="faq-menu-index">{String(index+1).padStart(2,'0')}</span>
    <div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
    <b>Sayfaya git <span aria-hidden="true">→</span></b>
  </Link>
}

export default function FAQPage(){
  return <div className="faq-page">
    <nav className="faq-breadcrumb" aria-label="Sayfa yolu"><Link href="/">Ana Sayfa</Link><span>›</span><b>SSS & Rehber</b></nav>

    <section className="faq-hero">
      <div className="faq-hero-copy">
        <span className="eyebrow">SSS & FANTEZİ FUTBOL REHBERİ</span>
        <h1>Fantezi Lig Rehberi’ni doğru okumak için tek rehber.</h1>
        <p>Oyuncu Analizi’nden Takım Analizi’ne, xFP’den P90’a ve Agresif 11’e kadar sitedeki karar ekranlarını ve model terimlerini güncel haliyle açıklar.</p>
        <div className="faq-hero-meta">
          <span><b>{menuItems.length}</b> analiz ekranı</span>
          <span><b>{glossary.length}</b> terim</span>
          <span><b>{faqs.length}</b> soru-cevap</span>
        </div>
      </div>
      <div className="faq-hero-links" aria-label="Rehber bölümleri">
        <a href="#hizli-basla"><span>01</span><b>Hızlı başla</b></a>
        <a href="#menu-rehberi"><span>02</span><b>Menü rehberi</b></a>
        <a href="#terimler"><span>03</span><b>Terimler</b></a>
        <a href="#sorular"><span>04</span><b>SSS</b></a>
      </div>
    </section>

    <section id="hizli-basla" className="faq-section">
      <div className="faq-section-head">
        <div><span className="eyebrow">3 ADIMDA KULLANIM</span><h2>Haftalık karar akışı</h2></div>
        <p>Önce oyuncuyu, sonra eşleşmeyi, en son kadro bütününü kontrol et.</p>
      </div>
      <div className="faq-quick-grid">
        {quickStart.map(([step,title,description])=><article className="faq-quick-card" key={step}>
          <span>{step}</span><div><h3>{title}</h3><p>{description}</p></div>
        </article>)}
      </div>
    </section>

    <section id="menu-rehberi" className="faq-section">
      <div className="faq-section-head">
        <div><span className="eyebrow">SİTE REHBERİ</span><h2>Hangi ekran ne işe yarıyor?</h2></div>
        <p>İhtiyacına göre doğru analiz ekranına geç.</p>
      </div>
      <div className="faq-menu-grid">{menuItems.map((item,index)=><MenuCard key={item[0]} item={item} index={index}/>)}</div>
    </section>

    <section id="terimler" className="faq-section faq-glossary-section">
      <div className="faq-section-head">
        <div><span className="eyebrow">FANTEZİ SÖZLÜĞÜ</span><h2>Kısaltmalar ve model terimleri</h2></div>
        <p>xFP • xDk • P90 • xG • xA • Gol yememe</p>
      </div>
      <div className="faq-glossary-grid">
        {glossary.map(([term,description])=><article key={term}>
          <h3>{term}</h3>
          <p>{description}</p>
        </article>)}
      </div>
    </section>

    <section id="sorular" className="faq-section">
      <div className="faq-section-head">
        <div><span className="eyebrow">SIK SORULAN SORULAR</span><h2>Modeli ve ekranları doğru yorumla</h2></div>
        <p>{faqs.length} güncel açıklama</p>
      </div>
      <div className="faq-list">
        {faqs.map(([question,answer],index)=><details className="faq-item" key={question} open={index<2}>
          <summary><span><small>{String(index+1).padStart(2,'0')}</small>{question}</span><i aria-hidden="true">+</i></summary>
          <div><p>{answer}</p></div>
        </details>)}
      </div>
    </section>

    <section className="faq-cta">
      <div>
        <span className="eyebrow">HAFTAYA BAŞLA</span>
        <h2>Önce oyuncu havuzunu daralt, sonra eşleşmeyi doğrula.</h2>
        <p>xFP, dakika ve tavan metriklerini Takım Analizi’ndeki haftalık rakip profiliyle birleştir.</p>
      </div>
      <div>
        <Link className="cta" href="/players">Oyuncu Analizi</Link>
        <Link className="secondary" href="/teams">Takım Analizi</Link>
        <Link className="secondary" href="/squads">Kadro Önerileri</Link>
      </div>
    </section>
  </div>
}
