// The Vraska EDHREC deck, group 2 (stage P64, D-217): the REAL cards of the owner's golden corpus read through the grammar only, defined in an engine scenario and
// played through applyAction. Stand-in cards are SYNTHETIC (named so), with invented power and toughness.
import { readFileSync } from 'node:fs';
import { type CardDefinition, type GameState, getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
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
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

const FILLER = Array.from({ length: 30 }, () => 'Island');
const BEARS = 'Grizzly Bears';

const COLOSSUS = real('Craterclaw Colossus');
const ASCENDANCY = real('Jeskai Ascendancy');
// Roar of Resistance's first line, the real wording, alone: its second line (an attack trigger) is group 3's.
const ROAR = parsed(
  'SYNTHETIC Roar Static',
  'Enchantment',
  'Creature tokens you control have haste.',
  { manaCost: '{1}{R}' },
);
const SAHEELI = real('Saheeli, Sublime Artificer');
const SCULPT = real('Mana Sculpt');
const DENIAL = real('Arcane Denial');

// SYNTHETIC stand-ins: artifacts, a Wizard creature, a noncreature spell and a spell to counter.
const ROCK = parsed('SYNTHETIC Rock', 'Artifact', '{T}: Add {C}.');
const WIZARD = parsed('SYNTHETIC Wizard', 'Creature — Human Wizard', 'Flying', {
  manaCost: '{1}{U}',
  power: '1',
  toughness: '1',
});
const SPARK = parsed('SYNTHETIC Spark', 'Instant', '~ deals 1 damage to any target.', {
  manaCost: '{R}',
});
const FATTY = parsed('SYNTHETIC Fatty', 'Sorcery', 'You gain 1 life.', { manaCost: '{3}{G}' });

const power = (g: { state: GameState }, name: string) =>
  getView(g.state, 0).battlefield.find((o) => o.name === name)?.power;

describe('Craterclaw Colossus (creatures you control gain trample and get +X/+0, X the artifacts you control)', () => {
  test('reads as a pump of X and a grant of trample to the group (CR 611.2c)', () => {
    const trigger = COLOSSUS.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(trigger).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'modifyPt', toughness: 0, duration: 'untilEndOfTurn' },
          { kind: 'grantKeyword', keyword: { kind: 'trample' } },
        ],
      },
    });
  });

  test("your creatures get +X/+0 and trample, X counted as it resolves, and the opponent's do not", () => {
    const g = scenario()
      .define(COLOSSUS)
      .define(ROCK)
      .seat(0)
      .hand(COLOSSUS.name)
      .battlefield('Mountain', { count: 7 })
      .battlefield(ROCK.name, { count: 2 })
      .battlefield(BEARS)
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(COLOSSUS.name, { pay: true });
    g.passAll();
    g.passAll();
    // Two Rocks and the Colossus itself (an artifact creature) make X = 3.
    const mine = getView(g.state, 0).battlefield.filter(
      (o) => o.name === BEARS && o.controller === 0,
    );
    expect(mine[0]?.power).toBe(2 + 3);
    expect(mine[0]?.keywords).toContain('trample');
    const theirs = getView(g.state, 0).battlefield.filter(
      (o) => o.name === BEARS && o.controller === 1,
    );
    expect(theirs[0]?.power).toBe(2);
    g.expect.invariants();
  });
});

describe('Jeskai Ascendancy (a noncreature spell: creatures you control get +1/+1, untap those creatures)', () => {
  test("the creatures get +1/+1 and are untapped, and the opponent's are not", () => {
    const g = scenario()
      .define(ASCENDANCY)
      .define(SPARK)
      .seat(0)
      .hand(SPARK.name)
      .battlefield(ASCENDANCY.name)
      .battlefield('Mountain')
      .battlefield(BEARS, { tapped: true })
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS, { tapped: true })
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(SPARK.name, { pay: true, targets: [{ player: 1 }] });
    // The two triggers of the Ascendancy go on the stack; their order does not matter here.
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    // The other trigger (may draw a card) asks first or last; it is declined.
    g.expect.pending('confirmOptional', 0);
    g.act(0).decline();
    g.passAll();
    g.expect.tapped({ name: BEARS, seat: 0 }, false);
    g.expect.tapped({ name: BEARS, seat: 1 }, true);
    expect(power(g, BEARS)).toBe(3);
    g.expect.invariants();
  });
});

describe('Roar of Resistance (Creature tokens you control have haste.)', () => {
  test('the static grant reads a group of tokens, not every creature', () => {
    const grant = ROAR.faces[0]?.abilities.find((a) => a.kind === 'static');
    expect(grant).toMatchObject({
      static: {
        kind: 'grantKeyword',
        subject: {
          kind: 'filter',
          filter: { types: ['creature'], token: true, controller: 'you' },
        },
        keyword: { kind: 'haste' },
      },
    });
  });
});

describe('a static ability over a group of tokens (Creature tokens you control have haste. / get +1/+1.)', () => {
  const MAKER = parsed(
    'SYNTHETIC Soldier Maker',
    'Sorcery',
    'Create a 1/1 white Soldier creature token.',
    {
      manaCost: '{W}',
    },
  );
  const PUMP = parsed(
    'SYNTHETIC Token Banner',
    'Enchantment',
    'Creature tokens you control get +1/+1.',
    {
      manaCost: '{1}{W}',
    },
  );

  test("only the controller's tokens have haste and the pump; a creature card does not", () => {
    const g = scenario()
      .define(ROAR)
      .define(PUMP)
      .define(MAKER)
      .seat(0)
      .hand(MAKER.name)
      .battlefield(ROAR.name)
      .battlefield(PUMP.name)
      .battlefield('Plains')
      .battlefield(BEARS)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(MAKER.name, { pay: true });
    g.passAll();
    const view = getView(g.state, 0).battlefield;
    const token = view.find((o) => o.name === 'Soldier');
    expect(token?.keywords).toContain('haste');
    expect([token?.power, token?.toughness]).toEqual([2, 2]);
    const bears = view.find((o) => o.name === BEARS);
    expect(bears?.keywords ?? []).not.toContain('haste');
    expect(bears?.power).toBe(2);
    g.expect.invariants();
  });
});

describe('Saheeli, Sublime Artificer (-2: target artifact you control becomes a copy of another target artifact or creature you control, an artifact in addition)', () => {
  const game = () =>
    scenario()
      .define(SAHEELI)
      .define(ROCK)
      .define(WIZARD)
      .seat(0)
      .battlefield(SAHEELI.name)
      .battlefield(ROCK.name)
      .battlefield(WIZARD.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('the two targets are different and the first is an artifact (CR 115.3)', () => {
    const ability = SAHEELI.faces[0]?.abilities.find(
      (a) => a.kind === 'activated' && a.cost.some((c) => c.kind === 'loyalty'),
    );
    expect(ability).toMatchObject({
      targets: [{ id: 't1' }, { id: 't2', differentFrom: 't1' }],
      effect: { kind: 'becomeCopy', addTypes: ['artifact'], duration: 'untilEndOfTurn' },
    });
  });

  test('the Rock becomes a copy of the Wizard and is also an artifact, until end of turn (CR 707.9b)', () => {
    const g = game();
    g.act(0).activate(SAHEELI.name, { targets: [ROCK.name, WIZARD.name] });
    g.passAll();
    const views = getView(g.state, 0).battlefield.filter((o) => o.controller === 0);
    const copy = views.find((o) => o.name === WIZARD.name && o.types.includes('artifact'));
    expect(copy?.types).toEqual(expect.arrayContaining(['artifact', 'creature']));
    expect([copy?.power, copy?.toughness]).toEqual([1, 1]);
    g.expect.invariants();
  });
});

describe('Mana Sculpt (counter target spell; with a Wizard add as much {C} as was spent, at your next main phase)', () => {
  const game = (wizard: boolean) => {
    let b = scenario().define(SCULPT).define(FATTY).define(WIZARD);
    b = b
      .seat(0)
      .hand(SCULPT.name)
      .battlefield('Island', { count: 3 })
      .library(...FILLER);
    if (wizard) b = b.battlefield(WIZARD.name);
    return b
      .seat(1)
      .hand(FATTY.name)
      .battlefield('Forest', { count: 4 })
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
  };

  test('with a Wizard the mana spent on the countered spell is added at the beginning of your next main phase', () => {
    const g = game(true);
    g.act(1).cast(FATTY.name, { pay: true });
    g.act(1).pass();
    g.act(0).cast(SCULPT.name, { pay: true, targets: [FATTY.name] });
    g.passAll();
    g.expect.zone(FATTY.name, 'graveyard');
    expect(g.state.delayedTriggers).toHaveLength(1);
    expect(g.state.delayedTriggers[0]?.ability.effect).toMatchObject({
      kind: 'addMana',
      mana: { kind: 'fixed', mana: ['C'], times: 4 },
    });
    expect(g.state.seats[0]?.manaPool).toHaveLength(0);
    g.expect.invariants();
  });

  test('the mana is added when your next main phase begins: four {C}, as much as was spent', () => {
    const g = game(true);
    g.act(1).cast(FATTY.name, { pay: true });
    g.act(1).pass();
    g.act(0).cast(SCULPT.name, { pay: true, targets: [FATTY.name] });
    g.passAll();
    let guard = 0;
    while ((g.state.seats[0]?.manaPool.length ?? 0) === 0 && guard < 60) {
      guard += 1;
      const p = g.state.pending;
      if (p?.kind === 'priority') g.act(p.seat).pass();
      else break;
    }
    expect(g.state.turn.number).toBe(3);
    expect(g.state.turn.step).toBe('precombatMain');
    expect(g.state.seats[0]?.manaPool.map((m) => m.color)).toEqual(['C', 'C', 'C', 'C']);
    g.expect.invariants();
  });

  test('without a Wizard nothing is delayed', () => {
    const g = game(false);
    g.act(1).cast(FATTY.name, { pay: true });
    g.act(1).pass();
    g.act(0).cast(SCULPT.name, { pay: true, targets: [FATTY.name] });
    g.passAll();
    g.expect.zone(FATTY.name, 'graveyard');
    expect(g.state.delayedTriggers).toHaveLength(0);
    g.expect.invariants();
  });
});

describe('Arcane Denial (counter target spell; its controller may draw up to two cards and you draw a card at the next upkeep)', () => {
  const game = () =>
    scenario()
      .define(DENIAL)
      .define(FATTY)
      .seat(0)
      .hand(DENIAL.name)
      .battlefield('Island', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .hand(FATTY.name)
      .battlefield('Forest', { count: 4 })
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();

  test("the countered spell's controller is asked how many cards to draw, at the next upkeep, and you draw one", () => {
    const g = game();
    g.act(1).cast(FATTY.name, { pay: true });
    g.act(1).pass();
    g.act(0).cast(DENIAL.name, { pay: true, targets: [FATTY.name] });
    g.passAll();
    g.expect.zone(FATTY.name, 'graveyard');
    expect(g.state.delayedTriggers).toHaveLength(2);
    expect(g.state.delayedTriggers.find((d) => d.player !== undefined)?.player).toBe(1);
    // Pass to the next upkeep: seat 0's turn begins.
    const handBefore = g.state.seats[0]?.hand.length ?? 0;
    const theirBefore = g.state.seats[1]?.hand.length ?? 0;
    let guard = 0;
    while (g.state.pending?.kind !== 'chooseX' && guard < 40) {
      guard += 1;
      const p = g.state.pending;
      if (p?.kind === 'priority') g.act(p.seat).pass();
      else if (p?.kind === 'orderTriggers') g.act(p.seat).orderTriggers(0, 1);
      else break;
    }
    const asked = g.state.pending;
    if (asked?.kind !== 'chooseX') throw new Error(`expected chooseX, got ${asked?.kind}`);
    expect(asked.purpose).toBe('drawUpTo');
    expect(asked.seat).toBe(1);
    expect([asked.min, asked.max]).toEqual([0, 2]);
    g.act(1).choose({ kind: 'chooseX', value: 2 });
    let more = 0;
    while (g.state.pending?.kind === 'priority' && more < 6 && g.state.stack.length > 0) {
      more += 1;
      g.passAll();
    }
    expect(g.state.seats[1]?.hand.length).toBe(theirBefore + 2);
    expect(g.state.seats[0]?.hand.length).toBeGreaterThanOrEqual(handBefore + 1);
    g.expect.invariants();
  });
});
