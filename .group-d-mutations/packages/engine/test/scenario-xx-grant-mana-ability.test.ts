// "Lands you control have "{T}: Add one mana of any color."" (D-099): a static ability that gives
// the permanents it names a mana ability.
// Pins: CR 613.1f (layer 6: ability-adding and ability-removing effects), CR 613.7 (timestamp order
// within a layer, and an ability added after "loses all abilities" still applies), CR 611.3a (a static
// ability's effect applies to whatever it describes at any moment), CR 602.5c (a restriction of a
// granted ability applies only to the ability as granted), CR 605.1a (a mana ability), CR 106.7 (what
// a land could produce includes what it has been given).
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-mana-plus.ts) or the real fixtures named.
import { describe, expect, test } from 'vitest';
import type { Ability, PayManaDecision } from '../src/index';
import { isFeatureSupported, validateAbility, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const LANTERN = 'SYNTHETIC Prism Lantern';
const MURK = 'SYNTHETIC Murk Lantern';
const WIPE = 'SYNTHETIC Land Wipe';

type Game = ReturnType<ReturnType<typeof scenario>['build']>;
type Ref = Parameters<Game['id']>[0];

/** The colors a card's ability of that index is offered for, as a list. */
const offered = (g: Game, card: Ref, abilityIndex: number, seat: 0 | 1 = 0): string[] => {
  const id = g.id(card);
  return g
    .legalActions(seat)
    .flatMap((a) =>
      a.kind === 'activateAbility' && a.source === id && a.abilityIndex === abilityIndex
        ? [a.color ?? '-']
        : [],
    );
};

describe('lands you control have "{T}: Add one mana of any color."', () => {
  test('a Forest gets a second mana ability, after its own, for any color', () => {
    const g = scenario().seat(0).battlefield(LANTERN, 'Forest').build();
    expect(offered(g, 'Forest', 0)).toEqual(['-']);
    expect(offered(g, 'Forest', 1)).toEqual(['W', 'U', 'B', 'R', 'G']);
    g.act(0).tapForMana('Forest', { ability: 1, color: 'R' });
    g.expect.pool(0, 'R');
    g.expect.tapped('Forest');
  });

  test('only lands I control: not the opponent lands, not an artifact', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LANTERN, 'Sol Ring', 'Forest')
      .seat(1)
      .battlefield('Island')
      .build();
    expect(offered(g, 'Sol Ring', 1)).toEqual([]);
    expect(offered(g, 'Forest', 1)).toHaveLength(5);
    const theirs = scenario().seat(0).battlefield(LANTERN).seat(1).battlefield('Island').build();
    expect(offered(theirs, { name: 'Island', seat: 1 }, 1, 1)).toEqual([]);
  });

  test('the Lantern itself is not a land and gets nothing', () => {
    const g = scenario().seat(0).battlefield(LANTERN).build();
    expect(offered(g, LANTERN, 0)).toEqual([]);
  });

  test('two Lanterns give it once: the same ability is not listed twice', () => {
    const g = scenario().seat(0).battlefield(LANTERN, LANTERN, 'Forest').build();
    expect(offered(g, 'Forest', 1)).toHaveLength(5);
    expect(offered(g, 'Forest', 2)).toEqual([]);
  });

  test('a land that enters later has it, a Lantern that enters later gives it', () => {
    const g = scenario().seat(0).hand('Mountain').battlefield(LANTERN).build();
    g.act(0).playLand('Mountain');
    expect(offered(g, 'Mountain', 1)).toHaveLength(5);
    const cast = scenario()
      .seat(0)
      .hand(LANTERN)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest')
      .build();
    expect(offered(cast, { name: 'Forest', nth: 3 }, 1)).toEqual([]);
    cast.act(0).cast(LANTERN, { pay: true });
    cast.passAll();
    // The first three Forests paid for it; the fourth is untapped and has the new ability.
    expect(offered(cast, { name: 'Forest', nth: 3 }, 1)).toHaveLength(5);
  });

  test('when the Lantern leaves the battlefield the lands lose it', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Artifact Smash')
      .battlefield(LANTERN, 'Mountain')
      .build();
    expect(offered(g, 'Mountain', 1)).toHaveLength(5);
    g.act(0).cast('SYNTHETIC Artifact Smash', { targets: [LANTERN], pay: true });
    g.passAll();
    g.expect.zone(LANTERN, 'graveyard');
    expect(offered(g, 'Mountain', 1)).toEqual([]);
  });
});

describe('layer 6: "loses all abilities" and timestamps (CR 613.1f, 613.7)', () => {
  test('a land that loses all abilities loses the granted one with its own', () => {
    const g = scenario()
      .seat(0)
      .hand(WIPE)
      .battlefield('Island', 'Island', LANTERN, 'Forest')
      .build();
    g.act(0).cast(WIPE, { targets: [{ name: 'Forest' }], pay: true });
    g.passAll();
    expect(offered(g, 'Forest', 0)).toEqual([]);
    expect(offered(g, 'Forest', 1)).toEqual([]);
    // The other land keeps both (one Island paid for the spell).
    expect(offered(g, { name: 'Island', nth: 1 }, 1)).toHaveLength(5);
  });

  test('a Lantern that comes after the effect gives the land its ability again (CR 613.7)', () => {
    const g = scenario()
      .seat(0)
      .hand(WIPE, LANTERN)
      .battlefield('Island', 'Island', 'Island', 'Island', 'Forest')
      .build();
    g.act(0).cast(WIPE, { targets: [{ name: 'Forest' }], pay: true });
    g.passAll();
    expect(offered(g, 'Forest', 0)).toEqual([]);
    g.act(0).cast(LANTERN, { pay: true });
    g.passAll();
    // The Forest has lost its own ability for good this turn, but the Lantern is later: the granted
    // ability is the only one it has, so it is the first.
    expect(offered(g, 'Forest', 0)).toHaveLength(5);
  });
});

describe('the granted ability keeps its own restriction (CR 602.5c)', () => {
  test('it makes {B} only while its controller controls a Swamp', () => {
    const none = scenario().seat(0).battlefield(MURK, 'Forest').build();
    expect(offered(none, 'Forest', 1)).toEqual([]);
    const some = scenario().seat(0).battlefield(MURK, 'Swamp', 'Forest').build();
    expect(offered(some, 'Forest', 1)).toEqual(['-']);
    some.act(0).tapForMana('Forest', { ability: 1 });
    some.expect.pool(0, 'B');
  });

  test("it does not change a Swamp's own ability: that is a separate, ungated ability", () => {
    const g = scenario().seat(0).battlefield(MURK, 'Swamp').build();
    expect(offered(g, 'Swamp', 0)).toEqual(['-']);
  });
});

describe('the payment planner and the payMana decision use it', () => {
  test('Plains pays for red through the granted ability', () => {
    const g = scenario().seat(0).hand('Lightning Bolt').battlefield(LANTERN, 'Plains').build();
    g.expect.legal(0, { cast: 'Lightning Bolt' });
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.expect.tapped('Plains');
  });

  test('without the Lantern the same spell is not offered', () => {
    const g = scenario().seat(0).hand('Lightning Bolt').battlefield('Plains').build();
    g.expect.illegal(0, { cast: 'Lightning Bolt' });
  });

  test('the decision lists the granted ability with its colors, and a manual tap names it', () => {
    const g = scenario()
      .seat(0)
      .hand('Unsummon')
      .battlefield(LANTERN, 'Plains')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('Unsummon', { targets: ['Grizzly Bears'] });
    const d = g.state.pending as PayManaDecision;
    const entry = d.manaSources.find((s) => s.object === g.id('Plains') && s.abilityIndex === 1);
    expect(entry?.colors).toEqual(['W', 'U', 'B', 'R', 'G']);
    g.act(0).choose({
      kind: 'payManual',
      taps: [{ object: g.id('Plains'), abilityIndex: 1, color: 'U' }],
    });
    g.expect.stack(['Unsummon']);
  });

  test('"what a land could produce" sees the granted ability', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Orchard')
      .seat(1)
      .battlefield('Forest', LANTERN)
      .build();
    expect(offered(g, 'SYNTHETIC Orchard', 0)).toEqual(['W', 'U', 'B', 'R', 'G']);
  });
});

describe('determinism and legal actions', () => {
  test('the same board gives the same hash and offers, and every offer is accepted', () => {
    const make = () => scenario().seat(0).battlefield(LANTERN, 'Forest', 'Island').seed(3).build();
    const a = make();
    const b = make();
    expect(a.hash()).toBe(b.hash());
    const offers = a.legalActions(0).filter((x) => x.kind === 'activateAbility');
    expect(offers.length).toBeGreaterThan(0);
    for (const action of offers) expect(make().act(0).try.action(action).ok).toBe(true);
  });
});

describe('validation and support', () => {
  const grant = (
    ability: unknown,
    subject: unknown = { kind: 'filter', filter: { types: ['land'] } },
  ) =>
    ({
      kind: 'static',
      static: { kind: 'grantAbility', subject, ability },
    }) as Ability;
  const mana = { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'anyColor' } };

  test('a mana ability for a subject is valid', () => {
    expect(validateAbility(grant(mana))).toEqual([]);
    expect(validateAbility(grant(mana, { kind: 'this' }))).toEqual([]);
  });

  test('a keyword is not granted this way (D-151: a mana, an activated or a triggered ability is)', () => {
    const keyword = { kind: 'keyword', keyword: { kind: 'flying' } };
    expect(
      validateAbility(grant(keyword))
        .map((i) => i.message)
        .join(),
    ).toContain('a mana, an activated or a triggered ability');
    const activated = {
      kind: 'activated',
      cost: [{ kind: 'tap' }],
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
    };
    expect(validateAbility(grant(activated)).length).toBe(0);
    // ... and it is checked like one of the card's own
    expect(
      validateAbility(grant({ ...activated, cost: [{ kind: 'nope' }] })).length,
    ).toBeGreaterThan(0);
  });

  test('the granted ability is checked like any mana ability', () => {
    const bad = { ...mana, production: { kind: 'combination', options: [['R', 'R']] } };
    expect(validateAbility(grant(bad)).length).toBe(1);
    expect(validateAbility(grant(mana, { kind: 'nope' })).length).toBe(1);
  });

  test('the fixtures are valid, supported cards and the feature is declared', () => {
    const g = scenario().seat(0).battlefield(LANTERN, MURK).build();
    for (const name of [LANTERN, MURK]) {
      const def = g.state.definitions.find((d) => d.name === name);
      expect(def && validateCard(def), name).toEqual([]);
    }
    expect(isFeatureSupported('static:grantAbility')).toBe(true);
  });
});
