// The Peace Offering deck (issue 112), group F: the REAL Oracle text of Fisher's Talent (the golden corpus, taken from the issue) goes through the grammar as a card with no override,
// is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. Pins: CR 701.20a and 701.20b (a card
// revealed is shown to all and stays on top), 608.2c ("if you revealed it this way"), 614.1a, 614.5 and 616.1f (the Fish replaced by a Shark, then the Shark by an Octopus), the card's
// rulings of 2024-07-26 (the reveal is optional; the Fish of any effect of yours are replaced; what the instruction said about the token still applies), 111.2 (only your tokens), 716
// (Class levels). Built for more than one opponent: every game is played with three seats.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
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
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const talent = real("Fisher's Talent");
const ISLANDS = Array.from({ length: 10 }, () => 'Island');
const FISH_CALL = 'SYNTHETIC Fish Call'; // two tapped 1/1 blue Fish (engine fixture)

const tokens = (g: ScenarioGame, name: string, seat = 0) =>
  g.state.battlefield
    .map((id) => g.state.objects[id])
    .filter((o) => o?.token?.characteristics.name === name && o.controller === seat);

test('the card is valid', () => {
  expect(validateCard(talent)).toEqual([]);
});

describe('what the grammar writes for the real text', () => {
  const [face] = talent.faces;
  if (face === undefined) throw new Error('no face');

  test('level 1: the upkeep look, the optional reveal of a land card, a Fish if revealed, then a draw', () => {
    expect(face.abilities).toContainEqual(
      expect.objectContaining({
        kind: 'triggered',
        trigger: expect.objectContaining({ kind: 'upkeep' }),
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'lookAtTop',
              count: 1,
              take: { filter: { types: ['land'] }, max: 1, to: 'reveal' },
              rest: 'top',
            },
            expect.objectContaining({
              kind: 'conditional',
              condition: { kind: 'didPrevious' },
              effect: expect.objectContaining({
                kind: 'createToken',
                count: 1,
                token: expect.objectContaining({
                  definition: expect.objectContaining({ name: 'Fish', power: 1, toughness: 1 }),
                }),
              }),
            }),
            expect.objectContaining({ kind: 'draw', count: 1 }),
          ],
        },
      }),
    );
  });

  test('levels 2 and 3: a Fish becomes a 3/3 Shark, a Shark an 8/8 Octopus (swap mode)', () => {
    const swaps = face.abilities.flatMap((a) =>
      a.kind === 'level'
        ? a.abilities.flatMap((inner) =>
            inner.kind === 'replacement'
              ? [{ level: a.level, replacement: inner.replacement }]
              : [],
          )
        : [],
    );
    expect(swaps).toMatchObject([
      {
        level: 2,
        replacement: {
          kind: 'tokensInstead',
          mode: 'swap',
          what: { token: true, subtypes: ['Fish'] },
          token: { definition: { name: 'Shark', power: 3, toughness: 3, colors: ['U'] } },
        },
      },
      {
        level: 3,
        replacement: {
          kind: 'tokensInstead',
          mode: 'swap',
          what: { token: true, subtypes: ['Shark'] },
          token: { definition: { name: 'Octopus', power: 8, toughness: 8, colors: ['U'] } },
        },
      },
    ]);
  });
});

describe("level 1: the upkeep's look at the top card (CR 701.20a, 701.20b, 608.2c)", () => {
  /** The end step of the last seat, so the next turn's upkeep is seat 0's, with the Talent at `level`. */
  const upkeep = (top: string, level = 1) => {
    const g = scenario({ seats: 3 })
      .define(talent)
      .seat(0)
      .library(top, { label: 'top' })
      .library(...ISLANDS)
      .battlefield(talent.name, { level })
      .seat(1)
      .library(...ISLANDS)
      .seat(2)
      .library(...ISLANDS)
      .at('end', { active: 2, turn: 3 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.state.stack).toHaveLength(1);
    g.passAll();
    return g;
  };

  test('a land revealed: it stays on top, a 1/1 blue Fish is made, and the land is the card drawn', () => {
    const g = upkeep('Forest');
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('top');
    expect(tokens(g, 'Fish')).toHaveLength(1);
    g.expect.pt({ name: 'Fish', zone: 'battlefield', nth: 0 }, 1, 1);
    g.expect.zone('Forest', 'hand', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('the reveal is optional (the ruling): declined, no Fish, and the land is still drawn', () => {
    const g = upkeep('Forest');
    g.act(0).chooseCards();
    expect(tokens(g, 'Fish')).toHaveLength(0);
    g.expect.zone('Forest', 'hand', { seat: 0, count: 1 });
  });

  test('a nonland card on top: nobody is asked, no Fish, and the card is drawn', () => {
    const g = upkeep('Grizzly Bears');
    expect(tokens(g, 'Fish')).toHaveLength(0);
    g.expect.zone('Grizzly Bears', 'hand', { seat: 0, count: 1 });
  });

  test('at level 3 the Fish of the reveal becomes a Shark and then an 8/8 Octopus, nobody choosing an order', () => {
    const g = upkeep('Forest', 3);
    g.act(0).chooseCards('top');
    expect(tokens(g, 'Fish')).toHaveLength(0);
    expect(tokens(g, 'Shark')).toHaveLength(0);
    expect(tokens(g, 'Octopus')).toHaveLength(1);
    g.expect.pt({ name: 'Octopus', zone: 'battlefield', nth: 0 }, 8, 8);
    g.expect.pending('priority', 0);
  });
});

describe('levels 2 and 3: the Fish of any effect of yours (CR 614.1a, 616.1f, the rulings)', () => {
  /** The Talent at `level` under the control of `ownerSeat`; seat 0 casts the Fish. */
  const board = (level: number, ownerSeat: 0 | 1 = 0) => {
    const b = scenario({ seats: 3 }).define(talent);
    for (const seat of [0, 1, 2] as const) {
      b.seat(seat).library(...ISLANDS);
      if (seat === 0) {
        b.hand(FISH_CALL).battlefield('Island', 'Forest', 'Island', 'Forest', 'Island', 'Island');
      }
      if (seat === ownerSeat) b.battlefield(talent.name, { level });
    }
    return b.at('precombatMain', { active: 0 }).build();
  };

  const fishCall = (g: ScenarioGame) => {
    g.act(0).cast(FISH_CALL, { pay: true });
    g.passAll();
    return g;
  };

  test('level 1: the Fish of another spell stay Fish', () => {
    expect(tokens(fishCall(board(1)), 'Fish')).toHaveLength(2);
  });

  test('level 2: each Fish of another spell is a 3/3 Shark, tapped as the spell said', () => {
    const g = fishCall(board(2));
    expect(tokens(g, 'Fish')).toHaveLength(0);
    const sharks = tokens(g, 'Shark');
    expect(sharks).toHaveLength(2);
    for (const shark of sharks) expect(shark?.tapped).toBe(true);
    g.expect.pt({ name: 'Shark', zone: 'battlefield', nth: 0 }, 3, 3);
  });

  test('level 3: each is an 8/8 Octopus, still tapped', () => {
    const g = fishCall(board(3));
    const octopi = tokens(g, 'Octopus');
    expect(octopi).toHaveLength(2);
    for (const octopus of octopi) expect(octopus?.tapped).toBe(true);
    expect(tokens(g, 'Shark')).toHaveLength(0);
  });

  test("an opponent's Fisher's Talent does not change the Fish I create (CR 111.2)", () => {
    const g = fishCall(board(3, 1));
    expect(tokens(g, 'Fish')).toHaveLength(2);
    expect(tokens(g, 'Octopus', 1)).toHaveLength(0);
  });

  test('gaining level 2 with its level ability ({G}{U}, as a sorcery) turns on the Shark replacement', () => {
    const g = board(1);
    g.act(0).activate(talent.name, { pay: true });
    g.passAll();
    expect(g.state.objects[g.id(talent.name)]?.level).toBe(2);
    fishCall(g);
    expect(tokens(g, 'Shark')).toHaveLength(2);
  });
});
