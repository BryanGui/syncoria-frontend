import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appStyles = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')
const reportSource = await readFile(new URL('../src/components/AdminTenantReports.tsx', import.meta.url), 'utf8')

test('internal content uses the full width without changing the public shell', () => {
  assert.match(appStyles, /\.main-content \{[\s\S]*?width: 100%;[\s\S]*?padding: 52px 56px 64px;/)
  assert.doesNotMatch(appStyles, /\.main-content \{[\s\S]*?max-width: 1440px/)
})

test('active audit reports are full width with desktop columns and mobile stacking', () => {
  assert.match(appStyles, /\.tenant-audit__report \{[\s\S]*?width: 100%;/)
  assert.doesNotMatch(appStyles, /\.tenant-audit__report \{[\s\S]*?max-width: 42rem/)
  assert.match(appStyles, /\.tenant-audit__report-details \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(appStyles, /@media \(max-width: 540px\) \{[\s\S]*?\.tenant-audit__report-details \{ grid-template-columns: 1fr;/)
  assert.match(reportSource, /!isArchived && \([\s\S]*?Sources analysées[\s\S]*?Enregistrements retenus/)
})

test('archived audit reports keep a compact history summary and existing actions', () => {
  assert.match(reportSource, /tenant-audit__report--archived/)
  assert.match(reportSource, /Ce rapport est conservé dans l’historique et reste consultable\./)
  assert.match(appStyles, /\.tenant-audit__report--archived \{ padding: \.85rem 1rem;/)
  assert.match(reportSource, /tenant-audit__actions/)
})
