// "At the beginning of your upkeep, sacrifice a creature. If you can't, sacrifice ~." (Eldrazi Monument, Plunder the Graves deck): the text is read by
// `condition.if-you-cant` and run through applyAction with three seats. Pins: CR 701.21a (a player sacrifices only a permanent they control, and one that can't be
// sacrificed is not one they can), CR 608.2c (the second instruction depends on what the first did), CR 603.2 (the trigger is the controller's upkeep only).
// The permanent is SYNTHETIC (named so) with the real Oracle sentence.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const MONUMENT = parsed(
  'SYNTHETIC Sacrifice Monument',
  'Artifact',
  "At the beginning of your upkeep, sacrifice a creature. If you can't, sacrifice ~.",
  { manaCost: '{5}' },
);
const ANCHORED = parsed('SYNTHETIC Anchored Bear', 'Creature — Bear', "~ can't be sacrificed.", {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
});
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';
const FILLER = Array.from({ length: 10 }, () => 'Island');

describe('the lowering of "sacrifice a creature. If you can\'t, sacrifice ~"', () => {
  test('is a sacrifice of a creature and a conditional on that sacrifice having sacrificed nothing', () => {
    const ability = MONUMENT.faces[0]?.abilities?.[0];
    expect(ability).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'upkeep', whose: 'you' },
    });
    expect(ability?.kind === 'triggered' ? ability.effect : undefined).toEqual({
      kind: 'sequence',
      effects: [
        {
          kind: 'sacrifice',
          objects: { kind: 'choose', filter: { types: ['creature'] } },
        },
        {
          kind: 'conditional',
          condition: {
            kind: 'not',
            term: { kind: 'thisWayAtLeast', what: 'sacrificed', count: 1 },
          },
          effect: { kind: 'sacrifice', objects: { kind: 'this' } },
        },
      ],
    });
  });
});

/** Seat 2 has the turn before seat 0, whose upkeep (turn 6) is reached with the trigger on the stack. */
function board(
  mine: readonly string[],
  others: { readonly 1?: string[]; readonly 2?: string[] } = {},
) {
  const g = scenario({ seats: 3 })
    .define(MONUMENT)
    .define(ANCHORED)
    .seat(0)
    .battlefield(MONUMENT.name)
    .battlefield(...mine)
    .library(...FILLER)
    .seat(1)
    .battlefield(...(others[1] ?? []))
    .library(...FILLER)
    .seat(2)
    .battlefield(...(others[2] ?? []))
    .library(...FILLER)
    .at('precombatMain', { active: 2, turn: 5 })
    .build();
  g.advanceTo('upkeep', { turn: 6 });
  g.expect.stack([`${MONUMENT.name} (ability)`]);
  return g;
}

describe("sacrifice a creature, and if you can't, sacrifice the permanent (CR 701.21a, 608.2c)", () => {
  test('with a creature to sacrifice, one of them is sacrificed and the permanent stays', () => {
    const g = board([BEARS, ELVES]);
    g.passAll();
    expect(g.state.pending).toMatchObject({ kind: 'choosePermanent', seat: 0 });
    g.act(0).choosePermanents(`${ELVES}[0]`);
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(MONUMENT.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('with exactly one creature, it is sacrificed and the permanent stays', () => {
    const g = board([BEARS]);
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(MONUMENT.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('with no creature of its own, the permanent is sacrificed, whatever the other seats control', () => {
    const g = board([], { 1: [BEARS], 2: [ELVES] });
    g.passAll();
    g.expect.zone(MONUMENT.name, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.zone(ELVES, 'battlefield', { seat: 2 });
    g.expect.invariants();
  });

  test("a creature that can't be sacrificed is not one the controller can sacrifice: the permanent is sacrificed instead", () => {
    const g = board([ANCHORED.name]);
    g.passAll();
    g.expect.zone(ANCHORED.name, 'battlefield', { seat: 0 });
    g.expect.zone(MONUMENT.name, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });
});
