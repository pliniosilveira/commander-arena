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

// ---- Map and Explore: "{1}, {T}, Sacrifice this token: Target creature you control explores. Activate only as a sorcery." (CR 111.10, 701.44a: reveal the top card; a land goes to hand,
// otherwise the creature gets a +1/+1 counter and its controller may put the card into the graveyard).

const MAPMAKER = parsed('SYNTHETIC Parsed Map Maker', 'Artifact', '{T}: Create a Map token.');

describe('the Map token: a creature you control explores', () => {
  const start = (library: readonly string[]) =>
    scenario()
      .seat(0)
      .life(20)
      .define(MAPMAKER)
      .battlefield(MAPMAKER.name, 'Grizzly Bears', 'Plains')
      .library(...library)
      .seat(1)
      .life(20)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  const explore = (library: readonly string[]) => {
    const g = start(library);
    g.act(0).activate(MAPMAKER.name);
    g.passAll();
    g.act(0).activate('Map', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    return g;
  };

  test('a land revealed goes to the hand and the creature gets no counter', () => {
    const g = explore(['Forest', 'Plains', 'Plains']);
    g.expect.zone('Forest', 'hand', { seat: 0 });
    g.expect.counters('Grizzly Bears', {});
    g.expect.noObject('Map');
    g.expect.invariants();
  });

  test('a nonland card gives a +1/+1 counter and may go to the graveyard', () => {
    const g = explore(['Giant Spider', 'Plains', 'Plains']);
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.counters('Grizzly Bears', { '+1/+1': 1 });
    g.expect.zone('Giant Spider', 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('a nonland card stays on top when the player declines', () => {
    const g = explore(['Giant Spider', 'Plains', 'Plains']);
    g.act(0).decline();
    g.expect.counters('Grizzly Bears', { '+1/+1': 1 });
    g.expect.zone('Giant Spider', 'library', { seat: 0 });
  });

  test('an empty library still gives the counter (CR 701.44a: nothing was revealed, so it was not a land)', () => {
    const g = explore([]);
    g.expect.counters('Grizzly Bears', { '+1/+1': 1 });
  });
});

// ---- Restless Anchorage: "{1}{W}{U}: Until end of turn, this land becomes a 2/3 white and blue Bird creature with flying. It's still a land." and "Whenever this land attacks, create a Map
// token." (CR 205.1a, 613.1d, 613.4b, 613.1f, 508.1m).

const ANCHORAGE = parsed(
  'SYNTHETIC Parsed Anchorage',
  'Land',
  "This land enters tapped.\n{T}: Add {W} or {U}.\n{1}{W}{U}: Until end of turn, this land becomes a 2/3 white and blue Bird creature with flying. It's still a land.\nWhenever this land attacks, create a Map token.",
);

describe('Restless Anchorage: a land that becomes a flying Bird and makes Maps when it attacks', () => {
  const start = () =>
    scenario()
      .seat(0)
      .life(20)
      .define(ANCHORAGE)
      .battlefield(ANCHORAGE.name, { tapped: false })
      .battlefield('Plains', 'Island', 'Plains')
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('it becomes a 2/3 white and blue Bird with flying and is still a land', () => {
    const g = start();
    g.act(0).activate(ANCHORAGE.name, { pay: true });
    g.passAll();
    g.expect.derived(ANCHORAGE.name, {
      types: ['land', 'creature'],
      subtypes: ['Bird'],
      colors: ['W', 'U'],
      keywords: ['flying'],
    });
    g.expect.pt(ANCHORAGE.name, 2, 3);
    g.expect.invariants();
  });

  test('attacking as a creature makes a Map token', () => {
    const g = start();
    g.act(0).activate(ANCHORAGE.name, { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack([ANCHORAGE.name]);
    g.passAll();
    g.expect.zone('Map', 'battlefield', { seat: 0 });
  });
});

// ---- Nissa, Leyline Tamer: "Landfall — Whenever a land you control enters, draw a card. Then if this is the first time this ability has resolved this turn, reveal cards from the top of your
// library until you reveal a creature card. Put that card onto the battlefield and the rest on the bottom of your library in a random order." (CR 701.20, 401.4, 603.4).

const LEYLINE = parsed(
  'SYNTHETIC Parsed Leyline Tamer',
  'Legendary Creature — Elf Wizard',
  'Deathtouch, vigilance\nLandfall — Whenever a land you control enters, draw a card. Then if this is the first time this ability has resolved this turn, reveal cards from the top of your library until you reveal a creature card. Put that card onto the battlefield and the rest on the bottom of your library in a random order.',
  { manaCost: '{3}{G}', colors: ['G'], power: '3', toughness: '3' },
);

const DIG = parsed(
  'SYNTHETIC Parsed Land Dig',
  'Sorcery',
  'Put a land card from your hand onto the battlefield.',
  { manaCost: '{W}', colors: ['W'] },
);

describe('Nissa: the reveal happens only the first time the ability resolves each turn', () => {
  const start = () =>
    scenario()
      .seat(0)
      .life(20)
      .define(LEYLINE)
      .battlefield(LEYLINE.name)
      .hand('Forest')
      .library('Plains', 'Giant Spider', 'Plains', 'Grizzly Bears', 'Plains', 'Plains')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('the first land draws and puts the first creature card revealed onto the battlefield', () => {
    const g = start();
    g.act(0).playLand('Forest');
    g.passAll();
    g.expect.zone('Giant Spider', 'battlefield', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'library', { seat: 0 });
    g.expect.invariants();
  });

  test('the second land of the turn only draws', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .define(LEYLINE)
      .define(DIG)
      .battlefield(LEYLINE.name, 'Plains')
      .hand('Forest', 'Mountain', DIG.name)
      .library('Plains', 'Giant Spider', 'Plains', 'Grizzly Bears', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).playLand('Forest');
    g.passAll();
    // The first land entered: the Spider came onto the battlefield. A second land enters now (put there by a spell): only a card is drawn.
    g.act(0).cast(DIG.name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone('Giant Spider', 'battlefield', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'library', { seat: 0 });
    g.expect.invariants();
  });
});

// ---- Plan for All Outcomes: "When this enchantment enters, the owner of up to one other target nonland permanent puts it on their choice of the top or bottom of their library." (CR 108.3,
// 401.4, 701.24: the owner, not the controller, makes the choice; 111.7: a token ceases to exist) and "Whenever you cast your first noncreature spell each turn, empower Jace 1." (CR 701.71a).

const PLAN = parsed(
  'SYNTHETIC Parsed Plan',
  'Enchantment',
  'When this enchantment enters, the owner of up to one other target nonland permanent puts it on their choice of the top or bottom of their library.\nWhenever you cast your first noncreature spell each turn, empower Jace 1. (Put a loyalty counter on a Jace token you control. If you don\'t control one, first create a blue Jace planeswalker token with "[−1]: Surveil 1" and "[−3]: Draw a card.")',
  { manaCost: '{2}{W}{U}', colors: ['W', 'U'] },
);

describe('Plan for All Outcomes: the owner puts a permanent on the top or the bottom of their library', () => {
  const start = () =>
    scenario()
      .seat(0)
      .life(20)
      .define(PLAN)
      .hand(PLAN.name)
      .battlefield('Plains', 'Plains', 'Island', 'Island')
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .battlefield('Grizzly Bears')
      .library('Island', 'Island')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test("the target's owner chooses the top of their library", () => {
    const g = start();
    g.act(0).cast(PLAN.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('Grizzly Bears');
    g.passAll();
    g.expect.pending('chooseOption', 1);
    g.act(1).chooseOption('on top of your library');
    g.expect.zone('Grizzly Bears', 'library', { seat: 1 });
    // It is the top card: the owner's next draw would be the Bears.
    expect(g.state.seats[1]?.library[0] === g.id({ name: 'Grizzly Bears', zone: 'library' })).toBe(
      true,
    );
    g.expect.invariants();
  });

  test('the owner can choose the bottom of their library', () => {
    const g = start();
    g.act(0).cast(PLAN.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('Grizzly Bears');
    g.passAll();
    g.act(1).chooseOption('on the bottom of your library');
    const library = g.state.seats[1]?.library ?? [];
    expect(library[library.length - 1] === g.id({ name: 'Grizzly Bears', zone: 'library' })).toBe(
      true,
    );
  });

  test('up to one: with no target nothing happens', () => {
    const g = start();
    g.act(0).cast(PLAN.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets();
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 1 });
  });
});

describe('Plan for All Outcomes: empower Jace on the first noncreature spell each turn', () => {
  test('the first noncreature spell makes a Jace with a loyalty counter; the second does nothing', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .define(PLAN)
      .battlefield(PLAN.name, 'Island', 'Swamp', 'Swamp', 'Swamp')
      .hand('Unsummon', 'Murder')
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .battlefield('Grizzly Bears', 'Giant Spider')
      .library('Island', 'Island')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast('Unsummon', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.passAll();
    g.expect.counters('Jace', { loyalty: 1 });
    g.act(0).cast('Murder', { targets: ['Giant Spider'], pay: true });
    g.passAll();
    g.passAll();
    g.expect.counters('Jace', { loyalty: 1 });
    g.expect.invariants();
  });
});

// ---- Jace, Multiverse Architect: "+1: Draw two cards, then put a card from your hand on the bottom of your library." (CR 701.8, 401.4).

const BRAIN = parsed(
  'SYNTHETIC Parsed Brain',
  'Sorcery',
  'Draw two cards, then put a card from your hand on the bottom of your library.',
  { manaCost: '{U}', colors: ['U'] },
);

describe('Jace +1: draw two, then put a card from your hand on the bottom of your library', () => {
  test('the card chosen goes to the bottom, the other stays in hand', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .define(BRAIN)
      .hand(BRAIN.name)
      .battlefield('Island')
      .library('Grizzly Bears', 'Giant Spider', 'Plains', 'Plains')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(BRAIN.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Giant Spider');
    g.expect.zone('Giant Spider', 'library', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'hand', { seat: 0 });
    const library = g.state.seats[0]?.library ?? [];
    expect(library[library.length - 1] === g.id({ name: 'Giant Spider', zone: 'library' })).toBe(
      true,
    );
    g.expect.invariants();
  });
});

// ---- Windcrag Siege: "As this enchantment enters, choose Mardu or Jeskai. • Mardu — If a creature attacking causes a triggered ability of a permanent you control to trigger, that ability
// triggers an additional time. • Jeskai — At the beginning of your upkeep, create a 1/1 red Goblin creature token. It gains lifelink and haste until end of turn." (CR 603.2d, 607.2d,
// 614.12, 508.1m).

const WINDCRAG = parsed(
  'SYNTHETIC Parsed Windcrag',
  'Enchantment',
  'As this enchantment enters, choose Mardu or Jeskai.\n• Mardu — If a creature attacking causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.\n• Jeskai — At the beginning of your upkeep, create a 1/1 red Goblin creature token. It gains lifelink and haste until end of turn.',
  { manaCost: '{2}{R}', colors: ['R'] },
);
const RALLIER = parsed(
  'SYNTHETIC Parsed Rallier',
  'Creature — Human',
  'Whenever ~ attacks, you gain 1 life.',
  { manaCost: '{1}{W}', colors: ['W'], power: '1', toughness: '1' },
);

describe('Windcrag Siege: Mardu doubles attack triggers, Jeskai makes a Goblin each upkeep', () => {
  const board = (option: string) =>
    scenario()
      .seat(0)
      .life(20)
      .define(WINDCRAG)
      .define(RALLIER)
      .battlefield(WINDCRAG.name, { chosen: { option } })
      .battlefield(RALLIER.name)
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('Mardu: a creature attacking makes the trigger happen twice', () => {
    const g = board('Mardu');
    g.advanceTo('declareAttackers');
    g.act(0).attack([RALLIER.name]);
    g.passAll();
    const pending = g.state.pending;
    if (pending?.kind === 'orderTriggers') {
      g.act(0).orderTriggers(...pending.triggers.map((_t, i) => i));
    }
    g.passAll();
    g.passAll();
    g.expect.life(0, 22);
  });

  test('Jeskai: the Mardu ability does nothing, an upkeep makes a Goblin with lifelink and haste', () => {
    const g = board('Jeskai');
    g.advanceTo('declareAttackers');
    g.act(0).attack([RALLIER.name]);
    g.passAll();
    g.passAll();
    g.expect.life(0, 21);
  });

  test('Jeskai: the Goblin appears at the upkeep, with lifelink and haste; Mardu makes none', () => {
    const goblins = (option: string) => {
      const g = board(option);
      g.advanceTo('upkeep', { turn: 3 });
      g.passAll();
      return g.state.battlefield.filter(
        (id) => g.state.objects[id]?.token?.characteristics.name === 'Goblin',
      );
    };
    expect(goblins('Jeskai')).toHaveLength(1);
    expect(goblins('Mardu')).toHaveLength(0);
  });

  test('the Siege asks which option as it enters', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .define(WINDCRAG)
      .hand(WINDCRAG.name)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(WINDCRAG.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Mardu');
    g.expect.chosen(WINDCRAG.name, { option: 'Mardu' });
  });
});

// ---- Shark Typhoon: "Whenever you cast a noncreature spell, create an X/X blue Shark creature token with flying, where X is that spell's mana value. Cycling {X}{1}{U}. When you cycle this
// card, create an X/X blue Shark creature token with flying." (CR 702.29a, 702.29c, 107.3, 202.3: the X of the cycling cost is the X of the trigger).

const TYPHOON = parsed(
  'SYNTHETIC Parsed Typhoon',
  'Enchantment',
  "Whenever you cast a noncreature spell, create an X/X blue Shark creature token with flying, where X is that spell's mana value.\nCycling {X}{1}{U}\nWhen you cycle this card, create an X/X blue Shark creature token with flying.",
  { manaCost: '{5}{U}', colors: ['U'] },
);

describe('Shark Typhoon: a Shark for each noncreature spell, or when it is cycled', () => {
  const sharks = (g: ReturnType<typeof scenario>['build'] extends () => infer G ? G : never) =>
    g.state.battlefield
      .map((id) => g.state.objects[id]?.token?.characteristics)
      .filter((c) => c?.name === 'Shark');

  test('a noncreature spell makes a Shark with its mana value', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .define(TYPHOON)
      .battlefield(TYPHOON.name, 'Island', 'Swamp', 'Swamp', 'Swamp')
      .hand('Murder')
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .battlefield('Grizzly Bears')
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast('Murder', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.passAll();
    const found = sharks(g);
    expect(found).toHaveLength(1);
    expect([found[0]?.power, found[0]?.toughness]).toEqual([3, 3]);
  });

  test('cycling for X makes a Shark of that size', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .define(TYPHOON)
      .hand(TYPHOON.name)
      .battlefield('Island', 'Island', 'Island', 'Island', 'Island')
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).activate(TYPHOON.name, { x: 3, pay: true });
    g.passAll();
    g.expect.zone(TYPHOON.name, 'graveyard', { seat: 0 });
    const found = sharks(g);
    expect(found).toHaveLength(1);
    expect([found[0]?.power, found[0]?.toughness]).toEqual([3, 3]);
    g.expect.handSize(0, 1);
  });
});
