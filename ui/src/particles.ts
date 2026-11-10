import * as THREE from 'three';
import { randomSeed, TerrainSnapshot } from './terrain';
import type { AssetIndex, ParticleObject, Vec3, VisualProject } from './types';

interface LiveParticle {
    sprite: THREE.Sprite;
    frames: THREE.Texture[];
    position: THREE.Vector3;
    previous: THREE.Vector3;
    velocity: THREE.Vector3;
    age: number;
    life: number;
    gravity: number;
    friction: Vec3;
    kind: string;
    random: () => number;
    stopped: boolean;
}
const gaussian = (random: () => number) => Math.sqrt(-2 * Math.log(Math.max(1e-9, random()))) * Math.cos(Math.PI * 2 * random());
const distanceSquared = (point: number[], camera: THREE.Vector3) =>
    (point[0] - camera.x) ** 2 + (point[1] - (camera.y - 1.62)) ** 2 + (point[2] - camera.z) ** 2;

export class ParticleScene {
    readonly root = new THREE.Group();
    private readonly textures = new Map<string, THREE.Texture>();
    private readonly sprites = new Map<string, THREE.Texture[]>();
    private readonly materialPositions = new Map<string, Vec3[]>();
    private readonly active: LiveParticle[] = [];
    private readonly effects: ParticleObject[];
    private lastTick = -1;
    private emissionCount = 0;
    private peakParticles = 0;
    private lastPulseEmissions = 0;
    private constructor(
        private readonly project: VisualProject,
        private readonly terrain: TerrainSnapshot,
    ) {
        this.effects = project.objects.filter((object): object is ParticleObject => object.type === 'particle' && object.enabled);
    }
    static async create(project: VisualProject, terrain: TerrainSnapshot, assets: AssetIndex): Promise<ParticleScene> {
        const scene = new ParticleScene(project, terrain);
        try {
            for (const effect of scene.effects) {
                if (effect.scannedMaterial && !scene.materialPositions.has(effect.scannedMaterial)) {
                    scene.materialPositions.set(effect.scannedMaterial, terrain.scan(effect.scannedMaterial, project.seed));
                }
                if (scene.sprites.has(effect.particle)) {
                    continue;
                }
                const response = await fetch(`${assets.assetUrl}/minecraft/particles/${effect.particle.toLowerCase()}.json`);
                if (!response.ok) {
                    throw new Error(`Missing particle definition ${effect.particle}`);
                }
                const definition = (await response.json()) as { textures: string[] };
                if (!definition.textures?.length) {
                    throw new Error(`Particle ${effect.particle} has no supported sprite set`);
                }
                const frames: THREE.Texture[] = [];
                for (const name of definition.textures) {
                    const id = name.includes(':') ? name : 'minecraft:' + name;
                    if (!scene.textures.has(id)) {
                        const [namespace, path] = id.split(':');
                        const textureResponse = await fetch(`${assets.assetUrl}/${namespace}/textures/particle/${path}.png`);
                        if (!textureResponse.ok) {
                            throw new Error(`Missing particle sprite ${id}`);
                        }
                        const image = await createImageBitmap(await textureResponse.blob(), { imageOrientation: 'flipY' });
                        const texture = new THREE.Texture(image);
                        texture.colorSpace = THREE.SRGBColorSpace;
                        texture.magFilter = THREE.NearestFilter;
                        texture.minFilter = THREE.NearestFilter;
                        texture.generateMipmaps = false;
                        texture.needsUpdate = true;
                        scene.textures.set(id, texture);
                    }
                    frames.push(scene.textures.get(id)!);
                }
                scene.sprites.set(effect.particle, frames);
            }
            return scene;
        } catch (error) {
            scene.dispose();
            throw error;
        }
    }
    tick(tick: number, camera: THREE.Vector3): void {
        const integer = Math.floor(tick);
        if (integer < this.lastTick || integer - this.lastTick > 600) {
            this.clear();
            this.lastTick = Math.max(-1, integer - 600);
            this.emissionCount = 0;
            this.peakParticles = 0;
        }
        while (this.lastTick < integer) {
            this.lastTick++;
            for (let index = this.active.length - 1; index >= 0; index--) {
                const particle = this.active[index];
                particle.previous.copy(particle.position);
                particle.age++;
                if (particle.age >= particle.life) {
                    this.remove(index);
                    continue;
                }
                if (particle.kind === 'FIREFLY') {
                    if (!/:(air|cave_air|void_air)$/.test(this.terrain.blockAt(...(particle.position.toArray() as Vec3)).name)) {
                        this.remove(index);
                        continue;
                    }
                    if (particle.age === 1 || particle.random() > 0.95) {
                        particle.velocity.set((particle.random() - 0.5) * 0.1, (particle.random() - 0.5) * 0.1, (particle.random() - 0.5) * 0.1);
                    }
                }
                if (!particle.stopped) {
                    particle.velocity.y -= particle.gravity * 0.04;
                    const next = particle.position.clone().add(particle.velocity);
                    if (
                        ['SNOWFLAKE', 'SPLASH', 'FALLING_WATER', 'CHERRY_LEAVES', 'TINTED_LEAVES'].includes(particle.kind) &&
                        this.terrain.solidAt(next.x, next.y, next.z)
                    ) {
                        particle.stopped = true;
                    } else {
                        particle.position.copy(next);
                    }
                    particle.velocity.multiply(new THREE.Vector3(...particle.friction));
                }
                const frame = Math.min(particle.frames.length - 1, Math.floor((particle.age * particle.frames.length) / particle.life));
                particle.sprite.material.map = particle.frames[frame];
                if (particle.kind === 'END_ROD' && particle.age > particle.life / 2) {
                    particle.sprite.material.opacity = 1 - (particle.age - Math.floor(particle.life / 2)) / particle.life;
                    particle.sprite.material.color.lerp(new THREE.Color(0xf2dec9), 0.2);
                }
                if (particle.kind === 'FIREFLY') {
                    const progress = particle.age / particle.life;
                    particle.sprite.material.opacity = progress >= 0.7 ? (1 - progress) / 0.3 : Math.min(1, progress / 0.5);
                }
            }
            if (this.lastTick > 0 && this.lastTick % 10 === 0) {
                this.pulse(this.lastTick, camera);
            }
        }
        const alpha = tick - integer;
        for (const particle of this.active) {
            particle.sprite.position.copy(particle.previous).lerp(particle.position, alpha);
        }
    }
    getStats(): { active: number; peak: number; emissions: number; lastPulseEmissions: number } {
        return { active: this.active.length, peak: this.peakParticles, emissions: this.emissionCount, lastPulseEmissions: this.lastPulseEmissions };
    }
    private pulse(tick: number, camera: THREE.Vector3): void {
        const random = randomSeed(this.project.seed ^ Math.imul(tick / 10, 0x9e3779b1));
        const chosen = new Map<string, Vec3 | undefined>();
        let emitted = 0;
        for (const effect of this.effects) {
            if (emitted >= 2 || random() >= effect.activationChance) {
                continue;
            }
            let point: Vec3 | undefined;
            if (effect.position) {
                if (distanceSquared(effect.position, camera) <= effect.viewDistance ** 2) {
                    point = effect.position.slice(0, 3) as Vec3;
                }
            } else if (effect.scannedMaterial) {
                const material = effect.scannedMaterial;
                if (!chosen.has(material)) {
                    const positions = this.materialPositions.get(material)!;
                    const start = Math.floor(random() * positions.length);
                    let selected: Vec3 | undefined;
                    for (let offset = 0; offset < positions.length; offset++) {
                        const candidate = positions[(start + offset) % positions.length];
                        if (distanceSquared(candidate, camera) <= effect.viewDistance ** 2) {
                            selected = candidate;
                            break;
                        }
                    }
                    chosen.set(material, selected);
                }
                const selected = chosen.get(material);
                if (selected) {
                    point = [selected[0], selected[1] + effect.materialOffsetY, selected[2]];
                }
            }
            if (!point) {
                continue;
            }
            emitted++;
            this.emissionCount++;
            for (let index = 0; index < effect.count; index++) {
                this.emit(effect, point, random);
            }
        }
        this.lastPulseEmissions = emitted;
        this.peakParticles = Math.max(this.peakParticles, this.active.length);
    }
    private emit(effect: ParticleObject, origin: Vec3, random: () => number): void {
        if (this.active.length >= 8192) {
            throw new Error('Particle preview exceeds its safety budget; reduce the authored effect density');
        }
        const frames = this.sprites.get(effect.particle)!;
        const position = new THREE.Vector3(...origin).add(new THREE.Vector3(...(effect.offset.map((value) => value * gaussian(random)) as Vec3)));
        const velocity = new THREE.Vector3(gaussian(random), gaussian(random), gaussian(random)).multiplyScalar(effect.speed);
        const kind = effect.particle;
        let life = 40;
        let gravity = 0;
        let friction: Vec3 = [0.96, 0.96, 0.96];
        let color = 0xffffff;
        let size = (random() * 0.5 + 0.5) * 0.2 * 0.75;
        if (kind === 'END_ROD') {
            life = 60 + Math.floor(random() * 12);
            gravity = 0.0125;
            friction = [0.91, 0.91, 0.91];
        } else if (kind === 'WAX_ON') {
            life = 10 + Math.floor(random() * 30);
            color = 0xe88c14;
            velocity.multiply(new THREE.Vector3(0.005, 0.01, 0.005));
        } else if (kind === 'ELECTRIC_SPARK') {
            life = 2 + Math.floor(random() * 2);
            color = 0xffe5ff;
            velocity.multiplyScalar(0.25);
        } else if (kind === 'SNOWFLAKE') {
            life = Math.floor(16 / (random() * 0.8 + 0.2)) + 2;
            gravity = 0.225;
            friction = [0.95, 0.9, 0.95];
            velocity.add(new THREE.Vector3((random() * 2 - 1) * 0.05, (random() * 2 - 1) * 0.05, (random() * 2 - 1) * 0.05));
            size = 0.2 * (1 + random() * random());
        } else if (kind === 'FIREFLY') {
            life = 200 + Math.floor(random() * 101);
            size *= 1.5;
        } else if (kind.includes('LEAVES')) {
            life = 300;
            gravity = 0.0075;
            friction = [1, 1, 1];
            velocity.set((random() - 0.5) * 0.03, -0.025, (random() - 0.5) * 0.03);
            size = 0.1;
        } else if (kind.includes('SMOKE') || kind === 'ASH' || kind === 'WHITE_ASH') {
            life = kind.includes('CAMPFIRE') ? 160 : 60;
            color = kind === 'WHITE_ASH' ? 0xe0e0e0 : 0x999999;
            velocity.y += 0.015;
            size = 0.15;
        } else if (kind.includes('SPORE')) {
            life = 100;
            color = kind === 'CRIMSON_SPORE' ? 0xd06543 : kind === 'WARPED_SPORE' ? 0x40a69a : 0xafd46a;
            velocity.y -= 0.01;
        } else if (kind.includes('FLAME')) {
            life = 12 + Math.floor(random() * 12);
            size = kind === 'SMALL_FLAME' ? 0.08 : 0.15;
        } else if (['SPLASH', 'FALLING_WATER', 'DRIPPING_WATER', 'BUBBLE'].includes(kind)) {
            life = 16;
            color = 0x5c8dff;
            gravity = kind === 'BUBBLE' ? -0.02 : 0.06;
            velocity.y += kind === 'SPLASH' ? 0.08 : 0;
        } else if (kind.includes('PORTAL')) {
            life = 40 + Math.floor(random() * 10);
            color = 0x8044b5;
        }
        if (effect.data) {
            color = (effect.data.rgb[0] << 16) | (effect.data.rgb[1] << 8) | effect.data.rgb[2];
        }
        const material = new THREE.SpriteMaterial({ map: frames[0], color, transparent: true, depthWrite: false, alphaTest: 0.01 });
        const sprite = new THREE.Sprite(material);
        sprite.position.copy(position);
        sprite.scale.setScalar(size);
        sprite.userData.visualId = effect.id;
        if (kind === 'FIREFLY') {
            material.opacity = 0;
        }
        this.root.add(sprite);
        this.active.push({
            sprite,
            frames,
            position,
            previous: position.clone(),
            velocity,
            age: 0,
            life,
            gravity,
            friction,
            kind,
            random: randomSeed(Math.floor(random() * 2147483647)),
            stopped: false,
        });
    }
    private remove(index: number): void {
        const particle = this.active[index];
        particle.sprite.removeFromParent();
        particle.sprite.material.dispose();
        this.active.splice(index, 1);
    }
    private clear(): void {
        for (let index = this.active.length - 1; index >= 0; index--) {
            this.remove(index);
        }
    }
    dispose(): void {
        this.clear();
        this.root.removeFromParent();
        this.textures.forEach((texture) => {
            (texture.image as ImageBitmap).close();
            texture.dispose();
        });
    }
}
