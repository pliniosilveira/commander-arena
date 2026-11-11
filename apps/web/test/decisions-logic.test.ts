import type {
  ChosenTarget,
  DamageChoice,
  DeclareAttackersDecision,
  DeclareBlockersDecision,
  GameView,
  ObjectId,
  PriorityDecision,
  TargetChoiceSpec,
} from '@commander-arena/engine';
import { defaultDivision } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import {
  allOut,
  attackableSeats,
  attackButtonLabel,
  retargetToSeat,
  setAttackTarget,
  toggleAttacker,
} from '../src/ui/decisions/attack';
import {
  blockableAttackers,
  blockButtonLabel,
  blockProblems,
  clickAttacker,
  clickBlocker,
  NO_BLOCKS,
} from '../src/ui/decisions/block';
import { toggleCard } from '../src/ui/decisions/cards';
import {
  amountTo,
  bump,
  divisionComplete,
  divisionHints,
  recipientsOf,
  remainingFor,
  setAmount,
} from '../src/ui/decisions/damage';
import { clickSource, type Tap } from '../src/ui/decisions/payment';
import {
  clickOutcome,
  passLabel,
  playableObjects,
  priorityPrompt,
} from '../src/ui/decisions/priority';
import {
  allLegalTargets,
  clickableTargets,
  currentSlot,
  targetsReady,
  toggleTarget,
} from '../src/ui/decisions/targeting';

const o = (n: number): ObjectId => `o${n}`;

describe('attackers', () => {
  const candidates: DeclareAttackersDecision['candidates'] = [
    {
      attacker: o(1),
      targets: [
        { kind: 'permanent', object: o(9) },
        { kind: 'player', seat: 1 },
      ],
    },
    { attacker: o(2), targets: [{ kind: 'player', seat: 1 }] },
    { attacker: o(3), targets: [] },
  ];

  test('a toggled attacker defaults to the player, never to a target it was not offered', () => {
    const picks = toggleAttacker([], candidates, o(1), null);
    expect(picks).toEqual([{ attacker: o(1), target: { kind: 'player', seat: 1 } }]);
    expect(toggleAttacker(picks, candidates, o(1), null)).toEqual([]);
    expect(toggleAttacker([], candidates, o(3), null)).toEqual([]);
    expect(toggleAttacker([], candidates, o(7), null)).toEqual([]);
    // A preferred target that the creature cannot attack is ignored.
    expect(toggleAttacker([], candidates, o(2), { kind: 'player', seat: 5 })[0]?.target).toEqual({
      kind: 'player',
      seat: 1,
    });
  });

  test('setAttackTarget only accepts offered targets', () => {
    const picks = toggleAttacker([], candidates, o(1), null);
    const pw = { kind: 'permanent', object: o(9) } as const;
    expect(setAttackTarget(picks, candidates, o(1), pw)[0]?.target).toEqual(pw);
    expect(setAttackTarget(picks, candidates, o(1), { kind: 'permanent', object: o(8) })).toBe(
      picks,
    );
    const other = toggleAttacker([], candidates, o(2), null);
    expect(setAttackTarget(other, candidates, o(2), pw)).toBe(other);
  });

  test('all out and retargeting by clicking a player', () => {
    const picks = allOut(candidates, { kind: 'permanent', object: o(9) });
    expect(picks.map((p) => p.attacker)).toEqual([o(1), o(2)]);
    expect(picks[0]?.target).toEqual({ kind: 'permanent', object: o(9) });
    expect(picks[1]?.target).toEqual({ kind: 'player', seat: 1 });
    const back = retargetToSeat(picks, candidates, 1);
    expect(back.every((p) => p.target.kind === 'player')).toBe(true);
    expect(attackableSeats(candidates)).toEqual(new Set([1]));
  });

  test('button label', () => {
    expect(attackButtonLabel(0)).toBe('No Attack');
    expect(attackButtonLabel(2)).toBe('Declare attackers (2)');
  });
});

describe('blockers', () => {
  const candidates: DeclareBlockersDecision['candidates'] = [
    { blocker: o(1), canBlock: [o(10), o(11)] },
    { blocker: o(2), canBlock: [o(11)] },
    { blocker: o(3), canBlock: [o(10)] },
  ];
  const attackers: DeclareBlockersDecision['attackers'] = [
    { attacker: o(10), target: { kind: 'player', seat: 0 }, minBlockers: 1 },
    { attacker: o(11), target: { kind: 'player', seat: 0 }, minBlockers: 2 },
  ];

  test('select a blocker, then assign it to an attacker it can block', () => {
    let s = clickBlocker(NO_BLOCKS, candidates, o(2));
    expect(s.blocker).toBe(o(2));
    expect(blockableAttackers(s, candidates)).toEqual([o(11)]);
    // An attacker it cannot block is refused and the selection stays.
    expect(clickAttacker(s, candidates, o(10))).toBe(s);
    s = clickAttacker(s, candidates, o(11));
    expect(s.blocks).toEqual([{ blocker: o(2), attacker: o(11) }]);
    expect(s.blocker).toBeNull();
  });

  test('a click on an attacker without a selected blocker does nothing', () => {
    expect(clickAttacker(NO_BLOCKS, candidates, o(10))).toBe(NO_BLOCKS);
  });

  test('clicking an assigned blocker unassigns it; clicking a selected one deselects it', () => {
    let s = clickBlocker(NO_BLOCKS, candidates, o(1));
    s = clickAttacker(s, candidates, o(10));
    s = clickBlocker(s, candidates, o(1));
    expect(s.blocks).toEqual([]);
    s = clickBlocker(s, candidates, o(1));
    s = clickBlocker(s, candidates, o(1));
    expect(s.blocker).toBeNull();
    // A creature that cannot block is not selectable.
    expect(clickBlocker(NO_BLOCKS, candidates, o(99))).toBe(NO_BLOCKS);
  });

  test('reassigning a blocker moves it', () => {
    let s = clickBlocker(NO_BLOCKS, candidates, o(1));
    s = clickAttacker(s, candidates, o(10));
    // Unassign by clicking, pick up again and send it elsewhere.
    s = clickBlocker(s, candidates, o(1));
    s = clickBlocker(s, candidates, o(1));
    s = clickAttacker(s, candidates, o(11));
    expect(s.blocks).toEqual([{ blocker: o(1), attacker: o(11) }]);
  });

  test('menace: one blocker on an attacker that needs two is a problem, none or two is not', () => {
    const one = [{ blocker: o(1), attacker: o(11) }];
    expect(blockProblems(attackers, one)).toEqual([{ attacker: o(11), have: 1, need: 2 }]);
    expect(blockProblems(attackers, [])).toEqual([]);
    expect(blockProblems(attackers, [...one, { blocker: o(2), attacker: o(11) }])).toEqual([]);
    expect(blockProblems(attackers, [{ blocker: o(3), attacker: o(10) }])).toEqual([]);
  });

  test('button label', () => {
    expect(blockButtonLabel(0)).toBe('No Blocks');
    expect(blockButtonLabel(3)).toBe('Block (3)');
  });
});

describe('targeting', () => {
  const t = (id: number, specId: string): ChosenTarget => ({ kind: 'object', id: o(id), specId });
  const specs: TargetChoiceSpec[] = [
    {
      specId: 'a',
      min: 1,
      max: 1,
      legal: [t(1, 'a'), t(2, 'a'), { kind: 'player', seat: 1, specId: 'a' }],
    },
    { specId: 'b', min: 0, max: 2, legal: [t(2, 'b'), t(3, 'b')] },
  ];

  test('picks fill the first open slot where the target is legal', () => {
    let picks = toggleTarget(specs, [], t(2, ''));
    expect(picks).toEqual([t(2, 'a')]);
    // Slot a is full, so the same target type goes to slot b only if legal there.
    picks = toggleTarget(specs, picks, t(3, ''));
    expect(picks).toEqual([t(2, 'a'), t(3, 'b')]);
    // Not legal anywhere that has room: ignored.
    expect(toggleTarget(specs, picks, t(1, ''))).toBe(picks);
  });

  test('a chosen target is taken back by clicking it', () => {
    const picks = toggleTarget(specs, [], t(1, ''));
    expect(toggleTarget(specs, picks, t(1, ''))).toEqual([]);
  });

  test('players are targets too', () => {
    const picks = toggleTarget(specs, [], { kind: 'player', seat: 1, specId: '' });
    expect(picks).toEqual([{ kind: 'player', seat: 1, specId: 'a' }]);
  });

  test('ready only when every slot is within its bounds', () => {
    expect(targetsReady(specs, [])).toBe(false);
    expect(targetsReady(specs, [t(1, 'a')])).toBe(true);
    expect(targetsReady(specs, [t(1, 'a'), t(3, 'b'), t(2, 'b')])).toBe(true);
    expect(targetsReady(specs, [t(1, 'a'), t(3, 'b'), t(2, 'b'), t(4, 'b')])).toBe(false);
  });

  test('the current slot is the first below its minimum, then the first not full', () => {
    expect(currentSlot(specs, [])?.spec.specId).toBe('a');
    expect(currentSlot(specs, [t(1, 'a')])?.spec.specId).toBe('b');
    expect(currentSlot(specs, [t(1, 'a'), t(3, 'b'), t(2, 'b')])).toBeNull();
  });

  test('clickable targets: legal for open slots, plus chosen ones', () => {
    const picks = [t(1, 'a')];
    const { objects, seats } = clickableTargets(specs, picks);
    expect(objects).toEqual(new Set([o(1), o(2), o(3)]));
    // Slot a is full, so its player target is no longer offered.
    expect(seats.size).toBe(0);
    expect(clickableTargets(specs, []).seats).toEqual(new Set([1]));
  });

  test('allLegalTargets lists each target once', () => {
    expect(allLegalTargets(specs)).toHaveLength(4);
  });
});

describe('payment', () => {
  /** A click on a source that never asks a color. */
  const toggleTap = (
    taps: readonly Tap[],
    sources: Parameters<typeof clickSource>[1],
    object: ObjectId,
  ): readonly Tap[] => {
    const click = clickSource(taps, sources, object);
    if (click.kind !== 'taps') throw new Error('asked for a color');
    return click.taps;
  };
  const sources = [
    { object: o(1), abilityIndex: 0 },
    { object: o(2), abilityIndex: 0 },
    { object: o(2), abilityIndex: 1 },
  ];
  test('a single-ability source toggles, in tap order', () => {
    let taps = toggleTap([], sources, o(1));
    taps = toggleTap(taps, sources, o(2));
    expect(taps.map((x) => x.object)).toEqual([o(1), o(2)]);
    taps = toggleTap(taps, sources, o(1));
    expect(taps.map((x) => x.object)).toEqual([o(2)]);
  });
  test('a source with two abilities cycles through both and then off', () => {
    let taps = toggleTap([], sources, o(2));
    expect(taps).toEqual([{ object: o(2), abilityIndex: 0 }]);
    taps = toggleTap(taps, sources, o(2));
    expect(taps).toEqual([{ object: o(2), abilityIndex: 1 }]);
    expect(toggleTap(taps, sources, o(2))).toEqual([]);
  });
  test('an object that is not a source is ignored', () => {
    expect(toggleTap([], sources, o(5))).toEqual([]);
  });
});

describe('cards', () => {
  const hand = [o(1), o(2), o(3)];
  test('exactly count cards can be chosen', () => {
    let c = toggleCard([], hand, o(1), 2);
    c = toggleCard(c, hand, o(2), 2);
    expect(toggleCard(c, hand, o(3), 2)).toEqual([o(1), o(2)]);
    expect(toggleCard(c, hand, o(1), 2)).toEqual([o(2)]);
    expect(toggleCard([], hand, o(9), 2)).toEqual([]);
  });
});

describe('damage division', () => {
  const choice: DamageChoice = {
    source: o(1),
    power: 5,
    deathtouch: false,
    trample: true,
    blockers: [
      { object: o(2), lethal: 2 },
      { object: o(3), lethal: 2 },
    ],
    tramplesOver: { kind: 'player', seat: 0 },
  };

  test('starts from the engine default and sums to the power', () => {
    const start = defaultDivision([choice]);
    expect(remainingFor(choice, start)).toBe(0);
    expect(divisionComplete([choice], start)).toBe(true);
    expect(recipientsOf(choice)).toHaveLength(3);
  });

  test('steppers never go below zero or past the power', () => {
    const start = defaultDivision([choice]);
    const none = bump(start, choice, { kind: 'object', id: o(2) }, 99);
    expect(amountTo(none, o(1), { kind: 'object', id: o(2) })).toBe(2);
    let a = setAmount(start, choice, { kind: 'player', seat: 0 }, 0);
    expect(remainingFor(choice, a)).toBe(1);
    a = bump(a, choice, { kind: 'object', id: o(2) }, 5);
    expect(amountTo(a, o(1), { kind: 'object', id: o(2) })).toBe(3);
    expect(remainingFor(choice, a)).toBe(0);
    expect(
      amountTo(bump(a, choice, { kind: 'object', id: o(3) }, -5), o(1), {
        kind: 'object',
        id: o(3),
      }),
    ).toBe(0);
    expect(divisionComplete([choice], setAmount(a, choice, { kind: 'object', id: o(2) }, 0))).toBe(
      false,
    );
  });

  test('trampling before every blocker has lethal gets a hint', () => {
    const bad = [
      { source: o(1), to: { kind: 'object', id: o(2) }, amount: 1 },
      { source: o(1), to: { kind: 'player', seat: 0 }, amount: 4 },
    ] as const;
    expect(divisionHints([choice], bad)).toHaveLength(1);
    expect(divisionHints([choice], defaultDivision([choice]))).toEqual([]);
    const noTrample: DamageChoice = { ...choice, trample: false, tramplesOver: null };
    expect(divisionHints([noTrample], [])).toEqual([]);
  });
});

describe('priority', () => {
  const decision: PriorityDecision = {
    id: 'd1',
    seat: 0,
    kind: 'priority',
    options: [
      { kind: 'pass' },
      { kind: 'castSpell', object: o(1) },
      { kind: 'playLand', object: o(2) },
      { kind: 'activateAbility', source: o(3), abilityIndex: 0, color: null },
      { kind: 'activateAbility', source: o(4), abilityIndex: 0, color: 'W' },
      { kind: 'activateAbility', source: o(4), abilityIndex: 0, color: 'U' },
      { kind: 'concede' },
    ],
  };

  test('playable objects are the castable, playable and activatable ones', () => {
    expect(playableObjects(decision)).toEqual(new Set([o(1), o(2), o(3), o(4)]));
  });

  test('clicks cast, play, activate, or ask for a color', () => {
    expect(clickOutcome(decision, o(1))).toEqual({
      kind: 'act',
      action: { kind: 'castSpell', object: o(1) },
    });
    expect(clickOutcome(decision, o(2))).toEqual({
      kind: 'act',
      action: { kind: 'playLand', object: o(2) },
    });
    expect(clickOutcome(decision, o(3))).toEqual({
      kind: 'act',
      action: { kind: 'activateAbility', source: o(3), abilityIndex: 0, color: null },
    });
    const choose = clickOutcome(decision, o(4));
    expect(choose.kind).toBe('choose');
    if (choose.kind === 'choose') expect(choose.choices.map((c) => c.color)).toEqual(['W', 'U']);
    expect(clickOutcome(decision, o(50))).toEqual({ kind: 'none' });
  });

  const view = (patch: Partial<GameView>): GameView =>
    ({
      viewer: 0,
      activeSeat: 0,
      step: 'precombatMain',
      stack: [],
      battlefield: [],
      ...patch,
    }) as GameView;

  const permanent = (over: Record<string, unknown>) =>
    ({
      controller: 0,
      tapped: false,
      keywords: [],
      types: ['creature'],
      summoningSick: false,
      ...over,
    }) as never;

  test('with nothing that can attack the first main phase says Pass Turn (issue 34)', () => {
    expect(passLabel(view({}))).toBe('Pass Turn');
    const cannot = [
      permanent({ tapped: true }),
      permanent({ summoningSick: true }),
      permanent({ keywords: ['defender'] }),
      permanent({ controller: 1 }),
      permanent({ types: ['land'] }),
    ];
    for (const c of cannot) expect(passLabel(view({ battlefield: [c] }))).toBe('Pass Turn');
    // A Vehicle could be crewed to attack; a creature with haste is not summoning sick in the view.
    const vehicle = permanent({ types: ['artifact'], printedPt: { power: 4, toughness: 4 } });
    expect(passLabel(view({ battlefield: [vehicle] }))).toBe('To Combat');
    const fresh = permanent({
      types: ['artifact'],
      printedPt: { power: 4, toughness: 4 },
      wouldBeSummoningSick: true,
    });
    expect(passLabel(view({ battlefield: [fresh] }))).toBe('Pass Turn');
  });

  test('the pass button says what the pass does', () => {
    const bear = permanent({});
    expect(passLabel(view({ battlefield: [bear] }))).toBe('To Combat');
    expect(passLabel(view({ step: 'postcombatMain' }))).toBe('To End Step');
    expect(passLabel(view({ step: 'end' }))).toBe('End Turn');
    expect(passLabel(view({ step: 'cleanup' }))).toBe('End Turn');
    expect(passLabel(view({ step: 'beginningOfCombat' }))).toBe('To Declare Attackers');
    const item = { id: o(7), name: 'Bolt', controller: 1 } as never;
    expect(passLabel(view({ stack: [item] }))).toBe('Resolve');
    expect(passLabel(view({ activeSeat: 1, stack: [item] }))).toBe('Resolve');
  });

  describe('the button names the step it moves to (issue 42)', () => {
    const attacking = (blockedBy: string[] = []) => ({
      attackers: [{ object: o(1), target: { kind: 'player', seat: 1 }, blocked: false, blockedBy }],
    });
    const label = (patch: Record<string, unknown>) => passLabel(view(patch));

    test('on the viewer turn, every step', () => {
      expect(label({ step: 'upkeep' })).toBe('To Draw');
      expect(label({ step: 'draw' })).toBe('To First Main');
      expect(label({ step: 'beginningOfCombat' })).toBe('To Declare Attackers');
      expect(label({ step: 'declareAttackers', combat: attacking() })).toBe('To Declare Blockers');
      expect(label({ step: 'declareBlockers', combat: attacking() })).toBe('To Combat Damage');
      expect(label({ step: 'firstStrikeDamage', combat: attacking() })).toBe('To Combat Damage');
      expect(label({ step: 'combatDamage', combat: attacking() })).toBe('To End of Combat');
      expect(label({ step: 'endOfCombat' })).toBe('To Second Main');
      expect(label({ step: 'postcombatMain' })).toBe('To End Step');
      expect(label({ step: 'end' })).toBe('End Turn');
    });

    test('on the opponent turn, what the pass leads to as far as the view tells', () => {
      const opp = { activeSeat: 1 };
      expect(label({ ...opp, step: 'upkeep' })).toBe('To Draw');
      // The opponent may attack: the main phase leads to combat whatever the viewer controls.
      expect(label({ ...opp, step: 'precombatMain' })).toBe('To Combat');
      expect(label({ ...opp, step: 'beginningOfCombat' })).toBe('To Declare Attackers');
      expect(label({ ...opp, step: 'declareAttackers', combat: attacking() })).toBe(
        'To Declare Blockers',
      );
      expect(label({ ...opp, step: 'declareBlockers', combat: attacking([o(2)]) })).toBe(
        'To Combat Damage',
      );
      expect(label({ ...opp, step: 'combatDamage', combat: attacking() })).toBe('To End of Combat');
      expect(label({ ...opp, step: 'postcombatMain' })).toBe('To End Step');
      expect(label({ ...opp, step: 'end' })).toBe('To Your Turn');
    });

    test('no attackers declared: no declare blockers step (CR 508.8)', () => {
      expect(label({ step: 'declareAttackers', combat: null })).toBe('To End of Combat');
      expect(label({ step: 'declareAttackers', combat: { attackers: [] } })).toBe(
        'To End of Combat',
      );
    });

    test('a first strike or double strike creature in combat adds the first strike step (CR 510.4)', () => {
      const striker = (id: ObjectId, keyword: string) =>
        permanent({ id, keywords: [keyword] }) as never;
      const combat = attacking([o(2)]);
      expect(
        label({ step: 'declareBlockers', combat, battlefield: [striker(o(1), 'firstStrike')] }),
      ).toBe('To First Strike Damage');
      // A blocker counts too, and so does double strike.
      expect(
        label({ step: 'declareBlockers', combat, battlefield: [striker(o(2), 'doubleStrike')] }),
      ).toBe('To First Strike Damage');
      // First strike on a creature outside combat changes nothing.
      expect(
        label({ step: 'declareBlockers', combat, battlefield: [striker(o(9), 'firstStrike')] }),
      ).toBe('To Combat Damage');
    });
  });

  test('the prompt names the stack object or the step', () => {
    const item = { id: o(7), name: 'Lightning Bolt', controller: 1 } as never;
    const index = new Map([[o(7), item]]) as never;
    expect(priorityPrompt(view({ stack: [item] }), index)).toContain('Lightning Bolt');
    expect(priorityPrompt(view({}), new Map())).toBe('Your turn, Main 1');
  });
});
