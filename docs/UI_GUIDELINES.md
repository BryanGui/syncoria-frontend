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

### Alignement et densité des actions

Une zone fonctionnelle ne doit généralement exposer qu’une seule action
visuellement principale.

Exemples acceptés :

- `Créer` puis `Modifier` et `Plus ▾` ;
- `Ouvrir` puis `Télécharger ▾`.

Les actions secondaires utilisent `ghost`, un lien texte, un menu ou un menu
contextuel. Elles sont regroupées lorsqu’elles appartiennent au même contexte.
Il ne faut pas afficher toutes les variantes de `Button` simultanément dans une
zone métier.

Toutes les actions d’une zone partagent une ligne de référence cohérente. Dans
un header, le titre et la description restent alignés à gauche, tandis que les
actions réellement rattachées au même niveau sont alignées à droite, avec une
hauteur, une baseline et un espacement cohérents. Un badge ne doit pas être
placé à droite uniquement parce qu’il reste de l’espace.

Les actions ne doivent jamais dominer le contenu. Préférer la typographie,
l’espace et un séparateur léger à l’ajout de boutons, badges ou surfaces pour
fabriquer artificiellement une hiérarchie.

Un badge indique uniquement un état utile à la compréhension ou à l’action :
`Actif`, `Archivé`, `Erreur`, `Auditable`, `Sélectionné`, `Source` ou `Importé`.
Il ne sert pas de titre secondaire, de décoration, de libellé `Standard` ou
`Référence` sans utilité métier, ni de compteur décoratif.

Un panel correspond à une vraie unité fonctionnelle. Deux panels côte à côte
doivent avoir une raison fonctionnelle et une densité comparable. Un
`EmptyState` reste compact sauf si le contexte métier justifie réellement une
zone plus grande ; il ne doit pas créer un panel vide surdimensionné.

Le fait qu’une primitive UI existe ne justifie pas son affichage. Chaque bouton,
badge, panel ou menu visible doit correspondre à un besoin fonctionnel
identifiable.

Avant de livrer une page, vérifier les alignements horizontalement et
verticalement à l’échelle de la zone entière, pas uniquement composant par
composant.

Une liste de choix doit utiliser `SelectableList` au lieu d’une carte par
option. Une erreur de chargement qui empêche la page de fonctionner reste un
état persistant avec une action `Réessayer`; une erreur ponctuelle d’action est
une notification transitoire.

Les boutons `compact` mesurent 32 px et les contrôles `standard` 36 px. Les
inputs et selects suivent la hauteur standard. Un déclencheur de menu placé à
côté de boutons partage leur hauteur, leur rayon logique et leur espacement.
Les marges arbitraires ne doivent pas corriger un mauvais alignement.

La grille d’un écran métier ne doit pas être créée pour exposer plusieurs
composants. Chaque colonne doit correspondre à une unité utile et les contenus
doivent rester équilibrés.

## Responsive et accessibilité

Le desktop est prioritaire, mais les primitives doivent rester utilisables sur
tablette et viewport mobile. Les contrôles ont un focus-visible explicite, les
états ne reposent pas uniquement sur la couleur et les composants interactifs
sont utilisables au clavier.

## Règle obligatoire

> Une page ne doit pas créer sa propre couleur, taille de bouton, rayon ou
> pattern de notification lorsqu’une primitive commune existe déjà.
