// "When you next cast an instant or sorcery spell this turn, copy that spell." and the same created by an activated ability, copying once for each time the
// commander was cast from the command zone (D-970 to D-972, group 3-a of the Niv-Mizzet deck).
// Pins: CR 603.7 (an effect creates a delayed triggered ability), CR 603.7a (a spell or ability that creates one does not trigger it for the spell that made
// it: it waits for an event after it was created), CR 603.7b (it triggers once, the next time the event happens), CR 603.7d and 603.7e (it belongs to the
// controller of the spell or ability as it resolved, whatever became of its source, a sacrificed creature included), CR 514.2 ("this turn": it ends
// with the turn, unused), CR 601.2i (a cast is the event: a copy is not cast, a spell of another player is not "you cast"), CR 707.10 and 707.10c (the
// copies, each of which may have new targets), CR 903.8 (the times a commander was cast from the command zone), CR 113.7a (the spell is copied from
// last-known information when it has left the stack).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-niv-group-3-a.ts, synthetic-copies.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { checkInvariants, getView, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const ECHO = 'SYNTHETIC Next Echo'; // {U}{R} instant: next instant or sorcery you cast this turn is copied, new targets may be chosen
const EXACT = 'SYNTHETIC Next Exact Echo'; // {U} instant: the same, the copy keeps the targets
const DRAKE = 'SYNTHETIC Commander Echo Drake'; // {1}{U} 2/1: {2}{U}, sacrifice: the same, once for each commander cast
const BOLT = 'SYNTHETIC Copy Bolt'; // {R} instant: 2 damage to any target
const SPLIT = 'SYNTHETIC Split Bolt'; // {1}{R} sorcery
const BEARS = 'Grizzly Bears';
const COMMANDER = 'SYNTHETIC Echo Commander'; // {3} creature, in the command zone
const FILLER = Array.from({ length: 12 }, () => 'Plains');

const commanderCard = singleFaceCard({
  name: COMMANDER,
  manaCost: ['3'],
  types: ['creature'],
  subtypes: ['Golem'],
  colors: [],
  colorIdentity: [],
  power: 3,
  toughness: 3,
  oracleText: '',
});

type Builder = ReturnType<typeof scenario>;

/** Seat 0's precombat main phase of turn 1, with lands for the spells and stocked libraries. */
function game(configure: (b: Builder) => Builder = (b) => b): ScenarioGame {
  return configure(
    scenario()
      .define(commanderCard)
      .seat(0)
      .life(20)
      .battlefield('Island', { count: 4 })
      .battlefield('Mountain', { count: 4 })
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
}

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

const castBolt = (g: ScenarioGame, seat = 0): void => {
  // The first bolt of the hand (a hand of two has two cards of that name).
  g.act(seat).cast(
    { name: BOLT, zone: 'hand', seat, nth: 0 },
    {
      targets: [{ player: 1 - seat }],
      pay: true,
    },
  );
};

describe('the cards are valid', () => {
  test.each([ECHO, EXACT, DRAKE])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('a delayed cast trigger copies the spell cast, and nothing else', () => {
    const card = syntheticCard(ECHO);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const withEffect = (effect: unknown) =>
      ({ ...card, faces: [{ ...face, spell: { effect } }] }) as never;
    const filter = { stackKind: 'spell', types: ['instant'] };
    const copy = { kind: 'copySpell', spell: { kind: 'triggerSubject' }, newTargets: 'may' };
    expect(validateCard(withEffect({ kind: 'delayedCast', filter, effect: copy }))).toEqual([]);
    // Not a copy: the spell that created it is gone and nothing else of it is named (CR 603.7c).
    expect(
      validateCard(
        withEffect({
          kind: 'delayedCast',
          filter,
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        }),
      ).length,
    ).toBeGreaterThan(0);
    // The spell cast, not a target nobody declared.
    expect(
      validateCard(
        withEffect({
          kind: 'delayedCast',
          filter,
          effect: { kind: 'copySpell', spell: { kind: 'target', id: 't1' }, newTargets: 'may' },
        }),
      ).length,
    ).toBeGreaterThan(0);
    // The filter is of spells.
    expect(
      validateCard(
        withEffect({
          kind: 'delayedCast',
          filter: { types: ['instant'] },
          effect: copy,
        }),
      ).length,
    ).toBeGreaterThan(0);
    // The count is an amount, with no X to read.
    expect(
      validateCard(
        withEffect({
          kind: 'delayedCast',
          filter,
          effect: { ...copy, count: { kind: 'x' } },
        }),
      ).length,
    ).toBeGreaterThan(0);
  });

  test('a copy count must be a valid amount', () => {
    const card = syntheticCard(DRAKE);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const ability = face.abilities?.[0];
    if (ability?.kind !== 'activated' || ability.effect.kind !== 'delayedCast') {
      throw new Error('unexpected shape');
    }
    const inner = ability.effect.effect;
    const withCount = (count: unknown) =>
      ({
        ...card,
        faces: [
          {
            ...face,
            abilities: [{ ...ability, effect: { ...ability.effect, effect: { ...inner, count } } }],
          },
        ],
      }) as never;
    expect(validateCard(withCount(2))).toEqual([]);
    expect(validateCard(withCount(-1)).length).toBeGreaterThan(0);
    expect(validateCard(withCount({ kind: 'nonsense' })).length).toBeGreaterThan(0);
  });
});

describe('"When you next cast an instant or sorcery spell this turn, copy that spell."', () => {
  test('resolving the spell creates the delayed ability; it does not copy itself (CR 603.7a)', () => {
    const g = game((b) => b.seat(0).hand(ECHO));
    g.act(0).cast(ECHO, { pay: true });
    resolveTop(g);
    expect(g.state.delayedTriggers).toHaveLength(1);
    expect(g.state.delayedTriggers[0]).toMatchObject({
      controller: 0,
      untilEndOfTurn: true,
      ability: { trigger: { kind: 'castSpell', by: 'you' } },
    });
    g.expect.stack([]);
    g.expect.pending('priority', 0);
  });

  test('the next instant cast triggers it: the trigger goes above the spell, the copy may have new targets', () => {
    const g = game((b) => b.seat(0).hand(ECHO, BOLT));
    g.act(0).cast(ECHO, { pay: true });
    resolveTop(g);
    castBolt(g);
    g.expect.stack([`${ECHO} (ability)`, BOLT]);
    // It triggered and is gone (CR 603.7b).
    expect(g.state.delayedTriggers).toHaveLength(0);
    const mark = g.mark();
    resolveTop(g);
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 0 });
    g.expect.stack([BOLT, BOLT]);
    const events = g.eventsSince(mark);
    expect(events.filter((e) => e.kind === 'spellCopied')).toHaveLength(1);
    // A copy is not cast (CR 707.10), so nothing cast anything again.
    expect(events.filter((e) => e.kind === 'spellCast')).toHaveLength(0);
    g.passAll();
    g.expect.life(0, 18); // the copy, with its new target
    g.expect.life(1, 18); // the original
    g.expect.stack([]);
    g.expect.invariants();
  });

  test('the new targets are optional: the copy may keep the target', () => {
    const g = game((b) => b.seat(0).hand(ECHO, BOLT));
    g.act(0).cast(ECHO, { pay: true });
    resolveTop(g);
    castBolt(g);
    resolveTop(g);
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 16);
    g.expect.life(0, 20);
  });

  test('without the choice, the copy has the targets of the original', () => {
    const g = game((b) => b.seat(0).hand(EXACT, BOLT));
    g.act(0).cast(EXACT, { pay: true });
    resolveTop(g);
    castBolt(g);
    resolveTop(g);
    // Nobody is asked (CR 707.10).
    g.expect.pending('priority', 0);
    g.expect.stack([BOLT, BOLT]);
    g.passAll();
    g.expect.life(1, 16);
  });

  test('a sorcery is copied too', () => {
    const g = game((b) => b.seat(0).hand(EXACT, SPLIT).seat(1).battlefield(BEARS));
    g.act(0).cast(EXACT, { pay: true });
    resolveTop(g);
    g.act(0).cast(SPLIT, { targets: [{ name: BEARS }, { player: 1 }], pay: true });
    g.expect.stack([`${EXACT} (ability)`, SPLIT]);
  });

  test('it triggers only once: the second instant is not copied', () => {
    const g = game((b) => b.seat(0).hand(ECHO, BOLT, BOLT));
    g.act(0).cast(ECHO, { pay: true });
    resolveTop(g);
    castBolt(g);
    resolveTop(g);
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    castBolt(g);
    g.expect.stack([BOLT]);
    g.passAll();
    g.expect.life(1, 14); // 2 + 2 for the first (with its copy), 2 for the second
  });

  test('a spell that is not an instant or a sorcery does not use it up', () => {
    const g = game((b) => b.seat(0).hand(EXACT, BEARS, BOLT).battlefield('Forest', { count: 2 }));
    g.act(0).cast(EXACT, { pay: true });
    resolveTop(g);
    g.act(0).cast(BEARS, { pay: true });
    g.expect.stack([BEARS]);
    expect(g.state.delayedTriggers).toHaveLength(1);
    g.passAll();
    castBolt(g);
    g.expect.stack([`${EXACT} (ability)`, BOLT]);
  });

  test('a spell of another player is not "you cast": it neither triggers it nor uses it up', () => {
    const g = game((b) =>
      b.seat(0).hand(EXACT, BOLT).seat(1).hand(BOLT).battlefield('Mountain', { count: 2 }),
    );
    g.act(0).cast(EXACT, { pay: true });
    resolveTop(g);
    // The opponent casts an instant in response to nothing: seat 0 passes, then the opponent casts.
    g.pass(0);
    g.expect.pending('priority', 1);
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.expect.stack([BOLT]);
    expect(g.state.delayedTriggers).toHaveLength(1);
    g.passAll();
    castBolt(g);
    g.expect.stack([`${EXACT} (ability)`, BOLT]);
  });

  test('the spell is copied from last-known information when it was countered in response', () => {
    const g = game((b) =>
      b.seat(0).hand(EXACT, BOLT).seat(1).hand('Counterspell').battlefield('Island', { count: 2 }),
    );
    g.act(0).cast(EXACT, { pay: true });
    resolveTop(g);
    castBolt(g);
    g.pass(0);
    g.act(1).cast('Counterspell', { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    resolveTop(g);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.stack([`${EXACT} (ability)`]);
    resolveTop(g);
    // The trigger still resolves, copying what the bolt was (CR 113.7a, 707.10).
    g.expect.stack([BOLT]);
    resolveTop(g);
    g.expect.life(1, 18);
    g.expect.invariants();
  });

  test('it ends with the turn: an instant cast on a later turn is not copied', () => {
    const g = game((b) => b.seat(0).hand(EXACT, BOLT));
    g.act(0).cast(EXACT, { pay: true });
    resolveTop(g);
    expect(g.state.delayedTriggers).toHaveLength(1);
    // Cleanup (CR 514.2): "this turn" is over, whatever was not used.
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.state.delayedTriggers).toHaveLength(0);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.pending('priority', 0);
    castBolt(g);
    g.expect.stack([BOLT]);
  });

  test('a second one cast copies the first one’s spell: the copy resolves too, so two abilities wait, and the next instant is copied twice', () => {
    const g = game((b) => b.seat(0).hand(EXACT, EXACT, BOLT).battlefield('Island', { count: 2 }));
    g.act(0).cast({ name: EXACT, zone: 'hand', seat: 0, nth: 0 }, { pay: true });
    resolveTop(g);
    expect(g.state.delayedTriggers).toHaveLength(1);
    // The second one is an instant spell cast: the first ability triggers and is used up.
    g.act(0).cast(EXACT, { pay: true });
    g.expect.stack([`${EXACT} (ability)`, EXACT]);
    expect(g.state.delayedTriggers).toHaveLength(0);
    resolveTop(g); // the trigger: a copy of the second one (not cast)
    g.expect.stack([EXACT, EXACT]);
    resolveTop(g); // the copy resolves and creates its ability (CR 707.10: a copy has the abilities of the spell)
    resolveTop(g); // the second one resolves and creates its own
    expect(g.state.delayedTriggers).toHaveLength(2);
    castBolt(g);
    // Two triggers of one controller go on the stack in the order they choose (CR 603.3b).
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.expect.life(1, 14); // the original and its two copies
  });

  test('the controller of the delayed ability is the player who controlled the spell', () => {
    const g = game((b) =>
      b.seat(0).hand(BOLT).seat(1).hand(EXACT).battlefield('Island', { count: 2 }),
    );
    // The opponent's Echo, cast during seat 0's turn: it is the opponent's ability and watches the opponent's casts.
    g.pass(0);
    g.act(1).cast(EXACT, { pay: true });
    resolveTop(g);
    expect(g.state.delayedTriggers[0]?.controller).toBe(1);
    g.expect.pending('priority', 0);
    castBolt(g);
    // Seat 0's own instant is not seat 1's "you cast".
    g.expect.stack([BOLT]);
  });

  test('the view shows the trigger on the stack as an ability of its source, and nothing is hidden', () => {
    const g = game((b) => b.seat(0).hand(EXACT, BOLT));
    g.act(0).cast(EXACT, { pay: true });
    resolveTop(g);
    castBolt(g);
    for (const seat of [0, 1] as const) {
      const view = getView(g.state, seat);
      // Bottom of the stack first: the bolt, then the trigger above it, with the ability's own text (CR 113.7a).
      expect(view.stack.map((e) => e.name)).toEqual([BOLT, EXACT]);
      expect(view.stack[1]?.ability?.kind).toBe('triggered');
      expect(view.stack[1]?.abilitySource).toBeDefined();
    }
    expect(checkInvariants(g.state)).toEqual([]);
  });
});

describe('"{2}{U}, Sacrifice this creature: When you next cast an instant or sorcery spell this turn, copy it for each time you\'ve cast your commander ..."', () => {
  const drake = (casts: number, hand: readonly string[] = [BOLT]) =>
    game((b) =>
      b
        .seat(0)
        .hand(...hand)
        .battlefield(DRAKE)
        .battlefield('Forest', { count: 2 })
        .commander(COMMANDER, { casts }),
    );

  test('the sacrifice is a cost: the creature is gone while the ability is on the stack, which still creates the delayed trigger', () => {
    const g = drake(2);
    g.act(0).activate(DRAKE, { pay: true });
    g.expect.zone(DRAKE, 'graveyard', { seat: 0 });
    g.expect.stack([`${DRAKE} (ability)`]);
    expect(g.state.delayedTriggers).toHaveLength(0);
    resolveTop(g);
    // CR 603.7e: the delayed ability is not an ability of the creature, which is already gone.
    expect(g.state.delayedTriggers).toHaveLength(1);
    expect(g.state.delayedTriggers[0]?.controller).toBe(0);
  });

  test('a copy for each time the commander was cast from the command zone', () => {
    const g = drake(2);
    g.act(0).activate(DRAKE, { pay: true });
    resolveTop(g);
    castBolt(g);
    g.expect.stack([`${DRAKE} (ability)`, BOLT]);
    resolveTop(g);
    // Two copies, each of which may have new targets (CR 707.10c).
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 0 });
    g.expect.stack([BOLT, BOLT, BOLT]);
    g.passAll();
    g.expect.life(1, 16); // the original and one copy
    g.expect.life(0, 18); // the other copy
    g.expect.stack([]);
    g.expect.invariants();
  });

  test('one cast, one copy', () => {
    const g = drake(1);
    g.act(0).activate(DRAKE, { pay: true });
    resolveTop(g);
    castBolt(g);
    resolveTop(g);
    g.act(0).chooseTargets({ player: 1 });
    g.expect.stack([BOLT, BOLT]);
    g.passAll();
    g.expect.life(1, 16);
  });

  test('a commander never cast from the command zone: no copies (zero is legal) and nobody is asked', () => {
    const g = drake(0);
    g.act(0).activate(DRAKE, { pay: true });
    resolveTop(g);
    castBolt(g);
    g.expect.stack([`${DRAKE} (ability)`, BOLT]);
    resolveTop(g);
    g.expect.pending('priority', 0);
    g.expect.stack([BOLT]);
    expect(g.state.delayedTriggers).toHaveLength(0);
    g.passAll();
    g.expect.life(1, 18);
  });

  test('a player with no commander gets no copies', () => {
    const g = game((b) => b.seat(0).hand(BOLT).battlefield(DRAKE));
    g.act(0).activate(DRAKE, { pay: true });
    resolveTop(g);
    castBolt(g);
    resolveTop(g);
    g.expect.stack([BOLT]);
  });

  test('the count is read as the trigger resolves, and the spell is the one cast', () => {
    const g = drake(3, [BOLT, BEARS]);
    g.act(0).activate(DRAKE, { pay: true });
    resolveTop(g);
    g.act(0).cast(BEARS, { pay: true });
    g.expect.stack([BEARS]); // a creature spell is not copied and does not use it up
    g.passAll();
    castBolt(g);
    resolveTop(g);
    for (let i = 0; i < 3; i++) g.act(0).chooseTargets({ player: 1 });
    g.expect.stack([BOLT, BOLT, BOLT, BOLT]);
  });

  test('it ends with the turn too', () => {
    const g = drake(2);
    g.act(0).activate(DRAKE, { pay: true });
    resolveTop(g);
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.state.delayedTriggers).toHaveLength(0);
  });
});
