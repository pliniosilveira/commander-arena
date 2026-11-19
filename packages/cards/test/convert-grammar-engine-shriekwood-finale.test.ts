// Shriekwood Devourer and Finale of Revelation (issue 337): the REAL cards of the golden corpus (real Oracle text), read through the grammar only,
// defined in an engine scenario and played through applyAction. Stand-in creatures are named by the Grizzly Bears fixture of the engine.
//
// Shriekwood: "Whenever you attack with one or more creatures, untap up to X lands, where X is the greatest power among those creatures." (CR 508.1,
// 603.2, 701.26a, 608.2d: the controller chooses, none up to X; X is worked out as the ability resolves, CR 608.2h for a creature that left).
// Finale: "Draw X cards. If X is 10 or more, instead shuffle your graveyard into your library, draw X cards, untap up to five lands, and you have no
// maximum hand size for the rest of the game." (CR 107.3a, 608.2c, 614.1a "instead", 701.24, 402.2, 514.1).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

const FILLER = Array.from({ length: 30 }, () => 'Island');
const BEARS = 'Grizzly Bears';
const HAWK = "Healer's Hawk";

const SHRIEKWOOD = real('Shriekwood Devourer');
const FINALE = real('Finale of Revelation');

describe('the cards are valid', () => {
  test.each([SHRIEKWOOD, FINALE])('$name', (definition) => {
    expect(validateCard(definition)).toEqual([]);
  });
});

describe('Shriekwood Devourer', () => {
  const forest = (nth: number) => ({ name: 'Forest', zone: 'battlefield' as const, nth });

  const game = () => {
    const g = scenario()
      .define(SHRIEKWOOD)
      .seat(0)
      .library(...FILLER)
      .battlefield(SHRIEKWOOD.name, BEARS, HAWK)
      .battlefield('Forest', { count: 9, tapped: true })
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    return g;
  };

  const question = (g: ReturnType<typeof game>) => {
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected a choice, got ${d?.kind}`);
    return d;
  };

  test('reads as an attack batch of one or more creatures that untaps lands up to the greatest power among them', () => {
    expect(SHRIEKWOOD.faces[0]?.abilities).toContainEqual({
      kind: 'triggered',
      trigger: { kind: 'attackBatch', who: 'you', atLeast: 1 },
      effect: {
        kind: 'untap',
        objects: {
          kind: 'choose',
          filter: { types: ['land'] },
          count: { kind: 'attackersGreatestPower' },
          upTo: true,
        },
      },
    });
  });

  test('X is the greatest power among the attackers: Shriekwood (7) and a Bear (2) offer up to seven lands', () => {
    const g = game();
    g.act(0).attack([SHRIEKWOOD.name, BEARS]);
    g.passAll();
    const d = question(g);
    expect(d.purpose).toBe('untapChoice');
    expect(d.min).toBe(0);
    expect(d.max).toBe(7);
    expect(d.legal).toHaveLength(9);
    g.act(0).choosePermanents(forest(0), forest(1), forest(2));
    g.expect.tapped(forest(0), false);
    g.expect.tapped(forest(2), false);
    g.expect.tapped(forest(3), true);
    g.expect.invariants();
  });

  test('only the creatures that attacked count: Shriekwood at home, a 2-power Bear attacking, X is 2', () => {
    const g = game();
    g.act(0).attack([BEARS]);
    g.passAll();
    expect(question(g).max).toBe(2);
  });

  test('it triggers once for the declaration, however many creatures attack', () => {
    const g = game();
    g.act(0).attack([BEARS, HAWK, SHRIEKWOOD.name]);
    g.passAll();
    expect(question(g).max).toBe(7);
    g.act(0).choosePermanents();
    g.expect.pending('priority', 0);
    g.expect.stack([]);
  });

  test('choosing none is a legal answer and no land untaps', () => {
    const g = game();
    g.act(0).attack([BEARS]);
    g.passAll();
    g.act(0).choosePermanents();
    g.expect.tapped(forest(0), true);
    g.expect.invariants();
  });

  test('more lands than the cap are refused', () => {
    const g = game();
    g.act(0).attack([BEARS]);
    g.passAll();
    expect(
      g.act(0).try.action({
        kind: 'choosePermanents',
        objects: [g.id(forest(0)), g.id(forest(1)), g.id(forest(2))],
      }).ok,
    ).toBe(false);
  });

  test('no attackers, no trigger', () => {
    const g = game();
    g.act(0).noAttackers();
    expect(g.state.pending?.kind).not.toBe('choosePermanent');
    g.expect.tapped(forest(0), true);
  });

  test("the opponent's attack does not trigger it", () => {
    const g = scenario()
      .define(SHRIEKWOOD)
      .seat(0)
      .library(...FILLER)
      .battlefield(SHRIEKWOOD.name)
      .battlefield('Forest', { count: 3, tapped: true })
      .seat(1)
      .library(...FILLER)
      .battlefield(BEARS)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack([BEARS]);
    g.passAll();
    g.expect.tapped(forest(0), true);
    expect(g.state.pending?.kind).not.toBe('choosePermanent');
  });
});

describe('Finale of Revelation', () => {
  const ISLANDS = 12;
  const game = (hand: readonly string[], graveyard: readonly string[] = []) => {
    const b = scenario()
      .define(FINALE)
      .seat(0)
      .hand(FINALE.name, ...hand)
      .battlefield('Island', { count: ISLANDS })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER);
    if (graveyard.length > 0) b.seat(0).graveyard(...graveyard);
    return b.at('precombatMain', { active: 0, turn: 1 }).build();
  };

  test('reads as a draw X, replaced when X is 10 or more by shuffle, draw X, untap up to five lands and no maximum hand size', () => {
    expect(FINALE.faces[0]?.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        {
          kind: 'conditional',
          condition: { kind: 'xIs', compare: { cmp: 'atLeast', value: 10 } },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'moveToZone', to: 'library' },
              { kind: 'shuffle' },
              { kind: 'draw', count: { kind: 'x' } },
              { kind: 'untap', objects: { kind: 'choose', count: 5, upTo: true } },
              { kind: 'noMaxHandSizeForGame' },
            ],
          },
          else: { kind: 'draw', count: { kind: 'x' } },
        },
        { kind: 'exile', objects: { kind: 'thisSpell' } },
      ],
    });
  });

  test('X below 10 only draws X cards (the "instead" does not happen) and the spell is exiled', () => {
    const g = game([], [BEARS, HAWK]);
    g.act(0).cast(FINALE.name, { x: 9, pay: true });
    g.passAll();
    g.expect.handSize(0, 9);
    // The graveyard was not shuffled in: the two cards stay there, and no land question was asked.
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(HAWK, 'graveyard', { seat: 0 });
    g.expect.zone(FINALE.name, 'exile');
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('X of 9 leaves the player with a maximum hand size: the cleanup step discards down to seven', () => {
    const g = game([]);
    g.act(0).cast(FINALE.name, { x: 9, pay: true });
    g.passAll();
    g.expect.handSize(0, 9);
    g.advanceTo('cleanup', { attack: false });
    g.expect.pending('discard', 0);
  });

  test('X of 10: the graveyard is shuffled into the library, X cards are drawn, five lands untap, no maximum hand size', () => {
    const g = game([], [BEARS, HAWK]);
    g.act(0).cast(FINALE.name, { x: 10, pay: true });
    g.passAll();
    // All twelve Islands paid for it; the controller chooses up to five of them to untap.
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected the land choice, got ${d?.kind}`);
    expect(d.purpose).toBe('untapChoice');
    expect(d.max).toBe(5);
    const isle = (nth: number) => ({ name: 'Island', zone: 'battlefield' as const, nth });
    g.act(0).choosePermanents(isle(0), isle(1), isle(2), isle(3), isle(4));
    g.expect.tapped(isle(4), false);
    g.expect.tapped(isle(5), true);
    // The two graveyard cards went into the library (31 + ... cards, shuffled) before the ten were drawn.
    g.expect.handSize(0, 10);
    g.expect.noObject(BEARS, { zone: 'graveyard' });
    g.expect.noObject(HAWK, { zone: 'graveyard' });
    g.expect.librarySize(0, FILLER.length + 2 - 10);
    // The spell itself is exiled, not shuffled in: it was on the stack when the graveyard was shuffled.
    g.expect.zone(FINALE.name, 'exile');
    expect(g.state.seats[0]?.noMaximumHandSize).toBe(true);
    g.expect.invariants();
  });

  test('X of 10: no discard at the cleanup step (CR 514.1, 402.2): the hand stays at ten into the next turn', () => {
    const g = game([]);
    g.act(0).cast(FINALE.name, { x: 10, pay: true });
    g.passAll();
    g.act(0).choosePermanents();
    g.expect.handSize(0, 10);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.step('precombatMain', { active: 1, turn: 2 });
    g.expect.handSize(0, 10);
  });

  test('X of 11 is "10 or more" too (thirteen mana: eleven and {U}{U})', () => {
    const g = scenario()
      .define(FINALE)
      .seat(0)
      .hand(FINALE.name)
      .battlefield('Island', { count: 13 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(FINALE.name, { x: 11, pay: true });
    g.passAll();
    g.act(0).choosePermanents();
    g.expect.handSize(0, 11);
    expect(g.state.seats[0]?.noMaximumHandSize).toBe(true);
  });
});
