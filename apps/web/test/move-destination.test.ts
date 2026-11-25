/**
 * #622: a card chosen "to put into exile" was offered with "Put onto battlefield" on the button and "Put" on the card. The words of a `move`
 * question follow the destination the engine's own prompt names. Prompts as `runChooseMove` writes them.
 */
import { describe, expect, test } from 'vitest';
import {
  confirmLabel,
  discardTitle,
  foundBadge,
  type MoveTo,
  moveDestination,
} from '../src/ui/decisions/cards-picker';
import { lookupIndexFor } from './decisions-helpers';

const ask = (prompt: string) => ({ purpose: 'move' as const, prompt, min: 1, max: 1 });

const CASES: readonly [string, MoveTo][] = [
  ["Choose 1 card from your graveyard to put into exile (Augusta's ability).", 'exile'],
  ['Choose 1 card from your graveyard to put into your hand', 'hand'],
  ["Choose 1 card from your opponent's graveyard to put into their hand", 'hand'],
  ['Choose 1 card from your hand to put into your graveyard', 'graveyard'],
  ['Choose 2 cards from your graveyard to put into your library', 'library'],
  ['Choose 1 card from your graveyard to put onto the battlefield', 'battlefield'],
  ['Choose 1 card from your command zone to put into the command zone', 'command'],
  ['Look at their hand: no card in it can be put into exile', 'exile'],
];

describe('moveDestination', () => {
  test.each(CASES)('%s', (prompt, to) => {
    expect(moveDestination({ prompt })).toBe(to);
  });

  test('without a prompt, or with words it does not know, the card goes onto the battlefield', () => {
    expect(moveDestination({})).toBe('battlefield');
    expect(moveDestination({ prompt: 'Choose a card' })).toBe('battlefield');
  });
});

describe('the words of a move question', () => {
  const exile = ask("Choose 1 card from your graveyard to put into exile (Augusta's ability).");
  const hand = ask('Choose 1 card from your graveyard to put into your hand');
  const battlefield = ask('Choose 1 card from your graveyard to put onto the battlefield');

  test('the Confirm button names where the cards go', () => {
    expect(confirmLabel(exile, ['o1'])).toBe('Exile');
    expect(confirmLabel(exile, [])).toBe('Exile none');
    expect(confirmLabel(hand, ['o1'])).toBe('Put into hand');
    expect(confirmLabel(battlefield, ['o1'])).toBe('Put onto battlefield');
    expect(confirmLabel(battlefield, [])).toBe('Put none');
  });

  test('the badge of a chosen card names it too', () => {
    expect(foundBadge(exile, ['o1'], 'o1')).toBe('Exile');
    expect(foundBadge(hand, ['o1'], 'o1')).toBe('Hand');
    expect(foundBadge(battlefield, ['o1'], 'o1')).toBe('Put');
  });

  test('so does the title of the panel', () => {
    const index = lookupIndexFor([{ id: 's1', name: 'SYNTHETIC Augusta', zone: 'stack' } as never]);
    const decision = (d: ReturnType<typeof ask>) => ({ ...d, source: 's1' }) as never;
    expect(discardTitle(decision(exile), index)).toBe('Exile for SYNTHETIC Augusta');
    expect(discardTitle(decision(hand), index)).toBe('Put into your hand for SYNTHETIC Augusta');
    expect(discardTitle(decision(battlefield), index)).toBe(
      'Put onto the battlefield for SYNTHETIC Augusta',
    );
  });
});
