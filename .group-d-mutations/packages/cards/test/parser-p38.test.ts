// Stage P38 (M53): the Korvold deck's casting and targets slice, read by the grammar (D-182; the engine's `ifKicked` and `unlessKicked` target slots,
// `additionalCostChoice`, a self cost reduction with a condition and `changeTarget`, D-181, ENGINE_VERSION 39). The lines of `REAL` are the real Oracle
// text of the three cards of the slice (the owner's request file of 2026-10-29), names replaced by ~, each with the nodes the grammar produces for it;
// the other tests read lines that say the same things over other numbers, types and costs, and the lines a rule must not read (flagged, never half
// run). Every sibling and refused line is SYNTHETIC. The engine runs what is lowered in convert-grammar-engine-p38.test.ts; a missing engine feature is
// named in parser-p38-needs.test.ts.
import { describe, expect, test } from 'vitest';
import { parseOnly, spellCard } from './convert-grammar-helpers';
import { dropped, type FaceType, readAll } from './parser-p5-helpers';

const drop = (text: string, type: FaceType = 'instant', subtypes: readonly string[] = []) =>
  dropped(text, type, subtypes);

const EXILE = (id: string) => ({ kind: 'exile', objects: { kind: 'target', id } });

describe('the three real cards of the slice read as the engine runs them (D-181, D-182)', () => {
  test('Tear Asunder: the kicked target and the unkicked one are separate slots', () => {
    const parsed = readAll(
      'Kicker {1}{B} (You may pay an additional {1}{B} as you cast this spell.)\nExile target artifact or enchantment. If this spell was kicked, exile target nonland permanent instead.',
      'instant',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'keyword',
        keyword: { kind: 'kicker', cost: [{ kind: 'mana', symbols: ['1', 'B'] }] },
      },
    ]);
    expect(parsed.spell).toEqual({
      targets: [
        {
          id: 't1',
          unlessKicked: true,
          what: {
            kind: 'object',
            filter: {
              zone: 'battlefield',
              anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }],
            },
          },
        },
        {
          id: 't2',
          ifKicked: true,
          what: { kind: 'object', filter: { zone: 'battlefield', notTypes: ['land'] } },
        },
      ],
      effect: {
        kind: 'conditional',
        condition: { kind: 'kicked' },
        effect: EXILE('t2'),
        else: EXILE('t1'),
      },
    });
  });

  test("Stir Up Trouble: the choice is the face's, and the spell is the plain destroy", () => {
    const imported = parseOnly(
      spellCard(
        'SYNTHETIC Parsed Stir',
        'As an additional cost to cast ~, sacrifice an artifact or creature or pay {4}.\nDestroy target creature.'.replaceAll(
          '~',
          'SYNTHETIC Parsed Stir',
        ),
        { type: 'Sorcery', manaCost: '{B}' },
      ),
    );
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
    const face = imported.definition.faces[0];
    expect(face?.additionalCostChoice).toEqual([
      [{ kind: 'sacrifice', what: { anyOf: [{ types: ['artifact'] }, { types: ['creature'] }] } }],
      [{ kind: 'mana', symbols: ['4'] }],
    ]);
    expect(face?.additionalCosts).toBeUndefined();
    expect(face?.spell).toEqual({
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
    });
  });

  test('Bolt Bend: a conditional reduction of its own cost, and the change of a target', () => {
    const parsed = readAll(
      '~ costs {3} less to cast if you control a creature with power 4 or greater.\nChange the target of target spell or ability with a single target.',
      'instant',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'static',
        static: { kind: 'costReduction', spells: { kind: 'this' }, amount: 3 },
        condition: {
          kind: 'controlsAtLeast',
          filter: { types: ['creature'], power: { cmp: 'atLeast', value: 4 } },
          count: 1,
        },
      },
    ]);
    expect(parsed.spell).toEqual({
      targets: [
        { id: 't1', what: { kind: 'object', filter: { zone: 'stack', singleTarget: true } } },
      ],
      effect: { kind: 'changeTarget', object: { kind: 'target', id: 't1' } },
    });
  });
});

// ---- The siblings of each new reading

describe('a target chosen only if the spell was kicked (CR 702.33g, 601.2c)', () => {
  test("a sentence that only a kicked spell has: its target is the kicked spell's", () => {
    const parsed = readAll(
      'Kicker {2}\nDraw a card. If ~ was kicked, destroy target creature.',
      'sorcery',
    );
    expect(parsed.spell?.targets).toEqual([
      {
        id: 't1',
        ifKicked: true,
        what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
      },
    ]);
  });

  test('"instead" with a new target of another kind: the replaced target is the unkicked one', () => {
    const parsed = readAll(
      'Kicker {2}\n~ deals 2 damage to target creature. If ~ was kicked, ~ deals 4 damage to target player instead.',
      'sorcery',
    );
    expect(parsed.spell?.targets).toMatchObject([
      { id: 't1', unlessKicked: true },
      { id: 't2', ifKicked: true },
    ]);
  });

  test('"instead" that names the target again keeps it for both ways', () => {
    const parsed = readAll(
      'Kicker {2}\n~ deals 2 damage to target creature. If ~ was kicked, it deals 4 damage instead.',
      'sorcery',
    );
    expect(parsed.spell?.targets).toEqual([
      {
        id: 't1',
        what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
      },
    ]);
  });

  test('a sentence with no target of its own marks nothing', () => {
    const parsed = readAll(
      'Kicker {2}\n~ deals 2 damage to target creature. If ~ was kicked, draw a card.',
      'sorcery',
    );
    expect(JSON.stringify(parsed.spell?.targets)).not.toContain('Kicked');
  });

  test('a triggered ability chooses its targets as it triggers, kicked or not: not marked, and the engine refuses it', () => {
    const imported = parseOnly(
      spellCard(
        'SYNTHETIC Parsed Kicked Creature',
        'Kicker {2}\nWhen SYNTHETIC Parsed Kicked Creature enters, if it was kicked, destroy target creature.',
      ),
    );
    // An intervening "if" is the engine's `interveningIf`; no slot is marked.
    expect(JSON.stringify(imported.definition.faces[0]?.abilities)).not.toContain('ifKicked');
  });

  test('a multikicker spell is read and the engine refuses its kicked-only target (it runs Kicker only)', () => {
    const imported = parseOnly(
      spellCard(
        'SYNTHETIC Parsed Multi',
        'Multikicker {1}\nDraw a card. If ~ was kicked, destroy target creature.'.replaceAll(
          '~',
          'SYNTHETIC Parsed Multi',
        ),
        { type: 'Sorcery' },
      ),
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons.join('\n')).toContain('Multikicker');
  });

  test('a kicked target used outside the kicked sentence is refused by the engine', () => {
    const imported = parseOnly(
      spellCard(
        'SYNTHETIC Parsed Misuse',
        'Kicker {2}\nIf ~ was kicked, destroy target creature. Its controller loses 2 life.'.replaceAll(
          '~',
          'SYNTHETIC Parsed Misuse',
        ),
        { type: 'Sorcery' },
      ),
    );
    expect(imported.support.status).toBe('unsupported');
  });
});

describe('"As an additional cost to cast ~, A or B." (CR 118.8, 601.2b)', () => {
  const face = (text: string, type: 'Instant' | 'Sorcery' = 'Sorcery') =>
    parseOnly(
      spellCard(
        'SYNTHETIC Parsed Cost',
        `${text.replaceAll('~', 'SYNTHETIC Parsed Cost')}\nDraw a card.`,
        {
          type,
          manaCost: '{B}',
        },
      ),
    );

  test.each([
    [
      'sacrifice a creature or discard a card',
      [{ kind: 'sacrifice', what: { types: ['creature'] } }],
      [{ kind: 'discard', count: 1 }],
    ],
    [
      'discard a card or pay 3 life',
      [{ kind: 'discard', count: 1 }],
      [{ kind: 'payLife', amount: 3 }],
    ],
    ['pay 5 life or pay {2}', [{ kind: 'payLife', amount: 5 }], [{ kind: 'mana', symbols: ['2'] }]],
  ])('%s', (ways, first, second) => {
    const imported = face(`As an additional cost to cast ~, ${ways}.`);
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.reasons).toEqual([]);
    expect(imported.definition.faces[0]?.additionalCostChoice).toEqual([first, second]);
  });

  test.each([
    'As an additional cost to cast ~, pay X life or discard a card.',
    'As an additional cost to cast ~, pay {X} or discard a card.',
    'As an additional cost to cast ~, sacrifice another creature or discard a card.',
    'As an additional cost to cast ~, sacrifice a creature or sacrifice an artifact.',
    'As an additional cost to cast ~, sacrifice a creature and discard a card or pay {2}.',
    'As an additional cost to cast ~, sacrifice a creature or discard a card or pay {2}.',
  ])('"%s" is dropped whole', (text) => {
    const imported = face(text);
    expect(imported.support.status).toBe('unsupported');
    expect(imported.definition.faces[0]?.additionalCostChoice).toBeUndefined();
  });

  test('two lines that each choose are not run: the second is dropped', () => {
    const imported = parseOnly(
      spellCard(
        'SYNTHETIC Parsed Cost',
        'As an additional cost to cast SYNTHETIC Parsed Cost, discard a card or pay 3 life.\nAs an additional cost to cast SYNTHETIC Parsed Cost, sacrifice a creature or pay {2}.\nDraw a card.',
        { type: 'Sorcery', manaCost: '{B}' },
      ),
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.unparsed).toHaveLength(1);
  });
});

describe('"~ costs {N} less to cast if ..." (CR 601.2f)', () => {
  test.each([
    ['~ costs {2} less to cast if you control a Dragon.', 2],
    ['~ costs {1} less to cast if you control two or more artifacts.', 1],
  ])('%s', (text, amount) => {
    const parsed = readAll(`${text}\nDraw a card.`, 'sorcery');
    expect(parsed.abilities[0]).toMatchObject({
      kind: 'static',
      static: { kind: 'costReduction', spells: { kind: 'this' }, amount },
    });
    expect((parsed.abilities[0] as { condition?: unknown }).condition).toBeDefined();
  });

  test('a count of what the card is also reduced for still reads, with the condition', () => {
    const parsed = readAll(
      '~ costs {1} less to cast for each creature you control if you control a Dragon.\nDraw a card.',
      'sorcery',
    );
    expect(parsed.abilities[0]).toMatchObject({
      static: { kind: 'costReduction', amount: { kind: 'countOf' } },
      condition: { kind: 'controlsAtLeast' },
    });
  });

  test.each([
    '~ costs {3} less to cast if an opponent controls a creature with power 4 or greater.',
    '~ costs {3} less to cast if you control a creature with power 4 or greater',
    '~ costs {3} less to cast if it is your turn.',
    '~ costs {W} less to cast if you control a Dragon.',
  ])('"%s" is not read', (text) => {
    expect(drop(`${text}\nDraw a card.`, 'sorcery').text).toContain('costs');
  });

  test('a reduction of other spells takes no condition', () => {
    expect(
      drop('Artifact spells you cast cost {1} less to cast if you control a Dragon.', 'creature')
        .text,
    ).toContain('Artifact spells');
  });
});

describe('"Change the target of target spell or ability with a single target." (CR 115.7a, 115.9a)', () => {
  test('a spell, a spell or an ability, an activated or triggered ability', () => {
    const cases = [
      ['spell or ability', undefined],
      ['spell', 'spell'],
      ['activated or triggered ability', 'ability'],
    ] as const;
    for (const [words, stackKind] of cases) {
      const parsed = readAll(
        `Change the target of target ${words} with a single target.`,
        'instant',
      );
      expect(parsed.spell?.targets).toEqual([
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: {
              zone: 'stack',
              singleTarget: true,
              ...(stackKind === undefined ? {} : { stackKind }),
            },
          },
        },
      ]);
      expect(parsed.spell?.effect).toEqual({
        kind: 'changeTarget',
        object: { kind: 'target', id: 't1' },
      });
    }
  });

  test.each([
    'Change a target of target spell or ability with a single target.',
    'Change the targets of target spell or ability with a single target.',
    'Change the target of target spell or ability.',
    'Change the target of target spell.',
    'Change the target of target instant spell with a single target.',
    'Change the target of target spell or ability with a single target to ~.',
    'Change the target of target spell or ability with a single target and draw a card.',
  ])('"%s" is not read', (text) => {
    expect(drop(text).reason).toBe('unrecognised');
  });

  test('a copy of a spell and the change of its target are different instructions', () => {
    const parsed = readAll(
      'Copy target instant or sorcery spell. You may choose new targets for the copy.',
      'instant',
    );
    expect(parsed.spell?.effect).toMatchObject({ kind: 'copySpell' });
  });
});
