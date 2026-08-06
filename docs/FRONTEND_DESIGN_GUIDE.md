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
* Clients ;
* Données ;
* Synchronisations ;
* Processus.

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
