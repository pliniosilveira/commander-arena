// CasualAgent and damage prevention (src/casual-prevention.ts): a Fog-style spell is cast only on the
// opponent's turn, in the declare blockers step, when the combat damage aimed at the agent would
// leave it NEAR_LETHAL_LIFE life or less; never otherwise, and never a shield that needs a target.
// The cards are the SYNTHETIC ones of src/cards/fixtures/synthetic-prevention.ts, in states built
// with the scenario DSL and answered through the agent's own decision handling.
import type { Action } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { incomingCombatDamage, NEAR_LETHAL_LIFE } from '../src/casual-prevention';
import { CasualAgent } from '../src/index';
import { CTX } from './helpers';

const FOG = 'SYNTHETIC Fog Spell';
const SELF_WARD = 'SYNTHETIC Self Ward';
const SHIELD3 = 'SYNTHETIC Shield Three';
const SOFTEN = 'SYNTHETIC Soften Blow';
const QUIET = 'SYNTHETIC Quiet Fog';
const V33 = 'SYNTHETIC Vanilla 3/3';
const V22 = 'SYNTHETIC Vanilla 2/2';
const V11 = 'SYNTHETIC Vanilla 1/1';
const TRAMPLER = 'SYNTHETIC Trampler 4/4';
const DS = 'SYNTHETIC Double Strike Lifelink 3/3';

/** Seat 1 (the agent) holds `hand` with lands, at `life`, after `attackers` were blocked as told. */
function defend(
  hand: string[],
  life: number,
  attackers: string[],
  blocks: { blocker: string; attacker: string }[] = [],
  mine: string[] = [],
): ScenarioGame {
  const b = scenario().seat(0);
  for (const a of attackers) b.battlefield(a);
  b.seat(1)
    .life(life)
    .battlefield('Plains', 'Plains', 'Plains', ...mine)
    .hand(...hand)
    .at('precombatMain', { active: 0 });
  const g = b.build();
  g.advanceTo('declareAttackers');
  g.act(0).attack(attackers);
  g.advanceTo('declareBlockers');
  if (g.state.pending?.kind === 'declareBlockers') g.act(1).declareBlockers(blocks);
  g.act(0).pass();
  return g;
}

async function decide(g: ScenarioGame, agent = new CasualAgent({ seed: 5 })): Promise<Action> {
  const view = g.view(1);
  if (view.pending === null) throw new Error('no decision');
  return agent.decide(view, view.pending, CTX);
}

async function castsFrom(g: ScenarioGame, name: string, agent?: CasualAgent): Promise<boolean> {
  const action = await decide(g, agent);
  const hand = g.view(1).seats[1]?.hand ?? [];
  return action.kind === 'castSpell' && hand.find((o) => o.id === action.object)?.name === name;
}

describe('when a Fog is cast', () => {
  test('lethal combat damage: cast', async () => {
    expect(await castsFrom(defend([FOG], 3, [V33]), FOG)).toBe(true);
  });

  test(`damage that would leave ${NEAR_LETHAL_LIFE} life or less: cast`, async () => {
    expect(await castsFrom(defend([FOG], 3 + NEAR_LETHAL_LIFE, [V33]), FOG)).toBe(true);
  });

  test('damage that leaves more life than that: not cast', async () => {
    expect(await castsFrom(defend([FOG], 3 + NEAR_LETHAL_LIFE + 1, [V33]), FOG)).toBe(false);
  });

  test('a blocked attacker without trample deals nothing to the agent: not cast', async () => {
    const g = defend([FOG], 3, [V33], [{ blocker: V22, attacker: V33 }], [V22]);
    expect(incomingCombatDamage(g.view(1))).toBe(0);
    expect(await castsFrom(g, FOG)).toBe(false);
  });

  test('trample damage past the blocker counts: 4 trample blocked by a 1/1 is 3 incoming', async () => {
    const g = defend([FOG], 3, [TRAMPLER], [{ blocker: V11, attacker: TRAMPLER }], [V11]);
    expect(incomingCombatDamage(g.view(1))).toBe(3);
    expect(await castsFrom(g, FOG)).toBe(true);
  });

  test('double strike counts twice', async () => {
    const g = defend([FOG], 5, [DS]);
    expect(incomingCombatDamage(g.view(1))).toBe(6);
    expect(await castsFrom(g, FOG)).toBe(true);
  });

  test('"Prevent all damage that would be dealt to you" is cast the same way', async () => {
    expect(await castsFrom(defend([SELF_WARD], 3, [V33]), SELF_WARD)).toBe(true);
  });
});

describe('when a prevention spell is not cast', () => {
  test('never on the agent own turn, even with the mana and a lethal-looking board', async () => {
    const g = scenario()
      .seat(0)
      .life(2)
      .battlefield(V33)
      .seat(1)
      .battlefield('Plains', 'Plains')
      .hand(FOG)
      .at('precombatMain', { active: 1 })
      .build();
    expect(await castsFrom(g, FOG)).toBe(false);
  });

  test('never in the main phase of the opponent turn, before attackers are known', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(V33)
      .seat(1)
      .life(1)
      .battlefield('Plains', 'Plains')
      .hand(FOG)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    expect(await castsFrom(g, FOG)).toBe(false);
  });

  test.each([[SHIELD3], [SOFTEN], [QUIET]])(
    '%s: a numeric, targeted or noncombat shield is never cast, even when facing lethal',
    async (card) => {
      expect(await castsFrom(defend([card], 1, [V33]), card)).toBe(false);
    },
  );

  test('only once a turn: with the first Fog cast, a second copy is held back', async () => {
    const g = defend([FOG, FOG], 3, [V33]);
    const agent = new CasualAgent({ seed: 5 });
    expect(await castsFrom(g, FOG, agent)).toBe(true);
    expect(await castsFrom(g, FOG, agent)).toBe(false);
  });
});
