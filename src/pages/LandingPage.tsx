interface LandingPageProps {
  onLogin: () => void
}

const journey = [
  {
    title: 'Cartographier',
    description: 'Identifiez les providers, les agents et les usages de chaque client.',
  },
  {
    title: 'Auditer',
    description: 'Examinez les licences, les permissions et la gouvernance IA.',
  },
  {
    title: 'Surveiller',
    description: 'Repérez les incidents, les dérives de coût et les besoins de formation.',
  },
  {
    title: 'Intervenir',
    description: 'Analysez dans le contexte du client et suivez les actions techniques.',
  },
  {
    title: 'Accompagner',
    description: 'Préparez les revues et soutenez le référent IA interne.',
  },
]

const productAreas = [
  { label: 'Clients', tone: 'violet' },
  { label: 'Gouvernance', tone: 'blue' },
  { label: 'Alertes', tone: 'green' },
  { label: 'Actions', tone: 'orange' },
  { label: 'Providers IA', tone: 'lilac' },
]

export function LandingPage({ onLogin }: LandingPageProps) {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <a aria-label="Syncoria, accueil" className="landing-brand" href="#top">
          <span aria-hidden="true" className="landing-brand__mark">S</span>
          <span>Syncoria</span>
        </a>
        <nav aria-label="Navigation publique" className="landing-navigation">
          <a href="#produit">Produit</a>
          <a href="#fonctionnement">Fonctionnement</a>
          <button className="landing-button landing-button--outline" onClick={onLogin} type="button">
            Se connecter
          </button>
        </nav>
      </header>

      <section className="landing-hero" id="top">
        <div className="landing-hero__content">
          <p className="landing-eyebrow">Le cockpit du responsable IA externalisé</p>
          <h1>Pilotez le parc IA<br />de vos entreprises clientes.</h1>
          <p className="landing-hero__description">
            Syncoria aide l’opérateur à comprendre les usages IA, surveiller les alertes, suivre les coûts et intervenir auprès de plusieurs entreprises. Les clients gardent ChatGPT, Claude et leurs outils habituels.
          </p>
          <div className="landing-hero__actions">
            <a className="landing-button landing-button--primary" href="#produit">
              Découvrir Syncoria
              <span aria-hidden="true">→</span>
            </a>
            <button className="landing-button landing-button--text" onClick={onLogin} type="button">
              Se connecter
            </button>
          </div>
        </div>
        <div aria-hidden="true" className="landing-hero__visual">
          <div className="landing-orbit landing-orbit--outer" />
          <div className="landing-orbit landing-orbit--inner" />
          <div className="landing-hero-card">
            <div className="landing-hero-card__topline">
              <span className="landing-hero-card__dot" />
              <span>Syncoria</span>
              <span className="landing-hero-card__status">Aperçu conceptuel</span>
            </div>
            <div className="landing-hero-card__line landing-hero-card__line--strong" />
            <div className="landing-hero-card__line" />
            <div className="landing-hero-card__line landing-hero-card__line--short" />
            <div className="landing-hero-card__metrics">
              <span><strong>50</strong> clients · illustration</span>
              <span><strong>3</strong> priorités · illustration</span>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="journey-title" className="landing-section landing-journey" id="fonctionnement">
        <div className="landing-section__heading">
          <p className="landing-eyebrow">Un chemin plus simple</p>
          <h2 id="journey-title">Du signal à l’intervention.</h2>
        </div>
        <div className="landing-journey__steps">
          {journey.map((step, index) => (
            <div className="landing-step" key={step.title}>
              <div className="landing-step__number">0{index + 1}</div>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
              {index < journey.length - 1 && <span aria-hidden="true" className="landing-step__arrow">→</span>}
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="product-title" className="landing-section landing-product" id="produit">
        <div className="landing-product__copy">
          <p className="landing-eyebrow">Une vue claire du parc IA</p>
          <h2 id="product-title">Tout ce qui compte, au même endroit.</h2>
          <p>
            L’opérateur retrouve les clients prioritaires, les actions ouvertes et les prochaines revues. Le référent IA du client porte les décisions métier.
          </p>
        </div>
        <div aria-label="Aperçu des espaces Syncoria" className="landing-product__preview" role="img">
          <div className="landing-product__sidebar">
            <span className="landing-product__sidebar-brand"><span aria-hidden="true">S</span> Syncoria</span>
            <span className="landing-product__sidebar-item landing-product__sidebar-item--active">Vue d’ensemble</span>
            <span className="landing-product__sidebar-item">Clients</span>
            <span className="landing-product__sidebar-item">Assistant Syncoria</span>
          </div>
          <div className="landing-product__body">
            <div className="landing-product__body-header">
              <span>Parc IA multi-clients</span>
              <span className="landing-product__body-pill">Cette semaine</span>
            </div>
            <div className="landing-product__area-grid">
              {productAreas.map((area) => (
                <div className={`landing-product__area landing-product__area--${area.tone}`} key={area.label}>
                  <span aria-hidden="true" className="landing-product__area-icon" />
                  <span>{area.label}</span>
                  <span aria-hidden="true" className="landing-product__area-chevron">↗</span>
                </div>
              ))}
            </div>
            <div className="landing-product__chart">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="final-cta-title" className="landing-final-cta">
        <div>
          <p className="landing-eyebrow">Prêt à y voir plus clair ?</p>
          <h2 id="final-cta-title">Un seul cockpit pour accompagner plusieurs entreprises.</h2>
        </div>
        <button className="landing-button landing-button--primary" onClick={onLogin} type="button">
          Se connecter
          <span aria-hidden="true">→</span>
        </button>
      </section>

      <footer className="landing-footer">
        <span>Syncoria</span>
        <span>AI Control Plane · supervision multi-clients.</span>
      </footer>
    </main>
  )
}
