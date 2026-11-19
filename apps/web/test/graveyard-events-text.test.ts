/**
 * The words of the triggers of cards leaving a graveyard and cards put into a graveyard from anywhere other than the battlefield (Syr Konrad, the Grim; Insidious Roots; CR 603.2,
 * 603.2c, 400.7, 404.1, 700.4), as pure models. No DOM.
 */
import type { Trigger } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { triggerWording } from '../src/game/trigger-text';

const say = (trigger: Trigger) => triggerWording(trigger, { self: 'Syr Konrad' });
const creature = { types: ['creature'] };

describe('the triggers of a graveyard', () => {
  test('one or more cards leave your graveyard (a batch, with or without a kind of card)', () => {
    expect(say({ kind: 'leftGraveyard', who: 'you' })).toBe(
      'Whenever one or more cards leave your graveyard',
    );
    expect(say({ kind: 'leftGraveyard', who: 'you', filter: creature })).toBe(
      'Whenever one or more creature cards leave your graveyard',
    );
  });

  test('a creature card leaves your graveyard (once for each card)', () => {
    expect(say({ kind: 'leftGraveyard', who: 'you', filter: creature, each: true })).toBe(
      'Whenever a creature card leaves your graveyard',
    );
  });

  test('a creature card is put into a graveyard from anywhere other than the battlefield', () => {
    expect(
      say({ kind: 'putIntoGraveyard', who: 'any', from: 'notBattlefield', filter: creature }),
    ).toBe(
      'Whenever a creature card is put into a graveyard from anywhere other than the battlefield',
    );
    expect(say({ kind: 'putIntoGraveyard', who: 'you', from: 'library', filter: creature })).toBe(
      'Whenever a creature card is put into your graveyard from your library',
    );
  });
});
