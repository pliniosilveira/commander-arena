// validateCard for the abilities a static ability gives a group: an equip ability with a cost (CR 702.6a, 702.6c) and a "+N/+N" for the permanent the one that has it is attached
// to (CR 301.5, 613.4c). Cards are SYNTHETIC (src/cards/fixtures/synthetic-granted-statics.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';

const CUTTER = 'SYNTHETIC Gem Cutter';

/** The Cutter with one of its abilities changed. */
function changed(index: number, change: (staticEffect: Record<string, unknown>) => unknown) {
  const card = syntheticCard(CUTTER);
  const face = card.faces[0];
  if (face === undefined) throw new Error('no face');
  const abilities = face.abilities.map((a, i) =>
    i === index && a.kind === 'static'
      ? { ...a, static: change(a.static as unknown as Record<string, unknown>) }
      : a,
  );
  return { ...card, faces: [{ ...face, abilities }] } as never;
}

describe('a static ability that gives equip abilities and an "equipped creature" ability', () => {
  test('the fixture is valid', () => {
    expect(validateCard(syntheticCard(CUTTER))).toEqual([]);
  });

  test('a granted equip costs mana only', () => {
    const issues = validateCard(
      changed(3, (s) => ({ ...s, keyword: { kind: 'equip', cost: [{ kind: 'tap' }] } })),
    );
    expect(issues.map((i) => i.message)).toContain('a granted equip costs mana only');
  });

  test('a granted equip has no cost reduction and its restriction names no controller', () => {
    const reduced = validateCard(
      changed(3, (s) => ({
        ...s,
        keyword: {
          kind: 'equip',
          cost: [{ kind: 'mana', symbols: ['3'] }],
          costReducedIf: { generic: 1, condition: { kind: 'kicked' } },
        },
      })),
    );
    expect(reduced.map((i) => i.message)).toContain(
      'a granted equip has no cost reduction of its own',
    );
    const restricted = validateCard(
      changed(2, (s) => ({
        ...s,
        keyword: {
          kind: 'equip',
          cost: [{ kind: 'mana', symbols: ['1'] }],
          restriction: { subtypes: ['Pirate'], controller: 'opponent' },
        },
      })),
    );
    expect(restricted.some((i) => i.path.endsWith('.restriction'))).toBe(true);
  });

  test('a granted "+N/+N" for "this" is refused: only a group or the permanent it is attached to', () => {
    const issues = validateCard(
      changed(1, (s) => ({
        ...s,
        ability: {
          kind: 'static',
          static: { kind: 'modifyPt', subject: { kind: 'this' }, power: 2, toughness: 0 },
        },
      })),
    );
    expect(issues.some((i) => i.path.endsWith('.ability.static.subject'))).toBe(true);
  });
});
