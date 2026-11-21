// Federation Fleet deck, group E (Spacecraft and chapters): the REAL Oracle text of Geordi La Forge, Innovator and Unification (golden.jsonl, taken from the issue) goes through the
// grammar as a card with no override, is defined in an engine scenario and is played through applyAction. The attack trigger of U.S.S. Stargazer, Here and There is read and played on a
// synthetic creature; the real card stays unsupported (its station striation, last pin of the Stargazer group). Pins: CR 509.1b (an evasion restriction: a
// creature that can't be blocked), CR 611.3a (a static ability applies while its condition holds), CR 508.4 (a token put onto the battlefield attacking is never declared as an attacker),
// CR 110.5b (tapped as it enters), CR 603.7 and 603.7c (the delayed exile of that token only), CR 108.3 (the owner of a permanent), CR 701.24 (shuffle), CR 121.1 (draw), CR 400.7
// (a card put onto the battlefield from a hand or graveyard), CR 608.2d (the player chooses the card). The rule numbers are the ones the repository's own comments already use for these
// mechanics; docs/rules was not read for this file.
import { readFileSync } from 'node:fs';
import { validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { real } from './agatha-helpers';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GEORDI = real('Geordi La Forge, Innovator');
const MANEUVER =
  'Whenever ~ attacks, create a tapped and attacking 4/3 colorless Spacecraft Illusion artifact creature token with flying. Exile that token at end of combat.';
// The attack trigger of U.S.S. Stargazer, Here and There on a creature that needs no station: the card itself stays unsupported (see the last test of the group).
const STARGAZER = parsed(
  'SYNTHETIC Stargazer',
  'Legendary Artifact Creature — Spacecraft',
  `Flying\nPicard Maneuver — ${MANEUVER}`,
  { manaCost: '{3}', power: '4', toughness: '3' },
);
const UNIFICATION = real('Unification');

const BEARS = 'Grizzly Bears'; // 2/2 green
const WALL = 'SYNTHETIC Wall'; // 0/4 blocker
const WALL_CARD = parsed(WALL, 'Creature — Wall', 'Defender', {
  manaCost: '{1}',
  power: '0',
  toughness: '4',
});
const SHIP = parsed('SYNTHETIC Ship', 'Artifact — Spacecraft', '', { manaCost: '{1}' });
const SHIP_NAME = 'SYNTHETIC Ship';
const LIBRARY = Array.from({ length: 10 }, () => 'Island');

describe('the three cards read as supported and are valid', () => {
  test.each([GEORDI, STARGAZER, UNIFICATION])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe("Geordi La Forge, Innovator (can't be blocked if you control a Spacecraft)", () => {
  const game = (withShip: boolean) => {
    const b = scenario()
      .define(GEORDI)
      .define(SHIP)
      .define(WALL_CARD)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(GEORDI.name);
    if (withShip) b.battlefield(SHIP_NAME);
    const g = b
      .seat(1)
      .library(...LIBRARY)
      .battlefield(WALL)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([GEORDI.name]);
    g.advanceTo('declareBlockers');
    return g;
  };

  test('with no Spacecraft it can be blocked', () => {
    const g = game(false);
    g.act(1).declareBlockers([{ blocker: WALL, attacker: GEORDI.name }]);
    g.expect.combat({ blocked: [GEORDI.name] });
  });

  test('with a Spacecraft it cannot be blocked (CR 509.1b, 611.3a)', () => {
    const g = game(true);
    // No creature can block it, so the engine asks for no block declaration at all.
    expect(() => g.act(1).declareBlockers([{ blocker: WALL, attacker: GEORDI.name }])).toThrow();
    g.expect.combat({ unblocked: [GEORDI.name] });
  });
});

describe('Picard Maneuver, the attack trigger of U.S.S. Stargazer, Here and There', () => {
  const game = () => {
    const g = scenario()
      .define(STARGAZER)
      .define(WALL_CARD)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(STARGAZER.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([STARGAZER.name]);
    return g;
  };

  test('attacking makes a tapped and attacking 4/3 colorless Spacecraft Illusion artifact creature with flying (CR 508.4, 110.5b)', () => {
    const g = game();
    g.passAll();
    const token = { name: 'Spacecraft Illusion', nth: 0 };
    g.expect.pt(token, 4, 3);
    g.expect.tapped(token, true);
    g.expect.derived(token, {
      types: ['artifact', 'creature'],
      subtypes: ['Spacecraft', 'Illusion'],
      colors: [],
      keywords: ['flying'],
    });
    g.expect.combat({ attackers: [STARGAZER.name, token] });
    g.expect.invariants();
  });

  test('the token is exiled at end of combat and the Stargazer stays (CR 603.7, 603.7c)', () => {
    const g = game();
    g.passAll();
    g.advanceTo('endOfCombat');
    g.passAll();
    g.expect.noObject('Spacecraft Illusion');
    g.expect.zone(STARGAZER.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('the token was never declared as an attacker, so it does not trigger the Stargazer (CR 508.4)', () => {
    const g = game();
    g.passAll();
    g.expect.stack([]);
    g.expect.librarySize(0, 10);
  });
});

describe('U.S.S. Stargazer, Here and There itself', () => {
  // CR 721.2b (Station): a Spacecraft is an artifact creature, with the power and toughness of its box, from the charge counters of the striation that holds the box. The engine does not
  // build that (docs/ROADMAP.md: a symbol is read with no power and toughness box), so a Spacecraft with 6 counters stays a plain artifact, never attacks, and the trigger above can
  // never happen: the card is flagged unsupported rather than guessed. This pin goes when the station creature is built.
  test('stays unsupported: its trigger sits after a station symbol line, in a striation the engine does not read', () => {
    const golden = parseGolden(
      readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
    ).find((card) => card.name === 'U.S.S. Stargazer, Here and There');
    expect(golden).toBeDefined();
    if (golden === undefined) return;
    const imported = importCard(fromGoldenCard(golden), undefined, NO_OVERRIDES);
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.unparsed.map((u) => u.text)).toEqual([
      expect.stringContaining('Picard Maneuver'),
    ]);
  });
});

describe('Unification (I: the owner draws two and the creature is shuffled in; II: a Spacecraft from hand or graveyard)', () => {
  const game = (extra: (b: ReturnType<typeof scenario>) => void = () => {}) => {
    const b = scenario()
      .define(UNIFICATION)
      .define(SHIP)
      .seat(0)
      .library(...LIBRARY);
    extra(b);
    return b
      .seat(0)
      .hand(UNIFICATION.name)
      .battlefield('Plains', 'Island', 'Island', 'Island', 'Island')
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs' })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  };

  test("chapter I: the owner of an opponent's creature draws two cards, then it is shuffled into their library (CR 108.3, 121.1, 701.24)", () => {
    const g = game();
    g.act(0).cast(UNIFICATION.name, { pay: true });
    g.pass();
    g.pass();
    g.act(0).chooseTargets('theirs');
    g.passAll();
    g.expect.handSize(1, 2);
    g.expect.librarySize(1, 9);
    g.expect.zone(BEARS, 'library', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('chapter I on your own creature: you draw two cards', () => {
    const g = game();
    g.act(0).cast(UNIFICATION.name, { pay: true });
    g.pass();
    g.pass();
    g.act(0).chooseTargets('mine');
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.librarySize(0, 9);
    g.expect.zone(BEARS, 'library', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('chapter I with no target (up to one) does nothing', () => {
    const g = game();
    g.act(0).cast(UNIFICATION.name, { pay: true });
    g.pass();
    g.pass();
    g.act(0).chooseTargets();
    g.passAll();
    g.expect.handSize(0, 0);
    g.expect.handSize(1, 0);
    g.expect.zone(BEARS, 'battlefield', { count: 2 });
  });

  /** The Saga is on the battlefield with one lore counter at the start of the controller's turn: the lore counter of chapter II is added after the draw step. */
  const chapterTwo = (zone: 'hand' | 'graveyard' | 'both', ...hand: string[]) => {
    const b = scenario()
      .define(UNIFICATION)
      .define(SHIP)
      .seat(0)
      .library(...LIBRARY);
    if (zone === 'hand') b.hand(SHIP_NAME, ...hand);
    else if (zone === 'graveyard') b.graveyard(SHIP_NAME).hand(...hand);
    else b.graveyard(SHIP_NAME).hand(SHIP_NAME, ...hand);
    const g = b
      .battlefield(UNIFICATION.name, { counters: { lore: 1 } })
      .seat(1)
      .library(...LIBRARY)
      .at('upkeep', { active: 0, turn: 3 })
      .build();
    g.advanceTo('precombatMain');
    return g;
  };

  test('chapter II: a Spacecraft card from the hand is put onto the battlefield (CR 400.7, 608.2d)', () => {
    const g = chapterTwo('hand');
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.zone(SHIP_NAME, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('chapter II: a Spacecraft card from the graveyard is put onto the battlefield too', () => {
    const g = chapterTwo('graveyard');
    g.passAll();
    g.act(0).accept();
    g.expect.zone(SHIP_NAME, 'battlefield', { seat: 0 });
  });

  test('chapter II: "you may": the card can be left where it is', () => {
    const g = chapterTwo('hand');
    g.passAll();
    g.act(0).decline();
    g.expect.zone(SHIP_NAME, 'hand', { seat: 0 });
  });

  test('chapter II: only a Spacecraft card qualifies, not another card of the hand', () => {
    const g = chapterTwo('graveyard', BEARS);
    g.passAll();
    g.act(0).accept();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.zone(SHIP_NAME, 'battlefield', { seat: 0 });
  });

  test('chapter II: with a Spacecraft card in both places the player chooses which one', () => {
    const g = chapterTwo('both');
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseCards({ name: SHIP_NAME, zone: 'graveyard', seat: 0 });
    g.expect.zone(SHIP_NAME, 'battlefield', { seat: 0, count: 1 });
    g.expect.zone(SHIP_NAME, 'hand', { seat: 0, count: 1 });
    g.expect.zone(SHIP_NAME, 'graveyard', { seat: 0, count: 0 });
  });
});
