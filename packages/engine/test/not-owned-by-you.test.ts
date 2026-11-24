// `ObjectFilter.notOwnedByYou` (Ahoy Mateys deck, group 4: "each creature you control but don't own", "a noncreature spell you don't own"): the object's owner is not the player
// reading the filter (CR 108.3, the only rule cited: the repository's rules text is not in this worktree). `controller: 'you'` still looks at who controls the object, so a stolen
// creature matches both.
import { describe, expect, test } from 'vitest';
import type { ObjectFilter } from '../src/ast/types';
import { matchesFilterWith } from '../src/rules/filter-match';

const base = { types: ['creature'], supertypes: [], subtypes: [], colors: [] } as const;
const state = { continuousEffects: [], battlefield: [], objects: {}, definitions: {} } as never;
const ctx = { controller: 0, source: null } as const;
const object = (owner: number, controller: number) =>
  ({ zone: 'battlefield', owner, controller, tapped: false, id: 'o1' }) as never;
const matches = (owner: number, controller: number, filter: ObjectFilter) =>
  matchesFilterWith(state, object(owner, controller), () => base, filter, ctx);

describe('notOwnedByYou', () => {
  const filter: ObjectFilter = { controller: 'you', notOwnedByYou: true };

  test('a permanent you control and own does not match', () => {
    expect(matches(0, 0, filter)).toBe(false);
  });

  test('a permanent you control and another player owns matches', () => {
    expect(matches(1, 0, filter)).toBe(true);
  });

  test('a permanent another player controls does not match "you control"', () => {
    expect(matches(1, 1, filter)).toBe(false);
  });

  test('on its own it reads only the owner', () => {
    expect(matches(1, 1, { notOwnedByYou: true })).toBe(true);
    expect(matches(0, 1, { notOwnedByYou: true })).toBe(false);
  });
});
