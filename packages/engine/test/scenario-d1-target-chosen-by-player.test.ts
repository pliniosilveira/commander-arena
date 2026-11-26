// "Whenever this creature deals combat damage to a player, destroy target nonland permanent of that player's choice that one of your opponents controls." (Bladegriff Prototype):
// `TargetSpec.chosenBy` 'triggerPlayer': the damaged player chooses the target as the ability goes on the stack; its controller stays the attacker.
// Pins: CR 603.3d (targets of a triggered ability are chosen as it is put on the stack), CR 115.1 and 115.2 (a target is legal if it fits the ability's text, read for the controller of the
// ability), CR 109.4, CR 800.4 (a player who left the game); the rulings of 2020-11-10 (the damaged player chooses; the attacker stays the controller). Played with three seats.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-d1.ts) or fixtures.
import { describe, expect, test } from 'vitest';
import { applyAction, getLegalActions, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const GRIFFIN = 'SYNTHETIC Choosing Griffin';
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';
const RING = 'Sol Ring';

test('the card is valid', () => {
  expect(validateCard(syntheticCard(GRIFFIN))).toEqual([]);
});

/** Seat 0 attacks seat 1 with the Griffin; seat 0 also has Bears, seat 1 has Elves and a Plains, seat 2 has a Sol Ring. */
function hit() {
  const g = scenario({ seats: 3 })
    .seat(0)
    .life(20)
    .battlefield(GRIFFIN, BEARS)
    .seat(1)
    .life(20)
    .battlefield(ELVES, 'Plains')
    .seat(2)
    .life(20)
    .battlefield(RING)
    .at('precombatMain', { active: 0 })
    .build();
  g.advanceTo('declareAttackers');
  g.act(0).declareAttackers([{ attacker: { name: GRIFFIN, seat: 0 }, target: { player: 1 } }]);
  g.advanceTo('combatDamage');
  return g;
}

describe('chosenBy is accepted only where a player of the event can choose', () => {
  const card = syntheticCard(GRIFFIN);
  const face = card.faces[0];
  if (face === undefined) throw new Error('no face');
  const ability = face.abilities[0];
  if (ability?.kind !== 'triggered') throw new Error('no ability');
  const withAbility = (patch: Record<string, unknown>) =>
    ({ ...card, faces: [{ ...face, abilities: [{ ...ability, ...patch }] }] }) as never;

  test('a trigger whose event is about no player is refused', () => {
    expect(
      validateCard(withAbility({ trigger: { kind: 'entersBattlefield', what: { kind: 'this' } } }))
        .length,
    ).toBeGreaterThan(0);
  });

  test('a second target slot is refused', () => {
    const [first] = ability.targets ?? [];
    expect(
      validateCard(withAbility({ targets: [first, { ...first, id: 't2' }] })).length,
    ).toBeGreaterThan(0);
  });

  test('another name is refused', () => {
    const [first] = ability.targets ?? [];
    expect(
      validateCard(withAbility({ targets: [{ ...first, chosenBy: 'controller' }] })).length,
    ).toBeGreaterThan(0);
  });
});

describe('the damaged player chooses the target (CR 603.3d)', () => {
  test('the decision is the damaged player’s, among the nonland permanents of the controller’s opponents', () => {
    const g = hit();
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    expect(d.seat).toBe(1);
    expect(d.forController).toBe(0);
    expect(d.forTrigger).toBe(true);
    const ids = d.specs[0]?.legal.flatMap((t) => (t.kind === 'object' ? [t.id] : [])) ?? [];
    expect(ids.sort()).toEqual([g.id(ELVES), g.id(RING)].sort());
    // Its own land, the attacker's creatures and the attacker itself are not legal: "nonland", "one of your opponents controls".
    expect(ids).not.toContain(g.id(BEARS));
    expect(ids).not.toContain(g.id(GRIFFIN));
  });

  test('the attacker is not asked, and cannot answer for them', () => {
    const g = hit();
    expect(getLegalActions(g.state, 0)).toEqual([]);
    const refused = applyAction(g.state, 0, {
      kind: 'chooseTargets',
      targets: [{ kind: 'object', specId: 't1', id: g.id(RING) }],
    });
    expect(refused.ok).toBe(false);
  });

  test('the damaged player may choose a permanent of another opponent, or their own', () => {
    const g = hit();
    g.act(1).chooseTargets({ name: RING, seat: 2 });
    g.passAll();
    g.expect.zone(RING, 'graveyard', { seat: 2 });
    g.expect.zone(ELVES, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('or their own creature', () => {
    const g = hit();
    g.act(1).chooseTargets({ name: ELVES, seat: 1 });
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    g.expect.zone(RING, 'battlefield', { seat: 2 });
  });

  test('the ability is the attacker’s: it goes on the stack under their control', () => {
    const g = hit();
    g.act(1).chooseTargets({ name: ELVES, seat: 1 });
    const top = g.state.stack[g.state.stack.length - 1];
    const object = top === undefined ? undefined : g.state.objects[top];
    expect(object?.controller).toBe(0);
  });
});

describe('with one legal target nothing is asked', () => {
  test('it is destroyed', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .life(20)
      .battlefield(GRIFFIN)
      .seat(1)
      .life(20)
      .battlefield('Plains')
      .seat(2)
      .life(20)
      .battlefield(RING)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: { name: GRIFFIN, seat: 0 }, target: { player: 1 } }]);
    g.advanceTo('combatDamage');
    g.passAll();
    g.expect.zone(RING, 'graveyard', { seat: 2 });
  });
});
