// Issue 89 (Silverquill Influence), "When enchanted creature dies, return this card from your graveyard to the battlefield." (D-607; Screams from Within).
// Pins: CR 603.10a (a dies ability looks back), CR 303.4f (an Aura put onto the battlefield other than by resolving as an Aura spell: its controller chooses what it enchants as it enters),
// CR 303.4g (an Aura that can't enchant anything stays where it is), CR 704.5m (the Aura went to the graveyard as its creature died).
// Cards: the SYNTHETIC Aura of this file, the real Grizzly Bears, Lightning Bolt and Plains.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const SCREAMS = 'SYNTHETIC Screams Aura'; // Enchant creature. When enchanted creature dies, return this card from your graveyard to the battlefield.
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';
const BOLT = 'Lightning Bolt';
const GHOULISH = 'SYNTHETIC Ghoulish Aura'; // Enchant creature. When enchanted creature dies, return this card to the battlefield at the beginning of the next end step.
const LIBRARY = Array.from({ length: 10 }, () => 'Plains');

const screams = singleFaceCard({
  name: SCREAMS,
  manaCost: ['1', 'B'],
  types: ['enchantment'],
  subtypes: ['Aura'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText:
    'Enchant creature\nWhen enchanted creature dies, return this card from your graveyard to the battlefield.',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
    {
      kind: 'triggered',
      trigger: { kind: 'dies', what: { kind: 'attached' } },
      effect: {
        kind: 'moveToZone',
        objects: { kind: 'thisCard' },
        to: 'battlefield',
        controller: 'owner',
      },
    },
  ],
});

const ghoulish = singleFaceCard({
  name: GHOULISH,
  manaCost: ['1', 'B'],
  types: ['enchantment'],
  subtypes: ['Aura'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText:
    'Enchant creature\nWhen enchanted creature dies, return this card to the battlefield at the beginning of the next end step.',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
    {
      kind: 'triggered',
      trigger: { kind: 'dies', what: { kind: 'attached' } },
      effect: {
        kind: 'delayedTrigger',
        at: { step: 'endStep', whose: 'each' },
        effect: {
          kind: 'moveToZone',
          objects: { kind: 'thisCard' },
          to: 'battlefield',
          controller: 'owner',
        },
      },
    },
  ],
});

const board = (others: readonly string[]) =>
  scenario()
    .seat(0)
    .define(screams)
    .hand(BOLT)
    .library(...LIBRARY)
    .battlefield('Mountain')
    .seat(1)
    .library(...LIBRARY)
    .battlefield(BEARS, ...others)
    .battlefield(SCREAMS, { attachedTo: BEARS })
    .at('precombatMain')
    .build();

describe('"When enchanted creature dies, return this card from your graveyard to the battlefield."', () => {
  test('the Aura comes back and its controller chooses a creature to enchant', () => {
    const g = board([ELVES]);
    g.act(0).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    g.passAll();
    const d = g.state.pending;
    expect(d?.kind).toBeDefined();
    if (d !== null && d !== undefined && d.kind === 'choosePermanent') {
      g.act(1).choosePermanents(ELVES);
    }
    g.expect.attached(SCREAMS, { name: ELVES, seat: 1 });
  });

  test('with no creature left to enchant it stays in the graveyard (CR 303.4g)', () => {
    const g = board([]);
    g.act(0).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone(SCREAMS, 'graveyard', { seat: 1 });
  });
});

describe('"When enchanted creature dies, return this card to the battlefield at the beginning of the next end step."', () => {
  const game = (others: readonly string[]) =>
    scenario()
      .seat(0)
      .define(ghoulish)
      .hand(BOLT)
      .library(...LIBRARY)
      .battlefield('Mountain')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, ...others)
      .battlefield(GHOULISH, { attachedTo: BEARS })
      .at('precombatMain')
      .build();

  test('it stays in the graveyard until the end step, then returns and enchants a creature', () => {
    const g = game([ELVES]);
    g.act(0).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone(GHOULISH, 'graveyard', { seat: 1 });
    g.advanceTo('end');
    const d = g.state.pending;
    if (d?.kind === 'choosePermanent') g.act(d.seat).choosePermanents(ELVES);
    g.passAll();
    g.expect.attached(GHOULISH, { name: ELVES, seat: 1 });
  });
});
