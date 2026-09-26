import Link from 'next/link'

export const metadata={
  title:'Süper Lig Fantasy SSS ve Rehber',
  description:'Fantezi Scout nasıl kullanılır? xFP, xDakika, P25/P90, 6+ ihtimali, xG, xA, ELO, fantezi puanları, kadro önerileri ve Süper Lig fantasy terimleri için açıklamalı rehber.',
  keywords:[
    'Süper Lig fantasy','Süper Lig fantezi futbol','fantasy futbol Türkiye','xFP nedir',
    'fantasy puanları','kadro önerisi','xDakika','ilk 11 ihtimali','xG xA','fantasy futbol rehberi'
  ],
  alternates:{canonical:'/sss'},
  openGraph:{
    title:'Süper Lig Fantasy SSS ve Rehber',
    description:'Fantezi Scout menüleri, fantasy futbol terimleri, xFP ve model metrikleri için açıklamalı rehber.',
    url:'/sss',
  },
}

const menuItems=[
  ['/', 'Ana Sayfa', 'Günün model özetini, haftanın öne çıkan oyuncularını ve Fantezi Scout’un hızlı karar kartlarını görürsün.'],
  ['/players', 'Oyuncu Analizi', 'Aktif oyuncuları xFP, ilk 11 ihtimali, xDakika, P25/P90, 6+ ihtimali, xG, xA, fiyat ve toplam puan gibi metriklerle karşılaştırırsın.'],
  ['/points', 'Fantezi Puanları', 'Kesinleşen haftalık fantasy puanlarını, toplam puanı ve oyuncuların hafta hafta performansını incelersin. 0 dakika oynanan maçlar form ortalamasını bozmaz.'],
  ['/matches', 'Maç Tahminleri', 'Takımların beklenen gol üretimini, 1/X/2 olasılıklarını ve fantasy açısından hücum-savunma eşleşmesini görürsün.'],
  ['/squads', 'Kadro Önerileri', 'Modelin dengeli Önerilen Kadro’sunu ve daha yüksek tavanı hedefleyen Tavan 11’i; ilk 11, yedek, kaptan ve xFP ile birlikte görürsün.'],
  ['/squad', 'Benim Kadrom', 'Hesabınla 15 oyunculuk, 100m bütçeli kendi takımını kurar; ilk 11, yedek sırası ve kaptanı yönetirsin.'],
  ['/teams', 'Takım & Fikstür Analizi', 'Takım profili, rakip, ev/deplasman, xG, gol yememe ihtimali, ELO ve takım oyuncularının fantasy görünümünü birlikte okursun.'],
  ['/availability', 'Sakatlık / Ceza Durumu', 'Sakat, cezalı, dönüş yapan veya oynama ihtimali düşen oyuncuların güncel uygunluk durumunu takip edersin.'],
  ['/roles', 'Rol & Dakika Takibi', 'İlk 11 ve dakika rolü yükselen/düşen oyuncuları, son maçlardaki kullanım değişimiyle birlikte görürsün.'],
  ['/backtest', 'Model Performansı', 'Modelin geçmiş haftalardaki geriye dönük testini, canlı dondurulmuş tahminlerini, QA kontrollerini ve öğrenme sinyallerini şeffaf biçimde incelersin.'],
  ['/pricing', 'Fantezi Pro', 'Beta dönemindeki Pro planı ve planlanan gelişmiş özellikler hakkında bilgi alırsın. Şu anda Pro talebi bekleme listesi üzerinden toplanıyor.'],
]

const glossary=[
  ['MH', 'Maç Haftası. İngilizce GW (Gameweek) yerine sitede MH kullanılır. Örneğin MH7, sezonun 7. fantasy haftasıdır.'],
  ['KL / DEF / OS / FOR', 'Fantasy mevkileri: Kaleci, Defans, Orta Saha ve Forvet.'],
  ['E / D', 'Ev ve Deplasman. Oyuncunun veya takımın ilgili maçı evinde mi deplasmanda mı oynadığını gösterir.'],
  ['xFP', 'Expected Fantasy Points; oyuncunun simülasyonlar ve rol beklentisi sonucunda üretilen ortalama beklenen fantasy puanıdır. Kesin puan tahmini değildir.'],
  ['Core xFP', 'Bonus ve dağılım katmanlarından önceki temel beklenen fantasy puanı bileşenidir. Daha teknik oyuncu detaylarında gösterilir.'],
  ['İlk 11 %', 'Oyuncunun maça ilk 11’de başlama olasılığına ilişkin model tahminidir.'],
  ['xDakika / xDk', 'Oyuncunun maçta alması beklenen dakika. Rotasyon, ilk 11 ihtimali, sakatlık/ceza ve güncel rol sinyalleri bu değeri etkiler.'],
  ['P25 / P75 / P90', 'Fantasy puan dağılımındaki yüzdelik eşiklerdir. P90, “90 dakika başına puan” değildir; simülasyon sonuçlarının üst %10 eşiğini temsil eder.'],
  ['6+ %', 'Oyuncunun model dağılımında en az 6 fantasy puanına ulaşma olasılığıdır.'],
  ['xG', 'Expected Goals; gol pozisyonlarının kalitesini ve beklenen gol üretimini ölçen istatistiktir. Tek başına maç skoru tahmini değildir.'],
  ['xA', 'Expected Assists; bir oyuncunun ürettiği pasların asist olma beklentisini ölçen istatistiktir.'],
  ['F/P', 'Fiyat/performans göstergesi. Oyuncunun fiyatına göre model beklentisinin ne kadar verimli olduğunu karşılaştırmaya yardım eder.'],
  ['ELO', 'Takımların geçmiş sonuçlarından türetilen göreli güç derecesidir. Rakibin gücünü ve fikstür bağlamını yorumlamak için yardımcı sinyal olarak kullanılır.'],
  ['Puan bandı', 'P25–P90 gibi aralıklar tek bir xFP sayısından daha geniş olası sonuç alanını gösterir. Fantasy puanı doğal olarak değişken olduğu için bandın dışına çıkan sonuçlar da mümkündür.'],
  ['Top‑25', 'Yüksek skor adaylarını xFP’den ayrı bir üst-tavan sıralama katmanıyla tarar. Ana xFP hesabının veya optimizerın yerine geçmez.'],
  ['QA / PASS', 'Yeni model çıktısının veri bütünlüğü, aktif oyuncu kapsamı, dakika/rol ve diğer yayın kontrollerini geçtiğini belirtir. Kontrolü geçmeyen aday sürüm yayınlanmaz.'],
]

const faqs=[
  ['Fantezi Scout nedir?', 'Fantezi Scout, Süper Lig fantasy futbol kararlarını desteklemek için oyuncu, takım, fikstür, rol, dakika ve olasılık verilerini tek yerde birleştiren bağımsız bir analiz platformudur. Oyuncu xFP tahminleri, kadro önerileri, maç analizleri ve model performansını birlikte sunar.'],
  ['Fantezi Scout resmî TFF sitesi mi?', 'Hayır. Fantezi Scout bağımsız bir analiz platformudur ve resmî TFF ürünü değildir. Amaç, fantasy futbol oynarken veriyi daha anlaşılır ve karşılaştırılabilir hale getirmektir.'],
  ['xFP yüksekse oyuncu kesin yüksek puan alır mı?', 'Hayır. xFP bir garanti değil, çok sayıda olası senaryonun ortalamasıdır. Gol, asist, kart, temiz kale, kurtarış, bonus ve dakika gibi olaylar tek maçta yüksek oynaklık yaratabilir. Bu yüzden xFP ile birlikte P25, P90, 6+ ihtimali ve dakika güvenini de okumak daha doğrudur.'],
  ['P90 neden xFP’den çok daha yüksek olabilir?', 'xFP ortalama beklentiyi, P90 ise yüksek tavan senaryosunu gösterir. Özellikle gol/asist potansiyeli yüksek fakat sonucu değişken oyuncularda P90 ile xFP arasında büyük fark olması normaldir.'],
  ['P90, oyuncunun 90 dakika başına puanı mı?', 'Hayır. Sitedeki P90 bir yüzdebirlik dağılım metriğidir: model simülasyonlarında sonuçların yaklaşık %90’ının altında kaldığı, üst %10’luk tavan bölgesine giriş eşiğini ifade eder.'],
  ['Neden daha düşük xFP’li bir oyuncu Tavan 11’de olabilir?', 'Tavan 11 yalnız ortalama xFP’yi maksimize etmez; üst senaryo potansiyeline, özellikle P90’a daha fazla önem verir. Bu nedenle ortalaması biraz düşük fakat gol/asist veya bonus tavanı güçlü bir oyuncu Tavan 11’e girebilir.'],
  ['Hücumcu bekler ve farklı rolde oynayan oyuncular nasıl değerlendiriliyor?', 'Fantasy pozisyonu ile gerçek saha rolü aynı şey değildir. Model; bek, kanat bek, hibrit kanat, ileri çıkan savunmacı veya pozisyon dışı kullanılan oyuncuların takım hücum payını, xG/xA potansiyelini, dakika rolünü ve rakip eşleşmesini ayrı sinyaller olarak işler.'],
  ['Sakat veya cezalı oyuncu neden bazen listede görünüyor?', 'Oyuncu havuzunda bulunması ile o hafta puan üretmesi farklı şeylerdir. Oynayamayacağı doğrulanan oyuncuların uygunluk ve dakika beklentisi düşürülür; kesin yok durumlarında model pozitif xFP üretmemelidir. Dönüş yapan oyuncular ise dakika ve ilk 11 rolü yeniden dağıtılarak hesaba alınır.'],
  ['0 dakika oynanan maçlar oyuncu ortalamasını düşürüyor mu?', 'Haftalık fantasy performansında oyuncunun hiç süre almadığı 0 dakikalık maçlar form ortalaması ve benzeri oynadığı-maç bazlı hesaplarda dışarıda tutulur. Böylece yedek kaldığı bir hafta sahadaki performans ortalamasını yapay biçimde aşağı çekmez.'],
  ['Kadro Önerileri ile Benim Kadrom arasındaki fark nedir?', 'Kadro Önerileri modelin otomatik oluşturduğu kadroları gösterir. Benim Kadrom ise hesabına bağlı kendi 15 kişilik takımını kurduğun, ilk 11 ve yedekleri yerleştirdiğin, kaptan seçtiğin kişisel çalışma alanıdır.'],
  ['Önerilen Kadro ile Tavan 11 arasındaki fark nedir?', 'Önerilen Kadro dengeli biçimde yüksek beklenen puanı hedefler ve risk yoğunlaşmasını sınırlar. Tavan 11 ise daha yüksek üst senaryoyu hedefler; P90 ve yüksek skor potansiyeline daha fazla ağırlık verir.'],
  ['Maç Tahminlerinde xG ve 1/X/2 ne anlatıyor?', 'xG takımların üretmesi beklenen gol kalitesini; 1/X/2 ise ev sahibi galibiyeti, beraberlik ve deplasman galibiyeti olasılıklarını gösterir. Bunlar tek bir kesin skor iddiası değil, olasılık dağılımının özetidir.'],
  ['Model hangi veriyi kullanıyor?', 'Model; güncel sezon performansı, takım hücum-savunma profili, oyuncu rolü ve dakika beklentisi, ilk 11 ihtimali, sakatlık/ceza durumu, fikstür, ev-deplasman, geçmiş fantasy çıktıları ve oyuncunun takım içindeki gol/asist payı gibi sinyalleri birlikte değerlendirir.'],
  ['Tahminler ne zaman güncelleniyor?', 'Yayındaki model yalnız yeni veri ve model zinciri gerekli kalite kontrollerini geçtiğinde değiştirilir. Yeni aday sürüm önce veri bütünlüğü ve QA kontrollerinden geçer; başarısız olursa önceki çalışan sürüm korunur.'],
  ['Model Performansı sayfası ne işe yarıyor?', 'Model Performansı, tahmin sisteminin kendisini denetler. Güncel modelin geçmiş haftalarda o haftanın sonucunu görmeden nasıl davranacağını ölçen replay testleri ile MH7’den itibaren maç öncesi dondurulan canlı tahminleri ayrı gösterir.'],
  ['Siteyi kullanmak için hesap açmak gerekiyor mu?', 'Genel oyuncu, maç, takım, puan, rol ve model analizleri hesap açmadan görüntülenebilir. Benim Kadrom özelliğinde kişisel takımını kaydetmek için giriş yapman gerekir.'],
  ['Fantezi Pro şu anda aktif ücretli üyelik mi?', 'Beta döneminde temel özellikler ücretsizdir. Fantezi Pro için hedef özellikler ve fiyat planı gösteriliyor; şu anda ücretli satış yerine Pro talebi bekleme listesi üzerinden ölçülüyor.'],
]

function MenuCard({item}){
  const [href,title,description]=item
  return <Link className="card faq-menu-card" href={href}>
    <span>MENÜ</span>
    <h3>{title}</h3>
    <p>{description}</p>
    <b>Sayfaya git →</b>
  </Link>
}

export default function FAQPage(){
  return <div className="page-shell faq-page">
    <nav className="faq-breadcrumb" aria-label="Sayfa yolu"><Link href="/">Ana Sayfa</Link><span>›</span><b>SSS & Rehber</b></nav>

    <section className="page-hero faq-hero">
      <div>
        <span className="eyebrow">SSS & FANTASY FUTBOL REHBERİ</span>
        <h1>Süper Lig Fantasy: Fantezi Scout nasıl kullanılır?</h1>
        <p>Oyuncu Analizi’nden Kadro Önerileri’ne, xFP’den P90’a kadar sitedeki menüleri ve fantasy futbol terimlerini tek yerde açıklar. Yeni başlayan biri için kullanım rehberi, düzenli kullanıcı için hızlı sözlük olarak tasarlandı.</p>
      </div>
      <div className="faq-hero-links">
        <a href="#menu-rehberi">Menü rehberi</a>
        <a href="#terimler">Kısaltmalar</a>
        <a href="#sorular">Sık sorulan sorular</a>
      </div>
    </section>

    <section id="menu-rehberi" className="faq-section">
      <div className="panel-head">
        <div><span className="eyebrow">SİTE REHBERİ</span><h2>Hangi menü ne işe yarıyor?</h2></div>
        <small>Doğru sorudan doğru ekrana git</small>
      </div>
      <div className="faq-menu-grid">{menuItems.map(item=><MenuCard key={item[0]} item={item}/>)}</div>
    </section>

    <section id="terimler" className="card faq-section faq-glossary-section">
      <div className="panel-head">
        <div><span className="eyebrow">FANTASY SÖZLÜĞÜ</span><h2>Kısaltmalar ve model terimleri</h2></div>
        <small>xFP • xDk • P90 • xG • xA • ELO</small>
      </div>
      <div className="faq-glossary-grid">
        {glossary.map(([term,description])=><article key={term}>
          <h3>{term}</h3>
          <p>{description}</p>
        </article>)}
      </div>
    </section>

    <section id="sorular" className="faq-section">
      <div className="panel-head">
        <div><span className="eyebrow">SIK SORULAN SORULAR</span><h2>Fantezi Scout hakkında merak edilenler</h2></div>
        <small>{faqs.length} açıklama</small>
      </div>
      <div className="faq-list">
        {faqs.map(([question,answer],index)=><details className="card faq-item" key={question} open={index<2}>
          <summary><span>{question}</span><i aria-hidden="true">+</i></summary>
          <div><p>{answer}</p></div>
        </details>)}
      </div>
    </section>

    <section className="card faq-cta">
      <div>
        <span className="eyebrow">BAŞLAMAYA HAZIR MISIN?</span>
        <h2>Önce oyuncu havuzunu incele</h2>
        <p>xFP, ilk 11 ihtimali, dakika ve tavan senaryosunu birlikte okuyarak haftanın adaylarını karşılaştır.</p>
      </div>
      <div>
        <Link className="cta" href="/players">Oyuncu Analizi</Link>
        <Link className="secondary" href="/squads">Kadro Önerileri</Link>
      </div>
    </section>
  </div>
}
