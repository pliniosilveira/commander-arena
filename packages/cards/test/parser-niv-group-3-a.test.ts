// The Niv-Mizzet deck (issue 25), group 3-a (D-336, D-337): "When you next cast an instant or sorcery spell this turn, copy that spell." (Galvanic Iteration)
// and "{2}{U}, Sacrifice this creature: When you next cast an instant or sorcery spell this turn, copy it for each time you've cast your commander from the
// command zone this game." (Thunderclap Drake). The lines are the real Oracle text of the acceptance cards of the golden corpus read through the whole
// pipeline; the other lines are SYNTHETIC siblings and the near misses the grammar must not read. The engine runs what is lowered in
// convert-grammar-engine-niv-group-3-a.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { read, readAll, spellEffect, withoutFeature } from './parser-p5-helpers';

const NEXT = 'When you next cast an instant or sorcery spell this turn, copy that spell.';
const NEXT_NEW = `${NEXT} You may choose new targets for the copy.`;
const DRAKE =
  "{2}{U}, Sacrifice this creature: When you next cast an instant or sorcery spell this turn, copy it for each time you've cast your commander from the command zone this game. You may choose new targets for the copies.";
const INSTANT_OR_SORCERY = {
  stackKind: 'spell',
  anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
};

describe('"When you next cast an instant or sorcery spell this turn, copy that spell." (CR 603.7, 603.7a, 707.10, 707.10c)', () => {
  test('the real spell text: a delayed trigger on the next cast, that copies the spell, new targets optional', () => {
    expect(spellEffect(NEXT_NEW)).toEqual({
      kind: 'delayedCast',
      filter: INSTANT_OR_SORCERY,
      effect: { kind: 'copySpell', spell: { kind: 'triggerSubject' }, newTargets: 'may' },
    });
  });

  test('without the sentence about the new targets, the copy keeps them (SYNTHETIC)', () => {
    expect(spellEffect(NEXT)).toEqual({
      kind: 'delayedCast',
      filter: INSTANT_OR_SORCERY,
      effect: { kind: 'copySpell', spell: { kind: 'triggerSubject' }, newTargets: 'no' },
    });
  });

  test('another kind of spell, and a sorcery that creates it (SYNTHETIC)', () => {
    const effect = spellEffect(
      'When you next cast a creature spell this turn, copy that spell.',
      'sorcery',
    );
    expect(effect).toMatchObject({
      kind: 'delayedCast',
      filter: { stackKind: 'spell', types: ['creature'] },
      effect: { kind: 'copySpell', spell: { kind: 'triggerSubject' }, newTargets: 'no' },
    });
  });

  test('"it" is the spell as well (SYNTHETIC)', () => {
    expect(
      spellEffect(
        "When you next cast an instant or sorcery spell this turn, copy it for each time you've cast your commander from the command zone this game.",
      ),
    ).toMatchObject({
      kind: 'delayedCast',
      effect: {
        kind: 'copySpell',
        spell: { kind: 'triggerSubject' },
        count: { kind: 'commanderCasts' },
      },
    });
  });

  test.each([
    // not the next cast, not this turn, not by you
    'When you cast an instant or sorcery spell this turn, copy that spell.',
    'When you next cast an instant or sorcery spell, copy that spell.',
    'When you next cast an instant or sorcery spell this turn, copy that spell. You may choose new targets for the copies.',
    'When an opponent next casts an instant or sorcery spell this turn, copy that spell.',
    'When you next cast a spell this turn, copy that spell.',
    'When you next cast an instant or sorcery spell next turn, copy that spell.',
    // another thing the delayed trigger does
    'When you next cast an instant or sorcery spell this turn, draw a card.',
    'When you next cast an instant or sorcery spell this turn, copy that spell and draw a card.',
    'When you next cast an instant or sorcery spell this turn, you may copy that spell.',
    'When you next cast an instant or sorcery spell this turn, copy target instant spell.',
    'When you next cast an instant or sorcery spell this turn, copy it twice.',
    'When you next cast an instant or sorcery spell this turn, copy that spell if you control a Wizard.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'instant');
    expect(parsed.spell).toBeNull();
    expect(parsed.unparsed).toHaveLength(1);
  });

  test('on a permanent it is no ability: nothing reads it', () => {
    expect(read(NEXT_NEW, 'enchantment').abilities).toEqual([]);
    expect(read(NEXT_NEW, 'enchantment').unparsed).toHaveLength(1);
  });
});

describe('"{2}{U}, Sacrifice this creature: When you next cast ... copy it for each time you\'ve cast your commander from the command zone this game." (CR 707.10, 903.8)', () => {
  test('the real ability: the sacrifice is a cost, the copies are counted by the commander casts', () => {
    const parsed = readAll(DRAKE, 'creature', ['Drake']);
    expect(parsed.abilities).toEqual([
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['2', 'U'] },
          { kind: 'sacrifice', what: { kind: 'this' } },
        ],
        effect: {
          kind: 'delayedCast',
          filter: INSTANT_OR_SORCERY,
          effect: {
            kind: 'copySpell',
            spell: { kind: 'triggerSubject' },
            newTargets: 'may',
            count: { kind: 'commanderCasts' },
          },
        },
      },
    ]);
  });

  test('without the new targets (SYNTHETIC)', () => {
    const parsed = readAll(
      "{2}{U}, Sacrifice this creature: When you next cast an instant or sorcery spell this turn, copy it for each time you've cast your commander from the command zone this game.",
      'creature',
      ['Drake'],
    );
    expect(JSON.stringify(parsed.abilities[0])).toContain('"newTargets":"no"');
  });

  test('the cost reduction of the same card already reads: instant and sorcery spells you cast cost {1} less', () => {
    const parsed = readAll(
      'Instant and sorcery spells you cast cost {1} less to cast.',
      'creature',
      ['Drake'],
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'costReduction',
          spells: { controller: 'you', anyOf: INSTANT_OR_SORCERY.anyOf },
          amount: 1,
        },
      },
    ]);
  });

  test.each([
    "{2}{U}, Sacrifice this creature: When you next cast an instant or sorcery spell this turn, copy it for each time you've cast your commander from the command zone.",
    "{2}{U}, Sacrifice this creature: When you next cast an instant or sorcery spell this turn, copy it for each time you've cast a commander from the command zone this game.",
    "{2}{U}, Sacrifice this creature: When you next cast an instant or sorcery spell this turn, copy it for each time you've cast your commander from the command zone this game. You may choose new targets for the copy.",
    "{2}{U}, Sacrifice this creature: When you next cast an instant or sorcery spell this turn, copy it for each time you've cast your commander from the command zone this game and draw a card.",
    "{2}{U}, Sacrifice this creature: When you next cast an instant or sorcery spell this turn, copy it for each time you've cast your commander from your hand this game.",
    '{2}{U}, Sacrifice this creature: When you next cast an instant or sorcery spell this turn, copy it for each creature you control.',
    "{2}{U}, Sacrifice this creature: When you next cast an instant or sorcery spell, copy it for each time you've cast your commander from the command zone this game.",
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'creature', ['Drake']);
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });

  test('the count outside a delayed trigger is the copy of the spell of a cast trigger (SYNTHETIC)', () => {
    const parsed = readAll(
      "Whenever you cast an instant or sorcery spell, copy it for each time you've cast your commander from the command zone this game.",
      'enchantment',
    );
    expect(JSON.stringify(parsed.abilities[0])).toContain(
      '"kind":"copySpell","spell":{"kind":"triggerSubject"},"newTargets":"no","count":{"kind":"commanderCasts"}',
    );
  });
});

describe('a line whose engine feature is not listed names it (D-068)', () => {
  const CASES = [
    ['effect:delayedCast', NEXT_NEW, 'instant'],
    ['effect:copySpell', NEXT_NEW, 'instant'],
    ['effect:delayedCast', DRAKE, 'creature'],
    ['amount:commanderCasts', DRAKE, 'creature'],
  ] as const;

  test.each(CASES)('without %s', (ref, text, type) => {
    const subtypes = type === 'creature' ? ['Drake'] : [];
    const missing = withoutFeature(ref, text, type, subtypes);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a blocked line leaves the face with no ability and no spell (never half-executed)', () => {
    for (const [ref, text, type] of CASES) {
      BLOCKED.clear();
      BLOCKED.add(ref);
      try {
        const parsed = read(text, type, type === 'creature' ? ['Drake'] : []);
        expect(parsed.abilities, `${ref}: ${text}`).toEqual([]);
        expect(parsed.spell, `${ref}: ${text}`).toBeNull();
      } finally {
        BLOCKED.clear();
      }
    }
  });

  test('every feature the lowerings of this slice name is declared', () => {
    for (const ref of [
      'effect:delayedCast',
      'effect:copySpell',
      'amount:commanderCasts',
    ] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
