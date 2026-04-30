# 🚌 GoLink Simulation - Réseau de Transport Modulaire & Élastique

**GoLink Simulation** est une application web interactive développée avec **p5.js** qui modélise un réseau de transport public intelligent et autonome. Le concept repose sur une **flotte de modules de transport élastiques** capables de s'assembler (fusionner) pour former des convois en temps réel, optimisant ainsi l'énergie et la répartition des passagers, ou de se séparer pour desservir des zones moins denses.

## ✨ Fonctionnalités Clés

* 🔗 **Fusion de Modules (Convois) :** Les bus proches allant dans la même direction fusionnent automatiquement pour créer des convois. Ils optimisent les transferts internes de passagers et réduisent leur consommation énergétique de 40 %.
* 🔋 **Gestion de l'Énergie & Pannes :** Chaque module possède une batterie dynamique. En cas de panne sèche, le module s'immobilise et le réseau déploie automatiquement (ou manuellement) une **Remorqueuse** pour le ramener au dépôt.
* 🧠 **Routage Dynamique (A*) & Déviations :** Les modules utilisent l'algorithme A* pour trouver le chemin le plus court. L'utilisateur peut **cliquer sur le réseau pour fermer des routes** (travaux, accidents) ; les modules recalculeront instantanément leurs trajets.
* 🤖 **Mode Auto vs Manuel :** Laissez l'IA gérer les heures de pointe, la création de modules et le dispatch (Auto), ou prenez le contrôle total de la flotte et des apparitions de passagers (Manuel).
* 📊 **Analytique en Temps Réel :**
    * Graphique dynamique (Canvas) montrant le temps d'attente, les passagers en transit, la puissance consommée et le taux de fusion.
    * Télémétrie individuelle pour chaque module (passagers, batterie, état actuel).
* 👁️ **Vue Thermique (Heatmap) :** Une surcouche visuelle (style rayons X) permet de visualiser les zones de forte demande (hotspots) et la densité du trafic.

## 🛠️ Technologies Utilisées

* **HTML5 / CSS3** : Structure et design de l'interface (Flexbox, Grid).
* **JavaScript (Vanilla)** : Logique de la simulation, gestion des événements et algorithme A*.
* **[p5.js](https://p5js.org/)** : Moteur de rendu graphique 2D pour la grille, les véhicules et les animations (via CDN).

## 🚀 Installation & Démarrage rapide

Aucun build complexe ou installation via npm n'est requis. Le projet fonctionne de manière native dans n'importe quel navigateur moderne.

1. **Cloner le dépôt :**
   ```bash
   git clone [https://github.com/votre-nom-utilisateur/golink-simulation.git](https://github.com/votre-nom-utilisateur/golink-simulation.git)
   ```
2. **Ouvrir le projet :**
   Allez dans le dossier cloné et ouvrez simplement le fichier `index.html` dans votre navigateur web préféré.

   *Astuce :* Pour une meilleure expérience de développement, utilisez une extension comme **Live Server** sur VS Code pour recharger la page automatiquement à chaque modification.

## 🎮 Comment utiliser la simulation ?

### Le Panneau de Contrôle (Gauche)
* **Horloge & Temps :** La simulation s'écoule sur un cycle de 24h. Vous pouvez mettre en pause, ou accélérer le temps (x1, x2, x5). De 02h00 à 05h00, le réseau ferme pour recharger les modules.
* **Modes :**
    * *Manuel* : Vous devez ajouter les modules vous-même et cliquer sur "Générer passagers" pour créer de la demande.
    * *Auto* : L'IA gère l'apparition des passagers selon l'heure (Heures de pointe le matin et le soir) et génère des modules si la demande explose.
* **Flotte :** Permet d'ajouter des modules de différentes capacités (4, 6, 10 ou 12 places) au dépôt, ou de forcer le déploiement d'une remorqueuse.

### L'Interface Graphique (Centre)
* **P (Dépôt) :** Le carré gris est le garage/station de charge central.
* **Hotspots :** Les icônes colorées (Gare, Université, Centre Commercial) génèrent une forte demande.
* **Interaction :** Cliquez entre deux intersections (points noirs) pour **couper une route**. Cliquez à nouveau pour la rouvrir.

### Le Panneau de Télémétrie (Droite)
* Surveillez le **graphique d'analytique** pour observer l'efficacité de vos fusions face aux heures de pointe.
* Gardez un œil sur la **grille des modules** pour repérer les véhicules en manque de batterie (`Besoin charge` ou `IMMOBILISÉ`).
* Le **Journal du Réseau** (logs) en bas à droite vous indique en temps réel toutes les actions (embarquements, pannes, créations de modules, fermetures de routes).

## 📂 Structure des fichiers
```text
📁 golink-simulation/
├── 📄 index.html      # Structure globale de l'interface UI
├── 📄 style.css       # Mise en page, scrollbars, et design des composants
└── 📄 sketch.js       # Coeur de la simulation (Classes Bus, A*, rendu p5.js, graphiques)
```