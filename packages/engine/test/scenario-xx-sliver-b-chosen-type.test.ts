// "Slivers you control and nontoken creatures you control are the chosen type in addition to their other creature types. The same is true for creature spells you control and creature
// cards you own that aren't on the battlefield." (Sliver Swarm deck, group B): `giveChosenCreatureType`.
// Pins: CR 613.1d (layer 4: type-changing effects), CR 205.3m (creature types), CR 205.1b (in addition to), CR 607.2d (the chosen type is the permanent's own choice), CR 604.3
// (a static ability works in other zones only when it gives something to objects there), CR 702.73a (Changeling works in every zone). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-sliver-b.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { derive } from '../src/rules/derive';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const BIOLOGIST = 'SYNTHETIC Hive Biologist';
const PLAIN = 'SYNTHETIC Plain Sliver';
const BEARS = 'Grizzly Bears';
const MIRROR = 'SYNTHETIC Mirror Image';
const mirror = singleFaceCard({
  name: MIRROR,
  manaCost: ['1', 'U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: "Create a token that's a copy of target creature.",
  spell: {
    targets: [
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } } },
    ],
    effect: {
      kind: 'createToken',
      token: { kind: 'copyOf', object: { kind: 'target', id: 't1' } },
      count: 1,
    },
  },
});
const FILLER = ['Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

function game(configure: (b: Builder) => Builder): ScenarioGame {
  return configure(
    scenario()
      .define(syntheticCard(PLAIN))
      .seat(0)
      .library(...FILLER),
  )
    .seat(1)
    .library(...FILLER)
    .build();
}

const typesOf = (g: ScenarioGame, name: string, zone: string, seat = 0): readonly string[] =>
  derive(g.state, g.object({ name, zone, seat } as never)).subtypes;

describe('the card is valid', () => {
  test(BIOLOGIST, () => {
    expect(validateCard(syntheticCard(BIOLOGIST))).toEqual([]);
  });

  test('it needs the choice of a creature type', () => {
    const card = syntheticCard(BIOLOGIST);
    const face = card.faces[0];
    const without = {
      ...card,
      faces: [{ ...face, abilities: face?.abilities.filter((a) => a.kind !== 'replacement') }],
    };
    expect(validateCard(without as never).length).toBeGreaterThan(0);
  });
});

describe('the chosen type is added to what the filter names (CR 613.1d)', () => {
  test('a Sliver and a nontoken creature you control are the chosen type and keep their own', () => {
    const g = game((b) =>
      b.battlefield(BIOLOGIST, { chosen: { creatureType: 'Elf' } }).battlefield(PLAIN, BEARS),
    );
    expect(typesOf(g, PLAIN, 'battlefield')).toEqual(['Sliver', 'Elf']);
    expect(typesOf(g, BEARS, 'battlefield')).toEqual(['Bear', 'Elf']);
    // The Biologist is a nontoken creature you control too.
    expect(typesOf(g, BIOLOGIST, 'battlefield')).toEqual(['Human', 'Wizard', 'Elf']);
  });

  test('a creature of the opponent is not', () => {
    const g = scenario()
      .seat(0)
      .library(...FILLER)
      .battlefield(BIOLOGIST, { chosen: { creatureType: 'Elf' } })
      .seat(1)
      .library(...FILLER)
      .battlefield(BEARS)
      .build();
    expect(typesOf(g, BEARS, 'battlefield', 1)).toEqual(['Bear']);
  });

  test('a creature token is named by "Slivers" only when it is one, not by "nontoken creatures"', () => {
    const g = game((b) =>
      b
        .define(mirror)
        .battlefield(BIOLOGIST, { chosen: { creatureType: 'Elf' } })
        .battlefield(BEARS, PLAIN)
        .battlefield('Island', 'Island', 'Island', 'Island')
        .hand(MIRROR, MIRROR),
    );
    g.act(0).cast(`${MIRROR}[1]`, { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).cast(MIRROR, { targets: [PLAIN], pay: true });
    g.passAll();
    const tokens = (name: string) =>
      g.find({ name, zone: 'battlefield' }).filter((o) => o.token !== null);
    const bearToken = tokens(BEARS)[0];
    const sliverToken = tokens(PLAIN)[0];
    expect(bearToken).toBeDefined();
    expect(sliverToken).toBeDefined();
    expect(derive(g.state, bearToken as never).subtypes).toEqual(['Bear']);
    expect(derive(g.state, sliverToken as never).subtypes).toEqual(['Sliver', 'Elf']);
  });

  test('without a chosen type nothing is given', () => {
    const g = game((b) => b.battlefield(BIOLOGIST).battlefield(PLAIN));
    expect(typesOf(g, PLAIN, 'battlefield')).toEqual(['Sliver']);
  });

  test('a land is not a creature: it gets nothing', () => {
    const g = game((b) =>
      b.battlefield(BIOLOGIST, { chosen: { creatureType: 'Elf' } }).battlefield('Forest'),
    );
    expect(typesOf(g, 'Forest', 'battlefield')).toEqual(['Forest']);
  });
});

describe('the same is true for creature spells and creature cards outside the battlefield (CR 205.3m)', () => {
  test('creature cards in hand, graveyard and library, and a creature spell, have the chosen type', () => {
    const g = game((b) =>
      b
        .battlefield(BIOLOGIST, { chosen: { creatureType: 'Elf' } })
        .hand(BEARS)
        .graveyard(PLAIN)
        .battlefield('Forest', { count: 2 }),
    );
    expect(typesOf(g, BEARS, 'hand')).toEqual(['Bear', 'Elf']);
    expect(typesOf(g, PLAIN, 'graveyard')).toEqual(['Sliver', 'Elf']);
    g.act(0).cast(BEARS, { pay: true });
    expect(typesOf(g, BEARS, 'stack')).toEqual(['Bear', 'Elf']);
  });

  test('a noncreature card is not changed, and neither are the cards of the opponent', () => {
    const g = scenario()
      .seat(0)
      .library(...FILLER)
      .battlefield(BIOLOGIST, { chosen: { creatureType: 'Elf' } })
      .hand('Lightning Bolt')
      .seat(1)
      .library(...FILLER)
      .hand(BEARS)
      .build();
    expect(typesOf(g, 'Lightning Bolt', 'hand')).toEqual([]);
    expect(typesOf(g, BEARS, 'hand', 1)).toEqual(['Bear']);
  });
});
