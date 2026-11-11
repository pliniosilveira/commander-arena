// CasualAgent and the costs of the subjects slice (D-133), on real engine states built with the scenario DSL: when an
// activated ability sacrifices two artifacts it gives up the two it wants least, and when one taps untapped Zombies it
// taps the ones that cannot attack anyway first. The agent itself never starts such an ability (a sacrifice outlet is left
// unused, `casual-activations.ts`), so the activations here are made by the test; the decisions are the agent's.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { answer } from './casual-helpers';

const WEAVER = 'SYNTHETIC Thopter Weaver'; // {1}, sacrifice two artifacts: draw a card
const WHISPERER = 'SYNTHETIC Grave Whisperer'; // tap three untapped Zombies you control: draw, lose 1 life
const ZOMBIE = 'SYNTHETIC Plain Zombie';
const TRINKET = 'SYNTHETIC Brass Trinket'; // artifact {1}
const LEDGER = 'SYNTHETIC Clockwork Ledger'; // artifact {2}
const GOLEM = 'SYNTHETIC Plain Golem'; // 2/2 artifact creature {2}

describe('"Sacrifice two artifacts"', () => {
  test('it gives up the two artifacts it wants least, and keeps the creature', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(WEAVER, TRINKET, LEDGER, GOLEM, 'Island')
      .library('Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).activate(WEAVER, { pay: true });
    g.expect.pending('choosePermanent', 0);
    const chosen = await answer(g);
    expect(chosen.kind).toBe('choosePermanents');
    if (chosen.kind !== 'choosePermanents') return;
    expect([...chosen.objects].sort()).toEqual([g.id(TRINKET), g.id(LEDGER)].sort());
    g.choose(chosen);
    g.passAll();
    g.expect.zone(GOLEM, 'battlefield', { seat: 0 });
    g.expect.zone(TRINKET, 'graveyard', { seat: 0 });
  });
});

describe('"Tap three untapped Zombies you control"', () => {
  test('it taps the Zombie that is summoning sick first: it could not attack this turn anyway', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(WHISPERER, ZOMBIE, ZOMBIE)
      .battlefield(ZOMBIE, { fresh: true, label: 'sick' })
      .library('Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).activate(WHISPERER);
    g.expect.pending('choosePermanent', 0);
    const chosen = await answer(g);
    expect(chosen.kind).toBe('choosePermanents');
    if (chosen.kind !== 'choosePermanents') return;
    expect(chosen.objects).toHaveLength(3);
    expect(chosen.objects).toContain(g.id('sick'));
    g.choose(chosen);
    g.passAll();
    g.expect.handSize(0, 1);
  });
});
