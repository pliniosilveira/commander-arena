// The Sauron deck, Goblin and Orc group: the real Oracle lines of Assault on Osgiliath, Uglúk of the White Hand and Gorbag of Minas Morgul read through the whole pipeline, and the near
// misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-sauron-goblin-orc.test.ts.
import { describe, expect, test } from 'vitest';
import { read, readAll } from './parser-p5-helpers';

const NOT_READ = (text: string, type: Parameters<typeof read>[1], subtypes: string[] = []) => {
  const parsed = read(text, type, subtypes);
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.spell, text).toBeNull();
  expect(parsed.unparsed, text).toHaveLength(1);
};

const GOBLIN_OR_ORC = [
  { kind: 'matches', filter: { subtypes: ['Goblin'] } },
  { kind: 'matches', filter: { subtypes: ['Orc'] } },
];
void GOBLIN_OR_ORC;

describe('"Amass Orcs X, then Goblins and Orcs you control gain double strike and haste until end of turn." (Assault on Osgiliath; CR 205.3m, 611.2c, 701.47a)', () => {
  test('the real text: the amass, then a grant of two keywords to the Goblins and the Orcs of the controller', () => {
    const parsed = readAll(
      'Amass Orcs X, then Goblins and Orcs you control gain double strike and haste until end of turn.',
      'sorcery',
    );
    expect(parsed.spell?.x).toBe(true);
    expect(parsed.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'amass', subtype: 'Orc', count: { kind: 'x' } },
        {
          kind: 'grantKeyword',
          keyword: { kind: 'doubleStrike' },
          duration: 'untilEndOfTurn',
          objects: {
            kind: 'each',
            filter: { controller: 'you', anyOf: [{ subtypes: ['Goblin'] }, { subtypes: ['Orc'] }] },
          },
        },
        { kind: 'grantKeyword', keyword: { kind: 'haste' } },
      ],
    });
  });

  test('another pair of types (SYNTHETIC)', () => {
    const parsed = readAll(
      'Elves and Wolves you control gain trample until end of turn.',
      'sorcery',
    );
    expect(parsed.spell?.effect).toMatchObject({
      kind: 'grantKeyword',
      keyword: { kind: 'trample' },
      objects: {
        kind: 'each',
        filter: { controller: 'you', anyOf: [{ subtypes: ['Elf'] }, { subtypes: ['Wolf'] }] },
      },
    });
  });

  test.each([
    'Goblins and Orcs you control gain haste.',
    'Goblins and Orcs gain haste until end of turn.',
    'Goblins or Orcs you control gain haste until end of turn.',
    'Goblin and Orc you control gain haste until end of turn.',
    'Goblins and Orcs your opponents control gain haste until end of turn.',
    'Goblins, Orcs and Elves you control gain haste until end of turn.',
    'Goblins and Bananas you control gain haste until end of turn.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    NOT_READ(text, 'sorcery');
  });
});

describe('"Whenever another creature you control dies, put a +1/+1 counter on ~. If that creature was a Goblin or Orc, put two +1/+1 counters on ~ instead." (Uglúk of the White Hand; CR 603.10a, 608.2c, 205.3m)', () => {
  const TEXT =
    'Whenever another creature you control dies, put a +1/+1 counter on ~. If that creature was a Goblin or Orc, put two +1/+1 counters on ~ instead.';

  test('the real text: one counter, or two when the creature that died was either type', () => {
    const parsed = readAll(TEXT, 'creature', ['Orc']);
    expect(parsed.abilities[0]).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'conditional',
        condition: {
          kind: 'objectMatches',
          of: { kind: 'triggerSubject' },
          filter: { anyOf: [{ subtypes: ['Goblin'] }, { subtypes: ['Orc'] }] },
        },
        effect: { kind: 'addCounters', count: 2 },
        else: { kind: 'addCounters', count: 1 },
      },
    });
  });

  test('a second article before the second type reads the same (SYNTHETIC)', () => {
    readAll(TEXT.replace('Goblin or Orc', 'Goblin or an Orc'), 'creature', ['Orc']);
  });

  test.each([
    'If that creature was a Goblin and Orc, put two +1/+1 counters on ~ instead.',
    'If that creature was a Goblin or Orc or Elf, put two +1/+1 counters on ~ instead.',
    'If that creature was a Goblin or Banana, put two +1/+1 counters on ~ instead.',
    'If that creature was a Goblin or Goblin, put two +1/+1 counters on ~ instead.',
    'If that creature was Goblin or Orc, put two +1/+1 counters on ~ instead.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (second) => {
    NOT_READ(
      `Whenever another creature you control dies, put a +1/+1 counter on ~. ${second}`,
      'creature',
      ['Orc'],
    );
  });
});

describe('"Whenever a Goblin or Orc you control deals combat damage to a player, you may sacrifice it. When you do, choose one —" (Gorbag of Minas Morgul; CR 603.12, 603.3c, 701.21a)', () => {
  const TEXT = (offer: string) =>
    `Whenever a Goblin or Orc you control deals combat damage to a player, ${offer} When you do, choose one —\n• Draw a card.\n• Create a Treasure token.`;

  test('the real text: the offer of the sacrifice, then a modal reflexive ability whose modes are chosen as it goes on the stack', () => {
    const parsed = readAll(TEXT('you may sacrifice it.'), 'creature', ['Orc']);
    expect(parsed.abilities[0]).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'may', effect: { kind: 'sacrifice', objects: { kind: 'triggerSubject' } } },
          {
            kind: 'reflexive',
            effect: { kind: 'sequence', effects: [] },
            modes: [
              { effect: { kind: 'draw' } },
              { effect: { kind: 'createToken', token: { preset: 'Treasure' } } },
            ],
          },
        ],
      },
    });
  });

  test.each([
    // not an offer, not the permanent that dealt the damage, or another instruction than a sacrifice
    TEXT('sacrifice it.'),
    TEXT('you may sacrifice target creature.'),
    TEXT('you may discard it.'),
    TEXT('you may sacrifice it if you control a Goblin.'),
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    NOT_READ(text, 'creature', ['Orc']);
  });
});
