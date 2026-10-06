# Suivi commercial V1 (#193)

Le cockpit propose une page **Suivi** et un onglet **Suivi** dans les fiches
d'entreprise. Contacts reste la vue initiale des entreprises et les informations
générales restent accessibles. Cliquer sur une entreprise depuis Suivi ouvre
directement sa fiche sur Contacts.

La vue initiale En cours regroupe À faire et En attente. Les vues À faire,
En attente, Terminées et Toutes restent accessibles, avec filtres d'échéance,
recherche sur le titre et pagination. Les filtres s'appliquent côté serveur avant
pagination ; leur modification ramène à la première page. Tri initial : échéance
croissante, dates absentes en dernier, UUID comme départage ; le tri par dernière
modification est également disponible.

## Architecture et API

`src/followUp/` contient les composants, le modèle de présentation et les dates.
`src/api/adminFollowUp.ts` centralise les appels, la session admin, les erreurs
sanitisées et la validation des réponses. Le cockpit compose les vues ; aucune
logique HTTP n'est ajoutée dans ses composants.

Le contrat backend est défini dans
[FOLLOW_UP_WORKLIST_API.md](https://github.com/BryanGui/syncoria-backend/blob/c63d06b111226b2a00a6240211163cd42770b959/docs/FOLLOW_UP_WORKLIST_API.md),
livré dans la [PR backend #194](https://github.com/BryanGui/syncoria-backend/pull/194).
La route GET `/admin/follow-up/worklist` fournit actions, libellés autorisés,
indicateurs de retard et métadonnées de pagination. Les mutations utilisent les
routes V1 POST/PATCH `/admin/follow-up/actions[/id]`, dont les réponses de neuf
champs restent inchangées.

Depuis la page Suivi, la création choisit une entreprise dans la liste Prospection
autorisée, recherchable et paginée via le client existant. Depuis une fiche,
l'entreprise est préremplie. Aucun UUID libre ou sujet arbitraire n'est proposé.
Le sujet reste verrouillé lors de l'édition. Aucun changement automatique du
statut commercial d'une entreprise, aucune conversion en tenant.

Les formulaires modifient titre, statut, échéance et notes. PATCH ne transmet que
les champs modifiés ; notes vidées et échéance effacée deviennent null. Une
échéance inchangée garde sa précision UTC, même si le champ affiche les minutes.
Après succès, le formulaire se ferme et la liste se rafraîchit. Après échec, il
reste ouvert avec toute la saisie. Actions rapides : terminer, attendre, reprendre
ou rouvrir vers À faire. Une action terminée quitte En cours.

## Dates et accessibilité

Les dates s'affichent et se saisissent explicitement en Europe/Paris ; l'API
reçoit des instants UTC. Les conversions reposent sur les règles IANA du
navigateur. Une heure inexistante au printemps est refusée. À l'automne, le
formulaire demande de choisir l'une des deux occurrences de l'heure répétée.
Lors d'une édition, l'occurrence UTC existante reste sélectionnée.

Aujourd'hui couvre deux minuits locaux successifs, donc peut durer 23 ou 25
heures. En retard signifie échéance strictement passée et action non terminée ;
Aujourd'hui peut contenir des actions déjà en retard. Les indicateurs utilisent
l'horloge du backend et une action terminée n'affiche jamais de retard.

Les tableaux desktop deviennent des lignes lisibles sur mobile. Champs et
actions disposent de noms accessibles ; la sélection d'entreprise est utilisable
au clavier. Chargement, résultats vides et erreurs sont explicites, les requêtes
obsolètes sont abandonnées et les doubles mutations sont empêchées.

## Validation sur environnement de test

```sh
npm test
npm run lint
npm run build
npm run test:browser
git diff --check
```

Les scénarios `follow-up.spec.ts` utilisent des réponses synthétiques et
interceptent tous les appels API. `prospecting.spec.ts` couvre les régressions
entreprises/contacts. `follow-up-integration.spec.ts` exerce le véritable backend
et PostgreSQL : parcours Contacts → Suivi entreprise → création → Suivi global
→ modification échéance → terminé → Terminées → réouverture, plus création et
édition des entreprises/contacts et refus des lectures anonymes.

Les scénarios réels sont activés seulement avec :

- `SYNCORIA_FOLLOW_UP_BROWSER_API` : URL HTTP localhost/127.0.0.1, sur backend jetable.
- `SYNCORIA_FOLLOW_UP_BROWSER_DISPOSABLE=1`.
- `SYNCORIA_FOLLOW_UP_BROWSER_USERNAME` et `SYNCORIA_FOLLOW_UP_BROWSER_PASSWORD` :
  identifiants générés pour cet environnement local, fournis hors Git.
- `SYNCORIA_FOLLOW_UP_SCREENSHOTS` : dossier optionnel des captures.

Le serveur de test doit déclarer `SERVICE_NAME=syncoria-follow-up-browser-test`,
disposer des migrations jusqu'à 049, des GRANT applicatifs versionnés et du
binding interne existant. Le test vérifie ce marqueur avant toute écriture.
Le build navigateur standard est intercepté et ses requêtes sont acheminées
exclusivement vers ce serveur local ; aucune requête API de production n'est
transmise. Sans ces variables, les trois scénarios réels sont explicitement
ignorés ; le reste de la suite reste actif.

Captures issues du parcours réel sur fixtures synthétiques locales :

- [Page Suivi desktop](screenshots/follow-up-desktop.png)
- [Page Suivi mobile](screenshots/follow-up-mobile.png)
- [Onglet Suivi entreprise](screenshots/follow-up-company-desktop.png)

## Livraison

Les deux PR se réfèrent au ticket backend #193 sans le fermer automatiquement.
Le ticket ne doit être fermé qu'après leur intégration commune. Ordre de
déploiement ultérieur : migration additive 049 par le rôle administratif,
backend, contrôle health/health-db et lecture admin authentifiée, puis frontend.
Ce contrôle de production est différé et n'est pas présenté comme acquis.
Utiliser une session habituelle, sans partager cookies/tokens ni créer de
données de test en production. Aucun merge, déploiement ou redémarrage ne fait
partie de cette livraison.

La V1 ne propose ni suppression, notification, relance automatique, email ou IA.
