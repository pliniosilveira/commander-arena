/**
 * The web side of D-135 as pure models: the Gift question and its log line, the sacrifice of "any number", life paid by
 * an amount, a trigger over several zones, "enters untapped", the words of the new effects and conditions (read from the
 * engine's SYNTHETIC cards, so a wording that drifts from the AST fails here), the reflexive trigger, and the graveyard
 * (a cast permission and an ability that works from there). No DOM.
 */
import {
  type Ability,
  type Action,
  type ChoosePermanentDecision,
  type ConfirmOptionalDecision,
  type GameState,
  type GameView,
  type ObjectView,
  type PendingDecision,
  type PriorityDecision,
  type StackAbility,
  syntheticCard,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { gameConditionWords } from '../src/game/condition-text';
import { activationCostText, costText } from '../src/game/cost-text';
import { describeEvent } from '../src/game/describe';
import { giftPrompt, isReflexiveAbility, positionPhrase } from '../src/game/recursion-text';
import { triggerWording } from '../src/game/trigger-text';
import { menuItems } from '../src/ui/decisions/abilities';
import {
  activationLabel,
  costReductionNote,
  triggerCondition,
  triggerGist,
} from '../src/ui/decisions/ability-label';
import { graveyardBadge, graveyardLabels } from '../src/ui/decisions/flashback';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { optionalAsk } from '../src/ui/decisions/optional';
import {
  anyNumberWhat,
  choosePermanentPrompt,
  chosenCount,
  permanentsDetail,
  permanentsHint,
  permanentsReady,
} from '../src/ui/decisions/permanents';
import { initialUi } from '../src/ui/decisions/ui-state';
import { lookupIndexFor } from './decisions-helpers';

const face = (name: string) => {
  const found = syntheticCard(name).faces[0];
  if (found === undefined) throw new Error(`no face for ${name}`);
  return found;
};
const abilitiesOf = (name: string): readonly Ability[] => face(name).abilities;
const triggered = (name: string, at = 0) => {
  const found = abilitiesOf(name).filter((a) => a.kind === 'triggered')[at];
  if (found?.kind !== 'triggered') throw new Error(`no triggered ability ${at} on ${name}`);
  return found;
};
const activated = (name: string) => {
  const found = abilitiesOf(name).find((a) => a.kind === 'activated');
  if (found?.kind !== 'activated') throw new Error(`no activated ability on ${name}`);
  return found;
};

const view = (n: number, name: string, patch: Partial<ObjectView> = {}): ObjectView =>
  ({
    id: `o${n}`,
    name,
    controller: 0,
    owner: 0,
    types: ['creature'],
    subtypes: [],
    colors: [],
    oracleText: '',
    keywords: [],
    isToken: false,
    power: null,
    toughness: null,
    zone: 'battlefield',
    ...patch,
  }) as ObjectView;

function harness(pending: PendingDecision, objects: readonly ObjectView[] = []) {
  const state = {
    viewer: 0,
    turn: 3,
    activeSeat: 0,
    step: 'precombatMain',
    battlefield: objects.filter((o) => o.zone === 'battlefield'),
    stack: objects.filter((o) => o.zone === 'stack'),
    exile: [],
    seats: [
      { id: 0, hand: [], graveyard: [], command: [], mulligans: 0 },
      { id: 1, hand: null, graveyard: [], command: [], mulligans: 0 },
    ],
    pending,
  } as unknown as GameView;
  const acts: Action[] = [];
  const ctl: Controller = { act: (a) => acts.push(a), update: () => {}, openChooser: () => {} };
  return { model: buildModel(state, pending, initialUi(pending), ctl), acts };
}

describe('the Gift question', () => {
  const study = view(1, 'SYNTHETIC Gift Study', { zone: 'stack', types: ['sorcery'] });
  const ranger = view(2, 'SYNTHETIC Gifted Ranger', { zone: 'stack', types: ['creature'] });
  const index = lookupIndexFor([study, ranger]);
  const gift = (source: `o${number}`, name: string): ConfirmOptionalDecision => ({
    id: 'd1',
    seat: 0,
    kind: 'confirmOptional',
    source,
    sourceName: name,
    sourceOracleText: 'Gift a card.',
    purpose: 'gift',
    giftTo: 1,
  });

  test('it names the opponent and what they get, and when', () => {
    expect(optionalAsk(gift('o1', study.name), index).prompt).toBe(
      'Promise Opponent a gift? If you do, they draw a card before the other effects of SYNTHETIC Gift Study.',
    );
    expect(optionalAsk(gift('o2', ranger.name), index).prompt).toBe(
      'Promise Opponent a gift? If you do, they draw a card when SYNTHETIC Gifted Ranger enters.',
    );
    // A spell the view does not show: the timing is left out, never guessed.
    expect(optionalAsk(gift('o9', 'Mystery'), index).prompt).toBe(
      'Promise Opponent a gift? If you do, they draw a card.',
    );
    expect(giftPrompt('you', ['creature'], 'X')).toContain('Promise you a gift?');
  });

  test('the buttons are Gift (primary) and No gift, and Cancel rewinds the cast', () => {
    const ask = optionalAsk(gift('o1', study.name), index);
    expect([ask.yes, ask.no, ask.cancellable]).toEqual(['Gift', 'No gift', true]);
    const { model, acts } = harness(gift('o1', study.name), [study]);
    expect(model.bar.inOverlay).toBe(true);
    expect(model.bar.buttons.map((b) => [b.label, b.variant])).toEqual([
      ['Gift', 'primary'],
      ['No gift', 'secondary'],
    ]);
    model.bar.buttons[0]?.run();
    model.bar.buttons[1]?.run();
    model.bar.cancel?.run();
    expect(acts).toEqual([
      { kind: 'acceptOptional' },
      { kind: 'declineOptional' },
      { kind: 'cancel' },
    ]);
  });
});

describe('the log line of a spell cast with a gift', () => {
  const state = {
    objects: { o1: { card: 'c1', token: null, stack: null, controller: 0 } },
    cards: { c1: { definition: 'd1' } },
    definitions: { d1: { name: 'Gift Study' } },
    pending: null,
    casting: null,
  } as unknown as GameState;
  const log = (event: object, viewer = 0) =>
    describeEvent(event as never, state, state, viewer)?.text;
  const cast = { kind: 'spellCast', seat: 0, object: 'o1', commanderTax: 0 };

  test('says whom the gift was promised to', () => {
    expect(log({ ...cast, gift: 1 })).toBe('You cast Gift Study, promising Opponent a gift.');
    expect(log({ ...cast, seat: 1, gift: 0 })).toBe(
      'Opponent casts Gift Study, promising you a gift.',
    );
    expect(log(cast)).toBe('You cast Gift Study.');
  });

  test('comes after kicker and replicate', () => {
    expect(log({ ...cast, kicked: true, gift: 1 })).toBe(
      'You cast Gift Study, kicked, promising Opponent a gift.',
    );
  });
});

describe('sacrificing any number of permanents', () => {
  const god = triggered('SYNTHETIC Greedy God');
  const host = view(1, 'SYNTHETIC Greedy God', {
    oracleText: 'When this creature enters, sacrifice any number of other permanents.',
  });
  const onStack = view(2, 'SYNTHETIC Greedy God', {
    zone: 'stack',
    types: [],
    abilitySource: host.id,
    ability: god as StackAbility,
  });
  const index = lookupIndexFor([host, onStack]);
  const decision = (patch: Partial<ChoosePermanentDecision> = {}): ChoosePermanentDecision => ({
    id: 'd1',
    seat: 0,
    kind: 'choosePermanent',
    source: onStack.id,
    purpose: 'sacrifice',
    min: 0,
    max: 3,
    legal: ['o10', 'o11', 'o12'],
    ...patch,
  });

  test('the prompt says "any number" and what, from the filter on the stack', () => {
    expect(choosePermanentPrompt(decision(), index)).toBe(
      'Sacrifice any number of other permanents you control for SYNTHETIC Greedy God.',
    );
    expect(anyNumberWhat(decision(), index)).toBe('any number of other permanents you control');
    // The ability is not in the view: nothing is guessed.
    const bare = lookupIndexFor([
      host,
      view(2, 'SYNTHETIC Greedy God', { zone: 'stack', types: [] }),
    ]);
    expect(choosePermanentPrompt(decision(), bare)).toBe(
      'Sacrifice any number of permanents for SYNTHETIC Greedy God.',
    );
    // A fixed number keeps the ordinary words.
    expect(choosePermanentPrompt(decision({ min: 2, max: 2 }), index)).toBe(
      'Sacrifice 2 permanents for SYNTHETIC Greedy God.',
    );
  });

  test('Confirm works with nothing chosen, and with any number up to the maximum', () => {
    const d = decision();
    expect(permanentsReady([], d)).toBe(true);
    expect(permanentsHint([], d)).toBeNull();
    expect(permanentsReady(['o10', 'o11', 'o12'], d)).toBe(true);
    expect(permanentsReady(['o10', 'o11', 'o12', 'o13'], d)).toBe(false);
  });

  test('the lines say what Confirm will do', () => {
    const d = decision();
    expect(chosenCount([], d)).toBe('0 of up to 3 chosen');
    expect(permanentsDetail([], d)).toBe(
      'Click permanents to sacrifice, or Confirm to sacrifice none.',
    );
    expect(permanentsDetail(['o10', 'o11'], d)).toBe(
      'Sacrificing 2 permanents. Click one again to take it back.',
    );
    expect(chosenCount(['o10'], { min: 2, max: 2 })).toBe('1 of 2 chosen');
  });

  test('the model enables Confirm at once and sends an empty choice', () => {
    const { model, acts } = harness(decision(), [host, onStack]);
    const confirm = model.bar.buttons[0];
    expect(confirm?.label).toBe('Confirm');
    expect(confirm?.disabled).toBeFalsy();
    confirm?.run();
    expect(acts).toEqual([{ kind: 'choosePermanents', objects: [] }]);
  });

  test('a fixed sacrifice still needs its count', () => {
    const { model } = harness(decision({ min: 1, max: 1 }), [host, onStack]);
    expect(model.bar.buttons[0]?.disabled).toBe(true);
  });

  test('the log says who chose none, and which', () => {
    const state = {
      objects: {
        o1: { card: 'c1', token: null, stack: null, controller: 0 },
        o2: { card: 'c2', token: null, stack: null, controller: 0 },
      },
      cards: { c1: { definition: 'd1' }, c2: { definition: 'd2' } },
      definitions: { d1: { name: 'Greedy God' }, d2: { name: 'Forest' } },
      pending: null,
    } as unknown as GameState;
    const line = (objects: string[]) =>
      describeEvent(
        {
          kind: 'permanentsChosen',
          seat: 0,
          source: 'o1',
          objects,
          purpose: 'sacrifice',
          automatic: false,
        } as never,
        state,
        state,
        0,
      )?.text;
    expect(line([])).toBe('You choose to sacrifice nothing for Greedy God.');
    expect(line(['o2'])).toContain('You choose Forest to sacrifice');
  });
});

describe('life paid by an amount', () => {
  test('a cost that pays life equal to a count reads as a sentence', () => {
    const tithe = activated('SYNTHETIC Tithe Well');
    expect(activationCostText(tithe.cost)).toBe(
      "{1}, {T}, Pay life equal to the number of colors in your commander's color identity",
    );
    expect(costText([{ kind: 'payLife', amount: { kind: 'commanderColors' } }])).toBe(
      "life equal to the number of colors in your commander's color identity",
    );
    expect(activationCostText([{ kind: 'payLife', amount: 3 }])).toBe('Pay 3 life');
  });

  test('another count reads right too, and the chooser label names the effect', () => {
    const blood = activated('SYNTHETIC Blood Well');
    expect(activationCostText(blood.cost)).toBe(
      '{T}, Pay life equal to the number of creatures you control',
    );
    expect(
      activationLabel(view(1, 'SYNTHETIC Blood Well', { types: ['land'] }), {
        abilityIndex: 0,
        ability: blood,
      }),
    ).toBe('{T}, Pay life equal to the number of creatures you control: You draw a card');
  });
});

describe('triggers in words', () => {
  const ctx = { self: 'Greedy God' };
  test('a trigger over several zones reads as one clause', () => {
    const god = triggered('SYNTHETIC Greedy God', 1);
    expect(triggerWording(god.trigger, ctx)).toBe(
      'Whenever Greedy God dies or is put into exile from the battlefield',
    );
    expect(
      triggerWording(
        { kind: 'leavesBattlefield', what: { kind: 'this' }, to: ['exile', 'graveyard'] },
        ctx,
      ),
    ).toBe('Whenever Greedy God dies or is put into exile from the battlefield');
    // One zone keeps its words.
    expect(
      triggerWording({ kind: 'leavesBattlefield', what: { kind: 'this' }, to: 'exile' }, ctx),
    ).toBe('Whenever Greedy God leaves the battlefield and is put into exile');
  });

  test('"enters untapped" and "enters tapped"', () => {
    const untapped = abilitiesOf('SYNTHETIC Haunted Cottage').find((a) => a.kind === 'triggered');
    if (untapped?.kind !== 'triggered') throw new Error('no trigger');
    expect(triggerWording(untapped.trigger, { self: 'Cottage' })).toBe(
      'Whenever Cottage enters untapped',
    );
    expect(
      triggerWording(
        { kind: 'entersBattlefield', what: { kind: 'this' }, tapped: true },
        { self: 'Cottage' },
      ),
    ).toBe('Whenever Cottage enters tapped');
    expect(
      triggerWording({ kind: 'entersBattlefield', what: { kind: 'this' } }, { self: 'Cottage' }),
    ).toBe('Whenever Cottage enters');
  });
});

describe('the new effects in words', () => {
  const gist = (name: string, at = 0, self: ObjectView['types'][number] = 'creature') => {
    const found = triggered(name, at);
    return triggerGist(found as StackAbility, view(1, name, { types: [self] }));
  };

  test('any number sacrificed, then that many drawn', () => {
    expect(gist('SYNTHETIC Greedy God')).toBe(
      'Sacrifice any number of other permanents you control. You draw that many cards',
    );
  });

  test('"you may", "if you do" and the library position', () => {
    expect(gist('SYNTHETIC Greedy God', 1)).toBe(
      "You may put it third from the top of its owner's library",
    );
    expect(gist('SYNTHETIC Pitch Reunion')).toBe(
      'You may discard a card. If you do, you draw 2 cards',
    );
  });

  test('a reflexive trigger and the exile of the source', () => {
    expect(gist('SYNTHETIC Keen Butler')).toBe(
      'You may exile it. When you do, return target creature card from your graveyard to your hand',
    );
  });

  test('a permission to cast from the graveyard names the card and the turn', () => {
    expect(
      activationLabel(view(1, 'SYNTHETIC Grave Chanter Zombie', { subtypes: ['Zombie'] }), {
        abilityIndex: 0,
        ability: activated('SYNTHETIC Grave Chanter Zombie'),
      }),
    ).toBe('{T}: You may cast target Zombie creature card from your graveyard this turn');
  });

  test('a spell that returns a card says to whose hand, and a condition on the card', () => {
    const spell = face('SYNTHETIC Recall Zombie').spell;
    if (spell === undefined || spell === null) throw new Error('no spell');
    const ability = {
      kind: 'triggered',
      trigger: { kind: 'step', step: 'upkeep', whose: 'you' },
      targets: spell.targets,
      effect: spell.effect,
    } as StackAbility;
    expect(triggerGist(ability, undefined)).toBe(
      "Return target creature card from your graveyard to your hand. If it's a Zombie card, you draw a card",
    );
  });

  test('a return to the battlefield with a counter, and the other library positions', () => {
    const revenant = activated('SYNTHETIC Revenant Zombie');
    expect(
      triggerGist(
        revenant as StackAbility,
        view(1, 'SYNTHETIC Revenant Zombie', { types: ['creature'] }),
      ),
    ).toBe('Return this creature to the battlefield with a +1/+1 counter on it');
    expect(positionPhrase('top')).toBe('on top of');
    expect(positionPhrase('bottom')).toBe('on the bottom of');
    expect(positionPhrase(2)).toBe('second from the top of');
    expect(positionPhrase(3)).toBe('third from the top of');
  });

  test('"the greatest power" in an opponent\'s sacrifice, and the chosen player', () => {
    const reaper = face('SYNTHETIC Greedy Reaper').spell;
    if (reaper === undefined || reaper === null) throw new Error('no spell');
    const ability = {
      kind: 'triggered',
      trigger: { kind: 'step', step: 'upkeep', whose: 'you' },
      targets: reaper.targets,
      effect: reaper.effect,
    } as StackAbility;
    expect(triggerGist(ability, undefined)).toBe(
      'Target opponent sacrifices a creature with the greatest power among creatures they control. If the gift was promised, return target creature card from your graveyard to your hand',
    );
    const gift = abilitiesOf('SYNTHETIC Gifted Ranger').filter((a) => a.kind === 'triggered')[0];
    if (gift?.kind !== 'triggered') throw new Error('no trigger');
    expect(triggerGist(gift as StackAbility, undefined)).toContain('Destroy target');
    // The engine's own gift ability: the chosen player draws, if the gift was promised.
    const own: StackAbility = {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      interveningIf: { kind: 'giftPromised' },
      effect: { kind: 'draw', player: { kind: 'giftRecipient' }, count: 1 },
    };
    expect(triggerGist(own, undefined)).toBe(
      'The chosen player draws a card if the gift was promised',
    );
  });
});

describe('conditions in words', () => {
  test('"if you do", "if the gift was promised", "it\'s a Zombie card"', () => {
    expect(gameConditionWords({ kind: 'didPrevious' })).toBe('you do');
    expect(gameConditionWords({ kind: 'giftPromised' })).toBe('the gift was promised');
    expect(gameConditionWords({ kind: 'not', term: { kind: 'giftPromised' } })).toBe(
      "the gift wasn't promised",
    );
    expect(
      gameConditionWords({
        kind: 'objectMatches',
        of: { kind: 'moved' },
        filter: { subtypes: ['Angel'] },
      }),
    ).toBe("it's an Angel card");
    expect(
      gameConditionWords({
        kind: 'objectMatches',
        of: { kind: 'target', id: 't1' },
        filter: { types: ['creature'], subtypes: ['Zombie'] },
      }),
    ).toBe("it's a Zombie card");
    expect(
      gameConditionWords({
        kind: 'objectMatches',
        of: { kind: 'target', id: 't1' },
        filter: { types: ['land'] },
      }),
    ).toBe("it's a land card");
  });

  test('an opponent controlling nonbasic lands', () => {
    const nonbasic = { types: ['land'], notSupertypes: ['basic'] } as const;
    expect(
      gameConditionWords({ kind: 'opponentControlsAtLeast', filter: nonbasic, count: 4 }),
    ).toBe('an opponent controls 4 or more nonbasic lands');
    expect(
      gameConditionWords({ kind: 'opponentControlsAtLeast', filter: nonbasic, count: 1 }),
    ).toBe('an opponent controls a nonbasic land');
  });
});

describe('the graveyard', () => {
  const revenant = view(1, 'SYNTHETIC Revenant Zombie', {
    zone: 'graveyard',
    subtypes: ['Zombie'],
    activated: [{ abilityIndex: 1, ability: activated('SYNTHETIC Revenant Zombie') }],
  });
  const zombie = view(2, 'SYNTHETIC Plain Zombie', { zone: 'graveyard', subtypes: ['Zombie'] });
  const decision = (options: PriorityDecision['options']): PriorityDecision =>
    ({ id: 'd', seat: 0, kind: 'priority', options }) as unknown as PriorityDecision;
  const index = lookupIndexFor([revenant, zombie]);

  test('an ability that works from the graveyard is a menu entry that names the reduced cost', () => {
    const d = decision([{ kind: 'activate', object: 'o1', abilityIndex: 1 }]);
    const label =
      '{4}{B}{B}: Return this card to the battlefield with a +1/+1 counter on it (costs {4} less to activate if an opponent controls 4 or more nonbasic lands)';
    expect(graveyardLabels(d, revenant)).toEqual([label]);
    expect(menuItems(d, 'o1', index).map((i) => i.label)).toEqual([label]);
    expect(menuItems(d, 'o1', index)[0]?.action).toEqual({
      kind: 'activate',
      object: 'o1',
      abilityIndex: 1,
    });
    expect(graveyardBadge(d, index, 'o1')).toBe(label);
  });

  test('a card an effect lets the player cast is "Cast from graveyard"', () => {
    const d = decision([{ kind: 'castSpell', object: 'o2' }]);
    expect(graveyardLabels(d, zombie)).toEqual(['Cast from graveyard']);
    expect(menuItems(d, 'o2', index).map((i) => i.label)).toEqual([
      'Cast SYNTHETIC Plain Zombie from graveyard',
    ]);
  });

  test('the reduction note is empty without a reduction or with a condition the words do not cover', () => {
    expect(costReductionNote({})).toBe('');
    expect(
      costReductionNote({ costReducedIf: { generic: 2, condition: { kind: 'escaped' } } }),
    ).toBe('');
  });
});

describe('the reflexive trigger', () => {
  const placeholder: StackAbility = {
    kind: 'triggered',
    trigger: { kind: 'step', step: 'endStep', whose: 'you' },
    effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
  };
  const butler =
    'When this creature dies, you may exile it. When you do, return target creature card from your graveyard to your hand.';

  test('is told from an end-step trigger by the words of its source', () => {
    expect(isReflexiveAbility(placeholder, butler)).toBe(true);
    expect(isReflexiveAbility(placeholder, 'At the beginning of your end step, draw a card.')).toBe(
      false,
    );
    expect(isReflexiveAbility(placeholder, '')).toBe(false);
  });

  test('is worded "When you do" on the stack and in the target prompt', () => {
    expect(triggerCondition(placeholder, 'Keen Butler', { subtypes: [], oracleText: butler })).toBe(
      'When you do',
    );
    expect(
      triggerCondition(placeholder, 'Keen Butler', { subtypes: [], oracleText: butler }, true),
    ).toBe('when you do');
    expect(
      triggerCondition(placeholder, 'Ender', {
        subtypes: [],
        oracleText: 'At the beginning of your end step, draw.',
      }),
    ).toBe('At the beginning of your end step');
  });
});
