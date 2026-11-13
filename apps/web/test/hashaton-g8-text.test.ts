/**
 * The words of group 8 of the Hashaton deck (D-358 to D-361) as pure models: the "this way" conditions of a sacrifice and of a discard, the amount of cards discarded this way,
 * and the cast permission with its exile rider (read from the engine's SYNTHETIC cards, so a wording that drifts from the AST fails here). No DOM.
 */
import { type Ability, syntheticCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { amountPhrase } from '../src/game/amount-text';
import { gameConditionWords } from '../src/game/condition-text';
import { activationLabel } from '../src/ui/decisions/ability-label';

const abilities = (name: string): readonly Ability[] => {
  const face = syntheticCard(name).faces[0];
  if (face === undefined) throw new Error(`no face for ${name}`);
  return face.abilities;
};

describe('the conditions of what an earlier instruction did this way', () => {
  test('an instant or sorcery card discarded, and its negation', () => {
    const cond = { kind: 'thisWayAtLeast', what: 'discardedInstantOrSorcery', count: 1 } as const;
    expect(gameConditionWords(cond)).toBe('you discarded an instant or sorcery card this way');
    expect(gameConditionWords({ kind: 'not', term: cond })).toBe(
      "you didn't discard an instant or sorcery card this way",
    );
  });

  test('the other kinds the cards say', () => {
    expect(gameConditionWords({ kind: 'thisWayAtLeast', what: 'sacrificed', count: 1 })).toBe(
      'a permanent was sacrificed this way',
    );
    expect(
      gameConditionWords({ kind: 'thisWayAtLeast', what: 'discardedCreature', count: 1 }),
    ).toBe('a creature card was discarded this way');
  });

  test('a count or a kind the words do not cover is left out, never guessed at', () => {
    expect(
      gameConditionWords({ kind: 'thisWayAtLeast', what: 'discardedInstantOrSorcery', count: 2 }),
    ).toBeNull();
    expect(
      gameConditionWords({ kind: 'thisWayAtLeast', what: 'milledValue', count: 1 }),
    ).toBeNull();
  });
});

describe('the amount of instant and sorcery cards discarded this way', () => {
  test('is said', () => {
    expect(amountPhrase({ kind: 'thisWay', what: 'discardedInstantOrSorcery' })).toBe(
      'the number of instant and sorcery cards discarded this way',
    );
  });
});

describe('the cast permission', () => {
  const label = (name: string) => {
    const ability = abilities(name).find((a) => a.kind === 'activated');
    if (ability?.kind !== 'activated') throw new Error(`no activated ability on ${name}`);
    return activationLabel(
      {
        id: 'o1',
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
        tapped: false,
      } as never,
      { abilityIndex: 0, ability },
    );
  };

  test('names the card and the turn, and the rider when there is one', () => {
    expect(label('SYNTHETIC Spell Borrower')).toContain(
      'You may cast target instant or sorcery card from your graveyard this turn',
    );
    expect(label('SYNTHETIC Spell Borrower')).not.toContain('exile it instead');
    expect(label('SYNTHETIC Spell Reaver')).toContain(
      'If that spell would be put into your graveyard, exile it instead',
    );
  });
});
