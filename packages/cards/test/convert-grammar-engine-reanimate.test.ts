// The Blight Curse deck, group "reanimate": the REAL Oracle text of Aberrant Return ("Put one, two, or three target creature cards from graveyards onto the battlefield under your
// control. Each of them enters with an additional -1/-1 counter on it."), Persist ("Return target nonlegendary creature card from your graveyard to the battlefield with a -1/-1 counter
// on it.") and Puppeteer Clique ("When this creature enters, put target creature card from an opponent's graveyard onto the battlefield under your control. It gains haste. At the
// beginning of your next end step, exile it." with Flying and Persist) from the golden corpus goes through the grammar as a card with no override, is defined in an engine scenario and is
// played through applyAction, so the nodes the parser writes for the real text are what the engine runs.
// Pins: CR 115.1 and 601.2c (one, two or three targets), CR 110.2a and 400.7 (the card is a new object under the controller's control), CR 614.1c and 122.6 (enters with counters),
// CR 205.4 (nonlegendary), CR 603.7 and 603.7c (the delayed exile is about that very object), CR 702.79a (Persist).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
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

const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const ELVES = 'Llanowar Elves'; // 1/1
const ANGEL = 'Serra Angel'; // 4/4
const LIBRARY = Array.from({ length: 8 }, () => 'Swamp');
const yard = (name: string, seat: 0 | 1) => ({ name, zone: 'graveyard' as const, seat });
const LEGEND = parsed('SYNTHETIC Legendary Bear', 'Legendary Creature — Bear', '', {
  manaCost: '{1}{G}',
  power: '3',
  toughness: '3',
  colors: ['G'],
});

describe('Aberrant Return', () => {
  const aberrant = real('Aberrant Return');
  const NAME = aberrant.name;

  /** Seat 0 has the sorcery and six Swamps; the Bears are in its graveyard, the Spider and the Elves in the opponent's. */
  const start = () =>
    scenario()
      .define(aberrant)
      .seat(0)
      .library(...LIBRARY)
      .hand(NAME)
      .battlefield('Swamp', { count: 6 })
      .graveyard(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .graveyard(SPIDER, ANGEL, ELVES)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid and its AST is the engine shape', () => {
    expect(validateCard(aberrant)).toEqual([]);
    const spell = aberrant.faces[0]?.spell;
    expect(spell?.targets).toEqual([
      {
        id: expect.any(String),
        what: { kind: 'object', filter: { zone: 'graveyard', types: ['creature'] } },
        min: 1,
        max: 3,
      },
    ]);
    expect(spell?.effect).toMatchObject({
      kind: 'moveToZone',
      to: 'battlefield',
      controller: 'you',
      withCounters: { counter: '-1/-1', count: 1 },
    });
  });

  test('three cards of different graveyards come back under the controller, each with a -1/-1 counter', () => {
    const g = start();
    g.act(0).cast(NAME, { targets: [yard(BEARS, 0), yard(SPIDER, 1), yard(ANGEL, 1)], pay: true });
    g.passAll();
    for (const card of [BEARS, SPIDER, ANGEL]) {
      g.expect.zone(card, 'battlefield', { seat: 0 });
      g.expect.counters(card, { '-1/-1': 1 });
    }
    g.expect.pt(BEARS, 1, 1);
    g.expect.pt(SPIDER, 1, 3);
    g.expect.pt(ANGEL, 3, 3);
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('a card that enters as a 0/0 with the counter dies at once and goes to its owner’s graveyard', () => {
    const g = start();
    g.act(0).cast(NAME, { targets: [yard(ELVES, 1)], pay: true });
    g.passAll();
    g.expect.noObject(ELVES, { zone: 'battlefield' });
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
  });

  test('one target is enough, and it is the only card that moves', () => {
    const g = start();
    g.act(0).cast(NAME, { targets: [yard(SPIDER, 1)], pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'battlefield', { seat: 0 });
    g.expect.counters(SPIDER, { '-1/-1': 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
  });

  test('a spell with no target is not cast, and a fourth target is refused', () => {
    const g = start();
    expect(() => g.act(0).cast(NAME, { targets: [], pay: true })).toThrow();
    const h = start();
    expect(() =>
      h.act(0).cast(NAME, {
        targets: [yard(BEARS, 0), yard(SPIDER, 1), yard(ANGEL, 1), yard(ELVES, 1)],
        pay: true,
      }),
    ).toThrow();
  });
});

describe('Persist', () => {
  const persist = real('Persist');
  const NAME = persist.name;

  const start = () =>
    scenario()
      .define(persist)
      .define(LEGEND)
      .seat(0)
      .library(...LIBRARY)
      .hand(NAME)
      .battlefield('Swamp', { count: 2 })
      .graveyard(BEARS, LEGEND.name)
      .seat(1)
      .library(...LIBRARY)
      .graveyard(SPIDER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid and its AST is the engine shape', () => {
    expect(validateCard(persist)).toEqual([]);
    const spell = persist.faces[0]?.spell;
    expect(spell?.targets).toEqual([
      {
        id: expect.any(String),
        what: {
          kind: 'object',
          filter: {
            zone: 'graveyard',
            types: ['creature'],
            notSupertypes: ['legendary'],
            controller: 'you',
          },
        },
      },
    ]);
    expect(spell?.effect).toMatchObject({
      kind: 'moveToZone',
      to: 'battlefield',
      withCounters: { counter: '-1/-1', count: 1 },
    });
  });

  test('a nonlegendary creature card of your graveyard returns with a -1/-1 counter', () => {
    const g = start();
    g.act(0).cast(NAME, { targets: [yard(BEARS, 0)], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.counters(BEARS, { '-1/-1': 1 });
    g.expect.pt(BEARS, 1, 1);
    g.expect.invariants();
  });

  test('a legendary creature card, and a card of an opponent’s graveyard, are not legal targets', () => {
    const g = start();
    expect(() => g.act(0).cast(NAME, { targets: [yard(LEGEND.name, 0)], pay: true })).toThrow();
    const h = start();
    expect(() => h.act(0).cast(NAME, { targets: [yard(SPIDER, 1)], pay: true })).toThrow();
  });
});

describe('Puppeteer Clique', () => {
  const clique = real('Puppeteer Clique');
  const NAME = clique.name;

  /** Seat 0 has the Clique in hand with five Swamps; the opponent's graveyard holds the Spider, its own the Bears. */
  const start = () =>
    scenario()
      .define(clique)
      .seat(0)
      .library(...LIBRARY)
      .hand(NAME)
      .battlefield('Swamp', { count: 5 })
      .graveyard(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .graveyard(SPIDER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid; its enters ability puts the card onto the battlefield, gives haste and exiles it at the end step', () => {
    expect(validateCard(clique)).toEqual([]);
    const triggered = clique.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(triggered).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'moveToZone', to: 'battlefield', controller: 'you' },
          { kind: 'grantKeyword', objects: { kind: 'moved' }, duration: 'permanent' },
          {
            kind: 'delayedTrigger',
            at: { step: 'endStep', whose: 'you' },
            effect: { kind: 'exile', objects: { kind: 'moved' } },
          },
        ],
      },
    });
  });

  test('the creature card of an opponent’s graveyard comes under the controller’s control with haste, and is exiled at the beginning of the controller’s end step', () => {
    const g = start();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'battlefield', { seat: 0 });
    g.expect.derived(SPIDER, { keywords: ['reach', 'haste'] });
    g.expect.counters(SPIDER, {});
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(SPIDER, 'exile', { seat: 1 });
    g.expect.noObject(SPIDER, { zone: 'battlefield' });
    g.expect.zone(NAME, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('only a card of an opponent’s graveyard is a target: with none there, the creature card of its controller’s own graveyard stays', () => {
    const g = scenario()
      .define(clique)
      .seat(0)
      .library(...LIBRARY)
      .hand(NAME)
      .battlefield('Swamp', { count: 5 })
      .graveyard(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(NAME, 'battlefield', { seat: 0 });
  });
});
