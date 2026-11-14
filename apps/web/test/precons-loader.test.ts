// The real precons of the app (D-137): the snapshot files, the offline client, the deck builder
// and the rule that only a valid, fully supported precon can start. The decks here are SYNTHETIC
// (invented "Synthetic ..." cards); the shipped snapshots are tested as they are, whatever they
// hold, and with none installed those tests still pass.
import { fromSnapshotCard, normalizeNameKey, parseDecklist } from '@commander-arena/cards';
import { expect, test } from 'vitest';
import { GameHost } from '../src/game/host';
import {
  buildPreconDeck,
  createPrecons,
  loadSnapshots,
  SHIPPED,
  snapshotClient,
} from '../src/precons';
import {
  playableSnapshot,
  preconsOf,
  serviceFor,
  syntheticSnapshot,
  unsupportedSnapshot,
} from './precons-helpers';

// The glob mechanism, over a SYNTHETIC folder (a two-card snapshot that is not a playable deck).
const fixtures = import.meta.glob('./fixtures/precons/*.json', { eager: true, import: 'default' });

test('the glob reads every json file of a folder; none is fine', () => {
  const loaded = loadSnapshots(fixtures);
  expect(loaded.problems).toEqual([]);
  expect(loaded.snapshots.map((s) => s.id)).toEqual(['synthetic-tiny']);
  expect(loadSnapshots({})).toEqual({ snapshots: [], problems: [] });
  expect(createPrecons([], serviceFor).list).toEqual([]);
});

test('a snapshot of the folder is listed with its commander, and is not startable when it is not a deck', async () => {
  const precons = createPrecons(loadSnapshots(fixtures).snapshots, serviceFor);
  expect(precons.list).toHaveLength(1);
  expect(precons.list[0]).toMatchObject({
    id: 'synthetic-tiny',
    name: 'SYNTHETIC tiny precon',
    commander: 'Synthetic Commander',
  });
  const result = await precons.prepare('synthetic-tiny');
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.reason).toMatch(/cannot be played: .*100/);
});

test('loadSnapshots skips and reports a bad file, a wrong file name and a repeated id', async () => {
  const good = await playableSnapshot('synthetic-a');
  const loaded = loadSnapshots({
    './snapshots/synthetic-b.json': { ...good, id: 'synthetic-b' },
    './snapshots/synthetic-a.json': good,
    './snapshots/broken.json': { id: 'broken' },
    './snapshots/wrong-name.json': good,
    './other/synthetic-a.json': good,
  });
  expect(loaded.snapshots.map((s) => s.id)).toEqual(['synthetic-a', 'synthetic-b']);
  expect(loaded.problems).toHaveLength(3);
  expect(loaded.problems.join('\n')).toMatch(/broken\.json: not a precon snapshot/);
  expect(loaded.problems.join('\n')).toMatch(/wrong-name\.json: the file name does not match/);
  expect(loaded.problems.join('\n')).toMatch(/used twice/);
});

test('the snapshot client resolves like import: full name, face name, front face, never fuzzy', async () => {
  const snapshot = await syntheticSnapshot(
    'synthetic-three',
    'Commander\n1 Synthetic Commander\n\nDeck\n1 Synthetic Daybreak // Synthetic Nightfall\n',
  );
  const client = snapshotClient(snapshot.cards);
  const names = [
    'Synthetic Daybreak',
    'synthetic   commander',
    'Synthetic Daybreak // Synthetic Nightfall',
    'Nope',
  ];
  const result = await client.resolveNames(names);
  expect(result.notFound).toEqual(['Nope']);
  expect(result.fuzzy).toEqual([]);
  expect(result.failures).toEqual([]);
  const daybreak = result.found.get(normalizeNameKey('Synthetic Daybreak'));
  expect(daybreak?.name).toBe('Synthetic Daybreak // Synthetic Nightfall');
  expect(result.found.get(normalizeNameKey('Synthetic Daybreak // Synthetic Nightfall'))).toBe(
    daybreak,
  );
  expect(result.found.get('synthetic commander')?.fetchedAt).toBe(0);
});

test('a valid, fully supported precon becomes a 100-card engine deck, once, with no network', async () => {
  let made = 0;
  const precons = createPrecons([await playableSnapshot()], (client) => {
    made += 1;
    return serviceFor(client);
  });
  const first = await precons.prepare('synthetic-playable');
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  expect(first.deck.cards).toHaveLength(100);
  expect(first.deck.commanders).toEqual([0]);
  expect(first.deck.cards[0]?.name).toBe('Synthetic Commander');
  expect(first.deck.cards.every((card) => card.support === 'supported')).toBe(true);
  expect(await precons.prepare('synthetic-playable')).toBe(first);
  expect(made).toBe(1);
});

test('a precon with an unsupported card, or that is not a legal deck, or has a missing name, is refused with the reason', async () => {
  const unsupported = await buildPreconDeck(await unsupportedSnapshot(), serviceFor);
  expect(unsupported.ok).toBe(false);
  if (!unsupported.ok) expect(unsupported.reason).toMatch(/cannot be played: .*cannot run yet/);

  const good = await playableSnapshot();
  const twice = await buildPreconDeck(
    { ...good, decklist: `${good.decklist}1 Synthetic Vanilla 1\n` },
    serviceFor,
  );
  expect(twice.ok).toBe(false);
  if (!twice.ok) expect(twice.reason).toMatch(/cannot be played/);

  const missing = await buildPreconDeck(
    { ...good, cards: good.cards.filter((card) => card.name !== 'Synthetic Vanilla 1') },
    serviceFor,
  );
  expect(missing.ok).toBe(false);
  if (!missing.ok) expect(missing.reason).toMatch(/not found/);

  const noCommander = await buildPreconDeck(
    { ...good, decklist: good.decklist.replace('Commander\n1 Synthetic Commander\n', '') },
    serviceFor,
  );
  expect(noCommander.ok).toBe(false);
  if (!noCommander.ok) expect(noCommander.reason).toMatch(/commander/);
});

test('an unknown precon id is refused', async () => {
  const precons = preconsOf([]);
  const result = await precons.prepare('zombies');
  expect(result).toEqual({ ok: false, info: null, reason: 'There is no precon "zombies".' });
});

test('a game starts from prepared precons for both seats', async () => {
  const precons = preconsOf([await playableSnapshot()]);
  const deck = await precons.prepare('synthetic-playable');
  if (!deck.ok) throw new Error(deck.reason);
  const host = new GameHost({ clock: () => 0 });
  const started = await host.newGame({
    seed: 3,
    humanDeck: 'synthetic-playable',
    aiDeck: 'synthetic-playable',
    humanCards: deck.deck,
    aiCards: deck.deck,
  });
  expect(started.summary.unsupported).toEqual([]);
  expect(started.snapshot.error).toBeNull();
  // A real precon id with no prepared cards is not a hidden test deck: the host refuses it.
  await expect(
    new GameHost({ clock: () => 0 }).newGame({ seed: 3, humanDeck: 'zombies', aiDeck: 'zombies' }),
  ).rejects.toThrow(/Unknown hidden test deck: zombies/);
});

// ------------------------------------------------------------ the snapshots that ship

test('every shipped snapshot is read without problems and listed', () => {
  expect(SHIPPED.problems).toEqual([]);
  const precons = createPrecons(SHIPPED.snapshots, serviceFor);
  expect(precons.list.map((info) => info.id)).toEqual(SHIPPED.snapshots.map((s) => s.id));
});

test.each(SHIPPED.snapshots)('shipped $id is a legal, fully supported deck', async (snapshot) => {
  const result = await buildPreconDeck(snapshot, serviceFor);
  if (!result.ok)
    throw new Error(`Shipped precon "${snapshot.id}" is not startable: ${result.reason}`);
  expect(result.deck.cards).toHaveLength(100);
  // The snapshot holds exactly the cards of its list, the decklist replays through the parser.
  expect(parseDecklist(snapshot.decklist).errors).toEqual([]);
  expect(snapshot.cards.every((card) => fromSnapshotCard(card).fetchedAt === 0)).toBe(true);
});

const zombies = SHIPPED.snapshots.find((snapshot) => snapshot.id === 'zombies');

test.skipIf(zombies === undefined)(
  'the shipped Zombies precon is legal and fully supported (fails loudly when it is not)',
  async () => {
    if (zombies === undefined) return;
    const result = await buildPreconDeck(zombies, serviceFor);
    if (!result.ok) throw new Error(`The Zombies precon cannot start: ${result.reason}`);
    expect(result.deck.cards).toHaveLength(100);
    expect(result.info.commander).toBe('Ghoulcaller Gisa');
  },
);
