// The Sultai Arisen precon (issue 102), read by the grammar and run by the engine. Every card here is SYNTHETIC: its only text is a real line of the deck
// (the name replaced by ~), run through `applyAction` with the scenario DSL. Every synthetic name starts with "SYNTHETIC".
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const LIB = Array.from({ length: 12 }, () => 'Plains');
const base = () =>
  scenario()
    .seat(0)
    .library(...LIB)
    .seat(1)
    .library(...LIB)
    .seat(0);

const creature = (name: string, color: 'B' | 'G') =>
  parsed(name, 'Creature — Zombie', '', {
    manaCost: `{1}{${color}}`,
    power: '1',
    toughness: '1',
    colors: [color],
  });

describe('"Add {B} for each black creature card in your graveyard." (CR 106.1, 608.2c, 105.2)', () => {
  const crypt = parsed(
    'SYNTHETIC Parsed Crypt',
    'Land',
    '{T}: Add {B} for each black creature card in your graveyard.',
  );
  test('counts the black creature cards of its controller, not green ones or the opponent’s', () => {
    const b1 = creature('SYNTHETIC Black One', 'B');
    const b2 = creature('SYNTHETIC Black Two', 'B');
    const g1 = creature('SYNTHETIC Green One', 'G');
    const theirs = creature('SYNTHETIC Black Theirs', 'B');
    const g = base()
      .define(crypt)
      .define(b1)
      .define(b2)
      .define(g1)
      .define(theirs)
      .battlefield(crypt.name)
      .graveyard(b1.name, b2.name, g1.name)
      .seat(1)
      .graveyard(theirs.name)
      .seat(0)
      .at('precombatMain')
      .build();
    g.act(0).tapForMana(crypt.name);
    g.expect.pool(0, 'BB');
  });
});

describe('"Pay 1 life: Add {C}. Spend this mana only to cast a spell from your graveyard." (CR 106.6, 601.2a, 119.4)', () => {
  const lord = parsed(
    'SYNTHETIC Parsed Forsaken',
    'Creature — Demon',
    'Pay 1 life: Add {C}. Spend this mana only to cast a spell from your graveyard.',
    { manaCost: '{B}', power: '1', toughness: '1', colors: ['B'] },
  );
  const spell = parsed(
    'SYNTHETIC Parsed Grave Spell',
    'Sorcery',
    'You gain 3 life.\nFlashback {1}',
    { manaCost: '{1}', colors: [] },
  );
  test('lowers to a fromGraveyard restriction', () => {
    expect(lord.faces[0]?.abilities[0]).toMatchObject({
      kind: 'mana',
      spendOnly: { fromGraveyard: true },
    });
  });
  test('the mana pays for a spell cast from the graveyard, not one cast from the hand', () => {
    const hand = base()
      .define(lord)
      .define(spell)
      .battlefield(lord.name)
      .hand(spell.name)
      .at('precombatMain')
      .build();
    hand.act(0).tapForMana(lord.name);
    hand.expect.pool(0, 'C');
    hand.expect.life(0, 39);
    hand.expect.illegal(0, { cast: spell.name });

    const grave = base()
      .define(lord)
      .define(spell)
      .battlefield(lord.name)
      .graveyard(spell.name)
      .at('precombatMain')
      .build();
    grave.act(0).tapForMana(lord.name);
    grave.act(0).cast(spell.name, { alternative: 'flashback', pay: true });
    grave.passAll();
    grave.expect.life(0, 42);
    grave.expect.zone(spell.name, 'exile');
    grave.expect.pool(0, '');
  });
});

describe('"{T}, Sacrifice ~: Put your commander into your hand from the command zone." (CR 903.3, 400.3)', () => {
  test('the commander leaves the command zone for its owner’s hand', () => {
    const beacon = parsed(
      'SYNTHETIC Parsed Beacon',
      'Land',
      '{T}, Sacrifice ~: Put your commander into your hand from the command zone.',
    );
    const g = base()
      .define(beacon)
      .battlefield(beacon.name)
      .commander('Grizzly Bears')
      .at('precombatMain')
      .build();
    g.expect.zone('Grizzly Bears', 'command');
    g.act(0).activate(beacon.name);
    g.passAll();
    // CR 903.9b: a commander that would be put into its owner's hand may go to the command zone instead; the owner declines.
    g.expect.pending('commanderZone', 0);
    g.act(0).declineCommandZone();
    g.expect.zone('Grizzly Bears', 'hand');
    g.expect.zone(beacon.name, 'graveyard');
  });
});

describe('"Whenever a land you control enters, you may have target player lose 3 life. If you do, put three +1/+1 counters on ~." (CR 119.3, 608.2c, 122.1)', () => {
  const fiend = parsed(
    'SYNTHETIC Parsed Fallen',
    'Creature — Demon',
    'Landfall — Whenever a land you control enters, you may have target player lose 3 life. If you do, put three +1/+1 counters on ~.',
    { manaCost: '{3}{B}{B}', power: '5', toughness: '5', colors: ['B'] },
  );
  const build = () =>
    base().define(fiend).battlefield(fiend.name).hand('Forest').at('precombatMain').build();

  test('accepting: the player loses 3 life and the creature gets three counters', () => {
    const g = build();
    g.act(0).playLand('Forest[0]');
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.act(0).accept();
    g.expect.life(1, 37);
    g.expect.counters(fiend.name, { '+1/+1': 3 });
  });

  test('declining: nothing is lost and no counters are put', () => {
    const g = build();
    g.act(0).playLand('Forest[0]');
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.act(0).decline();
    g.expect.life(1, 40);
    g.expect.counters(fiend.name, {});
  });
});

describe('"Whenever ~ attacks, mill three cards. Then you may return a land card from your graveyard to the battlefield tapped." (CR 701.17, 608.2d, 110.2a)', () => {
  const teval = parsed(
    'SYNTHETIC Parsed Balance',
    'Creature — Spirit Dragon',
    'Whenever ~ attacks, mill three cards. Then you may return a land card from your graveyard to the battlefield tapped.',
    { manaCost: '{1}{B}', power: '2', toughness: '2', colors: ['B'] },
  );
  const build = () =>
    scenario()
      .seat(0)
      .define(teval)
      .battlefield(teval.name)
      .graveyard('Forest')
      .library('Island', 'Island', 'Island', 'Island', 'Island')
      .seat(1)
      .library('Plains', 'Plains')
      .seat(0)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('mills three, then the land of the graveyard returns tapped on request', () => {
    const g = build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([teval.name]);
    g.passAll();
    g.expect.zone('Island', 'graveyard', { seat: 0 });
    g.act(0).chooseCards('Forest');
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.tapped('Forest');
  });

  test('declining leaves the land in the graveyard', () => {
    const g = build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([teval.name]);
    g.passAll();
    g.act(0).chooseCards();
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
  });
});

describe('"Whenever a card leaves your graveyard during your turn, draw a card. This ability triggers only once each turn." (CR 603.2, 400.7)', () => {
  const skimmer = parsed(
    'SYNTHETIC Parsed Skimmer',
    'Creature — Bird Scout',
    'Flying\nWhenever a card leaves your graveyard during your turn, draw a card. This ability triggers only once each turn.',
    { manaCost: '{G}{U}', power: '2', toughness: '2', colors: ['G', 'U'] },
  );
  const regrowth = parsed(
    'SYNTHETIC Parsed Regrowth',
    'Sorcery',
    'Return target card from your graveyard to your hand.',
    { manaCost: '{G}', colors: ['G'] },
  );
  const build = (seat: 0 | 1) =>
    scenario()
      .seat(0)
      .define(skimmer)
      .define(regrowth)
      .battlefield(skimmer.name, 'Forest', 'Forest')
      .hand(regrowth.name)
      .graveyard('Swamp', 'Plains')
      .library('Island', 'Island', 'Island')
      .seat(1)
      .library('Plains', 'Plains')
      .seat(seat)
      .at('precombatMain', { active: seat })
      .build();

  test('a card leaving the graveyard in its controller’s turn draws a card', () => {
    const g = build(0);
    g.act(0).cast(regrowth.name, { targets: ['Swamp'], pay: true });
    g.passAll();
    g.expect.handSize(0, 2);
  });
});

describe('"Return a nonland card from your graveyard to your hand." (CR 205.2a, 608.2d)', () => {
  const regrowth = parsed(
    'SYNTHETIC Parsed Nonland Return',
    'Sorcery',
    'Return a nonland card from your graveyard to your hand.',
    { manaCost: '{G}', colors: ['G'] },
  );
  test('a land card of the graveyard is never a candidate', () => {
    const g = base()
      .define(regrowth)
      .hand(regrowth.name)
      .battlefield('Forest')
      .graveyard('Swamp', 'Lightning Bolt')
      .at('precombatMain')
      .build();
    g.act(0).cast(regrowth.name, { pay: true });
    g.passAll();
    g.expect.zone('Lightning Bolt', 'hand', { seat: 0 });
    g.expect.zone('Swamp', 'graveyard', { seat: 0 });
  });
});

describe('"{T}: Create a 2/2 black Zombie Druid creature token. Activate only during your turn and only if a card left your graveyard this turn." (CR 602.5b)', () => {
  const anchor = parsed(
    'SYNTHETIC Parsed Anchor',
    'Artifact',
    '{T}: Create a 2/2 black Zombie Druid creature token. Activate only during your turn and only if a card left your graveyard this turn.',
    { manaCost: '{2}{U}', colors: ['U'] },
  );
  const regrowth = parsed(
    'SYNTHETIC Parsed Anchor Regrowth',
    'Sorcery',
    'Return target card from your graveyard to your hand.',
    { manaCost: '{G}', colors: ['G'] },
  );
  const build = () =>
    base()
      .define(anchor)
      .define(regrowth)
      .battlefield(anchor.name, 'Forest')
      .hand(regrowth.name)
      .graveyard('Swamp')
      .at('precombatMain')
      .build();

  test('it can be activated only once a card has left the graveyard this turn', () => {
    const g = build();
    g.expect.illegal(0, { activate: anchor.name });
    g.act(0).cast(regrowth.name, { targets: ['Swamp'], pay: true });
    g.passAll();
    g.expect.legal(0, { activate: anchor.name });
    g.act(0).activate(anchor.name);
    g.passAll();
    g.expect.zone('Zombie Druid', 'battlefield', { seat: 0 });
  });
});
