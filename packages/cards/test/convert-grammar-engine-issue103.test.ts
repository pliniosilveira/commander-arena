// Issue 103: the REAL Oracle text of Vengeful Ancestor, Stormbreath Dragon and Gadrak, the Crown-Scourge (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a
// card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. Pins: CR 701.15
// (Goad), CR 508.1d (attack requirements), CR 701.37 (Monstrosity), CR 603.2 (triggers), CR 700.4 (dying), CR 402.1 (the hand), CR 508.1a (can't attack).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const BOLT = 'Lightning Bolt';
const SOL_RING = 'Sol Ring';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

const ancestor = real('Vengeful Ancestor');
const stormbreath = real('Stormbreath Dragon');
const gadrak = real('Gadrak, the Crown-Scourge');

describe('every card is valid', () => {
  test.each([
    ['Vengeful Ancestor', ancestor],
    ['Stormbreath Dragon', stormbreath],
    ['Gadrak, the Crown-Scourge', gadrak],
  ] as const)('%s', (_name, card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

/** Seat 0 has the Ancestor in hand with four Mountains; seat 1 has Bears and a Spider. */
function ancestorGame(options: { onBattlefield?: boolean } = {}) {
  return scenario()
    .define(ancestor)
    .seat(0)
    .library(...LIBRARY)
    .battlefield(...(options.onBattlefield === true ? [ancestor.name] : []))
    .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
    .hand(...(options.onBattlefield === true ? [] : [ancestor.name]))
    .seat(1)
    .life(40)
    .library(...LIBRARY)
    .battlefield(BEARS, SPIDER)
    .at('precombatMain', { active: 0 })
    .build();
}

describe('Vengeful Ancestor: "Whenever this creature enters or attacks, goad target creature."', () => {
  test('entering goads the target: it must attack on its controller’s turn (CR 701.15b, 508.1d)', () => {
    const g = ancestorGame();
    g.act(0).cast(ancestor.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    g.expect.step('declareAttackers', { active: 1 });
    g.expect.illegal(1, { declareAttackers: [] });
    g.expect.illegal(1, { declareAttackers: [{ attacker: SPIDER }] });
    g.expect.legal(1, { declareAttackers: [{ attacker: BEARS }] });
    g.act(1).attack(BEARS);
    g.expect.invariants();
  });

  test('a creature that is not goaded is not required to attack', () => {
    const g = ancestorGame();
    g.act(0).cast(ancestor.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    g.expect.legal(1, { declareAttackers: [{ attacker: BEARS }] });
    g.expect.illegal(1, { declareAttackers: [{ attacker: SPIDER }] });
  });

  test('the creature is goaded until the next turn of the controller of the ability (CR 701.15a)', () => {
    const g = ancestorGame();
    g.act(0).cast(ancestor.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    const goaded = () => g.state.continuousEffects.filter((e) => e.change.kind === 'goaded').length;
    expect(goaded()).toBe(1);
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    expect(goaded()).toBe(1);
    g.act(1).attack(BEARS);
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.step('precombatMain', { active: 0 });
    expect(goaded()).toBe(0);
  });

  test('it attacks a player other than the goader if able; with no other player it attacks the goader (CR 701.15b)', () => {
    const g = ancestorGame();
    g.act(0).cast(ancestor.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    g.act(1).attack(BEARS, { player: 0 });
    g.expect.invariants();
  });

  test('attacking with the Ancestor goads a target creature too', () => {
    const g = ancestorGame({ onBattlefield: true });
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(ancestor.name);
    g.act(0).chooseTargets(SPIDER);
    g.passAll();
    expect(g.state.continuousEffects.some((e) => e.change.kind === 'goaded')).toBe(true);
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    g.expect.illegal(1, { declareAttackers: [{ attacker: BEARS }] });
    g.expect.legal(1, { declareAttackers: [{ attacker: SPIDER }] });
  });

  test('goading a creature the same player already goaded changes nothing (CR 701.15d)', () => {
    const g = scenario()
      .define(ancestor)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(ancestor.name)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(ancestor.name);
    g.act(0).chooseTargets(SPIDER);
    g.passAll();
    const count = () => g.state.continuousEffects.filter((e) => e.change.kind === 'goaded').length;
    expect(count()).toBe(1);
  });
});

describe('Vengeful Ancestor: "Whenever a goaded creature attacks, it deals 1 damage to its controller."', () => {
  test('the goaded creature deals 1 damage to its own controller as it attacks, on top of its combat damage', () => {
    const g = ancestorGame();
    g.act(0).cast(ancestor.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    g.act(1).attack(BEARS);
    g.passAll();
    // The goaded Bears hurt their own controller for 1 as they attacked.
    g.expect.life(1, 39);
    g.expect.invariants();
  });

  test('a creature that is not goaded deals nothing to its controller when it attacks', () => {
    const g = ancestorGame();
    g.act(0).cast(ancestor.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    g.act(1).attack([BEARS, SPIDER]);
    g.passAll();
    // Only the goaded Bears trigger: 1 damage, not 2.
    g.expect.life(1, 39);
  });

  test('without the goad the Ancestor’s second ability does nothing', () => {
    const g = scenario()
      .define(ancestor)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(ancestor.name)
      .seat(1)
      .life(40)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack(BEARS);
    g.passAll();
    g.expect.life(1, 40);
  });
});

describe('Stormbreath Dragon: "When this creature becomes monstrous, it deals damage to each opponent equal to the number of cards in that player’s hand."', () => {
  const game = (hand: number) =>
    scenario()
      .define(stormbreath)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(stormbreath.name)
      .battlefield(
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
      )
      .seat(1)
      .life(40)
      .library(...LIBRARY)
      .hand(...Array.from({ length: hand }, () => 'Island'))
      .at('precombatMain', { active: 0 })
      .build();

  test('monstrosity 3 puts three +1/+1 counters and the trigger deals damage equal to the cards in the opponent’s hand', () => {
    const g = game(3);
    g.act(0).activate(stormbreath.name, { ability: 3, pay: true });
    g.passAll();
    g.expect.counters(stormbreath.name, { '+1/+1': 3 });
    expect(g.object(stormbreath.name).monstrous).toBe(true);
    g.expect.life(1, 37);
    g.expect.invariants();
  });

  test('an opponent with an empty hand is dealt nothing', () => {
    const g = game(0);
    g.act(0).activate(stormbreath.name, { ability: 3, pay: true });
    g.passAll();
    expect(g.object(stormbreath.name).monstrous).toBe(true);
    g.expect.life(1, 40);
  });

  test('already monstrous: it does not become monstrous again, so nothing triggers (CR 701.37a)', () => {
    const g = game(2);
    g.act(0).activate(stormbreath.name, { ability: 3, pay: true });
    g.passAll();
    g.expect.life(1, 38);
    const again = scenario()
      .define(stormbreath)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(stormbreath.name, { counters: { '+1/+1': 3 } })
      .battlefield(
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
      )
      .seat(1)
      .life(40)
      .library(...LIBRARY)
      .hand('Island', 'Island')
      .at('precombatMain', { active: 0 })
      .build();
    again.act(0).activate(stormbreath.name, { ability: 3, pay: true });
    again.passAll();
    again.expect.counters(stormbreath.name, { '+1/+1': 6 });
  });
});

describe('Gadrak, the Crown-Scourge', () => {
  const game = (artifacts: number) =>
    scenario()
      .define(gadrak)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(gadrak.name)
      .battlefield(...Array.from({ length: artifacts }, () => SOL_RING))
      .battlefield('Mountain')
      .hand(BOLT)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, SPIDER)
      .at('precombatMain', { active: 0 })
      .build();

  test('"can’t attack unless you control four or more artifacts" (CR 508.1a)', () => {
    const three = game(3);
    three.advanceTo('declareAttackers', { attack: false });
    three.expect.canAttack(gadrak.name, false);
    const four = game(4);
    four.advanceTo('declareAttackers', { attack: false });
    four.expect.canAttack(gadrak.name, true);
  });

  test('at the beginning of your end step it creates a Treasure for each nontoken creature that died this turn, whoever controlled it (CR 700.4)', () => {
    const g = game(0);
    g.act(0).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('with no creature dead it creates nothing, and a creature that died on an earlier turn is not counted', () => {
    const g = game(0);
    g.advanceTo('end');
    g.passAll();
    g.expect.noObject('Treasure');
  });

  test('two creatures that died, one of each player’s, make two Treasures', () => {
    const g = scenario()
      .define(gadrak)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(gadrak.name)
      .battlefield(BEARS, { label: 'mine' })
      .battlefield('Mountain', 'Mountain')
      .hand(BOLT, BOLT)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(`${BOLT}[0]`, { targets: ['mine'], pay: true });
    g.passAll();
    g.act(0).cast(BOLT, { targets: ['theirs'], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 2 });
    g.expect.invariants();
  });
});
