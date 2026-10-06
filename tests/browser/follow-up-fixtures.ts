import { expect, type Page } from '@playwright/test'
import type { Company } from '../../src/prospecting/model'
import type { FollowUpAction, FollowUpItem } from '../../src/followUp/model'

export const companyId = '11111111-1111-4111-8111-111111111111'
export const now = '2026-10-25T01:30:00Z'
const dates = { created_at: now, updated_at: now }
export const company: Company = { id: companyId, name: 'Entreprise Suivi test', status: 'contacted', city: 'Lyon', sector: null, website: null, source: null, notes: null, ...dates }
export function action(index: number, fields: Partial<FollowUpAction> = {}): FollowUpAction {
  return { id: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`, subject_type: 'prospecting.company', subject_id: companyId, title: `Action ${index}`, status: 'todo', due_at: null, notes: null, ...dates, ...fields }
}
export const navigation = (page: Page) => page.getByRole('navigation', { name: 'Navigation opérateur' })
export const sheetViews = (page: Page) => page.getByRole('group', { name: 'Vue de la fiche entreprise' })
export async function openFollowUp(page: Page) {
  await navigation(page).getByRole('button', { name: 'Suivi', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'SUIVI', exact: true })).toBeVisible()
}
export async function openCompanyFollowUp(page: Page) {
  await navigation(page).getByRole('button', { name: 'Prospection', exact: true }).click()
  await page.getByRole('button', { name: company.name, exact: true }).click()
  await expect(sheetViews(page).getByRole('button', { name: 'Contacts', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await sheetViews(page).getByRole('button', { name: 'Suivi', exact: true }).click()
}

/** Synthetic boundary responses; every API request is intercepted, with no live fallback. */
export async function connectFollowUp(page: Page, entries: FollowUpAction[] = []) {
  const state = {
    actions: entries,
    companies: [company],
    reads: [] as URL[],
    writes: [] as { method: string; path: string; body: Record<string, unknown> }[],
    readStatus: 200,
    saveStatus: 200,
    networkFailure: false,
    delayMs: 0,
  }
  await page.route('https://api.bryanlab.ovh/**', async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname
    if (path === '/client/me') return route.fulfill({ status: 401, json: {} })
    if (path === '/admin/session') return route.fulfill({ json: { authenticated: true } })
    if (path === '/admin/tenants') return route.fulfill({ json: [] })
    if (path === '/admin/prospecting/companies') {
      const q = (url.searchParams.get('q') ?? '').toLocaleLowerCase('fr')
      const matches = state.companies.filter((entry) => entry.name.toLocaleLowerCase('fr').includes(q))
      const offset = Number(url.searchParams.get('offset') ?? 0), limit = Number(url.searchParams.get('limit') ?? 25)
      return route.fulfill({ json: matches.slice(offset, offset + limit) })
    }
    if (path === `/admin/prospecting/companies/${companyId}`) return route.fulfill({ json: company })
    if (path === `/admin/prospecting/companies/${companyId}/contacts`) return route.fulfill({ json: [] })
    if (!path.startsWith('/admin/follow-up/')) return route.fulfill({ status: 404, json: {} })
    if (request.method() !== 'GET') {
      const body = request.postDataJSON()
      state.writes.push({ method: request.method(), path, body })
      if (state.delayMs) await new Promise((resolve) => setTimeout(resolve, state.delayMs))
      if (state.saveStatus !== 200) return route.fulfill({ status: state.saveStatus, json: { detail: 'private-backend-sentinel' } })
      if (path === '/admin/follow-up/actions') {
        const created = action(100 + state.actions.length, body)
        state.actions.push(created)
        return route.fulfill({ status: 201, json: created })
      }
      const index = state.actions.findIndex((entry) => path === `/admin/follow-up/actions/${entry.id}`)
      if (index < 0) return route.fulfill({ status: 404, json: {} })
      state.actions[index] = { ...state.actions[index], ...body }
      return route.fulfill({ json: state.actions[index] })
    }
    state.reads.push(url)
    if (state.networkFailure) return route.abort('failed')
    if (state.readStatus !== 200) return route.fulfill({ status: state.readStatus, json: { detail: 'private-backend-sentinel' } })
    if (path !== '/admin/follow-up/worklist') return route.fulfill({ status: 404, json: {} })
    const view = url.searchParams.get('view') ?? 'in_progress', due = url.searchParams.get('due') ?? 'all', q = (url.searchParams.get('q') ?? '').trim().toLocaleLowerCase('fr')
    const active = (entry: FollowUpAction) => entry.status !== 'done'
    const midnight = Date.parse('2026-10-24T22:00:00Z'), nextMidnight = Date.parse('2026-10-25T23:00:00Z')
    const matches = state.actions.filter((entry) => {
      const deadline = entry.due_at === null ? null : Date.parse(entry.due_at)
      return (view === 'all' || (view === 'in_progress' ? active(entry) : entry.status === view)) &&
        (!q || entry.title.toLocaleLowerCase('fr').includes(q)) &&
        (!url.searchParams.has('subject_type') || entry.subject_type === url.searchParams.get('subject_type')) &&
        (!url.searchParams.has('subject_id') || entry.subject_id === url.searchParams.get('subject_id')) &&
        (due === 'all' || (due === 'none' ? deadline === null : deadline !== null && (
          due === 'overdue' ? active(entry) && deadline < Date.parse(now) :
            due === 'today' ? deadline >= midnight && deadline < nextMidnight : deadline >= nextMidnight
        )))
    })
    const sort = url.searchParams.get('sort') ?? 'due_at'
    matches.sort((a, b) => (sort === 'updated_at'
      ? Date.parse(b.updated_at) - Date.parse(a.updated_at)
      : (a.due_at === null ? Infinity : Date.parse(a.due_at)) - (b.due_at === null ? Infinity : Date.parse(b.due_at))) || a.id.localeCompare(b.id))
    const offset = Number(url.searchParams.get('offset') ?? 0), limit = Number(url.searchParams.get('limit') ?? 25)
    const items: FollowUpItem[] = matches.slice(offset, offset + limit).map((entry) => ({
      action: entry,
      subject: entry.subject_type === 'prospecting.company' && entry.subject_id === companyId
        ? { label: company.name, company_id: companyId } : { label: 'Sujet indisponible', company_id: null },
      is_overdue: active(entry) && entry.due_at !== null && Date.parse(entry.due_at) < Date.parse(now),
    }))
    return route.fulfill({ json: { items, has_more: matches.length > offset + limit, limit, offset, as_of: now, timezone: 'Europe/Paris' } })
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'VUE GLOBALE', exact: true })).toBeVisible()
  return state
}
