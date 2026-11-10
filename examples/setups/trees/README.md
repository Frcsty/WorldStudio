# Tree workshop

A setup that grows seeded tree galleries on flat grass, so you can iterate on tree shapes and compare specimens side by side. Each gallery is a normal World Studio world with a saved view per specimen.

## Install

Copy this folder into your workspace and build a gallery from a source checkout:

```sh
cp -r examples/setups/trees workspace/setups/trees
node tools/generate-trees.mjs
```

Set `WORLD_STUDIO_WORKSPACE` if your workspace is somewhere else. Refresh World Studio afterwards and pick **Trees** in the setup selector.

## Recipes

`gallery.json` holds the gallery: `world` ID, `style`, species, seed, specimen count, grid spacing and style parameters.

- `sampleSpecies` assigns woods per specimen (cycling), `--species` overrides the whole gallery.
- `sampleVariants` cycles the style's named variants.
- `sampleOrigins` places specimens at explicit `[x, z]` positions; leave it out for an automatic grid.

```sh
node tools/generate-trees.mjs --seed 2481
node tools/generate-trees.mjs --species spruce --count 9
node tools/generate-trees.mjs --recipe setups/trees/my-recipe.json
node tools/generate-trees.mjs --list
```

Running again with the same seed, recipe and style code reproduces identical terrain. Changing them evolves the same gallery: the previous terrain and recipe are archived under `history/`, and the project is rebound so your saved views survive. Close World Studio while a gallery is being published.

Outputs:

- `worlds/<world-id>/`: the rendered snapshot.
- `generations/<world-id>/`: the recipe, hashes, specimen seeds and the exact log/leaf layout of every specimen.

## Writing a style

Drop a module into `styles/<id>.mjs`; it is picked up automatically.

```javascript
export default {
    id: 'my-style',
    name: 'My style',
    defaults: { height: 14 },
    generate({ random, integer, parameters, variant, cellRadius, log, leaf }) {
        for (let y = 0; y < parameters.height; y++) {
            log(0, y, 0);
        }
        const radius = integer(2, 4);
        for (let x = -radius; x <= radius; x++) {
            for (let z = -radius; z <= radius; z++) {
                leaf(x, parameters.height - 1, z);
            }
        }
    },
};
```

- Coordinates are offsets from the root log at `(0, 0, 0)`. `log(x, y, z, axis)` takes an axis of `x`, `y` or `z`; `leaf(x, y, z)` places persistent leaves.
- Use `random()` and `integer(min, max)` for randomness so results stay reproducible.
- Every log must connect to the root, each tree is limited to 32,768 blocks, `y` 0 to 80, and its gallery cell (`cellRadius`).
- A style can expose a `variants` map and return `{ name, posture }` (`upright`, `leaning` or `fallen`) to label saved views.

Styles are trusted local code and are not sandboxed. Only the CLI runs them; the app never does.
