// Parsed text is only worth something if the engine runs it as written (stage P31). These tests import SYNTHETIC cards through the grammar
// (never through a fixture), define them in an engine scenario and play them through applyAction: the Artifacts slice of D-139
// (ENGINE_VERSION 31). Mass effects and a count of colors, a cost reduced for each artifact, a counter as a cost and a state trigger, a
// return cost and a card put onto the battlefield from the hand, the statics of a creature type (over Juggernauts and Zombies), flash for a
// kind of spell, a discard with an alternative, a look at the top cards, a triggered mana ability, a batch of combat damage, the turn log
// of a creature's damage, tapping X creatures of a type (over Myr and Goblins), reselecting an attack, a linked exile, an Aura that taps
// and makes its controller the monarch, the greatest mana value, and Living weapon. Every card name starts with "SYNTHETIC"; the wording
// of each text is that of the real cards of the golden corpus (names replaced by ~) or a SYNTHETIC variant that changes the type, the
// number or the filter only. No real card's text is claimed; the cards that are not defined here are the engine's own test cards.
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears'; // 2/2 green, MV 2
const RING = 'Sol Ring'; // artifact, MV 1, {T}: Add {C}{C}
const TRINKET = 'SYNTHETIC Trinket'; // artifact, MV 1
const DRONE = 'SYNTHETIC Colorless Drone'; // colorless artifact creature Construct, MV 2
const JUGGERNAUT = 'SYNTHETIC Dust Juggernaut'; // artifact creature, MV 4
const WARD = 'SYNTHETIC Dull Ward'; // white enchantment, MV 2
const CUB = 'SYNTHETIC Red Cub'; // red Goblin creature
const GRUUL = 'SYNTHETIC Gruul Cub'; // red and green Ogre creature
const MYR = 'SYNTHETIC Copper Myr'; // 1/1 artifact creature Myr
const GOBLIN = 'Raging Goblin'; // 1/1 Goblin
const WALL = 'SYNTHETIC Brick Wall'; // 0/5 Wall
const ZOMBIE = 'SYNTHETIC Plain Zombie'; // 2/2 Zombie
const PW = 'SYNTHETIC Vanilla Planeswalker'; // loyalty 4
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

function main(mine: (b: Builder) => Builder, theirs: (b: Builder) => Builder = (b) => b) {
  const a = mine(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  );
  return theirs(
    a
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain')
    .build();
}

const handNames = (g: ScenarioGame, seat: 0 | 1 = 0): string[] =>
  g.state.seats[seat]?.hand.map((id) => {
    const card = g.state.objects[id as keyof typeof g.state.objects]?.card;
    const def = card === undefined || card === null ? undefined : g.state.cards[card]?.definition;
    return def === undefined ? '?' : (g.state.definitions[def]?.name ?? '?');
  }) ?? [];

// ---- Mass effects and colors (D-139)

describe('"Each player sacrifices all permanents they control that are one or more colors." over three counts (CR 701.21a, 105.2)', () => {
  const purge = (count: string) =>
    parsed(
      `SYNTHETIC Parsed Purge ${count}`,
      'Kindred Sorcery — Eldrazi',
      `Each player sacrifices all permanents they control that are ${count} or more colors.`,
      { manaCost: '{3}', colors: [] },
    );

  test('one or more: every colored permanent of both players, the colorless ones stay', () => {
    const spell = purge('one');
    const g = main(
      (b) =>
        b.define(spell).hand(spell.name).battlefield('Plains', { count: 3 }).battlefield(BEARS),
      (b) => b.battlefield(CUB).battlefield(GRUUL).battlefield(DRONE),
    );
    g.act(0).cast(spell.name, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(CUB, 'graveyard', { seat: 1 });
    g.expect.zone(GRUUL, 'graveyard', { seat: 1 });
    g.expect.zone(DRONE, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('two or more: only the multicolored permanent goes', () => {
    const spell = purge('two');
    const g = main(
      (b) =>
        b.define(spell).hand(spell.name).battlefield('Plains', { count: 3 }).battlefield(BEARS),
      (b) => b.battlefield(CUB).battlefield(GRUUL),
    );
    g.act(0).cast(spell.name, { pay: true });
    g.passAll();
    g.expect.zone(GRUUL, 'graveyard', { seat: 1 });
    g.expect.zone(CUB, 'battlefield', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });
});

describe('"Destroy all artifacts, creatures, and enchantments." and "Destroy all artifacts and enchantments." (CR 701.8)', () => {
  test('the union of the types for every player; lands stay', () => {
    const disk = parsed(
      'SYNTHETIC Parsed Disk',
      'Artifact',
      '{1}, {T}: Destroy all artifacts, creatures, and enchantments.',
      { manaCost: '{4}' },
    );
    const g = main(
      (b) => b.define(disk).battlefield(disk.name).battlefield('Plains').battlefield(BEARS),
      (b) => b.battlefield(WARD).battlefield(DRONE).battlefield('Island'),
    );
    g.act(0).activate(disk.name, { pay: true });
    g.passAll();
    g.expect.zone(disk.name, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(WARD, 'graveyard', { seat: 1 });
    g.expect.zone(DRONE, 'graveyard', { seat: 1 });
    g.expect.zone('Island', 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('two types: a creature that is not an artifact stays', () => {
    const spell = parsed(
      'SYNTHETIC Parsed Shatterstorm',
      'Sorcery',
      'Destroy all artifacts and enchantments.',
      { manaCost: '{2}{R}', colors: ['R'] },
    );
    const g = main(
      (b) => b.define(spell).hand(spell.name).battlefield('Mountain', { count: 3 }),
      (b) => b.battlefield(WARD).battlefield(DRONE).battlefield(BEARS),
    );
    g.act(0).cast(spell.name, { pay: true });
    g.passAll();
    g.expect.zone(WARD, 'graveyard', { seat: 1 });
    g.expect.zone(DRONE, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });
});

describe('"Return all attacking creatures to their owner\'s hand." (CR 506.4, 108.3)', () => {
  test('the attackers go back, the creatures that did not attack stay', () => {
    const wave = parsed(
      'SYNTHETIC Parsed Aether Wave',
      'Instant',
      "Return all attacking creatures to their owner's hand.",
      { manaCost: '{3}{U}', colors: ['U'] },
    );
    const g = main(
      (b) => b.battlefield(BEARS).battlefield(CUB),
      (b) => b.define(wave).hand(wave.name).battlefield('Island', { count: 4 }).battlefield(DRONE),
    );
    g.playCombat({ attack: [BEARS], until: 'declareBlockers' });
    g.pass(0);
    g.act(1).cast(wave.name, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.zone(CUB, 'battlefield', { seat: 0 });
    g.expect.zone(DRONE, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });
});

describe('"Exile each opponent\'s graveyard." (CR 404.1, 108.3)', () => {
  test("the opponent's cards go, mine stay", () => {
    const lantern = parsed(
      'SYNTHETIC Parsed Lantern',
      'Artifact',
      "{T}, Sacrifice this artifact: Exile each opponent's graveyard.",
      { manaCost: '{1}' },
    );
    const g = main(
      (b) => b.define(lantern).battlefield(lantern.name).graveyard(BEARS),
      (b) => b.graveyard(CUB),
    );
    g.act(0).activate(lantern.name, { pay: true });
    g.passAll();
    g.expect.zone(CUB, 'exile', { seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(lantern.name, 'graveyard', { seat: 0 });
  });
});

// ---- Costs and restrictions (D-139)

describe('"This ability costs {1} less to activate for each other artifact you control." (CR 601.2f)', () => {
  const logbook = parsed(
    'SYNTHETIC Parsed Logbook',
    'Artifact — Book',
    '{5}{U}, {T}: Draw a card. This ability costs {1} less to activate for each other artifact you control.',
    { manaCost: '{2}{U}', colors: ['U'] },
  );

  test('two other artifacts: {3}{U} is enough', () => {
    const g = main((b) =>
      b
        .define(logbook)
        .battlefield(logbook.name)
        .battlefield(TRINKET)
        .battlefield(DRONE)
        .battlefield('Island', { count: 4 }),
    );
    expect(g.legalActions(0).some((a) => a.kind === 'activate')).toBe(true);
    g.act(0).activate(logbook.name, { pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });

  test('no other artifact: four lands do not pay {5}{U}', () => {
    const g = main((b) =>
      b.define(logbook).battlefield(logbook.name).battlefield('Island', { count: 4 }),
    );
    expect(g.legalActions(0).some((a) => a.kind === 'activate')).toBe(false);
  });

  test('"{2} less for each creature you control": two creatures take {4} off', () => {
    const lens = parsed(
      'SYNTHETIC Parsed Lens',
      'Artifact',
      '{4}, {T}: Draw a card. This ability costs {2} less to activate for each creature you control.',
      { manaCost: '{2}' },
    );
    const g = main((b) =>
      b.define(lens).battlefield(lens.name).battlefield(BEARS).battlefield(CUB),
    );
    g.act(0).activate(lens.name, { pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
  });
});

describe('"{T}, Put a page counter on this artifact: Scry 1." and "When there are four or more page counters on this artifact, exile it. If you do, you gain 4 life." (CR 118.3, 603.8)', () => {
  const tome = parsed(
    'SYNTHETIC Parsed Tome',
    'Artifact — Book',
    '{T}, Put a page counter on this artifact: Scry 1.\n{2}, {T}, Put a page counter on this artifact: Draw a card.\nWhen there are four or more page counters on this artifact, exile it. If you do, you gain 4 life.',
    { manaCost: '{2}' },
  );

  test('the counter is a cost; the draw ability draws', () => {
    const g = main((b) =>
      b.define(tome).battlefield(tome.name).battlefield('Plains', { count: 2 }),
    );
    g.act(0).activate(tome.name, { ability: 1, pay: true });
    g.expect.counters(tome.name, { page: 1 });
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });

  test('the fourth counter triggers it: the Tome is exiled and its controller gains 4 life', () => {
    const g = main((b) =>
      b
        .define(tome)
        .battlefield(tome.name, { counters: { page: 3 } })
        .battlefield('Plains', { count: 2 }),
    );
    g.act(0).activate(tome.name, { ability: 1, pay: true });
    g.expect.counters(tome.name, { page: 4 });
    g.passAll();
    g.passAll();
    g.expect.zone(tome.name, 'exile', { seat: 0 });
    g.expect.life(0, 24);
    g.expect.invariants();
  });

  test('three counters do not trigger it', () => {
    const g = main((b) =>
      b
        .define(tome)
        .battlefield(tome.name, { counters: { page: 2 } })
        .battlefield('Plains', { count: 2 }),
    );
    g.act(0).activate(tome.name, { ability: 1, pay: true });
    g.passAll();
    g.expect.zone(tome.name, 'battlefield', { seat: 0 });
    g.expect.life(0, 20);
  });
});

describe('"{U}, {T}, Return an artifact you control to its owner\'s hand: You may put an artifact card from your hand onto the battlefield." (CR 118.3)', () => {
  const transmuter = parsed(
    'SYNTHETIC Parsed Transmuter',
    'Artifact Creature — Human Artificer',
    "{U}, {T}, Return an artifact you control to its owner's hand: You may put an artifact card from your hand onto the battlefield.",
    { manaCost: '{3}{U}', colors: ['U'], power: '1', toughness: '2' },
  );

  test('the artifact returned is chosen, then an artifact card of the hand is put onto the battlefield', () => {
    const g = main((b) =>
      b
        .define(transmuter)
        .battlefield(transmuter.name)
        .battlefield(TRINKET)
        .battlefield('Island')
        .hand(JUGGERNAUT),
    );
    g.act(0).activate(transmuter.name, { pay: true });
    g.act(0).choosePermanents(TRINKET);
    g.expect.zone(TRINKET, 'hand', { seat: 0 });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(JUGGERNAUT);
    g.expect.zone(JUGGERNAUT, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('the player may put none', () => {
    const g = main((b) =>
      b
        .define(transmuter)
        .battlefield(transmuter.name)
        .battlefield(TRINKET)
        .battlefield('Island')
        .hand(JUGGERNAUT),
    );
    g.act(0).activate(transmuter.name, { pay: true });
    g.act(0).choosePermanents(TRINKET);
    g.passAll();
    g.act(0).chooseCards();
    g.expect.zone(JUGGERNAUT, 'hand', { seat: 0 });
  });
});

// ---- Statics of a creature type, blocking and flash (D-139)

describe('the lord of a creature type over two types (CR 613.4b, 613.1d, 509.1b)', () => {
  const lord = (type: string, plural: string) =>
    parsed(
      `SYNTHETIC Parsed ${type} Lord`,
      `Legendary Artifact Creature — ${type}`,
      `${plural} you control can't be blocked by Walls.\nOther creatures you control have base power and toughness 5/3 and are ${plural} in addition to their other creature types.`,
      { manaCost: '{8}', power: '7', toughness: '5' },
    );

  for (const [type, plural] of [
    ['Juggernaut', 'Juggernauts'],
    ['Zombie', 'Zombies'],
  ] as const) {
    test(`${type}: another creature is 5/3 and a ${type}; a +1/+1 counter applies on top; the opponent's is as printed`, () => {
      const card = lord(type, plural);
      const g = main(
        (b) =>
          b
            .define(card)
            .battlefield(card.name)
            .battlefield(BEARS)
            .battlefield(CUB, { counters: { '+1/+1': 1 } }),
        (b) => b.battlefield(GOBLIN),
      );
      g.expect.pt(BEARS, 5, 3);
      g.expect.pt(CUB, 6, 4);
      g.expect.pt(card.name, 7, 5);
      g.expect.pt(GOBLIN, 1, 1);
      g.expect.derived(BEARS, { subtypes: ['Bear', type] });
      g.expect.invariants();
    });

    test(`${type}: a ${type} can't be blocked by a Wall, and can by another creature`, () => {
      const card = lord(type, plural);
      const g = main(
        (b) => b.define(card).battlefield(card.name).battlefield(BEARS),
        (b) => b.battlefield(WALL).battlefield(GOBLIN),
      );
      g.advanceTo('declareAttackers');
      g.act(0).declareAttackers([{ attacker: BEARS }]);
      g.passAll();
      expect(() => g.act(1).declareBlockers([{ blocker: WALL, attacker: BEARS }])).toThrow();
      g.act(1).declareBlockers([{ blocker: GOBLIN, attacker: BEARS }]);
      g.expect.invariants();
    });
  }
});

describe('"You may cast artifact spells as though they had flash." (CR 601.3b)', () => {
  test("an artifact spell on the opponent's turn, and not a creature spell that is no artifact", () => {
    const myr = parsed(
      'SYNTHETIC Parsed Shimmer',
      'Artifact Creature — Myr',
      'Flash\nYou may cast artifact spells as though they had flash.',
      { manaCost: '{3}', power: '2', toughness: '2' },
    );
    const g = scenario()
      .seat(0)
      .life(20)
      .library(...FILLER)
      .define(myr)
      .battlefield(myr.name)
      .hand(TRINKET)
      .hand(BEARS)
      .battlefield('Forest', { count: 3 })
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.act(1).pass();
    expect(() => g.act(0).cast(BEARS, { pay: true })).toThrow();
    g.act(0).cast(TRINKET, { pay: true });
    g.passAll();
    g.expect.zone(TRINKET, 'battlefield', { seat: 0 });
  });
});

// ---- Discard, look at the top cards (D-139)

describe('"Draw three cards. Then discard two cards unless you discard an artifact card." (CR 701.9)', () => {
  const thirst = (type: string) =>
    parsed(
      `SYNTHETIC Parsed Thirst ${type}`,
      'Instant',
      `Draw three cards. Then discard two cards unless you discard ${/^[aeiou]/.test(type) ? 'an' : 'a'} ${type} card.`,
      { manaCost: '{2}{U}', colors: ['U'] },
    );

  test('an artifact card alone is an answer', () => {
    const spell = thirst('artifact');
    const g = main((b) =>
      b
        .define(spell)
        .hand(spell.name)
        .hand(TRINKET)
        .hand(BEARS)
        .battlefield('Island', { count: 3 }),
    );
    g.act(0).cast(spell.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards(TRINKET);
    g.expect.zone(TRINKET, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 4);
    g.expect.invariants();
  });

  test('over a creature card: the Bears alone, and not a single artifact card', () => {
    const spell = thirst('creature');
    const g = main((b) =>
      b
        .define(spell)
        .hand(spell.name)
        .hand(TRINKET)
        .hand(BEARS)
        .battlefield('Island', { count: 3 }),
    );
    g.act(0).cast(spell.name, { pay: true });
    g.passAll();
    expect(() => g.act(0).chooseCards(TRINKET)).toThrow();
    g.act(0).chooseCards(BEARS);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });
});

describe('"look at the top six cards of your library. You may reveal an artifact card from among them and put it into your hand. Put the rest on the bottom of your library in a random order." (CR 401.2, 701.20a)', () => {
  test('in an attack trigger of the equipped creature: the artifact card is taken, the rest go to the bottom', () => {
    const tool = parsed(
      'SYNTHETIC Parsed Omnitool',
      'Artifact — Equipment',
      'Equipped creature gets +1/+1 for each artifact you control.\nWhenever equipped creature attacks, look at the top six cards of your library. You may reveal an artifact card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.\nEquip {3}',
      { manaCost: '{2}' },
    );
    const g = scenario()
      .seat(0)
      .life(20)
      .library('Plains', 'Plains', TRINKET, 'Plains', 'Plains', 'Plains', GRUUL, CUB)
      .define(tool)
      .battlefield(BEARS)
      .battlefield(tool.name, { attachedTo: BEARS })
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.expect.pt(BEARS, 3, 3);
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: BEARS }]);
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(TRINKET);
    expect(handNames(g)).toEqual([TRINKET]);
    // The two cards that were not looked at are on top now, the five others under them.
    const top = g.state.seats[0]?.library[0];
    expect(top === undefined ? '?' : g.state.objects[top]?.card).toBe(g.object(GRUUL).card);
    expect(g.state.seats[0]?.library).toHaveLength(7);
    g.expect.invariants();
  });

  test('"Put the rest into your graveyard" over a creature or land card, from a spell', () => {
    const spell = parsed(
      'SYNTHETIC Parsed Forage',
      'Sorcery',
      'Look at the top four cards of your library. You may reveal a creature or land card from among them and put it into your hand. Put the rest into your graveyard.',
      { manaCost: '{1}{G}', colors: ['G'] },
    );
    const g = scenario()
      .seat(0)
      .life(20)
      .library(TRINKET, BEARS, TRINKET, TRINKET, 'Plains')
      .define(spell)
      .hand(spell.name)
      .battlefield('Forest', { count: 2 })
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(spell.name, { pay: true });
    g.passAll();
    expect(() => g.act(0).chooseCards(TRINKET)).toThrow();
    g.act(0).chooseCards(BEARS);
    expect(handNames(g)).toEqual([BEARS]);
    g.expect.zone(TRINKET, 'graveyard', { seat: 0 });
    expect(g.state.seats[0]?.library).toHaveLength(1);
  });
});

// ---- Triggers (D-139)

describe('"Whenever you tap a permanent for {C}, add an additional {C}." (CR 605.1b, 106.12)', () => {
  const monument = parsed(
    'SYNTHETIC Parsed Monument',
    'Legendary Artifact',
    'Colorless creatures you control get +2/+2.\nWhenever you tap a permanent for {C}, add an additional {C}.\nWhenever you cast a colorless spell, you gain 2 life.',
    { manaCost: '{5}' },
  );

  test('Sol Ring makes three colorless, a Forest makes {G} only', () => {
    const g = main((b) =>
      b.define(monument).battlefield(monument.name).battlefield(RING).battlefield('Forest'),
    );
    g.act(0).tapForMana(RING);
    g.expect.pool(0, 'CCC');
    g.act(0).tapForMana('Forest');
    g.expect.pool(0, 'CCCG');
    g.expect.stack([]);
    g.expect.invariants();
  });

  test('"Whenever you tap a land for mana, add an additional {G}": any land, any mana', () => {
    const cradle = parsed(
      'SYNTHETIC Parsed Cradle',
      'Enchantment',
      'Whenever you tap a land for mana, add an additional {G}.',
      { manaCost: '{2}{G}', colors: ['G'] },
    );
    const g = main((b) =>
      b.define(cradle).battlefield(cradle.name).battlefield('Plains').battlefield(RING),
    );
    g.act(0).tapForMana('Plains');
    g.expect.pool(0, 'WG');
    g.act(0).tapForMana(RING);
    g.expect.pool(0, 'WGCC');
  });
});

describe('"Whenever one or more artifact creatures you control deal combat damage to a player, draw a card." (CR 603.2c)', () => {
  const network = parsed(
    'SYNTHETIC Parsed Spy Network',
    'Enchantment',
    'Whenever one or more artifact creatures you control deal combat damage to a player, draw a card.',
    { manaCost: '{2}{U}{U}', colors: ['U'] },
  );

  test('two artifact creatures: one trigger, one card; a creature that is no artifact: none', () => {
    const g = main((b) =>
      b.define(network).battlefield(network.name).battlefield(DRONE).battlefield(JUGGERNAUT),
    );
    g.playCombat({ attack: [DRONE, JUGGERNAUT], until: 'combatDamage' });
    g.expect.stack([`${network.name} (ability)`]);
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.invariants();
    const h = main((b) => b.define(network).battlefield(network.name).battlefield(BEARS));
    h.playCombat({ attack: [BEARS], until: 'combatDamage' });
    h.expect.stack([]);
  });

  test('"one or more Goblins you control ... to an opponent", another type', () => {
    const war = parsed(
      'SYNTHETIC Parsed War Drums',
      'Enchantment',
      'Whenever one or more Goblins you control deal combat damage to an opponent, draw a card.',
      { manaCost: '{2}{R}', colors: ['R'] },
    );
    const g = main((b) => b.define(war).battlefield(war.name).battlefield(GOBLIN).battlefield(CUB));
    g.playCombat({ attack: [GOBLIN, CUB], until: 'combatDamage' });
    g.passAll();
    g.expect.handSize(0, 1);
  });
});

describe('"{X}: Destroy each nonland permanent with mana value X whose controller was dealt combat damage by this creature this turn. Activate only once each turn." (CR 510.2, 602.5b)', () => {
  const hellkite = parsed(
    'SYNTHETIC Parsed Hellkite',
    'Artifact Creature — Dragon',
    'Flying\n{X}: Destroy each nonland permanent with mana value X whose controller was dealt combat damage by this creature this turn. Activate only once each turn.',
    { manaCost: '{6}', power: '5', toughness: '5' },
  );

  test("after its combat damage, X = 2 destroys that player's permanents of mana value 2, once", () => {
    const g = main(
      (b) =>
        b
          .define(hellkite)
          .battlefield(hellkite.name)
          .battlefield(BEARS)
          .battlefield('Mountain', { count: 6 }),
      (b) => b.battlefield(DRONE).battlefield(JUGGERNAUT).battlefield('Forest'),
    );
    g.playCombat({ attack: [hellkite.name], until: 'combatDamage' });
    g.expect.life(1, 15);
    g.act(0).activate(hellkite.name, { x: 2, pay: true });
    g.passAll();
    g.expect.zone(DRONE, 'graveyard', { seat: 1 });
    g.expect.zone(JUGGERNAUT, 'battlefield', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.illegal(0, { activate: hellkite.name });
    g.expect.invariants();
  });

  test('without combat damage nothing is destroyed', () => {
    const g = main(
      (b) => b.define(hellkite).battlefield(hellkite.name).battlefield('Mountain', { count: 2 }),
      (b) => b.battlefield(DRONE),
    );
    g.act(0).activate(hellkite.name, { x: 2, pay: true });
    g.passAll();
    g.expect.zone(DRONE, 'battlefield', { seat: 1 });
  });
});

describe('"Whenever this creature attacks, you may tap X untapped Myr you control. If you do, ..." over Myr and Goblins (CR 701.26a, 508.1b)', () => {
  const sphere = (type: string, plural: string) =>
    parsed(
      `SYNTHETIC Parsed ${type} Sphere`,
      `Artifact Creature — ${type} Construct`,
      `Whenever this creature attacks, you may tap X untapped ${plural} you control. If you do, this creature gets +X/+0 until end of turn and deals X damage to the player or planeswalker it's attacking.`,
      { manaCost: '{7}', power: '4', toughness: '7' },
    );

  for (const [type, plural, small] of [
    ['Myr', 'Myr', MYR],
    ['Goblin', 'Goblins', GOBLIN],
  ] as const) {
    test(`${type}: tapping two gives +2/+0 and 2 damage to the player; none does nothing`, () => {
      const card = sphere(type, plural);
      const g = main((b) =>
        b
          .define(card)
          .battlefield(card.name)
          .battlefield(small, { label: 's1' })
          .battlefield(small, { label: 's2' }),
      );
      g.advanceTo('declareAttackers');
      g.act(0).declareAttackers([{ attacker: card.name }]);
      g.passAll();
      g.act(0).choosePermanents('s1', 's2');
      g.expect.tapped('s1');
      g.expect.tapped('s2');
      g.expect.pt(card.name, 6, 7);
      g.expect.life(1, 18);
      g.advanceTo('combatDamage');
      g.expect.life(1, 12);
      g.expect.invariants();

      const h = main((b) =>
        b.define(card).battlefield(card.name).battlefield(small, { label: 's1' }),
      );
      h.advanceTo('declareAttackers');
      h.act(0).declareAttackers([{ attacker: card.name }]);
      h.passAll();
      h.act(0).choosePermanents();
      h.expect.pt(card.name, 4, 7);
      h.expect.life(1, 20);
    });
  }

  test('the damage goes to the planeswalker it attacks', () => {
    const card = sphere('Myr', 'Myr');
    const g = main(
      (b) => b.define(card).battlefield(card.name).battlefield(MYR, { label: 's1' }),
      (b) => b.battlefield(PW),
    );
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: card.name, target: PW }]);
    g.passAll();
    g.act(0).choosePermanents('s1');
    g.expect.counters(PW, { loyalty: 3 });
    g.expect.life(1, 20);
  });
});

describe('"When this artifact enters during the declare attackers step, you may reselect which player or permanent target attacking creature is attacking." (CR 508.7)', () => {
  const signpost = parsed(
    'SYNTHETIC Parsed Signpost',
    'Artifact',
    "Flash\nWhen this artifact enters during the declare attackers step, you may reselect which player or permanent target attacking creature is attacking. (It can't attack its controller or their permanents.)\n{T}: Add {U}.",
    { manaCost: '{2}{U}', colors: ['U'] },
  );

  test('flashed in during declare attackers: the attack moves to the planeswalker', () => {
    const g = main(
      (b) => b.battlefield(BEARS),
      (b) =>
        b.define(signpost).hand(signpost.name).battlefield(PW).battlefield('Island', { count: 3 }),
    );
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: BEARS }]);
    g.act(0).pass();
    g.act(1).cast(signpost.name, { pay: true });
    g.passAll();
    g.expect.stack([`${signpost.name} (ability)`]);
    g.passAll();
    g.act(1).accept();
    g.act(1).chooseOption(`permanent:${g.object(PW).id}`);
    g.advanceTo('combatDamage');
    g.expect.life(1, 20);
    g.expect.counters(PW, { loyalty: 2 });
    g.expect.invariants();
  });

  test('cast in the main phase it does not trigger', () => {
    const g = main((b) =>
      b.define(signpost).hand(signpost.name).battlefield('Island', { count: 3 }),
    );
    g.act(0).cast(signpost.name, { pay: true });
    g.passAll();
    g.expect.zone(signpost.name, 'battlefield', { seat: 0 });
    g.expect.stack([]);
  });
});

// ---- Linked exile, an Aura and the monarch, the greatest mana value, Living weapon (D-139)

describe('"Imprint — When this creature enters, you may exile target nontoken creature. As long as a card exiled with this creature is a creature card, ..." (CR 607.2a)', () => {
  test('it takes the power, toughness and creature types of the card it exiled, and stays a Shapeshifter', () => {
    const duplicant = parsed(
      'SYNTHETIC Parsed Duplicant',
      'Artifact Creature — Shapeshifter',
      "Imprint — When this creature enters, you may exile target nontoken creature.\nAs long as a card exiled with this creature is a creature card, this creature has the power, toughness, and creature types of the last creature card exiled with it. It's still a Shapeshifter.",
      { manaCost: '{6}', power: '2', toughness: '4' },
    );
    const g = main(
      (b) => b.define(duplicant).hand(duplicant.name).battlefield('Plains', { count: 6 }),
      (b) => b.battlefield(ZOMBIE),
    );
    g.act(0).cast(duplicant.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(ZOMBIE);
    g.passAll();
    g.act(0).accept();
    g.expect.zone(ZOMBIE, 'exile', { seat: 1 });
    g.expect.pt(duplicant.name, 2, 2);
    g.expect.derived(duplicant.name, { subtypes: ['Zombie', 'Shapeshifter'] });
    g.expect.invariants();
  });
});

describe('"When this Aura enters, tap enchanted creature and you become the monarch. Enchanted creature doesn\'t untap ... unless that player is the monarch." (CR 725, 502.3)', () => {
  test('the creature is tapped, its controller is not the monarch: it stays tapped in its untap step', () => {
    const aura = parsed(
      'SYNTHETIC Parsed Favor',
      'Enchantment — Aura',
      "Enchant creature\nWhen this Aura enters, tap enchanted creature and you become the monarch.\nEnchanted creature doesn't untap during its controller's untap step unless that player is the monarch.",
      { manaCost: '{2}{U}', colors: ['U'] },
    );
    const g = main(
      (b) => b.define(aura).hand(aura.name).battlefield('Island', { count: 3 }),
      (b) => b.battlefield(BEARS),
    );
    g.act(0).cast(aura.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.passAll();
    g.expect.tapped(BEARS, true);
    expect(g.state.monarch).toBe(0);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.tapped(BEARS, true);
    g.expect.invariants();
  });
});

describe('"At the beginning of your upkeep, if you control the artifact with the greatest mana value or tied for the greatest mana value, draw a card." (CR 603.4)', () => {
  const keeper = parsed(
    'SYNTHETIC Parsed Consul',
    'Legendary Creature — Vedalken Artificer',
    'Artifacts you control have hexproof.\nAt the beginning of your upkeep, if you control the artifact with the greatest mana value or tied for the greatest mana value, draw a card.',
    { manaCost: '{3}{U}', colors: ['U'], power: '1', toughness: '4' },
  );
  const toUpkeep = (mine: (b: Builder) => Builder, theirs: (b: Builder) => Builder) => {
    const a = mine(
      scenario()
        .seat(0)
        .life(20)
        .library(...FILLER)
        .define(keeper)
        .battlefield(keeper.name),
    );
    const g = theirs(
      a
        .seat(1)
        .life(20)
        .library(...FILLER),
    )
      .at('postcombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    return g;
  };

  test("mine is the greatest: it triggers; the opponent's is greater: it does not", () => {
    const g = toUpkeep(
      (b) => b.battlefield(JUGGERNAUT),
      (b) => b.battlefield(TRINKET),
    );
    g.expect.stack([`${keeper.name} (ability)`]);
    const h = toUpkeep(
      (b) => b.battlefield(TRINKET),
      (b) => b.battlefield(JUGGERNAUT),
    );
    h.expect.stack([]);
  });

  test('"the creature with the greatest power or tied for the greatest power": a tie counts', () => {
    const lord = parsed(
      'SYNTHETIC Parsed Brute Keeper',
      'Creature — Ogre',
      'At the beginning of your upkeep, if you control the creature with the greatest power or tied for the greatest power, draw a card.',
      { manaCost: '{2}{R}', colors: ['R'], power: '2', toughness: '2' },
    );
    const a = scenario()
      .seat(0)
      .life(20)
      .library(...FILLER)
      .define(lord)
      .battlefield(lord.name);
    const g = a
      .seat(1)
      .life(20)
      .library(...FILLER)
      .battlefield(BEARS)
      .at('postcombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.stack([`${lord.name} (ability)`]);
  });
});

describe('"Living weapon" (CR 702.92a)', () => {
  test('the Equipment enters, makes a 0/0 Germ and attaches to it, which the bonus keeps alive', () => {
    const cyst = parsed(
      'SYNTHETIC Parsed Cyst',
      'Artifact — Equipment',
      'Living weapon (When this Equipment enters, create a 0/0 black Phyrexian Germ creature token, then attach this to it.)\nEquipped creature gets +1/+1 for each artifact and/or enchantment you control.\nEquip {2}',
      { manaCost: '{3}' },
    );
    const g = main((b) =>
      b.define(cyst).hand(cyst.name).battlefield(WARD).battlefield('Plains', { count: 3 }),
    );
    g.act(0).cast(cyst.name, { pay: true });
    g.passAll();
    g.passAll();
    const germ = g.state.battlefield
      .map((id) => g.state.objects[id])
      .find((o) => o?.token?.characteristics.name === 'Phyrexian Germ');
    expect(germ).toBeDefined();
    g.expect.pt(germ?.id ?? '', 2, 2);
    g.expect.attached(cyst.name, germ?.id ?? null);
    g.expect.invariants();
  });
});
