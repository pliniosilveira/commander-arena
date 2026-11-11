// "{T}: Add one mana of any color that a land an opponent controls could produce." (D-099).
// Pins: CR 106.7 (the type of mana a permanent could produce is what an ability of it would produce
// if it resolved at that time; costs are ignored; no type means no mana; the Exotic Orchard example:
// two Orchards alone make nothing, an Orchard facing a Forest and the other Orchard makes {G}),
// CR 106.1a and 106.1b ("any color" is the five colors, "any type" includes colorless), CR 605.3b
// (the type is chosen as the ability resolves), CR 613.1f (what a land has now is what it could
// produce), CR 602.5b (a restriction on activating is not a cost of the mana: it is ignored).
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-mana-plus.ts) or the real fixtures named.
import { describe, expect, test } from 'vitest';
import type { Ability, ManaColor } from '../src/index';
import { validateAbility, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const ORCHARD = 'SYNTHETIC Orchard';
const ROCK = 'SYNTHETIC Fellwar Rock';
const POND = 'SYNTHETIC Reflecting Pond';
const TEMPLE = 'SYNTHETIC Temple';

const offeredColors = (
  g: ReturnType<ReturnType<typeof scenario>['build']>,
  seat: 0 | 1,
  name: string,
  nth = 0,
): ManaColor[] => {
  const id = g.id({ name, seat, nth });
  return g
    .legalActions(seat)
    .flatMap((a) => (a.kind === 'activateAbility' && a.source === id ? [a.color] : []))
    .filter((c): c is ManaColor => c !== null);
};

describe('one mana of a color an opponent land could produce (CR 106.7)', () => {
  test('an opponent with only Islands and Swamps: blue or black, nothing else', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ORCHARD)
      .seat(1)
      .battlefield('Island', 'Island', 'Swamp')
      .build();
    expect(offeredColors(g, 0, ORCHARD)).toEqual(['U', 'B']);
    for (const color of ['W', 'R', 'G', 'C'] as const) {
      g.expect.illegal(0, { tap: ORCHARD, color });
    }
    g.act(0).tapForMana(ORCHARD, { color: 'B' });
    g.expect.pool(0, 'B');
    g.expect.tapped(ORCHARD);
    g.expect.stack([]);
  });

  test('a refused color names the colors it could make', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ORCHARD)
      .seat(1)
      .battlefield('Island', 'Swamp')
      .build();
    const r = g.act(0).try.tapForMana(ORCHARD, { color: 'R' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('cannot make R mana');
      expect(r.error).toContain('U, B');
    }
    g.expect.tapped(ORCHARD, false);
  });

  test('a single type is made without a question', () => {
    const g = scenario().seat(0).battlefield(ORCHARD).seat(1).battlefield('Island').build();
    expect(offeredColors(g, 0, ORCHARD)).toEqual(['U']);
    g.act(0).tapForMana(ORCHARD);
    g.expect.pool(0, 'U');
  });

  test('the opponent controls no lands: no mana, and the ability is not offered', () => {
    const g = scenario().seat(0).battlefield(ORCHARD).seat(1).battlefield('Grizzly Bears').build();
    expect(offeredColors(g, 0, ORCHARD)).toEqual([]);
    const r = g.act(0).try.tapForMana(ORCHARD);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('makes no mana');
    g.expect.tapped(ORCHARD, false);
    g.expect.pool(0, '');
  });

  test('only the opponent lands count, not mine', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ORCHARD, 'Forest', 'Mountain')
      .seat(1)
      .battlefield('Plains')
      .build();
    expect(offeredColors(g, 0, ORCHARD)).toEqual(['W']);
  });

  test('colorless is not a color: a land that makes only {C} adds nothing to "any color"', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ORCHARD)
      .seat(1)
      .battlefield(TEMPLE, 'Island', 'Island', 'Island', 'Island')
      .build();
    expect(offeredColors(g, 0, ORCHARD)).toEqual(['U']);
    // Only colorless lands: no color to name, so no mana at all.
    const only = scenario().seat(0).battlefield(ORCHARD).seat(1).battlefield(TEMPLE).build();
    expect(offeredColors(only, 0, ORCHARD)).toEqual([]);
  });

  test('a land that makes several colors gives every one of them', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ORCHARD)
      .seat(1)
      .battlefield('SYNTHETIC Tri Land', 'Mountain')
      .build();
    expect(offeredColors(g, 0, ORCHARD)).toEqual(['W', 'U', 'B', 'R']);
  });

  test('a filter land could produce its combinations: each color of them, and colorless', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ORCHARD)
      .seat(1)
      .battlefield('SYNTHETIC Filter Land')
      .build();
    // {C} for free, and {R}{R}, {R}{W}, {W}{W}: red and white, though the filter costs mana.
    expect(offeredColors(g, 0, ORCHARD)).toEqual(['W', 'R']);
  });

  test('the types come in the order white, blue, black, red, green', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ORCHARD)
      .seat(1)
      .battlefield('Forest', 'Swamp', 'Plains', 'Mountain', 'Island')
      .build();
    expect(offeredColors(g, 0, ORCHARD)).toEqual(['W', 'U', 'B', 'R', 'G']);
  });
});

describe('costs and state do not matter, only what the ability would make (CR 106.7)', () => {
  test('a tapped land counts', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ORCHARD)
      .seat(1)
      .battlefield('Mountain', { tapped: true })
      .build();
    expect(offeredColors(g, 0, ORCHARD)).toEqual(['R']);
  });

  test('a land whose ability costs mana or life counts', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ORCHARD)
      .seat(1)
      .battlefield('SYNTHETIC Confluence')
      .build();
    expect(offeredColors(g, 0, ORCHARD)).toEqual(['W', 'U', 'B', 'R', 'G']);
  });

  test('a land with an unmet "Activate only if" counts: a restriction is not a cost of the mana', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ORCHARD)
      .seat(1)
      .battlefield('SYNTHETIC Tainted Land')
      .build();
    // The opponent has no Swamp, so the Tainted Land cannot be tapped for {B} or {G} now, but it could.
    expect(offeredColors(g, 0, ORCHARD)).toEqual(['B', 'G']);
  });
});

describe('what a land could produce changes with the board (CR 106.7, 613.1f)', () => {
  test('a land that enters under the opponent adds its color', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ORCHARD)
      .seat(1)
      .hand('Forest')
      .battlefield('Island')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).playLand('Forest');
    g.act(1).pass();
    expect(offeredColors(g, 0, ORCHARD)).toEqual(['U', 'G']);
  });

  test('a land that loses all abilities takes its color away', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Land Wipe')
      .battlefield('Island', ORCHARD)
      .seat(1)
      .battlefield('Island', 'Mountain')
      .build();
    expect(offeredColors(g, 0, ORCHARD)).toEqual(['U', 'R']);
    g.act(0).cast('SYNTHETIC Land Wipe', { targets: [{ name: 'Mountain' }], pay: true });
    g.passAll();
    expect(offeredColors(g, 0, ORCHARD)).toEqual(['U']);
  });

  test('a land that leaves takes its color away, and the ability is no longer offered at all', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Land Wipe')
      .battlefield('Island', ORCHARD)
      .seat(1)
      .battlefield('Mountain')
      .build();
    expect(offeredColors(g, 0, ORCHARD)).toEqual(['R']);
    g.act(0).cast('SYNTHETIC Land Wipe', { targets: [{ name: 'Mountain' }], pay: true });
    g.passAll();
    expect(offeredColors(g, 0, ORCHARD)).toEqual([]);
    expect(g.act(0).try.tapForMana(ORCHARD).ok).toBe(false);
  });

  test('a land granted a mana ability by a Lantern is looked at with it', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ORCHARD)
      .seat(1)
      .battlefield('Island', 'SYNTHETIC Prism Lantern')
      .build();
    // The Lantern gives the opponent's lands "{T}: Add one mana of any color": every color.
    expect(offeredColors(g, 0, ORCHARD)).toEqual(['W', 'U', 'B', 'R', 'G']);
  });
});

describe('two "could produce" abilities look at each other (the example of CR 106.7)', () => {
  test('two Orchards and no other land: neither makes mana', () => {
    const g = scenario().seat(0).battlefield(ORCHARD).seat(1).battlefield(ORCHARD).build();
    expect(offeredColors(g, 0, ORCHARD)).toEqual([]);
    expect(offeredColors(g, 1, ORCHARD)).toEqual([]);
    g.expect.illegal(0, { tap: ORCHARD });
  });

  test('an Orchard facing a Forest and the other Orchard: each could produce {G}', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ORCHARD, 'Forest')
      .seat(1)
      .battlefield(ORCHARD)
      .build();
    // Mine looks at the opponent's Orchard, which looks at my Forest; theirs looks at mine, and so on.
    expect(offeredColors(g, 0, ORCHARD)).toEqual(['G']);
    g.act(0).tapForMana(ORCHARD);
    g.expect.pool(0, 'G');
  });

  test('a chain: a Pond that sees only an Orchard, which sees only the opponent Island, makes blue', () => {
    const g = scenario().seat(0).battlefield(POND, ORCHARD).seat(1).battlefield('Island').build();
    expect(offeredColors(g, 0, ORCHARD)).toEqual(['U']);
    expect(offeredColors(g, 0, POND)).toEqual(['U']);
  });

  test('Fellwar Rock is not a land: an Orchard does not look at it', () => {
    const g = scenario().seat(0).battlefield(ORCHARD).seat(1).battlefield(ROCK).build();
    expect(offeredColors(g, 0, ORCHARD)).toEqual([]);
  });

  test('the Rock itself makes the colors of the opponent lands', () => {
    const g = scenario().seat(0).battlefield(ROCK).seat(1).battlefield('Forest', 'Plains').build();
    expect(offeredColors(g, 0, ROCK)).toEqual(['W', 'G']);
  });
});

describe('"any type that a land you control could produce" includes colorless (CR 106.1b)', () => {
  test('lands I control: their colors and colorless; itself adds nothing', () => {
    const g = scenario().seat(0).battlefield(POND, 'Forest', TEMPLE).build();
    expect(offeredColors(g, 0, POND)).toEqual(['G', 'C']);
  });

  test('alone it makes nothing', () => {
    const g = scenario().seat(0).battlefield(POND).build();
    expect(offeredColors(g, 0, POND)).toEqual([]);
  });

  test('two of them with nothing else make nothing; with a Mountain both make red', () => {
    const none = scenario().seat(0).battlefield(POND, POND).build();
    expect(offeredColors(none, 0, POND, 0)).toEqual([]);
    expect(offeredColors(none, 0, POND, 1)).toEqual([]);
    const some = scenario().seat(0).battlefield(POND, POND, 'Mountain').build();
    expect(offeredColors(some, 0, POND, 0)).toEqual(['R']);
    expect(offeredColors(some, 0, POND, 1)).toEqual(['R']);
  });

  test('a land played now adds its colors', () => {
    const g = scenario().seat(0).hand('Swamp').battlefield(POND, 'Island').build();
    expect(offeredColors(g, 0, POND)).toEqual(['U']);
    g.act(0).playLand('Swamp');
    expect(offeredColors(g, 0, POND)).toEqual(['U', 'B']);
  });
});

describe('payment: the planner and legal actions use the source with what it makes now', () => {
  test('an opponent with Mountains lets the Orchard pay for a red spell', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield(ORCHARD)
      .seat(1)
      .battlefield('Mountain')
      .build();
    g.expect.legal(0, { cast: 'Lightning Bolt' });
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.expect.tapped(ORCHARD);
  });

  test('it cannot pay for a color the opponent lands cannot make', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield(ORCHARD)
      .seat(1)
      .battlefield('Island')
      .build();
    g.expect.illegal(0, { cast: 'Lightning Bolt' });
  });

  test('with no opponent land it is not a source at all', () => {
    const g = scenario()
      .seat(0)
      .hand('Grizzly Bears')
      .battlefield(ORCHARD, 'Forest')
      .seat(1)
      .build();
    g.expect.illegal(0, { cast: 'Grizzly Bears' });
  });

  test('the payMana decision lists the colors it can make', () => {
    const g = scenario()
      .seat(0)
      .hand('Unsummon')
      .battlefield(ORCHARD)
      .seat(1)
      .battlefield('Island', 'Forest', 'Grizzly Bears')
      .build();
    g.act(0).cast('Unsummon', { targets: ['Grizzly Bears'] });
    const d = g.state.pending;
    expect(d?.kind).toBe('payMana');
    if (d?.kind === 'payMana') {
      expect(d.manaSources.find((s) => s.object === g.id(ORCHARD))?.colors).toEqual(['U', 'G']);
    }
    g.act(0).choose({
      kind: 'payManual',
      taps: [{ object: g.id(ORCHARD), abilityIndex: 0, color: 'U' }],
    });
    g.expect.stack(['Unsummon']);
  });

  test('a manual tap must name a color it could make', () => {
    const g = scenario()
      .seat(0)
      .hand('Unsummon')
      .battlefield(ORCHARD)
      .seat(1)
      .battlefield('Island', 'Forest', 'Grizzly Bears')
      .build();
    g.act(0).cast('Unsummon', { targets: ['Grizzly Bears'] });
    const bad = g.act(0).try.action({
      kind: 'payManual',
      taps: [{ object: g.id(ORCHARD), abilityIndex: 0, color: 'R' }],
    });
    expect(bad.ok).toBe(false);
    g.expect.tapped(ORCHARD, false);
  });
});

describe('legal actions agree with applyAction', () => {
  test('every activation on offer is accepted and nothing else is', () => {
    const board = () =>
      scenario()
        .seat(0)
        .battlefield(ORCHARD, POND, 'Forest')
        .seat(1)
        .battlefield('Island', 'Swamp', ORCHARD)
        .build();
    const probe = board();
    const offered = probe
      .legalActions(0)
      .filter((a) => a.kind === 'activateAbility')
      .map((a) => JSON.stringify(a));
    expect(offered.length).toBeGreaterThan(0);
    for (const json of offered) {
      const g = board();
      const r = g.act(0).try.action(JSON.parse(json));
      expect(r.ok, json).toBe(true);
    }
    for (const color of ['W', 'U', 'B', 'R', 'G', 'C'] as const) {
      const g = board();
      const action = {
        kind: 'activateAbility' as const,
        source: g.id({ name: ORCHARD, seat: 0 }),
        abilityIndex: 0,
        color,
      };
      const listed = g.legalActions(0).some((a) => JSON.stringify(a) === JSON.stringify(action));
      expect(g.act(0).try.action(action).ok, color).toBe(listed);
    }
  });
});

describe('determinism', () => {
  test('the same board gives the same offers and the same hash', () => {
    const make = () =>
      scenario()
        .seat(0)
        .battlefield(ORCHARD, ROCK)
        .seat(1)
        .battlefield('Island', 'Mountain', 'Swamp')
        .seed(7)
        .build();
    const a = make();
    const b = make();
    expect(JSON.stringify(a.legalActions(0))).toBe(JSON.stringify(b.legalActions(0)));
    a.act(0).tapForMana(ORCHARD, { color: 'R' });
    b.act(0).tapForMana(ORCHARD, { color: 'R' });
    expect(a.hash()).toBe(b.hash());
  });
});

describe('validation and support', () => {
  const orchard = (production: unknown): Ability =>
    ({ kind: 'mana', cost: [{ kind: 'tap' }], production }) as Ability;

  test('the fixture cards are valid, supported cards', () => {
    const g = scenario().seat(0).battlefield(ORCHARD, ROCK, POND).build();
    for (const name of [ORCHARD, ROCK, POND]) {
      const def = g.state.definitions.find((d) => d.name === name);
      expect(def && validateCard(def), name).toEqual([]);
    }
  });

  test('a filter for the permanents is required and must describe the battlefield', () => {
    expect(
      validateAbility(
        orchard({ kind: 'couldProduce', lands: { types: ['land'], controller: 'opponent' } }),
      ),
    ).toEqual([]);
    expect(validateAbility(orchard({ kind: 'couldProduce' })).map((i) => i.path)).toEqual([
      'ability.production.lands',
    ]);
    expect(
      validateAbility(orchard({ kind: 'couldProduce', lands: { zone: 'graveyard' } })).length,
    ).toBeGreaterThan(0);
    expect(
      validateAbility(orchard({ kind: 'couldProduce', lands: {}, anyType: 'yes' })).length,
    ).toBeGreaterThan(0);
  });
});
