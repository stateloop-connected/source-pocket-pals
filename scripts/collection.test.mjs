import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CREATURES,
  RARITIES,
  SHINY_CHANCE,
  STORAGE_KEY,
  awardDrops,
  emptyCollection,
  readCollection,
  rollDrop,
} from '../app/gumball/collection.ts';

const drop = (id, creatureId = 'pal-01', shiny = false) => ({
  id,
  creatureId,
  shiny,
  isNew: false,
});
const total = (collection) =>
  Object.values(collection.counts).reduce((sum, n) => sum + n, 0);
const rarityAt = (n) => {
  const result = rollDrop(n, 0, 0.5, `rarity-${n}`);
  return CREATURES.find((creature) => creature.id === result.creatureId).rarity;
};

test('the original 36 stable creature IDs and save key remain compatible', () => {
  assert.equal(CREATURES.length, 36);
  assert.deepEqual(
    CREATURES.map((creature) => creature.id),
    Array.from(
      { length: 36 },
      (_, i) => `pal-${String(i + 1).padStart(2, '0')}`,
    ),
  );
  assert.equal(new Set(CREATURES.map((creature) => creature.name)).size, 36);
  assert.equal(STORAGE_KEY, 'pocket-pals.collection.v1');
  assert.equal(
    RARITIES.reduce((sum, rarity) => sum + rarity.chance, 0),
    100,
  );
});

test('rarity boundaries implement the advertised 60 / 26 / 11 / 3 odds', () => {
  const cases = [
    [0, 'common'],
    [0.6 - 1e-12, 'common'],
    [0.6, 'uncommon'],
    [0.86 - 1e-12, 'uncommon'],
    [0.86, 'rare'],
    [0.97 - 1e-12, 'rare'],
    [0.97, 'legendary'],
    [1 - Number.EPSILON, 'legendary'],
  ];
  for (const [roll, expected] of cases)
    assert.equal(rarityAt(roll), expected, `roll ${roll}`);
  const buckets = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
  for (let i = 0; i < 1000; i++) buckets[rarityAt((i + 0.5) / 1000)]++;
  assert.deepEqual(buckets, {
    common: 600,
    uncommon: 260,
    rare: 110,
    legendary: 30,
  });
});

test('every creature is reachable and species selection stays within its rarity', () => {
  const tierRolls = {
    common: 0.3,
    uncommon: 0.73,
    rare: 0.915,
    legendary: 0.985,
  };
  const reached = new Set();
  for (const [rarity, rarityRoll] of Object.entries(tierRolls)) {
    const pool = CREATURES.filter((creature) => creature.rarity === rarity);
    assert.ok(pool.length > 0);
    pool.forEach((creature, index) => {
      const result = rollDrop(
        rarityRoll,
        (index + 0.5) / pool.length,
        0.5,
        creature.id,
      );
      assert.equal(result.creatureId, creature.id);
      assert.equal(
        result.isNew,
        false,
        'discovery is decided when awarded, not when rolled',
      );
      reached.add(result.creatureId);
    });
    assert.equal(rollDrop(rarityRoll, 0, 0.5, 'first').creatureId, pool[0].id);
    assert.equal(
      rollDrop(rarityRoll, 1 - Number.EPSILON, 0.5, 'last').creatureId,
      pool.at(-1).id,
    );
  }
  assert.equal(reached.size, 36);
});

test('the independent 1-in-16 shiny roll does not change rarity or species', () => {
  assert.equal(SHINY_CHANCE, 1 / 16);
  for (const rarityRoll of [0, 0.6, 0.86, 0.97]) {
    for (const creatureRoll of [0, 0.5, 1 - Number.EPSILON]) {
      const normal = rollDrop(rarityRoll, creatureRoll, SHINY_CHANCE, 'normal');
      const shiny = rollDrop(
        rarityRoll,
        creatureRoll,
        SHINY_CHANCE - Number.EPSILON,
        'shiny',
      );
      assert.equal(normal.shiny, false);
      assert.equal(shiny.shiny, true);
      assert.equal(normal.creatureId, shiny.creatureId);
    }
  }
  const samples = Array.from({ length: 1600 }, (_, index) =>
    rollDrop(0.985, 0.5, (index + 0.5) / 1600, `shiny-${index}`),
  );
  assert.equal(samples.filter((result) => result.shiny).length, 100);
  assert.equal(rollDrop(0, 0, 0, 'zero').shiny, true);
});

test('a three-capsule draw auto-collects duplicates and each receipt is awarded once', () => {
  const initial = emptyCollection();
  const batch = [drop('one'), drop('two'), drop('three', 'pal-01', true)];
  const result = awardDrops(initial, [...batch, batch[1]]);
  assert.equal(result.awarded.length, 3);
  assert.equal(total(result.collection), 3);
  assert.equal(result.collection.counts['pal-01'], 3);
  assert.equal(result.collection.shinies['pal-01'], 1);
  assert.deepEqual(
    result.awarded.map((pal) => pal.isNew),
    [true, false, true],
  );
  assert.deepEqual(result.collection.receipts, ['one', 'two', 'three']);
  assert.deepEqual(
    initial,
    emptyCollection(),
    'awarding leaves the previous state untouched',
  );
  assert.deepEqual(
    batch.map((pal) => pal.isNew),
    [false, false, false],
    'input drops are not mutated',
  );

  const replay = awardDrops(result.collection, batch);
  assert.equal(
    replay.collection,
    result.collection,
    'a repeated callback does not create a new save',
  );
  assert.deepEqual(replay.awarded, []);
  const mixed = awardDrops(result.collection, [
    drop('one', 'pal-36'),
    drop('four', 'pal-02'),
  ]);
  assert.equal(total(mixed.collection), 4);
  assert.deepEqual(
    mixed.awarded.map((pal) => pal.id),
    ['four'],
  );
  assert.equal(
    mixed.collection.counts['pal-36'],
    undefined,
    'a reused ID cannot award a different creature',
  );
});

test('normal and shiny forms each have their own first-discovery status', () => {
  const result = awardDrops(emptyCollection(), [
    drop('shiny-first', 'pal-29', true),
    drop('shiny-again', 'pal-29', true),
    drop('normal-first', 'pal-29'),
    drop('normal-again', 'pal-29'),
  ]);
  assert.deepEqual(
    result.awarded.map((pal) => pal.isNew),
    [true, false, true, false],
  );
  assert.equal(result.collection.counts['pal-29'], 4);
  assert.equal(result.collection.shinies['pal-29'], 2);
});

test('v1 owned pals migrate without loss and an unclaimed capsule is recovered once', () => {
  const migrated = readCollection(
    JSON.stringify({
      version: 1,
      counts: { 'pal-01': 4, 'pal-29': 2 },
      pending: { id: 'waiting-capsule', creatureId: 'pal-29', isNew: true },
    }),
  );
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.counts, { 'pal-01': 4, 'pal-29': 3 });
  assert.deepEqual(migrated.shinies, {});
  assert.deepEqual(migrated.recent, [
    { ...drop('waiting-capsule', 'pal-29'), isNew: false },
  ]);
  assert.deepEqual(migrated.receipts, ['waiting-capsule']);
  const reloaded = readCollection(JSON.stringify(migrated));
  assert.deepEqual(reloaded, migrated);
  assert.deepEqual(
    awardDrops(reloaded, [drop('waiting-capsule', 'pal-29')]).awarded,
    [],
  );
  assert.equal(total(reloaded), 7);

  const firstDiscovery = readCollection(
    JSON.stringify({
      version: 1,
      counts: {},
      pending: { id: 'new-pal', creatureId: 'pal-36' },
    }),
  );
  assert.equal(firstDiscovery.recent[0].isNew, true);
  assert.equal(firstDiscovery.counts['pal-36'], 1);
  assert.deepEqual(
    readCollection(
      JSON.stringify({ version: 1, counts: { 'pal-01': 2 }, pending: null }),
    ),
    { ...emptyCollection(), counts: { 'pal-01': 2 } },
  );
});

test('reload preserves collected drops, shinies, receipts and newest result order', () => {
  let state = emptyCollection();
  for (let index = 0; index < 150; index++) {
    state = awardDrops(state, [
      drop(`receipt-${index}`, CREATURES[index % 36].id, index % 4 === 0),
    ]).collection;
  }
  assert.equal(total(state), 150);
  assert.equal(
    Object.values(state.shinies).reduce((sum, count) => sum + count, 0),
    38,
  );
  assert.equal(state.recent.length, 12);
  assert.equal(state.recent[0].id, 'receipt-138');
  assert.equal(state.recent.at(-1).id, 'receipt-149');
  assert.equal(state.receipts.length, 128);
  assert.equal(state.receipts[0], 'receipt-22');
  assert.deepEqual(readCollection(JSON.stringify(state)), state);
  assert.deepEqual(
    awardDrops(readCollection(JSON.stringify(state)), [
      drop('receipt-149', 'pal-06'),
    ]).awarded,
    [],
  );
});

test('malformed saves fail safely and invalid counts or creature references are discarded', () => {
  for (const raw of [
    null,
    '',
    'not json',
    'null',
    '[]',
    'true',
    '{}',
    '{"version":3,"counts":{}}',
    '{"version":2,"counts":[]}',
    '{"version":2,"counts":null}',
    '{"version":2,"counts":"oops"}',
  ]) {
    assert.deepEqual(readCollection(raw), emptyCollection(), String(raw));
  }
  const damaged = readCollection(
    JSON.stringify({
      version: 2,
      counts: {
        'pal-01': 2,
        'pal-02': -1,
        'pal-03': 3.5,
        'pal-04': '9',
        'pal-05': 0,
        'pal-06': 10000000,
        alien: 99,
      },
      shinies: {
        'pal-01': 7,
        'pal-02': -3,
        'pal-03': 0.5,
        'pal-06': 1,
        alien: 2,
      },
      receipts: ['valid', 'valid', '', 12, null, 'x'.repeat(160)],
      recent: [
        null,
        {},
        drop('unknown', 'alien'),
        { ...drop('bad-shiny'), shiny: 'yes' },
        { ...drop('valid'), isNew: 1 },
      ],
    }),
  );
  assert.deepEqual(damaged.counts, { 'pal-01': 2, 'pal-06': 999999 });
  assert.deepEqual(damaged.shinies, { 'pal-01': 2, 'pal-06': 1 });
  assert.deepEqual(damaged.receipts, ['valid']);
  assert.deepEqual(damaged.recent, [{ ...drop('valid'), isNew: true }]);
  for (const pending of [
    null,
    {},
    { id: '', creatureId: 'pal-01' },
    { id: 'bad', creatureId: 'alien' },
  ]) {
    assert.deepEqual(
      readCollection(JSON.stringify({ version: 1, counts: {}, pending })),
      emptyCollection(),
    );
  }
});

test('invalid random samples and capsule payloads cannot create awards', () => {
  for (const invalid of [
    NaN,
    -1,
    -Number.EPSILON,
    1,
    Infinity,
    -Infinity,
    undefined,
    '0.5',
  ]) {
    for (let position = 0; position < 3; position++) {
      const rolls = [0.5, 0.5, 0.5];
      rolls[position] = invalid;
      assert.throws(() => rollDrop(...rolls, 'invalid'), /Random inputs/);
    }
  }
  for (const invalidId of ['', 'x'.repeat(160), null, undefined, 4]) {
    assert.throws(() => rollDrop(0.5, 0.5, 0.5, invalidId), /Invalid draw id/);
  }
  for (const invalidDrop of [
    drop('', 'pal-01'),
    drop('alien', 'alien'),
    { ...drop('wrong-shiny'), shiny: 1 },
  ]) {
    const initial = emptyCollection();
    assert.throws(
      () => awardDrops(initial, [drop('valid-first'), invalidDrop]),
      /Invalid capsule/,
    );
    assert.deepEqual(
      initial,
      emptyCollection(),
      'a rejected batch cannot partially mutate a save',
    );
  }
});
