// Scenario 19 (SPEC 12): ward.
// Pins: CR 702.21a (Ward): a triggered ability, "Whenever this permanent becomes the target of a
// spell or ability an opponent controls, counter that spell or ability unless that player pays
// [cost]"; CR 601.2c / 602.2b: a permanent becomes a target as the spell is cast or the ability
// activated, so the trigger goes on the stack above it (CR 603.3, 405.5) and resolves first; CR
// 702.21a counters the whole spell or ability, not only the part that targets the permanent
// (CR 701.6, 608.2b); CR 118.3 / 119.4: a cost that cannot be paid is not paid, so the spell is
// countered without a question; CR 605.3a: mana is paid by tapping sources as part of the payment;
// CR 702.21a "an opponent controls": the controller's own spells and abilities do not trigger it;
// CR 613.1f: a permanent that lost all abilities has lost ward.
// Cards: "SYNTHETIC Ward Bear" (2/2, Ward {2}), "SYNTHETIC Blood Ward Bear" (2/2, Ward: pay 3
// life), both defined in this file, with the real Lightning Bolt, Counterspell, Grizzly Bears and
// the SYNTHETIC Pinger ({T}: 1 damage to any target) and Twin Bolt (two creature targets).
import { describe, expect, test } from 'vitest';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const WARD = 'SYNTHETIC Ward Bear';
const BLOOD = 'SYNTHETIC Blood Ward Bear';
const BOLT = 'Lightning Bolt';
const PINGER = 'SYNTHETIC Pinger';
const TWIN = 'SYNTHETIC Twin Bolt';
const BEARS = 'Grizzly Bears';

const bear = (name: string, text: string, cost: Parameters<typeof wardKeyword>[0]) =>
  singleFaceCard({
    name,
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText: text,
    abilities: [wardKeyword(cost)],
  });
function wardKeyword(cost: readonly (typeof WARD_COST)[number][]) {
  return { kind: 'keyword', keyword: { kind: 'ward', cost } } as const;
}
const WARD_COST = [
  { kind: 'mana', symbols: ['2'] },
  { kind: 'payLife', amount: 3 },
] as const;

const wardBear = bear(WARD, 'Ward {2}', [WARD_COST[0]]);
const bloodBear = bear(BLOOD, 'Ward—Pay 3 life.', [WARD_COST[1]]);
const WARD_ABILITY = `${WARD} (ability)`;

const hushOne = singleFaceCard({
  name: 'SYNTHETIC Hush One',
  manaCost: ['U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'Target creature loses all abilities until end of turn.',
  spell: {
    targets: [
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } } },
    ],
    effect: {
      kind: 'loseAllAbilities',
      objects: { kind: 'target', id: 't1' },
      duration: 'untilEndOfTurn',
    },
  },
});

/** Seat 0 (active, with priority) holds a Bolt and `mountains` Mountains; seat 1 has the ward bear. */
function board(mountains: number, extra: (b: ReturnType<typeof scenario>) => void = () => {}) {
  const b = scenario()
    .seat(0)
    .hand(BOLT, { label: 'bolt1' })
    .hand(BOLT, { label: 'bolt2' })
    .battlefield(...Array.from({ length: mountains }, () => 'Mountain'))
    .define(wardBear)
    .define(bloodBear)
    .define(hushOne)
    .seat(1)
    .battlefield(WARD, BEARS);
  extra(b);
  return b.build();
}

function pendingKind(g: ScenarioGame) {
  const d = g.state.pending;
  if (d === null) throw new Error('nothing pending');
  return d;
}

describe('SPEC scenario 19: ward triggers when an opponent targets the permanent (CR 702.21a)', () => {
  test('targeting it puts the ward trigger on the stack above the spell, as the targets are chosen', () => {
    const g = board(3);
    g.act(0).cast('bolt1', { targets: [WARD], pay: true });
    g.expect.stack([WARD_ABILITY, BOLT]);
    g.expect.eventLog([
      { kind: 'becameTarget', seat: 0 },
      { kind: 'spellCast', seat: 0 },
      { kind: 'abilityTriggered', seat: 1 },
    ]);
    // The trigger waits above the spell: nothing has been asked or countered yet.
    g.expect.pending('priority', 0);
    g.expect.noEvent({ kind: 'countered' });
    g.expect.life(1, 40);
  });

  test("the trigger resolves first and asks the spell's controller, not the ward permanent's", () => {
    const g = board(3);
    g.act(0).cast('bolt1', { targets: [WARD], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    const d = pendingKind(g);
    if (d.kind !== 'confirmOptional') throw new Error('expected confirmOptional');
    expect(d.purpose).toBe('ward');
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['2'] }]);
    expect(d.sourceName).toBe(WARD);
    expect(d.subject).toBe(g.id({ name: BOLT, zone: 'stack' }));
    // The spell is still on the stack under the ward trigger.
    g.expect.stack([WARD_ABILITY, BOLT]);
  });

  test('paying {2} lets the spell resolve: it kills the bear', () => {
    const g = board(3);
    g.act(0).cast('bolt1', { targets: [WARD], pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.pending('payMana', 0);
    const d = pendingKind(g);
    if (d.kind !== 'payMana') throw new Error('expected payMana');
    expect(d.purpose).toBe('ward');
    expect(d.totalCost).toEqual(['2']);
    g.act(0).payAuto();
    g.expect.tapped('Mountain[0]', true);
    g.expect.stack([BOLT]);
    g.expect.noEvent({ kind: 'countered' });
    g.passAll();
    g.expect.zone(WARD, 'graveyard', { seat: 1 });
    g.expect.zone(BOLT, 'graveyard', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('paying by tapping chosen sources works like paying a cost by hand (CR 605.3a)', () => {
    const g = board(4);
    g.act(0).cast('bolt1', { targets: [WARD], pay: true });
    g.passAll();
    g.act(0).accept();
    // Bolt tapped one Mountain; tap two of the untapped ones.
    const untapped = g.find({ name: 'Mountain', zone: 'battlefield' }).filter((o) => !o.tapped);
    expect(untapped).toHaveLength(3);
    g.act(0).choose({
      kind: 'payManual',
      taps: untapped.slice(0, 2).map((o) => ({ object: o.id, abilityIndex: 0 })),
    });
    g.expect.stack([BOLT]);
    expect(g.find({ name: 'Mountain', zone: 'battlefield' }).filter((o) => !o.tapped)).toHaveLength(
      1,
    );
  });

  test('a payment that does not cover the cost is refused and the question stays', () => {
    const g = board(4);
    g.act(0).cast('bolt1', { targets: [WARD], pay: true });
    g.passAll();
    g.act(0).accept();
    const untapped = g.find({ name: 'Mountain', zone: 'battlefield' }).filter((o) => !o.tapped);
    const before = g.hash();
    const r = g.act(0).try.action({
      kind: 'payManual',
      taps: untapped.slice(0, 1).map((o) => ({ object: o.id, abilityIndex: 0 })),
    });
    expect(r.ok).toBe(false);
    g.expect.hash(before);
    g.expect.pending('payMana', 0);
  });

  test('declining counters the spell: the bear is unharmed and the spell is in the graveyard', () => {
    const g = board(3);
    g.act(0).cast('bolt1', { targets: [WARD], pay: true });
    g.passAll();
    const mark = g.mark();
    g.act(0).decline();
    g.expect.eventLog(
      [{ kind: 'optionalAnswered', seat: 0, accepted: false }, { kind: 'countered' }],
      { since: mark },
    );
    g.expect.stack([]);
    g.expect.zone(BOLT, 'graveyard', { seat: 0, count: 1 });
    g.expect.zone(WARD, 'battlefield', { seat: 1 });
    g.expect.damage(WARD, 0);
    g.expect.pending('priority', 0);
  });

  test('cancelling the payment means "do not pay": the spell is countered', () => {
    const g = board(3);
    g.act(0).cast('bolt1', { targets: [WARD], pay: true });
    g.passAll();
    g.act(0).accept();
    g.act(0).cancel();
    g.expect.stack([]);
    g.expect.zone(BOLT, 'graveyard', { seat: 0, count: 1 });
    g.expect.damage(WARD, 0);
    // Nothing was paid: all Mountains but the one for the Bolt are untapped.
    expect(g.find({ name: 'Mountain', zone: 'battlefield' }).filter((o) => !o.tapped)).toHaveLength(
      2,
    );
  });

  test('a controller who cannot pay is not asked: the spell is countered (CR 118.3)', () => {
    const g = board(2); // one Mountain pays for the Bolt, one is left for a ward cost of {2}
    g.act(0).cast('bolt1', { targets: [WARD], pay: true });
    g.passAll();
    g.expect.stack([]);
    g.expect.zone(BOLT, 'graveyard', { seat: 0, count: 1 });
    g.expect.damage(WARD, 0);
    g.expect.eventLog([{ kind: 'countered' }]);
    g.expect.pending('priority', 0);
  });

  test('mana already in the pool pays the ward cost', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .define(wardBear)
      .seat(1)
      .battlefield(WARD)
      .build();
    g.act(0).tapForMana('Mountain[1]');
    g.act(0).tapForMana('Mountain[2]');
    g.expect.pool(0, 'RR');
    g.act(0).cast(BOLT, { targets: [WARD], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.pool(0, '');
    g.expect.stack([BOLT]);
  });
});

describe('SPEC scenario 19: whose spells trigger it', () => {
  test("the controller's own spell does not trigger ward", () => {
    const g = scenario()
      .seat(0)
      .define(wardBear)
      .hand(BOLT)
      .battlefield('Mountain', WARD)
      .seat(1)
      .build();
    g.act(0).cast(BOLT, { targets: [WARD], pay: true });
    g.expect.stack([BOLT]);
    g.expect.noEvent({ kind: 'abilityTriggered' });
    g.passAll();
    g.expect.zone(WARD, 'graveyard', { seat: 0 });
  });

  test("neither does the controller's own activated ability", () => {
    const g = scenario().seat(0).define(wardBear).battlefield(WARD, PINGER).seat(1).build();
    g.act(0).activate(PINGER, { targets: [WARD] });
    g.expect.stack([`${PINGER} (ability)`]);
    g.expect.noEvent({ kind: 'abilityTriggered' });
  });

  test("an opponent's spell that does not target it does not trigger ward", () => {
    const g = board(3);
    g.act(0).cast('bolt1', { targets: [BEARS], pay: true });
    g.expect.stack([BOLT]);
    g.expect.noEvent({ kind: 'abilityTriggered' });
  });

  test('a spell that targets a player does not trigger ward', () => {
    const g = board(3);
    g.act(0).cast('bolt1', { targets: [{ player: 1 }], pay: true });
    g.expect.stack([BOLT]);
    g.expect.noEvent({ kind: 'abilityTriggered' });
  });
});

describe('SPEC scenario 19: the whole spell or ability is countered (CR 702.21a)', () => {
  const twinBolt = () =>
    scenario()
      .seat(0)
      .hand(TWIN)
      .battlefield('Mountain', 'Mountain')
      .define(wardBear)
      .seat(1)
      .battlefield(WARD, BEARS)
      .build();

  test('a spell with two targets, one of them warded, is countered as a whole if unpaid', () => {
    const g = twinBolt();
    g.act(0).cast(TWIN, { targets: [WARD, BEARS], pay: true });
    g.expect.stack([WARD_ABILITY, TWIN]);
    g.passAll(); // seat 0 has no mana left for {2}: not asked
    g.expect.stack([]);
    g.expect.zone(TWIN, 'graveyard', { seat: 0, count: 1 });
    // The ward only protects its own permanent, but the whole spell is countered.
    g.expect.damage(WARD, 0);
    g.expect.damage(BEARS, 0);
  });

  test('paid, the same spell resolves for both targets', () => {
    const g = scenario()
      .seat(0)
      .hand(TWIN)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .define(wardBear)
      .seat(1)
      .battlefield(WARD, BEARS)
      .build();
    g.act(0).cast(TWIN, { targets: [WARD, BEARS], pay: true });
    g.passAll();
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone(WARD, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('two warded targets give two triggers; once the spell is countered the second does nothing', () => {
    const g = scenario()
      .seat(0)
      .hand(TWIN)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .define(wardBear)
      .seat(1)
      .battlefield(WARD, { label: 'first' })
      .battlefield(WARD, { label: 'second' })
      .build();
    g.act(0).cast(TWIN, { targets: ['first', 'second'], pay: true });
    // Two different ward abilities of one player, so that player orders them (CR 603.3b).
    g.expect.pending('orderTriggers', 1);
    g.act(1).orderTriggers(0, 1);
    g.expect.stack([WARD_ABILITY, WARD_ABILITY, TWIN]);
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).decline();
    // The first ward countered the spell; the second still waits, finds nothing and asks nothing.
    g.expect.zone(TWIN, 'graveyard', { seat: 0, count: 1 });
    g.expect.stack([WARD_ABILITY]);
    g.passAll();
    g.expect.stack([]);
    g.expect.pending('priority', 0);
  });

  test('an ability that targets it is countered too, and what it cost stays paid', () => {
    const g = scenario()
      .seat(0)
      .battlefield(PINGER)
      .define(wardBear)
      .seat(1)
      .battlefield(WARD)
      .build();
    g.act(0).activate(PINGER, { targets: [WARD] });
    g.expect.stack([WARD_ABILITY, `${PINGER} (ability)`]);
    g.expect.tapped(PINGER, true);
    g.passAll(); // seat 0 has no mana: not asked, the ability is countered
    g.expect.stack([]);
    g.expect.damage(WARD, 0);
    g.expect.tapped(PINGER, true);
    g.expect.eventLog([{ kind: 'becameTarget', seat: 0 }, { kind: 'abilityActivated' }]);
    g.expect.eventLog([{ kind: 'countered' }]);
  });

  test('an ability whose controller pays the ward cost resolves', () => {
    const g = scenario()
      .seat(0)
      .battlefield(PINGER, 'Mountain', 'Mountain')
      .define(wardBear)
      .seat(1)
      .battlefield(WARD)
      .build();
    g.act(0).activate(PINGER, { targets: [WARD] });
    g.passAll();
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    g.expect.damage(WARD, 1);
  });
});

describe('SPEC scenario 19: ward with a life cost (CR 702.21a, 119.4)', () => {
  const lifeBoard = (life: number) =>
    scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain')
      .life(life)
      .define(bloodBear)
      .seat(1)
      .battlefield(BLOOD)
      .build();

  test('accepting pays the life, with no mana to pay: the spell goes on', () => {
    const g = lifeBoard(40);
    g.act(0).cast(BOLT, { targets: [BLOOD], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.life(0, 37);
    g.expect.stack([BOLT]);
    g.expect.pending('priority', 0);
    g.passAll();
    g.expect.zone(BLOOD, 'graveyard', { seat: 1 });
  });

  test('declining keeps the life and counters the spell', () => {
    const g = lifeBoard(40);
    g.act(0).cast(BOLT, { targets: [BLOOD], pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.life(0, 40);
    g.expect.zone(BOLT, 'graveyard', { seat: 0, count: 1 });
    g.expect.damage(BLOOD, 0);
  });

  test('with too little life it is not asked and the spell is countered', () => {
    const g = lifeBoard(2);
    g.act(0).cast(BOLT, { targets: [BLOOD], pay: true });
    g.passAll();
    g.expect.life(0, 2);
    g.expect.zone(BOLT, 'graveyard', { seat: 0, count: 1 });
    g.expect.pending('priority', 0);
  });
});

describe('SPEC scenario 19: timing and loss of the ability', () => {
  test('if the spell is countered in response, the ward trigger does nothing', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .define(wardBear)
      .seat(1)
      .hand('Counterspell')
      .battlefield(WARD, 'Island', 'Island')
      .build();
    g.act(0).cast(BOLT, { targets: [WARD], pay: true });
    g.act(0).pass();
    g.act(1).cast('Counterspell', { targets: [BOLT], pay: true });
    g.pass(); // seat 1 passes, seat 0 passes: Counterspell resolves, the Bolt is countered
    g.pass();
    g.expect.stack([WARD_ABILITY]);
    g.expect.zone(BOLT, 'graveyard', { seat: 0, count: 1 });
    g.passAll(); // the ward trigger finds no spell to counter and asks nothing
    g.expect.stack([]);
    g.expect.noEvent({ kind: 'optionalAnswered' });
    g.expect.zone(WARD, 'battlefield', { seat: 1 });
    g.expect.pending('priority', 0);
  });

  test('the trigger resolves even if the permanent left (CR 113.7a): the payer is asked, then the spell fizzles', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .define(wardBear)
      .seat(1)
      .hand('Unsummon')
      .battlefield(WARD, 'Island')
      .build();
    g.act(0).cast(BOLT, { targets: [WARD], pay: true });
    g.act(0).pass();
    g.act(1).cast('Unsummon', { targets: [WARD], pay: true });
    g.pass();
    g.pass(); // Unsummon resolves: the bear is back in its owner's hand
    g.expect.zone(WARD, 'hand', { seat: 1 });
    g.expect.stack([WARD_ABILITY, BOLT]);
    g.passAll();
    // The ward ability does not depend on its source: it still asks, named after the bear.
    g.expect.pending('confirmOptional', 0);
    const d = pendingKind(g);
    if (d.kind !== 'confirmOptional') throw new Error('expected confirmOptional');
    expect(d.sourceName).toBe(WARD);
    g.act(0).decline();
    g.expect.zone(BOLT, 'graveyard', { seat: 0, count: 1 });
  });

  test('a creature that lost all abilities has lost ward: no trigger (CR 613.1f)', () => {
    const g = board(3, (b) => b.seat(1).hand('SYNTHETIC Hush One').battlefield('Island'));
    g.act(0).pass();
    g.act(1).cast('SYNTHETIC Hush One', { targets: [WARD], pay: true });
    g.passAll();
    g.expect.derived(WARD, { keywords: [] });
    g.act(0).cast('bolt1', { targets: [WARD], pay: true });
    g.expect.stack([BOLT]);
    g.expect.noEvent({ kind: 'abilityTriggered' });
  });

  test("the ward trigger is an ordinary ability on the stack, shown under the permanent's name", () => {
    const g = board(3);
    g.act(0).cast('bolt1', { targets: [WARD], pay: true });
    const view = g.view(0);
    const top = view.stack[view.stack.length - 1];
    expect(top?.name).toBe(WARD);
    expect(top?.abilitySource).toBe(g.id(WARD));
    expect(top?.oracleText).toBe('Ward {2}');
  });
});

describe('SPEC scenario 19: legal actions and determinism', () => {
  test('the questions list exactly the answers the engine accepts', () => {
    const g = board(3);
    g.act(0).cast('bolt1', { targets: [WARD], pay: true });
    g.passAll();
    expect(g.legalActions(0).map((a) => a.kind)).toEqual([
      'acceptOptional',
      'declineOptional',
      'concede',
    ]);
    g.act(0).accept();
    expect(g.legalActions(0).map((a) => a.kind)).toEqual(['payAuto', 'cancel', 'concede']);
    // The other seat is not asked anything.
    expect(g.legalActions(1)).toEqual([]);
    g.expect.invariants();
  });

  test('the same actions give the same state hash', () => {
    const play = () => {
      const g = board(3);
      g.act(0).cast('bolt1', { targets: [WARD], pay: true });
      g.passAll();
      g.act(0).accept();
      g.act(0).payAuto();
      g.passAll();
      return g.hash();
    };
    expect(play()).toBe(play());
  });
});
