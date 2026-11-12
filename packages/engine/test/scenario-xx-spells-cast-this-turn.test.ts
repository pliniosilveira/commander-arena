// "{T}: You gain 1 life. Activate only if you've cast three or more spells this turn." (D-318): the condition `spellsCastThisTurn`, read from the
// per-seat count of spells cast this turn when the ability is activated (CR 602.5b).
// Pins: CR 602.5b (a restriction on activating an ability), CR 601.2i (a spell is cast once it is on the stack with its costs paid: a copy is
// put on the stack, not cast, CR 707.10), CR 500.4 (the count is of this turn; the next turn starts from 0), CR 603.4 (read when the ability is activated).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-niv-primitives.ts, synthetic-life-gain.ts, synthetic-copies.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const GATE = 'SYNTHETIC Spell Gate'; // artifact: {T}: gain 1 life, only with three or more spells cast this turn
const MEND = 'SYNTHETIC Mend'; // {W} instant: gain 3 life
const TWIN = 'SYNTHETIC Twin Spell'; // {U}{U} instant: copy target instant or sorcery spell
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const build = (hand: readonly string[], theirs: readonly string[] = []) =>
  scenario()
    .seat(0)
    .life(20)
    .library(...LIBRARY)
    .hand(...hand)
    .battlefield(GATE)
    .battlefield('Plains', { count: 4 })
    .battlefield('Island', { count: 2 })
    .seat(1)
    .hand(...theirs)
    .life(20)
    .library(...LIBRARY)
    .battlefield('Plains', { count: 3 })
    .at('precombatMain')
    .build();

/** Casts the first Mend of the seat's hand, paying with its lands. */
const mend = (g: ReturnType<typeof build>, seat: 0 | 1) =>
  g.act(seat).cast({ name: MEND, seat, zone: 'hand', nth: 0 }, { pay: true });

describe('the card is valid', () => {
  test(GATE, () => {
    expect(validateCard(syntheticCard(GATE))).toEqual([]);
  });
});

describe('validation', () => {
  const withAbility = (ability: unknown) => ({
    ...syntheticCard(GATE),
    faces: [{ ...syntheticCard(GATE).faces[0], abilities: [ability] }],
  });
  const gain = { kind: 'gainLife', player: { kind: 'you' }, amount: 1 };

  test('atLeast is a whole number of 1 or more', () => {
    for (const atLeast of [0, -1, 1.5]) {
      const card = withAbility({
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        effect: gain,
        activateOnlyIf: { kind: 'spellsCastThisTurn', atLeast },
      });
      expect(validateCard(card as never).length, `atLeast ${atLeast}`).toBeGreaterThan(0);
    }
  });

  test('a static ability does not read it (its conditions are the layers plain ones)', () => {
    const card = withAbility({
      kind: 'static',
      static: { kind: 'modifyPt', subject: { kind: 'this' }, power: 1, toughness: 1 },
      condition: { kind: 'spellsCastThisTurn', atLeast: 3 },
    });
    expect(JSON.stringify(validateCard(card as never))).toContain('not spellsCastThisTurn');
  });
});

describe('"Activate only if you\'ve cast three or more spells this turn"', () => {
  test('refused with none, one and two spells cast; allowed at three', () => {
    const g = build([MEND, MEND, MEND]);
    g.expect.illegal(0, { activate: GATE });
    mend(g, 0);
    g.passAll();
    g.expect.illegal(0, { activate: GATE });
    mend(g, 0);
    g.passAll();
    g.expect.illegal(0, { activate: GATE });
    expect(g.act(0).try.activate(GATE).ok).toBe(false);
    mend(g, 0);
    g.passAll();
    expect(g.state.seats[0]?.spellsCastThisTurn).toBe(3);
    g.expect.legal(0, { activate: GATE });
    g.act(0).activate(GATE);
    g.passAll();
    g.expect.life(0, 20 + 9 + 1);
  });

  test('it counts the spell cast, not the resolved one: three spells on the stack at once are enough', () => {
    const g = build([MEND, MEND, MEND]);
    mend(g, 0);
    mend(g, 0);
    mend(g, 0);
    g.expect.legal(0, { activate: GATE });
  });

  test('a copy of a spell is not cast and is not counted (CR 707.10)', () => {
    const g = build([MEND, TWIN]);
    mend(g, 0);
    g.act(0).cast(TWIN, { targets: [{ name: MEND, zone: 'stack', nth: 0 }], pay: true });
    g.passAll(); // Twin Spell resolves: the copy of Mend goes on the stack
    g.passAll();
    g.passAll();
    expect(g.state.seats[0]?.spellsCastThisTurn).toBe(2);
    g.expect.illegal(0, { activate: GATE });
  });

  test("the opponent's spells are not mine", () => {
    const g = build([MEND, MEND], [MEND, MEND]);
    mend(g, 0);
    mend(g, 0);
    g.pass(0);
    mend(g, 1);
    mend(g, 1);
    expect(g.state.seats[0]?.spellsCastThisTurn).toBe(2);
    expect(g.state.seats[1]?.spellsCastThisTurn).toBe(2);
    g.expect.illegal(0, { activate: GATE }); // 4 spells were cast this turn, 2 of them mine
  });

  test('the count starts again at 0 on the next turn', () => {
    const g = build([MEND, MEND, MEND]);
    mend(g, 0);
    g.passAll();
    mend(g, 0);
    g.passAll();
    mend(g, 0);
    g.passAll();
    g.expect.legal(0, { activate: GATE });
    const turn = g.state.turn.number;
    g.advanceTo('precombatMain', { turn: turn + 2 }); // the opponent has the next turn; mine is the one after
    g.expect.illegal(0, { activate: GATE });
    expect(g.state.seats[0]?.spellsCastThisTurn).toBe(0);
  });
});
