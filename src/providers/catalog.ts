export interface ProviderCatalogEntry {
  slug: string
  label: string
  logo: string | null
  aliases: readonly string[]
}

// This is a visual catalog. Backend provider support comes only from API records.
export const providerCatalog: readonly ProviderCatalogEntry[] = [
  { slug: 'notion', label: 'Notion', logo: new URL('../assets/providers/notion.svg', import.meta.url).href, aliases: [] },
  { slug: 'n8n', label: 'n8n', logo: new URL('../assets/providers/n8n.svg', import.meta.url).href, aliases: [] },
  { slug: 'google-sheets', label: 'Google Sheets', logo: new URL('../assets/providers/google-sheets.svg', import.meta.url).href, aliases: ['google_sheets'] },
  { slug: 'google-drive', label: 'Google Drive', logo: new URL('../assets/providers/google-drive.svg', import.meta.url).href, aliases: ['google_drive'] },
  { slug: 'gmail', label: 'Gmail', logo: new URL('../assets/providers/gmail.svg', import.meta.url).href, aliases: [] },
  { slug: 'google-calendar', label: 'Google Calendar', logo: new URL('../assets/providers/google-calendar.svg', import.meta.url).href, aliases: ['google_calendar'] },
  { slug: 'microsoft-excel', label: 'Microsoft Excel', logo: null, aliases: ['microsoft_excel', 'excel'] },
  { slug: 'microsoft-onedrive', label: 'Microsoft OneDrive', logo: null, aliases: ['microsoft_onedrive', 'onedrive'] },
  { slug: 'microsoft-outlook', label: 'Microsoft Outlook', logo: null, aliases: ['microsoft_outlook', 'outlook'] },
  { slug: 'microsoft-teams', label: 'Microsoft Teams', logo: null, aliases: ['microsoft_teams', 'teams'] },
  { slug: 'slack', label: 'Slack', logo: null, aliases: [] },
  { slug: 'hubspot', label: 'HubSpot', logo: new URL('../assets/providers/hubspot.svg', import.meta.url).href, aliases: [] },
  { slug: 'salesforce', label: 'Salesforce', logo: null, aliases: [] },
  { slug: 'airtable', label: 'Airtable', logo: new URL('../assets/providers/airtable.svg', import.meta.url).href, aliases: [] },
  { slug: 'calendly', label: 'Calendly', logo: new URL('../assets/providers/calendly.svg', import.meta.url).href, aliases: [] },
  { slug: 'typeform', label: 'Typeform', logo: new URL('../assets/providers/typeform.svg', import.meta.url).href, aliases: [] },
  { slug: 'monday', label: 'Monday.com', logo: null, aliases: ['monday_com', 'monday.com'] },
  { slug: 'asana', label: 'Asana', logo: new URL('../assets/providers/asana.svg', import.meta.url).href, aliases: [] },
  { slug: 'stripe', label: 'Stripe', logo: new URL('../assets/providers/stripe.svg', import.meta.url).href, aliases: [] },
  { slug: 'shopify', label: 'Shopify', logo: new URL('../assets/providers/shopify.svg', import.meta.url).href, aliases: [] },
]

const providerBySlug = new Map<string, ProviderCatalogEntry>()
for (const entry of providerCatalog) {
  providerBySlug.set(entry.slug, entry)
  for (const alias of entry.aliases) providerBySlug.set(alias, entry)
}

export function resolveProvider(slug: string): ProviderCatalogEntry | null {
  return providerBySlug.get(slug.trim().toLowerCase()) ?? null
}

export function getProviderLabel(slug: string): string {
  return resolveProvider(slug)?.label ?? (slug.replace(/[-_]/g, ' ').trim() || 'Outil inconnu')
}
