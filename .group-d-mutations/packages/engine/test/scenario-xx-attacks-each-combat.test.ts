// "This creature attacks each combat if able." (D-094).
// Pins: CR 508.1d (a creature that is required to attack and is able to must be declared; a
// declaration with fewer requirements obeyed than possible is illegal), CR 508.1a (only an untapped
// creature can be declared), CR 302.6 (summoning sickness: a creature that can't attack is not
// required to), CR 508.1 / 506.3 (a creature may attack a player or a planeswalker). The decision
// lists the creatures that must attack (`mustAttack`), the engine refuses a declaration that leaves
// one out, and the legal-action list holds only declarations the engine accepts.
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-restrictions.ts) or Grizzly Bears.
import { describe, expect, test } from 'vitest';
import { type Action, applyAction, getLegalActions } from '../src/index';
import { scenario } from '../src/testing/index';
import { attackedGame, type Builder, canBlock } from './restriction-helpers';

const BERSERKER = 'SYNTHETIC Berserker';
const BRUTE = 'SYNTHETIC Raging Brute';
const BEARS = 'Grizzly Bears';

function atAttackers(seat0: (b: Builder) => void, seat1: (b: Builder) => void = () => {}) {
  const b = scenario().seat(0).library('Island', { count: 4 });
  seat0(b);
  b.seat(1).library('Island', { count: 4 });
  seat1(b);
  const g = b.at('precombatMain', { active: 0 }).build();
  g.advanceTo('declareAttackers', { attack: false });
  return g;
}

function declaration(g: ReturnType<typeof atAttackers>) {
  const d = g.state.pending;
  if (d?.kind !== 'declareAttackers') throw new Error(`expected declareAttackers, got ${d?.kind}`);
  return d;
}

describe('CR 508.1d: a creature that attacks each combat if able must be declared', () => {
  test('the decision names it, and every declaration without it is refused', () => {
    const g = atAttackers((b) => b.battlefield(BERSERKER, BEARS));
    expect(declaration(g).mustAttack).toEqual([g.id(BERSERKER)]);
    const before = g.hash();
    expect(g.act(0).try.declareAttackers([])).toEqual({
      ok: false,
      error: 'A creature that attacks each combat if able must attack',
    });
    expect(g.act(0).try.declareAttackers([{ attacker: BEARS }]).ok).toBe(false);
    g.expect.hash(before);
  });

  test('declaring it alone, or with the others, is accepted', () => {
    for (const attackers of [[BERSERKER], [BERSERKER, BEARS]]) {
      const g = atAttackers((b) => b.battlefield(BERSERKER, BEARS));
      g.act(0).attack(attackers);
      g.expect.combat({ attackers: attackers });
    }
  });

  test('the legal actions agree: no "no attack", no attack without it, every listed action works', () => {
    const g = atAttackers((b) => b.battlefield(BERSERKER, BEARS));
    const attacks = getLegalActions(g.state, 0).filter((a) => a.kind === 'declareAttackers');
    expect(attacks.length).toBeGreaterThan(0);
    for (const a of attacks) {
      if (a.kind !== 'declareAttackers') continue;
      expect(
        a.attacks.some((x) => x.attacker === g.id(BERSERKER)),
        JSON.stringify(a),
      ).toBe(true);
      expect(applyAction(g.state, 0, a).ok, JSON.stringify(a)).toBe(true);
    }
    // The empty declaration and "Grizzly Bears alone" are not offered and are refused.
    const none: Action = { kind: 'declareAttackers', attacks: [] };
    expect(getLegalActions(g.state, 0)).not.toContainEqual(none);
    expect(applyAction(g.state, 0, none).ok).toBe(false);
  });

  test('with nothing else to attack with, the only declaration is the required one', () => {
    const g = atAttackers((b) => b.battlefield(BERSERKER));
    const attacks = getLegalActions(g.state, 0).filter((a) => a.kind === 'declareAttackers');
    expect(attacks).toEqual([
      {
        kind: 'declareAttackers',
        attacks: [{ attacker: g.id(BERSERKER), target: { kind: 'player', seat: 1 } }],
      },
    ]);
  });

  test('two required creatures must both attack', () => {
    const g = atAttackers((b) => b.battlefield(BERSERKER, BRUTE));
    expect(declaration(g).mustAttack).toEqual([g.id(BERSERKER), g.id(BRUTE)]);
    expect(g.act(0).try.declareAttackers([{ attacker: BERSERKER }]).ok).toBe(false);
    expect(g.act(0).try.declareAttackers([{ attacker: BRUTE }]).ok).toBe(false);
    expect(g.act(0).try.declareAttackers([{ attacker: BERSERKER }, { attacker: BRUTE }]).ok).toBe(
      true,
    );
  });

  test('the requirement is met at a planeswalker too', () => {
    const g = atAttackers(
      (b) => b.battlefield(BERSERKER),
      (b) => b.battlefield('SYNTHETIC Vanilla Planeswalker'),
    );
    const listed = getLegalActions(g.state, 0).filter((a) => a.kind === 'declareAttackers');
    expect(listed).toHaveLength(2); // the player and the planeswalker
  });
});

describe('a creature that is not able to attack is not required to', () => {
  test('tapped: no requirement, "no attackers" is not even asked when nothing else can', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BERSERKER, { tapped: true })
      .library('Island', { count: 4 })
      .seat(1)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.expect.step('declareAttackers');
    g.expect.pending('priority', 0);
  });

  test('summoning sick: Grizzly Bears may attack alone, the new Berserker is not required', () => {
    const g = atAttackers((b) => b.battlefield(BERSERKER, { fresh: true }).battlefield(BEARS));
    expect(declaration(g).mustAttack).toEqual([]);
    expect(g.act(0).try.declareAttackers([]).ok).toBe(true);
  });

  test('another requirement-free creature leaves "no attack" legal', () => {
    const g = atAttackers((b) => b.battlefield(BEARS));
    expect(declaration(g).mustAttack).toEqual([]);
    expect(getLegalActions(g.state, 0)).toContainEqual({ kind: 'declareAttackers', attacks: [] });
  });
});

describe("a creature that attacks each combat if able and can't block", () => {
  test("it must attack on its controller's turn", () => {
    const g = atAttackers((b) => b.battlefield(BRUTE));
    expect(declaration(g).mustAttack).toEqual([g.id(BRUTE)]);
  });

  test("on the other player's turn it can't block", () => {
    const g = attackedGame(['SYNTHETIC Vanilla 3/3'], (b) => b.battlefield(BRUTE));
    g.expect.pending('priority', 0);
    expect(canBlock(g, BRUTE, 'SYNTHETIC Vanilla 3/3')).toBe(false);
  });
});
