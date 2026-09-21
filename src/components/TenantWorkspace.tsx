import { useState, type ReactNode } from 'react'

import {
  TENANT_WORKSPACE_SECTIONS,
  ADMIN_TENANT_WORKSPACE_SECTIONS,
  type AdminTenantWorkspaceSection,
  type TenantWorkspaceSection,
  type TenantWorkspaceTenant,
  getTenantStatusLabel,
} from '../tenantWorkspace/model'

interface TenantWorkspaceProps {
  tenant: TenantWorkspaceTenant
  tenantLabel?: string
  onBack?: () => void
  adminReports?: ReactNode
  adminData?: ReactNode
  adminIntegration?: ReactNode
  adminIngestion?: ReactNode
  adminVersionedIntegration?: ReactNode
  lifecycleControls?: ReactNode
}

export function TenantWorkspace({
  adminData,
  adminReports,
  adminIntegration,
  adminIngestion,
  adminVersionedIntegration,
  lifecycleControls,
  tenant,
  tenantLabel,
  onBack,
}: TenantWorkspaceProps) {
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
          <h2 id="tenant-workspace-title">{tenantLabel ?? tenant.slug}</h2>
        </div>
        <div className="tenant-workspace__heading-actions">
          <span className={tenant.status === 'active'
            ? 'tenant-status tenant-status--active'
            : 'tenant-status'}>
            {getTenantStatusLabel(tenant.status)}
          </span>
          {lifecycleControls}
        </div>
      </div>

      <nav aria-label="Sections du client" className="tenant-workspace__tabs">
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
            <strong>{getTenantStatusLabel(tenant.status)}</strong>
          </div>
          <div>
            <span>Identifiant technique</span>
            <code>{tenant.id}</code>
          </div>
        </div>
      ) : activeSection === 'Connexions' && adminIntegration !== undefined ? (
        adminIntegration
      ) : activeSection === 'Données' && adminData !== undefined ? (
        adminData
      ) : activeSection === 'Audit' ? (
        adminReports
      ) : activeSection === 'Ingestion' ? (
        adminIngestion
      ) : activeSection === 'Intégration' ? (
        adminVersionedIntegration
      ) : activeSection === 'Synchronisation' ? (
        <div className="tenant-workspace__empty">
          <h3 className="visually-hidden">Synchronisation</h3>
          <p>Cette étape préparera plus tard les mises à jour récurrentes après l’intégration des données.</p>
        </div>
      ) : (
        <div className="tenant-workspace__empty">
          <h3 className="visually-hidden">{activeSection}</h3>
          <p>Aucune donnée n’est affichée dans cette section pour le moment.</p>
        </div>
      )}
    </section>
  )
}
