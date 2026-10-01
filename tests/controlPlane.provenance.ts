import type { ControlPlaneProvenance, FleetTenant, OperatorAction } from '../src/controlPlane/model.ts'

// Compile-only assertions, checked by npm test without emitting files.
export function verifyProvenanceContract(tenant: FleetTenant, action: OperatorAction) {
  const provenances: ControlPlaneProvenance[] = ['provider', 'syncoria', 'synthetic/demo']
  for (const provenance of provenances) {
    const observedTenant: FleetTenant = { ...tenant, provenance }
    const observedAction: OperatorAction = { ...action, provenance }
    void observedTenant
    void observedAction
  }
  // @ts-expect-error Unknown provenance must remain rejected for tenants.
  const invalidTenant: FleetTenant = { ...tenant, provenance: 'unknown' }
  // @ts-expect-error Unknown provenance must remain rejected for actions.
  const invalidAction: OperatorAction = { ...action, provenance: 'unknown' }
  void invalidTenant
  void invalidAction
}
