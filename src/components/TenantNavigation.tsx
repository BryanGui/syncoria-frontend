import { useState, type RefObject } from 'react'

import {
  ADMIN_TENANT_GROUPS,
  type AdminTenantGroup,
  type AdminTenantWorkspaceSection,
  type TenantWorkspaceSection,
} from '../tenantWorkspace/model'

type TenantSection = TenantWorkspaceSection | AdminTenantWorkspaceSection

interface TenantNavigationProps {
  activeSection: TenantSection
  isAdmin: boolean
  onBack?: () => void
  onOpenChat: () => void
  onSelect: (section: TenantSection) => void
  tenantLabel: string
  chatTriggerRef: RefObject<HTMLButtonElement | null>
}

export function TenantNavigation({
  activeSection, isAdmin, onBack, onOpenChat, onSelect, tenantLabel, chatTriggerRef,
}: TenantNavigationProps) {
  const [openGroups, setOpenGroups] = useState<Record<AdminTenantGroup, boolean>>({
    Pipeline: true, Configuration: true, Automatisations: true,
  })
  const [mobileOpen, setMobileOpen] = useState(false)

  function select(section: TenantSection) {
    onSelect(section)
    setMobileOpen(false)
  }

  function destination(section: TenantSection, isTool = false) {
    return <button
      aria-current={activeSection === section ? 'page' : undefined}
      className={`tenant-navigation__item${activeSection === section ? ' tenant-navigation__item--active' : ''}${isTool ? ' tenant-navigation__item--tool' : ''}`}
      key={section}
      onClick={() => select(section)}
      type="button"
    >{section}</button>
  }

  return (
    <div className="tenant-navigation">
      <button
        aria-controls="tenant-navigation-links"
        aria-expanded={mobileOpen}
        className="tenant-navigation__mobile-toggle"
        onClick={() => setMobileOpen((value) => !value)}
        type="button"
      >{mobileOpen ? 'Masquer le menu du client' : 'Menu du client'}</button>
      <nav aria-label="Navigation du client" className={mobileOpen ? 'tenant-navigation__links tenant-navigation__links--open' : 'tenant-navigation__links'} id="tenant-navigation-links">
        {onBack && <button className="tenant-navigation__back" onClick={onBack} type="button">← Tous les clients</button>}
        <p className="tenant-navigation__tenant" title={tenantLabel}>{tenantLabel}</p>
        {destination('Vue générale')}
        {isAdmin && destination('Audit')}
        {isAdmin && ADMIN_TENANT_GROUPS.map((group) => (
          <div className="tenant-navigation__group" key={group.label}>
            <button
              aria-controls={`tenant-group-${group.label}`}
              aria-expanded={openGroups[group.label]}
              className={`tenant-navigation__group-toggle${group.sections.some((section) => section === activeSection) ? ' tenant-navigation__group-toggle--active' : ''}`}
              onClick={() => setOpenGroups((current) => ({ ...current, [group.label]: !current[group.label] }))}
              type="button"
            ><span>{group.label}</span><span aria-hidden="true">{openGroups[group.label] ? '⌄' : '›'}</span></button>
            <div className="tenant-navigation__group-items" hidden={!openGroups[group.label]} id={`tenant-group-${group.label}`}>
              {group.sections.map((section) => destination(section))}
            </div>
          </div>
        ))}
        {destination('Logs')}
        <div className="tenant-navigation__tools">
          <p>Outils</p>
          {destination('Superset', true)}
          <button className="tenant-navigation__item tenant-navigation__item--tool" onClick={() => {
            onOpenChat()
          }} ref={chatTriggerRef} type="button">Chat IA</button>
        </div>
      </nav>
    </div>
  )
}
