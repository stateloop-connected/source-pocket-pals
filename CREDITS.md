# Pocket Pals credits

## Machine and motion

The interactive machine is original procedural geometry built with [Three.js](https://threejs.org/). Its enamel shell, glass chamber, handle, door, metal details, and individual capsules are assembled in `app/gumball/machine-model.ts`. Camera controls, capsule collisions, and motion are implemented in `app/gumball/machine-scene.ts`.

The machine uses Three.js's bundled `RoomEnvironment` for lighting and `OrbitControls` for camera input. Three.js is MIT licensed.

## Pixel artwork

The 36 original fantasy creatures, capsule illustration, and fallback machine illustration were generated for Pocket Pals with OpenAI ImageGen. Creature sprites use individually measured crops of the bundled sprite sheet. Shiny forms apply alternate palettes and additional effects in the application.

This is an independent project and is not affiliated with Pokémon, Nintendo, Game Freak, or The Pokémon Company. No official Pokémon sprites are included.

## Typography, icons, and audio

[Pixelify Sans](https://github.com/google/fonts/tree/main/ofl/pixelifysans) is by the Pixelify Sans Project Authors and is distributed under the SIL Open Font License 1.1. The unmodified font and its license are bundled in `public/pixel/`.

- [Font project](https://github.com/eifetx/Pixelify-Sans)
- [Bundled font license](public/pixel/OFL.txt)
- [Lucide icons](https://lucide.dev/) — ISC license

Optional sounds are synthesized locally with the Web Audio API. No external audio samples are used.

## Software

The project source code is MIT licensed. [React](https://react.dev/), [Vite](https://vite.dev/), [TypeScript](https://www.typescriptlang.org/), and their dependencies retain their respective licenses. The source-code license does not replace the bundled font license or third-party dependency licenses.
