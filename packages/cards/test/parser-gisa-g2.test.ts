// The Gisa deck (issue 41), group 2 (D-464 to D-468): the lines of Gisa, the Hellraiser, Forsaken Miner, Mirkwood Bats and Morbid Opportunist.
// The first lines of each block are the real Oracle text of the acceptance cards of the golden corpus read through the whole pipeline; the other lines are SYNTHETIC siblings and
// the near misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-gisa-g2.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { readAll as readAllFace, read as readFace, withoutFeature } from './parser-p5-helpers';

/** The abilities of a creature card: every line of this group is the line of a creature. */
const read = (text: string, type: Parameters<typeof readFace>[1] = 'creature') =>
  readFace(text, type);
const readAll = (text: string, type: Parameters<typeof readAllFace>[1] = 'creature') =>
  readAllFace(text, type);

const NOT_READ = (text: string, type: Parameters<typeof read>[1] = 'creature') => {
  const parsed = read(text, type);
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.unparsed, text).toHaveLength(1);
};

const DRAIN = { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 1 };
const ZOMBIE_ROGUE = {
  name: 'Zombie Rogue',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Zombie', 'Rogue'],
  colors: ['U', 'B'],
  power: 2,
  toughness: 2,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities: [],
};

describe('Gisa: "Ward—{2}, Pay 2 life." (D-467, CR 702.21a)', () => {
  test('the real line: ward with a mana cost and a payment of life', () => {
    expect(readAll('Ward—{2}, Pay 2 life.').abilities).toEqual([
      {
        kind: 'keyword',
        keyword: {
          kind: 'ward',
          cost: [
            { kind: 'mana', symbols: ['2'] },
            { kind: 'payLife', amount: 2 },
          ],
        },
      },
    ]);
  });

  test('a colored mana cost and no period (SYNTHETIC)', () => {
    expect(readAll('Ward—{1}{U}, Pay 3 life').abilities).toEqual([
      {
        kind: 'keyword',
        keyword: {
          kind: 'ward',
          cost: [
            { kind: 'mana', symbols: ['1', 'U'] },
            { kind: 'payLife', amount: 3 },
          ],
        },
      },
    ]);
  });

  test('the old forms are untouched', () => {
    expect(readAll('Ward {2}').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'ward', cost: [{ kind: 'mana', symbols: ['2'] }] } },
    ]);
    expect(readAll('Ward—Pay 3 life.').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'ward', cost: [{ kind: 'payLife', amount: 3 }] } },
    ]);
  });

  test.each([
    'Ward—{2}, Pay 0 life.',
    'Ward—{2}, Pay 2 life, Pay 1 life',
    'Ward—Pay 2 life, {2}',
    'Ward—{2}, Sacrifice a creature.',
    'Ward—{2}, Discard a card.',
    'Ward—{2}',
    'Ward {2}, Pay 2 life',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text);
  });
});

describe('Gisa: "Skeletons and Zombies you control get +1/+1 and have menace." (D-468, CR 205.3m, 611.3a)', () => {
  const GROUP = {
    anyOf: [{ subtypes: ['Skeleton'] }, { subtypes: ['Zombie'] }],
    controller: 'you',
  };

  test('the real line: the group of the two types is the subject of both statics', () => {
    expect(
      readAll('Skeletons and Zombies you control get +1/+1 and have menace.').abilities,
    ).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: { kind: 'filter', filter: GROUP },
          power: 1,
          toughness: 1,
        },
      },
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: GROUP },
          keyword: { kind: 'menace' },
        },
      },
    ]);
  });

  test('another pair of types (SYNTHETIC)', () => {
    expect(readAll('Elves and Wolves you control have trample.').abilities).toMatchObject([
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: {
            kind: 'filter',
            filter: { anyOf: [{ subtypes: ['Elf'] }, { subtypes: ['Wolf'] }], controller: 'you' },
          },
        },
      },
    ]);
  });

  test('the old groups are untouched', () => {
    expect(
      readAll('Skeletons you control and other Zombies you control get +1/+1.').abilities,
    ).toMatchObject([{ kind: 'static', static: { kind: 'modifyPt' } }]);
    expect(readAll('Zombies you control get +1/+1.').abilities).toMatchObject([
      { kind: 'static', static: { subject: { filter: { subtypes: ['Zombie'] } } } },
    ]);
  });

  test.each([
    'Skeletons and Zombies get +1/+1.',
    'Skeletons and Zombies your opponents control get +1/+1.',
    'Skeletons and other Zombies you control get +1/+1.',
    'Skeletons, Zombies, and Elves you control get +1/+1.',
    'Skeleton and Zombie you control gets +1/+1.',
    'Skeletons and Bananas you control get +1/+1.',
    'Zombies and Zombies you control get +1/+1.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text);
  });
});

describe('Gisa and Forsaken Miner: "Whenever you commit a crime" (D-464, CR 700.13)', () => {
  const LINE =
    'Whenever you commit a crime, create two tapped 2/2 blue and black Zombie Rogue creature tokens. This ability triggers only once each turn.';

  test('the real line of Gisa: two tapped Zombie Rogue tokens, once each turn', () => {
    expect(readAll(LINE).abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'crimeCommitted', who: 'you' },
        effect: {
          kind: 'createToken',
          token: { kind: 'custom', definition: ZOMBIE_ROGUE },
          count: 2,
          tapped: true,
        },
        oncePerTurn: true,
      },
    ]);
  });

  test('the real line of Forsaken Miner: pay {B}, return this card from the graveyard (an ability of the graveyard)', () => {
    expect(
      readAll(
        'Whenever you commit a crime, you may pay {B}. If you do, return this card from your graveyard to the battlefield.',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'crimeCommitted', who: 'you' },
        effect: {
          kind: 'mayPay',
          cost: [{ kind: 'mana', symbols: ['B'] }],
          effect: {
            kind: 'moveToZone',
            objects: { kind: 'this' },
            to: 'battlefield',
            controller: 'owner',
          },
        },
        functionsIn: 'graveyard',
      },
    ]);
  });

  test.each([
    ['an opponent', 'opponent'],
    ['a player', 'any'],
  ])('the crime of %s (SYNTHETIC)', (who, expected) => {
    expect(readAll(`Whenever ${who} commits a crime, you draw a card.`).abilities).toMatchObject([
      { kind: 'triggered', trigger: { kind: 'crimeCommitted', who: expected } },
    ]);
  });

  test('"that player" is the player who committed the crime (SYNTHETIC)', () => {
    expect(
      readAll('Whenever an opponent commits a crime, that player loses 1 life.').abilities,
    ).toMatchObject([
      {
        kind: 'triggered',
        trigger: { kind: 'crimeCommitted', who: 'opponent' },
        effect: { kind: 'loseLife', player: { kind: 'triggerPlayer' }, amount: 1 },
      },
    ]);
  });

  test.each([
    'Whenever you committed a crime, draw a card.',
    'Whenever you commit crimes, draw a card.',
    'Whenever you commit two crimes, draw a card.',
    'Whenever you commit a crime or cast a spell, draw a card.',
    'Whenever each opponent commits a crime, draw a card.',
    'Whenever you commit a crime this turn, draw a card.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text);
  });

  test('the line names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature('trigger:crimeCommitted', LINE, 'creature');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('trigger:crimeCommitted');
    expect(DECLARED_NEEDS).toContain('trigger:crimeCommitted');
  });
});

describe('Mirkwood Bats: "Whenever you create or sacrifice a token" (D-465, CR 111.2, 701.21)', () => {
  test('the real line: one ability for the creation and one for the sacrifice of a token, with the same body', () => {
    expect(
      readAll('Whenever you create or sacrifice a token, each opponent loses 1 life.').abilities,
    ).toEqual([
      { kind: 'triggered', trigger: { kind: 'tokenCreated', who: 'you' }, effect: DRAIN },
      {
        kind: 'triggered',
        trigger: { kind: 'permanentSacrificed', by: 'you', filter: { token: true } },
        effect: DRAIN,
      },
    ]);
  });

  test.each([
    ['you create a token', { kind: 'tokenCreated', who: 'you' }],
    ['an opponent creates a token', { kind: 'tokenCreated', who: 'opponent' }],
    ['a player creates a token', { kind: 'tokenCreated', who: 'any' }],
  ])('the creation alone (SYNTHETIC): %s', (event, trigger) => {
    expect(readAll(`Whenever ${event}, you gain 1 life.`).abilities).toMatchObject([
      { kind: 'triggered', trigger },
    ]);
  });

  test('a player creates or sacrifices a token (SYNTHETIC): the sacrifice is of any player', () => {
    expect(
      readAll('Whenever a player creates or sacrifices a token, you gain 1 life.').abilities,
    ).toMatchObject([
      { trigger: { kind: 'tokenCreated', who: 'any' } },
      { trigger: { kind: 'permanentSacrificed', by: 'any', filter: { token: true } } },
    ]);
  });

  test('"one or more tokens" is still the batch of tokens that enter', () => {
    expect(
      readAll('Whenever you create one or more tokens, you gain 1 life.').abilities,
    ).toMatchObject([{ trigger: { kind: 'entersBatch' } }]);
  });

  test.each([
    'Whenever you creates a token, draw a card.',
    'Whenever an opponent creates or sacrifices a token, draw a card.',
    'Whenever you create or sacrifices a token, draw a card.',
    'Whenever you create a creature token, draw a card.',
    'Whenever you create tokens, draw a card.',
    'Whenever you create or sacrifice tokens, draw a card.',
    'Whenever you sacrifice or create a token, draw a card.',
    'Whenever you created a token, draw a card.',
    'Whenever you create a token or cast a spell, draw a card.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text);
  });

  test('the line names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature(
      'trigger:tokenCreated',
      'Whenever you create or sacrifice a token, each opponent loses 1 life.',
      'creature',
    );
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('trigger:tokenCreated');
    expect(DECLARED_NEEDS).toContain('trigger:tokenCreated');
  });
});

describe('Morbid Opportunist: "Whenever one or more other creatures die" (D-466, CR 700.4, 603.10a)', () => {
  const GROUP = { types: ['creature'], other: true };

  test('the real line: a batch of the creatures of every player but this one, once each turn', () => {
    expect(
      readAll(
        'Whenever one or more other creatures die, draw a card. This ability triggers only once each turn.',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'diesBatch', what: GROUP },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        oncePerTurn: true,
      },
    ]);
  });

  test('no "other" and no controller (SYNTHETIC)', () => {
    expect(readAll('Whenever one or more creatures die, you gain 1 life.').abilities).toMatchObject(
      [{ trigger: { kind: 'diesBatch', what: { types: ['creature'] } } }],
    );
  });

  test('the group of the controller is read as before', () => {
    expect(
      readAll('Whenever one or more other creatures you control die, you gain 1 life.').abilities,
    ).toMatchObject([
      {
        trigger: {
          kind: 'diesBatch',
          what: { types: ['creature'], other: true, controller: 'you' },
        },
      },
    ]);
  });

  test.each([
    'Whenever one or more creatures an opponent controls die, draw a card.',
    'Whenever one or more other creatures dies, draw a card.',
    'Whenever one or more other creature die, draw a card.',
    'Whenever two or more other creatures die, draw a card.',
    'Whenever one or more other creatures die or leave the battlefield, draw a card.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text);
  });
});
