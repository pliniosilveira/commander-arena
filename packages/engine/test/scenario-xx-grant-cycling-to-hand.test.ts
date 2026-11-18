// "Each creature card in your hand has cycling {1}{U}." (issue 104; `grantKeywordToHandCards`): a static ability of a permanent on the battlefield gives the creature cards in its
// controller's hand a cycling ability. Pins: CR 702.29a (Cycling: an activated ability that functions only from the hand, "[Cost], Discard this card: Draw a card"), CR 613.1f
// (layer 6: an ability given to an object), CR 611.3a (the effect is not locked in: it applies to whatever the text says at any moment), CR 113.6b (it functions only from the hand),
// CR 604.2 (a static ability creates a continuous effect while its permanent is on the battlefield). Cards are SYNTHETIC but for the real Grizzly Bears and Lightning Bolt.
import { describe, expect, test } from 'vitest';
import {
  type Action,
  type CardDefinition,
  getLegalActions,
  syntheticCard,
  validateCard,
} from '../src/index';
import { derive } from '../src/rules/derive';
import { type ScenarioGame, scenario } from '../src/testing/index';

const MUSE = 'SYNTHETIC Cycling Muse';
const CYCLER = 'SYNTHETIC Cycling Bear';
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';

const activates = (g: ScenarioGame, seat: 0 | 1 = 0): Action[] =>
  getLegalActions(g.state, seat).filter((a) => a.kind === 'activate');

const cycling = (g: ScenarioGame, name: string) =>
  derive(g.state, g.object({ name, seat: 0 })).abilities.filter(
    (a) => a.kind === 'keyword' && a.keyword.kind === 'cycling',
  );

describe('the creature cards in your hand have cycling {1}{U} (CR 702.29a, 613.1f)', () => {
  const build = () =>
    scenario()
      .seat(0)
      .hand(BEARS, BOLT)
      .battlefield(MUSE)
      .battlefield('Island', 'Island')
      .library('Forest', 'Plains')
      .seat(1)
      .hand(BEARS)
      .battlefield('Island', 'Island')
      .library('Forest')
      .build();

  test('the creature card in hand gets the keyword and its ability, the noncreature card does not', () => {
    const g = build();
    expect(cycling(g, BEARS)).toEqual([
      {
        kind: 'keyword',
        keyword: { kind: 'cycling', cost: [{ kind: 'mana', symbols: ['1', 'U'] }] },
      },
    ]);
    expect(derive(g.state, g.object({ name: BEARS, seat: 0 })).abilities).toContainEqual({
      kind: 'activated',
      cost: [
        { kind: 'mana', symbols: ['1', 'U'] },
        { kind: 'discardThis', cycling: true },
      ],
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      functionsIn: 'hand',
    });
    expect(cycling(g, BOLT)).toEqual([]);
    expect(activates(g)).toHaveLength(1);
  });

  test('activating it discards the creature card as a cost, then draws a card', () => {
    const g = build();
    g.act(0).activate(BEARS, { pay: true });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.stack([`${BEARS} (ability)`]);
    g.passAll();
    g.expect.zone('Forest', 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test("it is the controller's hand only: a creature card in the opponent's hand has none", () => {
    const g = build();
    expect(g.find({ name: BEARS, zone: 'hand', seat: 1 })).toHaveLength(1);
    expect(derive(g.state, g.object({ name: BEARS, seat: 1 })).abilities).toEqual([]);
    expect(activates(g, 1)).toEqual([]);
  });

  test('it is given in the hand only: the same card on the battlefield, in the graveyard or on the stack has none (CR 113.6b)', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield(MUSE, BEARS)
      .graveyard(BEARS)
      .battlefield('Island', 'Island')
      .library('Forest')
      .seat(1)
      .build();
    for (const o of g.find({ name: BEARS })) {
      expect(derive(g.state, o).abilities, o.zone).toEqual([]);
    }
    expect(activates(g)).toEqual([]);
  });

  test('without the permanent on the battlefield nothing is given (CR 611.3a)', () => {
    const g = scenario()
      .seat(0)
      .hand(BEARS)
      .graveyard(MUSE)
      .battlefield('Island', 'Island')
      .library('Forest')
      .seat(1)
      .build();
    expect(cycling(g, BEARS)).toEqual([]);
    expect(activates(g)).toEqual([]);
  });

  test('it needs the mana of the cost', () => {
    const g = scenario()
      .seat(0)
      .hand(BEARS)
      .battlefield(MUSE, 'Island')
      .library('Forest')
      .seat(1)
      .build();
    expect(cycling(g, BEARS)).toHaveLength(1);
    expect(activates(g)).toEqual([]);
  });
});

describe('the given cycling is one more instance beside the printed one (CR 702.29a, 613.1f)', () => {
  test('a card with Cycling {2} has both, each its own ability with its own cost', () => {
    const g = scenario()
      .seat(0)
      .hand(CYCLER)
      .battlefield(MUSE)
      .battlefield('Island', 'Island')
      .library('Forest', 'Plains')
      .seat(1)
      .build();
    expect(cycling(g, CYCLER)).toHaveLength(2);
    expect(activates(g)).toHaveLength(2);
  });

  test('two of the permanents give the same keyword once', () => {
    const g = scenario()
      .seat(0)
      .hand(BEARS)
      .battlefield(MUSE, MUSE)
      .battlefield('Island', 'Island')
      .library('Forest')
      .seat(1)
      .build();
    expect(cycling(g, BEARS)).toHaveLength(1);
    expect(activates(g)).toHaveLength(1);
  });
});

describe('the AST of grantKeywordToHandCards is validated', () => {
  const muse = syntheticCard(MUSE);
  const withStatic = (s: Record<string, unknown>): CardDefinition =>
    ({
      ...muse,
      faces: muse.faces.map((f) => ({ ...f, abilities: [{ kind: 'static', static: s }] })),
    }) as unknown as CardDefinition;
  const good = {
    kind: 'grantKeywordToHandCards',
    what: { types: ['creature'] },
    keyword: { kind: 'cycling', cost: [{ kind: 'mana', symbols: ['1', 'U'] }] },
  };

  test('the fixture is valid, and so is a card that names no filter quality', () => {
    expect(validateCard(muse)).toEqual([]);
    expect(validateCard(withStatic({ ...good, what: {} }))).toEqual([]);
  });

  test.each([
    ['a keyword other than cycling', { ...good, keyword: { kind: 'flying' } }],
    [
      'a cycling cost that lists the discard',
      { ...good, keyword: { kind: 'cycling', cost: [{ kind: 'discardThis' }] } },
    ],
    ['a filter with a zone', { ...good, what: { types: ['creature'], zone: 'graveyard' } }],
    ['a filter with a controller', { ...good, what: { types: ['creature'], controller: 'you' } }],
  ])('refuses %s', (_name, s) => {
    expect(validateCard(withStatic(s)).length).toBeGreaterThan(0);
  });
});
