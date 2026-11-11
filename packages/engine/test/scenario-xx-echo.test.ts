// Echo (CR 702.30, D-127): "At the beginning of your upkeep, if this permanent came under your control since the
// beginning of your last upkeep, sacrifice it unless you pay [cost]." `derive` expands the keyword into a triggered
// ability with an intervening "if" (CR 603.4) whose effect is `unlessPays` with the sacrifice (CR 118.12a).
// Pins: CR 702.30a (the whole ability), CR 603.4 (the condition is checked as the ability triggers and as it
// resolves), CR 118.3 (a cost that cannot be paid is not paid: nobody is asked), CR 400.7 (a permanent that left and
// came back is a new object: it is due again at the next upkeep, and the old trigger has nothing to sacrifice),
// CR 702.30a again for two instances (each triggers on its own), CR 603.3b (the controller orders them).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-upkeep.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import {
  applyAction,
  getLegalActions,
  isFeatureSupported,
  SUPPORTED_FEATURES,
  stateHash,
  syntheticCard,
  validateCard,
} from '../src/index';
import { scenario } from '../src/testing/index';

const HOUND = 'SYNTHETIC Echo Hound'; // {1}{R} 3/1, echo {1}{R}
const GIANT = 'SYNTHETIC Echo Giant'; // {3}{G} 4/4, echo {G}
const TWINS = 'SYNTHETIC Echo Twins'; // 2/2, echo {W} and echo {1}
const RELIC = 'SYNTHETIC Echo Relic'; // artifact, echo {2}
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

/**
 * Seat 0 controls what `place` adds, as a game in the postcombat main phase of seat 1's turn 2; `advanceTo` walks to
 * seat 0's upkeep of turn 3.
 */
function toUpkeep(place: (b: Builder) => Builder, opponent: (b: Builder) => Builder = (b) => b) {
  const mine = place(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  );
  const g = opponent(mine.seat(1).library(...FILLER))
    .at('postcombatMain', { active: 1, turn: 2 })
    .build();
  g.advanceTo('upkeep', { turn: 'next' });
  return g;
}

/** How many lands seat 0 controls that are tapped. */
const tappedLands = (g: ReturnType<typeof toUpkeep>): number =>
  g.state.battlefield.filter((id) => {
    const o = g.state.objects[id];
    return o?.tapped === true && o.controller === 0 && o.token === null && o !== undefined;
  }).length;

/** Resolves the top of the stack: both players pass. */
const resolveTop = (g: ReturnType<typeof toUpkeep>): void => {
  g.pass();
  g.pass();
};

describe('the trigger and its intervening "if" (CR 702.30a, 603.4)', () => {
  test('a permanent that came under your control since your last upkeep triggers at your next one', () => {
    const g = toUpkeep((b) => b.battlefield(HOUND, { fresh: true }));
    g.expect.step('upkeep', { active: 0, turn: 3 });
    g.expect.stack([`${HOUND} (ability)`]);
    g.expect.pending('priority', 0);
  });

  test('one that has been yours since before your last upkeep does not trigger (it paid already)', () => {
    const g = toUpkeep((b) => b.battlefield(HOUND));
    g.expect.stack([]);
    g.expect.noEvent({ kind: 'abilityTriggered' });
  });

  test('it does not trigger at the opponent’s upkeep: the ability says "your upkeep"', () => {
    const g = scenario()
      .seat(0)
      .battlefield(HOUND, { fresh: true })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('postcombatMain', { active: 0, turn: 1 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1, turn: 2 });
    g.expect.stack([]);
  });

  test('a noncreature permanent has it too (CR 702.30a says "this permanent")', () => {
    const g = toUpkeep((b) => b.battlefield(RELIC, { fresh: true }));
    g.expect.stack([`${RELIC} (ability)`]);
  });

  test('the keyword is read as a permanent that is cast: it is due at the next upkeep, and only then', () => {
    // Cast in seat 0's main phase of turn 1 (so it came under control after the beginning of that turn).
    const g = scenario()
      .seat(0)
      .life(20)
      .hand(GIANT)
      .battlefield('Forest', { count: 4 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(GIANT, { pay: true });
    g.pass();
    g.pass();
    g.expect.zone(GIANT, 'battlefield');
    // The opponent's turn and its upkeep: nothing. Then seat 0's turn 3.
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.stack([]);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 0, turn: 3 });
    g.expect.stack([`${GIANT} (ability)`]);
  });
});

describe('the question and the payment (CR 118.12a, 118.3)', () => {
  test('the controller is asked as the ability resolves, with the cost and the echo marker', () => {
    const g = toUpkeep((b) =>
      b.battlefield(HOUND, { fresh: true }).battlefield('Mountain', { count: 2 }),
    );
    resolveTop(g);
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error(`expected confirmOptional, got ${d?.kind}`);
    expect(d.seat).toBe(0);
    expect(d.purpose).toBe('unlessPays');
    expect(d.upkeep).toBe('echo');
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['1', 'R'] }]);
    expect(getLegalActions(g.state, 0).map((a) => a.kind)).toEqual([
      'acceptOptional',
      'declineOptional',
      'concede',
    ]);
    expect(getLegalActions(g.state, 1)).toEqual([]);
  });

  test('paying keeps the permanent, taps the lands, and it is not asked again at the next upkeep', () => {
    const g = toUpkeep((b) =>
      b.battlefield(HOUND, { fresh: true }).battlefield('Mountain', { count: 2 }),
    );
    resolveTop(g);
    g.act(0).accept();
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error(`expected payMana, got ${d?.kind}`);
    expect(d.purpose).toBe('unlessPays');
    expect(d.upkeep).toBe('echo');
    expect(d.totalCost).toEqual(['1', 'R']);
    g.act(0).payAuto();
    g.expect.zone(HOUND, 'battlefield');
    expect(tappedLands(g)).toBe(2);
    g.expect.noEvent({ kind: 'sacrificed' });
    // CR 702.30a: it has been under control since before this upkeep began, so the next one is free.
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 0, turn: 5 });
    g.expect.stack([]);
  });

  test('declining sacrifices it', () => {
    const g = toUpkeep((b) =>
      b.battlefield(HOUND, { fresh: true }).battlefield('Mountain', { count: 2 }),
    );
    resolveTop(g);
    g.act(0).decline();
    g.expect.zone(HOUND, 'graveyard');
    expect(tappedLands(g)).toBe(0);
    g.expect.eventLog([
      { kind: 'optionalAnswered', accepted: false },
      { kind: 'zoneChanged', fromZone: 'battlefield', toZone: 'graveyard' },
    ]);
  });

  test('backing out of the payment (cancel) is not paying: it is sacrificed', () => {
    const g = toUpkeep((b) =>
      b.battlefield(HOUND, { fresh: true }).battlefield('Mountain', { count: 2 }),
    );
    resolveTop(g);
    g.act(0).accept();
    g.act(0).cancel();
    g.expect.zone(HOUND, 'graveyard');
    expect(tappedLands(g)).toBe(0);
  });

  test('with the mana out of reach nobody is asked and it is sacrificed at once (CR 118.3)', () => {
    const g = toUpkeep((b) => b.battlefield(HOUND, { fresh: true }).battlefield('Mountain'));
    resolveTop(g);
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.zone(HOUND, 'graveyard');
    g.expect.noEvent({ kind: 'optionalAnswered' });
  });

  test('a land that cannot pay the cost is refused in a manual payment, a right one pays', () => {
    const g = toUpkeep((b) =>
      b.battlefield(GIANT, { fresh: true }).battlefield('Island').battlefield('Forest'),
    );
    resolveTop(g);
    g.act(0).accept();
    const island = g.id({ name: 'Island', zone: 'battlefield', seat: 0 });
    const forest = g.id({ name: 'Forest', zone: 'battlefield', seat: 0 });
    expect(
      g.act(0).try.action({ kind: 'payManual', taps: [{ object: island, abilityIndex: 0 }] }).ok,
    ).toBe(false);
    g.act(0).choose({ kind: 'payManual', taps: [{ object: forest, abilityIndex: 0 }] });
    g.expect.zone(GIANT, 'battlefield');
  });

  test('the legal actions of every question agree with applyAction', () => {
    const g = toUpkeep((b) =>
      b.battlefield(HOUND, { fresh: true }).battlefield('Mountain', { count: 2 }),
    );
    resolveTop(g);
    for (const a of getLegalActions(g.state, 0)) {
      expect(applyAction(g.state, 0, a).ok, a.kind).toBe(true);
    }
    g.act(0).accept();
    for (const a of getLegalActions(g.state, 0)) {
      expect(applyAction(g.state, 0, a).ok, a.kind).toBe(true);
    }
  });
});

describe('a permanent that left and came back, or changed hands (CR 400.7, 603.4)', () => {
  test('bounced in response, the old trigger is removed as it resolves and nobody is asked', () => {
    const g = toUpkeep(
      (b) => b.battlefield(HOUND, { fresh: true }).battlefield('Mountain', { count: 2 }),
      (b) => b.hand('Unsummon').battlefield('Island'),
    );
    g.expect.stack([`${HOUND} (ability)`]);
    g.pass(0);
    g.act(1).cast('Unsummon', { targets: [{ name: HOUND }], pay: true });
    g.pass();
    g.pass();
    // Unsummon resolved: the Hound is in its owner's hand. The echo trigger resolves next.
    g.expect.zone(HOUND, 'hand');
    g.expect.stack([`${HOUND} (ability)`]);
    g.pass();
    g.pass();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.zone(HOUND, 'hand');
    g.expect.eventLog([{ kind: 'fizzled', reason: 'interveningIf' }]);
    g.expect.noEvent({ kind: 'optionalAnswered' });
  });

  test('recast after that, the new object pays at the upkeep after the one it was cast in', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .hand(HOUND)
      .battlefield('Mountain', { count: 4 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(HOUND, { pay: true });
    g.pass();
    g.pass();
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 0, turn: 3 });
    g.expect.stack([`${HOUND} (ability)`]);
  });

  test('a permanent its owner does not control triggers for its controller, at the controller’s upkeep (CR 702.30a "your")', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .battlefield(HOUND, { fresh: true, controller: 1 })
      .at('postcombatMain', { active: 0, turn: 1 })
      .build();
    // Seat 0 owns it but seat 1 controls it: the trigger is seat 1's, at seat 1's upkeep.
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1, turn: 2 });
    g.expect.stack([`${HOUND} (ability)`]);
    expect(g.object({ name: HOUND }).controller).toBe(1);
    const top = g.state.stack[g.state.stack.length - 1];
    expect(top === undefined ? null : g.state.objects[top]?.controller).toBe(1);
  });
});

describe('two instances (CR 702.30a: each triggers on its own)', () => {
  const twins = (lands: readonly string[]) =>
    toUpkeep((b) => b.battlefield(TWINS, { fresh: true }).battlefield(...lands));

  test('both trigger, and the controller orders them', () => {
    const g = twins(['Plains', 'Plains']);
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.expect.stack([`${TWINS} (ability)`, `${TWINS} (ability)`]);
  });

  test('each is paid for on its own', () => {
    const g = twins(['Plains', 'Plains']);
    g.act(0).orderTriggers(0, 1);
    resolveTop(g);
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.zone(TWINS, 'battlefield');
    resolveTop(g);
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.zone(TWINS, 'battlefield');
    expect(tappedLands(g)).toBe(2);
  });

  test('paying one and not the other still sacrifices it', () => {
    const g = twins(['Plains', 'Plains']);
    g.act(0).orderTriggers(0, 1);
    resolveTop(g);
    g.act(0).accept();
    g.act(0).payAuto();
    resolveTop(g);
    g.act(0).decline();
    g.expect.zone(TWINS, 'graveyard');
  });

  test('with only the mana for one, the second is not asked and it is sacrificed', () => {
    const g = twins(['Plains']);
    g.act(0).orderTriggers(0, 1);
    resolveTop(g);
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.zone(TWINS, 'battlefield');
    resolveTop(g);
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.zone(TWINS, 'graveyard');
  });
});

describe('the engine reports and refuses it honestly (CR 702.30a)', () => {
  test('the keyword, the condition and the cost kinds are in SUPPORTED_FEATURES', () => {
    expect(SUPPORTED_FEATURES.keywordKinds).toContain('echo');
    expect(SUPPORTED_FEATURES.conditionKinds).toContain('cameUnderControlSinceLastUpkeep');
    expect(isFeatureSupported('keyword:echo')).toBe(true);
    expect(isFeatureSupported('condition:cameUnderControlSinceLastUpkeep')).toBe(true);
  });

  const withCost = (cost: unknown) => {
    const base = syntheticCard(HOUND);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    return {
      ...base,
      faces: [{ ...face, abilities: [{ kind: 'keyword', keyword: { kind: 'echo', cost } }] }],
    } as never;
  };

  test('a fixture card validates', () => {
    for (const name of [HOUND, GIANT, TWINS, RELIC]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
  });

  test('a cost that is not mana is refused with a reason', () => {
    const result = validateCard(withCost([{ kind: 'payLife', amount: 2 }]));
    expect(JSON.stringify(result)).toContain('payLife');
    expect(JSON.stringify(result)).toContain('not implemented');
  });

  test('X in the cost is refused with a reason', () => {
    const result = validateCard(withCost([{ kind: 'mana', symbols: ['X', 'R'] }]));
    expect(JSON.stringify(result)).toContain('X in the cost of a keyword');
  });

  test('an empty cost is refused', () => {
    expect(JSON.stringify(validateCard(withCost([])))).toContain('needs a cost to pay');
  });

  test('the condition outside "your upkeep" is refused', () => {
    const base = syntheticCard(HOUND);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    const card = {
      ...base,
      faces: [
        {
          ...face,
          abilities: [
            {
              kind: 'triggered',
              trigger: { kind: 'endStep', whose: 'you' },
              interveningIf: { kind: 'cameUnderControlSinceLastUpkeep' },
              effect: {
                kind: 'gainLife',
                player: { kind: 'you' },
                amount: { kind: 'number', value: 1 },
              },
            },
          ],
        },
      ],
    } as never;
    expect(JSON.stringify(validateCard(card))).toContain('beginning of your upkeep');
  });
});

describe('determinism', () => {
  test('the same actions give the same state hash', () => {
    const play = () => {
      const g = toUpkeep((b) =>
        b.battlefield(HOUND, { fresh: true }).battlefield('Mountain', { count: 2 }),
      );
      resolveTop(g);
      g.act(0).accept();
      g.act(0).payAuto();
      return stateHash(g.state);
    };
    expect(play()).toBe(play());
  });
});
