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
