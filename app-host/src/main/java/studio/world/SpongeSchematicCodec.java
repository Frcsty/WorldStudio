package studio.world;

import java.io.BufferedInputStream;
import java.io.ByteArrayInputStream;
import java.io.DataInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.GZIPInputStream;

public final class SpongeSchematicCodec implements WorldCodec {

    private static final long MAX_DECOMPRESSED = 512L * 1024 * 1024;

    private static final int MAX_VOLUME = 300_000_000;

    private static final int MAX_SECTIONS = 65_536;

    @Override
    public String id() {
        return "sponge-schem-v3";
    }

    @Override
    public String label() {
        return "Sponge schematic v3 (.schem)";
    }

    @Override
    public String description() {
        return "WorldEdit / FAWE schematic with a named block palette. Block entities and entities are counted, not rendered.";
    }

    @Override
    public List<String> extensions() {
        return List.of(".schem");
    }

    @Override
    public boolean recognizes(WorldSource source) throws IOException {
        return source.gzip();
    }

    @Override
    public Map<String, Object> decode(WorldSource source, Path staging) throws IOException {
        final byte[] input = source.bytes();
        final Decoder decoder = new Decoder(source.worldId(), source.provenance());
        try (final DataInputStream stream = new DataInputStream(new BufferedInputStream(new LimitedInputStream(new GZIPInputStream(new ByteArrayInputStream(input)), SpongeSchematicCodec.MAX_DECOMPRESSED), 65_536))) {
            decoder.parse(stream);
            if (stream.read() != -1) {
                throw new IOException("Unexpected bytes after schematic NBT root");
            }
        }
        return decoder.write(staging);
    }

    private static final class Decoder {

        private final WorldSnapshot world;

        private final Map<String, Object> source;

        private final Map<Long, short[]> layer = new LinkedHashMap<>();

        private final Set<Long> chunks = new HashSet<>();

        private final int[] offset = new int[3];

        private final int[] palette = new int[65_536];

        private final boolean[] air = new boolean[65_536];

        private int width;

        private int height;

        private int length;

        private int version;

        private int dataVersion;

        private int paletteSize;

        private int blockEntities;

        private int entities;

        private int sectionCount;

        private boolean decoded;

        private int tags;

        private Decoder(String worldId, Map<String, Object> source) throws IOException {
            this.world = new WorldSnapshot(worldId);
            this.source = source;
            Arrays.fill(this.palette, -1);
        }

        private void parse(DataInputStream stream) throws IOException {
            if (stream.readUnsignedByte() != 10) {
                throw new IOException("Schematic NBT root must be a compound");
            }
            final String root = stream.readUTF();
            if (root.equals("Schematic")) {
                this.schematic(stream);
            } else if (root.isEmpty()) {
                int type;
                boolean found = false;
                while ((type = stream.readUnsignedByte()) != 0) {
                    final String name = stream.readUTF();
                    if (name.equals("Schematic") && type == 10 && !found) {
                        this.schematic(stream);
                        found = true;
                    } else {
                        this.skip(stream, type, 0);
                    }
                }
                if (!found) {
                    throw new IOException("No Sponge Schematic compound found");
                }
            } else {
                throw new IOException("Unknown NBT root: " + root);
            }
            if (this.version != 3 || !this.decoded) {
                throw new IOException("Sponge v3 Blocks.Data and Palette are required");
            }
        }

        private void schematic(DataInputStream stream) throws IOException {
            int type;
            while ((type = stream.readUnsignedByte()) != 0) {
                this.tag();
                final String name = stream.readUTF();
                switch(name) {
                    case "Version" ->
                        this.version = this.number(stream, type, name);
                    case "DataVersion" ->
                        this.dataVersion = this.number(stream, type, name);
                    case "Width" ->
                        this.width = this.number(stream, type, name);
                    case "Height" ->
                        this.height = this.number(stream, type, name);
                    case "Length" ->
                        this.length = this.number(stream, type, name);
                    case "Offset" ->
                        {
                            if (type != 11 || stream.readInt() != 3) {
                                throw new IOException("Schematic offset must contain 3 coordinates");
                            }
                            for (int index = 0; index < 3; index++) {
                                this.offset[index] = stream.readInt();
                                if (Math.abs((long) this.offset[index]) > 1_000_000) {
                                    throw new IOException("Schematic offset exceeds preview coordinates");
                                }
                            }
                        }
                    case "Blocks" ->
                        {
                            if (type != 10 || this.version != 3) {
                                throw new IOException("Only Sponge schematic v3 Blocks are supported");
                            }
                            this.blocks(stream);
                        }
                    case "Entities" ->
                        this.entities = this.skipList(stream, type, 1);
                    default ->
                        this.skip(stream, type, 0);
                }
            }
        }

        private void blocks(DataInputStream stream) throws IOException {
            int type;
            while ((type = stream.readUnsignedByte()) != 0) {
                this.tag();
                final String name = stream.readUTF();
                switch(name) {
                    case "Palette" ->
                        {
                            if (type != 10 || this.paletteSize > 0) {
                                throw new IOException("Invalid or duplicate schematic palette");
                            }
                            int entry;
                            while ((entry = stream.readUnsignedByte()) != 0) {
                                this.tag();
                                if (entry != 3) {
                                    throw new IOException("Schematic palette entries must be integers");
                                }
                                final String state = stream.readUTF();
                                final int id = stream.readInt();
                                if (id < 0 || id >= this.palette.length || this.palette[id] != -1) {
                                    throw new IOException("Invalid or repeated palette ID " + id);
                                }
                                this.palette[id] = this.world.registerState(WorldSnapshot.parseState(state));
                                this.air[id] = this.world.isAir(this.palette[id]);
                                this.paletteSize++;
                            }
                        }
                    case "Data" ->
                        {
                            if (type != 7 || this.decoded || this.paletteSize == 0) {
                                throw new IOException("Blocks.Data needs a palette before its byte array");
                            }
                            this.data(stream);
                        }
                    case "BlockEntities" ->
                        this.blockEntities = this.skipList(stream, type, 1);
                    default ->
                        this.skip(stream, type, 1);
                }
            }
        }

        private void data(DataInputStream stream) throws IOException {
            if (this.width <= 0 || this.height <= 0 || this.length <= 0) {
                throw new IOException("Schematic dimensions must precede Blocks.Data");
            }
            final long volume = (long) this.width * this.height * this.length;
            if (volume > SpongeSchematicCodec.MAX_VOLUME) {
                throw new IOException("Schematic volume exceeds bounded import limit");
            }
            final int bytes = stream.readInt();
            if (bytes < volume || bytes > SpongeSchematicCodec.MAX_DECOMPRESSED) {
                throw new IOException("Invalid schematic block byte-array length");
            }
            long remaining = bytes;
            final long plane = (long) this.width * this.length;
            long nextPlane = plane;
            int y = 0;
            for (long index = 0; index < volume; index++) {
                int id = 0;
                int shift = 0;
                int next;
                do {
                    if (--remaining < 0 || shift >= 28) {
                        throw new IOException("Truncated or oversized schematic palette varint");
                    }
                    next = stream.readUnsignedByte();
                    id |= (next & 127) << shift;
                    shift += 7;
                } while ((next & 128) != 0);
                if (id < 0 || id >= this.palette.length || this.palette[id] < 0) {
                    throw new IOException("Schematic block refers to an unknown palette entry " + id);
                }
                if (!this.air[id]) {
                    final int x = (int) (index % this.width) + this.offset[0];
                    final int z = (int) ((index / this.width) % this.length) + this.offset[2];
                    final int worldY = y + this.offset[1];
                    final int chunkX = x >> 4;
                    final int chunkZ = z >> 4;
                    final long key = (long) chunkX << 32 | chunkZ & 0xffffffffL;
                    short[] states = this.layer.get(key);
                    if (states == null) {
                        states = new short[4096];
                        this.layer.put(key, states);
                        this.chunks.add(key);
                    }
                    states[((worldY & 15) << 8) | ((z & 15) << 4) | (x & 15)] = (short) this.palette[id];
                }
                if (index + 1 == nextPlane) {
                    if ((y + this.offset[1] & 15) == 15 || y == this.height - 1) {
                        this.flush((y + this.offset[1]) >> 4);
                    }
                    nextPlane += plane;
                    y++;
                }
            }
            if (remaining != 0) {
                throw new IOException("Schematic block data contains trailing varints");
            }
            this.decoded = true;
        }

        private void flush(int sectionY) throws IOException {
            for (final Map.Entry<Long, short[]> entry : this.layer.entrySet()) {
                final int chunkX = (int) (entry.getKey() >> 32);
                final int chunkZ = (int) (long) entry.getKey();
                this.world.addSection(chunkX, sectionY, chunkZ, entry.getValue());
                if (++this.sectionCount > SpongeSchematicCodec.MAX_SECTIONS) {
                    throw new IOException("Too many occupied schematic sections");
                }
            }
            this.layer.clear();
        }

        private Map<String, Object> write(Path staging) throws IOException {
            if (this.sectionCount == 0) {
                throw new IOException("Schematic has no occupied sections");
            }
            final Map<String, Object> metadata = new LinkedHashMap<>(this.source);
            metadata.put("sourceCodecVersion", this.version);
            metadata.put("schematicDataVersion", this.dataVersion);
            metadata.put("sourceDimensions", Map.of("width", this.width, "height", this.height, "length", this.length));
            metadata.put("sourceOffset", this.offset);
            metadata.put("storedChunks", this.chunks.size());
            metadata.put("ignoredBlockEntities", this.blockEntities);
            metadata.put("ignoredEntities", this.entities);
            metadata.put("verification", "Sponge v3 gzip/NBT, palette indices and all block varints validated; block entities are not rendered or exported");
            return this.world.write(staging, metadata);
        }

        private int number(DataInputStream stream, int type, String field) throws IOException {
            if (type == 2) {
                return stream.readShort();
            }
            if (type == 3) {
                return stream.readInt();
            }
            throw new IOException("Invalid schematic " + field + " tag type " + type);
        }

        private void tag() throws IOException {
            if (++this.tags > 1_000_000) {
                throw new IOException("Too many schematic NBT tags");
            }
        }

        private int skipList(DataInputStream stream, int type, int depth) throws IOException {
            if (type != 9) {
                this.skip(stream, type, depth);
                return 0;
            }
            final int child = stream.readUnsignedByte();
            final int length = stream.readInt();
            if (length < 0 || length > 100_000 || child == 0 && length != 0) {
                throw new IOException("Invalid schematic NBT list");
            }
            for (int index = 0; index < length; index++) {
                this.skip(stream, child, depth + 1);
            }
            return length;
        }

        private void skip(DataInputStream stream, int type, int depth) throws IOException {
            this.tag();
            if (depth > 32) {
                throw new IOException("Schematic NBT nesting exceeds limit");
            }
            switch(type) {
                case 1 ->
                    stream.readByte();
                case 2 ->
                    stream.readShort();
                case 3 ->
                    stream.readInt();
                case 4 ->
                    stream.readLong();
                case 5 ->
                    stream.readFloat();
                case 6 ->
                    stream.readDouble();
                case 7 ->
                    stream.skipNBytes(this.arrayLength(stream, 1));
                case 8 ->
                    stream.readUTF();
                case 9 ->
                    this.skipList(stream, type, depth);
                case 10 ->
                    {
                        int child;
                        while ((child = stream.readUnsignedByte()) != 0) {
                            stream.readUTF();
                            this.skip(stream, child, depth + 1);
                        }
                    }
                case 11 ->
                    stream.skipNBytes(this.arrayLength(stream, 4));
                case 12 ->
                    stream.skipNBytes(this.arrayLength(stream, 8));
                default ->
                    throw new IOException("Unsupported schematic NBT tag " + type);
            }
        }

        private long arrayLength(DataInputStream stream, int width) throws IOException {
            final int length = stream.readInt();
            if (length < 0 || (long) length * width > SpongeSchematicCodec.MAX_DECOMPRESSED) {
                throw new IOException("Oversized schematic NBT array");
            }
            return (long) length * width;
        }
    }

    private static final class LimitedInputStream extends FilterInputStream {

        private final long maximum;

        private long consumed;

        private LimitedInputStream(InputStream input, long maximum) {
            super(input);
            this.maximum = maximum;
        }

        private void checked(long count) throws IOException {
            if (count > this.maximum - this.consumed) {
                throw new IOException("Schematic exceeds decompressed size limit");
            }
            this.consumed += count;
        }

        @Override
        public int read() throws IOException {
            final int value = super.read();
            if (value != -1) {
                this.checked(1);
            }
            return value;
        }

        @Override
        public int read(byte[] bytes, int offset, int length) throws IOException {
            final int count = this.in.read(bytes, offset, length);
            if (count > 0) {
                this.checked(count);
            }
            return count;
        }

        @Override
        public long skip(long length) throws IOException {
            final long count = this.in.skip(length);
            this.checked(count);
            return count;
        }
    }
}
