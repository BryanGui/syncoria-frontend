import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appStyles = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')
const reportSource = await readFile(new URL('../src/components/AdminTenantReports.tsx', import.meta.url), 'utf8')

test('internal content uses the full width without changing the public shell', () => {
  assert.match(appStyles, /\.main-content \{[\s\S]*?width: 100%;[\s\S]*?padding: 52px 56px 64px;/)
  assert.doesNotMatch(appStyles, /\.main-content \{[\s\S]*?max-width: 1440px/)
})

test('audit history keeps each row compact and exposes its actions directly', () => {
  assert.match(appStyles, /\.tenant-audit__history-item \{[\s\S]*?width: 100%;/)
  assert.match(appStyles, /\.tenant-audit__history-actions \{[\s\S]*?flex-wrap: wrap;/)
  assert.match(appStyles, /@media \(max-width: 540px\) \{[\s\S]*?\.tenant-audit__history-actions \{ display: grid;/)
  assert.match(reportSource, /Historique des audits/)
  assert.match(reportSource, /expandedReportId/)
  assert.match(reportSource, /showArchives/)
  assert.match(reportSource, /renderArtifactPanel/)
  assert.doesNotMatch(reportSource, /Rapport sélectionné|Audit sélectionné/)
})

test('archives are a separate view without inventing restoration', () => {
  assert.match(reportSource, /report\.status === 'archived'/)
  assert.match(reportSource, /Voir les archives/)
  assert.match(reportSource, /Retour aux audits/)
  assert.doesNotMatch(reportSource, /Réactiver|Restaurer/)
})
