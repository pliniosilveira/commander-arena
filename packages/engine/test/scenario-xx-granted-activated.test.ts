// Issue 89 (Silverquill Influence), group 4 (D-641): an Aura that gives its creature an activated ability ("Enchanted creature has flying and "Sacrifice a creature: ~ gets +2/+1
// until end of turn."", Fallen Ideal).
// Pins: CR 613.1f (a granted ability is a layer 6 effect that ends with its source, CR 611.3a), CR 113.6g and 602.2 (the creature has the ability as its own, so its controller
// activates it and "~" is the creature), CR 118.3 (a cost is paid as the ability is activated: a creature sacrificed as a cost is not a legal one to sacrifice twice).
// Cards: the SYNTHETIC "Sacrifice Aura" of this file, the real Grizzly Bears, Llanowar Elves and the basic lands.
import { describe, expect, test } from 'vitest';
import { derive } from '../src/rules/derive';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const AURA = 'SYNTHETIC Sacrifice Aura'; // Enchant creature. Enchanted creature has flying and "Sacrifice a creature: ~ gets +2/+1 until end of turn."
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';

const sacrificeAura = singleFaceCard({
  name: AURA,
  manaCost: ['1', 'B'],
  types: ['enchantment'],
  subtypes: ['Aura'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText:
    'Enchant creature\nEnchanted creature has flying and "Sacrifice a creature: ~ gets +2/+1 until end of turn."',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
    {
      kind: 'static',
      static: {
        kind: 'grantKeyword',
        subject: { kind: 'attached', types: ['creature'] },
        keyword: { kind: 'flying' },
      },
    },
    {
      kind: 'static',
      static: {
        kind: 'grantAbility',
        subject: { kind: 'attached', types: ['creature'] },
        ability: {
          kind: 'activated',
          cost: [{ kind: 'sacrifice', what: { types: ['creature'] } }],
          effect: {
            kind: 'modifyPt',
            objects: { kind: 'this' },
            power: 2,
            toughness: 1,
            duration: 'untilEndOfTurn',
          },
        },
      },
    },
  ],
});

/** Seat 0 has the Aura on its Bears and an Elves to sacrifice; seat 1 has an Elves too. */
function enchanted(): ScenarioGame {
  const g = scenario()
    .seat(0)
    .define(sacrificeAura)
    .hand(AURA)
    .battlefield('Swamp', 'Swamp', BEARS, ELVES)
    .library('Plains', 'Plains', 'Plains')
    .seat(1)
    .battlefield(ELVES)
    .library('Plains', 'Plains', 'Plains')
    .at('precombatMain')
    .build();
  g.act(0).cast(AURA, { targets: [BEARS], pay: true });
  g.passAll();
  return g;
}

describe('CR 613.1f: an Aura that gives an activated ability', () => {
  test('the enchanted creature has the ability and the keyword the Aura gives', () => {
    const g = enchanted();
    const bears = g.object(g.id(BEARS));
    const abilities = derive(g.state, bears).abilities;
    expect(abilities.some((a) => a.kind === 'activated')).toBe(true);
    expect(abilities.some((a) => a.kind === 'keyword' && a.keyword.kind === 'flying')).toBe(true);
  });

  test('its controller sacrifices a creature and the enchanted creature, not the Aura, gets +2/+1 until end of turn', () => {
    const g = enchanted();
    g.expect.pt(BEARS, 2, 2);
    g.act(0).activate(BEARS, { pay: true });
    g.act(0).choosePermanents({ name: ELVES, seat: 0 });
    g.passAll();
    g.expect.pt(BEARS, 4, 3);
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('the bonus ends with the turn', () => {
    const g = enchanted();
    g.act(0).activate(BEARS, { pay: true });
    g.act(0).choosePermanents({ name: ELVES, seat: 0 });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.pt(BEARS, 2, 2);
  });

  test('the Aura leaves: the creature no longer has the ability', () => {
    const g = enchanted();
    const state = {
      ...g.state,
      continuousEffects: [
        ...g.state.continuousEffects,
        {
          id: 'ce-test',
          timestamp: 999,
          objects: [g.id(AURA)],
          until: 'permanent' as const,
          change: { kind: 'loseAllAbilities' as const },
        },
      ],
    };
    const bears = state.objects[g.id(BEARS)];
    if (bears === undefined) throw new Error('no Bears');
    expect(derive(state, bears).abilities.some((a) => a.kind === 'activated')).toBe(false);
  });
});

describe('CR 113.6g, 602.2: the creature has the granted ability as its own', () => {
  test("an opponent's creature enchanted by my Aura: its controller may activate it and I may not", () => {
    const g = scenario()
      .seat(0)
      .define(sacrificeAura)
      .hand(AURA)
      .battlefield('Swamp', 'Swamp')
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .battlefield(BEARS, ELVES)
      .library('Plains', 'Plains', 'Plains')
      .at('precombatMain')
      .build();
    g.act(0).cast(AURA, { targets: [BEARS], pay: true });
    g.passAll();
    expect(g.act(0).try.activate({ name: BEARS, seat: 1 }).ok).toBe(false);
    g.act(0).pass();
    g.act(1).activate(BEARS, { pay: true });
    g.act(1).choosePermanents(ELVES);
    g.passAll();
    g.expect.pt(BEARS, 4, 3);
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
  });
});

describe('a granted ability with {T} in its cost (CR 602.5a)', () => {
  const DRAW_AURA = 'SYNTHETIC Draw Aura'; // Enchant creature. Enchanted creature has "{T}: Draw a card."
  const drawAura = singleFaceCard({
    name: DRAW_AURA,
    manaCost: ['1', 'U'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Enchant creature\nEnchanted creature has "{T}: Draw a card."',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
      {
        kind: 'static',
        static: {
          kind: 'grantAbility',
          subject: { kind: 'attached', types: ['creature'] },
          ability: {
            kind: 'activated',
            cost: [{ kind: 'tap' }],
            effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
          },
        },
      },
    ],
  });

  const build = () => {
    const g = scenario()
      .seat(0)
      .define(drawAura)
      .hand(DRAW_AURA)
      .battlefield('Island', 'Island', BEARS)
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .library('Plains', 'Plains', 'Plains')
      .at('precombatMain')
      .build();
    g.act(0).cast(DRAW_AURA, { targets: [BEARS], pay: true });
    g.passAll();
    return g;
  };

  test('the creature taps to draw a card, once', () => {
    const g = build();
    const before = g.state.seats[0]?.hand.length ?? 0;
    g.act(0).activate(BEARS);
    g.passAll();
    expect(g.state.seats[0]?.hand.length).toBe(before + 1);
    g.expect.tapped(BEARS, true);
    expect(g.act(0).try.activate(BEARS).ok).toBe(false);
  });
});
