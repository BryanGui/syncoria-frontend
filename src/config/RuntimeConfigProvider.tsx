import type { ReactNode } from 'react'
import type { RuntimeConfig } from './runtimeConfig'
import { RuntimeConfigContext } from './runtimeConfigContext'

export function RuntimeConfigProvider({
  config,
  children,
}: { config: RuntimeConfig; children: ReactNode }) {
  return (
    <RuntimeConfigContext.Provider value={config}>
      {children}
    </RuntimeConfigContext.Provider>
  )
}
