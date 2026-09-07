import { useEffect, useState } from 'react'
import {
  buildAdminTenantReportPdfUrl, fetchAdminTenantReports,
  type AdminTenantReportsResult,
} from '../api/adminTenantReports'

interface AdminTenantReportsProps {
  apiBaseUrl: string | null
  tenantId: string
  onSessionExpired: () => void
}

export function AdminTenantReports({ apiBaseUrl, tenantId, onSessionExpired }: AdminTenantReportsProps) {
  const [state, setState] = useState<AdminTenantReportsResult | { status: 'loading' }>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    void fetchAdminTenantReports(apiBaseUrl, tenantId, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.status === 'unauthenticated') onSessionExpired()
      setState(result)
    })
    return () => controller.abort()
  }, [apiBaseUrl, tenantId, onSessionExpired, reloadKey])

  return (
    <section aria-label="Audit & cartographie" className="tenant-audit">
      <h3>Audit & cartographie</h3>
      {state.status === 'loading' ? <p role="status">Chargement des rapports…</p>
        : state.status !== 'loaded' ? (
          <div role="alert">
            <p>Les rapports ne sont pas disponibles pour le moment.</p>
            <button className="secondary-button" type="button" onClick={() => setReloadKey((key) => key + 1)}>Réessayer</button>
          </div>
        ) : state.reports.length === 0 ? <p>Aucun rapport publié pour ce client.</p>
          : state.reports.map((report) => (
            <article className="tenant-audit__report" key={report.id}>
              <h4>{report.title}</h4>
              <p>État : <strong>Terminé</strong></p>
              <dl>
                <div><dt>Sources analysées</dt><dd>{report.sources_analyzed}</dd></div>
                <div><dt>Sources retenues</dt><dd>{report.sources_retained}</dd></div>
                <div><dt>Sources écartées</dt><dd>{report.sources_excluded}</dd></div>
                <div><dt>Enregistrements retenus</dt><dd>{report.records_retained}</dd></div>
                {report.decisions_required !== null && <div><dt>Décisions nécessaires</dt><dd>{report.decisions_required}</dd></div>}
              </dl>
              <p>L’audit est terminé. La validation et les étapes d’intégration restent à mener.</p>
              <div className="tenant-audit__actions">
                <a className="primary-button" href={buildAdminTenantReportPdfUrl(apiBaseUrl, tenantId, report.id)} target="_blank" rel="noreferrer">Voir le rapport <span className="tenant-audit__hint">(nouvel onglet)</span></a>
                <a className="secondary-button" href={buildAdminTenantReportPdfUrl(apiBaseUrl, tenantId, report.id, true)}>Télécharger PDF</a>
              </div>
            </article>
          ))}
    </section>
  )
}
