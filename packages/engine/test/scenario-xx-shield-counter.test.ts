// Shield counters (CR 122.1c): "If this permanent would be destroyed as the result of an effect, instead remove a shield
// counter from it" and "If damage would be dealt to this permanent, prevent that damage and remove a shield counter from it."
// Not a destruction by lethal damage or deathtouch (CR 704.5g): that damage is prevented in the first place.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic.ts) or real fixtures.
import { describe, test } from 'vitest';
import { type ScenarioGame, scenario } from '../src/testing/index';

const WRATH = 'SYNTHETIC Wrath'; // {2}{W}{W}: destroy all creatures
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const LIBRARY = ['Island', 'Island', 'Island'] as const;

function resolveTop(g: ScenarioGame): void {
  g.pass();
  g.pass();
}

function wrathGame(shield: number) {
  return scenario()
    .seat(0)
    .battlefield(BEARS, { counters: shield > 0 ? { shield } : {} })
    .battlefield('Plains', 'Plains', 'Plains', 'Plains')
    .hand(WRATH)
    .library(...LIBRARY)
    .seat(1)
    .battlefield('Mountain')
    .hand(BOLT)
    .library(...LIBRARY)
    .build();
}

describe('CR 122.1c: destruction as the result of an effect', () => {
  test('a board wipe removes the shield counter and the creature stays', () => {
    const g = wrathGame(1);
    g.act(0).cast(WRATH, { pay: true });
    resolveTop(g);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.counters(BEARS, {});
    g.expect.noEvent({ kind: 'died' });
    g.expect.invariants();
  });

  test('one counter per destruction: with two counters one remains', () => {
    const g = wrathGame(2);
    g.act(0).cast(WRATH, { pay: true });
    resolveTop(g);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.counters(BEARS, { shield: 1 });
  });

  test('without a shield counter the creature is destroyed', () => {
    const g = wrathGame(0);
    g.act(0).cast(WRATH, { pay: true });
    resolveTop(g);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });
});

describe('CR 122.1c: damage that would be dealt', () => {
  test('lethal damage is prevented and the shield counter is removed', () => {
    const g = wrathGame(1);
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [BEARS], pay: true });
    resolveTop(g);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.damage(BEARS, 0);
    g.expect.counters(BEARS, {});
    g.expect.invariants();
  });
});
