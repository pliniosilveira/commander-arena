// Shadrix Silverquill (the Silverquill deck): the REAL Oracle text of the golden corpus goes through the grammar as a card with no override, is defined in an engine scenario and is played
// through applyAction. "At the beginning of combat on your turn, you may choose two. Each mode must target a different player." and its three modes.
// Pins: CR 700.2 (modal triggered ability), CR 700.2b (the modes are chosen as the ability is put on the stack; "you may choose two" is no mode or two modes), CR 700.2d (each mode of
// the choice has targets of its own, here never the same player), CR 603.3c and 603.3d (modes then targets), CR 608.2c (the modes run in printed order).
import { readFileSync } from 'node:fs';
import {
  applyAction,
  type CardDefinition,
  getLegalActions,
  type PendingDecision,
  validateCard,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const SHADRIX = real('Shadrix Silverquill');
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

test('the card is valid', () => {
  expect(validateCard(SHADRIX)).toEqual([]);
});

const game = (): ScenarioGame =>
  scenario()
    .define(SHADRIX)
    .seat(0)
    .library(...LIBRARY)
    .battlefield(SHADRIX.name, { label: 'shadrix' })
    .battlefield(BEARS, { label: 'mine' })
    .seat(1)
    .library(...LIBRARY)
    .battlefield(BEARS, { label: 'theirs' })
    .at('precombatMain', { active: 0, turn: 3 })
    .build();

/** The trigger is waiting for its modes. */
function toModes(): ScenarioGame {
  const g = game();
  g.act(0).pass();
  g.act(1).pass();
  return g;
}

const pending = (g: ScenarioGame): PendingDecision => {
  const d = g.state.pending;
  if (d === null || d === undefined) throw new Error('nothing is pending');
  return d;
};

describe('Shadrix Silverquill: you may choose two modes, each aimed at a different player', () => {
  test('the choice offers no mode or exactly two, never one or three', () => {
    const g = toModes();
    const d = pending(g);
    expect(d.kind).toBe('chooseModes');
    if (d.kind !== 'chooseModes') return;
    expect(d.allOrNone).toBe(true);
    expect(d.sets).toEqual([[], [0, 1], [0, 2], [1, 2]]);
    for (const modes of [[0], [0, 1, 2]]) {
      expect(applyAction(g.state, 0, { kind: 'chooseModes', modes }).ok).toBe(false);
    }
    expect(applyAction(g.state, 0, { kind: 'chooseModes', modes: [] }).ok).toBe(true);
  });

  test('choosing no mode leaves nothing on the stack and changes nothing', () => {
    const g = toModes();
    g.act(0).chooseModes();
    g.expect.life(0, 40);
    g.expect.life(1, 40);
    expect(g.state.stack).toHaveLength(0);
  });

  test('draw and lose life for one player, a counter on each creature of the other', () => {
    const g = toModes();
    g.act(0).chooseModes(1, 2);
    const d = pending(g);
    expect(d.kind).toBe('targets');
    g.act(0).chooseTargets({ player: 0 }, { player: 1 });
    g.passAll();
    g.expect.life(0, 39);
    g.expect.counters('theirs', { '+1/+1': 1 });
    g.expect.counters('mine', {});
    g.expect.invariants();
  });

  test('the same player cannot be the target of both modes', () => {
    const g = toModes();
    g.act(0).chooseModes(0, 1);
    const d = pending(g);
    if (d.kind !== 'targets') throw new Error('expected targets');
    const [first, second] = d.specs;
    expect(first?.differentFromAll).toEqual([second?.specId]);
    expect(applyAction(g.state, 0, { kind: 'chooseTargets', targets: [] }).ok).toBe(false);
    const same = [
      { kind: 'player' as const, specId: first?.specId ?? '', seat: 1 as const },
      { kind: 'player' as const, specId: second?.specId ?? '', seat: 1 as const },
    ];
    expect(applyAction(g.state, 0, { kind: 'chooseTargets', targets: same }).ok).toBe(false);
    const listed = getLegalActions(g.state, 0).filter((a) => a.kind === 'chooseTargets');
    expect(listed).toHaveLength(2);
  });

  test('both modes aimed at different players: a token for one, a card and a life for the other', () => {
    const g = toModes();
    g.act(0).chooseModes(0, 1);
    g.act(0).chooseTargets({ player: 1 }, { player: 0 });
    g.passAll();
    g.expect.life(0, 39);
    g.expect.zone('Inkling', 'battlefield', { seat: 1 });
    g.expect.invariants();
  });
});
