// CasualAgent decisions about permanents and optional abilities, on real engine states built with
// the scenario DSL: what to sacrifice, how to order triggers, and whether to take a "you may".
import type { Action, ChoosePermanentDecision, ObjectId } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent } from '../src/index';
import { answer } from './casual-helpers';
import { CTX } from './helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains'] as const;

function chosen(action: Action): ObjectId[] {
  if (action.kind !== 'choosePermanents')
    throw new Error(`expected choosePermanents: ${action.kind}`);
  return [...action.objects];
}

/** Seat 0 casts the SYNTHETIC Sacrifice Dragon with `others` in play and reaches the choice. */
function atSacrificeChoice(
  others: (b: ReturnType<typeof scenario>) => void,
  extraMana = '',
): ScenarioGame {
  const b = scenario()
    .seat(0)
    .hand('SYNTHETIC Sacrifice Dragon')
    .pool(`CCCB${extraMana}`)
    .library(...FILLER);
  others(b);
  const g = b.seat(1).build();
  g.act(0).cast('SYNTHETIC Sacrifice Dragon', { pay: true });
  g.pass();
  g.pass();
  g.pass();
  g.pass();
  g.expect.pending('choosePermanent', 0);
  return g;
}

describe('what the casual agent sacrifices', () => {
  test('a token or Treasure before anything else', async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Make Treasures', 'SYNTHETIC Sacrifice Dragon')
      .pool('CRCCCB')
      .battlefield('Forest', 'Forest', 'Grizzly Bears', 'Sol Ring')
      .library(...FILLER)
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Make Treasures', { pay: true });
    g.passAll();
    g.act(0).cast('SYNTHETIC Sacrifice Dragon', { pay: true });
    g.pass();
    g.pass();
    g.pass();
    g.pass();
    g.expect.pending('choosePermanent', 0);
    const [id] = chosen(await answer(g));
    expect(id).toBeDefined();
    expect(g.state.objects[id as ObjectId]?.token).not.toBeNull();
  });

  test('a land it does not need before a spell it paid for', async () => {
    // Six lands and nothing in hand to cast: four is the target, so a land is surplus.
    const g = atSacrificeChoice((b) =>
      b.battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Grizzly Bears'),
    );
    const [id] = chosen(await answer(g));
    const types = g.view(0).battlefield.find((o) => o.id === id)?.types;
    expect(types).toEqual(['land']);
  });

  test('the lowest mana value when every land is needed', async () => {
    const g = atSacrificeChoice((b) =>
      b.battlefield('Forest', 'Forest', 'Grizzly Bears', 'Sol Ring', 'Llanowar Elves'),
    );
    const [id] = chosen(await answer(g));
    const name = g.view(0).battlefield.find((o) => o.id === id)?.name;
    // Sol Ring and Llanowar Elves are the cheapest; it never gives up a land here.
    expect(['Sol Ring', 'Llanowar Elves']).toContain(name);
  });

  test('never its commander while anything else is legal', async () => {
    const g = atSacrificeChoice((b) =>
      b.battlefield('Isamaru, Hound of Konda', { commander: true }).battlefield('Forest'),
    );
    const [id] = chosen(await answer(g));
    expect(g.view(0).battlefield.find((o) => o.id === id)?.name).toBe('Forest');
  });

  test('the answer is always legal for the engine', async () => {
    const g = atSacrificeChoice((b) => b.battlefield('Forest', 'Plains', 'Grizzly Bears'));
    const decision = g.state.pending as ChoosePermanentDecision;
    const action = await answer(g);
    for (const id of chosen(action)) expect(decision.legal).toContain(id);
    expect(g.act(0).try.action(action).ok).toBe(true);
  });
});

describe('ordering triggers and "you may"', () => {
  test('triggers go on the stack in the order the engine lists them', async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Wrath')
      .battlefield('Plains', 'Plains', 'Plains', 'Plains')
      .battlefield('SYNTHETIC Mourner', 'SYNTHETIC Dies Treasure Creature')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('SYNTHETIC Wrath', { pay: true });
    g.pass();
    g.pass();
    g.expect.pending('orderTriggers', 0);
    const action = await answer(g);
    expect(action).toEqual({ kind: 'orderTriggers', order: [0, 1] });
    expect(g.act(0).try.action(action).ok).toBe(true);
  });

  const mayDecision = async (text: string): Promise<Action> => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC May Draw Creature')
      .pool('CCU')
      .library(...FILLER)
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC May Draw Creature', { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error('expected confirmOptional');
    const view = g.view(0);
    const decision = { ...d, sourceOracleText: text };
    return new CasualAgent({ seed: 1 }).decide(view, decision, CTX);
  };

  test('accepts an optional trigger that costs nothing', async () => {
    expect(await mayDecision('When this creature enters, you may draw a card.')).toEqual({
      kind: 'acceptOptional',
    });
  });

  test('declines one that makes it sacrifice, pay, discard or lose something', async () => {
    for (const text of [
      'At the beginning of your upkeep, you may sacrifice a creature. If you do, draw a card.',
      'Whenever this attacks, you may pay {2}. If you do, draw a card.',
      'When this enters, you may discard a card. If you do, draw two cards.',
      'At the beginning of your end step, you may lose 2 life.',
    ]) {
      expect(await mayDecision(text), text).toEqual({ kind: 'declineOptional' });
    }
  });
});
