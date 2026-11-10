import { useEffect, useState } from 'react';
import { previewAdapter } from './setups';
import { isSpawn, newId, objectCenter, positionAt } from './project';
import type { AssetIndex, CreatureObject, Position, Vec3, VisualObject, WorldMetadata } from './types';

export function NumberField({
    label,
    value,
    onChange,
    min,
    max,
    step = 0.1,
}: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
}) {
    const [text, setText] = useState(String(value));
    useEffect(() => setText(String(value)), [value]);
    const commit = () => {
        const number = Number(text);
        if (text.trim() && Number.isFinite(number) && number !== value) {
            onChange(number);
        }
        setText(String(value));
    };
    return (
        <label>
            {label}
            <input
                type="number"
                aria-label={label}
                step={step}
                min={min}
                max={max}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        event.currentTarget.blur();
                    }
                }}
            />
        </label>
    );
}
export function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    const [text, setText] = useState(value);
    useEffect(() => setText(value), [value]);
    return (
        <label>
            {label}
            <input
                value={text}
                aria-label={label}
                onChange={(event) => setText(event.target.value)}
                onBlur={() => {
                    if (text !== value) {
                        onChange(text);
                    }
                    setText(value);
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        event.currentTarget.blur();
                    }
                }}
            />
        </label>
    );
}
export function VectorField({ label, value, onChange }: { label: string; value: number[]; onChange: (value: number[]) => void }) {
    return (
        <div className="vector-field" role="group" aria-label={label}>
            <span>{label}</span>
            <div>
                {value.map((number, axis) => (
                    <NumberField
                        key={axis}
                        label={['X', 'Y', 'Z', 'Pitch', 'Yaw'][axis]}
                        value={number}
                        onChange={(next) => onChange(value.map((old, i) => (i === axis ? next : old)))}
                    />
                ))}
            </div>
        </div>
    );
}
function Choice({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
    return (
        <label>
            {label}
            <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
                {options.map((option) => (
                    <option key={option} value={option}>
                        {option || 'None'}
                    </option>
                ))}
            </select>
        </label>
    );
}

export const PARTICLES = [
    'END_ROD',
    'GLOW',
    'WAX_ON',
    'ELECTRIC_SPARK',
    'ENCHANT',
    'FLAME',
    'SMALL_FLAME',
    'SOUL_FIRE_FLAME',
    'ASH',
    'WHITE_ASH',
    'SMOKE',
    'CAMPFIRE_COSY_SMOKE',
    'SNOWFLAKE',
    'SPORE_BLOSSOM_AIR',
    'FALLING_SPORE_BLOSSOM',
    'CRIMSON_SPORE',
    'WARPED_SPORE',
    'TINTED_LEAVES',
    'CHERRY_LEAVES',
    'FIREFLY',
    'DRIPPING_WATER',
    'FALLING_WATER',
    'SPLASH',
    'BUBBLE',
    'PORTAL',
    'REVERSE_PORTAL',
];

export function Inspector({
    object,
    assets,
    world,
    readOnly,
    onChange,
    onFocus,
    onSnap,
}: {
    object: VisualObject;
    assets: AssetIndex;
    world: WorldMetadata;
    readOnly: boolean;
    onChange: (object: VisualObject) => void;
    onFocus: () => void;
    onSnap: () => void;
}) {
    const change = (fields: object) => onChange({ ...structuredClone(object), ...fields } as VisualObject);
    const materials = [...new Set(Object.keys(world.blockCounts).map((name) => name.split(':')[1].toUpperCase()))].sort();
    const anchor = objectCenter(object) ?? [0, 70, 0];
    const numeric = (field: string, label: string, step = 0.1) => (
        <NumberField
            key={field}
            label={label}
            value={(object as unknown as Record<string, number>)[field]}
            step={step}
            onChange={(value) => change({ [field]: value })}
        />
    );
    return (
        <section className="object-inspector">
            <div className="section-title">{object.type.toUpperCase()} INSPECTOR</div>
            <div className="button-group">
                <button onClick={onFocus}>Focus</button>
                <button disabled={readOnly || object.locked} onClick={onSnap}>
                    Move to probe
                </button>
            </div>
            <fieldset disabled={readOnly || object.locked}>
                <TextField label="Label" value={object.label} onChange={(label) => change({ label })} />
                <TextField label="Group" value={object.group ?? ''} onChange={(group) => change({ group })} />
                {isSpawn(object) && (
                    <>
                        <VectorField label="Feet position / pitch / yaw" value={object.position} onChange={(position) => change({ position })} />
                        {previewAdapter(assets).objectNote(object) && <p className="notice">{previewAdapter(assets).objectNote(object)}</p>}
                    </>
                )}
                {object.type === 'creature' && (
                    <>
                        {object.models.map((model, index) => (
                            <div key={index} className="collection-row">
                                <Choice
                                    label={`Model ${index + 1}`}
                                    value={model}
                                    options={assets.rigs.filter((rig) => rig.category !== 'bench').map((rig) => rig.id)}
                                    onChange={(value) => change({ models: object.models.map((old, i) => (i === index ? value : old)) })}
                                />
                                {object.models.length > 1 && <button onClick={() => change({ models: object.models.filter((_, i) => i !== index) })}>−</button>}
                            </div>
                        ))}
                        <button onClick={() => change({ models: [...object.models, object.models[0]] })}>+ Model</button>
                        <Choice label="Behavior" value={object.behavior} options={['STATIC', 'ROAM', 'HOP']} onChange={(behavior) => change({ behavior })} />
                        {numeric('count', 'Count per model', 1)}
                        {numeric('scale', 'Scale')}
                        <Choice
                            label="Movement animation"
                            value={object.movementAnimation}
                            options={Object.keys(assets.rigs.find((rig) => rig.id === object.models[0])?.animations ?? {})}
                            onChange={(movementAnimation) => change({ movementAnimation })}
                        />
                        <Choice
                            label="Idle animation"
                            value={object.idleAnimation ?? ''}
                            options={['', ...Object.keys(assets.rigs.find((rig) => rig.id === object.models[0])?.animations ?? {})]}
                            onChange={(idleAnimation) => {
                                const next = structuredClone(object);
                                if (idleAnimation) {
                                    next.idleAnimation = idleAnimation;
                                } else {
                                    delete next.idleAnimation;
                                }
                                onChange(next);
                            }}
                        />
                        {numeric('viewDistance', 'View distance', 1)}
                        {numeric('verticalOffset', 'Vertical offset')}
                        {numeric('yawOffset', previewAdapter(assets).ignoresCreatureYaw ? 'Yaw offset (runtime ignores)' : 'Yaw offset')}
                        {numeric('movementIntervalTicks', 'Update interval ticks', 1)}
                        {numeric('phaseSpacingTicks', 'Phase spacing ticks', 1)}
                        {object.behavior === 'ROAM' && numeric('routeTicks', 'Route ticks', 1)}
                        {object.behavior === 'HOP' && (
                            <>
                                {numeric('hopTicks', 'Hop ticks', 1)}
                                {numeric('pauseTicks', 'Pause ticks', 1)}
                                {numeric('hopHeight', 'Hop height')}
                            </>
                        )}
                        <Choice
                            label="Route source"
                            value={object.regions.length ? 'Regions' : object.anchors.length ? 'Anchors' : 'Habitat'}
                            options={['Regions', 'Anchors', 'Habitat']}
                            onChange={(source) => {
                                const next: CreatureObject = { ...structuredClone(object), regions: [], anchors: [] };
                                delete next.habitatMaterial;
                                delete next.habitatCount;
                                if (source === 'Regions') {
                                    next.regions = [
                                        {
                                            id: newId('region'),
                                            min: [anchor[0] - 0.5, anchor[1] - 0.05, anchor[2] - 0.5],
                                            max: [anchor[0] + 0.5, anchor[1] + 0.05, anchor[2] + 0.5],
                                        },
                                    ];
                                }
                                if (source === 'Anchors') {
                                    next.anchors = [positionAt(anchor)];
                                }
                                if (source === 'Habitat') {
                                    next.habitatMaterial = materials.includes('WATER') ? 'WATER' : materials[0];
                                    next.habitatCount = 1;
                                }
                                next.routeRadius = Math.max(0.1, next.routeRadius);
                                onChange(next);
                            }}
                        />
                        {object.regions.map((region, index) => (
                            <div className="collection" key={region.id}>
                                <strong>Region {index + 1} · horizontal ellipse</strong>
                                <VectorField
                                    label="Minimum"
                                    value={region.min}
                                    onChange={(min) => change({ regions: object.regions.map((old, i) => (i === index ? { ...old, min } : old)) })}
                                />
                                <VectorField
                                    label="Maximum"
                                    value={region.max}
                                    onChange={(max) => change({ regions: object.regions.map((old, i) => (i === index ? { ...old, max } : old)) })}
                                />
                                {object.regions.length > 1 && (
                                    <button onClick={() => change({ regions: object.regions.filter((_, i) => i !== index) })}>Remove region</button>
                                )}
                            </div>
                        ))}
                        {object.regions.length > 0 && (
                            <button onClick={() => change({ regions: [...object.regions, { ...structuredClone(object.regions[0]), id: newId('region') }] })}>
                                + Region
                            </button>
                        )}
                        {object.anchors.map((point, index) => (
                            <div className="collection" key={index}>
                                <VectorField
                                    label={`Anchor ${index + 1}`}
                                    value={point}
                                    onChange={(value) => change({ anchors: object.anchors.map((old, i) => (i === index ? value : old)) })}
                                />
                                {object.anchors.length > 1 && (
                                    <button onClick={() => change({ anchors: object.anchors.filter((_, i) => i !== index) })}>Remove anchor</button>
                                )}
                            </div>
                        ))}
                        {object.anchors.length > 0 && <button onClick={() => change({ anchors: [...object.anchors, positionAt(anchor)] })}>+ Anchor</button>}
                        {!object.regions.length && numeric('routeRadius', 'Route radius')}
                        {object.habitatMaterial && (
                            <>
                                <Choice
                                    label="Habitat material"
                                    value={object.habitatMaterial}
                                    options={materials}
                                    onChange={(habitatMaterial) => change({ habitatMaterial })}
                                />
                                {numeric('habitatCount', 'Habitat count', 1)}
                                <p className="notice">Habitat positions are sampled at random. Use explicit anchors or regions for an exact layout.</p>
                            </>
                        )}
                    </>
                )}
                {object.type === 'particle' && (
                    <>
                        <Choice
                            label="Particle"
                            value={object.particle}
                            options={[...new Set([...PARTICLES, object.particle])]}
                            onChange={(particle) => {
                                const next = { ...object, particle };
                                if (particle === 'TINTED_LEAVES') {
                                    next.data = { type: 'color', rgb: [150, 205, 90] };
                                } else {
                                    delete next.data;
                                }
                                onChange(next);
                            }}
                        />
                        <Choice
                            label="Emission source"
                            value={object.position ? 'Fixed position' : 'Scanned material'}
                            options={['Fixed position', 'Scanned material']}
                            onChange={(source) => {
                                const next = structuredClone(object);
                                if (source === 'Fixed position') {
                                    next.position = positionAt(anchor);
                                    delete next.scannedMaterial;
                                } else {
                                    delete next.position;
                                    next.scannedMaterial = materials[0];
                                }
                                onChange(next);
                            }}
                        />
                        {object.position && <VectorField label="Position" value={object.position} onChange={(position) => change({ position })} />}
                        {object.scannedMaterial && (
                            <>
                                <Choice
                                    label="Scanned material"
                                    value={object.scannedMaterial}
                                    options={materials}
                                    onChange={(scannedMaterial) => change({ scannedMaterial })}
                                />
                                {numeric('materialOffsetY', 'Material Y offset')}
                            </>
                        )}
                        {numeric('count', 'Particles per emission', 1)}
                        {numeric('activationChance', 'Probability per pulse', 0.05)}
                        {numeric('viewDistance', 'View distance', 1)}
                        {numeric('speed', 'Particle speed', 0.001)}
                        <VectorField label="Gaussian offset" value={object.offset} onChange={(offset) => change({ offset })} />
                        {object.data && (
                            <label>
                                Leaf tint
                                <input
                                    type="color"
                                    value={'#' + object.data.rgb.map((value) => value.toString(16).padStart(2, '0')).join('')}
                                    onChange={(event) =>
                                        change({
                                            data: { type: 'color', rgb: [1, 3, 5].map((offset) => parseInt(event.target.value.slice(offset, offset + 2), 16)) },
                                        })
                                    }
                                />
                            </label>
                        )}
                        <p className="notice">
                            Ordered effects share a cap of two emissions per player every ten ticks. Count is particles within one emission, not extra
                            emissions.
                        </p>
                    </>
                )}
                {object.type === 'bench' && (
                    <>
                        {object.visuals.map((visual, index) => (
                            <div className="collection" key={index}>
                                <Choice
                                    label={`Visual ${index + 1}`}
                                    value={visual.design}
                                    options={Object.keys(assets.setup.benchModels)}
                                    onChange={(design) => change({ visuals: object.visuals.map((old, i) => (i === index ? { ...old, design } : old)) })}
                                />
                                <VectorField
                                    label="Visual origin"
                                    value={visual.position}
                                    onChange={(position) => change({ visuals: object.visuals.map((old, i) => (i === index ? { ...old, position } : old)) })}
                                />
                                <NumberField
                                    label="Width scale"
                                    value={visual.widthScale}
                                    onChange={(widthScale) => change({ visuals: object.visuals.map((old, i) => (i === index ? { ...old, widthScale } : old)) })}
                                />
                                <button onClick={() => change({ visuals: object.visuals.filter((_, i) => i !== index) })}>Remove visual (keep seats)</button>
                            </div>
                        ))}
                        <button
                            disabled={!Object.keys(assets.setup.benchModels).length}
                            onClick={() =>
                                change({
                                    visuals: [
                                        ...object.visuals,
                                        { design: Object.keys(assets.setup.benchModels)[0], position: positionAt(anchor), widthScale: 1 },
                                    ],
                                })
                            }
                        >
                            + Bench visual
                        </button>
                        {object.seats.map((position, index) => (
                            <div className="collection" key={index}>
                                <VectorField
                                    label={`Independent seat ${index + 1}`}
                                    value={position}
                                    onChange={(value) => change({ seats: object.seats.map((old, i) => (i === index ? value : old)) })}
                                />
                                {object.seats.length > 1 && (
                                    <button onClick={() => change({ seats: object.seats.filter((_, i) => i !== index) })}>Remove seat</button>
                                )}
                            </div>
                        ))}
                        <button onClick={() => change({ seats: [...object.seats, positionAt(anchor)] })}>+ Seat</button>
                        <NumberField label="Seat hitbox width" value={object.hitbox[0]} onChange={(width) => change({ hitbox: [width, object.hitbox[1]] })} />
                        <NumberField
                            label="Seat hitbox height"
                            value={object.hitbox[1]}
                            onChange={(height) => change({ hitbox: [object.hitbox[0], height] })}
                        />
                    </>
                )}
            </fieldset>
            <small>
                {readOnly
                    ? 'Read-only reference or frozen review revision'
                    : object.locked
                      ? 'Unlock this object in the scene list to edit.'
                      : 'Fields save atomically on blur / Enter. Invalid edits are rejected.'}
            </small>
        </section>
    );
}
