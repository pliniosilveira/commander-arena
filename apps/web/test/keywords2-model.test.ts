/**
 * Keyword batch 2 (D-116, D-120) as pure models: the cost-payment question (prompt, picks, the live line, the
 * answers the engine lists), the wording of Extort's and Cascade's questions and payment, the log lines of
 * the taps, exiles, regeneration and the cards put on the bottom, the chips, the trigger words and the gists.
 * No DOM, no game.
 */
import {
  type Action,
  type ChoosePayOptionsDecision,
  type ConfirmOptionalDecision,
  type GameEvent,
  type GameState,
  type ObjectId,
  type ObjectView,
  type PayManaDecision,
  type StackAbility,
  SYNTHETIC_CARDS,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { describeEvents } from '../src/game/describe';
import { chipsOf, shieldChip } from '../src/ui/board/keywords';
import { triggerCondition, triggerGist } from '../src/ui/decisions/ability-label';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { optionalAsk } from '../src/ui/decisions/optional';
import {
  candidatesInOrder,
  confirmText,
  isLegalPick,
  payDetail,
  payHint,
  payLine,
  payOptionsPrompt,
  sameSet,
  settle,
  togglePick,
} from '../src/ui/decisions/pay-options';
import { payBarPrompt, payCancelLabel } from '../src/ui/decisions/payment';
import { initialUi } from '../src/ui/decisions/ui-state';
import { chooseAction } from './bot';
import { lookupIndexFor } from './decisions-helpers';

const o = (n: number): ObjectId => `o${n}`;

const view = (patch: Partial<ObjectView>): ObjectView =>
  ({
    id: o(1),
    name: 'SYNTHETIC Convoke Wurm',
    controller: 0,
    owner: 0,
    zone: 'stack',
    types: ['creature'],
    subtypes: [],
    colors: [],
    keywords: [],
    oracleText: '',
    counters: {},
    ...patch,
  }) as unknown as ObjectView;

const WURM = view({ id: o(1), name: 'SYNTHETIC Convoke Wurm' });
const GREEN = ['G'] as const;
const index = lookupIndexFor([WURM]);

/** A convoke question for {3}{G}{G}: two green creatures, a colorless one and a white one. */
const convoke = (patch: Partial<ChoosePayOptionsDecision> = {}): ChoosePayOptionsDecision => ({
  id: 'd1',
  seat: 0,
  kind: 'choosePayOptions',
  source: o(1),
  mechanism: 'convoke',
  cost: ['3', 'G', 'G'],
  candidates: [o(2), o(3), o(4), o(5)],
  colors: { [o(2)]: GREEN, [o(3)]: GREEN, [o(4)]: [], [o(5)]: ['W'] },
  maxUsable: 4,
  suggested: [o(2), o(3)],
  choices: [[], [o(2), o(3)], [o(2)], [o(2), o(3), o(4)], [o(3), o(4)]],
  ...patch,
});

const delve = (patch: Partial<ChoosePayOptionsDecision> = {}): ChoosePayOptionsDecision => ({
  id: 'd2',
  seat: 0,
  kind: 'choosePayOptions',
  source: o(1),
  mechanism: 'delve',
  cost: ['4', 'B'],
  candidates: [o(10), o(11), o(12), o(13)],
  maxUsable: 4,
  suggested: [o(10), o(11)],
  choices: [[], [o(10), o(11)], [o(10)], [o(10), o(11), o(12)]],
  ...patch,
});

describe('the question', () => {
  test.each([
    [convoke(), 'Convoke: tap creatures to pay for SYNTHETIC Convoke Wurm ({3}{G}{G})'],
    [
      convoke({ mechanism: 'improvise' }),
      'Improvise: tap artifacts to pay for SYNTHETIC Convoke Wurm ({3}{G}{G})',
    ],
    [delve(), 'Delve: exile cards from your graveyard to pay for SYNTHETIC Convoke Wurm ({4}{B})'],
  ])('the prompt names the mechanism, the spell and the cost', (d, words) => {
    expect(payOptionsPrompt(d, index)).toBe(words);
  });

  test('a spell that is gone from the view is "a card", never undefined', () => {
    expect(payOptionsPrompt(convoke(), lookupIndexFor([]))).toBe(
      'Convoke: tap creatures to pay for a card ({3}{G}{G})',
    );
  });

  test('the suggested picks start selected', () => {
    expect(initialUi(convoke()).payOptions).toEqual([o(2), o(3)]);
    expect(initialUi(null).payOptions).toEqual([]);
  });
});

describe('picking', () => {
  const d = convoke();
  test('a click picks and takes back; a non-candidate is ignored', () => {
    expect(togglePick([o(2)], d, o(3))).toEqual([o(2), o(3)]);
    expect(togglePick([o(2), o(3)], d, o(2))).toEqual([o(3)]);
    expect(togglePick([o(2)], d, o(99))).toEqual([o(2)]);
  });

  test('no more than maxUsable can be picked; with room for one a click swaps', () => {
    const two = convoke({ maxUsable: 2 });
    expect(togglePick([o(2), o(3)], two, o(4))).toEqual([o(2), o(3)]);
    const one = convoke({ maxUsable: 1 });
    expect(togglePick([o(2)], one, o(3))).toEqual([o(3)]);
    expect(togglePick([o(2)], convoke({ maxUsable: 0 }), o(3))).toEqual([o(2)]);
  });

  test('the answer lists the picks in the order of the candidates', () => {
    expect(candidatesInOrder(d, [o(4), o(2)])).toEqual([o(2), o(4)]);
  });

  test('sets are compared without order', () => {
    expect(sameSet([o(2), o(3)], [o(3), o(2)])).toBe(true);
    expect(sameSet([o(2)], [o(2), o(3)])).toBe(false);
  });
});

describe('which answers Confirm accepts', () => {
  const d = convoke();
  test('the engine lists the answers: the suggestion, none and its neighbours', () => {
    expect(isLegalPick(d, [o(2), o(3)])).toBe(true);
    expect(isLegalPick(d, [o(3), o(2)])).toBe(true);
    expect(isLegalPick(d, [])).toBe(true);
  });

  test('an answer the engine did not list is refused, with the reason', () => {
    // Three creatures of the wrong mix leave a cost nothing can pay.
    expect(isLegalPick(d, [o(2), o(5)])).toBe(false);
    expect(payHint(d, [o(2), o(5)])).toBe(
      'That leaves a cost you could not pay: pick the suggested ones or fewer',
    );
    expect(isLegalPick(d, [o(99)])).toBe(false);
    expect(payHint(d, [o(2), o(3)])).toBeNull();
  });

  test('graveyard cards pay alike, so a set of the size of a listed one is accepted for Delve', () => {
    const g = delve();
    expect(isLegalPick(g, [o(12), o(13)])).toBe(true);
    expect(isLegalPick(g, [o(11), o(13), o(12), o(10)])).toBe(false);
  });

  test('the model enables Confirm for a listed answer, disables it otherwise, and sends the picks', () => {
    const sent: Action[] = [];
    const ctl: Controller = { act: (a) => sent.push(a), update: () => {}, openChooser: () => {} };
    const make = (picked: readonly ObjectId[]) =>
      buildModel(
        { battlefield: [], stack: [WURM], exile: [], seats: [], viewer: 0 } as never,
        convoke(),
        { ...initialUi(convoke()), payOptions: picked },
        ctl,
      );
    const ok = make([o(3), o(2)]);
    expect(ok.bar.buttons[0]?.disabled).toBe(false);
    expect(ok.bar.buttons[0]?.label).toBe('Tap 2 creatures');
    ok.bar.buttons[0]?.run();
    expect(sent).toEqual([{ kind: 'choosePayOptions', objects: [o(2), o(3)] }]);
    const bad = make([o(2), o(5)]);
    expect(bad.bar.buttons[0]?.disabled).toBe(true);
    expect(bad.bar.buttons[0]?.hint).toContain('could not pay');
    expect(make([]).bar.buttons[0]?.label).toBe('Pay all in mana');
    // Cancel rewinds the cast.
    ok.bar.cancel?.run();
    expect(sent[1]).toEqual({ kind: 'cancel' });
    expect(ok.bar.inOverlay).toBe(true);
  });

  test('the labels and the count', () => {
    expect(confirmText(delve(), [o(10)])).toBe('Exile 1 card');
    expect(confirmText(delve(), [o(10), o(11)])).toBe('Exile 2 cards');
    expect(confirmText(convoke({ mechanism: 'improvise' }), [o(2)])).toBe('Tap 1 artifact');
    expect(payDetail(convoke(), [o(2)])).toBe('1 of up to 4 creatures chosen.');
  });
});

describe('the live line: what the picks pay and what is left for mana', () => {
  test('two green creatures pay {G}{G}', () => {
    expect(payLine(convoke(), [o(2), o(3)])).toBe('These pay {G}{G}; you still pay {3} with mana.');
  });

  test('a creature of the wrong color pays generic mana, a colorless one too', () => {
    expect(payLine(convoke(), [o(4), o(5)])).toBe(
      'These pay {2}; you still pay {1}{G}{G} with mana.',
    );
  });

  test('colors first: a green creature pays {G}, not generic', () => {
    expect(payLine(convoke(), [o(2), o(4)])).toBe(
      'These pay {1}{G}; you still pay {2}{G} with mana.',
    );
  });

  test('the whole cost paid by the picks, and nothing picked', () => {
    const small = convoke({ cost: ['1', 'G'], maxUsable: 2 });
    expect(payLine(small, [o(2), o(3)])).toBe(
      'These pay {1}{G}; nothing is left to pay with mana.',
    );
    expect(payLine(convoke(), [])).toBe('Nothing chosen: you pay {3}{G}{G} with mana.');
  });

  test('graveyard cards pay generic mana only', () => {
    expect(payLine(delve(), [o(10), o(11)])).toBe('These pay {2}; you still pay {2}{B} with mana.');
  });

  test('more picks than the cost has mana say so', () => {
    expect(payLine(convoke({ cost: ['G'] }), [o(2), o(3)])).toBe(
      'These cannot each pay for a different mana of the cost.',
    );
    expect(settle(['G'], [['W']])).toBeNull();
  });

  test('a hybrid symbol is paid by a creature of either color', () => {
    expect(payLine(convoke({ cost: ['W/B', 'G'], maxUsable: 2 }), [o(5)])).toBe(
      'These pay {W/B}; you still pay {G} with mana.',
    );
  });
});

describe('the scripted human', () => {
  test('answers the question with the engine suggestion', () => {
    const d = convoke();
    expect(chooseAction({} as never, d)).toEqual({
      kind: 'choosePayOptions',
      objects: [o(2), o(3)],
    });
  });
});

describe('Extort and Cascade: the questions', () => {
  const extort = SYNTHETIC_CARDS['SYNTHETIC Extort Priest']?.faces[0]?.abilities.find(
    (a) => a.kind === 'triggered',
  );
  // The synthetic card carries the keyword; the stack object carries the derived ability.
  const EXTORT_ON_STACK = {
    kind: 'triggered',
    trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you' },
    effect: {
      kind: 'mayPay',
      cost: [{ kind: 'mana', symbols: ['W/B'] }],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 1 },
          { kind: 'gainLife', player: { kind: 'you' }, amount: { kind: 'lifeLostThisWay' } },
        ],
      },
    },
  } as unknown as StackAbility;
  const ability = view({
    id: o(50),
    name: 'SYNTHETIC Extort Priest',
    abilitySource: o(1),
    ability: EXTORT_ON_STACK,
  });
  const ask = (patch: Partial<ConfirmOptionalDecision>) =>
    ({
      id: 'd3',
      seat: 0,
      kind: 'confirmOptional',
      source: o(50),
      sourceName: 'SYNTHETIC Extort Priest',
      sourceOracleText: 'Extort',
      ...patch,
    }) as ConfirmOptionalDecision;

  test('the derived Extort ability is not a card ability (it exists only on the stack)', () => {
    expect(extort).toBeUndefined();
  });

  test('"Pay {W/B} for extort?" with Pay and Don\'t pay, and no Cancel', () => {
    const a = optionalAsk(
      ask({ purpose: 'mayPay', cost: [{ kind: 'mana', symbols: ['W/B'] }] }),
      lookupIndexFor([ability]),
    );
    expect(a).toEqual({
      prompt: 'Pay {W/B} for extort?',
      yes: 'Pay',
      no: "Don't pay",
      cancellable: false,
    });
  });

  test('another "you may pay" names the ability, never guesses extort', () => {
    const other = view({ id: o(50), name: 'SYNTHETIC Tithe', abilitySource: o(1) });
    const a = optionalAsk(
      ask({
        purpose: 'mayPay',
        sourceName: 'SYNTHETIC Tithe',
        cost: [{ kind: 'mana', symbols: ['2'] }],
      }),
      lookupIndexFor([other]),
    );
    expect(a.prompt).toBe("Pay {2} for SYNTHETIC Tithe's ability?");
  });

  test('the payment reads the same and its Cancel is "Don\'t pay"', () => {
    const pay = {
      id: 'd4',
      seat: 0,
      kind: 'payMana',
      source: o(50),
      totalCost: ['W/B'],
      purpose: 'mayPay',
      manaSources: [],
    } as unknown as PayManaDecision;
    expect(payBarPrompt(pay, lookupIndexFor([ability]))).toBe(
      'Pay {W/B} for extort: tap your mana sources.',
    );
    expect(payCancelLabel(pay)).toBe("Don't pay");
  });

  test('Cascade names the exiled card and its two answers', () => {
    const bolt = view({ id: o(60), name: 'Lightning Bolt', zone: 'exile' });
    const a = optionalAsk(
      ask({ purpose: 'cascade', subject: o(60), sourceName: 'SYNTHETIC Cascade Giant' }),
      lookupIndexFor([bolt]),
    );
    expect(a.prompt).toBe('Cascade: cast Lightning Bolt without paying its mana cost?');
    expect(a.yes).toBe('Cast it');
    expect(a.no).toBe("Don't cast it");
    expect(a.cancellable).toBe(false);
  });

  test('a card that is not in the view is "that card"', () => {
    const a = optionalAsk(ask({ purpose: 'cascade', subject: o(61) }), lookupIndexFor([]));
    expect(a.prompt).toBe('Cascade: cast that card without paying its mana cost?');
  });
});

/** A fake state that knows the cards by object id, the pending decision and the combat. */
function stateWith(
  names: Readonly<Record<ObjectId, string>>,
  pending: unknown = null,
  combat: unknown = null,
): GameState {
  const objects: Record<string, unknown> = {};
  const cards: Record<string, unknown> = {};
  const definitions: Record<string, unknown> = {};
  for (const [id, name] of Object.entries(names)) {
    objects[id] = { card: `c${id}`, token: null, stack: null, controller: 0 };
    cards[`c${id}`] = { definition: `d${id}` };
    definitions[`d${id}`] = { name };
  }
  return { objects, cards, definitions, pending, combat, lki: {} } as unknown as GameState;
}

describe('the log', () => {
  const names = {
    [o(1)]: 'SYNTHETIC Convoke Wurm',
    [o(2)]: 'Llanowar Elves',
    [o(3)]: 'Grizzly Bears',
    [o(10)]: 'Swamp',
    [o(11)]: 'Island',
  };
  const lines = (
    events: readonly GameEvent[],
    before: GameState,
    action?: Action,
    viewer = 0,
  ): string[] =>
    describeEvents(events, before, stateWith(names), viewer, action).map((l) => l.text);

  test('the taps of a convoke are one line, not one per creature', () => {
    const before = stateWith(names, convoke());
    expect(
      lines(
        [
          { kind: 'tapped', object: o(2) },
          { kind: 'tapped', object: o(3) },
        ],
        before,
        { kind: 'choosePayOptions', objects: [o(2), o(3)] },
      ),
    ).toEqual(['You tap Llanowar Elves and Grizzly Bears to convoke SYNTHETIC Convoke Wurm.']);
  });

  test('one creature, and improvise', () => {
    const before = stateWith(names, convoke({ mechanism: 'improvise', candidates: [o(2)] }));
    expect(
      lines([{ kind: 'tapped', object: o(2) }], before, {
        kind: 'choosePayOptions',
        objects: [o(2)],
      }),
    ).toEqual(['You tap Llanowar Elves to improvise SYNTHETIC Convoke Wurm.']);
  });

  test('the exiled cards of a delve are a count, and their moves to exile are not lines of their own', () => {
    const before = stateWith(names, delve());
    const events: GameEvent[] = [o(10), o(11)].map((from, i) => ({
      kind: 'zoneChanged',
      card: null,
      from,
      to: o(20 + i),
      fromZone: 'graveyard',
      toZone: 'exile',
    }));
    expect(lines(events, before, { kind: 'choosePayOptions', objects: [o(10), o(11)] })).toEqual([
      'You exile 2 cards to delve SYNTHETIC Convoke Wurm.',
    ]);
    expect(
      lines(events.slice(0, 1), before, { kind: 'choosePayOptions', objects: [o(10)] }),
    ).toEqual(['You exile 1 card to delve SYNTHETIC Convoke Wurm.']);
  });

  test('the opponent taps and exiles in the third person', () => {
    const before = stateWith(names, { ...convoke(), seat: 1 });
    expect(
      lines([{ kind: 'tapped', object: o(2) }], before, {
        kind: 'choosePayOptions',
        objects: [o(2)],
      }),
    ).toEqual(['Opponent taps Llanowar Elves to convoke SYNTHETIC Convoke Wurm.']);
  });

  test('paying everything in mana says nothing about taps', () => {
    const before = stateWith(names, convoke());
    expect(lines([], before, { kind: 'choosePayOptions', objects: [] })).toEqual([]);
  });

  test('a regeneration says what happened, in combat or not', () => {
    const attacking = stateWith(names, null, {
      attackers: [{ object: o(2), target: { kind: 'player', seat: 1 }, blocked: false }],
      blocks: [],
      firstStrikers: null,
    });
    const out = lines([{ kind: 'regenerated', object: o(2) }], attacking);
    expect(out).toEqual([
      'Llanowar Elves regenerates: it is tapped, removed from combat and its damage is removed.',
    ]);
    expect(lines([{ kind: 'regenerated', object: o(3) }], stateWith(names))).toEqual([
      'Grizzly Bears regenerates: it is tapped and its damage is removed.',
    ]);
    const [described] = describeEvents(
      [{ kind: 'regenerated', object: o(2) }],
      attacking,
      stateWith(names),
      0,
    );
    expect(described?.rule).toBe('CR 701.19a');
    expect(described?.objects).toEqual([o(2)]);
  });

  test('the cards cascade put on the bottom are a count only', () => {
    expect(lines([{ kind: 'cardsBottomed', seat: 0, count: 3 }], stateWith(names))).toEqual([
      'You put 3 cards on the bottom of your library in a random order.',
    ]);
    expect(lines([{ kind: 'cardsBottomed', seat: 1, count: 1 }], stateWith(names))).toEqual([
      'Opponent puts 1 card on the bottom of their library in a random order.',
    ]);
  });

  describe('extort and cascade answers', () => {
    const extortOnStack = (cost: unknown) =>
      ({
        card: null,
        token: null,
        controller: 0,
        stack: {
          kind: 'ability',
          source: o(1),
          ability: {
            kind: 'triggered',
            trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you' },
            effect: { kind: 'mayPay', cost, effect: { kind: 'cascade' } },
          },
        },
      }) as unknown;
    const withAbility = (): GameState => {
      const base = stateWith(names);
      return {
        ...base,
        objects: { ...base.objects, [o(50)]: extortOnStack([{ kind: 'mana', symbols: ['W/B'] }]) },
      } as unknown as GameState;
    };
    const question = (patch: object) =>
      ({
        id: 'd5',
        seat: 0,
        kind: 'confirmOptional',
        source: o(50),
        sourceName: 'SYNTHETIC Extort Priest',
        sourceOracleText: 'Extort',
        purpose: 'mayPay',
        cost: [{ kind: 'mana', symbols: ['W/B'] }],
        ...patch,
      }) as ConfirmOptionalDecision;
    const answer = (accepted: boolean): GameEvent => ({
      kind: 'optionalAnswered',
      seat: 0,
      source: o(50),
      accepted,
    });

    test('"You choose to pay {W/B} for extort." and the decline', () => {
      const before = { ...withAbility(), pending: question({}) } as GameState;
      expect(lines([answer(true)], before)).toEqual(['You choose to pay {W/B} for extort.']);
      expect(lines([answer(false)], before)).toEqual(["You don't pay {W/B} for extort."]);
    });

    test('backing out of the payment is not paying', () => {
      const pay = {
        id: 'd6',
        seat: 0,
        kind: 'payMana',
        source: o(50),
        totalCost: ['W/B'],
        purpose: 'mayPay',
      };
      const before = { ...withAbility(), pending: pay } as unknown as GameState;
      expect(lines([], before, { kind: 'cancel' })).toEqual(["You don't pay {W/B}."]);
    });

    test('cascade: the card is named, and declining is a line too', () => {
      const before = {
        ...stateWith({ ...names, [o(60)]: 'Lightning Bolt' }),
        pending: question({ purpose: 'cascade', subject: o(60), cost: undefined }),
      } as GameState;
      expect(lines([answer(true)], before)).toEqual([
        'You cast Lightning Bolt without paying its mana cost (cascade).',
      ]);
      expect(lines([answer(false)], before)).toEqual(["You don't cast Lightning Bolt (cascade)."]);
    });
  });
});

describe('the chips', () => {
  const chip = (text: string, keywords: readonly string[]) =>
    chipsOf({ keywords, oracleText: text, restrictions: [], landwalks: [] } as never).map(
      (c) => `${c.short}|${c.full}`,
    );

  test('the plain keywords of batch 2', () => {
    expect(chip('Skulk', ['skulk'])).toEqual(['Skl|Skulk']);
    expect(chip('Battle cry', ['battleCry'])).toEqual(['BC|Battle cry']);
    expect(chip('Mentor', ['mentor'])).toEqual(['Mnt|Mentor']);
    expect(chip('Evolve', ['evolve'])).toEqual(['Evo|Evolve']);
    expect(chip('Extort', ['extort'])).toEqual(['Ext|Extort']);
    expect(chip('Convoke', ['convoke'])).toEqual(['Cvk|Convoke']);
    expect(chip('Improvise', ['improvise'])).toEqual(['Imp|Improvise']);
    expect(chip('Delve', ['delve'])).toEqual(['Dlv|Delve']);
    expect(chip('Cascade', ['cascade'])).toEqual(['Csc|Cascade']);
  });

  test('Bushido N and Affinity for X read their number and their words from the text', () => {
    expect(chip('Bushido 2', ['bushido'])).toEqual(['Bus 2|Bushido 2']);
    expect(
      chip('Bushido 1 (Whenever this creature blocks or becomes blocked)', ['bushido']),
    ).toEqual(['Bus 1|Bushido 1']);
    expect(chip('Affinity for artifacts', ['affinity'])).toEqual(['Aff|Affinity for artifacts']);
    expect(chip('Affinity for Islands. Flying', ['affinity'])).toEqual([
      'Aff|Affinity for Islands',
    ]);
  });

  test('a keyword granted by an effect has the bare name, never a guessed number', () => {
    expect(chip('', ['bushido'])).toEqual(['Bus|Bushido']);
    expect(chip('', ['affinity'])).toEqual(['Aff|Affinity']);
  });

  test('regenerate is an ability, not a keyword: no chip', () => {
    expect(chip('{1}{B}: Regenerate this creature.', [])).toEqual([]);
  });

  test('a regeneration shield is a chip; two say how many', () => {
    const shield = (n: number | undefined) =>
      chipsOf({
        keywords: [],
        restrictions: [],
        landwalks: [],
        ...(n === undefined ? {} : { regenerationShields: n }),
      } as never);
    expect(shield(undefined)).toEqual([]);
    expect(shield(0)).toEqual([]);
    expect(shield(1).map((c) => c.full)).toEqual(['Regeneration shield']);
    expect(shield(2).map((c) => c.full)).toEqual(['Regeneration shield ×2']);
    expect(shieldChip(1).restriction).toBe(false);
  });
});

describe('the gists', () => {
  const cardAbility = (name: string): StackAbility => {
    const face = SYNTHETIC_CARDS[name]?.faces[0];
    const found = face?.abilities.find((a) => a.kind === 'activated');
    if (found === undefined) throw new Error(`no ability on ${name}`);
    return found;
  };

  test('regenerate', () => {
    expect(triggerGist(cardAbility('SYNTHETIC Regenerating Troll'), undefined)).toBe(
      'Regenerate this permanent',
    );
  });

  const triggered = (effect: unknown, extra: object = {}): StackAbility =>
    ({
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      effect,
      ...extra,
    }) as unknown as StackAbility;

  test('Extort: "You may pay {W/B}. If you do, ..." with the life lost', () => {
    const extort = triggered({
      kind: 'mayPay',
      cost: [{ kind: 'mana', symbols: ['W/B'] }],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 1 },
          { kind: 'gainLife', player: { kind: 'you' }, amount: { kind: 'lifeLostThisWay' } },
        ],
      },
    });
    expect(triggerGist(extort, undefined)).toBe(
      'You may pay {W/B}. If you do, each opponent loses 1 life. You gain life equal to the total life lost this way',
    );
  });

  test('Cascade, destroy that cannot be regenerated, each other attacking creature', () => {
    expect(triggerGist(triggered({ kind: 'cascade' }), undefined)).toMatch(
      /^Exile cards from the top/,
    );
    expect(
      triggerGist(
        triggered({
          kind: 'destroy',
          objects: { kind: 'each', filter: { types: ['creature'] } },
          cantBeRegenerated: true,
        }),
        undefined,
      ),
    ).toBe("Destroy each creature. It can't be regenerated");
    expect(
      triggerGist(
        triggered({
          kind: 'modifyPt',
          objects: { kind: 'each', filter: { types: ['creature'], attacking: true, other: true } },
          power: 1,
          toughness: 0,
          duration: 'untilEndOfTurn',
        }),
        undefined,
      ),
    ).toBe('Each other attacking creature gets +1/+0 until end of turn');
  });

  test('Mentor: the target says what it is and the power it must have less than', () => {
    const mentor = triggered(
      {
        kind: 'addCounters',
        objects: { kind: 'target', id: 't1' },
        counter: '+1/+1',
        count: 1,
      },
      {
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { types: ['creature'], attacking: true, powerLessThanSource: true },
            },
          },
        ],
      },
    );
    expect(triggerGist(mentor, undefined)).toBe(
      "Put a +1/+1 counter on target attacking creature with power less than this creature's power",
    );
  });

  test('Evolve: the intervening "if" is said; a condition the words do not know is left out', () => {
    const evolve = triggered(
      { kind: 'addCounters', objects: { kind: 'this' }, counter: '+1/+1', count: 1 },
      { interveningIf: { kind: 'subjectGreaterPt' } },
    );
    expect(triggerGist(evolve, undefined)).toBe(
      "Put a +1/+1 counter on this permanent if that creature's power or toughness is greater than this creature's",
    );
    const unknown = triggered(
      { kind: 'addCounters', objects: { kind: 'this' }, counter: '+1/+1', count: 1 },
      { interveningIf: { kind: 'kicked' } },
    );
    expect(triggerGist(unknown, undefined)).toBe('Put a +1/+1 counter on this permanent');
  });

  test('an effect the words do not know gives no gist, never JSON or "undefined"', () => {
    const odd = triggered({ kind: 'futureEffect', x: 1 });
    expect(triggerGist(odd, undefined)).toBe('');
  });

  test('blocks and becomes blocked are named in the condition', () => {
    const on = (kind: 'blocks' | 'becomesBlocked') =>
      triggerCondition(
        { kind: 'triggered', trigger: { kind, what: { kind: 'this' } } } as unknown as StackAbility,
        'SYNTHETIC Bushido Duelist',
        undefined,
      );
    expect(on('blocks')).toBe('Whenever SYNTHETIC Bushido Duelist blocks');
    expect(on('becomesBlocked')).toBe('Whenever SYNTHETIC Bushido Duelist becomes blocked');
  });
});
