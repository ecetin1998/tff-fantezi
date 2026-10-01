import Link from 'next/link'

export default function AccessGate({
  eyebrow='ERİŞİM',
  title,
  description,
  tier='member',
  compact=false,
  children=null,
}){
  const member=tier==='member'
  return <section className={`access-gate ${compact?'compact':''} ${member?'member-gate':'pro-gate'}`}>
    <div className="access-gate-copy">
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </div>
    <div className="access-gate-actions">
      {member
        ?<Link className="cta" href="/login">Ücretsiz hesap aç / giriş yap</Link>
        :<Link className="cta" href="/pricing">Pro özelliklerini gör</Link>}
      <Link className="secondary" href="/sss">Nasıl çalışıyor?</Link>
    </div>
  </section>
}
