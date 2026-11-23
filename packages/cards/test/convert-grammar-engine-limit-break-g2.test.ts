// The Limit Break deck (issue 96), group 2: the equipment cards and their helpers. The REAL Oracle text of each card (the corpus's golden.jsonl, taken from the issue) goes through the
// grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs.
import { readFileSync } from 'node:fs';
import {
  type CardDefinition,
  getLegalActions,
  syntheticCard,
  validateCard,
} from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const BLADE = 'SYNTHETIC Costly Blade'; // Equipment: +1/+1, Equip {4}

describe('Helitrooper: "Equip abilities you activate that target ~ cost {2} less to activate." (CR 702.6a, 601.2f, 602.2b)', () => {
  const HELI = 'Helitrooper';
  const heli = real(HELI);

  const board = (forests = 2) =>
    scenario()
      .define(heli)
      .define(syntheticCard(BLADE))
      .seat(0)
      .battlefield(HELI, BLADE, 'Grizzly Bears', ...Array.from({ length: forests }, () => 'Forest'))
      .seat(1)
      .battlefield('Llanowar Elves')
      .build();

  /** The generic mana still to pay of the payment the engine asks for now. */
  const owed = (g: ReturnType<typeof board>): string[] => {
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error(`expected payMana, got ${d?.kind}`);
    return [...d.totalCost];
  };

  test('is valid', () => {
    expect(validateCard(heli)).toEqual([]);
  });

  test('an Equip {4} that targets Helitrooper costs {2}', () => {
    const g = board();
    g.act(0).activate(BLADE, { targets: [HELI] });
    expect(owed(g)).toEqual(['2']);
  });

  test('the same Equip that targets another creature still costs {4}', () => {
    const g = board(4);
    g.act(0).activate(BLADE, { targets: ['Grizzly Bears'] });
    expect(owed(g)).toEqual(['4']);
  });

  test('two Forests pay for it and Helitrooper is equipped', () => {
    const g = board();
    g.act(0).activate(BLADE, { targets: [HELI], pay: true });
    g.passAll();
    g.expect.attached(BLADE, HELI);
    g.expect.invariants();
  });
});

describe('Colossus Hammer: "Equipped creature gets +10/+10 and loses flying." (CR 613.1f, 613.4c, 613.7)', () => {
  const HAMMER = 'Colossus Hammer';
  const hammer = real(HAMMER);
  const HAT = 'SYNTHETIC Wing Hat';
  const hat = parsed(HAT, 'Artifact — Equipment', 'Equipped creature has flying.\nEquip {1}');

  test('is valid', () => {
    expect(validateCard(hammer)).toEqual([]);
  });

  test('the equipped creature gets +10/+10 and loses flying; the other abilities stay', () => {
    const g = scenario()
      .define(hammer)
      .seat(0)
      .battlefield('Serra Angel')
      .battlefield(HAMMER, { attachedTo: 'Serra Angel' })
      .seat(1)
      .build();
    g.expect.pt('Serra Angel', 14, 14);
    g.expect.derived('Serra Angel', { keywords: ['vigilance'] });
    g.expect.invariants();
  });

  test('a creature that is not equipped keeps flying', () => {
    const g = scenario()
      .define(hammer)
      .seat(0)
      .battlefield('Serra Angel', 'Grizzly Bears')
      .battlefield(HAMMER, { attachedTo: 'Grizzly Bears' })
      .seat(1)
      .build();
    g.expect.derived('Serra Angel', { keywords: ['flying', 'vigilance'] });
    g.expect.pt('Grizzly Bears', 12, 12);
  });

  test('flying given by an effect with a later timestamp applies (CR 613.7)', () => {
    const g = scenario()
      .define(hammer)
      .define(hat)
      .seat(0)
      .battlefield('Serra Angel')
      .battlefield(HAMMER, { attachedTo: 'Serra Angel' })
      .battlefield(HAT, { attachedTo: 'Serra Angel' })
      .seat(1)
      .build();
    g.expect.derived('Serra Angel', { keywords: ['flying', 'vigilance'] });
  });

  test('flying given before the Hammer is lost (CR 613.7)', () => {
    const g = scenario()
      .define(hammer)
      .define(hat)
      .seat(0)
      .battlefield('Serra Angel')
      .battlefield(HAT, { attachedTo: 'Serra Angel' })
      .battlefield(HAMMER, { attachedTo: 'Serra Angel' })
      .seat(1)
      .build();
    g.expect.derived('Serra Angel', { keywords: ['vigilance'] });
  });
});

describe("Explorer's Scope: look at the top card, a land card may be put onto the battlefield tapped (CR 608.2c, 701.20a, 603.2)", () => {
  const SCOPE = "Explorer's Scope";
  const scope = real(SCOPE);

  const game = (top: string, host = 'Grizzly Bears') =>
    scenario()
      .define(scope)
      .seat(0)
      .library(top, 'Plains', 'Plains')
      .battlefield(host, 'Llanowar Elves')
      .battlefield(SCOPE, { attachedTo: host })
      .seat(1)
      .library('Island', 'Island')
      .at('beginningOfCombat', { active: 0 })
      .build();
  const attack = (g: ReturnType<typeof game>, who = 'Grizzly Bears') => {
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: who }]);
    g.passAll();
  };

  test('is valid', () => {
    expect(validateCard(scope)).toEqual([]);
  });

  test('a land card on top may be put onto the battlefield tapped', () => {
    const g = game('Forest');
    attack(g);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(g.id('Forest'));
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.tapped('Forest');
    g.expect.invariants();
  });

  test('the land card may stay on top', () => {
    const g = game('Forest');
    attack(g);
    g.act(0).chooseCards();
    g.expect.zone('Forest', 'library', { seat: 0 });
    expect(g.state.seats[0]?.library[0]).toBe(g.id('Forest'));
  });

  test('a card that is not a land card stays on top and nobody is asked', () => {
    const g = game('Serra Angel');
    attack(g);
    g.expect.pending('priority', 0);
    expect(g.state.seats[0]?.library[0]).toBe(g.id('Serra Angel'));
  });

  test('another creature attacking does not trigger it (only the equipped creature)', () => {
    const g = game('Forest');
    attack(g, 'Llanowar Elves');
    g.expect.pending('priority', 0);
    g.expect.zone('Forest', 'library', { seat: 0 });
  });
});

describe('Puresteel Paladin: draws when an Equipment enters; Equipment have equip {0} with three or more artifacts (CR 702.6a, 611.3a, 603.2)', () => {
  const PALADIN = 'Puresteel Paladin';
  const paladin = real(PALADIN);

  const game = (artifacts: number) =>
    scenario()
      .define(paladin)
      .define(syntheticCard(BLADE))
      .seat(0)
      .library('Plains', 'Plains', 'Plains')
      .battlefield(PALADIN, BLADE, 'Grizzly Bears', ...Array.from({ length: artifacts - 1 }, () => 'Sol Ring'))
      .seat(1)
      .build();

  test('is valid', () => {
    expect(validateCard(paladin)).toEqual([]);
  });

  test('with three artifacts the Equipment equips for {0}', () => {
    const g = game(3);
    g.act(0).activate(BLADE, { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.attached(BLADE, 'Grizzly Bears');
    g.expect.invariants();
  });

  test('with only two artifacts there is no Equip {0}: with no mana it cannot be activated', () => {
    const g = game(2);
    expect(
      getLegalActions(g.state, 0).some((a) => a.kind === 'activate' && a.object === g.id(BLADE)),
    ).toBe(false);
  });

  test('the Equipment of an opponent does not get it (Equipment you control)', () => {
    const g = scenario()
      .define(paladin)
      .define(syntheticCard(BLADE))
      .seat(0)
      .battlefield(PALADIN, 'Sol Ring', 'Sol Ring', 'Sol Ring', 'Grizzly Bears')
      .seat(1)
      .battlefield(BLADE, 'Llanowar Elves')
      .at('precombatMain', { active: 1 })
      .build();
    // No mana: only an Equip of {0} could be activated, and the Paladin's controller is the one who has it.
    expect(
      getLegalActions(g.state, 1).some((a) => a.kind === 'activate' && a.object === g.id(BLADE)),
    ).toBe(false);
  });

  test('an Equipment entering under your control lets you draw a card, optionally', () => {
    const g = scenario()
      .define(paladin)
      .define(syntheticCard(BLADE))
      .seat(0)
      .library('Plains', 'Plains', 'Plains')
      .hand(BLADE)
      .battlefield(PALADIN, 'Forest', 'Forest', 'Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).cast(BLADE, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });
});

describe('Elena, Turk Recruit: a non-Assassin historic card returns; casting a historic spell adds a counter (CR 700.6, 603.2, 122.1)', () => {
  const ELENA = 'Elena, Turk Recruit';
  const elena = real(ELENA);
  const LEGEND = 'SYNTHETIC Plain Legend';
  const ASSASSIN = 'SYNTHETIC Assassin Legend';
  const legend = parsed(LEGEND, 'Legendary Creature — Human', 'Flying', {
    power: '2',
    toughness: '2',
    manaCost: '{W}',
  });
  const assassin = parsed(ASSASSIN, 'Legendary Creature — Human Assassin', 'Flying', {
    power: '2',
    toughness: '2',
    manaCost: '{W}',
  });

  test('is valid', () => {
    expect(validateCard(elena)).toEqual([]);
  });

  const enter = () => {
    const g = scenario()
      .define(elena)
      .define(legend)
      .define(assassin)
      .seat(0)
      .hand(ELENA)
      .battlefield('Plains', 'Plains', 'Plains')
      .graveyard('Sol Ring', 'Grizzly Bears', LEGEND, ASSASSIN)
      .seat(1)
      .build();
    g.act(0).cast(ELENA, { pay: true });
    g.passAll();
    return g;
  };

  test('the trigger offers artifact and legendary cards that are not Assassins, nothing else', () => {
    const g = enter();
    g.expect.pending('targets', 0);
    expect(() => g.act(0).chooseTargets({ name: 'Grizzly Bears' })).toThrow();
    expect(() => g.act(0).chooseTargets({ name: ASSASSIN })).toThrow();
  });

  test.each(['Sol Ring', LEGEND])('%s returns to its owner\'s hand', (name) => {
    const g = enter();
    g.act(0).chooseTargets({ name });
    g.passAll();
    g.expect.zone(name, 'hand', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('casting a historic spell puts a +1/+1 counter on Elena; another spell does not', () => {
    const g = scenario()
      .define(elena)
      .define(legend)
      .seat(0)
      .hand(LEGEND, 'Sol Ring', 'Grizzly Bears')
      .battlefield(ELENA, 'Plains', 'Plains', 'Forest', 'Forest')
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast('Sol Ring', { pay: true });
    g.passAll();
    g.expect.counters(ELENA, { '+1/+1': 1 });
    g.act(0).cast(LEGEND, { pay: true });
    g.passAll();
    g.expect.counters(ELENA, { '+1/+1': 2 });
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.passAll();
    g.expect.counters(ELENA, { '+1/+1': 2 });
    g.expect.pt(ELENA, 3, 6);
    g.expect.invariants();
  });
});

describe('Cid, Freeflier Pilot: flying on your turn; returns an Equipment or Vehicle card (CR 613.1f, 604.1, 602.2)', () => {
  const CID = 'Cid, Freeflier Pilot';
  const cid = real(CID);
  const WAGON = 'SYNTHETIC Test Wagon';
  const wagon = parsed(WAGON, 'Artifact — Vehicle', 'Crew 1', {
    power: '2',
    toughness: '2',
    manaCost: '{2}',
  });

  test('is valid', () => {
    expect(validateCard(cid)).toEqual([]);
  });

  test('Cid has flying during its controller\'s turn only', () => {
    const mine = scenario().define(cid).seat(0).battlefield(CID).seat(1).at('precombatMain', { active: 0 }).build();
    mine.expect.derived(CID, { keywords: ['flying'] });
    const theirs = scenario().define(cid).seat(0).battlefield(CID).seat(1).at('precombatMain', { active: 1 }).build();
    theirs.expect.derived(CID, { keywords: [] });
  });

  const board = () =>
    scenario()
      .define(cid)
      .define(wagon)
      .define(syntheticCard(BLADE))
      .seat(0)
      .battlefield(CID, 'Plains', 'Plains')
      .graveyard(BLADE, WAGON, 'Sol Ring', 'Grizzly Bears')
      .seat(1)
      .graveyard('Llanowar Elves')
      .at('precombatMain', { active: 0 })
      .build();

  test.each([BLADE, WAGON])('{2}, {T}: returns %s from your graveyard to your hand', (name) => {
    const g = board();
    g.act(0).activate(CID, { targets: [name], pay: true });
    g.passAll();
    g.expect.zone(name, 'hand', { seat: 0 });
    g.expect.tapped(CID);
    g.expect.invariants();
  });

  test.each(['Sol Ring', 'Grizzly Bears', 'Llanowar Elves'])('%s is not a legal target', (name) => {
    const g = board();
    expect(() => g.act(0).activate(CID, { targets: [name] })).toThrow();
  });
});
