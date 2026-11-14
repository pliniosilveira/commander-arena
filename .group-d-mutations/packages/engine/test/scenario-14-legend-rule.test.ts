// Scenario 14 (SPEC 12): the legend rule, with copy effects.
// Pins: CR 704.5j (Legend rule): if a player controls two or more legendary permanents with the
// same name, that player chooses one of them and the rest are put into their owners' graveyards,
// as a state-based action (CR 704.3), before any player receives priority (CR 117.5); CR 707.2
// (Copying Objects) and CR 111.4: a token that is a copy of a legendary creature has its name and
// its legendary supertype, so the token and the original are "two legendary permanents with the
// same name"; CR 707.2 / 613.2a: "becomes a copy" gives the object the copiable values of another;
// CR 700.4 (Dies) and CR 603.10a: the permanent that goes to the graveyard triggers its "dies"
// abilities, as it was; CR 111.7 / 704.5d: a token in the graveyard ceases to exist afterwards;
// CR 704.5j "controlled by the same player": two controllers each keep theirs; "same name": a
// different name, or a non-legendary permanent, is not affected.
// Cards (SYNTHETIC, defined in this file): "SYNTHETIC Legendary Knight" (legendary 3/3; when it
// dies, its controller gains 2 life), "SYNTHETIC Legendary Rival" (another legend), "SYNTHETIC
// Mirror Image" (create a token that's a copy of target creature) and "SYNTHETIC Shapeshift"
// (target creature becomes a copy of another target creature until end of turn); real Grizzly
// Bears.
import { describe, expect, test } from 'vitest';
import type { ObjectId } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';
import { choosePermanentDecision } from './pending-helpers';

const KNIGHT = 'SYNTHETIC Legendary Knight';
const RIVAL = 'SYNTHETIC Legendary Rival';
const MIRROR = 'SYNTHETIC Mirror Image';
const SHIFT = 'SYNTHETIC Shapeshift';
const BEARS = 'Grizzly Bears';

const legend = (name: string, dies: boolean) =>
  singleFaceCard({
    name,
    manaCost: ['2', 'W'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Knight'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 3,
    toughness: 3,
    oracleText: dies ? 'When this creature dies, you gain 2 life.' : '',
    abilities: dies
      ? [
          {
            kind: 'triggered',
            trigger: { kind: 'dies', what: { kind: 'this' } },
            effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 2 },
          },
        ]
      : [],
  });

const knight = legend(KNIGHT, true);
const rival = legend(RIVAL, false);

const CREATURE = { zone: 'battlefield', types: ['creature'] } as const;
const mirrorImage = singleFaceCard({
  name: MIRROR,
  manaCost: ['1', 'U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: "Create a token that's a copy of target creature.",
  spell: {
    targets: [{ id: 't1', what: { kind: 'object', filter: CREATURE } }],
    effect: {
      kind: 'createToken',
      token: { kind: 'copyOf', object: { kind: 'target', id: 't1' } },
      count: 1,
    },
  },
});
const shapeshift = singleFaceCard({
  name: SHIFT,
  manaCost: ['1', 'U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'Target creature becomes a copy of another target creature until end of turn.',
  spell: {
    targets: [
      { id: 't1', what: { kind: 'object', filter: CREATURE } },
      { id: 't2', what: { kind: 'object', filter: CREATURE } },
    ],
    effect: {
      kind: 'becomeCopy',
      objects: { kind: 'target', id: 't1' },
      of: { kind: 'target', id: 't2' },
      duration: 'untilEndOfTurn',
    },
  },
});

type Builder = ReturnType<typeof scenario>;
const defined = (b: Builder) =>
  b.define(knight).define(rival).define(mirrorImage).define(shapeshift);

/** Seat 0 (priority) controls a Knight and holds Mirror Image with two Islands. */
function board(extra: (b: Builder) => Builder = (b) => b) {
  return extra(
    defined(
      scenario()
        .seat(0)
        .hand(MIRROR)
        .battlefield('Island', 'Island')
        .battlefield(KNIGHT, { label: 'original' })
        .seat(1),
    ),
  ).build();
}

function castMirror(g: ScenarioGame, target = 'original') {
  g.act(0).cast(MIRROR, { targets: [target], pay: true });
  g.passAll();
}

const tokenKnights = (g: ScenarioGame) =>
  g.find({ name: KNIGHT, zone: 'battlefield' }).filter((o) => o.token !== null);

describe('SPEC scenario 14: a copy effect makes a second legendary permanent (CR 704.5j, 707.2)', () => {
  test('the token copy is a legendary Knight named like the original: its controller is asked', () => {
    const g = board();
    castMirror(g);
    g.expect.pending('choosePermanent', 0);
    const d = choosePermanentDecision(g);
    expect(d.purpose).toBe('legendRule');
    expect(d.min).toBe(1);
    expect(d.max).toBe(1);
    const token = tokenKnights(g)[0];
    expect(token).toBeDefined();
    expect([...d.legal].sort()).toEqual([g.id('original'), token?.id as ObjectId].sort());
    // No spell or ability is involved: the decision names the first of the permanents.
    expect(d.source).toBe(d.legal[0]);
    // Nobody has received priority yet: the rule is a state-based action (CR 117.5).
    g.expect.stack([]);
  });

  test('keeping the original: the token goes to the graveyard and its dies ability triggers', () => {
    const g = board();
    castMirror(g);
    const mark = g.mark();
    g.act(0).choosePermanents('original');
    g.expect.eventLog(
      [
        { kind: 'legendRule', seat: 0, name: KNIGHT, kept: g.id('original') },
        { kind: 'zoneChanged', fromZone: 'battlefield', toZone: 'graveyard' },
        { kind: 'died' },
        { kind: 'abilityTriggered' },
      ],
      { since: mark },
    );
    expect(g.object('original').zone).toBe('battlefield');
    expect(tokenKnights(g)).toHaveLength(0);
    // The token ceased to exist after triggering (CR 111.7): only its dies ability is left.
    g.expect.stack([`${KNIGHT} (ability)`]);
    g.passAll();
    g.expect.life(0, 42);
    g.expect.invariants();
  });

  test("keeping the token: the original card goes to its owner's graveyard and its ability triggers", () => {
    const g = board();
    castMirror(g);
    const token = tokenKnights(g)[0];
    g.act(0).choose({ kind: 'choosePermanents', objects: [token?.id as ObjectId] });
    g.expect.zone(KNIGHT, 'graveyard', { seat: 0, count: 1 });
    expect(tokenKnights(g)).toHaveLength(1);
    g.expect.stack([`${KNIGHT} (ability)`]);
    g.passAll();
    g.expect.life(0, 42);
  });

  test('the answer must be exactly one of the duplicates', () => {
    const g = board();
    castMirror(g);
    const token = tokenKnights(g)[0]?.id as ObjectId;
    const original = g.id('original');
    const before = g.hash();
    for (const objects of [[], [original, token], [g.id('Island[0]')]]) {
      const r = g.act(0).try.action({ kind: 'choosePermanents', objects });
      expect(r.ok, JSON.stringify(objects)).toBe(false);
    }
    g.expect.hash(before);
    // The other seat cannot answer for the controller.
    expect(g.act(1).try.action({ kind: 'choosePermanents', objects: [token] }).ok).toBe(false);
  });

  test('the legal actions are exactly the single choices', () => {
    const g = board();
    castMirror(g);
    const choices = g
      .legalActions(0)
      .flatMap((a) => (a.kind === 'choosePermanents' ? [a.objects] : []));
    const d = choosePermanentDecision(g);
    expect(choices.map((c) => c.length)).toEqual([1, 1]);
    expect(choices.flat().sort()).toEqual([...d.legal].sort());
    expect(g.legalActions(0).map((a) => a.kind)).toContain('concede');
    expect(g.legalActions(1)).toEqual([]);
  });

  test('a player with the rule applied gets priority afterwards, with the dies trigger on the stack', () => {
    const g = board();
    castMirror(g);
    g.act(0).choosePermanents('original');
    g.expect.pending('priority', 0);
  });
});

describe('SPEC scenario 14: when the rule does not apply', () => {
  test('the same name under different controllers is fine (CR 704.5j: "controlled by the same player")', () => {
    const g = scenario()
      .seat(0)
      .battlefield(KNIGHT)
      .seat(1)
      .hand(MIRROR)
      .battlefield('Island', 'Island')
      .define(knight)
      .define(mirrorImage)
      .build();
    g.act(0).pass();
    g.act(1).cast(MIRROR, { targets: [KNIGHT], pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    expect(g.find({ name: KNIGHT, zone: 'battlefield' })).toHaveLength(2);
    g.expect.noEvent({ kind: 'legendRule' });
  });

  test('a copy of a nonlegendary creature is fine', () => {
    const g = scenario()
      .seat(0)
      .hand(MIRROR)
      .battlefield('Island', 'Island', BEARS)
      .define(mirrorImage)
      .seat(1)
      .build();
    castMirror(g, BEARS);
    g.expect.pending('priority', 0);
    expect(g.find({ name: BEARS, zone: 'battlefield' })).toHaveLength(2);
  });

  test('two different legendary permanents are fine', () => {
    const g = scenario()
      .seat(0)
      .battlefield(KNIGHT, RIVAL)
      .define(knight)
      .define(rival)
      .seat(1)
      .build({ settle: true });
    g.expect.pending('priority', 0);
    expect(g.find({ name: KNIGHT, zone: 'battlefield' })).toHaveLength(1);
    expect(g.find({ name: RIVAL, zone: 'battlefield' })).toHaveLength(1);
  });
});

describe('SPEC scenario 14: other ways to get two of them', () => {
  test('casting a second copy of the legendary card (CR 704.5j)', () => {
    const g = scenario()
      .seat(0)
      .hand(KNIGHT, { label: 'second' })
      .battlefield('Plains', 'Plains', 'Plains')
      .battlefield(KNIGHT, { label: 'original' })
      .define(knight)
      .seat(1)
      .build();
    g.act(0).cast('second', { pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    const d = choosePermanentDecision(g);
    expect(d.legal).toHaveLength(2);
    g.act(0).choosePermanents('original');
    // The older Knight stays, the one just cast goes to its owner's graveyard and triggers.
    expect(g.object('original').zone).toBe('battlefield');
    g.expect.zone(KNIGHT, 'graveyard', { seat: 0, count: 1 });
  });

  test('three of them: the player keeps one and the other two leave together', () => {
    const g = scenario()
      .seat(0)
      .battlefield(KNIGHT, { label: 'k1' })
      .battlefield(KNIGHT, { label: 'k2' })
      .battlefield(KNIGHT, { label: 'k3' })
      .define(knight)
      .seat(1)
      .build({ settle: true });
    g.expect.pending('choosePermanent', 0);
    expect(choosePermanentDecision(g).legal).toHaveLength(3);
    const mark = g.mark();
    g.act(0).choosePermanents('k2');
    expect(g.object('k2').zone).toBe('battlefield');
    expect(g.object('k1').zone).toBe('graveyard');
    expect(g.object('k3').zone).toBe('graveyard');
    g.expect.zone(KNIGHT, 'graveyard', { seat: 0, count: 2 });
    // Both leave at once and both trigger (CR 603.10a); they are two sources, so the controller
    // orders them (CR 603.3b).
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.expect.stack([`${KNIGHT} (ability)`, `${KNIGHT} (ability)`]);
    g.expect.eventLog([{ kind: 'legendRule', kept: g.id('k2') }], { since: mark });
    g.passAll();
    g.expect.life(0, 44);
  });

  test('becomes a copy: a creature that becomes a copy of a legend is the second legend (CR 613.2a, 707.2)', () => {
    const g = scenario()
      .seat(0)
      .hand(SHIFT)
      .battlefield('Island', 'Island', BEARS)
      .battlefield(KNIGHT, { label: 'original' })
      .define(knight)
      .define(shapeshift)
      .seat(1)
      .build();
    g.act(0).cast(SHIFT, { targets: [BEARS, 'original'], pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    const d = choosePermanentDecision(g);
    const bears = g.find({ name: KNIGHT, zone: 'battlefield' }).filter((o) => o.card !== null);
    expect(d.legal).toHaveLength(2);
    expect(bears).toHaveLength(2);
    // Keep the Grizzly Bears card that became a Knight: the original Knight leaves.
    const shifted = bears.find((o) => o.id !== g.id('original'));
    g.act(0).choose({ kind: 'choosePermanents', objects: [shifted?.id as ObjectId] });
    g.expect.zone(KNIGHT, 'graveyard', { seat: 0, count: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('two duplicated names are asked one after the other', () => {
    const g = scenario()
      .seat(0)
      .battlefield(KNIGHT, { label: 'k1' })
      .battlefield(KNIGHT, { label: 'k2' })
      .battlefield(RIVAL, { label: 'r1' })
      .battlefield(RIVAL, { label: 'r2' })
      .define(knight)
      .define(rival)
      .seat(1)
      .build({ settle: true });
    g.expect.pending('choosePermanent', 0);
    expect(new Set(choosePermanentDecision(g).legal)).toEqual(new Set([g.id('k1'), g.id('k2')]));
    g.act(0).choosePermanents('k2');
    g.expect.pending('choosePermanent', 0);
    expect(new Set(choosePermanentDecision(g).legal)).toEqual(new Set([g.id('r1'), g.id('r2')]));
    g.act(0).choosePermanents('r1');
    expect(g.object('k2').zone).toBe('battlefield');
    expect(g.object('r1').zone).toBe('battlefield');
    expect(g.object('k1').zone).toBe('graveyard');
    g.expect.pending('priority', 0);
  });

  test('each controller of duplicates answers for their own', () => {
    const g = scenario()
      .seat(0)
      .battlefield(KNIGHT, { label: 'a1' })
      .battlefield(KNIGHT, { label: 'a2' })
      .seat(1)
      .battlefield(KNIGHT, { label: 'b1' })
      .battlefield(KNIGHT, { label: 'b2' })
      .define(knight)
      .build({ settle: true });
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents('a1');
    g.expect.pending('choosePermanent', 1);
    g.act(1).choosePermanents('b2');
    expect(g.object('a1').zone).toBe('battlefield');
    expect(g.object('b2').zone).toBe('battlefield');
  });
});

describe('SPEC scenario 14: determinism', () => {
  test('the same actions give the same state hash', () => {
    const play = () => {
      const g = board();
      castMirror(g);
      g.act(0).choosePermanents('original');
      g.passAll();
      return g.hash();
    };
    expect(play()).toBe(play());
  });
});
