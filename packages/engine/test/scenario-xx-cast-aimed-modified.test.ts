// Issue 89 (Silverquill Influence), group 9 (D-646): "Whenever you cast an Aura spell that targets a modified permanent you control, draw a card." (Pearl-Ear, Imperial Advisor).
// Pins: CR 601.2i and 603.2 (a cast trigger), CR 115.1 and 601.2c (a spell that targets: its chosen targets, as it is cast), CR 700.9 (modified: a counter, an Equipment, or an Aura its
// controller controls), "you control" (the target is the controller's own permanent) and "an Aura spell" (another kind of spell does not trigger it).
// Cards: the SYNTHETIC "Pearl Watcher" of this file, SYNTHETIC Might Aura and the real Grizzly Bears, Giant Spider and the basic lands.
import { describe, test } from 'vitest';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const WATCHER = 'SYNTHETIC Pearl Watcher';
const AURA = 'SYNTHETIC Might Aura';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const watcher = singleFaceCard({
  name: WATCHER,
  manaCost: ['2', 'W'],
  types: ['creature'],
  subtypes: ['Human', 'Advisor'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 2,
  toughness: 4,
  oracleText:
    'Whenever you cast an Aura spell that targets a modified permanent you control, draw a card.',
  abilities: [
    {
      kind: 'triggered',
      trigger: {
        kind: 'castSpell',
        filter: {
          subtypes: ['Aura'],
          stackKind: 'spell',
          targetsObject: { controller: 'you', modified: true },
        },
        by: 'you',
      },
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    },
  ],
});

function board(): ScenarioGame {
  return scenario()
    .seat(0)
    .define(watcher)
    .hand(AURA)
    .battlefield('Forest', 'Forest', WATCHER)
    .battlefield(BEARS, { counters: { '+1/+1': 1 } })
    .battlefield(SPIDER)
    .library(...LIBRARY)
    .seat(1)
    .battlefield('SYNTHETIC Vanilla 3/3', { counters: { '+1/+1': 1 } })
    .library(...LIBRARY)
    .at('precombatMain')
    .build();
}

describe('"Whenever you cast an Aura spell that targets a modified permanent you control, draw a card."', () => {
  test('an Aura aimed at my creature with a counter draws a card', () => {
    const g = board();
    g.act(0).cast(AURA, { targets: [BEARS], pay: true });
    g.expect.stack([`${WATCHER} (ability)`, AURA]);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('an Aura aimed at my creature that is not modified does not', () => {
    const g = board();
    g.act(0).cast(AURA, { targets: [SPIDER], pay: true });
    g.expect.stack([AURA]);
    g.passAll();
    g.expect.handSize(0, 0);
  });

  test('an Aura aimed at the opponent\'s modified creature does not: "you control"', () => {
    const g = board();
    g.act(0).cast(AURA, { targets: [{ name: 'SYNTHETIC Vanilla 3/3', seat: 1 }], pay: true });
    g.expect.stack([AURA]);
    g.passAll();
    g.expect.handSize(0, 0);
  });
});
