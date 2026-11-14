// Validation of the `search` and `discard` effects (D-007): a node is well-formed
// (validateCardStructure) and executable (validateCard) only as the engine runs it.
// CR 701.23 (Search), CR 701.24 (Shuffle), CR 701.9 (Discard).
import { describe, expect, test } from 'vitest';
import {
  type CardDefinition,
  type Effect,
  type SearchDestination,
  validateCard,
  validateCardStructure,
} from '../src/index';
import { singleFaceCard } from './dsl-helpers';

type Search = Extract<Effect, { kind: 'search' }>;

const GOOD: Search = {
  kind: 'search',
  player: { kind: 'you' },
  filter: { types: ['land'], supertypes: ['basic'] },
  max: 2,
  destinations: [
    { zone: 'battlefield', tapped: true, count: 1 },
    { zone: 'hand', count: 'rest' },
  ],
  reveal: true,
  shuffle: true,
};

function sorceryWith(effect: Effect): CardDefinition {
  return singleFaceCard({
    name: 'SYNTHETIC Validation Probe',
    manaCost: ['1'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: '',
    spell: { effect },
  });
}

const issues = (effect: Effect) =>
  validateCardStructure(sorceryWith(effect)).map((i) => `${i.path}: ${i.message}`);
const withSearch = (patch: Partial<Search>): Effect => ({ ...GOOD, ...patch });
const dest = (...destinations: SearchDestination[]) => withSearch({ destinations });

describe('search', () => {
  test('a well-formed search is valid and executable', () => {
    expect(validateCard(sorceryWith(GOOD))).toEqual([]);
    for (const e of [
      withSearch({ max: 1, destinations: [{ zone: 'graveyard', count: 1 }] }),
      withSearch({ filter: {}, max: 1, destinations: [{ zone: 'hand', count: 1 }] }),
      withSearch({
        filter: { anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }] },
        max: 1,
        destinations: [{ zone: 'hand', count: 1 }],
        shuffle: false,
      }),
      withSearch({
        max: 3,
        destinations: [
          { zone: 'battlefield', count: 1 },
          { zone: 'hand', count: 1 },
          { zone: 'graveyard', count: 1 },
        ],
      }),
    ]) {
      expect(validateCard(sorceryWith(e))).toEqual([]);
    }
  });

  test('the filter names no zone and no controller: the searched zone is your library', () => {
    expect(issues(withSearch({ filter: { zone: 'graveyard' } }))).toEqual([
      "faces[0].spell.effect.filter.zone: a search looks in the searcher's library: leave zone out",
    ]);
    expect(issues(withSearch({ filter: { controller: 'opponent' } }))).toEqual([
      'faces[0].spell.effect.filter.controller: cards in a library have no controller: leave it out',
    ]);
    // A member of anyOf cannot sneak either one in.
    expect(
      issues(withSearch({ filter: { anyOf: [{ controller: 'you' }, { types: ['land'] }] } })).some(
        (m) => m.includes('controller'),
      ),
    ).toBe(true);
    expect(issues(withSearch({ filter: { tapped: true } }))).toEqual([
      'faces[0].spell.effect.filter: tapped and other do not apply to cards in a library',
    ]);
  });

  test('any player a selector names may search; a selector that names nobody is refused', () => {
    // D-092: "Its controller may search ..." (the player is read from a target) is the searcher.
    expect(validateCard(sorceryWith(withSearch({ player: { kind: 'eachOpponent' } })))).toEqual([]);
    expect(issues(withSearch({ player: { kind: 'target', id: 't9' } }))).toEqual([
      'faces[0].spell.effect.player: target "t9" is not declared on this ability or spell mode',
    ]);
    expect(issues(withSearch({ optional: false as unknown as true }))).toEqual([
      'faces[0].spell.effect.optional: optional must be true when present',
    ]);
    expect(validateCard(sorceryWith(withSearch({ optional: true })))).toEqual([]);
  });

  test('max, destinations and counts add up', () => {
    expect(issues(withSearch({ max: 0 })).some((m) => m.includes('max must be a positive'))).toBe(
      true,
    );
    expect(issues(withSearch({ destinations: [] }))).toEqual([
      'faces[0].spell.effect.destinations: a search needs at least one destination',
    ]);
    // Counts that do not add up to max, with no 'rest' to take the remainder.
    expect(issues(dest({ zone: 'hand', count: 1 }))).toEqual([
      'faces[0].spell.effect.destinations: the destination counts must add up to max (or end in rest)',
    ]);
    // 'rest' must leave at least one card for itself and be last.
    expect(
      issues(dest({ zone: 'battlefield', count: 2 }, { zone: 'hand', count: 'rest' })),
    ).toEqual(["faces[0].spell.effect.destinations: 'rest' needs fewer fixed cards than max"]);
    expect(
      issues(dest({ zone: 'hand', count: 'rest' }, { zone: 'battlefield', count: 1 })),
    ).toEqual([
      "faces[0].spell.effect.destinations[0].count: 'rest' is only valid on the last destination",
    ]);
    expect(issues(dest({ zone: 'hand', count: 0 }, { zone: 'graveyard', count: 2 })).length).toBe(
      1,
    );
  });

  test('tapped only applies to the battlefield; zones are the supported four (the library is the top of it, D-405)', () => {
    expect(
      issues(dest({ zone: 'hand', tapped: true, count: 1 }, { zone: 'hand', count: 'rest' })),
    ).toEqual([
      'faces[0].spell.effect.destinations[0].tapped: tapped is only valid, as a boolean, for the battlefield',
    ]);
    // D-405: the library is a destination (the card goes on top, after the shuffle); exile is not one yet.
    expect(
      issues(dest({ zone: 'library', count: 1 }, { zone: 'hand', count: 'rest' })).some((m) =>
        m.includes('cannot go to zone'),
      ),
    ).toBe(false);
    expect(
      issues(dest({ zone: 'exile' as never, count: 1 }, { zone: 'hand', count: 'rest' })).some(
        (m) => m.includes('cannot go to zone'),
      ),
    ).toBe(true);
  });

  test('reveal and shuffle are booleans', () => {
    expect(issues(withSearch({ reveal: 'yes' as never })).length).toBe(1);
    expect(issues(withSearch({ shuffle: undefined as never })).length).toBe(1);
  });

  test('a search inside a sequence or a triggered ability is checked too', () => {
    const bad = withSearch({ max: 0 });
    expect(issues({ kind: 'sequence', effects: [bad] })[0]).toContain(
      'faces[0].spell.effect.effects[0].max',
    );
  });
});

describe('discard', () => {
  test('a discard by you, by each player or by a target is executable', () => {
    for (const player of [
      { kind: 'you' },
      { kind: 'eachPlayer' },
      { kind: 'eachOpponent' },
    ] as const) {
      expect(validateCard(sorceryWith({ kind: 'discard', player, count: 2 })), player.kind).toEqual(
        [],
      );
    }
  });

  test('its player and count are still checked', () => {
    expect(
      issues({ kind: 'discard', player: { kind: 'target', id: 't9' }, count: 1 }).length,
    ).toBeGreaterThan(0);
    expect(issues({ kind: 'discard', player: { kind: 'you' }, count: -1 }).length).toBe(1);
  });
});
