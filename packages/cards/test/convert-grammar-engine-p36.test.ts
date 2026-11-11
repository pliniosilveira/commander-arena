// Parsed text is only worth something if the engine runs it as written (stage P36). These tests import SYNTHETIC cards through the grammar (never
// through a fixture), define them in an engine scenario and play them through applyAction: the Korvold deck's fetch lands, reflexive sacrifice and
// Treasure grants slice of D-177 and D-178 (ENGINE_VERSION 37). A land that sacrifices itself with a list of basic land types, a fetch land that
// untaps what it found, a spell with a second line that replaces the first, a reflexive ability that reads the creature that was sacrificed, a
// trigger for spells only, and Treasures and lands that are given abilities. Every card name starts with "SYNTHETIC"; the wording of each text is
// that of the real cards of the slice (the owner's request file of 2026-10-29, names replaced by ~). No real card's text is claimed.
import { validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const BOLT = 'Lightning Bolt';
const FILLER = Array.from({ length: 12 }, () => 'Mountain');

const named = (g: ScenarioGame, name: string) => g.find({ name });
const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

// ---- A land that sacrifices itself and fetches (CR 603.12, 701.23)

describe('"When ~ enters, sacrifice it. When you do, search your library for a basic Mountain, Forest, or Plains card, ..., then shuffle and you gain 1 life."', () => {
  const courtyard = parsed(
    'SYNTHETIC Parsed Courtyard',
    'Land',
    'When ~ enters, sacrifice it. When you do, search your library for a basic Mountain, Forest, or Plains card, put it onto the battlefield tapped, then shuffle and you gain 1 life.',
  );
  const play = () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .define(courtyard)
      .hand(courtyard.name)
      .library('Island', { label: 'island' })
      .library('Swamp', { label: 'swamp' })
      .library('Plains', { label: 'plains' })
      .library('Forest', { label: 'forest' })
      .library('Mountain', { label: 'mountain' })
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).playLand(courtyard.name);
    return g;
  };

  test('the card is valid', () => {
    expect(validateCard(courtyard)).toEqual([]);
  });

  test('the land is sacrificed, then the reflexive ability offers only the basic Mountains, Forests and Plains', () => {
    const g = play();
    g.passAll();
    g.expect.zone(courtyard.name, 'graveyard', { seat: 0 });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error('expected the search');
    expect(d.legal).toEqual([g.id('forest'), g.id('mountain'), g.id('plains')]);
  });

  test('the land found comes in tapped and you gain 1 life', () => {
    const g = play();
    g.passAll();
    g.passAll();
    g.act(0).chooseCards('forest');
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.tapped('Forest', true);
    g.expect.life(0, 21);
    g.expect.librarySize(0, 4);
    g.expect.invariants();
  });
});

describe('"{1}, {T}, Sacrifice ~: Search your library for a basic Swamp, Mountain, or Forest card, ..." (a list of types in an ability)', () => {
  const panorama = parsed(
    'SYNTHETIC Parsed Panorama',
    'Land',
    '{T}: Add {C}.\n{1}, {T}, Sacrifice ~: Search your library for a basic Swamp, Mountain, or Forest card, put it onto the battlefield tapped, then shuffle.',
  );

  test('it finds one of the three, tapped, and is sacrificed to pay for it', () => {
    const g = scenario()
      .seat(0)
      .define(panorama)
      .battlefield(panorama.name, 'Mountain')
      .library('Plains', { label: 'plains' })
      .library('Swamp', { label: 'swamp' })
      .library('Island', { label: 'island' })
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    expect(validateCard(panorama)).toEqual([]);
    g.act(0).activate(panorama.name, { ability: 1, pay: true });
    g.expect.zone(panorama.name, 'graveyard', { seat: 0 });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error('expected the search');
    expect(d.legal).toEqual([g.id('swamp')]);
    g.act(0).chooseCards('swamp');
    g.expect.tapped('Swamp', true);
  });
});

describe('"{T}, Sacrifice ~: Search ..., put it onto the battlefield tapped, then shuffle. Then if you control four or more lands, untap that land."', () => {
  const passage = parsed(
    'SYNTHETIC Parsed Passage',
    'Land',
    '{T}, Sacrifice ~: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Then if you control four or more lands, untap that land.',
  );
  const fetch = (others: number) => {
    const g = scenario()
      .seat(0)
      .define(passage)
      .battlefield(passage.name, ...Array.from({ length: others }, () => 'Forest'))
      .library('Island', { label: 'island' })
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).activate(passage.name);
    g.passAll();
    g.act(0).chooseCards('island');
    return g;
  };

  test('with three other lands the land it found is untapped', () => {
    expect(validateCard(passage)).toEqual([]);
    const g = fetch(3);
    g.expect.tapped('Island', false);
    g.expect.invariants();
  });

  test('with two other lands it stays tapped', () => {
    const g = fetch(2);
    g.expect.tapped('Island', true);
  });
});

// ---- A line that replaces the line before it (CR 608.2c, 614.1a)

describe('"Search ... for a basic land card ... \\n If there are seven or more cards in your graveyard, instead search ... for up to three basic land cards ..."', () => {
  const wanderings = parsed(
    'SYNTHETIC Parsed Wanderings',
    'Sorcery',
    'Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.\nThreshold — If there are seven or more cards in your graveyard, instead search your library for up to three basic land cards, put them onto the battlefield tapped, then shuffle.',
    { manaCost: '{2}{G}', colors: ['G'] },
  );
  const cast = (graveyard: number) => {
    const g = scenario()
      .seat(0)
      .define(wanderings)
      .hand(wanderings.name)
      .pool('GCC')
      .graveyard(...Array.from({ length: graveyard }, () => 'Plains'))
      .library('Island', { label: 'a' })
      .library('Swamp', { label: 'b' })
      .library('Forest', { label: 'c' })
      .library('Mountain', { label: 'd' })
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(wanderings.name, { pay: true });
    resolveTop(g);
    return g;
  };

  test('the card is valid', () => {
    expect(validateCard(wanderings)).toEqual([]);
  });

  test('with six cards in the graveyard it finds one land', () => {
    const g = cast(6);
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error('expected the search');
    expect(d.max).toBe(1);
    g.act(0).chooseCards('a');
    g.expect.zone('Island', 'battlefield', { seat: 0 });
  });

  test('with seven it finds up to three, all tapped, and the one-land search does not happen as well', () => {
    const g = cast(7);
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error('expected the search');
    expect(d.max).toBe(3);
    g.act(0).chooseCards('a', 'b', 'c');
    g.expect.tapped('Island', true);
    g.expect.tapped('Swamp', true);
    g.expect.tapped('Forest', true);
    g.expect.pending('priority', 0);
    expect(named(g, 'Mountain').filter((o) => o.zone === 'battlefield')).toHaveLength(0);
  });
});

// ---- A reflexive ability that reads the creature that was sacrificed (CR 603.12, 608.2h)

describe('"At the beginning of your end step, you may sacrifice another creature. When you do, ~ deals damage equal to that creature\'s power to any target and you create three Treasure tokens."', () => {
  const incinerator = parsed(
    'SYNTHETIC Parsed Incinerator',
    'Legendary Creature — Demon Dragon',
    "Flying\nAt the beginning of your end step, you may sacrifice another creature. When you do, ~ deals damage equal to that creature's power to any target and you create three Treasure tokens.",
    { manaCost: '{3}{B}{R}{G}', colors: ['B', 'R', 'G'], power: '6', toughness: '6' },
  );
  const endStep = () => {
    const g = scenario()
      .seat(0)
      .define(incinerator)
      .battlefield(incinerator.name, ANGEL, BEARS)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.advanceTo('end');
    g.passAll();
    return g;
  };

  test('the card is valid', () => {
    expect(validateCard(incinerator)).toEqual([]);
  });

  test('the damage is the power of the creature that was sacrificed, and three Treasures come', () => {
    const g = endStep();
    g.act(0).accept();
    g.act(0).choosePermanents(ANGEL);
    g.act(0).chooseTargets({ player: 1 });
    resolveTop(g);
    g.expect.life(1, 16);
    expect(named(g, 'Treasure')).toHaveLength(3);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('a creature of power 2 deals 2', () => {
    const g = endStep();
    g.act(0).accept();
    g.act(0).choosePermanents(BEARS);
    g.act(0).chooseTargets({ player: 1 });
    resolveTop(g);
    g.expect.life(1, 18);
  });

  test('declining sacrifices nothing', () => {
    const g = endStep();
    g.act(0).decline();
    g.expect.zone(ANGEL, 'battlefield', { seat: 0 });
    expect(named(g, 'Treasure')).toHaveLength(0);
  });
});

// ---- Spells only, and abilities given to a group (CR 603.2, 613.1f)

describe('"Whenever ~ attacks or becomes the target of a spell, create a Treasure token." and "Treasures you control have ..."', () => {
  const dragon = parsed(
    'SYNTHETIC Parsed Hoard Dragon',
    'Creature — Dragon',
    'Flying, haste\nWhenever ~ attacks or becomes the target of a spell, create a Treasure token.\nTreasures you control have "{T}, Sacrifice this artifact: Add two mana of any one color."',
    { manaCost: '{3}{R}{R}', colors: ['R'], power: '4', toughness: '4' },
  );
  const board = () =>
    scenario()
      .seat(0)
      .define(dragon)
      .battlefield(dragon.name)
      .library(...FILLER)
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain', 'SYNTHETIC Pinger')
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('the card is valid', () => {
    expect(validateCard(dragon)).toEqual([]);
  });

  test('attacking makes a Treasure', () => {
    const g = board();
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: dragon.name }]);
    g.passAll();
    expect(named(g, 'Treasure')).toHaveLength(1);
  });

  test("an opponent's spell that targets it makes a Treasure", () => {
    const g = board();
    g.pass();
    g.act(1).cast(BOLT, { targets: [dragon.name], pay: true });
    g.expect.stack([`${dragon.name} (ability)`, BOLT]);
    g.passAll();
    expect(named(g, 'Treasure')).toHaveLength(1);
  });

  test('an ability that targets it does not', () => {
    const g = board();
    g.pass();
    g.act(1).activate('SYNTHETIC Pinger', { targets: [dragon.name] });
    g.expect.stack(['SYNTHETIC Pinger (ability)']);
    g.passAll();
    expect(named(g, 'Treasure')).toHaveLength(0);
  });

  test('the Treasure has the given ability: it is sacrificed for two mana of one color', () => {
    const g = board();
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: dragon.name }]);
    g.passAll();
    g.act(0).tapForMana('Treasure', { ability: 1, color: 'R' });
    g.expect.pool(0, 'RR');
    expect(named(g, 'Treasure')).toHaveLength(0);
  });
});

describe('"Lands you control have \\"{T}: Create a Treasure token.\\""', () => {
  const stash = parsed(
    'SYNTHETIC Parsed Stash',
    'Artifact',
    'Lands you control have "{T}: Create a Treasure token."',
    { manaCost: '{5}{G}', colors: ['G'] },
  );

  test('every land of mine can be tapped for a Treasure', () => {
    const g = scenario()
      .seat(0)
      .define(stash)
      .battlefield(stash.name, 'Forest', 'Swamp')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    expect(validateCard(stash)).toEqual([]);
    g.act(0).activate('Forest', { ability: 1 });
    g.act(0).activate('Swamp', { ability: 1 });
    g.passAll();
    expect(named(g, 'Treasure')).toHaveLength(2);
    g.expect.tapped('Forest', true);
    g.expect.tapped('Swamp', true);
    g.expect.invariants();
  });
});
