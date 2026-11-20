// validateCard for `revealTopBranches` (CR 701.20a, 608.2c) and the `ownedByTarget` slot of X target cards (CR 107.3a, 115.1). Cards are SYNTHETIC and defined here.
import { describe, expect, test } from 'vitest';
import type { Effect } from '../src/ast/types';
import { validateCard } from '../src/ast/validate';
import type { CardDefinition } from '../src/cards/definition';
import { singleFace } from '../src/cards/fixtures/helpers';

const YOU = { kind: 'you' } as const;

function spellOf(effect: Effect): CardDefinition {
  return singleFace({
    name: 'SYNTHETIC Reveal Branches Sorcery',
    manaCost: ['1'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: 'test',
    spell: { effect },
  });
}

const messages = (effect: Effect) => validateCard(spellOf(effect)).map((i) => i.message);
const reveal = (
  ...branches: Extract<Effect, { kind: 'revealTopBranches' }>['branches'][number][]
): Effect => ({ kind: 'revealTopBranches', player: YOU, branches });

describe('revealTopBranches', () => {
  test('a branch that gains life and one that puts the card into the hand are valid', () => {
    expect(
      messages(
        reveal(
          {
            ifMatches: { types: ['creature'] },
            onMatch: { kind: 'gainLife', player: YOU, amount: 2 },
          },
          { ifMatches: { types: ['land'] }, to: 'hand' },
        ),
      ),
    ).toEqual([]);
  });

  test('the effect of a branch may read the card revealed as `moved`', () => {
    expect(
      messages(
        reveal({
          ifMatches: { types: ['creature'] },
          onMatch: {
            kind: 'gainLife',
            player: YOU,
            amount: { kind: 'toughnessOf', of: { kind: 'moved' } },
          },
          to: 'hand',
        }),
      ),
    ).toEqual([]);
  });

  test('no branch at all is refused', () => {
    expect(messages(reveal()).join('\n')).toContain('at least one branch');
  });

  test('a branch that does nothing is refused', () => {
    expect(messages(reveal({ ifMatches: { types: ['land'] } })).join('\n')).toContain(
      'a branch does something',
    );
  });

  test('two branches that move the card are refused', () => {
    expect(
      messages(
        reveal(
          { ifMatches: { types: ['land'] }, to: 'battlefield' },
          { ifMatches: { types: ['creature'] }, to: 'hand' },
        ),
      ).join('\n'),
    ).toContain('at most one branch');
  });

  test('the kind of card names no zone or controller', () => {
    expect(
      messages(reveal({ ifMatches: { types: ['land'], controller: 'you' }, to: 'hand' })).join(
        '\n',
      ),
    ).toContain('the card is in the library');
  });

  test('`tapped` goes only with the battlefield', () => {
    expect(
      messages(reveal({ ifMatches: { types: ['land'] }, to: 'hand', tapped: true })).join('\n'),
    ).toContain('tapped');
  });
});
