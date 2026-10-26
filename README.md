# Syncoria Frontend

## Cockpit opérateur V2

La session admin ouvre le nouveau AI Control Plane multi-clients. [Guide et provenance](docs/AI_CONTROL_PLANE_V2.md). Les outils legacy restent disponibles depuis le cockpit. [Prospection V1](docs/PROSPECTING.md) gère séparément les entreprises prospectées et leurs contacts commerciaux, via les API admin réelles.

[Suivi commercial](docs/FOLLOW_UP.md) expose les actions FollowUp dans le cockpit et les fiches entreprises, avec filtres, recherche et échéances en Europe/Paris.


## Configuration des services à l'exécution

Les URLs publiques des services sont regroupées dans
[`public/runtime-config.json`](public/runtime-config.json). La configuration
actuelle conserve le domaine FastAPI existant :

```json
{
  "apiBaseUrl": "https://api.bryanlab.ovh"
}
```

Vite sert ce fichier en développement et le copie tel quel à la racine du build
(`dist/runtime-config.json`). Il n'est pas incorporé aux fichiers JavaScript.
`src/main.tsx` le charge avant de monter l'application, avec `cache: 'no-store'`
et un délai maximal de 10 secondes. Son chemin respecte la base de l'application
Vite, y compris pour une installation sous un sous-chemin.
`src/config/runtimeConfig.ts` valide et normalise les valeurs ;
`RuntimeConfigProvider` partage ensuite une configuration immuable avec React.
Il n'y a aucun repli vers une URL intégrée au bundle.

`apiBaseUrl` est obligatoire : URL HTTP(S) absolue, éventuellement avec un
préfixe de chemin. Les espaces autour et les slashs finaux sont supprimés ;
les identifiants dans l'URL, paramètres et fragments sont refusés. Si le fichier
est absent, inaccessible ou invalide, un message et un bouton `Réessayer`
s'affichent. Aucun appel API n'est lancé tant que la configuration n'est pas
valide. Le fichier est public : n'y placer aucun secret, mot de passe ou token.

### Inventaire des usages

L'ancienne lecture unique de `VITE_API_BASE_URL` dans `src/App.tsx` alimentait
déjà les pages et clients API par la prop `apiBaseUrl`. Désormais, le même flux
utilise la configuration d'exécution pour :

- les sessions administrateur (`/admin/session`) et client (`/auth/session`, `/me`) ;
- les statuts `/health` et `/health/db` ;
- le registre clients, les tenants, sources/providers, accès, audits et PDF,
  intégrations/DDL/modèles et ingestions via les modules de `src/api/` ;
- le cockpit opérateur, la prospection, le suivi commercial, le conseil et
  les assistants/chat, y compris les paramètres de l'agent.

Les modules consommateurs dans `src/api/` sont :

| Usage | Fichiers |
| --- | --- |
| Sessions et santé | `adminSession.ts`, `clientSession.ts`, `health.ts` |
| Clients et sources | `adminTenants.ts`, `adminTenant.ts`, `adminTenantProviders.ts` |
| Accès, audits et rapports/PDF | `adminTenantAccess.ts`, `adminTenantAudits.ts`, `adminTenantReports.ts` |
| Intégration et ingestion | `adminIntegrations.ts`, `adminTenantIngestions.ts` |
| Cockpit et conseil | `controlPlaneEstate.ts`, `advisory.ts` |
| Prospection et suivi commercial | `adminProspecting.ts`, `adminFollowUp.ts` |
| Chat et assistant interne | `operatorChat.ts`, `internalAssistant.ts` |

`App.tsx` lit la configuration pour les sessions, les connexions, la santé et le
dashboard legacy, puis conserve sa transmission aux pages `ClientsPage` et
`AdminTenantWorkspacePage`, aux composants `AdminTenant*`, au cockpit
`OperatorCockpit` et à ses vues `RealTenantEstate`, `RealTenantAdvisory`,
`RealOperatorChat`/`OperatorChat`, à `Prospecting` et à `AgentSettings`.

Les URLs n8n des providers sont des données tenant retournées ou enregistrées
via FastAPI, pas des adresses appelées directement par le navigateur.
Les liens de connexion des accès techniques (`login_url` dans
`AdvisoryCollection.tsx`, validés dans `src/api/advisory.ts`) sont également des
données propres au tenant : ils ouvrent le service concerné dans un nouvel
onglet et restent gérés par le dossier backend. Ils ne constituent pas une
configuration globale du frontend. Les liens du dossier
`src/assets/providers/SOURCES.md` documentent les assets locaux.
Les profils LinkedIn affichés par `ProspectingTables.tsx` sont des liens métier
retournés par l'API pour chaque contact ; leur domaine n'est pas configuré globalement.
Superset reste un placeholder sans URL de service. Il n'y a donc actuellement
qu'une URL globale à configurer. Pour ajouter un service appelé par le frontend,
ajouter sa clé et sa validation dans `RuntimeConfig`, puis utiliser le provider.

### Changer une URL en production sans recompiler

Après livraison de cette version, modifier uniquement la valeur `apiBaseUrl`
dans **`runtime-config.json` à la racine des fichiers statiques réellement
servis** (dans le montage VPS actuel :
`/mnt/syncoria-data/syncoria-frontend-shared/dist/runtime-config.json`). Remplacer
le fichier de façon atomique par un JSON valide pour éviter une lecture partielle.
Recharger ensuite la page : la nouvelle configuration est relue sans utiliser
le cache navigateur, avant tout appel API. Un onglet déjà ouvert conserve sa
configuration jusqu'au rechargement. Aucun rebuild ni redémarrage du serveur
statique n'est nécessaire. Vérifier dans l'onglet Réseau du navigateur la réponse
`runtime-config.json`, puis la destination des appels API. Si un cache intermédiaire
force la conservation de ce fichier, le purger également.

En développement, modifier `public/runtime-config.json`, puis recharger la page.
Conserver la configuration de chaque environnement dans la procédure de livraison :
un nouveau build recopie la valeur du fichier `public/` et peut écraser une
personnalisation faite dans `dist/`. Les anciennes valeurs `VITE_API_BASE_URL`
des fichiers `.env*` ou de l'argument Docker ne configurent plus cette URL ;
l'argument reste présent dans le Dockerfile existant, sans effet. Aucun changement de Docker,
Nginx, Caddy, DNS ou backend n'est requis par cette implémentation. Les règles
de session, de cookies et de CORS restent celles du backend.

## Session administrateur

Le frontend vérifie la session avec `GET /admin/session` avant d'afficher le
dashboard. La connexion et la déconnexion utilisent la même URL avec `POST` et
`DELETE`. Tous ces appels incluent les cookies, mais aucun mot de passe ni jeton
de session n'est enregistré dans le stockage du navigateur ou intégré au
bundle. La configuration CORS correspondante reste sous la responsabilité du
backend.

Une fois la session validée, la page `Clients` charge le registre réel avec
`GET /admin/tenants`. Elle n'affiche que l'identifiant technique, le slug et le
statut fournis par FastAPI. Une réponse 401 renvoie l'utilisateur vers l'écran
de connexion.

Chaque client ouvre ensuite un composant partagé `TenantWorkspace`, alimenté
dans le contexte administrateur par `GET /admin/tenants/{tenant_id}`. Le
composant reçoit uniquement un modèle de vue par props et ne dépend pas de la
route admin ; un futur portail client pourra donc l'alimenter avec une identité
tenant dérivée côté backend de sa propre session. Seule la Vue générale affiche
actuellement les champs réels `slug`, `status` et `id`. L'onglet Superset
affiche un placeholder de visualisation dans les espaces administrateur et
client, sans connexion à Superset. La gestion des accès est réservée à
l'administrateur Syncoria : elle lit les capacités, le provisioning et les
permissions effectives depuis les API tenant, puis permet de gérer les
utilisateurs et leurs règles individuelles. Un tenant archivé reste consultable
en lecture seule. Le portail client ne propose aucune gestion des utilisateurs.

La navigation globale de l'administration présente Vue d’ensemble et Clients.
Dans un tenant, elle devient contextuelle : Vue générale, Audit, Pipeline
(Ingestion, Intégration), Configuration (Sources, Accès), Automatisations
(Synchronisations, Workflows), Logs et Outils (Superset, Chat IA). Les groupes
sont repliables. Le Chat IA est un panneau flottant non connecté qui laisse la
section courante visible ; Superset conserve son placeholder.

## Session client

L'écran de connexion distingue explicitement l'espace client de
l'administration Syncoria. La session client est créée par
`POST /auth/session`, vérifiée par `GET /me` et révoquée par
`DELETE /auth/session`, toujours avec `credentials: include`. Aucun token ou mot
de passe n'est conservé dans le stockage navigateur.

La connexion client demande le slug de l'entreprise, l'identifiant et le mot de
passe. Le slug sert uniquement à résoudre le compte tenant-scopé lors du login ;
il ne permet aucune navigation ni sélection de tenant après authentification.

Un sélecteur visible au-dessus du formulaire distingue `Espace client` de
`Administration Syncoria`. Le mode client est sélectionné par défaut. Changer de
mode efface le mot de passe et l'erreur du formulaire précédent ; le champ
Entreprise n'est rendu que dans le formulaire client.

Le tenant client est uniquement celui retourné par `/me` : l'interface ne
propose ni liste de clients ni sélection d'un autre tenant. Elle transmet ce
modèle au même composant `TenantWorkspace` que l'adaptateur administrateur.

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

### Audit & cartographie (administration)

La fiche client admin comporte un onglet **Audit & cartographie**. Il charge
`GET /admin/tenants/{tenant_id}/reports` et présente les métadonnées publiées
par le backend, sans chiffres spécifiques à un client dans le code React.
Un catalogue vide affiche « Aucun rapport publié pour ce client ».

Le launcher utilise un sélecteur compact alimenté par les providers actifs
renvoyés par l’API. Chaque option affiche le provider et le nom de la
connexion ; celles dont `audit_supported` vaut `false` restent visibles mais
sont indisponibles. L’historique est le point d’entrée principal : chaque
ligne sépare les actions de consultation (rapport, PDF, DDL et ER) des actions
de gestion (renommage et archivage). Les artefacts DDL/ER s’ouvrent uniquement
sous la ligne de l’audit concerné. Le DDL est affiché en lecture seule et
téléchargé tel quel en `.sql`. L’ER peut être téléchargé en JSON brut ou en
Mermaid `.mmd`, généré de façon déterministe depuis `raw_er`.

« Voir le rapport » ouvre le PDF dans un nouvel onglet via
`GET /admin/tenants/{tenant_id}/reports/{report_id}/pdf`. « Télécharger PDF »
utilise la même route avec `?download=true`. Le navigateur envoie le cookie
admin HttpOnly directement à l’API ; aucun token n’est lu par le frontend.
L’API contrôle de nouveau la session et le tenant pour chaque accès, y compris
si la session expire entre le chargement de la fiche et l’ouverture du PDF.
Les erreurs de métadonnées sont génériques et peuvent être retentées.

Le compteur de décisions n’est affiché que lorsqu’il est fourni par le backend.
« Terminé » qualifie l’audit, pas l’ingestion ou la validation des règles métier.
L’espace client ne reçoit pas cet onglet. Aucun rapport, chemin filesystem ou
payload Notion n’est embarqué dans le build. Voir le ticket backend
[BryanGui/syncoria-backend#56](https://github.com/BryanGui/syncoria-backend/issues/56)
et `docs/AUDIT_REPORT_STANDARD.md` dans le dépôt backend pour la publication.

### Rapports datés et archivage (#58)

L’onglet audit affiche `report_date` (ISO côté API) en `JJ/MM/AAAA`, sans
conversion de fuseau horaire. Plusieurs rapports du même provider peuvent
coexister. Les sections « Rapports actifs » et « Rapports archivés » sont triées
par date décroissante puis ID décroissant pour départager les dates identiques.

« Archiver » ouvre une confirmation avec la date du rapport. Annuler n’effectue
aucun appel d’écriture ; confirmer appelle
`POST /admin/tenants/{tenant_id}/reports/{report_id}/archive`, puis recharge la
liste. Les erreurs restent génériques et une session expirée renvoie à la
connexion. Les rapports archivés gardent leurs liens de consultation et de
téléchargement. Aucun fichier ni catalogue n’est écrit par le frontend.

Les corrections d’alignement, hauteur et padding sont limitées aux actions de
l’onglet audit. Sur mobile, les boutons prennent toute la largeur. Les styles
globaux des autres écrans restent inchangés.

Validation :

```sh
npm ci
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:browser
git diff --check
```

`@playwright/test` est une dépendance de développement nécessaire aux tests
réels du centrage desktop/mobile, de la confirmation, du déplacement vers les
archives et du téléchargement. Aucun code Playwright n’entre dans le bundle.
Les tests servent le build localement et interceptent toutes les requêtes API
avec des données synthétiques ; aucun appel n’atteint la production. Les
résultats et captures sont ignorés par Git. Les dépendances système Chromium
peuvent être installées dans un conteneur de test isolé avec
`npx playwright install --with-deps chromium`.

Les modifications package.json/package-lock.json ajoutent uniquement cet outil
de test et le script `test:browser` ; aucune dépendance applicative n’est mise à
jour. Le backend #58 et sa migration 014 sont requis avant activation de l’UI.
