// Jump Scare! deck (issue 108), group C: conditional statics. The Oracle texts of Arixmethes, Slumbering Isle, Augur of Autumn, Kefnet the Mindful and Kianne, Corrupted Memory under
// SYNTHETIC names, read by the grammar alone and played by the engine.
// Pins: CR 613.1d and 205.1a (layer 4: "it's a land" replaces the card types, so it is not a creature, and the creature types go with it), CR 122.1 (the counters it reads),
// CR 601.3 and 401.5 (a spell cast from the top of the library), CR 207.2c (Coven is an ability word: its text is the ability), CR 208.1 (the powers compared), CR 601.3b and 702.8a (cast as
// though it had flash), CR 508.1a and 509.1a (can't attack or block unless), CR 608.2d (the "may" of a resolving ability).
import { type Action, getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const ARIX = parsed(
  'SYNTHETIC Slumbering Isle',
  'Legendary Creature — Kraken',
  `~ enters tapped with five slumber counters on it.
As long as ~ has a slumber counter on it, it's a land. (It's not a creature.)
Whenever you cast a spell, you may remove a slumber counter from ~.
{T}: Add {G}{U}.`,
  { manaCost: '{4}{G}{U}', power: '12', toughness: '12', colors: ['G', 'U'] },
);
const AUGUR = parsed(
  'SYNTHETIC Autumn Augur',
  'Creature — Human Druid',
  `You may look at the top card of your library any time.
You may play lands from the top of your library.
Coven — As long as you control three or more creatures with different powers, you may cast creature spells from the top of your library.`,
  { manaCost: '{1}{G}', power: '2', toughness: '3', colors: ['G'] },
);
const KEFNET = parsed(
  'SYNTHETIC Mindful God',
  'Legendary Creature — God',
  `Flying, indestructible
~ can't attack or block unless you have seven or more cards in hand.
{3}{U}: Draw a card, then you may return a land you control to its owner's hand.`,
  { manaCost: '{2}{U}', power: '5', toughness: '5', colors: ['U'] },
);
const KIANNE = parsed(
  'SYNTHETIC Odd Memory',
  'Legendary Creature — Illusion',
  `As long as ~'s power is even, you may cast noncreature spells as though they had flash.
As long as ~'s power is odd, you may cast creature spells as though they had flash.
Whenever you draw a card, put a +1/+1 counter on ~.`,
  { manaCost: '{1}{U}', power: '2', toughness: '2', colors: ['U'] },
);
const ONE = parsed('SYNTHETIC Power One', 'Creature — Goblin', '', {
  manaCost: '{R}',
  power: '1',
  toughness: '1',
  colors: ['R'],
});
const THREE = parsed('SYNTHETIC Power Three', 'Creature — Ogre', '', {
  manaCost: '{2}{R}',
  power: '3',
  toughness: '3',
  colors: ['R'],
});
const TWO = parsed('SYNTHETIC Power Two', 'Creature — Elf', '', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
  colors: ['G'],
});
const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 6 }, () => 'Forest');
const SORCERY = 'Divination'; // {2}{U}

const castable = (g: ScenarioGame, seat: number, name: string, zone = 'hand'): boolean => {
  const id = g.id({ name, zone, seat } as never);
  return getLegalActions(g.state, seat).some(
    (a: Action) => a.kind === 'castSpell' && a.object === id,
  );
};

describe('Arixmethes: as long as it has a slumber counter on it, it is a land', () => {
  const game = (counters: Record<string, number>) =>
    scenario()
      .define(ARIX)
      .seat(0)
      .battlefield(ARIX.name, { counters })
      .library('Forest', { count: 4 })
      .seat(1)
      .library('Forest', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();

  test('with slumber counters it is a legendary land and no longer a creature or a Kraken', () => {
    const g = game({ slumber: 5 });
    g.expect.derived(ARIX.name, { types: ['land'], supertypes: ['legendary'], subtypes: [] });
    g.expect.invariants();
  });

  test('with none it is the 12/12 Kraken creature', () => {
    const g = game({});
    g.expect.derived(ARIX.name, { types: ['creature'], subtypes: ['Kraken'] });
    g.expect.pt(ARIX.name, 12, 12);
  });

  test('a counter of another kind does not make it a land', () => {
    const g = game({ '+1/+1': 2 });
    g.expect.derived(ARIX.name, { types: ['creature'] });
  });

  test('removing the last slumber counter turns it back into a creature, one at a time', () => {
    const g = scenario()
      .define(ARIX)
      .seat(0)
      .battlefield(ARIX.name, { counters: { slumber: 2 } })
      .hand(BEARS)
      .battlefield('Forest', { count: 2 })
      .library('Forest', { count: 4 })
      .seat(1)
      .library('Forest', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.expect.counters(ARIX.name, { slumber: 1 });
    g.expect.derived(ARIX.name, { types: ['land'] });
  });

  test('declining the "may" keeps the counters', () => {
    const g = scenario()
      .define(ARIX)
      .seat(0)
      .battlefield(ARIX.name, { counters: { slumber: 1 } })
      .hand(BEARS)
      .battlefield('Forest', { count: 2 })
      .library('Forest', { count: 4 })
      .seat(1)
      .library('Forest', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.counters(ARIX.name, { slumber: 1 });
    g.expect.derived(ARIX.name, { types: ['land'] });
  });

  test('while it is a land it taps for {G}{U} (it can, the turn it enters, as a land)', () => {
    const g = game({ slumber: 1 });
    g.act(0).tapForMana(ARIX.name);
    g.expect.pool(0, { G: 1, U: 1 });
  });
});

describe('Augur of Autumn: Coven lets creature spells be cast from the top of the library', () => {
  const game = (battlefield: readonly string[], top: string) =>
    scenario()
      .define(AUGUR)
      .define(ONE)
      .define(TWO)
      .define(THREE)
      .seat(0)
      .battlefield(AUGUR.name, ...battlefield, 'Forest', 'Forest', 'Island', 'Island')
      .library(top, ...FILLER)
      .seat(1)
      .library('Forest', { count: 6 })
      .at('precombatMain', { active: 0 })
      .build();

  test('three creatures with different powers: the creature on top may be cast, and it resolves', () => {
    const g = game([ONE.name, THREE.name], BEARS);
    expect(castable(g, 0, BEARS, 'library')).toBe(true);
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('two of the three have the same power: not three different powers, so it may not', () => {
    const g = game([ONE.name, TWO.name], BEARS); // powers 2, 1, 2
    expect(castable(g, 0, BEARS, 'library')).toBe(false);
  });

  test('only the Augur and one more creature: not enough', () => {
    const g = game([ONE.name], BEARS);
    expect(castable(g, 0, BEARS, 'library')).toBe(false);
  });

  test('creature spells only: a noncreature spell on top is not offered', () => {
    const g = game([ONE.name, THREE.name], SORCERY);
    expect(castable(g, 0, SORCERY, 'library')).toBe(false);
  });

  test("the opponent's creatures do not count", () => {
    const g = scenario()
      .define(AUGUR)
      .define(ONE)
      .define(THREE)
      .seat(0)
      .battlefield(AUGUR.name, 'Forest', 'Forest')
      .library(BEARS, ...FILLER)
      .seat(1)
      .battlefield(ONE.name, THREE.name)
      .library('Forest', { count: 6 })
      .at('precombatMain', { active: 0 })
      .build();
    expect(castable(g, 0, BEARS, 'library')).toBe(false);
  });

  test('a land on top may always be played from the top, Coven or not', () => {
    const g = game([], 'Forest');
    const id = g.id({ name: 'Forest', zone: 'library', seat: 0, nth: 0 } as never);
    expect(
      getLegalActions(g.state, 0).some((a: Action) => a.kind === 'playLand' && a.object === id),
    ).toBe(true);
  });
});

describe("Kefnet: can't attack or block unless you have seven or more cards in hand", () => {
  const atAttackers = (handSize: number) => {
    const b = scenario()
      .define(KEFNET)
      .seat(0)
      .battlefield(KEFNET.name)
      .library('Island', { count: 4 });
    for (let i = 0; i < handSize; i++) b.hand('Island');
    const g = b.seat(1).library('Island', { count: 4 }).at('precombatMain', { active: 0 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    return g;
  };

  test('with seven cards in hand it attacks', () => {
    atAttackers(7).expect.canAttack(KEFNET.name, true);
  });

  test('with six it can not be declared as an attacker', () => {
    atAttackers(6).expect.canAttack(KEFNET.name, false);
  });

  test('with eight it attacks', () => {
    atAttackers(8).expect.canAttack(KEFNET.name, true);
  });

  test('it can not block with six cards in hand, and can with seven', () => {
    for (const [hand, can] of [
      [6, false],
      [7, true],
    ] as const) {
      const b = scenario().define(KEFNET).define(ONE).seat(0).battlefield(ONE.name);
      b.library('Island', { count: 4 });
      b.seat(1).battlefield(KEFNET.name).library('Island', { count: 4 });
      for (let i = 0; i < hand; i++) b.hand('Island');
      const g = b.at('precombatMain', { active: 0 }).build();
      g.advanceTo('declareAttackers');
      g.act(0).attack([ONE.name]);
      g.advanceTo('declareBlockers');
      // With nothing able to block, the step goes on to priority; with a blocker the opponent is asked to declare blockers.
      expect(g.state.pending?.kind === 'declareBlockers', `${hand} cards in hand`).toBe(can);
    }
  });

  test('the activated ability draws a card, and then the land may be returned to its owner hand', () => {
    const g = scenario()
      .define(KEFNET)
      .seat(0)
      .battlefield(KEFNET.name, 'Island', 'Island', 'Island', 'Island')
      .library('Forest', { count: 6 })
      .seat(1)
      .library('Forest', { count: 6 })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(KEFNET.name, { pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
    g.act(0).accept();
    g.act(0).choosePermanents('Island[0]');
    g.expect.handSize(0, 2);
  });
});

describe('Kianne: cast spells as though they had flash by the parity of its power', () => {
  const game = (counters: Record<string, number>) =>
    scenario()
      .define(KIANNE)
      .seat(0)
      .battlefield(KIANNE.name, { counters })
      .battlefield('Forest', { count: 2 })
      .battlefield('Island', { count: 2 })
      .hand(BEARS, SORCERY)
      .library('Forest', { count: 6 })
      .seat(1)
      .library('Forest', { count: 6 })
      .at('upkeep', { active: 1, priority: 0 })
      .build();

  test('power 2 is even: the noncreature spell has flash, the creature spell has not', () => {
    const g = game({});
    g.expect.pt(KIANNE.name, 2, 2);
    expect(castable(g, 0, SORCERY)).toBe(true);
    expect(castable(g, 0, BEARS)).toBe(false);
  });

  test('power 3 is odd: the creature spell has flash, the noncreature spell has not', () => {
    const g = game({ '+1/+1': 1 });
    g.expect.pt(KIANNE.name, 3, 3);
    expect(castable(g, 0, BEARS)).toBe(true);
    expect(castable(g, 0, SORCERY)).toBe(false);
  });

  test('power 4 is even again', () => {
    const g = game({ '+1/+1': 2 });
    expect(castable(g, 0, SORCERY)).toBe(true);
    expect(castable(g, 0, BEARS)).toBe(false);
  });

  test('on its own turn in a main phase both are castable whatever the power', () => {
    const g = scenario()
      .define(KIANNE)
      .seat(0)
      .battlefield(KIANNE.name, 'Forest', 'Forest', 'Island', 'Island')
      .hand(BEARS, SORCERY)
      .library('Forest', { count: 6 })
      .seat(1)
      .library('Forest', { count: 6 })
      .at('precombatMain', { active: 0 })
      .build();
    expect(castable(g, 0, SORCERY)).toBe(true);
    expect(castable(g, 0, BEARS)).toBe(true);
  });

  test('the permission is the controller only: the opponent gets none', () => {
    const g = scenario()
      .define(KIANNE)
      .seat(0)
      .battlefield(KIANNE.name)
      .library('Forest', { count: 6 })
      .seat(1)
      .hand(SORCERY)
      .battlefield('Island', 'Island', 'Island')
      .library('Forest', { count: 6 })
      .at('upkeep', { active: 0, priority: 1 })
      .build();
    expect(castable(g, 1, SORCERY)).toBe(false);
  });
});
