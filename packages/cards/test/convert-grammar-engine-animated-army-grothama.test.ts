// Animated Army deck, the damage group: Grothama, All-Devouring ("Other creatures have \"Whenever this creature attacks, you may have it fight Grothama, All-Devouring.\"" and
// "When Grothama leaves the battlefield, each player draws cards equal to the amount of damage dealt to Grothama this turn by sources they controlled."), read by the grammar and
// run by the engine. The first block parses the REAL Oracle text from the golden corpus, whole; the rest are SYNTHETIC cards whose abilities are the real lines (the name
// replaced), played through `applyAction` with the scenario DSL. Every synthetic name starts with "SYNTHETIC". Pins: CR 113.6 and 613.1f (the granted ability names the permanent that
// grants it), CR 603.2 and 701.14 (the fight is a triggered ability of the attacker, its controller chooses), CR 120.3 and 608.2h (damage by the controller of the source as it was
// dealt), CR 603.10a and 400.7 (the leaves-the-battlefield ability looks back), CR 101.4 (each player in turn order).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const GOLDEN: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

const GRANT = 'Other creatures have "Whenever this creature attacks, you may have it fight ~."';
const LEAVES =
  'When ~ leaves the battlefield, each player draws cards equal to the amount of damage dealt to ~ this turn by sources they controlled.';
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const FILLER = Array.from({ length: 12 }, () => 'Plains');

describe('the real card, whole', () => {
  const card = GOLDEN.find((c) => c.name === 'Grothama, All-Devouring');
  if (card === undefined) throw new Error('Grothama is not in the golden corpus');
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);

  test('is supported and valid', () => {
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(validateCard(imported.definition)).toEqual([]);
  });
});

describe('the grammar reads the two lines', () => {
  test('the quoted ability fights the permanent that grants it', () => {
    const [grant] = readAll(GRANT.replace('~', 'SYNTHETIC Card'), 'creature').abilities;
    expect(grant).toMatchObject({
      kind: 'static',
      static: {
        kind: 'grantAbility',
        subject: { kind: 'filter', other: true },
        ability: {
          kind: 'triggered',
          trigger: { kind: 'attacks', what: { kind: 'this' } },
          effect: { kind: 'fight', fighters: { kind: 'this' }, against: { kind: 'granter' } },
          optional: true,
        },
      },
    });
  });

  test.each([
    [
      'another amount of damage',
      LEAVES.replace('sources they controlled', 'sources you controlled'),
    ],
    ['only combat damage', LEAVES.replace('amount of damage', 'amount of combat damage')],
  ])('%s is not read', (_what, text) => {
    expect(dropped(text.replaceAll('~', 'SYNTHETIC Card'), 'creature')).toBeDefined();
  });
});

describe('Grothama: the fights and the cards', () => {
  const wurm: CardDefinition = parsed(
    'SYNTHETIC Parsed Wurm',
    'Creature — Wurm',
    `${GRANT}\n${LEAVES}`,
    { manaCost: '{3}{G}{G}', colors: ['G'], power: '10', toughness: '8' },
  );

  test('the card is valid', () => {
    expect(validateCard(wurm)).toEqual([]);
  });

  const table = () =>
    scenario()
      .seat(0)
      .define(wurm)
      .battlefield(wurm.name, BEARS, 'Mountain')
      .hand(BOLT)
      .library(...FILLER)
      .seat(1)
      .battlefield('Grizzly Bears', { label: 'theirs' })
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('an attacking creature of the controller may fight it: the 2/2 deals 2 damage and dies', () => {
    const g = table();
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: BEARS, seat: 0 }]);
    g.passAll();
    g.act(0).accept();
    g.expect.damage(wurm.name, 2);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('declining the fight leaves everything as it is', () => {
    const g = table();
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: BEARS, seat: 0 }]);
    g.passAll();
    g.act(0).decline();
    g.expect.damage(wurm.name, 0);
  });

  test('the creatures of an opponent have it too, and their controller chooses', () => {
    const g = scenario()
      .seat(0)
      .define(wurm)
      .battlefield(wurm.name)
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS)
      .library(...FILLER)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).attack([{ name: BEARS, seat: 1 }]);
    g.passAll();
    g.act(1).accept();
    g.expect.damage(wurm.name, 2);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('each attacking creature has its own fight, and once Grothama is gone the remaining ones do nothing (the ruling)', () => {
    const g = scenario()
      .seat(0)
      .define(wurm)
      .battlefield(wurm.name, BEARS, BEARS, 'Swamp', 'Swamp', 'Swamp')
      .hand('Murder')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([
      { name: BEARS, seat: 0, nth: 0 },
      { name: BEARS, seat: 0, nth: 1 },
    ]);
    // The ruling: the attacking player chooses the order of the fights (CR 603.3b).
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    expect(g.state.stack.length).toBe(2);
    g.act(0).cast('Murder', { targets: [wurm.name], pay: true });
    g.passAll();
    g.expect.zone(wurm.name, 'graveyard', { seat: 0 });
    // The two fights resolve now: the creature they would fight is gone, nothing is dealt and both Bears live.
    while (g.state.pending?.kind === 'confirmOptional') g.act(0).accept();
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0, count: 2 });
  });

  test('the damage of this turn is recorded by the controller of the source (CR 120.3, 608.2h)', () => {
    const g = table();
    g.act(0).cast(BOLT, { targets: [wurm.name], pay: true });
    g.passAll();
    g.expect.damage(wurm.name, 3);
    expect(g.state.turnLog.damageToObjects?.[g.id(wurm.name)]).toEqual([3, 0]);
  });

  describe('when it leaves the battlefield: each player draws what sources they controlled dealt to it this turn', () => {
    const three = () =>
      scenario({ seats: 3 })
        .seat(0)
        .define(wurm)
        .battlefield(wurm.name, 'Mountain', 'Swamp', 'Swamp', 'Swamp')
        .hand(BOLT, 'Murder')
        .library(...FILLER)
        .seat(1)
        .battlefield('Mountain')
        .hand(BOLT)
        .library(...FILLER)
        .seat(2)
        .library(...FILLER)
        .at('precombatMain', { active: 0 })
        .build();

    test('with three seats: 3 from the Bolt of seat 0 and 3 from the one of seat 1, and none for seat 2; the draws are in turn order', () => {
      const g = three();
      g.act(0).cast(BOLT, { targets: [wurm.name], pay: true });
      g.pass();
      g.act(1).cast(BOLT, { targets: [wurm.name], pay: true });
      g.passAll();
      g.expect.damage(wurm.name, 6);
      g.act(0).cast('Murder', { targets: [wurm.name], pay: true });
      g.passAll();
      g.expect.zone(wurm.name, 'graveyard', { seat: 0 });
      g.expect.handSize(0, 3);
      g.expect.handSize(1, 3);
      g.expect.handSize(2, 0);
      // CR 101.4: seat 0 draws its three, then seat 1 its three (in order, one after the other).
      const seats = g.events.flatMap((e) => (e.kind === 'cardDrawn' ? [e.seat] : []));
      expect(seats.slice(-6)).toEqual([0, 0, 0, 1, 1, 1]);
    });

    test('it leaves with no damage: nobody draws', () => {
      const g = three();
      g.act(0).cast('Murder', { targets: [wurm.name], pay: true });
      g.passAll();
      g.expect.zone(wurm.name, 'graveyard', { seat: 0 });
      g.expect.handSize(0, 1);
      g.expect.handSize(1, 1);
      g.expect.handSize(2, 0);
    });
  });
});
