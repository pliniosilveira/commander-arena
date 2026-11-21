// Federation Fleet deck (group B, effects on each player): Ambassador K'Ehleyr (each player reveals the top card of their library, then draws a card; a counter for each nonland
// card revealed), Howling Mine (an additional card in each player's draw step while it is untapped), Fevered Visions (each player's end step: that player draws, and an opponent with
// four or more cards in hand is dealt 2 damage), Kes, Evolving Telepath (a time counter, then draw that many cards; sacrificed at nine) and Fractured Identity (exile a nonland
// permanent; each player other than its controller creates a token copy of it). The lines are the real wordings of the cards; the cards defined here are SYNTHETIC copies of them (a
// SYNTHETIC name, the words the grammar reads). The engine runs what is lowered, through applyAction.
// Rules cited are those the repository's own code already cites: CR 701.20a (Reveal), 121.1 (Drawing a Card), 504.1 (the draw step), 603.2b and 603.4 (triggers of a step, the
// intervening "if"), 608.2c (the order of an instruction), 122.1 (Counters), 707.2 (copiable values), 111.2 (a token's owner), 102.1 and 109.4 (players, a permanent's controller),
// 701.21a (Sacrifice), 402.1 (Hand), 120.3 (damage to a player). They are not looked up here: the CR text is not in this checkout.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const KEHLEYR_TEXT =
  'Vigilance\nParley — At the beginning of combat on your turn, each player reveals the top card of their library, then draws a card. For each nonland card revealed this way, put a +1/+1 counter on ~.';
const MINE_TEXT =
  "At the beginning of each player's draw step, if ~ is untapped, that player draws an additional card.";
const VISIONS_TEXT =
  "At the beginning of each player's end step, that player draws a card. If the player is your opponent and has four or more cards in hand, ~ deals 2 damage to that player.";
const KES_TEXT =
  'At the beginning of your end step, put a time counter on ~, then draw X cards, where X is the number of time counters on her. Then if she has nine or more time counters on her, sacrifice her.';
const IDENTITY_TEXT =
  "Exile target nonland permanent. Each player other than its controller creates a token that's a copy of it.";

const ambassador = parsed(
  'SYNTHETIC Parsed Ambassador',
  'Legendary Creature — Klingon Human Advisor',
  KEHLEYR_TEXT,
  {
    manaCost: '{2}{W}',
    colors: ['W'],
    power: '2',
    toughness: '2',
  },
);
const mine = parsed('SYNTHETIC Parsed Mine', 'Artifact', MINE_TEXT, { manaCost: '{2}' });
const visions = parsed('SYNTHETIC Parsed Visions', 'Enchantment', VISIONS_TEXT, {
  manaCost: '{1}{U}{R}',
  colors: ['U', 'R'],
});
const kes = parsed('SYNTHETIC Parsed Telepath', 'Legendary Creature — Ocampa Advisor', KES_TEXT, {
  manaCost: '{4}{U}',
  colors: ['U'],
  power: '2',
  toughness: '6',
});
const identity = parsed('SYNTHETIC Parsed Identity', 'Sorcery', IDENTITY_TEXT, {
  manaCost: '{3}{W}{U}',
  colors: ['W', 'U'],
});

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

describe('Ambassador K\'Ehleyr: "each player reveals the top card of their library, then draws a card"', () => {
  test('reads as a reveal of every player with a counter for each nonland card, then a draw of every player', () => {
    const [, parley] = readAll(KEHLEYR_TEXT, 'creature').abilities ?? [];
    expect(parley).toEqual({
      kind: 'triggered',
      trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'revealTopBranches',
            player: { kind: 'eachPlayer' },
            branches: [
              {
                ifMatches: { notTypes: ['land'] },
                onMatch: {
                  kind: 'addCounters',
                  objects: { kind: 'this' },
                  counter: '+1/+1',
                  count: 1,
                },
              },
            ],
          },
          { kind: 'draw', player: { kind: 'eachPlayer' }, count: 1 },
        ],
      },
    });
  });

  test('a kind of card the rule does not name, or another counter, is not read', () => {
    const line = (text: string) =>
      `At the beginning of combat on your turn, each player reveals the top card of their library, then draws a card. ${text}`;
    for (const text of [
      'For each card revealed this way, put a +1/+1 counter on ~.',
      'For each nonland card revealed this way, put a -1/-1 counter on ~.',
      'For each nonland card revealed this way, put a +1/+1 counter on target creature.',
    ]) {
      expect(dropped(line(text), 'creature'), text).toBeDefined();
    }
  });

  test('both players reveal and draw their top card; each nonland card revealed is a +1/+1 counter', () => {
    // seat 0 reveals a Grizzly Bears (nonland), seat 1 a Plains (land): one counter, and each hand holds the revealed card.
    const g = scenario()
      .define(ambassador)
      .seat(0)
      .life(20)
      .library('Grizzly Bears', ...FILLER)
      .battlefield(ambassador.name)
      .seat(1)
      .life(20)
      .library('Plains', ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.expect.counters(ambassador.name, { '+1/+1': 1 });
    g.expect.handSize(0, 1);
    g.expect.handSize(1, 1);
    g.expect.zone('Grizzly Bears', 'hand', { seat: 0 });
    g.expect.zone('Plains', 'hand', { seat: 1 });
    g.expect.invariants();
  });

  test('two nonland cards are two counters, two lands none', () => {
    const two = scenario()
      .define(ambassador)
      .seat(0)
      .library('Grizzly Bears', ...FILLER)
      .battlefield(ambassador.name)
      .seat(1)
      .library('Grizzly Bears', ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    two.advanceTo('beginningOfCombat');
    two.passAll();
    two.expect.counters(ambassador.name, { '+1/+1': 2 });

    const none = scenario()
      .define(ambassador)
      .seat(0)
      .library('Plains', ...FILLER)
      .battlefield(ambassador.name)
      .seat(1)
      .library('Island', ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    none.advanceTo('beginningOfCombat');
    none.passAll();
    none.expect.counters(ambassador.name, {});
    none.expect.handSize(0, 1);
    none.expect.handSize(1, 1);
  });

  test('it triggers only at the beginning of combat on its controller turn', () => {
    const g = scenario()
      .define(ambassador)
      .seat(0)
      .library('Grizzly Bears', ...FILLER)
      .battlefield(ambassador.name)
      .seat(1)
      .library('Grizzly Bears', ...FILLER)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.expect.counters(ambassador.name, {});
    g.expect.handSize(0, 0);
    g.expect.handSize(1, 0);
  });
});

describe('Howling Mine: "that player draws an additional card" while it is untapped', () => {
  test('reads as an intervening "if" of an untapped permanent and a draw of the player of the step', () => {
    const [ability] = readAll(MINE_TEXT, 'artifact').abilities ?? [];
    expect(ability).toEqual({
      kind: 'triggered',
      trigger: { kind: 'step', step: 'draw', whose: 'each' },
      interveningIf: { kind: 'thisMatches', filter: { tapped: false } },
      effect: { kind: 'draw', player: { kind: 'triggerPlayer' }, count: 1 },
    });
  });

  test('"additional" is read only after a draw', () => {
    expect(
      dropped(
        "At the beginning of each player's upkeep, that player discards an additional card.",
        'artifact',
      ),
    ).toBeDefined();
  });

  test('the player whose draw step it is draws one more card, whoever they are (CR 504.1)', () => {
    for (const active of [0, 1] as const) {
      const g = scenario()
        .define(mine)
        .seat(0)
        .library(...FILLER)
        .battlefield(mine.name)
        .seat(1)
        .library(...FILLER)
        .at('upkeep', { active })
        .build();
      g.advanceTo('draw');
      g.passAll();
      g.expect.handSize(active, 2);
      g.expect.handSize(active === 0 ? 1 : 0, 0);
      g.expect.invariants();
    }
  });

  test('it does nothing while it is tapped, read as the step begins (CR 603.4)', () => {
    const g = scenario()
      .define(mine)
      .seat(0)
      .library(...FILLER)
      .battlefield(mine.name, { tapped: true })
      .seat(1)
      .library(...FILLER)
      .at('upkeep', { active: 1 })
      .build();
    g.advanceTo('draw');
    g.passAll();
    g.expect.handSize(1, 1);
    g.expect.handSize(0, 0);
  });
});

describe('Fevered Visions: each end step, that player draws; an opponent with four or more cards in hand takes 2', () => {
  test('reads as a draw of the player of the step, then a conditional damage to them', () => {
    const [ability] = readAll(VISIONS_TEXT, 'enchantment').abilities ?? [];
    expect(ability).toEqual({
      kind: 'triggered',
      trigger: { kind: 'endStep', whose: 'each' },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: { kind: 'triggerPlayer' }, count: 1 },
          {
            kind: 'conditional',
            condition: {
              kind: 'and',
              terms: [
                { kind: 'triggerPlayerIsOpponent' },
                {
                  kind: 'triggerPlayerStat',
                  stat: 'cardsInHand',
                  compare: { cmp: 'atLeast', value: 4 },
                },
              ],
            },
            effect: { kind: 'dealDamage', amount: 2, to: { kind: 'triggerPlayer' } },
          },
        ],
      },
    });
  });

  test('the condition is read only in a trigger about a player', () => {
    expect(
      dropped(
        'When ~ enters, if the player is your opponent and has four or more cards in hand, ~ deals 2 damage to that player.',
        'enchantment',
      ),
    ).toBeDefined();
    expect(
      dropped(
        "At the beginning of each player's end step, that player draws a card. If the player is your opponent and has four or more cards in hand, ~ deals 2 damage to that player.".replace(
          'four or more',
          'four or fewer',
        ),
        'enchantment',
      ),
    ).toBeDefined();
  });

  test('the controller draws in their own end step and takes nothing, even with a full hand', () => {
    const g = scenario()
      .define(visions)
      .seat(0)
      .life(20)
      .library(...FILLER)
      .hand('Plains', 'Plains', 'Plains', 'Plains')
      .battlefield(visions.name)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('postcombatMain', { active: 0 })
      .build();
    g.advanceTo('end');
    g.passAll();
    g.expect.handSize(0, 5);
    g.expect.life(0, 20);
    g.expect.life(1, 20);
  });

  test('an opponent with four cards in hand after drawing takes 2 damage (CR 120.3)', () => {
    // three cards in hand, the draw makes four: the count is read after the draw (CR 608.2c).
    const g = scenario()
      .define(visions)
      .seat(0)
      .life(20)
      .library(...FILLER)
      .battlefield(visions.name)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .hand('Plains', 'Plains', 'Plains')
      .at('postcombatMain', { active: 1 })
      .build();
    g.advanceTo('end');
    g.passAll();
    g.expect.handSize(1, 4);
    g.expect.life(1, 18);
    g.expect.life(0, 20);
    g.expect.invariants();
  });

  test('an opponent with fewer than four cards in hand after drawing takes nothing', () => {
    const g = scenario()
      .define(visions)
      .seat(0)
      .life(20)
      .library(...FILLER)
      .battlefield(visions.name)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .hand('Plains', 'Plains')
      .at('postcombatMain', { active: 1 })
      .build();
    g.advanceTo('end');
    g.passAll();
    g.expect.handSize(1, 3);
    g.expect.life(1, 20);
  });
});

describe('Kes, Evolving Telepath: a time counter, then draw that many cards, sacrificed at nine', () => {
  test('reads as a counter, a draw of the counters, and a conditional sacrifice of the permanent', () => {
    const [ability] = readAll(KES_TEXT, 'creature').abilities ?? [];
    expect(ability).toEqual({
      kind: 'triggered',
      trigger: { kind: 'endStep', whose: 'you' },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'addCounters', objects: { kind: 'this' }, counter: 'time', count: 1 },
          {
            kind: 'draw',
            player: { kind: 'you' },
            count: { kind: 'countersOn', of: { kind: 'this' }, counter: 'time' },
          },
          {
            kind: 'conditional',
            condition: {
              kind: 'amountIs',
              amount: { kind: 'countersOn', of: { kind: 'this' }, counter: 'time' },
              compare: { cmp: 'atLeast', value: 9 },
            },
            effect: { kind: 'sacrifice', objects: { kind: 'this' } },
          },
        ],
      },
    });
  });

  test('the pronoun of the count is the permanent the text named, not a word the grammar guesses', () => {
    expect(
      dropped(
        'At the beginning of your end step, draw a card. Then if she has nine or more time counters on it, sacrifice her.',
        'creature',
      ),
    ).toBeDefined();
    expect(
      dropped(
        'At the beginning of your end step, draw a card. Then if he has nine or more time counters on her, sacrifice her.',
        'creature',
      ),
    ).toBeDefined();
  });

  test('the first end step: one counter and one card; the second: two counters and two cards', () => {
    const g = scenario()
      .define(kes)
      .seat(0)
      .library(...FILLER)
      .battlefield(kes.name)
      .seat(1)
      .library(...FILLER)
      .at('postcombatMain', { active: 0 })
      .build();
    g.advanceTo('end');
    g.passAll();
    g.expect.counters(kes.name, { time: 1 });
    g.expect.handSize(0, 1);

    const second = scenario()
      .define(kes)
      .seat(0)
      .library(...FILLER)
      .battlefield(kes.name, { counters: { time: 1 } })
      .seat(1)
      .library(...FILLER)
      .at('postcombatMain', { active: 0 })
      .build();
    second.advanceTo('end');
    second.passAll();
    second.expect.counters(kes.name, { time: 2 });
    second.expect.handSize(0, 2);
  });

  test('it does not trigger in the end step of another player', () => {
    const g = scenario()
      .define(kes)
      .seat(0)
      .library(...FILLER)
      .battlefield(kes.name)
      .seat(1)
      .library(...FILLER)
      .at('postcombatMain', { active: 1 })
      .build();
    g.advanceTo('end');
    g.passAll();
    g.expect.counters(kes.name, {});
    g.expect.handSize(0, 0);
  });

  test('with nine time counters after the counter is put, it draws nine cards and is sacrificed (CR 701.21a)', () => {
    const g = scenario()
      .define(kes)
      .seat(0)
      .library(...FILLER, ...FILLER)
      .battlefield(kes.name, { counters: { time: 8 } })
      .seat(1)
      .library(...FILLER)
      .at('postcombatMain', { active: 0 })
      .build();
    g.advanceTo('end');
    g.passAll();
    g.expect.handSize(0, 9);
    g.expect.zone(kes.name, 'graveyard', { seat: 0 });
    g.expect.noObject(kes.name, { zone: 'battlefield' });
    g.expect.invariants();
  });

  test('with eight counters it stays', () => {
    const g = scenario()
      .define(kes)
      .seat(0)
      .library(...FILLER, ...FILLER)
      .battlefield(kes.name, { counters: { time: 7 } })
      .seat(1)
      .library(...FILLER)
      .at('postcombatMain', { active: 0 })
      .build();
    g.advanceTo('end');
    g.passAll();
    g.expect.handSize(0, 8);
    g.expect.zone(kes.name, 'battlefield', { seat: 0 });
  });
});

describe('Fractured Identity: exile a nonland permanent; each player other than its controller creates a token copy', () => {
  test('reads as an exile and a token copy made by every player but the controller of the target', () => {
    const parsedFace = readAll(IDENTITY_TEXT, 'sorcery');
    expect(parsedFace.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'exile', objects: { kind: 'target', id: 't1' } },
        {
          kind: 'createToken',
          token: { kind: 'copyOf', object: { kind: 'target', id: 't1' } },
          count: 1,
          controller: {
            kind: 'eachPlayerExcept',
            except: { kind: 'controllerOf', of: { kind: 'target', id: 't1' } },
          },
        },
      ],
    });
  });

  test('another player than its controller or its owner is not read', () => {
    for (const who of ['each player other than you', 'each player other than its owner']) {
      expect(
        dropped(
          `Exile target nonland permanent. ${who[0]?.toUpperCase()}${who.slice(1)} creates a token that's a copy of it.`,
          'sorcery',
        ),
        who,
      ).toBeDefined();
    }
  });

  test('a permanent of the opponent is exiled and the caster gets a token copy, the opponent none', () => {
    const g = scenario()
      .define(identity)
      .seat(0)
      .hand(identity.name)
      .battlefield('Plains', 'Plains', 'Plains', 'Island', 'Island')
      .seat(1)
      .battlefield('Grizzly Bears')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(identity.name, { pay: true, targets: ['Grizzly Bears'] });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'exile', { seat: 1 });
    const copies = g.find({ name: 'Grizzly Bears', zone: 'battlefield' });
    expect(copies).toHaveLength(1);
    expect(copies[0]?.token).not.toBeNull();
    expect(copies[0]?.controller).toBe(0);
    g.expect.invariants();
  });

  test("the caster's own permanent is exiled and the opponent gets the token copy", () => {
    const g = scenario()
      .define(identity)
      .seat(0)
      .hand(identity.name)
      .battlefield('Plains', 'Plains', 'Plains', 'Island', 'Island', 'Grizzly Bears')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(identity.name, { pay: true, targets: ['Grizzly Bears'] });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'exile', { seat: 0 });
    const copies = g.find({ name: 'Grizzly Bears', zone: 'battlefield' });
    expect(copies).toHaveLength(1);
    expect(copies[0]?.token).not.toBeNull();
    expect(copies[0]?.controller).toBe(1);
  });
});
