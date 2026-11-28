// "Cast this spell only during the declare blockers step on an opponent's turn. Remove all attacking creatures from combat and untap them. After this phase, there is an additional
// combat phase. Each of those creatures attacks that combat if able. They can't attack you or planeswalkers you control that combat." (Illusionist's Gambit)
// Pins: CR 101.2 and 601.3 (a spell that can't be cast outside the declare blockers step of an opponent's turn: `cantCastThis` with that condition), CR 506.4 (removed from combat:
// no longer attacking, no combat damage), CR 608.2c ("untap them": the creatures removed, the `removedFromCombat` reference), CR 500.8 (one more combat phase after this one, then
// the turn goes on: no additional main phase), CR 508.1c and 508.1d (in that combat only, those creatures attack if able and can't attack the caster or the caster's planeswalkers;
// the other creatures are free; with three seats the requirement is met by attacking the other opponent; with two seats nobody is left to attack). The card is SYNTHETIC
// (defined in this file); the rest are real cards.
import { describe, expect, test } from 'vitest';
import { validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const GAMBIT = 'SYNTHETIC Gambit of Illusions';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';
const LIBRARY = Array.from({ length: 12 }, () => 'Island');

const CAST_ONLY_DECLARE_BLOCKERS_OPPONENT_TURN = {
  kind: 'static',
  static: { kind: 'cantCastThis' },
  condition: {
    kind: 'not',
    term: {
      kind: 'and',
      terms: [
        { kind: 'duringStep', step: 'declareBlockers' },
        { kind: 'not', term: { kind: 'yourTurn' } },
      ],
    },
  },
} as const;

const REMOVE_UNTAP_AGAIN = {
  kind: 'sequence',
  effects: [
    { kind: 'removeFromCombat', objects: { kind: 'each', filter: { attacking: true } } },
    { kind: 'untap', objects: { kind: 'removedFromCombat' } },
    {
      kind: 'extraCombat',
      those: { objects: { kind: 'removedFromCombat' }, attackIfAble: true, cantAttackYou: true },
    },
  ],
} as const;

const gambit = singleFaceCard({
  name: GAMBIT,
  manaCost: ['2', 'U', 'U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText:
    "Cast this spell only during the declare blockers step on an opponent's turn.\nRemove all attacking creatures from combat and untap them. After this phase, there is an additional combat phase. Each of those creatures attacks that combat if able. They can't attack you or planeswalkers you control that combat.",
  abilities: [CAST_ONLY_DECLARE_BLOCKERS_OPPONENT_TURN],
  spell: { effect: REMOVE_UNTAP_AGAIN },
});

/** Seat 0 attacks with two Bears; seat 1 holds the Gambit with four Islands (and a planeswalker); seat 2, with three seats, is the other opponent. */
function game(seats: 2 | 3, opts: { readonly elves?: boolean } = {}): ScenarioGame {
  let b = scenario({ seats })
    .define(gambit)
    .seat(0)
    .library(...LIBRARY)
    .battlefield(BEARS, { label: 'b1' })
    .battlefield(BEARS, { label: 'b2' });
  if (opts.elves === true) b = b.battlefield(ELVES, { label: 'elves' });
  b = b
    .seat(1)
    .library(...LIBRARY)
    .hand(GAMBIT)
    .battlefield('Island', { count: 4 })
    .battlefield(WALKER, { label: 'walker' });
  if (seats === 3) b = b.seat(2).library(...LIBRARY);
  return b.at('precombatMain', { active: 0, turn: 3 }).build();
}

/** Answers a declaration of blockers with no blocks, when one is asked (a player with no creature that can block is not asked). */
function noBlocks(g: ScenarioGame): void {
  const d = g.state.pending;
  if (d?.kind === 'declareBlockers') g.act(d.seat).declareBlockers([]);
}

/** The Bears attack seat 1, no block is declared, and seat 0 passes in the declare blockers step: seat 1 has priority there. */
function toBlockers(g: ScenarioGame): void {
  g.advanceTo('declareAttackers', { attack: false });
  g.act(0).declareAttackers([
    { attacker: 'b1', target: { player: 1 } },
    { attacker: 'b2', target: { player: 1 } },
  ]);
  g.passAll();
  noBlocks(g);
  expect(g.state.turn.step).toBe('declareBlockers');
  g.act(0).pass();
}

/** Casts the Gambit as seat 1 and lets it resolve. */
function castGambit(g: ScenarioGame): void {
  g.act(1).cast(GAMBIT, { pay: true });
  g.passAll();
}

/** Passes priority until the next declaration of attackers (the added combat) or the postcombat main phase. */
function toNextDeclaration(g: ScenarioGame): void {
  for (let i = 0; i < 20; i += 1) {
    const d = g.state.pending;
    if (d?.kind === 'declareAttackers' || g.state.turn.step === 'postcombatMain') return;
    if (d?.kind !== 'priority') throw new Error(`unexpected decision ${d?.kind}`);
    g.pass();
  }
}

describe('the card is valid', () => {
  test('the Gambit of this file', () => {
    expect(validateCard(gambit)).toEqual([]);
  });

  test('the shapes that are refused', () => {
    const face = gambit.faces[0];
    if (face === undefined) throw new Error('no face');
    const messages = (abilities: unknown, effect: unknown) =>
      validateCard({
        ...gambit,
        faces: [{ ...face, abilities, spell: { effect } }],
      } as typeof gambit)
        .map((m) => m.message)
        .join(' | ');
    // An additional combat phase from a spell that can be cast at other times than a combat step.
    expect(messages([], REMOVE_UNTAP_AGAIN)).toMatch(/additional combat phase/);
    // "Them" with no removal from combat before it.
    expect(
      messages([CAST_ONLY_DECLARE_BLOCKERS_OPPONENT_TURN], {
        kind: 'untap',
        objects: { kind: 'removedFromCombat' },
      }),
    ).toMatch(/removeFromCombat/);
    // "Those creatures" bound to nothing.
    expect(
      messages([CAST_ONLY_DECLARE_BLOCKERS_OPPONENT_TURN], {
        kind: 'sequence',
        effects: [
          REMOVE_UNTAP_AGAIN.effects[0],
          { kind: 'extraCombat', those: { objects: { kind: 'removedFromCombat' } } },
        ],
      }),
    ).toMatch(/attackIfAble or cantAttackYou/);
  });
});

describe('when it can be cast (CR 101.2, 601.3)', () => {
  test('not in the declare attackers step, nor on its caster’s own turn', () => {
    const g = game(3);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: 'b1', target: { player: 1 } }]);
    g.act(0).pass();
    expect(g.state.turn.step).toBe('declareAttackers');
    g.expect.illegal(1, { cast: GAMBIT });
  });

  test('in the declare blockers step of an opponent’s turn', () => {
    const g = game(3);
    toBlockers(g);
    g.expect.legal(1, { cast: GAMBIT });
  });

  test('not in the declare blockers step of the caster’s own turn', () => {
    const g = scenario({ seats: 2 })
      .define(gambit)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'b1' })
      .hand(GAMBIT)
      .battlefield('Island', { count: 4 })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: 'b1', target: { player: 1 } }]);
    g.passAll();
    noBlocks(g);
    expect(g.state.turn.step).toBe('declareBlockers');
    g.expect.illegal(0, { cast: GAMBIT });
  });
});

describe('the creatures are removed, untapped, and attack another player in the added combat (three seats)', () => {
  test('no combat damage in this combat; the Bears untap; the additional combat follows', () => {
    const g = game(3);
    toBlockers(g);
    castGambit(g);
    expect(g.state.combat?.attackers ?? []).toEqual([]);
    g.expect.tapped('b1', false);
    g.expect.tapped('b2', false);
    toNextDeclaration(g);
    g.expect.life(1, 40);
    const d = g.state.pending;
    if (d?.kind !== 'declareAttackers')
      throw new Error('expected the added declaration of attackers');
    // CR 508.1d: both must attack; CR 508.1c: only the other opponent can be attacked, not the caster nor the caster's planeswalker.
    expect([...d.mustAttack].sort()).toEqual([g.id('b1'), g.id('b2')].sort());
    for (const c of d.candidates) {
      expect(c.targets).toEqual([{ kind: 'player', seat: 2 }]);
    }
    expect(g.act(0).try.declareAttackers([{ attacker: 'b1', target: { player: 1 } }]).ok).toBe(
      false,
    );
    expect(g.act(0).try.declareAttackers([{ attacker: 'b1', target: { player: 2 } }]).ok).toBe(
      false,
    );
    g.act(0).declareAttackers([
      { attacker: 'b1', target: { player: 2 } },
      { attacker: 'b2', target: { player: 2 } },
    ]);
    g.passAll();
    noBlocks(g);
    toNextDeclaration(g);
    g.expect.life(2, 36);
    g.expect.life(1, 40);
    // CR 500.8: the turn goes on with its own postcombat main phase; nothing more is added.
    expect(g.state.turn.step).toBe('postcombatMain');
    expect(g.state.continuousEffects.filter((e) => e.until === 'endOfCombat')).toEqual([]);
    g.expect.invariants();
  });

  test('a creature that did not attack is free in the added combat and may attack the caster', () => {
    const g = game(3, { elves: true });
    toBlockers(g);
    castGambit(g);
    toNextDeclaration(g);
    const d = g.state.pending;
    if (d?.kind !== 'declareAttackers')
      throw new Error('expected the added declaration of attackers');
    expect(d.mustAttack).not.toContain(g.id('elves'));
    const elves = d.candidates.find((c) => c.attacker === g.id('elves'));
    expect(elves?.targets).toContainEqual({ kind: 'player', seat: 1 });
    g.act(0).declareAttackers([
      { attacker: 'b1', target: { player: 2 } },
      { attacker: 'b2', target: { player: 2 } },
      { attacker: 'elves', target: { player: 1 } },
    ]);
    g.passAll();
    g.expect.invariants();
  });
});

describe('two seats: no one is left for those creatures to attack (CR 508.1c, 508.1d)', () => {
  test('the Bears can’t attack in the added combat, and nothing is required', () => {
    const g = game(2);
    toBlockers(g);
    castGambit(g);
    // The added combat begins (its beginning of combat step), but with no creature able to attack no declaration is asked (CR 508.1c).
    const steps: string[] = [];
    for (let i = 0; i < 20 && g.state.turn.step !== 'postcombatMain'; i += 1) {
      steps.push(g.state.turn.step);
      const d = g.state.pending;
      if (d?.kind === 'declareAttackers') {
        expect(d.mustAttack).toEqual([]);
        expect(d.candidates.map((c) => c.attacker)).not.toContain(g.id('b1'));
        g.act(0).declareAttackers([]);
      } else {
        g.pass();
      }
    }
    expect(steps).toContain('beginningOfCombat');
    expect(g.state.turn.step).toBe('postcombatMain');
    g.expect.life(1, 40);
    g.expect.tapped('b1', false);
  });
});
