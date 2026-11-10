package studio.world;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

final class Lz4Block {

    private static final byte[] MAGIC = "LZ4Block".getBytes(StandardCharsets.US_ASCII);

    private static final int RAW = 0x10;

    private static final int COMPRESSED = 0x20;

    private Lz4Block() {
    }

    static byte[] decompress(byte[] input, int limit) throws IOException {
        final ByteBuffer buffer = ByteBuffer.wrap(input).order(ByteOrder.LITTLE_ENDIAN);
        final ByteArrayOutputStream output = new ByteArrayOutputStream(input.length * 3);
        while (buffer.remaining() >= Lz4Block.MAGIC.length + 13) {
            final byte[] magic = new byte[Lz4Block.MAGIC.length];
            buffer.get(magic);
            if (!Arrays.equals(magic, Lz4Block.MAGIC)) {
                throw new IOException("Invalid LZ4 block header");
            }
            final int method = buffer.get() & 0xf0;
            final int compressedLength = buffer.getInt();
            final int decompressedLength = buffer.getInt();
            buffer.getInt();
            if (decompressedLength == 0) {
                break;
            }
            if (compressedLength < 0 || compressedLength > buffer.remaining() || decompressedLength < 0 || output.size() + decompressedLength > limit) {
                throw new IOException("Invalid LZ4 block length");
            }
            final byte[] block = new byte[compressedLength];
            buffer.get(block);
            if (method == Lz4Block.RAW) {
                output.write(block);
                continue;
            }
            if (method != Lz4Block.COMPRESSED) {
                throw new IOException("Unknown LZ4 block method " + method);
            }
            output.write(Lz4Block.block(block, decompressedLength));
        }
        return output.toByteArray();
    }

    private static byte[] block(byte[] source, int length) throws IOException {
        final byte[] target = new byte[length];
        int input = 0;
        int output = 0;
        while (input < source.length) {
            final int token = source[input++] & 255;
            int literals = token >>> 4;
            if (literals == 15) {
                int next;
                do {
                    next = source[input++] & 255;
                    literals += next;
                } while (next == 255);
            }
            if (output + literals > length || input + literals > source.length) {
                throw new IOException("Corrupt LZ4 literal run");
            }
            System.arraycopy(source, input, target, output, literals);
            input += literals;
            output += literals;
            if (input >= source.length) {
                break;
            }
            final int offset = (source[input] & 255) | (source[input + 1] & 255) << 8;
            input += 2;
            if (offset == 0 || offset > output) {
                throw new IOException("Corrupt LZ4 match offset");
            }
            int match = token & 15;
            if (match == 15) {
                int next;
                do {
                    next = source[input++] & 255;
                    match += next;
                } while (next == 255);
            }
            match += 4;
            if (output + match > length) {
                throw new IOException("Corrupt LZ4 match length");
            }
            for (int index = 0; index < match; index++) {
                target[output] = target[output - offset];
                output++;
            }
        }
        if (output != length) {
            throw new IOException("LZ4 block decompressed to the wrong size");
        }
        return target;
    }
}
