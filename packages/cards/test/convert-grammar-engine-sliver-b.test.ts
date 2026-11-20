// The Sliver Swarm deck (issue 133), group B: Oracle text of the Sliver lords that change the rules goes through the grammar (cards named SYNTHETIC, the wordings are those of
// the real cards) and is played through applyAction, so the nodes the parser writes are what the engine runs.
import { type Action, getLegalActions } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const QUICK = parsed(
  'SYNTHETIC Hive Flasher',
  'Creature — Sliver',
  'Flash\nAny player may cast Sliver spells as though they had flash.',
  { manaCost: '{1}{G}', power: '1', toughness: '1', colors: ['G'] },
);
const SLIVER = parsed('SYNTHETIC Drone Sliver', 'Creature — Sliver', '', {
  manaCost: '{1}',
  power: '1',
  toughness: '1',
});

describe('"Any player may cast Sliver spells as though they had flash."', () => {
  test('reads as a permission of every player (no controller in the filter)', () => {
    expect(
      readAll('Any player may cast Sliver spells as though they had flash.', 'creature', ['Sliver'])
        .abilities,
    ).toEqual([
      {
        kind: 'static',
        static: { kind: 'castAsThoughFlash', spells: { subtypes: ['Sliver'] }, anyPlayer: true },
      },
    ]);
    expect(
      readAll('You may cast Sliver spells as though they had flash.', 'creature', ['Sliver'])
        .abilities,
    ).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'castAsThoughFlash',
          spells: { subtypes: ['Sliver'], controller: 'you' },
        },
      },
    ]);
  });

  test('near misses stay unread', () => {
    expect(
      dropped('Each player may cast Sliver spells as though they had flash.', 'creature').text,
    ).toBe('Each player may cast Sliver spells as though they had flash.');
  });

  test('the whole card is supported and an opponent casts a Sliver at instant speed', () => {
    const g = scenario()
      .define(QUICK)
      .define(SLIVER)
      .seat(0)
      .battlefield(QUICK.name)
      .seat(1)
      .hand(SLIVER.name)
      .battlefield('Forest', { count: 2 })
      .at('upkeep', { active: 0, priority: 1 })
      .build();
    const id = g.id({ name: SLIVER.name, zone: 'hand', seat: 1 });
    expect(
      getLegalActions(g.state, 1).some((a: Action) => a.kind === 'castSpell' && a.object === id),
    ).toBe(true);
  });
});

const HATCHERY_TEXT =
  'Each Sliver spell you cast has replicate. The replicate cost is equal to its mana cost.';
const HATCHERY = parsed(
  'SYNTHETIC Hive Hatcher',
  'Creature — Sliver',
  `Replicate {1}{G} (When you cast this spell, copy it for each time you paid its replicate cost.)\n${HATCHERY_TEXT} (A copy of a permanent spell becomes a token.)`,
  { manaCost: '{1}{G}', power: '2', toughness: '2', colors: ['G'] },
);
const COSTLY = parsed('SYNTHETIC Costly Drone', 'Creature — Sliver', '', {
  manaCost: '{1}{G}',
  power: '1',
  toughness: '1',
  colors: ['G'],
});

describe('"Each Sliver spell you cast has replicate. The replicate cost is equal to its mana cost."', () => {
  test('reads as the grant of a replicate cost equal to the mana cost', () => {
    expect(readAll(HATCHERY_TEXT, 'creature', ['Sliver']).abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantKeywordToSpells',
          what: { subtypes: ['Sliver'], controller: 'you' },
          keyword: { kind: 'replicateAtManaCost' },
        },
      },
    ]);
  });

  test('near misses stay unread', () => {
    for (const text of [
      'Each Sliver spell you cast has replicate.',
      'Each Sliver spell you cast has replicate. The replicate cost is equal to {1}.',
      'Each Sliver spell has replicate. The replicate cost is equal to its mana cost.',
    ]) {
      expect(dropped(text, 'creature', ['Sliver']).text, text).toBe(text);
    }
  });

  test('a spell cast with it asks for the replicate count and makes token copies', () => {
    const g = scenario()
      .define(HATCHERY)
      .define(COSTLY)
      .seat(0)
      .hand(COSTLY.name)
      .battlefield('Forest', { count: 7 })
      .battlefield(HATCHERY.name)
      .seat(1)
      .build();
    g.act(0).cast(COSTLY.name, { replicas: 2, pay: true });
    g.passAll();
    const slivers = g.find({ name: COSTLY.name, zone: 'battlefield' });
    expect(slivers).toHaveLength(3);
    expect(slivers.filter((o) => o.token !== null)).toHaveLength(2);
  });
});
