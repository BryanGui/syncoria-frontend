import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

async function source(path) {
  return readFile(new URL(path, root), 'utf8')
}

test('defines the neutral visual tokens and semantic states', async () => {
  const css = await source('src/index.css')
  assert.match(css, /--color-background: #f7f7f8/)
  assert.match(css, /--color-accent: #655a6f/)
  assert.match(css, /--color-success:/)
  assert.match(css, /--color-warning:/)
  assert.match(css, /--color-error:/)
  assert.match(css, /--color-info:/)
  assert.match(css, /--color-focus:/)
  assert.match(css, /--control-height-compact:/)
  assert.match(css, /--control-height-standard:/)
})

test('exposes the shared primitive component set', async () => {
  const index = await source('src/components/ui/index.ts')
  for (const primitive of ['Button', 'Badge', 'Panel', 'Section', 'EmptyState', 'SelectableList', 'FormField', 'Notification', 'ActionMenu']) {
    assert.match(index, new RegExp(`\\b${primitive}\\b`))
  }
})

test('button primitive has common variants, sizes and accessible states', async () => {
  const component = await source('src/components/ui/Button.tsx')
  assert.match(component, /'primary' \| 'secondary' \| 'ghost' \| 'danger'/)
  assert.match(component, /'compact' \| 'standard'/)
  assert.match(component, /aria-busy=/)
  assert.match(component, /disabled=\{disabled \|\| loading\}/)
})

test('selectable lists expose a single grouped surface and disabled rows', async () => {
  const component = await source('src/components/ui/SelectableList.tsx')
  assert.match(component, /role=\{type === 'radio' \? 'radiogroup' : undefined\}/)
  assert.match(component, /option\.disabled/)
  assert.match(component, /ui-selectable-list__row--selected/)
})

test('notifications support accessible roles and bounded auto-dismiss', async () => {
  const component = await source('src/components/ui/Notification.tsx')
  assert.match(component, /timeoutMs = 6000/)
  assert.match(component, /role=\{tone === 'error' \? 'alert' : 'status'\}/)
  assert.match(component, /window\.setTimeout/)
})

test('documents the UI rules for future screen migrations', async () => {
  const documentation = await source('docs/UI_GUIDELINES.md')
  assert.match(documentation, /palette|Tokens/i)
  assert.match(documentation, /SelectableList/)
  assert.match(documentation, /Une page ne doit pas créer sa propre couleur/)
  assert.match(documentation, /accessibilité/i)
  assert.match(documentation, /une seule action\s+visuellement principale/i)
  assert.match(documentation, /badge.*uniquement.*état/i)
  assert.match(documentation, /panel vide surdimensionné/i)
  assert.match(documentation, /Le fait qu’une primitive UI existe ne justifie pas son affichage/i)
})

test('keeps the UI interaction harness out of the normal dashboard', async () => {
  const app = await source('src/App.tsx')
  assert.doesNotMatch(app, /<UiReferencePage \/>/)
  assert.match(app, /import\.meta\.env\.VITE_UI_INTERACTION_TEST/)
  assert.match(app, /ui-interaction-test/)
})
