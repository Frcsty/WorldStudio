package studio.world;

import java.io.ByteArrayInputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class NbtReader {

    private static final int MAX_ELEMENTS = 1_048_576;

    private static final int MAX_DEPTH = 64;

    private final DataInputStream input;

    private final int maximumByteArray;

    private int remainingTags = NbtReader.MAX_ELEMENTS;

    private NbtReader(byte[] bytes, int maximumByteArray) {
        this.input = new DataInputStream(new ByteArrayInputStream(bytes));
        this.maximumByteArray = maximumByteArray;
    }

    public static Map<String, Object> read(byte[] bytes) throws IOException {
        return NbtReader.read(bytes, NbtReader.MAX_ELEMENTS);
    }

    public static Map<String, Object> read(byte[] bytes, int maximumByteArray) throws IOException {
        if (maximumByteArray < 0 || maximumByteArray > 512 * 1024 * 1024) {
            throw new IOException("Invalid NBT byte-array limit");
        }
        if (bytes.length == 0) {
            return Map.of();
        }
        final NbtReader reader = new NbtReader(bytes, maximumByteArray);
        if (reader.input.readUnsignedByte() != 10) {
            throw new IOException("NBT root is not a compound");
        }
        reader.input.readUTF();
        final Map<String, Object> root = NbtReader.compound(reader.payload(10, 0));
        if (reader.input.available() != 0) {
            throw new IOException("Trailing bytes after NBT root: " + reader.input.available());
        }
        return root;
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> compound(Object value) throws IOException {
        if (!(value instanceof Map<?, ?>)) {
            throw new IOException("Expected NBT compound, got " + value);
        }
        return (Map<String, Object>) value;
    }

    private int length(int bytesPerElement) throws IOException {
        return this.length(bytesPerElement, NbtReader.MAX_ELEMENTS);
    }

    private int length(int bytesPerElement, int maximumElements) throws IOException {
        final int size = this.input.readInt();
        if (size < 0 || size > maximumElements || (long) size * bytesPerElement > this.input.available()) {
            throw new IOException("Invalid NBT collection length: " + size);
        }
        return size;
    }

    private Object payload(int type, int depth) throws IOException {
        if (depth > NbtReader.MAX_DEPTH || --this.remainingTags < 0) {
            throw new IOException("NBT complexity limit exceeded");
        }
        return switch(type) {
            case 1 ->
                this.input.readByte();
            case 2 ->
                this.input.readShort();
            case 3 ->
                this.input.readInt();
            case 4 ->
                this.input.readLong();
            case 5 ->
                this.input.readFloat();
            case 6 ->
                this.input.readDouble();
            case 7 ->
                this.input.readNBytes(this.length(1, this.maximumByteArray));
            case 8 ->
                this.input.readUTF();
            case 9 ->
                {
                    final int childType = this.input.readUnsignedByte();
                    final int size = this.length(0);
                    if (childType == 0 && size != 0) {
                        throw new IOException("Non-empty NBT list has END type");
                    }
                    final List<Object> values = new ArrayList<>(size);
                    for (int index = 0; index < size; index++) {
                        values.add(this.payload(childType, depth + 1));
                    }
                    yield values;
                }
            case 10 ->
                {
                    final Map<String, Object> values = new LinkedHashMap<>();
                    int childType;
                    while ((childType = this.input.readUnsignedByte()) != 0) {
                        final String name = this.input.readUTF();
                        if (values.containsKey(name)) {
                            throw new IOException("Duplicate NBT field: " + name);
                        }
                        values.put(name, this.payload(childType, depth + 1));
                    }
                    yield values;
                }
            case 11 ->
                {
                    final int[] values = new int[this.length(4)];
                    for (int index = 0; index < values.length; index++) {
                        values[index] = this.input.readInt();
                    }
                    yield values;
                }
            case 12 ->
                {
                    final long[] values = new long[this.length(8)];
                    for (int index = 0; index < values.length; index++) {
                        values[index] = this.input.readLong();
                    }
                    yield values;
                }
            default ->
                throw new IOException("Unknown NBT tag: " + type);
        };
    }
}
