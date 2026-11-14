// Parsed text is only worth something if the engine runs it as written (stage P14). These tests
// import SYNTHETIC cards through the grammar (never through a fixture), define them in an engine
// scenario and play them through applyAction: the mana lines of the engine's "more mana production"
// slice (D-099, D-102): a production that reads the lands ("could produce"), the filter land's
// choice among combinations with a hybrid symbol in its cost, "Activate only if" on a mana ability
// and on an ordinary activated ability, a payment of life, and a static ability that gives a mana
// ability. Every card name starts with "SYNTHETIC"; the Oracle text is the real line of the shape in
// reports/template-replay.md, or marked SYNTHETIC where no real line has the shape. No real card's
// text is claimed; the real cards used as lands, spells and creatures (Forest, Mountain, Wall of
// Stone, Grizzly Bears, Sol Ring) are the engine's own fixtures. What is checked is what the
// lowering produces against what the rules say (CR 106.7, 107.4e, 119.4, 602.5b, 605.3, 613.1f),
// through the same path as a real game: the legal-action list, the payment and the pool.
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const land = (name: string, text: string) => parsed(name, 'Land', text);

/** The colors (or '-' for none) a card's ability of that index is offered for, seat 0. */
function offered(g: ScenarioGame, name: string, abilityIndex: number, nth = 0): string[] {
  const id = g.id({ name, seat: 0, nth });
  return g
    .legalActions(0)
    .flatMap((a) =>
      a.kind === 'activateAbility' && a.source === id && a.abilityIndex === abilityIndex
        ? [a.combination ? a.combination.join('') : (a.color ?? '-')]
        : [],
    );
}

describe('"{T}: Add one mana of any color that a land an opponent controls could produce." (CR 106.7)', () => {
  const orchard = () =>
    land(
      'SYNTHETIC Parsed Orchard',
      '{T}: Add one mana of any color that a land an opponent controls could produce.',
    );

  test('an opponent with Islands and a Swamp: blue or black, and the tap adds the chosen one', () => {
    const def = orchard();
    const g = scenario()
      .define(def)
      .seat(0)
      .battlefield(def.name, 'Forest')
      .seat(1)
      .battlefield('Island', 'Island', 'Swamp')
      .build();
    expect(offered(g, def.name, 0)).toEqual(['U', 'B']);
    g.expect.illegal(0, { tap: def.name, color: 'G' });
    g.act(0).tapForMana(def.name, { color: 'B' });
    g.expect.pool(0, 'B');
    g.expect.tapped(def.name);
    g.expect.stack([]);
  });

  test('my own lands do not count, and with no opponent land it makes nothing and is not offered', () => {
    const def = orchard();
    const g = scenario()
      .define(def)
      .seat(0)
      .battlefield(def.name, 'Forest', 'Mountain')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    expect(offered(g, def.name, 0)).toEqual([]);
    expect(g.act(0).try.tapForMana(def.name).ok).toBe(false);
    g.expect.tapped(def.name, false);
  });
});

describe('"{T}: Add one mana of any type that a land you control could produce." (CR 106.1b, 106.7)', () => {
  test('"any type" keeps colorless and counts my own lands, in the order W, U, B, R, G, C', () => {
    const pool = land(
      'SYNTHETIC Parsed Pool',
      '{T}: Add one mana of any type that a land you control could produce.',
    );
    const waste = land('SYNTHETIC Parsed Waste', '{T}: Add {C}.');
    const g = scenario()
      .define(pool)
      .define(waste)
      .seat(0)
      .hand('Mountain')
      .battlefield(pool.name, waste.name, 'Forest')
      .seat(1)
      .battlefield('Island')
      .build();
    expect(offered(g, pool.name, 0)).toEqual(['G', 'C']);
    g.act(0).tapForMana(pool.name, { color: 'C' });
    g.expect.pool(0, 'C');
    // It is read when the ability is activated: a land that enters changes what it makes.
    const h = scenario()
      .define(pool)
      .seat(0)
      .hand('Mountain')
      .battlefield(pool.name, 'Forest')
      .build();
    expect(offered(h, pool.name, 0)).toEqual(['G']);
    h.act(0).playLand('Mountain');
    expect(offered(h, pool.name, 0)).toEqual(['R', 'G']);
  });
});

describe('"{R/W}, {T}: Add {R}{R}, {R}{W}, or {W}{W}." (a filter land, CR 605.3b, 107.4e)', () => {
  const filter = () =>
    land('SYNTHETIC Parsed Filter', '{T}: Add {C}.\n{R/W}, {T}: Add {R}{R}, {R}{W}, or {W}{W}.');

  test('the hybrid cost is paid from the pool and the chosen combination is added, with no stack', () => {
    const def = filter();
    expect(def.faces[0]?.abilities).toHaveLength(2);
    const g = scenario().define(def).seat(0).battlefield(def.name, 'Mountain').build();
    expect(offered(g, def.name, 1)).toEqual([]);
    g.act(0).tapForMana('Mountain');
    // The combinations are stored in the order W, U, B, R, G, C: {R}{W} is "WR".
    expect(offered(g, def.name, 1)).toEqual(['RR', 'WR', 'WW']);
    g.act(0).tapForMana(def.name, { ability: 1, combination: 'RW' });
    g.expect.pool(0, 'RW');
    g.expect.tapped(def.name);
    g.expect.stack([]);
  });

  test('the first ability is a plain {C} one: the card has two mana abilities', () => {
    const def = filter();
    const g = scenario().define(def).seat(0).battlefield(def.name).build();
    expect(offered(g, def.name, 0)).toEqual(['-']);
    g.act(0).tapForMana(def.name);
    g.expect.pool(0, 'C');
  });

  test('{G} does not pay the hybrid symbol: the filter is not offered', () => {
    const def = filter();
    const g = scenario().define(def).seat(0).battlefield(def.name, 'Forest').build();
    g.act(0).tapForMana('Forest');
    expect(offered(g, def.name, 1)).toEqual([]);
  });

  test('the payment planner uses it: {1}{R}{R} from a Mountain, a Forest and the filter', () => {
    const def = filter();
    const g = scenario()
      .define(def)
      .seat(0)
      .hand('Wall of Stone')
      .battlefield(def.name, 'Mountain', 'Forest')
      .build();
    g.act(0).cast('Wall of Stone', { pay: true });
    g.expect.stack(['Wall of Stone']);
    g.expect.tapped(def.name);
    g.expect.tapped('Mountain');
    g.expect.tapped('Forest');
  });

  test('"{2/G}, {T}: Add {G}{W}." has a fixed production and a hybrid symbol of its own', () => {
    const def = land('SYNTHETIC Parsed Twist', '{2/G}, {T}: Add {G}{W}.');
    const g = scenario().define(def).seat(0).battlefield(def.name, 'Forest').build();
    g.act(0).tapForMana('Forest');
    g.act(0).tapForMana(def.name);
    g.expect.pool(0, 'WG');
  });
});

describe('"Activate only if you control five or more lands." (CR 602.5b)', () => {
  const temple = () =>
    land(
      'SYNTHETIC Parsed Temple',
      '{T}: Add {C}{C}. Activate only if you control five or more lands.',
    );

  test('with four lands, itself included, it is not offered; with five it makes {C}{C}', () => {
    const def = temple();
    const four = scenario().define(def).seat(0).battlefield(def.name, 'Forest', 'Forest', 'Forest');
    const g4 = four.build();
    expect(offered(g4, def.name, 0)).toEqual([]);
    const r = g4.act(0).try.tapForMana(def.name);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('only if its condition holds');
    const g5 = scenario()
      .define(def)
      .seat(0)
      .battlefield(def.name, 'Forest', 'Forest', 'Forest', 'Forest')
      .build();
    g5.act(0).tapForMana(def.name);
    g5.expect.pool(0, 'CC');
  });

  test('the opponent lands are not counted', () => {
    const def = temple();
    const g = scenario()
      .define(def)
      .seat(0)
      .battlefield(def.name, 'Forest', 'Forest', 'Forest')
      .seat(1)
      .battlefield('Island', 'Island')
      .build();
    expect(offered(g, def.name, 0)).toEqual([]);
  });
});

describe('"Activate only if you control a Swamp." (a land type, CR 205.3i, 305.6)', () => {
  const tainted = () =>
    land(
      'SYNTHETIC Parsed Tainted',
      '{T}: Add {C}.\n{T}: Add {B} or {G}. Activate only if you control a Swamp.',
    );

  test('the colorless ability stays; the colored one needs a Swamp of mine', () => {
    const def = tainted();
    const without = scenario().define(def).seat(0).battlefield(def.name, 'Forest').build();
    expect(offered(without, def.name, 0)).toEqual(['-']);
    expect(offered(without, def.name, 1)).toEqual([]);
    const withSwamp = scenario().define(def).seat(0).battlefield(def.name, 'Swamp').build();
    expect(offered(withSwamp, def.name, 1)).toEqual(['B', 'G']);
    withSwamp.act(0).tapForMana(def.name, { ability: 1, color: 'G' });
    withSwamp.expect.pool(0, 'G');
    const theirs = scenario()
      .define(def)
      .seat(0)
      .battlefield(def.name)
      .seat(1)
      .battlefield('Swamp')
      .build();
    expect(offered(theirs, def.name, 1)).toEqual([]);
  });

  test('"a Swamp or a Mountain" is either: the condition is an `or`', () => {
    const def = land(
      'SYNTHETIC Parsed Either',
      '{T}: Add {R}. Activate only if you control a Swamp or a Mountain.',
    );
    const mountain = scenario().define(def).seat(0).battlefield(def.name, 'Mountain').build();
    expect(offered(mountain, def.name, 0)).toEqual(['-']);
    const forest = scenario().define(def).seat(0).battlefield(def.name, 'Forest').build();
    expect(offered(forest, def.name, 0)).toEqual([]);
  });
});

describe('"Activate only if" on an activated ability that is not a mana ability', () => {
  test('"{T}: Draw a card. Activate only if you control three or more artifacts." is listed and refused by the count', () => {
    const def = parsed(
      'SYNTHETIC Parsed Library',
      'Artifact',
      '{T}: Draw a card. Activate only if you control three or more artifacts.',
      { manaCost: '{2}' },
    );
    const no = scenario()
      .define(def)
      .seat(0)
      .battlefield(def.name, 'Sol Ring')
      .library('Forest', 'Forest')
      .build();
    expect(no.act(0).try.activate(def.name).ok).toBe(false);
    const yes = scenario()
      .define(def)
      .seat(0)
      .battlefield(def.name, 'Sol Ring', 'Sol Ring')
      .library('Forest', 'Forest')
      .build();
    yes.act(0).activate(def.name);
    yes.passAll();
    yes.expect.handSize(0, 1);
  });
});

describe('"{T}, Pay 1 life: Add one mana of any color." (CR 119.4)', () => {
  const confluence = () =>
    land('SYNTHETIC Parsed Confluence', '{T}, Pay 1 life: Add one mana of any color.');

  test('it taps, pays 1 life and adds the chosen color, with no stack', () => {
    const def = confluence();
    const g = scenario().define(def).seat(0).battlefield(def.name).build();
    const before = g.mark();
    g.act(0).tapForMana(def.name, { color: 'R' });
    g.expect.pool(0, 'R');
    g.expect.life(0, 39);
    g.expect.stack([]);
    g.expect.noEvent({ kind: 'priorityPassed' }, { since: before });
  });

  test('"Pay 1 life: Add {U} or {R}" lists exactly the two colors', () => {
    const def = land('SYNTHETIC Parsed Horizon', '{T}, Pay 1 life: Add {U} or {R}.');
    const g = scenario().define(def).seat(0).battlefield(def.name).build();
    expect(offered(g, def.name, 0)).toEqual(['U', 'R']);
  });

  test('at 1 life it is still offered (CR 119.4), and "Activate only if you control an artifact" follows the board', () => {
    const def = land(
      'SYNTHETIC Parsed Vault',
      '{T}, Pay 1 life: Add one mana of any color. Activate only if you control an artifact.',
    );
    const without = scenario().define(def).seat(0).life(1).battlefield(def.name).build();
    expect(offered(without, def.name, 0)).toEqual([]);
    const g = scenario().define(def).seat(0).life(1).battlefield(def.name, 'Sol Ring').build();
    expect(offered(g, def.name, 0)).toEqual(['W', 'U', 'B', 'R', 'G']);
    g.act(0).tapForMana(def.name, { color: 'U' });
    g.expect.life(0, 0);
    g.expect.hasLost(0);
  });
});

describe('"Lands you control have "{T}: Add one mana of any color."" (CR 613.1f)', () => {
  const lantern = () =>
    parsed(
      'SYNTHETIC Parsed Lantern',
      'Artifact',
      '{T}: Add one mana of any color.\nLands you control have "{T}: Add one mana of any color."',
      { manaCost: '{3}' },
    );

  test('a Forest gets a second mana ability for any color, only mine, only lands', () => {
    const def = lantern();
    const g = scenario()
      .define(def)
      .seat(0)
      .battlefield(def.name, 'Forest', 'Sol Ring')
      .seat(1)
      .battlefield('Island')
      .build();
    expect(offered(g, 'Forest', 0)).toEqual(['-']);
    expect(offered(g, 'Forest', 1)).toEqual(['W', 'U', 'B', 'R', 'G']);
    expect(offered(g, 'Sol Ring', 1)).toEqual([]);
    expect(offered(g, def.name, 1)).toEqual([]);
    g.act(0).tapForMana('Forest', { ability: 1, color: 'R' });
    g.expect.pool(0, 'R');
  });

  test('the planner pays for red with a Plains through the granted ability', () => {
    const def = lantern();
    const g = scenario()
      .define(def)
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield(def.name, 'Plains')
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.expect.stack(['Lightning Bolt']);
    g.expect.tapped('Plains');
  });

  test('Creatures you control: a creature that has been under my control gives the mana, a new one cannot (CR 302.6)', () => {
    const def = parsed(
      'SYNTHETIC Parsed Creature Lens',
      'Enchantment',
      'Creatures you control have "{T}: Add one mana of any color."',
      { manaCost: '{1}{G}' },
    );
    const g = scenario()
      .define(def)
      .seat(0)
      .hand('Grizzly Bears')
      .battlefield(def.name, 'Llanowar Elves', 'Forest', 'Forest')
      .build();
    expect(offered(g, 'Llanowar Elves', 1)).toEqual(['W', 'U', 'B', 'R', 'G']);
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    // It came under my control this turn: its {T} ability cannot be activated.
    expect(offered(g, 'Grizzly Bears', 0)).toEqual([]);
  });

  test('Equipped creature has "{T}: Add {G}." is the attached permanent, not every creature', () => {
    const def = parsed(
      'SYNTHETIC Parsed Staff',
      'Artifact — Equipment',
      'Equipped creature has "{T}: Add {G}."\nEquip {1}',
      { manaCost: '{1}' },
    );
    const g = scenario()
      .define(def)
      .seat(0)
      .battlefield(def.name, 'Grizzly Bears', 'Forest', 'Forest')
      .build();
    expect(offered(g, 'Grizzly Bears', 0)).toEqual([]);
    g.act(0).activate(def.name, { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    expect(offered(g, 'Grizzly Bears', 0)).toEqual(['-']);
  });
});
