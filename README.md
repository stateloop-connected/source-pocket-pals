# Pocket Pals

**A little spin. A rare little friend.**

A cherry-red capsule machine, a quiet cream canvas, and 36 tiny pixel creatures waiting to meet you. Built with React and Three.js. No coins, accounts, or backend.

[**Play Pocket Pals →**](https://tokenmaxxing-ai.github.io/pocket-pals/)

## A machine with a little personality

- Rotate a real 3D machine, tap its glass, and watch the capsules tumble.
- Turn the handle for **one or three pals**. Every result is collected automatically, including duplicates.
- Discover **four rarity tiers** and **36 alternate-color shiny forms**.
- Tap your new friend for a hop, wiggle, or spin. Browse the collection and compare its original and shiny forms.
- Optional synthesized sound, responsive layouts, and reduced-motion support.

## How to play

Choose **One pal** or **Three pals**, then click **Turn the handle** or the machine's handle. Drag the machine to rotate it; tap its globe or the shuffle button to stir the capsules. The reset button restores the camera. Open an owned collection tile for a closer look.

All draws are free. Your collection saves automatically in this browser, including repeated finds. It does not sync between devices or different website addresses. Clearing site data removes it. Existing Pocket Pals v1 saves on the same origin migrate automatically, including an unclaimed capsule.

## A little luck, explained

| Rarity | Chance per capsule |
| --- | ---: |
| Common | 60% |
| Uncommon | 26% |
| Rare | 11% |
| Legendary | 3% |

Each capsule rolls a rarity, then chooses uniformly among pals in that tier. It independently has a **1 in 16 (6.25%) chance of being shiny**, regardless of rarity. Every capsule in a three-pal turn follows the same odds. There are 36 species and 72 visual forms.

## Run locally

Use **Node.js 22.13 or newer** and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. A modern browser with WebGL gives you the interactive 3D machine; a static machine fallback remains playable if WebGL is unavailable.

```sh
npm test          # Collection logic, odds, duplicates, and save recovery
npm run check    # TypeScript
npm run build    # Static production files in dist/
npm run preview  # Preview the production build
```

## Deploy

GitHub Actions checks the source, runs the collection tests, builds the site, and publishes `main` to GitHub Pages. In the repository's **Settings → Pages**, select **GitHub Actions** as the build source. Pull requests run the same checks without publishing.

The build uses relative asset paths and can also be served from any static host. No API keys, environment variables, or server are required.

## Made with

React · Three.js · Vite · TypeScript · Lucide · Pixelify Sans

The machine geometry and its moving parts are procedural Three.js code. Creature artwork, the capsule illustration, and the fallback machine image were created with OpenAI ImageGen for this project. These are original fantasy pals, not official Pokémon sprites. See [credits](CREDITS.md).

The source code is [MIT licensed](LICENSE). Third-party assets and dependencies retain their own licenses; Pixelify Sans is bundled with its SIL Open Font License.
