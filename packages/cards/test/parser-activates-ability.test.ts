// Wizened Mentor (issue 104): "Whenever an opponent activates an ability of a permanent that isn't a mana ability, you create a 1/1 white Zombie creature token. This ability triggers
// only once each turn." (CR 602.2, 603.2, 605.1a). The first lines are the real Oracle text; the others are SYNTHETIC siblings and the near misses the grammar must not read.
// The engine runs what is lowered in convert-grammar-engine-activates-ability.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { readAll, read as readFace, withoutFeature } from './parser-p5-helpers';

const read = (text: string) => readFace(text, 'creature');

const ZOMBIE = {
  name: 'Zombie',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Zombie'],
  colors: ['W'],
  power: 1,
  toughness: 1,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities: [],
};
const MAKE_ZOMBIE =
  'you create a 1/1 white Zombie creature token. This ability triggers only once each turn.';
const LINE = `Whenever an opponent activates an ability of a permanent that isn't a mana ability, ${MAKE_ZOMBIE}`;

describe('Wizened Mentor: "Whenever an opponent activates an ability of a permanent that isn\'t a mana ability"', () => {
  test('the real line: a trigger for the opponent that makes a Zombie, once each turn', () => {
    expect(readAll(LINE, 'creature').abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'activatesAbility', who: 'opponent' },
        effect: {
          kind: 'createToken',
          token: { kind: 'custom', definition: ZOMBIE },
          count: 1,
        },
        oncePerTurn: true,
      },
    ]);
  });

  test.each([
    ['you activate', 'you'],
    ['a player activates', 'any'],
  ])('%s (SYNTHETIC)', (who, expected) => {
    expect(
      readAll(
        `Whenever ${who} an ability of a permanent that isn't a mana ability, you gain 1 life.`,
      ).abilities,
    ).toMatchObject([{ kind: 'triggered', trigger: { kind: 'activatesAbility', who: expected } }]);
  });

  test('"that player" is the player who activated the ability (SYNTHETIC)', () => {
    expect(
      readAll(
        "Whenever an opponent activates an ability of a permanent that isn't a mana ability, that player loses 1 life.",
      ).abilities,
    ).toMatchObject([
      {
        kind: 'triggered',
        trigger: { kind: 'activatesAbility', who: 'opponent' },
        effect: { kind: 'loseLife', player: { kind: 'triggerPlayer' }, amount: 1 },
      },
    ]);
  });

  test.each([
    "Whenever an opponent activated an ability of a permanent that isn't a mana ability, you gain 1 life.",
    "Whenever an opponent activates an ability of a creature that isn't a mana ability, you gain 1 life.",
    "Whenever an opponent activates an ability that isn't a mana ability, you gain 1 life.",
    'Whenever an opponent activates an ability of a permanent, you gain 1 life.',
    "Whenever an opponent activates an ability of a permanent that isn't a mana ability or casts a spell, you gain 1 life.",
  ])('near misses are not read, never half read: %s', (text) => {
    const parsed = read(text);
    expect(parsed.abilities, text).toEqual([]);
    expect(parsed.unparsed, text).toHaveLength(1);
  });

  test('the line names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature('trigger:activatesAbility', LINE, 'creature');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('trigger:activatesAbility');
    expect(DECLARED_NEEDS).toContain('trigger:activatesAbility');
  });
});
