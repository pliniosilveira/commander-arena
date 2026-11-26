// Case of the Shifting Visage, a Case (CR 719) with "To solve" and "Solved" (CR 702.169): the REAL Oracle text of the golden corpus goes through the grammar as a card with no override,
// is defined in an engine scenario and is played through applyAction.
//   At the beginning of your upkeep, surveil 1.
//   To solve -- There are fifteen or more cards in your graveyard.
//   Solved -- Whenever you cast a nonlegendary creature spell, copy that spell. (The copy becomes a token.)
// Pins: CR 719.3a (To solve: your end step, the condition and not solved), CR 719.3b (the designation stays until the Case leaves the battlefield, 400.7), CR 702.169c (a Solved triggered
// ability triggers only if the Case is solved), CR 707.10f (the copy of a permanent spell becomes a token), CR 603.4 (intervening if).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

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

const CASE = real('Case of the Shifting Visage');
const NAME = CASE.name;
const BEARS = 'Grizzly Bears';
const ISAMARU = 'Isamaru, Hound of Konda';
const FILL = (n: number): string[] => Array.from({ length: n }, () => 'Island');
const LIBRARY = Array.from({ length: 12 }, () => 'Island');

type Game = ReturnType<ReturnType<typeof scenario>['build']>;

/** Walk to `step` of the next turn of `seat`, keeping every card the upkeep surveil looks at on top (the Case's first ability). */
function toNext(g: Game, step: 'precombatMain' | 'end', seat: number): void {
  const start = g.state.turn.number;
  for (let i = 0; i < 400; i += 1) {
    const d = g.state.pending;
    const here = g.state.turn;
    if (
      here.number > start &&
      here.step === step &&
      here.activeSeat === seat &&
      d?.kind === 'priority'
    ) {
      return;
    }
    if (d?.kind === 'arrangeCards') {
      g.choose({ kind: 'arrangeCards', top: d.cards, other: [] });
    } else if (d?.kind === 'priority') {
      g.pass();
    } else {
      throw new Error(`unexpected decision ${d?.kind ?? 'none'}`);
    }
  }
  throw new Error('did not arrive');
}

test('the card is a valid Case: three abilities, the last two read through the Case words', () => {
  expect(validateCard(CASE)).toEqual([]);
  expect(CASE.layout).toBe('case');
  const abilities = CASE.faces[0]?.abilities ?? [];
  expect(abilities.map((a) => a.kind)).toEqual(['triggered', 'triggered', 'solved']);
  expect(abilities[1]).toMatchObject({
    kind: 'triggered',
    trigger: { kind: 'endStep', whose: 'you' },
    effect: { kind: 'solve' },
    interveningIf: {
      kind: 'and',
      terms: [
        {
          kind: 'amountIs',
          amount: { kind: 'countOf', filter: { zone: 'graveyard', controller: 'you' } },
          compare: { cmp: 'atLeast', value: 15 },
        },
        { kind: 'not', term: { kind: 'thisSolved' } },
      ],
    },
  });
  expect(abilities[2]).toMatchObject({
    kind: 'solved',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'castSpell', by: 'you' },
        effect: { kind: 'copySpell' },
      },
    ],
  });
});

describe('To solve: at the beginning of your end step, with fifteen or more cards in your graveyard', () => {
  const game = (graveyard: number) =>
    scenario()
      .define(CASE)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(NAME)
      .graveyard(...FILL(graveyard))
      .seat(1)
      .library(...LIBRARY)
      .build();

  test('fifteen cards: the Case is solved', () => {
    const g = game(15);
    g.advanceTo('end');
    g.passAll();
    expect(g.state.objects[g.id(NAME)]?.solved).toBe(true);
    g.expect.invariants();
  });

  test('fourteen cards: it is not', () => {
    const g = game(14);
    g.advanceTo('end');
    g.passAll();
    expect(g.state.objects[g.id(NAME)]?.solved).toBeUndefined();
  });

  test('it is solved once: at the next end step nothing triggers', () => {
    const g = game(15);
    g.advanceTo('end');
    g.passAll();
    expect(g.events.filter((e) => e.kind === 'becameSolved')).toHaveLength(1);
    toNext(g, 'end', 0);
    g.expect.stack([]);
    expect(g.events.filter((e) => e.kind === 'becameSolved')).toHaveLength(1);
  });
});

describe('Solved: whenever you cast a nonlegendary creature spell, copy that spell', () => {
  const game = (solved: boolean) =>
    scenario()
      .define(CASE)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(NAME, solved ? { solved: true } : {})
      .battlefield('Forest', 'Forest', 'Plains')
      .hand(BEARS, ISAMARU)
      .seat(1)
      .library(...LIBRARY)
      .build();

  test('solved: casting Grizzly Bears makes a token copy of it', () => {
    const g = game(true);
    g.advanceTo('precombatMain');
    g.act(0).cast(BEARS).pay();
    g.passAll();
    expect(g.find({ name: BEARS, zone: 'battlefield' })).toHaveLength(2);
    expect(
      g.find({ name: BEARS, zone: 'battlefield' }).filter((o) => o.token !== null),
    ).toHaveLength(1);
    g.expect.invariants();
  });

  test('solved: a legendary creature spell is not copied', () => {
    const g = game(true);
    g.advanceTo('precombatMain');
    g.act(0).cast(ISAMARU).pay();
    g.passAll();
    expect(g.find({ name: ISAMARU, zone: 'battlefield' })).toHaveLength(1);
  });

  test('unsolved: nothing is copied (CR 702.169c)', () => {
    const g = game(false);
    g.advanceTo('precombatMain');
    g.act(0).cast(BEARS).pay();
    g.passAll();
    expect(g.find({ name: BEARS, zone: 'battlefield' })).toHaveLength(1);
  });

  test('solved at the end step, then it works on the next turn of the controller', () => {
    const g = scenario()
      .define(CASE)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(NAME)
      .battlefield('Forest', 'Forest')
      .graveyard(...FILL(15))
      .hand(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.advanceTo('end');
    g.passAll();
    expect(g.state.objects[g.id(NAME)]?.solved).toBe(true);
    toNext(g, 'precombatMain', 0);
    g.act(0).cast(BEARS).pay();
    g.passAll();
    expect(g.find({ name: BEARS, zone: 'battlefield' })).toHaveLength(2);
  });
});

describe('three seats', () => {
  test('only the end step of the Case controller solves it, counting that player graveyard', () => {
    const g = scenario({ seats: 3 })
      .define(CASE)
      .seat(0)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(NAME)
      .graveyard(...FILL(15))
      .seat(2)
      .library(...LIBRARY)
      .graveyard(...FILL(15))
      .build();
    g.advanceTo('end');
    expect(g.state.turn.activeSeat).toBe(0);
    g.passAll();
    expect(g.state.objects[g.id(NAME)]?.solved).toBeUndefined();
    toNext(g, 'end', 1);
    g.passAll();
    expect(g.state.objects[g.id(NAME)]?.solved).toBe(true);
  });
});

// SYNTHETIC cards: the wording of each text is that of real Cases; the names say SYNTHETIC.
function synthetic(typeLine: string, layout: string, oracleText: string) {
  return importCard(
    fromGoldenCard({
      oracleId: 'synthetic-case',
      name: 'SYNTHETIC Case',
      layout,
      colorIdentity: [],
      faces: [
        {
          name: 'SYNTHETIC Case',
          manaCost: '{1}{W}',
          typeLine,
          oracleText,
          power: null,
          toughness: null,
          loyalty: null,
          defense: null,
          colors: ['W'],
        },
      ],
      source: 'SYNTHETIC',
      acceptance: false,
    } as never),
    undefined,
    NO_OVERRIDES,
  );
}

describe('the Case words on other abilities (CR 702.169b, 702.169d)', () => {
  test('"Solved -- [static ability]" and "Solved -- [activated ability]" are held by the solved designation', () => {
    const imported = synthetic(
      'Enchantment — Case',
      'case',
      'To solve — You control three or more creatures.\nSolved — Creatures you control get +1/+1.\nSolved — {T}: You gain 1 life.',
    );
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
    const abilities = imported.definition.faces[0]?.abilities ?? [];
    expect(abilities.map((a) => a.kind)).toEqual(['triggered', 'solved', 'solved']);
    expect(abilities[1]).toMatchObject({ abilities: [{ kind: 'static' }] });
    expect(abilities[2]).toMatchObject({ abilities: [{ kind: 'activated' }] });
    expect(validateCard(imported.definition)).toEqual([]);
  });

  test('a card that is not a Case keeps the words unread: it is not supported', () => {
    const imported = synthetic(
      'Enchantment',
      'normal',
      'Solved — Creatures you control get +1/+1.',
    );
    expect(imported.support.status).toBe('unsupported');
  });

  test('a "To solve" condition the grammar does not read refuses the line whole', () => {
    const imported = synthetic(
      'Enchantment — Case',
      'case',
      'To solve — Frobnicate the quux.\nSolved — Creatures you control get +1/+1.',
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.unparsed.map((u) => u.text)).toContain(
      'To solve — Frobnicate the quux.',
    );
  });
});
