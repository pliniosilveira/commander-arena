// Saved decks and edited precons as decks the game can start from (issues 108 and 93, D-215).
// Everything is SYNTHETIC: the cards are the invented "Synthetic ..." ones of the fake Scryfall.
import {
  createScryfallClient,
  MemoryCardCache,
  MemorySupportCache,
  type ScryfallClient,
} from '@commander-arena/cards';
import { describe, expect, test } from 'vitest';
import type { NewGameOptions } from '../src/game/protocol';
import { createImportService, MemoryDeckStore } from '../src/import';
import {
  blurbOf,
  createPrecons,
  type DeckLibrary,
  deckChoices,
  infoOf,
  layeredClient,
  savedDeckChoiceId,
  savedDeckIdOf,
  snapshotClient,
  startOptionsFor,
} from '../src/precons';
import { startFromForm } from '../src/ui/screens/menu-model';
import { createFakeScryfall, createVirtualClock } from './import-fake-scryfall';
import { hundredCardText, supportedHundredText } from './import-helpers';
import { playableSnapshot } from './precons-helpers';

function setup() {
  const clock = createVirtualClock();
  const fake = createFakeScryfall();
  const client: ScryfallClient = createScryfallClient({
    fetch: fake.fetch,
    now: clock.now,
    sleep: clock.sleep,
    cache: new MemoryCardCache({ now: clock.now }),
  });
  const supportCache = new MemorySupportCache();
  const serviceFor = (source: ScryfallClient) =>
    createImportService({ client: source, supportCache });
  const decks = new MemoryDeckStore(clock.now);
  const library: DeckLibrary = { decks, client };
  return { fake, client, decks, library, serviceFor };
}

/** The shipped list with one vanilla card swapped for another one. */
const swapped = (from: string, to: string): string =>
  `${supportedHundredText()}\n`.replace(`1 ${from}\n`, `1 ${to}\n`);

describe('the decks a player can pick', () => {
  const precon = infoOf({
    id: 'p',
    name: 'Precon P',
    blurb: 'Fast. Commander: Someone.',
    source: 's',
    decklist: 'Commander\n1 Synthetic Commander\n\nDeck\n1 Forest',
    cards: [],
  });
  const saved = (id: string, name: string, text: string) => ({
    id,
    name,
    text,
    savedAt: '2026-11-05T10:00:00.000Z',
  });

  test('precons come first, then the saved decks; a saved deck is picked as saved:<id>', () => {
    const choices = deckChoices(
      [precon],
      [],
      [saved('deck-1', 'Mine', 'Commander\n1 Synthetic Red Commander\n\nDeck\n99 Forest')],
    );
    expect(choices.map((c) => [c.id, c.kind, c.edited])).toEqual([
      ['p', 'precon', false],
      ['saved:deck-1', 'saved', false],
    ]);
    expect(choices[0]?.blurb).toBe('Fast.');
    expect(choices[1]?.commander).toBe('Synthetic Red Commander');
    expect(savedDeckIdOf('saved:deck-1')).toBe('deck-1');
    expect(savedDeckIdOf('p')).toBeNull();
    expect(savedDeckChoiceId('x')).toBe('saved:x');
    expect(blurbOf('A. Commander: B.')).toBe('A.');
  });

  test('an edited precon is marked and shows the commander of the edited list', () => {
    const edited = {
      ...saved('precon:p', 'Precon P', 'Commander\n1 Synthetic Red Commander\n\nDeck\n99 Forest'),
      preconId: 'p',
    };
    const [choice] = deckChoices([precon], [edited], []);
    expect(choice?.edited).toBe(true);
    expect(choice?.commander).toBe('Synthetic Red Commander');
  });
});

describe('the layered client', () => {
  test('answers from the first source and asks the second only for what it does not hold', async () => {
    const { fake, client } = setup();
    const snapshot = await playableSnapshot('p');
    const layered = layeredClient(snapshotClient(snapshot.cards), client);
    const before = fake.calls.length;
    const shipped = await layered.resolveNames(['Synthetic Vanilla 1', 'Forest']);
    expect(shipped.found.size).toBe(2);
    expect(fake.calls.length).toBe(before);

    const mixed = await layered.resolveNames(['Synthetic Vanilla 1', 'Synthetic Vanilla 90']);
    expect([...mixed.found.values()].map((card) => card.name).sort()).toEqual([
      'Synthetic Vanilla 1',
      'Synthetic Vanilla 90',
    ]);
    expect(fake.calls.length).toBeGreaterThan(before);
    const unknown = await layered.resolveNames(['Not A Card At All']);
    expect(unknown.notFound).toEqual(['Not A Card At All']);
  });

  test('offline, the shipped cards still resolve and the new one is a failure, not a throw', async () => {
    const offline = createFakeScryfall({ offline: true });
    const clock = createVirtualClock();
    const client = createScryfallClient({
      fetch: offline.fetch,
      now: clock.now,
      sleep: clock.sleep,
      cache: new MemoryCardCache({ now: clock.now }),
    });
    const snapshot = await playableSnapshot('p');
    const result = await layeredClient(snapshotClient(snapshot.cards), client).resolveNames([
      'Synthetic Vanilla 1',
      'Synthetic Vanilla 90',
    ]);
    expect([...result.found.values()].map((card) => card.name)).toEqual(['Synthetic Vanilla 1']);
    expect(result.failures.map((failure) => failure.requested)).toEqual(['Synthetic Vanilla 90']);
  });
});

describe('the deck store keeps edited precons apart from saved decks', () => {
  test('an override is not listed with the saved decks and does not replace a deck of the same name', async () => {
    const decks = new MemoryDeckStore(() => 7);
    const mine = await decks.save({ name: 'Precon P', text: 'mine' });
    const override = await decks.saveOverride('p', 'Precon P', 'edited');
    expect(override.preconId).toBe('p');
    expect((await decks.list()).map((deck) => deck.text)).toEqual(['mine']);
    expect((await decks.overrides()).map((deck) => deck.text)).toEqual(['edited']);
    expect(mine.id).not.toBe(override.id);

    await decks.saveOverride('p', 'Precon P', 'edited again');
    expect((await decks.overrides()).map((deck) => deck.text)).toEqual(['edited again']);
    await decks.removeOverride('p');
    expect(await decks.overrides()).toEqual([]);
    expect((await decks.list()).map((deck) => deck.text)).toEqual(['mine']);
  });
});

describe('a saved deck as the opponent or as the player (issue 108)', () => {
  test('a saved deck of supported cards starts for the opponent, with its cards', async () => {
    const { decks, library, serviceFor } = setup();
    const shipped = await playableSnapshot('p');
    const precons = createPrecons([shipped], serviceFor, library);
    const mine = await decks.save({ name: 'My saved deck', text: supportedHundredText() });
    const seen: NewGameOptions[] = [];
    const result = await startFromForm(
      async (options) => {
        seen.push(options);
      },
      { humanDeck: 'p', aiDeck: savedDeckChoiceId(mine.id), seed: '3' },
      precons,
    );
    expect(result).toEqual({ started: true });
    expect(seen[0]?.aiDeck).toBe(`saved:${mine.id}`);
    expect(seen[0]?.aiCards?.cards).toHaveLength(100);
  });

  test("a saved deck can be the player's own deck from the menu too", async () => {
    const { decks, library, serviceFor } = setup();
    const precons = createPrecons([await playableSnapshot('p')], serviceFor, library);
    const mine = await decks.save({ name: 'Mine', text: supportedHundredText() });
    const options = await startOptionsFor(precons, {
      seed: 1,
      humanDeck: savedDeckChoiceId(mine.id),
      aiDeck: 'p',
      allowHidden: false,
    });
    expect(options.ok).toBe(true);
    if (options.ok) expect(options.options.humanCards?.cards).toHaveLength(100);
  });

  test('a saved deck with a card the engine cannot run is refused for the opponent, with the reason', async () => {
    const { decks, library, serviceFor } = setup();
    const precons = createPrecons([await playableSnapshot('p')], serviceFor, library);
    const mine = await decks.save({ name: 'Odd deck', text: hundredCardText() });
    const started: unknown[] = [];
    const result = await startFromForm(
      async (options) => {
        started.push(options);
      },
      { humanDeck: 'p', aiDeck: savedDeckChoiceId(mine.id), seed: '3' },
      precons,
    );
    expect(started).toEqual([]);
    expect(result.started).toBe(false);
    if (!result.started && result.kind === 'refused') {
      expect(result.reason).toContain('"Odd deck" cannot be played');
      expect(result.reason).toMatch(/abilities the engine cannot run yet/);
    }
  });

  test('a saved deck that was deleted, or without a library, is refused', async () => {
    const { library, serviceFor } = setup();
    const shipped = await playableSnapshot('p');
    const gone = await createPrecons([shipped], serviceFor, library).prepare('saved:nope');
    expect(gone.ok).toBe(false);
    const none = await createPrecons([shipped], serviceFor).prepare('saved:nope');
    expect(none.ok).toBe(false);
  });
});

describe('a precon the player edited (issue 93)', () => {
  test('without an override the precon is the shipped list; the override replaces it for starting', async () => {
    const { decks, library, serviceFor } = setup();
    const precons = createPrecons([await playableSnapshot('p')], serviceFor, library);
    const first = await precons.prepare('p');
    expect(first.ok).toBe(true);

    // Swap a shipped card for a card the snapshot does not hold (looked up on Scryfall).
    await decks.saveOverride(
      'p',
      'SYNTHETIC precon p',
      swapped('Synthetic Vanilla 47', 'Synthetic Vanilla 48'),
    );
    const edited = await precons.prepare('p');
    expect(edited.ok).toBe(true);
    if (edited.ok) {
      expect(edited.deck.cards).toHaveLength(100);
      expect(edited.deck.cards.map((card) => card.name)).toContain('Synthetic Vanilla 48');
      expect(edited.deck.cards.map((card) => card.name)).not.toContain('Synthetic Vanilla 47');
    }

    await decks.removeOverride('p');
    const reset = await precons.prepare('p');
    expect(reset.ok).toBe(true);
    if (reset.ok)
      expect(reset.deck.cards.map((card) => card.name)).toContain('Synthetic Vanilla 47');
  });

  test('adding a card the engine cannot run makes the edited precon unplayable, and reset makes it playable again', async () => {
    const { decks, library, serviceFor } = setup();
    const precons = createPrecons([await playableSnapshot('p')], serviceFor, library);
    await decks.saveOverride(
      'p',
      'SYNTHETIC precon p',
      swapped('Synthetic Vanilla 47', 'Synthetic Oddity 1'),
    );
    const refused = await precons.prepare('p');
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toMatch(/abilities the engine cannot run yet/);

    await decks.removeOverride('p');
    expect((await precons.prepare('p')).ok).toBe(true);
  });

  test('a list that adds nothing new is read from the snapshot alone, without a connection', async () => {
    const { decks, fake, library, serviceFor } = setup();
    const precons = createPrecons([await playableSnapshot('p')], serviceFor, library);
    await decks.saveOverride('p', 'SYNTHETIC precon p', `${supportedHundredText()}\n`);
    const before = fake.calls.length;
    expect((await precons.prepare('p')).ok).toBe(true);
    expect(fake.calls.length).toBe(before);
  });

  test("the editor service reads the precon's own cards and the added ones", async () => {
    const { library, serviceFor } = setup();
    const precons = createPrecons([await playableSnapshot('p')], serviceFor, library);
    const report = await precons
      .editorService('p')
      .run({ text: swapped('Synthetic Vanilla 47', 'Synthetic Vanilla 49'), deckName: 'x' });
    expect(report.notFound).toEqual([]);
    expect(report.playable).toBe(true);
  });
});
