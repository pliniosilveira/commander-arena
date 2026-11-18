// The Prismari deck (issue 87), group 1: populate (CR 701.36) and the delayed sacrifice of only the token it made (D-639), with the SYNTHETIC sibling of Determined Iteration
// (src/cards/fixtures/synthetic-prismari-g1.ts): "At the beginning of combat on your turn, populate. The token created this way gains haste. Sacrifice it at the beginning of the next
// end step." Pins: CR 701.36a (choose a creature token you control, create a copy of it), CR 701.36b (no creature token, no token), CR 707.2 and 111.10 (a copy has the copiable values:
// no counters, no other effects; the copy of a token that is a copy has the copied values), CR 603.7 and 603.7c (a delayed triggered ability about the tokens this ability made, and no
// others), CR 701.21a (only a permanent its controller controls can be sacrificed), CR 611.2a (haste with no duration lasts as long as the token does), CR 400.7 (a token that left
// is gone).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const ENGINE = 'SYNTHETIC Iteration Engine'; // enchantment {1}{R}
const SOLDIER_CALL = 'SYNTHETIC Soldier Call'; // instant {W}: a 1/1 white Soldier token
const BEAST_CALL = 'SYNTHETIC Beast Call'; // instant {2}{G}: a 3/3 green Beast token
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

type Game = ReturnType<ReturnType<typeof scenario>['build']>;

const idsOf = (g: Game, name: string) =>
  g.find({ name, zone: 'battlefield', seat: 0 }).map((o) => o.id);
const soldiers = (g: Game) => idsOf(g, 'Soldier');
const beasts = (g: Game) => idsOf(g, 'Beast');

/** The engine on the battlefield with Plains and Forests, and the token spells in hand, in the precombat main phase. */
function game(extra: (b: ReturnType<typeof scenario>) => void = () => {}): Game {
  const b = scenario()
    .seat(0)
    .library(...LIBRARY)
    .battlefield(ENGINE)
    .battlefield('Plains', 'Plains', 'Plains')
    .battlefield('Forest', 'Forest', 'Forest')
    .hand(SOLDIER_CALL, SOLDIER_CALL, BEAST_CALL);
  extra(b);
  return b
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0 })
    .build();
}

const call = (g: Game, name: string) => {
  g.act(0).cast({ name, zone: 'hand', seat: 0, nth: 0 }, { pay: true });
  g.passAll();
};

describe('the card', () => {
  test('is valid and uses only what the engine runs', () => {
    expect(validateCard(syntheticCard(ENGINE))).toEqual([]);
  });
});

describe('populate with one creature token (CR 701.36a)', () => {
  test('a copy of the token is made, with haste, and the first token is left alone', () => {
    const g = game();
    call(g, SOLDIER_CALL);
    expect(soldiers(g)).toHaveLength(1);
    g.advanceTo('beginningOfCombat');
    g.passAll();
    const made = soldiers(g);
    expect(made).toHaveLength(2);
    g.expect.derived(made[1] as string, { keywords: ['haste'] });
    g.expect.derived(made[0] as string, { keywords: [] });
    g.expect.pt(made[1] as string, 1, 1);
    g.expect.invariants();
  });

  test('the copy is not asked about: one creature token is the only choice', () => {
    const g = game();
    call(g, SOLDIER_CALL);
    g.advanceTo('beginningOfCombat');
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('choosePermanent');
  });
});

describe('populate with no creature token (CR 701.36b)', () => {
  test('nothing is created, and nothing is sacrificed at the end step', () => {
    const g = game();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    expect(soldiers(g)).toHaveLength(0);
    g.advanceTo('end');
    g.passAll();
    g.expect.noEvent({ kind: 'permanentSacrificed' });
    g.expect.invariants();
  });
});

describe('populate with several creature tokens (CR 701.36a: the controller chooses)', () => {
  test('the choice is a decision of purpose populate among the creature tokens, and the copy has the values of the one chosen', () => {
    const g = game();
    call(g, SOLDIER_CALL);
    call(g, BEAST_CALL);
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    const pending = g.state.pending;
    expect(pending?.kind === 'choosePermanent' && pending.purpose).toBe('populate');
    expect(pending?.kind === 'choosePermanent' && pending.legal).toHaveLength(2);
    g.act(0).choosePermanents(beasts(g)[0] as string);
    g.passAll();
    expect(beasts(g)).toHaveLength(2);
    expect(soldiers(g)).toHaveLength(1);
    g.expect.pt(beasts(g)[1] as string, 3, 3);
    g.expect.invariants();
  });

  test('a token that is not a creature is not a choice: with one creature token and a Treasure, nothing is asked and the creature token is copied (CR 701.36a)', () => {
    const g = game((b) => b.hand('SYNTHETIC Prismari Treasure Call').battlefield('Mountain'));
    call(g, SOLDIER_CALL);
    call(g, 'SYNTHETIC Prismari Treasure Call');
    expect(idsOf(g, 'Treasure')).toHaveLength(1);
    g.advanceTo('beginningOfCombat');
    g.passAll();
    expect(soldiers(g)).toHaveLength(2);
    expect(idsOf(g, 'Treasure')).toHaveLength(1);
    g.expect.invariants();
  });

  test('a token that is not a creature is not a choice (CR 701.36a)', () => {
    const g = game((b) => b.battlefield('Sol Ring'));
    // Sol Ring is not a token and not a creature: with no creature token populate does nothing.
    g.advanceTo('beginningOfCombat');
    g.passAll();
    expect(soldiers(g)).toHaveLength(0);
    expect(beasts(g)).toHaveLength(0);
  });
});

describe('the delayed sacrifice (CR 603.7c, 701.21a)', () => {
  test('at the next end step the token this ability made is sacrificed, and the other tokens are not', () => {
    const g = game();
    call(g, SOLDIER_CALL);
    g.advanceTo('beginningOfCombat');
    g.passAll();
    expect(soldiers(g)).toHaveLength(2);
    g.advanceTo('end');
    g.passAll();
    expect(soldiers(g)).toHaveLength(1);
    g.expect.invariants();
  });

  test('a token made by another effect, even this turn, is not sacrificed: only the one populate made', () => {
    const g = game();
    call(g, SOLDIER_CALL);
    g.advanceTo('beginningOfCombat');
    g.passAll();
    call(g, SOLDIER_CALL);
    expect(soldiers(g)).toHaveLength(3);
    g.advanceTo('end');
    g.passAll();
    expect(soldiers(g)).toHaveLength(2);
  });

  test('a token that left before the end step is simply gone (CR 400.7): nothing happens and nothing breaks', () => {
    const g = game((b) => b.seat(0).hand('Lightning Bolt').battlefield('Mountain'));
    call(g, SOLDIER_CALL);
    g.advanceTo('beginningOfCombat');
    g.passAll();
    const copy = soldiers(g)[1];
    g.act(0).cast('Lightning Bolt', { pay: true, targets: [copy as string] });
    g.passAll();
    expect(soldiers(g)).toHaveLength(1);
    g.advanceTo('end');
    g.passAll();
    expect(soldiers(g)).toHaveLength(1);
    g.expect.invariants();
  });
});
