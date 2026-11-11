// CasualAgent and attachments (slice S4a): the heuristics of src/casual-attachments.ts, run against
// real engine states built with the scenario DSL (SYNTHETIC cards), through the same decision
// handling the agent uses in a game. Pins: an Aura goes on the agent's own best creature and on an
// opponent's only when it hurts; an Aura with no host on the right side is not cast; an Equipment
// that is attached to nothing is equipped to the best bare creature, once per turn, in a main phase,
// and one that is attached is left alone.
import type { Action, PendingDecision } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent } from '../src/index';
import { CTX } from './helpers';

const MIGHT = 'SYNTHETIC Might Aura';
const CURSE = 'SYNTHETIC Curse Aura';
const LOYAL = 'SYNTHETIC Loyal Aura';
const LAND_AURA = 'SYNTHETIC Shield Land Aura';
const BLADE = 'SYNTHETIC Blade';
const SMALL = 'SYNTHETIC Vanilla 1/1';
const MID = 'SYNTHETIC Vanilla 2/2';
const BIG = 'SYNTHETIC Vanilla 5/5';

async function answer(g: ScenarioGame, agent = new CasualAgent({ seed: 1 })): Promise<Action> {
  const view = g.view(g.deciding);
  const decision: PendingDecision | null = view.pending;
  if (decision === null) throw new Error('no decision');
  return agent.decide(view, decision, CTX);
}

/** The object a chooseTargets answer names, as a card name. */
function chosenName(g: ScenarioGame, action: Action): string[] {
  if (action.kind !== 'chooseTargets')
    throw new Error(`expected chooseTargets, got ${action.kind}`);
  return action.targets.map((t) =>
    t.kind === 'object'
      ? g.object(t.id).card === null
        ? '?'
        : cardName(g, t.id)
      : `player ${t.seat}`,
  );
}

function cardName(g: ScenarioGame, id: string): string {
  const card = g.state.objects[id as never]?.card;
  const instance = card === null || card === undefined ? undefined : g.state.cards[card];
  return instance === undefined ? '?' : (g.state.definitions[instance.definition]?.name ?? '?');
}

/** Casts `aura` (pending: its targets decision) for seat 0. */
function castingAura(aura: string, mine: string[], theirs: string[]): ScenarioGame {
  const b = scenario().seat(0).hand(aura).battlefield('Forest', 'Forest', 'Swamp', 'Plains');
  for (const name of mine) b.battlefield(name);
  b.seat(1);
  for (const name of theirs) b.battlefield(name);
  const g = b.build();
  g.act(0).cast(aura);
  return g;
}

describe('where an Aura goes', () => {
  test('a beneficial Aura goes on the agent best creature, not the opponent', async () => {
    const g = castingAura(MIGHT, [MID, SMALL], [BIG]);
    expect(chosenName(g, await answer(g))).toEqual([MID]);
  });

  test('the best of the agent creatures is the one with the most power', async () => {
    const g = castingAura(MIGHT, [SMALL, BIG, MID], [BIG]);
    const named = chosenName(g, await answer(g));
    expect(named).toEqual([BIG]);
    // The chosen one is the agent own: the opponent also has a 5/5 and it was not picked.
    const action = await answer(g);
    if (action.kind !== 'chooseTargets') throw new Error('expected chooseTargets');
    const [target] = action.targets;
    expect(target?.kind === 'object' && g.object(target.id).controller).toBe(0);
  });

  test('a hostile Aura goes on the opponent best creature', async () => {
    const g = castingAura(CURSE, [BIG], [SMALL, MID]);
    expect(chosenName(g, await answer(g))).toEqual([MID]);
  });

  test('an Aura for "creature you control" goes on an own creature', async () => {
    const g = castingAura(LOYAL, [SMALL], [BIG]);
    expect(chosenName(g, await answer(g))).toEqual([SMALL]);
  });

  test('an Aura for a land goes on one of the agent lands', async () => {
    const g = castingAura(LAND_AURA, [], []);
    const action = await answer(g);
    if (action.kind !== 'chooseTargets') throw new Error('expected chooseTargets');
    const [target] = action.targets;
    expect(target?.kind === 'object' && g.object(target.id).controller).toBe(0);
  });
});

describe('an Aura is cast only when it has a host on the right side', () => {
  const priorityAnswer = (g: ScenarioGame) => answer(g);

  test('a beneficial Aura with no creature of its own is not cast: the agent passes', async () => {
    const g = scenario()
      .seat(0)
      .hand(MIGHT)
      .battlefield('Forest', 'Forest')
      .seat(1)
      .battlefield(BIG)
      .build();
    expect(await priorityAnswer(g)).toEqual({ kind: 'pass' });
  });

  test('with a creature of its own it casts the Aura', async () => {
    const g = scenario()
      .seat(0)
      .hand(MIGHT)
      .battlefield('Forest', 'Forest')
      .battlefield(MID)
      .seat(1)
      .build();
    expect(await priorityAnswer(g)).toEqual({ kind: 'castSpell', object: g.id(MIGHT) });
  });

  test('a hostile Aura needs an opponent creature; their hexproof creature does not count', async () => {
    const none = scenario()
      .seat(0)
      .hand(CURSE)
      .battlefield('Swamp')
      .battlefield(BIG)
      .seat(1)
      .build();
    expect(await priorityAnswer(none)).toEqual({ kind: 'pass' });
    const hexproof = scenario()
      .seat(0)
      .hand(CURSE)
      .battlefield('Swamp')
      .seat(1)
      .battlefield('SYNTHETIC Hexproof Bear')
      .build();
    expect(await priorityAnswer(hexproof)).toEqual({ kind: 'pass' });
    const one = scenario()
      .seat(0)
      .hand(CURSE)
      .battlefield('Swamp')
      .seat(1)
      .battlefield(MID)
      .build();
    expect(await priorityAnswer(one)).toEqual({ kind: 'castSpell', object: one.id(CURSE) });
  });
});

describe('equipping', () => {
  const equipAction = (g: ScenarioGame, name = BLADE): Action => ({
    kind: 'activate',
    object: g.id(name),
    abilityIndex: 2,
  });

  test('an unattached Equipment is equipped when there is spare mana', async () => {
    const g = scenario().seat(0).battlefield(BLADE, 'Forest', MID).seat(1).build();
    expect(await answer(g)).toEqual(equipAction(g));
  });

  test('the targets decision picks the best creature that carries nothing', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(BLADE, 'SYNTHETIC Cloak', 'Forest', 'Forest', 'Forest', MID, BIG, SMALL)
      .seat(1)
      .build();
    g.act(0).activate('SYNTHETIC Cloak', { targets: [BIG], pay: true });
    g.passAll();
    // The Cloak sits on the 5/5 (now 5/7); the Blade goes to the best creature with nothing on it.
    g.act(0).activate(BLADE);
    expect(chosenName(g, await answer(g))).toEqual([MID]);
  });

  test('the targets decision picks the best creature when every one carries something', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(BLADE, 'SYNTHETIC Cloak', 'Forest', 'Forest', 'Forest', 'Forest', MID, BIG)
      .seat(1)
      .build();
    g.act(0).activate('SYNTHETIC Cloak', { targets: [BIG], pay: true });
    g.passAll();
    g.act(0).activate(BLADE, { targets: [MID], pay: true });
    g.passAll();
    g.act(0).activate(BLADE);
    expect(chosenName(g, await answer(g))).toEqual([BIG]);
  });

  test('an Equipment that is already attached is left alone', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(BLADE, { attachedTo: MID })
      .battlefield('Forest', MID, BIG)
      .seat(1)
      .build();
    expect(await answer(g)).toEqual({ kind: 'pass' });
  });

  test('it equips once a turn: after the activation resolves it does not pay again', async () => {
    const agent = new CasualAgent({ seed: 1 });
    const g = scenario().seat(0).battlefield(BLADE, 'Forest', 'Forest', MID).seat(1).build();
    const first = await answer(g, agent);
    expect(first).toEqual(equipAction(g));
    // Pretend the equip fizzled: the Equipment is still unattached and mana is left.
    expect(await answer(g, agent)).toEqual({ kind: 'pass' });
  });

  test('not outside a main phase, and never an Equipment the opponent controls', async () => {
    const combat = scenario()
      .seat(0)
      .battlefield(BLADE, 'Forest', MID)
      .seat(1)
      .at('beginningOfCombat', { active: 0, priority: 0 })
      .build();
    expect(await answer(combat)).toEqual({ kind: 'pass' });
  });

  test('with no creature to carry it the agent does nothing', async () => {
    const g = scenario().seat(0).battlefield(BLADE, 'Forest').seat(1).build();
    expect(await answer(g)).toEqual({ kind: 'pass' });
  });
});
