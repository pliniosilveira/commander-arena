// The two counter groups of the Quandrix Unlimited deck together: "double the number of +1/+1 counters" puts counters (CR 701.10, 122.6), so a "that many plus one"
// replacement effect (CR 614.1a) applies to it. Cards are SYNTHETIC (src/cards/fixtures/synthetic-counters-plus.ts, synthetic-counter-doubling.ts).
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

const SCALES = 'SYNTHETIC Growth Scales'; // creatures you control: that many plus one
const DRAUGHT = 'SYNTHETIC Doubling Draught'; // double the +1/+1 counters on target creature
const BEARS = 'Grizzly Bears';
const LIB = Array.from({ length: 10 }, () => 'Plains');

describe('doubling counters with a "that many plus one" effect', () => {
  test('three counters doubled are three more plus one', () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .hand(DRAUGHT)
      .battlefield('Forest')
      .battlefield(SCALES)
      .battlefield(BEARS, { label: 'mine', counters: { '+1/+1': 3 } })
      .build();
    g.act(0).cast(DRAUGHT, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.counters('mine', { '+1/+1': 7 });
  });

  test('a creature with no counters gets none, and the replacement adds nothing', () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .hand(DRAUGHT)
      .battlefield('Forest')
      .battlefield(SCALES)
      .battlefield(BEARS, { label: 'mine' })
      .build();
    g.act(0).cast(DRAUGHT, { targets: ['mine'], pay: true });
    g.passAll();
    expect(g.object('mine').counters['+1/+1']).toBeUndefined();
  });
});
