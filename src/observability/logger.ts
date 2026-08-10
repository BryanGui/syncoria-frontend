export type TechnicalLogLevel = 'info' | 'warning' | 'error'

export interface TechnicalLogContext {
  page?: string
  action?: string
  endpoint?: string
  httpStatus?: number
  errorType?: string
}

export interface TechnicalLogEntry {
  level: TechnicalLogLevel
  message: string
  context?: TechnicalLogContext
}

export type TechnicalLogTransport = (entry: TechnicalLogEntry) => void

export interface TechnicalLogger {
  info(message: string, context?: TechnicalLogContext): void
  warning(message: string, context?: TechnicalLogContext): void
  error(message: string, context?: TechnicalLogContext): void
}

interface TechnicalConsole {
  info(message?: unknown, ...optionalParameters: unknown[]): void
  warn(message?: unknown, ...optionalParameters: unknown[]): void
  error(message?: unknown, ...optionalParameters: unknown[]): void
}

interface TechnicalLoggerOptions {
  isDevelopment: boolean
  consoleOutput?: TechnicalConsole
  transports?: readonly TechnicalLogTransport[]
}

function sanitizeTechnicalLogContext(
  context: TechnicalLogContext,
): TechnicalLogContext {
  const sanitizedContext: TechnicalLogContext = {}

  if (context.page !== undefined) sanitizedContext.page = context.page
  if (context.action !== undefined) sanitizedContext.action = context.action
  if (context.endpoint !== undefined) sanitizedContext.endpoint = context.endpoint
  if (context.httpStatus !== undefined) sanitizedContext.httpStatus = context.httpStatus
  if (context.errorType !== undefined) sanitizedContext.errorType = context.errorType

  return sanitizedContext
}

function writeConsoleEntry(
  output: TechnicalConsole,
  entry: TechnicalLogEntry,
): void {
  if (entry.level === 'info') {
    output.info('[Syncoria]', entry)
    return
  }

  if (entry.level === 'warning') {
    output.warn('[Syncoria]', entry)
    return
  }

  output.error('[Syncoria]', entry)
}

export function createTechnicalLogger({
  isDevelopment,
  consoleOutput = console,
  transports = [],
}: TechnicalLoggerOptions): TechnicalLogger {
  function log(
    level: TechnicalLogLevel,
    message: string,
    context?: TechnicalLogContext,
  ): void {
    const entry: TechnicalLogEntry = context === undefined
      ? { level, message }
      : { level, message, context: sanitizeTechnicalLogContext(context) }

    if (isDevelopment) {
      try {
        writeConsoleEntry(consoleOutput, entry)
      } catch {
        // A logging failure must never interrupt the application.
      }
    }

    for (const transport of transports) {
      try {
        transport(entry)
      } catch {
        // Transports remain isolated from the application and each other.
      }
    }
  }

  return {
    info: (message, context) => log('info', message, context),
    warning: (message, context) => log('warning', message, context),
    error: (message, context) => log('error', message, context),
  }
}

export const technicalLogger = createTechnicalLogger({
  isDevelopment: import.meta.env?.DEV === true,
})
