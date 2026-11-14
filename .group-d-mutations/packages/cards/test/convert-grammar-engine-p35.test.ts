// Parsed text is only worth something if the engine runs it as written (stage P35). These tests import SYNTHETIC cards through the grammar
// (never through a fixture), define them in an engine scenario and play them through applyAction: the Korvold deck's text and token slice of
// D-175 and D-176 (ENGINE_VERSION 36). Tokens with abilities in quotes (nested too), tokens a number of times a power, one token of two chosen
// as the instruction resolves, an Aura that returns to its owner's hand, an effect on the enchanted creature, a second line about the target
// of the first, a chosen card from the graveyard and the graveyard shuffled in, an equip that costs life, damage to the controller of a
// destroyed permanent and "Choose a Background". Every card name starts with "SYNTHETIC"; the wording of each text is that of the real cards of
// the slice (the owner's request file of 2026-10-29, names replaced by ~) or a SYNTHETIC variant that changes the type, the number or the
// filter only. No real card's text is claimed.
import { validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { importCard } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const BEARS = 'Grizzly Bears'; // {1}{G}, 2/2
const ANGEL = 'Serra Angel'; // {3}{W}{W}, 4/4
const BOLT = 'Lightning Bolt';
const FILLER = Array.from({ length: 12 }, () => 'Mountain');

const named = (g: ScenarioGame, name: string) => g.find({ name });

// ---- Tokens with abilities in quotes

describe('a token that has an ability in quotes (CR 111.4, 113.1)', () => {
  describe('"... create a 0/1 colorless Eldrazi Spawn creature token. It has \\"Sacrifice this token: Add {C}.\\"" (a mana ability with a sacrifice)', () => {
    const garden = parsed(
      'SYNTHETIC Parsed Spawn Garden',
      'Enchantment',
      'At the beginning of your upkeep, you may create a 0/1 colorless Eldrazi Spawn creature token. It has "Sacrifice this token: Add {C}."',
      { manaCost: '{2}{G}', colors: ['G'] },
    );
    const atUpkeep = () => {
      const g = scenario()
        .seat(0)
        .define(garden)
        .battlefield(garden.name)
        .library(...FILLER)
        .seat(1)
        .library(...FILLER)
        .build();
      g.advanceTo('upkeep', { turn: 'next' });
      g.advanceTo('upkeep', { turn: 'next' });
      return g;
    };

    test('the card is valid', () => {
      expect(validateCard(garden)).toEqual([]);
    });

    test('accepted: a 0/1 Eldrazi Spawn creature token comes into play', () => {
      const g = atUpkeep();
      g.passAll();
      g.act(0).accept();
      const [spawn] = named(g, 'Eldrazi Spawn');
      if (spawn === undefined) throw new Error('no Eldrazi Spawn');
      expect(spawn.token).not.toBeNull();
      g.expect.pt('Eldrazi Spawn', 0, 1);
      g.expect.derived('Eldrazi Spawn', {
        types: ['creature'],
        subtypes: ['Eldrazi', 'Spawn'],
        colors: [],
      });
    });

    test('declined: none', () => {
      const g = atUpkeep();
      g.passAll();
      g.act(0).decline();
      expect(named(g, 'Eldrazi Spawn')).toHaveLength(0);
    });

    test('the token is sacrificed for {C}, which a token that just came into play can do (no {T} in the cost)', () => {
      const g = atUpkeep();
      g.passAll();
      g.act(0).accept();
      g.act(0).tapForMana('Eldrazi Spawn');
      g.expect.pool(0, 'C');
      g.expect.noObject('Eldrazi Spawn');
      g.expect.invariants();
    });
  });

  describe('"... create a 1/1 black and green Pest creature token with \\"When this token dies, you gain 1 life.\\"" (a triggered ability)', () => {
    const court = parsed(
      'SYNTHETIC Parsed Pest Court',
      'Enchantment',
      'At the beginning of each upkeep, create a 1/1 black and green Pest creature token with "When this token dies, you gain 1 life."',
      { manaCost: '{2}{B}{G}', colors: ['B', 'G'] },
    );
    const withPest = () => {
      const g = scenario()
        .seat(0)
        .define(court)
        .battlefield(court.name, 'Mountain')
        .hand(BOLT)
        .library(...FILLER)
        .life(20)
        .seat(1)
        .library(...FILLER)
        .life(20)
        .build();
      g.advanceTo('upkeep', { turn: 'next' });
      g.passAll();
      g.advanceTo('upkeep', { turn: 'next' });
      g.passAll();
      return g;
    };

    test("each upkeep, whoever's, makes one for the controller of the enchantment: two Pests, both mine", () => {
      const g = withPest();
      g.expect.zone('Pest', 'battlefield', { seat: 0, count: 2 });
      g.expect.noObject('Pest', { seat: 1 });
      g.expect.pt('Pest[0]', 1, 1);
      g.expect.derived('Pest[0]', { colors: ['B', 'G'], subtypes: ['Pest'] });
    });

    test('when a Pest dies its controller gains 1 life, whoever killed it', () => {
      const g = withPest();
      g.act(0).cast(BOLT, { targets: ['Pest[0]'], pay: true });
      g.passAll();
      g.expect.zone('Pest', 'battlefield', { seat: 0, count: 1 });
      g.expect.life(0, 21);
      g.expect.life(1, 20);
      g.expect.invariants();
    });
  });

  describe('"... create a 0/2 red Dragon Egg creature token with defender and \\"When this token dies, create a 2/2 red Dragon creature token with flying and \'{R}: This token gets +1/+0 until end of turn.\'\\"" (a token in the ability of a token)', () => {
    const nest = parsed(
      'SYNTHETIC Parsed Nesting Wyrm',
      'Creature — Dragon',
      `Flying\nLandfall — Whenever a land you control enters, create a 0/2 red Dragon Egg creature token with defender and "When this token dies, create a 2/2 red Dragon creature token with flying and '{R}: This token gets +1/+0 until end of turn.'"`,
      { manaCost: '{3}{R}{R}', colors: ['R'], power: '4', toughness: '4' },
    );
    const afterLand = () => {
      const g = scenario()
        .seat(0)
        .define(nest)
        .battlefield(nest.name, 'Mountain')
        .hand('Mountain', BOLT)
        .library(...FILLER)
        .seat(1)
        .library(...FILLER)
        .build();
      g.act(0).playLand('Mountain');
      g.passAll();
      return g;
    };

    test('the card is valid', () => {
      expect(validateCard(nest)).toEqual([]);
    });

    test('a land entering makes a 0/2 Dragon Egg with defender', () => {
      const g = afterLand();
      g.expect.pt('Dragon Egg', 0, 2);
      g.expect.derived('Dragon Egg', {
        colors: ['R'],
        subtypes: ['Dragon', 'Egg'],
        keywords: ['defender'],
      });
    });

    test('when the Egg dies a 2/2 flying Dragon comes, and {R} gives it +1/+0 until end of turn', () => {
      const g = afterLand();
      g.act(0).cast(BOLT, { targets: [{ name: 'Dragon Egg' }], pay: true });
      g.passAll();
      g.expect.noObject('Dragon Egg');
      g.expect.pt('Dragon', 2, 2);
      g.expect.derived('Dragon', { keywords: ['flying'] });
      // The Mountain that was played pays for {R}.
      g.act(0).activate('Dragon', { pay: true });
      g.passAll();
      g.expect.pt('Dragon', 3, 2);
      g.expect.invariants();
    });
  });

  test('"It has" with no token before it is not run: the line is flagged, not half read', () => {
    const imported = importCard(
      syntheticCard({
        name: 'SYNTHETIC Orphan Rider',
        manaCost: '{1}{G}',
        typeLine: 'Sorcery',
        oracleText: 'It has "Sacrifice this token: Add {C}."',
      }),
      undefined,
      NO_OVERRIDES,
    );
    expect(imported.support.status).toBe('unsupported');
  });
});

// ---- A number of tapped Treasures equal to its power

describe('"When this creature dies, create a number of tapped Treasure tokens equal to its power." (CR 111.2, 608.2h, 110.5b)', () => {
  const hydra = parsed(
    'SYNTHETIC Parsed Gold Hydra',
    'Creature — Hydra',
    'Vigilance, trample, haste\nThis creature enters with X +1/+1 counters on it.\nWhen this creature dies, create a number of tapped Treasure tokens equal to its power.',
    { manaCost: '{X}{G}', colors: ['G'], power: '0', toughness: '0' },
  );
  const game = () =>
    scenario()
      .seat(0)
      .define(hydra)
      .hand(hydra.name, BOLT)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();

  test('the card is valid', () => {
    expect(validateCard(hydra)).toEqual([]);
  });

  test('X = 3: a 3/3 that, as it dies, makes three Treasures, tapped', () => {
    const g = game();
    g.act(0).cast(hydra.name, { x: 3, pay: true });
    g.passAll();
    g.expect.pt(hydra.name, 3, 3);
    g.act(0).cast(BOLT, { targets: [{ name: hydra.name }], pay: true });
    g.passAll();
    g.expect.zone(hydra.name, 'graveyard', { seat: 0 });
    const treasures = named(g, 'Treasure');
    expect(treasures).toHaveLength(3);
    expect(treasures.every((t) => t.tapped)).toBe(true);
    g.expect.invariants();
  });

  test("the power is the one it had on the battlefield, an Aura's bonus included (last-known information, CR 608.2h)", () => {
    const g = scenario()
      .seat(0)
      .define(hydra)
      .hand(hydra.name, 'SYNTHETIC Growth Aura', BOLT, BOLT)
      .battlefield(
        'Forest',
        'Forest',
        'Forest',
        'Forest',
        'Forest',
        'Forest',
        'Mountain',
        'Mountain',
      )
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(hydra.name, { x: 3, pay: true });
    g.passAll();
    g.act(0).cast('SYNTHETIC Growth Aura', { targets: [hydra.name], pay: true });
    g.passAll();
    g.expect.pt(hydra.name, 4, 4);
    g.act(0).cast({ name: BOLT, nth: 0 }, { targets: [hydra.name], pay: true });
    g.passAll();
    g.expect.zone(hydra.name, 'battlefield', { seat: 0 });
    g.act(0).cast(BOLT, { targets: [hydra.name], pay: true });
    g.passAll();
    g.expect.zone(hydra.name, 'graveyard', { seat: 0 });
    expect(named(g, 'Treasure')).toHaveLength(4);
  });

  test('X = 0 dies as a 0/0 and makes no Treasure', () => {
    const g = game();
    g.act(0).cast(hydra.name, { x: 0, pay: true });
    g.passAll();
    g.expect.zone(hydra.name, 'graveyard', { seat: 0 });
    expect(named(g, 'Treasure')).toHaveLength(0);
  });
});

// ---- One of two tokens, chosen as the instruction resolves

describe('"Landfall — Whenever a land you control enters, create a Food token or a Treasure token." (CR 608.2d, 111.10)', () => {
  const provisioner = parsed(
    'SYNTHETIC Parsed Provisioner',
    'Creature — Elf Scout',
    'Landfall — Whenever a land you control enters, create a Food token or a Treasure token.',
    { manaCost: '{2}{G}', colors: ['G'], power: '2', toughness: '2' },
  );
  const afterLand = () => {
    const g = scenario()
      .seat(0)
      .define(provisioner)
      .battlefield(provisioner.name)
      .hand('Forest', 'Plains')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { extraLandDrops: 1 })
      .build();
    g.act(0).playLand('Forest');
    return g;
  };

  test('the card is valid', () => {
    expect(validateCard(provisioner)).toEqual([]);
  });

  test('the trigger goes on the stack with no choice made, and its controller chooses as it resolves', () => {
    const g = afterLand();
    g.expect.stack([`${provisioner.name} (ability)`]);
    g.expect.pending('priority', 0);
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption') throw new Error('expected the choice of a token');
    expect(d).toMatchObject({
      seat: 0,
      purpose: 'effect',
      options: ['create a Food token', 'create a Treasure token'],
    });
  });

  test('a Food token', () => {
    const g = afterLand();
    g.passAll();
    g.act(0).chooseOption('create a Food token');
    expect(named(g, 'Food')).toHaveLength(1);
    expect(named(g, 'Treasure')).toHaveLength(0);
  });

  test('a Treasure token, and the next land asks again', () => {
    const g = afterLand();
    g.passAll();
    g.act(0).chooseOption('create a Treasure token');
    expect(named(g, 'Treasure')).toHaveLength(1);
    expect(named(g, 'Food')).toHaveLength(0);
    g.act(0).playLand('Plains');
    g.passAll();
    g.expect.pending('chooseOption', 0);
  });
});

// ---- An Aura that returns to its owner's hand

describe('"When this Aura is put into a graveyard from the battlefield, return it to its owner\'s hand." (CR 700.4, 400.7)', () => {
  const rancor = parsed(
    'SYNTHETIC Parsed Return Aura',
    'Enchantment — Aura',
    "Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand.",
    { manaCost: '{G}', colors: ['G'] },
  );
  const game = () => {
    const g = scenario()
      .seat(0)
      .define(rancor)
      .hand(rancor.name)
      .battlefield(BEARS, 'Forest', 'Forest')
      .library(...FILLER)
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain', ANGEL)
      .library(...FILLER)
      .build();
    g.act(0).cast(rancor.name, { targets: [BEARS], pay: true });
    g.passAll();
    return g;
  };

  test('the card is valid and the Aura gives +2/+0 and trample', () => {
    expect(validateCard(rancor)).toEqual([]);
    const g = game();
    g.expect.attached(rancor.name, BEARS);
    g.expect.pt(BEARS, 4, 2);
    g.expect.derived(BEARS, { keywords: ['trample'] });
  });

  test("when the enchanted creature dies the Aura goes to the graveyard and then to its owner's hand", () => {
    const g = game();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(rancor.name, 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('the Aura is a new object in the hand: it can be cast again', () => {
    const g = game();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(rancor.name, 'hand', { seat: 0 });
    g.expect.legal(0, { cast: rancor.name });
  });
});

// ---- An effect on the enchanted creature

describe('"When this Aura enters, enchanted creature gains trample and indestructible until end of turn." (CR 303.4b, 611.2a)', () => {
  const embrace = parsed(
    'SYNTHETIC Parsed Embrace',
    'Enchantment — Aura',
    'Flash\nEnchant creature\nWhen this Aura enters, enchanted creature gains trample and indestructible until end of turn.\nEnchanted creature gets +2/+0.',
    { manaCost: '{2}{G}', colors: ['G'] },
  );
  const game = () => {
    const g = scenario()
      .seat(0)
      .define(embrace)
      .hand(embrace.name)
      .battlefield(BEARS, 'Forest', 'Forest', 'Forest')
      .library(...FILLER)
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .library(...FILLER)
      .build();
    g.act(0).cast(embrace.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.passAll();
    return g;
  };

  test('the card is valid', () => {
    expect(validateCard(embrace)).toEqual([]);
  });

  test('the enchanted creature has both keywords and the +2/+0 this turn', () => {
    const g = game();
    g.expect.attached(embrace.name, BEARS);
    g.expect.derived(BEARS, { keywords: ['trample', 'indestructible'] });
    g.expect.pt(BEARS, 4, 2);
  });

  test('indestructible: lethal damage does not destroy it this turn', () => {
    const g = game();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.damage(BEARS, 3);
  });

  test('at the end of the turn the keywords are gone and the +2/+0 stays', () => {
    const g = game();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.derived(BEARS, { keywords: [] });
    g.expect.pt(BEARS, 4, 2);
  });
});

// ---- A second line about the target of the first

describe('"Target creature gains double strike until end of turn. / Ferocious — That creature also gains trample until end of turn if you control a creature with power 4 or greater." (CR 608.2c)', () => {
  const rage = parsed(
    'SYNTHETIC Parsed Battle Rage',
    'Instant',
    'Target creature gains double strike until end of turn.\nFerocious — That creature also gains trample until end of turn if you control a creature with power 4 or greater.',
    { manaCost: '{1}{R}', colors: ['R'] },
  );
  const game = (...others: readonly string[]) =>
    scenario()
      .seat(0)
      .define(rage)
      .hand(rage.name)
      .battlefield(BEARS, ...others, 'Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();

  test('the card is valid and the second line is a part of the same spell', () => {
    expect(validateCard(rage)).toEqual([]);
    expect(rage.faces[0]?.spell?.targets).toHaveLength(1);
  });

  test('with a creature of power 4 or more the target gets both', () => {
    const g = game(ANGEL);
    g.act(0).cast(rage.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.derived(BEARS, { keywords: ['doubleStrike', 'trample'] });
  });

  test('with none it gets double strike only', () => {
    const g = game();
    g.act(0).cast(rage.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.derived(BEARS, { keywords: ['doubleStrike'] });
  });

  test('the creature the spell targets is the one that gets trample: the power-4 creature is not the target', () => {
    const g = game(ANGEL);
    g.act(0).cast(rage.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.derived(ANGEL, { keywords: ['flying', 'vigilance'] });
  });
});

// ---- A saga: mill, a chosen card, the graveyard shuffled in

describe('"I, II — Mill two cards, then you may return a creature card from your graveyard to your hand. / III — Return all land cards from your graveyard to the battlefield, then shuffle your graveyard into your library." (CR 701.17, 608.2d, 701.24)', () => {
  const REMINDER =
    '(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)';
  const imported = importCard(
    syntheticCard(
      {
        name: 'SYNTHETIC Parsed Mending',
        manaCost: '{3}{G}{G}',
        typeLine: 'Enchantment — Saga',
        oracleText: `${REMINDER}\nI, II — Mill two cards, then you may return a creature card from your graveyard to your hand.\nIII — Return all land cards from your graveyard to the battlefield, then shuffle your graveyard into your library.`,
        colors: ['G'],
      },
      { layout: 'saga', colorIdentity: ['G'], cmc: 5 },
    ),
    undefined,
    NO_OVERRIDES,
  );
  const mending = imported.definition;

  test('the card is supported', () => {
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(validateCard(mending)).toEqual([]);
  });

  test('chapter I: two cards are milled, then a creature card of the graveyard may come to the hand', () => {
    const g = scenario()
      .seat(0)
      .define(mending)
      .hand(mending.name)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .library(BEARS, 'Plains', 'Mountain', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(mending.name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone('Plains', 'graveyard', { seat: 0 });
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(BEARS);
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.zone('Plains', 'graveyard', { seat: 0 });
  });

  test('chapter I: the player may choose none', () => {
    const g = scenario()
      .seat(0)
      .define(mending)
      .hand(mending.name)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .library(BEARS, 'Plains', 'Mountain', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(mending.name, { pay: true });
    g.passAll();
    g.passAll();
    g.act(0).chooseCards();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 0);
  });

  test('chapter I with no creature card in the graveyard asks nothing', () => {
    const g = scenario()
      .seat(0)
      .define(mending)
      .hand(mending.name)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .library('Plains', 'Mountain', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(mending.name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.zone('Plains', 'graveyard', { seat: 0 });
  });

  test('chapter III: the lands of the graveyard come back, the rest goes into the library, which is shuffled', () => {
    const g = scenario()
      .seat(0)
      .define(mending)
      .battlefield(mending.name, { counters: { lore: 2 } })
      .graveyard('Forest', 'Plains', BEARS, ANGEL)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    const before = g.state.seats[0]?.library.length ?? 0;
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.passAll();
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.zone('Plains', 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'library', { seat: 0 });
    g.expect.zone(ANGEL, 'library', { seat: 0 });
    // Two cards went into the library and the turn's draw took one; the Saga is sacrificed after the chapter resolved.
    expect(g.state.seats[0]?.library.length).toBe(before + 2 - 1);
    g.expect.invariants();
  });
});

// ---- A chosen card from the graveyard, no "you may"

describe('"Return a creature card from your graveyard to your hand." (CR 608.2d)', () => {
  const regrowth = parsed(
    'SYNTHETIC Parsed Regrowth',
    'Sorcery',
    'Return a creature card from your graveyard to your hand.',
    { manaCost: '{1}{G}', colors: ['G'] },
  );

  test('the player chooses among the creature cards of their own graveyard; nothing is targeted', () => {
    const g = scenario()
      .seat(0)
      .define(regrowth)
      .hand(regrowth.name)
      .battlefield('Forest', 'Forest')
      .graveyard(BEARS, ANGEL, 'Plains')
      .library(...FILLER)
      .seat(1)
      .graveyard('Llanowar Elves')
      .library(...FILLER)
      .build();
    expect(regrowth.faces[0]?.spell?.targets).toBeUndefined();
    g.act(0).cast(regrowth.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(ANGEL);
    g.expect.zone(ANGEL, 'hand', { seat: 0 });
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 1 });
  });
});

// ---- Equip that costs life

describe('"Equipped creature has hexproof and can\'t be blocked. / Equip—{2}, Pay 2 life." (CR 702.6a, 118.1)', () => {
  const precious = parsed(
    'SYNTHETIC Parsed Precious Ring',
    'Legendary Artifact — Equipment',
    "Equipped creature has hexproof and can't be blocked.\nEquip—{2}, Pay 2 life.",
    { manaCost: '{3}' },
  );
  const game = () =>
    scenario()
      .seat(0)
      .define(precious)
      .battlefield(precious.name, BEARS, 'Forest', 'Forest')
      .life(20)
      .library(...FILLER)
      .seat(1)
      .battlefield(ANGEL)
      .life(20)
      .library(...FILLER)
      .build();

  test('the card is valid', () => {
    expect(validateCard(precious)).toEqual([]);
  });

  test('activating it pays {2} and 2 life, and attaches', () => {
    const g = game();
    g.act(0).activate(precious.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.attached(precious.name, BEARS);
    g.expect.life(0, 18);
    g.expect.derived(BEARS, { keywords: ['hexproof'] });
    g.expect.invariants();
  });

  test('it cannot be activated without the mana, and at 1 life it cannot be paid (CR 119.4)', () => {
    const none = scenario()
      .seat(0)
      .define(precious)
      .battlefield(precious.name, BEARS)
      .life(20)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    expect(none.act(0).try.activate(precious.name).ok).toBe(false);
    const low = scenario()
      .seat(0)
      .define(precious)
      .battlefield(precious.name, BEARS, 'Forest', 'Forest')
      .life(1)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    expect(low.act(0).try.activate(precious.name).ok).toBe(false);
  });

  test("an equipped creature can't be blocked", () => {
    const g = game();
    g.act(0).activate(precious.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.advanceTo('declareBlockers');
    const d = g.state.pending;
    const blockable = d?.kind === 'declareBlockers' && d.candidates.length > 0;
    expect(blockable).toBe(false);
  });
});

// ---- Damage to the controller of a destroyed permanent

describe('"Destroy target artifact or enchantment. ~ deals 2 damage to that permanent\'s controller." (CR 109.4, 608.2h)', () => {
  const vines = parsed(
    'SYNTHETIC Parsed Spiteful Vines',
    'Enchantment',
    "{1}, Sacrifice this enchantment: Destroy target artifact or enchantment. This enchantment deals 2 damage to that permanent's controller.",
    { manaCost: '{R}{G}', colors: ['R', 'G'] },
  );
  const game = () =>
    scenario()
      .seat(0)
      .define(vines)
      .battlefield(vines.name, 'Forest', 'Sol Ring')
      .life(20)
      .library(...FILLER)
      .seat(1)
      .battlefield('Sol Ring')
      .life(20)
      .library(...FILLER)
      .build();

  test('the card is valid', () => {
    expect(validateCard(vines)).toEqual([]);
  });

  test('the artifact of the opponent is destroyed and its controller is dealt 2: the controller is read as the artifact was', () => {
    const g = game();
    g.act(0).activate(vines.name, { targets: [{ seat: 1, name: 'Sol Ring' }], pay: true });
    g.passAll();
    g.expect.zone('Sol Ring', 'graveyard', { seat: 1 });
    g.expect.life(1, 18);
    g.expect.life(0, 20);
    g.expect.invariants();
  });

  test('aimed at my own permanent, the damage is mine', () => {
    const g = game();
    g.act(0).activate(vines.name, { targets: [{ seat: 0, name: 'Sol Ring' }], pay: true });
    g.passAll();
    g.expect.life(0, 18);
    g.expect.life(1, 20);
  });
});

// ---- Choose a Background

describe('"Choose a Background" (CR 702.124k): a keyword that does nothing in the game', () => {
  const ganax = parsed(
    'SYNTHETIC Parsed Hunter',
    'Legendary Creature — Dragon',
    'Flying\nWhenever ~ or another Dragon you control enters, create a Treasure token.\nChoose a Background',
    { manaCost: '{4}{R}', colors: ['R'], power: '3', toughness: '4' },
  );

  test('the card is valid and has the keyword', () => {
    expect(validateCard(ganax)).toEqual([]);
    expect(ganax.faces[0]?.abilities).toContainEqual({
      kind: 'keyword',
      keyword: { kind: 'chooseBackground' },
    });
  });

  test('it plays as the creature it is: its trigger makes a Treasure and nothing else happens', () => {
    const g = scenario()
      .seat(0)
      .define(ganax)
      .hand(ganax.name)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(ganax.name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone(ganax.name, 'battlefield', { seat: 0 });
    expect(named(g, 'Treasure')).toHaveLength(1);
    g.expect.derived(ganax.name, { keywords: ['flying', 'chooseBackground'] });
    g.expect.invariants();
  });
});
