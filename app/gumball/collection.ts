export const RARITIES = [
  { id: 'common', label: 'Common', chance: 60, color: '#829771' },
  { id: 'uncommon', label: 'Uncommon', chance: 26, color: '#4d9a9f' },
  { id: 'rare', label: 'Rare', chance: 11, color: '#9c78bf' },
  { id: 'legendary', label: 'Legendary', chance: 3, color: '#cf9a32' },
] as const;
export type Rarity = (typeof RARITIES)[number]['id'];
export const SHINY_CHANCE = 1 / 16;
const catalog = [
  ['Mochi', 'Ember', 'common'],
  ['Miso', 'Lagoon', 'uncommon'],
  ['Button', 'Meadow', 'common'],
  ['Sprout', 'Meadow', 'common'],
  ['Nimbus', 'Daydream', 'uncommon'],
  ['Cinder', 'Ember', 'rare'],
  ['Wisp', 'Moonlight', 'uncommon'],
  ['Kiki', 'Moonlight', 'uncommon'],
  ['Bramble', 'Meadow', 'common'],
  ['Cosmo', 'Moonlight', 'legendary'],
  ['Fern', 'Meadow', 'uncommon'],
  ['Pebble', 'Meadow', 'common'],
  ['Pip', 'Meadow', 'common'],
  ['Toast', 'Ember', 'common'],
  ['Bloop', 'Lagoon', 'common'],
  ['Fable', 'Daydream', 'common'],
  ['Clover', 'Meadow', 'common'],
  ['Petal', 'Meadow', 'uncommon'],
  ['Moss', 'Meadow', 'common'],
  ['Lumi', 'Daydream', 'rare'],
  ['Tansy', 'Meadow', 'rare'],
  ['Jelly', 'Lagoon', 'uncommon'],
  ['Nori', 'Meadow', 'common'],
  ['Prism', 'Lagoon', 'rare'],
  ['Dewdrop', 'Meadow', 'common'],
  ['Mallow', 'Daydream', 'uncommon'],
  ['Peeko', 'Meadow', 'common'],
  ['Maple', 'Ember', 'uncommon'],
  ['Orbit', 'Moonlight', 'legendary'],
  ['Tango', 'Lagoon', 'uncommon'],
  ['Acorn', 'Meadow', 'common'],
  ['Frost', 'Lagoon', 'rare'],
  ['Fizz', 'Lagoon', 'common'],
  ['Bean', 'Meadow', 'common'],
  ['Moonbean', 'Moonlight', 'rare'],
  ['Stardust', 'Moonlight', 'legendary'],
];
export const CREATURES = catalog.map(([name, family, rarity], index) => ({
  id: `pal-${String(index + 1).padStart(2, '0')}`,
  index,
  name,
  family,
  rarity: rarity as Rarity,
}));
export type Creature = (typeof CREATURES)[number];
// Keep the original storage key so earlier collections migrate without losing pals.
export const STORAGE_KEY = 'pocket-pals.collection.v1';
export type Drop = {
  id: string;
  creatureId: string;
  shiny: boolean;
  isNew: boolean;
};
export type Collection = {
  version: 2;
  counts: Record<string, number>;
  shinies: Record<string, number>;
  recent: Drop[];
  receipts: string[];
};
export const emptyCollection = (): Collection => ({
  version: 2,
  counts: {},
  shinies: {},
  recent: [],
  receipts: [],
});
const known = (id: unknown): id is string =>
  typeof id === 'string' && CREATURES.some((c) => c.id === id);
const validId = (id: unknown): id is string =>
  typeof id === 'string' && id.length > 0 && id.length < 160;
export function readCollection(raw: string | null): Collection {
  if (!raw) return emptyCollection();
  try {
    const d = JSON.parse(raw);
    if (
      ![1, 2].includes(d?.version) ||
      !d.counts ||
      typeof d.counts !== 'object' ||
      Array.isArray(d.counts)
    )
      return emptyCollection();
    const counts: Record<string, number> = {},
      shinies: Record<string, number> = {};
    for (const { id } of CREATURES) {
      if (Number.isSafeInteger(d.counts[id]) && d.counts[id] > 0)
        counts[id] = Math.min(999999, d.counts[id]);
      if (Number.isSafeInteger(d.shinies?.[id]) && d.shinies[id] > 0)
        shinies[id] = Math.min(counts[id] || 0, d.shinies[id]);
    }
    if (d.version === 1) {
      // An old unclaimed capsule is awarded once when the v2 record is first saved.
      const p = d.pending;
      if (p && validId(p.id) && known(p.creatureId)) {
        const drop = {
          id: p.id,
          creatureId: p.creatureId,
          shiny: false,
          isNew: !counts[p.creatureId],
        };
        counts[p.creatureId] = Math.min(
          999999,
          (counts[p.creatureId] || 0) + 1,
        );
        return {
          version: 2,
          counts,
          shinies,
          recent: [drop],
          receipts: [p.id],
        };
      }
      return { version: 2, counts, shinies, recent: [], receipts: [] };
    }
    const receipts = Array.isArray(d.receipts)
      ? [...new Set<string>(d.receipts.filter(validId))].slice(-128)
      : [];
    const recent: Drop[] = Array.isArray(d.recent)
      ? d.recent
          .filter(
            (p: Drop) =>
              validId(p?.id) &&
              known(p?.creatureId) &&
              typeof p.shiny === 'boolean',
          )
          .slice(-12)
          .map((p: Drop) => ({ ...p, isNew: !!p.isNew }))
      : [];
    return { version: 2, counts, shinies, recent, receipts };
  } catch {
    return emptyCollection();
  }
}
export function rollDrop(
  rarityRoll: number,
  creatureRoll: number,
  shinyRoll: number,
  id: string,
): Drop {
  for (const n of [rarityRoll, creatureRoll, shinyRoll])
    if (!Number.isFinite(n) || n < 0 || n >= 1)
      throw Error('Random inputs must be in [0,1).');
  if (!validId(id)) throw Error('Invalid draw id.');
  let cumulative = 0;
  const rarity = RARITIES.find((r) => {
    cumulative += r.chance;
    return rarityRoll * 100 < cumulative;
  })!.id;
  const pool = CREATURES.filter((c) => c.rarity === rarity);
  return {
    id,
    creatureId: pool[Math.floor(creatureRoll * pool.length)].id,
    shiny: shinyRoll < SHINY_CHANCE,
    isNew: false,
  };
}
export function awardDrops(
  collection: Collection,
  drops: Drop[],
): { collection: Collection; awarded: Drop[] } {
  const counts = { ...collection.counts },
    shinies = { ...collection.shinies },
    seen = new Set(collection.receipts),
    awarded: Drop[] = [];
  for (const drop of drops) {
    if (
      !validId(drop.id) ||
      !known(drop.creatureId) ||
      typeof drop.shiny !== 'boolean'
    )
      throw Error('Invalid capsule.');
    if (seen.has(drop.id)) continue;
    const id = drop.creatureId,
      isNew = drop.shiny ? !shinies[id] : !(counts[id] - (shinies[id] || 0));
    counts[id] = Math.min(999999, (counts[id] || 0) + 1);
    if (drop.shiny) shinies[id] = Math.min(counts[id], (shinies[id] || 0) + 1);
    seen.add(drop.id);
    awarded.push({ ...drop, isNew });
  }
  if (!awarded.length) return { collection, awarded };
  return {
    collection: {
      version: 2,
      counts,
      shinies,
      recent: [...collection.recent, ...awarded].slice(-12),
      receipts: [...seen].slice(-128),
    },
    awarded,
  };
}
