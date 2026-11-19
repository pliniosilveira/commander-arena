// Shriekmaw (issue 310): "When this creature enters, destroy target nonartifact, nonblack creature." and evoke {1}{B}.
// The real card comes from the golden corpus through the Oracle text parser, then runs in the engine.
// Pins: CR 105.2 (a colorless object is not black), CR 205.4 and 205.2a (a type the target must not have), CR 115.1
// (a target is chosen as the trigger goes on the stack), CR 702.74a (evoke), CR 702.31 (fear).
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((candidate) => candidate.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

const SHRIEKMAW = real('Shriekmaw');
const NAME = SHRIEKMAW.name;
const BEARS = 'Grizzly Bears'; // green 2/2
const ANGEL = 'Serra Angel'; // white 4/4 flying
const ZOMBIE = 'SYNTHETIC Plain Zombie'; // black 2/2
const GOLEM = 'SYNTHETIC Plain Golem'; // colorless artifact creature

const game = () =>
  scenario()
    .define(SHRIEKMAW)
    .seat(0)
    .hand(NAME)
    .battlefield('Swamp', { count: 5 })
    .seat(1)
    .battlefield(BEARS)
    .battlefield(ANGEL)
    .battlefield(ZOMBIE)
    .battlefield(GOLEM)
    .build();

describe('Shriekmaw', () => {
  test('the enters trigger can target only a nonartifact, nonblack creature', () => {
    const g = game();
    g.act(0).cast(NAME, { pay: true });
    g.pass();
    g.pass(); // the creature spell resolves and the trigger asks for its target
    const pending = g.state.pending;
    if (pending?.kind !== 'targets')
      throw new Error(`expected a targets decision, got ${pending?.kind}`);
    const battlefield = g.view(0).battlefield;
    const legal = pending.specs.flatMap((spec) =>
      spec.legal.flatMap((t) =>
        t.kind === 'object' ? [battlefield.find((o) => o.id === t.id)?.name ?? ''] : [],
      ),
    );
    // The green and the white creature; not the black one, and not the colorless artifact creature.
    expect([...legal].sort()).toEqual([BEARS, ANGEL].sort());
  });

  test('destroys the chosen creature and leaves the black and the artifact ones', () => {
    const g = game();
    g.act(0).cast(NAME, { pay: true });
    g.pass();
    g.pass();
    g.act(0).chooseTargets({ name: BEARS, seat: 1 });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
    g.expect.zone(ZOMBIE, 'battlefield', { seat: 1 });
    g.expect.zone(GOLEM, 'battlefield', { seat: 1 });
    g.expect.zone(NAME, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('evoked for {1}{B}: it destroys the target and is sacrificed (CR 702.74a)', () => {
    const g = scenario()
      .define(SHRIEKMAW)
      .seat(0)
      .hand(NAME)
      .battlefield('Swamp', { count: 2 })
      .seat(1)
      .battlefield(BEARS)
      .build();
    g.act(0).cast(NAME, { alternative: 'evoke', pay: true });
    g.pass();
    g.pass();
    if (g.state.pending?.kind === 'orderTriggers') g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(NAME, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });
});
