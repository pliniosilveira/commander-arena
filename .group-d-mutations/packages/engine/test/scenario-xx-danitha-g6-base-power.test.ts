// The Danitha deck (issue 26), group 6 (D-430, D-431): base power and keyword counters. "Whenever one or more creatures you control each with
// power greater than its base power deal combat damage to a player, draw a card." (Kutzil) and "Put a +1/+1 counter, a reach counter, and a deathtouch counter on
// target creature. Untap it." (Gift of the Viper).
// Pins: CR 208.4b (a base power ignores the counters and the effects that only modify power), CR 613.4b-c (layer 7b sets, layer 7c modifies), CR 613.7b (an
// effect of a spell has its timestamp when it is created), CR 122.1b (a keyword counter makes the object gain the keyword), CR 613.1f (layer 6: keyword counters,
// then abilities lost), CR 702.83b (every instance of exalted triggers), CR 603.2c (one or more: a single trigger), CR 603.10a (a "dies" trigger reads the
// creature as it was), CR 510.2 (combat damage), CR 603.2g.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-danitha-g6.ts, and the layer fixtures of synthetic-layers.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { isFeatureSupported, syntheticCard, validateCard } from '../src/index';
import { derive } from '../src/rules/derive';
import { scenario } from '../src/testing/index';

const WATCHER = 'SYNTHETIC Base Power Batch Watcher';
const MOURNER = 'SYNTHETIC Surge Mourner';
const VIPER = 'SYNTHETIC Viper Boon';
const STRIKES = 'SYNTHETIC Strike Boon';
const EXALTING = 'SYNTHETIC Exalting Boon';
const SNARE = 'SYNTHETIC Overgrowth Snare';
const GROWTH = 'SYNTHETIC Growth Spurt'; // +3/+3 until end of turn
const FROG = 'SYNTHETIC Frog Hex'; // loses all abilities, base power and toughness 1/1 until end of turn
const BEARS = 'Grizzly Bears'; // 2/2
const ACE = 'Fencing Ace'; // 1/1 double strike
const WALL = 'SYNTHETIC Brick Wall';
const LIBRARY = Array.from({ length: 8 }, () => 'Forest');

const ALL = [WATCHER, MOURNER, VIPER, STRIKES, EXALTING, SNARE, GROWTH, FROG];

/** Seat 0 has the board given; seat 1 has an empty one. Seat 0 is in its precombat main phase with five Forests. */
function board(configure: (b: ReturnType<typeof scenario>) => void) {
  const b = scenario();
  for (const name of ALL) b.define(syntheticCard(name));
  b.seat(0)
    .life(20)
    .library(...LIBRARY)
    .battlefield('Forest', { count: 3 })
    .battlefield('Plains', { count: 2 })
    .battlefield('Swamp', { count: 2 })
    .battlefield('Island', { count: 2 })
    .hand(VIPER, STRIKES, EXALTING, SNARE, GROWTH, FROG);
  configure(b);
  b.seat(1)
    .life(20)
    .library(...LIBRARY);
  return b.at('precombatMain', { active: 0, priority: 0 }).build();
}

describe('the cards are valid', () => {
  test.each(ALL)('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('the features are claimed', () => {
    expect(isFeatureSupported('selector:powerAboveBase')).toBe(true);
  });
});

describe('keyword counters (CR 122.1b)', () => {
  test('a reach counter and a deathtouch counter give the keywords, and the +1/+1 counter the size', () => {
    const g = board((b) => b.seat(0).battlefield(BEARS, { label: 'bears' }));
    g.act(0).cast(VIPER, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.counters('bears', { '+1/+1': 1, reach: 1, deathtouch: 1 });
    g.expect.pt('bears', 3, 3);
    g.expect.derived('bears', { keywords: ['reach', 'deathtouch'] });
  });

  test('the spell untaps the creature after the counters', () => {
    const g = board((b) => b.seat(0).battlefield(BEARS, { label: 'bears', tapped: true }));
    g.expect.tapped('bears', true);
    g.act(0).cast(VIPER, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.tapped('bears', false);
  });

  test('flying, first strike and double strike counters: the keywords of two words are keywords too', () => {
    const g = board((b) => b.seat(0).battlefield(BEARS, { label: 'bears' }));
    g.act(0).cast(STRIKES, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.derived('bears', { keywords: ['flying', 'firstStrike', 'doubleStrike'] });
  });

  test('a keyword the creature already has is not added twice', () => {
    const g = board((b) =>
      b.seat(0).battlefield(ACE, { label: 'ace', counters: { 'double strike': 1 } }),
    );
    g.expect.derived('ace', { keywords: ['doubleStrike'] });
    // One keyword ability: the printed one; the counter adds none (CR 122.1b gives a keyword the object does not have).
    expect(
      derive(g.state, g.object('ace')).abilities.filter(
        (a) => a.kind === 'keyword' && a.keyword.kind === 'doubleStrike',
      ),
    ).toHaveLength(1);
  });

  test('a counter that is not a keyword counter gives nothing', () => {
    const g = board((b) =>
      b.seat(0).battlefield(BEARS, { label: 'bears', counters: { charge: 2, stun: 0 } }),
    );
    g.expect.derived('bears', { keywords: [] });
  });

  test('each exalted counter is an instance of exalted: two counters make two triggers (CR 702.83b)', () => {
    const g = board((b) => b.seat(0).battlefield(BEARS, { label: 'bears' }));
    g.act(0).cast(EXALTING, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.derived('bears', { keywords: ['exalted', 'exalted'] });
    g.advanceTo('declareAttackers');
    g.act(0).attack('bears');
    // Two instances: two exalted triggers on the stack for the lone attacker.
    expect(g.state.stack).toHaveLength(2);
  });

  test('a creature with a counter that loses all abilities after it loses the keyword; the counter stays', () => {
    const g = board((b) =>
      b.seat(0).battlefield(BEARS, { label: 'bears', counters: { reach: 1, deathtouch: 1 } }),
    );
    g.expect.derived('bears', { keywords: ['reach', 'deathtouch'] });
    g.act(0).cast(FROG, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.derived('bears', { keywords: [] });
    g.expect.counters('bears', { reach: 1, deathtouch: 1 });
  });

  test('a deathtouch counter kills the blocker that it is dealt to (CR 702.2b)', () => {
    const g = scenario()
      .define(syntheticCard(WALL))
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears', counters: { deathtouch: 1 } })
      .seat(1)
      .library(...LIBRARY)
      .battlefield('SYNTHETIC Dust Juggernaut', { label: 'big' })
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    g.playCombat({
      attack: ['bears'],
      block: [{ blocker: 'big', attacker: 'bears' }],
      until: 'endOfCombat',
    });
    g.expect.zone('SYNTHETIC Dust Juggernaut', 'graveyard');
  });
});

describe('the base power of a creature (CR 208.4b)', () => {
  test('a creature with a +1/+1 counter has power greater than its base power: the Snare can target it, and not a plain one', () => {
    const g = board((b) =>
      b
        .seat(0)
        .battlefield(BEARS, { label: 'pumped', counters: { '+1/+1': 1 } })
        .battlefield(BEARS, { label: 'plain' }),
    );
    g.act(0).cast(SNARE);
    g.expect.pending('targets', 0);
    const d = g.state.pending;
    expect(d?.kind).toBe('targets');
    if (d?.kind !== 'targets') return;
    const legal = d.specs[0]?.legal ?? [];
    expect(legal).toEqual([{ kind: 'object', id: g.id('pumped'), specId: d.specs[0]?.specId }]);
  });

  test('without a creature above its base power the Snare cannot be cast', () => {
    const g = board((b) => b.seat(0).battlefield(BEARS, { label: 'plain' }));
    g.expect.illegal(0, { cast: SNARE });
  });

  test('a -1/-1 counter lowers power below the base: not greater; a +1/+1 and a -1/-1 cancel (CR 704.5q), still not greater', () => {
    const g = board((b) =>
      b.seat(0).battlefield(BEARS, { label: 'weak', counters: { '-1/-1': 1 } }),
    );
    g.expect.pt('weak', 1, 1);
    g.expect.illegal(0, { cast: SNARE });
  });

  test('a +N/+N effect (layer 7c) counts as more than the base power; at end of turn it is over', () => {
    const g = board((b) => b.seat(0).battlefield(BEARS, { label: 'bears' }));
    g.expect.illegal(0, { cast: SNARE });
    g.act(0).cast(GROWTH, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.pt('bears', 5, 5);
    g.expect.legal(0, { cast: SNARE });
  });

  test('an effect that sets the base power (layer 7b) is not "more than the base power": a Frog of 1/1 is not above it', () => {
    const g = board((b) => b.seat(0).battlefield(BEARS, { label: 'bears' }));
    g.act(0).cast(FROG, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.pt('bears', 1, 1);
    g.expect.illegal(0, { cast: SNARE });
  });

  test('base 1/1 then a +1/+1 counter and +3/+3: the power is above the base power of 1, not of 2 (CR 613.4b before 613.4c)', () => {
    const g = board((b) =>
      b.seat(0).battlefield(BEARS, { label: 'bears', counters: { '+1/+1': 1 } }),
    );
    g.act(0).cast(FROG, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.pt('bears', 2, 2);
    g.expect.legal(0, { cast: SNARE });
  });

  test('a creature whose printed power is more than another’s is not above its own base power', () => {
    const g = board((b) => b.seat(0).battlefield('SYNTHETIC Dust Juggernaut', { label: 'big' }));
    g.expect.illegal(0, { cast: SNARE });
  });
});

describe('"one or more creatures you control each with power greater than its base power deal combat damage to a player" (CR 603.2c, 510.2)', () => {
  test('a plain creature: no trigger', () => {
    const g = board((b) => b.seat(0).battlefield(WATCHER).battlefield(BEARS, { label: 'plain' }));
    g.playCombat({ attack: ['plain'], until: 'combatDamage' });
    g.expect.stack([]);
    g.expect.life(1, 18);
  });

  test('a creature with a +1/+1 counter hits the player: one trigger, one card', () => {
    const g = board((b) =>
      b
        .seat(0)
        .battlefield(WATCHER)
        .battlefield(BEARS, { label: 'pumped', counters: { '+1/+1': 1 } }),
    );
    g.playCombat({ attack: ['pumped'], until: 'combatDamage' });
    g.expect.stack([`${WATCHER} (ability)`]);
    g.passAll();
    g.expect.handSize(0, 7);
    g.expect.life(1, 17);
    g.expect.invariants();
  });

  test('two qualifying creatures hit in the same step: still one trigger (CR 603.2c)', () => {
    const g = board((b) =>
      b
        .seat(0)
        .battlefield(WATCHER)
        .battlefield(BEARS, { label: 'a', counters: { '+1/+1': 1 } })
        .battlefield(BEARS, { label: 'b', counters: { '+1/+1': 2 } }),
    );
    g.playCombat({ attack: ['a', 'b'], until: 'combatDamage' });
    g.expect.stack([`${WATCHER} (ability)`]);
  });

  test('one qualifying and one plain creature: the qualifying one is the one or more', () => {
    const g = board((b) =>
      b
        .seat(0)
        .battlefield(WATCHER)
        .battlefield(BEARS, { label: 'pumped', counters: { '+1/+1': 1 } })
        .battlefield(BEARS, { label: 'plain' }),
    );
    g.playCombat({ attack: ['pumped', 'plain'], until: 'combatDamage' });
    g.expect.stack([`${WATCHER} (ability)`]);
  });

  test('a pumped-up creature (Growth Spurt, layer 7c) qualifies for the turn', () => {
    const g = board((b) => b.seat(0).battlefield(WATCHER).battlefield(BEARS, { label: 'bears' }));
    g.act(0).cast(GROWTH, { targets: ['bears'], pay: true });
    g.passAll();
    g.playCombat({ attack: ['bears'], until: 'combatDamage' });
    g.expect.stack([`${WATCHER} (ability)`]);
  });

  test('a creature blocked by a wall deals no combat damage to a player: no trigger', () => {
    const g = scenario()
      .define(syntheticCard(WATCHER))
      .define(syntheticCard(WALL))
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WATCHER)
      .battlefield(BEARS, { label: 'pumped', counters: { '+1/+1': 1 } })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(WALL, { label: 'wall' })
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    g.playCombat({
      attack: ['pumped'],
      block: [{ blocker: 'wall', attacker: 'pumped' }],
      until: 'combatDamage',
    });
    g.expect.stack([]);
  });

  test('the power is read as the damage is dealt: pumped after the attack was declared, a plain creature qualifies', () => {
    const g = board((b) => b.seat(0).battlefield(WATCHER).battlefield(BEARS, { label: 'bears' }));
    g.advanceTo('declareAttackers');
    g.act(0).attack('bears');
    g.act(0).cast(GROWTH, { targets: ['bears'], pay: true });
    g.passAll();
    g.advanceTo('combatDamage');
    g.expect.stack([`${WATCHER} (ability)`]);
  });
});

describe('a look-back trigger reads the base power the creature had (CR 603.10a, 113.7a)', () => {
  test('a creature above its base power that dies triggers it; a plain one does not', () => {
    const g = scenario()
      .define(syntheticCard(MOURNER))
      .define(syntheticCard(WALL))
      .seat(0)
      .library(...LIBRARY)
      .battlefield(MOURNER)
      .battlefield(BEARS, { label: 'pumped', counters: { '+1/+1': 1 } })
      .battlefield(BEARS, { label: 'plain' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield('SYNTHETIC Dust Juggernaut', { label: 'big' })
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    g.playCombat({
      attack: ['pumped'],
      block: [{ blocker: 'big', attacker: 'pumped' }],
      until: 'combatDamage',
    });
    g.expect.zone(BEARS, 'graveyard');
    g.expect.stack([`${MOURNER} (ability)`]);
    g.passAll();
    g.expect.life(0, 41);
  });

  test('a plain creature that dies: no trigger', () => {
    const g = scenario()
      .define(syntheticCard(MOURNER))
      .seat(0)
      .library(...LIBRARY)
      .battlefield(MOURNER)
      .battlefield(BEARS, { label: 'plain' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield('SYNTHETIC Dust Juggernaut', { label: 'big' })
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    g.playCombat({
      attack: ['plain'],
      block: [{ blocker: 'big', attacker: 'plain' }],
      until: 'combatDamage',
    });
    g.expect.stack([]);
    g.expect.life(0, 40);
  });
});

describe('validation', () => {
  test('a static ability whose subject names the base power is refused (layers cannot read themselves, CR 613.8)', () => {
    const lord = {
      ...syntheticCard(WATCHER),
      name: 'SYNTHETIC Self Reading Lord',
    };
    const face = lord.faces[0];
    if (face === undefined) throw new Error('no face');
    const bad = {
      ...lord,
      faces: [
        {
          ...face,
          abilities: [
            {
              kind: 'static' as const,
              static: {
                kind: 'grantKeyword' as const,
                subject: {
                  kind: 'filter' as const,
                  filter: {
                    types: ['creature' as const],
                    controller: 'you' as const,
                    powerAboveBase: true as const,
                  },
                },
                keyword: { kind: 'trample' as const },
              },
            },
          ],
        },
      ],
    };
    expect(validateCard(bad).length).toBeGreaterThan(0);
  });

  test('powerAboveBase must be true', () => {
    const watcher = syntheticCard(WATCHER);
    const face = watcher.faces[0];
    if (face === undefined) throw new Error('no face');
    const bad = {
      ...watcher,
      faces: [
        {
          ...face,
          abilities: [
            {
              kind: 'triggered' as const,
              trigger: {
                kind: 'combatDamageBatch' as const,
                what: { types: ['creature' as const], powerAboveBase: false as unknown as true },
                to: 'player' as const,
              },
              effect: { kind: 'draw' as const, player: { kind: 'you' as const }, count: 1 },
            },
          ],
        },
      ],
    };
    expect(validateCard(bad).length).toBeGreaterThan(0);
  });
});
