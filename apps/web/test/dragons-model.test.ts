/**
 * The web side of D-151 (the Dragons slice) as pure models: the questions the engine asks (a name the card gives or a chapter, the
 * creature a permanent copies, Behold, paying any amount, the discard of any number of cards, a mode that may not repeat, a target
 * slot that differs from another, Discover's decline) and what a card castable from the top of the library or from exile says. No DOM.
 */
import type {
  Action,
  ChooseCardsDecision,
  ChooseModesDecision,
  ChooseOptionDecision,
  ChoosePermanentDecision,
  ChooseXDecision,
  ChosenTarget,
  ConfirmOptionalDecision,
  GameView,
  ObjectView,
  PendingDecision,
  PriorityDecision,
  TargetChoiceSpec,
  TargetsDecision,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { menuItems } from '../src/ui/decisions/abilities';
import {
  beholdCards,
  beholdHelp,
  cardsPrompt,
  confirmLabel,
  discardTitle,
  foundBadge,
  foundDetail,
  pickerCards,
  waitingText,
} from '../src/ui/decisions/cards-picker';
import { castBadge, castLabel } from '../src/ui/decisions/flashback';
import {
  CAST_FROM_EXILE,
  CAST_FROM_LIBRARY,
  exileBadge,
  exileCastObjects,
  libraryBadge,
  PLAY_FROM_EXILE,
} from '../src/ui/decisions/layouts';
import { objectIndex } from '../src/ui/decisions/lookup';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import {
  modesHeading,
  NO_REPEAT_MODE,
  notRepeatedThisTurn,
  toggleMode,
} from '../src/ui/decisions/modes-picker';
import {
  chapterTexts,
  isChapterChoice,
  isNamedChoice,
  namedOptionPrompt,
  namedOptionRows,
  optionList,
} from '../src/ui/decisions/option-names';
import { optionPrompt } from '../src/ui/decisions/option-picker';
import {
  cascadeDecline,
  cascadeKind,
  cascadePrompt,
  mayBeholdPrompt,
  optionalAsk,
} from '../src/ui/decisions/optional';
import { angelsBadge, angelsPermanentPrompt } from '../src/ui/decisions/permanents-angels';
import {
  entersCopyConfirm,
  entersCopyDetail,
  entersCopyPrompt,
  entersCopyTitle,
  isEntersCopy,
} from '../src/ui/decisions/permanents-dragons';
import { playableObjects } from '../src/ui/decisions/priority';
import { targetsPrompt, targetsWord } from '../src/ui/decisions/target-prompt';
import { repeatsOtherSlot, slotStatuses, toggleTarget } from '../src/ui/decisions/targeting';
import { initialUi } from '../src/ui/decisions/ui-state';
import {
  initialX,
  isPayAnyAmount,
  payAmountButtonText,
  payAmountCostAt,
  payAmountPrompt,
  payAmountSymbols,
  xPrompt,
} from '../src/ui/decisions/x-picker';
import { lookupIndexFor } from './decisions-helpers';

const obj = (id: string, extra: Partial<ObjectView> = {}): ObjectView =>
  ({
    id,
    name: `Card ${id}`,
    controller: 0,
    owner: 0,
    types: ['creature'],
    subtypes: [],
    counters: {},
    zone: 'battlefield',
    oracleText: '',
    keywords: [],
    ...extra,
  }) as unknown as ObjectView;

function harness(
  pending: PendingDecision,
  objects: readonly ObjectView[] = [],
  ui: Partial<ReturnType<typeof initialUi>> = {},
  over: Partial<GameView> = {},
) {
  const view = {
    viewer: 0,
    turn: 3,
    activeSeat: 0,
    step: 'main1',
    battlefield: objects.filter((o) => o.zone === 'battlefield'),
    stack: objects.filter((o) => o.zone === 'stack'),
    exile: objects.filter((o) => o.zone === 'exile'),
    combat: null,
    seats: [
      {
        id: 0,
        hand: objects.filter((o) => o.zone === 'hand'),
        graveyard: [],
        command: [],
        mulligans: 0,
        poison: 0,
      },
      { id: 1, hand: null, graveyard: [], command: [], mulligans: 0, poison: 0 },
    ],
    pending,
    ...over,
  } as unknown as GameView;
  const acts: Action[] = [];
  const ctl: Controller = { act: (a) => acts.push(a), update: () => {}, openChooser: () => {} };
  return { model: buildModel(view, pending, { ...initialUi(pending), ...ui }, ctl), acts, view };
}

describe('a choice among names, and the chapter of read ahead', () => {
  const names = {
    kind: 'chooseOption',
    id: 'd1',
    seat: 0,
    purpose: 'option',
    options: ['Khans', 'Dragons'],
    source: 'o1',
    sourceName: 'Siege of Choices',
    sourceOracleText: 'As this enchantment enters, choose Khans or Dragons.',
  } as unknown as ChooseOptionDecision;
  const saga = {
    ...names,
    options: ['1', '2', '3'],
    sourceName: 'Reading Rite',
    sourceOracleText:
      'Read ahead\nI — This Saga deals 2 damage to each creature and each opponent.\nII, III — Draw a card.',
  } as unknown as ChooseOptionDecision;

  test('which is which', () => {
    expect(isNamedChoice(names)).toBe(true);
    expect(isChapterChoice(names)).toBe(false);
    expect(isChapterChoice(saga)).toBe(true);
    expect(isNamedChoice(saga)).toBe(false);
    // A creature type or a color is not one of them.
    expect(isNamedChoice({ ...names, purpose: 'color' })).toBe(false);
    expect(isChapterChoice({ ...saga, purpose: 'creatureType' })).toBe(false);
  });

  test('the prompt names the card and the options, or asks for a chapter', () => {
    expect(optionList(['Khans', 'Dragons'])).toBe('Khans or Dragons');
    expect(optionList(['A', 'B', 'C'])).toBe('A, B or C');
    expect(namedOptionPrompt(names)).toBe('As Siege of Choices enters, choose Khans or Dragons.');
    expect(optionPrompt(names)).toBe(namedOptionPrompt(names));
    expect(optionPrompt(saga)).toBe('Choose a chapter to start with for Reading Rite.');
    // The creature type and color prompts are the old ones.
    expect(optionPrompt({ ...names, purpose: 'color' })).toBe(
      'As Siege of Choices enters, choose a color.',
    );
  });

  test('the buttons: the names, or the chapters with their words', () => {
    expect(namedOptionRows(names)).toEqual([
      { option: 'Khans', label: 'Khans', detail: null },
      { option: 'Dragons', label: 'Dragons', detail: null },
    ]);
    expect(namedOptionRows(saga)).toEqual([
      {
        option: '1',
        label: 'Chapter I',
        detail: 'This Saga deals 2 damage to each creature and each opponent.',
      },
      { option: '2', label: 'Chapter II', detail: 'Draw a card.' },
      { option: '3', label: 'Chapter III', detail: 'Draw a card.' },
    ]);
  });

  test('chapter texts are read from the lines that are chapters only', () => {
    const texts = chapterTexts('Read ahead\nI — A.\nIV — D.\nNot a chapter — X.');
    expect([...texts.entries()]).toEqual([
      [1, 'A.'],
      [4, 'D.'],
    ]);
  });

  test('the bar prompt of the question is the same words', () => {
    const { model } = harness(saga);
    expect(model.bar.prompt).toBe('Choose a chapter to start with for Reading Rite.');
    expect(model.bar.inOverlay).toBe(true);
  });
});

describe('a permanent that enters as a copy', () => {
  const glass = obj('o5', {
    name: 'Cursed Looking Glass',
    zone: 'stack',
    types: ['artifact'],
    oracleText:
      'As this artifact enters, you may have it become a copy of any creature on the battlefield until end of turn, except it has haste.',
  });
  const bears = obj('o1', { name: 'Grizzly Bears' });
  const wolf = obj('o2', { name: 'Wolf', controller: 1 });
  const d = {
    kind: 'choosePermanent',
    id: 'd1',
    seat: 0,
    source: 'o5',
    subject: 'o5',
    purpose: 'entersCopy',
    min: 0,
    max: 1,
    legal: ['o1', 'o2'],
  } as unknown as ChoosePermanentDecision;
  const index = lookupIndexFor([glass, bears, wolf]);

  test('the prompt says what is copied, for how long, that none is an answer, and what enters', () => {
    expect(isEntersCopy(d)).toBe(true);
    expect(entersCopyPrompt(d, index, 'creature')).toBe(
      'Choose a creature to copy until end of turn, or none, as Cursed Looking Glass enters.',
    );
    expect(angelsPermanentPrompt(d, index)).toBe(
      'Choose a creature to copy until end of turn, or none, as Cursed Looking Glass enters.',
    );
    expect(entersCopyPrompt({ ...d, min: 1 }, index, 'creature')).toBe(
      'Choose a creature to copy until end of turn, as Cursed Looking Glass enters.',
    );
    expect(entersCopyTitle('creature')).toBe('Copy a creature');
    expect(angelsBadge(d, index)).toBe('Copy');
  });

  test('without the end of turn in the card the prompt does not claim it', () => {
    const forever = lookupIndexFor([
      { ...glass, oracleText: 'As this enters, you may have it become a copy of any creature.' },
      bears,
    ]);
    expect(entersCopyPrompt(d, forever, 'creature')).toBe(
      'Choose a creature to copy, or none, as Cursed Looking Glass enters.',
    );
  });

  test('Confirm works with nothing chosen and says what it does', () => {
    expect(entersCopyConfirm([])).toBe('Copy nothing');
    expect(entersCopyConfirm(['o1'])).toBe('Copy it');
    expect(entersCopyDetail([], d, index)).toBe(
      'Click a creature to copy it, or Confirm to copy none.',
    );
    expect(entersCopyDetail(['o1'], d, index)).toBe(
      'Copying Grizzly Bears. Click it again to take it back.',
    );
    const { model, acts } = harness(d, [bears, wolf, glass]);
    const confirm = model.bar.buttons[0];
    expect(confirm?.label).toBe('Copy nothing');
    expect(confirm?.disabled).toBeFalsy();
    confirm?.run();
    expect(acts).toEqual([{ kind: 'choosePermanents', objects: [] }]);
    const chosen = harness(d, [bears, wolf, glass], { permanents: ['o2'] });
    expect(chosen.model.bar.buttons[0]?.label).toBe('Copy it');
    expect(chosen.model.interaction.badge('o2')).toBe('Copy');
    expect(chosen.model.bar.cancel).toBeNull();
  });
});

describe('Behold', () => {
  const scout = obj('o9', {
    name: 'Dragon Scout',
    zone: 'stack',
    abilitySource: 'o8',
    ability: {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: {
        kind: 'sequence',
        effects: [{ kind: 'may', effect: { kind: 'behold', filter: { subtypes: ['Dragon'] } } }],
      },
    },
  } as never);
  const inHand = obj('o1', { name: 'Plain Drake', zone: 'hand', subtypes: ['Dragon'] });
  const onField = obj('o2', { name: 'Big Plain Drake', subtypes: ['Dragon'] });
  const d = {
    kind: 'chooseCards',
    id: 'd1',
    seat: 0,
    source: 'o9',
    purpose: 'behold',
    zone: 'hand',
    legal: ['o1', 'o2'],
    min: 1,
    max: 1,
    reveal: true,
    prompt: 'Behold: reveal a card from your hand or choose a permanent you control',
  } as unknown as ChooseCardsDecision;

  test('the prompt says what is beheld and both places, from the ability on the stack', () => {
    const index = lookupIndexFor([scout, inHand, onField]);
    expect(cardsPrompt(d, index)).toBe("Behold a Dragon (Dragon Scout's ability).");
    expect(beholdHelp(d, index)).toBe(
      'Reveal a Dragon card from your hand or choose a Dragon you control on the battlefield.',
    );
    expect(discardTitle(d, index)).toBe('Behold a Dragon');
  });

  test('without the ability the engine words are kept, never a guess', () => {
    expect(cardsPrompt(d, lookupIndexFor([inHand, onField]))).toBe(
      'Behold: reveal a card from your hand or choose a permanent you control (that spell).',
    );
    expect(beholdHelp(d, lookupIndexFor([inHand, onField]))).toBe(
      'Choose one: a card of your hand to reveal, or a permanent you control.',
    );
    expect(discardTitle(d, lookupIndexFor([inHand, onField]))).toBe('Behold');
  });

  test('the cards are listed in the two places they are, the hand and the battlefield', () => {
    const { view } = harness(d, [scout, inHand, onField]);
    const { hand, battlefield } = beholdCards(view, d);
    expect(hand.map((o) => o.id)).toEqual(['o1']);
    expect(battlefield.map((o) => o.id)).toEqual(['o2']);
    expect(pickerCards(view, d).map((o) => o.id)).toEqual(['o1', 'o2']);
  });

  test('the bar: Behold, a badge on the card chosen, the rest of the board steps back, a Cancel is not offered', () => {
    expect(confirmLabel(d, [], 'hand')).toBe('Behold');
    expect(foundBadge(d, ['o2'], 'o2')).toBe('Behold');
    expect(foundBadge(d, ['o2'], 'o1')).toBeNull();
    const { model, acts } = harness(d, [scout, inHand, onField], { found: ['o2'] });
    expect(model.interaction.dimOthers).toBe(true);
    expect([...model.interaction.clickable].sort()).toEqual(['o1', 'o2']);
    expect(model.bar.cancel).toBeNull();
    expect(model.bar.buttons[0]?.disabled).toBeFalsy();
    model.bar.buttons[0]?.run();
    expect(acts).toEqual([{ kind: 'chooseCards', objects: ['o2'] }]);
  });

  test('the other player is told they are beholding', () => {
    const view = {
      waitingOn: { purpose: 'behold', sourceName: 'Dragon Scout' },
    } as unknown as GameView;
    expect(waitingText(view)).toBe('Opponent is beholding (Dragon Scout).');
  });
});

describe('"You may behold a Dragon"', () => {
  const scout = obj('o9', {
    name: 'Dragon Scout',
    zone: 'stack',
    abilitySource: 'o8',
    ability: {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: {
        kind: 'sequence',
        effects: [{ kind: 'may', effect: { kind: 'behold', filter: { subtypes: ['Dragon'] } } }],
      },
    },
  } as never);
  const d = {
    kind: 'confirmOptional',
    id: 'd1',
    seat: 0,
    source: 'o9',
    sourceName: 'Dragon Scout',
    sourceOracleText: 'When this creature enters, you may behold a Dragon.',
  } as unknown as ConfirmOptionalDecision;

  test('the question says what is beheld, and the buttons say what they do', () => {
    const index = lookupIndexFor([scout]);
    expect(mayBeholdPrompt(d, index)).toBe(
      'Behold a Dragon? Reveal a Dragon card from your hand or choose a Dragon you control on the battlefield.',
    );
    expect(optionalAsk(d, index)).toMatchObject({
      yes: 'Behold',
      no: "Don't behold",
      cancellable: false,
    });
  });

  test('any other plain question keeps its words', () => {
    expect(mayBeholdPrompt(d, lookupIndexFor([]))).toBeNull();
    expect(optionalAsk(d, lookupIndexFor([])).yes).toBe('Yes');
    // A question with a purpose or a cost is not this one.
    expect(
      mayBeholdPrompt(
        { ...d, purpose: 'mayPay' } as ConfirmOptionalDecision,
        lookupIndexFor([scout]),
      ),
    ).toBeNull();
  });
});

describe('discarding any number of cards', () => {
  const hand = ['o1', 'o2'].map((id) => obj(id, { zone: 'hand' }));
  const rite = obj('o9', {
    name: 'Reading Rite',
    zone: 'stack',
    abilitySource: 'o8',
    chapter: 2,
  } as never);
  const d = {
    kind: 'chooseCards',
    id: 'd1',
    seat: 0,
    source: 'o9',
    purpose: 'discard',
    zone: 'hand',
    legal: ['o1', 'o2'],
    min: 0,
    max: 2,
    reveal: false,
    prompt: 'Discard any number of cards.',
  } as unknown as ChooseCardsDecision;

  test('none is an answer, and Confirm says so', () => {
    expect(confirmLabel(d, [], 'hand')).toBe('Discard none');
    expect(confirmLabel(d, ['o1'], 'hand')).toBe('Discard');
    expect(foundDetail(d, [])).toBe(
      '0 of up to 2 chosen. Click cards to discard them, or Confirm to discard none.',
    );
    expect(foundDetail(d, ['o1'])).toBe('1 of up to 2 chosen');
    expect(cardsPrompt(d, lookupIndexFor([rite]))).toBe(
      "Discard any number of cards (Reading Rite's chapter II ability).",
    );
    const { model, acts } = harness(d, [...hand, rite]);
    expect(model.bar.buttons[0]?.disabled).toBeFalsy();
    model.bar.buttons[0]?.run();
    expect(acts).toEqual([{ kind: 'chooseCards', objects: [] }]);
  });

  test('a discard with a minimum keeps its labels', () => {
    expect(confirmLabel({ ...d, min: 1 }, [], 'hand')).toBe('Discard');
  });
});

describe('paying any amount of a symbol', () => {
  const d = {
    kind: 'chooseX',
    id: 'd1',
    seat: 0,
    source: 'o9',
    sourceName: 'Ember Tyrant',
    sourceOracleText: '',
    purpose: 'payAnyAmount',
    min: 0,
    max: 3,
    perX: { mana: 0, life: 0 },
    cost: [{ kind: 'mana', symbols: ['R'] }],
  } as unknown as ChooseXDecision;

  test('the words: the symbol, the most, and what each number costs', () => {
    expect(isPayAnyAmount(d)).toBe(true);
    expect(payAmountSymbols(d)).toEqual(['R']);
    expect(payAmountPrompt(d)).toBe(
      "Pay any amount of {R} for Ember Tyrant's ability. You can pay up to 3.",
    );
    expect(xPrompt(d)).toBe(payAmountPrompt(d));
    expect(payAmountCostAt(d, 2)).toBe('{R}{R}');
    expect(payAmountCostAt(d, 0)).toBe('');
    expect(payAmountButtonText(d, 0)).toBe("Don't pay");
    expect(payAmountButtonText(d, 3)).toBe('Pay {R}{R}{R}');
    // It starts at 0: a player who confirms without looking pays nothing.
    expect(initialX(d)).toBe(0);
  });

  test('the bar: no Cancel (the engine lists none), the confirm sends the number', () => {
    const { model, acts } = harness(d, [], { x: 2 });
    expect(model.bar.cancel).toBeNull();
    expect(model.bar.buttons[0]?.label).toBe('Pay {R}{R}');
    model.bar.buttons[0]?.run();
    expect(acts).toEqual([{ kind: 'chooseX', value: 2 }]);
    expect(harness(d, [], { x: 0 }).model.bar.buttons[0]?.label).toBe("Don't pay");
  });

  test('an ordinary X keeps its Cancel', () => {
    const x = { ...d, purpose: 'spell' } as unknown as ChooseXDecision;
    expect(harness(x, [], { x: 1 }).model.bar.cancel).not.toBeNull();
  });
});

describe('choose one that has not been chosen this turn', () => {
  const trigger = obj('o9', {
    name: 'Thrashing Wyrm',
    zone: 'stack',
    abilitySource: 'o8',
    ability: {
      kind: 'triggered',
      trigger: { kind: 'combatDamageBatch', what: {}, to: 'opponent' },
      effect: { kind: 'sequence', effects: [] },
      chooseModes: { min: 1, max: 1, notRepeatedThisTurn: true },
      modes: [],
    },
  } as never);
  const d = {
    kind: 'chooseModes',
    id: 'd1',
    seat: 0,
    source: 'o9',
    sourceName: 'Thrashing Wyrm',
    sourceOracleText: '',
    purpose: 'trigger',
    modes: [
      { index: 0, text: 'Destroy target artifact.', legal: false },
      { index: 1, text: 'Deal 4 damage.', legal: true },
    ],
    min: 1,
    max: 1,
    sets: [[1]],
    forTrigger: true,
  } as unknown as ChooseModesDecision;

  test('the ability on the stack says the modes may not repeat', () => {
    expect(notRepeatedThisTurn(d, lookupIndexFor([trigger]))).toBe(true);
    expect(notRepeatedThisTurn(d, lookupIndexFor([]))).toBe(false);
    expect(modesHeading(d, false)).toBe("Choose one that hasn't been chosen this turn —");
    expect(modesHeading(d)).toBe('Choose one —');
    expect(NO_REPEAT_MODE).toContain('Already chosen this turn');
  });

  test('a mode that is not legal is not picked', () => {
    expect(toggleMode(d, [], 0)).toEqual([]);
    expect(toggleMode(d, [], 1)).toEqual([1]);
  });
});

describe('a target slot that differs from an earlier one', () => {
  const t = (id: string): ChosenTarget => ({ kind: 'object', id, specId: '' }) as ChosenTarget;
  const legal = [
    { kind: 'object', id: 'o1' },
    { kind: 'object', id: 'o2' },
    { kind: 'object', id: 'o3' },
  ] as never;
  const specs: TargetChoiceSpec[] = [
    { specId: 't1', min: 1, max: 1, legal },
    { specId: 't2', min: 0, max: 2, differentFrom: 't1', legal },
  ];

  test('the second slot never takes what the first has', () => {
    const first = toggleTarget(specs, [], t('o1'));
    expect(first).toEqual([{ kind: 'object', id: 'o1', specId: 't1' }]);
    const second = toggleTarget(specs, first, t('o2'));
    expect(second.map((p) => `${p.specId}:${p.kind === 'object' ? p.id : ''}`)).toEqual([
      't1:o1',
      't2:o2',
    ]);
    // A chip under the second slot for the target the first has: nothing is added.
    expect(toggleTarget(specs, first, t('o1'), 't2')).toEqual(first);
    // And the first slot never takes what the second has, however it is asked.
    const inSecond: ChosenTarget[] = [{ kind: 'object', id: 'o2', specId: 't2' }];
    expect(toggleTarget(specs, inSecond, t('o2'), 't1')).toEqual(inSecond);
    expect(repeatsOtherSlot(specs, first, specs[1] as TargetChoiceSpec, t('o1'))).toBe(true);
    expect(repeatsOtherSlot(specs, first, specs[1] as TargetChoiceSpec, t('o2'))).toBe(false);
    expect(slotStatuses(specs, second)[1]?.count).toBe(1);
  });

  test('the words: "other"', () => {
    expect(targetsWord(specs[0] as TargetChoiceSpec)).toBe('a target');
    expect(targetsWord(specs[1] as TargetChoiceSpec)).toBe('up to two other targets');
    expect(targetsWord({ specId: 'x', min: 1, max: 1, differentFrom: 't1', legal } as never)).toBe(
      'another target',
    );
    expect(targetsWord({ specId: 'x', min: 2, max: 2, differentFrom: 't1', legal } as never)).toBe(
      'two other targets',
    );
    const decision = {
      kind: 'targets',
      id: 'd1',
      seat: 0,
      source: 'o9',
      specs,
    } as unknown as TargetsDecision;
    const index = lookupIndexFor([obj('o9', { name: 'Maw Dragon', zone: 'stack' })]);
    const slots = slotStatuses(specs, [{ kind: 'object', id: 'o1', specId: 't1' }]);
    expect(targetsPrompt(decision, index, slots[1] ?? null)).toBe(
      'Choose up to two other targets for Maw Dragon.',
    );
  });
});

describe("Discover's question says what declining does", () => {
  const card = obj('o3', { name: 'Lightning Bolt', zone: 'exile' });
  const d = {
    kind: 'confirmOptional',
    id: 'd1',
    seat: 0,
    source: 'o9',
    sourceName: 'Discovery Rite',
    sourceOracleText: '',
    purpose: 'cascade',
    subject: 'o3',
  } as unknown as ConfirmOptionalDecision;
  const sourceWith = (effect: unknown, extra: Partial<ObjectView> = {}) =>
    obj('o9', {
      zone: 'stack',
      abilitySource: 'o8',
      ability: { kind: 'triggered', trigger: {}, effect },
      ...extra,
    } as never);

  test('Cascade keeps its words', () => {
    const cascade = sourceWith({ kind: 'cascade' });
    expect(cascadeKind(d, lookupIndexFor([cascade, card])).kind).toBe('cascade');
    expect(cascadePrompt(d, lookupIndexFor([cascade, card]))).toBe(
      'Cascade: cast Lightning Bolt without paying its mana cost?',
    );
    expect(cascadeDecline(d, lookupIndexFor([cascade, card]))).toBe("Don't cast it");
    // A source the view does not hold is Cascade's, as it has always been.
    expect(cascadePrompt(d, lookupIndexFor([card]))).toBe(
      'Cascade: cast Lightning Bolt without paying its mana cost?',
    );
  });

  test('Discover and its kin put the card into the hand, and the buttons say it', () => {
    const discover = sourceWith({ kind: 'exileUntilCast', foundAtMost: 10, rest: 'bottomRandom' });
    const index = lookupIndexFor([discover, card]);
    expect(cascadePrompt(d, index)).toBe(
      'Discover 10: cast Lightning Bolt without paying its mana cost, or put it into your hand?',
    );
    expect(optionalAsk(d, index)).toMatchObject({
      yes: 'Cast it',
      no: 'Put it into your hand',
      cancellable: false,
    });
    const breaching = lookupIndexFor([
      sourceWith({ kind: 'exileUntilCast', castAtMost: 8, rest: 'stayExiled' }),
      card,
    ]);
    expect(cascadePrompt(d, breaching)).toBe(
      'Cast Lightning Bolt without paying its mana cost (its mana value is 8 or less), or put it into your hand?',
    );
    // A spell (Discover on a sorcery): the view carries no effect for it.
    const spell = lookupIndexFor([obj('o9', { zone: 'stack', types: ['sorcery'] }), card]);
    expect(cascadeKind(d, spell).kind).toBe('spell');
    expect(cascadePrompt(d, spell)).toBe(
      'Cast Lightning Bolt without paying its mana cost, or put it into your hand?',
    );
    expect(optionalAsk(d, spell).no).toBe('Put it into your hand');
  });
});

describe('a card castable from the top of the library or from exile', () => {
  const top = obj('o1', {
    name: 'Big Plain Drake',
    zone: 'library',
    manaCost: ['3', 'R', 'R'],
    castCost: ['3', 'R', 'R'],
  } as never);
  const exiled = obj('o2', {
    name: 'Impulse Spell',
    zone: 'exile',
    manaCost: ['1', 'R'],
    castCost: ['1', 'R'],
  } as never);
  const land = obj('o3', { name: 'Mountain', zone: 'exile', types: ['land'] });
  const adventure = obj('o4', {
    name: 'Brawler',
    zone: 'exile',
    onAdventure: true,
    manaCost: ['1', 'G'],
    castCost: ['1', 'G'],
  } as never);
  const d = {
    kind: 'priority',
    id: 'd1',
    seat: 0,
    options: [
      { kind: 'castSpell', object: 'o1' },
      { kind: 'castSpell', object: 'o2' },
      { kind: 'playLand', object: 'o3' },
      { kind: 'castSpell', object: 'o4' },
      { kind: 'pass' },
    ],
  } as unknown as PriorityDecision;
  const index = lookupIndexFor([top, exiled, land, adventure]);
  const playable = playableObjects(d);

  test('the labels', () => {
    expect(libraryBadge(playable, index, 'o1')).toBe(CAST_FROM_LIBRARY);
    expect(CAST_FROM_LIBRARY).toBe('Cast from the top of your library');
    expect(libraryBadge(playable, index, 'o2')).toBeNull();
    expect(exileBadge(playable, index, 'o2', d)).toBe(CAST_FROM_EXILE);
    expect(exileBadge(playable, index, 'o3', d)).toBe(PLAY_FROM_EXILE);
    expect(castBadge(d, playable, index, 'o1')).toBe('Cast from the top of your library');
    expect(castBadge(d, playable, index, 'o2')).toBe('Cast from exile');
    expect(castBadge(d, playable, index, 'o3')).toBe('Play from exile');
    // Not castable now: no badge.
    expect(libraryBadge(new Set(), index, 'o1')).toBeNull();
  });

  test('the menu items', () => {
    const [cast] = menuItems(d, 'o1', index);
    expect(cast?.label).toBe('Cast Big Plain Drake from the top of your library');
    expect(menuItems(d, 'o2', index)[0]?.label).toBe('Cast Impulse Spell from exile');
    expect(menuItems(d, 'o3', index)[0]?.label).toBe('Play Mountain from exile');
    // An Adventure card in exile keeps its own words.
    expect(castLabel({ kind: 'castSpell', object: 'o4' }, adventure, 'Brawler')).not.toContain(
      'from exile',
    );
  });

  test('the cards in exile the strip lists: spells and lands alike', () => {
    expect([...exileCastObjects(d, index)].sort()).toEqual(['o2', 'o3', 'o4']);
  });

  test('the top card of the library is in the index of what the viewer sees', () => {
    const view = {
      battlefield: [],
      stack: [],
      exile: [],
      seats: [{ id: 0, hand: [], graveyard: [], command: [], libraryTop: top }],
    } as unknown as GameView;
    expect(objectIndex(view).get('o1')?.name).toBe('Big Plain Drake');
    const noTop = {
      ...view,
      seats: [{ id: 0, hand: [], graveyard: [], command: [] }],
    } as unknown as GameView;
    expect(objectIndex(noTop).has('o1')).toBe(false);
  });
});
