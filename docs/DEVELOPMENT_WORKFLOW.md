# Cycle de développement du frontend Syncoria

Ce document décrit le cycle obligatoire du frontend React, TypeScript et Vite de Syncoria. Le ticket GitHub validé reste la source de vérité pour le périmètre et les critères d'acceptation.

## Cycle de travail

```text
Besoin
→ ticket GitHub validé
→ synchronisation VPS/GitHub
→ branche dédiée
→ travail Codex
→ vérifications
→ autorisation de commit
→ commit et push
→ Pull Request
→ revue GPT
→ validation Bryan
→ fusion
→ déploiement séparé
```

Chaque étape est distincte. La validation d'une Pull Request n'autorise pas implicitement sa fusion, et une fusion n'autorise jamais automatiquement un déploiement.

## Responsabilités

### Bryan

- Formalise ou valide le besoin et le ticket GitHub.
- Donne l'autorisation explicite de commit et de push après les vérifications.
- Examine les résultats, arbitre les choix et donne la validation humaine finale.
- Autorise séparément la fusion puis, le cas échéant, le déploiement.

### GPT

- Effectue la revue de la Pull Request par rapport au ticket et aux règles du dépôt.
- Signale les écarts de périmètre, les risques, les défauts de typage et les vérifications manquantes.
- Propose des corrections sans fusionner ni déployer.

### Codex

- Lit entièrement `AGENTS.md` avant toute modification.
- Synchronise le dépôt, vérifie le worktree et travaille uniquement sur la branche dédiée au ticket.
- Implémente strictement le périmètre validé avec des composants React lisibles et typés, sans dépendance superflue.
- Exécute les contrôles adaptés et en restitue les résultats.
- Attend l'autorisation explicite avant le commit et le push.
- Ne fusionne aucune Pull Request et ne déclenche aucun déploiement automatique.

### GitHub

- Héberge les tickets qui définissent le travail validé et traçable.
- Centralise les branches, commits, Pull Requests et résultats de revue.
- Conserve la séparation entre la branche de travail et `main` jusqu'à la validation humaine.

## Synchronisation obligatoire

Avant toute nouvelle tâche, exécuter depuis le VPS :

```bash
cd /mnt/syncoria-data/syncoria-frontend-shared
git status --short --branch
git remote -v
git fetch origin --prune
git switch main
git pull --ff-only origin main
git rev-parse main
git rev-parse origin/main
```

Le worktree doit être propre avant la synchronisation. S'il contient des modifications locales, arrêter le travail sans `reset`, `stash`, suppression ni écrasement automatique.

Les SHA retournés par `git rev-parse main` et `git rev-parse origin/main` doivent être identiques avant de créer une branche dédiée depuis `origin/main`. Le travail et les commits directs sur `main` sont interdits.

## Implémentation frontend

Le ticket détermine les fichiers et comportements autorisés. Codex ne doit pas inventer d'architecture ou étendre le périmètre. Les composants doivent rester petits, lisibles et strictement typés ; les dépendances inutiles sont à éviter.

Le navigateur ne doit contenir aucun secret ni accéder directement à PostgreSQL. Les données métier transitent par l'API FastAPI, tandis que l'authentification, les rôles et l'isolation des tenants sont imposés côté backend. L'interface React n'est jamais considérée comme une barrière de sécurité.

## Vérifications et livraison

Les contrôles sont adaptés au ticket et incluent normalement :

```bash
npm run build
git diff --check
docker build -t syncoria-frontend-shared:test /mnt/syncoria-data/syncoria-frontend-shared
```

Si `npm` n'est pas disponible sur l'hôte, ce seul fait n'est pas un échec lorsque le build Docker exécute avec succès `npm ci` et `npm run build` dans son étape Node.

Après présentation des résultats, Codex attend l'autorisation explicite de Bryan avant de committer et pousser. Une Pull Request est ensuite ouverte vers `main` et soumise à la revue GPT puis à la validation de Bryan. La fusion et le déploiement sont deux décisions humaines séparées.
