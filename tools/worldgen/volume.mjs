export class JobVolume {
    constructor({ jobX, jobZ, jobSize, margin, minY, maxY }) {
        this.jobX = jobX;
        this.jobZ = jobZ;
        this.jobSize = jobSize;
        this.margin = margin;
        this.minX = jobX - margin;
        this.minZ = jobZ - margin;
        this.sizeX = jobSize + margin * 2;
        this.sizeZ = jobSize + margin * 2;
        this.maxX = this.minX + this.sizeX - 1;
        this.maxZ = this.minZ + this.sizeZ - 1;
        this.minY = minY;
        this.maxY = maxY;
        this.height = maxY - minY + 1;
        this.chunksX = this.sizeX >> 4;
        this.chunksZ = this.sizeZ >> 4;
        this.sections = this.height >> 4;
        this.minChunkX = this.minX >> 4;
        this.minChunkZ = this.minZ >> 4;
        this.blocks = new Uint16Array(this.chunksX * this.chunksZ * this.sections * 4096);
        this.biomes = new Uint16Array(this.sizeX * this.sizeZ);

        this.yOffsets = new Int32Array(this.height);
        for (let y = 0; y < this.height; y++) {
            this.yOffsets[y] = ((y >> 4) << 12) | ((y & 15) << 8);
        }
        this.landmarks = [];
    }

    contains(x, y, z) {
        return x >= this.minX && x <= this.maxX && z >= this.minZ && z <= this.maxZ && y >= this.minY && y <= this.maxY;
    }

    inJob(x, z) {
        return x >= this.jobX && x < this.jobX + this.jobSize && z >= this.jobZ && z < this.jobZ + this.jobSize;
    }

    column(x, z) {
        const localX = x - this.minX;
        const localZ = z - this.minZ;
        return ((((localZ >> 4) * this.chunksX + (localX >> 4)) * this.sections) << 12) | ((localZ & 15) << 4) | (localX & 15);
    }

    index(x, y, z) {
        if (x < this.minX || x > this.maxX || z < this.minZ || z > this.maxZ || y < this.minY || y > this.maxY) {
            return -1;
        }
        return this.column(x, z) + this.yOffsets[y - this.minY];
    }

    get(x, y, z) {
        const index = this.index(x, y, z);
        return index < 0 ? -1 : this.blocks[index];
    }

    set(x, y, z, id) {
        const index = this.index(x, y, z);
        if (index >= 0) {
            this.blocks[index] = id;
        }
    }

    biome(x, z) {
        return this.biomes[(z - this.minZ) * this.sizeX + (x - this.minX)];
    }
    setBiome(x, z, id) {
        this.biomes[(z - this.minZ) * this.sizeX + (x - this.minX)] = id;
    }

    section(chunkX, sectionIndex, chunkZ) {
        const offset = (((chunkZ - this.minChunkZ) * this.chunksX + (chunkX - this.minChunkX)) * this.sections + sectionIndex) << 12;
        return this.blocks.subarray(offset, offset + 4096);
    }

    landmark(kind, label, x, y, z, extra = {}) {
        if (this.inJob(x, z)) {
            this.landmarks.push({ kind, label, position: [x, y, z], ...extra });
        }
    }
}
