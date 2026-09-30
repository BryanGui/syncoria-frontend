# Guide visuel du frontend Syncoria

Ce document définit la base visuelle du frontend Syncoria.

Tout agent Codex doit le lire avant de créer ou modifier une interface.

## 1. Direction générale

L’interface Syncoria doit être :

* claire ;
* sobre ;
* professionnelle ;
* lisible pendant de longues périodes ;
* peu fatigante pour les yeux ;
* sans effets visuels inutiles ;
* sans apparence de template SaaS générique.

L’interface doit privilégier la lisibilité, la hiérarchie de l’information et la simplicité.

## 2. Palette principale

```css
--color-background: #F5F7FA;
--color-surface: #FFFFFF;

--color-text-primary: #1F2937;
--color-text-body: #374151;
--color-text-secondary: #5B6472;

--color-border: #E5E7EB;
```

Utilisation :

* `#F5F7FA` : fond général de l’application ;
* `#FFFFFF` : cartes, panneaux et zones de contenu ;
* `#1F2937` : titres principaux ;
* `#374151` : texte courant ;
* `#5B6472` : texte secondaire ;
* `#E5E7EB` : bordures et séparateurs légers.

Ne pas utiliser du noir pur `#000000` pour le texte courant.

Ne pas utiliser du blanc pur comme fond général de toute l’interface.

## 3. Couleur d’accent

La couleur principale de Syncoria sera définie séparément.

En attendant :

* ne pas inventer de couleur de marque ;
* utiliser une couleur d’accent uniquement lorsqu’elle est nécessaire ;
* ne pas appliquer une couleur forte sur de grandes surfaces ;
* conserver une interface majoritairement neutre.

## 4. Structure générale

La structure principale doit comprendre :

```text
Barre latérale
+
Zone principale
```

La barre latérale doit rester claire ou légèrement différenciée du fond général.

Elle doit contenir :

* le nom Syncoria ;
* Vue d’ensemble ;
* Clients.

Dans un tenant, la barre latérale devient contextuelle : retour à la liste,
nom du client, destinations directes, groupes repliables Pipeline,
Configuration et Automatisations, puis une zone Outils commune à Superset et
Chat IA. Sur petit écran, son menu peut être replié.

La zone principale doit contenir :

* le titre de la page ;
* le contexte ou le client sélectionné ;
* les informations importantes ;
* les actions utiles ;
* les cartes ou tableaux nécessaires.

## 5. Cartes et panneaux

Les cartes doivent utiliser :

* un fond blanc ;
* une bordure légère ;
* des coins légèrement arrondis ;
* peu ou pas d’ombre ;
* un espacement intérieur confortable.

Éviter :

* les ombres fortes ;
* les bordures épaisses ;
* les dégradés décoratifs ;
* les effets de verre ;
* les animations inutiles.

## 6. Typographie

Utiliser une police sans serif simple et lisible.

La hiérarchie doit rester claire :

```text
Titre de page
Titre de section
Texte principal
Texte secondaire
Libellé
```

Éviter :

* les textes trop petits ;
* les titres démesurés ;
* les textes entièrement en majuscules ;
* les contrastes trop faibles.

## 7. Espacement

Utiliser des espacements réguliers.

Base recommandée :

```text
4 px
8 px
12 px
16 px
24 px
32 px
```

Les éléments ne doivent jamais être collés les uns aux autres.

Les pages doivent conserver suffisamment d’espace vide pour faciliter la lecture.

## 8. États et statuts

Les statuts doivent être compréhensibles sans dépendre uniquement de la couleur.

Exemple :

```text
Opérationnel
Attention
Erreur
Inactif
En cours
```

Chaque statut doit utiliser :

* un texte explicite ;
* éventuellement une icône ;
* une couleur discrète et cohérente.

## 9. Responsive

La première priorité est l’utilisation sur ordinateur.

L’interface doit également rester utilisable sur tablette.

La version mobile complète sera traitée séparément.

## 10. Règles permanentes

Codex doit :

* respecter cette palette ;
* conserver une interface claire ;
* privilégier la lisibilité ;
* éviter les dépendances visuelles inutiles ;
* ne pas introduire une nouvelle couleur ou un nouveau style sans justification ;
* réutiliser les composants existants ;
* garder les composants petits et lisibles ;
* ne jamais placer de données sensibles dans l’interface ou les données de démonstration.

## 11. Principe directeur

L’interface Syncoria doit donner l’impression d’un outil professionnel, stable et compréhensible.

Elle ne doit pas chercher à impressionner par des effets visuels.

Elle doit permettre de comprendre rapidement :

* l’état du système ;
* les clients ;
* les données ;
* les synchronisations ;
* les processus ;
* les actions à effectuer.

## 12. Vue générale et Sources

Ces deux écrans utilisent localement un fond `#F5F7FB`, une surface blanche, un texte `#142033` et un accent bleu `#0284C7`. Leurs styles ne remplacent pas les tokens des autres écrans.

Vue générale présente les providers réellement retournés par l’API en capsules horizontales, sans nom de connexion ni KPI inventé. Les informations techniques sont secondaires et repliables. Sources conserve une ligne par connexion, les détails dépliables et les actions existantes. La destination Sources active dans la sidebar utilise le même bleu.

Dans le workspace tenant, le nom du client figure au-dessus de la carte de contenu, à gauche du bouton global de déconnexion sur ordinateur. Les sections n'affichent pas de breadcrumb ni de badge de statut dans leur en-tête. Les contrôles d'archivage et de réactivation restent dans Vue générale. Toutes les destinations sélectionnées de la sidebar partagent l'état actif bleu de Sources ; les groupes parents reçoivent un accent plus discret.

## 13. Typographie

Geist Variable est la police principale. Son fichier variable est fourni par `@fontsource-variable/geist` et chargé localement par Vite, sans CDN. Conserver les polices monospace pour le code et les données techniques.

Utiliser 400 pour le texte courant et secondaire, 500 pour les libellés, statuts, boutons et liens de navigation, et 600 pour les titres, marques, groupes de navigation et accents actifs. Éviter les graisses 700 et supérieures dans l'interface.
