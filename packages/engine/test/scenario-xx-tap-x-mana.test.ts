// "{T}, Pay 2 life, Tap X untapped tokens you control: Add X mana in any combination of colors." (Hazel of the Rootbloom): a mana ability whose X is the number of permanents the
// player taps as a cost, and whose mana is a color of the five for each. Pins: CR 107.3 and 605.3b (the player chooses X as the ability is activated, here by naming the permanents:
// a mana ability uses no stack to announce one), CR 106.1b (any combination of colors: the five, never colorless), CR 118.3 and 119.4 (costs: life is paid only from a life total of
// at least that much), CR 302.6 (summoning sickness holds back only a creature's own {T} ability, so a fresh token may be tapped for the cost of another permanent, while the source's
// own {T} needs it to have been under control since the turn began), CR 602.2b and 601.2b (the costs are chosen as the ability is activated), CR 605.3a-b (a mana ability may be
// activated while paying a cost). Cards are SYNTHETIC (src/cards/fixtures/synthetic-tap-x.ts).
import { describe, expect, test } from 'vitest';
import {
  type Action,
  applyAction,
  type GameState,
  getLegalActions,
  type ObjectId,
  type SeatId,
  syntheticCard,
  validateCard,
} from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { twoSeatGame } from './two-seat-helpers';

const DRUID = 'SYNTHETIC Rootbloom Druid'; // {T}, pay 2 life, tap X untapped tokens you control: add X mana in any combination of colors
const SWARM = 'SYNTHETIC Squirrel Swarm'; // {G}: four 1/1 Squirrel creature tokens
const TIRED = 'SYNTHETIC Tired Swarm'; // {G}: two tapped 1/1 Squirrel creature tokens
const COINS = 'SYNTHETIC Coin Rain'; // {G}: two Treasure tokens
const PRISM = 'SYNTHETIC Prism Rite'; // {W}{U}{B}{R}{G}
const BEARS = 'Grizzly Bears';
const FOREST = 'Forest';

/** The mana ability of the Druid, the one ability it has. */
const MANA = 0;

const tokensOf = (g: ScenarioGame, seat: SeatId): ObjectId[] =>
  g.state.battlefield.filter((id) => {
    const o = g.state.objects[id];
    return o !== undefined && o.token !== null && o.controller === seat;
  });

type Activation = Extract<Action, { kind: 'activateAbility' }>;

const tap = (g: ScenarioGame, many: readonly ObjectId[], combination: string): Activation => ({
  kind: 'activateAbility',
  source: g.id(DRUID),
  abilityIndex: MANA,
  color: null,
  combination: [...combination] as never,
  tappedMany: many,
});

const offered = (g: ScenarioGame, seat: SeatId = 0) =>
  getLegalActions(g.state, seat).filter(
    (a) => a.kind === 'activateAbility' && a.source === g.id(DRUID),
  );

/** A game with the Druid, one Forest for each spell to make tokens with, and the tokens made by casting them. */
function withTokens(spells: readonly string[], extra: (b: ReturnType<typeof scenario>) => void) {
  const g = twoSeatGame((b) => {
    let built = b.battlefield(DRUID);
    for (const _ of spells) built = built.battlefield(FOREST);
    extra(built);
    return built.hand(...spells);
  });
  for (const spell of spells) {
    g.act(0).cast({ name: spell, nth: 0 }, { pay: true });
    g.passAll();
  }
  return g;
}

describe('the card is valid', () => {
  test(DRUID, () => {
    expect(validateCard(syntheticCard(DRUID))).toEqual([]);
  });

  test('the cost that taps X permanents and the production of X mana go together, and with no other choice', () => {
    const card = syntheticCard(DRUID);
    const face = card.faces[0];
    const ability = face?.abilities?.[0];
    if (face === undefined || ability?.kind !== 'mana') throw new Error('no mana ability');
    const withAbility = (change: Record<string, unknown>) =>
      ({ ...card, faces: [{ ...face, abilities: [{ ...ability, ...change }] }] }) as never;
    const tapX = { kind: 'tapPermanentsX', filter: { token: true } };
    // The cost with no production of X mana, and the production with no cost.
    expect(
      validateCard(
        withAbility({ production: { kind: 'fixed', mana: ['G'] }, cost: [{ kind: 'tap' }, tapX] }),
      ),
    ).not.toEqual([]);
    expect(
      validateCard(withAbility({ production: { kind: 'anyCombinationTapped' }, cost: [] })),
    ).not.toEqual([]);
    // Two of the cost, or a second choice of a permanent to give up or to tap.
    expect(validateCard(withAbility({ cost: [{ kind: 'tap' }, tapX, tapX] }))).not.toEqual([]);
    expect(
      validateCard(
        withAbility({
          cost: [{ kind: 'tap' }, tapX, { kind: 'sacrifice', what: { types: ['artifact'] } }],
        }),
      ),
    ).not.toEqual([]);
    // Permanents an opponent controls, or tapped ones, are not what the cost taps.
    expect(
      validateCard(
        withAbility({
          cost: [
            { kind: 'tap' },
            { kind: 'tapPermanentsX', filter: { token: true, controller: 'opponent' } },
          ],
        }),
      ),
    ).not.toEqual([]);
  });
});

describe('what the priority options offer (CR 605.3a)', () => {
  test('with tokens to tap: the plays that tap all of them, with representative combinations of that many mana', () => {
    const g = withTokens([SWARM], () => undefined);
    const tokens = tokensOf(g, 0);
    expect(tokens).toHaveLength(4);
    const options = offered(g);
    // 5 colors alone, the 10 pairs split evenly and the five colors split as evenly as can be: a handful, never one for each of the C(8, 4) = 70 combinations.
    expect(options.length).toBeGreaterThan(5);
    expect(options.length).toBeLessThan(20);
    for (const o of options) {
      expect(o.kind === 'activateAbility' && o.tappedMany).toEqual(tokens);
      expect(o.kind === 'activateAbility' && o.combination?.length).toBe(4);
      expect(o.kind === 'activateAbility' && o.color).toBeNull();
    }
  });

  test('the list does not grow with the number of tokens: twenty tokens are still a few options', () => {
    // Four tokens for each of five casts; the Druid is not hasty, so it is not that turn's creature.
    const g = withTokens([SWARM, SWARM, SWARM, SWARM, SWARM], () => undefined);
    expect(tokensOf(g, 0)).toHaveLength(20);
    expect(offered(g).length).toBeLessThan(20);
    g.expect.invariants();
  });

  test('with no token to tap there is nothing on offer (X = 0 makes no mana), but the play that names none is still taken', () => {
    const g = twoSeatGame((b) => b.battlefield(DRUID));
    expect(offered(g)).toHaveLength(0);
    expect(g.act(0).try.action(tap(g, [], '')).ok).toBe(true);
    g.expect.tapped(DRUID, true);
    g.expect.life(0, 18);
    g.expect.pool(0, '');
  });

  test('the Druid tapped, or a player with less than 2 life, is offered nothing (CR 119.4)', () => {
    const g = withTokens([SWARM], () => undefined);
    expect(offered(g).length).toBeGreaterThan(0);
    g.choose(0, tap(g, [], '')); // the Druid is tapped now, with X = 0
    expect(offered(g)).toHaveLength(0);
    const low = scenario()
      .seat(0)
      .life(1)
      .battlefield(DRUID, { label: 'druid' })
      .battlefield(FOREST)
      .hand(SWARM)
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains', 'Plains')
      .at('precombatMain')
      .build();
    low.act(0).cast(SWARM, { pay: true });
    low.passAll();
    expect(offered(low)).toHaveLength(0);
    expect(low.act(0).try.action(tap(low, tokensOf(low, 0).slice(0, 1), 'G')).ok).toBe(false);
    low.expect.life(0, 1);
  });
});

describe('X from 0 to every token, with any mix of colors (CR 107.3, 106.1b, 605.3b)', () => {
  test('X = 4: one mana of each of four colors; the Druid and the four tokens are tapped and 2 life paid', () => {
    const g = withTokens([SWARM], () => undefined);
    const tokens = tokensOf(g, 0);
    g.choose(0, tap(g, tokens, 'WUBR'));
    g.expect.pool(0, 'WUBR');
    g.expect.tapped(DRUID, true);
    for (const id of tokens) expect(g.state.objects[id]?.tapped).toBe(true);
    g.expect.life(0, 18);
    g.expect.invariants();
  });

  test('X = 3 of 4: all one color, and the token left out stays untapped', () => {
    const g = withTokens([SWARM], () => undefined);
    const tokens = tokensOf(g, 0);
    g.choose(0, tap(g, tokens.slice(0, 3), 'GGG'));
    g.expect.pool(0, 'GGG');
    expect(tokens.map((id) => g.state.objects[id]?.tapped)).toEqual([true, true, true, false]);
  });

  test('X = 2: a mix of two colors, named in any order, is the same two mana', () => {
    const g = withTokens([SWARM], () => undefined);
    g.choose(0, tap(g, tokensOf(g, 0).slice(1, 3), 'RW'));
    g.expect.pool(0, 'WR');
  });

  test('X = 1 and X = 0', () => {
    const g = withTokens([SWARM], () => undefined);
    g.choose(0, tap(g, tokensOf(g, 0).slice(0, 1), 'U'));
    g.expect.pool(0, 'U');
    const h = withTokens([SWARM], () => undefined);
    h.choose(0, tap(h, [], ''));
    h.expect.pool(0, '');
    h.expect.tapped(DRUID, true);
    h.expect.life(0, 18);
    expect(tokensOf(h, 0).every((id) => h.state.objects[id]?.tapped === false)).toBe(true);
  });

  test('every offered option is a play the engine takes', () => {
    const options = offered(withTokens([SWARM], () => undefined));
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) {
      // A fresh game for each: the same scenario gives the same ids, and the Druid is tapped after one.
      const fresh = withTokens([SWARM], () => undefined);
      expect(fresh.act(0).try.action(o).ok).toBe(true);
    }
  });

  test('twenty tokens, a combination of all five colors: no cap on X or on the mix', () => {
    const g = withTokens([SWARM, SWARM, SWARM, SWARM, SWARM], () => undefined);
    const tokens = tokensOf(g, 0);
    const mix = 'WWWWUUUUBBBBRRRRGGGG';
    g.choose(0, tap(g, tokens, mix));
    g.expect.pool(0, { W: 4, U: 4, B: 4, R: 4, G: 4 });
    expect(tokens.every((id) => g.state.objects[id]?.tapped === true)).toBe(true);
    g.expect.invariants();
  });
});

describe('which permanents may be tapped (CR 118.3, 302.6)', () => {
  test('a token that came under control this turn may be tapped (it is the Druid’s {T} that needs a turn)', () => {
    const g = withTokens([SWARM], () => undefined);
    expect(
      tokensOf(g, 0).every((id) => {
        const o = g.state.objects[id];
        return o !== undefined && o.zone === 'battlefield';
      }),
    ).toBe(true);
    expect(g.act(0).try.action(tap(g, tokensOf(g, 0), 'WWWW')).ok).toBe(true);
  });

  test('the Druid that came under control this turn cannot pay its own {T}', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(DRUID, { fresh: true }).battlefield(FOREST).hand(SWARM),
    );
    g.act(0).cast(SWARM, { pay: true });
    g.passAll();
    expect(offered(g)).toHaveLength(0);
    const r = g.act(0).try.action(tap(g, tokensOf(g, 0).slice(0, 1), 'G'));
    expect(r.ok).toBe(false);
    g.expect.life(0, 20);
  });

  test('a tapped token is not one to tap', () => {
    const g = withTokens([TIRED, SWARM], () => undefined);
    const all = tokensOf(g, 0);
    expect(all).toHaveLength(6);
    const tapped = all.filter((id) => g.state.objects[id]?.tapped === true);
    expect(tapped).toHaveLength(2);
    const before = g.positionHash();
    expect(g.act(0).try.action(tap(g, tapped, 'GG')).ok).toBe(false);
    g.expect.position(before);
    // Only the four untapped tokens are in the plays on offer.
    const untapped = all.filter((id) => g.state.objects[id]?.tapped === false);
    for (const o of offered(g))
      expect(o.kind === 'activateAbility' && o.tappedMany).toEqual(untapped);
  });

  test('a Treasure is a token, so it counts; a creature that is not a token does not', () => {
    const g = withTokens([COINS], (b) => b.battlefield(BEARS));
    const tokens = tokensOf(g, 0);
    expect(tokens).toHaveLength(2);
    expect(g.act(0).try.action(tap(g, [g.id(BEARS)], 'G')).ok).toBe(false);
    expect(g.act(0).try.action(tap(g, [...tokens, g.id(BEARS)], 'GGG')).ok).toBe(false);
    g.choose(0, tap(g, tokens, 'BR'));
    g.expect.pool(0, 'BR');
    g.expect.tapped(BEARS, false);
  });

  test('the Druid is not one of the permanents it taps, whatever its own kind', () => {
    const g = withTokens([SWARM], () => undefined);
    const before = g.positionHash();
    expect(g.act(0).try.action(tap(g, [g.id(DRUID)], 'G')).ok).toBe(false);
    g.expect.position(before);
  });
});

describe('a play the engine refuses changes nothing (stale or invented)', () => {
  const refused = (g: ScenarioGame, action: Action): void => {
    const before = g.positionHash();
    const hashBefore = g.hash();
    expect(g.act(0).try.action(action).ok).toBe(false);
    g.expect.position(before);
    expect(g.hash()).toBe(hashBefore);
  };

  test('X and the combination must agree, the colors are the five, and no permanent twice', () => {
    const g = withTokens([SWARM], () => undefined);
    const [a, b, c] = tokensOf(g, 0);
    if (a === undefined || b === undefined || c === undefined) throw new Error('no tokens');
    refused(g, tap(g, [a, b], 'G')); // two permanents, one mana
    refused(g, tap(g, [a], 'GG')); // one permanent, two mana
    refused(g, tap(g, [a, b], 'GC')); // colorless is not a color
    refused(g, tap(g, [a, a], 'GG')); // the same permanent twice
    refused(g, {
      kind: 'activateAbility',
      source: g.id(DRUID),
      abilityIndex: MANA,
      color: 'G',
      tappedMany: [a],
    });
    refused(g, { ...tap(g, [a], 'G'), tapped: b });
    refused(g, tap(g, ['o999999'], 'G')); // not in the game
    refused(g, { ...tap(g, [a, b, c], 'GGG'), abilityIndex: 7 });
  });

  test('a play named twice: the second is refused, as the Druid and the tokens are tapped now', () => {
    const g = withTokens([SWARM], () => undefined);
    const action = tap(g, tokensOf(g, 0), 'WUBG');
    g.choose(0, action);
    refused(g, action);
    refused(g, tap(g, [], ''));
  });

  test('a token that left the battlefield is no longer one to tap', () => {
    const g = withTokens([SWARM], () => undefined);
    const [a, b] = tokensOf(g, 0);
    if (a === undefined || b === undefined) throw new Error('no tokens');
    const stale = tap(g, [a, b], 'GG');
    const gone: GameState = {
      ...g.state,
      battlefield: g.state.battlefield.filter((id) => id !== b),
    };
    const r = applyAction(gone, 0, stale);
    expect(r.ok).toBe(false);
    // With the token still there the same play is taken.
    expect(applyAction(g.state, 0, stale).ok).toBe(true);
  });

  test('an opponent’s tokens and the permanents of a table of four are never to be tapped', () => {
    const g = scenario({ seats: 4 })
      .seat(0)
      .life(20)
      .battlefield(DRUID)
      .battlefield(FOREST)
      .hand(SWARM)
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .life(20)
      .battlefield(FOREST)
      .hand(SWARM)
      .library('Plains', 'Plains', 'Plains')
      .seat(2)
      .life(20)
      .library('Plains', 'Plains', 'Plains')
      .seat(3)
      .life(20)
      .library('Plains', 'Plains', 'Plains')
      .at('precombatMain')
      .build();
    g.act(0).cast(SWARM, { pay: true });
    g.passAll();
    // The opponent makes tokens too, on their own turn's priority: put them in by casting once seat 1 has priority.
    const mine = tokensOf(g, 0);
    expect(mine).toHaveLength(4);
    const options = offered(g);
    for (const o of options) expect(o.kind === 'activateAbility' && o.tappedMany).toEqual(mine);
    // Naming an opponent's permanent is refused, whatever it is.
    const theirs = g.state.battlefield.filter((id) => g.state.objects[id]?.controller === 1);
    expect(theirs.length).toBeGreaterThan(0);
    refused(g, tap(g, theirs.slice(0, 1), 'G'));
    refused(g, tap(g, [...mine.slice(0, 1), ...theirs.slice(0, 1)], 'GG'));
    // A seat that does not hold priority cannot use it either.
    const before = g.positionHash();
    expect(g.act(1).try.action(tap(g, mine, 'GGGG')).ok).toBe(false);
    g.expect.position(before);
  });
});

describe('life (CR 119.4)', () => {
  test('a player with exactly 2 life can pay it and is at 0; with 1 life the cost cannot be paid', () => {
    const make = (life: number) =>
      scenario()
        .seat(0)
        .life(life)
        .battlefield(DRUID)
        .battlefield(FOREST)
        .hand(SWARM)
        .library('Plains', 'Plains', 'Plains')
        .seat(1)
        .life(20)
        .library('Plains', 'Plains', 'Plains')
        .at('precombatMain')
        .build();
    const one = make(1);
    one.act(0).cast(SWARM, { pay: true });
    one.passAll();
    expect(one.act(0).try.action(tap(one, tokensOf(one, 0), 'GGGG')).ok).toBe(false);
    one.expect.life(0, 1);
    const three = make(3);
    three.act(0).cast(SWARM, { pay: true });
    three.passAll();
    three.choose(0, tap(three, tokensOf(three, 0), 'GGGG'));
    three.expect.life(0, 1);
    three.expect.pool(0, 'GGGG');
  });
});

describe('the mana pays for a spell (CR 605.3a, 601.2g)', () => {
  /** A Druid, two Forests to make six tokens with, and a spell that needs all five colors. */
  const board = () => {
    const g = twoSeatGame((b) =>
      b.battlefield(DRUID).battlefield(FOREST).battlefield(FOREST).hand(SWARM, COINS, PRISM),
    );
    g.act(0).cast(SWARM, { pay: true });
    g.passAll();
    g.act(0).cast(COINS, { pay: true });
    g.passAll();
    return g;
  };

  test('activated at priority, the mana waits in the pool and pays the spell with payAuto', () => {
    const g = board();
    expect(tokensOf(g, 0)).toHaveLength(6);
    // Only the Druid and the tokens are left to pay with, and the planner does not tap the Druid: the spell cannot be cast yet.
    expect(
      getLegalActions(g.state, 0).some((a) => a.kind === 'castSpell' && a.object === g.id(PRISM)),
    ).toBe(false);
    g.choose(0, tap(g, tokensOf(g, 0).slice(0, 5), 'WUBRG'));
    expect(
      getLegalActions(g.state, 0).some((a) => a.kind === 'castSpell' && a.object === g.id(PRISM)),
    ).toBe(true);
    g.act(0).cast(PRISM, { pay: true });
    g.passAll();
    g.expect.life(0, 18 + 1);
    g.expect.invariants();
  });

  test('named in a payManual of a spell, it is activated as the cost is paid (the planner would have used the Forest)', () => {
    const g = twoSeatGame((b) =>
      b
        .battlefield(DRUID)
        .battlefield(FOREST)
        .battlefield(FOREST)
        .battlefield(FOREST)
        .hand(SWARM, SWARM),
    );
    g.act(0).cast({ name: SWARM, nth: 0 }, { pay: true });
    g.passAll();
    g.act(0).cast(SWARM);
    g.expect.pending('payMana', 0);
    const one = tokensOf(g, 0).slice(0, 1);
    g.choose(0, {
      kind: 'payManual',
      taps: [{ object: g.id(DRUID), abilityIndex: MANA, combination: ['G'], tappedMany: one }],
    });
    g.passAll();
    g.expect.life(0, 18);
    g.expect.tapped(DRUID, true);
    expect(tokensOf(g, 0)).toHaveLength(8);
    // The Forests were not needed for the second cast: one of the three paid the first, so two are untapped.
    expect(g.find({ name: FOREST, zone: 'battlefield' }).filter((o) => !o.tapped)).toHaveLength(2);
  });

  test('payAuto never taps the Druid, so a spell that only it could pay for is not cast by the planner', () => {
    const g = board();
    const before = g.positionHash();
    expect(
      getLegalActions(g.state, 0).some((a) => a.kind === 'castSpell' && a.object === g.id(PRISM)),
    ).toBe(false);
    expect(g.act(0).try.cast(PRISM).ok).toBe(false);
    g.expect.position(before);
  });
});

describe('determinism', () => {
  test('the same plays from the same position reach the same state', () => {
    const run = () => {
      const g = withTokens([SWARM], () => undefined);
      g.choose(0, tap(g, tokensOf(g, 0).slice(0, 2), 'BG'));
      return g;
    };
    const a = run();
    const b = run();
    expect(a.hash()).toBe(b.hash());
    expect(JSON.stringify(a.legalActions(0))).toBe(JSON.stringify(b.legalActions(0)));
  });
});
