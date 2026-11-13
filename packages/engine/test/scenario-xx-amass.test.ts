// "Amass Zombies N" (CR 701.47a, D-1120, group 4 of the Hashaton deck): if you don't control an Army creature, create a 0/0 black Zombie Army creature token; choose an
// Army creature you control; put N +1/+1 counters on it; if it isn't a Zombie, it becomes a Zombie in addition to its other types.
// Pins: CR 701.47a (the four steps and the creature type that stays), CR 701.47b (a player amassed even when nothing could be done), CR 111.4 (a token is named for its
// subtypes), CR 614.1a and 616.1 (the replacement effects of the token's creation, and the order question they ask), CR 704.3 (the 0/0 token is not seen by the
// state-based actions before its counters), CR 205.1b and 613.1d (the type in addition to the others, in layer 4), CR 611.2a (it has no end), CR 608.2h (X is read as
// the effect resolves), CR 702.11b and 702.111b (hexproof and menace of the static of the Hashaton Overseer).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-hashaton-group-4.ts).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { getView, syntheticCard, validateCard } from '../src/index';
import { expireEndOfTurnEffects } from '../src/rules/continuous';
import { derive } from '../src/rules/derive';
import { scenario } from '../src/testing/index';
import { chooseOptionDecision, choosePermanentDecision } from './pending-helpers';

const RITE = 'SYNTHETIC Amass Rite'; // {1}{B} sorcery: amass Zombies 2
const ORCS = 'SYNTHETIC Amass Orcs Rite'; // {1}{B} sorcery: amass Orcs 1
const X_RITE = 'SYNTHETIC Amass X Rite'; // {X}{B} sorcery: amass Zombies X
const WATCHER = 'SYNTHETIC Amass Watcher'; // {2}{B} 1/3 Zombie Wizard: when it enters, amass Zombies 2
const ORC_ARMY = 'SYNTHETIC Orc Army Veteran'; // {2} 2/2 Orc Army creature card
const SOLDIER_ARMY = 'SYNTHETIC Soldier Army Recruit'; // {2} 1/1 Soldier Army creature card
const WARDER = 'SYNTHETIC Zombie Warder';
const ZOMBIE_TOKENS = { subtypes: ['Zombie'], token: true, controller: 'you' } as const;
/**
 * "Zombie tokens you control have hexproof and menace." (two statics: the engine grants one keyword each). Defined here and not in the fixtures: the derive digests build
 * their decks from every synthetic card with a `grantKeyword` static, so a fixture of this shape would change them.
 */
const WARDER_CARD = singleFace({
  name: WARDER,
  manaCost: ['1', 'B'],
  types: ['creature'],
  subtypes: ['Zombie', 'Wizard'],
  colors: ['B'],
  colorIdentity: ['B'],
  power: 1,
  toughness: 3,
  oracleText: 'Zombie tokens you control have hexproof and menace.',
  abilities: (['hexproof', 'menace'] as const).map((keyword) => ({
    kind: 'static' as const,
    static: {
      kind: 'grantKeyword' as const,
      subject: { kind: 'filter' as const, filter: ZOMBIE_TOKENS },
      keyword: { kind: keyword },
    },
  })),
});
const RECRUITER = 'SYNTHETIC Army Recruiter'; // creature tokens you create: plus an additional 0/0 Orc Army token
const SOLDIER_MAKER = 'SYNTHETIC Soldier Maker'; // creature tokens you create: that many 1/1 Soldier tokens instead
const BOLT = 'Lightning Bolt';
const ARMY = 'Army';

type Game = ReturnType<ReturnType<ReturnType<typeof scenario>['seat']>['build']>;

const swamps = (n: number) => Array.from({ length: n }, () => 'Swamp');

/** Seat 0 in a precombat main phase with `hand` and `lands` Swamps; `board` is on the battlefield already. */
function start(hand: readonly string[], board: readonly string[] = [], lands = 4): Game {
  return scenario()
    .define(WARDER_CARD)
    .seat(0)
    .library('Island', { count: 4 })
    .hand(...hand)
    .battlefield(...swamps(lands), ...board)
    .seat(1)
    .library('Island', { count: 4 })
    .build();
}

const permanents = (g: Game, seat: 0 | 1 = 0) =>
  getView(g.state, seat).battlefield.filter((o) => o.controller === seat);
const armies = (g: Game, seat: 0 | 1 = 0) =>
  permanents(g, seat).filter((o) => o.subtypes.includes(ARMY));
const tokens = (g: Game, seat: 0 | 1 = 0) => permanents(g, seat).filter((o) => o.isToken);

describe('the cards are valid', () => {
  test('the static of the Overseer, defined in this file', () => {
    expect(validateCard(WARDER_CARD)).toEqual([]);
  });

  test.each([RITE, ORCS, X_RITE, WATCHER, ORC_ARMY, SOLDIER_ARMY, RECRUITER, SOLDIER_MAKER])(
    '%s',
    (name) => {
      expect(validateCard(syntheticCard(name))).toEqual([]);
    },
  );
});

describe('with no Army creature (CR 701.47a)', () => {
  test('a 0/0 black Zombie Army creature token is created and gets the counters, and it is not killed in between (CR 704.3)', () => {
    const g = start([RITE]);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    const [army, ...others] = armies(g);
    expect(others).toEqual([]);
    expect(army).toMatchObject({
      name: 'Zombie Army',
      isToken: true,
      types: ['creature'],
      colors: ['B'],
      power: 2,
      toughness: 2,
      counters: { '+1/+1': 2 },
    });
    expect(army?.subtypes).toEqual(['Zombie', 'Army']);
    g.expect.eventLog([
      { kind: 'tokenCreated', name: 'Zombie Army' },
      { kind: 'counterAdded', counter: '+1/+1', count: 2 },
    ]);
    g.expect.invariants();
  });

  test('another creature type makes a token of that type: "amass Orcs 1"', () => {
    const g = start([ORCS]);
    g.act(0).cast(ORCS, { pay: true });
    g.passAll();
    const [army] = armies(g);
    expect(army).toMatchObject({ name: 'Orc Army', power: 1, toughness: 1 });
    expect(army?.subtypes).toEqual(['Orc', 'Army']);
  });

  test('an Army creature another player controls is not yours: you create your own (CR 701.47a)', () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 4 })
      .hand(RITE)
      .battlefield(...swamps(2))
      .seat(1)
      .library('Island', { count: 4 })
      .battlefield(ORC_ARMY)
      .build();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    expect(armies(g, 0)).toHaveLength(1);
    expect(armies(g, 0)[0]?.isToken).toBe(true);
    // The opponent's Army has no counters and is not a Zombie.
    expect(armies(g, 1)[0]).toMatchObject({ counters: {}, subtypes: ['Orc', 'Army'] });
  });

  test('the trigger of a creature that enters amasses the same way (the shape of the real card)', () => {
    const g = start([WATCHER]);
    g.act(0).cast(WATCHER, { pay: true });
    g.passAll();
    g.passAll();
    expect(armies(g)).toHaveLength(1);
    expect(armies(g)[0]).toMatchObject({ name: 'Zombie Army', power: 2, toughness: 2 });
    g.expect.invariants();
  });

  test('X is read as the effect resolves (CR 608.2h)', () => {
    const g = start([X_RITE], [], 5);
    g.act(0).cast(X_RITE).x(3).pay();
    g.passAll();
    expect(armies(g)[0]).toMatchObject({ power: 3, toughness: 3, counters: { '+1/+1': 3 } });
  });
});

describe('with one Army creature (CR 701.47a)', () => {
  test('no token is created: the counters go on the Army, which becomes a Zombie in addition to its other types (CR 205.1b)', () => {
    const g = start([RITE], [ORC_ARMY]);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    expect(tokens(g)).toEqual([]);
    expect(armies(g)).toHaveLength(1);
    g.expect.counters(ORC_ARMY, { '+1/+1': 2 });
    g.expect.derived(ORC_ARMY, { types: ['creature'], subtypes: ['Orc', 'Army', 'Zombie'] });
    g.expect.pt(ORC_ARMY, 4, 4);
    g.expect.noEvent({ kind: 'tokenCreated' });
  });

  test('the type has no end: it is still there after the end-of-turn effects are gone (CR 611.2a, 514.2)', () => {
    const g = start([RITE], [ORC_ARMY]);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    const cleaned = expireEndOfTurnEffects(g.state).state;
    const orc = cleaned.objects[g.id(ORC_ARMY)];
    expect(orc).toBeDefined();
    if (orc === undefined) return;
    expect(derive(cleaned, orc).subtypes).toEqual(['Orc', 'Army', 'Zombie']);
  });

  test('an Army that is a Zombie already gets no second type, only the counters: amassing twice grows one token', () => {
    const g = start([RITE, RITE], [], 4);
    g.act(0).cast({ name: RITE, nth: 0 }, { pay: true });
    g.passAll();
    const effectsAfterFirst = g.state.continuousEffects.length;
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    expect(tokens(g)).toHaveLength(1);
    expect(armies(g)[0]).toMatchObject({ power: 4, toughness: 4, counters: { '+1/+1': 4 } });
    expect(g.state.continuousEffects.length).toBe(effectsAfterFirst);
  });

  test('a different creature type is added to the types of a token as well: amass Orcs on a Zombie Army', () => {
    const g = start([RITE, ORCS], [], 4);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.act(0).cast(ORCS, { pay: true });
    g.passAll();
    expect(armies(g)).toHaveLength(1);
    expect(armies(g)[0]?.subtypes).toEqual(['Zombie', 'Army', 'Orc']);
    expect(armies(g)[0]).toMatchObject({ power: 3, toughness: 3 });
  });
});

describe('with two Army creatures: the controller chooses (CR 701.47a)', () => {
  test('the question names every Army the controller has, and only the chosen one gets the counters and the type', () => {
    const g = start([RITE], [ORC_ARMY, SOLDIER_ARMY]);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    const d = choosePermanentDecision(g);
    expect(d.purpose).toBe('amass');
    expect(d.seat).toBe(0);
    expect(d.min).toBe(1);
    expect(d.max).toBe(1);
    expect(d.legal).toHaveLength(2);
    // Nothing has changed yet.
    g.expect.counters(ORC_ARMY, {});
    g.act(0).choosePermanents(SOLDIER_ARMY);
    g.expect.counters(SOLDIER_ARMY, { '+1/+1': 2 });
    g.expect.derived(SOLDIER_ARMY, { subtypes: ['Soldier', 'Army', 'Zombie'] });
    g.expect.counters(ORC_ARMY, {});
    g.expect.derived(ORC_ARMY, { subtypes: ['Orc', 'Army'] });
    g.expect.noEvent({ kind: 'tokenCreated' });
    g.expect.invariants();
  });

  test('an answer that is not one of the Armies is refused', () => {
    const g = start([RITE], [ORC_ARMY, SOLDIER_ARMY, WARDER]);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    expect(g.act(0).try.action({ kind: 'choosePermanents', objects: [g.id(WARDER)] }).ok).toBe(
      false,
    );
    g.expect.pending('choosePermanent', 0);
  });
});

describe('the token is made as any token is: the replacement effects of its creation apply (CR 614.1a)', () => {
  test('"those tokens plus an additional Orc Army token": two Armies, one chosen (the token the effect made may be chosen)', () => {
    const g = start([RITE], [RECRUITER]);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    const d = choosePermanentDecision(g);
    expect(d.purpose).toBe('amass');
    expect(d.legal).toHaveLength(2);
    expect(armies(g)).toHaveLength(2);
    g.act(0).choosePermanents({ name: 'Zombie Army' });
    // The Army with no counters is a 0/0 and dies as state-based actions are checked (CR 704.5f).
    expect(armies(g)).toHaveLength(1);
    expect(armies(g)[0]).toMatchObject({ name: 'Zombie Army', power: 2, toughness: 2 });
    g.expect.invariants();
  });

  test('the other token may be the one chosen: it becomes a Zombie too and keeps its other type', () => {
    const g = start([RITE], [RECRUITER]);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.act(0).choosePermanents({ name: 'Orc Army' });
    expect(armies(g)).toHaveLength(1);
    expect(armies(g)[0]?.name).toBe('Orc Army');
    expect(armies(g)[0]?.subtypes).toEqual(['Orc', 'Army', 'Zombie']);
    expect(armies(g)[0]).toMatchObject({ power: 2, toughness: 2 });
  });

  test('"that many Soldier tokens instead": no Army is made, so there is nothing to choose and nothing happens, and the game goes on (CR 701.47b)', () => {
    const g = start([RITE], [SOLDIER_MAKER]);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    expect(armies(g)).toEqual([]);
    const soldiers = tokens(g);
    expect(soldiers).toHaveLength(1);
    expect(soldiers[0]).toMatchObject({ name: 'Soldier', power: 1, toughness: 1, counters: {} });
    g.expect.noEvent({ kind: 'counterAdded' });
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  describe('two replacement effects whose order matters: the controller is asked, and the answer is kept as the instruction runs again (CR 616.1)', () => {
    const asked = () => {
      const g = start([RITE], [RECRUITER, SOLDIER_MAKER]);
      g.act(0).cast(RITE, { pay: true });
      g.passAll();
      const q = chooseOptionDecision(g);
      expect(q.purpose).toBe('replacement');
      expect(q.replacement?.choices.map((c) => c.objectName)).toEqual([RECRUITER, SOLDIER_MAKER]);
      // Nothing has been made while the question waits.
      expect(tokens(g)).toEqual([]);
      return { g, q };
    };

    test('the Orc Army token first: the Soldier replacement then replaces both tokens, so no Army is made and nothing is chosen', () => {
      const { g, q } = asked();
      g.act(0).chooseOption(q.options[0] as string);
      g.expect.pending('priority', 0);
      expect(armies(g)).toEqual([]);
      expect(tokens(g).map((t) => t.name)).toEqual(['Soldier', 'Soldier']);
      g.expect.noEvent({ kind: 'counterAdded' });
      g.expect.invariants();
    });

    test('the Soldier replacement first: the Orc Army token is added after it, so exactly one Army is made, gets the counters and the type', () => {
      const { g, q } = asked();
      g.act(0).chooseOption(q.options[1] as string);
      g.expect.pending('priority', 0);
      expect(armies(g)).toHaveLength(1);
      expect(armies(g)[0]).toMatchObject({ name: 'Orc Army', power: 2, toughness: 2 });
      expect(armies(g)[0]?.subtypes).toEqual(['Orc', 'Army', 'Zombie']);
      expect(
        tokens(g)
          .map((t) => t.name)
          .sort(),
      ).toEqual(['Orc Army', 'Soldier']);
      g.expect.invariants();
    });
  });
});

describe('the static of the Overseer: Zombie tokens you control have hexproof and menace (CR 702.11b, 702.111b)', () => {
  test('the token amass makes has both keywords; a Zombie that is not a token, and an Army that is not a Zombie, have neither', () => {
    const g = start([RITE], [WARDER, ORC_ARMY], 2);
    // Warder is a Zombie Wizard creature card (no token): no keywords. The Orc Army gets the counters and becomes a Zombie, but is no token.
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.derived(WARDER, { keywords: [] });
    g.expect.derived(ORC_ARMY, { keywords: [] });
  });

  test('a Zombie Army token gets hexproof and menace; the opponent cannot target it', () => {
    const g = scenario()
      .define(WARDER_CARD)
      .seat(0)
      .library('Island', { count: 4 })
      .hand(RITE)
      .battlefield(...swamps(2), WARDER)
      .seat(1)
      .library('Island', { count: 4 })
      .hand(BOLT)
      .battlefield('Mountain')
      .build();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.derived('Zombie Army', { keywords: ['hexproof', 'menace'] });
    g.act(0).pass();
    g.act(1).cast(BOLT);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    const legal = d.specs[0]?.legal ?? [];
    const token = tokens(g)[0];
    expect(legal.some((t) => t.kind === 'object' && t.id === token?.id)).toBe(false);
    expect(legal.some((t) => t.kind === 'object' && t.id === g.id(WARDER))).toBe(true);
  });

  test("another player's Zombie tokens are not yours: the static gives them nothing", () => {
    const g = scenario()
      .define(WARDER_CARD)
      .seat(0)
      .library('Island', { count: 4 })
      .hand(RITE)
      .battlefield(...swamps(2))
      .seat(1)
      .library('Island', { count: 4 })
      .battlefield(WARDER)
      .build();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.derived('Zombie Army', { keywords: [] });
  });
});
