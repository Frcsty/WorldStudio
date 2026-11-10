# Third-party notices

World Studio is MIT licensed (see `LICENSE`). It builds on the following projects, each under its own license.

## Bundled in the desktop app

| Component | License | Use |
| --- | --- | --- |
| [Electron](https://github.com/electron/electron) | MIT | Desktop shell. Chromium's licenses ship as `LICENSES.chromium.html` in every package. |
| OpenJDK runtime (produced by `jlink`) | GPL-2.0 with the Classpath Exception | Runs the local host and compiles codec plugins. Full texts are in `resources/studio/runtime/legal/`. |
| [Gson](https://github.com/google/gson) | Apache-2.0 | JSON in the Java host. |
| [React](https://github.com/facebook/react) | MIT | User interface. |
| [three.js](https://github.com/mrdoob/three.js) | MIT | 3D viewport, model export, Blockbench conversion maths. |
| [deepslate](https://github.com/misode/deepslate) | MIT | Minecraft block model meshing. |
| [gl-matrix](https://github.com/toji/gl-matrix) | MIT | Used by deepslate. |
| [pako](https://github.com/nodeca/pako) | MIT and Zlib | Used by deepslate. |
| [md5](https://github.com/pvorb/node-md5), charenc, crypt | BSD-3-Clause | Used by deepslate. |
| [is-buffer](https://github.com/feross/is-buffer) | MIT | Used by md5. |
| [fflate](https://github.com/101arrowz/fflate) | MIT | Zip handling for the Minecraft client jar, resource packs and OBJ export. |
| DejaVu Sans (as `StudioSans`) | Bitstream Vera / DejaVu license | Interface font. The license is in `ui/public/design/FONT-LICENSE.txt`. |
| Legacy block ID table derived from [PrismarineJS minecraft-data](https://github.com/PrismarineJS/minecraft-data) | MIT | `app-host/src/main/resources/studio/world/legacy-blockstates.json`, used to read pre-1.13 schematics. |

## Minecraft

World Studio is not an official Minecraft product and is not approved by or associated with Mojang or Microsoft. "Minecraft" is a trademark of Mojang Synergies AB.

No Minecraft assets are included in this repository or its releases. On first launch the app downloads the official client from Mojang's servers to the user's own computer and extracts the block models, textures and biome data it needs. Use of that content is governed by the [Minecraft EULA](https://www.minecraft.net/eula).
