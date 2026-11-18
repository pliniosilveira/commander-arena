// CasualAgent and HeuristicAgent with Aftermath (CR 702.127a), on real engine states built with the scenario DSL:
// the Aftermath half of a split card in the graveyard is an ordinary `castSpell` option with its `face` and no
// alternative; the agents cast it like any other spell worth casting, and never name the half in the hand.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, HeuristicAgent } from '../src/index';
import { answerFor, expectLegal } from './casual-helpers';
import { askHeuristic } from './heuristic-helpers';

const CARD = 'SYNTHETIC Rite // Toll'; // Rite {1}{B} gains 2 life; Toll {2}{B} (Aftermath) destroys target creature

const build = (zone: 'graveyard' | 'hand') =>
  scenario()
    .seat(0)
    [zone](CARD)
    .battlefield('Swamp', 'Swamp', 'Swamp')
    .seat(1)
    .battlefield('Grizzly Bears')
    .build();

describe('the Aftermath half in the graveyard', () => {
  test('CasualAgent casts it, with its face and no alternative', async () => {
    const g = build('graveyard');
    const id = g.id({ name: CARD, zone: 'graveyard' });
    const action = await answerFor(g, new CasualAgent({ seed: 1 }));
    expect(action).toEqual({ kind: 'castSpell', object: id, face: 1 });
    expectLegal(g, action);
  });

  test('HeuristicAgent casts it too', async () => {
    const g = build('graveyard');
    const id = g.id({ name: CARD, zone: 'graveyard' });
    const action = await askHeuristic(g, new HeuristicAgent({ seed: 1 }));
    expect(action).toEqual({ kind: 'castSpell', object: id, face: 1 });
    expectLegal(g, action);
  });

  test('with no creature to destroy there is nothing to cast', async () => {
    const g = scenario()
      .seat(0)
      .graveyard(CARD)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .build();
    expect(await answerFor(g, new CasualAgent({ seed: 1 }))).toEqual({ kind: 'pass' });
  });
});

describe('the card in the hand', () => {
  test('the agent never casts the Aftermath half from the hand', async () => {
    const g = build('hand');
    const action = await answerFor(g, new CasualAgent({ seed: 1 }));
    expect(action).not.toMatchObject({ kind: 'castSpell', face: 1 });
    expectLegal(g, action);
  });
});
