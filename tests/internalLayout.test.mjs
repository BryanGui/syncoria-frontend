import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appStyles = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')
const reportSource = await readFile(new URL('../src/components/AdminTenantReports.tsx', import.meta.url), 'utf8')

test('internal content uses the full width without changing the public shell', () => {
  assert.match(appStyles, /\.main-content \{[\s\S]*?width: 100%;[\s\S]*?padding: 52px 56px 64px;/)
  assert.doesNotMatch(appStyles, /\.main-content \{[\s\S]*?max-width: 1440px/)
})

test('audit reports use a compact history and one responsive selected report', () => {
  assert.match(appStyles, /\.tenant-audit__report \{[\s\S]*?width: 100%;/)
  assert.match(appStyles, /\.tenant-audit__history-item \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto 1\.5rem;/)
  assert.match(appStyles, /\.tenant-audit__kpis \{[\s\S]*?grid-template-columns: repeat\(5, minmax\(0, 1fr\)/)
  assert.match(appStyles, /@media \(max-width: 540px\) \{[\s\S]*?\.tenant-audit__kpis \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)/)
  assert.match(reportSource, /Rapports d’audit/)
  assert.match(reportSource, /selectedReport/)
  assert.match(reportSource, /Sources analysées[\s\S]*?Enregistrements retenus[\s\S]*?Décisions nécessaires/)
})

test('archived audit reports remain selectable and consultable', () => {
  assert.match(reportSource, /tenant-audit__report--archived/)
  assert.match(reportSource, /Ce rapport est conservé dans l’historique et reste consultable\./)
  assert.match(reportSource, /reportStatusLabel\(report\.status\)/)
  assert.match(reportSource, /setSelectedReportId\(report\.id\)/)
  assert.match(reportSource, /tenant-audit__actions/)
})
