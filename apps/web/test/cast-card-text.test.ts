/**
 * The web side of D-990 to D-994 (casting a target card from a graveyard as an effect resolves, with mana of any type and exile instead of the graveyard): the words of
 * the ability on the stack, the question and the log line, read from the engine's SYNTHETIC cards so a wording that drifts from the AST fails here. Pure models, no DOM.
 */
import {
  type ConfirmOptionalDecision,
  type GameEvent,
  type GameState,
  type ObjectView,
  type StackAbility,
  syntheticCard,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import {
  castCardAnswerLine,
  castCardOf,
  castCardPrompt,
  castCardText,
} from '../src/game/cast-card-text';
import { triggerGist } from '../src/ui/decisions/ability-label';
import { optionalAsk } from '../src/ui/decisions/optional';
import { lookupIndexFor } from './decisions-helpers';

function abilityOf(name: string): StackAbility {
  const ability = syntheticCard(name).faces[0]?.abilities?.[0];
  if (ability?.kind !== 'triggered') throw new Error('no triggered ability');
  return ability as unknown as StackAbility;
}

describe('the ability on the stack', () => {
  test('the shape of the real card is worded as the card prints it', () => {
    expect(triggerGist(abilityOf('SYNTHETIC Graveyard Caster'), undefined)).toBe(
      'You may cast target instant or sorcery card from a graveyard, and mana of any type can be spent to cast that spell. If that spell would be put into a graveyard, exile it instead',
    );
  });

  test('each rider is worded alone', () => {
    expect(triggerGist(abilityOf('SYNTHETIC Plain Graveyard Caster'), undefined)).toBe(
      'You may cast target instant or sorcery card from a graveyard',
    );
    expect(triggerGist(abilityOf('SYNTHETIC Any Mana Caster'), undefined)).toBe(
      'You may cast target instant or sorcery card from a graveyard, and mana of any type can be spent to cast that spell',
    );
    expect(triggerGist(abilityOf('SYNTHETIC Exile Instead Caster'), undefined)).toBe(
      'You may cast target instant or sorcery card from a graveyard. If that spell would be put into a graveyard, exile it instead',
    );
  });

  test('the pieces', () => {
    expect(castCardText({ kind: 'castCard', object: { kind: 'target', id: 't1' } }, 'it')).toBe(
      'You may cast it',
    );
    expect(castCardOf(abilityOf('SYNTHETIC Graveyard Caster').effect)?.exileInstead).toBe(true);
    expect(
      castCardOf({ kind: 'may', effect: abilityOf('SYNTHETIC Any Mana Caster').effect })
        ?.anyManaType,
    ).toBe(true);
    expect(castCardOf({ kind: 'proliferate' })).toBeNull();
  });
});

describe('the question', () => {
  const bolt = {
    id: 'o7',
    name: 'Lightning Bolt',
    controller: 1,
    owner: 1,
    zone: 'graveyard',
    types: ['instant'],
  } as unknown as ObjectView;
  const caster = {
    id: 'o9',
    name: 'SYNTHETIC Graveyard Caster',
    controller: 0,
    owner: 0,
    zone: 'stack',
    types: [],
    ability: abilityOf('SYNTHETIC Graveyard Caster'),
  } as unknown as ObjectView;
  const index = lookupIndexFor([bolt, caster]);
  const ask = (): ReturnType<typeof optionalAsk> =>
    optionalAsk(
      {
        id: 'd1',
        seat: 0,
        kind: 'confirmOptional',
        source: 'o9',
        sourceName: 'SYNTHETIC Graveyard Caster',
        sourceOracleText: '',
        purpose: 'castCard',
        subject: 'o7',
      } as ConfirmOptionalDecision,
      index,
    );

  test('it names the card and the riders, and declining leaves the card where it is', () => {
    expect(ask()).toEqual({
      prompt:
        'Cast Lightning Bolt from a graveyard, paying its mana cost? Mana of any type can be spent on it. If it would be put into a graveyard, it is exiled instead.',
      yes: 'Cast it',
      no: "Don't cast it (it stays in the graveyard)",
      cancellable: false,
    });
  });

  test('without riders it says only the cast', () => {
    expect(castCardPrompt('Divination', null)).toBe(
      'Cast Divination from a graveyard, paying its mana cost?',
    );
  });
});

describe('the log line of the answer', () => {
  const before = {
    pending: { kind: 'confirmOptional', purpose: 'castCard', source: 'o9', subject: 'o7' },
    objects: { o7: { card: 'c1' } },
    cards: { c1: { definition: 'd1' } },
    definitions: { d1: { name: 'Lightning Bolt' } },
  } as unknown as GameState;
  const answered = (
    accepted: boolean,
    seat: 0 | 1,
  ): Extract<GameEvent, { kind: 'optionalAnswered' }> =>
    ({ kind: 'optionalAnswered', seat, source: 'o9', accepted }) as never;

  test('accepting and declining, for the viewer and for the other player', () => {
    expect(castCardAnswerLine(before, answered(true, 0), 0)?.text).toBe(
      'You choose to cast Lightning Bolt from a graveyard.',
    );
    expect(castCardAnswerLine(before, answered(false, 0), 0)?.text).toBe(
      "You don't cast Lightning Bolt; it stays in the graveyard.",
    );
    expect(castCardAnswerLine(before, answered(true, 1), 0)?.text).toBe(
      'Opponent chooses to cast Lightning Bolt from a graveyard.',
    );
  });

  test('another question is not this one', () => {
    const other = { ...before, pending: { ...before.pending, purpose: 'cascade' } } as never;
    expect(castCardAnswerLine(other, answered(true, 0), 0)).toBeNull();
  });
});
