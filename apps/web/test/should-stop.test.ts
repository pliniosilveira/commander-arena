import type {
  GameView,
  ObjectView,
  PendingDecision,
  PriorityOption,
  SeatView,
  StepId,
} from '@commander-arena/engine';
import { objectId } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import {
  DEFAULT_STOPS,
  hasRelevantAction,
  type StopSettings,
  shouldStop,
} from '../src/policy/should-stop';

/** The defaults but for "stop for each opponent spell" (issue 105): the stops that depend on a response only. */
const ANSWERS_ONLY: StopSettings = { ...DEFAULT_STOPS, stopForOpponentSpells: false };

function card(n: number, types: ObjectView['types'], controller = 0): ObjectView {
  return {
    id: objectId(n),
    owner: controller,
    controller,
    zone: 'hand',
    name: `card ${n}`,
    manaCost: null,
    supertypes: [],
    types,
    subtypes: [],
    colors: [],
    power: null,
    toughness: null,
    oracleText: '',
    tapped: false,
    damage: 0,
    counters: {},
    isCommander: false,
    summoningSick: false,
    isToken: false,
    keywords: [],
    protector: null,
    support: 'supported',
    targets: [],
  };
}

function seat(
  id: number,
  hand: readonly ObjectView[] | null,
  graveyard: readonly ObjectView[] = [],
): SeatView {
  return {
    id,
    life: 40,
    poison: 0,
    handCount: hand?.length ?? 7,
    libraryCount: 60,
    hand,
    graveyard,
    command: [],
    manaPool: [],
    hasLost: false,
    mulligans: 0,
    landsPlayedThisTurn: 0,
    lifeLostThisTurn: 0,
    spellsCastThisTurn: 0,
    landPlaysAllowed: 1,
    commanderTax: {},
  };
}

interface Setup {
  step?: StepId;
  active?: number;
  hand?: readonly ObjectView[];
  graveyard?: readonly ObjectView[];
  options?: readonly PriorityOption[];
  stack?: readonly ObjectView[];
  turn?: number;
}

function view(setup: Setup = {}): GameView {
  const hand = setup.hand ?? [];
  const options = setup.options ?? [{ kind: 'pass' }];
  return {
    viewer: 0,
    turn: setup.turn ?? 3,
    activeSeat: setup.active ?? 0,
    phase: 'beginning',
    step: setup.step ?? 'upkeep',
    prioritySeat: 0,
    seats: [seat(0, hand, setup.graveyard), seat(1, null)],
    monarch: null,
    battlefield: [],
    exile: [],
    stack: setup.stack ?? [],
    combat: null,
    pending: { kind: 'priority', id: 'd1', seat: 0, options },
    decidingSeat: 0,
    commanderDamage: {},
    result: null,
  };
}

const bolt = card(10, ['instant']);
const bear = card(11, ['creature']);
const cast = (o: ObjectView): PriorityOption => ({ kind: 'castSpell', object: o.id });

describe('default stops (A18)', () => {
  test('your main phases stop, other steps of your turn pass', () => {
    expect(shouldStop(view({ step: 'precombatMain' }), DEFAULT_STOPS)).toBe(true);
    expect(shouldStop(view({ step: 'postcombatMain' }), DEFAULT_STOPS)).toBe(true);
    for (const step of ['upkeep', 'draw', 'beginningOfCombat', 'endOfCombat', 'end'] as const) {
      expect(shouldStop(view({ step }), DEFAULT_STOPS), step).toBe(false);
    }
  });

  test('nothing stops on the opponent turn with an empty stack, even holding an instant', () => {
    const v = view({
      active: 1,
      step: 'end',
      hand: [bolt],
      options: [{ kind: 'pass' }, cast(bolt)],
    });
    expect(shouldStop(v, DEFAULT_STOPS)).toBe(false);
  });

  test('a decision other than priority always stops', () => {
    const v = {
      ...view(),
      pending: { kind: 'discard' as const, id: 'd2' as const, seat: 0, count: 1, hand: [] },
    };
    expect(shouldStop(v, DEFAULT_STOPS)).toBe(true);
  });

  test('no pending decision means there is nothing to stop for', () => {
    expect(shouldStop({ ...view(), pending: null }, DEFAULT_STOPS)).toBe(false);
  });
});

describe('the decisions of triggered abilities and card choices (M5)', () => {
  const NO_STOPS = { ...DEFAULT_STOPS, myTurnStops: [], opponentTurnStops: [] };
  const decisions: readonly PendingDecision[] = [
    {
      kind: 'choosePermanent',
      id: 'd2',
      seat: 0,
      source: objectId(9),
      purpose: 'sacrifice',
      min: 1,
      max: 1,
      legal: [objectId(1), objectId(2)],
    },
    {
      kind: 'chooseCards',
      id: 'd5',
      seat: 0,
      source: objectId(9),
      purpose: 'search',
      zone: 'library',
      legal: [objectId(1), objectId(2)],
      min: 0,
      max: 2,
      reveal: true,
      prompt: 'Choose up to two basic land cards; the first goes onto the battlefield tapped.',
    },
    {
      kind: 'orderTriggers',
      id: 'd3',
      seat: 0,
      triggers: [
        { source: objectId(1), sourceName: 'A', sourceOracleText: '', abilityIndex: 0, count: 1 },
        { source: objectId(2), sourceName: 'B', sourceOracleText: '', abilityIndex: 0, count: 1 },
      ],
    },
    {
      kind: 'confirmOptional',
      id: 'd4',
      seat: 0,
      source: objectId(9),
      sourceName: 'A',
      sourceOracleText: 'You may do it.',
    },
  ];

  test.each(decisions.map((d) => [d.kind, d] as const))(
    '%s always stops, on either turn, with no stops set and with an empty or a full stack',
    (_kind, pending) => {
      for (const active of [0, 1]) {
        for (const stack of [[], [card(30, ['creature'], 1)]]) {
          const v = { ...view({ active, step: 'upkeep', stack }), pending };
          expect(shouldStop(v, NO_STOPS)).toBe(true);
          expect(shouldStop(v, DEFAULT_STOPS)).toBe(true);
        }
      }
    },
  );

  test('your own trigger on the stack resolves without a click; an opposing one needs an instant to stop', () => {
    const mine = { ...card(31, [], 0), zone: 'stack', abilitySource: objectId(1) };
    const theirs = { ...card(32, [], 1), zone: 'stack', abilitySource: objectId(2) };
    expect(shouldStop(view({ step: 'precombatMain', stack: [mine] }), DEFAULT_STOPS)).toBe(false);
    expect(shouldStop(view({ step: 'end', active: 1, stack: [theirs] }), DEFAULT_STOPS)).toBe(
      false,
    );
    const respond = view({
      step: 'end',
      active: 1,
      stack: [theirs],
      hand: [bolt],
      options: [{ kind: 'pass' }, cast(bolt)],
    });
    expect(shouldStop(respond, DEFAULT_STOPS)).toBe(true);
  });
});

describe('the stack', () => {
  const theirSpell = card(20, ['instant'], 1);
  const mySpell = card(21, ['sorcery'], 0);

  test('an opposing object stops you only when you can respond with an instant', () => {
    const can = view({
      active: 1,
      step: 'precombatMain',
      stack: [theirSpell],
      hand: [bolt],
      options: [{ kind: 'pass' }, cast(bolt)],
    });
    expect(shouldStop(can, DEFAULT_STOPS)).toBe(true);
    const cannot = view({ active: 1, step: 'precombatMain', stack: [theirSpell], hand: [bear] });
    expect(shouldStop(cannot, ANSWERS_ONLY)).toBe(false);
  });

  test('your own spell resolves without a click even when you hold an instant', () => {
    const v = view({
      step: 'precombatMain',
      stack: [mySpell],
      hand: [bolt],
      options: [{ kind: 'pass' }, cast(bolt)],
    });
    expect(shouldStop(v, DEFAULT_STOPS)).toBe(false);
  });

  test('a main-phase stop does not fire while the stack is non-empty and you have no response', () => {
    expect(shouldStop(view({ step: 'precombatMain', stack: [mySpell] }), DEFAULT_STOPS)).toBe(
      false,
    );
  });
});

describe('relevant actions', () => {
  test('a sorcery-speed card or a land is not relevant', () => {
    const decision = view({
      hand: [bear],
      options: [{ kind: 'pass' }, cast(bear), { kind: 'playLand', object: objectId(5) }],
    }).pending;
    if (decision?.kind !== 'priority') throw new Error('expected priority');
    expect(hasRelevantAction(view({ hand: [bear] }), decision)).toBe(false);
  });

  test('a creature with flash is relevant, like an instant (CR 702.8a)', () => {
    const flashBear: ObjectView = { ...card(11, ['creature']), keywords: ['flash'] };
    const decision = view({
      hand: [flashBear],
      options: [{ kind: 'pass' }, cast(flashBear)],
    }).pending;
    if (decision?.kind !== 'priority') throw new Error('expected priority');
    expect(hasRelevantAction(view({ hand: [flashBear] }), decision)).toBe(true);
  });

  test('an instant that is not listed as castable is not relevant (unaffordable)', () => {
    expect(
      shouldStop(
        view({ active: 1, step: 'end', stack: [card(20, ['instant'], 1)], hand: [bolt] }),
        ANSWERS_ONLY,
      ),
    ).toBe(false);
  });
});

describe('settings', () => {
  test('full control stops everywhere', () => {
    const full = { ...DEFAULT_STOPS, fullControl: true };
    expect(shouldStop(view({ active: 1, step: 'upkeep' }), full)).toBe(true);
    expect(shouldStop(view({ step: 'precombatMain', stack: [card(21, ['sorcery'])] }), full)).toBe(
      true,
    );
  });

  test('a per-step stop on the opponent turn fires every turn', () => {
    const s = { ...DEFAULT_STOPS, opponentTurnStops: ['end' as const] };
    expect(shouldStop(view({ active: 1, step: 'end' }), s)).toBe(true);
    expect(shouldStop(view({ active: 1, step: 'upkeep' }), s)).toBe(false);
  });

  test('removing a default stop makes the main phase pass', () => {
    const s = { ...DEFAULT_STOPS, myTurnStops: ['postcombatMain' as const] };
    expect(shouldStop(view({ step: 'precombatMain' }), s)).toBe(false);
  });

  test('a this-turn stop applies to that turn only', () => {
    const s = { ...DEFAULT_STOPS, thisTurn: { turn: 3, steps: ['upkeep' as const] } };
    expect(shouldStop(view({ turn: 3, step: 'upkeep' }), s)).toBe(true);
    expect(shouldStop(view({ turn: 5, step: 'upkeep' }), s)).toBe(false);
  });
});

describe('activated abilities (D-075)', () => {
  const pump: PriorityOption = { kind: 'activate', object: objectId(40), abilityIndex: 0 };
  const cycle: PriorityOption = { kind: 'activate', object: objectId(11), abilityIndex: 1 };
  const mana: PriorityOption = {
    kind: 'activateAbility',
    source: objectId(41),
    abilityIndex: 0,
    color: null,
  };
  const theirs = { ...card(32, ['creature'], 1), zone: 'stack' };
  const mine = { ...card(33, [], 0), zone: 'stack', abilitySource: objectId(40) };

  test('an activate option is a relevant action, on a permanent or from hand; a mana ability is not', () => {
    const decision = (options: readonly PriorityOption[]) => {
      const pending = view({ options }).pending;
      if (pending?.kind !== 'priority') throw new Error('not a priority decision');
      return pending;
    };
    expect(hasRelevantAction(view(), decision([{ kind: 'pass' }, pump]))).toBe(true);
    expect(hasRelevantAction(view({ hand: [bear] }), decision([{ kind: 'pass' }, cycle]))).toBe(
      true,
    );
    expect(hasRelevantAction(view(), decision([{ kind: 'pass' }, mana]))).toBe(false);
    // A creature that can only be cast at sorcery speed stays irrelevant, as before.
    expect(
      hasRelevantAction(view({ hand: [bear] }), decision([{ kind: 'pass' }, cast(bear)])),
    ).toBe(false);
  });

  test("on the opponent's turn an activation stops the player for the opponent's spell", () => {
    const respond = view({
      step: 'end',
      active: 1,
      stack: [theirs],
      options: [{ kind: 'pass' }, pump],
    });
    expect(shouldStop(respond, DEFAULT_STOPS)).toBe(true);
    // The same game without the activation passes through, as it always did.
    expect(shouldStop(view({ step: 'end', active: 1, stack: [theirs] }), ANSWERS_ONLY)).toBe(false);
    // A mana ability alone is not a reason to stop.
    expect(
      shouldStop(
        view({ step: 'end', active: 1, stack: [theirs], options: [{ kind: 'pass' }, mana] }),
        ANSWERS_ONLY,
      ),
    ).toBe(false);
  });

  test("on your own turn an activation stops for the opponent's response but never for your own object", () => {
    const options = [{ kind: 'pass' }, pump] as const;
    // Your own activated ability (or spell) on the stack resolves without a click, D-045.
    expect(shouldStop(view({ step: 'precombatMain', stack: [mine], options }), DEFAULT_STOPS)).toBe(
      false,
    );
    // The opponent responds with a spell while you could pump: stop, even outside a main phase.
    expect(
      shouldStop(view({ step: 'declareBlockers', stack: [theirs], options }), DEFAULT_STOPS),
    ).toBe(true);
    // An empty stack outside the stop steps passes: holding an activation changes nothing.
    expect(shouldStop(view({ step: 'declareBlockers', options }), DEFAULT_STOPS)).toBe(false);
    // Full Control stops everywhere.
    expect(
      shouldStop(view({ step: 'declareBlockers', stack: [mine], options }), {
        ...DEFAULT_STOPS,
        fullControl: true,
      }),
    ).toBe(true);
  });
});

describe('flashback from the graveyard (D-079)', () => {
  const NO_STOPS = { ...DEFAULT_STOPS, myTurnStops: [], opponentTurnStops: [] };
  const theirs = { ...card(40, ['creature'], 1), zone: 'stack' };
  const flashback = (o: ObjectView): PriorityOption => ({
    kind: 'castSpell',
    object: o.id,
    alternative: 'flashback',
  });
  const slay = { ...card(41, ['instant']), zone: 'graveyard', keywords: ['flashback'] };
  const study = { ...card(42, ['sorcery']), zone: 'graveyard', keywords: ['flashback'] };

  test('a flashback instant in the graveyard counts like one in hand', () => {
    const options = [{ kind: 'pass' }, flashback(slay)] as const;
    expect(hasRelevantAction(view({ graveyard: [slay], options }), pending(options))).toBe(true);
    // It stops when the opponent puts an object on the stack and the player could respond...
    expect(
      shouldStop(
        view({ step: 'end', active: 1, stack: [theirs], graveyard: [slay], options }),
        NO_STOPS,
      ),
    ).toBe(true);
    // ...but not for the player's own spell, and not on an empty stack outside a stop step.
    const mine = { ...card(43, ['creature'], 0), zone: 'stack' };
    expect(
      shouldStop(view({ step: 'end', stack: [mine], graveyard: [slay], options }), NO_STOPS),
    ).toBe(false);
    expect(shouldStop(view({ step: 'end', graveyard: [slay], options }), NO_STOPS)).toBe(false);
  });

  test('a flash card in the graveyard counts too', () => {
    const flashy = { ...slay, types: ['creature' as const], keywords: ['flashback', 'flash'] };
    const options = [{ kind: 'pass' }, flashback(flashy)] as const;
    expect(hasRelevantAction(view({ graveyard: [flashy], options }), pending(options))).toBe(true);
  });

  test('a sorcery flashback is not relevant; the engine lists it only at sorcery speed', () => {
    const options = [{ kind: 'pass' }, flashback(study)] as const;
    expect(hasRelevantAction(view({ graveyard: [study], options }), pending(options))).toBe(false);
    // The opponent's turn with their object on the stack: no sorcery option is listed, so only
    // the pass is there and the policy does not stop.
    expect(
      shouldStop(
        view({
          step: 'end',
          active: 1,
          stack: [theirs],
          graveyard: [study],
          options: [{ kind: 'pass' }],
        }),
        ANSWERS_ONLY,
      ),
    ).toBe(false);
  });

  test("an option for a card that is in nobody's list is ignored", () => {
    const options = [{ kind: 'pass' }, flashback(slay)] as const;
    expect(hasRelevantAction(view({ options }), pending(options))).toBe(false);
  });
});

function pending(options: readonly PriorityOption[]) {
  return { kind: 'priority' as const, id: 'd1' as const, seat: 0, options };
}

describe('targets of a triggered ability (D-089)', () => {
  const NO_STOPS = { ...DEFAULT_STOPS, myTurnStops: [], opponentTurnStops: [] };
  const trigger = { ...card(40, [], 0), zone: 'stack', abilitySource: objectId(1) };
  const pending: PendingDecision = {
    kind: 'targets',
    id: 'd6',
    seat: 0,
    source: trigger.id,
    forTrigger: true,
    specs: [
      { specId: 't1', min: 1, max: 1, legal: [{ kind: 'object', id: objectId(2), specId: 't1' }] },
    ],
  };

  test('the autopilot never answers it: it stops on either turn, in every setting, even with one legal target', () => {
    for (const active of [0, 1]) {
      for (const step of ['upkeep', 'precombatMain', 'declareAttackers', 'end'] as const) {
        const v = { ...view({ active, step, stack: [trigger] }), pending };
        for (const settings of [NO_STOPS, DEFAULT_STOPS, { ...DEFAULT_STOPS, fullControl: true }]) {
          expect(shouldStop(v, settings), `${active} ${step}`).toBe(true);
        }
      }
    }
  });
});

describe('the combat windows before damage (issue 35, CR 509.2, 117.4)', () => {
  const pump: PriorityOption = { kind: 'activate', object: objectId(40), abilityIndex: 0 };
  const attacking = {
    attackers: [
      {
        object: objectId(50),
        target: { kind: 'player' as const, seat: 0 },
        blocked: true,
        blockedBy: [objectId(51)],
      },
    ],
  };
  const inCombat = (setup: Setup, combat: GameView['combat'] = attacking): GameView => ({
    ...view(setup),
    combat,
  });

  test('after blockers are declared you are asked when you have an action, on either turn', () => {
    for (const active of [0, 1]) {
      const v = inCombat({ step: 'declareBlockers', active, options: [{ kind: 'pass' }, pump] });
      expect(shouldStop(v, DEFAULT_STOPS), `active ${active}`).toBe(true);
    }
  });

  test('an instant counts like an ability', () => {
    const v = inCombat({
      step: 'declareBlockers',
      active: 1,
      hand: [bolt],
      options: [{ kind: 'pass' }, cast(bolt)],
    });
    expect(shouldStop(v, DEFAULT_STOPS)).toBe(true);
  });

  test('with nothing to do in the step it passes, as before', () => {
    for (const active of [0, 1]) {
      const v = inCombat({ step: 'declareBlockers', active, hand: [bear] });
      expect(shouldStop(v, DEFAULT_STOPS), `active ${active}`).toBe(false);
    }
  });

  test('on the opponent turn the declare attackers step asks too; on your turn it does not', () => {
    const options = [{ kind: 'pass' as const }, pump];
    expect(
      shouldStop(inCombat({ step: 'declareAttackers', active: 1, options }), DEFAULT_STOPS),
    ).toBe(true);
    expect(
      shouldStop(inCombat({ step: 'declareAttackers', active: 0, options }), DEFAULT_STOPS),
    ).toBe(false);
  });

  test('without attackers in combat there is no window', () => {
    const options = [{ kind: 'pass' as const }, pump];
    expect(shouldStop(inCombat({ step: 'declareBlockers', options }, null), DEFAULT_STOPS)).toBe(
      false,
    );
    expect(
      shouldStop(inCombat({ step: 'declareBlockers', options }, { attackers: [] }), DEFAULT_STOPS),
    ).toBe(false);
  });

  test('other steps keep their defaults', () => {
    const options = [{ kind: 'pass' as const }, pump];
    expect(shouldStop(inCombat({ step: 'endOfCombat', active: 1, options }), DEFAULT_STOPS)).toBe(
      false,
    );
  });

  test('Full Control stops there with nothing to do', () => {
    const full = { ...DEFAULT_STOPS, fullControl: true };
    expect(shouldStop(inCombat({ step: 'declareBlockers', active: 1 }), full)).toBe(true);
  });
});

describe('an object that targets you or what you control (issue 34)', () => {
  const stackObject = (controller: number, targets: ObjectView['targets']): ObjectView => ({
    ...card(60, ['instant'], controller),
    zone: 'stack',
    targets,
  });
  const myPermanent: ObjectView = { ...card(61, ['creature'], 0), zone: 'battlefield' };
  const theirPermanent: ObjectView = { ...card(62, ['creature'], 1), zone: 'battlefield' };
  const aimed = (top: ObjectView, over: Setup = {}): GameView => ({
    ...view({ active: 1, step: 'precombatMain', stack: [top], hand: [bear], ...over }),
    battlefield: [myPermanent, theirPermanent],
  });

  test('a spell aimed at you waits for your pass even with no response', () => {
    const top = stackObject(1, [{ kind: 'player', seat: 0, specId: 't' }]);
    expect(shouldStop(aimed(top), DEFAULT_STOPS)).toBe(true);
  });

  test('a spell aimed at your permanent waits', () => {
    const top = stackObject(1, [{ kind: 'object', id: myPermanent.id, specId: 't' }]);
    expect(shouldStop(aimed(top), DEFAULT_STOPS)).toBe(true);
  });

  test('an ability on the stack counts the same', () => {
    const top: ObjectView = {
      ...stackObject(1, [{ kind: 'object', id: myPermanent.id, specId: 't' }]),
      abilitySource: objectId(2),
    };
    expect(shouldStop(aimed(top), DEFAULT_STOPS)).toBe(true);
  });

  test('a spell aimed at their own things or at nothing still resolves without a click', () => {
    const own = stackObject(1, [{ kind: 'object', id: theirPermanent.id, specId: 't' }]);
    expect(shouldStop(aimed(own), ANSWERS_ONLY)).toBe(false);
    expect(shouldStop(aimed(stackObject(1, [])), ANSWERS_ONLY)).toBe(false);
    expect(
      shouldStop(aimed(stackObject(1, [{ kind: 'player', seat: 1, specId: 't' }])), ANSWERS_ONLY),
    ).toBe(false);
  });

  test('your own spell aimed at your own permanent does not stop you', () => {
    const top = stackObject(0, [{ kind: 'object', id: myPermanent.id, specId: 't' }]);
    expect(shouldStop(aimed(top, { active: 0 }), DEFAULT_STOPS)).toBe(false);
  });

  test('the setting turns the stop off', () => {
    const top = stackObject(1, [{ kind: 'player', seat: 0, specId: 't' }]);
    expect(shouldStop(aimed(top), { ...ANSWERS_ONLY, stopWhenTargeted: false })).toBe(false);
  });
});

describe("an opponent's spell on the stack (issue 105)", () => {
  const spell = (n: number, controller: number, targets: ObjectView['targets'] = []) => ({
    ...card(n, ['sorcery'], controller),
    zone: 'stack' as const,
    targets,
  });
  const trigger = {
    ...card(71, [], 1),
    zone: 'stack',
    abilitySource: objectId(72),
    ability: { kind: 'triggered' },
  } as unknown as ObjectView;

  test('stops for it with no target, no response and nothing in the stop settings', () => {
    // A board wipe names no target and the player holds nothing: it used to resolve unseen.
    const v = view({ active: 1, step: 'precombatMain', stack: [spell(70, 1)], hand: [] });
    expect(shouldStop(v, DEFAULT_STOPS)).toBe(true);
    expect(DEFAULT_STOPS.stopForOpponentSpells).toBe(true);
  });

  test("also on the player's own turn, when the opponent casts in response", () => {
    const v = view({ active: 0, step: 'precombatMain', stack: [spell(70, 1)], hand: [] });
    expect(shouldStop(v, DEFAULT_STOPS)).toBe(true);
  });

  test('the setting turns it off, and the older stops still hold', () => {
    const off = { ...DEFAULT_STOPS, stopForOpponentSpells: false };
    const v = view({ active: 1, step: 'precombatMain', stack: [spell(70, 1)], hand: [] });
    expect(shouldStop(v, off)).toBe(false);
    const aimed = view({
      active: 1,
      step: 'precombatMain',
      stack: [spell(70, 1, [{ kind: 'player', seat: 0, specId: 't' }])],
    });
    expect(shouldStop(aimed, off)).toBe(true);
  });

  test("the player's own spell and the opponent's abilities still pass without a click", () => {
    expect(
      shouldStop(view({ active: 0, step: 'precombatMain', stack: [spell(73, 0)] }), DEFAULT_STOPS),
    ).toBe(false);
    expect(
      shouldStop(view({ active: 1, step: 'precombatMain', stack: [trigger] }), DEFAULT_STOPS),
    ).toBe(false);
  });

  test("only the top of the stack counts: the opponent's spell under the player's own is not asked about", () => {
    const v = view({
      active: 1,
      step: 'precombatMain',
      stack: [spell(70, 1), spell(73, 0)],
    });
    expect(shouldStop(v, DEFAULT_STOPS)).toBe(false);
  });
});
