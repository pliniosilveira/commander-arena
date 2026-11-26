// "Exile target creature and all other creatures with the same name as that creature." (Sever the Bloodline, Plunder the Graves deck): the text is read by
// `noun.target-permanent-and-same-name-others` and run through applyAction with three seats. Pins: CR 201.2 (the same name), CR 201.2a (an object with no name has the same
// name as nothing, so a face-down target brings no one with it), CR 608.2c (which creatures have the name is worked out as the spell resolves), CR 406.1 (exile).
// The spell is SYNTHETIC (named so) with the real Oracle sentence.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const TEXT = 'Exile target creature and all other creatures with the same name as that creature.';
const SPELL = parsed('SYNTHETIC Sever Same Name', 'Sorcery', TEXT, { manaCost: '{3}{B}' });
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';
const ANGEL = 'Serra Angel';

describe('the lowering of "target creature and all other creatures with the same name as that creature"', () => {
  test('is the target plus every creature on the battlefield with its name, whoever controls it', () => {
    expect(SPELL.faces[0]?.spell?.targets?.[0]?.what).toEqual({
      kind: 'object',
      filter: { zone: 'battlefield', types: ['creature'] },
    });
    expect(SPELL.faces[0]?.spell?.effect).toEqual({
      kind: 'exile',
      objects: {
        kind: 'each',
        filter: {
          zone: 'battlefield',
          types: ['creature'],
          sameNameAs: { kind: 'target', id: 't1' },
        },
        plus: { kind: 'target', id: 't1' },
      },
    });
  });
});

function board() {
  return scenario({ seats: 3 })
    .define(SPELL)
    .seat(0)
    .hand(SPELL.name)
    .pool('BBBB')
    .battlefield(BEARS)
    .seat(1)
    .battlefield(BEARS, { count: 2 })
    .battlefield(ELVES)
    .seat(2)
    .battlefield(BEARS)
    .battlefield(ELVES)
    .battlefield(ANGEL)
    .at('precombatMain', { active: 0 })
    .build();
}

describe('exile target creature and all other creatures with the same name as that creature (CR 201.2, 608.2c)', () => {
  test('every creature with the name leaves, on every seat including the caster, and creatures with other names stay', () => {
    const g = board();
    g.act(0).cast(SPELL.name, { targets: [{ name: BEARS, seat: 1, nth: 0 }], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0, count: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1, count: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 2, count: 0 });
    g.expect.zone(BEARS, 'exile', { seat: 1, count: 2 });
    g.expect.zone(BEARS, 'exile', { seat: 0, count: 1 });
    g.expect.zone(BEARS, 'exile', { seat: 2, count: 1 });
    g.expect.zone(ELVES, 'battlefield', { seat: 1 });
    g.expect.zone(ELVES, 'battlefield', { seat: 2 });
    g.expect.invariants();
  });

  test('a creature that is the only one with its name is exiled alone', () => {
    const g = board();
    g.act(0).cast(SPELL.name, { targets: [{ name: ANGEL, seat: 2 }], pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'exile', { seat: 2 });
    g.expect.zone(ELVES, 'battlefield', { seat: 1 });
    g.expect.zone(ELVES, 'battlefield', { seat: 2 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1, count: 2 });
    g.expect.invariants();
  });

  test('a face-down target (no name, CR 201.2a) is exiled alone, and another face-down creature stays', () => {
    const g = scenario({ seats: 3 })
      .define(SPELL)
      .seat(0)
      .hand(SPELL.name)
      .pool('BBBB')
      .seat(1)
      .battlefield(BEARS, { faceDown: true, label: 'down one' })
      .battlefield(ELVES, { faceDown: true, label: 'down two' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(SPELL.name, { targets: ['down one'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.zone(ELVES, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });
});
