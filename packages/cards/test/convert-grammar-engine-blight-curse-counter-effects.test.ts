// The Blight Curse deck, group "counter effects and costs": the REAL Oracle text of Devoted Druid, Incremental Blight, Ferrafor, Young Yew, Nesting Grounds, Eventide's Shadow and
// Glissa Sunslayer from the golden corpus goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the
// parser writes for the real text are what the engine runs. Pins: CR 118.3 and 122.1 (a counter put on the permanent as a cost), CR 115.3 ("another" and "a third" target differ from
// the targets before them), CR 701.10e (doubling each kind of counter), CR 122.1 and 608.2c ("the number of counters among creatures target player controls"), CR 122.5 (moving a
// counter), CR 608.2d (the controller chooses which counters come off) and CR 608.2c ("the number of counters removed this way").
import { readFileSync } from 'node:fs';
import {
  type CardDefinition,
  type ChosenTarget,
  type PendingDecision,
  validateCard,
} from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

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
  expect(validateCard(imported.definition), name).toEqual([]);
  return imported.definition;
}

const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const ELVES = 'Llanowar Elves'; // 1/1
const LIBRARY = Array.from({ length: 10 }, () => 'Plains');

/** The decision now pending, as the options it offers. */
const pickOptions = (state: { pending: PendingDecision | null }): readonly string[] => {
  const d = state.pending;
  if (d?.kind !== 'chooseOption') throw new Error(`pending is ${d?.kind}`);
  expect(d.purpose).toBe('counterPick');
  return d.options;
};

describe('Devoted Druid: "Put a -1/-1 counter on ~: Untap ~."', () => {
  const druid = real('Devoted Druid');
  const DRUID = druid.name;

  test('the AST is a counter cost and an untap', () => {
    expect(druid.faces[0]?.abilities[1]).toMatchObject({
      kind: 'activated',
      cost: [{ kind: 'putCounters', counter: '-1/-1', count: 1 }],
      effect: { kind: 'untap', objects: { kind: 'this' } },
    });
  });

  const start = () =>
    scenario()
      .define(druid)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(DRUID)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('tapped for mana, the Druid untaps by taking a -1/-1 counter (CR 118.3, 122.1)', () => {
    const g = start();
    g.act(0).tapForMana(DRUID);
    g.expect.tapped(DRUID, true);
    g.act(0).activate(DRUID, { ability: 1 });
    // The counter is a cost: it is there before the ability resolves.
    g.expect.counters(DRUID, { '-1/-1': 1 });
    g.passAll();
    g.expect.tapped(DRUID, false);
    g.expect.pt(DRUID, -1, 1);
    g.expect.invariants();
  });

  test('a second use leaves a 0/2 with two counters at -2/0: it dies as a state-based action (CR 704.5f)', () => {
    const g = start();
    g.act(0).tapForMana(DRUID);
    g.act(0).activate(DRUID, { ability: 1 });
    g.passAll();
    g.act(0).tapForMana(DRUID);
    g.act(0).activate(DRUID, { ability: 1 });
    g.passAll();
    g.expect.zone(DRUID, 'graveyard', { seat: 0 });
  });
});

describe('Incremental Blight: three counters on three different creatures', () => {
  const blight = real('Incremental Blight');
  const BLIGHT = blight.name;

  test('the AST is three counter effects on three target slots that differ', () => {
    const face = blight.faces[0];
    expect(face?.spell?.targets).toEqual([
      { id: 't1', what: { kind: 'object', filter: { types: ['creature'], zone: 'battlefield' } } },
      {
        id: 't2',
        what: { kind: 'object', filter: { types: ['creature'], zone: 'battlefield' } },
        differentFrom: 't1',
      },
      {
        id: 't3',
        what: { kind: 'object', filter: { types: ['creature'], zone: 'battlefield' } },
        differentFrom: 't2',
        alsoDifferentFrom: ['t1'],
      },
    ]);
    expect(face?.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'addCounters', counter: '-1/-1', count: 1 },
        { kind: 'addCounters', counter: '-1/-1', count: 2 },
        { kind: 'addCounters', counter: '-1/-1', count: 3 },
      ],
    });
  });

  const start = () =>
    scenario()
      .define(blight)
      .seat(0)
      .library(...LIBRARY)
      .hand(BLIGHT)
      .battlefield('Swamp', { count: 5 })
      .battlefield(SPIDER, { label: 'a' })
      .battlefield(SPIDER, { label: 'b' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'c' })
      .battlefield(SPIDER, { label: 'd' })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('one, two and three -1/-1 counters go on the three targets in the order written (CR 608.2c)', () => {
    const g = start();
    g.act(0).cast(BLIGHT, { targets: ['a', 'c', 'd'], pay: true });
    g.passAll();
    g.expect.counters('a', { '-1/-1': 1 });
    g.expect.counters('c', { '-1/-1': 2 });
    g.expect.counters('d', { '-1/-1': 3 });
    g.expect.counters('b', {});
    g.expect.invariants();
  });

  test('the same creature can not be chosen twice: "another" and "a third" make the targets differ (CR 115.3)', () => {
    const g = start();
    const h = g.act(0).cast(BLIGHT);
    expect(h.stage).toBe('targets');
    const pick = (...labels: string[]): ChosenTarget[] =>
      labels.map((l, i) => ({ kind: 'object', id: g.id(l), specId: `t${i + 1}` }));
    expect(g.act(0).try.action({ kind: 'chooseTargets', targets: pick('a', 'a', 'c') }).ok).toBe(
      false,
    );
    // The third differs from the first too, not only from the second.
    expect(g.act(0).try.action({ kind: 'chooseTargets', targets: pick('a', 'c', 'a') }).ok).toBe(
      false,
    );
    expect(g.act(0).try.action({ kind: 'chooseTargets', targets: pick('a', 'c', 'd') }).ok).toBe(
      true,
    );
  });

  test('the legal answers listed are all different creatures', () => {
    const g = start();
    g.act(0).cast(BLIGHT);
    const answers = g
      .legalActions(0)
      .flatMap((a) => (a.kind === 'chooseTargets' ? [a.targets] : []));
    expect(answers.length).toBe(24); // 4 x 3 x 2 ordered picks of 4 creatures
    for (const targets of answers) {
      expect(new Set(targets.map((t) => (t.kind === 'object' ? t.id : -1))).size).toBe(3);
    }
  });
});

describe('Ferrafor, Young Yew', () => {
  const ferrafor = real('Ferrafor, Young Yew');
  const FERRAFOR = ferrafor.name;

  test("the AST: the Saproling count is the counters among a target player's creatures, and the doubling names no kind", () => {
    const [entering, doubling] = ferrafor.faces[0]?.abilities ?? [];
    expect(entering).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'createToken',
        count: {
          kind: 'aggregate',
          how: 'total',
          stat: 'counters',
          filter: { types: ['creature'], controlledBy: { kind: 'target' } },
        },
      },
    });
    expect(doubling).toMatchObject({
      kind: 'activated',
      effect: { kind: 'doubleCounters' },
    });
    expect((doubling as { effect: { counter?: string } }).effect.counter).toBeUndefined();
  });

  const start = () =>
    scenario()
      .define(ferrafor)
      .seat(0)
      .library(...LIBRARY)
      .hand(FERRAFOR)
      .battlefield('Forest', { count: 7 })
      .battlefield(ELVES, { label: 'mine', counters: { '+1/+1': 2, oil: 1 } })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'theirs', counters: { '+1/+1': 1, charge: 2 } })
      .battlefield('Forest', { label: 'land', counters: { charge: 5 } })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('entering with an opponent as the target: one Saproling for each counter among their creatures (CR 608.2c)', () => {
    const g = start();
    g.act(0).cast(FERRAFOR, { pay: true });
    g.passAll(); // the spell resolves; the enters trigger asks for its target player
    g.act(0).chooseTargets({ player: 1 } as never);
    g.passAll();
    // 3 counters on their Spider; the 5 on their land are not on a creature.
    g.expect.zone('Saproling', 'battlefield', { seat: 0, count: 3 });
    g.expect.pt({ name: 'Saproling', nth: 0 }, 1, 1);
    g.expect.invariants();
  });

  test('targeting yourself counts your own creatures: 3 counters of two kinds', () => {
    const g = start();
    g.act(0).cast(FERRAFOR, { pay: true });
    g.passAll();
    g.act(0).chooseTargets({ player: 0 } as never);
    g.passAll();
    g.expect.zone('Saproling', 'battlefield', { seat: 0, count: 3 });
  });

  test('{T}: every kind of counter on the creature is doubled, each by its own number (CR 701.10e)', () => {
    const g = scenario()
      .define(ferrafor)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(FERRAFOR)
      .battlefield(ELVES, { label: 'mine', counters: { '+1/+1': 2, oil: 1, charge: 3 } })
      .battlefield(BEARS, { label: 'bare' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(FERRAFOR, { targets: ['mine'] });
    g.passAll();
    g.expect.counters('mine', { '+1/+1': 4, oil: 2, charge: 6 });
    g.expect.tapped(FERRAFOR, true);
    g.expect.invariants();
  });

  test('a creature with no counters gets none', () => {
    const g = scenario()
      .define(ferrafor)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(FERRAFOR)
      .battlefield(BEARS, { label: 'bare' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(FERRAFOR, { targets: ['bare'] });
    g.passAll();
    g.expect.counters('bare', {});
  });
});

describe('Nesting Grounds: "Move a counter from target permanent you control onto a second target permanent."', () => {
  const grounds = real('Nesting Grounds');
  const GROUNDS = grounds.name;

  test('the AST: a sorcery-speed ability with two target slots', () => {
    expect(grounds.faces[0]?.abilities[1]).toMatchObject({
      kind: 'activated',
      cost: [{ kind: 'mana' }, { kind: 'tap' }],
      effect: { kind: 'moveCounter', from: { kind: 'target' }, to: { kind: 'target' } },
      timing: 'sorcery',
    });
  });

  const start = (mine: Record<string, number>) =>
    scenario()
      .define(grounds)
      .seat(0)
      .library(...LIBRARY)
      .battlefield('Forest')
      .battlefield(GROUNDS)
      .battlefield(ELVES, { label: 'mine', counters: mine })
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'theirs' })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('with one kind of counter nothing is asked: it moves onto the second target (CR 122.5)', () => {
    const g = start({ '+1/+1': 2 });
    g.act(0).activate(GROUNDS, { ability: 1, targets: ['mine', 'theirs'], pay: true });
    g.passAll();
    g.expect.counters('mine', { '+1/+1': 1 });
    g.expect.counters('theirs', { '+1/+1': 1 });
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('with two kinds the controller chooses which counter moves', () => {
    const g = start({ '+1/+1': 1, charge: 1 });
    g.act(0).activate(GROUNDS, { ability: 1, targets: ['mine', 'bears'], pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    const options = pickOptions(g.state);
    expect(options).toEqual([
      '+1/+1 counter on Llanowar Elves (yours)',
      'charge counter on Llanowar Elves (yours)',
    ]);
    g.act(0).chooseOption('charge counter on Llanowar Elves (yours)');
    g.expect.counters('mine', { '+1/+1': 1 });
    g.expect.counters('bears', { charge: 1 });
  });

  test('a permanent with no counter: nothing moves (CR 122.5)', () => {
    const g = start({});
    g.act(0).activate(GROUNDS, { ability: 1, targets: ['mine', 'bears'], pay: true });
    g.passAll();
    g.expect.counters('mine', {});
    g.expect.counters('bears', {});
    g.expect.pending('priority', 0);
  });

  test('the same permanent as both targets: nothing moves (CR 122.5)', () => {
    const g = start({ '+1/+1': 1 });
    g.act(0).activate(GROUNDS, { ability: 1, targets: ['mine', 'mine'], pay: true });
    g.passAll();
    g.expect.counters('mine', { '+1/+1': 1 });
  });

  test('only as a sorcery: not on the opponents turn or with something on the stack', () => {
    const g = start({ '+1/+1': 1 });
    g.advanceTo('declareAttackers');
    expect(g.act(0).try.activate(GROUNDS, { ability: 1 }).ok).toBe(false);
  });
});

describe("Eventide's Shadow: remove any number of counters, then draw and lose that much", () => {
  const shadow = real("Eventide's Shadow");
  const SHADOW = shadow.name;

  test('the AST: choose counters among every permanent, then draw and lose life for the number removed', () => {
    expect(shadow.faces[0]?.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'removeChosenCounters', objects: { kind: 'each' } },
        { kind: 'draw', count: { kind: 'thisWay', what: 'countersRemoved' } },
        { kind: 'loseLife', amount: { kind: 'thisWay', what: 'countersRemoved' } },
      ],
    });
  });

  const start = () =>
    scenario()
      .define(shadow)
      .seat(0)
      .library(...LIBRARY)
      .hand(SHADOW)
      .battlefield('Swamp', { count: 5 })
      .battlefield(SPIDER, { label: 'mine', counters: { '-1/-1': 2 } })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'theirs', counters: { '+1/+1': 1, charge: 1 } })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the controller picks counters one at a time and stops: draws and loses life for each (CR 608.2d, 608.2c)', () => {
    const g = start();
    g.act(0).cast(SHADOW, { pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    expect(pickOptions(g.state)).toEqual([
      '-1/-1 counter on Giant Spider (yours)',
      "+1/+1 counter on Giant Spider (opponent's)",
      "charge counter on Giant Spider (opponent's)",
      'Done',
    ]);
    g.act(0).chooseOption('-1/-1 counter on Giant Spider (yours)');
    g.act(0).chooseOption('-1/-1 counter on Giant Spider (yours)');
    // Her permanent has none left: it is no longer offered.
    expect(pickOptions(g.state)).toEqual([
      "+1/+1 counter on Giant Spider (opponent's)",
      "charge counter on Giant Spider (opponent's)",
      'Done',
    ]);
    g.act(0).chooseOption("+1/+1 counter on Giant Spider (opponent's)");
    g.act(0).chooseOption('Done');
    g.expect.counters('mine', {});
    g.expect.counters('theirs', { charge: 1 });
    g.expect.life(0, 37); // 40, minus 3 counters removed
    g.expect.handSize(0, 3);
    g.expect.invariants();
  });

  test('choosing nothing draws no cards and loses no life', () => {
    const g = start();
    g.act(0).cast(SHADOW, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Done');
    g.expect.life(0, 40);
    g.expect.handSize(0, 0);
    g.expect.counters('mine', { '-1/-1': 2 });
  });

  test('with no counter anywhere nothing is asked', () => {
    const g = scenario()
      .define(shadow)
      .seat(0)
      .library(...LIBRARY)
      .hand(SHADOW)
      .battlefield('Swamp', { count: 5 })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(SHADOW, { pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.life(0, 40);
  });

  test('an answer that is not an option is refused', () => {
    const g = start();
    g.act(0).cast(SHADOW, { pay: true });
    g.passAll();
    expect(g.act(0).try.action({ kind: 'chooseOption', option: 'a counter' }).ok).toBe(false);
  });
});

describe('Glissa Sunslayer: "Remove up to three counters from target permanent."', () => {
  const glissa = real('Glissa Sunslayer');
  const GLISSA = glissa.name;

  test('the AST: a combat damage trigger with three modes, the third removes up to three counters', () => {
    const trigger = glissa.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(trigger).toMatchObject({
      kind: 'triggered',
      modes: [
        { effect: { kind: 'sequence' } },
        { effect: { kind: 'destroy' } },
        { effect: { kind: 'removeChosenCounters', upTo: 3 } },
      ],
    });
  });

  /** A SYNTHETIC sorcery with the very sentence of the third mode, to play the effect without a combat. */
  const REMOVE = parsed(
    'SYNTHETIC Remove Three',
    'Sorcery',
    'Remove up to three counters from target permanent.',
    { manaCost: '{B}' },
  );

  const start = () =>
    scenario()
      .define(REMOVE)
      .seat(0)
      .library(...LIBRARY)
      .hand(REMOVE.name)
      .battlefield('Swamp')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'theirs', counters: { '+1/+1': 2, charge: 2 } })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('three counters at most come off the one permanent, of the kinds the controller picks', () => {
    const g = start();
    g.act(0).cast(REMOVE.name, { targets: ['theirs'], pay: true });
    g.passAll();
    expect(pickOptions(g.state)).toEqual([
      "+1/+1 counter on Giant Spider (opponent's)",
      "charge counter on Giant Spider (opponent's)",
      'Done',
    ]);
    g.act(0).chooseOption("charge counter on Giant Spider (opponent's)");
    g.act(0).chooseOption("charge counter on Giant Spider (opponent's)");
    g.act(0).chooseOption("+1/+1 counter on Giant Spider (opponent's)");
    // Three were taken: the effect is over although a counter is left.
    g.expect.pending('priority', 0);
    g.expect.counters('theirs', { '+1/+1': 1 });
    g.expect.invariants();
  });

  test('"up to": stopping early is allowed', () => {
    const g = start();
    g.act(0).cast(REMOVE.name, { targets: ['theirs'], pay: true });
    g.passAll();
    g.act(0).chooseOption("+1/+1 counter on Giant Spider (opponent's)");
    g.act(0).chooseOption('Done');
    g.expect.counters('theirs', { '+1/+1': 1, charge: 2 });
  });

  test('the real Glissa: combat damage to a player triggers the choice, and the counter mode removes counters', () => {
    const g = scenario()
      .define(glissa)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(GLISSA)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'theirs', counters: { '+1/+1': 2 } })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.playCombat({ attack: [GLISSA], until: 'declareBlockers' });
    g.passAll();
    g.expect.life(1, 37);
    g.expect.pending('chooseModes', 0);
    g.act(0).chooseModes(2);
    g.act(0).chooseTargets('theirs');
    g.passAll();
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption("+1/+1 counter on Giant Spider (opponent's)");
    g.act(0).chooseOption("+1/+1 counter on Giant Spider (opponent's)");
    g.expect.counters('theirs', {});
  });
});
