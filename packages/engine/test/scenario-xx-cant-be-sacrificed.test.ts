// "This artifact can't be sacrificed." (the static ability `cantBeSacrificed`) and "the player to your right" (`playerToYourRight`).
// Pins: CR 701.21a (Sacrifice), CR 101.2 (a "can't" effect wins and the instruction does nothing), CR 604.1 (a static ability of the permanent), CR 118.3 (a cost that
// can't be paid is not paid), CR 702.82a (Devour), CR 101.4 (turn order of the players; the order is read from the code, which cites it). One test for every place that
// lists or performs a sacrifice, so that a site that skips the gate fails one. Cards are SYNTHETIC (src/cards/fixtures/synthetic-cant-sacrifice.ts) or fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { controllerOf } from '../src/rules/control';
import { sacrificePermanent } from '../src/rules/sacrifice';
import { cantBeSacrificed } from '../src/rules/sacrifice-prevention';
import { resolvePlayers } from '../src/rules/select';
import { getObject, playerToRightOf } from '../src/state/ops';
import type { GameState } from '../src/state/types';
import type { ScenarioGame, scenario } from '../src/testing/index';
import { twoSeatGame } from './two-seat-helpers';

const GOLEM = 'SYNTHETIC Anchored Golem'; // artifact creature, can't be sacrificed
const SNACK = 'SYNTHETIC Anchored Snack'; // can't be sacrificed; {2}, {T}, sacrifice this: gain 3 life
const SPARK = 'SYNTHETIC Anchored Spark'; // can't be sacrificed; sacrifice this: add {C}
const RELIC = 'SYNTHETIC Passing Relic'; // {T}: the player to your right gains control of this
const ALTAR = 'SYNTHETIC Altar'; // sacrifice a creature: gain 2 life
const BLOOD_ALTAR = 'SYNTHETIC Blood Altar'; // sacrifice a creature: add {R}
const STUDY = 'SYNTHETIC Bloody Study'; // sorcery, sacrifice a creature as an additional cost
const CULLING = 'SYNTHETIC Instant Culling'; // each player sacrifices a creature
const BRUTE = 'SYNTHETIC Devouring Brute'; // devour 2
const BEARS = 'Grizzly Bears';

const canActivate = (g: ScenarioGame, card: string): boolean =>
  g.legalActions(0).some((a) => a.kind === 'activate' && a.object === g.id(card));
const canCast = (g: ScenarioGame, card: string): boolean =>
  g.legalActions(0).some((a) => a.kind === 'castSpell' && a.object === g.id(card));

describe('the cards are valid', () => {
  test.each([GOLEM, SNACK, SPARK, RELIC])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('sacrificePermanent (CR 701.21a, 101.2)', () => {
  test('a permanent that can not be sacrificed stays; another one goes', () => {
    const g = twoSeatGame((b) => b.battlefield(GOLEM, BEARS));
    expect(cantBeSacrificed(g.state, g.id(GOLEM))).toBe(true);
    expect(cantBeSacrificed(g.state, g.id(BEARS))).toBe(false);
    expect(sacrificePermanent(g.state, g.id(GOLEM), 0)).toBeNull();
    expect(sacrificePermanent(g.state, g.id(BEARS), 0)).not.toBeNull();
  });
});

describe('a cost that sacrifices a kind of permanent offers no such permanent (CR 118.3)', () => {
  test('the only creature can not be sacrificed: the cost is not payable', () => {
    const g = twoSeatGame((b) => b.battlefield(ALTAR, GOLEM));
    expect(canActivate(g, ALTAR)).toBe(false);
  });

  test('with another creature the cost is paid by that one', () => {
    const g = twoSeatGame((b) => b.battlefield(ALTAR, GOLEM, BEARS));
    expect(canActivate(g, ALTAR)).toBe(true);
    g.act(0).activate(ALTAR); // the only candidate is chosen without a question
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(GOLEM, 'battlefield', { seat: 0 });
  });

  test('"Sacrifice this" is not payable for a permanent that can not be sacrificed', () => {
    const g = twoSeatGame((b) => b.battlefield(SNACK, 'Plains', 'Plains'));
    expect(canActivate(g, SNACK)).toBe(false);
    expect(g.act(0).try.activate(SNACK).ok).toBe(false);
    g.expect.zone(SNACK, 'battlefield', { seat: 0 });
    g.expect.life(0, 20);
  });

  test('a mana ability that sacrifices a kind: the only creature can not be given, so no mana', () => {
    const g = twoSeatGame((b) => b.battlefield(BLOOD_ALTAR, GOLEM));
    expect(g.act(0).try.tapForMana(BLOOD_ALTAR).ok).toBe(false);
    g.expect.pool(0, {});
    g.expect.zone(GOLEM, 'battlefield', { seat: 0 });
  });

  test('a mana ability that sacrifices a kind: another creature pays', () => {
    const g = twoSeatGame((b) => b.battlefield(BLOOD_ALTAR, GOLEM, BEARS));
    g.act(0).tapForMana(BLOOD_ALTAR);
    g.expect.pool(0, 'R');
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(GOLEM, 'battlefield', { seat: 0 });
  });

  test('a mana ability that sacrifices this permanent makes no mana when it can not be sacrificed', () => {
    const g = twoSeatGame((b) => b.battlefield(SPARK));
    expect(g.act(0).try.tapForMana(SPARK).ok).toBe(false);
    g.expect.pool(0, {});
    g.expect.zone(SPARK, 'battlefield', { seat: 0 });
  });

  test('an additional cost to cast: the only creature can not be sacrificed, so the spell is not castable', () => {
    const g = twoSeatGame((b) => b.hand(STUDY).battlefield('Island', GOLEM));
    expect(canCast(g, STUDY)).toBe(false);
  });

  test('an additional cost to cast: another creature is sacrificed instead', () => {
    const g = twoSeatGame((b) => b.hand(STUDY).battlefield('Island', GOLEM, BEARS));
    expect(canCast(g, STUDY)).toBe(true);
    g.act(0).cast(STUDY, { pay: true });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(GOLEM, 'battlefield', { seat: 0 });
  });
});

describe('an effect that sacrifices (CR 701.21a, 101.2)', () => {
  const culling = (mine: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) =>
    twoSeatGame(
      (b) => mine(b.hand(CULLING).battlefield('Swamp', 'Swamp')),
      (b) => b.battlefield(GOLEM),
    );

  test('an edict that finds only the permanent sacrifices nothing', () => {
    const g = culling((b) => b);
    g.act(0).cast(CULLING, { pay: true });
    g.passAll();
    g.expect.zone(GOLEM, 'battlefield', { seat: 1 });
    expect(g.state.pending?.kind).not.toBe('choosePermanent');
    g.expect.invariants();
  });

  test('an edict with another creature to choose sacrifices that one', () => {
    const g = twoSeatGame(
      (b) => b.hand(CULLING).battlefield('Swamp', 'Swamp'),
      (b) => b.battlefield(GOLEM, BEARS),
    );
    g.act(0).cast(CULLING, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(GOLEM, 'battlefield', { seat: 1 });
  });
});

describe('devour (CR 702.82a)', () => {
  test('the only creature can not be sacrificed: nothing is asked and the creature enters with no counters', () => {
    const g = twoSeatGame((b) =>
      b.hand(BRUTE).battlefield('Mountain', { count: 3 }).battlefield(GOLEM),
    );
    g.act(0).cast(BRUTE, { pay: true });
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('choosePermanent');
    g.expect.zone(BRUTE, 'battlefield', { seat: 0 });
    g.expect.counters(BRUTE, {});
    g.expect.zone(GOLEM, 'battlefield', { seat: 0 });
  });

  test('with another creature only that one is offered', () => {
    const g = twoSeatGame((b) =>
      b.hand(BRUTE).battlefield('Mountain', { count: 3 }).battlefield(GOLEM, BEARS),
    );
    g.act(0).cast(BRUTE, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected a permanent choice');
    expect(d.legal).toEqual([g.id(BEARS)]);
  });
});

describe('the player to your right (turn order)', () => {
  test('with two players it is the opponent, and the permanent changes hands', () => {
    const g = twoSeatGame((b) => b.battlefield(RELIC));
    g.act(0).activate(RELIC);
    g.passAll();
    expect(controllerOf(g.state, getObject(g.state, g.id(RELIC)))).toBe(1);
    g.expect.invariants();
  });

  test('with two players it is the opponent for either seat', () => {
    const g = twoSeatGame(
      (b) => b,
      (b) => b.battlefield(RELIC),
    );
    expect(playerToRightOf(g.state, 0)).toBe(1);
    expect(playerToRightOf(g.state, 1)).toBe(0);
  });

  const seats = (lost: readonly boolean[]) =>
    ({ seats: lost.map((hasLost, id) => ({ id, hasLost })) }) as unknown as GameState;

  test('with three players it is the seat before, skipping a player who left the game', () => {
    expect(playerToRightOf(seats([false, false, false]), 0)).toBe(2);
    expect(playerToRightOf(seats([false, false, false]), 1)).toBe(0);
    expect(playerToRightOf(seats([false, false, false]), 2)).toBe(1);
    expect(playerToRightOf(seats([false, false, true]), 0)).toBe(1);
    expect(playerToRightOf(seats([false, true, true]), 0)).toBeNull();
  });

  test('the selector names that player for the controller of the ability, and nobody for the last player', () => {
    const three = seats([false, false, false]);
    const ctx = { controller: 1, source: null } as never;
    expect(resolvePlayers(three, { kind: 'playerToYourRight' }, ctx, [])).toEqual([0]);
    expect(
      resolvePlayers(
        seats([false, true, true]),
        { kind: 'playerToYourRight' },
        { controller: 0, source: null } as never,
        [],
      ),
    ).toEqual([]);
  });
});
