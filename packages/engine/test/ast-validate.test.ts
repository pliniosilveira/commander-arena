import { describe, expect, test } from 'vitest';
import { isValidManaSymbol } from '../src/ast/symbols';
import type { Ability, Effect, ObjectFilter, SpellText, TargetSpec } from '../src/ast/types';
import { validateAbility, validateCardStructure as validateCard } from '../src/ast/validate';
import type { CardDefinition } from '../src/cards/definition';
import { fixtureCard } from '../src/cards/fixtures/index';

const T1: TargetSpec = { id: 't1', what: { kind: 'anyTarget' } };
const CREATURE_T1: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
};
const PLAYER_T1: TargetSpec = { id: 't1', what: { kind: 'player', filter: 'any' } };

/** An instant with the given spell text, otherwise valid. */
function instant(spell: SpellText | null, manaCost: string[] | null = ['R']): CardDefinition {
  const base = fixtureCard('Lightning Bolt');
  const face = base.faces[0];
  if (face === undefined) throw new Error('fixture has no face');
  return { ...base, faces: [{ ...face, manaCost, spell }] };
}

/** A creature with the given abilities, otherwise valid. */
function creature(abilities: Ability[]): CardDefinition {
  const base = fixtureCard('Grizzly Bears');
  const face = base.faces[0];
  if (face === undefined) throw new Error('fixture has no face');
  return { ...base, faces: [{ ...face, abilities }] };
}

function messages(card: CardDefinition): string[] {
  return validateCard(card).map((i) => `${i.path}: ${i.message}`);
}

function expectIssue(card: CardDefinition, fragment: string): void {
  const found = messages(card);
  expect(
    found.some((m) => m.includes(fragment)),
    `${fragment} in ${found.join(' | ')}`,
  ).toBe(true);
}

const bolt = (effect: Effect): SpellText => ({ targets: [T1], effect });

describe('passing cases', () => {
  test('a Lightning Bolt style card has no issues', () => {
    expect(messages(fixtureCard('Lightning Bolt'))).toEqual([]);
  });

  test('a modal spell, an X spell, a trigger and an activated ability pass', () => {
    const modal: SpellText = {
      chooseModes: { min: 1, max: 2 },
      modes: [
        {
          text: 'Destroy target creature.',
          targets: [CREATURE_T1],
          effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
        },
        { text: 'Draw a card.', effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
      ],
    };
    expect(messages(instant(modal, ['1', 'B']))).toEqual([]);
    const xSpell: SpellText = {
      x: true,
      effect: { kind: 'draw', player: { kind: 'you' }, count: { kind: 'x' } },
    };
    expect(messages(instant(xSpell, ['X', 'U']))).toEqual([]);
    const trigger: Ability = {
      kind: 'triggered',
      trigger: { kind: 'dies', what: { kind: 'this' } },
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 2 },
    };
    const ward: Ability = {
      kind: 'keyword',
      keyword: { kind: 'ward', cost: [{ kind: 'mana', symbols: ['2'] }] },
    };
    const pinger: Ability = {
      kind: 'activated',
      cost: [
        { kind: 'mana', symbols: ['1', 'R'] },
        { kind: 'tap' },
        { kind: 'payLife', amount: 1 },
      ],
      targets: [T1],
      effect: { kind: 'dealDamage', amount: 1, to: { kind: 'target', id: 't1' } },
    };
    expect(messages(creature([trigger, ward, pinger]))).toEqual([]);
  });

  test('validateAbility accepts a mana ability and an X activated ability', () => {
    const mana: Ability = {
      kind: 'mana',
      cost: [{ kind: 'tap' }],
      production: { kind: 'anyColor' },
    };
    expect(validateAbility(mana)).toEqual([]);
    const xAbility: Ability = {
      kind: 'activated',
      cost: [{ kind: 'mana', symbols: ['X'] }],
      targets: [CREATURE_T1],
      effect: { kind: 'dealDamage', amount: { kind: 'x' }, to: { kind: 'target', id: 't1' } },
    };
    expect(validateAbility(xAbility)).toEqual([]);
  });

  test('an unsupported instant with its text dropped is not an effect error', () => {
    const dropped: CardDefinition = { ...instant(null), support: 'unsupported' };
    expect(messages(dropped)).toEqual([]);
  });
});

describe('target references', () => {
  test('an undeclared target id fails', () => {
    const spell: SpellText = {
      targets: [T1],
      effect: { kind: 'dealDamage', amount: 3, to: { kind: 'target', id: 't2' } },
    };
    expectIssue(instant(spell), 'target "t2" is not declared');
  });

  test('a spell with no targets that names one fails', () => {
    const spell: SpellText = { effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } } };
    expectIssue(instant(spell), 'target "t1" is not declared');
  });

  test('a mode may not use a target declared on another mode', () => {
    const spell: SpellText = {
      chooseModes: { min: 1, max: 1 },
      modes: [
        {
          text: 'a',
          targets: [CREATURE_T1],
          effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
        },
        { text: 'b', effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } } },
      ],
    };
    const found = messages(instant(spell));
    expect(found.filter((m) => m.includes('not declared'))).toHaveLength(1);
    expect(found[0]).toContain('modes[1]');
  });

  test('an undeclared target in a triggered or activated ability fails', () => {
    const triggered: Ability = {
      kind: 'triggered',
      trigger: { kind: 'landfall' },
      effect: { kind: 'destroy', objects: { kind: 'target', id: 'x' } },
    };
    expect(validateAbility(triggered).map((i) => i.message)).toEqual([
      'target "x" is not declared on this ability or spell mode',
    ]);
  });

  test('duplicate target ids fail', () => {
    const spell: SpellText = {
      targets: [T1, T1],
      effect: { kind: 'dealDamage', amount: 1, to: { kind: 'target', id: 't1' } },
    };
    expectIssue(instant(spell), 'duplicate target id "t1"');
  });

  test('an empty target id fails', () => {
    const spell: SpellText = {
      targets: [{ id: '', what: { kind: 'anyTarget' } }],
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
    };
    expectIssue(instant(spell), 'target id must be a non-empty string');
  });

  test('a player target used where an object is required fails, and the reverse', () => {
    expectIssue(
      instant({
        targets: [PLAYER_T1],
        effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
      }),
      'is a player but an object is required',
    );
    expectIssue(
      instant({
        targets: [CREATURE_T1],
        effect: { kind: 'draw', player: { kind: 'target', id: 't1' }, count: 1 },
      }),
      'is an object but a player is required',
    );
  });

  test('min and max must be sane', () => {
    const effect: Effect = { kind: 'destroy', objects: { kind: 'target', id: 't1' } };
    const withCounts = (min: number, max: number): CardDefinition =>
      instant({ targets: [{ ...CREATURE_T1, min, max }], effect });
    expectIssue(withCounts(-1, 1), 'min must be a non-negative integer');
    expectIssue(withCounts(0, 0), 'max must be a positive integer');
    expectIssue(withCounts(2, 1), 'min 2 is greater than max 1');
    expectIssue(withCounts(1.5, 2), 'min must be a non-negative integer');
    expect(messages(withCounts(0, 2))).toEqual([]);
  });

  test('a bad filter fails', () => {
    const spell: SpellText = {
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: {
              zone: 'battlefield',
              stackKind: 'spell',
              types: ['creature', 'dragon' as never],
            },
          },
        },
      ],
      effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
    };
    const found = messages(instant(spell));
    expect(found.some((m) => m.includes('unknown card type "dragon"'))).toBe(true);
    expect(found.some((m) => m.includes('stackKind only applies to the stack zone'))).toBe(true);
  });
});

describe('amounts and counts', () => {
  const dmg = (amount: number): SpellText => ({
    targets: [T1],
    effect: { kind: 'dealDamage', amount, to: { kind: 'target', id: 't1' } },
  });

  test('negative, fractional and NaN amounts fail', () => {
    expectIssue(instant(dmg(-1)), 'must be a non-negative integer');
    expectIssue(instant(dmg(1.5)), 'must be a non-negative integer');
    expectIssue(instant(dmg(Number.NaN)), 'must be a non-negative integer');
  });

  test('zero is a legal amount', () => {
    expect(messages(instant(dmg(0)))).toEqual([]);
  });

  test('draw, discard, life and counter counts are checked', () => {
    expectIssue(
      instant({ effect: { kind: 'draw', player: { kind: 'you' }, count: -2 } }),
      'must be a non-negative integer',
    );
    expectIssue(
      instant({ effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 2.5 } }),
      'must be a non-negative integer',
    );
    expectIssue(
      instant({
        targets: [CREATURE_T1],
        effect: {
          kind: 'addCounters',
          objects: { kind: 'target', id: 't1' },
          counter: '+1/+1',
          count: -1,
        },
      }),
      'must be a non-negative integer',
    );
  });

  test('X without an X in the spell or cost fails', () => {
    const spell: SpellText = {
      effect: { kind: 'draw', player: { kind: 'you' }, count: { kind: 'x' } },
    };
    expectIssue(instant(spell), 'X is used but nothing');
    const inTrigger: Ability = {
      kind: 'triggered',
      trigger: { kind: 'landfall' },
      effect: { kind: 'draw', player: { kind: 'you' }, count: { kind: 'x' } },
    };
    expect(validateAbility(inTrigger)).toHaveLength(1);
  });

  test('spell.x without an {X} in the mana cost fails', () => {
    const spell: SpellText = {
      x: true,
      effect: { kind: 'draw', player: { kind: 'you' }, count: { kind: 'x' } },
    };
    expectIssue(instant(spell, ['U']), 'cost has no {X}');
  });

  test('a powerOf amount must reference a declared target', () => {
    const spell: SpellText = {
      effect: {
        kind: 'gainLife',
        player: { kind: 'you' },
        amount: { kind: 'powerOf', of: { kind: 'target', id: 'nope' } },
      },
    };
    expectIssue(instant(spell), 'target "nope" is not declared');
  });

  test('modifyPt needs integers and a known duration', () => {
    const spell: SpellText = {
      targets: [CREATURE_T1],
      effect: {
        kind: 'modifyPt',
        objects: { kind: 'target', id: 't1' },
        power: 1.5,
        toughness: 0,
        duration: 'forever' as never,
      },
    };
    const found = messages(instant(spell));
    expect(found.some((m) => m.includes('power change must be an integer'))).toBe(true);
    expect(found.some((m) => m.includes('unknown duration'))).toBe(true);
  });

  test('moveToZone options must match the destination', () => {
    const spell: SpellText = {
      targets: [CREATURE_T1],
      effect: {
        kind: 'moveToZone',
        objects: { kind: 'target', id: 't1' },
        to: 'hand',
        position: 'top',
        tapped: true,
      },
    };
    const found = messages(instant(spell));
    expect(found.some((m) => m.includes('.position'))).toBe(true);
    expect(found.some((m) => m.includes('.tapped'))).toBe(true);
  });

  test('an empty sequence fails', () => {
    expectIssue(instant({ effect: { kind: 'sequence', effects: [] } }), 'at least one effect');
  });
});

describe('costs, ward and mana symbols', () => {
  test('an invalid symbol in a mana cost fails', () => {
    expectIssue(
      instant(bolt({ kind: 'dealDamage', amount: 1, to: { kind: 'target', id: 't1' } }), ['Q']),
      'invalid mana symbol "Q"',
    );
    expectIssue(
      instant(bolt({ kind: 'dealDamage', amount: 1, to: { kind: 'target', id: 't1' } }), ['{R}']),
      'invalid mana symbol',
    );
  });

  test('an empty mana cost array fails (null means no cost)', () => {
    expectIssue(
      instant(bolt({ kind: 'dealDamage', amount: 1, to: { kind: 'target', id: 't1' } }), []),
      'use null',
    );
  });

  test('invalid symbols in an ability cost fail', () => {
    const a: Ability = {
      kind: 'activated',
      cost: [{ kind: 'mana', symbols: ['1', 'U/W'] }],
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    };
    expect(validateAbility(a).map((i) => i.path)).toEqual(['ability.cost[0].symbols[1]']);
  });

  test('a ward with a bad or empty cost fails', () => {
    const bad: Ability = {
      kind: 'keyword',
      keyword: { kind: 'ward', cost: [{ kind: 'mana', symbols: ['Z'] }] },
    };
    expect(validateAbility(bad)).toHaveLength(1);
    const empty: Ability = { kind: 'keyword', keyword: { kind: 'ward', cost: [] } };
    expect(validateAbility(empty)[0]?.message).toContain('cost list is empty');
    const life: Ability = {
      kind: 'keyword',
      keyword: { kind: 'ward', cost: [{ kind: 'payLife', amount: 3 }] },
    };
    expect(validateAbility(life)).toEqual([]);
  });

  test('protection needs known colors', () => {
    const none: Ability = {
      kind: 'keyword',
      keyword: { kind: 'protection', from: 'color', colors: [] },
    };
    expect(validateAbility(none)).toHaveLength(1);
  });

  test('protection from the colors outside the commander identity names no color (D-256)', () => {
    const outside: Ability = {
      kind: 'keyword',
      keyword: { kind: 'protection', from: 'colorsNotInCommanderIdentity' },
    };
    expect(validateAbility(outside)).toEqual([]);
  });

  test('an equip ability may be limited to a commander, and to no zone, controller or combat (D-256, CR 702.6c)', () => {
    const equip = (restriction: ObjectFilter): Ability => ({
      kind: 'keyword',
      keyword: { kind: 'equip', cost: [{ kind: 'mana', symbols: ['3'] }], restriction },
    });
    expect(validateAbility(equip({ commander: true }))).toEqual([]);
    expect(validateAbility(equip({ commander: 'yours' }))).toEqual([]);
    expect(validateAbility(equip({ commander: true, attacking: true }))).not.toEqual([]);
    expect(validateAbility(equip({ commander: true, controller: 'you' }))).not.toEqual([]);
  });

  test('cost amounts must be integers', () => {
    const life: Ability = {
      kind: 'activated',
      cost: [{ kind: 'payLife', amount: -1 }],
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    };
    expect(validateAbility(life)[0]?.message).toContain('life paid');
    const discard: Ability = {
      kind: 'activated',
      cost: [{ kind: 'discard', count: 0 }],
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    };
    expect(validateAbility(discard)[0]?.message).toContain('discard count');
    const counters: Ability = {
      kind: 'activated',
      cost: [{ kind: 'removeCounters', counter: '', count: 1.5 }],
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    };
    expect(validateAbility(counters)).toHaveLength(2);
  });

  test('an activated or mana ability with no cost fails', () => {
    const activated: Ability = {
      kind: 'activated',
      cost: [],
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    };
    expect(validateAbility(activated)[0]?.message).toContain('cost list is empty');
    const mana: Ability = { kind: 'mana', cost: [], production: { kind: 'anyColor' } };
    expect(validateAbility(mana)[0]?.message).toContain('cost list is empty');
  });

  test('a mana ability must produce something', () => {
    const none: Ability = {
      kind: 'mana',
      cost: [{ kind: 'tap' }],
      production: { kind: 'fixed', mana: [] },
    };
    expect(validateAbility(none)[0]?.path).toBe('ability.production.mana');
    const bad: Ability = {
      kind: 'mana',
      cost: [{ kind: 'tap' }],
      production: { kind: 'fixed', mana: ['X' as never] },
    };
    expect(validateAbility(bad)).toHaveLength(1);
  });

  test('an untargeted activated ability that adds mana must be a mana ability', () => {
    const a: Ability = {
      kind: 'activated',
      cost: [{ kind: 'tap' }],
      effect: { kind: 'addMana', mana: { kind: 'fixed', mana: ['G'] } },
    };
    expect(validateAbility(a)[0]?.message).toContain('CR 605.1a');
  });

  test('entersWithCounters needs a counter name and a positive count', () => {
    const a: Ability = {
      kind: 'replacement',
      replacement: { kind: 'entersWithCounters', counter: '', count: 0 },
    };
    expect(validateAbility(a)).toHaveLength(2);
  });

  test('the symbol grammar follows CR 107.4', () => {
    const good = [
      '0',
      '1',
      '2',
      '10',
      '16',
      'W',
      'U',
      'B',
      'R',
      'G',
      'C',
      'S',
      'X',
      'W/U',
      'W/B',
      'U/B',
      'U/R',
      'B/R',
      'B/G',
      'R/G',
      'R/W',
      'G/W',
      'G/U',
      '2/W',
      '2/U',
      '2/B',
      '2/R',
      '2/G',
      'C/W',
      'C/G',
      'W/P',
      'U/P',
      'B/P',
      'R/P',
      'G/P',
      'W/U/P',
      'G/U/P',
    ];
    for (const s of good) expect(isValidManaSymbol(s), s).toBe(true);
    const bad = [
      '',
      ' ',
      '01',
      '-1',
      '1.5',
      'Y',
      'Z',
      'w',
      'P',
      'H',
      '{W}',
      'W/W',
      'U/W',
      'W/U/B',
      'W/U/R/P',
      '3/W',
      '2/P',
      'X/W',
      'C/P',
      'W/',
      '/W',
      'W/U/',
      'S/P',
      '2/C',
    ];
    for (const s of bad) expect(isValidManaSymbol(s), JSON.stringify(s)).toBe(false);
  });
});

describe("'this' and 'thisSpell'", () => {
  test("'this' in spell text fails", () => {
    expectIssue(
      instant({ effect: { kind: 'destroy', objects: { kind: 'this' } } }),
      "'this' is only valid in abilities",
    );
  });

  test("'thisSpell' in an ability fails", () => {
    const a: Ability = {
      kind: 'triggered',
      trigger: { kind: 'landfall' },
      effect: { kind: 'counter', objects: { kind: 'thisSpell' } },
    };
    expect(validateAbility(a)[0]?.message).toContain("'thisSpell' is only valid in spell text");
  });

  test("'thisSpell' and 'this' pass in their own places", () => {
    expect(
      messages(instant({ effect: { kind: 'counter', objects: { kind: 'thisSpell' } } })),
    ).toEqual([]);
    const a: Ability = {
      kind: 'triggered',
      trigger: { kind: 'dies', what: { kind: 'this' } },
      effect: { kind: 'exile', objects: { kind: 'this' } },
    };
    expect(validateAbility(a)).toEqual([]);
  });
});

describe('spell text structure', () => {
  test('a supported instant or sorcery with no spell text fails', () => {
    expectIssue(instant(null), 'must have spell text with an effect');
    const sorcery: CardDefinition = instant({});
    expectIssue(sorcery, 'must have spell text with an effect');
  });

  test('a supported sorcery with no spell text fails', () => {
    const base = fixtureCard('Divination');
    const face = base.faces[0];
    if (face === undefined) throw new Error('fixture has no face');
    expectIssue(
      { ...base, faces: [{ ...face, spell: null }] },
      'must have spell text with an effect',
    );
  });

  test('targets with no effect fail', () => {
    expectIssue(instant({ targets: [T1] }), 'no effect to use them');
  });

  test('modal spells need chooseModes within range and at least two modes', () => {
    const mode = (text: string) => ({
      text,
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } as const,
    });
    expectIssue(instant({ modes: [mode('a'), mode('b')] }), 'must say how many modes');
    expectIssue(
      instant({ modes: [mode('a'), mode('b')], chooseModes: { min: 1, max: 3 } }),
      '1 <= min <= max',
    );
    expectIssue(
      instant({ modes: [mode('a'), mode('b')], chooseModes: { min: 0, max: 1 } }),
      '1 <= min <= max',
    );
    expectIssue(
      instant({ modes: [mode('a')], chooseModes: { min: 1, max: 1 } }),
      'at least two modes',
    );
    expectIssue(
      instant({ modes: [mode('')], chooseModes: { min: 1, max: 1 } }),
      'mode text is empty',
    );
    expectIssue(
      instant({ chooseModes: { min: 1, max: 1 }, effect: mode('a').effect }),
      'chooseModes without modes',
    );
  });

  test('a modal spell may not also carry a top-level effect or targets', () => {
    const mode = {
      text: 'a',
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } as const,
    };
    const spell: SpellText = {
      modes: [mode, { ...mode, text: 'b' }],
      chooseModes: { min: 1, max: 1 },
      effect: mode.effect,
      targets: [T1],
    };
    const found = messages(instant(spell));
    expect(found.some((m) => m.includes('not in effect'))).toBe(true);
    expect(found.some((m) => m.includes('declares targets on each mode'))).toBe(true);
  });
});

describe('card and face structure', () => {
  test('layout must match the number of faces', () => {
    const base = fixtureCard('Grizzly Bears');
    expectIssue({ ...base, layout: 'transform' }, 'needs 2 face(s)');
    expectIssue({ ...base, faces: [] }, 'needs 1 face(s)');
  });

  test('a creature without power or toughness fails', () => {
    const base = fixtureCard('Grizzly Bears');
    const face = base.faces[0];
    if (face === undefined) throw new Error('fixture has no face');
    expectIssue({ ...base, faces: [{ ...face, power: null }] }, 'a creature needs power');
    expectIssue({ ...base, faces: [{ ...face, toughness: 1.5 }] }, "must be an integer or '*'");
  });

  test('an unknown color in identity or colors fails', () => {
    const base = fixtureCard('Grizzly Bears');
    expectIssue({ ...base, colorIdentity: ['G', 'G'] }, 'duplicate color');
    expectIssue({ ...base, colorIdentity: ['X' as never] }, 'unknown color');
  });

  test('an empty name or type list fails', () => {
    const base = fixtureCard('Grizzly Bears');
    const face = base.faces[0];
    if (face === undefined) throw new Error('fixture has no face');
    expectIssue({ ...base, name: '' }, 'card name is empty');
    expectIssue({ ...base, faces: [{ ...face, types: [] }] }, 'at least one card type');
  });

  test('issues from an ability inside a card carry the full path', () => {
    const bad: Ability = {
      kind: 'triggered',
      trigger: { kind: 'landfall' },
      effect: {
        kind: 'sequence',
        effects: [{ kind: 'destroy', objects: { kind: 'target', id: 'q' } }],
      },
    };
    const found = validateCard(creature([bad]));
    expect(found[0]?.path).toBe('faces[0].abilities[0].effect.effects[0].objects');
  });
});
