# Examples

Optional extras for people working from a source checkout.

| Folder | What it is |
| --- | --- |
| `codecs/TextBlocksCodec.java` | A minimal import format plugin. Copy it into your workspace's `codecs/` folder and press Refresh. |
| `setups/trees` | A tree design workshop that grows seeded tree galleries. See its README. |
| `setups/worldgen` | Procedural world generators (`overworld`, `island`, `japan`) that produce large streamed worlds. |

## World generation

```sh
cp -r examples/setups/worldgen workspace/setups/worldgen
node tools/generate-world.mjs
node tools/generate-world.mjs --recipe setups/worldgen/island.json
```

Generators live in `setups/worldgen/generators/`. Each one is a module exporting `{ id, name, height, featureMargin, defaults, blocks, biomes, create }`; the engine handles jobs, tiles, biome tint blending and far-terrain LOD. Like tree styles, generators are trusted local code run only by the CLI.
