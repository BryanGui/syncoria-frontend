import { useState } from 'react'

import {
  ActionMenu,
  Badge,
  Button,
  EmptyState,
  FormField,
  Notification,
  Panel,
  SelectableList,
  SelectInput,
  Section,
  TextareaInput,
  TextInput,
} from './ui'

export function UiReferencePage() {
  const [selectedProvider, setSelectedProvider] = useState('notion')
  const [notification, setNotification] = useState<'success' | 'error' | 'info' | null>(null)

  return (
    <Section aria-labelledby="ui-reference-title" className="ui-reference">
      <div className="ui-reference__heading">
        <div>
          <p className="eyebrow">Socle commun</p>
          <h2 id="ui-reference-title">Bibliothèque UI</h2>
          <p>Référence visuelle des primitives réutilisables de Syncoria.</p>
        </div>
        <Badge dot tone="info">Référence</Badge>
      </div>

      <div className="ui-reference__grid">
        <Panel className="ui-reference__panel">
          <div className="ui-reference__panel-heading">
            <div>
              <h3>Actions</h3>
              <p>Une action principale, des actions secondaires discrètes.</p>
            </div>
            <ActionMenu label="Plus d’actions">
              <Button size="compact" variant="ghost">Ouvrir</Button>
              <Button size="compact" variant="ghost">Dupliquer</Button>
            </ActionMenu>
          </div>
          <div className="ui-reference__button-row">
            <Button onClick={() => setNotification('success')} variant="primary">Enregistrer</Button>
            <Button onClick={() => setNotification('info')} variant="secondary">Annuler</Button>
            <Button onClick={() => setNotification('info')} variant="ghost">Voir les détails</Button>
            <Button onClick={() => setNotification('error')} variant="danger">Archiver</Button>
            <Button disabled size="compact" variant="secondary">Désactivé</Button>
          </div>
          {notification ? (
            <div className="ui-reference__notification">
              <Notification onDismiss={() => setNotification(null)} tone={notification}>
                {notification === 'success' ? 'Les modifications ont été enregistrées.' : null}
                {notification === 'error' ? 'Cette action nécessite une confirmation.' : null}
                {notification === 'info' ? 'Information transitoire affichée.' : null}
              </Notification>
            </div>
          ) : null}
        </Panel>

        <Panel className="ui-reference__panel">
          <div className="ui-reference__panel-heading">
            <div>
              <h3>Liste de choix</h3>
              <p>Une seule surface pour plusieurs options.</p>
            </div>
            <Badge tone="success">2 disponibles</Badge>
          </div>
          <SelectableList
            ariaLabel="Provider à auditer"
            name="reference-provider"
            onChange={setSelectedProvider}
            options={[
              {
                description: 'Notion Novalia',
                status: <Badge tone="success">Auditable</Badge>,
                title: 'Notion',
                value: 'notion',
              },
              {
                description: 'novalia · n8n',
                disabled: true,
                status: <Badge tone="neutral">Non auditable</Badge>,
                title: 'n8n',
                value: 'n8n',
              },
            ]}
            selectedValue={selectedProvider}
          />
        </Panel>

        <Panel className="ui-reference__panel">
          <div className="ui-reference__panel-heading">
            <div>
              <h3>Formulaire</h3>
              <p>Labels, aide et contrôles compacts.</p>
            </div>
            <Badge tone="neutral">Standard</Badge>
          </div>
          <div className="ui-reference__form-grid">
            <FormField hint="Nom affiché dans l’espace de travail." htmlFor="reference-name" label="Nom">
              <TextInput id="reference-name" placeholder="Nom du workspace" />
            </FormField>
            <FormField htmlFor="reference-type" label="Type">
              <SelectInput defaultValue="source" id="reference-type">
                <option value="source">Source</option>
                <option value="target">Cible</option>
              </SelectInput>
            </FormField>
            <FormField htmlFor="reference-note" label="Note">
              <TextareaInput id="reference-note" placeholder="Information facultative" rows={3} />
            </FormField>
          </div>
        </Panel>

        <Panel className="ui-reference__panel ui-reference__panel--empty">
          <EmptyState title="État vide">Aucune opération récente à afficher.</EmptyState>
        </Panel>
      </div>
    </Section>
  )
}
