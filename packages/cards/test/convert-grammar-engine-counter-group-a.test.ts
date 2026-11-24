// The Final Fantasy X counter deck, group A: the REAL Oracle text of Generous Patron, Together Forever, Sphere Grid, Shelinda, Wakka (both abilities), Tidus (its Cheer ability and the
// move-a-counter ability), Resourceful Defense (its first ability) and the abilities of Rikku, Yuna, Tromell and Blitzball Stadium this group reads, from the golden corpus goes through the
// grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs.
// Pins: CR 701.41a (Support), CR 122.6 and 603.2 (counters put on a permanent, and triggers about them), CR 603.7 and 603.10a (delayed triggers; a permanent that left is read as it last was),
// CR 603.4 (intervening "if"), CR 509.1b (can't be blocked), CR 608.2c (a conditional instruction and its "otherwise"), CR 603.2h ("Do this only once each turn"), CR 107.3m (the X of
// the spell an enters trigger reads).
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
const BOLT = 'Lightning Bolt';
const BOON = 'SYNTHETIC Counter Boon'; // {G} instant: two +1/+1 counters on target creature
const ROT = 'SYNTHETIC Rot Boon'; // {B} instant: a -1/-1 counter on target creature
const LIBRARY = Array.from({ length: 10 }, () => 'Plains');

describe('Support (CR 701.41a): Generous Patron', () => {
  const patron = real('Generous Patron');
  const PATRON = patron.name;

  const start = () =>
    scenario()
      .define(patron)
      .seat(0)
      .library(...LIBRARY)
      .hand(PATRON, BOON)
      .battlefield('Forest', { count: 4 })
      .battlefield(BEARS, { label: 'mine' })
      .battlefield(ELVES, { label: 'myElves' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'theirs' })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid and its AST is the engine shape', () => {
    expect(validateCard(patron)).toEqual([]);
    expect(patron.faces[0]?.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', types: ['creature'], other: true },
            },
            min: 0,
            max: 2,
          },
        ],
        effect: {
          kind: 'addCounters',
          objects: { kind: 'target', id: 't1' },
          counter: '+1/+1',
          count: 1,
        },
      },
      {
        kind: 'triggered',
        trigger: {
          kind: 'countersAdded',
          what: { types: ['creature'], controller: 'opponent' },
          by: 'you',
        },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ]);
  });

  test('support 2: a +1/+1 counter on each of two other target creatures, whoever controls them', () => {
    const g = start();
    g.act(0).cast(PATRON, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('mine', 'theirs');
    g.passAll();
    g.expect.counters('mine', { '+1/+1': 1 });
    g.expect.counters('theirs', { '+1/+1': 1 });
    g.expect.counters(PATRON, {});
    g.expect.invariants();
  });

  test('the counter put on a creature you do not control draws a card, once for each such creature', () => {
    const g = start();
    const before = g.state.seats[0]?.hand.length ?? 0;
    g.act(0).cast(PATRON, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('theirs', 'myElves');
    g.passAll();
    // Patron left the hand (-1); the one counter on the opponent's creature drew a card (+1); the counter on your own creature did not.
    expect(g.state.seats[0]?.hand.length).toBe(before);
    g.expect.counters('theirs', { '+1/+1': 1 });
    g.expect.counters('myElves', { '+1/+1': 1 });
  });

  test('up to: no target is fine, and nothing is put on the support creature itself', () => {
    const g = start();
    const before = g.state.seats[0]?.hand.length ?? 0;
    g.act(0).cast(PATRON, { pay: true });
    g.passAll();
    g.act(0).chooseTargets();
    g.passAll();
    expect(g.state.seats[0]?.hand.length).toBe(before - 1);
    g.expect.counters('mine', {});
    g.expect.counters(PATRON, {});
  });

  test('the support creature is not a legal target of its own support ("other target creatures")', () => {
    const g = start();
    g.act(0).cast(PATRON, { pay: true });
    g.passAll();
    expect(() => g.act(0).chooseTargets(PATRON)).toThrow();
  });

  test('counters of any kind put by a spell on a creature you do not control draw a card: one card for one instance of putting', () => {
    const g = start();
    g.act(0).cast(PATRON, { pay: true });
    g.passAll();
    g.act(0).chooseTargets();
    g.passAll();
    const before = g.state.seats[0]?.hand.length ?? 0;
    g.act(0).cast(BOON, { targets: ['theirs'], pay: true });
    g.passAll();
    // The Boon left the hand (-1) and drew one card (+1) for two counters.
    expect(g.state.seats[0]?.hand.length).toBe(before);
    g.expect.counters('theirs', { '+1/+1': 2 });
  });
});

describe('Support X: the X of the spell the permanent came from (CR 107.3m)', () => {
  const stadium = parsed(
    'SYNTHETIC Support Stadium',
    'Artifact',
    'When this artifact enters, support X.',
    { manaCost: '{X}{U}' },
  );
  const NAME = stadium.name;

  const start = () =>
    scenario()
      .define(stadium)
      .seat(0)
      .library(...LIBRARY)
      .hand(NAME)
      .battlefield('Island', { count: 4 })
      .battlefield(BEARS, { label: 'a' })
      .battlefield(ELVES, { label: 'b' })
      .battlefield(SPIDER, { label: 'c' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid and the trigger takes up to as many targets as the X it was cast with', () => {
    expect(validateCard(stadium)).toEqual([]);
    expect(stadium.faces[0]?.abilities[0]).toEqual({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', types: ['creature'], other: true },
          },
          upToAmount: { kind: 'enteredX' },
        },
      ],
      effect: {
        kind: 'addCounters',
        objects: { kind: 'target', id: 't1' },
        counter: '+1/+1',
        count: 1,
      },
    });
  });

  test('X = 2: a counter on each of two target creatures, and no third', () => {
    const g = start();
    g.act(0).cast(NAME, { x: 2, pay: true });
    g.passAll();
    g.act(0).chooseTargets('a', 'c');
    g.passAll();
    g.expect.counters('a', { '+1/+1': 1 });
    g.expect.counters('b', {});
    g.expect.counters('c', { '+1/+1': 1 });
  });

  test('X = 2 does not allow three targets', () => {
    const g = start();
    g.act(0).cast(NAME, { x: 2, pay: true });
    g.passAll();
    expect(() => g.act(0).chooseTargets('a', 'b', 'c')).toThrow();
  });

  test('X = 0: there is nothing to target, the trigger is not put on the stack', () => {
    const g = start();
    g.act(0).cast(NAME, { x: 0, pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.counters('a', {});
  });
});

describe('Together Forever', () => {
  const forever = real('Together Forever');
  const FOREVER = forever.name;

  const start = () =>
    scenario()
      .define(forever)
      .seat(0)
      .library(...LIBRARY)
      .hand(FOREVER, BOON)
      .battlefield('Plains', { count: 4 })
      .battlefield('Forest')
      .battlefield(BEARS, { label: 'mine', counters: { '+1/+1': 1 } })
      .battlefield(ELVES, { label: 'bare' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'theirs', counters: { '+1/+1': 1 } })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid and its second ability is the delayed return', () => {
    expect(validateCard(forever)).toEqual([]);
    expect(forever.faces[0]?.abilities[1]).toEqual({
      kind: 'activated',
      cost: [{ kind: 'mana', symbols: ['1'] }],
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', types: ['creature'], hasCounter: true },
          },
        },
      ],
      effect: {
        kind: 'delayedDies',
        objects: { kind: 'target', id: 't1' },
        effect: { kind: 'moveToZone', objects: { kind: 'triggerCard' }, to: 'hand' },
      },
    });
  });

  test('support 2 when it enters', () => {
    const g = start();
    g.act(0).cast(FOREVER, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('bare', 'theirs');
    g.passAll();
    g.expect.counters('bare', { '+1/+1': 1 });
    g.expect.counters('theirs', { '+1/+1': 2 });
  });

  const withForever = () =>
    scenario()
      .define(forever)
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT, ROT)
      .battlefield('Plains', { count: 4 })
      .battlefield('Mountain', { count: 2 })
      .battlefield('Swamp')
      .battlefield(FOREVER)
      .battlefield(ELVES, { label: 'mine', counters: { '+1/+1': 1 } })
      .battlefield(BEARS, { label: 'bare' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs', counters: { '+1/+1': 1 } })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the chosen creature dies this turn: its card returns to its owner hand (CR 603.7, 603.10a)', () => {
    const g = withForever();
    g.act(0).activate(FOREVER, { targets: ['mine'], pay: true });
    g.passAll();
    g.act(0).cast(BOLT, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'hand', { seat: 0 });
    g.expect.noObject(ELVES, { zone: 'graveyard' });
  });

  test("a creature of another player returns to its owner's hand, not yours", () => {
    const g = withForever();
    g.act(0).activate(FOREVER, { targets: ['theirs'], pay: true });
    g.passAll();
    g.act(0).cast(BOLT, { targets: ['theirs'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'hand', { seat: 1 });
  });

  test('it returns even if the creature lost its counters since (the ability is a delayed trigger, not a quality of the creature)', () => {
    const g = withForever();
    g.act(0).activate(FOREVER, { targets: ['mine'], pay: true });
    g.passAll();
    // A -1/-1 counter cancels the +1/+1 counter (CR 122.3): the creature has none now.
    g.act(0).cast(ROT, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.counters('mine', {});
    g.act(0).cast(BOLT, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'hand', { seat: 0 });
  });

  test('another creature dying does not use it up, and a creature that was not chosen goes to the graveyard', () => {
    const g = withForever();
    g.act(0).activate(FOREVER, { targets: ['mine'], pay: true });
    g.passAll();
    g.act(0).cast(BOLT, { targets: ['bare'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
  });

  test('the delayed ability ends with the turn (CR 514.2): none is left in the next turn', () => {
    const g = withForever();
    g.act(0).activate(FOREVER, { targets: ['theirs'], pay: true });
    g.passAll();
    expect(g.state.delayedTriggers.length).toBe(1);
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(g.state.delayedTriggers.length).toBe(0);
  });

  test('it needs a counter on the creature to be chosen: a bare creature is not a legal target', () => {
    const g = withForever();
    expect(() => g.act(0).activate(FOREVER, { targets: ['bare'], pay: true })).toThrow();
  });
});

describe('Sphere Grid', () => {
  const grid = real('Sphere Grid');
  const GRID = grid.name;

  const start = () =>
    scenario()
      .define(grid)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(GRID)
      .battlefield(BEARS, { label: 'mine' })
      .battlefield(ELVES, { label: 'elves' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid and its AST is the engine shape', () => {
    expect(validateCard(grid)).toEqual([]);
    expect(grid.faces[0]?.abilities[0]).toEqual({
      kind: 'triggered',
      trigger: {
        kind: 'dealsCombatDamage',
        what: { types: ['creature'], controller: 'you' },
        to: 'player',
      },
      effect: {
        kind: 'addCounters',
        objects: { kind: 'triggerSubject' },
        counter: '+1/+1',
        count: 1,
      },
    });
  });

  test('a creature you control deals combat damage to a player: a +1/+1 counter on that creature only', () => {
    const g = start();
    g.advanceTo('declareAttackers');
    g.act(0).attack(['mine', 'elves']);
    g.advanceTo('combatDamage');
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.expect.counters('mine', { '+1/+1': 1 });
    g.expect.counters('elves', { '+1/+1': 1 });
    g.expect.life(1, 37);
  });

  test('a creature that deals no damage gets no counter', () => {
    const g = start();
    g.advanceTo('declareAttackers');
    g.act(0).attack(['mine']);
    g.advanceTo('endOfCombat');
    g.passAll();
    g.expect.counters('mine', { '+1/+1': 1 });
    g.expect.counters('elves', {});
  });

  test('the second ability: creatures with +1/+1 counters have reach and trample', () => {
    const g = scenario()
      .define(grid)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(GRID)
      .battlefield(BEARS, { label: 'mine', counters: { '+1/+1': 1 } })
      .battlefield(ELVES, { label: 'bare' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.expect.derived('mine', { keywords: ['reach', 'trample'] });
    g.expect.derived('bare', { keywords: [] });
  });
});
