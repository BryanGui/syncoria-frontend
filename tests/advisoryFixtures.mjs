export const advisoryTenantId = '11111111-1111-4111-8111-111111111111'
export const advisoryOtherTenantId = '99999999-9999-4999-8999-999999999999'
const now = '2026-10-02T10:00:00Z'
const common = () => ({
  tenant_id: advisoryTenantId,
  created_at: now,
  updated_at: now,
})
export const emptyAdvisory = (tenantId = advisoryTenantId) => ({
  tenant: {
    tenant_id: tenantId,
    name: 'Entreprise conseil',
    slug: 'conseil',
    status: 'active',
  },
  read_at: now,
  profile: null,
  contacts: [],
  needs: [],
  opportunities: [],
  decisions: [],
  engagements: [],
  actions: [],
  provider_access: [],
  recent_timeline: [],
})
export function completeAdvisory() {
  const need_id = '22222222-2222-4222-8222-222222222222'
  const opportunity_id = '33333333-3333-4333-8333-333333333333'
  const decision_id = '44444444-4444-4444-8444-444444444444'
  const engagement_id = '55555555-5555-4555-8555-555555555555'
  return {
    ...emptyAdvisory(),
    profile: {
      ...common(),
      activity_summary: 'Entreprise industrielle accompagnée',
      business_context: 'Doubles saisies fréquentes',
      ai_maturity_notes: null,
      objectives: 'Réduire les tâches répétées',
      constraints: null,
    },
    contacts: [
      {
        ...common(),
        contact_id: '66666666-6666-4666-8666-666666666666',
        name: 'Camille Exemple',
        role_title: 'Direction métier',
        email: 'camille@example.test',
        contact_type: 'ai_referent',
        active: true,
        notes: null,
      },
    ],
    needs: [
      {
        ...common(),
        need_id,
        title: 'Réduire la double saisie',
        description: 'Problème confié par le client',
        business_area: 'Opérations',
        pain_level: 'high',
        status: 'identified',
        source: 'meeting',
      },
    ],
    opportunities: [
      {
        ...common(),
        opportunity_id,
        need_id,
        title: 'Assistant de saisie',
        hypothesis: 'Assister les équipes',
        opportunity_type: 'assist',
        expected_value: 'high',
        feasibility: 'unknown',
        priority: 'high',
        status: 'evaluating',
      },
    ],
    decisions: [
      {
        ...common(),
        decision_id,
        opportunity_id,
        title: 'Prototype limité',
        decision: 'Tester avant intégration',
        rationale: 'Limiter le risque métier',
        status: 'accepted',
        decided_at: now,
      },
    ],
    engagements: [
      {
        ...common(),
        engagement_id,
        opportunity_id,
        title: 'Prototype équipe',
        kind: 'prototype',
        status: 'delivered',
        summary: 'Essai sur données fictives',
        started_at: now,
        delivered_at: now,
        outcome_notes: 'Retour qualitatif',
      },
    ],
    actions: [
      {
        ...common(),
        action_id: '77777777-7777-4777-8777-777777777777',
        title: 'Revoir les résultats',
        type: 'review',
        status: 'open',
        priority: 'high',
        owner: null,
        source: 'operator',
        provenance: 'syncoria',
        due_at: null,
        completed_at: null,
        notes: 'Préparer un entretien',
        alert_id: null,
        need_id,
        opportunity_id,
        decision_id,
        engagement_id,
      },
    ],
    provider_access: [
      {
        ...common(),
        access_reference_id: '88888888-8888-4888-8888-888888888888',
        provider: 'openai',
        label: 'Workspace conseil',
        access_type: 'workspace_membership',
        workspace_name: 'Client exemple',
        workspace_external_id: null,
        login_url: 'https://platform.openai.com/',
        operator_identity_hint: 'Compte professionnel',
        notes: null,
        status: 'active',
        last_verified_at: null,
      },
    ],
    recent_timeline: [
      {
        tenant_id: advisoryTenantId,
        resource: 'decisions',
        resource_id: decision_id,
        event: 'decision_accepted',
        at: now,
        title: 'Prototype limité',
      },
    ],
  }
}
