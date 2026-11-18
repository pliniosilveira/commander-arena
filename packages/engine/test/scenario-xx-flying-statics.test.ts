// First Flight statics (D-149): a "+N/+N" static ability whose subject or count names "with flying" or "without flying" ("Other creatures you
// control with flying get +1/+1", "Creatures without flying get -2/-0", "~ gets +1/+1 for each other creature you control with flying").
// Pins: CR 613.1f (layer 6 first), 613.4c (layer 7c), 613.8 (layer 7 depends on layer 6, not the other way round, so the bonus reads the
// keywords a creature has once every grant has applied, whatever the order on the battlefield), 611.3a (a static ability follows the board),
// 702.9a (flying). Cards are SYNTHETIC: the AST is written by hand, the text says what it does.
import { describe, test } from 'vitest';
import type { Effect, ObjectRef, TargetSpec } from '../src/ast/types';
import { kw, singleFace } from '../src/cards/fixtures/helpers';
import { type CardDefinition, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const WINDS = 'SYNTHETIC Wind Chorus'; // creatures you control with flying get +1/+1
const EAGLE = 'SYNTHETIC Lead Eagle'; // 2/2 flying: other creatures you control with flying get +1/+1
const SHIFT = 'SYNTHETIC Skewed Sky'; // creatures with flying get +2/+0; creatures without flying get -2/-0
const SKYCAT = 'SYNTHETIC Sky Cat'; // 1/1 flying: +1/+1 for each other creature you control with flying
const LORD = 'SYNTHETIC Wing Lord'; // creatures you control have flying
const THIEF = 'SYNTHETIC Foe Lord'; // creatures you control have flying (an opponent's)
const GUST = 'SYNTHETIC Gust of Air'; // target creature gains flying until end of turn
const HUSH = 'SYNTHETIC Quiet Air'; // target creature loses all abilities until end of turn
const BEAR = 'SYNTHETIC Ground Bear'; // 2/2
const BIRD = 'SYNTHETIC Small Bird'; // 1/1 flying

const TARGET: readonly TargetSpec[] = [
  { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } } },
];
const T1: ObjectRef = { kind: 'target', id: 't1' };

const creature = (
  name: string,
  power: number,
  toughness: number,
  abilities: CardDefinition['faces'][number]['abilities'],
  text: string,
) =>
  singleFace({
    name,
    manaCost: ['1'],
    types: ['creature'],
    subtypes: ['Bird'],
    colors: ['U'],
    colorIdentity: ['U'],
    power,
    toughness,
    oracleText: text,
    abilities: [...abilities],
  });

const enchantment = (name: string, abilities: CardDefinition['faces'][number]['abilities']) =>
  singleFace({
    name,
    manaCost: ['1', 'U'],
    types: ['enchantment'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'SYNTHETIC',
    abilities: [...abilities],
  });

const spell = (name: string, effect: Effect) =>
  singleFace({
    name,
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'SYNTHETIC',
    spell: { targets: TARGET, effect },
  });

const flyers = { types: ['creature'], keywords: ['flying'] } as const;
const bonus = (
  subject: { kind: 'filter'; filter: object; other?: true },
  power: number,
  toughness: number,
) => ({
  kind: 'static' as const,
  static: { kind: 'modifyPt' as const, subject, power, toughness },
});
// biome-ignore lint/suspicious/noExplicitAny: the filters are written as the AST literals they are
const filter = (f: object, other?: true): any => ({
  kind: 'filter',
  filter: f,
  ...(other ? { other } : {}),
});

const winds = enchantment(WINDS, [bonus(filter({ ...flyers, controller: 'you' }), 1, 1)]);
const eagle = creature(
  EAGLE,
  2,
  2,
  [kw('flying'), bonus(filter({ ...flyers, controller: 'you' }, true), 1, 1)],
  'SYNTHETIC',
);
const shift = enchantment(SHIFT, [
  bonus(filter({ types: ['creature'], keywords: ['flying'] }), 2, 0),
  bonus(filter({ types: ['creature'], notKeywords: ['flying'] }), -2, 0),
]);
const COUNT = {
  kind: 'countOf',
  filter: { types: ['creature'], keywords: ['flying'], other: true, controller: 'you' },
} as const;
const skycat = creature(
  SKYCAT,
  1,
  1,
  [
    kw('flying'),
    {
      kind: 'static',
      static: { kind: 'modifyPt', subject: { kind: 'this' }, power: COUNT, toughness: COUNT },
    },
  ],
  'SYNTHETIC',
);
const grantAll = (name: string) =>
  creature(
    name,
    1,
    1,
    [
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: filter({ types: ['creature'], controller: 'you' }),
          keyword: { kind: 'flying' },
        },
      },
    ],
    'SYNTHETIC',
  );
const lord = grantAll(LORD);
const thief = grantAll(THIEF);
const gust = spell(GUST, {
  kind: 'grantKeyword',
  objects: T1,
  keyword: { kind: 'flying' },
  duration: 'untilEndOfTurn',
});
const hush = spell(HUSH, { kind: 'loseAllAbilities', objects: T1, duration: 'untilEndOfTurn' });
const bear = creature(BEAR, 2, 2, [], 'SYNTHETIC');
const bird = creature(BIRD, 1, 1, [kw('flying')], 'SYNTHETIC');

const CARDS = [winds, eagle, shift, skycat, lord, thief, gust, hush, bear, bird];

function board(configure: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) {
  const b = scenario().seat(0).library('Island', 'Island', 'Island');
  for (const card of CARDS) b.define(card);
  configure(b);
  return b.build();
}

/** Seat 0 holds the spells and mana. */
const mine = (b: ReturnType<typeof scenario>) =>
  b.seat(0).hand(GUST, HUSH).battlefield('Island', 'Island', 'Island', 'Island');

function cast(g: ScenarioGame, card: string, target: string): void {
  g.act(0).cast(card, { targets: [target], pay: true });
  g.passAll();
}

describe('the synthetic cards are valid', () => {
  test.each(CARDS.map((c) => [c.name, c] as const))('%s', (_name, card) => {
    const issues = validateCard(card);
    if (issues.length > 0) throw new Error(JSON.stringify(issues));
  });
});

describe('"Creatures you control with flying get +1/+1" (CR 613.4c, 611.3a)', () => {
  const base = (b: ReturnType<typeof scenario>) =>
    mine(b)
      .battlefield(WINDS)
      .battlefield(BEAR, { label: 'bear' })
      .battlefield(BIRD, { label: 'bird' });

  test('only a creature that has flying gets it', () => {
    const g = board((b) => {
      base(b).seat(1).battlefield(BIRD, { label: 'foe' });
      return b;
    });
    g.expect.pt('bear', 2, 2);
    g.expect.pt('bird', 2, 2);
  });

  test('the opponent flyer is left out when it says "you control"', () => {
    const g = board((b) => {
      base(b).seat(1).battlefield(BIRD, { label: 'foe' });
      return b;
    });
    g.expect.pt('foe', 1, 1);
  });

  test('a creature that gains flying from a static ability that is LATER on the battlefield still gets it (layer 6 before 7c)', () => {
    const g = board((b) => {
      base(b).battlefield(LORD, { label: 'lord' });
      return b;
    });
    g.expect.pt('bear', 3, 3);
    g.expect.pt('lord', 2, 2);
  });

  test('the same when the grant came first on the battlefield', () => {
    const g = board((b) => {
      mine(b)
        .battlefield(LORD, { label: 'lord' })
        .battlefield(WINDS)
        .battlefield(BEAR, { label: 'bear' });
      return b;
    });
    g.expect.pt('bear', 3, 3);
    g.expect.pt('lord', 2, 2);
  });

  test("an opponent's grant gives flying to its creatures only: mine stay as they are", () => {
    const g = board((b) => {
      base(b).seat(1).battlefield(THIEF, { label: 'thief' });
      return b;
    });
    g.expect.pt('bear', 2, 2);
  });

  test('a creature that gains flying until end of turn gets the bonus, and loses it at cleanup', () => {
    const g = board((b) => {
      base(b);
      return b;
    });
    g.expect.pt('bear', 2, 2);
    cast(g, GUST, 'bear');
    g.expect.pt('bear', 3, 3);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt('bear', 2, 2);
  });

  test('a flyer that loses all abilities loses the bonus (CR 613.1f)', () => {
    const g = board((b) => {
      base(b);
      return b;
    });
    g.expect.pt('bird', 2, 2);
    cast(g, HUSH, 'bird');
    g.expect.derived('bird', { keywords: [] });
    g.expect.pt('bird', 1, 1);
  });
});

describe('"Other creatures you control with flying get +1/+1" (CR 613.4c)', () => {
  test('the source itself is left out, another flyer of mine gets it, a ground creature and an opponent do not', () => {
    const g = board((b) => {
      mine(b).battlefield(EAGLE, { label: 'eagle' }).battlefield(BIRD, { label: 'bird' });
      b.battlefield(BEAR, { label: 'bear' }).seat(1).battlefield(BIRD, { label: 'foe' });
      return b;
    });
    g.expect.pt('eagle', 2, 2);
    g.expect.pt('bird', 2, 2);
    g.expect.pt('bear', 2, 2);
    g.expect.pt('foe', 1, 1);
  });

  test('two of them give each other the bonus', () => {
    const g = board((b) => {
      mine(b).battlefield(EAGLE, { label: 'one' }).battlefield(EAGLE, { label: 'two' });
      return b;
    });
    g.expect.pt('one', 3, 3);
    g.expect.pt('two', 3, 3);
  });
});

describe('"Creatures with flying get +2/+0" and "Creatures without flying get -2/-0" (CR 613.4c)', () => {
  test('flyers of both players get +2/+0, the others -2/-0', () => {
    const g = board((b) => {
      mine(b)
        .battlefield(SHIFT)
        .battlefield(BEAR, { label: 'bear' })
        .battlefield(BIRD, { label: 'bird' });
      b.seat(1).battlefield(BIRD, { label: 'foe' }).battlefield(BEAR, { label: 'foeBear' });
      return b;
    });
    g.expect.pt('bird', 3, 1);
    g.expect.pt('foe', 3, 1);
    g.expect.pt('bear', 0, 2);
    g.expect.pt('foeBear', 0, 2);
  });

  test('a creature that gains flying switches from the penalty to the bonus; the power can go below 0', () => {
    const g = board((b) => {
      mine(b).battlefield(SHIFT).battlefield(BIRD, { label: 'bird' });
      b.battlefield(BEAR, { label: 'bear' });
      return b;
    });
    g.expect.pt('bear', 0, 2);
    cast(g, GUST, 'bear');
    g.expect.pt('bear', 4, 2);
    // the bird loses flying: -2/-0 on a 1/1 leaves a power of -1 (CR 613.4c adds, nothing floors it)
    cast(g, HUSH, 'bird');
    g.expect.pt('bird', -1, 1);
  });

  test('a creature that gains flying from a static ability later on the battlefield is not penalised', () => {
    const g = board((b) => {
      mine(b)
        .battlefield(SHIFT)
        .battlefield(BEAR, { label: 'bear' })
        .battlefield(LORD, { label: 'lord' });
      return b;
    });
    g.expect.pt('bear', 4, 2);
    g.expect.pt('lord', 3, 1);
  });
});

describe('"~ gets +1/+1 for each other creature you control with flying" (CR 611.3a, 613.4c)', () => {
  test('counts the other flyers I control only', () => {
    const g = board((b) => {
      mine(b)
        .battlefield(SKYCAT, { label: 'cat' })
        .battlefield(BEAR)
        .battlefield(BIRD)
        .battlefield(BIRD);
      b.seat(1).battlefield(BIRD);
      return b;
    });
    g.expect.pt('cat', 3, 3);
  });

  test('a creature that gains flying (until end of turn) is counted, and not any more at cleanup', () => {
    const g = board((b) => {
      mine(b).battlefield(SKYCAT, { label: 'cat' }).battlefield(BEAR, { label: 'bear' });
      return b;
    });
    g.expect.pt('cat', 1, 1);
    cast(g, GUST, 'bear');
    g.expect.pt('cat', 2, 2);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt('cat', 1, 1);
  });

  test('a flyer that loses all abilities is not counted', () => {
    const g = board((b) => {
      mine(b).battlefield(SKYCAT, { label: 'cat' }).battlefield(BIRD, { label: 'bird' });
      return b;
    });
    g.expect.pt('cat', 2, 2);
    cast(g, HUSH, 'bird');
    g.expect.pt('cat', 1, 1);
  });

  test('a creature that has flying from a static ability counts, wherever it is on the battlefield', () => {
    const g = board((b) => {
      mine(b)
        .battlefield(SKYCAT, { label: 'cat' })
        .battlefield(BEAR)
        .battlefield(LORD, { label: 'lord' });
      return b;
    });
    // the Bear and the Lord have flying from the Lord; the Cat has its own, and counts the other two
    g.expect.pt('cat', 3, 3);
  });

  test('two of them count each other without looping', () => {
    const g = board((b) => {
      mine(b).battlefield(SKYCAT, { label: 'one' }).battlefield(SKYCAT, { label: 'two' });
      return b;
    });
    g.expect.pt('one', 2, 2);
    g.expect.pt('two', 2, 2);
  });

  test('together with a "+1/+1 to flyers" static ability: the count reads keywords, not the bonus', () => {
    const g = board((b) => {
      mine(b).battlefield(WINDS).battlefield(SKYCAT, { label: 'cat' }).battlefield(BIRD);
      return b;
    });
    // 1/1 + 1 for the Bird, +1/+1 from the Wind Chorus
    g.expect.pt('cat', 3, 3);
  });
});
