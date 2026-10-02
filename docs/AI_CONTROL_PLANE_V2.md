# Cockpit opérateur V2

Source fonctionnelle : [backend issue #174](https://github.com/BryanGui/syncoria-backend/issues/174).
Architecture et contrats backend : [AI_CONTROL_PLANE_V2.md](https://github.com/BryanGui/syncoria-backend/blob/feat/174-ai-control-plane/docs/AI_CONTROL_PLANE_V2.md).

Après authentification admin, Syncoria ouvre le cockpit opérateur multi-clients. Navigation : vue globale, clients, alertes/actions, historique, chat opérateur et mémoire opérationnelle. Le rôle Client AI Referent est prévu dans le contrat backend ; aucun nouvel accès client n'est accordé. Le portail client existant reste accessible.

## Provenance

`ControlPlaneProvenance` est commun à `OperatorAction` et `FleetTenant` et accepte `provider`, `syncoria`, `synthetic/demo`, comme le backend. Il décrit l'origine, sans accorder de droit ni prouver qu'un provider est connecté. Le registre conserve `syncoria` ; les fixtures conservent exclusivement `synthetic/demo`. Le mode de vue choisit toujours explicitement un dataset, sans les fusionner.

Le backend sépare `ObservabilityMetric` (mesures numériques, par exemple coûts en EUR, utilisateurs, usage en %) et `ObservabilityState` (états qualitatifs, par exemple santé dégradée ou permission nécessitant une approbation). `TenantControlPlaneSnapshot` contient `metrics` et `states` séparément et contrôle leur tenant. Aucun adapter ni transport de ces observations n'est ajouté au frontend dans ce ticket.

Le **registre réel** est la vue par défaut : session admin et `GET /admin/tenants` existants. Identité et statut des tenants sont réels. Santé IA non évaluée ; coûts, adoption, alertes, agents et historique non connectés. Une panne registre affiche une erreur/retry, jamais un fallback démo. Les tenants archivés restent identifiés et comptés.

La **démo synthétique**, choisie explicitement, utilise uniquement `src/controlPlane/fixtures.ts` : 50 entreprises fictives, 3 critiques, 7 à surveiller, 5 avec revue/formation due, 35 OK ; 15 actions en lecture seule. Tous les IDs commencent par `demo:`, provenance `synthetic/demo`, scénario daté du 1 octobre 2026. Aucun appel provider, aucune écriture, aucun utilisateur ou tenant réel créé. Les compteurs dérivent du même dataset que les fiches et actions. Les populations de licences peuvent se recouvrir ; ne pas les additionner comme des utilisateurs distincts.

Les adapters futurs remplaceront progressivement ces fixtures via des réponses backend tenant-scoped, avec provenance, couverture et date d'observation. Aucune donnée fixture ne doit rejoindre une route runtime/provider. Les signaux inconnus doivent conserver une valeur inconnue, jamais zéro ou OK.

## Chat et mémoire

Le chat propose un choix de client et le contexte de ses seules actions. Le changement de source efface la sélection. Message/envoi désactivés et libellé « Runtime non raccordé au cockpit » : aucune réponse simulée. Voir le contrat backend lié ci-dessus pour auth, scope serveur, isolation des threads, cancellation, permissions, approvals et traces sanitisées. Le runtime reste libre de composer les tools autorisés ; aucun secret au modèle.

La mémoire prépare GLOBAL (méthodes/templates/standards) et TENANT (décisions/runbooks/interventions/références documentaires). Elle n'est pas raccordée. USER est gelé ; aucune copie automatique de SharePoint/Drive/Notion.

## Legacy et analytics

« Outils existants · legacy » ouvre les anciens parcours ; « Cockpit V2 » revient au nouveau cockpit. Audit, ingestion, matching, materialization, Data Explorer, anciens endpoints et portail restent disponibles. Aucun nouveau développement sur ces axes gelés. Superset conserve ses accès existants et devient l'analytics interne du cockpit. Aucun nouveau moteur BI.

## Validation

`npm run lint`, `npx tsc -b`, `npm test`, `npm run build`, `npm run test:browser`, `git diff --check`.
La CI GitHub frontend exécute également lint, typecheck, tests Node, build et Playwright.
Les tests navigateur legacy entrent désormais explicitement par le lien legacy ; leurs assertions fonctionnelles restent conservées.

Captures générées par Playwright avec API mockée, pas de données production :

- [Vue globale](screenshots/control-plane/overview.png)
- [Fiche client](screenshots/control-plane/tenant.png)
- [Mobile](screenshots/control-plane/mobile.png)

Aucun déploiement ni changement Nginx/Docker/Caddy. La PR reste non mergée. Les builds/captures locaux permettent la revue sans remplacer la version servie sur le VPS.

## Snapshot réel du parc IA (#176)

La fiche d'un tenant actif charge
`GET /admin/control-plane/tenants/{tenant_id}/estate` avec la session admin.
Le contrat conserve les identités canoniques distinctes des comptes fournisseur,
les groupes et liens, licences, automatisations, permissions observées,
`ObservabilityMetric` et `ObservabilityState`. Aucun adapter réel n'est connecté.

La fiche affiche provenance et `observed_at` pour chaque observation. `read_at`
est la date de lecture du registre, pas une mesure de fraîcheur fournisseur.
Les listes vides restent « Non connecté / non évalué » ; une erreur reste
« Indisponible » sans fixture de secours. Les données `provider` et `syncoria`
sont admises. Un snapshot réel contenant `synthetic/demo`, un scope étranger
ou des champs imprévus est refusé dans son intégralité : aucun mélange silencieux.
La démo existante conserve ses fixtures marquées et ne sollicite pas cette API.

La navigation V2, le registre réel par défaut, le chat explicitement non raccordé
et les outils legacy restent inchangés. Les providers futurs alimenteront la
persistance backend ; la fiche ne calcule ni ROI, alertes ou santé à partir du vide.
