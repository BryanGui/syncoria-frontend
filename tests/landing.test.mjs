import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const landingSource = await readFile(
  new URL('../src/pages/LandingPage.tsx', import.meta.url),
  'utf8',
)
const appSource = await readFile(
  new URL('../src/App.tsx', import.meta.url),
  'utf8',
)
const appStyles = await readFile(
  new URL('../src/App.css', import.meta.url),
  'utf8',
)
const indexStyles = await readFile(
  new URL('../src/index.css', import.meta.url),
  'utf8',
)

test('landing page contains the public message and five product blocks', () => {
  assert.match(landingSource, /Vos outils restent\.<br \/>Vos données travaillent enfin ensemble\./)
  assert.match(landingSource, /Syncoria structure les données dispersées/)
  assert.match(landingSource, /Découvrir Syncoria/)
  assert.match(landingSource, /Découvrez ce que Syncoria peut simplifier dans votre entreprise\./)
  for (const label of ['Produit', 'Fonctionnement', 'Clients', 'Données', 'Synchronisation', 'Processus', 'Intégration']) {
    assert.match(landingSource, new RegExp(label))
  }
})

test('landing uses a dedicated login callback and does not contain tenant data', () => {
  assert.match(landingSource, /onLogin: \(\) => void/)
  assert.match(appSource, /<LandingPage/)
  assert.match(appSource, /const \[isLoginOpen, setIsLoginOpen\]/)
  assert.match(appSource, /const \[isInitialSessionCheck, setIsInitialSessionCheck\]/)
  assert.match(appSource, /sessionState\.status === 'unauthenticated' \|\| sessionState\.status === 'error'/)
  assert.match(appSource, /className="login-overlay"/)
  assert.match(appSource, /aria-modal="true"/)
  assert.match(appSource, /Fermer la connexion/)
  assert.doesNotMatch(appSource, /showLanding/)
  assert.doesNotMatch(landingSource, /Novalia|client@example|syncoria_lab|Calendly|analytics|cookie/i)
})

test('authenticated routes remain selected before the public landing', () => {
  const clientPosition = appSource.indexOf("sessionState.status === 'client_authenticated'")
  const publicShellPosition = appSource.indexOf("sessionState.status === 'unauthenticated' || sessionState.status === 'error'")
  const dashboardPosition = appSource.lastIndexOf('<Dashboard')
  assert.ok(clientPosition >= 0)
  assert.ok(publicShellPosition >= 0)
  assert.ok(dashboardPosition > clientPosition)
  assert.match(appSource, /setIsLoginOpen\(false\)/)
  assert.match(appSource, /sessionState\.status === 'loading' && isInitialSessionCheck/)
})

test('session errors keep the public shell and login remains retryable', () => {
  assert.match(appSource, /status: clientResult\.status === 'error' \|\| adminResult === 'error'/)
  assert.match(appSource, /initialError=\{sessionState\.status === 'error'/)
  assert.match(appSource, /onRetrySession=\{loadClientSession\}/)
  assert.match(appSource, /onRetrySession=\{loadAdminSession\}/)
  assert.match(appStyles, /\.login-overlay \.login-page/)
  assert.match(appStyles, /\.login-overlay__panel/)
})

test('authenticated users can open the public landing without logging out', () => {
  assert.match(appSource, /isPublicPreviewOpen/)
  assert.match(appSource, /Site public/)
  assert.match(appSource, /Revenir à l’espace connecté/)
  assert.match(appSource, /setIsPublicPreviewOpen\(true\)/)
  assert.match(appSource, /sessionState\.status === 'admin_authenticated'[\s\S]*?renderConnectedPublicShell/)
  assert.match(appStyles, /\.public-preview__return/)
})

test('landing palette and responsive layouts are defined', () => {
  for (const value of ['#f8f7fb', '#ffffff', '#7657e8', '#ece8fa', '#35333d', '#77727f', '#e5e2ea']) {
    assert.match(`${indexStyles}\n${appStyles}`, new RegExp(value, 'i'))
  }
  assert.match(appStyles, /\.landing-page/)
  assert.match(appStyles, /@media \(max-width: 620px\)/)
  assert.match(appStyles, /grid-template-columns: 1fr/)
})
