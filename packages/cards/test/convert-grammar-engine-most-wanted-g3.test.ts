// Most Wanted deck, group 3 (counters and tokens): Aetherborn Marauder, Bounty Board, Mari, the Killing Quill, Kamber, the Plunderer and Angelic Sell-Sword. Each card is read from its real
// Oracle text (the card data of the deck support issue; the golden corpus does not hold these cards, so the cards are built here by name, type line and text, as a SYNTHETIC copy of the
// printed card) through the grammar as a card with no override, defined in an engine scenario and played through applyAction, so the nodes the parser writes are what the engine runs.
// Pins: CR 122.5 (moving a counter) and 122.6 (counters are put on a permanent as it is moved to), CR 122.1 (counters stay on a card in exile), CR 603.10a (a creature that died is read
// as it last was: the bounty counter it had), CR 603.4 (intervening "if": checked as the ability triggers and again as it resolves), CR 111.10g (Blood), CR 102.2 and 108.3 (opponents).
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const BOLT = 'Lightning Bolt';
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

const AETHERBORN = parsed(
  'Aetherborn Marauder',
  'Creature — Aetherborn Rogue',
  'Flying, lifelink\nWhen this creature enters, move any number of +1/+1 counters from other permanents you control onto this creature.',
  { manaCost: '{3}{B}', power: '2', toughness: '2', colors: ['B'] },
);
const BOARD = parsed(
  'Bounty Board',
  'Artifact',
  '{T}: Add one mana of any color.\n{1}, {T}: Put a bounty counter on target creature. Activate only as a sorcery.\nWhenever a creature with a bounty counter on it dies, each of its controller’s opponents draws a card and gains 2 life.',
  { manaCost: '{3}' },
);
const MARI = parsed(
  'Mari, the Killing Quill',
  'Legendary Creature — Vampire Assassin',
  'Whenever a creature an opponent controls dies, exile it with a hit counter on it.\nAssassins, Mercenaries, and Rogues you control have deathtouch and "Whenever this creature deals combat damage to a player, you may remove a hit counter from a card that player owns in exile. If you do, draw a card and create two Treasure tokens."',
  { manaCost: '{1}{B}{B}', power: '3', toughness: '2', colors: ['B'] },
);
const KAMBER = parsed(
  'Kamber, the Plunderer',
  'Legendary Creature — Vampire Rogue',
  'Partner with Laurine, the Diversion (When this creature enters, target player may put Laurine into their hand from their library, then shuffle.)\nLifelink\nWhenever a creature an opponent controls dies, you gain 1 life and create a Blood token. (It’s an artifact with "{1}, {T}, Discard a card, Sacrifice this token: Draw a card.")',
  { manaCost: '{3}{B}', power: '3', toughness: '4', colors: ['B'] },
);
const ANGEL = parsed(
  'Angelic Sell-Sword',
  'Creature — Angel Mercenary',
  'Flying, vigilance\nWhenever this creature or another nontoken creature you control enters, create a 1/1 red Mercenary creature token with "{T}: Target creature you control gets +1/+0 until end of turn. Activate only as a sorcery."\nWhenever this creature attacks, if its power is 6 or greater, draw a card.',
  { manaCost: '{4}{W}', power: '4', toughness: '4', colors: ['W'] },
);
const ROGUE = parsed('SYNTHETIC Test Rogue', 'Creature — Human Rogue', '', {
  manaCost: '{1}{B}',
  power: '2',
  toughness: '2',
  colors: ['B'],
});
const SHRINK = parsed(
  'SYNTHETIC Shrink',
  'Instant',
  'Target creature gets -3/-3 until end of turn.',
  {
    manaCost: '{B}',
    colors: ['B'],
  },
);

const handSize = (g: ScenarioGame, seat: 0 | 1 | 2 = 0) => g.state.seats[seat]?.hand.length ?? 0;
const named = (g: ScenarioGame, name: string, zone: 'battlefield' | 'exile', seat: 0 | 1 | 2) =>
  g.find({ name, zone, seat });

describe('Aetherborn Marauder (CR 122.5, 122.6)', () => {
  test('the card reads and is the engine shape: move any number of +1/+1 counters from other permanents you control', () => {
    expect(AETHERBORN.faces[0]?.abilities[2]).toEqual({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: {
        kind: 'moveCounter',
        from: { kind: 'each', filter: { zone: 'battlefield', other: true, controller: 'you' } },
        to: { kind: 'this' },
        anyNumber: true,
        counter: '+1/+1',
      },
    });
  });

  const start = () =>
    scenario()
      .define(AETHERBORN)
      .seat(0)
      .library(...FILLER)
      .hand(AETHERBORN.name)
      .pool('CCCB')
      .battlefield(BEARS, { label: 'bears', counters: { '+1/+1': 2, charge: 1 } })
      .battlefield(SPIDER, { label: 'spider', counters: { '+1/+1': 1 } })
      .seat(1)
      .library(...FILLER)
      .battlefield(BEARS, { label: 'theirs', counters: { '+1/+1': 3 } })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  const enter = (g: ScenarioGame) => {
    g.act(0).cast(AETHERBORN.name).pay();
    g.passAll();
  };

  test('the controller moves counters one at a time, choosing the permanent each time and when to stop', () => {
    const g = start();
    enter(g);
    // Only +1/+1 counters of their own permanents are offered: not the charge counter, not the opponent's.
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('+1/+1 counter on Grizzly Bears (yours)');
    g.act(0).chooseOption('+1/+1 counter on Giant Spider (yours)');
    g.act(0).chooseOption('+1/+1 counter on Grizzly Bears (yours)');
    // Nothing is left to take: the question is not asked again.
    g.expect.counters(AETHERBORN.name, { '+1/+1': 3 });
    g.expect.counters('bears', { charge: 1 });
    g.expect.counters('spider', {});
    g.expect.counters('theirs', { '+1/+1': 3 });
    g.expect.pt(AETHERBORN.name, 5, 5);
    g.expect.pt('bears', 2, 2);
    g.expect.invariants();
  });

  test('the controller may move none (the ruling: zero counters is a choice)', () => {
    const g = start();
    enter(g);
    g.act(0).chooseOption('Done');
    g.expect.counters(AETHERBORN.name, {});
    g.expect.counters('bears', { '+1/+1': 2, charge: 1 });
    g.expect.counters('spider', { '+1/+1': 1 });
    g.expect.invariants();
  });

  test('the controller may stop after some: the rest stay where they were', () => {
    const g = start();
    enter(g);
    g.act(0).chooseOption('+1/+1 counter on Giant Spider (yours)');
    g.act(0).chooseOption('Done');
    g.expect.counters(AETHERBORN.name, { '+1/+1': 1 });
    g.expect.counters('spider', {});
    g.expect.counters('bears', { '+1/+1': 2, charge: 1 });
  });

  test('taking counters off a damaged creature can kill it (CR 704.5g)', () => {
    const g = scenario()
      .define(AETHERBORN)
      .seat(0)
      .library(...FILLER)
      .hand(AETHERBORN.name)
      .pool('CCCB')
      .battlefield(BEARS, { label: 'bears', counters: { '+1/+1': 1 }, damage: 2 })
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    enter(g);
    // Only one counter can go: with no choice between permanents or kinds, it is the only option of the question (stopping is the other).
    g.act(0).chooseOption('+1/+1 counter on Grizzly Bears (yours)');
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.counters(AETHERBORN.name, { '+1/+1': 1 });
  });

  test('with no +1/+1 counter on another permanent nothing is asked', () => {
    const g = scenario()
      .define(AETHERBORN)
      .seat(0)
      .library(...FILLER)
      .hand(AETHERBORN.name)
      .pool('CCCB')
      .battlefield(BEARS, { counters: { charge: 2 } })
      .seat(1)
      .library(...FILLER)
      .battlefield(SPIDER, { counters: { '+1/+1': 2 } })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    enter(g);
    g.expect.stack([]);
    g.expect.counters(AETHERBORN.name, {});
  });
});

describe('Bounty Board (CR 603.10a, 102.2)', () => {
  test('the card reads: the opponents of the controller of the creature that died', () => {
    expect(BOARD.faces[0]?.abilities[2]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'dies', what: { types: ['creature'], hasCounter: 'bounty' } },
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'draw',
            player: { kind: 'eachPlayerExcept', except: { kind: 'controllerOf' } },
            count: 1,
          },
          { kind: 'gainLife', amount: 2 },
        ],
      },
    });
  });

  const table = (seats: 2 | 3 = 3) =>
    scenario({ seats })
      .define(BOARD)
      .seat(0)
      .library(...FILLER)
      .hand(BOLT)
      .pool('R')
      .battlefield(BOARD.name, { label: 'board' })
      .seat(1)
      .library(...FILLER)
      .battlefield(BEARS, { label: 'marked', counters: { bounty: 1 } })
      .battlefield(SPIDER, { label: 'plain' });

  test('every opponent of the controller of the creature draws a card and gains 2 life; its controller does not', () => {
    const g = table()
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(BOLT).targets(['marked']).pay();
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    // The Board's controller (seat 0) and the third player (seat 2) are opponents of the creature's controller (seat 1).
    expect([handSize(g, 0), handSize(g, 1), handSize(g, 2)]).toEqual([1, 0, 1]);
    g.expect.life(0, 42);
    g.expect.life(1, 40);
    g.expect.life(2, 42);
    g.expect.invariants();
  });

  test('a creature with no bounty counter dying does nothing', () => {
    const g = table()
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(BOLT).targets(['plain']).pay();
    g.passAll();
    expect([handSize(g, 0), handSize(g, 1), handSize(g, 2)]).toEqual([0, 0, 0]);
    g.expect.life(0, 40);
  });

  test('the counter is read as the creature last had it, wherever it came from: a Board of another player triggers too (ruling 2024-04-12)', () => {
    const g = scenario({ seats: 3 })
      .define(BOARD)
      .seat(0)
      .library(...FILLER)
      .hand(BOLT)
      .pool('R')
      .battlefield(BOARD.name)
      .seat(1)
      .library(...FILLER)
      .battlefield(BOARD.name)
      .seat(2)
      .library(...FILLER)
      .battlefield(BEARS, { label: 'marked', counters: { bounty: 1 } })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(BOLT).targets(['marked']).pay();
    g.passAll();
    // Two Boards, two triggers: seats 0 and 1 each draw two cards and gain 4 life; the creature's controller gets nothing.
    expect([handSize(g, 0), handSize(g, 1), handSize(g, 2)]).toEqual([2, 2, 0]);
    g.expect.life(0, 44);
    g.expect.life(1, 44);
    g.expect.life(2, 40);
  });

  test('{1}, {T}: a bounty counter on target creature, at sorcery speed', () => {
    const g = table(2).at('precombatMain', { active: 0, turn: 3 }).build();
    // The Board is untapped and a {1} is in the pool.
    g.act(0).activate(BOARD.name, { ability: 1 }).targets(['plain']).pay();
    g.passAll();
    g.expect.counters('plain', { bounty: 1 });
    g.expect.tapped(BOARD.name, true);
  });
});

describe('Mari, the Killing Quill (CR 122.1, 603.10a, 700.4)', () => {
  test('the card reads: exile it, then a hit counter on the card that exile made', () => {
    expect(MARI.faces[0]?.abilities[0]).toEqual({
      kind: 'triggered',
      trigger: { kind: 'dies', what: { types: ['creature'], controller: 'opponent' } },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exile', objects: { kind: 'triggerSubject' } },
          { kind: 'addCounters', objects: { kind: 'moved' }, counter: 'hit', count: 1 },
        ],
      },
    });
  });

  const table = () =>
    scenario({ seats: 3 })
      .define(MARI)
      .define(ROGUE)
      .seat(0)
      .library(...FILLER)
      .hand(BOLT)
      .pool('RR')
      .battlefield(MARI.name)
      .battlefield(ROGUE.name, { label: 'rogue' })
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...FILLER)
      .battlefield(BEARS, { label: 'theirs' })
      .seat(2)
      .library(...FILLER)
      .battlefield(BEARS, { label: 'third' });

  test('a creature an opponent controls that dies is exiled with a hit counter on it, whichever opponent', () => {
    const g = table().at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(BOLT).targets(['theirs']).pay();
    g.passAll();
    const exiled = named(g, BEARS, 'exile', 1);
    expect(exiled).toHaveLength(1);
    expect(exiled[0]?.counters).toEqual({ hit: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1, count: 0 });
    g.expect.invariants();
  });

  test('your own creature dying is not exiled', () => {
    const g = table().at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(BOLT).targets(['mine']).pay();
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    expect(named(g, BEARS, 'exile', 0)).toHaveLength(0);
  });

  test('Assassins, Mercenaries, and Rogues you control have deathtouch; other creatures do not', () => {
    const g = table().at('precombatMain', { active: 0, turn: 3 }).build();
    g.expect.derived(MARI.name, { keywords: ['deathtouch'] });
    g.expect.derived('rogue', { keywords: ['deathtouch'] });
    g.expect.derived('mine', { keywords: [] });
    g.expect.derived('theirs', { keywords: [] });
  });

  test('a Rogue that deals combat damage to a player removes a hit counter from a card that player owns in exile: draw a card and two Treasures', () => {
    const g = table().at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(BOLT).targets(['theirs']).pay();
    g.passAll();
    const handBefore = handSize(g, 0);
    g.playCombat({ attack: [{ attacker: 'rogue', target: { player: 1 } }], until: 'combatDamage' });
    g.expect.stack(['SYNTHETIC Test Rogue (ability)']);
    g.passAll();
    g.act(0).accept();
    const exiled = named(g, BEARS, 'exile', 1);
    expect(exiled[0]?.counters).toEqual({});
    expect(handSize(g, 0)).toBe(handBefore + 1);
    expect(g.find({ name: 'Treasure', zone: 'battlefield', seat: 0 })).toHaveLength(2);
    g.expect.invariants();
  });

  test('declining the offer keeps the counter and gives nothing (CR 608.2d)', () => {
    const g = table().at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(BOLT).targets(['theirs']).pay();
    g.passAll();
    const handBefore = handSize(g, 0);
    g.playCombat({ attack: [{ attacker: 'rogue', target: { player: 1 } }], until: 'combatDamage' });
    g.passAll();
    g.act(0).decline();
    expect(named(g, BEARS, 'exile', 1)[0]?.counters).toEqual({ hit: 1 });
    expect(handSize(g, 0)).toBe(handBefore);
    expect(g.find({ name: 'Treasure', zone: 'battlefield', seat: 0 })).toHaveLength(0);
  });

  test('only cards the damaged player owns count: a hit counter on another player’s card is not taken ("if you do" is then false)', () => {
    const g = table().at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(BOLT).targets(['third']).pay();
    g.passAll();
    expect(named(g, BEARS, 'exile', 2)[0]?.counters).toEqual({ hit: 1 });
    const handBefore = handSize(g, 0);
    g.playCombat({ attack: [{ attacker: 'rogue', target: { player: 1 } }], until: 'combatDamage' });
    g.passAll();
    // Seat 1 owns no card with a hit counter in exile: nothing to remove, so nothing is drawn.
    expect(named(g, BEARS, 'exile', 2)[0]?.counters).toEqual({ hit: 1 });
    expect(handSize(g, 0)).toBe(handBefore);
    expect(g.find({ name: 'Treasure', zone: 'battlefield', seat: 0 })).toHaveLength(0);
  });
});

describe('Kamber, the Plunderer (CR 111.10g)', () => {
  test('the card reads: gain 1 life and create a Blood token', () => {
    expect(KAMBER.faces[0]?.abilities[2]).toEqual({
      kind: 'triggered',
      trigger: { kind: 'dies', what: { types: ['creature'], controller: 'opponent' } },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
          { kind: 'createToken', token: { kind: 'preset', preset: 'Blood' }, count: 1 },
        ],
      },
    });
  });

  const table = () =>
    scenario({ seats: 3 })
      .define(KAMBER)
      .seat(0)
      .library(...FILLER)
      .hand(BOLT, 'Plains')
      .pool('RC')
      .battlefield(KAMBER.name)
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...FILLER)
      .battlefield(BEARS, { label: 'theirs' })
      .seat(2)
      .library(...FILLER)
      .battlefield(SPIDER, { label: 'third' });

  test('an opponent’s creature dying gives 1 life and a Blood token: a colorless Blood artifact token', () => {
    const g = table().at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(BOLT).targets(['theirs']).pay();
    g.passAll();
    g.expect.life(0, 41);
    const blood = g.find({ name: 'Blood', zone: 'battlefield', seat: 0 });
    expect(blood).toHaveLength(1);
    g.expect.derived('Blood', { types: ['artifact'], subtypes: ['Blood'], colors: [] });
    g.expect.invariants();
  });

  test('your own creature dying does nothing', () => {
    const g = table().at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(BOLT).targets(['mine']).pay();
    g.passAll();
    g.expect.life(0, 40);
    expect(g.find({ name: 'Blood', zone: 'battlefield', seat: 0 })).toHaveLength(0);
  });

  test('{1}, {T}, Discard a card, Sacrifice this token: Draw a card', () => {
    const g = table().at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(BOLT).targets(['theirs']).pay();
    g.passAll();
    const libraryBefore = g.state.seats[0]?.library.length ?? 0;
    g.act(0).activate('Blood').pay();
    // The one card of the hand is discarded without asking (CR 701.9: the whole hand when it holds exactly that many).
    g.passAll();
    g.expect.noObject('Blood');
    g.expect.zone('Plains', 'graveyard', { seat: 0 });
    expect(g.state.seats[0]?.library.length).toBe(libraryBefore - 1);
    expect(handSize(g)).toBe(1);
    g.expect.invariants();
  });

  test('with more cards in hand the player chooses the card to discard', () => {
    const g = scenario()
      .define(KAMBER)
      .seat(0)
      .library('Forest', { count: 6 })
      .hand(BOLT, 'Plains', 'Island')
      .pool('RC')
      .battlefield(KAMBER.name)
      .seat(1)
      .library(...FILLER)
      .battlefield(BEARS, { label: 'theirs' })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(BOLT).targets(['theirs']).pay();
    g.passAll();
    g.act(0).activate('Blood').pay();
    g.act(0).chooseCards('Island');
    g.passAll();
    g.expect.zone('Island', 'graveyard', { seat: 0 });
    g.expect.zone('Plains', 'hand', { seat: 0 });
    g.expect.zone('Forest', 'hand', { seat: 0 });
  });

  test('it cannot be activated with no card to discard', () => {
    const g = scenario()
      .define(KAMBER)
      .seat(0)
      .library(...FILLER)
      .hand(BOLT)
      .pool('RC')
      .battlefield(KAMBER.name)
      .seat(1)
      .library(...FILLER)
      .battlefield(BEARS, { label: 'theirs' })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(BOLT).targets(['theirs']).pay();
    g.passAll();
    expect(handSize(g)).toBe(0);
    g.expect.illegal(0, { activate: 'Blood' });
  });
});

describe('Angelic Sell-Sword (CR 603.4)', () => {
  test('the card reads: the intervening "if" is the power of the attacker', () => {
    expect(
      ANGEL.faces[0]?.abilities.find((a) => a.kind === 'triggered' && a.trigger.kind === 'attacks'),
    ).toEqual({
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      interveningIf: { kind: 'subjectStat', stat: 'power', compare: { cmp: 'atLeast', value: 6 } },
    });
  });

  const start = (counters: number) =>
    scenario()
      .define(ANGEL)
      .define(SHRINK)
      .seat(0)
      .library(...FILLER)
      .hand(SHRINK.name)
      .battlefield('Swamp')
      .battlefield(ANGEL.name, counters === 0 ? {} : { counters: { '+1/+1': counters } })
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('with power 6 or greater the attack trigger draws a card', () => {
    const g = start(2);
    g.expect.pt(ANGEL.name, 6, 6);
    g.advanceTo('declareAttackers');
    g.act(0).attack(ANGEL.name);
    g.expect.stack([`${ANGEL.name} (ability)`]);
    g.passAll();
    expect(handSize(g)).toBe(2);
    g.expect.invariants();
  });

  test('with power below 6 the ability does not trigger at all', () => {
    const g = start(1);
    g.expect.pt(ANGEL.name, 5, 5);
    g.advanceTo('declareAttackers');
    g.act(0).attack(ANGEL.name);
    g.expect.stack([]);
    expect(handSize(g)).toBe(1);
  });

  test('another attacker does not trigger it', () => {
    const g = start(2);
    g.advanceTo('declareAttackers');
    g.act(0).attack('mine');
    g.expect.stack([]);
  });

  test('the power is checked again as the ability resolves: a creature shrunk in response draws nothing', () => {
    const g = start(2);
    g.advanceTo('declareAttackers');
    g.act(0).attack(ANGEL.name);
    g.expect.stack([`${ANGEL.name} (ability)`]);
    g.act(0).cast(SHRINK.name).targets([ANGEL.name]).pay();
    g.passAll();
    g.expect.pt(ANGEL.name, 3, 3);
    // The card in hand is the Shrink's; no card was drawn.
    expect(handSize(g)).toBe(0);
    g.expect.invariants();
  });
});
