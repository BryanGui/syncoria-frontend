import { useState } from 'react'

import { ActionMenu } from './ActionMenu'

export function ActionMenuTestHarness() {
  const [lastAction, setLastAction] = useState('Aucune action')

  return (
    <main aria-labelledby="action-menu-test-title" className="ui-test-harness">
      <h1 id="action-menu-test-title">Test ActionMenu</h1>
      <ActionMenu label="Actions secondaires">
        <button onClick={() => setLastAction('Ouvrir')} type="button">Ouvrir</button>
      </ActionMenu>
      <label htmlFor="action-menu-focus-target">Contrôle externe</label>
      <input id="action-menu-focus-target" />
      <p aria-live="polite">Dernière action : {lastAction}</p>
    </main>
  )
}
