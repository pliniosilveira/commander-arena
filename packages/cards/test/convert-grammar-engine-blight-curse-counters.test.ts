// The Blight Curse deck, group "counter triggers" (Lorwyn Eclipsed): the REAL Oracle text of Flourishing Defenses, Auntie Ool, Cursewretch (her counter trigger), Lasting Tarfire, Kulrath
// Knight, Puca's Covenant, The Reaper, King No More, Oft-Nabbed Goat (its death trigger) and Massacre Girl, Known Killer from the golden corpus goes through the grammar as a card with
// no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. Pins: CR 122.6 and 603.2
// (counters put on a permanent, once for each counter of the singular wording and once for the instance of "one or more"), CR 603.10a and 113.7a (a permanent that left the battlefield
// is read as it last was), CR 603.2h ("Do this only once each turn"), CR 122.1 (counters), CR 508.1a and 509.1a ("can't attack or block"), CR 102.1 (each other player).
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
const ROT = 'SYNTHETIC Rot Boon'; // {B} instant: a -1/-1 counter on target creature
const BOON = 'SYNTHETIC Counter Boon'; // {G} instant: two +1/+1 counters on target creature
const LIBRARY = Array.from({ length: 10 }, () => 'Plains');

/** SYNTHETIC: "Put two -1/-1 counters on target creature." (one instance of putting, two counters) */
const DOUBLE_ROT = parsed(
  'SYNTHETIC Double Rot',
  'Instant',
  'Put two -1/-1 counters on target creature.',
  { manaCost: '{B}' },
);

describe('Flourishing Defenses', () => {
  const defenses = real('Flourishing Defenses');
  const DEFENSES = defenses.name;

  const start = () =>
    scenario()
      .define(defenses)
      .define(DOUBLE_ROT)
      .seat(0)
      .library(...LIBRARY)
      .hand(ROT, BOON, DOUBLE_ROT.name)
      .battlefield('Swamp', { count: 3 })
      .battlefield('Forest')
      .battlefield(DEFENSES)
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'theirs' })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid and its AST is the engine shape', () => {
    expect(validateCard(defenses)).toEqual([]);
    expect(defenses.faces[0]?.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: {
          kind: 'countersAdded',
          what: { types: ['creature'] },
          counter: '-1/-1',
          by: 'any',
          each: true,
        },
        effect: expect.objectContaining({ kind: 'createToken', count: 1 }),
        optional: true,
      },
    ]);
  });

  test('a -1/-1 counter put on a creature offers a 1/1 green Elf Warrior token, whoever controls the creature', () => {
    const g = start();
    g.act(0).cast(ROT, { targets: ['theirs'], pay: true });
    g.passAll();
    g.expect.counters('theirs', { '-1/-1': 1 });
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.zone('Elf Warrior', 'battlefield', { seat: 0, count: 1 });
    g.expect.pt('Elf Warrior', 1, 1);
    g.expect.invariants();
  });

  test('the controller may decline: no token', () => {
    const g = start();
    g.act(0).cast(ROT, { targets: ['mine'], pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.noObject('Elf Warrior', { zone: 'battlefield' });
  });

  test('+1/+1 counters are another kind: nothing triggers', () => {
    const g = start();
    g.act(0).cast(BOON, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.counters('mine', { '+1/+1': 2 });
    g.expect.pending('priority', 0);
    g.expect.noObject('Elf Warrior', { zone: 'battlefield' });
  });

  test('two counters put on at once trigger it twice (CR 122.6, 603.2: one trigger for each counter of the singular wording)', () => {
    const g = start();
    g.act(0).cast(DOUBLE_ROT.name, { targets: ['theirs'], pay: true });
    g.passAll();
    g.expect.counters('theirs', { '-1/-1': 2 });
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.zone('Elf Warrior', 'battlefield', { seat: 0, count: 2 });
  });
});

describe('Auntie Ool, Cursewretch: "Whenever one or more -1/-1 counters are put on a creature, ..."', () => {
  const ool = imported('Auntie Ool, Cursewretch');
  const OOL = ool.definition.name;

  test('the card is valid, fully supported now, and its AST is the engine shape', () => {
    expect(ool.support.unparsed).toEqual([]);
    expect(ool.support.status).toBe('supported');
    expect(validateCard(ool.definition)).toEqual([]);
    expect(ool.definition.faces[0]?.abilities[1]).toEqual({
      kind: 'triggered',
      trigger: {
        kind: 'countersAdded',
        what: { types: ['creature'] },
        counter: '-1/-1',
        by: 'any',
      },
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'conditional',
            condition: { kind: 'subjectControlledByYou' },
            effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
          },
          {
            kind: 'conditional',
            condition: { kind: 'not', term: { kind: 'subjectControlledByYou' } },
            effect: {
              kind: 'loseLife',
              player: { kind: 'controllerOf', of: { kind: 'triggerSubject' } },
              amount: 1,
            },
          },
        ],
      },
    });
  });

  const start = () =>
    scenario()
      .define(ool.definition)
      .define(DOUBLE_ROT)
      .seat(0)
      .library(...LIBRARY)
      .hand(ROT, DOUBLE_ROT.name)
      .battlefield('Swamp', { count: 3 })
      .battlefield(OOL)
      .battlefield(SPIDER, { label: 'mine' })
      .battlefield(ELVES, { label: 'myElves' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'theirs' })
      .battlefield(ELVES, { label: 'theirElves' })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('a counter on a creature its controller controls: the controller draws a card', () => {
    const g = start();
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.act(0).cast(ROT, { targets: ['mine'], pay: true });
    g.passAll();
    expect(g.state.seats[0]?.hand.length).toBe(hand); // the Rot Boon left the hand and a card was drawn
    g.expect.life(1, 40);
    g.expect.counters('mine', { '-1/-1': 1 });
  });

  test("a counter on another player's creature: its controller loses 1 life and nobody draws", () => {
    const g = start();
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.act(0).cast(ROT, { targets: ['theirs'], pay: true });
    g.passAll();
    expect(g.state.seats[0]?.hand.length).toBe(hand - 1);
    g.expect.life(1, 39);
    g.expect.life(0, 40);
  });

  test('one or more counters at once: one trigger, one card (CR 603.2)', () => {
    const g = start();
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.act(0).cast(DOUBLE_ROT.name, { targets: ['mine'], pay: true });
    g.passAll();
    expect(g.state.seats[0]?.hand.length).toBe(hand);
    g.expect.counters('mine', { '-1/-1': 2 });
  });

  test("a creature that died of the counter is read as it last was: the controller's 1/1 dies and its controller loses 1 life (CR 603.10a, 608.2h)", () => {
    const g = start();
    g.act(0).cast(ROT, { targets: ['theirElves'], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    g.expect.life(1, 39);
  });

  test('your own creature that died of the counter still counts as yours: you draw', () => {
    const g = start();
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.act(0).cast(ROT, { targets: ['myElves'], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
    expect(g.state.seats[0]?.hand.length).toBe(hand);
    g.expect.life(1, 40);
  });
});

describe('Lasting Tarfire', () => {
  const tarfire = real('Lasting Tarfire');
  const TARFIRE = tarfire.name;

  const start = () =>
    scenario()
      .define(tarfire)
      .seat(0)
      .library(...LIBRARY)
      .hand(ROT, BOON)
      .battlefield('Swamp', { count: 2 })
      .battlefield('Forest')
      .battlefield(TARFIRE)
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .hand(ROT)
      .battlefield('Swamp')
      .battlefield(SPIDER, { label: 'theirs' })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid and its AST is the engine shape', () => {
    expect(validateCard(tarfire)).toEqual([]);
    expect(tarfire.faces[0]?.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'each' },
        interveningIf: { kind: 'putCountersThisTurn', onType: 'creature' },
        effect: { kind: 'dealDamage', amount: 2, to: { kind: 'eachOpponent' } },
      },
    ]);
  });

  test('no counter was put this turn: no damage at the end step', () => {
    const g = start();
    g.advanceTo('end');
    g.passAll();
    g.expect.life(1, 40);
  });

  test('a counter the controller put on a creature this turn: 2 damage to each opponent at the end step', () => {
    const g = start();
    g.act(0).cast(ROT, { targets: ['theirs'], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.life(1, 38);
    g.expect.life(0, 40);
  });

  test('any kind of counter counts: two +1/+1 counters', () => {
    const g = start();
    g.act(0).cast(BOON, { targets: ['mine'], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.life(1, 38);
  });

  test('the end step of any turn: a counter the controller puts during the opponent turn counts at that end step too', () => {
    const g = start();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.step('precombatMain', { active: 1, turn: 4 });
    g.act(1).pass();
    g.act(0).cast(ROT, { targets: ['theirs'], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.life(1, 38);
  });

  test("an opponent's counters do not count: they put it, so nobody is damaged", () => {
    const g = start();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(1).cast(ROT, { targets: ['mine'], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.life(1, 40);
    g.expect.life(0, 40);
  });

  test('the turn log starts over: a counter of an earlier turn does not count', () => {
    const g = start();
    g.act(0).cast(ROT, { targets: ['theirs'], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.life(1, 38);
    g.advanceTo('end', { turn: 'next' });
    g.passAll();
    g.expect.life(1, 38);
  });
});

describe('Kulrath Knight: "Creatures your opponents control with counters on them can\'t attack or block."', () => {
  const knight = real('Kulrath Knight');
  const KNIGHT = knight.name;

  const start = (active: 0 | 1) =>
    scenario()
      .define(knight)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(KNIGHT)
      .battlefield(BEARS, { label: 'mineCounter', counters: { '+1/+1': 1 } })
      .battlefield(ELVES, { label: 'mineBare' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'withCounter', counters: { '+1/+1': 1 } })
      .battlefield(ELVES, { label: 'bare' })
      .at('precombatMain', { active })
      .build();

  test('the card is valid and says both restrictions for the opponents creatures with counters', () => {
    expect(validateCard(knight)).toEqual([]);
    const restrictions = (knight.faces[0]?.abilities ?? []).flatMap((a) =>
      a.kind === 'static' && a.static.kind === 'restriction' ? [a.static.restriction] : [],
    );
    expect(restrictions.sort()).toEqual(['cantAttack', 'cantBlock']);
  });

  test('an opponents creature with a counter on it can not attack, one without can (CR 508.1a)', () => {
    const g = start(1);
    g.advanceTo('declareAttackers');
    g.expect.canAttack('withCounter', false);
    g.expect.canAttack('bare', true);
    g.expect.canAttack('mineCounter', false); // not the controller's turn
  });

  test('an opponents creature with a counter on it can not block, one without can (CR 509.1a)', () => {
    const g = start(0);
    g.advanceTo('declareAttackers');
    g.act(0).attack(['mineBare']);
    g.advanceTo('declareBlockers');
    g.expect.canBlock('withCounter', 'mineBare', false);
    g.expect.canBlock('bare', 'mineBare', true);
  });

  test('the controller own creatures with counters are free to attack: the knight names only the opponents', () => {
    const g = start(0);
    g.advanceTo('declareAttackers');
    g.expect.canAttack('mineCounter', true);
  });

  test('the creature is free again once the counter is gone', () => {
    const g = start(1);
    g.advanceTo('declareAttackers');
    g.expect.canAttack('withCounter', false);
    // A creature without counters of the same board is not restricted at all.
    g.expect.canAttack('bare', true);
  });
});

describe("Puca's Covenant", () => {
  const covenant = real("Puca's Covenant");
  const COVENANT = covenant.name;

  /** Seat 0 has the Covenant and a Llanowar Elves with `counters` on it; its graveyard holds a Bears (mana value 2) and a Spider (4); it has two Bolts. */
  const start = (counters: Readonly<Record<string, number>>) =>
    scenario()
      .define(covenant)
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT, BOLT)
      .graveyard(BEARS, SPIDER)
      .battlefield('Mountain', { count: 2 })
      .battlefield(COVENANT)
      .battlefield(ELVES, { label: 'dying', counters })
      .battlefield(ELVES, { label: 'second', counters })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(ELVES, { label: 'theirs', counters: { '+1/+1': 1 } })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid and its AST is the engine shape', () => {
    expect(validateCard(covenant)).toEqual([]);
    expect(covenant.faces[0]?.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: {
          kind: 'dies',
          what: { types: ['creature'], controller: 'you', hasCounter: true },
        },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: expect.objectContaining({
                zone: 'graveyard',
                controller: 'you',
                notTriggerCard: true,
                manaValueAtMost: { kind: 'countersOn', of: { kind: 'triggerSubject' } },
              }),
            },
          },
        ],
        effect: { kind: 'moveToZone', objects: { kind: 'target', id: 't1' }, to: 'hand' },
        optional: true,
        doOnlyOnceEachTurn: true,
      },
    ]);
  });

  test('a creature with two counters of different kinds dies: a card of mana value 2 may come back, 4 may not, and not the creature itself (CR 603.10a, 122.1)', () => {
    const g = start({ '+1/+1': 1, stun: 1 });
    g.act(0).cast('Lightning Bolt[0]', { targets: ['dying'], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
    // The Spider has mana value 4 and the Elves is the creature that died ("another"): the Bears is the only legal target of a limit of 2, so it is chosen without a question.
    g.expect.stack([`${COVENANT} (ability)`]);
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.zone(SPIDER, 'graveyard', { seat: 0 });
  });

  test('one counter is a limit of 1: nothing in the graveyard fits, so the ability is not put on the stack', () => {
    const g = start({ '+1/+1': 1 });
    g.act(0).cast('Lightning Bolt[0]', { targets: ['dying'], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
    g.expect.pending('priority', 0);
    g.expect.stack([]);
  });

  test('a creature with no counter on it triggers nothing', () => {
    const g = start({});
    g.act(0).cast('Lightning Bolt[0]', { targets: ['dying'], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
    g.expect.pending('priority', 0);
  });

  test('a creature of an opponent with counters triggers nothing: it names creatures you control', () => {
    const g = start({ '+1/+1': 1, stun: 1 });
    g.act(0).cast('Lightning Bolt[0]', { targets: ['theirs'], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    g.expect.pending('priority', 0);
  });

  test('"Do this only once each turn" (CR 603.2h): after one card came back, a second creature dying the same turn triggers nothing', () => {
    const g = start({ '+1/+1': 1, stun: 1 });
    g.act(0).cast('Lightning Bolt[0]', { targets: ['dying'], pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.act(0).cast('Lightning Bolt', { targets: ['second'], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 0, count: 2 });
    g.expect.pending('priority', 0);
    g.expect.stack([]);
  });

  test('a declined ability took no action, so a second creature dying the same turn triggers it again', () => {
    const g = start({ '+1/+1': 1, stun: 1 });
    g.act(0).cast('Lightning Bolt[0]', { targets: ['dying'], pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.act(0).cast('Lightning Bolt', { targets: ['second'], pay: true });
    g.passAll();
    // The first Elves is in the graveyard now, and "another" leaves out only the creature that died this time: it is a legal target of the limit of 2 as well as the Bears.
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
  });
});

describe('The Reaper, King No More: "Whenever a creature an opponent controls with a -1/-1 counter on it dies, ..."', () => {
  const reaper = real('The Reaper, King No More');
  const REAPER = reaper.name;

  const start = () =>
    scenario()
      .define(reaper)
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT, BOLT)
      .battlefield('Mountain', { count: 2 })
      .battlefield(REAPER)
      .battlefield(BEARS, { label: 'mine', counters: { '-1/-1': 1 } })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'minus', counters: { '-1/-1': 1 } })
      .battlefield(ELVES, { label: 'plus', counters: { '+1/+1': 1 } })
      .battlefield(BEARS, { label: 'minusBears', counters: { '-1/-1': 1 } })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid and the dies ability is the engine shape', () => {
    expect(validateCard(reaper)).toEqual([]);
    expect(reaper.faces[0]?.abilities.at(-1)).toEqual({
      kind: 'triggered',
      trigger: {
        kind: 'dies',
        what: { types: ['creature'], controller: 'opponent', hasCounter: '-1/-1' },
      },
      effect: {
        kind: 'moveToZone',
        objects: { kind: 'triggerCard' },
        to: 'battlefield',
        controller: 'you',
      },
      optional: true,
      doOnlyOnceEachTurn: true,
    });
  });

  test('an opponent creature with a -1/-1 counter dies: its card may be put onto the battlefield under your control (CR 603.10a, 400.7)', () => {
    const g = start();
    g.act(0).cast('Lightning Bolt[0]', { targets: ['minus'], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.zone(SPIDER, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('declined: the card stays in its owner graveyard', () => {
    const g = start();
    g.act(0).cast('Lightning Bolt[0]', { targets: ['minus'], pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
  });

  test('a +1/+1 counter is another kind, and your own creature with a -1/-1 counter is not an opponent creature', () => {
    const g = start();
    g.act(0).cast('Lightning Bolt[0]', { targets: ['plus'], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    g.expect.pending('priority', 0);
    g.act(0).cast('Lightning Bolt', { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.pending('priority', 0);
  });

  test('"Do this only once each turn" (CR 603.2h): a second such creature the same turn triggers nothing after the first card came over', () => {
    const g = start();
    g.act(0).cast('Lightning Bolt[0]', { targets: ['minus'], pay: true });
    g.passAll();
    g.act(0).accept();
    g.act(0).cast('Lightning Bolt', { targets: ['minusBears'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.pending('priority', 0);
    g.expect.stack([]);
  });
});

describe('Oft-Nabbed Goat: "When this creature dies, if it had one or more -1/-1 counters on it, its owner draws that many cards and each other player loses that much life."', () => {
  const goat = imported('Oft-Nabbed Goat');

  test('the death trigger is read and has the engine shape; the activated ability keeps the card unsupported', () => {
    expect(goat.support.status).not.toBe('supported');
    expect(goat.support.unparsed.map((u) => u.text)).toEqual([
      expect.stringContaining('Gain control of'),
    ]);
    const dies = goat.definition.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(dies).toEqual({
      kind: 'triggered',
      trigger: { kind: 'dies', what: { kind: 'this' } },
      interveningIf: { kind: 'sourceHasCounter', counter: '-1/-1' },
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'draw',
            player: { kind: 'ownerOf', of: { kind: 'triggerSubject' } },
            count: { kind: 'countersOn', of: { kind: 'this' }, counter: '-1/-1' },
          },
          {
            kind: 'loseLife',
            player: {
              kind: 'eachPlayerExcept',
              except: { kind: 'ownerOf', of: { kind: 'triggerSubject' } },
            },
            amount: { kind: 'countersOn', of: { kind: 'this' }, counter: '-1/-1' },
          },
        ],
      },
    });
  });

  /** The death trigger alone, as a card (the activated ability is another group's): the real ability, nothing else. */
  const trigger: CardDefinition = {
    ...goat.definition,
    name: 'SYNTHETIC Goat Trigger Only',
    faces: goat.definition.faces.map((f) => ({
      ...f,
      name: 'SYNTHETIC Goat Trigger Only',
      abilities: f.abilities.filter((a) => a.kind === 'triggered'),
      oracleText: f.oracleText.split('\n').slice(1).join('\n'),
    })),
  };

  const start = (counters: Readonly<Record<string, number>>, controller: 0 | 1 = 0) =>
    scenario()
      .define(trigger)
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT, BOLT)
      .battlefield('Mountain', { count: 2 })
      .battlefield(trigger.name, { label: 'goat', counters, controller })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the trigger alone is valid', () => {
    expect(validateCard(trigger)).toEqual([]);
  });

  test('two -1/-1 counters: the owner draws two cards and each other player loses 2 life (CR 603.10a, 122.1)', () => {
    const g = start({ '-1/-1': 2 });
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.act(0).cast('Lightning Bolt[0]', { targets: ['goat'], pay: true });
    g.passAll();
    g.expect.zone(trigger.name, 'graveyard', { seat: 0 });
    expect(g.state.seats[0]?.hand.length).toBe(hand - 1 + 2);
    g.expect.life(1, 38);
    g.expect.life(0, 40);
  });

  test('a goat its owner does not control: the owner draws and every other player, the controller included, loses life', () => {
    const g = start({ '-1/-1': 2 }, 1);
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.act(0).cast('Lightning Bolt[0]', { targets: ['goat'], pay: true });
    g.passAll();
    g.expect.zone(trigger.name, 'graveyard', { seat: 0 });
    expect(g.state.seats[0]?.hand.length).toBe(hand - 1 + 2);
    g.expect.life(1, 38);
    g.expect.life(0, 40);
  });

  test('no -1/-1 counter on it: nothing happens (the intervening "if", CR 603.4)', () => {
    const g = start({ stun: 1 });
    g.act(0).cast('Lightning Bolt[0]', { targets: ['goat'], pay: true });
    g.passAll();
    g.act(0).cast('Lightning Bolt', { targets: ['goat'], pay: true });
    g.passAll();
    g.expect.zone(trigger.name, 'graveyard', { seat: 0 });
    g.expect.life(1, 40);
    g.expect.pending('priority', 0);
  });
});

describe('Massacre Girl, Known Killer: "Whenever a creature an opponent controls dies, if its toughness was less than 1, draw a card."', () => {
  const girl = real('Massacre Girl, Known Killer');
  const GIRL = girl.name;

  const start = () =>
    scenario()
      .define(girl)
      .seat(0)
      .library(...LIBRARY)
      .hand(ROT, BOLT)
      .battlefield('Swamp', { count: 2 })
      .battlefield('Mountain')
      .battlefield(GIRL)
      .battlefield(ELVES, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(ELVES, { label: 'theirElves' })
      .battlefield(SPIDER, { label: 'theirSpider' })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid and the dies ability is the engine shape', () => {
    expect(validateCard(girl)).toEqual([]);
    expect(girl.faces[0]?.abilities.at(-1)).toEqual({
      kind: 'triggered',
      trigger: { kind: 'dies', what: { types: ['creature'], controller: 'opponent' } },
      interveningIf: {
        kind: 'subjectStat',
        stat: 'toughness',
        compare: { cmp: 'atMost', value: 0 },
      },
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    });
  });

  test('an opponent creature that dies with toughness 0: draw a card (CR 704.5f)', () => {
    const g = start();
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.act(0).cast(ROT, { targets: ['theirElves'], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    expect(g.state.seats[0]?.hand.length).toBe(hand - 1 + 1);
  });

  test('an opponent creature that dies of damage with toughness 1 or more: nothing (CR 603.4: the toughness it last had)', () => {
    const g = start();
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.act(0).cast(BOLT, { targets: ['theirElves'], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    expect(g.state.seats[0]?.hand.length).toBe(hand - 1);
  });

  test('your own creature with toughness 0 is not an opponent creature: nothing', () => {
    const g = start();
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.act(0).cast(ROT, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
    expect(g.state.seats[0]?.hand.length).toBe(hand - 1);
  });
});
