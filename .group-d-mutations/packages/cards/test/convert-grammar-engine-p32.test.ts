// Parsed text is only worth something if the engine runs it as written (stage P32). These tests import SYNTHETIC cards through the grammar
// (never through a fixture), define them in an engine scenario and play them through applyAction: the Dinosaurs slice of D-145
// (ENGINE_VERSION 32). A restriction lifted by a condition (over two powers), an Aura that makes a creature something else (over two
// creatures), the commanders' mana value in a bonus, a trigger condition (while), doubling, fights, the excess damage of trample, reveal
// until and the look at the top cards that puts a creature onto the battlefield, casting for free (a card of the hand and the card a
// Hideaway exiled), divided damage, "two mana of any one color" and "instead", Escalate, a discount by power, a group of sources
// prevented, a counter that gives a mana ability, a graveyard card exiled with a test of what it was, and the greatest power. Every card
// name starts with "SYNTHETIC"; the wording of each text is that of the real cards of the golden corpus (names replaced by ~) or a
// SYNTHETIC variant that changes the type, the number or the filter only. No real card's text is claimed; the cards that are not defined
// here are the engine's own test cards.
import type { CardDefinition } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears'; // 2/2, MV 2
const SPIDER = 'Giant Spider'; // 2/4 reach, MV 4
const ANGEL = 'Serra Angel'; // 4/4 flying vigilance, MV 5
const V22 = 'SYNTHETIC Vanilla 2/2';
const V33 = 'SYNTHETIC Vanilla 3/3';
const V55 = 'SYNTHETIC Vanilla 5/5';
const TRAMPLER = 'SYNTHETIC Trampler 4/4';
const WALL = 'Wall of Stone'; // 0/8
const ISAMARU = 'Isamaru, Hound of Konda'; // MV 1
const YARGLE = 'Yargle, Glutton of Urborg'; // MV 4
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

/** Seat 0's game with the cards of `mine` and seat 1's of `theirs`, a library each, in the first main phase. */
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

// ---- A restriction lifted by a condition

describe('"~ can\'t attack or block unless you control another creature with power N or greater." (CR 508.1a, 509.1a)', () => {
  const shy = (power: number) =>
    parsed(
      `SYNTHETIC Parsed Shy ${power}`,
      'Legendary Creature — God',
      `~ can't attack or block unless you control another creature with power ${power} or greater.`,
      { manaCost: '{2}{G}', power: '5', toughness: '5', colors: ['G'] },
    );

  const atAttackers = (card: CardDefinition, others: readonly string[]) => {
    const g = main(
      (b) => b.define(card).battlefield(card.name, ...others),
      (b) => b,
    );
    g.advanceTo('declareAttackers', { attack: false });
    return g;
  };

  test('with a power of 4: a 2/2 does not make it able, a 5/5 does, and its own power does not count', () => {
    const card = shy(4);
    atAttackers(card, [BEARS]).expect.canAttack(card.name, false);
    atAttackers(card, [V55]).expect.canAttack(card.name, true);
    atAttackers(card, []).expect.canAttack(card.name, false);
  });

  test('with a power of 2: the same 2/2 makes it able', () => {
    const card = shy(2);
    atAttackers(card, [BEARS]).expect.canAttack(card.name, true);
    atAttackers(card, [WALL]).expect.canAttack(card.name, false);
  });

  test("the opponent's creatures do not count, and the engine refuses the declaration", () => {
    const card = shy(4);
    const g = main(
      (b) => b.define(card).battlefield(card.name, BEARS),
      (b) => b.battlefield(V55),
    );
    g.advanceTo('declareAttackers', { attack: false });
    expect(g.act(0).try.declareAttackers([{ attacker: card.name }]).ok).toBe(false);
    expect(g.act(0).try.declareAttackers([{ attacker: BEARS }]).ok).toBe(true);
  });
});

// ---- An Aura that makes a creature something else

describe('"Enchanted creature loses all abilities and is a ... creature with base power and toughness N/N." (CR 613.1d to 613.1f, 613.4b)', () => {
  test('a green Elk 3/3 (the text of the card)', () => {
    const aura = parsed(
      'SYNTHETIC Parsed Elk Aura',
      'Enchantment — Aura',
      'Enchant creature\nEnchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3.',
      { manaCost: '{1}{G}', colors: ['G'] },
    );
    const g = main((b) =>
      b
        .define(aura)
        .battlefield(ANGEL, { label: 'angel' })
        .battlefield(aura.name, { attachedTo: 'angel' }),
    );
    g.expect.derived('angel', {
      types: ['creature'],
      subtypes: ['Elk'],
      colors: ['G'],
      keywords: [],
    });
    g.expect.pt('angel', 3, 3);
    g.expect.invariants();
  });

  test('a blue Frog 1/1, and the creature next to it keeps everything', () => {
    const aura = parsed(
      'SYNTHETIC Parsed Frog Aura',
      'Enchantment — Aura',
      'Enchant creature\nEnchanted creature loses all abilities and is a blue Frog creature with base power and toughness 1/1.',
      { manaCost: '{1}{U}', colors: ['U'] },
    );
    const g = main((b) =>
      b
        .define(aura)
        .battlefield(ANGEL, { label: 'angel' })
        .battlefield(ANGEL, { label: 'other' })
        .battlefield(aura.name, { attachedTo: 'angel' }),
    );
    g.expect.derived('angel', { subtypes: ['Frog'], colors: ['U'], keywords: [] });
    g.expect.pt('angel', 1, 1);
    g.expect.derived('other', {
      subtypes: ['Angel'],
      colors: ['W'],
      keywords: ['flying', 'vigilance'],
    });
    g.expect.pt('other', 4, 4);
  });
});

// ---- +X/+X from the commanders

describe('"Equipped creature gets +X/+X, where X is the greatest mana value among your commanders." (CR 613.4c, 903.3)', () => {
  const blade = (stats: '+X/+X' | '+X/+0') =>
    parsed(
      `SYNTHETIC Parsed Commander Blade ${stats.replace('/', ' ')}`,
      'Artifact — Equipment',
      `Equipped creature gets ${stats}, where X is the greatest mana value among your commanders.\nEquip {2}`,
      { manaCost: '{2}' },
    );

  const game = (card: CardDefinition, commander: string) =>
    main((b) =>
      b
        .define(card)
        .battlefield(commander, { commander: true })
        .battlefield(BEARS, { label: 'bears' })
        .battlefield(card.name, { attachedTo: 'bears' }),
    );

  test('a commander of mana value 4 makes the Bears 6/6; of mana value 1, 3/3', () => {
    const card = blade('+X/+X');
    game(card, YARGLE).expect.pt('bears', 6, 6);
    game(card, ISAMARU).expect.pt('bears', 3, 3);
  });

  test('+X/+0 gives the power only', () => {
    game(blade('+X/+0'), YARGLE).expect.pt('bears', 6, 2);
  });

  test('with no commander it is +0/+0', () => {
    const card = blade('+X/+X');
    const g = main((b) =>
      b
        .define(card)
        .battlefield(BEARS, { label: 'bears' })
        .battlefield(card.name, { attachedTo: 'bears' }),
    );
    g.expect.pt('bears', 2, 2);
  });
});

// ---- A condition of the attack trigger

describe('"Whenever ~ attacks while you don\'t control another <type>, put a stun counter on it." (CR 603.2, 122.1d)', () => {
  const raptor = (type: string) =>
    parsed(
      `SYNTHETIC Parsed Raptor ${type}`,
      `Creature — ${type}`,
      `Whenever ~ attacks while you don't control another ${type}, put a stun counter on it.`,
      { manaCost: '{2}{G}', power: '6', toughness: '6', colors: ['G'] },
    );
  const kin = (type: string) =>
    parsed(`SYNTHETIC Parsed Kin ${type}`, `Creature — ${type}`, '', {
      manaCost: '{G}',
      power: '1',
      toughness: '1',
      colors: ['G'],
    });

  const attack = (g: ScenarioGame, name: string) => {
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(name);
  };

  test.each(['Dinosaur', 'Dragon'])(
    '%s: alone it is stunned, with another of its type it is not',
    (type) => {
      const card = raptor(type);
      const friend = kin(type);
      const alone = main((b) => b.define(card).battlefield(card.name, BEARS));
      attack(alone, card.name);
      alone.passAll();
      alone.expect.counters(card.name, { stun: 1 });

      const together = main((b) =>
        b.define(card).define(friend).battlefield(card.name, friend.name),
      );
      attack(together, card.name);
      together.expect.stack([]);
      together.expect.counters(card.name, {});
    },
  );
});

// ---- Doubling

describe('"Double the power and toughness of each creature you control until end of turn." (CR 701.10)', () => {
  test("at the beginning of each combat: each creature its own, the opponent's untouched", () => {
    const field = parsed(
      'SYNTHETIC Parsed Surge Field',
      'Enchantment',
      'At the beginning of each combat, double the power and toughness of each creature you control until end of turn.',
      { manaCost: '{1}{G}{G}{G}{G}', colors: ['G'] },
    );
    const g = scenario()
      .seat(0)
      .define(field)
      .battlefield(field.name, BEARS, V55)
      .seat(1)
      .battlefield('Typhoid Rats')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.expect.pt(BEARS, 4, 4);
    g.expect.pt(V55, 10, 10);
    g.expect.pt('Typhoid Rats', 1, 1);
  });

  test.each([
    ['power', 'Double the power of target creature until end of turn.', 4, 2],
    ['toughness', 'Double the toughness of target creature until end of turn.', 2, 4],
    ['both', 'Double the power and toughness of target creature until end of turn.', 4, 4],
  ])('an instant doubling the %s of a target', (_what, text, power, toughness) => {
    const spell = parsed(`SYNTHETIC Parsed Doubler ${_what}`, 'Instant', text, {
      manaCost: '{G}',
      colors: ['G'],
    });
    const g = main((b) => b.define(spell).hand(spell.name).battlefield('Forest', BEARS));
    g.act(0).cast(spell.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pt(BEARS, power, toughness);
  });
});

// ---- Fights

describe('fights (CR 701.14)', () => {
  test('"Target creature you control fights target creature you don\'t control."', () => {
    const spell = parsed(
      'SYNTHETIC Parsed Brawl',
      'Sorcery',
      "Target creature you control fights target creature you don't control.",
      { manaCost: '{G}', colors: ['G'] },
    );
    const g = main(
      (b) =>
        b.define(spell).hand(spell.name).battlefield('Forest').battlefield(V33, { label: 'mine' }),
      (b) => b.battlefield(V22, { label: 'theirs' }),
    );
    g.act(0).cast(spell.name, { targets: ['mine', 'theirs'], pay: true });
    g.passAll();
    g.expect.zone(V22, 'graveyard', { seat: 1 });
    g.expect.damage('mine', 2);
  });

  test('a token for each creature, each fighting a different one of them', () => {
    const spell = parsed(
      'SYNTHETIC Parsed Swarm',
      'Sorcery',
      'For each creature your opponents control, create a 4/4 green Phyrexian Beast creature token. Each of those tokens fights a different one of those creatures.',
      { manaCost: '{G}', colors: ['G'] },
    );
    const g = main(
      (b) => b.define(spell).hand(spell.name).battlefield('Forest'),
      (b) => b.battlefield(V22).battlefield(V33),
    );
    g.act(0).cast(spell.name, { pay: true });
    g.passAll();
    // Two Beasts were made; the controller is asked which creature the first fights, the second fights the other.
    const asking = g.state.pending;
    expect(asking?.kind).toBe('choosePermanent');
    expect(g.find({ name: 'Phyrexian Beast', zone: 'battlefield' })).toHaveLength(2);
  });
});

// ---- The excess damage of trample

describe('"If the creature you control has trample, excess damage is dealt to that creature\'s controller instead." (CR 702.19b)', () => {
  const bite = parsed(
    'SYNTHETIC Parsed Ram',
    'Instant',
    "Target creature you control deals damage equal to its power to target creature you don't control. If the creature you control has trample, excess damage is dealt to that creature's controller instead.",
    { manaCost: '{1}{G}', colors: ['G'] },
  );
  const cast = (mine: string, theirs: string) => {
    const g = main(
      (b) =>
        b
          .define(bite)
          .hand(bite.name)
          .battlefield('Forest', 'Forest')
          .battlefield(mine, { label: 'mine' }),
      (b) => b.battlefield(theirs, { label: 'theirs' }),
    );
    g.act(0).cast(bite.name, { targets: ['mine', 'theirs'], pay: true });
    g.passAll();
    return g;
  };

  test('a trampler: lethal damage to the creature, the rest to its controller', () => {
    const g = cast(TRAMPLER, V22);
    g.expect.zone(V22, 'graveyard', { seat: 1 });
    g.expect.life(1, 18);
  });

  test('without trample the whole amount goes to the creature', () => {
    const g = cast(V55, V22);
    g.expect.zone(V22, 'graveyard', { seat: 1 });
    g.expect.life(1, 20);
  });
});

// ---- Reveal until, and the look at the top cards

describe('revealing cards until one of a kind (CR 701.20)', () => {
  test('a land onto the battlefield tapped, the rest on the bottom', () => {
    const scout = parsed(
      'SYNTHETIC Parsed Scout',
      'Creature — Frog Scout',
      'When ~ enters, reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield tapped and the rest on the bottom of your library in a random order.',
      { manaCost: '{2}{G}', power: '1', toughness: '2', colors: ['G'] },
    );
    const g = scenario()
      .seat(0)
      .define(scout)
      .hand(scout.name)
      .battlefield('Forest', 'Forest', 'Forest')
      .library(BEARS, SPIDER, 'Swamp', 'Island')
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(scout.name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone('Swamp', 'battlefield', { seat: 0 });
    g.expect.tapped('Swamp', true);
    g.expect.zone(BEARS, 'library', { seat: 0 });
    g.expect.zone(SPIDER, 'library', { seat: 0 });
  });

  test('a nonland card into the hand', () => {
    const dig = parsed(
      'SYNTHETIC Parsed Dig',
      'Sorcery',
      'Reveal cards from the top of your library until you reveal a nonland card. Put that card into your hand and the rest on the bottom of your library in a random order.',
      { manaCost: '{1}{G}', colors: ['G'] },
    );
    const g = scenario()
      .seat(0)
      .define(dig)
      .hand(dig.name)
      .battlefield('Forest', 'Forest')
      .library('Swamp', 'Island', BEARS, SPIDER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(dig.name, { pay: true });
    g.passAll();
    expect(handNames(g)).toEqual([BEARS]);
    g.expect.zone('Swamp', 'library', { seat: 0 });
  });
});

describe('"... a creature card with mana value less than or equal to the number of lands you control ... onto the battlefield." (CR 401.2)', () => {
  test('only a creature card no bigger than the number of lands is offered, and it enters untapped', () => {
    const lens = parsed(
      'SYNTHETIC Parsed Lens',
      'Artifact',
      '{T}: Look at the top six cards of your library. You may reveal a creature card with mana value less than or equal to the number of lands you control from among them and put it onto the battlefield. Put the rest on the bottom in a random order.',
      { manaCost: '{2}' },
    );
    const g = scenario()
      .seat(0)
      .define(lens)
      .battlefield(lens.name, 'Plains', 'Plains')
      .library(BEARS, SPIDER, ANGEL, 'Swamp', 'Island', 'Swamp')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).activate(lens.name, { pay: true });
    g.passAll();
    const asking = g.state.pending;
    expect(asking?.kind).toBe('chooseCards');
    if (asking?.kind !== 'chooseCards') return;
    // Two lands: the Bears (mana value 2) may be taken, the Spider (4) and the Angel (5) may not.
    expect(asking.legal).toEqual([g.id(BEARS)]);
    g.act(0).chooseCards(BEARS);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.tapped(BEARS, false);
  });
});

// ---- Casting for free

describe('"You may cast a spell with mana value N or less from your hand without paying its mana cost." (CR 608.2g)', () => {
  test.each([3, 5])('mana value %i or less: the Angel only when the limit is 5', (limit) => {
    const rite = parsed(
      `SYNTHETIC Parsed Rite ${limit}`,
      'Sorcery',
      `You may cast a spell with mana value ${limit} or less from your hand without paying its mana cost.`,
      { manaCost: '{1}{G}', colors: ['G'] },
    );
    const g = main((b) =>
      b.define(rite).hand(rite.name, ANGEL, BEARS).battlefield('Forest', 'Forest'),
    );
    g.act(0).cast(rite.name, { pay: true });
    g.passAll();
    const asking = g.state.pending;
    expect(asking?.kind).toBe('chooseCards');
    if (asking?.kind !== 'chooseCards') return;
    expect([...asking.legal].sort()).toEqual(
      (limit === 5 ? [g.id(ANGEL), g.id(BEARS)] : [g.id(BEARS)]).sort(),
    );
    g.act(0).chooseCards(BEARS);
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });
});

describe('Hideaway and "You may play the exiled card without paying its mana cost." (CR 702.75a, 608.2g)', () => {
  test('the card exiled face down is played free from the land', () => {
    const vault = parsed(
      'SYNTHETIC Parsed Vault',
      'Land',
      'Hideaway 4\n{T}: You may play the exiled card without paying its mana cost.',
    );
    const g = scenario()
      .seat(0)
      .define(vault)
      .hand(vault.name)
      .library(BEARS, SPIDER, ANGEL, 'Swamp', 'Island')
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).playLand(vault.name);
    g.passAll();
    const looked = g.state.pending;
    expect(looked?.kind).toBe('chooseCards');
    g.act(0).chooseCards(ANGEL);
    g.expect.zone(ANGEL, 'exile', { seat: 0 });
    g.act(0).activate(vault.name);
    g.passAll();
    const play = g.state.pending;
    expect(play?.kind).toBe('chooseCards');
    g.act(0).chooseCards(ANGEL);
    g.passAll();
    g.expect.zone(ANGEL, 'battlefield', { seat: 0 });
  });
});

// ---- Divided damage

describe('"~ deals X damage divided as you choose among any number of target creatures, where X is the greatest power among creatures you control as you cast ~." (CR 601.2d)', () => {
  const rampage = parsed(
    'SYNTHETIC Parsed Rampage',
    'Sorcery',
    '~ deals X damage divided as you choose among any number of target creatures, where X is the greatest power among creatures you control as you cast ~.',
    { manaCost: '{R}', colors: ['R'] },
  );

  test('X is the greatest power as it is cast; the shares add up to it, each target gets its own', () => {
    const g = main(
      (b) => b.define(rampage).hand(rampage.name).battlefield('Mountain').battlefield(V55),
      (b) => b.battlefield(V22, { label: 'a' }).battlefield(V33, { label: 'b' }),
    );
    g.act(0).cast(rampage.name, { targets: ['a', 'b'], divide: [2, 3], pay: true });
    g.passAll();
    g.expect.zone(V22, 'graveyard', { seat: 1 });
    g.expect.zone(V33, 'graveyard', { seat: 1 });
  });

  test('a number and "up to three": at most three targets', () => {
    const volley = parsed(
      'SYNTHETIC Parsed Volley',
      'Instant',
      '~ deals 3 damage divided as you choose among up to three target creatures.',
      { manaCost: '{R}', colors: ['R'] },
    );
    const g = main(
      (b) => b.define(volley).hand(volley.name).battlefield('Mountain'),
      (b) => b.battlefield(V22, { label: 'a' }).battlefield(V33, { label: 'b' }),
    );
    g.act(0).cast(volley.name, { targets: ['a', 'b'], divide: [1, 2], pay: true });
    g.passAll();
    g.expect.damage('a', 1);
    g.expect.damage('b', 2);
  });
});

// ---- Mana

describe('"Add two mana of any one color" and "If you control ..., add ... instead." (CR 106.1b, 605.3b)', () => {
  test('a creature that makes two mana of one color with a creature of power 4 or greater', () => {
    const mystic = parsed(
      'SYNTHETIC Parsed Mystic',
      'Creature — Plant',
      '{T}: Add one mana of any color. If you control a creature with power 4 or greater, add two mana of any one color instead.',
      { manaCost: '{1}{G}', power: '1', toughness: '1', colors: ['G'] },
    );
    const without = main((b) => b.define(mystic).battlefield(mystic.name, BEARS));
    without.act(0).tapForMana(mystic.name, { color: 'W' });
    without.expect.pool(0, 'W');

    const withBig = main((b) => b.define(mystic).battlefield(mystic.name, V55));
    withBig.act(0).tapForMana(mystic.name, { color: 'U' });
    withBig.expect.pool(0, 'UU');
  });

  test('a fixed production instead', () => {
    const forge = parsed(
      'SYNTHETIC Parsed Forge',
      'Artifact',
      '{T}: Add {G}. If you control a commander, add {R}{R} instead.',
      { manaCost: '{2}' },
    );
    const plain = main((b) => b.define(forge).battlefield(forge.name));
    plain.act(0).tapForMana(forge.name);
    plain.expect.pool(0, 'G');
    const led = main((b) =>
      b.define(forge).battlefield(forge.name).battlefield(ISAMARU, { commander: true }),
    );
    led.act(0).tapForMana(forge.name);
    led.expect.pool(0, 'RR');
  });
});

// ---- Escalate

describe('"Escalate {cost}" with "Choose one or more" (CR 702.120a)', () => {
  const charm = parsed(
    'SYNTHETIC Parsed Charm',
    'Instant',
    'Escalate {R}\nChoose one or more —\n• You gain 2 life.\n• Draw a card.\n• Each opponent loses 1 life.',
    { manaCost: '{1}{R}', colors: ['R'] },
  );
  const tapped = (g: ScenarioGame) =>
    g.find({ name: 'Mountain', zone: 'battlefield' }).filter((o) => o.tapped).length;

  test('the mana cost and the escalate cost for each mode beyond the first', () => {
    const one = main((b) => b.define(charm).hand(charm.name).battlefield('Mountain', { count: 5 }));
    one.act(0).cast(charm.name).modes(0).pay();
    one.passAll();
    expect(tapped(one)).toBe(2);
    one.expect.life(0, 22);

    const three = main((b) =>
      b.define(charm).hand(charm.name).battlefield('Mountain', { count: 5 }),
    );
    three.act(0).cast(charm.name).modes(0, 1, 2).pay();
    three.passAll();
    expect(tapped(three)).toBe(4);
    three.expect.life(0, 22);
    three.expect.life(1, 19);
  });
});

// ---- A discount by power

describe('"Creature spells you cast with power 4 or greater cost {2} less to cast." (CR 118.7a)', () => {
  test('the Angel (power 4) is cast with a discount of {2} from three Plains; the Bears (power 2) are not discounted', () => {
    const tamer = parsed(
      'SYNTHETIC Parsed Titan Tamer',
      'Legendary Creature — Bear',
      'Creature spells you cast with power 4 or greater cost {2} less to cast.',
      { manaCost: '{3}{G}', power: '4', toughness: '3', colors: ['G'] },
    );
    const game = (withTamer: boolean, hand: string) =>
      main((b) =>
        (withTamer ? b.define(tamer).battlefield(tamer.name) : b)
          .hand(hand)
          .battlefield('Plains', 'Plains', 'Plains'),
      );
    // {3}{W}{W} less {2} is {1}{W}{W}: three Plains pay for it, and two would not.
    const discounted = game(true, ANGEL);
    discounted.act(0).cast(ANGEL, { pay: true });
    discounted.passAll();
    discounted.expect.zone(ANGEL, 'battlefield', { seat: 0 });
    expect(game(false, ANGEL).act(0).try.cast(ANGEL).ok).toBe(false);
    // The Bears have a power of 2: a discount of {2} would make them free, and they are not discounted.
    const bears = game(true, BEARS);
    expect(bears.act(0).try.cast(BEARS).ok).toBe(false);
  });
});

// ---- Prevention by a group of sources

describe('"Prevent all combat damage that would be dealt this turn by non-Spider creatures." (CR 615.1)', () => {
  test('the attackers deal no combat damage; the Spiders made by the spell do', () => {
    const fog = parsed(
      'SYNTHETIC Parsed Fog',
      'Instant',
      'Create X 1/2 green Spider creature tokens with reach, where X is the number of creatures attacking you. Prevent all combat damage that would be dealt this turn by non-Spider creatures.',
      { manaCost: '{2}{G}', colors: ['G'] },
    );
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(V33, V22)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .define(fog)
      .hand(fog.name)
      .battlefield('Forest', 'Forest', 'Forest')
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([V33, V22]);
    g.act(0).pass();
    g.act(1).cast(fog.name, { pay: true });
    g.passAll();
    expect(g.find({ name: 'Spider', zone: 'battlefield' })).toHaveLength(2);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 20);
  });
});

// ---- A counter that gives a mana ability

describe('"Each creature you control with a +1/+1 counter on it has \\"{T}: Add {G}.\\"" (CR 122.1, 613.1f)', () => {
  test('only a creature with the counter can be tapped for mana', () => {
    const lord = parsed(
      'SYNTHETIC Parsed Counter Lord',
      'Enchantment',
      'Each creature you control with a +1/+1 counter on it has "{T}: Add {G}."',
      { manaCost: '{2}{G}', colors: ['G'] },
    );
    const g = main((b) =>
      b
        .define(lord)
        .battlefield(lord.name)
        .battlefield(BEARS, { label: 'with', counters: { '+1/+1': 1 } })
        .battlefield(V22, { label: 'without' }),
    );
    expect(() => g.act(0).tapForMana('without')).toThrow();
    g.act(0).tapForMana('with');
    g.expect.pool(0, 'G');
  });
});

// ---- A graveyard card exiled, and what it was

describe('"{G}: Exile target card from a graveyard. If it was a creature card, put a +1/+1 counter on ~ and you gain 1 life." (CR 608.2c)', () => {
  const ooze = parsed(
    'SYNTHETIC Parsed Ooze',
    'Creature — Ooze',
    '{G}: Exile target card from a graveyard. If it was a creature card, put a +1/+1 counter on ~ and you gain 1 life.',
    { manaCost: '{1}{G}', power: '2', toughness: '2', colors: ['G'] },
  );
  const game = () =>
    scenario()
      .seat(0)
      .define(ooze)
      .battlefield(ooze.name, 'Forest', 'Forest')
      .graveyard(BEARS, 'Swamp')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('a creature card: the counter and the life', () => {
    const g = game();
    g.act(0).activate(ooze.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.counters(ooze.name, { '+1/+1': 1 });
    g.expect.life(0, 41);
  });

  test('a land card: exiled, and nothing else', () => {
    const g = game();
    g.act(0).activate(ooze.name, { targets: ['Swamp'], pay: true });
    g.passAll();
    g.expect.zone('Swamp', 'exile', { seat: 0 });
    g.expect.counters(ooze.name, {});
    g.expect.life(0, 40);
  });
});

// ---- The greatest power, at the end step

describe('"At the beginning of your end step, draw two cards if you control the creature with the greatest power or tied for the greatest power." (CR 603.4)', () => {
  const thicket = parsed(
    'SYNTHETIC Parsed Thicket',
    'Enchantment',
    'At the beginning of your end step, draw two cards if you control the creature with the greatest power or tied for the greatest power.',
    { manaCost: '{3}{G}{G}', colors: ['G'] },
  );

  test('the biggest creature (a tie counts) draws two cards, a bigger creature of the opponent none', () => {
    const tied = main(
      (b) => b.define(thicket).battlefield(thicket.name, V55),
      (b) => b.battlefield(V55),
    );
    tied.advanceTo('end');
    tied.passAll();
    tied.expect.handSize(0, 2);

    const smaller = main(
      (b) => b.define(thicket).battlefield(thicket.name, V33),
      (b) => b.battlefield(V55),
    );
    smaller.advanceTo('end');
    smaller.passAll();
    smaller.expect.handSize(0, 0);
  });
});

// ---- A commander as a target

describe('"Target commander gains lifelink until end of turn." (CR 903.3)', () => {
  test('only the commanders are targets; one of the opponent is too', () => {
    const clinic = parsed(
      'SYNTHETIC Parsed Clinic',
      'Land',
      '{2}, {T}: Target commander gains haste until end of turn.',
    );
    const g = main(
      (b) =>
        b
          .define(clinic)
          .battlefield(clinic.name, 'Plains', 'Plains')
          .battlefield(ISAMARU, { commander: true, label: 'mine' })
          .battlefield(BEARS, { label: 'bears' }),
      (b) => b.battlefield(YARGLE, { commander: true, label: 'theirs' }),
    );
    const activation = g.act(0).activate(clinic.name);
    const asking = g.state.pending;
    expect(asking?.kind).toBe('targets');
    if (asking?.kind !== 'targets') return;
    const legal = (asking.specs[0]?.legal ?? []).flatMap((t) =>
      t.kind === 'object' ? [t.id] : [],
    );
    expect(legal.sort()).toEqual([g.id('mine'), g.id('theirs')].sort());
    activation.targets(['theirs']).pay();
    g.passAll();
    g.expect.derived('theirs', { keywords: ['haste'] });
  });
});
