import fs from 'node:fs';
import zlib from 'node:zlib';

const MAX_VOLUME = 4_194_304;

function readTag(buffer, cursor, type) {
    switch (type) {
        case 1:
            return [buffer.readInt8(cursor), cursor + 1];
        case 2:
            return [buffer.readInt16BE(cursor), cursor + 2];
        case 3:
            return [buffer.readInt32BE(cursor), cursor + 4];
        case 4:
            return [buffer.readBigInt64BE(cursor), cursor + 8];
        case 5:
            return [buffer.readFloatBE(cursor), cursor + 4];
        case 6:
            return [buffer.readDoubleBE(cursor), cursor + 8];
        case 7: {
            const length = buffer.readInt32BE(cursor);
            return [buffer.subarray(cursor + 4, cursor + 4 + length), cursor + 4 + length];
        }
        case 8: {
            const length = buffer.readUInt16BE(cursor);
            return [buffer.toString('utf8', cursor + 2, cursor + 2 + length), cursor + 2 + length];
        }
        case 9: {
            const itemType = buffer.readUInt8(cursor);
            const length = buffer.readInt32BE(cursor + 1);
            let next = cursor + 5;
            const items = [];
            for (let index = 0; index < length; index++) {
                let value;
                [value, next] = readTag(buffer, next, itemType);
                items.push(value);
            }
            return [items, next];
        }
        case 10: {
            const result = {};
            let next = cursor;
            for (;;) {
                const tagType = buffer.readUInt8(next++);
                if (tagType === 0) {
                    return [result, next];
                }
                const length = buffer.readUInt16BE(next);
                const name = buffer.toString('utf8', next + 2, next + 2 + length);
                let value;
                [value, next] = readTag(buffer, next + 2 + length, tagType);
                result[name] = value;
            }
        }
        case 11: {
            const length = buffer.readInt32BE(cursor);
            const values = [];
            for (let index = 0; index < length; index++) {
                values.push(buffer.readInt32BE(cursor + 4 + index * 4));
            }
            return [values, cursor + 4 + length * 4];
        }
        case 12: {
            const length = buffer.readInt32BE(cursor);
            return [new Array(length).fill(0), cursor + 4 + length * 8];
        }
        default:
            throw new Error('Unknown NBT tag type ' + type);
    }
}

export function readSchematic(file) {
    const buffer = zlib.gunzipSync(fs.readFileSync(file));
    if (buffer.readUInt8(0) !== 10) {
        throw new Error('Schematic NBT root must be a compound');
    }
    const rootName = buffer.toString('utf8', 3, 3 + buffer.readUInt16BE(1));
    const [root] = readTag(buffer, 3 + buffer.readUInt16BE(1), 10);
    const schematic = rootName === 'Schematic' ? root : root.Schematic;
    if (!schematic || schematic.Version !== 3 || !schematic.Blocks?.Palette || !schematic.Blocks?.Data) {
        throw new Error('Only Sponge schematic v3 pieces are supported: ' + file);
    }
    const width = schematic.Width & 0xffff;
    const height = schematic.Height & 0xffff;
    const length = schematic.Length & 0xffff;
    if (!width || !height || !length || width * height * length > MAX_VOLUME) {
        throw new Error('Schematic dimensions are empty or too large: ' + file);
    }
    const palette = [];
    for (const [state, id] of Object.entries(schematic.Blocks.Palette)) {
        if (!Number.isInteger(id) || id < 0 || palette[id] !== undefined) {
            throw new Error('Invalid schematic palette in ' + file);
        }
        palette[id] = state;
    }
    const blocks = new Uint16Array(width * height * length);
    const data = schematic.Blocks.Data;
    let cursor = 0;
    for (let index = 0; index < blocks.length; index++) {
        let value = 0;
        let shift = 0;
        let byte;
        do {
            if (cursor >= data.length || shift > 28) {
                throw new Error('Truncated schematic block data in ' + file);
            }
            byte = data[cursor++] & 0xff;
            value |= (byte & 127) << shift;
            shift += 7;
        } while (byte & 128);
        if (palette[value] === undefined) {
            throw new Error('Unknown schematic palette entry in ' + file);
        }
        blocks[index] = value;
    }
    return { width, height, length, palette, blocks, blockEntities: schematic.Blocks.BlockEntities?.length ?? 0 };
}
