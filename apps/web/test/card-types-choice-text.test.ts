/**
 * "You may exile any number of cards from your graveyard with four or more card types among them. If you do, put a permanent card from among them onto the battlefield with a finality
 * counter on it" (Death Toll deck, Winter, CR 205.2a, 608.2c): the decision overlay refuses a set with too few card types before the engine would, says why, and the words of the two
 * instructions are read from the AST. Pure models, no DOM.
 */
import type { ChooseCardsDecision, Effect } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { chosenCardMoveText } from '../src/game/artifacts-text';
import {
  confirmLabel,
  discardTitle,
  foundBadge,
  foundDetail,
  foundHint,
  foundReady,
} from '../src/ui/decisions/cards-picker';

const exile: Extract<Effect, { kind: 'moveToZone' }> = {
  kind: 'moveToZone',
  objects: {
    kind: 'choose',
    filter: { zone: 'graveyard', controller: 'you' },
    anyNumber: true,
    optional: true,
    minCardTypes: 4,
  },
  to: 'exile',
};

const put: Extract<Effect, { kind: 'moveToZone' }> = {
  kind: 'moveToZone',
  objects: {
    kind: 'choose',
    filter: {
      anyOf: ['artifact', 'creature', 'enchantment', 'land', 'planeswalker', 'battle'].map((t) => ({
        types: [t as 'artifact'],
      })),
      zone: 'exile',
      controller: 'you',
    },
    fromMoved: true,
  },
  to: 'battlefield',
  controller: 'you',
  withCounters: { counter: 'finality', count: 1 },
};

const decision: ChooseCardsDecision = {
  id: 'd1',
  seat: 0,
  kind: 'chooseCards',
  source: 'o99',
  purpose: 'move',
  zone: 'graveyard',
  legal: ['o1', 'o2', 'o3', 'o4', 'o5'],
  min: 0,
  max: 5,
  reveal: true,
  prompt: 'Choose any number of cards with 4 or more card types among them from your graveyard',
  minCardTypes: {
    count: 4,
    types: {
      o1: ['land'],
      o2: ['creature'],
      o3: ['artifact', 'creature'],
      o4: ['instant'],
      o5: ['land'],
    },
  },
};

describe('the picks of a choice with a card type minimum', () => {
  test('none is ready (declining); a set with four card types is ready; three types are not', () => {
    expect(foundReady([], decision)).toBe(true);
    expect(foundReady(['o1', 'o2', 'o4'], decision)).toBe(false);
    expect(foundReady(['o1', 'o2', 'o3', 'o4'], decision)).toBe(true);
    // The artifact creature counts for two card types: three cards reach four.
    expect(foundReady(['o1', 'o3', 'o4'], decision)).toBe(true);
    // Two lands are one card type.
    expect(foundReady(['o1', 'o5', 'o2', 'o4'], decision)).toBe(false);
    expect(foundReady(['o1', 'o2', 'o3', 'o4', 'o5'], decision)).toBe(true);
  });

  test('Confirm says why it is not offered, and the detail counts the card types so far', () => {
    expect(foundHint(['o1', 'o2'], decision)).toBe(
      'Choose cards with 4 or more card types among them, or none',
    );
    expect(foundHint(['o1', 'o3', 'o4'], decision)).toBeNull();
    expect(foundDetail(decision, ['o1', 'o3'])).toBe(
      '2 chosen, 3 card types among them (4 needed). Confirm with none to decline.',
    );
  });

  test('the button, the badge and the title say exile, not put', () => {
    expect(confirmLabel(decision, [])).toBe('Exile none');
    expect(confirmLabel(decision, ['o1'])).toBe('Exile');
    expect(foundBadge(decision, ['o1'], 'o1')).toBe('Exile');
    expect(discardTitle(decision, new Map())).toMatch(/^Exile cards for /);
  });

  test('a move with no minimum is unchanged', () => {
    const { minCardTypes: _no, ...plain } = decision;
    expect(foundReady(['o1', 'o2'], plain)).toBe(true);
    expect(confirmLabel(plain, ['o1'])).toBe('Put onto battlefield');
    expect(foundBadge(plain, ['o1'], 'o1')).toBe('Put');
  });
});

describe('the words of the two instructions', () => {
  test('the exile of any number of cards with a card type minimum', () => {
    expect(chosenCardMoveText(exile)).toBe(
      'You may exile any number of cards from your graveyard with four or more card types among them',
    );
  });

  test('the permanent card put onto the battlefield from among the cards exiled, with its counter', () => {
    expect(chosenCardMoveText(put)).toBe(
      'Put a permanent card from among them onto the battlefield with a finality counter on it',
    );
  });
});
