const RENAMES: [string, string][] = [
    ['minecraft:grass', 'minecraft:short_grass'],
    ['minecraft:chain', 'minecraft:iron_chain'],
    ['minecraft:grass_path', 'minecraft:dirt_path'],
    ['minecraft:sign', 'minecraft:oak_sign'],
    ['minecraft:wall_sign', 'minecraft:oak_wall_sign'],
];

const FALLBACK = { variants: { '': { model: 'minecraft:block/magenta_concrete' } } };

export function resolveDefinition(definitions: Record<string, unknown>, name: string): { definition: unknown; missing: boolean } {
    if (definitions[name]) {
        return { definition: definitions[name], missing: false };
    }
    for (const [older, newer] of RENAMES) {
        const candidate = name === older ? newer : name === newer ? older : undefined;
        if (candidate && definitions[candidate]) {
            return { definition: definitions[candidate], missing: false };
        }
    }
    return { definition: FALLBACK, missing: true };
}
