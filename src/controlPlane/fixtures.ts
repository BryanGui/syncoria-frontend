import type { FleetTenant, OperatorAction } from './model.ts'

// Isolated, fictional dataset. IDs must never be submitted to provider/runtime APIs.
export const DEMO_OBSERVED_AT = '2026-10-01T09:00:00Z'
const names = [
  'Novalia Démo',
  'Atelier Boréal',
  'Maison Équinoxe',
  'Studio Mistral',
  'Groupe Alizé',
  'Collectif Aster',
  'Manufacture Sillage',
  'Horizon Conseil',
]
export const DEMO_TENANTS: FleetTenant[] = Array.from(
  { length: 50 },
  (_, i) => {
    const status =
      i < 3 ? 'critical' : i < 10 ? 'watch' : i < 15 ? 'due' : 'healthy'
    return {
      id: `demo:${i + 1}`,
      name: names[i] ?? `Entreprise Démo ${String(i + 1).padStart(2, '0')}`,
      lifecycle: 'active',
      status,
      provenance: 'synthetic/demo',
      reason:
        status === 'critical'
          ? 'Agent en erreur · intervention requise'
          : status === 'watch'
            ? i % 2
              ? 'Coût IA en hausse de 28 %'
              : 'Adoption faible · licences inutilisées'
            : status === 'due'
              ? 'Revue de gouvernance / formation à planifier'
              : 'Aucune anomalie dans le scénario de démonstration',
      referent: `Référent fictif ${i + 1}`,
      providers: ['OpenAI', 'Anthropic'],
      users: 30,
      adoption: i < 10 ? 57 : 83,
      costEur: 480 + i * 12,
      agents: [
        {
          name: 'Assistant opérations',
          provider: 'OpenAI',
          status: i < 3 ? 'Erreur' : 'OK',
          tools: 'MCP Syncoria · lecture autorisée',
          trigger: 'À la demande',
        },
        {
          name: 'Revue documentaire',
          provider: 'Anthropic',
          status: i < 3 ? 'Erreur' : 'OK',
          tools: 'Références documentaires',
          trigger: 'Chaque semaine',
        },
      ],
      history: [
        {
          date: '2026-10-01',
          title:
            status === 'critical'
              ? 'Signal agent en erreur détecté'
              : 'Revue des signaux de pilotage',
        },
        {
          date: '2026-09-18',
          title: 'Formation : usages IA et confidentialité',
        },
        { date: '2026-09-02', title: 'Baseline gouvernance établie' },
      ],
    }
  },
)
export const DEMO_ACTIONS: OperatorAction[] = DEMO_TENANTS.slice(0, 15).map(
  (tenant, i) => ({
    id: `demo:action:${i + 1}`,
    tenantId: tenant.id,
    type:
      i < 3
        ? 'incident'
        : i < 10
          ? 'recommendation'
          : i % 2
            ? 'training'
            : 'review',
    title:
      i < 3
        ? 'Analyser les erreurs de l’agent'
        : i < 10
          ? 'Vérifier usage et allocation des licences'
          : 'Planifier la revue / formation',
    status: i === 0 ? 'in_progress' : i === 3 ? 'awaiting_approval' : 'open',
    priority: i < 3 ? 'critical' : i < 10 ? 'high' : 'normal',
    owner: 'Opérateur démo',
    source: 'signal synthétique',
    provenance: 'synthetic/demo',
    createdAt: DEMO_OBSERVED_AT,
    dueAt: '2026-10-05T09:00:00Z',
    completedAt: null,
    notes:
      'Exemple de suivi opérationnel. Aucune intervention réelle effectuée.',
  }),
)
