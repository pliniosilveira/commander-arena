// "Ward—Sacrifice a legendary artifact or legendary creature." (Sauron, the Dark Lord) and "Mount Doom"-style costs that sacrifice the source and another permanent. The cards here are
// SYNTHETIC; the real ones are played in packages/cards/test/convert-grammar-engine-sauron-costs.test.ts.
// Pins: CR 702.21a (Ward: counter that spell or ability unless that player pays [cost]), CR 118.12a (the payer decides), CR 118.3 (a cost that cannot be paid is not paid: with no
// permanent to sacrifice nobody is asked and the spell is countered), CR 701.21a (a player sacrifices only a permanent they control; the payer is the controller of the spell, not of
// the ward permanent), CR 602.2b and 118.3 (the cost "Sacrifice ~ and a legendary artifact" needs a different permanent for each part and pays both together), CR 101.4/CR 800 (any number of
// opponents: the payer is whoever controls the spell).
import { describe, expect, test } from 'vitest';
import { unsupportedFeatureIssues } from '../src/ast/supported';
import type { Cost, ObjectFilter } from '../src/index';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';
import { choosePermanentDecision, confirmOptionalDecision } from './pending-helpers';

const WARDEN = 'SYNTHETIC Sacrifice Warden'; // 2/2, "Ward—Sacrifice a legendary artifact or legendary creature."
const KING = 'SYNTHETIC Legendary King'; // 1/1 legendary creature
const QUEEN = 'SYNTHETIC Legendary Queen'; // 1/1 legendary creature
const RING = 'SYNTHETIC Legendary Ring'; // legendary artifact
const BEARS = 'Grizzly Bears'; // not legendary
const BOLT = 'Lightning Bolt';
const SHAPER = 'SYNTHETIC Doom Land'; // legendary land: "{T}, Sacrifice ~ and a legendary artifact: draw two cards."
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

const legendary: ObjectFilter = {
  anyOf: [
    { types: ['artifact'], supertypes: ['legendary'] },
    { types: ['creature'], supertypes: ['legendary'] },
  ],
};

const warden = singleFaceCard({
  name: WARDEN,
  manaCost: ['1', 'B'],
  types: ['creature'],
  subtypes: ['Horror'],
  colors: ['B'],
  colorIdentity: ['B'],
  power: 2,
  toughness: 2,
  oracleText: 'Ward—Sacrifice a legendary artifact or legendary creature.',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'ward', cost: [{ kind: 'sacrifice', what: legendary }] } },
  ],
});
const king = (name: string) =>
  singleFaceCard({
    name,
    manaCost: ['1'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Human'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 1,
    oracleText: 'SYNTHETIC',
  });
const ring = singleFaceCard({
  name: RING,
  manaCost: ['1'],
  supertypes: ['legendary'],
  types: ['artifact'],
  colors: [],
  colorIdentity: [],
  oracleText: 'SYNTHETIC',
});
const doomLand = singleFaceCard({
  name: SHAPER,
  manaCost: null,
  supertypes: ['legendary'],
  types: ['land'],
  colors: [],
  colorIdentity: [],
  oracleText: '{T}, Sacrifice ~ and a legendary artifact: Draw two cards.',
  abilities: [
    {
      kind: 'activated',
      cost: [
        { kind: 'tap' },
        {
          kind: 'sacrifice',
          what: { kind: 'this' },
          alongside: [{ types: ['artifact'], supertypes: ['legendary'] }],
        },
      ],
      effect: { kind: 'draw', player: { kind: 'you' }, count: 2 },
    },
  ],
});

describe('"Ward—Sacrifice a legendary artifact or legendary creature." (CR 702.21a, 701.21a, 118.3)', () => {
  /** Seat 0 holds a Bolt and Mountains, and controls `mine`; seat 1 has the Warden. */
  function start(...mine: readonly string[]) {
    return scenario({ seats: 3 })
      .define(warden)
      .define(king(KING))
      .define(king(QUEEN))
      .define(ring)
      .seat(0)
      .hand(BOLT, { label: 'bolt' })
      .library(...LIBRARY)
      .battlefield('Mountain', { count: 2 })
      .battlefield(...mine)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(WARDEN)
      .seat(2)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  }

  test('with one legendary permanent accepting sacrifices it at once and the spell resolves', () => {
    const g = start(KING, BEARS);
    g.act(0).cast('bolt', { targets: [WARDEN], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    const d = confirmOptionalDecision(g);
    expect(d.purpose).toBe('ward');
    expect(d.cost).toEqual([{ kind: 'sacrifice', what: legendary }]);
    const mark = g.mark();
    g.act(0).accept();
    expect(g.eventsSince(mark)).toContainEqual(
      expect.objectContaining({ kind: 'permanentsChosen', purpose: 'sacrifice', automatic: true }),
    );
    g.expect.zone(KING, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.noEvent({ kind: 'countered' });
    g.expect.stack([BOLT]);
    g.passAll();
    g.expect.zone(WARDEN, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('with several the payer who accepted chooses which, among their own legendary artifacts and creatures only', () => {
    const g = start(KING, QUEEN, RING, BEARS);
    g.act(0).cast('bolt', { targets: [WARDEN], pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.pending('choosePermanent', 0);
    const d = choosePermanentDecision(g);
    expect(d.purpose).toBe('sacrifice');
    expect([...d.legal].sort()).toEqual([g.id(KING), g.id(QUEEN), g.id(RING)].sort());
    expect([d.min, d.max]).toEqual([1, 1]);
    g.act(0).choosePermanents(RING);
    g.expect.zone(RING, 'graveyard', { seat: 0 });
    g.expect.zone(KING, 'battlefield', { seat: 0 });
    g.expect.stack([BOLT]);
    g.passAll();
    g.expect.zone(WARDEN, 'graveyard', { seat: 1 });
  });

  test('declining counters the spell and nothing is sacrificed', () => {
    const g = start(KING, QUEEN);
    g.act(0).cast('bolt', { targets: [WARDEN], pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.stack([]);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.zone(WARDEN, 'battlefield', { seat: 1 });
    g.expect.zone(KING, 'battlefield', { seat: 0 });
    g.expect.zone(QUEEN, 'battlefield', { seat: 0 });
  });

  test('a player with nothing legendary cannot pay (CR 118.3): nobody is asked and the spell is countered', () => {
    const g = start(BEARS);
    const mark = g.mark();
    g.act(0).cast('bolt', { targets: [WARDEN], pay: true });
    g.passAll();
    expect(g.eventsSince(mark)).toContainEqual(expect.objectContaining({ kind: 'countered' }));
    g.expect.stack([]);
    g.expect.zone(WARDEN, 'battlefield', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.pending('priority', 0);
  });

  test('the permanents of the Warden controller are no payment: the payer is the controller of the spell', () => {
    // The Warden's controller has a legendary creature too; the opponent casting the spell has none.
    const g = scenario({ seats: 3 })
      .define(warden)
      .define(king(KING))
      .seat(0)
      .hand(BOLT, { label: 'bolt' })
      .library(...LIBRARY)
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(WARDEN, KING)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast('bolt', { targets: [WARDEN], pay: true });
    g.passAll();
    g.expect.stack([]);
    g.expect.zone(KING, 'battlefield', { seat: 1 });
    g.expect.zone(WARDEN, 'battlefield', { seat: 1 });
  });
});

describe('"{T}, Sacrifice ~ and a legendary artifact: ..." (CR 602.2b, 118.3, 701.21a)', () => {
  function start(...mine: readonly string[]) {
    return scenario()
      .define(doomLand)
      .define(ring)
      .define(king(KING))
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SHAPER)
      .battlefield(...mine)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  }

  test('with one legendary artifact both are sacrificed together as the cost and the ability resolves', () => {
    const g = start(RING);
    g.act(0).activate(SHAPER);
    g.expect.zone(SHAPER, 'graveyard', { seat: 0 });
    g.expect.zone(RING, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.invariants();
  });

  test('with no legendary artifact the ability is not offered (CR 118.3)', () => {
    const g = start(KING);
    expect(g.act(0).try.activate(SHAPER).ok).toBe(false);
    g.expect.zone(SHAPER, 'battlefield', { seat: 0 });
    g.expect.zone(KING, 'battlefield', { seat: 0 });
  });

  test('the source cannot pay for the other part itself: a legendary artifact land alone is not enough (CR 701.21a, 118.3)', () => {
    const artifactLand = {
      ...doomLand,
      name: 'SYNTHETIC Artifact Doom Land',
      faces: [
        { ...doomLand.faces[0], name: 'SYNTHETIC Artifact Doom Land', types: ['artifact', 'land'] },
      ],
    } as typeof doomLand;
    const g = scenario()
      .define(artifactLand)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(artifactLand.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    expect(g.act(0).try.activate(artifactLand.name).ok).toBe(false);
  });

  test('with several legendary artifacts the player chooses which one is sacrificed with the land', () => {
    const h = scenario()
      .define(doomLand)
      .define(ring)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SHAPER)
      .battlefield(RING, { count: 2 })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    h.act(0).activate(SHAPER);
    h.expect.pending('choosePermanent', 0);
    const d = choosePermanentDecision(h);
    expect(d.purpose).toBe('sacrifice');
    expect(d.forCost).toBe(true);
    expect(d.legal).toHaveLength(2);
    expect(d.legal).not.toContain(h.id(SHAPER));
    expect([d.min, d.max]).toEqual([1, 1]);
    const [first] = d.legal;
    if (first === undefined) throw new Error('no legal');
    h.act(0).choosePermanents(first);
    h.expect.zone(SHAPER, 'graveyard', { seat: 0 });
    const rings = Object.values(h.state.objects).filter(
      (o) => o.owner === 0 && o.zone === 'graveyard',
    );
    expect(rings).toHaveLength(2);
    expect(
      Object.values(h.state.objects).filter((o) => o.zone === 'battlefield' && o.owner === 0),
    ).toHaveLength(1);
  });
});

describe('what validateCard and the support check say', () => {
  const supported = (def: Parameters<typeof unsupportedFeatureIssues>[0]) =>
    unsupportedFeatureIssues(def).length === 0;
  const card = (cost: readonly Cost[], ward = false) =>
    singleFaceCard({
      name: 'SYNTHETIC Costly',
      manaCost: ['1'],
      types: ward ? ['creature'] : ['artifact'],
      ...(ward ? { power: 1, toughness: 1 } : {}),
      colors: [],
      colorIdentity: [],
      oracleText: 'x',
      abilities: ward
        ? [{ kind: 'keyword', keyword: { kind: 'ward', cost } }]
        : [
            {
              kind: 'activated',
              cost,
              effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
            },
          ],
    });
  const both: Cost = {
    kind: 'sacrifice',
    what: { kind: 'this' },
    alongside: [{ types: ['artifact'], supertypes: ['legendary'] }],
  };

  test('"Sacrifice ~ and a legendary artifact" is a valid and supported cost of an activated ability', () => {
    expect(validateCard(card([{ kind: 'tap' }, both]))).toEqual([]);
    expect(supported(card([{ kind: 'tap' }, both]))).toBe(true);
  });

  test('Ward with a sacrifice of a filter is supported; of the permanent itself, with another cost or of several kinds it is not', () => {
    const filter: Cost = { kind: 'sacrifice', what: legendary };
    expect(supported(card([filter], true))).toBe(true);
    expect(supported(card([{ kind: 'sacrifice', what: { kind: 'this' } }], true))).toBe(false);
    expect(supported(card([{ kind: 'mana', symbols: ['1'] }, filter], true))).toBe(false);
    expect(supported(card([both], true))).toBe(false);
  });
});
