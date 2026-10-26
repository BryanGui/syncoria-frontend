import { createContext, useContext } from 'react'
import type { RuntimeConfig } from './runtimeConfig'

export const RuntimeConfigContext = createContext<RuntimeConfig | null>(null)

export function useRuntimeConfig(): RuntimeConfig {
  const config = useContext(RuntimeConfigContext)
  if (config === null) throw new Error('La configuration des services est indisponible.')
  return config
}
