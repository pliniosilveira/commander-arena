// The Final Fantasy X counter deck, group A (continued): Shelinda, Wakka and Tidus, played through applyAction from the REAL Oracle text of the golden corpus (no override), and Rikku's
// counter trigger, Resourceful Defense's first ability, Yuna's second ability and Tromell's static ability as the abilities of SYNTHETIC cards that carry only the text this group reads
// (the real cards keep an ability another group builds, so they stay unsupported until then). Pins: CR 122.6, 603.2 and 603.4 (counters put on a permanent, triggers about them, the
// intervening "if"), CR 603.10a and 113.7a (a permanent that left is read as it last was), CR 608.2c (a conditional instruction and its "otherwise"), CR 509.1b (can't be blocked),
// CR 603.2h ("Do this only once each turn"), CR 701.34 (proliferate).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function imported(name: string) {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  return importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
}

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = imported(name);
  expect(card.support.unparsed, name).toEqual([]);
  expect(card.support.status, name).toBe('supported');
  return card.definition;
}

const BEARS = 'Grizzly Bears'; // 2/2, {1}{G}
const SPIDER = 'Giant Spider'; // 2/4, {3}{G}
const ELVES = 'Llanowar Elves'; // 1/1, {G}
const BOON = 'SYNTHETIC Counter Boon'; // {G} instant: two +1/+1 counters on target creature
const FIRST_STRIKER = 'SYNTHETIC First Striker 2/2';
const LIBRARY = Array.from({ length: 10 }, () => 'Plains');

describe('Shelinda, Yevon Acolyte', () => {
  const shelinda = real('Shelinda, Yevon Acolyte');
  const SHELINDA = shelinda.name;

  const start = () =>
    scenario()
      .define(shelinda)
      .seat(0)
      .library(...LIBRARY)
      .hand(BEARS, ELVES, SPIDER)
      .battlefield('Forest', { count: 8 })
      .battlefield(SHELINDA)
      .seat(1)
      .library(...LIBRARY)
      .battlefield('SYNTHETIC Vanilla 1/1', { label: 'theirs' })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid and its trigger is a conditional counter with an else', () => {
    expect(validateCard(shelinda)).toEqual([]);
    expect(shelinda.faces[0]?.abilities[1]).toEqual({
      kind: 'triggered',
      trigger: {
        kind: 'entersBattlefield',
        what: { types: ['creature'], other: true, controller: 'you' },
      },
      effect: {
        kind: 'conditional',
        condition: { kind: 'subjectPowerLessThanThis' },
        effect: {
          kind: 'addCounters',
          objects: { kind: 'triggerSubject' },
          counter: '+1/+1',
          count: 1,
        },
        else: { kind: 'addCounters', objects: { kind: 'this' }, counter: '+1/+1', count: 1 },
      },
    });
  });

  test("a creature with less power than Shelinda's enters: the counter goes on that creature", () => {
    const g = start();
    g.act(0).cast(ELVES, { pay: true });
    g.passAll();
    g.expect.counters(ELVES, { '+1/+1': 1 });
    g.expect.counters(SHELINDA, {});
  });

  test("a creature with power equal to Shelinda's enters: the counter goes on Shelinda (otherwise)", () => {
    const g = start();
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.counters(BEARS, {});
    g.expect.counters(SHELINDA, { '+1/+1': 1 });
    g.expect.pt(SHELINDA, 3, 3);
  });

  test("the comparison reads Shelinda's power as the ability resolves: a 2/2 is less than her 3 after she grew", () => {
    const g = start();
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.pt(SHELINDA, 3, 3);
    g.act(0).cast(SPIDER, { pay: true });
    g.passAll();
    g.expect.counters(SPIDER, { '+1/+1': 1 });
    g.expect.counters(SHELINDA, { '+1/+1': 1 });
  });

  test("a creature an opponent controls entering is no trigger: the opponent's Bears stay bare", () => {
    const g = start();
    g.expect.counters('theirs', {});
    g.expect.counters(SHELINDA, {});
    g.expect.pending('priority', 0);
  });
});

describe('Wakka, Devoted Guardian', () => {
  const wakka = real('Wakka, Devoted Guardian');
  const WAKKA = wakka.name;

  const start = () =>
    scenario()
      .define(wakka)
      .seat(0)
      .library(...LIBRARY)
      .hand(BOON)
      .battlefield('Forest')
      .battlefield(WAKKA)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(ELVES, { label: 'elves' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Sol Ring', { label: 'ring' })
      .battlefield(SPIDER, { label: 'spider' })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid and its abilities are the engine shape', () => {
    expect(validateCard(wakka)).toEqual([]);
    expect(wakka.faces[0]?.abilities.slice(2)).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'player' },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', types: ['artifact'], controller: 'triggerPlayer' },
            },
            min: 0,
            max: 1,
          },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
            { kind: 'addCounters', objects: { kind: 'this' }, counter: '+1/+1', count: 1 },
          ],
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        interveningIf: { kind: 'counterPutOnThisThisTurn' },
        effect: {
          kind: 'addCounters',
          objects: {
            kind: 'each',
            filter: { zone: 'battlefield', types: ['creature'], other: true, controller: 'you' },
          },
          counter: '+1/+1',
          count: 1,
        },
      },
    ]);
  });

  test('combat damage to a player: destroys that player artifact, a counter on Wakka, and at the end step a counter on each other creature', () => {
    const g = start();
    g.advanceTo('declareAttackers');
    g.act(0).attack([WAKKA]);
    g.advanceTo('combatDamage');
    g.passAll();
    g.act(0).chooseTargets('ring');
    g.passAll();
    g.expect.zone('Sol Ring', 'graveyard', { seat: 1 });
    g.expect.counters(WAKKA, { '+1/+1': 1 });
    g.advanceTo('end');
    g.passAll();
    g.expect.counters('bears', { '+1/+1': 1 });
    g.expect.counters('elves', { '+1/+1': 1 });
    g.expect.counters(WAKKA, { '+1/+1': 1 });
    g.expect.life(1, 36);
  });

  test('"up to one": no artifact chosen still puts the counter on Wakka (and no target is needed)', () => {
    const g = start();
    g.advanceTo('declareAttackers');
    g.act(0).attack([WAKKA]);
    g.advanceTo('combatDamage');
    g.passAll();
    g.act(0).chooseTargets();
    g.passAll();
    g.expect.zone('Sol Ring', 'battlefield', { seat: 1 });
    g.expect.counters(WAKKA, { '+1/+1': 1 });
  });

  test('no counter was put on Wakka this turn: nothing at the end step (CR 603.4)', () => {
    const g = start();
    g.advanceTo('end');
    g.passAll();
    g.expect.counters('bears', {});
    g.expect.counters('elves', {});
  });

  test('a counter put on Wakka by another effect counts too: the end step trigger', () => {
    const g = start();
    g.act(0).cast(BOON, { targets: [WAKKA], pay: true });
    g.passAll();
    g.expect.counters(WAKKA, { '+1/+1': 2 });
    g.advanceTo('end');
    g.passAll();
    g.expect.counters('bears', { '+1/+1': 1 });
    g.expect.counters('elves', { '+1/+1': 1 });
  });

  test('a counter put on another creature does not count: Wakka itself got none', () => {
    const g = start();
    g.act(0).cast(BOON, { targets: ['bears'], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.counters('bears', { '+1/+1': 2 });
    g.expect.counters('elves', {});
  });

  test('the turn log starts over: a counter of an earlier turn does not count at a later end step', () => {
    const g = start();
    g.act(0).cast(BOON, { targets: [WAKKA], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.counters('bears', { '+1/+1': 1 });
    g.advanceTo('end', { turn: 'next' });
    g.passAll();
    g.expect.counters('bears', { '+1/+1': 1 });
  });
});

describe("Tidus, Yuna's Guardian: Cheer", () => {
  const tidus = real("Tidus, Yuna's Guardian");
  const TIDUS = tidus.name;

  const start = () =>
    scenario()
      .define(tidus)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TIDUS, { label: 'tidus' })
      .battlefield(FIRST_STRIKER, { label: 'striker', counters: { '+1/+1': 1 } })
      .battlefield(BEARS, { label: 'bears', counters: { '+1/+1': 1 } })
      .battlefield(ELVES, { label: 'bare' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  /** Through the beginning of combat trigger (declined) to the declare attackers decision. */
  const toAttackers = (g: ReturnType<typeof start>) => {
    g.advanceTo('beginningOfCombat');
    g.act(0).chooseTargets('bears', 'bare');
    g.passAll();
    g.act(0).decline();
    g.advanceTo('declareAttackers');
  };

  test('the card is valid and its Cheer trigger is a batch trigger that is once each turn', () => {
    expect(validateCard(tidus)).toEqual([]);
    expect(tidus.faces[0]?.abilities[1]).toEqual({
      kind: 'triggered',
      trigger: {
        kind: 'combatDamageBatch',
        what: { types: ['creature'], controller: 'you', hasCounter: true },
        to: 'player',
      },
      effect: {
        kind: 'sequence',
        effects: [{ kind: 'draw', player: { kind: 'you' }, count: 1 }, { kind: 'proliferate' }],
      },
      optional: true,
      doOnlyOnceEachTurn: true,
    });
  });

  test('creatures with counters deal combat damage to a player: you may draw a card and proliferate', () => {
    const g = start();
    const before = g.state.seats[0]?.hand.length ?? 0;
    toAttackers(g);
    g.act(0).attack(['bears']);
    g.advanceTo('combatDamage');
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    expect(g.state.seats[0]?.hand.length).toBe(before + 1);
    // Proliferate (CR 701.34): the player chooses the permanents that get another counter of each kind.
    g.act(0).choosePermanents('bears');
    g.expect.counters('bears', { '+1/+1': 2 });
    g.expect.counters('striker', { '+1/+1': 1 });
  });

  test('a creature without counters dealing damage is no trigger', () => {
    const g = start();
    toAttackers(g);
    g.act(0).attack(['bare']);
    g.advanceTo('endOfCombat');
    expect(g.state.seats[0]?.hand.length).toBe(0);
  });

  test('declining does nothing: no card, nothing proliferated', () => {
    const g = start();
    toAttackers(g);
    g.act(0).attack(['bears']);
    g.advanceTo('combatDamage');
    g.passAll();
    g.act(0).decline();
    expect(g.state.seats[0]?.hand.length).toBe(0);
    g.expect.counters('bears', { '+1/+1': 1 });
  });

  test('"Do this only once each turn" (CR 603.2h): damage in the first strike step and again in the regular step offers it once', () => {
    const g = start();
    toAttackers(g);
    g.act(0).attack(['striker', 'bears']);
    g.advanceTo('declareBlockers');
    g.passAll();
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.act(0).choosePermanents();
    expect(g.state.seats[0]?.hand.length).toBe(1);
    g.advanceTo('endOfCombat');
    // The second damage step did not offer it again.
    expect(g.state.seats[0]?.hand.length).toBe(1);
  });
});

describe('Rikku, Resourceful Guardian: the counter trigger (SYNTHETIC card with that text only)', () => {
  const rikku = parsed(
    'SYNTHETIC Rikku Trigger',
    'Legendary Creature — Human Artificer',
    'Whenever you put one or more counters on a creature, until end of turn, that creature can’t be blocked by creatures your opponents control.',
    { manaCost: '{2}{U}', power: '2', toughness: '3' },
  );
  const RIKKU = rikku.name;

  const start = () =>
    scenario()
      .define(rikku)
      .seat(0)
      .library(...LIBRARY)
      .hand(BOON)
      .battlefield('Forest')
      .battlefield(RIKKU)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(ELVES, { label: 'elves' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'wall' })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid and its trigger is the engine shape', () => {
    expect(validateCard(rikku)).toEqual([]);
    expect(rikku.faces[0]?.abilities[0]).toEqual({
      kind: 'triggered',
      trigger: { kind: 'countersAdded', what: { types: ['creature'] }, by: 'you' },
      effect: {
        kind: 'cantBeBlockedByPlayer',
        objects: { kind: 'triggerSubject' },
        player: { kind: 'eachOpponent' },
      },
    });
  });

  test('the creature you put counters on can not be blocked by an opponent creature this turn, others can (CR 509.1b)', () => {
    const g = start();
    g.act(0).cast(BOON, { targets: ['bears'], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack(['bears', 'elves']);
    g.advanceTo('declareBlockers');
    g.expect.canBlock('wall', 'bears', false);
    g.expect.canBlock('wall', 'elves', true);
  });

  test('without counters nothing is restricted', () => {
    const g = start();
    g.advanceTo('declareAttackers');
    g.act(0).attack(['bears']);
    g.advanceTo('declareBlockers');
    g.expect.canBlock('wall', 'bears', true);
  });

  test('it lasts the turn only', () => {
    const g = start();
    g.act(0).cast(BOON, { targets: ['bears'], pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('declareAttackers');
    g.act(0).attack(['bears']);
    g.advanceTo('declareBlockers');
    g.expect.canBlock('wall', 'bears', true);
  });
});
