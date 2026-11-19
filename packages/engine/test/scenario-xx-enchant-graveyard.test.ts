// Issue 89 (Silverquill Influence), an Aura that enchants a creature card in a graveyard and returns it (CR 702.5a, 303.4a, 303.4c, 608.3b, 608.3c, 704.5m, 613.1f, 603.4, 603.10a, 400.7).
// A SYNTHETIC Aura with the shape of the real one: "Enchant creature card in a graveyard. When this Aura enters, if it's on the battlefield, it loses \"enchant creature card in a
// graveyard\" and gains \"enchant creature put onto the battlefield with this Aura.\" Return enchanted creature card to the battlefield under your control and attach this Aura to it.
// When this Aura leaves the battlefield, that creature's controller sacrifices it. Enchanted creature gets -1/-0."
// Pins: the spell targets a creature card of any graveyard, enters attached to it and survives state-based actions; the enters ability returns the card under its controller's control,
// attached; the static ability applies; the sacrifice is made by the creature's controller as it is then (CR 603.10a, controllerOf); the Aura goes to the graveyard when the creature
// leaves first, or when the card left the graveyard; the intervening "if" (CR 603.4); a target that left fizzles (CR 608.3b); the structure check.
import { describe, expect, test } from 'vitest';
import type { Ability, Keyword } from '../src/ast/types';
import { validateCardStructure } from '../src/ast/validate';
import { controllerOf } from '../src/rules/control';
import type { GameObject } from '../src/state/types';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const ANIMATE = 'SYNTHETIC Animate Dead';
const DISENCHANT = 'SYNTHETIC Test Disenchant';
const BEARS = 'Grizzly Bears';
const VANILLA = 'SYNTHETIC Vanilla 3/3';
const BOLT = 'Lightning Bolt';
const EXILE = 'SYNTHETIC Quick Exile';
const BORROW = 'SYNTHETIC Borrow Creature';
const LIBRARY = Array.from({ length: 12 }, () => 'Swamp');

type EnchantKeyword = Extract<Keyword, { kind: 'enchant' }>;
const IN_GRAVEYARD: EnchantKeyword = {
  kind: 'enchant',
  filter: { types: ['creature'], zone: 'graveyard' },
};
const WITH_THIS: EnchantKeyword = {
  kind: 'enchant',
  filter: { types: ['creature'], putWithSource: true },
};

const abilities = (): Ability[] => [
  { kind: 'keyword', keyword: IN_GRAVEYARD },
  {
    kind: 'triggered',
    trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
    interveningIf: { kind: 'thisOnBattlefield' },
    effect: {
      kind: 'sequence',
      effects: [
        {
          kind: 'replaceEnchant',
          objects: { kind: 'this' },
          loses: IN_GRAVEYARD,
          gains: WITH_THIS,
        },
        {
          kind: 'moveToZone',
          objects: { kind: 'attached' },
          to: 'battlefield',
          putWithSource: true,
        },
        { kind: 'attach', object: { kind: 'this' }, to: { kind: 'moved' } },
      ],
    },
  },
  {
    kind: 'triggered',
    trigger: { kind: 'leavesBattlefield', what: { kind: 'this' } },
    effect: { kind: 'sacrifice', objects: { kind: 'putWithThis' }, byController: true },
  },
  {
    kind: 'static',
    static: { kind: 'modifyPt', subject: { kind: 'attached' }, power: -1, toughness: 0 },
  },
];

const aura = (list: Ability[]) =>
  singleFaceCard({
    name: ANIMATE,
    manaCost: ['1', 'B'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'SYNTHETIC test text.',
    abilities: list,
  });

const disenchant = singleFaceCard({
  name: DISENCHANT,
  manaCost: ['U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'Destroy target enchantment.',
  spell: {
    targets: [
      {
        id: 't1',
        what: { kind: 'object', filter: { zone: 'battlefield', types: ['enchantment'] } },
      },
    ],
    effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
  },
});

const target = (name: string, seat: 0 | 1) => ({ name, zone: 'graveyard' as const, seat });

/** Seat 0 holds the Aura with two Swamps and a SYNTHETIC 3/3 and a Lightning Bolt in the graveyard; seat 1 has Bears in the graveyard and answers for {U}{R}{R}. */
const board = (list: Ability[] = abilities()) =>
  scenario()
    .define(aura(list))
    .define(disenchant)
    .seat(0)
    .library(...LIBRARY)
    .hand(ANIMATE)
    .battlefield('Swamp', { count: 2 })
    .graveyard(VANILLA)
    .graveyard(BOLT)
    .seat(1)
    .library(...LIBRARY)
    .graveyard(BEARS)
    .hand(DISENCHANT, EXILE, BORROW, BOLT)
    .battlefield('Island', { count: 3 })
    .battlefield('Mountain', { count: 2 })
    .at('precombatMain', { active: 0 })
    .build();

type Game = ReturnType<typeof board>;

const onBattlefield = (g: Game, name: string): GameObject | undefined =>
  g.find({ name, zone: 'battlefield' })[0];

/** Casts the Aura at `name` of `seat`'s graveyard and lets the spell resolve, leaving its enters ability on the stack (seat 0 has priority). */
const resolveSpell = (g: Game, name: string, seat: 0 | 1) => {
  g.act(0).cast(ANIMATE, { targets: [target(name, seat)], pay: true });
  g.pass(); // seat 0 passes
  g.pass(); // seat 1 passes: the Aura spell resolves
};

describe('the Aura spell targets a creature card of any graveyard (CR 303.4a, 702.5a)', () => {
  test('both graveyards offer their creature cards, a noncreature card is not offered', () => {
    const g = board();
    g.act(0).cast(ANIMATE);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected a targets decision, got ${d?.kind}`);
    expect(d.specs.map((s) => s.specId)).toEqual(['enchant']);
    const legal = (d.specs[0]?.legal ?? []).flatMap((t) => (t.kind === 'object' ? [t.id] : []));
    expect(legal.sort()).toEqual([g.id(target(BEARS, 1)), g.id(target(VANILLA, 0))].sort());
    expect(legal).not.toContain(g.id(target(BOLT, 0)));
  });

  test('with no creature card in a graveyard it cannot be cast', () => {
    const g = scenario()
      .define(aura(abilities()))
      .seat(0)
      .library(...LIBRARY)
      .hand(ANIMATE)
      .battlefield('Swamp', { count: 2 })
      .graveyard(BOLT)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.expect.illegal(0, { cast: ANIMATE });
  });
});

describe('it enters attached to the card and its enters ability returns it (CR 608.3c, 400.7)', () => {
  test('the Aura enters attached to the card in the graveyard and state-based actions leave it there', () => {
    const g = board();
    resolveSpell(g, BEARS, 1);
    const entered = g.object(ANIMATE);
    expect(entered.zone).toBe('battlefield');
    const host = entered.attachedTo === null ? undefined : g.state.objects[entered.attachedTo];
    expect(host?.zone).toBe('graveyard');
    expect(g.state.stack).toHaveLength(1);
    g.expect.invariants();
  });

  test("the creature of an opponent's graveyard returns under the Aura controller, attached, with -1/-0", () => {
    const g = board();
    resolveSpell(g, BEARS, 1);
    g.passAll();
    const bears = onBattlefield(g, BEARS);
    expect(bears).toBeDefined();
    if (bears === undefined) return;
    expect(controllerOf(g.state, bears)).toBe(0);
    expect(bears.owner).toBe(1);
    expect(g.object(ANIMATE).attachedTo).toBe(bears.id);
    expect(bears.putWith).toBe(g.id(ANIMATE));
    g.expect.pt(BEARS, 1, 2);
    expect(g.find({ name: BEARS, zone: 'graveyard' })).toEqual([]);
    g.expect.invariants();
  });

  test("a creature card of the caster's own graveyard returns too", () => {
    const g = board();
    resolveSpell(g, VANILLA, 0);
    g.passAll();
    g.expect.pt(VANILLA, 2, 3);
    g.expect.attached(ANIMATE, VANILLA);
    g.expect.invariants();
  });

  test('the enters ability swaps the enchant ability: the Aura enchants what it put there, not a card in a graveyard', () => {
    const g = board();
    resolveSpell(g, BEARS, 1);
    g.passAll();
    const change = g.state.continuousEffects.find((e) => e.change.kind === 'replaceEnchant');
    expect(change?.objects).toEqual([g.id(ANIMATE)]);
    expect(change?.change).toEqual({
      kind: 'replaceEnchant',
      loses: IN_GRAVEYARD,
      gains: WITH_THIS,
    });
  });
});

describe("when the Aura leaves, that creature's controller sacrifices it (CR 603.10a, 701.21a)", () => {
  test("destroyed Aura: the creature is sacrificed and goes to its owner's graveyard", () => {
    const g = board();
    resolveSpell(g, BEARS, 1);
    g.passAll();
    g.act(0).pass();
    g.act(1).cast(DISENCHANT, { targets: [ANIMATE], pay: true });
    g.passAll();
    g.expect.zone(ANIMATE, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    expect(onBattlefield(g, BEARS)).toBeUndefined();
    g.expect.invariants();
  });

  test('after a control change the new controller is the one who sacrifices it', () => {
    const g = board();
    resolveSpell(g, VANILLA, 0);
    g.passAll();
    g.act(0).pass();
    g.act(1).cast(BORROW, { targets: [VANILLA], pay: true });
    g.passAll();
    const stolen = onBattlefield(g, VANILLA);
    expect(stolen === undefined ? null : controllerOf(g.state, stolen)).toBe(1);
    g.act(0).pass();
    g.act(1).cast(DISENCHANT, { targets: [ANIMATE], pay: true });
    g.passAll();
    g.expect.eventLog([{ kind: 'sacrificed', controller: 1 }], { since: 0 });
    g.expect.zone(VANILLA, 'graveyard', { seat: 0 });
  });

  test('the creature goes first: the Aura is put into the graveyard and nothing else happens', () => {
    const g = board();
    resolveSpell(g, BEARS, 1);
    g.passAll();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(ANIMATE, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });
});

describe('the intervening "if it\'s on the battlefield" (CR 603.4) and a card that left (CR 704.5m, 608.3b)', () => {
  test('the Aura leaves in response to its enters ability: nothing returns', () => {
    const g = board();
    resolveSpell(g, BEARS, 1);
    g.act(0).pass(); // seat 0 passes with the enters ability on the stack
    g.act(1).cast(DISENCHANT, { targets: [ANIMATE], pay: true });
    g.passAll();
    g.expect.zone(ANIMATE, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    expect(onBattlefield(g, BEARS)).toBeUndefined();
    g.expect.invariants();
  });

  test('the card is exiled in response to the enters ability: the Aura goes to the graveyard and nothing returns', () => {
    const g = board();
    resolveSpell(g, BEARS, 1);
    g.act(0).pass();
    g.act(1).cast(EXILE, { targets: [target(BEARS, 1)], pay: true });
    g.passAll();
    g.expect.zone(ANIMATE, 'graveyard', { seat: 0 });
    expect(onBattlefield(g, BEARS)).toBeUndefined();
    expect(g.find({ name: BEARS, zone: 'exile' })).toHaveLength(1);
    g.expect.invariants();
  });

  test('the target is exiled before the spell resolves: it fizzles and goes to the graveyard', () => {
    const g = board();
    g.act(0).cast(ANIMATE, { targets: [target(BEARS, 1)], pay: true });
    g.act(0).pass();
    g.act(1).cast(EXILE, { targets: [target(BEARS, 1)], pay: true });
    g.passAll();
    g.expect.zone(ANIMATE, 'graveyard', { seat: 0 });
    expect(g.find({ name: BEARS, zone: 'exile' })).toHaveLength(1);
    expect(g.find({ name: BEARS, zone: 'battlefield' })).toEqual([]);
    g.expect.invariants();
  });
});

describe('the structure check', () => {
  const messages = (list: Ability[]) => validateCardStructure(aura(list)).map((i) => i.message);

  test('the card as written is accepted', () => {
    expect(messages(abilities())).toEqual([]);
  });

  test('a card in a graveyard was not put onto the battlefield with an Aura', () => {
    const bad: EnchantKeyword = {
      kind: 'enchant',
      filter: { types: ['creature'], zone: 'graveyard', putWithSource: true },
    };
    expect(messages([{ kind: 'keyword', keyword: bad }]).length).toBeGreaterThan(0);
  });

  test('replaceEnchant is about the Aura of the ability and swaps enchant abilities of objects', () => {
    const bad: Ability = {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: {
        kind: 'replaceEnchant',
        objects: { kind: 'this' },
        loses: { kind: 'enchant', filter: {}, player: true },
        gains: WITH_THIS,
      },
    };
    expect(messages([{ kind: 'keyword', keyword: IN_GRAVEYARD }, bad])).toEqual([
      'loses is an enchant ability of permanents or cards',
    ]);
  });

  test('putWithSource of moveToZone is for a card put onto the battlefield, and the reference for an ability', () => {
    const bad: Ability = {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: {
        kind: 'moveToZone',
        objects: { kind: 'attached' },
        to: 'hand',
        putWithSource: true,
      },
    };
    expect(messages([{ kind: 'keyword', keyword: IN_GRAVEYARD }, bad])).toEqual([
      'only an ability of a permanent that puts a card onto the battlefield remembers it',
    ]);
  });
});
