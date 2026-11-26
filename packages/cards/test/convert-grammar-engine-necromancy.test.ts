// Necromancy: "You may cast this spell as though it had flash. If you cast it any time a sorcery couldn't have been cast, the controller of the permanent it becomes sacrifices it at the
// beginning of the next cleanup step. When this enchantment enters, if it's on the battlefield, it becomes an Aura with "enchant creature put onto the battlefield with Necromancy." Put target
// creature card from a graveyard onto the battlefield under your control and attach this enchantment to it. When this enchantment leaves the battlefield, that creature's controller sacrifices
// it." goes through the grammar as a card with no override (NO_OVERRIDES), with the Oracle text of the golden corpus, and is played through applyAction.
// Pins: CR 601.3b (cast as though it had flash), CR 307.1 (when a sorcery could be cast), CR 603.7 and 514.3a (the delayed sacrifice at the beginning of the next cleanup step, with priority in it),
// CR 303.4 and 702.5a (it becomes an Aura with an enchant ability), CR 603.4 (the intervening "if"), CR 400.7 (the creature is a new object), CR 701.21a (its controller sacrifices it),
// CR 704.5m (the Aura goes when the creature does), CR 109.4 and 110.2a (who controls what). Rulings of Scryfall for the card were not available: unverified.
import { readFileSync } from 'node:fs';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { type GoldenCard, parseGolden } from '../src/index';
import { parsed } from './convert-grammar-helpers';

const CORPUS = new URL('./fixtures/corpus/golden.jsonl', import.meta.url);
const real = (name: string): GoldenCard => {
  const card = parseGolden(readFileSync(CORPUS, 'utf8')).find((c) => c.name === name);
  if (card === undefined) throw new Error(`the golden corpus has no ${name}`);
  return card;
};

const GOLDEN = real('Necromancy');
const face = GOLDEN.faces[0];
if (face === undefined) throw new Error('Necromancy has no face');

const NECRO = parsed(GOLDEN.name, face.typeLine, face.oracleText, {
  manaCost: face.manaCost,
  colors: [...face.colors],
});
const DISENCHANT = parsed('Test Disenchant', 'Instant', 'Destroy target enchantment.', {
  manaCost: '{U}',
  colors: ['U'],
});
const KILL = parsed('Test Kill', 'Instant', 'Destroy target creature.', {
  manaCost: '{U}',
  colors: ['U'],
});
const STEAL = parsed('Test Steal', 'Instant', 'Gain control of target creature.', {
  manaCost: '{U}',
  colors: ['U'],
});
const STEAL_ENCHANTMENT = parsed('Test Seize', 'Instant', 'Gain control of target enchantment.', {
  manaCost: '{U}',
  colors: ['U'],
});
const CANTRIP = parsed('Test Cantrip', 'Instant', 'Draw a card.', {
  manaCost: '{B}',
  colors: ['B'],
});
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 12 }, () => 'Swamp');
const inGraveyard = (name: string, seat: 0 | 1 | 2) => ({ name, zone: 'graveyard' as const, seat });

/** Seat 0 holds Necromancy and three Swamps; seat 1 has the Bears in the graveyard and three instants with three Islands. The step and the active seat are the test's. */
const board = (step: 'precombatMain' | 'beginningOfCombat', active: 0 | 1 = 0, priority = 0) =>
  scenario()
    .define(NECRO)
    .define(DISENCHANT)
    .define(KILL)
    .define(STEAL)
    .define(STEAL_ENCHANTMENT)
    .seat(0)
    .library(...LIBRARY)
    .hand(NECRO.name)
    .battlefield('Swamp', { count: 3 })
    .seat(1)
    .library(...LIBRARY)
    .graveyard(BEARS)
    .hand(DISENCHANT.name, KILL.name, STEAL.name, STEAL_ENCHANTMENT.name)
    .battlefield('Island', { count: 3 })
    .at(step, { active, priority })
    .build();

const castNecro = (g: ReturnType<typeof board>) => {
  g.act(0).cast(NECRO.name, { pay: true });
};

/** Casts it, lets it resolve and its enters ability with it (the Bears is the only target). */
const resolveAll = (g: ReturnType<typeof board>) => {
  castNecro(g);
  g.passAll();
  if (g.state.pending?.kind === 'targets') g.act(0).chooseTargets(inGraveyard(BEARS, 1));
  if (g.state.stack.length > 0) g.passAll();
};

describe('Necromancy: the lowering', () => {
  const abilities = NECRO.faces[0]?.abilities ?? [];

  test("the first ability is the spell's own flash permission with its sacrifice rider", () => {
    expect(abilities[0]).toEqual({
      kind: 'static',
      static: {
        kind: 'castAsThoughFlash',
        spells: { kind: 'this' },
        sacrificeIfCastAtInstantSpeed: true,
      },
    });
  });

  test('the enters ability makes it an Aura, puts the card onto the battlefield and attaches it', () => {
    expect(abilities[1]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      interveningIf: { kind: 'thisOnBattlefield' },
      targets: [
        { id: 't1', what: { kind: 'object', filter: { zone: 'graveyard', types: ['creature'] } } },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'becomeAura',
            objects: { kind: 'this' },
            enchant: { kind: 'enchant', filter: { types: ['creature'], putWithSource: true } },
          },
          {
            kind: 'moveToZone',
            objects: { kind: 'target', id: 't1' },
            to: 'battlefield',
            controller: 'you',
            putWithSource: true,
          },
          { kind: 'attach', object: { kind: 'this' }, to: { kind: 'moved' } },
        ],
      },
    });
  });

  test('the leaves ability has the creature put onto the battlefield sacrificed by its controller', () => {
    expect(abilities[2]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'leavesBattlefield', what: { kind: 'this' } },
      effect: { kind: 'sacrifice', objects: { kind: 'putWithThis' }, byController: true },
    });
  });
});

describe('Necromancy: cast at sorcery speed', () => {
  test("it returns the creature under the caster's control, attached, and it becomes an Aura", () => {
    const g = board('precombatMain');
    resolveAll(g);
    const bears = g.find({ name: BEARS, zone: 'battlefield' })[0];
    expect(bears).toBeDefined();
    expect(bears?.controller).toBe(0);
    expect(bears?.owner).toBe(1);
    g.expect.attached(NECRO.name, BEARS);
    const view = g.view(0).battlefield.find((o) => o.name === NECRO.name);
    expect(view?.subtypes).toContain('Aura');
    expect(view?.types).toContain('enchantment');
    g.expect.invariants();
  });

  test('it stays through the cleanup step: nothing is sacrificed', () => {
    const g = board('precombatMain');
    resolveAll(g);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.zone(NECRO.name, 'battlefield');
    g.expect.zone(BEARS, 'battlefield');
    g.expect.attached(NECRO.name, BEARS);
    g.expect.invariants();
  });
});

describe('Necromancy: cast at instant speed', () => {
  test('it may be cast in the beginning of combat step (it has flash)', () => {
    const g = board('beginningOfCombat');
    const legal = g.legalActions(0).filter((a) => a.kind === 'castSpell');
    expect(legal.length).toBeGreaterThan(0);
  });

  test('the controller sacrifices it at the beginning of the next cleanup step, and the creature goes with it', () => {
    const g = board('beginningOfCombat');
    resolveAll(g);
    g.expect.zone(NECRO.name, 'battlefield');
    g.expect.attached(NECRO.name, BEARS);
    g.advanceTo('cleanup');
    // CR 514.3a: the trigger is on the stack and the active player has priority in the cleanup step.
    expect(g.state.turn.step).toBe('cleanup');
    expect(g.state.stack).toHaveLength(1);
    g.expect.zone(NECRO.name, 'battlefield');
    g.passAll();
    g.expect.zone(NECRO.name, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.invariants();
  });

  test('another player gained control of Necromancy: they sacrifice it in the cleanup step (CR 701.21a)', () => {
    const g = board('beginningOfCombat');
    resolveAll(g);
    g.act(0).pass();
    g.act(1).cast(STEAL_ENCHANTMENT.name, { targets: [NECRO.name], pay: true });
    g.passAll();
    expect(g.view(0).battlefield.find((o) => o.name === NECRO.name)?.controller).toBe(1);
    g.advanceTo('cleanup');
    g.passAll();
    g.expect.zone(NECRO.name, 'graveyard', { seat: 0 });
    const sacrificed = g.events.flatMap((e) => (e.kind === 'sacrificed' ? [e.controller] : []));
    expect(sacrificed[0]).toBe(1);
  });

  test('on the turn of another player the controller of Necromancy sacrifices it, not the active player', () => {
    const g = board('beginningOfCombat', 1, 0);
    // Seat 1 is active and passes priority: seat 0 may cast it at instant speed in their beginning of combat step.
    resolveAll(g);
    g.expect.zone(NECRO.name, 'battlefield');
    g.advanceTo('cleanup');
    g.passAll();
    g.expect.zone(NECRO.name, 'graveyard', { seat: 0 });
    const sacrificed = g.events.filter((e) => e.kind === 'sacrificed');
    expect(sacrificed.map((e) => (e.kind === 'sacrificed' ? e.controller : -1))).toContain(0);
  });

  test('a spell cast with a sorcery already possible is not marked', () => {
    const g = board('precombatMain');
    castNecro(g);
    expect(g.find({ name: NECRO.name, zone: 'stack' })[0]?.stack?.sacrificeAtCleanup).toBe(
      undefined,
    );
  });

  test('a spell cast at instant speed is marked, and one that is countered leaves nothing behind', () => {
    const g = board('beginningOfCombat');
    castNecro(g);
    expect(g.find({ name: NECRO.name, zone: 'stack' })[0]?.stack?.sacrificeAtCleanup).toBe(true);
    expect(g.state.delayedTriggers).toHaveLength(0);
  });

  test("it is cast with a stack that is not empty in its controller's own main phase: a sorcery could not have been cast", () => {
    const g = scenario()
      .define(NECRO)
      .define(CANTRIP)
      .seat(0)
      .library(...LIBRARY)
      .hand(NECRO.name, CANTRIP.name)
      .battlefield('Swamp', { count: 5 })
      .seat(1)
      .library(...LIBRARY)
      .graveyard(BEARS)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(CANTRIP.name, { pay: true });
    expect(g.state.stack.length).toBe(1);
    castNecro(g);
    expect(g.find({ name: NECRO.name, zone: 'stack' })[0]?.stack?.sacrificeAtCleanup).toBe(true);
    g.passAll();
    if (g.state.pending?.kind === 'targets') g.act(0).chooseTargets(inGraveyard(BEARS, 1));
    g.passAll();
    g.expect.zone(NECRO.name, 'battlefield');
    g.advanceTo('cleanup');
    g.passAll();
    g.expect.zone(NECRO.name, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });
});

describe('Necromancy: what happens to the pair', () => {
  test('the creature is destroyed: Necromancy goes to the graveyard (CR 704.5m)', () => {
    const g = board('precombatMain');
    resolveAll(g);
    g.act(0).pass();
    g.act(1).cast(KILL.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(NECRO.name, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test("Necromancy is destroyed: the creature is sacrificed and goes to its owner's graveyard", () => {
    const g = board('precombatMain');
    resolveAll(g);
    g.act(0).pass();
    g.act(1).cast(DISENCHANT.name, { targets: [NECRO.name], pay: true });
    g.passAll();
    g.expect.zone(NECRO.name, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('another player gained control of the creature: they are the one who sacrifices it (CR 701.21a)', () => {
    const g = board('precombatMain');
    resolveAll(g);
    g.act(0).pass();
    g.act(1).cast(STEAL.name, { targets: [BEARS], pay: true });
    g.passAll();
    // The Bears is seat 1's by the control effect (a layer 2 effect: `GameObject.controller` still says seat 0).
    expect(g.view(0).battlefield.find((o) => o.name === BEARS)?.controller).toBe(1);
    g.act(0).pass();
    g.act(1).cast(DISENCHANT.name, { targets: [NECRO.name], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    const sacrificed = g.events.filter((e) => e.kind === 'sacrificed');
    expect(sacrificed.map((e) => (e.kind === 'sacrificed' ? e.controller : -1))).toContain(1);
    g.expect.invariants();
  });

  test('it leaves in response to its own enters ability: nothing returns', () => {
    const g = board('precombatMain');
    castNecro(g);
    g.passAll();
    g.act(0).pass();
    g.act(1).cast(DISENCHANT.name, { targets: [NECRO.name], pay: true });
    g.passAll();
    g.expect.zone(NECRO.name, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });
});

describe('Necromancy: three seats', () => {
  /** Seat 1 is the active player, seat 0 casts Necromancy at instant speed in their beginning of combat step; the creature is in seat 2's graveyard. */
  const threeSeats = () =>
    scenario({ seats: 3 })
      .define(NECRO)
      .seat(0)
      .library(...LIBRARY)
      .hand(NECRO.name)
      .battlefield('Swamp', { count: 3 })
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .graveyard(BEARS)
      .at('beginningOfCombat', { active: 1, priority: 0 })
      .build();

  test("the creature of a third player's graveyard returns under the caster's control and is sacrificed in the cleanup step of another player's turn", () => {
    const g = threeSeats();
    g.act(0).cast(NECRO.name, { pay: true });
    expect(g.find({ name: NECRO.name, zone: 'stack' })[0]?.stack?.sacrificeAtCleanup).toBe(true);
    g.passAll();
    if (g.state.pending?.kind === 'targets') g.act(0).chooseTargets(inGraveyard(BEARS, 2));
    if (g.state.stack.length > 0) g.passAll();
    const bears = g.find({ name: BEARS, zone: 'battlefield' })[0];
    expect(bears?.controller).toBe(0);
    expect(bears?.owner).toBe(2);
    g.expect.attached(NECRO.name, BEARS);
    g.advanceTo('cleanup');
    expect(g.state.turn.activeSeat).toBe(1);
    g.passAll();
    g.expect.zone(NECRO.name, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 2 });
    const sacrificed = g.events.flatMap((e) => (e.kind === 'sacrificed' ? [e.controller] : []));
    expect(sacrificed).toEqual([0, 0]);
    g.expect.invariants();
  });
});
