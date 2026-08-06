# Règles de travail Codex — frontend Syncoria

Ces règles sont permanentes et obligatoires pour toute intervention sur ce dépôt React, TypeScript et Vite.

## Avant toute modification

- Lire entièrement ce fichier `AGENTS.md`.
- Utiliser le ticket GitHub validé comme source de vérité.
- Synchroniser GitHub et le dépôt du VPS avant chaque nouvelle tâche.
- Vérifier le worktree avant toute synchronisation.
- Si des modifications locales existent, s'arrêter : ne jamais les écraser, les supprimer, les réinitialiser avec `reset` ou les placer automatiquement dans un `stash`.
- Ne jamais travailler ni committer directement sur `main`.
- Utiliser une branche dédiée pour chaque ticket.

## Périmètre et sécurité

- Respecter strictement le périmètre du ticket et ne pas inventer d'architecture.
- Ne jamais ajouter de secret, token, mot de passe ou URL sensible.
- Ne jamais afficher de secret dans les logs, les tests ou les rapports.
- Ne pas utiliser de données réelles ou sensibles dans les données de démonstration.
- React ne doit jamais accéder directement à PostgreSQL : les données métier passent toujours par FastAPI.
- Le frontend ne constitue jamais une barrière de sécurité. L'authentification, les rôles et l'isolation des tenants doivent être contrôlés par le backend.
- Ne pas modifier Caddy, les DNS, le VPS ou les conteneurs de production sans demande explicite.
- Préserver `Dockerfile` et `nginx.conf`, sauf si un ticket spécifique exige leur modification.

## Implémentation et livraison

- Privilégier de petits composants React lisibles, strictement typés et adaptés à Vite.
- Éviter les dépendances inutiles.
- Exécuter les contrôles adaptés avant livraison, notamment le build frontend, `git diff --check` et le build Docker de test lorsque le ticket le requiert.
- L'absence de `npm` sur l'hôte n'est pas un échec si l'étape Node du build Docker exécute correctement `npm ci` et `npm run build`.
- Committer et pousser uniquement après autorisation explicite.
- Ne jamais fusionner une Pull Request.
- Ne jamais déployer automatiquement après une fusion : le déploiement est une étape séparée et explicitement autorisée.
