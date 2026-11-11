// Scenario 17 (SPEC 12): layers. A 2/2 with a +1/+1 counter gets Giant Growth, then Turn to Frog.
// It is a 5/5 Frog with no abilities (base 1/1 set in layer 7b; Giant Growth and the counter apply
// in 7c).
// Pins: CR 613.1 (the layers apply in order: 4 types, 5 colors, 6 abilities, 7 power and toughness),
// CR 613.4b (layer 7b: effects that set power and toughness), CR 613.4c (layer 7c: counters and
// effects that modify power and toughness), CR 613.7 and 613.7b (within a layer, timestamp order; an
// effect from a resolving spell gets its timestamp when it is created), CR 613.7a and 613.7e (a
// static ability has the timestamp of its permanent, an Equipment gets a new one each time it
// becomes attached), CR 613.1f (a permanent that loses all abilities loses its static abilities
// too; an ability granted later still applies), CR 205.1a and 205.3d (a "becomes a Frog" effect
// replaces the creature types, an effect that makes it an artifact removes them), CR 105.3 (a new
// color replaces the old ones), CR 208.3 (a noncreature permanent has no power or toughness),
// CR 611.2a and 514.2 (until end of turn, ended at cleanup), CR 611.2c (the affected set is fixed
// when the effect begins).
// Not modelled, and so not tested: dependencies between effects (CR 613.8), layers 1 to 3 (copy,
// control, text) and 7a and 7d.
// Cards: Giant Growth and Turn to Frog use their real names and are written from the text below,
// which comes from memory and is UNVERIFIED against Scryfall (so is the mana cost of Turn to
// Frog); everything else is SYNTHETIC and defined in this file or in src/cards/fixtures.
import { describe, expect, test } from 'vitest';
import type { Effect, ObjectRef, TargetSpec } from '../src/ast/types';
import { singleFace } from '../src/cards/fixtures/helpers';
import { applyAction, type CardDefinition, getLegalActions } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const GROWTH = 'Giant Growth';
const FROG = 'Turn to Frog';
const BEAR = 'SYNTHETIC Layered Bear';
const WINGS = 'SYNTHETIC Gust of Wings';
const BIGGER = 'SYNTHETIC Embiggen';
const RUST = 'SYNTHETIC Rust';
const PAINT = 'SYNTHETIC Paint It Red';
const HUSH = 'SYNTHETIC Mass Hush';
const FROG_LORD = 'SYNTHETIC Frog Lord';
const BEARS = 'Grizzly Bears';
const BEARER = 'SYNTHETIC Standard Bearer';
const BOOTS = 'SYNTHETIC Wing Boots';

const TARGET_CREATURE: readonly TargetSpec[] = [
  { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } } },
];
const T1: ObjectRef = { kind: 'target', id: 't1' };

const spell = (
  name: string,
  cost: string[],
  color: 'G' | 'U' | 'R',
  text: string,
  effect: Effect,
) =>
  singleFace({
    name,
    manaCost: cost,
    types: ['instant'],
    colors: [color],
    colorIdentity: [color],
    oracleText: text,
    spell: { targets: TARGET_CREATURE, effect },
  });

// Real card, text from memory (UNVERIFIED): {G} instant, "Target creature gets +3/+3 until end of turn."
const giantGrowth = spell(GROWTH, ['G'], 'G', 'Target creature gets +3/+3 until end of turn.', {
  kind: 'modifyPt',
  objects: T1,
  power: 3,
  toughness: 3,
  duration: 'untilEndOfTurn',
});

// Real card, text and cost from memory (UNVERIFIED): "Target creature loses all abilities and
// becomes a blue Frog with base power and toughness 1/1 until end of turn."
const turnToFrog = spell(
  FROG,
  ['1', 'U'],
  'U',
  'Target creature loses all abilities and becomes a blue Frog with base power and toughness 1/1 until end of turn.',
  {
    kind: 'sequence',
    effects: [
      { kind: 'loseAllAbilities', objects: T1, duration: 'untilEndOfTurn' },
      { kind: 'setTypes', objects: T1, subtypes: ['Frog'], duration: 'untilEndOfTurn' },
      { kind: 'setColors', objects: T1, colors: ['U'], duration: 'untilEndOfTurn' },
      { kind: 'setPt', objects: T1, power: 1, toughness: 1, duration: 'untilEndOfTurn' },
    ],
  },
);

const wings = spell(WINGS, ['U'], 'U', 'Target creature gains flying until end of turn.', {
  kind: 'grantKeyword',
  objects: T1,
  keyword: { kind: 'flying' },
  duration: 'untilEndOfTurn',
});

const embiggen = spell(
  BIGGER,
  ['U'],
  'U',
  'Target creature has base power and toughness 4/4 until end of turn.',
  { kind: 'setPt', objects: T1, power: 4, toughness: 4, duration: 'untilEndOfTurn' },
);

const rust = spell(RUST, ['U'], 'U', 'Target creature becomes an artifact until end of turn.', {
  kind: 'setTypes',
  objects: T1,
  types: ['artifact'],
  duration: 'untilEndOfTurn',
});

const paint = spell(PAINT, ['R'], 'R', 'Target creature becomes red until end of turn.', {
  kind: 'setColors',
  objects: T1,
  colors: ['R'],
  duration: 'untilEndOfTurn',
});

const hush = singleFace({
  name: HUSH,
  manaCost: ['1', 'U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'Creatures lose all abilities until end of turn.',
  spell: {
    effect: {
      kind: 'loseAllAbilities',
      objects: { kind: 'each', filter: { types: ['creature'] } },
      duration: 'untilEndOfTurn',
    },
  },
});

/** 2/2 with flying, an attack trigger and a {T} ability: abilities of three kinds to lose. */
const bear = singleFace({
  name: BEAR,
  manaCost: ['1', 'G'],
  types: ['creature'],
  subtypes: ['Bear'],
  colors: ['G'],
  colorIdentity: ['G'],
  power: 2,
  toughness: 2,
  oracleText: 'Flying. Whenever this creature attacks, you gain 1 life. {T}: You gain 1 life.',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'flying' } },
    {
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
    },
    {
      kind: 'activated',
      cost: [{ kind: 'tap' }],
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
    },
  ],
});

/** Frogs you control get +2/+2: matched on what a creature is after layer 4. */
const frogLord = singleFace({
  name: FROG_LORD,
  manaCost: ['1', 'U'],
  types: ['creature'],
  subtypes: ['Merfolk'],
  colors: ['U'],
  colorIdentity: ['U'],
  power: 1,
  toughness: 1,
  oracleText: 'Frogs you control get +2/+2.',
  abilities: [
    {
      kind: 'static',
      static: {
        kind: 'modifyPt',
        subject: { kind: 'filter', filter: { subtypes: ['Frog'], controller: 'you' } },
        power: 2,
        toughness: 2,
      },
    },
  ],
});

const CARDS: readonly CardDefinition[] = [
  giantGrowth,
  turnToFrog,
  bear,
  wings,
  embiggen,
  rust,
  paint,
  hush,
  frogLord,
];

/** Seat 0 owns the creatures; seat 1 holds the spells and plenty of mana. */
function board(configure?: (b: ReturnType<typeof scenario>) => void) {
  const b = scenario().seat(0).hand(GROWTH).battlefield('Forest', 'Forest', 'Forest', 'Forest');
  b.battlefield(BEAR, { label: 'bear', counters: { '+1/+1': 1 } });
  b.library('Forest', 'Forest', 'Forest');
  b.seat(1).hand(FROG, WINGS, BIGGER, RUST, PAINT, HUSH);
  b.battlefield('Island', 'Island', 'Island', 'Island', 'Island', 'Island', 'Mountain');
  b.library('Forest', 'Forest', 'Forest');
  for (const card of CARDS) b.define(card);
  b.seat(0);
  configure?.(b);
  return b.build();
}

/** Seat 0 casts `card` at `target` and everything on the stack resolves. */
function castBy0(g: ScenarioGame, card: string, target: string): void {
  g.act(0).cast(card, { targets: [target], pay: true });
  g.passAll();
}

/** Seat 1 casts `card` once seat 0 has passed priority, and everything on the stack resolves. */
function castBy1(g: ScenarioGame, card: string, target?: string): void {
  g.act(0).pass();
  g.act(1).cast(card, { ...(target === undefined ? {} : { targets: [target] }), pay: true });
  g.passAll();
}

describe('SPEC scenario 17: Giant Growth, then Turn to Frog (CR 613)', () => {
  test('before any spell it is a 3/3 green Bear with flying, a trigger and a {T} ability', () => {
    const g = board();
    g.expect.pt('bear', 3, 3);
    g.expect.derived('bear', {
      types: ['creature'],
      subtypes: ['Bear'],
      colors: ['G'],
      keywords: ['flying'],
    });
  });

  test('Giant Growth makes it 6/6 (+3/+3 over the 2/2 and the counter)', () => {
    const g = board();
    castBy0(g, GROWTH, 'bear');
    g.expect.pt('bear', 6, 6);
  });

  test('then Turn to Frog: a 5/5 blue Frog with no abilities (1/1 base in 7b, +1 counter and +3 in 7c)', () => {
    const g = board();
    castBy0(g, GROWTH, 'bear');
    castBy1(g, FROG, 'bear');
    g.expect.pt('bear', 5, 5);
    // CR 205.1a: "a Frog" replaces the creature types and leaves the card type alone; CR 105.3:
    // "blue" replaces green; CR 613.1f: no keyword is left.
    g.expect.derived('bear', {
      types: ['creature'],
      subtypes: ['Frog'],
      colors: ['U'],
      keywords: [],
    });
    const frog = g.object('bear');
    expect(frog.counters).toEqual({ '+1/+1': 1 });
  });

  test('the other order gives the same 5/5: layers decide, not timestamps (7b before 7c)', () => {
    const g = board();
    castBy1(g, FROG, 'bear');
    g.expect.pt('bear', 2, 2);
    castBy0(g, GROWTH, 'bear');
    g.expect.pt('bear', 5, 5);
    g.expect.derived('bear', { subtypes: ['Frog'], colors: ['U'], keywords: [] });
  });

  test('cast in response to Giant Growth, Turn to Frog resolves first and the result is the same', () => {
    const g = board();
    g.act(0).cast(GROWTH, { targets: ['bear'], pay: true });
    g.act(0).pass();
    g.act(1).cast(FROG, { targets: ['bear'], pay: true });
    g.expect.stack([FROG, GROWTH]);
    g.passAll();
    g.expect.pt('bear', 5, 5);
    g.expect.derived('bear', { subtypes: ['Frog'], colors: ['U'], keywords: [] });
  });

  test('it has no ability left to use: no {T} ability offered, no trigger when it attacks', () => {
    const g = board();
    castBy1(g, FROG, 'bear');
    const activations = getLegalActions(g.state, 0).filter((a) => a.kind === 'activate');
    expect(activations).toEqual([]);
    g.advanceTo('declareAttackers');
    g.act(0).attack('bear');
    g.expect.noEvent({ kind: 'abilityTriggered' });
    g.advanceTo('endOfCombat');
    g.expect.life(0, 40 - 0);
    g.expect.life(1, 40 - 2);
  });

  test('the control: without Turn to Frog it can use the {T} ability and its attack trigger gains life', () => {
    const g = board();
    expect(getLegalActions(g.state, 0).some((a) => a.kind === 'activate')).toBe(true);
    g.advanceTo('declareAttackers');
    g.act(0).attack('bear');
    g.passAll();
    g.expect.life(0, 41);
  });

  test('at cleanup every effect ends: a 3/3 green flying Bear again, nothing left in the state', () => {
    const g = board();
    castBy0(g, GROWTH, 'bear');
    castBy1(g, FROG, 'bear');
    expect(g.state.continuousEffects).toHaveLength(5);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt('bear', 3, 3);
    g.expect.derived('bear', {
      types: ['creature'],
      subtypes: ['Bear'],
      colors: ['G'],
      keywords: ['flying'],
    });
    expect(g.state.continuousEffects).toEqual([]);
  });

  test('Turn to Frog makes four effects, one per layer, with increasing timestamps', () => {
    const g = board();
    castBy1(g, FROG, 'bear');
    const effects = g.state.continuousEffects;
    expect(effects.map((e) => e.change.kind)).toEqual([
      'loseAllAbilities',
      'setTypes',
      'setColors',
      'setPt',
    ]);
    const stamps = effects.map((e) => e.timestamp);
    expect([...stamps].sort((a, b) => a - b)).toEqual(stamps);
    expect(new Set(stamps).size).toBe(4);
    expect(effects.map((e) => e.id)).toEqual(stamps.map((t) => `ce${t}`));
    for (const e of effects) {
      expect(e.objects).toEqual([g.id('bear')]);
      expect(e.until).toBe('endOfTurn');
    }
  });
});

describe('layer 7: set, then modify (CR 613.4b, 613.4c)', () => {
  test('a later set of base power and toughness keeps counters and pumps: 4/4 base + 1 + 3 = 8/8', () => {
    const g = board();
    castBy0(g, GROWTH, 'bear');
    castBy1(g, BIGGER, 'bear');
    g.expect.pt('bear', 8, 8);
  });

  test('an earlier one gives the same 8/8', () => {
    const g = board();
    castBy1(g, BIGGER, 'bear');
    g.expect.pt('bear', 5, 5);
    castBy0(g, GROWTH, 'bear');
    g.expect.pt('bear', 8, 8);
  });

  test('two set effects: the later timestamp wins, whichever spell is cast first (CR 613.7)', () => {
    const a = board();
    castBy1(a, FROG, 'bear');
    castBy1(a, BIGGER, 'bear');
    a.expect.pt('bear', 5, 5); // 4/4 set last, +1 counter
    const b = board();
    castBy1(b, BIGGER, 'bear');
    castBy1(b, FROG, 'bear');
    b.expect.pt('bear', 2, 2); // 1/1 set last, +1 counter
  });

  test('a -1/-1 counter lowers a set value too: 4/4 base - 1 = 3/3', () => {
    const g = board((b) => b.battlefield(BEARS, { label: 'cub', counters: { '-1/-1': 1 } }));
    g.expect.pt('cub', 1, 1);
    castBy1(g, BIGGER, 'cub');
    g.expect.pt('cub', 3, 3);
  });

  test('and a 1/1 base with a -1/-1 counter is 0/0, which dies as a state-based action (CR 704.5f)', () => {
    const g = board((b) => b.battlefield(BEARS, { label: 'cub', counters: { '-1/-1': 1 } }));
    castBy1(g, FROG, 'cub');
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(BEAR, 'battlefield', { seat: 0 });
  });
});

describe('layer 6: abilities (CR 613.1f, 613.7)', () => {
  test('an ability granted after "loses all abilities" still applies', () => {
    const g = board();
    castBy1(g, FROG, 'bear');
    g.expect.derived('bear', { keywords: [] });
    castBy1(g, WINGS, 'bear');
    g.expect.derived('bear', { keywords: ['flying'] });
  });

  test('an ability granted before it is removed: flying first, Turn to Frog second, none left', () => {
    const g = board((b) => b.battlefield(BEARS, { label: 'plain' }));
    castBy1(g, WINGS, 'plain');
    g.expect.derived('plain', { keywords: ['flying'] });
    castBy1(g, FROG, 'plain');
    g.expect.derived('plain', { keywords: [] });
  });

  test('a creature that gains flying by an effect is blocked only by flying or reach (combat sees it)', () => {
    const g = board((b) => {
      b.battlefield(BEARS, { label: 'attacker' });
      b.seat(1).battlefield(BEARS, { label: 'blocker' });
    });
    castBy1(g, WINGS, 'attacker');
    g.advanceTo('declareAttackers');
    g.act(0).attack('attacker');
    g.advanceTo('declareBlockers');
    // The only creature of seat 1 cannot block it, so seat 1 is not even asked to declare blockers.
    g.expect.step('declareBlockers');
    g.expect.pending('priority', 0);
    g.expect.combat({ attackers: ['attacker'] });
    g.expect.illegal(1, { declareBlockers: [{ blocker: 'blocker', attacker: 'attacker' }] });
  });

  test('the control: without the effect the same creature can be blocked', () => {
    const g = board((b) => {
      b.battlefield(BEARS, { label: 'attacker' });
      b.seat(1).battlefield(BEARS, { label: 'blocker' });
    });
    g.advanceTo('declareAttackers');
    g.act(0).attack('attacker');
    g.advanceTo('declareBlockers');
    g.expect.pending('declareBlockers', 1);
    g.expect.canBlock('blocker', 'attacker', true);
  });

  test('"each creature loses all abilities" is fixed when it resolves: a creature cast later keeps its abilities (CR 611.2c)', () => {
    const g = board((b) => b.seat(0).hand(BEAR));
    castBy1(g, HUSH);
    g.expect.derived('bear', { keywords: [] });
    g.act(0).cast(BEAR, { pay: true });
    g.passAll();
    const fresh = g.find({ name: BEAR, zone: 'battlefield' }).filter((o) => o.id !== g.id('bear'));
    expect(fresh).toHaveLength(1);
    g.expect.derived(fresh[0]?.id ?? 'none', { keywords: ['flying'] });
    g.expect.derived('bear', { keywords: [] });
  });
});

describe('layer 6: static abilities of permanents (CR 613.1f, 613.7a, 613.7e)', () => {
  test('a permanent that loses all abilities gives nothing: its anthem and flying grant stop', () => {
    const g = board((b) => b.battlefield(BEARER).battlefield(BEARS, { label: 'ally' }));
    g.expect.pt('ally', 3, 3);
    g.expect.derived('ally', { keywords: ['flying'] });
    castBy1(g, FROG, BEARER);
    g.expect.pt('ally', 2, 2);
    g.expect.derived('ally', { keywords: [] });
    // The Soldier is a 1/1 Frog now and gets nothing from itself ("other creatures").
    g.expect.pt(BEARER, 1, 1);
  });

  test('flying from an Equipment attached before Turn to Frog is lost with the rest', () => {
    const g = board((b) => {
      b.battlefield(BEARS, { label: 'host' });
      b.battlefield(BOOTS, { attachedTo: 'host' });
    });
    g.expect.derived('host', { keywords: ['flying', 'trample'] });
    castBy1(g, FROG, 'host');
    g.expect.derived('host', { keywords: [] });
  });

  test('re-attached later, the Equipment has a later timestamp than the effect, and its grants apply (CR 613.7e)', () => {
    const g = board((b) => {
      b.battlefield(BEARS, { label: 'host' });
      b.battlefield(BEARS, { label: 'spare' });
      b.battlefield(BOOTS, { attachedTo: 'host' });
    });
    castBy1(g, FROG, 'host');
    g.expect.derived('host', { keywords: [] });
    // Equip to the other creature and back: each attachment gets a new timestamp.
    g.act(0).activate(BOOTS, { targets: ['spare'], pay: true });
    g.passAll();
    g.expect.derived('spare', { keywords: ['flying', 'trample'] });
    g.expect.derived('host', { keywords: [] });
    g.act(0).activate(BOOTS, { targets: ['host'], pay: true });
    g.passAll();
    g.expect.derived('host', { keywords: ['flying', 'trample'] });
    g.expect.derived('spare', { keywords: [] });
  });
});

describe('layers 4 and 5: types, subtypes and colors (CR 613.1d, 613.1e)', () => {
  test('a "Frog" lord reads the subtypes after layer 4: the creature that became a Frog gets +2/+2', () => {
    const g = board((b) => b.battlefield(FROG_LORD));
    g.expect.pt('bear', 3, 3);
    castBy1(g, FROG, 'bear');
    // 1/1 base + counter + the lord's +2/+2 (a Frog without the lord is a 2/2, see above).
    g.expect.pt('bear', 4, 4);
    g.expect.derived('bear', { subtypes: ['Frog'] });
    g.expect.pt(FROG_LORD, 1, 1);
  });

  test('a Frog lord does not affect a creature that is not a Frog (the control)', () => {
    const g = board((b) => b.battlefield(FROG_LORD));
    g.expect.pt('bear', 3, 3);
    castBy1(g, WINGS, 'bear');
    g.expect.pt('bear', 3, 3);
  });

  test('a creature that becomes an artifact is no longer a creature: no types, subtypes or power (CR 205.1a, 208.3)', () => {
    const g = board();
    castBy1(g, RUST, 'bear');
    g.expect.derived('bear', { types: ['artifact'], subtypes: [] });
    const view = g.view(0).battlefield.find((o) => o.id === g.id('bear'));
    expect(view?.power).toBeNull();
    expect(view?.toughness).toBeNull();
    // It stays on the battlefield: toughness checks are for creatures (CR 704.5f).
    g.expect.zone(BEAR, 'battlefield', { seat: 0 });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived('bear', { types: ['creature'], subtypes: ['Bear'] });
    g.expect.pt('bear', 3, 3);
  });

  test('a new color replaces the old one (CR 105.3), and the last color effect wins', () => {
    const g = board();
    castBy1(g, PAINT, 'bear');
    g.expect.derived('bear', { colors: ['R'] });
    castBy1(g, FROG, 'bear');
    g.expect.derived('bear', { colors: ['U'] });
  });
});

describe('permanent duration, replay and legality', () => {
  test('an effect with no stated duration lasts past cleanup (CR 611.2a)', () => {
    const forever = singleFace({
      name: 'SYNTHETIC Forever Pump',
      manaCost: ['G'],
      types: ['instant'],
      colors: ['G'],
      colorIdentity: ['G'],
      oracleText: 'Target creature gets +1/+1.',
      spell: {
        targets: TARGET_CREATURE,
        effect: { kind: 'modifyPt', objects: T1, power: 1, toughness: 1, duration: 'permanent' },
      },
    });
    const g = board((b) => b.seat(0).hand(forever.name).define(forever));
    castBy0(g, forever.name, 'bear');
    expect(g.state.continuousEffects.map((e) => e.until)).toEqual(['permanent']);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt('bear', 4, 4);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt('bear', 4, 4);
  });

  test('replaying the action log on a fresh build reaches the identical state', () => {
    const play = (g: ScenarioGame) => {
      castBy0(g, GROWTH, 'bear');
      castBy1(g, FROG, 'bear');
      castBy1(g, WINGS, 'bear');
      g.advanceTo('upkeep', { turn: 'next' });
    };
    const first = board();
    play(first);
    let state = board().state;
    for (const { seat, action } of first.log) {
      const r = applyAction(state, seat, action);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    const again = board();
    play(again);
    expect(first.hash()).toBe(again.hash());
    expect(state).toEqual(first.state);
  });

  test('the spells are offered exactly when they can be cast, and applyAction agrees', () => {
    const g = board();
    g.act(0).pass();
    g.expect.legal(1, { cast: FROG });
    g.expect.legal(1, { cast: WINGS });
    const noMana = scenario()
      .seat(0)
      .battlefield(BEAR)
      .seat(1)
      .hand(FROG)
      .battlefield('Island')
      .define(turnToFrog)
      .define(bear)
      .build();
    noMana.act(0).pass();
    noMana.expect.illegal(1, { cast: FROG });
  });
});
