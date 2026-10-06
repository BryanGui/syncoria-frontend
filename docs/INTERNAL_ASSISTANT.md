# Assistant interne — #195

L’entrée **Assistant Syncoria** ouvre l’espace interne `syncoria_internal` résolu
côté serveur par `GET /admin/operator-chat/internal/context`. Aucun UUID n’est
codé en dur et aucun client n’est sélectionné. Un binding absent, archivé ou
indisponible produit une erreur contrôlée avec possibilité de réessayer.
La consultation de l’Assistant reste indépendante du chargement du registre.

Le workspace existant est conservé : conversations, renommage, archives,
restauration, mémoire, flux SSE et Stop. Les opérations utilisent les routes
`/admin/operator-chat/internal/threads` et `/internal/memory`. Les UUID retournés
dans les messages et les conversations sont toujours comparés au binding reçu,
avant affichage. Les API et parsers tenant historiques restent distincts.

Un clic sur Stop avant l'acquittement du message est mémorisé puis envoyé dès que
le serveur confirme le tour. Un nouvel envoi reste bloqué jusqu'au retour de
l'annulation, pour qu'une réponse tardive ne vise pas le tour suivant. Après une
erreur d'annulation, une nouvelle tentative nécessite un clic explicite.

## Réglages de l’agent

Le panneau charge `GET /admin/operator-chat/internal/settings`. Modèles et efforts
proviennent exclusivement du catalogue connecté ; un modèle sans effort annoncé
ne peut pas être sélectionné. Astra est proposé comme choix privilégié uniquement
si le backend fournit son identifiant autorisé dans `preferred_model_id`.
Sinon le panneau affiche son indisponibilité, sans remplacer automatiquement
la configuration enregistrée. L’effort élevé est proposé seulement s’il est annoncé.

Shell, workspace et Python sont couplés. Le multi-agent dispose de son réglage
propre. Les capacités indisponibles restent visibles, tandis que l’inventaire MCP
autorisé est présenté en lecture seule. PRIVATE, la sandbox et les restrictions
réseau restent imposés côté serveur.

La section avancée expose seulement les paramètres effectivement appliqués :

- Concurrence MCP : 1–4 appels simultanés.
- Budget d’appels MCP : 1–32 appels, partagés entre agent et sous-agents ; les
  commandes natives shell/workspace ne consomment pas ce budget MCP.
- Durée maximale du traitement runtime d’un tour : 30–900 secondes.

`PUT /internal/settings` envoie `{revision, settings}`. Le reset explicite utilise
`POST /internal/settings/reset` avec `{revision}`. Après sauvegarde les réglages
s’appliquent aux prochains tours de l’Assistant interne. Un tour commencé garde
son snapshot immuable ; les profils d’audit, ingestion et conversations clientes
ne sont pas modifiés. Les bornes et supports sont vérifiés par le backend.

Une erreur conserve les choix saisis. Un conflit de révision 409 ne déclenche
aucun retry automatique : l’utilisateur recharge explicitement la configuration
enregistrée. Une session expirée retourne au parcours d’authentification.

## Diagnostic et preuves

Le diagnostic distingue configuration choisie et snapshot effectif. Les mesures
de runtime, MCP, contexte, premier événement, premier texte et réponse finale
sont des offsets depuis la requête. L’attente worker est une durée distincte.
Les métriques MCP exposent uniquement les mesures bornées autorisées : attente,
exécution du service, initialisation des connexions enfants et compteurs.
L’exécution du service comprend autorisation, accès mémoire/provider et transport ;
elle ne mesure pas isolément la durée fournisseur. Aucun argument d’outil,
credential ou événement brut n’est affiché.

Les parcours Playwright utilisent un build temporaire indépendant du `dist` servi
en production. Les captures `docs/screenshots/internal-assistant/` montrent des
catalogues et diagnostics **synthétiques** : elles ne prouvent ni disponibilité
réelle d’Astra, ni performances d’un fournisseur connecté. Les validations et
mesures réelles disponibles sont précisées dans les PR de livraison.

Commandes de validation : `npm test`, `npm run lint`, `npm run build`,
`npx playwright test tests/browser/operatorChat.spec.ts tests/browser/controlPlane.spec.ts`,
`npm run test:browser` et `git diff --check`.

Après intégration autorisée des deux PR, déployer le backend puis le frontend.
Le frontend est servi depuis le `dist` hôte monté dans Nginx. La procédure doit
conserver des dossiers publics en mode 755 et des fichiers lisibles ; elle ne doit
pas recopier le mode 700 d’un répertoire temporaire. Ce ticket n’effectue aucun
déploiement ni changement des réglages de production.
