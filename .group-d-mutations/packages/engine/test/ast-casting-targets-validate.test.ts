// Validation of the casting and targets slice (D-181): the choice between two additional costs, the spell's own cost reduction with a condition and
// the change of the target of a spell or ability with a single target (CR 118.8, 601.2f, 115.7a, 115.9a). Structural rules and what the engine
// runs. The cards are SYNTHETIC (src/cards/fixtures/synthetic-casting-targets.ts) or built here from them.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import type {
  CardDefinition,
  Condition,
  Cost,
  Effect,
  ObjectFilter,
  SpellText,
} from '../src/index';
import {
  isFeatureSupported,
  SYNTHETIC_CARDS,
  syntheticCard,
  validateCard,
  validateCardStructure,
} from '../src/index';

const STIR = 'SYNTHETIC Stir Trouble';
const BENT = 'SYNTHETIC Bent Bolt';

const messages = (card: CardDefinition): string[] => validateCard(card).map((i) => i.message);
const structure = (card: CardDefinition): string[] =>
  validateCardStructure(card).map((i) => i.message);

const mana = (...symbols: string[]): Cost => ({ kind: 'mana', symbols });
const sacrifice: Cost = { kind: 'sacrifice', what: { types: ['creature'] } };
const discard: Cost = { kind: 'discard', count: 1 };

const withChoice = (
  choice: readonly [readonly Cost[], readonly Cost[]],
  more: Partial<{
    additionalCosts: readonly Cost[];
    types: CardDefinition['faces'][number]['types'];
  }> = {},
): CardDefinition =>
  singleFace({
    name: 'SYNTHETIC Test Card',
    manaCost: ['B'],
    types: more.types ?? ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'text',
    ...(more.types?.includes('creature') === true ? { power: 1, toughness: 1 } : {}),
    additionalCostChoice: choice,
    ...(more.additionalCosts === undefined ? {} : { additionalCosts: more.additionalCosts }),
    spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
  });

describe('the cards of the slice are valid and every feature they name is run', () => {
  for (const name of ['SYNTHETIC Rend Asunder', 'SYNTHETIC Kicked Hex', STIR, BENT]) {
    test(name, () => {
      expect(validateCard(SYNTHETIC_CARDS[name] as CardDefinition)).toEqual([]);
    });
  }

  test.each([
    'ability:ifKicked',
    'ability:additionalCostChoice',
    'ability:selfCostReducedIf',
    'effect:changeTarget',
    'selector:singleTarget',
  ] as const)('%s is listed', (ref) => {
    expect(isFeatureSupported(ref)).toBe(true);
  });
});

describe('a choice between two additional costs (CR 118.8, 601.2b)', () => {
  test('two ways, each of costs a spell can have as an additional cost', () => {
    expect(messages(withChoice([[sacrifice], [mana('4')]]))).toEqual([]);
    expect(messages(withChoice([[discard], [{ kind: 'payLife', amount: 3 }]]))).toEqual([]);
    expect(messages(withChoice([[sacrifice], [discard]]))).toEqual([]);
  });

  test('a permanent spell may have it as well', () => {
    expect(messages(withChoice([[sacrifice], [mana('2')]], { types: ['creature'] }))).toEqual([]);
  });

  test('exactly two ways, none empty, not the same', () => {
    expect(
      structure(withChoice([[sacrifice]] as unknown as [readonly Cost[], readonly Cost[]])),
    ).toEqual(['additionalCostChoice has exactly two ways to pay']);
    expect(structure(withChoice([[], [mana('2')]]))).toEqual([
      'a way to pay is a non-empty list of costs',
    ]);
    expect(structure(withChoice([[mana('2')], [mana('2')]]))).toEqual([
      'the two ways to pay are the same',
    ]);
  });

  test('no "pay X life" and no {X}', () => {
    expect(structure(withChoice([[{ kind: 'payXLife' }], [mana('2')]])).join('\n')).toContain(
      'no "pay X life"',
    );
    expect(structure(withChoice([[sacrifice], [mana('X')]])).join('\n')).toContain('{X}');
  });

  test("with the face's own additional costs: one sacrifice and one discard at most", () => {
    expect(
      structure(withChoice([[sacrifice], [mana('2')]], { additionalCosts: [sacrifice] })),
    ).toEqual(['more than one sacrifice cost is not supported']);
    expect(
      messages(withChoice([[sacrifice], [mana('2')]], { additionalCosts: [discard] })),
    ).toEqual([]);
  });

  test('a cost the engine does not pay as an additional cost is refused', () => {
    expect(structure(withChoice([[{ kind: 'tap' }], [mana('2')]])).join('\n')).toContain(
      'not an additional cost a spell can have',
    );
  });

  test('a land has no cost to choose', () => {
    const land = withChoice([[sacrifice], [mana('2')]], { types: ['land'] });
    expect(structure(land).join('\n')).toContain('a land is played, not cast');
  });
});

describe("the spell's own cost reduction with a condition (CR 601.2f)", () => {
  const reduction = (condition: Condition | undefined) =>
    singleFace({
      name: 'SYNTHETIC Test Card',
      manaCost: ['3', 'R'],
      types: ['instant'],
      colors: ['R'],
      colorIdentity: ['R'],
      oracleText: 'text',
      abilities: [
        {
          kind: 'static',
          static: { kind: 'costReduction', spells: { kind: 'this' }, amount: 3 },
          ...(condition === undefined ? {} : { condition }),
        },
      ],
      spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
    });

  test('a count of permanents, a power included: read as the cost is determined, not by derive', () => {
    expect(
      messages(
        reduction({
          kind: 'controlsAtLeast',
          filter: { types: ['creature'], power: { cmp: 'atLeast', value: 4 } },
          count: 1,
        }),
      ),
    ).toEqual([]);
    expect(
      messages(
        reduction({
          kind: 'not',
          term: { kind: 'controlsAtLeast', filter: { types: ['creature'] }, count: 1 },
        }),
      ),
    ).toEqual([]);
  });

  test("the reduction of other spells (a permanent's) takes no condition", () => {
    const permanent = singleFace({
      name: 'SYNTHETIC Test Card',
      manaCost: ['2'],
      types: ['artifact'],
      colors: [],
      colorIdentity: [],
      oracleText: 'text',
      abilities: [
        {
          kind: 'static',
          static: { kind: 'costReduction', spells: { types: ['creature'] }, amount: 1 },
          condition: { kind: 'controlsAtLeast', filter: { types: ['creature'] }, count: 1 },
        },
      ],
    });
    expect(structure(permanent).join('\n')).toContain("only the spell's own cost reduction");
  });

  test('a condition that is not valid is refused', () => {
    expect(
      structure(
        reduction({ kind: 'controlsAtLeast', filter: { types: ['creature'] }, count: -1 } as never),
      ).length,
    ).toBeGreaterThan(0);
  });

  test('the fixture reads the power of creatures only the caster controls', () => {
    const def = syntheticCard(BENT);
    const [first] = def.faces[0]?.abilities ?? [];
    expect(first).toMatchObject({ kind: 'static', condition: { kind: 'controlsAtLeast' } });
  });
});

describe('the change of a target (CR 115.7a, 115.9a)', () => {
  const stackFilter = (extra: Partial<ObjectFilter>): SpellText => ({
    targets: [{ id: 't1', what: { kind: 'object', filter: { zone: 'stack', ...extra } } }],
    effect: { kind: 'changeTarget', object: { kind: 'target', id: 't1' } } as Effect,
  });
  const card = (spell: SpellText): CardDefinition =>
    singleFace({
      name: 'SYNTHETIC Test Card',
      manaCost: ['U'],
      types: ['instant'],
      colors: ['U'],
      colorIdentity: ['U'],
      oracleText: 'text',
      spell,
    });

  test('a target spell or ability with a single target: valid and run', () => {
    expect(messages(card(stackFilter({ singleTarget: true })))).toEqual([]);
    expect(messages(card(stackFilter({ singleTarget: true, stackKind: 'spell' })))).toEqual([]);
  });

  test('a slot that could be a spell with several targets is not run', () => {
    expect(messages(card(stackFilter({})))).toEqual([
      'changing a target is run for a target spell or ability on the stack with a single target (singleTarget)',
    ]);
  });

  test('the slot is a stack object: a battlefield filter is not', () => {
    const spell: SpellText = {
      targets: [
        { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', singleTarget: true } } },
      ],
      effect: { kind: 'changeTarget', object: { kind: 'target', id: 't1' } },
    };
    expect(structure(card(spell)).join('\n')).toContain("the filter's zone is 'stack'");
  });

  test('it names a target, nothing else', () => {
    const spell: SpellText = {
      effect: { kind: 'changeTarget', object: { kind: 'thisSpell' } },
    };
    expect(structure(card(spell)).join('\n')).toContain('changeTarget names a target');
  });

  test('"with a single target" is a flag that is true', () => {
    expect(
      structure(card(stackFilter({ singleTarget: false as unknown as true }))).join('\n'),
    ).toContain('singleTarget must be true');
  });

  test('a static ability cannot read it (derive does not know the stack)', () => {
    const permanent = singleFace({
      name: 'SYNTHETIC Test Card',
      manaCost: ['2'],
      types: ['creature'],
      colors: [],
      colorIdentity: [],
      power: 1,
      toughness: 1,
      oracleText: 'text',
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'modifyPt',
            subject: { kind: 'filter', filter: { zone: 'stack', singleTarget: true } },
            power: 1,
            toughness: 1,
          },
        },
      ],
    });
    expect(structure(permanent).length).toBeGreaterThan(0);
  });
});
