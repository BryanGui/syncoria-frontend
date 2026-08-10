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
