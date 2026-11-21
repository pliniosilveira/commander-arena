// Ahoy Mateys deck, group 8: what `validateCard` says about the two new nodes of the group, `gainEscape` (an effect that gives the cards of a graveyard escape until end of turn, CR 702.138a,
// 611.2a) and the filter flag `discardedOrFromLibraryThisTurn` ("that was discarded or put there from a library this turn", CR 701.9, 701.17, 404.1). The cards are the SYNTHETIC "Echo Rite"
// with its effect replaced; no rule text is quoted.
import { expect, test } from 'vitest';
import {
  type CardDefinition,
  type Effect,
  isFeatureSupported,
  type ObjectFilter,
  syntheticCard,
  validateCard,
} from '../src/index';

function withEffect(effect: Effect): CardDefinition {
  const base = syntheticCard('SYNTHETIC Echo Rite');
  const [face, ...rest] = base.faces;
  if (face === undefined) throw new Error('no face');
  return { ...base, faces: [{ ...face, spell: { effect } }, ...rest] };
}

const ESCAPE: Effect = {
  kind: 'gainEscape',
  what: { types: ['creature'] },
  cost: [{ kind: 'mana', symbols: ['3', 'B'] }],
  exile: 4,
  duration: 'untilEndOfTurn',
};

test('the escape grant is supported and valid as written', () => {
  expect(isFeatureSupported('effect:gainEscape')).toBe(true);
  expect(validateCard(withEffect(ESCAPE))).toEqual([]);
});

test.each([
  ['a zone in the filter', { ...ESCAPE, what: { types: ['creature'], zone: 'graveyard' } }],
  ['a controller in the filter', { ...ESCAPE, what: { types: ['creature'], controller: 'you' } }],
  ['no cards exiled', { ...ESCAPE, exile: 0 }],
  ['a cost that is not mana', { ...ESCAPE, cost: [{ kind: 'tap' }] }],
  ['no cost', { ...ESCAPE, cost: [] }],
])('%s is refused', (_what, effect) => {
  expect(validateCard(withEffect(effect as Effect)).length).toBeGreaterThan(0);
});

const FROM_LIBRARY: ObjectFilter = { zone: 'graveyard', discardedOrFromLibraryThisTurn: true };

const moves = (filter: ObjectFilter): Effect => ({
  kind: 'moveToZone',
  objects: { kind: 'choose', filter: { ...filter, controller: 'you' } },
  to: 'hand',
});

test('the flag is valid on a card in a graveyard', () => {
  expect(isFeatureSupported('selector:discardedOrFromLibraryThisTurn')).toBe(true);
  expect(validateCard(withEffect(moves(FROM_LIBRARY)))).toEqual([]);
});

test('the flag on a filter of another zone is refused: only a card in a graveyard was put there', () => {
  const issues = validateCard(withEffect(moves({ ...FROM_LIBRARY, zone: 'hand' })));
  expect(issues.some((i) => i.path.includes('discardedOrFromLibraryThisTurn'))).toBe(true);
});
