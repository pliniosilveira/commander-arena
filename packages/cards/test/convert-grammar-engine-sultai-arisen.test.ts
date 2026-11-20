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

describe('River Kelpie: "Whenever ~ or another permanent enters from a graveyard, draw a card." and "Whenever a player casts a spell from a graveyard, draw a card." (CR 603.6a, 601.2a)', () => {
  const kelpie = parsed(
    'SYNTHETIC Parsed Kelpie',
    'Creature — Beast',
    'Whenever ~ or another permanent enters from a graveyard, draw a card.\nWhenever a player casts a spell from a graveyard, draw a card.',
    { manaCost: '{3}{U}{U}', power: '3', toughness: '3', colors: ['U'] },
  );
  const reanimate = parsed(
    'SYNTHETIC Parsed Reanimate',
    'Sorcery',
    'Return target creature card from your graveyard to the battlefield.',
    { manaCost: '{B}', colors: ['B'] },
  );
  const flashbackSpell = parsed(
    'SYNTHETIC Parsed Flash Spell',
    'Sorcery',
    'You gain 1 life.\nFlashback {1}',
    { manaCost: '{1}', colors: [] },
  );
  const build = () =>
    base()
      .define(kelpie)
      .define(reanimate)
      .define(flashbackSpell)
      .battlefield(kelpie.name, 'Swamp', 'Swamp', 'Swamp')
      .hand(reanimate.name, 'Grizzly Bears')
      .graveyard('Serra Angel', flashbackSpell.name)
      .library('Island', 'Island', 'Island', 'Island')
      .at('precombatMain')
      .build();

  test('a permanent that enters from a graveyard draws a card; one cast from the hand does not', () => {
    const g = build();
    g.act(0).cast(reanimate.name, { targets: ['Serra Angel'], pay: true });
    g.passAll();
    g.expect.zone('Serra Angel', 'battlefield', { seat: 0 });
    g.expect.handSize(0, 2);
  });

  test('a spell cast from a graveyard draws a card', () => {
    const g = build();
    g.act(0).cast(flashbackSpell.name, { alternative: 'flashback', pay: true });
    g.passAll();
    g.expect.handSize(0, 3);
  });
});

const onBattlefield = (state: { objects: Readonly<Record<string, { zone: string }>> }) =>
  Object.values(state.objects).filter((o) => o.zone === 'battlefield').length;

describe('"Draw two cards, then discard a card and you lose 2 life. Create X tapped 2/2 black Zombie Druid creature tokens, where X is the number of cards that were put into your graveyard from your hand or library this turn." (CR 404.1, 701.9, 701.17)', () => {
  const dead = parsed(
    'SYNTHETIC Parsed Welcome',
    'Sorcery',
    'Draw two cards, then discard a card and you lose 2 life. Create X tapped 2/2 black Zombie Druid creature tokens, where X is the number of cards that were put into your graveyard from your hand or library this turn.',
    { manaCost: '{3}{B}', colors: ['B'] },
  );
  const mill = parsed('SYNTHETIC Parsed Welcome Mill', 'Sorcery', 'Mill two cards.', {
    manaCost: '{U}',
    colors: ['U'],
  });
  const build = () =>
    base()
      .define(dead)
      .define(mill)
      .hand(dead.name, mill.name)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Island')
      .library('Island', 'Island', 'Island', 'Island', 'Island')
      .at('precombatMain')
      .build();

  test('the discarded card is the one card put into the graveyard this turn from the hand', () => {
    const g = build();
    g.act(0).cast(dead.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Plains[0]');
    g.expect.life(0, 38);
    expect(onBattlefield(g.state)).toBe(5 + 1);
  });

  test('cards milled earlier in the turn count as well', () => {
    const g = build();
    g.act(0).cast(mill.name, { pay: true });
    g.passAll();
    g.act(0).cast(dead.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards('Plains[0]');
    expect(onBattlefield(g.state)).toBe(5 + 3);
  });
});

describe('"{1}{G}, {T}, Return ~ to its owner’s hand: Reveal the top four cards of your library. You may put a land card from among them onto the battlefield tapped. Put the rest into your graveyard." (CR 701.20a, 110.2a)', () => {
  const snake = parsed(
    'SYNTHETIC Parsed Snake',
    'Legendary Enchantment Creature — Snake Druid',
    "{1}{G}, {T}, Return ~ to its owner's hand: Reveal the top four cards of your library. You may put a land card from among them onto the battlefield tapped. Put the rest into your graveyard.",
    { manaCost: '{1}{G}', power: '1', toughness: '1', colors: ['G'] },
  );
  const build = () =>
    scenario()
      .seat(0)
      .define(snake)
      .battlefield(snake.name, 'Forest', 'Forest')
      .library('Forest', 'Lightning Bolt', 'Serra Angel', 'Grizzly Bears', 'Plains', 'Plains')
      .seat(1)
      .library('Plains', 'Plains')
      .seat(0)
      .at('precombatMain')
      .build();

  test('one land is put onto the battlefield tapped, the rest go to the graveyard', () => {
    const g = build();
    g.act(0).activate(snake.name).pay();
    g.passAll();
    g.act(0).chooseCards({ name: 'Forest', zone: 'library' });
    g.expect.zone(snake.name, 'hand', { seat: 0 });
    expect(onBattlefield(g.state)).toBe(3);
    g.expect.tapped({ name: 'Forest', zone: 'battlefield', nth: 2 });
    g.expect.zone('Lightning Bolt', 'graveyard', { seat: 0 });
    g.expect.zone('Serra Angel', 'graveyard', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
  });
});

describe('"{X}, {T}, Exile X cards from your graveyard: Target creature gets -X/-X until end of turn." (CR 107.3a, 602.2b, 118.3)', () => {
  const fiend = parsed(
    'SYNTHETIC Parsed Fiend',
    'Creature — Demon',
    '{X}, {T}, Exile X cards from your graveyard: Target creature gets -X/-X until end of turn.',
    { manaCost: '{7}{B}{B}', power: '5', toughness: '5', colors: ['B'] },
  );
  const build = () =>
    base()
      .define(fiend)
      .battlefield(fiend.name, 'Swamp', 'Swamp', 'Swamp')
      .graveyard('Plains', 'Plains', 'Forest')
      .seat(1)
      .battlefield('Serra Angel')
      .seat(0)
      .at('precombatMain')
      .build();

  test('X cards leave the graveyard and the target gets -X/-X', () => {
    const g = build();
    g.act(0).activate(fiend.name).x(2).targets(['Serra Angel']).pay();
    g.act(0).chooseCards('Plains[0]', 'Plains[1]');
    g.passAll();
    g.expect.pt('Serra Angel', 2, 2);
    expect(g.state.exile).toHaveLength(2);
  });
});

describe('"Convoke. Destroy target creature or planeswalker. Each creature that convoked ~ connives." (CR 702.51a, 701.50a)', () => {
  const scheme = parsed(
    'SYNTHETIC Parsed Scheme',
    'Instant',
    "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nDestroy target creature or planeswalker. Each creature that convoked ~ connives.",
    { manaCost: '{2}{B}{B}', colors: ['B'] },
  );
  const build = () =>
    scenario()
      .seat(0)
      .define(scheme)
      .hand(scheme.name)
      .battlefield('Grizzly Bears', 'Grizzly Bears', 'Swamp', 'Swamp')
      .library('Island', 'Island', 'Island', 'Island')
      .seat(1)
      .battlefield('Serra Angel')
      .library('Plains', 'Plains')
      .seat(0)
      .at('precombatMain')
      .build();

  test('the creatures that were tapped for convoke connive, the others do not', () => {
    const g = build();
    g.act(0)
      .cast(scheme.name, { targets: ['Serra Angel'] })
      .payOptions('Grizzly Bears[0]', 'Grizzly Bears[1]')
      .pay();
    g.passAll();
    g.expect.zone('Serra Angel', 'graveyard', { seat: 1 });
    // CR 701.50d: with two creatures conniving the controller chooses which one goes first.
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents('Grizzly Bears[0]');
    // Each draws a card and discards it (the only card in hand: no choice to make).
    g.expect.handSize(0, 0);
    g.expect.zone('Island', 'graveyard', { seat: 0 });
  });
});

describe('"Return target creature card from your graveyard to the battlefield. It’s a Zombie in addition to its other types." (CR 205.1b, 205.3m, 611.2a)', () => {
  const rise = parsed(
    'SYNTHETIC Parsed Rise',
    'Sorcery',
    "Return target creature card from your graveyard to the battlefield. It's a Zombie in addition to its other types.",
    { manaCost: '{B}', colors: ['B'] },
  );
  test('the returned creature keeps its types and is a Zombie for good', () => {
    const g = base()
      .define(rise)
      .hand(rise.name)
      .battlefield('Swamp')
      .graveyard('Serra Angel')
      .at('precombatMain')
      .build();
    g.act(0).cast(rise.name, { targets: ['Serra Angel'], pay: true });
    g.passAll();
    g.expect.zone('Serra Angel', 'battlefield', { seat: 0 });
    const view = g.view(0);
    const angel = view.battlefield.find((o) => o.name === 'Serra Angel');
    expect(angel?.subtypes).toEqual(expect.arrayContaining(['Angel', 'Zombie']));
  });
});

describe('"Whenever one or more creature cards are put into your graveyard from your library, put one of them onto the battlefield." (CR 603.2c, 608.2d, 110.2a)', () => {
  const reaver = parsed(
    'SYNTHETIC Parsed Reaver',
    'Creature — Dragon',
    'Whenever one or more creature cards are put into your graveyard from your library, put one of them onto the battlefield.',
    { manaCost: '{6}{B}{G}', power: '6', toughness: '6', colors: ['B', 'G'] },
  );
  const mill = parsed('SYNTHETIC Parsed Reaver Mill', 'Sorcery', 'Mill three cards.', {
    manaCost: '{U}',
    colors: ['U'],
  });
  const build = (library: readonly string[]) =>
    scenario()
      .seat(0)
      .define(reaver)
      .define(mill)
      .battlefield(reaver.name, 'Island')
      .hand(mill.name)
      .library(...library)
      .seat(1)
      .library('Plains', 'Plains')
      .seat(0)
      .at('precombatMain')
      .build();

  test('the controller chooses one of the creature cards milled and it enters', () => {
    const g = build(['Grizzly Bears', 'Serra Angel', 'Island', 'Island', 'Island']);
    g.act(0).cast(mill.name, { pay: true });
    g.passAll();
    g.passAll();
    g.act(0).chooseCards('Serra Angel');
    g.expect.zone('Serra Angel', 'battlefield', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
  });

  test('with no creature card milled nothing happens', () => {
    const g = build(['Island', 'Island', 'Island', 'Island']);
    g.act(0).cast(mill.name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone('Island', 'graveyard', { seat: 0 });
  });
});
