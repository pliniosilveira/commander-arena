// "Whenever a player attacks you, target attacking creature gets -2/-0 until end of turn." and "Whenever a player attacks, if they aren't attacking you, that player chooses an
// attacking creature. It gets +2/+0 until end of turn." (Mirkwood Trapper; CR 508.1b, 603.2, 603.4, 608.2d).
// Pins: the trigger is per declaration and per defender (each Trapper's controller is "you" for the first ability), a planeswalker attacked is not "you" (CR 508.1b), the
// intervening "if" reads the declaration, and "that player" (the attacking player, not the controller) makes the choice among all attacking creatures (CR 608.2d).
// The card is the SYNTHETIC "Trapper Probe", written to the AST the parser lowers; the creatures are real fixtures.
import { describe, expect, test } from 'vitest';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const TRAPPER = 'SYNTHETIC Trapper Probe';
const BEARS = 'Grizzly Bears';
const HAWK = "Healer's Hawk";
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const trapper = singleFaceCard({
  name: TRAPPER,
  manaCost: ['1', 'G', 'U'],
  types: ['creature'],
  subtypes: ['Elf', 'Scout'],
  colors: ['G', 'U'],
  colorIdentity: ['G', 'U'],
  power: 3,
  toughness: 3,
  oracleText:
    "Whenever a player attacks you, target attacking creature gets -2/-0 until end of turn. Whenever a player attacks, if they aren't attacking you, that player chooses an attacking creature. It gets +2/+0 until end of turn.",
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'attackBatch', who: 'any', atLeast: 1, attackedYou: true },
      targets: [
        { id: 't1', what: { kind: 'object', filter: { types: ['creature'], attacking: true } } },
      ],
      effect: {
        kind: 'modifyPt',
        objects: { kind: 'target', id: 't1' },
        power: -2,
        toughness: 0,
        duration: 'untilEndOfTurn',
      },
    },
    {
      kind: 'triggered',
      trigger: { kind: 'attackBatch', who: 'any', atLeast: 1 },
      interveningIf: { kind: 'not', term: { kind: 'attackersAttackedYou' } },
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'chooseObjects',
            id: 'c1',
            filter: { zone: 'battlefield', types: ['creature'], attacking: true },
            count: 1,
            exactly: true,
            chooser: { kind: 'triggerPlayer' },
          },
          {
            kind: 'modifyPt',
            objects: { kind: 'chosen', id: 'c1' },
            power: 2,
            toughness: 0,
            duration: 'untilEndOfTurn',
          },
        ],
      },
    },
  ],
});

describe('the card is valid', () => {
  test('validateCard', () => {
    expect(validateCard(trapper)).toEqual([]);
  });

  const withAbility = (ability: unknown) =>
    validateCard({
      ...trapper,
      faces: [{ ...trapper.faces[0], abilities: [ability] }],
    } as unknown as typeof trapper);

  test('attackedYou does not go with eachAttackedPlayer', () => {
    const issues = withAbility({
      kind: 'triggered',
      trigger: {
        kind: 'attackBatch',
        who: 'any',
        atLeast: 1,
        attackedYou: true,
        eachAttackedPlayer: true,
      },
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    });
    expect(issues.map((i) => i.message).join('\n')).toMatch(/attackedYou does not go with/);
  });

  test('attackersAttackedYou as an intervening "if" needs an attackBatch trigger', () => {
    const issues = withAbility({
      kind: 'triggered',
      trigger: { kind: 'step', step: 'upkeep', who: 'you' },
      interveningIf: { kind: 'attackersAttackedYou' },
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    });
    expect(issues.map((i) => i.message).join('\n')).toMatch(/attackersAttackedYou reads/);
  });

  test('a chooser needs a valid player selector', () => {
    const issues = withAbility({
      kind: 'triggered',
      trigger: { kind: 'attackBatch', who: 'any', atLeast: 1 },
      effect: {
        kind: 'chooseObjects',
        id: 'c1',
        filter: { zone: 'battlefield', types: ['creature'] },
        count: 1,
        exactly: true,
        chooser: { kind: 'nobody' },
      },
    });
    expect(issues.length).toBeGreaterThan(0);
  });
});

const WALKER = 'SYNTHETIC Vanilla Planeswalker';

/** Three seats; seats 0 and 2 each have a Trapper; seat 1 is the active player with a Bears and a Hawk. Seat 0 also has a planeswalker. */
const table = (active = 1) => {
  const g = scenario({ seats: 3 })
    .seat(0)
    .define(trapper)
    .library(...LIBRARY)
    .battlefield(TRAPPER, WALKER)
    .seat(1)
    .library(...LIBRARY)
    .battlefield(BEARS, HAWK)
    .seat(2)
    .library(...LIBRARY)
    .battlefield(TRAPPER)
    .at('precombatMain', { active })
    .build();
  g.advanceTo('declareAttackers', { attack: false });
  return g;
};

const abilitiesOf = (g: ReturnType<typeof table>, seat: number) =>
  g.state.stack.filter((id) => g.state.objects[id]?.controller === seat).length;

describe('"Whenever a player attacks you, target attacking creature gets -2/-0"', () => {
  test('attacked: the Trapper of the attacked player triggers and its controller targets an attacker', () => {
    const g = table();
    g.act(1).declareAttackers([{ attacker: BEARS, target: { player: 0 } }]);
    // Seat 0 was attacked: its first ability (target). Seat 2 was not: its second ability only.
    expect(abilitiesOf(g, 0)).toBe(1);
    expect(abilitiesOf(g, 2)).toBe(1);
    g.passAll();
    // Seat 2's Trapper makes seat 1 (that player) choose among the attackers, even the only one; seat 0's Trapper shrank it (-2/-0).
    expect(g.state.pending?.kind).toBe('choosePermanent');
    expect(g.state.pending?.seat).toBe(1);
    g.act(1).choosePermanents(BEARS);
    g.passAll();
    g.expect.pt(BEARS, 2, 2);
  });

  test('the attack is on another player: it does not trigger for me, only the second ability does', () => {
    const g = table();
    g.act(1).declareAttackers([{ attacker: BEARS, target: { player: 2 } }]);
    // Seat 2 (attacked) has its first ability, seat 0 its second ability, "that player chooses".
    expect(abilitiesOf(g, 0)).toBe(1);
    expect(abilitiesOf(g, 2)).toBe(1);
  });

  test('a planeswalker attacked is not "you": the first ability does not trigger, the second does', () => {
    const g = table();
    g.act(1).declareAttackers([{ attacker: BEARS, target: WALKER }]);
    expect(abilitiesOf(g, 0)).toBe(1);
    expect(abilitiesOf(g, 2)).toBe(1);
  });
});

describe('"Whenever a player attacks, if they aren\'t attacking you, that player chooses an attacking creature"', () => {
  test("attacker at seat 2 only: seat 0's Trapper makes the attacking player choose, not its controller", () => {
    const g = table();
    g.act(1).declareAttackers([
      { attacker: BEARS, target: { player: 2 } },
      { attacker: HAWK, target: { player: 2 } },
    ]);
    g.act(2).chooseTargets(HAWK);
    g.passAll();
    // The resolving ability of seat 0 asks seat 1.
    const d = g.state.pending;
    expect(d?.kind).toBe('choosePermanent');
    expect(d?.seat).toBe(1);
    expect(() => g.act(0).choosePermanents(BEARS)).toThrow();
    g.act(1).choosePermanents(BEARS);
    g.passAll();
    // Bears: +2/+0 from the choice; Hawk: -2/-0 from the target (a 1/1 stays at 0 power and is not the choice).
    g.expect.pt(BEARS, 4, 2);
    g.expect.pt(HAWK, -1, 1);
  });

  test('the choice is among every attacking creature, mine and theirs', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .define(trapper)
      .library(...LIBRARY)
      .battlefield(TRAPPER, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(HAWK)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([
      { attacker: BEARS, target: { player: 1 } },
      { attacker: TRAPPER, target: { player: 2 } },
    ]);
    // I attacked, so the intervening "if they aren't attacking you" holds and I (that player) choose.
    g.passAll();
    const d = g.state.pending;
    expect(d?.kind).toBe('choosePermanent');
    expect(d?.seat).toBe(0);
    g.act(0).choosePermanents(BEARS);
    g.passAll();
    g.expect.pt(BEARS, 4, 2);
  });

  test('two attackers at two defenders: neither Trapper makes a choice (both were attacked)', () => {
    const g = table();
    g.act(1).declareAttackers([
      { attacker: BEARS, target: { player: 0 } },
      { attacker: HAWK, target: { player: 2 } },
    ]);
    g.act(2).chooseTargets(HAWK);
    g.act(0).chooseTargets(BEARS);
    expect(g.state.stack).toHaveLength(2);
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.pt(BEARS, 0, 2);
    g.expect.pt(HAWK, -1, 1);
  });

  test('a planeswalker attacked is not "you": the attacker still chooses', () => {
    const g = table();
    g.act(1).declareAttackers([{ attacker: BEARS, target: WALKER }]);
    g.passAll();
    expect(g.state.pending?.kind).toBe('choosePermanent');
    expect(g.state.pending?.seat).toBe(1);
  });
});
