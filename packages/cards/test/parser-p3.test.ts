// Stage P3 (D-063, D-077): the keyword lines of Auras and Equipment, read through the whole
// pipeline and compared with the AST of the engine's SYNTHETIC fixtures (synthetic-attachments.ts)
// or with a node written out here. The statics are in parser-p3-statics.test.ts. The lines come from
// the backlog (reports/backlog.md and the templates it was made from, numbers as printed) or say
// SYNTHETIC. Nothing here is a real card.
import { type Ability, type Cost, type ObjectFilter, validateCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';
import {
  abilitiesOf,
  diagnosticOf,
  enchant,
  fixtureAbilities,
  hosted,
  mana,
} from './parser-p3-helpers';

describe('Auras, Equipment and anthems read as the engine fixtures spell them', () => {
  // The fixtures of slice S4a leave the host's type out; the text says it ("Enchanted creature",
  // "Enchanted land"), so an `attached` subject carries it (stage P4, `docs/MECHANICS.md`).
  test.each([
    ['SYNTHETIC Might Aura', 'Aura', 'Enchant creature\nEnchanted creature gets +2/+2.'],
    ['SYNTHETIC Wings Aura', 'Aura', 'Enchant creature\nEnchanted creature has flying.'],
    [
      'SYNTHETIC Loyal Aura',
      'Aura',
      'Enchant creature you control\nEnchanted creature gets +1/+1 and has vigilance.',
    ],
    ['SYNTHETIC Curse Aura', 'Aura', 'Enchant creature\nEnchanted creature gets -2/-2.'],
    ['SYNTHETIC Shield Land Aura', 'Aura', 'Enchant land\nEnchanted land has hexproof.'],
    ['SYNTHETIC Hex Aura', 'Aura', 'Enchant creature\nEnchanted creature has hexproof.'],
    ['SYNTHETIC Blade', 'Equipment', 'Equipped creature gets +2/+0.\nEquip {1}'],
    ['SYNTHETIC Cloak', 'Equipment', 'Equipped creature gets +0/+2 and has hexproof.\nEquip {2}'],
    ['SYNTHETIC Wing Boots', 'Equipment', 'Equipped creature has flying and trample.\nEquip {1}'],
    ['SYNTHETIC Blood Blade', 'Equipment', 'Equipped creature gets +3/+0.\nEquip—Pay 2 life'],
    ['SYNTHETIC Anthem', 'Other', 'Creatures you control get +1/+1.'],
    [
      'SYNTHETIC Standard Bearer',
      'Other',
      'Other creatures you control get +1/+1 and have flying.',
    ],
    ['SYNTHETIC Plague Banner', 'Other', 'Creatures your opponents control get -1/-1.'],
  ] as const)('%s', (name, kind, text) => {
    const type = name === 'SYNTHETIC Shield Land Aura' ? 'land' : 'creature';
    expect(abilitiesOf(text, kind)).toEqual(hosted(fixtureAbilities(name), type));
  });
});

describe('keyword.enchant: "Enchant <permanent phrase>" (CR 702.5a)', () => {
  test.each([
    ['Enchant creature', { types: ['creature'] }],
    ['Enchant creature you control', { types: ['creature'], controller: 'you' }],
    ['Enchant land', { types: ['land'] }],
    ['Enchant permanent', {}],
    ['Enchant artifact or creature', { anyOf: [{ types: ['artifact'] }, { types: ['creature'] }] }],
    [
      'Enchant creature or planeswalker you control',
      { controller: 'you', anyOf: [{ types: ['creature'] }, { types: ['planeswalker'] }] },
    ],
    [
      'Enchant creature, land, or planeswalker',
      {
        anyOf: [{ types: ['creature'] }, { types: ['land'] }, { types: ['planeswalker'] }],
      },
    ],
    ['Enchant creature an opponent controls', { types: ['creature'], controller: 'opponent' }],
    ['Enchant nonland permanent', { notTypes: ['land'] }],
  ] as const)('%s', (text, filter) => {
    expect(abilitiesOf(text, 'Aura')).toEqual([enchant(filter as ObjectFilter)]);
  });

  test('"Enchant Forest" names a basic land type, a subtype (CR 205.3i, stage P9)', () => {
    expect(abilitiesOf('Enchant Forest', 'Aura')).toEqual([enchant({ subtypes: ['Forest'] })]);
    expect(abilitiesOf('Enchant Island', 'Aura')).toEqual([enchant({ subtypes: ['Island'] })]);
  });

  test('the filter carries no zone: an Aura looks at the battlefield and says so by being one', () => {
    const [ability] = abilitiesOf('Enchant creature', 'Aura');
    expect(JSON.stringify(ability)).not.toContain('zone');
  });

  test.each([
    ['Enchant player', 'player', 'noun'],
    ['Enchant creature with flying or reach', 'or reach', 'noun'],
    ['Enchant creature card in a graveyard', 'card in a graveyard', 'noun'],
  ] as const)('"%s" stays unparsed at "%s"', (text, stoppedAt, slot) => {
    expect(diagnosticOf(text, 'Aura')).toMatchObject({ reason: 'unrecognised', stoppedAt, slot });
  });

  test('an Aura whose enchant line is not read is blamed on that line, not on the card', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Player Aura',
        manaCost: '{1}{B}',
        typeLine: 'Enchantment — Aura',
        oracleText: 'Enchant player',
      }),
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.unparsed.map((u) => u.text)).toEqual(['Enchant player']);
    expect(imported.support.reasons).toEqual([]);
  });

  test('a face that is not an Aura is refused by the engine, and the report says so', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Not An Aura',
        manaCost: '{1}{G}',
        typeLine: 'Enchantment',
        oracleText: 'Enchant creature',
      }),
    );
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons.join('\n')).toContain('only an Aura has an enchant ability');
  });

  test('an Aura with its enchant line and one static line is supported', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Aura',
        manaCost: '{1}{G}',
        typeLine: 'Enchantment — Aura',
        oracleText: 'Enchant creature\nEnchanted creature gets +2/+2.',
      }),
    );
    expect(imported.support).toMatchObject({ status: 'supported', unparsed: [], reasons: [] });
    expect(validateCard(imported.definition)).toEqual([]);
  });
});

describe('keyword.equip: "Equip {M}" and "Equip—Pay N life" (CR 702.6a)', () => {
  const equip = (...cost: Cost[]): Ability => ({
    kind: 'keyword',
    keyword: { kind: 'equip', cost },
  });

  test.each([
    ['Equip {1}', equip(mana('1'))],
    ['Equip {3}', equip(mana('3'))],
    ['Equip {1}{W}', equip(mana('1', 'W'))],
    ['Equip—Pay 3 life', equip({ kind: 'payLife', amount: 3 })],
  ] as const)('%s', (text, expected) => {
    expect(abilitiesOf(text, 'Equipment')).toEqual([expected]);
  });

  test('restricted equip (CR 702.6c) stays unparsed, at the words that restrict it', () => {
    expect(diagnosticOf('Equip legendary creature {3}', 'Equipment')).toMatchObject({
      reason: 'unrecognised',
      stoppedAt: 'legendary creature {3}',
      closestRule: 'keyword.equip',
      slot: 'cost',
    });
    expect(diagnosticOf('Equip commander {3}', 'Equipment')).toMatchObject({
      stoppedAt: 'commander {3}',
      closestRule: 'keyword.equip',
    });
  });

  test('costs the engine does not pay for equip are not read', () => {
    expect(diagnosticOf('Equip {X}', 'Equipment')).toMatchObject({
      stoppedAt: '{X}',
      closestRule: 'keyword.equip',
    });
    expect(diagnosticOf('Equip—Sacrifice a creature', 'Equipment')).toMatchObject({
      stoppedAt: 'Sacrifice a creature',
      closestRule: 'keyword.equip',
    });
  });

  test('Equip on a face with no Equipment subtype lowers: the engine gate is the cost, not the type', () => {
    // The engine accepts an equip keyword on any permanent (it only has no one to attach to).
    expect(abilitiesOf('Equip {1}')).toEqual([equip(mana('1'))]);
  });
});
