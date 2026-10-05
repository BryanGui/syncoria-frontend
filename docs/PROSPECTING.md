# Prospection V1 — interface opérateur (#122)

L’entrée **Prospection** du cockpit présente les entreprises prospectées et leurs
contacts commerciaux internes. **Clients** conserve le registre des tenants
Syncoria. Aucun formulaire ni statut Prospection ne crée de tenant, workspace,
credential ou dossier client. « Converti » reste un statut commercial manuel.

La vue utilise exclusivement `/admin/prospecting/*`, avec la session admin
existante (`credentials: 'include'`). Elle reste indépendante du sélecteur
Registre réel / Démo synthétique et des erreurs du registre Clients. Aucune
fixture applicative ni substitution de données en cas d’erreur.

## Organisation

- `src/api/adminProspecting.ts` : huit opérations HTTP, validation stricte des
  réponses, vérification des IDs et du parent Contact, erreurs structurées.
- `src/prospecting/model.ts` : contrats Company/Contact et libellés des cinq statuts.
- `src/prospecting/` : liste paginée, fiche entreprise, contacts et formulaires.
- `OperatorCockpit` : navigation et composition uniquement.

Les listes demandent 25 fiches par page ; le backend ne fournit pas de total.
Le bouton Suivant peut donc mener à une dernière page vide lorsque la taille du
jeu de données est un multiple de 25. Précédent permet de revenir.

Les formulaires utilisent les champs du backend. Les limites sont 200 caractères
pour les textes courts, 320 pour l’email, 64 pour le téléphone, 2048 pour les URLs
et 4000 pour les notes. Les champs facultatifs vidés deviennent `null`. PATCH
contient seulement les champs modifiés ; sans modification, aucune écriture HTTP.

La validation serveur reste autoritaire. Les erreurs 404, 422 et 503 sont
expliquées en français ; les saisies restent disponibles après un échec de
sauvegarde. Un 401 appelle `onSessionExpired`. Les logs techniques ne contiennent
ni corps HTTP, ni coordonnées, ni noms, ni IDs des fiches. Les réponses tardives
sont ignorées après navigation ; les requêtes en attente sont annulées.

La V1 n’ajoute ni recherche globale, ni suppression, ni import/enrichissement,
ni suivi, rappel, email, IA ou conversion prospect → tenant. Les modifications
simultanées d’un même champ conservent la sémantique backend du dernier PATCH.

## Vérification locale sans déploiement

```sh
npm ci
npm test
npm run lint
npm run build
npm run test:browser
git diff --check
```

Utiliser un worktree isolé : le `dist/` du dépôt VPS partagé peut être servi par
Nginx. Le serveur Playwright construit un artefact temporaire et intercepte les
APIs ; ses données de test ne sont jamais livrées dans l’application. Aucun test
ne nécessite de lire ou d’écrire des prospects réels.

`tests/adminProspecting.test.mjs` couvre le parsing, les erreurs et les opérations
HTTP. `tests/browser/prospecting.spec.ts` couvre la distinction Clients/Prospection,
les formulaires Company/Contact, les statuts manuels, les erreurs/session expirée,
la pagination, les réponses tardives et les formats mobile/bureau.
