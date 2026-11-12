// The Niv-Mizzet deck (issue 25), group B (D-951 to D-954): the REAL cards of the golden corpus, read through the grammar only (no override) and played
// through applyAction: Prismari Charm ("each of one or two targets", CR 115.1, 115.3), Untimely Malfunction ("one or two target creatures can't block
// this turn", CR 509.1b), Flame of Anor ("you may choose two instead", CR 700.2) and Fading Hope ("if its mana value was 3 or less", CR 202.3, 608.2c,
// 113.7a). The creatures that stand in for the board are SYNTHETIC (named so) or real engine fixtures (Grizzly Bears, Giant Spider, Serra Angel, Sol Ring).
import { readFileSync } from 'node:fs';
import type {
  CardDefinition,
  ChooseModesDecision,
  GameEvent,
  TargetsDecision,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const creature = (
  name: string,
  manaCost: string,
  power: string,
  toughness: string,
  type = 'Human',
) => parsed(name, `Creature — ${type}`, '', { manaCost, power, toughness, colors: ['U'] });

const SQUIRE = creature('SYNTHETIC Squire', '{U}', '1', '1');
const WIZARD = creature('SYNTHETIC Apprentice', '{1}{U}', '1', '1', 'Human Wizard');
const THREE_DROP = creature('SYNTHETIC Three Drop', '{2}{U}', '3', '3');
const FOUR_DROP = creature('SYNTHETIC Four Drop', '{3}{U}', '4', '4');
const FIVE_DROP = creature('SYNTHETIC Five Drop', '{3}{U}{U}', '5', '5');
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const ANGEL = 'Serra Angel';
const SOL_RING = 'Sol Ring';
const LIBRARY = ['Forest', 'Swamp', 'Plains', 'Mountain', 'Island'] as const;

/** A scenario with every card defined. */
const define = (...defs: readonly CardDefinition[]) =>
  defs.reduce((builder, def) => builder.define(def), scenario());

const decision = <K extends 'targets' | 'chooseModes'>(g: ScenarioGame, kind: K) => {
  const d = g.state.pending;
  if (d?.kind !== kind) throw new Error(`expected ${kind}, got ${d?.kind}`);
  return d as K extends 'targets' ? TargetsDecision : ChooseModesDecision;
};

/** The kinds of the events since the game began, in order. */
const kinds = (events: readonly GameEvent[]) => events.map((e) => e.kind as string);

describe('Prismari Charm: "Prismari Charm deals 1 damage to each of one or two targets." (CR 115.1, 115.3)', () => {
  const CHARM = real('Prismari Charm');
  const DAMAGE = 1;

  const game = () =>
    define(CHARM, SQUIRE)
      .seat(0)
      .hand(CHARM.name)
      .pool('UR')
      .library(...LIBRARY)
      .seat(1)
      .battlefield(SQUIRE.name, BEARS)
      .library(...LIBRARY)
      .build();

  test('the second bullet is a slot of any target with one to two targets', () => {
    const [, damage] = CHARM.faces[0]?.spell?.modes ?? [];
    expect(damage?.targets).toEqual([{ id: 't1', what: { kind: 'anyTarget' }, min: 1, max: 2 }]);
  });

  test('the engine asks for one to two targets of the damage mode', () => {
    const g = game();
    g.act(0).cast(CHARM.name).modes(DAMAGE);
    const [spec] = decision(g, 'targets').specs;
    expect(spec).toMatchObject({ min: 1, max: 2 });
  });

  test('one target: a player takes 1 damage', () => {
    const g = game();
    g.act(0).cast(CHARM.name, { modes: [DAMAGE], targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 39);
    g.expect.zone(SQUIRE.name, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('two targets, a player and a creature: each takes 1 damage', () => {
    const g = game();
    g.act(0).cast(CHARM.name, {
      modes: [DAMAGE],
      targets: [{ player: 1 }, SQUIRE.name],
      pay: true,
    });
    g.passAll();
    g.expect.life(1, 39);
    g.expect.zone(SQUIRE.name, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('two targets, two creatures', () => {
    const g = game();
    g.act(0).cast(CHARM.name, { modes: [DAMAGE], targets: [SQUIRE.name, BEARS], pay: true });
    g.passAll();
    g.expect.zone(SQUIRE.name, 'graveyard', { seat: 1 });
    g.expect.life(1, 40);
  });

  test('the same target twice is not allowed (CR 115.3)', () => {
    const g = game();
    g.act(0).cast(CHARM.name).modes(DAMAGE);
    expect(() => g.act(0).chooseTargets({ player: 1 }, { player: 1 })).toThrow();
    expect(() => g.act(0).chooseTargets(SQUIRE.name, SQUIRE.name)).toThrow();
  });

  test('no target and three targets are not allowed (CR 601.2c)', () => {
    const g = game();
    g.act(0).cast(CHARM.name).modes(DAMAGE);
    expect(() => g.act(0).chooseTargets()).toThrow();
    expect(() => g.act(0).chooseTargets({ player: 1 }, SQUIRE.name, BEARS)).toThrow();
  });

  test('the other modes are untouched: surveil 2 then draw, and the return to hand', () => {
    const draw = game();
    draw.act(0).cast(CHARM.name, { modes: [0], pay: true });
    draw.passAll();
    draw.expect.pending('arrangeCards', 0);
    draw.act(0).arrange({ top: ['Forest'], other: ['Swamp'] });
    draw.expect.handSize(0, 1);
    const back = game();
    back.act(0).cast(CHARM.name, { modes: [2], targets: [BEARS], pay: true });
    back.passAll();
    back.expect.zone(BEARS, 'hand', { seat: 1 });
  });
});

describe('Untimely Malfunction: "One or two target creatures can\'t block this turn." (CR 509.1b, 611.2a)', () => {
  const MALFUNCTION = real('Untimely Malfunction');
  const CANT_BLOCK = 2;

  const game = () =>
    define(MALFUNCTION)
      .seat(0)
      .hand(MALFUNCTION.name)
      .pool('RR')
      .battlefield('Isamaru, Hound of Konda')
      .library(...LIBRARY)
      .seat(1)
      .battlefield(BEARS, SPIDER, ANGEL)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  const attackAndBlock = (g: ScenarioGame) => {
    g.advanceTo('declareAttackers');
    g.act(0).attack('Isamaru, Hound of Konda');
    g.advanceTo('declareBlockers');
  };

  test('the whole card reads: three modes, the third with one to two creatures', () => {
    const modes = MALFUNCTION.faces[0]?.spell?.modes ?? [];
    expect(modes).toHaveLength(3);
    expect(modes[2]?.targets).toMatchObject([{ id: expect.any(String), min: 1, max: 2 }]);
  });

  test('one creature: it cannot block this turn, the others can', () => {
    const g = game();
    g.act(0).cast(MALFUNCTION.name, { modes: [CANT_BLOCK], targets: [BEARS], pay: true });
    g.passAll();
    attackAndBlock(g);
    g.expect.canBlock(BEARS, 'Isamaru, Hound of Konda', false);
    g.expect.canBlock(SPIDER, 'Isamaru, Hound of Konda', true);
    g.expect.canBlock(ANGEL, 'Isamaru, Hound of Konda', true);
  });

  test('two creatures: neither can block this turn, the third can', () => {
    const g = game();
    g.act(0).cast(MALFUNCTION.name, { modes: [CANT_BLOCK], targets: [BEARS, SPIDER], pay: true });
    g.passAll();
    attackAndBlock(g);
    g.expect.canBlock(BEARS, 'Isamaru, Hound of Konda', false);
    g.expect.canBlock(SPIDER, 'Isamaru, Hound of Konda', false);
    g.expect.canBlock(ANGEL, 'Isamaru, Hound of Konda', true);
    g.expect.invariants();
  });

  test('it ends with the turn (CR 514.2)', () => {
    const g = game();
    g.act(0).cast(MALFUNCTION.name, { modes: [CANT_BLOCK], targets: [BEARS, SPIDER], pay: true });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.state.continuousEffects).toEqual([]);
  });

  test('three creatures and the same creature twice are not allowed', () => {
    const g = game();
    // The other two modes have no legal target here, so the engine takes the third without asking (CR 700.2a).
    g.act(0).cast(MALFUNCTION.name);
    expect(decision(g, 'targets').specs[0]).toMatchObject({ min: 1, max: 2 });
    expect(() => g.act(0).chooseTargets(BEARS, SPIDER, ANGEL)).toThrow();
    expect(() => g.act(0).chooseTargets(BEARS, BEARS)).toThrow();
  });

  test('the other modes still work: destroy target artifact', () => {
    const g = define(MALFUNCTION)
      .seat(0)
      .hand(MALFUNCTION.name)
      .pool('RR')
      .library(...LIBRARY)
      .seat(1)
      .battlefield(SOL_RING)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(MALFUNCTION.name, { modes: [0], targets: [SOL_RING], pay: true });
    g.passAll();
    g.expect.zone(SOL_RING, 'graveyard', { seat: 1 });
  });
});

describe('Flame of Anor: "Choose one. If you control a Wizard as you cast this spell, you may choose two instead." (CR 700.2, 700.2a)', () => {
  const FLAME = real('Flame of Anor');

  const game = (wizard: boolean) =>
    define(FLAME, WIZARD, SQUIRE)
      .seat(0)
      .hand(FLAME.name)
      .pool('UUR')
      .battlefield(...(wizard ? [WIZARD.name] : []))
      .library(...LIBRARY)
      .seat(1)
      .battlefield(SQUIRE.name, SOL_RING)
      .library(...LIBRARY)
      .build();

  test('the card reads: one mode, two with a Wizard', () => {
    expect(FLAME.faces[0]?.spell?.chooseModes).toMatchObject({ min: 1, max: 1, maxIf: { max: 2 } });
    expect(FLAME.faces[0]?.spell?.modes).toHaveLength(3);
  });

  test('without a Wizard the decision allows one mode', () => {
    const g = game(false);
    g.act(0).cast(FLAME.name);
    const d = decision(g, 'chooseModes');
    expect(d).toMatchObject({ min: 1, max: 1, sets: [[0], [1], [2]] });
    expect(() => g.act(0).chooseModes(0, 2)).toThrow();
  });

  test('with a Wizard the decision allows one or two modes', () => {
    const g = game(true);
    g.act(0).cast(FLAME.name);
    const d = decision(g, 'chooseModes');
    expect(d).toMatchObject({ min: 1, max: 2 });
    expect(d.sets).toEqual([[0], [1], [2], [0, 1], [0, 2], [1, 2]]);
    expect(() => g.act(0).chooseModes(0, 1, 2)).toThrow();
  });

  test('with a Wizard and two modes chosen, both run, in printed order', () => {
    const g = game(true);
    g.act(0).cast(FLAME.name).modes(0, 2);
    g.act(0).chooseTargets({ player: 0 }, SQUIRE.name).payAuto();
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.zone(SQUIRE.name, 'graveyard', { seat: 1 });
    const order = kinds(g.events);
    const draw = order.findIndex((k) => /draw/i.test(k));
    const damage = order.findIndex((k) => /damage/i.test(k));
    expect(draw).toBeGreaterThanOrEqual(0);
    expect(damage).toBeGreaterThan(draw);
    g.expect.invariants();
  });

  test('with a Wizard and the artifact and creature modes, both run', () => {
    const g = game(true);
    g.act(0).cast(FLAME.name).modes(1, 2);
    g.act(0).chooseTargets(SOL_RING, SQUIRE.name).payAuto();
    g.passAll();
    g.expect.zone(SOL_RING, 'graveyard', { seat: 1 });
    g.expect.zone(SQUIRE.name, 'graveyard', { seat: 1 });
  });

  test('without a Wizard one mode runs alone', () => {
    const g = game(false);
    g.act(0).cast(FLAME.name, { modes: [1], targets: [SOL_RING], pay: true });
    g.passAll();
    g.expect.zone(SOL_RING, 'graveyard', { seat: 1 });
    g.expect.zone(SQUIRE.name, 'battlefield', { seat: 1 });
  });
});

describe('Fading Hope: "If its mana value was 3 or less, scry 1." (CR 202.3, 608.2c, 113.7a)', () => {
  const HOPE = real('Fading Hope');

  const game = (...targets: readonly CardDefinition[]) =>
    define(HOPE, ...targets)
      .seat(0)
      .hand(HOPE.name)
      .pool('U')
      .library(...LIBRARY)
      .seat(1)
      .battlefield(...targets.map((t) => t.name))
      .library(...LIBRARY)
      .build();

  test("a creature of mana value 3 goes back to its owner's hand and its controller scries 1", () => {
    const g = game(THREE_DROP);
    g.act(0).cast(HOPE.name, { targets: [THREE_DROP.name], pay: true });
    g.passAll();
    g.expect.zone(THREE_DROP.name, 'hand', { seat: 1 });
    g.expect.pending('arrangeCards', 0);
    g.act(0).arrange({ top: [], other: ['Forest'] });
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('a creature of mana value 1 does too', () => {
    const g = game(SQUIRE);
    g.act(0).cast(HOPE.name, { targets: [SQUIRE.name], pay: true });
    g.passAll();
    g.expect.zone(SQUIRE.name, 'hand', { seat: 1 });
    g.expect.pending('arrangeCards', 0);
  });

  test('a creature of mana value 4 does not: no scry', () => {
    const g = game(FOUR_DROP);
    g.act(0).cast(HOPE.name, { targets: [FOUR_DROP.name], pay: true });
    g.passAll();
    g.expect.zone(FOUR_DROP.name, 'hand', { seat: 1 });
    g.expect.pending('priority', 0);
  });

  test('a creature of mana value 5 does not: no scry', () => {
    const g = game(FIVE_DROP);
    g.act(0).cast(HOPE.name, { targets: [FIVE_DROP.name], pay: true });
    g.passAll();
    g.expect.zone(FIVE_DROP.name, 'hand', { seat: 1 });
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });
});
