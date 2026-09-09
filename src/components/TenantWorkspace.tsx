import { useState, type ReactNode } from 'react'

import {
  TENANT_WORKSPACE_SECTIONS,
  ADMIN_TENANT_WORKSPACE_SECTIONS,
  INTEGRATION_WORKSPACE_SECTIONS,
  type AdminTenantWorkspaceSection,
  type IntegrationWorkspaceSection,
  type TenantWorkspaceSection,
  type TenantWorkspaceTenant,
  getTenantStatusLabel,
} from '../tenantWorkspace/model'

interface TenantWorkspaceProps {
  tenant: TenantWorkspaceTenant
  onBack?: () => void
  adminReports?: ReactNode
  adminIntegration?: ReactNode
  adminIngestion?: ReactNode
  lifecycleControls?: ReactNode
}

export function TenantWorkspace({
  adminReports,
  adminIntegration,
  adminIngestion,
  lifecycleControls,
  tenant,
  onBack,
}: TenantWorkspaceProps) {
  const [activeSection, setActiveSection] = useState<
    TenantWorkspaceSection | AdminTenantWorkspaceSection
  >(
    'Vue générale',
  )
  const [activeIntegrationSection, setActiveIntegrationSection] = useState<
    IntegrationWorkspaceSection
  >('Audit & cartographie')
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
        <div className="tenant-workspace__heading-actions">
          <span className={tenant.status === 'active'
            ? 'tenant-status tenant-status--active'
            : 'tenant-status'}>
            {getTenantStatusLabel(tenant.status)}
          </span>
          {lifecycleControls}
        </div>
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
            <strong>{getTenantStatusLabel(tenant.status)}</strong>
          </div>
          <div>
            <span>Identifiant technique</span>
            <code>{tenant.id}</code>
          </div>
        </div>
      ) : activeSection === 'Provider credentials' && adminIntegration !== undefined ? (
        adminIntegration
      ) : activeSection === 'Intégration' ? (
        <section aria-labelledby="tenant-workspace-integration-title" className="tenant-workspace__integration">
          <div className="tenant-workspace__integration-heading">
            <h3 id="tenant-workspace-integration-title">Intégration</h3>
            <p>Préparez les données du provider avant leur utilisation dans Syncoria.</p>
          </div>
          <nav aria-label="Étapes d’intégration" className="tenant-workspace__subtabs">
            {INTEGRATION_WORKSPACE_SECTIONS.map((section) => (
              <button
                aria-current={activeIntegrationSection === section ? 'page' : undefined}
                className={activeIntegrationSection === section
                  ? 'tenant-workspace__subtab tenant-workspace__subtab--active'
                  : 'tenant-workspace__subtab'}
                key={section}
                onClick={() => setActiveIntegrationSection(section)}
                type="button"
              >
                {section}
              </button>
            ))}
          </nav>
          {activeIntegrationSection === 'Audit & cartographie' ? (
            <div className="tenant-workspace__integration-content">
              <p className="tenant-workspace__integration-context">
                Les sources auditées et leurs décisions sont récapitulées dans les rapports disponibles.
              </p>
              {adminReports}
            </div>
          ) : activeIntegrationSection === 'Ingestion' ? (
            adminIngestion
          ) : (
            <div className="tenant-workspace__empty">
              <h3>Intégration des données</h3>
              <p>Cette étape transformera plus tard les données brutes en données métier Syncoria.</p>
            </div>
          )}
        </section>
      ) : activeSection === 'Synchronisation' ? (
        <div className="tenant-workspace__empty">
          <h3>Synchronisation</h3>
          <p>Cette étape préparera plus tard les mises à jour récurrentes après l’intégration des données.</p>
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
