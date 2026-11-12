// The Niv-Mizzet deck (issue 25): the REAL Oracle text of Elixir of Immortality, Dragonologist and Thunderdrum Soloist (the corpus's golden.jsonl, taken from
// the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the
// parser writes for the real text are what the engine runs. The helper cards (a Dragon, a big instant, a copier, a cost reducer) are SYNTHETIC and are
// parsed too. Pins: CR 701.24c-d (shuffle objects into a library), CR 903.9a-b (a commander), CR 401.2, 701.20a (look and reveal), CR 205.3 (types),
// CR 601.2h (mana spent), CR 707.10 (a copy of a spell is not cast).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const BEARS = 'Grizzly Bears'; // {1}{G}, 2/2
const BOLT = 'Lightning Bolt';
const FILLER = Array.from({ length: 12 }, () => 'Mountain');

/** The card names of the objects, in the order given. */
const namesOf = (g: ScenarioGame, ids: readonly string[]): string[] =>
  ids.map((id) => {
    const card = g.state.objects[id as keyof typeof g.state.objects]?.card;
    const def = card === undefined || card === null ? undefined : g.state.cards[card]?.definition;
    return def === undefined ? '?' : (g.state.definitions[def]?.name ?? '?');
  });

// ---- Elixir of Immortality

describe('Elixir of Immortality: "{2}, {T}: You gain 5 life. Shuffle this artifact and your graveyard into their owner\'s library." (CR 701.24, 903.9)', () => {
  const elixir = real('Elixir of Immortality');
  const ELIXIR = elixir.name;
  const steal = parsed(
    'SYNTHETIC Parsed Steal Artifact',
    'Sorcery',
    'Gain control of target artifact.',
    {
      manaCost: '{2}{U}',
      colors: ['U'],
    },
  );

  const base = () =>
    scenario()
      .define(elixir)
      .seat(0)
      .life(20)
      .battlefield(ELIXIR, 'Mountain', 'Mountain')
      .graveyard(BEARS, BOLT, 'Plains')
      .library(...FILLER)
      .seat(1)
      .life(20)
      .graveyard('Llanowar Elves')
      .library(...FILLER);

  test('the card is valid', () => {
    expect(validateCard(elixir)).toEqual([]);
  });

  test('the controller gains 5 life; the artifact and the graveyard go into the library, which is shuffled', () => {
    const g = base().build();
    const before = g.state.seats[0]?.library.length ?? 0;
    g.act(0).activate(ELIXIR, { pay: true });
    g.passAll();
    g.expect.life(0, 25);
    g.expect.noObject(ELIXIR, { zone: 'battlefield' });
    g.expect.zone(ELIXIR, 'library', { seat: 0 });
    g.expect.zone(BEARS, 'library', { seat: 0 });
    g.expect.zone(BOLT, 'library', { seat: 0 });
    g.expect.zone('Plains', 'library', { seat: 0 });
    g.expect.noObject(BEARS, { zone: 'graveyard' });
    g.expect.librarySize(0, before + 4);
    g.expect.eventLog([{ kind: 'libraryShuffled', seat: 0 }]);
    g.expect.invariants();
  });

  test("another player's graveyard and library are left alone", () => {
    const g = base().build();
    g.act(0).activate(ELIXIR, { pay: true });
    g.passAll();
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 1 });
    g.expect.noEvent({ kind: 'libraryShuffled', seat: 1 });
    g.expect.life(1, 20);
  });

  test('the ability costs {2} and {T}: with one Mountain it cannot be activated', () => {
    const g = scenario()
      .define(elixir)
      .seat(0)
      .battlefield(ELIXIR, 'Mountain')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    expect(() => g.act(0).activate(ELIXIR, { pay: true })).toThrow();
  });

  test("controlled by a player who does not own it: it goes into its owner's library, the controller's graveyard into the controller's, and both libraries are shuffled", () => {
    const g = scenario()
      .define(elixir)
      .seat(0)
      .life(20)
      .battlefield('Mountain', 'Mountain')
      .graveyard(BEARS)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .battlefield(ELIXIR, { controller: 0 })
      .library(...FILLER)
      .build();
    g.act(0).activate({ name: ELIXIR, seat: 0 }, { pay: true });
    g.passAll();
    g.expect.life(0, 25);
    g.expect.zone(ELIXIR, 'library', { seat: 1 });
    g.expect.noObject(ELIXIR, { zone: 'library', seat: 0 });
    g.expect.zone(BEARS, 'library', { seat: 0 });
    g.expect.eventLog([{ kind: 'libraryShuffled', seat: 0 }]);
    g.expect.eventLog([{ kind: 'libraryShuffled', seat: 1 }]);
    g.expect.invariants();
  });

  test('a card stolen with a spell is shuffled into its owner library too', () => {
    const g = scenario()
      .define(elixir)
      .define(steal)
      .seat(0)
      .life(20)
      .hand(steal.name)
      .battlefield('Island', 'Island', 'Island', 'Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .life(20)
      .battlefield(ELIXIR)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(steal.name, { targets: [{ name: ELIXIR, seat: 1 }], pay: true });
    g.passAll();
    g.act(0).activate({ name: ELIXIR, seat: 0 }, { pay: true });
    g.passAll();
    g.expect.zone(ELIXIR, 'library', { seat: 1 });
    g.expect.noObject(ELIXIR, { zone: 'library', seat: 0 });
  });

  test('a commander in the graveyard is asked: its owner may send it to the command zone instead (CR 903.9b)', () => {
    const g = scenario()
      .define(elixir)
      .seat(0)
      .life(20)
      .battlefield(ELIXIR, 'Mountain', 'Mountain')
      .graveyard('Isamaru, Hound of Konda', { commander: true })
      .graveyard(BEARS)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).activate(ELIXIR, { pay: true });
    g.passAll();
    g.expect.pending('commanderZone', 0);
    g.act(0).sendToCommandZone();
    g.passAll();
    g.expect.zone('Isamaru, Hound of Konda', 'command', { seat: 0 });
    g.expect.zone(BEARS, 'library', { seat: 0 });
    g.expect.zone(ELIXIR, 'library', { seat: 0 });
    g.expect.eventLog([{ kind: 'libraryShuffled', seat: 0 }]);
    g.expect.invariants();
  });

  test('a commander in the graveyard may also be declined: it goes into the library', () => {
    const g = scenario()
      .define(elixir)
      .seat(0)
      .life(20)
      .battlefield(ELIXIR, 'Mountain', 'Mountain')
      .graveyard('Isamaru, Hound of Konda', { commander: true })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).activate(ELIXIR, { pay: true });
    g.passAll();
    g.expect.pending('commanderZone', 0);
    g.act(0).declineCommandZone();
    g.passAll();
    g.expect.zone('Isamaru, Hound of Konda', 'library', { seat: 0 });
    g.expect.zone(ELIXIR, 'library', { seat: 0 });
  });

  test('an empty graveyard still shuffles the library (CR 701.24d)', () => {
    const g = scenario()
      .define(elixir)
      .seat(0)
      .battlefield(ELIXIR, 'Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).activate(ELIXIR, { pay: true });
    g.passAll();
    g.expect.zone(ELIXIR, 'library', { seat: 0 });
    g.expect.eventLog([{ kind: 'libraryShuffled', seat: 0 }]);
  });
});

// ---- Dragonologist

describe('Dragonologist: "look at the top six cards ... an instant, sorcery, or Dragon card" and "Untapped Dragons you control have hexproof." (CR 401.2, 701.20a, 702.11)', () => {
  const dragonologist = real('Dragonologist');
  const NAME = dragonologist.name;
  const wyrm = parsed('SYNTHETIC Parsed Wyrm', 'Creature — Dragon', 'Flying', {
    manaCost: '{3}{R}{R}',
    colors: ['R'],
    power: '4',
    toughness: '4',
  });
  const SORCERY = 'Divination';
  const TOP = ['Plains', 'Plains'];

  /** Seat 0 casts Dragonologist with the six cards given on top of a library that has two more under them. */
  const cast = (six: readonly string[]): ScenarioGame => {
    const g = scenario()
      .define(dragonologist)
      .define(wyrm)
      .seat(0)
      .life(20)
      .hand(NAME)
      .battlefield('Island', 'Island', 'Island')
      .library(...six, 'Swamp', 'Swamp')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    return g;
  };
  const handOf = (g: ScenarioGame) => namesOf(g, g.state.seats[0]?.hand ?? []).sort();

  test('the card is valid', () => {
    expect(validateCard(dragonologist)).toEqual([]);
  });

  test.each([
    ['an instant', BOLT],
    ['a sorcery', SORCERY],
    ['a Dragon', wyrm.name],
  ])('%s can be taken into the hand, and the rest goes to the bottom', (_kind, taken) => {
    const g = cast([...TOP, BEARS, taken, 'Forest', 'Forest']);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(taken);
    expect(handOf(g)).toEqual([taken]);
    // The two cards that were not looked at are on top; the five that were not taken are under them.
    expect(g.state.seats[0]?.library).toHaveLength(7);
    const names = namesOf(g, g.state.seats[0]?.library ?? []);
    expect(names.slice(0, 2)).toEqual(['Swamp', 'Swamp']);
    expect([...names.slice(2)].sort()).toEqual(
      ['Forest', 'Forest', 'Plains', 'Plains', BEARS].sort(),
    );
    g.expect.invariants();
  });

  test('a creature that is not a Dragon cannot be taken, and nothing has to be', () => {
    const g = cast([...TOP, BEARS, BOLT, 'Forest', 'Forest']);
    g.expect.pending('chooseCards', 0);
    expect(() => g.act(0).chooseCards(BEARS)).toThrow();
    expect(() => g.act(0).chooseCards('Plains')).toThrow();
    g.act(0).chooseCards();
    expect(handOf(g)).toEqual([]);
    expect(g.state.seats[0]?.library).toHaveLength(8);
  });

  test('with no card of the three kinds among them, nothing is asked', () => {
    const g = cast([...TOP, BEARS, 'Forest', 'Forest', 'Forest']);
    expect(g.state.pending?.kind).toBe('priority');
    expect(handOf(g)).toEqual([]);
    expect(g.state.seats[0]?.library).toHaveLength(8);
  });

  describe('Untapped Dragons you control have hexproof (CR 702.11b)', () => {
    const board = (tapped: boolean) =>
      scenario()
        .define(dragonologist)
        .define(wyrm)
        .seat(0)
        .battlefield(NAME)
        .battlefield(wyrm.name, { tapped })
        .library(...FILLER)
        .seat(1)
        .library(...FILLER)
        .build();

    test('an untapped Dragon has hexproof', () => {
      board(false).expect.derived(wyrm.name, { keywords: ['flying', 'hexproof'] });
    });

    test('a tapped Dragon does not', () => {
      board(true).expect.derived(wyrm.name, { keywords: ['flying'] });
    });

    test('Dragonologist itself, a Human Wizard, does not have it', () => {
      board(false).expect.derived(NAME, { keywords: [] });
    });

    test("an opponent's Bolt cannot target an untapped Dragon but can target a tapped one", () => {
      const untapped = scenario()
        .define(dragonologist)
        .define(wyrm)
        .seat(0)
        .battlefield(NAME, wyrm.name)
        .library(...FILLER)
        .seat(1)
        .hand(BOLT)
        .battlefield('Mountain')
        .library(...FILLER)
        .at('precombatMain', { active: 1 })
        .build();
      expect(() =>
        untapped.act(1).cast(BOLT, { targets: [{ name: wyrm.name, seat: 0 }], pay: true }),
      ).toThrow();
      const tapped = scenario()
        .define(dragonologist)
        .define(wyrm)
        .seat(0)
        .battlefield(NAME)
        .battlefield(wyrm.name, { tapped: true })
        .library(...FILLER)
        .seat(1)
        .hand(BOLT)
        .battlefield('Mountain')
        .library(...FILLER)
        .at('precombatMain', { active: 1 })
        .build();
      tapped.act(1).cast(BOLT, { targets: [{ name: wyrm.name, seat: 0 }], pay: true });
      tapped.passAll();
      tapped.expect.damage({ name: wyrm.name, seat: 0 }, 3);
    });
  });
});

// ---- Thunderdrum Soloist

describe('Thunderdrum Soloist: "Opus — ... If five or more mana was spent to cast that spell, ... instead." (CR 601.2h, 707.10)', () => {
  const soloist = real('Thunderdrum Soloist');
  const NAME = soloist.name;
  const big = (type: 'Instant' | 'Sorcery') =>
    parsed(`SYNTHETIC Parsed Big ${type}`, type, 'You gain 2 life.', {
      manaCost: '{4}{R}',
      colors: ['R'],
    });
  const bigInstant = big('Instant');
  const bigSorcery = big('Sorcery');
  const smallSorcery = parsed('SYNTHETIC Parsed Small Sorcery', 'Sorcery', 'You gain 2 life.', {
    manaCost: '{1}{R}',
    colors: ['R'],
  });
  const discount = parsed(
    'SYNTHETIC Parsed Discount',
    'Enchantment',
    'Instant and sorcery spells you cast cost {1} less to cast.',
    { manaCost: '{1}{R}', colors: ['R'] },
  );
  const copier = parsed(
    'SYNTHETIC Parsed Copier',
    'Artifact',
    '{1}, {T}: Copy target instant or sorcery spell you control.',
    { manaCost: '{2}' },
  );
  const MOUNTAINS = Array.from({ length: 6 }, () => 'Mountain');

  const setup = (...extra: CardDefinition[]) => {
    let b = scenario().define(soloist).define(bigInstant).define(bigSorcery).define(smallSorcery);
    for (const card of extra) b = b.define(card);
    return b;
  };
  const game = (
    hand: readonly string[],
    battlefield: readonly string[] = [],
    ...extra: CardDefinition[]
  ) =>
    setup(...extra)
      .seat(0)
      .life(20)
      .hand(...hand)
      .battlefield(NAME, ...MOUNTAINS, ...battlefield)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .battlefield(BEARS)
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('the card is valid and reads Reach too', () => {
    expect(validateCard(soloist)).toEqual([]);
    expect(soloist.faces[0]?.abilities.some((a) => a.kind === 'keyword')).toBe(true);
  });

  test('a five-mana instant: three damage to the opponent instead of one', () => {
    const g = game([bigInstant.name]);
    g.act(0).cast(bigInstant.name, { pay: true });
    g.passAll();
    g.expect.life(1, 17);
    g.expect.life(0, 22);
  });

  test('a two-mana sorcery: one damage', () => {
    const g = game([smallSorcery.name]);
    g.act(0).cast(smallSorcery.name, { pay: true });
    g.passAll();
    g.expect.life(1, 19);
  });

  test('a spell that costs {R}: one damage', () => {
    const g = game([BOLT]);
    g.act(0).cast(BOLT, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 19);
  });

  test('a five-mana sorcery works the same: three damage', () => {
    const g = game([bigSorcery.name]);
    g.act(0).cast(bigSorcery.name, { pay: true });
    g.passAll();
    g.expect.life(1, 17);
  });

  test('a cost reduced to four mana: the five-mana spell deals one damage, for the mana spent counts (CR 601.2h)', () => {
    const g = game([bigInstant.name], [discount.name], discount);
    g.act(0).cast(bigInstant.name, { pay: true });
    g.passAll();
    g.expect.life(1, 19);
    g.expect.life(0, 22);
  });

  test('two cost reducers: three mana spent, one damage; the mana that is not spent does not count', () => {
    const g = game([bigInstant.name], [discount.name, discount.name], discount);
    g.act(0).cast(bigInstant.name, { pay: true });
    g.passAll();
    g.expect.life(1, 19);
  });

  test('a copy of the spell is not cast, so it triggers nothing; the cast spell triggered once', () => {
    const g = game([bigInstant.name], [copier.name], copier);
    g.act(0).cast(bigInstant.name, { pay: true });
    // The Soloist trigger is above the spell; let it resolve first, then copy the spell that is left on the stack.
    g.pass();
    g.pass(1);
    g.expect.life(1, 17);
    g.act(0).activate(copier.name, { targets: [bigInstant.name], pay: true });
    g.passAll();
    // Both the spell and its copy resolved: two lots of 2 life; the opponent lost only the three damage of the cast.
    g.expect.life(0, 24);
    g.expect.life(1, 17);
    g.expect.invariants();
  });

  test('a noncreature spell that is neither an instant nor a sorcery does not trigger it', () => {
    const g = game([discount.name], [], discount);
    g.act(0).cast(discount.name, { pay: true });
    g.passAll();
    g.expect.life(1, 20);
  });
});
