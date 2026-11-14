// "If you casting or copying an instant or sorcery spell causes a triggered ability of a permanent you control to trigger, that ability triggers an additional
// time." (D-339 to D-343, group 3-b of the Niv-Mizzet deck): the static `doubleTriggers` with a `cause`.
// Pins: CR 603.2d (a triggered ability triggers additional times: the number is determined first, then that many triggers; two such effects make three), CR 601.2i
// (casting a spell is the event), CR 707.10 (a copy put onto the stack is not cast: "or copy" is a second event), CR 603.2 (what triggers an ability is its own event:
// a permanent becoming the target of a spell, or a creature entering, is not the cast event), CR 603.3d (each trigger chooses its targets on its own).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-niv-group-3-b.ts, synthetic-copies.ts).
import { describe, expect, test } from 'vitest';
import { checkInvariants, getView, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario, type TargetRef } from '../src/testing/index';
import { settle } from './meld-helpers';

const MAGE = 'SYNTHETIC Twin Mage'; // {1}{U}{R} 2/2: magecraft +1/+1, and the cause doubler
const ECHO = 'SYNTHETIC Twin Echo'; // {1}{U} 1/1: only the cause doubler
const CAST_WATCHER = 'SYNTHETIC Cast Watcher'; // {1} artifact: whenever you cast a spell, gain 1 life
const RIVAL_WATCHER = 'SYNTHETIC Rival Watcher'; // {1} artifact: whenever an opponent casts a spell, gain 1 life
const TARGET_WATCHER = 'SYNTHETIC Target Watcher'; // {1}{W} 1/4: whenever it becomes the target of a spell, gain 1 life
const ENTERER = 'SYNTHETIC Plain Enterer'; // {1} 1/1: when it enters, gain 1 life
const BEAR = 'SYNTHETIC Quiet Bear'; // {1} 1/1 creature, no abilities
const BOLT = 'SYNTHETIC Copy Bolt'; // {R} instant: 2 damage to any target
const DRAIN = 'SYNTHETIC Storm Drain'; // {B} sorcery with storm: each opponent loses 2 life
const FILLER = Array.from({ length: 12 }, () => 'Plains');

type Builder = ReturnType<typeof scenario>;

/** Seat 0's precombat main phase of turn 1 with lands for several spells; `configure` adds the permanents and cards. */
function game(configure: (b: Builder) => Builder): ScenarioGame {
  return configure(
    scenario()
      .seat(0)
      .life(20)
      .battlefield('Island', { count: 3 })
      .battlefield('Mountain', { count: 4 })
      .battlefield('Swamp')
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
}

const life = (g: ScenarioGame, seat = 0): number | undefined => g.state.seats[seat]?.life;
const sizeOf = (
  g: ScenarioGame,
  name: string,
): readonly [number | null | undefined, number | null | undefined] => {
  const o = getView(g.state, 0).battlefield.find((p) => p.name === name);
  return [o?.power, o?.toughness];
};
const castBolt = (g: ScenarioGame, target: TargetRef): void => {
  g.act(0).cast(BOLT, { pay: true, targets: [target] });
  settle(g);
};

describe('the cards are valid', () => {
  test.each([MAGE, ECHO, CAST_WATCHER, RIVAL_WATCHER, TARGET_WATCHER, ENTERER, BEAR])(
    '%s',
    (name) => {
      expect(validateCard(syntheticCard(name))).toEqual([]);
    },
  );
});

describe('a spell the cause names, cast by the controller (CR 603.2d, 601.2i)', () => {
  test("the controller's own magecraft ability triggers twice for an instant: +2/+2", () => {
    const g = game((b) => b.seat(0).hand(BOLT).battlefield(MAGE));
    castBolt(g, { player: 1 });
    expect(sizeOf(g, MAGE)).toEqual([4, 4]);
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('a sorcery causes it too', () => {
    const g = game((b) => b.seat(0).hand(DRAIN).battlefield(MAGE));
    g.act(0).cast(DRAIN, { pay: true });
    settle(g);
    expect(sizeOf(g, MAGE)).toEqual([4, 4]);
  });

  test('another permanent with a cast trigger triggers twice for an instant', () => {
    const g = game((b) => b.seat(0).hand(BOLT).battlefield(ECHO).battlefield(CAST_WATCHER));
    castBolt(g, { player: 1 });
    expect(life(g)).toBe(22);
  });

  test('a creature spell is not an instant or a sorcery: the trigger happens once, and the magecraft one not at all', () => {
    const g = game((b) => b.seat(0).hand(BEAR).battlefield(MAGE).battlefield(CAST_WATCHER));
    g.act(0).cast(BEAR, { pay: true });
    settle(g);
    expect(life(g)).toBe(21);
    expect(sizeOf(g, MAGE)).toEqual([2, 2]);
  });

  test('two such permanents make three triggers (CR 603.2d; each adds one)', () => {
    const g = game((b) =>
      b.seat(0).hand(BOLT).battlefield(MAGE).battlefield(ECHO).battlefield(CAST_WATCHER),
    );
    castBolt(g, { player: 1 });
    expect(life(g)).toBe(23);
    expect(sizeOf(g, MAGE)).toEqual([5, 5]);
  });

  test('a copy put onto the stack is a second event: the magecraft ability triggers twice for it too', () => {
    // A bear first, so that Storm copies the sorcery once: the cast (+2/+2) and the copy (+2/+2); "whenever you cast" does not see the copy.
    const g = game((b) => b.seat(0).hand(BEAR, DRAIN).battlefield(MAGE).battlefield(CAST_WATCHER));
    g.act(0).cast(BEAR, { pay: true });
    settle(g);
    expect(life(g)).toBe(21); // the bear: once
    g.act(0).cast(DRAIN, { pay: true });
    settle(g);
    expect(sizeOf(g, MAGE)).toEqual([6, 6]);
    expect(life(g)).toBe(23); // the sorcery cast: twice more; its copy is not cast
    expect(life(g, 1)).toBe(16); // the spell and its copy: 2 life each
  });
});

describe('what the cause does not name', () => {
  test('a spell an opponent casts does not cause it ("you casting")', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(ECHO)
      .battlefield(RIVAL_WATCHER)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .hand(BOLT)
      .battlefield('Mountain')
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.act(1).cast(BOLT, { pay: true, targets: [{ player: 0 }] });
    settle(g);
    expect(life(g)).toBe(19); // 2 damage from the bolt, 1 life from the watcher: once
  });

  test("the opponent's doubler does not double a trigger of the controller's permanents", () => {
    const g = game((b) => b.seat(0).hand(BOLT).battlefield(CAST_WATCHER).seat(1).battlefield(ECHO));
    castBolt(g, { player: 1 });
    expect(life(g)).toBe(21);
  });

  test('a permanent that becomes the target of the spell triggers once: that is another event than the cast', () => {
    const g = game((b) => b.seat(0).hand(BOLT).battlefield(ECHO).battlefield(TARGET_WATCHER));
    castBolt(g, { name: TARGET_WATCHER });
    expect(life(g)).toBe(21);
  });

  test('a creature entering is not the cast event: its trigger happens once', () => {
    const g = game((b) => b.seat(0).hand(ENTERER).battlefield(ECHO));
    g.act(0).cast(ENTERER, { pay: true });
    settle(g);
    expect(life(g)).toBe(21);
  });

  test('without the permanent that has it the trigger happens once', () => {
    const g = game((b) => b.seat(0).hand(BOLT).battlefield(CAST_WATCHER));
    castBolt(g, { player: 1 });
    expect(life(g)).toBe(21);
  });
});

describe('validation', () => {
  test('the cause is a cast or copy of a spell, with a filter', () => {
    const card = syntheticCard(ECHO);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const ability = face.abilities?.[0];
    if (ability?.kind !== 'static' || ability.static.kind !== 'doubleTriggers') {
      throw new Error('unexpected shape');
    }
    const withCause = (cause: unknown) =>
      ({
        ...card,
        faces: [
          {
            ...face,
            abilities: [{ kind: 'static', static: { ...ability.static, cause } }],
          },
        ],
      }) as never;
    expect(
      validateCard(
        withCause({ kind: 'castOrCopySpell', spell: { stackKind: 'spell', types: ['instant'] } }),
      ),
    ).toEqual([]);
    expect(validateCard(withCause({ kind: 'castOrCopySpell' })).length).toBeGreaterThan(0);
    // Not a filter of spells: a permanent of that type would never be cast.
    expect(
      validateCard(withCause({ kind: 'castOrCopySpell', spell: { types: ['instant'] } })).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(withCause({ kind: 'somethingElse', spell: { types: ['instant'] } })).length,
    ).toBeGreaterThan(0);
  });
});
