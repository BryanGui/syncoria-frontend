import { useEffect, useState, type FormEvent } from 'react'

import {
  createTenantUser,
  fetchTenantAccess,
  fetchTenantUserAccess,
  fetchTenantUsers,
  revokeTenantUserSessions,
  updateTenantEntitlement,
  updateTenantUser,
  updateTenantUserOverride,
  type AccessPermission,
  type AccessResult,
  type Capability,
  type TenantAccess,
  type TenantRole,
  type TenantUser,
  type TenantUserAccess,
  type TenantUserStatus,
} from '../api/adminTenantAccess'
import { FormField, SelectInput, TextInput } from './ui/FormControls'
import { Panel } from './ui/Panel'

interface AdminTenantAccessProps {
  apiBaseUrl: string | null
  tenantId: string
  tenantStatus: string
  onSessionExpired: () => void
}

const permissionGroups: { title: string; items: { key: AccessPermission; label: string }[] }[] = [
  { title: 'Superset', items: [
    { key: 'analytics:view', label: 'Accéder à Superset' },
    { key: 'analytics:write', label: 'Créer / modifier les visualisations Superset' },
  ] },
  { title: 'Agent', items: [{ key: 'agent:use', label: 'Utiliser l’Agent IA' }] },
  { title: 'Administration', items: [{ key: 'access:manage', label: 'Gérer les utilisateurs et les accès' }] },
]
const roleLabels: Record<TenantRole, string> = {
  tenant_admin: 'Administrateur', member: 'Membre', viewer: 'Lecteur',
}
const statusLabels: Record<TenantUserStatus, string> = { active: 'Actif', disabled: 'Désactivé' }
const provisioningLabels = { ready: 'Prêt', pending: 'En préparation', error: 'Erreur', disabled: 'Désactivé' }

function accessSummary(access: TenantUserAccess | undefined): string {
  if (!access) return 'Indisponible'
  const labels = [
    access.permissions.some((permission) => permission.startsWith('analytics:')) ? 'Superset' : null,
    access.permissions.includes('agent:use') ? 'Agent' : null,
    access.permissions.includes('access:manage') ? 'Accès' : null,
  ].filter(Boolean)
  return labels.length ? labels.join(' · ') : 'Aucun accès'
}

export function AdminTenantAccess({ apiBaseUrl, tenantId, tenantStatus, onSessionExpired }: AdminTenantAccessProps) {
  const [tenantAccess, setTenantAccess] = useState<TenantAccess | null>(null)
  const [users, setUsers] = useState<TenantUser[]>([])
  const [accessByUser, setAccessByUser] = useState<Record<string, TenantUserAccess>>({})
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [showCreate, setShowCreate] = useState(false)
  const [login, setLogin] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [newRole, setNewRole] = useState<TenantRole>('viewer')

  const readOnly = tenantStatus !== 'active' || tenantAccess?.tenant_status !== 'active'
  const selectedUser = users.find((user) => user.id === selectedUserId)
  const selectedAccess = selectedUserId ? accessByUser[selectedUserId] : undefined

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setLoadError(false)
    setTenantAccess(null)
    setUsers([])
    setAccessByUser({})
    setSelectedUserId(null)

    void (async () => {
      const [tenantResult, usersResult] = await Promise.all([
        fetchTenantAccess(apiBaseUrl, tenantId, controller.signal),
        fetchTenantUsers(apiBaseUrl, tenantId, controller.signal),
      ])
      if (!active) return
      if (tenantResult.status === 'unauthenticated' || usersResult.status === 'unauthenticated') {
        onSessionExpired()
        return
      }
      if (tenantResult.status !== 'loaded' || usersResult.status !== 'loaded') {
        setLoadError(true)
        setLoading(false)
        return
      }
      setTenantAccess(tenantResult.data)
      setUsers(usersResult.data)
      const accessResults = await Promise.all(usersResult.data.map((user) =>
        fetchTenantUserAccess(apiBaseUrl, tenantId, user.id, controller.signal)))
      if (!active) return
      if (accessResults.some((result) => result.status === 'unauthenticated')) {
        onSessionExpired()
        return
      }
      const next: Record<string, TenantUserAccess> = {}
      accessResults.forEach((result, index) => {
        if (result.status === 'loaded') next[usersResult.data[index].id] = result.data
      })
      setAccessByUser(next)
      setLoading(false)
    })()
    return () => { active = false; controller.abort() }
  }, [apiBaseUrl, tenantId, onSessionExpired, reloadKey])

  function handleFailure<T>(result: AccessResult<T>, fallback: string): boolean {
    if (result.status === 'unauthenticated') {
      onSessionExpired()
      return true
    }
    if (result.status !== 'loaded') {
      setError(result.status === 'conflict' ? 'Cette modification est en conflit avec l’état actuel. Rechargez la page.' : fallback)
      return true
    }
    return false
  }

  async function refreshUserAccess(userId: string) {
    const result = await fetchTenantUserAccess(apiBaseUrl, tenantId, userId)
    if (result.status === 'unauthenticated') onSessionExpired()
    else if (result.status === 'loaded') setAccessByUser((current) => ({ ...current, [userId]: result.data }))
    else setError('Les permissions effectives ne peuvent pas être actualisées.')
  }

  async function toggleEntitlement(capability: Capability, enabled: boolean) {
    if (readOnly || busy) return
    setBusy(`entitlement:${capability}`)
    setError(null)
    setNotice(null)
    const result = await updateTenantEntitlement(apiBaseUrl, tenantId, capability, enabled)
    if (!handleFailure(result, 'La capacité ne peut pas être modifiée pour le moment.') && result.status === 'loaded') {
      setTenantAccess((current) => current && ({ ...current, entitlements: result.data.entitlements }))
      setNotice('Capacités de l’entreprise enregistrées.')
      await Promise.all(users.map((user) => refreshUserAccess(user.id)))
    }
    setBusy(null)
  }

  async function submitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (readOnly || busy) return
    setBusy('create')
    setError(null)
    setNotice(null)
    const result = await createTenantUser(apiBaseUrl, tenantId, {
      login: login.trim(), display_name: displayName.trim() || null, password, role: newRole,
    })
    if (!handleFailure(result, 'L’utilisateur ne peut pas être créé. Vérifiez les informations saisies.') && result.status === 'loaded') {
      setPassword('')
      setLogin('')
      setDisplayName('')
      setNewRole('viewer')
      setShowCreate(false)
      setNotice('Utilisateur ajouté.')
      const listResult = await fetchTenantUsers(apiBaseUrl, tenantId)
      if (!handleFailure(listResult, 'La liste des utilisateurs ne peut pas être actualisée.') && listResult.status === 'loaded') {
        setUsers(listResult.data)
        await refreshUserAccess(result.data.id)
        setSelectedUserId(result.data.id)
      }
    }
    setBusy(null)
  }

  async function changeUser(user: TenantUser, change: { role?: TenantRole; status?: TenantUserStatus }) {
    if (readOnly || busy) return
    setBusy(`user:${user.id}`)
    setError(null)
    setNotice(null)
    const result = await updateTenantUser(apiBaseUrl, tenantId, user.id, change)
    if (!handleFailure(result, 'L’utilisateur ne peut pas être modifié.') && result.status === 'loaded') {
      setUsers((current) => current.map((item) => item.id === user.id ? result.data : item))
      await refreshUserAccess(user.id)
      setNotice('Utilisateur mis à jour.')
    }
    setBusy(null)
  }

  async function changeOverride(userId: string, permission: AccessPermission, allowed: boolean | null) {
    if (readOnly || busy) return
    setBusy(`override:${permission}`)
    setError(null)
    setNotice(null)
    const result = await updateTenantUserOverride(apiBaseUrl, tenantId, userId, permission, allowed)
    if (!handleFailure(result, 'La règle ne peut pas être modifiée.') && result.status === 'loaded') {
      setAccessByUser((current) => ({ ...current, [userId]: result.data }))
      setNotice('Règle enregistrée.')
    }
    setBusy(null)
  }

  async function revokeSessions(userId: string) {
    if (readOnly || busy) return
    setBusy('revoke')
    setError(null)
    setNotice(null)
    const result = await revokeTenantUserSessions(apiBaseUrl, tenantId, userId)
    if (!handleFailure(result, 'Les sessions ne peuvent pas être révoquées.')) {
      setNotice('Sessions révoquées.')
      await refreshUserAccess(userId)
    }
    setBusy(null)
  }

  if (loading) return <div className="tenant-access__state" role="status">Chargement des accès…</div>
  if (loadError || !tenantAccess) return (
    <div className="tenant-access__state" role="alert">
      <p>Les accès ne peuvent pas être chargés pour le moment.</p>
      <button className="secondary-button" onClick={() => setReloadKey((key) => key + 1)} type="button">Réessayer</button>
    </div>
  )

  return (
    <div className="tenant-access">
      <div className="tenant-access__intro">
        <h3>Accès</h3>
        <p>Configurez les capacités de l’entreprise et les accès des utilisateurs.</p>
        {readOnly && <p className="tenant-access__readonly">Ce client archivé est en lecture seule.</p>}
        {error && <p className="tenant-access__error" role="alert">{error}</p>}
        {notice && <p className="tenant-access__notice" role="status">{notice}</p>}
      </div>

      <div className="tenant-access__grid">
        <Panel className="tenant-access__panel">
          <h4>Capacités de l’entreprise</h4>
          {([
            { key: 'analytics', label: 'Superset', description: 'Autorise l’accès aux visualisations et tableaux de bord Superset pour les utilisateurs habilités.' },
            { key: 'agent', label: 'Agent IA', description: 'Autorise l’utilisation de l’agent IA pour les utilisateurs habilités.' },
          ] as const).map(({ key, label, description }) => (
            <label className="tenant-access__capability" key={key}>
              <span><strong>{label}</strong><small>{description}</small></span>
              <input checked={tenantAccess.entitlements[key]} disabled={readOnly || busy !== null} onChange={(event) => void toggleEntitlement(key, event.target.checked)} type="checkbox" />
            </label>
          ))}
          {busy?.startsWith('entitlement:') && <p role="status">Enregistrement…</p>}
        </Panel>
        <Panel className="tenant-access__panel">
          <h4>Accès technique</h4>
          <dl className="tenant-access__facts">
            <div><dt>Statut</dt><dd>{provisioningLabels[tenantAccess.provisioning.status]}</dd></div>
            <div><dt>Identité PostgreSQL technique</dt><dd>{tenantAccess.provisioning.role_name ?? 'Non disponible'}</dd></div>
          </dl>
        </Panel>
      </div>

      <Panel className="tenant-access__panel tenant-access__users">
        <div className="tenant-access__section-heading">
          <h4>Utilisateurs</h4>
          <button className="primary-button" disabled={readOnly || busy !== null} onClick={() => {
            setPassword('')
            setShowCreate((value) => !value)
          }} type="button">
            {showCreate ? 'Annuler' : '+ Ajouter un utilisateur'}
          </button>
        </div>
        {showCreate && !readOnly && (
          <form className="tenant-access__create" onSubmit={(event) => void submitUser(event)}>
            <FormField htmlFor="access-login" label="Login"><TextInput autoComplete="username" id="access-login" maxLength={254} onChange={(event) => setLogin(event.target.value)} required value={login} /></FormField>
            <FormField htmlFor="access-name" label="Nom affiché (optionnel)"><TextInput id="access-name" maxLength={200} onChange={(event) => setDisplayName(event.target.value)} value={displayName} /></FormField>
            <FormField htmlFor="access-password" label="Mot de passe"><TextInput autoComplete="new-password" id="access-password" minLength={12} maxLength={1024} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></FormField>
            <FormField htmlFor="access-role" label="Rôle"><SelectInput id="access-role" onChange={(event) => setNewRole(event.target.value as TenantRole)} value={newRole}>
              {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SelectInput></FormField>
            <button className="primary-button" disabled={busy !== null} type="submit">{busy === 'create' ? 'Création…' : 'Créer l’utilisateur'}</button>
          </form>
        )}
        {users.length === 0 ? <p>Aucun utilisateur pour ce client.</p> : (
          <div className="tenant-access__table-wrap"><table className="tenant-access__table">
            <thead><tr><th>Utilisateur</th><th>Rôle</th><th>Statut</th><th>Accès effectifs</th><th>Action</th></tr></thead>
            <tbody>{users.map((user) => (
              <tr key={user.id}>
                <td><strong>{user.display_name || user.login}</strong><small>{user.login}</small></td>
                <td>{roleLabels[user.role]}</td><td>{statusLabels[user.status]}</td>
                <td>{accessSummary(accessByUser[user.id])}</td>
                <td><button className="secondary-button" onClick={() => setSelectedUserId(user.id)} type="button">Gérer</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Panel>

      {selectedUser && <Panel className="tenant-access__panel tenant-access__detail">
        <div className="tenant-access__section-heading"><h4>Gérer {selectedUser.display_name || selectedUser.login}</h4>
          <button className="secondary-button" onClick={() => setSelectedUserId(null)} type="button">Fermer</button>
        </div>
        <p>Login : {selectedUser.login} · Statut : {statusLabels[selectedUser.status]}</p>
        <div className="tenant-access__detail-actions">
          <FormField htmlFor="access-user-role" label="Rôle"><SelectInput disabled={readOnly || busy !== null} id="access-user-role" onChange={(event) => void changeUser(selectedUser, { role: event.target.value as TenantRole })} value={selectedUser.role}>
            {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </SelectInput></FormField>
          <button className="secondary-button" disabled={readOnly || busy !== null} onClick={() => void changeUser(selectedUser, { status: selectedUser.status === 'active' ? 'disabled' : 'active' })} type="button">
            {selectedUser.status === 'active' ? 'Désactiver' : 'Activer'} l’utilisateur
          </button>
          <button className="secondary-button" disabled={readOnly || busy !== null} onClick={() => void revokeSessions(selectedUser.id)} type="button">Révoquer les sessions</button>
        </div>
        {selectedAccess ? permissionGroups.map((group) => (
          <div className="tenant-access__permission-group" key={group.title}>
            <h5>{group.title}</h5>
            {group.items.map(({ key, label }) => {
              const rule = selectedAccess.overrides[key] ?? null
              const effective = selectedAccess.permissions.includes(key)
              return <div className="tenant-access__permission" key={key}>
                <div><strong>{label}</strong><small>Règle : {rule === null ? 'Hérité du rôle' : rule ? 'Autorisé' : 'Refusé'} · Effectif : {effective ? 'Oui' : 'Non'}</small></div>
                <SelectInput aria-label={`Règle : ${label}`} disabled={readOnly || busy !== null} onChange={(event) => void changeOverride(selectedUser.id, key, event.target.value === 'inherit' ? null : event.target.value === 'allow')} value={rule === null ? 'inherit' : rule ? 'allow' : 'deny'}>
                  <option value="inherit">Hérité du rôle</option><option value="allow">Autorisé</option><option value="deny">Refusé</option>
                </SelectInput>
              </div>
            })}
          </div>
        )) : <p>Permissions effectives indisponibles.</p>}
      </Panel>}
    </div>
  )
}
