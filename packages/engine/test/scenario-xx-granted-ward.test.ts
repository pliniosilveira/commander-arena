// Issue 89 (Silverquill Influence), group 1: a static ability that gives ward ("Enchanted creature has ward {2}").
// Pins: CR 702.21a (Ward: whenever this permanent becomes the target of a spell or ability an opponent controls, counter it unless that player pays the
// cost), CR 613.1f (a granted keyword is a layer 6 effect that ends when the source leaves, CR 611.3a), CR 303.4 (the Aura enters attached and the
// "enchanted creature" is the permanent it is attached to) and CR 702.21 instances (each instance of ward is a triggered ability of its own, as the
// repository already does for a printed one, `rules/derive-keywords.ts`).
// Cards: the SYNTHETIC "Ward Aura" of this file, the real Grizzly Bears, Lightning Bolt and the basic lands.
import { describe, expect, test } from 'vitest';
import { derive } from '../src/rules/derive';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const AURA = 'SYNTHETIC Ward Aura'; // Enchant creature. Enchanted creature has ward {2}.
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';

const wardAura = singleFaceCard({
  name: AURA,
  manaCost: ['1', 'W'],
  types: ['enchantment'],
  subtypes: ['Aura'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: 'Enchant creature. Enchanted creature has ward {2}.',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
    {
      kind: 'static',
      static: {
        kind: 'grantKeyword',
        subject: { kind: 'attached', types: ['creature'] },
        keyword: { kind: 'ward', cost: [{ kind: 'mana', symbols: ['2'] }] },
      },
    },
  ],
});

/** Seat 0 has put the Aura on its own Bears; seat 1 holds a Bolt and three Mountains and has priority. */
function enchanted(): ScenarioGame {
  const g = scenario()
    .seat(0)
    .define(wardAura)
    .hand(AURA)
    .battlefield('Plains', 'Plains', BEARS)
    .seat(1)
    .hand(BOLT)
    .battlefield('Mountain', 'Mountain', 'Mountain')
    .build();
  g.act(0).cast(AURA, { targets: [BEARS], pay: true });
  g.passAll();
  g.act(0).pass();
  return g;
}

describe('CR 702.21a with CR 613.1f: an Aura that gives ward', () => {
  test('the enchanted creature has the ward ability in its derived abilities', () => {
    const g = enchanted();
    const bears = g.find({ name: BEARS, zone: 'battlefield' })[0];
    if (bears === undefined) throw new Error('no Bears');
    const abilities = derive(g.state, bears).abilities;
    expect(abilities.filter((a) => a.kind === 'keyword' && a.keyword.kind === 'ward')).toHaveLength(
      1,
    );
    expect(abilities.some((a) => a.kind === 'triggered')).toBe(true);
  });

  test('an opponent targeting the enchanted creature puts the ward trigger above the spell', () => {
    const g = enchanted();
    g.act(1).cast(BOLT, { targets: [BEARS], pay: true });
    g.expect.stack([`${BEARS} (ability)`, BOLT]);
  });

  test('not paying the {2} counters the spell and the creature lives', () => {
    const g = enchanted();
    g.act(1).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 1);
    g.act(1).decline();
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(BOLT, 'graveyard', { seat: 1, count: 1 });
    g.expect.invariants();
  });

  test('paying the {2} lets the spell resolve and the creature dies', () => {
    const g = enchanted();
    g.act(1).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    g.act(1).accept();
    g.act(1).payAuto();
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('the controller of the creature is not an opponent of it: its own targeting does not trigger ward', () => {
    const g = scenario()
      .seat(0)
      .define(wardAura)
      .hand(AURA)
      .hand(BOLT)
      .battlefield('Plains', 'Plains', 'Mountain', BEARS)
      .seat(1)
      .battlefield('Mountain')
      .build();
    g.act(0).cast(AURA, { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).cast(BOLT, { targets: [BEARS], pay: true });
    g.expect.stack([BOLT]);
  });
});

describe('ward granted twice', () => {
  test('two Auras are two instances: two ward triggers (the repository counts instances of a printed ward the same way)', () => {
    const g = scenario()
      .seat(0)
      .define(wardAura)
      .hand(AURA, { label: 'a1' })
      .hand(AURA, { label: 'a2' })
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', BEARS)
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .build();
    g.act(0).cast('a1', { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).cast('a2', { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [BEARS], pay: true });
    expect(g.state.stack).toHaveLength(3);
  });
});

describe('ward given by an effect for a turn ("Target creature gains ward {2} until end of turn.")', () => {
  const HEDGE = 'SYNTHETIC Ward Hedge'; // Instant. Target creature gains ward {2} until end of turn.
  const hedge = singleFaceCard({
    name: HEDGE,
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Target creature gains ward {2} until end of turn.',
    spell: {
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect: {
        kind: 'grantKeyword',
        objects: { kind: 'target', id: 't1' },
        keyword: { kind: 'ward', cost: [{ kind: 'mana', symbols: ['2'] }] },
        duration: 'untilEndOfTurn',
      },
    },
  });

  function hedged(): ScenarioGame {
    const g = scenario()
      .seat(0)
      .define(hedge)
      .hand(HEDGE)
      .battlefield('Plains', BEARS)
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .build();
    g.act(0).cast(HEDGE, { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).pass();
    return g;
  }

  test('the creature has ward until end of turn: an opponent targeting it triggers the ward ability', () => {
    const g = hedged();
    g.act(1).cast(BOLT, { targets: [BEARS], pay: true });
    g.expect.stack([`${BEARS} (ability)`, BOLT]);
  });

  test('declining the {2} counters the spell, as for a static grant', () => {
    const g = hedged();
    g.act(1).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 1);
    g.act(1).decline();
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('the grant ends with the turn: the next turn the creature has no ward', () => {
    const g = hedged();
    const bears = g.find({ name: BEARS, zone: 'battlefield' })[0];
    if (bears === undefined) throw new Error('no Bears');
    expect(derive(g.state, bears).abilities.some((a) => a.kind === 'triggered')).toBe(true);
    g.advanceTo('end');
    g.advanceTo('upkeep');
    const later = g.find({ name: BEARS, zone: 'battlefield' })[0];
    if (later === undefined) throw new Error('no Bears');
    expect(derive(g.state, later).abilities.some((a) => a.kind === 'triggered')).toBe(false);
  });
});
