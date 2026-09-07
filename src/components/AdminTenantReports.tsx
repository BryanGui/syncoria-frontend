import { useEffect, useRef, useState } from 'react'
import {
  archiveAdminTenantReport, buildAdminTenantReportPdfUrl, fetchAdminTenantReports,
  type AdminTenantReport, type AdminTenantReportsResult,
} from '../api/adminTenantReports'
import { formatReportDate } from '../tenantReports/model'

interface AdminTenantReportsProps {
  apiBaseUrl: string | null
  tenantId: string
  onSessionExpired: () => void
}

export function AdminTenantReports({ apiBaseUrl, tenantId, onSessionExpired }: AdminTenantReportsProps) {
  const [state, setState] = useState<AdminTenantReportsResult | { status: 'loading' }>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  const [confirmationId, setConfirmationId] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const archiveRequest = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    setConfirmationId(null)
    setPendingId(null)
    setArchiveError(null)
    void fetchAdminTenantReports(apiBaseUrl, tenantId, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.status === 'unauthenticated') onSessionExpired()
      setState(result)
    })
    return () => {
      controller.abort()
      archiveRequest.current?.abort()
    }
  }, [apiBaseUrl, tenantId, onSessionExpired, reloadKey])

  async function archiveReport(reportId: string) {
    if (archiveRequest.current && !archiveRequest.current.signal.aborted) return
    const controller = new AbortController()
    archiveRequest.current = controller
    setPendingId(reportId)
    setArchiveError(null)
    const result = await archiveAdminTenantReport(apiBaseUrl, tenantId, reportId, controller.signal)
    if (controller.signal.aborted) return
    archiveRequest.current = null
    setPendingId(null)
    if (result.status === 'unauthenticated') {
      onSessionExpired()
      setState({ status: 'unauthenticated' })
    } else if (result.status === 'archived') {
      setConfirmationId(null)
      // Refresh both sections from the backend after the durable write.
      setReloadKey((key) => key + 1)
    } else {
      setArchiveError(result.status === 'not_found'
        ? 'Ce rapport ou ce client n’est plus disponible. Rechargez les rapports.'
        : 'Le rapport n’a pas pu être archivé. Réessayez.')
    }
  }

  function renderReport(report: AdminTenantReport) {
    return (
      <article aria-label={`${report.title} — ${formatReportDate(report.report_date)}`} className="tenant-audit__report" key={report.id}>
        <h4>{report.title}</h4>
        <p>Date : <time dateTime={report.report_date}>{formatReportDate(report.report_date)}</time></p>
        <p>État : <strong>{report.status === 'archived' ? 'Archivé' : 'Terminé'}</strong></p>
        <dl>
          <div><dt>Sources analysées</dt><dd>{report.sources_analyzed}</dd></div>
          <div><dt>Sources retenues</dt><dd>{report.sources_retained}</dd></div>
          <div><dt>Sources écartées</dt><dd>{report.sources_excluded}</dd></div>
          <div><dt>Enregistrements retenus</dt><dd>{report.records_retained}</dd></div>
          {report.decisions_required !== null && <div><dt>Décisions nécessaires</dt><dd>{report.decisions_required}</dd></div>}
        </dl>
        <p>{report.status === 'archived'
          ? 'Ce rapport est conservé dans l’historique et reste consultable.'
          : 'L’état Terminé concerne l’audit, pas la validation métier ni l’intégration des données.'}</p>
        <div className="tenant-audit__actions">
          <a className="primary-button" aria-label={`Voir le rapport ${report.title} (nouvel onglet)`} href={buildAdminTenantReportPdfUrl(apiBaseUrl, tenantId, report.id)} target="_blank" rel="noreferrer">Voir le rapport</a>
          <a className="secondary-button" href={buildAdminTenantReportPdfUrl(apiBaseUrl, tenantId, report.id, true)}>Télécharger PDF</a>
          {report.status === 'completed' && (
            <button className="secondary-button" disabled={pendingId !== null} type="button" onClick={() => { setConfirmationId(report.id); setArchiveError(null) }}>Archiver</button>
          )}
        </div>
        {confirmationId === report.id && (
          <div className="tenant-audit__confirmation" role="alertdialog" aria-labelledby={`archive-${report.id}-title`} aria-describedby={`archive-${report.id}-description`}>
            <strong id={`archive-${report.id}-title`}>Archiver {report.title} du {formatReportDate(report.report_date)} ?</strong>
            <p id={`archive-${report.id}-description`}>Le rapport sera déplacé dans « Rapports archivés ». Son PDF et ses métadonnées seront conservés.</p>
            <div className="tenant-audit__actions">
              <button autoFocus className="secondary-button" disabled={pendingId !== null} onClick={() => { setConfirmationId(null); setArchiveError(null) }} type="button">Annuler</button>
              <button className="primary-button" disabled={pendingId !== null} onClick={() => void archiveReport(report.id)} type="button">{pendingId === report.id ? 'Archivage…' : 'Confirmer l’archivage'}</button>
            </div>
            {archiveError && <p role="alert">{archiveError}</p>}
          </div>
        )}
      </article>
    )
  }

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
          : (
            <>
              <section aria-label="Rapports actifs" className="tenant-audit__group">
                <h3>Rapports actifs</h3>
                {state.reports.some((report) => report.status === 'completed')
                  ? state.reports.filter((report) => report.status === 'completed').map(renderReport)
                  : <p>Aucun rapport actif.</p>}
              </section>
              <section aria-label="Rapports archivés" className="tenant-audit__group">
                <h3>Rapports archivés</h3>
                {state.reports.some((report) => report.status === 'archived')
                  ? state.reports.filter((report) => report.status === 'archived').map(renderReport)
                  : <p>Aucun rapport archivé.</p>}
              </section>
            </>
          )}
    </section>
  )
}
