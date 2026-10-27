# Règles de travail Codex — frontend Syncoria

Ces règles sont permanentes pour toute intervention sur ce dépôt React / TypeScript / Vite.

## 1. Source de vérité

- Lire `AGENTS.md` avant toute modification.
- Le ticket GitHub validé définit l'objectif, le périmètre et les critères d'acceptation.
- Ne pas élargir le ticket sans demande explicite.

## 2. Avant de travailler

- Vérifier que le worktree est propre.
- Si des modifications locales ou fichiers non suivis risquent d'être écrasés ou mélangés au ticket, s'arrêter et les signaler.
- Synchroniser `main` avec `origin/main`.
- Créer une branche dédiée au ticket.
- Ne jamais développer ni committer directement sur `main`.

## 3. Architecture et sécurité

- React ne doit jamais accéder directement à PostgreSQL : les données passent par FastAPI.
- Le frontend n'est jamais une barrière de sécurité ; authentification, rôles et isolation des tenants sont contrôlés côté backend.
- Ne jamais ajouter de secret, token, mot de passe ou donnée sensible dans le code, les tests, les logs ou la documentation.
- Ne pas utiliser de données réelles sensibles comme données de démonstration.
- Préserver `Dockerfile` et `nginx.conf` sauf si le ticket exige leur modification.
- Ne pas modifier Caddy, DNS ou PostgreSQL sans instruction explicite.

## 4. Implémentation

- Privilégier des composants petits, lisibles et strictement typés.
- Éviter les dépendances inutiles.
- Mettre à jour la documentation concernée lorsqu'un changement fonctionnel ou architectural le nécessite.

## 5. Workflow normal — « fais le ticket »

Quand la tâche est claire, Codex exécute le cycle complet sans demander des validations intermédiaires :

1. partir de `main` à jour ;
2. créer la branche du ticket ;
3. développer ;
4. exécuter les tests, le lint, le build et `git diff --check` pertinents ;
5. commit ;
6. push de la branche ;
7. créer la Pull Request vers `main` ;
8. si une validation navigateur est utile, construire la branche dans le `dist/` monté par Nginx afin que `app.bryanlab.ovh` affiche la version de validation ;
9. vérifier que le frontend répond correctement ;
10. s'arrêter avant le merge.

Le commit, le push, la création de PR et la mise en validation font partie du cycle normal et ne nécessitent pas d'autorisation séparée.

La PR constitue le rapport de livraison. Ne pas maintenir `.codex/LAST_REPORT.md` sauf demande explicite d'un ticket.

## 6. Workflow final — « merge le ticket »

Uniquement après cette instruction explicite :

1. merger la PR dans `main` ;
2. remettre le dépôt VPS sur `main` ;
3. récupérer `origin/main` avec un fast-forward ;
4. reconstruire `dist/` avec la configuration attendue, notamment `VITE_API_BASE_URL` ;
5. vérifier `https://app.bryanlab.ovh` et les appels API concernés ;
6. confirmer que GitHub `main`, le dépôt VPS et le `dist/` servi sont cohérents ;
7. fermer le ticket si la PR ne l'a pas déjà fait.

## 7. Interdictions

- Aucun merge automatique à la fin du développement.
- Aucun force-push ou réécriture d'historique sans demande explicite.
- Ne jamais supprimer ou stasher automatiquement du travail local existant.
- Ne jamais inclure automatiquement des fichiers non suivis sans rapport avec le ticket.
- Ne jamais effectuer d'opération destructive sur l'infrastructure ou les données.

## 8. Quand s'arrêter

Codex ne doit interrompre le cycle normal que si :

- le worktree contient un travail local incompatible avec la tâche ;
- l'architecture demandée est réellement ambiguë ;
- une perte de données est possible ;
- des secrets ou permissions sont nécessaires ;
- une modification Caddy/DNS/PostgreSQL non prévue est requise ;
- la demande entre en conflit avec ces règles.

## 9. Organisation des espaces de travail Codex sur le VPS

Sur le VPS `scw-apps-01`, la racine `/mnt/syncoria-data` est réservée aux services et aux données persistantes. Ne jamais y créer directement de worktree, clone, environnement virtuel, cache, dossier de test ou de validation.

Pour toute **nouvelle** intervention, isoler les ressources par dépôt (`syncoria-backend` ou `syncoria-frontend`) et par ticket ou sujet :

- Worktrees Git : `/mnt/syncoria-data/worktrees/codex/<depot>/<ticket>/`
- Temporaires, caches et environnements de test éphémères : `/mnt/syncoria-data/tmp/codex/<depot>/<ticket>/`
- Rapports, captures et autres résultats de validation à conserver : `/mnt/syncoria-data/artifacts/codex/<depot>/<ticket>/`

Les tests et fixtures faisant partie du code versionné restent dans le dépôt correspondant. Ne pas déplacer les sources ni les services de production pour respecter cette organisation.

Avant toute création, vérifier qu'un chemin n'est pas déjà utilisé. En fin d'intervention, conserver les rapports utiles et nettoyer uniquement les fichiers temporaires créés pour la tâche, après vérification qu'ils ne servent plus. Ne jamais supprimer ni écraser du travail local, un worktree non intégré ou des fichiers d'une autre tâche. Manipuler les worktrees avec `git worktree` plutôt qu'avec une suppression ou un déplacement manuel. Les anciens emplacements ne doivent pas être migrés ou supprimés automatiquement.

Cette organisation ne donne aucune autorisation supplémentaire de modifier, redémarrer ou déployer les services de production.

## 10. Isolation des tests Docker de Codex

Le moteur Docker de `scw-apps-01` héberge les services partagés. Il **n'est pas** un bac à sable de développement. Un conteneur isolé ne garantit pas un moteur Docker indépendant ; en particulier, l'accès au socket Docker du VPS donne accès à son moteur et à ses ressources.

- **Par défaut, ne pas exécuter** de `docker build`, `docker compose build`, création d'images taguées `ticket-*` / `*-test`, ni lancement de conteneurs de tests sur le moteur Docker du VPS.
- Pour les tests nécessitant Docker, utiliser un runner CI, une VM ou un sandbox **réellement séparé**, doté de son propre moteur Docker. Ne pas y monter le socket Docker du VPS.
- Si aucun environnement isolé n'est disponible, exécuter les tests ne nécessitant pas Docker et signaler le blocage ; **ne pas** utiliser le moteur Docker de production en solution de repli.
- Une validation nécessitant une construction d'image ou un conteneur sur le VPS demande une autorisation explicite préalable, même si le workflow habituel prévoit une validation du ticket. Les opérations de déploiement expressément autorisées restent possibles et doivent viser uniquement les services concernés.
- Ne jamais lancer `docker system prune`, `docker image prune -a` ou une suppression globale sur le moteur partagé. Ne jamais supprimer d'image ni de conteneur non créé pour la tâche ; tout nettoyage sur le moteur du VPS requiert une vérification des usages et une autorisation explicite.
- Les tests Python/Node ne nécessitant pas Docker utilisent les espaces temporaires dédiés décrits dans la section précédente.

Ces règles ne créent pas de sandbox : elles définissent la politique à appliquer tant qu'un environnement de test isolé n'a pas été configuré.
