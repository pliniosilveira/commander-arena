// The Revival Trance deck (issue 97), group A, read by the grammar and run by the engine. Every card here is SYNTHETIC: its only text is a real line of the deck
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

describe('"When ~ enters, discard any number of cards, then draw that many cards plus one." (CR 701.9, 608.2c, 121.1)', () => {
  const celes = parsed(
    'SYNTHETIC Parsed Rune Knight',
    'Creature — Human Knight',
    'When ~ enters, discard any number of cards, then draw that many cards plus one.',
    { manaCost: '{W}', power: '1', toughness: '1', colors: ['W'] },
  );
  const build = () =>
    base()
      .define(celes)
      .hand(celes.name, 'Forest', 'Forest', 'Island')
      .battlefield('Plains')
      .at('precombatMain')
      .build();

  test('discarding two cards draws three', () => {
    const g = build();
    g.act(0).cast(celes.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards('Forest[0]', 'Forest[1]');
    g.expect.handSize(0, 4);
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('discarding nothing still draws one', () => {
    const g = build();
    g.act(0).cast(celes.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards();
    g.expect.handSize(0, 4);
    g.expect.invariants();
  });
});

describe('"Whenever ~ or another creature enters from your graveyard, that creature deals damage equal to its power to any target." (CR 603.6a, 400.7, 404.1, 120.3)', () => {
  const flayer = parsed(
    'SYNTHETIC Parsed Flayer',
    'Creature — Vampire',
    'Undying\nWhenever ~ or another creature enters from your graveyard, that creature deals damage equal to its power to any target.',
    { manaCost: '{3}{B}', power: '3', toughness: '3', colors: ['B'] },
  );
  const raise = parsed(
    'SYNTHETIC Parsed Raise',
    'Sorcery',
    'Return target creature card from your graveyard to the battlefield.',
    { manaCost: '{B}', colors: ['B'] },
  );
  const steal = parsed(
    'SYNTHETIC Parsed Steal Raise',
    'Sorcery',
    'Return target creature card from a graveyard to the battlefield under your control.',
    { manaCost: '{B}', colors: ['B'] },
  );
  const cheap = parsed('SYNTHETIC Parsed Cheap', 'Creature — Human', '', {
    manaCost: '{B}',
    power: '2',
    toughness: '2',
    colors: ['B'],
  });

  test('lowers to two enters triggers from the controller graveyard', () => {
    expect(flayer.faces[0]?.abilities).toMatchObject([
      { kind: 'keyword' },
      {
        kind: 'triggered',
        trigger: {
          kind: 'entersBattlefield',
          what: { kind: 'this' },
          fromGraveyard: true,
          graveyardOwner: 'you',
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', fromGraveyard: true, graveyardOwner: 'you' },
      },
    ]);
  });

  test('another creature of mine raised from my graveyard deals damage equal to its power', () => {
    const g = base()
      .define(flayer)
      .define(raise)
      .define(cheap)
      .battlefield(flayer.name)
      .hand(raise.name)
      .graveyard(cheap.name)
      .battlefield('Swamp')
      .at('precombatMain')
      .build();
    g.act(0).cast(raise.name, { pay: true, targets: [{ name: cheap.name, zone: 'graveyard' }] });
    g.passAll();
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.zone(cheap.name, 'battlefield', { seat: 0 });
    g.expect.life(1, 38);
    g.expect.invariants();
  });

  test('a creature put onto the battlefield from my hand does not trigger it', () => {
    const g = base()
      .define(flayer)
      .define(cheap)
      .battlefield(flayer.name)
      .hand(cheap.name)
      .battlefield('Swamp')
      .at('precombatMain')
      .build();
    g.act(0).cast(cheap.name, { pay: true });
    g.passAll();
    g.expect.zone(cheap.name, 'battlefield', { seat: 0 });
    g.expect.life(1, 40);
    g.expect.pending('priority', 0);
  });

  test('a creature of an opponent raised from their graveyard is not from my graveyard', () => {
    const g = base()
      .define(flayer)
      .define(steal)
      .define(cheap)
      .battlefield(flayer.name)
      .hand(steal.name)
      .battlefield('Swamp')
      .seat(1)
      .graveyard(cheap.name)
      .seat(0)
      .at('precombatMain')
      .build();
    g.act(0).cast(steal.name, {
      pay: true,
      targets: [{ name: cheap.name, zone: 'graveyard', seat: 1 }],
    });
    g.passAll();
    // It is under my control (seat 0) though its owner is seat 1.
    g.expect.zone(cheap.name, 'battlefield', { seat: 0 });
    g.expect.life(1, 40);
    g.expect.pending('priority', 0);
  });

  test('itself returning from my graveyard with undying deals damage equal to its power with the counter', () => {
    const g = base()
      .define(flayer)
      .battlefield(flayer.name)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .at('precombatMain')
      .build();
    g.act(0).cast('Lightning Bolt', { pay: true, targets: [{ name: flayer.name }] });
    g.passAll();
    // Undying returns it with a +1/+1 counter, a 4/4 that came from my graveyard.
    g.expect.counters(flayer.name, { '+1/+1': 1 });
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 36);
    g.expect.invariants();
  });
});

describe('"Whenever you attack with one or more legendary creatures, you may pay {2}{B}. If you do, return this card from your graveyard to the battlefield tapped and attacking." (CR 508.4, 113.6b, 603.2c)', () => {
  const hound = parsed(
    'SYNTHETIC Parsed Hound',
    'Legendary Creature — Dog',
    'Menace\nAssassins you control have menace.\nWhenever you attack with one or more legendary creatures, you may pay {2}{B}. If you do, return this card from your graveyard to the battlefield tapped and attacking.',
    { manaCost: '{3}{B}', power: '3', toughness: '3', colors: ['B'] },
  );
  const legend = parsed('SYNTHETIC Parsed Legend', 'Legendary Creature — Human', '', {
    manaCost: '{1}{B}',
    power: '2',
    toughness: '2',
    colors: ['B'],
  });
  const plain = parsed('SYNTHETIC Parsed Plain', 'Creature — Human', '', {
    manaCost: '{1}{B}',
    power: '2',
    toughness: '2',
    colors: ['B'],
  });
  const build = (attacker: string) =>
    base()
      .define(hound)
      .define(legend)
      .define(plain)
      .battlefield(attacker, 'Swamp', 'Swamp', 'Swamp')
      .graveyard(hound.name)
      .at('precombatMain', { active: 0 })
      .build();
  const attack = (attacker: string) => {
    const g = build(attacker);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker }]);
    g.passAll();
    return g;
  };

  test('lowers to a payment and a return that enters attacking, working from the graveyard', () => {
    expect(hound.faces[0]?.abilities[2]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'attackBatch', what: { supertypes: ['legendary'], types: ['creature'] } },
      effect: {
        kind: 'mayPay',
        effect: {
          kind: 'sequence',
          effects: [{ kind: 'moveToZone', tapped: true }, { kind: 'enterAttacking' }],
        },
      },
      functionsIn: 'graveyard',
    });
  });

  test('paying returns it tapped and attacking, never declared as an attacker', () => {
    const g = attack(legend.name);
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.zone(hound.name, 'battlefield', { seat: 0 });
    g.expect.tapped(hound.name);
    g.expect.combat({ attackers: [legend.name, hound.name] });
    g.expect.invariants();
  });

  test('declining leaves it in the graveyard', () => {
    const g = attack(legend.name);
    g.act(0).decline();
    g.expect.zone(hound.name, 'graveyard', { seat: 0 });
    g.expect.combat({ attackers: [legend.name] });
  });

  test('an attack with no legendary creature does not trigger it', () => {
    const g = attack(plain.name);
    expect(g.state.pending?.kind).not.toBe('mayPay');
    g.expect.zone(hound.name, 'graveyard', { seat: 0 });
  });
});

describe('"Pray — Once during each of your turns, you may cast a creature spell from among cards in your graveyard that were put there from anywhere other than the battlefield this turn." (CR 601.2a, 404.1, 400.7)', () => {
  const banon = parsed(
    'SYNTHETIC Parsed Returners',
    'Legendary Creature — Human Noble',
    'Pray — Once during each of your turns, you may cast a creature spell from among cards in your graveyard that were put there from anywhere other than the battlefield this turn.',
    { manaCost: '{1}{W}', power: '1', toughness: '1', colors: ['W'] },
  );
  const discard = parsed('SYNTHETIC Parsed Discard', 'Sorcery', 'Discard a card.', {
    manaCost: '{B}',
    colors: ['B'],
  });
  const mill = parsed('SYNTHETIC Parsed Mill', 'Sorcery', 'Mill two cards.', {
    manaCost: '{B}',
    colors: ['B'],
  });
  const bear = (name: string) =>
    parsed(name, 'Creature — Bear', '', {
      manaCost: '{B}',
      power: '2',
      toughness: '2',
      colors: ['B'],
    });
  const one = bear('SYNTHETIC Parsed Bear One');
  const two = bear('SYNTHETIC Parsed Bear Two');
  const build = (build: (b: ReturnType<typeof base>) => ReturnType<typeof base>) =>
    build(
      base()
        .define(banon)
        .define(discard)
        .define(mill)
        .define(one)
        .define(two)
        .battlefield(banon.name, 'Swamp', 'Swamp', 'Swamp', 'Swamp'),
    )
      .at('precombatMain', { active: 0 })
      .build();

  test('lowers to a once-each-turn graveyard cast of creature spells put there elsewhere', () => {
    expect(banon.faces[0]?.abilities).toMatchObject([
      {
        kind: 'static',
        static: {
          kind: 'playFromGraveyardOnceEachTurn',
          cast: { types: ['creature'] },
          putElsewhereThisTurn: true,
        },
      },
    ]);
  });

  test('a creature card discarded this turn may be cast from the graveyard', () => {
    const g = build((b) => b.hand(discard.name, one.name));
    g.act(0).cast(discard.name, { pay: true });
    g.passAll();
    g.expect.zone(one.name, 'graveyard', { seat: 0 });
    g.act(0).cast(one.name, { pay: true, from: 'graveyard' });
    g.passAll();
    g.expect.zone(one.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('a creature card milled this turn may be cast, but only one a turn (once during each of your turns)', () => {
    const g = scenario()
      .define(banon)
      .define(mill)
      .define(one)
      .define(two)
      .seat(0)
      .library(one.name, two.name, ...LIB)
      .hand(mill.name)
      .battlefield(banon.name, 'Swamp', 'Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .library(...LIB)
      .seat(0)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(mill.name, { pay: true });
    g.passAll();
    g.act(0).cast(one.name, { pay: true, from: 'graveyard' });
    g.passAll();
    g.expect.zone(one.name, 'battlefield', { seat: 0 });
    g.expect.illegal(0, { cast: two.name });
  });

  test('a creature card that died this turn, or was there before it, may not be cast', () => {
    const g = build((b) =>
      b.hand('Lightning Bolt').graveyard(two.name).battlefield(one.name, 'Mountain'),
    );
    g.act(0).cast('Lightning Bolt', { pay: true, targets: [{ name: one.name }] });
    g.passAll();
    g.expect.zone(one.name, 'graveyard', { seat: 0 });
    g.expect.illegal(0, { cast: one.name });
    g.expect.illegal(0, { cast: two.name });
  });
});
