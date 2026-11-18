// First Flight statics (D-149), the Skybonder group: "Creatures you control with flying have \"Spells your opponents cast that target this creature cost {2} more to cast.\""
// Pins: CR 613.1f (layer 6: the grant gives an ability to the creatures that have flying once every grant of keywords has applied, whatever the order on the battlefield), CR 604.1
// and 113.6 (a static ability a permanent has, "this creature" being the permanent that has it), CR 601.2c and 601.2f (the targets are chosen before the total cost is determined, an
// increase of the cost is added to it before any reduction), CR 702.9a (flying), 611.3a (a static ability follows the board). Cards are SYNTHETIC: the AST is written by hand.
import { describe, expect, test } from 'vitest';
import type { Ability, Effect, ObjectRef, TargetSpec } from '../src/ast/types';
import { kw, singleFace } from '../src/cards/fixtures/helpers';
import { type CardDefinition, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const SKYBONDER = 'SYNTHETIC Sky Binder'; // 2/2 flying: creatures you control with flying have the tax
const SECOND = 'SYNTHETIC Second Binder'; // the same, a second source
const BIRD = 'SYNTHETIC Small Bird'; // 1/1 flying
const BEAR = 'SYNTHETIC Ground Bear'; // 2/2
const LORD = 'SYNTHETIC Wing Lord'; // creatures you control have flying
const GUST = 'SYNTHETIC Gust of Air'; // target creature gains flying until end of turn
const HUSH = 'SYNTHETIC Quiet Air'; // target creature loses all abilities until end of turn
const BOLT = 'Lightning Bolt'; // {R}: 3 damage to any target
const PAIR = 'SYNTHETIC Twin Bolt'; // {R}: 1 damage to each of two target creatures
const PINGER = 'SYNTHETIC Pinger'; // {T}: 1 damage to target creature

const filter = (f: object) => ({ kind: 'filter' as const, filter: f });
const TAX: Ability = {
  kind: 'static',
  static: {
    kind: 'costIncrease',
    spells: { controller: 'opponent', targetsObject: { isSource: true } },
    amount: 2,
  },
};
const grantTax = (
  subject: object = { types: ['creature'], controller: 'you', keywords: ['flying'] },
): Ability => ({
  kind: 'static',
  static: { kind: 'grantAbility', subject: filter(subject), ability: TAX as never },
});
const creature = (name: string, abilities: readonly Ability[], power = 2) =>
  singleFace({
    name,
    manaCost: ['1'],
    types: ['creature'],
    subtypes: ['Bird'],
    colors: ['U'],
    colorIdentity: ['U'],
    power,
    toughness: 2,
    oracleText: 'SYNTHETIC',
    abilities: [...abilities],
  });

const T1: ObjectRef = { kind: 'target', id: 't1' };
const T2: ObjectRef = { kind: 'target', id: 't2' };
const creatureTarget = (id: string): TargetSpec => ({
  id,
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
});
const spell = (name: string, mana: string, targets: readonly TargetSpec[], effect: Effect) =>
  singleFace({
    name,
    manaCost: [mana],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'SYNTHETIC',
    spell: { targets, effect },
  });

const skybonder = creature(SKYBONDER, [kw('flying'), grantTax()]);
const second = creature(SECOND, [kw('flying'), grantTax()]);
const bird = creature(BIRD, [kw('flying')], 1);
const bear = creature(BEAR, []);
const lord = creature(LORD, [
  {
    kind: 'static',
    static: {
      kind: 'grantKeyword',
      subject: filter({ types: ['creature'], controller: 'you' }),
      keyword: { kind: 'flying' },
    },
  },
]);
const gust = spell(GUST, 'U', [creatureTarget('t1')], {
  kind: 'grantKeyword',
  objects: T1,
  keyword: { kind: 'flying' },
  duration: 'untilEndOfTurn',
});
const hush = spell(HUSH, 'U', [creatureTarget('t1')], {
  kind: 'loseAllAbilities',
  objects: T1,
  duration: 'untilEndOfTurn',
});
const pair = spell(PAIR, 'R', [creatureTarget('t1'), creatureTarget('t2')], {
  kind: 'sequence',
  effects: [
    { kind: 'dealDamage', amount: 1, to: T1 },
    { kind: 'dealDamage', amount: 1, to: T2 },
  ],
});
const pinger = singleFace({
  name: PINGER,
  manaCost: ['1'],
  types: ['artifact'],
  colors: [],
  colorIdentity: [],
  oracleText: 'SYNTHETIC',
  abilities: [
    {
      kind: 'activated',
      cost: [{ kind: 'tap' }],
      targets: [creatureTarget('t1')],
      effect: { kind: 'dealDamage', amount: 1, to: T1 },
    },
  ],
});

const CARDS: readonly CardDefinition[] = [
  skybonder,
  second,
  bird,
  bear,
  lord,
  gust,
  hush,
  pair,
  pinger,
];

describe('the synthetic cards are valid', () => {
  test.each(CARDS.map((c) => [c.name, c] as const))('%s', (_name, card) => {
    const issues = validateCard(card);
    if (issues.length > 0) throw new Error(JSON.stringify(issues));
  });
});

/** Seat 1 is the active player with `lands` Mountains and the spells; seat 0 has the permanents named. */
function board(mine: readonly string[], lands: number, hand: readonly string[] = [BOLT]) {
  const b = scenario().seat(0);
  for (const card of CARDS) b.define(card);
  b.library('Island', 'Island', 'Island');
  for (const name of mine) b.battlefield(name, { label: name });
  return b
    .seat(1)
    .hand(...hand)
    .battlefield('Mountain', { count: lands })
    .library('Island', 'Island', 'Island')
    .at('precombatMain', { active: 1 })
    .build();
}

const bolt = (g: ScenarioGame, target: string) =>
  g.act(1).cast(BOLT, { targets: [target], pay: true });

describe('"Spells your opponents cast that target this creature cost {2} more to cast."', () => {
  test('a spell an opponent casts at a flyer I control costs {2} more: {R} plus {2}', () => {
    const g = board([SKYBONDER, BIRD], 2);
    expect(() => bolt(g, BIRD)).toThrow(/not a legal target|cannot pay/);
    const h = board([SKYBONDER, BIRD], 3);
    bolt(h, BIRD);
    h.passAll();
    h.expect.noObject(BIRD, { zone: 'battlefield' });
  });

  test('the Skybonder is a flyer too, so it taxes spells that target itself', () => {
    const g = board([SKYBONDER], 2);
    expect(() => bolt(g, SKYBONDER)).toThrow(/not a legal target|cannot pay/);
    const h = board([SKYBONDER], 3);
    bolt(h, SKYBONDER);
    h.passAll();
    h.expect.invariants();
  });

  test('a creature I control without flying is not taxed: one Mountain pays', () => {
    const g = board([SKYBONDER, BEAR], 1);
    bolt(g, BEAR);
    g.passAll();
    g.expect.noObject(BEAR, { zone: 'battlefield' });
  });

  test('a spell that targets a player is not taxed', () => {
    const g = board([SKYBONDER, BIRD], 1);
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.invariants();
  });

  test('my own spells are not taxed: seat 0 bolts its own flyer with one Mountain', () => {
    const b = scenario().seat(0);
    for (const card of CARDS) b.define(card);
    const g = b
      .hand(BOLT)
      .battlefield('Mountain')
      .battlefield(SKYBONDER)
      .battlefield(BIRD, { label: 'bird' })
      .library('Island', 'Island', 'Island')
      .seat(1)
      .library('Island', 'Island', 'Island')
      .at('precombatMain')
      .build();
    g.act(0).cast(BOLT, { targets: ['bird'], pay: true });
    g.passAll();
    g.expect.noObject('bird', { zone: 'battlefield' });
  });

  test('an opponent\'s flyer is not taxed by my Skybonder (it says "you control")', () => {
    const b = scenario().seat(0);
    for (const card of CARDS) b.define(card);
    b.library('Island', 'Island', 'Island').battlefield(SKYBONDER);
    const g = b
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .battlefield(BIRD, { label: 'foe' })
      .library('Island', 'Island', 'Island')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(BOLT, { targets: ['foe'], pay: true });
    g.passAll();
    g.expect.noObject('foe', { zone: 'battlefield' });
  });

  test('two Skybonders stack: the flyer is taxed {4}', () => {
    const g = board([SKYBONDER, SECOND, BIRD], 4);
    expect(() => bolt(g, BIRD)).toThrow(/not a legal target|cannot pay/);
    const h = board([SKYBONDER, SECOND, BIRD], 5);
    bolt(h, BIRD);
    h.passAll();
    h.expect.noObject(BIRD, { zone: 'battlefield' });
  });

  test('the tax is determined after the targets are chosen: the first slot offers only targets the caster can pay for (CR 601.2c, 601.2f)', () => {
    // One Mountain: the Bolt may be cast at a player or at the Bear but not at a flyer, which would cost {2} more.
    const g = board([SKYBONDER, BIRD, BEAR], 1);
    g.act(1).cast(BOLT);
    const pending = g.state.pending;
    if (pending?.kind !== 'targets') throw new Error('targets were not asked');
    const legal = pending.specs[0]?.legal ?? [];
    const objects = legal.flatMap((t) =>
      t.kind === 'object' ? [g.state.objects[t.id]?.card] : [],
    );
    expect(legal.some((t) => t.kind === 'player')).toBe(true);
    expect(objects).toHaveLength(1);
  });

  test('a creature that has flying only through another effect starts being taxed, and one that loses it stops', () => {
    // The Bear has no flying: the Gust costs {U} (one Island) and is not taxed. Once it resolved the Bear flies and is taxed.
    const b = scenario().seat(0);
    for (const card of CARDS) b.define(card);
    b.library('Island', 'Island', 'Island')
      .battlefield(SKYBONDER)
      .battlefield(BEAR, { label: 'bear' });
    const g = b
      .seat(1)
      .hand(GUST, BOLT)
      .battlefield('Island')
      .battlefield('Mountain', { count: 2 })
      .library('Island', 'Island', 'Island')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(GUST, { targets: ['bear'], pay: true });
    g.passAll();
    expect(() => g.act(1).cast(BOLT, { targets: ['bear'], pay: true })).toThrow(
      /not a legal target|cannot pay/,
    );
  });

  test('a flyer that loses flying stops being taxed (CR 613.1f)', () => {
    const b = scenario().seat(0);
    for (const card of CARDS) b.define(card);
    const g = b
      .hand(HUSH)
      .battlefield('Island')
      .battlefield(SKYBONDER)
      .battlefield(BIRD, { label: 'bird' })
      .library('Island', 'Island', 'Island')
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .library('Island', 'Island', 'Island')
      .at('precombatMain')
      .build();
    // Seat 0 (its own spell, not taxed) takes the flying off its Bird; seat 1 then Bolts it for {R} alone.
    g.act(0).cast(HUSH, { targets: ['bird'], pay: true });
    g.passAll();
    g.expect.derived('bird', { keywords: [] });
    g.pass(0);
    g.act(1).cast(BOLT, { targets: ['bird'], pay: true });
    g.passAll();
    g.expect.noObject('bird', { zone: 'battlefield' });
  });

  test('the grant reads flying from a grant that comes later on the battlefield (CR 613.1f)', () => {
    const g = board([SKYBONDER, BEAR, LORD], 2);
    expect(() => bolt(g, BEAR)).toThrow(/not a legal target|cannot pay/);
    const first = board([LORD, SKYBONDER, BEAR], 2);
    expect(() => bolt(first, BEAR)).toThrow(/not a legal target|cannot pay/);
    const h = board([SKYBONDER, BEAR, LORD], 3);
    bolt(h, BEAR);
    h.passAll();
    h.expect.noObject(BEAR, { zone: 'battlefield' });
  });

  test('a spell with two targets that are both flyers I control pays each ability once: {R} and {4}', () => {
    const g = board([SKYBONDER, BIRD], 4, [PAIR]);
    expect(() => g.act(1).cast(PAIR, { targets: [SKYBONDER, BIRD], pay: true })).toThrow(
      /not a legal target|cannot pay/,
    );
    const h = board([SKYBONDER, BIRD], 5, [PAIR]);
    h.act(1).cast(PAIR, { targets: [SKYBONDER, BIRD], pay: true });
    h.passAll();
    h.expect.invariants();
  });

  test('a spell with two targets of which one is a flyer pays the tax once', () => {
    const g = board([SKYBONDER, BEAR], 3, [PAIR]);
    g.act(1).cast(PAIR, { targets: [BEAR, SKYBONDER], pay: true });
    g.passAll();
    g.expect.invariants();
  });

  test("an ability is not a spell: an opponent's activated ability that targets a flyer costs nothing more", () => {
    const b = scenario().seat(0);
    for (const card of CARDS) b.define(card);
    b.library('Island', 'Island', 'Island').battlefield(SKYBONDER);
    const g = b
      .seat(1)
      .battlefield(PINGER)
      .library('Island', 'Island', 'Island')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).activate(PINGER, { targets: [SKYBONDER], pay: true });
    g.passAll();
    g.expect.invariants();
  });

  test('the grant ends with the Skybonder: no tax once it is gone', () => {
    const g = board([SKYBONDER, BIRD], 4, [BOLT, BOLT]);
    g.act(1).cast(`${BOLT}[1]`, { targets: [SKYBONDER], pay: true });
    g.passAll();
    g.expect.noObject(SKYBONDER, { zone: 'battlefield' });
    g.act(1).cast(BOLT, { targets: [BIRD], pay: true });
    g.passAll();
    g.expect.noObject(BIRD, { zone: 'battlefield' });
  });
});
