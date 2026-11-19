// "Look at the top four cards of your library. You may put a land card from among them onto the battlefield tapped. If you don't, put a card from among them into your hand. Put
// the rest on the bottom of your library in a random order." (`lookAtTop` with `take.elseAnyToHand`) and "Draw X cards. Then you may put a permanent card with mana value X or
// less from your hand onto the battlefield tapped." (`moveToZone` of a `choose` selector whose filter has `manaValueAtMost: { kind: 'x' }`).
// Pins: CR 608.2c / 608.2d (an instruction that says "if you don't" depends on what the player did, and the player makes the choices as it resolves), CR 701.20a (nothing says
// reveal, so nothing is revealed), CR 401.4 (the rest go on the bottom), CR 107.3a (X is announced as the spell is cast), CR 202.3e (an {X} in the cost of a card in a hand is 0).
// All cards are SYNTHETIC (named so) except the real basic lands and fixtures.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type CardDefinition, type Effect, type GameEvent, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';
import { handNames, kinds, libraryNames } from './scry-helpers';

const GENESIS = 'SYNTHETIC Look Four Land Else Hand';
const MATTER = 'SYNTHETIC Draw X Then Put';
const XCREATURE = 'SYNTHETIC X Creature';

const genesisEffect: Effect = {
  kind: 'lookAtTop',
  count: 4,
  take: {
    filter: { types: ['land'] },
    max: 1,
    to: 'battlefield',
    tapped: true,
    hidden: true,
    elseAnyToHand: true,
  },
  rest: 'bottomRandom',
};

const genesis: CardDefinition = singleFace({
  name: GENESIS,
  manaCost: ['G', 'U'],
  types: ['instant'],
  colors: ['G', 'U'],
  colorIdentity: ['G', 'U'],
  oracleText:
    "Look at the top four cards of your library. You may put a land card from among them onto the battlefield tapped. If you don't, put a card from among them into your hand. Put the rest on the bottom of your library in a random order.",
  spell: { effect: genesisEffect },
});

const matterEffect: Effect = {
  kind: 'sequence',
  effects: [
    { kind: 'draw', player: { kind: 'you' }, count: { kind: 'x' } },
    {
      kind: 'moveToZone',
      objects: {
        kind: 'choose',
        filter: {
          zone: 'hand',
          controller: 'you',
          anyOf: ['artifact', 'creature', 'enchantment', 'land', 'planeswalker', 'battle'].map(
            (t) => ({ types: [t as 'artifact'] }),
          ),
          manaValueAtMost: { kind: 'x' },
        },
        optional: true,
      },
      to: 'battlefield',
      tapped: true,
    },
  ],
};

const matter: CardDefinition = singleFace({
  name: MATTER,
  manaCost: ['X', 'G', 'U'],
  types: ['sorcery'],
  colors: ['G', 'U'],
  colorIdentity: ['G', 'U'],
  oracleText:
    'Draw X cards. Then you may put a permanent card with mana value X or less from your hand onto the battlefield tapped.',
  spell: { effect: matterEffect, x: true },
});

const xCreature: CardDefinition = singleFace({
  name: XCREATURE,
  manaCost: ['X', 'G'],
  types: ['creature'],
  colors: ['G'],
  colorIdentity: ['G'],
  power: 1,
  toughness: 1,
  oracleText: '',
});

describe('the fixtures are valid', () => {
  test.each([genesis, matter])('$name', (def) => {
    expect(validateCard(def)).toEqual([]);
  });

  test('elseAnyToHand is refused without a take onto the battlefield that reveals nothing', () => {
    const bad = singleFace({
      ...{ name: 'SYNTHETIC Bad Else', manaCost: ['G'], types: ['instant'] as const },
      colors: ['G'],
      colorIdentity: ['G'],
      oracleText: '',
      spell: {
        effect: {
          kind: 'lookAtTop',
          count: 4,
          take: { filter: {}, max: 1, elseAnyToHand: true },
          rest: 'bottomRandom',
        },
      },
    });
    expect(
      validateCard(bad)
        .map((i) => i.path)
        .join(' '),
    ).toContain('elseAnyToHand');
  });

  test('"mana value X or less" is refused where nothing has an X', () => {
    const bad = singleFace({
      name: 'SYNTHETIC Bad X Limit',
      manaCost: ['G'],
      types: ['sorcery'],
      colors: ['G'],
      colorIdentity: ['G'],
      oracleText: '',
      spell: {
        effect: {
          kind: 'moveToZone',
          objects: {
            kind: 'choose',
            filter: { zone: 'hand', controller: 'you', manaValueAtMost: { kind: 'x' } },
          },
          to: 'battlefield',
        },
      },
    });
    expect(
      validateCard(bad)
        .map((i) => i.path)
        .join(' '),
    ).toContain('manaValueAtMost');
  });
});

const LABELS = ['a', 'b', 'c', 'd', 'e', 'f'];

function lookGame(top: readonly string[]): ScenarioGame {
  let b = scenario().define(genesis).seat(0).hand(GENESIS).pool('GU');
  for (const [i, name] of top.entries()) b = b.library(name, { label: LABELS[i] ?? `x${i}` });
  return b
    .library('Swamp', { label: 'z' })
    .seat(1)
    .library('Llanowar Elves')
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
}

function castGenesis(top: readonly string[]): ScenarioGame {
  const g = lookGame(top);
  g.act(0).cast(GENESIS, { pay: true });
  g.passAll();
  return g;
}

const TOP = ['Grizzly Bears', 'Island', 'Lightning Bolt', 'Forest'];

describe('Look at the top four ... "If you don\'t" (CR 608.2c)', () => {
  test('the land taken comes onto the battlefield tapped, nothing goes to the hand, the rest go to the bottom', () => {
    const g = castGenesis(TOP);
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('lookTake');
    expect(d.legal).toEqual([g.id('b'), g.id('d')]);
    expect(d.min).toBe(0);
    expect(d.max).toBe(1);
    expect(d.reveal).toBe(false);
    expect(d.prompt).toContain('onto the battlefield tapped');
    const mark = g.mark();
    g.act(0).chooseCards('b');
    g.expect.zone('Island', 'battlefield');
    g.expect.tapped('Island', true);
    expect(handNames(g)).toEqual([]);
    // Three cards left on the bottom (random order), Swamp stays on top.
    expect(libraryNames(g)[0]).toBe('Swamp');
    expect(libraryNames(g).slice(1).sort()).toEqual(['Forest', 'Grizzly Bears', 'Lightning Bolt']);
    const events = g.eventsSince(mark);
    expect(kinds(events)).not.toContain('cardsRevealed');
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('declining the land: a card of any kind from among them goes into the hand, unrevealed', () => {
    const g = castGenesis(TOP);
    const mark = g.mark();
    g.act(0).chooseCards();
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('lookTake');
    expect(d.legal).toEqual(['a', 'b', 'c', 'd'].map((l) => g.id(l)));
    expect(d.min).toBe(1);
    expect(d.max).toBe(1);
    expect(d.reveal).toBe(false);
    expect(d.prompt).toContain('Put one of them into your hand');
    g.act(0).chooseCards('c');
    expect(handNames(g)).toEqual(['Lightning Bolt']);
    expect(libraryNames(g)[0]).toBe('Swamp');
    expect(libraryNames(g).slice(1).sort()).toEqual(['Forest', 'Grizzly Bears', 'Island']);
    const events = g.eventsSince(mark);
    expect(kinds(events)).not.toContain('cardsRevealed');
    expect(kinds(events).filter((k) => k === 'topCardsLooked')).toHaveLength(1);
    g.expect.invariants();
  });

  test('no land among them: nobody is asked about a land, the card for the hand is chosen at once', () => {
    const g = castGenesis(['Grizzly Bears', 'Lightning Bolt', 'Giant Spider', 'Serra Angel']);
    const d = chooseCardsDecision(g);
    expect(d.min).toBe(1);
    expect(d.legal).toHaveLength(4);
    g.act(0).chooseCards('d');
    expect(handNames(g)).toEqual(['Serra Angel']);
    g.expect.invariants();
  });

  test('the player cannot decline both: the card for the hand is required', () => {
    const g = castGenesis(TOP);
    g.act(0).chooseCards();
    expect(() => g.act(0).chooseCards()).toThrow();
  });
});

describe('Draw X cards. Then you may put a permanent card with mana value X or less from your hand onto the battlefield tapped', () => {
  function matterGame(): ScenarioGame {
    let b = scenario()
      .define(matter)
      .define(xCreature)
      .seat(0)
      .hand(MATTER)
      .hand('Serra Angel', { label: 'angel' }) // mana value 5
      .hand('Grizzly Bears', { label: 'bears' }) // mana value 2
      .hand(XCREATURE, { label: 'xc' }) // {X}{G}: mana value 1 in a hand (CR 202.3e)
      .hand('Lightning Bolt', { label: 'bolt' }) // not a permanent card
      .pool('GUUU');
    b = b.library('Plains', { label: 'p' }).library('Island', { label: 'i' });
    return b
      .library('Forest')
      .library('Forest')
      .seat(1)
      .library('Llanowar Elves')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  }

  test('with X = 2 the choice is the permanent cards of mana value 2 or less, an {X} card counted as X = 0, and the cards drawn are in the hand first', () => {
    const g = matterGame();
    g.act(0).cast(MATTER, { x: 2, pay: true });
    g.passAll();
    const d = chooseCardsDecision(g);
    expect(d.zone).toBe('hand');
    // The two lands drawn (mana value 0) qualify as well as the Bears and the {X}{G} creature (mana value 1 in a hand: X is 0, CR 202.3e); the Angel (5) and the Bolt do not.
    expect([...d.legal].sort()).toEqual([g.id('bears'), g.id('xc'), g.id('p'), g.id('i')].sort());
    expect(d.min).toBe(0);
  });

  test('the chosen card enters tapped, and a card drawn by the spell can be the one chosen', () => {
    const g = matterGame();
    g.act(0).cast(MATTER, { x: 2, pay: true });
    g.passAll();
    g.act(0).chooseCards('bears');
    g.expect.zone('Grizzly Bears', 'battlefield');
    g.expect.tapped('Grizzly Bears', true);
    expect(handNames(g)).toContain('Serra Angel');
    expect(handNames(g)).not.toContain('Grizzly Bears');
    g.expect.invariants();
  });

  test('"you may": choosing nothing leaves everything in the hand', () => {
    const g = matterGame();
    g.act(0).cast(MATTER, { x: 2, pay: true });
    g.passAll();
    g.act(0).chooseCards();
    expect(handNames(g)).toContain('Grizzly Bears');
    g.expect.zone('Grizzly Bears', 'hand');
    g.expect.invariants();
  });

  test('with X = 0 nothing is drawn and no card in the hand has mana value 0, so nobody is asked', () => {
    const g = matterGame();
    g.act(0).cast(MATTER, { x: 0, pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.zone('Grizzly Bears', 'hand');
  });

  test('an Aura card that qualifies asks what it enchants (CR 303.4f) and enters attached', () => {
    const g = scenario()
      .define(matter)
      .seat(0)
      .hand(MATTER)
      .hand('SYNTHETIC Might Aura', { label: 'aura' })
      .battlefield('Grizzly Bears', 'Giant Spider')
      .pool('GUUU')
      .library('Forest')
      .library('Forest')
      .seat(1)
      .library('Llanowar Elves')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(MATTER, { x: 2, pay: true });
    g.passAll();
    g.act(0).chooseCards('aura');
    g.act(0).choosePermanents('Grizzly Bears');
    g.expect.attached('SYNTHETIC Might Aura', 'Grizzly Bears');
    g.expect.invariants();
  });

  test('with X = 5 the Angel qualifies too', () => {
    let b = scenario()
      .define(matter)
      .seat(0)
      .hand(MATTER)
      .hand('Serra Angel', { label: 'angel' })
      .pool('GUUUUUUU');
    for (let i = 0; i < 5; i++) b = b.library('Forest');
    const g = b
      .seat(1)
      .library('Llanowar Elves')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(MATTER, { x: 5, pay: true });
    g.passAll();
    expect(chooseCardsDecision(g).legal).toContain(g.id('angel'));
    const mark = g.mark();
    g.act(0).chooseCards('angel');
    g.expect.zone('Serra Angel', 'battlefield');
    expect(kinds(g.eventsSince(mark) as readonly GameEvent[])).not.toContain('cardsRevealed');
  });
});
