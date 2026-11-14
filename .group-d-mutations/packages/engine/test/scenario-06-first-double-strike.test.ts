// Scenario 6 (SPEC 12): first strike and double strike. A 2/2 first striker blocked by a 2/2 kills it
// in the first-strike step and takes no damage. An unblocked 3/3 with double strike and lifelink
// deals 6 damage and gains 6 life over two damage steps.
// Pins: CR 510.4 (Combat Damage Step): if at least one attacking or blocking creature has first
// strike or double strike as the combat damage step begins, only creatures with first strike or
// double strike assign combat damage in that step; the phase then gets a second combat damage step
// in which the remaining attackers and blockers that had neither first strike nor double strike as
// the first step began, and those that currently have double strike, assign damage.
// CR 702.7b (First Strike), CR 702.4b (Double Strike), CR 702.15b (Lifelink): damage dealt by a
// lifelink source gains its controller that much life, each time damage is dealt.
// CR 704.3 and 117.5: state-based actions are checked, and players get priority, between the steps,
// so a creature killed by first-strike damage is gone before the regular step.
import { describe, expect, test } from 'vitest';
import { kw } from '../src/cards/fixtures/helpers';
import { type CardDefinition, fixtureCard, type GameState, syntheticCard } from '../src/index';
import { createDriver, scenario } from '../src/testing/index';

const FS = 'SYNTHETIC First Striker 2/2';
const TWO = 'SYNTHETIC Vanilla 2/2';
const THREE = 'SYNTHETIC Vanilla 3/3';
const DSL = 'SYNTHETIC Double Strike Lifelink 3/3';

type G = ReturnType<ReturnType<typeof scenario>['build']>;

function combat(
  attacker: string,
  blockers: string[],
  extra?: (b: ReturnType<typeof scenario>) => void,
) {
  const b = scenario()
    .seat(0)
    .battlefield(attacker)
    .life(20)
    .library('Island', { count: 3 })
    .seat(1);
  for (const name of blockers) b.battlefield(name);
  b.library('Island', { count: 3 });
  extra?.(b);
  const g = b.at('precombatMain', { active: 0 }).build();
  g.advanceTo('declareAttackers');
  g.act(0).attack(attacker);
  g.advanceTo('declareBlockers');
  // With no creature on the other side able to block, the engine asks nothing (CR 509.1).
  if (blockers.length > 0) {
    g.act(1).declareBlockers(blockers.map((blocker) => ({ blocker, attacker })));
  }
  return g;
}

/** Passes priority until the game is in `step` with priority (the damage there already dealt). */
function toStep(g: G, step: 'firstStrikeDamage' | 'combatDamage' | 'endOfCombat') {
  g.advanceTo(step);
  g.expect.step(step);
  g.expect.pending('priority');
}

describe('CR 510.4: a first striker kills its blocker before the blocker deals damage', () => {
  test('a 2/2 first striker blocked by a 2/2 kills it in the first-strike step and takes no damage', () => {
    const g = combat(FS, [TWO]);
    toStep(g, 'firstStrikeDamage');
    g.expect.zone(TWO, 'graveyard', { seat: 1 });
    g.expect.damage(FS, 0);
    // The regular step still happens, with nothing left to deal damage from the blocker.
    toStep(g, 'combatDamage');
    g.expect.damage(FS, 0);
    g.expect.zone(FS, 'battlefield', { seat: 0 });
    g.expect.life(1, 40);
  });

  test('a blocking first striker kills the attacker first: Youthful Knight blocks a 2/2', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TWO)
      .seat(1)
      .battlefield('Youthful Knight')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(TWO);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: 'Youthful Knight', attacker: TWO }]);
    toStep(g, 'firstStrikeDamage');
    g.expect.zone(TWO, 'graveyard', { seat: 0 });
    g.expect.damage('Youthful Knight', 0);
    g.advanceTo('endOfCombat');
    g.expect.zone('Youthful Knight', 'battlefield', { seat: 1 });
  });

  test('a blocker killed in the first-strike step deals no damage, even deathtouch damage', () => {
    // Typhoid Rats (deathtouch 1/1) blocks Youthful Knight (first strike 2/1): the Knight kills it
    // first and is never dealt the deathtouch damage.
    const g = scenario()
      .seat(0)
      .battlefield('Youthful Knight')
      .seat(1)
      .battlefield('Typhoid Rats')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('Youthful Knight');
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: 'Typhoid Rats', attacker: 'Youthful Knight' }]);
    toStep(g, 'firstStrikeDamage');
    g.expect.zone('Typhoid Rats', 'graveyard', { seat: 1 });
    g.advanceTo('endOfCombat');
    g.expect.damage('Youthful Knight', 0);
    g.expect.zone('Youthful Knight', 'battlefield', { seat: 0 });
    g.expect.noEvent({ kind: 'damageDealt', amount: 1, to: { kind: 'object' } });
  });

  test('a first striker that does not kill its blocker is damaged in the regular step', () => {
    const g = combat(FS, ['SYNTHETIC Vanilla 5/5']);
    toStep(g, 'firstStrikeDamage');
    g.expect.damage('SYNTHETIC Vanilla 5/5', 2);
    g.expect.damage(FS, 0);
    toStep(g, 'combatDamage');
    g.expect.zone(FS, 'graveyard', { seat: 0 });
    g.expect.damage('SYNTHETIC Vanilla 5/5', 2);
  });

  test('a creature without first strike deals damage in the regular step only', () => {
    // A vanilla 3/3 attacker blocked by a first striker: the blocker hits first for 2, the attacker
    // survives and deals its 3 in the regular step; the first striker does not deal damage again.
    const g = combat(THREE, [FS]);
    toStep(g, 'firstStrikeDamage');
    g.expect.damage(THREE, 2);
    g.expect.damage(FS, 0);
    toStep(g, 'combatDamage');
    g.expect.zone(FS, 'graveyard', { seat: 1 });
    g.expect.damage(THREE, 2);
  });
});

describe('CR 510.4: no first-strike step unless someone has first or double strike', () => {
  test('nobody has either: the combat damage step follows the declare blockers step directly', () => {
    const g = combat(THREE, [TWO]);
    const mark = g.mark();
    g.advanceTo('combatDamage');
    g.expect.noEvent({ kind: 'stepBegan', step: 'firstStrikeDamage' }, { since: mark });
    g.expect.zone(TWO, 'graveyard');
    g.expect.damage(THREE, 2);
  });

  test('with a first striker in combat the step happens before the regular one', () => {
    const g = combat(FS, [TWO]);
    const mark = g.mark();
    g.advanceTo('endOfCombat');
    g.expect.eventLog(
      [
        { kind: 'stepBegan', step: 'firstStrikeDamage' },
        { kind: 'stepBegan', step: 'combatDamage' },
        { kind: 'stepBegan', step: 'endOfCombat' },
      ],
      { since: mark },
    );
  });

  test('a first striker that is not attacking or blocking does not cause the step', () => {
    const g = combat(THREE, [TWO], (b) => b.seat(1).battlefield(FS));
    // The first striker has no blocking job: seat 1 blocked with the vanilla 2/2 instead.
    const mark = g.mark();
    g.advanceTo('combatDamage');
    g.expect.noEvent({ kind: 'stepBegan', step: 'firstStrikeDamage' }, { since: mark });
  });

  test('a double striker causes the step too', () => {
    const g = combat('Fencing Ace', [TWO]);
    const mark = g.mark();
    g.advanceTo('combatDamage');
    g.expect.eventLog([{ kind: 'stepBegan', step: 'firstStrikeDamage' }], { since: mark });
  });

  test('the first-strike step is skipped, like the whole damage, when nobody attacks (CR 508.8)', () => {
    const g = scenario().seat(0).battlefield(FS).seat(1).at('precombatMain', { active: 0 }).build();
    const mark = g.mark();
    g.advanceTo('postcombatMain');
    g.expect.noEvent({ kind: 'stepBegan', step: 'firstStrikeDamage' }, { since: mark });
    g.expect.noEvent({ kind: 'stepBegan', step: 'combatDamage' }, { since: mark });
  });
});

describe('CR 702.4b: double strike deals damage in both steps', () => {
  test('an unblocked 3/3 with double strike and lifelink deals 6 and gains 6 over two steps', () => {
    const g = combat(DSL, []);
    // Seat 0 starts at 20 life, seat 1 at 40.
    toStep(g, 'firstStrikeDamage');
    g.expect.life(1, 37);
    g.expect.life(0, 23);
    toStep(g, 'combatDamage');
    g.expect.life(1, 34);
    g.expect.life(0, 26);
    // Two damage events of 3, one per step, each with its own lifelink gain.
    const events = g.events.filter((e) => e.kind === 'damageDealt' && e.to.kind === 'player');
    expect(events.map((e) => (e.kind === 'damageDealt' ? e.amount : 0))).toEqual([3, 3]);
    g.expect.life(1, 34);
  });

  test('Fencing Ace unblocked deals 1 in each step', () => {
    const g = combat('Fencing Ace', []);
    toStep(g, 'firstStrikeDamage');
    g.expect.life(1, 39);
    toStep(g, 'combatDamage');
    g.expect.life(1, 38);
  });

  test('a double striker blocked by a 2/2: 1 damage in each step, and it takes damage in the regular step only', () => {
    const g = combat('Fencing Ace', [TWO]);
    toStep(g, 'firstStrikeDamage');
    g.expect.damage(TWO, 1);
    g.expect.zone('Fencing Ace', 'battlefield', { seat: 0 });
    toStep(g, 'combatDamage');
    // Both die at the same time in the regular step: the Ace's second hit kills the blocker while
    // the blocker's only hit kills the Ace (CR 510.2).
    g.expect.zone(TWO, 'graveyard', { seat: 1 });
    g.expect.zone('Fencing Ace', 'graveyard', { seat: 0 });
  });

  test('a blocking double striker deals damage in both steps', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Vanilla 5/5')
      .seat(1)
      .battlefield('Fencing Ace')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('SYNTHETIC Vanilla 5/5');
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: 'Fencing Ace', attacker: 'SYNTHETIC Vanilla 5/5' }]);
    toStep(g, 'firstStrikeDamage');
    g.expect.damage('SYNTHETIC Vanilla 5/5', 1);
    toStep(g, 'combatDamage');
    g.expect.damage('SYNTHETIC Vanilla 5/5', 2);
  });
});

/**
 * Replaces the definition of the card behind `name` mid-combat. No effect grants or removes
 * keywords yet (M5), so this stands in for one: it changes what the creature has between the
 * damage steps, which is exactly the situation CR 510.4 speaks about.
 */
function swapAbilities(
  g: G,
  name: string,
  abilities: CardDefinition['faces'][number]['abilities'],
): G {
  const state: GameState = g.state;
  const obj = g.object(name);
  if (obj.card === null) throw new Error('not a card');
  const index = state.cards[obj.card]?.definition ?? -1;
  const def = state.definitions[index];
  const face = def?.faces[0];
  if (!def || !face) throw new Error('no definition');
  const definitions = state.definitions.map((d, i) =>
    i === index ? { ...def, faces: [{ ...face, abilities }] } : d,
  );
  return createDriver({ ...state, definitions });
}

describe('CR 510.4: what a creature had when the first damage step began decides', () => {
  /** A vanilla 3/3 attacker blocked by a first striker: the first step has happened. */
  function afterFirstStep() {
    const g = combat(THREE, [FS]);
    toStep(g, 'firstStrikeDamage');
    g.expect.damage(THREE, 2);
    return g;
  }

  test('a creature that gains first strike after the first step began deals damage in the regular step, once', () => {
    const g = swapAbilities(afterFirstStep(), THREE, [kw('firstStrike')]);
    const mark = g.mark();
    g.advanceTo('combatDamage');
    g.expect.zone(FS, 'graveyard', { seat: 1 });
    const dealt = g.eventsSince(mark).filter((e) => e.kind === 'damageDealt');
    expect(dealt.map((e) => (e.kind === 'damageDealt' ? e.amount : 0))).toEqual([3]);
    g.expect.damage(THREE, 2);
  });

  test('a creature that gains double strike after the first step began deals damage in the regular step', () => {
    const g = swapAbilities(afterFirstStep(), THREE, [kw('doubleStrike')]);
    const mark = g.mark();
    g.advanceTo('combatDamage');
    const dealt = g.eventsSince(mark).filter((e) => e.kind === 'damageDealt');
    expect(dealt.map((e) => (e.kind === 'damageDealt' ? e.amount : 0))).toEqual([3]);
  });

  test('a first striker that loses first strike after the first step does not deal damage again', () => {
    const g = swapAbilities(afterFirstStep(), FS, []);
    const mark = g.mark();
    g.advanceTo('combatDamage');
    const fromFs = g
      .eventsSince(mark)
      .filter((e) => e.kind === 'damageDealt' && e.to.kind === 'object' && e.to.id === g.id(THREE));
    expect(fromFs).toHaveLength(0);
    g.expect.damage(THREE, 2);
    g.expect.zone(FS, 'graveyard', { seat: 1 });
  });

  test('a first striker that gains double strike after the first step deals damage again', () => {
    const g = swapAbilities(afterFirstStep(), FS, [kw('doubleStrike')]);
    // The blocker dealt 2 in the first step; with double strike now it deals 2 more: 4 in all.
    g.advanceTo('combatDamage');
    g.expect.zone(THREE, 'graveyard', { seat: 0 });
    g.expect.zone(FS, 'graveyard', { seat: 1 });
  });
});

describe('fixtures sanity: the real keyword creatures behave the same way', () => {
  test('Fencing Ace and Youthful Knight carry their keywords as abilities', () => {
    expect(fixtureCard('Youthful Knight').faces[0]?.abilities).toEqual([kw('firstStrike')]);
    expect(syntheticCard(DSL).faces[0]?.abilities).toEqual([kw('doubleStrike'), kw('lifelink')]);
  });
});
