# Combat Sim

Simulateur de combat pour jeux de figurines : saisissez le profil d'une attaque et celui de la cible, et obtenez instantanément les dégâts moyens, le nombre de figurines détruites, la probabilité de détruire toute l'unité et la répartition complète des résultats (10 000 tirages Monte-Carlo).

**Démo en ligne : https://sdfpapillon.github.io/combat-sim/**

![Capture d'écran](docs-desktop.png)

## Fonctionnalités

- Attaques fixes ou aléatoires (D3, D6, 2D6), seuils pour toucher et pour blesser, perforation, dégâts fixes ou aléatoires.
- Cible : nombre de figurines, points de vie, sauvegarde et sauvegarde alternative non modifiable.
- Règles spéciales : relance des 1 pour toucher, relance des blessures ratées, 6 qui blesse automatiquement, 6 qui donne une touche supplémentaire.
- Dégâts appliqués figurine par figurine (pas de report des dégâts en excès).
- Préréglages génériques et bouton « Échanger » pour inverser attaquant et cible.
- Aucun backend, ~30 ko compressés, utilisable sur téléphone.

## Lancer en local

```bash
npm install
npm run dev      # serveur de développement
npm test         # tests du moteur (Vitest)
npm run build    # version de production dans dist/
```

## Structure

- `src/engine.js` — moteur de calcul pur (probabilités, allocation des dégâts, Monte-Carlo), sans dépendance.
- `tests/engine.test.js` — tests de référence (formule exacte, perforation, dégâts sans report, précision Monte-Carlo).
- `src/App.vue` — interface (Vue 3 + Vite), histogramme en SVG fait main.
- `.github/workflows/deploy.yml` — tests puis déploiement automatique sur GitHub Pages à chaque push sur `main`.

Outil indépendant : aucun profil préenregistré, l'utilisateur saisit ses propres caractéristiques.
