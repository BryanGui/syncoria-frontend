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
  assert.match(appSource, /sessionState\.status === 'unauthenticated' && showLanding/)
  assert.match(appSource, /setShowLanding\(false\)/)
  assert.doesNotMatch(landingSource, /Novalia|client@example|syncoria_lab|Calendly|analytics|cookie/i)
})

test('authenticated routes remain selected before the public landing', () => {
  const clientPosition = appSource.indexOf("sessionState.status === 'client_authenticated'")
  const landingPosition = appSource.indexOf('<LandingPage')
  const dashboardPosition = appSource.indexOf('<Dashboard')
  assert.ok(clientPosition >= 0)
  assert.ok(landingPosition > clientPosition)
  assert.ok(dashboardPosition > landingPosition)
  assert.match(appSource, /setShowLanding\(true\)/)
})

test('landing palette and responsive layouts are defined', () => {
  for (const value of ['#f8f7fb', '#ffffff', '#7657e8', '#ece8fa', '#35333d', '#77727f', '#e5e2ea']) {
    assert.match(`${indexStyles}\n${appStyles}`, new RegExp(value, 'i'))
  }
  assert.match(appStyles, /\.landing-page/)
  assert.match(appStyles, /@media \(max-width: 620px\)/)
  assert.match(appStyles, /grid-template-columns: 1fr/)
})
