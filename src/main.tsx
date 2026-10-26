import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist/wght.css'
import './index.css'
import App from './App.tsx'
import { loadRuntimeConfig } from './config/runtimeConfig'
import { RuntimeConfigProvider } from './config/RuntimeConfigProvider'

const root = createRoot(document.getElementById('root')!)

root.render(<main className="session-loading" role="status">Chargement de la configuration…</main>)

async function startApplication() {
  try {
    const config = await loadRuntimeConfig(import.meta.env.BASE_URL)
    root.render(
      <StrictMode>
        <RuntimeConfigProvider config={config}>
          <App />
        </RuntimeConfigProvider>
      </StrictMode>,
    )
  } catch {
    root.render(
      <main className="session-loading" role="alert">
        <p>La configuration des services est indisponible. Réessayez ou contactez l’administrateur.</p>
        <button className="secondary-button" onClick={() => window.location.reload()} type="button">
          Réessayer
        </button>
      </main>,
    )
  }
}

void startApplication()
