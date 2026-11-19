// The Multiverse Reforged - Reality Fracture deck (issue 81), run as written. Each group imports SYNTHETIC cards through the grammar (never through a fixture), defines them in an
// engine scenario and plays them through applyAction. Every card name starts with "SYNTHETIC"; the wording of each text is that of the real card, taken from the card data the deck
// support workflow fetched from Scryfall for the issue. No real card's text is claimed beyond that.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

// ---- Mass Polymorph: "Exile all creatures you control, then reveal cards from the top of your library until you reveal that many creature cards. Put all creature cards revealed
// this way onto the battlefield, then shuffle the rest of the revealed cards into your library." (CR 701.20 Reveal, 701.24 Shuffle, 608.2c: "that many" is read from the exile).

const POLYMORPH = parsed(
  'SYNTHETIC Parsed Polymorph',
  'Sorcery',
  'Exile all creatures you control, then reveal cards from the top of your library until you reveal that many creature cards. Put all creature cards revealed this way onto the battlefield, then shuffle the rest of the revealed cards into your library.',
  { manaCost: '{X}{U}{U}' },
);
const BEAR = parsed('SYNTHETIC Parsed Bear', 'Creature — Bear', '', {
  manaCost: '{1}{G}',
  colors: ['G'],
  power: '2',
  toughness: '2',
});
const OGRE = parsed('SYNTHETIC Parsed Ogre', 'Creature — Ogre', '', {
  manaCost: '{3}{R}',
  colors: ['R'],
  power: '4',
  toughness: '4',
});

const TROLL = parsed('SYNTHETIC Parsed Troll', 'Creature — Troll', '', {
  manaCost: '{3}{G}',
  colors: ['G'],
  power: '4',
  toughness: '4',
});
const TROLL_TWO = parsed('SYNTHETIC Parsed Troll Two', 'Creature — Troll', '', {
  manaCost: '{3}{G}',
  colors: ['G'],
  power: '4',
  toughness: '4',
});

const MAKER = parsed(
  'SYNTHETIC Parsed Maker',
  'Creature — Human',
  '{T}: Create a 1/1 white Soldier creature token.',
  { manaCost: '{1}{W}', colors: ['W'], power: '1', toughness: '1' },
);

describe('Mass Polymorph: exile your creatures, then reveal that many creature cards', () => {
  const start = (library: readonly string[]) =>
    scenario()
      .seat(0)
      .life(20)
      .define(POLYMORPH)
      .define(BEAR)
      .define(OGRE)
      .define(TROLL)
      .define(TROLL_TWO)
      .hand(POLYMORPH.name)
      .battlefield(BEAR.name, BEAR.name, 'Island', 'Island')
      .library(...library)
      .seat(1)
      .life(20)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0 })
      .build();

  test('two creatures are exiled and the first two creature cards revealed enter; the others are shuffled back', () => {
    const g = start(['Plains', OGRE.name, 'Plains', TROLL.name, TROLL_TWO.name, 'Plains']);
    g.act(0).cast(POLYMORPH.name, { pay: true });
    g.passAll();
    g.expect.zone(BEAR.name, 'exile', { seat: 0 });
    g.expect.zone(OGRE.name, 'battlefield', { seat: 0 });
    g.expect.zone(TROLL.name, 'battlefield', { seat: 0 });
    g.expect.zone(TROLL_TWO.name, 'library', { seat: 0 });
    // Two Plains were revealed with the Ogre and the Troll and shuffled back with the two cards that were not revealed: 4 cards in all.
    g.expect.librarySize(0, 4);
    g.expect.invariants();
  });

  test('a token exiled counts as a creature exiled (CR 111.7: it ceases to exist, but it was exiled)', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .define(POLYMORPH)
      .define(MAKER)
      .define(OGRE)
      .define(TROLL)
      .define(TROLL_TWO)
      .hand(POLYMORPH.name)
      .battlefield(MAKER.name, 'Island', 'Island')
      .library('Plains', OGRE.name, TROLL.name, TROLL_TWO.name, 'Plains')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(MAKER.name);
    g.passAll();
    g.act(0).cast(POLYMORPH.name, { pay: true });
    g.passAll();
    // The Maker and its Soldier token are two creatures exiled: two creature cards enter.
    g.expect.zone(OGRE.name, 'battlefield', { seat: 0 });
    g.expect.zone(TROLL.name, 'battlefield', { seat: 0 });
    g.expect.zone(TROLL_TWO.name, 'library', { seat: 0 });
    g.expect.invariants();
  });

  test('with no creature in the library every card is revealed and the library is shuffled', () => {
    const g = start(['Plains', 'Plains', 'Plains']);
    g.act(0).cast(POLYMORPH.name, { pay: true });
    g.passAll();
    g.expect.librarySize(0, 3);
    g.expect.invariants();
  });
});

// ---- White Sun's Twilight: "You gain X life. Create X 1/1 colorless Phyrexian Mite artifact creature tokens with toxic 1 and \"This token can't block.\" If X is 5 or more, destroy all other
// creatures." (CR 107.3a, 608.2c, 702.164 Toxic: the tokens survive their own destruction clause because they are created first, "other" excluding the source spell only).

const TWILIGHT = parsed(
  "SYNTHETIC Parsed White Sun's Twilight",
  'Sorcery',
  'You gain X life. Create X 1/1 colorless Phyrexian Mite artifact creature tokens with toxic 1 and "This token can\'t block." If X is 5 or more, destroy all other creatures.',
  { manaCost: '{X}{W}{W}', colors: ['W'] },
);

describe("White Sun's Twilight: life, Mites, and a wrath at X of 5 or more", () => {
  const start = (lands: number) =>
    scenario()
      .seat(0)
      .life(20)
      .define(TWILIGHT)
      .hand(TWILIGHT.name)
      .battlefield('Plains', { count: lands })
      .battlefield('Grizzly Bears')
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .battlefield('Giant Spider')
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0 })
      .build();

  const mites = (g: ReturnType<typeof start>) =>
    g.state.battlefield.filter(
      (id) => g.state.objects[id]?.token?.characteristics.name === 'Phyrexian Mite',
    ).length;

  test('X of 4: four life, four Mites, and every other creature lives', () => {
    const g = start(6);
    g.act(0).cast(TWILIGHT.name, { x: 4, pay: true });
    g.passAll();
    g.expect.life(0, 24);
    expect(mites(g)).toBe(4);
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.zone('Giant Spider', 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('X of 5: five Mites survive and every creature that is not one of them is destroyed', () => {
    const g = start(7);
    g.act(0).cast(TWILIGHT.name, { x: 5, pay: true });
    g.passAll();
    g.expect.life(0, 25);
    expect(mites(g)).toBe(5);
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone('Giant Spider', 'graveyard', { seat: 1 });
    g.expect.invariants();
  });
});

// ---- Kher Keep: "Create a 0/1 red Kobold creature token named Kobolds of ~." (CR 111.4: a token with a name of its own is named so; the card's own name ends it).

const KEEP = parsed(
  'SYNTHETIC Parsed Kher Keep',
  'Legendary Land',
  '{T}: Add {C}.\n{1}{R}, {T}: Create a 0/1 red Kobold creature token named Kobolds of ~.',
);

describe('Kher Keep: a Kobold token named for the land', () => {
  test('the token is a 0/1 red Kobold with the name of its own', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .define(KEEP)
      .battlefield(KEEP.name, 'Mountain', 'Mountain')
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(KEEP.name, { ability: 1, pay: true });
    g.passAll();
    const kobolds = g.state.battlefield.filter(
      (id) => g.state.objects[id]?.token?.characteristics.name === `Kobolds of ${KEEP.name}`,
    );
    expect(kobolds).toHaveLength(1);
    g.expect.invariants();
  });
});

// ---- Avacyn, Angel of Horror: "Whenever Avacyn or another nontoken creature you control dies, return that card to the battlefield under your control at the beginning of the next end
// step." (CR 603.7, 603.7c, 603.10a, 400.7: the card that died returns as a new object; a token never reaches the graveyard as a card).

const HORROR = parsed(
  'SYNTHETIC Parsed Horror Angel',
  'Legendary Creature — Angel',
  'Flying, deathtouch\nWhenever ~ or another nontoken creature you control dies, return that card to the battlefield under your control at the beginning of the next end step.',
  { manaCost: '{3}{W}{W}{W}', colors: ['W'], power: '8', toughness: '8' },
);

describe('Avacyn: your nontoken creatures come back at the next end step', () => {
  const board = () =>
    scenario()
      .define(HORROR)
      .seat(0)
      .life(20)
      .battlefield(HORROR.name, 'Grizzly Bears')
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .hand('Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 1, turn: 2 })
      .build();

  test("a creature that dies returns under its owner's control at the end step, not before", () => {
    const g = board();
    g.act(1).cast('Murder', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('Avacyn herself returns too', () => {
    const g = board();
    g.act(1).cast('Murder', { targets: [HORROR.name], pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone(HORROR.name, 'graveyard', { seat: 0 });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(HORROR.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });
});

// ---- Occult Epiphany: "Draw X cards, then discard X cards. Create a 1/1 white Spirit creature token with flying for each card type among cards discarded this way." (CR 205.2a, 608.2c:
// a card with two types counts for both; each type counts once).

const EPIPHANY = parsed(
  'SYNTHETIC Parsed Epiphany',
  'Instant',
  'Draw X cards, then discard X cards. Create a 1/1 white Spirit creature token with flying for each card type among cards discarded this way.',
  { manaCost: '{X}{U}{U}', colors: ['U'] },
);

describe('Occult Epiphany: a Spirit for each card type among the cards discarded', () => {
  const start = (library: readonly string[]) =>
    scenario()
      .seat(0)
      .life(20)
      .define(EPIPHANY)
      .hand(EPIPHANY.name)
      .battlefield('Island', 'Island', 'Island', 'Island', 'Island')
      .library(...library)
      .seat(1)
      .life(20)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0 })
      .build();

  const spirits = (g: ReturnType<typeof start>) =>
    g.state.battlefield.filter(
      (id) => g.state.objects[id]?.token?.characteristics.name === 'Spirit',
    ).length;

  test('a creature and two lands are two card types: two Spirits', () => {
    const g = start(['Grizzly Bears', 'Plains', 'Plains', 'Plains']);
    g.act(0).cast(EPIPHANY.name, { x: 3, pay: true });
    g.passAll();
    expect(spirits(g)).toBe(2);
    g.expect.handSize(0, 0);
    g.expect.invariants();
  });

  test('three lands are one card type: one Spirit', () => {
    const g = start(['Plains', 'Plains', 'Plains', 'Plains']);
    g.act(0).cast(EPIPHANY.name, { x: 3, pay: true });
    g.passAll();
    expect(spirits(g)).toBe(1);
  });

  test('X of 0 discards nothing and makes no Spirit', () => {
    const g = start(['Grizzly Bears', 'Plains']);
    g.act(0).cast(EPIPHANY.name, { x: 0, pay: true });
    g.passAll();
    expect(spirits(g)).toBe(0);
  });
});

// ---- Tamiyo, Upriser Crowned: "Whenever one or more creatures deal combat damage to you while you're the monarch, tap those creatures and put a stun counter on each of them." (CR 725.2,
// 603.2c, 510.2, 122.1d, 400.7: the creatures that dealt the damage, as long as they are still the same permanents; "while you're the monarch" is read as the damage is dealt, before the
// monarch moves to the player who dealt it).

const UPRISER = parsed(
  'SYNTHETIC Parsed Upriser Crowned',
  'Legendary Creature — Moonfolk Warrior',
  "Flying, double strike, haste\nWhen ~ enters, you become the monarch.\nWhenever one or more creatures deal combat damage to you while you're the monarch, tap those creatures and put a stun counter on each of them.",
  { manaCost: '{W}', colors: ['W'], power: '2', toughness: '2' },
);

describe('Tamiyo: creatures that damage the monarch are tapped and stunned', () => {
  const start = () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .define(UPRISER)
      .hand(UPRISER.name)
      .battlefield('Plains')
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .battlefield('Grizzly Bears', 'Giant Spider')
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(UPRISER.name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.monarch(0);
    return g;
  };

  /** The opponent attacks me with the creatures named; their combat damage triggers Tamiyo's ability and the monarch's, and the triggers are put on the stack and resolved. */
  const attackMe = (g: ReturnType<typeof start>, attackers: readonly string[]) => {
    g.advanceTo('declareAttackers', { turn: 2 });
    g.act(1).attack(attackers);
    g.passAll();
    g.act(0).noBlocks();
    g.passAll();
    const pending = g.state.pending;
    if (pending?.kind === 'orderTriggers') {
      g.act(0).orderTriggers(...pending.triggers.map((_t, i) => i));
    }
    g.passAll();
  };

  test('both attackers get a stun counter and the opponent becomes the monarch', () => {
    const g = start();
    attackMe(g, ['Grizzly Bears', 'Giant Spider']);
    g.expect.counters('Grizzly Bears', { stun: 1 });
    g.expect.counters('Giant Spider', { stun: 1 });
    g.expect.tapped('Grizzly Bears');
    g.expect.tapped('Giant Spider');
    g.expect.monarch(1);
    g.expect.invariants();
  });

  test('only the creatures that dealt the damage are stunned', () => {
    const g = start();
    attackMe(g, ['Grizzly Bears']);
    g.expect.counters('Grizzly Bears', { stun: 1 });
    g.expect.counters('Giant Spider', {});
    g.expect.monarch(1);
  });

  test('nothing happens while you are not the monarch (Tamiyo was put onto the battlefield, so nobody is)', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .define(UPRISER)
      .battlefield(UPRISER.name)
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .battlefield('Grizzly Bears')
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    attackMe(g, ['Grizzly Bears']);
    g.expect.counters('Grizzly Bears', {});
    g.expect.life(0, 18);
  });
});
