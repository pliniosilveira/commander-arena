/**
 * Spectacle, Escape and Unearth (D-124) as pure models: the escape label with its count, the badge
 * tables, the log words, the picker words for the exile cost, the wording of unearth and of its
 * delayed exile, and the commander-zone line for exile. Fake views, no DOM.
 */
import type {
  ActivatedAbility,
  ChooseCardsDecision,
  GameView,
  ObjectView,
  PriorityDecision,
  StackAbility,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import {
  ALTERNATIVE_NAMES,
  alternativeBadge,
  alternativeLogWords,
  isNamedAlternative,
} from '../src/game/alt-cost';
import { activationLabel, triggerCondition, triggerGist } from '../src/ui/decisions/ability-label';
import { alternativeLabel } from '../src/ui/decisions/alt-cost';
import {
  cardsPrompt,
  confirmLabel,
  discardTitle,
  pickerCards,
  waitingText,
} from '../src/ui/decisions/cards-picker';
import { commanderZoneDetail } from '../src/ui/decisions/commander-zone';
import { graveyardLabels } from '../src/ui/decisions/flashback';
import { lookupIndexFor } from './decisions-helpers';

const card = (name: string, patch: Partial<ObjectView> = {}): ObjectView =>
  ({
    id: 'o1',
    name,
    controller: 0,
    owner: 0,
    zone: 'graveyard',
    types: ['creature'],
    manaCost: ['3', 'B'],
    oracleText: '',
    keywords: [],
    targets: [],
    ...patch,
  }) as ObjectView;

const priority = (...options: PriorityDecision['options'][number][]): PriorityDecision => ({
  id: 'd1',
  seat: 0,
  kind: 'priority',
  options: [{ kind: 'pass' }, ...options],
});

describe('Escape', () => {
  const wraith = card('Wraith', {
    alternativeCosts: [{ kind: 'escape', cost: ['B', 'B'], exile: 3 }],
  });

  test('the label says the cost and how many other cards are exiled', () => {
    expect(alternativeLabel('escape', wraith)).toBe('Escape {B}{B}, exile 3 other cards');
    const one = card('Titan', {
      alternativeCosts: [{ kind: 'escape', cost: ['G', 'G'], exile: 1 }],
    });
    expect(alternativeLabel('escape', one)).toBe('Escape {G}{G}, exile 1 other card');
    // No cost in the view: the keyword alone, nothing guessed.
    expect(alternativeLabel('escape', card('Bare'))).toBe('Escape');
    // The others never mention a count.
    expect(
      alternativeLabel('dash', card('R', { alternativeCosts: [{ kind: 'dash', cost: ['R'] }] })),
    ).toBe('Dash {R}');
    expect(ALTERNATIVE_NAMES.escape).toBe('Escape');
    expect(isNamedAlternative('escape')).toBe(true);
    expect(isNamedAlternative('unearth' as never)).toBe(false);
  });

  test('graveyard buttons: escape, flashback, unearth, in the order of the options', () => {
    const d = priority(
      { kind: 'castSpell', object: 'o1', alternative: 'flashback' },
      { kind: 'castSpell', object: 'o1', alternative: 'escape' },
    );
    const both = card('Both', {
      oracleText: 'Flashback {1}{B}',
      alternativeCosts: [{ kind: 'escape', cost: ['B', 'B'], exile: 2 }],
    });
    expect(graveyardLabels(d, both)).toEqual([
      'Flashback {1}{B}',
      'Escape {B}{B}, exile 2 other cards',
    ]);
    // A card in the hand has none of these, whatever the options say.
    expect(graveyardLabels(d, { ...both, zone: 'hand' })).toEqual([]);
    expect(graveyardLabels(d, undefined)).toEqual([]);
  });

  test('the badge on the spell and on the permanent', () => {
    expect(alternativeBadge({ alternative: 'escape', zone: 'stack' })).toMatchObject({
      text: 'escaped',
    });
    expect(alternativeBadge({ alternative: 'escape', zone: 'battlefield' })).toMatchObject({
      text: 'escaped',
      fact: 'Escaped: cast from the graveyard for its escape cost',
    });
    expect(alternativeBadge({ alternative: 'escape', zone: 'graveyard' })).toBeNull();
    expect(alternativeLogWords('escape')).toBe('for its escape cost');
  });

  const ask = (patch: Partial<ChooseCardsDecision> = {}): ChooseCardsDecision => ({
    id: 'd2',
    seat: 0,
    kind: 'chooseCards',
    source: 'o50',
    purpose: 'exile',
    zone: 'graveyard',
    legal: ['o11', 'o12', 'o13', 'o14'],
    min: 3,
    max: 3,
    reveal: true,
    prompt: 'Exile three other cards from your graveyard.',
    forCost: true,
    ...patch,
  });

  test('the exile question reads like a cost, from the graveyard', () => {
    const spell = card('Wraith', { id: 'o50', zone: 'stack' });
    const index = lookupIndexFor([spell]);
    expect(cardsPrompt(ask(), index)).toBe(
      'Exile 3 other cards from your graveyard to cast Wraith.',
    );
    expect(cardsPrompt(ask({ min: 1, max: 1 }), index)).toBe(
      'Exile 1 other card from your graveyard to cast Wraith.',
    );
    expect(discardTitle(ask(), index)).toBe('Exile to cast Wraith');
    // Without the spell in the view the engine's own prompt stays.
    expect(cardsPrompt(ask(), lookupIndexFor([]))).toBe(ask().prompt);
    expect(confirmLabel(ask(), [])).toBe('Exile');
  });

  test('the picker lists the legal cards of the deciding seat graveyard', () => {
    const mine = (['o11', 'o12', 'o13', 'o14', 'o15'] as const).map((id) => card(id, { id }));
    const view = {
      viewer: 0,
      seats: [
        { graveyard: mine, hand: [] },
        { graveyard: [card('theirs', { id: 'o99' })], hand: [] },
      ],
    } as unknown as GameView;
    expect(pickerCards(view, ask()).map((o) => o.id)).toEqual(['o11', 'o12', 'o13', 'o14']);
  });

  test('the other seat sees what is happening and no card', () => {
    const view = {
      waitingOn: { seat: 1, purpose: 'exile', sourceName: 'Wraith' },
    } as unknown as GameView;
    expect(waitingText(view)).toBe(
      'Opponent is choosing cards to exile from their graveyard (Wraith).',
    );
  });
});

describe('Spectacle', () => {
  test('the stack badge and the log words', () => {
    expect(alternativeBadge({ alternative: 'spectacle', zone: 'stack' })).toMatchObject({
      text: 'spectacle',
    });
    expect(alternativeLogWords('spectacle')).toBe('for its spectacle cost');
  });
});

describe('Unearth', () => {
  const unearth = {
    cost: [{ kind: 'mana', symbols: ['R'] }],
    effect: { kind: 'unearth' },
    timing: 'sorcery',
    functionsIn: 'graveyard',
  } as unknown as ActivatedAbility;
  const gnoll = card('Gnoll', { activated: [{ abilityIndex: 0, ability: unearth }] });

  test('the button reads "Unearth {R}", from the ability', () => {
    expect(activationLabel(gnoll, { abilityIndex: 0, ability: unearth })).toBe('Unearth {R}');
    const d = priority({ kind: 'activate', object: 'o1', abilityIndex: 0 });
    expect(graveyardLabels(d, gnoll)).toEqual(['Unearth {R}']);
    expect(graveyardLabels(d, { ...gnoll, zone: 'hand' })).toEqual([]);
  });

  test('the ability on the stack says what it does', () => {
    const onStack = { kind: 'activated', effect: { kind: 'unearth' } } as unknown as StackAbility;
    expect(triggerGist(onStack, gnoll)).toBe(
      'Return this card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step. If it would leave the battlefield, exile it instead of putting it anywhere else',
    );
  });

  test('the delayed trigger: "At the beginning of each end step, exile this creature"', () => {
    const delayed = {
      kind: 'triggered',
      trigger: { kind: 'endStep', whose: 'each' },
      effect: { kind: 'exile', objects: { kind: 'this' } },
    } as unknown as StackAbility;
    const creature = card('Gnoll', { zone: 'battlefield' });
    expect(triggerGist(delayed, creature)).toBe('Exile this creature');
    expect(triggerCondition(delayed, 'Gnoll', creature)).toBe('At the beginning of each end step');
  });

  test('the permanent: a flag that says what happens at the end of turn and when it leaves', () => {
    expect(alternativeBadge({ alternative: 'unearth', zone: 'battlefield' })).toMatchObject({
      text: 'unearthed',
      fact: 'Unearthed: exiled at the end of turn, and if it would leave the battlefield it is exiled instead',
    });
    expect(alternativeBadge({ alternative: 'unearth', zone: 'stack' })).toBeNull();
  });

  test('a commander exiled by unearth is offered the command zone from exile', () => {
    expect(commanderZoneDetail('Raider', 'exile', 'exile')).toBe(
      'Raider is in exile. You may put it into the command zone instead.',
    );
  });
});
