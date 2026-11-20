// "Each Sliver creature card in your graveyard has encore {X}, where X is its mana value." (Sliver Swarm deck, group B): `grantEncoreToGraveyardCards`.
// Pins: CR 702.141a (Encore: an activated ability that works from the graveyard, at sorcery speed, exiling the card as a cost), CR 613.1f (an ability given to an object), CR 604.3 and
// CR 113.6b (a static ability of a permanent that gives an ability to cards in a graveyard), CR 202.3 (mana value), CR 118.1 (a cost). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-sliver-b.ts, synthetic-korvold-keywords.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { getLegalActions, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const KEEPER = 'SYNTHETIC Hive Gravekeeper';
const COSTLY = 'SYNTHETIC Costly Sliver'; // {1}{G} Sliver creature, mana value 2
const PLAIN = 'SYNTHETIC Plain Sliver'; // {1}
const BEARS = 'Grizzly Bears'; // not a Sliver

type Builder = ReturnType<typeof scenario>;
type Game = ReturnType<Builder['build']>;

/** What seat 0 may activate: no encore from a graveyard is among it. */
const activations = (g: Game) => getLegalActions(g.state, 0).filter((a) => a.kind === 'activate');

const base = (configure: (b: Builder) => Builder) =>
  configure(
    scenario()
      .define(syntheticCard(COSTLY))
      .define(syntheticCard(PLAIN))
      .seat(0)
      .battlefield('Forest', { count: 2 }),
  )
    .seat(1)
    .build();

describe('the card is valid', () => {
  test(KEEPER, () => {
    expect(validateCard(syntheticCard(KEEPER))).toEqual([]);
  });

  test('the filter names the cards as they are in the graveyard: no zone, controller or owner', () => {
    const card = syntheticCard(KEEPER);
    const face = card.faces[0];
    const ability = face?.abilities[0];
    if (ability === undefined || ability.kind !== 'static') throw new Error('no static');
    const edit = (what: unknown) =>
      validateCard({
        ...card,
        faces: [{ ...face, abilities: [{ ...ability, static: { ...ability.static, what } }] }],
      } as never);
    expect(edit({ types: ['creature'], subtypes: ['Sliver'] })).toEqual([]);
    expect(edit({ zone: 'graveyard' }).length).toBeGreaterThan(0);
    expect(edit({ controller: 'you' }).length).toBeGreaterThan(0);
    expect(edit(undefined).length).toBeGreaterThan(0);
  });
});

describe('"Each Sliver creature card in your graveyard has encore {X}, where X is its mana value" (CR 702.141a)', () => {
  test('a Sliver creature card in the graveyard may be activated, for its mana value', () => {
    const g = base((b) => b.battlefield(KEEPER).graveyard(COSTLY));
    g.expect.legal(0, { activate: COSTLY });
    g.act(0).activate(COSTLY, { pay: true });
    g.expect.zone(COSTLY, 'exile', { seat: 0 });
    g.expect.stack([`${COSTLY} (ability)`]);
    // {2} was paid: two of the Forests are tapped.
    expect(g.find({ name: 'Forest', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(2);
  });

  test('it makes an attacking token copy that is sacrificed at the end step', () => {
    const g = base((b) => b.battlefield(KEEPER).graveyard(COSTLY));
    g.act(0).activate(COSTLY, { pay: true });
    g.passAll();
    const tokens = () =>
      g.find({ name: COSTLY, zone: 'battlefield', seat: 0 }).filter((o) => o.token !== null);
    expect(tokens()).toHaveLength(1);
    g.advanceTo('end');
    g.passAll();
    expect(tokens()).toEqual([]);
    g.expect.invariants();
  });

  test('without the mana for its mana value there is no option', () => {
    const g = scenario()
      .define(syntheticCard(COSTLY))
      .seat(0)
      .battlefield('Forest')
      .battlefield(KEEPER)
      .graveyard(COSTLY)
      .seat(1)
      .build();
    expect(activations(g)).toEqual([]);
  });

  test('a card that is not a Sliver gets none', () => {
    const g = base((b) => b.battlefield(KEEPER).graveyard(BEARS));
    expect(activations(g)).toEqual([]);
  });

  test('a Sliver card in the hand, or in the graveyard of the opponent, gets none', () => {
    const g = scenario()
      .define(syntheticCard(COSTLY))
      .seat(0)
      .battlefield('Forest', { count: 2 })
      .battlefield(KEEPER)
      .hand(COSTLY)
      .seat(1)
      .graveyard(COSTLY)
      .build();
    expect(activations(g)).toEqual([]);
  });

  test('without the permanent there is none', () => {
    const g = base((b) => b.graveyard(COSTLY));
    expect(activations(g)).toEqual([]);
  });

  test('each Sliver creature card in the graveyard has its own mana value as the cost', () => {
    const g = base((b) => b.battlefield(KEEPER).graveyard(COSTLY, PLAIN));
    // Mana value 1 and 2: both are offered, for their own mana values.
    expect(activations(g)).toHaveLength(2);
    g.act(0).activate(PLAIN, { pay: true });
    g.expect.zone(PLAIN, 'exile', { seat: 0 });
    g.passAll();
    expect(g.find({ name: 'Forest', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(1);
  });
});
