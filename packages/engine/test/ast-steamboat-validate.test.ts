// "Each player chooses two nontoken, non-Vehicle creatures they control. Exile them until this Vehicle leaves the battlefield." (Foreboding Steamboat): `moveToZone` of a `choose` with
// `players`, to exile, with `until` and `linked`. Pins what validateCard accepts and refuses (CR 610.3, 101.4, 608.2d; rule numbers unchecked: the rules text was not available).
import { describe, expect, test } from 'vitest';
import { type Effect, validateCard } from '../src/index';
import { singleFaceCard } from './dsl-helpers';

const choose = {
  kind: 'choose',
  filter: { controller: 'you', types: ['creature'], token: false, notSubtypes: ['Vehicle'] },
  players: { kind: 'eachPlayer' },
  count: 2,
} as const;

const entering = (effect: Effect) =>
  singleFaceCard({
    name: 'SYNTHETIC Steam',
    manaCost: ['3'],
    types: ['artifact'],
    subtypes: ['Vehicle'],
    colors: [],
    colorIdentity: [],
    oracleText: 'SYNTHETIC',
    abilities: [
      { kind: 'triggered', trigger: { kind: 'entersBattlefield', what: { kind: 'this' } }, effect },
    ],
  });

const spellOf = (effect: Effect) =>
  singleFaceCard({
    name: 'SYNTHETIC Steam Spell',
    manaCost: ['3'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: 'SYNTHETIC',
    spell: { effect },
  });

const exile = {
  kind: 'moveToZone',
  objects: choose,
  to: 'exile',
  until: 'sourceLeaves',
} as const;

describe('moveToZone to exile of a choice by each player, until the permanent leaves', () => {
  test('is valid in an ability of a permanent; linked, it needs an ability of the face that reads the cards', () => {
    expect(validateCard(entering(exile))).toEqual([]);
    expect(validateCard(entering({ ...exile, linked: true })).length).toBe(1);
  });

  test('is valid without `until` (each player exiles creatures they control)', () => {
    expect(validateCard(entering({ kind: 'moveToZone', objects: choose, to: 'exile' }))).toEqual(
      [],
    );
  });

  test('until is refused in a spell, for a choice without players, and for another zone', () => {
    expect(validateCard(spellOf(exile)).length).toBeGreaterThan(0);
    const { players: _players, ...single } = choose;
    expect(validateCard(entering({ ...exile, objects: single })).length).toBeGreaterThan(0);
    expect(
      validateCard(entering({ kind: 'moveToZone', objects: choose, to: 'graveyard' })).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(
        entering({ kind: 'moveToZone', objects: choose, to: 'hand', until: 'sourceLeaves' }),
      ).length,
    ).toBeGreaterThan(0);
  });
});
