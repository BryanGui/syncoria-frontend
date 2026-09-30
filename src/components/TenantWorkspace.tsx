import { useCallback, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import {
  type AdminTenantWorkspaceSection,
  type TenantWorkspaceSection,
  type TenantWorkspaceTenant,
  getTenantStatusLabel,
} from '../tenantWorkspace/model'
import { TenantChatDrawer } from './TenantChatDrawer'
import { TenantNavigation } from './TenantNavigation'
import { TenantConnectedTools, type ConnectedToolsState } from './TenantConnectedTools'

type TenantSection = TenantWorkspaceSection | AdminTenantWorkspaceSection

interface TenantWorkspaceProps {
  tenant: TenantWorkspaceTenant
  tenantLabel?: string
  onBack?: () => void
  sidebarTarget?: HTMLDivElement | null
  headingTarget?: HTMLElement | null
  adminReports?: ReactNode
  adminAccess?: ReactNode
  adminIntegration?: ReactNode
  adminIngestion?: ReactNode
  adminVersionedIntegration?: ReactNode
  lifecycleControls?: ReactNode
  connectedToolsState?: ConnectedToolsState
}

export function TenantWorkspace({
  adminAccess,
  adminReports,
  adminIntegration,
  adminIngestion,
  adminVersionedIntegration,
  connectedToolsState,
  lifecycleControls,
  tenant,
  tenantLabel,
  onBack,
  sidebarTarget,
  headingTarget,
}: TenantWorkspaceProps) {
  const [activeSection, setActiveSection] = useState<TenantSection>('Vue générale')
  const [chatOpen, setChatOpen] = useState(false)
  const chatTriggerRef = useRef<HTMLButtonElement>(null)
  const closeChat = useCallback(() => setChatOpen(false), [])
  const isAdmin = adminIntegration !== undefined
  const isSources = isAdmin && activeSection === 'Sources'
  const isOverview = isAdmin && activeSection === 'Vue générale'
  const name = tenantLabel ?? tenant.slug
  const title = <h2 className="tenant-workspace__title" id="tenant-workspace-title">{name}</h2>
  const navigation = <TenantNavigation
    activeSection={activeSection}
    chatTriggerRef={chatTriggerRef}
    isAdmin={isAdmin}
    onBack={onBack}
    onOpenChat={() => setChatOpen(true)}
    onSelect={setActiveSection}
    tenantLabel={name}
  />

  return (
    <div className={sidebarTarget ? 'tenant-workspace-layout tenant-workspace-layout--portal' : 'tenant-workspace-layout'}>
      {sidebarTarget ? createPortal(navigation, sidebarTarget) : navigation}
      {headingTarget ? createPortal(title, headingTarget) : title}
      <section aria-label={activeSection} className={`tenant-workspace${isSources ? ' tenant-workspace--sources' : ''}${isOverview ? ' tenant-workspace--overview' : ''}`}>

        {activeSection === 'Vue générale' ? (
          <div className="tenant-overview">
            {connectedToolsState ? (
              <TenantConnectedTools
                onManageSources={isAdmin ? () => setActiveSection('Sources') : undefined}
                state={connectedToolsState}
              />
            ) : null}
            {isAdmin ? <section aria-labelledby="tenant-overview-links-title" className="tenant-overview__links">
              <h3 id="tenant-overview-links-title">Accès rapides</h3>
              <div>
                <button aria-label="Ouvrir les sources" onClick={() => setActiveSection('Sources')} type="button">Sources <span aria-hidden="true">↗</span></button>
                <button aria-label="Ouvrir l’audit" onClick={() => setActiveSection('Audit')} type="button">Audit <span aria-hidden="true">↗</span></button>
                <button aria-label="Ouvrir Superset" onClick={() => setActiveSection('Superset')} type="button">Superset <span aria-hidden="true">↗</span></button>
                <button aria-label="Ouvrir le chat IA" onClick={() => setChatOpen(true)} type="button">Chat IA <span aria-hidden="true">↗</span></button>
              </div>
            </section> : null}
            {isAdmin ? <details className="tenant-overview__details">
              <summary>Informations techniques <span className={tenant.status === 'active' ? 'tenant-overview__status tenant-overview__status--active' : 'tenant-overview__status'}>{getTenantStatusLabel(tenant.status)}</span></summary>
              <dl>
                <div><dt>Slug</dt><dd>{tenant.slug}</dd></div>
                <div><dt>Identifiant technique</dt><dd><code>{tenant.id}</code></dd></div>
              </dl>
            </details> : <section aria-labelledby="tenant-overview-details-title" className="tenant-overview__details">
              <h3 id="tenant-overview-details-title">Informations du tenant</h3>
              <dl>
                <div><dt>Statut</dt><dd>{getTenantStatusLabel(tenant.status)}</dd></div>
                <div><dt>Slug</dt><dd>{tenant.slug}</dd></div>
                <div><dt>Identifiant technique</dt><dd><code>{tenant.id}</code></dd></div>
              </dl>
            </section>}
            {lifecycleControls}
          </div>
        ) : activeSection === 'Sources' && adminIntegration !== undefined ? (
          adminIntegration
        ) : activeSection === 'Superset' ? (
          <div className="tenant-workspace__empty">
            <h3>Visualisation des données</h3>
            <p>Les tableaux de bord Superset seront disponibles ici.</p>
          </div>
        ) : activeSection === 'Accès' ? (
          adminAccess
        ) : activeSection === 'Audit' ? (
          adminReports
        ) : activeSection === 'Ingestion' ? (
          adminIngestion
        ) : activeSection === 'Intégration' ? (
          adminVersionedIntegration
        ) : activeSection === 'Synchronisations' ? (
          <div className="tenant-workspace__empty">
            <h3>Synchronisations</h3>
            <p>Cette étape préparera plus tard les mises à jour récurrentes après l’intégration des données.</p>
          </div>
        ) : (
          <div className="tenant-workspace__empty">
            <h3 className="visually-hidden">{activeSection}</h3>
            <p>Aucune donnée n’est affichée dans cette section pour le moment.</p>
          </div>
        )}
      </section>
      {chatOpen && createPortal(<TenantChatDrawer onClose={closeChat} triggerRef={chatTriggerRef} />, document.body)}
    </div>
  )
}
