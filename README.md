# Syncoria Frontend

## Configuration de l'API

Le dashboard lit l'URL de base de FastAPI depuis la variable Vite
`VITE_API_BASE_URL`. Cette variable est intégrée au bundle au moment du build :

```text
VITE_API_BASE_URL=https://api.example.com
```

Copier `.env.example` vers un fichier d'environnement Vite adapté au contexte
local ou fournir la variable lors du build. Si elle est absente, les cartes
Backend et Base de données affichent un état indisponible sans interrompre le
rendu du dashboard.

Le build Docker accepte la même valeur comme argument de build :

```text
docker build --build-arg VITE_API_BASE_URL=https://api.example.com .
```

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
actuellement les champs réels `slug`, `status` et `id`. Les sections Données,
Intégrations, Automatisations et Logs restent explicitement vides.

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
