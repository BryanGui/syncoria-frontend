export const FOLLOW_UP_TIMEZONE = 'Europe/Paris'
const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: FOLLOW_UP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})
const displayFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: FOLLOW_UP_TIMEZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
})

function parisParts(instant: number) {
  return Object.fromEntries(
    partsFormatter
      .formatToParts(new Date(instant))
      .map(({ type, value }) => [type, value]),
  )
}
function localDate(values: Record<string, string>) {
  return `${values.year.padStart(4, '0')}-${values.month}-${values.day}T${values.hour}:${values.minute}`
}
export function toParisLocal(instant: string): string {
  return localDate(parisParts(Date.parse(instant)))
}

export function formatDeadline(instant: string): string {
  return displayFormatter.format(new Date(instant))
}

/** Enumerate valid UTC occurrences; holes return zero, autumn overlaps return two. */
export function parisLocalInstants(local: string): string[] {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(local)) return []
  const naive = Date.parse(`${local}:00Z`)
  if (!Number.isFinite(naive)) return []
  // Derive the IANA offsets surrounding this local day, including historic offsets.
  const offsets = new Set(
    [-86_400_000, 0, 86_400_000].map((delta) => {
      const sample = naive + delta
      const parts = parisParts(sample)
      return Date.parse(`${localDate(parts)}:${parts.second}Z`) - sample
    }),
  )
  return [...offsets]
    .filter(Number.isFinite)
    .map((offset) => new Date(naive - offset).toISOString())
    .filter((instant) => toParisLocal(instant) === local)
    .sort()
}

export function deadlineChoiceLabel(instant: string): string {
  const local = toParisLocal(instant)
  const occurrences = parisLocalInstants(local)
  const offset = (Date.parse(`${local}:00Z`) - Date.parse(instant)) / 3_600_000
  return `${occurrences[0] === instant ? 'Première' : 'Seconde'} occurrence (UTC${offset >= 0 ? '+' : ''}${offset})`
}

export function initialDeadlineOccurrence(instant: string): string {
  return (
    parisLocalInstants(toParisLocal(instant)).find((candidate) => {
      const elapsed = Date.parse(instant) - Date.parse(candidate)
      return elapsed >= 0 && elapsed < 60_000
    }) ?? ''
  )
}

export interface ActionFormValues {
  title: string
  status: 'todo' | 'waiting' | 'done'
  dueLocal: string
  occurrence: string
  notes: string
}

/** Keep the original timestamp (including seconds) if its displayed local value was untouched. */
export function formDeadline(
  values: Pick<ActionFormValues, 'dueLocal' | 'occurrence'>,
  initialDue: string | null,
): string | null {
  if (!values.dueLocal) return null
  const instants = parisLocalInstants(values.dueLocal)
  if (!instants.length)
    throw new Error(
      'Cette heure n’existe pas en Europe/Paris. Choisissez une autre heure.',
    )
  if (initialDue && toParisLocal(initialDue) === values.dueLocal) {
    const originalMinute = initialDeadlineOccurrence(initialDue)
    if (instants.length === 1 || values.occurrence === originalMinute) return initialDue
  }
  if (instants.length === 1) return instants[0]
  if (!instants.includes(values.occurrence))
    throw new Error('Choisissez la première ou la seconde occurrence de cette heure.')
  return values.occurrence
}
