// The Danitha deck (issue 26), group 4 (D-416 to D-420): the lines of Boar Umbra, Hyena Umbra, Lion Umbra, Spider Umbra and Golden-Tail Trainer. The first lines of each block
// are the real Oracle text of the acceptance cards of the golden corpus read through the whole pipeline; the other lines are SYNTHETIC siblings and the near misses the grammar
// must not read. The engine runs what is lowered in convert-grammar-engine-danitha-g4.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { read, readAll, withoutFeature } from './parser-p5-helpers';

const AURA = ['Aura'];
const MODIFIED_CREATURE = { types: ['creature'], modified: true };

describe('Umbra armor (CR 702.89a): the keyword of an Aura, a replacement of the destruction of the enchanted permanent', () => {
  test("the real line (its reminder text is cut off before the grammar reads it): the engine's umbraArmor replacement", () => {
    const parsed = readAll('Umbra armor', 'enchantment', AURA);
    expect(parsed.abilities).toEqual([
      { kind: 'replacement', replacement: { kind: 'umbraArmor' } },
    ]);
  });

  test.each(['umbra armor', 'Umbra Armor'])(
    'the spelling of the line does not matter (SYNTHETIC): %s',
    (text) => {
      expect(readAll(text, 'enchantment', AURA).abilities).toEqual([
        { kind: 'replacement', replacement: { kind: 'umbraArmor' } },
      ]);
    },
  );

  test.each([
    'Umbra armor {1}',
    'Umbra armor.',
    'Umbra armor, flying',
    'Umbral armor',
    'Umbra',
    'Umbra armor and reach',
    'Enchanted creature has umbra armor',
  ])('near misses are not read, never half read: %s', (text) => {
    const parsed = read(text, 'enchantment', AURA);
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });

  test('the line names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature('replacement:umbraArmor', 'Umbra armor', 'enchantment', AURA);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('replacement:umbraArmor');
    expect(DECLARED_NEEDS).toContain('replacement:umbraArmor');
  });
});

describe('"Enchant modified creature" (CR 700.9, 303.4a): the modified filter of an enchant ability', () => {
  test('the real line: an enchant ability whose filter says modified', () => {
    const parsed = readAll('Enchant modified creature', 'enchantment', AURA);
    expect(parsed.abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'enchant', filter: MODIFIED_CREATURE } },
    ]);
  });

  test('"modified" in other places of a noun phrase, where the engine reads it (SYNTHETIC)', () => {
    const target = readAll('Destroy target modified creature.', 'sorcery');
    expect(target.spell).toMatchObject({
      targets: [{ what: { kind: 'object', filter: { types: ['creature'], modified: true } } }],
    });
    const each = readAll('Destroy each modified creature.', 'sorcery');
    expect(each.spell).toMatchObject({
      effect: {
        kind: 'destroy',
        objects: { kind: 'each', filter: { types: ['creature'], modified: true } },
      },
    });
  });

  test('a static ability cannot name modified creatures in its subject: derive matches it without the attachments (never half read)', () => {
    const parsed = read('Modified creatures you control get +1/+1.', 'enchantment');
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });

  test('"modified" is not a choice member, not a permanent card word and not a spell word', () => {
    for (const text of [
      'Destroy target modified creature or planeswalker.',
      'Counter target modified spell.',
    ]) {
      const parsed = read(text, 'instant');
      expect(parsed.spell ?? null, text).toBeNull();
    }
  });

  test('the line names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature(
      'selector:modified',
      'Enchant modified creature',
      'enchantment',
      AURA,
    );
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('selector:modified');
    expect(DECLARED_NEEDS).toContain('selector:modified');
  });

  test('a blocked line leaves the face with no half of the card', () => {
    BLOCKED.clear();
    BLOCKED.add('selector:modified');
    try {
      const parsed = read('Enchant modified creature', 'enchantment', AURA);
      expect(parsed.abilities).toEqual([]);
      expect(parsed.unparsed).toHaveLength(1);
    } finally {
      BLOCKED.clear();
    }
  });
});

describe('Golden-Tail Trainer: "other modified creatures you control get +X/+X until end of turn, where X is ~\'s power" (CR 700.9, 611.2c)', () => {
  const LINE =
    "Whenever ~ attacks, other modified creatures you control get +X/+X until end of turn, where X is ~'s power.";
  const POWER = { kind: 'powerOf', of: { kind: 'this' } };

  test('the real line: an attack trigger that pumps the other modified creatures of the controller by the power of the source', () => {
    const parsed = readAll(LINE, 'creature');
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        effect: {
          kind: 'modifyPt',
          objects: {
            kind: 'each',
            filter: {
              zone: 'battlefield',
              types: ['creature'],
              other: true,
              controller: 'you',
              modified: true,
            },
          },
          power: POWER,
          toughness: POWER,
          duration: 'untilEndOfTurn',
        },
      },
    ]);
  });

  test.each([
    ['Whenever ~ attacks, other creatures you control get +1/+1 until end of turn.', 1, 1],
    ['Whenever ~ attacks, other creatures you control get +2/+0 until end of turn.', 2, 0],
  ])(
    'the same group without "modified" and with a number for X (SYNTHETIC): %s',
    (text, power, toughness) => {
      const parsed = readAll(text, 'creature');
      expect(parsed.abilities).toMatchObject([
        {
          kind: 'triggered',
          effect: {
            kind: 'modifyPt',
            objects: {
              kind: 'each',
              filter: { types: ['creature'], other: true, controller: 'you' },
            },
            power,
            toughness,
            duration: 'untilEndOfTurn',
          },
        },
      ]);
    },
  );

  test.each([
    'Whenever ~ attacks, other modified creatures you control get +X/+X until end of turn, where X is the number of creatures you control.',
  ])('the definition of X may be any amount the grammar reads (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'creature');
    expect(parsed.unparsed).toEqual([]);
  });

  test.each([
    "Whenever ~ attacks, other modified creatures you control get +X/+X, where X is ~'s power.",
    "Whenever ~ attacks, other modified creatures you control gets +X/+X until end of turn, where X is ~'s power.",
    "Whenever ~ attacks, another modified creature you control gets +X/+X until end of turn, where X is ~'s power.",
    "Whenever ~ attacks, other modified creatures you control get +X/+X until your next turn, where X is ~'s power.",
    'Whenever ~ attacks, other modified creatures you control get +X/+X until end of turn.',
    "Whenever ~ attacks, other modified creatures you control get +X/+X and gain trample until end of turn, where X is ~'s power.",
  ])('near misses are not read (never half read): %s', (text) => {
    const parsed = read(text, 'creature');
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });

  test('the line names the features the engine lacks (D-068)', () => {
    const modified = withoutFeature('selector:modified', LINE, 'creature');
    expect(modified).toMatchObject({ reason: 'notRunnable' });
    expect(modified.needs).toContain('selector:modified');
    const pump = withoutFeature('effect:modifyPt', LINE, 'creature');
    expect(pump).toMatchObject({ reason: 'notRunnable' });
    expect(DECLARED_NEEDS).toContain('effect:modifyPt');
  });
});

describe('Golden-Tail Trainer: "Aura and Equipment spells you cast cost {X} less to cast, where X is this creature\'s power" (CR 601.2f, 208.1)', () => {
  const LINE =
    "Aura and Equipment spells you cast cost {X} less to cast, where X is this creature's power.";

  test('the real line: a cost reduction of Aura and Equipment spells by the power of the permanent', () => {
    const parsed = readAll(LINE, 'creature');
    expect(parsed.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'costReduction',
          spells: {
            controller: 'you',
            anyOf: [{ subtypes: ['Aura'] }, { subtypes: ['Equipment'] }],
          },
          amount: { kind: 'powerOf', of: { kind: 'this' } },
        },
      },
    ]);
  });
});
