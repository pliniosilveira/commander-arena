// The first check of the S1 grammar: for each engine spell fixture, the real Oracle text parsed
// through the grammar gives exactly the fixture's AST, so the parser and the hand-written
// definitions cannot drift apart.
import { describe, expect, test } from 'vitest';
import { fixtureNamed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const SPELLS: readonly { name: string; cost: string; type: 'Instant' | 'Sorcery' }[] = [
  { name: 'Lightning Bolt', cost: '{R}', type: 'Instant' },
  { name: 'Murder', cost: '{1}{B}{B}', type: 'Instant' },
  { name: 'Unsummon', cost: '{U}', type: 'Instant' },
  { name: 'Counterspell', cost: '{U}{U}', type: 'Instant' },
  { name: 'Divination', cost: '{2}{U}', type: 'Sorcery' },
  { name: "Angel's Mercy", cost: '{2}{W}{W}', type: 'Instant' },
];

describe('the grammar reproduces the engine spell fixtures', () => {
  test.each(SPELLS)('$name', ({ name, cost, type }) => {
    const fixture = fixtureNamed(name);
    const face = fixture.faces[0];
    if (face === undefined) throw new Error('fixture has no face');
    const imported = parseOnly(
      syntheticCard({
        name,
        manaCost: cost,
        typeLine: type,
        oracleText: face.oracleText,
        colors: [...face.colors],
      }),
    );
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.reasons).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(imported.support.source).toBe('parser');
    const parsed = imported.definition.faces[0];
    expect(parsed?.spell).toEqual(face.spell);
    expect(parsed?.abilities).toEqual(face.abilities);
  });
});
