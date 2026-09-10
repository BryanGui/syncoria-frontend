interface LandingPageProps {
  onLogin: () => void
}

const journey = [
  {
    title: 'Connecter',
    description: 'Reliez les outils que votre équipe utilise déjà.',
  },
  {
    title: 'Auditer',
    description: 'Visualisez simplement vos données et leurs sources.',
  },
  {
    title: 'Structurer',
    description: 'Donnez un cadre clair à l’information dispersée.',
  },
  {
    title: 'Synchroniser',
    description: 'Gardez les bons éléments à jour partout.',
  },
  {
    title: 'Automatiser',
    description: 'Faites avancer vos processus avec moins de tâches manuelles.',
  },
]

const productAreas = [
  { label: 'Clients', tone: 'violet' },
  { label: 'Données', tone: 'blue' },
  { label: 'Synchronisation', tone: 'green' },
  { label: 'Processus', tone: 'orange' },
  { label: 'Intégration', tone: 'lilac' },
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
          <p className="landing-eyebrow">L’espace de travail qui relie vos outils</p>
          <h1>Vos outils restent.<br />Vos données travaillent enfin ensemble.</h1>
          <p className="landing-hero__description">
            Syncoria structure les données dispersées de votre entreprise, les maintient synchronisées et automatise vos processus sans remplacer vos outils existants.
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
              <span className="landing-hero-card__status">À jour</span>
            </div>
            <div className="landing-hero-card__line landing-hero-card__line--strong" />
            <div className="landing-hero-card__line" />
            <div className="landing-hero-card__line landing-hero-card__line--short" />
            <div className="landing-hero-card__metrics">
              <span><strong>5</strong> sources reliées</span>
              <span><strong>24</strong> processus suivis</span>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="journey-title" className="landing-section landing-journey" id="fonctionnement">
        <div className="landing-section__heading">
          <p className="landing-eyebrow">Un chemin plus simple</p>
          <h2 id="journey-title">De la donnée dispersée à l’action.</h2>
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
          <p className="landing-eyebrow">Une vue claire de votre activité</p>
          <h2 id="product-title">Tout ce qui compte, au même endroit.</h2>
          <p>
            Syncoria donne à vos équipes une lecture commune de leurs outils, de leurs données et des actions à mener.
          </p>
        </div>
        <div aria-label="Aperçu des espaces Syncoria" className="landing-product__preview" role="img">
          <div className="landing-product__sidebar">
            <span className="landing-product__sidebar-brand"><span aria-hidden="true">S</span> Syncoria</span>
            <span className="landing-product__sidebar-item landing-product__sidebar-item--active">Vue d’ensemble</span>
            <span className="landing-product__sidebar-item">Espaces</span>
            <span className="landing-product__sidebar-item">Paramètres</span>
          </div>
          <div className="landing-product__body">
            <div className="landing-product__body-header">
              <span>Votre activité</span>
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
          <h2 id="final-cta-title">Découvrez ce que Syncoria peut simplifier dans votre entreprise.</h2>
        </div>
        <button className="landing-button landing-button--primary" onClick={onLogin} type="button">
          Se connecter
          <span aria-hidden="true">→</span>
        </button>
      </section>

      <footer className="landing-footer">
        <span>Syncoria</span>
        <span>Des outils qui travaillent ensemble.</span>
      </footer>
    </main>
  )
}
