# Writing an import format plugin

World Studio reads worlds through **codecs**. Built-in codecs cover Minecraft saves (Anvil), Sponge `.schem`, legacy `.schematic`, structure `.nbt` and World Studio JSON sections. You can add your own without rebuilding the app.

## Installing a plugin

Put the plugin in the `codecs/` folder of your workspace and press **Refresh** in the Setup panel:

- **`.java` source files** are compiled with the Java compiler bundled in the app. Several files can work together; subfolders are scanned too.
- **`.jar` files** are loaded with Java's `ServiceLoader`, so they need a `META-INF/services/studio.world.WorldCodec` file naming the implementation.

Compile errors and loading problems show up under **Issues** in the Setup panel. The new format then appears in **Import world**.

Plugins run with the same permissions as World Studio itself. Only install plugins you trust.

## The interface

```java
public interface WorldCodec {
    String id();                                   // lowercase, e.g. "my-format"
    String label();                                // shown in the format picker
    default String description() { return ""; }
    default List<String> extensions() { return List.of(); }   // filename suffixes used to suggest this codec
    default boolean readsDirectories() { return false; }      // true if the source is a folder
    boolean recognizes(WorldSource source) throws IOException;
    Map<String, Object> decode(WorldSource source, Path staging) throws IOException;
    default boolean encodes() { return false; }
    default void encode(Path snapshot, Path destination) throws IOException { ... }
}
```

`WorldSource` gives you:

| Method | Meaning |
| --- | --- |
| `worldId()` | The ID the user chose. |
| `path()`, `directory()` | The file or folder being imported. It may be outside the workspace; never modify it. |
| `bytes()`, `prefix(n)`, `gzip()` | Bounded file access (512 MiB limit for `bytes()`). |
| `options()` | Extra import options, e.g. Anvil's `dimension` and `radius`. |
| `assets()` | The setup's render bundle folder (contains `biomes.json` once assets are installed). |
| `progress(fraction, message)` | Report progress to the import dialog. |
| `provenance()` | Metadata to store in `world.json`. Pass it to the writer. |

`decode` writes a snapshot into `staging` and returns its metadata. World Studio moves the folder into place only if decoding succeeds.

## Writing terrain

For small and medium worlds use `WorldSnapshot`:

```java
final WorldSnapshot world = new WorldSnapshot(source.worldId());
final int stone = world.registerState(WorldSnapshot.parseState("minecraft:stone"));
final short[] section = new short[4096];
section[(y << 8) | (z << 4) | x] = (short) stone;
world.addSection(chunkX, sectionY, chunkZ, section);
return world.write(staging, source.provenance());
```

Sections are 16×16×16 blocks indexed `y * 256 + z * 16 + x`.

For large worlds use `TiledWorldWriter`, which streams 64×64 tiles with biome tints and far-terrain detail levels. It is what the Anvil codec uses, and it is safe to call from several threads:

```java
final TiledWorldWriter writer = new TiledWorldWriter(source.worldId(), staging, source.assets());
final int state = writer.state(Map.of("Name", "minecraft:grass_block", "Properties", Map.of("snowy", "false")));
final int plains = writer.biome("minecraft:plains");
writer.writeTile(tileX, tileZ, sections, (x, y, z) -> plains);
return writer.finish(source.provenance(), new int[]{spawnX, spawnY, spawnZ}, "My world");
```

## Example

[`examples/codecs/TextBlocksCodec.java`](../examples/codecs/TextBlocksCodec.java) imports `.blocks.txt` files with one `x y z block_state` per line. Copy it into `codecs/` to try it.
