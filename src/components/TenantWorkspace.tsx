import { useState } from 'react'

import {
  TENANT_WORKSPACE_SECTIONS,
  type TenantWorkspaceSection,
  type TenantWorkspaceTenant,
} from '../tenantWorkspace/model'

interface TenantWorkspaceProps {
  tenant: TenantWorkspaceTenant
  onBack: () => void
}

export function TenantWorkspace({ tenant, onBack }: TenantWorkspaceProps) {
  const [activeSection, setActiveSection] = useState<TenantWorkspaceSection>(
    'Vue générale',
  )

  return (
    <section aria-labelledby="tenant-workspace-title" className="tenant-workspace">
      <div className="tenant-workspace__heading">
        <div>
          <button className="back-button" onClick={onBack} type="button">
            ← Retour aux clients
          </button>
          <p className="eyebrow">Espace tenant</p>
          <h2 id="tenant-workspace-title">{tenant.slug}</h2>
        </div>
        <span className={tenant.status === 'active'
          ? 'tenant-status tenant-status--active'
          : 'tenant-status'}>
          {tenant.status}
        </span>
      </div>

      <nav aria-label="Sections de l’espace tenant" className="tenant-workspace__tabs">
        {TENANT_WORKSPACE_SECTIONS.map((section) => (
          <button
            aria-current={activeSection === section ? 'page' : undefined}
            className={activeSection === section
              ? 'tenant-workspace__tab tenant-workspace__tab--active'
              : 'tenant-workspace__tab'}
            key={section}
            onClick={() => setActiveSection(section)}
            type="button"
          >
            {section}
          </button>
        ))}
      </nav>

      {activeSection === 'Vue générale' ? (
        <div className="tenant-overview">
          <div>
            <span>Slug</span>
            <strong>{tenant.slug}</strong>
          </div>
          <div>
            <span>Statut</span>
            <strong>{tenant.status}</strong>
          </div>
          <div>
            <span>Identifiant technique</span>
            <code>{tenant.id}</code>
          </div>
        </div>
      ) : (
        <div className="tenant-workspace__empty">
          <h3>{activeSection}</h3>
          <p>Aucune donnée n’est affichée dans cette section pour le moment.</p>
        </div>
      )}
    </section>
  )
}
