# Guidelines UI Syncoria

Ce document est la référence du socle UI commun. Les écrans métier doivent
réutiliser les primitives existantes avant de créer une variante locale.

## Principes

Syncoria est un outil B2B/data utilisé sur de longues périodes. L’interface
reste sobre, lisible et dense sans être tassée : le contenu domine, la couleur
est parcimonieuse et les bordures structurent les surfaces.

Une page privilégie une liste ou un tableau à une multiplication de cartes.
Les cartes imbriquées, les ombres décoratives, les dégradés, le glassmorphism
et les animations décoratives sont à éviter.

## Tokens

Les tokens sont définis dans `src/index.css`.

- Espacements : `--space-1` à `--space-6` : 4, 8, 12, 16, 24 et 32 px.
- Rayons : `--radius-small`, `--radius-medium` et `--radius-large`.
- Contrôles : `--control-height-compact` et `--control-height-standard`.
- Couleurs : background, surface, textes, bordures, accent et états sémantiques
  succès, avertissement, erreur et information.

L’accent `--color-accent` est réservé aux actions importantes et aux états
actifs. Le bleu n’est pas une couleur générique d’action.

## Primitives

Les composants se trouvent dans `src/components/ui` :

- `Button` : `primary`, `secondary`, `ghost`, `danger`, avec tailles compact et
  standard, focus, disabled et loading ;
- `Panel`, `Section` et `EmptyState` : surfaces limitées et états vides ;
- `SelectableList` : une seule surface avec lignes sélectionnables, radio ou
  checkbox, description, statut, hover, sélection, disabled et focus ;
- `FormField`, `TextInput`, `SelectInput` et `TextareaInput` : labels, aide,
  erreurs, focus et contrôles de hauteur cohérente ;
- `Badge` : petit indicateur de statut, jamais utilisé comme bouton ;
- `Notification` : succès, erreur ou information, avec `role` accessible et
  disparition automatique configurable ;
- `ActionMenu` : menu natif léger pour les actions secondaires.

## Règles d’utilisation

Une zone ne doit avoir qu’une action visuellement forte lorsque c’est possible.
Les actions secondaires utilisent `secondary` ou `ghost`. `danger` est réservé
à une action destructive réelle.

Une liste de choix doit utiliser `SelectableList` au lieu d’une carte par
option. Une erreur de chargement qui empêche la page de fonctionner reste un
état persistant avec une action `Réessayer`; une erreur ponctuelle d’action est
une notification transitoire.

## Responsive et accessibilité

Le desktop est prioritaire, mais les primitives doivent rester utilisables sur
tablette et viewport mobile. Les contrôles ont un focus-visible explicite, les
états ne reposent pas uniquement sur la couleur et les composants interactifs
sont utilisables au clavier.

## Règle obligatoire

> Une page ne doit pas créer sa propre couleur, taille de bouton, rayon ou
> pattern de notification lorsqu’une primitive commune existe déjà.
