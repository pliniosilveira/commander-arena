// "Other creatures you control have extort." (a static ability that gives extort to a group): each creature that has it has its own triggered ability.
// Pins: CR 702.101a (Extort), CR 702.101b (each instance triggers separately), CR 613.1f (a granted keyword is a layer 6 effect), CR 113.2c.
// Cards: the SYNTHETIC "Extorting Pontiff" of this file, the real Grizzly Bears, Lightning Bolt and the basic lands.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const PONTIFF = 'SYNTHETIC Extorting Pontiff';
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';

const pontiff = singleFaceCard({
  name: PONTIFF,
  manaCost: ['1', 'B'],
  types: ['creature'],
  subtypes: ['Human', 'Cleric'],
  colors: ['B'],
  colorIdentity: ['B'],
  power: 2,
  toughness: 2,
  oracleText: 'Other creatures you control have extort.',
  abilities: [
    {
      kind: 'static',
      static: {
        kind: 'grantKeyword',
        subject: {
          kind: 'filter',
          filter: { types: ['creature'], controller: 'you' },
          other: true,
        },
        keyword: { kind: 'extort' },
      },
    },
  ],
});

function board(bears: readonly string[]) {
  return scenario()
    .seat(0)
    .life(20)
    .define(pontiff)
    .battlefield(PONTIFF, ...bears, 'Mountain', 'Swamp', 'Swamp')
    .hand(BOLT)
    .library('Island', 'Island')
    .seat(1)
    .life(20)
    .library('Island', 'Island')
    .build();
}

describe('CR 702.101a with CR 613.1f: a static ability that gives extort', () => {
  test('a creature given extort triggers when its controller casts a spell, and the payment drains each opponent', () => {
    const g = board([BEARS]);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([`${BEARS} (ability)`, BOLT]);
    g.pass();
    g.pass();
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.life(1, 19);
    g.expect.life(0, 21);
  });

  test('the creature that gives it does not have it (other creatures only)', () => {
    const g = board([]);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([BOLT]);
  });

  test('two creatures given extort are two instances: two triggers (CR 702.101b)', () => {
    const g = board([BEARS, BEARS]);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([`${BEARS} (ability)`, `${BEARS} (ability)`, BOLT]);
    expect(g.state.stack.length).toBe(3);
  });
});
