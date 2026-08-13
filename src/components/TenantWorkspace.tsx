import { useState, type ReactNode } from 'react'

import {
  TENANT_WORKSPACE_SECTIONS,
  ADMIN_TENANT_WORKSPACE_SECTIONS,
  type AdminTenantWorkspaceSection,
  type TenantWorkspaceSection,
  type TenantWorkspaceTenant,
} from '../tenantWorkspace/model'

interface TenantWorkspaceProps {
  tenant: TenantWorkspaceTenant
  onBack?: () => void
  adminIntegration?: ReactNode
}

export function TenantWorkspace({ adminIntegration, tenant, onBack }: TenantWorkspaceProps) {
  const [activeSection, setActiveSection] = useState<
    TenantWorkspaceSection | AdminTenantWorkspaceSection
  >(
    'Vue générale',
  )
  const sections = adminIntegration === undefined
    ? TENANT_WORKSPACE_SECTIONS
    : ADMIN_TENANT_WORKSPACE_SECTIONS

  return (
    <section aria-labelledby="tenant-workspace-title" className="tenant-workspace">
      <div className="tenant-workspace__heading">
        <div>
          {onBack && (
            <button className="back-button" onClick={onBack} type="button">
              ← Retour aux clients
            </button>
          )}
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
        {sections.map((section) => (
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
      ) : activeSection === 'Intégration' && adminIntegration !== undefined ? (
        adminIntegration
      ) : (
        <div className="tenant-workspace__empty">
          <h3>{activeSection}</h3>
          <p>Aucune donnée n’est affichée dans cette section pour le moment.</p>
        </div>
      )}
    </section>
  )
}
