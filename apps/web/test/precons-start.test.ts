// Every path that starts a game from the UI (D-137): outside the hidden test ids, a game starts
// only from a deck that is a valid Commander deck of fully supported cards. The cards are
// SYNTHETIC (invented "Synthetic ..." names from the import tests' fake Scryfall).
import { expect, test } from 'vitest';
import { checkPlayable, MemoryDeckStore } from '../src/import';
import { createPrecons, snapshotClient, startOptionsFor } from '../src/precons';
import { startFromForm } from '../src/ui/screens/menu-model';
import { harness, hundredCardText, supportedHundredText } from './import-helpers';
import {
  playableSnapshot,
  preconsOf,
  serviceFor,
  syntheticSnapshot,
  unsupportedSnapshot,
} from './precons-helpers';

const form = (humanDeck: string, aiDeck: string, seed = '5') => ({ humanDeck, aiDeck, seed });

// ------------------------------------------------------------ the menu

test('the menu starts a game from two prepared precons, with their cards and the seed', async () => {
  const precons = preconsOf([
    await playableSnapshot('synthetic-a'),
    await playableSnapshot('synthetic-b'),
  ]);
  const seen: unknown[] = [];
  const result = await startFromForm(
    async (options) => {
      seen.push(options);
    },
    form('synthetic-a', 'synthetic-b', ' 42 '),
    precons,
  );
  expect(result).toEqual({ started: true });
  expect(seen).toHaveLength(1);
  expect(seen[0]).toMatchObject({
    seed: 42,
    humanDeck: 'synthetic-a',
    aiDeck: 'synthetic-b',
    freeMulligan: true,
  });
  const options = seen[0] as { humanCards: { cards: unknown[] }; aiCards: { cards: unknown[] } };
  expect(options.humanCards.cards).toHaveLength(100);
  expect(options.aiCards.cards).toHaveLength(100);
});

test('an empty seed is picked when the game starts; a bad seed starts nothing', async () => {
  const precons = preconsOf([await playableSnapshot()]);
  const seeds: number[] = [];
  const start = async (options: { seed: number }) => {
    seeds.push(options.seed);
  };
  const ok = form('synthetic-playable', 'synthetic-playable', '');
  expect(await startFromForm(start, ok, precons, () => 123)).toEqual({ started: true });
  expect(seeds).toEqual([123]);
  for (const seed of ['abc', '4294967296', '-3', '1.5']) {
    expect(await startFromForm(start, { ...ok, seed }, precons)).toEqual({
      started: false,
      kind: 'seed',
    });
  }
  expect(seeds).toEqual([123]);
});

test('the menu starts nothing when no precon is installed or the form names none', async () => {
  let called = false;
  const start = async () => {
    called = true;
  };
  const none = preconsOf([]);
  expect(await startFromForm(start, form('', ''), none)).toEqual({
    started: false,
    kind: 'refused',
    reason: 'No precon is installed yet.',
  });
  expect(called).toBe(false);
});

test('the menu refuses a precon that is not a valid, fully supported deck, and every hidden test id', async () => {
  let called = false;
  const start = async () => {
    called = true;
  };
  const precons = preconsOf([await playableSnapshot(), await unsupportedSnapshot()]);
  const bad = await startFromForm(
    start,
    form('synthetic-playable', 'synthetic-unsupported'),
    precons,
  );
  expect(bad).toMatchObject({ started: false, kind: 'refused' });
  if (bad.started === false && bad.kind === 'refused') {
    expect(bad.reason).toMatch(/cannot run yet/);
  }
  // The hidden test decks are not reachable from the menu, even by a forged form.
  for (const id of ['white-knights', 'synthetic-triggers']) {
    const hidden = await startFromForm(start, form('synthetic-playable', id), precons);
    expect(hidden).toMatchObject({ started: false, kind: 'refused' });
  }
  expect(called).toBe(false);
});

// ------------------------------------------------------------ ?autostart=

test('autostart accepts hidden test ids by id, the one deliberate exception', async () => {
  const result = await startOptionsFor(preconsOf([]), {
    seed: 1,
    humanDeck: 'white-knights',
    aiDeck: 'swamp-forest',
    allowHidden: true,
  });
  expect(result).toEqual({
    ok: true,
    options: { seed: 1, humanDeck: 'white-knights', aiDeck: 'swamp-forest' },
  });
});

test('autostart also accepts real precon ids, prepared and checked; a real id wins over a hidden one', async () => {
  const precons = preconsOf([await playableSnapshot('white-knights')]);
  const mixed = await startOptionsFor(precons, {
    seed: 2,
    humanDeck: 'white-knights',
    aiDeck: 'swamp-forest',
    allowHidden: true,
  });
  expect(mixed.ok).toBe(true);
  if (!mixed.ok) return;
  expect(mixed.options.humanCards?.cards).toHaveLength(100);
  expect(mixed.options.aiCards).toBeUndefined();
});

test('autostart refuses an unknown id and a real precon that is not startable', async () => {
  const precons = preconsOf([await unsupportedSnapshot()]);
  const unknown = await startOptionsFor(precons, {
    seed: 1,
    humanDeck: 'no-such-deck',
    aiDeck: 'white-knights',
    allowHidden: true,
  });
  expect(unknown).toEqual({ ok: false, reason: 'There is no precon "no-such-deck".' });
  const invalid = await startOptionsFor(precons, {
    seed: 1,
    humanDeck: 'white-knights',
    aiDeck: 'synthetic-unsupported',
    allowHidden: true,
  });
  expect(invalid.ok).toBe(false);
});

// ------------------------------------------------------------ saved decks and the rule for an import

test('a saved deck is read again from its text and goes through the same rule', async () => {
  const store = new MemoryDeckStore(() => 1_800_000_000_000);
  const saved = await store.save({ name: 'Saved', text: hundredCardText() });
  const reopened = (await store.list()).find((deck) => deck.id === saved.id);
  if (reopened === undefined) throw new Error('the saved deck is missing');
  const report = await harness().service.run({ text: reopened.text, deckName: reopened.name });
  expect(checkPlayable(report).ok).toBe(false);

  const good = await store.save({ name: 'Good', text: supportedHundredText() });
  const goodReport = await harness().service.run({ text: good.text, deckName: good.name });
  expect(checkPlayable(goodReport).ok).toBe(true);
});

test('createPrecons and the service of the app agree on what a precon is', async () => {
  const snapshot = await syntheticSnapshot('synthetic-x', `${supportedHundredText()}\n`);
  const viaPrecons = await createPrecons([snapshot], serviceFor).prepare('synthetic-x');
  const viaImport = checkPlayable(
    await serviceFor(snapshotClient(snapshot.cards)).run({
      text: snapshot.decklist,
      deckName: snapshot.name,
    }),
  );
  expect(viaPrecons.ok).toBe(true);
  expect(viaImport.ok).toBe(true);
});

test('issue 7: a nonbasic card repeated in an import is not playable, and basic lands may repeat', async () => {
  // Still 100 cards: "2 Synthetic Vanilla 1" takes the place of Vanilla 1 and Vanilla 2.
  const repeated = supportedHundredText()
    .replace('1 Synthetic Vanilla 2\n', '')
    .replace('1 Synthetic Vanilla 1\n', '2 Synthetic Vanilla 1\n');
  const report = await harness().service.run({ text: repeated, deckName: 'Repeats' });
  const verdict = checkPlayable(report);
  expect(verdict.ok).toBe(false);
  if (!verdict.ok) expect(verdict.reason).toMatch(/Synthetic Vanilla 1/);
  // The 39 Forests of the list are legal repeats (CR 903.5b: basic lands are the exception).
  const legal = await harness().service.run({ text: supportedHundredText(), deckName: 'Legal' });
  expect(checkPlayable(legal).ok).toBe(true);
});
