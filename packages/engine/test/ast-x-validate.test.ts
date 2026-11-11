// What validateCard accepts and refuses about X (D-103): an {X} in a mana cost, in an activation cost
// and "pay X life" as an additional cost or an activation cost, the `x` amount, and "enters with X
// counters". Pins: CR 107.3a (X is announced for a spell or ability whose cost has one), CR 107.3j (an
// ability a permanent has gained has no X of its own), CR 107.3g, CR 107.3m.
// Cards are SYNTHETIC probes built here and in src/cards/fixtures/synthetic-x.ts.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import {
  type Ability,
  type CardDefinition,
  type Cost,
  type Effect,
  FEATURE_VALUES,
  isFeatureSupported,
  SYNTHETIC_CARDS,
  validateCard,
} from '../src/index';

const X = { kind: 'x' } as const;
const DRAW_X: Effect = { kind: 'draw', player: { kind: 'you' }, count: X };

const issues = (card: CardDefinition): string[] =>
  validateCard(card).map((i) => `${i.path}: ${i.message}`);

const spellWith = (
  manaCost: readonly string[],
  opts: { x?: boolean; additionalCosts?: readonly Cost[]; effect?: Effect } = {},
): CardDefinition =>
  singleFace({
    name: 'SYNTHETIC X Probe',
    manaCost,
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: 'SYNTHETIC probe',
    ...(opts.additionalCosts === undefined ? {} : { additionalCosts: opts.additionalCosts }),
    spell: { effect: opts.effect ?? DRAW_X, ...(opts.x === false ? {} : { x: true }) },
  });

const permanentWith = (abilities: readonly Ability[], manaCost: readonly string[] | null) =>
  singleFace({
    name: 'SYNTHETIC X Probe',
    manaCost,
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'SYNTHETIC probe',
    abilities,
  });

describe('the synthetic X cards are executable', () => {
  test.each([
    'SYNTHETIC X Burn',
    'SYNTHETIC X Draw',
    'SYNTHETIC Double X Draw',
    'SYNTHETIC X Pump',
    'SYNTHETIC Hydra Cub',
    'SYNTHETIC Blood Burn',
    'SYNTHETIC Kicked X Burn',
    'SYNTHETIC Free X Burn',
    'SYNTHETIC X Cannon',
    'SYNTHETIC Blood Lance',
    'SYNTHETIC Double Well',
    'SYNTHETIC Spell Discount',
  ])('%s', (name) => {
    expect(issues(SYNTHETIC_CARDS[name] as CardDefinition)).toEqual([]);
  });
});

describe('X in a spell', () => {
  test('the effect may read X when the mana cost has an {X} or the card says "pay X life"', () => {
    expect(issues(spellWith(['X', 'U']))).toEqual([]);
    expect(issues(spellWith(['U'], { additionalCosts: [{ kind: 'payXLife' }] }))).toEqual([]);
  });

  test('a spell that says it uses X needs something to announce', () => {
    expect(issues(spellWith(['U']))).toEqual([
      'faces[0].spell.x: spell uses X but its cost has no {X} and no "pay X life"',
    ]);
  });

  test('an effect that reads X in a spell that does not say so is refused', () => {
    expect(issues(spellWith(['X', 'U'], { x: false }))).toEqual([
      'faces[0].spell.effect.count: X is used but nothing in this ability or spell has an X',
    ]);
  });

  test('"pay X life" at most once, and {X} in an additional mana cost is refused', () => {
    const twice = issues(
      spellWith(['U'], { additionalCosts: [{ kind: 'payXLife' }, { kind: 'payXLife' }] }),
    );
    expect(twice).toEqual([
      'faces[0].additionalCosts: more than one "pay X life" cost is not supported',
    ]);
    const mana = issues(spellWith(['U'], { additionalCosts: [{ kind: 'mana', symbols: ['X'] }] }));
    expect(mana).toEqual([
      'faces[0].additionalCosts[0].symbols: an {X} in an additional mana cost is not supported (use payXLife for "pay X life")',
    ]);
  });

  test('X in a kicker or flashback cost is refused', () => {
    const kicker = spellWith(['X', 'U'], { effect: DRAW_X });
    const withKicker: CardDefinition = {
      ...kicker,
      faces: kicker.faces.map((f) => ({
        ...f,
        abilities: [
          {
            kind: 'keyword',
            keyword: { kind: 'kicker', cost: [{ kind: 'mana', symbols: ['X'] }] },
          } as const,
        ],
      })),
    };
    expect(issues(withKicker).join('\n')).toContain('X in a kicker cost is not supported');
  });
});

describe('"enters with X counters"', () => {
  const enters = (manaCost: readonly string[] | null) =>
    singleFace({
      name: 'SYNTHETIC X Probe',
      manaCost,
      types: ['creature'],
      colors: [],
      colorIdentity: [],
      power: 0,
      toughness: 0,
      oracleText: 'SYNTHETIC probe',
      abilities: [
        {
          kind: 'replacement',
          replacement: { kind: 'entersWithCounters', counter: '+1/+1', count: X },
        },
      ],
    });

  test('is read from the {X} of the mana cost', () => {
    expect(issues(enters(['X', 'G']))).toEqual([]);
  });

  test('a card with no {X} has nothing to read', () => {
    expect(issues(enters(['G']))).toEqual([
      'faces[0].abilities[0].replacement.count: enters with X counters but the mana cost has no {X}',
    ]);
  });

  test('a number still has to be positive', () => {
    const bad = singleFace({
      name: 'SYNTHETIC X Probe',
      manaCost: ['X'],
      types: ['creature'],
      colors: [],
      colorIdentity: [],
      power: 0,
      toughness: 0,
      oracleText: 'SYNTHETIC probe',
      abilities: [
        {
          kind: 'replacement',
          replacement: { kind: 'entersWithCounters', counter: '+1/+1', count: 0 },
        },
      ],
    });
    expect(issues(bad)).toEqual([
      'faces[0].abilities[0].replacement.count: counter count must be a positive integer, { kind: "x" }, { kind: "timesKicked" } or a countOf',
    ]);
  });
});

describe('X in an activated ability', () => {
  const activated = (cost: readonly Cost[], effect: Effect = DRAW_X): Ability => ({
    kind: 'activated',
    cost,
    effect,
  });

  test('an {X} in the activation cost or "pay X life" lets the effect read X', () => {
    expect(
      issues(
        permanentWith([activated([{ kind: 'mana', symbols: ['X'] }, { kind: 'tap' }])], ['2']),
      ),
    ).toEqual([]);
    expect(issues(permanentWith([activated([{ kind: 'payXLife' }])], ['2']))).toEqual([]);
  });

  test('an ability with no X in its cost cannot read it', () => {
    expect(issues(permanentWith([activated([{ kind: 'tap' }])], ['2']))).toEqual([
      'faces[0].abilities[0].effect.count: X is used but nothing in this ability or spell has an X',
    ]);
  });

  test('a triggered ability cannot read X (CR 107.3j: it has none of its own)', () => {
    const triggered: Ability = {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: DRAW_X,
    };
    expect(issues(permanentWith([triggered], ['X']))).toEqual([
      'faces[0].abilities[0].effect.count: X is used but nothing in this ability or spell has an X',
    ]);
  });

  test('a static ability cannot read X', () => {
    const reduce: Ability = {
      kind: 'static',
      static: { kind: 'costReduction', spells: { kind: 'this' }, amount: X as never },
    };
    expect(issues(permanentWith([reduce], ['X'])).length).toBeGreaterThan(0);
  });

  test('X in the cost of a keyword (cycling, equip) or of a mana ability is refused', () => {
    const cycling: Ability = {
      kind: 'keyword',
      keyword: { kind: 'cycling', cost: [{ kind: 'mana', symbols: ['X'] }] },
    };
    expect(issues(permanentWith([cycling], ['2'])).join('\n')).toContain(
      'X in the cost of a keyword is not implemented',
    );
    const mana: Ability = {
      kind: 'mana',
      cost: [{ kind: 'mana', symbols: ['X'] }, { kind: 'tap' }],
      production: { kind: 'fixed', mana: ['C'] },
    };
    expect(issues(permanentWith([mana], ['2'])).join('\n')).toContain(
      'a mana ability may cost only generic, single-color or hybrid mana',
    );
  });

  test('"pay X life" is not a ward or cycling cost', () => {
    const ward: Ability = {
      kind: 'keyword',
      keyword: { kind: 'ward', cost: [{ kind: 'payXLife' }] },
    };
    expect(issues(permanentWith([ward], ['2'])).join('\n')).toContain(
      'cost "payXLife" is not implemented by the engine yet',
    );
  });
});

describe('the feature registry names X', () => {
  test('amount:x, cost:payXLife and ability:xCost are known and supported', () => {
    for (const ref of ['amount:x', 'cost:payXLife', 'ability:xCost'] as const) {
      expect(isFeatureSupported(ref), ref).toBe(true);
    }
    expect(FEATURE_VALUES.cost).toContain('payXLife');
    expect(FEATURE_VALUES.ability).toContain('xCost');
  });
});
