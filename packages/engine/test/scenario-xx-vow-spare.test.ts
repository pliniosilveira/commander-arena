// "Each player puts a vow counter on a creature they control and sacrifices the rest. Each of those creatures can't attack you or planeswalkers you control for as long as it has
// a vow counter on it." (Promise of Loyalty, issue 89), the SYNTHETIC Vow Rite of `src/cards/fixtures/synthetic-gisa-g3.ts`: `sparePermanents` with `own.typesOnly`, `own.counter` and
// `own.cantAttackYou`. Pins: CR 608.2d (each player chooses as the effect resolves), CR 701.21a (sacrifice), CR 122.1 (counters), CR 508.1a (a creature that can't attack a player is not
// declared attacking them), CR 611.2b ("for as long as" ends, for good, when the condition stops being true), CR 611.2c (the set of creatures is fixed as the effect resolves).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { attackCandidates } from '../src/rules/combat-legality';
import { checkStateBasedActions } from '../src/rules/sba';
import { scenario } from '../src/testing/index';

const RITE = 'SYNTHETIC Vow Rite';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const ELVES = 'Llanowar Elves';
const SERRA = 'Serra Angel';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

test('the card is valid', () => {
  expect(validateCard(syntheticCard(RITE))).toEqual([]);
});

const game = () =>
  scenario()
    .seat(0)
    .hand(RITE)
    .battlefield('Plains', { count: 5 })
    .battlefield(SERRA, 'Island')
    .library(...LIBRARY)
    .seat(1)
    .battlefield(BEARS, SPIDER, ELVES, 'Forest')
    .library(...LIBRARY)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();

describe('Vow Rite', () => {
  test('each player keeps one creature with a vow counter and sacrifices the other creatures; lands stay', () => {
    const g = game();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    // Seat 0 has one creature: no question. Seat 1 chooses among three.
    expect(g.state.pending?.kind).toBe('choosePermanent');
    g.act(1).choosePermanents({ name: SPIDER, seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    g.expect.zone(SPIDER, 'battlefield', { seat: 1 });
    g.expect.zone('Forest', 'battlefield', { seat: 1 });
    g.expect.zone('Island', 'battlefield', { seat: 0 });
    expect(g.state.objects[g.id(SPIDER)]?.counters.vow).toBe(1);
    expect(g.state.objects[g.id(SERRA)]?.counters.vow).toBe(1);
    g.expect.invariants();
  });

  test("the vowed creatures can't attack the caster, but may attack others; the caster's creature is unaffected", () => {
    const g = game();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.act(1).choosePermanents({ name: SPIDER, seat: 1 });
    const spider = g.id(SPIDER);
    const state = { ...g.state, turn: { ...g.state.turn, activeSeat: 1 as const } };
    const targets = attackCandidates(state, 1).find((c) => c.attacker === spider)?.targets ?? [];
    expect(targets.some((t) => t.kind === 'player' && t.seat === 0)).toBe(false);
  });

  test('it ends for good when the vow counter is gone (CR 611.2b): a counter put on again does not restore it', () => {
    const g = game();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.act(1).choosePermanents({ name: SPIDER, seat: 1 });
    const spider = g.id(SPIDER);
    const held = g.state.objects[spider];
    if (held === undefined) throw new Error('no spider');
    const withCounters = (counters: Record<string, number>) => ({
      ...g.state,
      turn: { ...g.state.turn, activeSeat: 1 as const },
      objects: { ...g.state.objects, [spider]: { ...held, counters } },
    });
    const attacks0 = (s: typeof g.state) =>
      (attackCandidates(s, 1).find((c) => c.attacker === spider)?.targets ?? []).some(
        (t) => t.kind === 'player' && t.seat === 0,
      );
    expect(attacks0(withCounters({ vow: 1 }))).toBe(false);
    // The counter goes away; the state-based actions end the effect, and the counter coming back later changes nothing.
    const stripped = checkStateBasedActions(withCounters({})).state;
    expect(stripped.continuousEffects.some((e) => e.change.kind === 'cantAttackPlayer')).toBe(
      false,
    );
    const back = {
      ...stripped,
      objects: { ...stripped.objects, [spider]: { ...held, counters: { vow: 1 } } },
    };
    expect(attacks0(back)).toBe(true);
  });
});
