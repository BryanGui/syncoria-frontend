# Glossaire frontend Syncoria

Ce document décrit les éléments structurants du frontend. Il reste volontairement court et doit être enrichi au fil des tickets.

## API et état des services

### `normalizeApiBaseUrl()`

- **Fichier :** `src/api/health.ts`
- **Rôle :** normaliser l’URL FastAPI fournie à Vite en supprimant les espaces et les slashs finaux.
- **Entrée / sortie :** reçoit une chaîne optionnelle et retourne une URL non vide ou `null`.
- **Dépendances :** variable `VITE_API_BASE_URL` lue par `src/App.tsx`.

### `fetchHealthStatus()`

- **Fichier :** `src/api/health.ts`
- **Rôle :** appeler un endpoint de santé FastAPI et convertir sa réponse en état exploitable par le dashboard.
- **Entrée / sortie :** reçoit l’URL API, `/health` ou `/health/db`, un signal d’annulation et des dépendances injectables ; retourne `operational` ou `unavailable`.
- **Comportement important :** une erreur HTTP, réseau ou de contrat retourne toujours `unavailable` et produit un log technique non sensible.
- **Dépendances :** `fetch`, `TechnicalLogger` et le contrat JSON `{ "status": "ok" }`.

### `useHealthStatus()`

- **Fichier :** `src/App.tsx`
- **Rôle :** gérer le cycle React de chargement d’un statut de santé.
- **Entrée / sortie :** reçoit un endpoint health et retourne successivement `loading`, puis `operational` ou `unavailable`.
- **Dépendances :** `useState`, `useEffect`, `AbortController` et `fetchHealthStatus()`.

### `HealthStatusCard()`

- **Fichier :** `src/App.tsx`
- **Rôle :** adapter un `HealthStatus` aux textes et couleurs d’une carte Backend ou Base de données.
- **Comportement important :** conserve le dashboard affichable pendant le chargement et lorsque FastAPI est indisponible.
- **Dépendances :** `useHealthStatus()` et `StatusCard()`.

### `StatusCard()`

- **Fichier :** `src/App.tsx`
- **Rôle :** composant visuel générique d’un statut système.
- **Entrée / sortie :** reçoit icône, libellé, statut, détail et tonalité ; produit une carte accessible sans appel réseau.

### `VITE_API_BASE_URL`

- **Fichiers :** `.env.example`, `Dockerfile`, `src/App.tsx`
- **Rôle :** fournir l’origine publique de FastAPI au moment du build Vite.
- **Comportement important :** son absence rend les cartes health indisponibles sans faire planter l’interface.

### Relation React, FastAPI et health

React appelle FastAPI via `VITE_API_BASE_URL`. La carte Backend utilise `GET /health` et la carte Base de données utilise `GET /health/db`. React ne contacte jamais PostgreSQL directement : FastAPI effectue le contrôle de base de données et renvoie uniquement le statut HTTP/JSON consommé par le dashboard.

## Logs techniques

### `createTechnicalLogger()` et `technicalLogger`

- **Fichier :** `src/observability/logger.ts`
- **Rôle :** centraliser les logs techniques avec les niveaux `info`, `warning` et `error`.
- **Entrée / sortie :** les méthodes reçoivent un message technique et un contexte optionnel limité ; elles produisent une entrée structurée.
- **Comportement important :** la console est utilisée uniquement en développement. Les transports injectables préparent une future destination FastAPI sans changer les appels existants.
- **Sécurité :** seuls page, action, endpoint, code HTTP et type d’erreur sont admis dans le contexte ; aucun secret, payload ou message brut d’exception ne doit être journalisé.
