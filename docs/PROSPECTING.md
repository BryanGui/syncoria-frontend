# Prospection V1 — interface opérateur (#122, #124)

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
- `src/prospecting/` : tableaux paginés, fiche entreprise, contacts et formulaires.
- `src/prospecting/ProspectingTables.tsx` : tableaux sémantiques et liens des fiches.
- `OperatorCockpit` : navigation et composition uniquement.

## Parcours et présentation

Le titre principal **PROSPECTION** apparaît uniquement dans la topbar du cockpit.
L’action **Ajouter une entreprise** précède le tableau : Entreprise, Ville,
Secteur, Statut, Source, Dernière mise à jour. Seul le nom ouvre la fiche,
directement sur **Contacts**. **Informations générales** permet de consulter et
modifier l’entreprise dans la même fiche. Les deux vues préservent les formulaires
en cours lorsqu’on passe de l’une à l’autre.

Les contacts affichent Nom, Rôle, Email, Téléphone, LinkedIn et Modifier. Le lien
LinkedIn ouvre seulement l’URL enregistrée, dans un nouvel onglet. Les tableaux
restent natifs au-dessus de 760 px ; sur mobile, leurs lignes sont empilées avec
des libellés, tout en conservant les en-têtes accessibles.

Après une création ou modification réussie, le formulaire contact se ferme,
Contacts redevient la vue active et la première page est rechargée. La réponse
confirmée du serveur apparaît en tête, sans doublon, jusqu’à la prochaine action
ou pagination. Elle reste visible même si le rafraîchissement échoue ou si cette
page ne la contient pas ; l’erreur et Réessayer restent disponibles. Un échec de
sauvegarde conserve le formulaire, toutes ses valeurs et le message d’erreur.

## Pagination et validation

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
les colonnes des tableaux, l’accès direct à Contacts, les formulaires Company/Contact,
les sauvegardes et leur rafraîchissement, les statuts manuels, les erreurs/session
expirée, la pagination, les réponses tardives et les largeurs 320/390/1024/1440 px.
`tests/browser/controlPlane.spec.ts` couvre aussi le titre unique en topbar,
la navigation et le sélecteur réel/démo. La suite Operator Chat vérifie le runtime
existant après le renommage **Assistant Syncoria**.

Captures avec API simulée, sans données de production :

- [Entreprises — desktop](screenshots/prospecting/companies-1440.png)
- [Entreprises — mobile](screenshots/prospecting/companies-390.png)
- [Contacts — desktop](screenshots/prospecting/contacts-1440.png)
- [Contacts — mobile](screenshots/prospecting/contacts-390.png)
