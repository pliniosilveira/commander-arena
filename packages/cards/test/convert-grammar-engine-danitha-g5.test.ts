// The Danitha deck (issue 26), group 5 (D-405 to D-408): the REAL Oracle text of Sterling Grove, Shielded by Faith, Spiral into Solitude and Timely Ward (the corpus's
// golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser
// writes for the real text are what the engine runs. The helper cards are real fixtures. Pins: CR 701.23 and 701.24b (a search whose card is put on top after the shuffle), CR 701.3 and
// 303.4j (the Aura moves onto the creature that entered, if it may enchant it), CR 701.68 (blight), CR 602.2b (the sacrifice and the blight are paid as the ability is activated),
// CR 508.1a and 509.1a (can't attack, can't block), CR 601.3b and 601.3d (flash if it targets a commander), CR 702.12 (indestructible).
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
const ELVES = 'Llanowar Elves'; // 1/1
const COMMANDER = 'Isamaru, Hound of Konda';
const MIGHT = 'SYNTHETIC Might Aura';
const WINGS = 'SYNTHETIC Wings Aura';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('Sterling Grove: "{1}, Sacrifice this enchantment: Search your library for an enchantment card, reveal it, then shuffle and put that card on top."', () => {
  const grove = real('Sterling Grove');
  const GROVE = grove.name;
  const start = () =>
    scenario()
      .define(grove)
      .seat(0)
      .battlefield(GROVE, 'Plains', 'Plains')
      .library('Grizzly Bears', { label: 'bears' })
      .library(MIGHT, { label: 'might' })
      .library('Forest', { label: 'forest' })
      .library(WINGS, { label: 'wings' })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid and its AST is the engine shape', () => {
    expect(validateCard(grove)).toEqual([]);
    const [shroud, search] = grove.faces[0]?.abilities ?? [];
    expect(shroud).toMatchObject({
      kind: 'static',
      static: { kind: 'grantKeyword', keyword: { kind: 'shroud' } },
    });
    expect(search).toMatchObject({
      kind: 'activated',
      effect: { kind: 'search', destinations: [{ zone: 'library', count: 1 }], shuffle: true },
    });
  });

  test('the Grove is sacrificed, the enchantment found is revealed and ends on top of the library', () => {
    const g = start();
    g.act(0).activate(GROVE, { pay: true });
    g.expect.zone(GROVE, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    const mark = g.mark();
    g.act(0).chooseCards('wings');
    expect(g.state.seats[0]?.library[0]).toBe(g.id('wings'));
    const kinds = g.eventsSince(mark).map((e) => e.kind);
    expect(kinds).toContain('cardsRevealed');
    expect(kinds.indexOf('libraryShuffled')).toBeLessThan(kinds.lastIndexOf('zoneChanged'));
    g.expect.invariants();
  });

  test('"other enchantments you control have shroud": another enchantment has it, the Grove itself does not', () => {
    const g = scenario()
      .define(grove)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(GROVE)
      .battlefield(WINGS, { attachedTo: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.expect.derived(WINGS, { keywords: ['enchant', 'shroud'] });
    g.expect.derived(GROVE, { keywords: [] });
  });
});

describe('Shielded by Faith: "Whenever a creature enters, you may attach this Aura to that creature."', () => {
  const shield = real('Shielded by Faith');
  const SHIELD = shield.name;
  const start = (opponentCasts: boolean) =>
    scenario()
      .define(shield)
      .seat(0)
      .library(...LIBRARY)
      .hand(...(opponentCasts ? [] : [ELVES]))
      .battlefield(opponentCasts ? 'Plains' : 'Forest')
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(SHIELD, { attachedTo: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .hand(...(opponentCasts ? [ELVES] : []))
      .battlefield(opponentCasts ? 'Forest' : 'Plains')
      .at('precombatMain', { active: opponentCasts ? 1 : 0 })
      .build();

  test('the card is valid and its AST is the engine shape', () => {
    expect(validateCard(shield)).toEqual([]);
    expect(shield.faces[0]?.abilities).toContainEqual({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { types: ['creature'] } },
      effect: { kind: 'attach', object: { kind: 'this' }, to: { kind: 'triggerSubject' } },
      optional: true,
    });
  });

  test('a creature of the controller enters: on a yes the Aura moves to it, and it has indestructible', () => {
    const g = start(false);
    g.expect.derived(BEARS, { keywords: ['indestructible'] });
    g.act(0).cast(ELVES, { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.passAll();
    g.expect.attached(SHIELD, ELVES);
    g.expect.derived(ELVES, { keywords: ['indestructible'] });
    g.expect.derived(BEARS, { keywords: [] });
    g.expect.invariants();
  });

  test('on a no it stays where it is', () => {
    const g = start(false);
    g.act(0).cast(ELVES, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.attached(SHIELD, 'bears');
  });

  test('a creature of the opponent enters: the Aura may move onto it (it enchants any creature)', () => {
    const g = start(true);
    g.act(1).cast(ELVES, { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.passAll();
    g.expect.attached(SHIELD, ELVES);
    g.expect.zone(SHIELD, 'battlefield', { seat: 0 });
  });
});

describe('Spiral into Solitude: "Enchanted creature can’t attack or block." and "{1}{W}, Blight 1, Sacrifice this Aura: Exile enchanted creature."', () => {
  const spiral = real('Spiral into Solitude');
  const SPIRAL = spiral.name;
  const start = (...mine: readonly string[]) =>
    scenario()
      .define(spiral)
      .seat(0)
      .library(...LIBRARY)
      .battlefield('Plains', { count: 2 })
      .battlefield(...mine)
      .battlefield(SPIRAL, { attachedTo: 'theirBears' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirBears' })
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid and its AST is the engine shape', () => {
    expect(validateCard(spiral)).toEqual([]);
    expect(spiral.faces[0]?.abilities.map((a) => a.kind)).toEqual([
      'keyword',
      'static',
      'static',
      'activated',
    ]);
    expect(spiral.faces[0]?.abilities[3]).toMatchObject({
      cost: [
        { kind: 'mana', symbols: ['1', 'W'] },
        { kind: 'blight', count: 1 },
        { kind: 'sacrifice', what: { kind: 'this' } },
      ],
      effect: { kind: 'exile', objects: { kind: 'attached' } },
    });
  });

  test('activated: a creature of the player gets a -1/-1 counter, the Aura is sacrificed and the enchanted creature is exiled', () => {
    const g = start(SPIDER);
    g.act(0).activate(SPIRAL, { pay: true });
    g.expect.counters(SPIDER, { '-1/-1': 1 });
    g.expect.zone(SPIRAL, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.zone(BEARS, 'exile');
    g.expect.pt(SPIDER, 1, 3);
    g.expect.invariants();
  });

  test('with several creatures the player chooses which one is blighted, and cancel rewinds', () => {
    const g = start(SPIDER, ELVES);
    g.act(0).activate(SPIRAL, { pay: true });
    g.expect.pending('choosePermanent', 0);
    g.act(0).cancel();
    g.expect.zone(SPIRAL, 'battlefield', { seat: 0 });
    g.expect.counters(SPIDER, {});
    g.act(0).activate(SPIRAL, { pay: true });
    g.act(0).choosePermanents(SPIDER);
    g.expect.counters(SPIDER, { '-1/-1': 1 });
    g.expect.counters(ELVES, {});
    g.passAll();
    g.expect.zone(BEARS, 'exile');
  });

  test('with no creature of the player’s the ability cannot be activated (CR 701.68b)', () => {
    start().expect.illegal(0, { activate: SPIRAL });
  });

  test('the enchanted creature cannot attack or block', () => {
    const attacking = scenario()
      .define(spiral)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(SPIDER)
      .battlefield(SPIRAL, { attachedTo: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    attacking.advanceTo('declareAttackers', { attack: false });
    attacking.expect.canAttack('bears', false);
    attacking.expect.canAttack(SPIDER, true);
    const blocking = scenario()
      .define(spiral)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'attacker' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'blocker' })
      .battlefield(SPIDER, { label: 'spider' })
      .battlefield(SPIRAL, { attachedTo: 'blocker', controller: 1 })
      .at('precombatMain', { active: 0 })
      .build();
    blocking.advanceTo('declareAttackers', { attack: false });
    blocking.act(0).attack('attacker');
    blocking.passAll();
    blocking.expect.canBlock('blocker', 'attacker', false);
    blocking.expect.canBlock('spider', 'attacker', true);
  });
});

describe('Timely Ward: "You may cast this spell as though it had flash if it targets a commander."', () => {
  const ward = real('Timely Ward');
  const WARD = ward.name;
  const start = (active: 0 | 1) =>
    scenario()
      .define(ward)
      .seat(0)
      .library(...LIBRARY)
      .hand(WARD)
      .battlefield('Plains', { count: 3 })
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(COMMANDER, { commander: true, label: 'theirCommander' })
      .battlefield(ELVES, { label: 'theirElves' })
      .at('precombatMain', { active, priority: 0 })
      .build();

  test('the card is valid and its AST is the engine shape', () => {
    expect(validateCard(ward)).toEqual([]);
    expect(ward.faces[0]?.abilities[0]).toEqual({
      kind: 'static',
      static: { kind: 'castAsThoughFlash', spells: { kind: 'this' } },
      condition: { kind: 'spellTargets', filter: { commander: true } },
    });
  });

  test('on the opponent’s turn it is cast with flash, only on a commander, and gives it indestructible', () => {
    const g = start(1);
    g.expect.legal(0, { cast: WARD });
    g.act(0).cast(WARD);
    g.expect.pending('targets', 0);
    const refused = g.act(0).try.action({
      kind: 'chooseTargets',
      targets: [{ kind: 'object', id: g.id('theirElves'), specId: 'enchant' }],
    });
    expect(refused.ok).toBe(false);
    g.act(0).chooseTargets('theirCommander');
    g.act(0).payAuto();
    g.passAll();
    g.expect.attached(WARD, 'theirCommander');
    g.expect.derived('theirCommander', { keywords: ['indestructible'] });
    g.expect.invariants();
  });

  test('in the caster’s own main phase it is an ordinary Aura: any creature may be enchanted', () => {
    const g = start(0);
    g.act(0).cast(WARD);
    g.act(0).chooseTargets('mine');
    g.act(0).payAuto();
    g.passAll();
    g.expect.attached(WARD, 'mine');
  });

  test('without a commander on the battlefield it cannot be cast on the opponent’s turn', () => {
    const g = scenario()
      .define(ward)
      .seat(0)
      .library(...LIBRARY)
      .hand(WARD)
      .battlefield('Plains', { count: 3 })
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(ELVES)
      .at('precombatMain', { active: 1, priority: 0 })
      .build();
    g.expect.illegal(0, { cast: WARD });
  });
});
