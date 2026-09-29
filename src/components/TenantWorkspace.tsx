import { useCallback, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import {
  ADMIN_TENANT_GROUPS,
  type AdminTenantWorkspaceSection,
  type TenantWorkspaceSection,
  type TenantWorkspaceTenant,
  getTenantStatusLabel,
} from '../tenantWorkspace/model'
import { TenantChatDrawer } from './TenantChatDrawer'
import { TenantNavigation } from './TenantNavigation'

type TenantSection = TenantWorkspaceSection | AdminTenantWorkspaceSection

interface TenantWorkspaceProps {
  tenant: TenantWorkspaceTenant
  tenantLabel?: string
  onBack?: () => void
  sidebarTarget?: HTMLDivElement | null
  adminReports?: ReactNode
  adminAccess?: ReactNode
  adminIntegration?: ReactNode
  adminIngestion?: ReactNode
  adminVersionedIntegration?: ReactNode
  lifecycleControls?: ReactNode
}

export function TenantWorkspace({
  adminAccess,
  adminReports,
  adminIntegration,
  adminIngestion,
  adminVersionedIntegration,
  lifecycleControls,
  tenant,
  tenantLabel,
  onBack,
  sidebarTarget,
}: TenantWorkspaceProps) {
  const [activeSection, setActiveSection] = useState<TenantSection>('Vue générale')
  const [chatOpen, setChatOpen] = useState(false)
  const chatTriggerRef = useRef<HTMLButtonElement>(null)
  const closeChat = useCallback(() => setChatOpen(false), [])
  const isAdmin = adminIntegration !== undefined
  const name = tenantLabel ?? tenant.slug
  const group = isAdmin
    ? ADMIN_TENANT_GROUPS.find((item) => item.sections.some((section) => section === activeSection))?.label
    : undefined
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
      <section aria-labelledby="tenant-workspace-title" className="tenant-workspace">
        <div className="tenant-workspace__heading">
          <div>
            <p className="tenant-workspace__breadcrumb">{isAdmin ? 'Clients / ' : ''}{name} / {group ? `${group} / ` : ''}{activeSection}</p>
            <h2 id="tenant-workspace-title">{name}</h2>
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

        {activeSection === 'Vue générale' ? (
          <div className="tenant-overview">
            <div><span>Slug</span><strong>{tenant.slug}</strong></div>
            <div><span>Statut</span><strong>{getTenantStatusLabel(tenant.status)}</strong></div>
            <div><span>Identifiant technique</span><code>{tenant.id}</code></div>
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
