<p align="center">
  <img src="https://raw.githubusercontent.com/andremichelle/openDAW/refs/heads/main/packages/app/studio/public/favicon.svg" height="120"/>
  <h1 align="center">gatedDAW</h1>
</p>

<p align="center">
<a href="https://www.gnu.org/licenses/agpl-3.0.html" rel="nofollow"><img src="https://img.shields.io/badge/license-AGPLv3-blue.svg" alt="License: AGPLv3"></a>
<a href="https://github.com/jazzcat007/gatedDAW" rel="nofollow"><img src="https://img.shields.io/github/stars/jazzcat007/gatedDAW" alt="stars"></a>
</p>

**Metal-Duck Studios** — private studio, invite-only, 80s neon attitude. gatedDAW is a private fork of [openDAW](https://github.com/andremichelle/openDAW): built on its engine, but this is our lair, not the public playground.

New to the codebase? [introduction.md](introduction.md) maps every component of this repository and how they depend on
each other.

<p align="center">
<img src="https://raw.githubusercontent.com/andremichelle/openDAW/main/assets/studio-teaser.png"/>
</p>

---

## Open-Source

We are committed to transparency and community-driven development.

The source code for gatedDAW is available under **AGPL v3 (or later)**

### House Rules

**Welcome to the lair. No tourists.**

- **Invite-only** — friends and family only, no randoms
- **Server-backed tapes** — your work stays put with full history
- **Private rig** — Metal-Duck's studio, not the internet's
- **Neon attitude** — Chipmunk Punk meets Disco Duck, 80s rocker vibes only

---

## Looking for Contributors

We welcome contributions that follow the existing style and conventions of the project. Every contributor must
**understand and take responsibility for every line of code they submit**. Keep pull requests small and focused. Large
PRs will not be reviewed. Split big contributions into smaller commits that add requirements gradually and maintain
operations of the app.

If you are interested in helping, here are areas where we need support:

1. **Offline App** — e.g. wrapping gatedDAW with [Tauri](https://tauri.app/) for a native desktop experience
2. **PWA** — turning gatedDAW into a fully installable Progressive Web App with offline support
3. **Timeline Track Management** — design and UX help for track layout, ordering, grouping, and interaction

We always appreciate help on open issues: https://github.com/jazzcat007/gatedDAW/issues

---

## Credits to the openDAW Community

The following acknowledgements belong to the upstream openDAW project. They do not imply endorsement of, affiliation with, or support for gatedDAW.

Thank
you [@ccswdavidson](https://github.com/ccswdavidson), [@Chaosmeister](https://github.com/Chaosmeister), [@jeffreylouden](https://github.com/jeffreylouden), [@solsos](https://github.com/solsos), [@TheRealSyler](https://github.com/TheRealSyler), [@Trinitou](https://github.com/Trinitou),
and [@xnstad](https://github.com/xnstad) for testing the upstream openDAW repositories and installation.

Special shout-out to the biggest bug
hunters: [kanaris](https://kanaris.net/), [@Chaosmeister](https://github.com/Chaosmeister)
and [BeatMax Prediction](https://linktr.ee/beatmax_prediction). Your relentless attention to detail made a huge
difference!

Thanks to the upstream [openDAW ambassadors](https://opendaw.org/ambassadors).

## Upstream openDAW Supporters

### openDAW Visionary — $25.00

Stephen Tai, Pathfinder, One Sound Every Day (santino), kanaris, Oli Larkin, [@Robert Anthony](https://github.com/RobertAnthonyDevelopment)

### openDAW Supporter — $5.00

Cal Lycus, Jetdarc, Truls Enstad, Polarity, Ynot Etluhcs, Mats Gisselson, Ola, SKYENCE, BeatMax_Prediction, Kim T,
Nyenoidz, Steve Meiers, 4ohm, Yito, Shawn Lukas, Tommes, David Thompson, Harry Gillich, OxVolt, Wojciech Miłkowski,
skyboundzoo, JHINZ, Mark Dammer, fork-kun, Martin Eigel

---

### gatedDAW Devices

#### Stock Plugins

* Apparat (programmable instrument scripted in JavaScript)
* Arpeggio (plays the notes of a chord one after another)
* Autotune (real-time monophonic pitch correction)
* Cheap Reverb (FreeVerb variation)
* Convolver (zero-latency partitioned convolution with impulse-response samples)
* Crusher (degenerates audio signal)
* Dattorro Reverb (dense algorithmic reverb based on Dattorro's design)
* Delay (stereo delay with cross and filter options)
* Fold (waveform folding algorithm with oversampling)
* Frequency Split (splits the signal into frequency bands, each with its own effect chain)
* FX Composite (runs several effect chains in parallel and mixes them with dry/wet)
* Gate (noise gate with sidechain support)
* Maximizer (brickwall limiter with automatic makeup gain)
* MIDI Output (sends MIDI messages to other devices)
* Nano (nano sampler for a single audio file)
* Neon (phase-distortion synthesizer)
* Pitch (offsets midi note pitches)
* Playfield (sample drum computer with individual effect chains)
* Revamp (graphical equalizer with spectrum analyser)
* Soundfont (soundfont player)
* Spielwerk (programmable MIDI effect scripted in JavaScript)
* Stereo Split (processes the left and right channels through separate effect chains)
* Stereo Tool (volume, panning and invert the stereo signal)
* Tape (playback device for audio regions and clips)
* Tidal (shapes rhythm and space through volume and pan)
* Tone3000 (amplifier and effects modeling via Neural Amp Modeler)
* Vaporisateur (subtractive synth with classical waveforms)
* Velocity (manipulates velocities of incoming notes)
* Vocoder (analysis/synthesis vocoder)
* Waveshaper (nonlinear waveshaping distortion)
* Werkstatt (programmable audio effect scripted in JavaScript)
* Zeitgeist (transforms time)

#### Ported Plugins (Excluded in commercial license)

* [Compressor](https://github.com/p-hlp/CTAGDRC) (CTAG Dynamic Range Compressor)

### Repositories

* [gatedDAW](https://github.com/jazzcat007/gatedDAW)
* [openDAW-headless (SDK)](https://github.com/andremichelle/openDAW-headless)
* [openDAW-headless @naomiaro](https://github.com/naomiaro/opendaw-test) (openDAW-headless fork with more docs and
  examples)

### Roadmap

This roadmap represents an estimation of the upcoming development steps. Timelines and priorities may shift as gatedDAW
evolves.

#### 2025/Q4

- [X] Preset API
- [X] Full implementation of connecting several cloud services to store samples, projects, and presets
- [X] Implement audio playback algorithms (pitch, stretch, absolute) including interpolation

#### 2026/Q1

- [X] Fade-in and out on audio-regions
- [X] Signature automation track
- [X] Tempo automation track
- [X] Fine-tune recording including loops (takes)

#### 2026/Q2

- [X] WASM Audio-Engine
- [ ] Polish UI

#### 2026/Q3

- [ ] Testing & QA
- [ ] Reactive, mobile-ready site
- [ ] Plugin support for Reaper, Bitwig, and other DAWs
- [ ] [Launch 1.0](https://opendaw.org/release26/)

For more issues and feature requests, visit [github.com/jazzcat007/gatedDAW/issues/](https://github.com/jazzcat007/gatedDAW/issues/)

### Prepare, Clone, Installation, and Run

gatedDAW tries to avoid external libraries and frameworks. The following is a list of the external libraries we currently
use in the web studio:

* [jszip](https://www.npmjs.com/package/jszip) (for gatedDAW project bundle file)
* [markdown-it](https://www.npmjs.com/package/markdown-it) + [markdown-it-table](https://www.npmjs.com/package/markdown-it-table) (
  for help pages)
* [d3-force](https://d3js.org/d3-force) (for graph debugging)
* [soundfont2](https://github.com/Mrtenz/soundfont2) (for soundfont loading)
* [zod](https://zod.dev) (schema validation)
* [ffmpeg](https://github.com/ffmpegwasm/ffmpeg.wasm) (decoding/encoding)

Before starting, ensure you have the following installed on your system:

- [Git](https://git-scm.com/) is required for cloning the repository and managing submodules.
- [mkcert](https://github.com/FiloSottile/mkcert#installation) is required to create a certificate for developing with
  https protocol.
- [Node.js](nodejs.org) version **>= 23**. This is necessary for running the development server and installing
  dependencies.
- [Sass](https://sass-lang.com/) While Sass is handled internally during the development process, you will need to
  ensure you have the
  binaries available in your environment if used outside the build system.
- [TypeScript](https://www.typescriptlang.org/)
- [OpenSSL](https://openssl-library.org/) For generating local development certificates (), OpenSSL needs to be
  installed on
  your system. Most Linux/macOS systems have OpenSSL pre-installed.
- [Rust](https://www.rust-lang.org/tools/install) (via `rustup`, **>= 1.82**) is required to build the WASM
  audio engine (`@opendaw/studio-core-wasm`). Without it, `npm run build` / `npm run dev:studio` fails to
  resolve that package (a Vite pre-transform error), because `packages/studio/core-wasm/dist` never gets built.
  You need:
    - the `wasm32-unknown-unknown` target — `rustup target add wasm32-unknown-unknown`
    - a **nightly** toolchain with the `rust-src` component (the device crates build with `-Zbuild-std=core`) —
      `rustup toolchain install nightly && rustup component add rust-src --toolchain nightly`
- [binaryen](https://github.com/WebAssembly/binaryen) *(optional)* provides `wasm-opt`, used to size-optimise
  the WASM modules (`brew install binaryen`, or `apt install binaryen`). If it is missing, the build still
  succeeds and ships unoptimised modules.

### Clone

`git clone https://github.com/jazzcat007/gatedDAW.git && cd gatedDAW`

### Installation

* `npm run cert` (only for the very first time)
* `npm run clean` (to revert to clean slate, removes all `node_modules` and `dist` folders)
* `npm install` (for the first time and after `npm run clean`)
* `npm run build` (for the first time and after `npm run clean`)
* `npm run dev:studio` | `npm run dev:headless` (start dev server)
* Navigate to https://localhost:8080 (port is important > cors sample api)

#### Windows

* Use **Git Bash** for all `npm run` commands. The `cert` and `clean` scripts invoke `bash ./scripts/*.sh` directly.
  Git Bash is bundled with [Git for Windows](https://gitforwindows.org/).
* Install `mkcert` via `choco install mkcert` or `scoop install mkcert`, then run `mkcert -install` once to register the local CA in Windows.
* Node.js >=23 and Rust installers work natively on Windows.
* Git Bash provides `openssl.exe` used by the scripts; no separate OpenSSL install needed.
* Alternative: run the whole build inside WSL2 Ubuntu — all instructions then apply verbatim.

## Links

* [gatedDAW SDK](https://www.npmjs.com/org/opendaw)

## Contributions

### Icons

* "Wave" by Gregor Cresnar
  from [Noun Project](https://thenounproject.com/icon/wave-6250020/) (CC BY 3.0)
* "Compress" by Gregor Cresnar
  from [Noun Project](https://thenounproject.com/browse/icons/term/compress/) (CC BY 3.0)
* "Waveforms" by [Austin Andrews](https://github.com/Templarian/MaterialDesign)
* "futurism" by Martin Königsmann from [Noun Project](https://thenounproject.com/icon/futurism-4565401/)
* "tape reel" by Evgeny Filatov from [thenounproject](https://thenounproject.com/icon/tape-reel-2216293/)

## License

gatedDAW is distributed under the [AGPL v3 (or later)](https://www.gnu.org/licenses/agpl-3.0.txt). Any commercial licensing offered by the upstream project is separate and does not apply to this fork unless its copyright holder expressly agrees.



[AGPL v3 (or later)](https://www.gnu.org/licenses/agpl-3.0.txt) © 2025 André Michelle
