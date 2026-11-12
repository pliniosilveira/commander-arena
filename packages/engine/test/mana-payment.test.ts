import { describe, expect, test } from 'vitest';
import { parseManaCost, planPayment } from '../src/mana/index';
import type { PaymentRequest } from '../src/mana/payment';
import type { ManaColor, ManaObject } from '../src/mana/types';
import { ABILITIES_ONLY, CREATURE_ONLY, land, mana, oid, source } from './mana-fixtures';

function request(symbols: string[], over: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    cost: parseManaCost(symbols),
    x: 0,
    pool: [],
    sources: [],
    lifeAvailable: 0,
    spell: { types: ['sorcery'] },
    ...over,
  };
}

const tapped = (symbols: string[], over: Partial<PaymentRequest> = {}) =>
  planPayment(request(symbols, over))?.taps.map(
    (t) => `${t.object}/${t.abilityIndex}/${t.outcome}`,
  );

const ANY: ManaColor[][] = [['W'], ['U'], ['B'], ['R'], ['G']];

describe('planPayment: basic costs', () => {
  test('an empty cost needs nothing', () => {
    expect(planPayment(request([]))).toEqual({
      fromPool: [],
      taps: [],
      lifePaid: 0,
      leftover: [],
      spentTypes: [],
    });
    expect(planPayment(request(['0']))).toEqual({
      fromPool: [],
      taps: [],
      lifePaid: 0,
      leftover: [],
      spentTypes: [],
    });
  });

  test('mono colored cost taps matching sources, lowest object id first', () => {
    expect(tapped(['G', 'G'], { sources: [land(3, 'G'), land(1, 'G'), land(2, 'G')] })).toEqual([
      'o1/0/0',
      'o2/0/0',
    ]);
  });

  test('wrong colors cannot pay colored costs', () => {
    expect(planPayment(request(['G'], { sources: [land(1, 'W')] }))).toBeNull();
    expect(planPayment(request(['G', 'G'], { sources: [land(1, 'G')] }))).toBeNull();
  });

  test('multicolor cost uses one source per color', () => {
    expect(
      tapped(['W', 'U', 'B'], {
        sources: [land(1, 'B'), land(2, 'U'), land(3, 'W'), land(4, 'W')],
      }),
    ).toEqual(['o1/0/0', 'o2/0/0', 'o3/0/0']);
  });

  test('colored symbols are paid by the right lands even when generic comes first in the cost', () => {
    expect(
      tapped(['2', 'W'], { sources: [land(1, 'R'), land(2, 'R'), land(3, 'W'), land(4, 'G')] }),
    ).toEqual(['o1/0/0', 'o2/0/0', 'o3/0/0']);
  });

  test('generic cost with mixed lands', () => {
    expect(
      tapped(['3'], {
        sources: [land(4, 'W'), land(1, 'G'), land(3, 'R'), land(2, 'U')],
      }),
    ).toEqual(['o1/0/0', 'o2/0/0', 'o3/0/0']);
  });

  test('generic cannot be paid with too few sources', () => {
    expect(planPayment(request(['3'], { sources: [land(1, 'G'), land(2, 'G')] }))).toBeNull();
  });

  test('colorless {C} needs colorless mana, generic does not', () => {
    expect(planPayment(request(['C'], { sources: [land(1, 'G')] }))).toBeNull();
    expect(tapped(['C'], { sources: [land(1, 'G'), land(2, 'C')] })).toEqual(['o2/0/0']);
    expect(tapped(['1'], { sources: [land(1, 'C')] })).toEqual(['o1/0/0']);
  });

  test('sources that produce nothing are ignored', () => {
    expect(tapped(['1'], { sources: [source(1, []), source(2, [[]]), land(3, 'G')] })).toEqual([
      'o3/0/0',
    ]);
  });

  test('a color needed by two symbols with a choice source still works out (matching, not greedy)', () => {
    // Tower (W or U), Plains, Island. {W}{U}{1}: greedy "tower first" could still work, but
    // {W}{W}{U} needs the tower to be W and the Island U.
    expect(
      tapped(['W', 'W', 'U'], {
        sources: [source(1, [['W'], ['U']]), land(2, 'W'), land(3, 'U')],
      }),
    ).toEqual(['o1/0/0', 'o2/0/0', 'o3/0/0']);
    // Tower must be U here because the only Plains pays W.
    expect(
      tapped(['W', 'U', 'U'], {
        sources: [source(1, [['W'], ['U']]), land(2, 'W'), land(3, 'U')],
      }),
    ).toEqual(['o1/0/1', 'o2/0/0', 'o3/0/0']);
  });
});

describe('planPayment: choice and multi-mana sources', () => {
  const tower = source(1, [['W'], ['U']]);

  test('a choice source picks the outcome that pays', () => {
    expect(tapped(['U'], { sources: [tower] })).toEqual(['o1/0/1']);
    expect(tapped(['W'], { sources: [tower] })).toEqual(['o1/0/0']);
    expect(planPayment(request(['B'], { sources: [tower] }))).toBeNull();
  });

  test('a choice source cannot pay two colors by itself', () => {
    expect(planPayment(request(['W', 'U'], { sources: [tower] }))).toBeNull();
    expect(tapped(['W', 'U'], { sources: [tower, land(2, 'W')] })).toEqual(['o1/0/1', 'o2/0/0']);
  });

  test('Sol Ring pays two generic with one tap', () => {
    const solRing = source(1, [['C', 'C']], { tier: 'artifact' });
    expect(tapped(['2'], { sources: [solRing] })).toEqual(['o1/0/0']);
    expect(tapped(['C', 'C'], { sources: [solRing] })).toEqual(['o1/0/0']);
    expect(planPayment(request(['W', 'C'], { sources: [solRing] }))).toBeNull();
    expect(planPayment(request(['3'], { sources: [solRing] }))).toBeNull();
  });

  test('both mana of a multi-mana outcome can pay different demands', () => {
    const tomb = source(1, [['C', 'C']]);
    expect(tapped(['C', '1'], { sources: [tomb] })).toEqual(['o1/0/0']);
  });

  test('a source object is never tapped twice, even through two abilities', () => {
    const twoAbilities = [
      { ...source(1, [['W']]), abilityIndex: 0 },
      { ...source(1, [['U']]), abilityIndex: 1 },
    ];
    expect(planPayment(request(['W', 'U'], { sources: twoAbilities }))).toBeNull();
    expect(tapped(['U'], { sources: twoAbilities })).toEqual(['o1/1/0']);
    expect(tapped(['W'], { sources: twoAbilities })).toEqual(['o1/0/0']);
  });

  test('abilities of one object tie-break by ability index', () => {
    const twoAbilities = [
      { ...source(1, [['G']]), abilityIndex: 1 },
      { ...source(1, [['G']]), abilityIndex: 0 },
    ];
    expect(tapped(['G'], { sources: twoAbilities })).toEqual(['o1/0/0']);
  });
});

describe('planPayment: leftover mana (CR 106.4)', () => {
  const solRing = source(1, [['C', 'C']], { tier: 'artifact' });

  test('Sol Ring paying {1} leaves one colorless mana', () => {
    const plan = planPayment(request(['1'], { sources: [solRing] }));
    expect(plan?.taps).toHaveLength(1);
    expect(plan?.leftover).toEqual([
      { color: 'C', snow: false, source: oid(1), restriction: null },
    ]);
  });

  test('Sol Ring paying {2} leaves nothing', () => {
    expect(planPayment(request(['2'], { sources: [solRing] }))?.leftover).toEqual([]);
  });

  test('a single-outcome choice source never leaves anything behind', () => {
    const tower = source(1, [['W'], ['U']]);
    expect(planPayment(request(['U'], { sources: [tower] }))?.leftover).toEqual([]);
  });

  test('overpaying with several sources reports the surplus', () => {
    const plan = planPayment(
      request(['3'], { sources: [solRing, source(2, [['C', 'C']], { tier: 'artifact' })] }),
    );
    expect(plan?.taps).toHaveLength(2);
    expect(plan?.leftover).toHaveLength(1);
    expect(plan?.leftover[0]?.color).toBe('C');
    expect(plan?.taps.map((t) => t.object)).toContain(plan?.leftover[0]?.source);
  });

  test('leftover keeps the source snow flag and restriction', () => {
    const plan = planPayment(
      request(['1'], {
        spell: { types: ['creature'] },
        sources: [source(5, [['G', 'G']], { snow: true, restriction: CREATURE_ONLY })],
      }),
    );
    expect(plan?.leftover).toEqual([
      { color: 'G', snow: true, source: oid(5), restriction: CREATURE_ONLY },
    ]);
  });

  test('leftover color is the unused unit, not the used one', () => {
    const filter = source(1, [['W', 'U']]);
    const plan = planPayment(request(['U'], { sources: [filter] }));
    expect(plan?.leftover.map((m) => m.color)).toEqual(['W']);
  });

  test('unspent pool mana is not leftover', () => {
    const plan = planPayment(request(['W'], { pool: [mana('W'), mana('U')] }));
    expect(plan?.fromPool).toEqual([0]);
    expect(plan?.leftover).toEqual([]);
  });

  test('a plan with no waste has no leftover', () => {
    expect(
      planPayment(request(['G', 'G'], { sources: [land(1, 'G'), land(2, 'G')] }))?.leftover,
    ).toEqual([]);
  });
});

describe('planPayment: hybrid and Phyrexian mana', () => {
  test('hybrid {W/U} is paid with either color', () => {
    expect(tapped(['W/U'], { sources: [land(1, 'U')] })).toEqual(['o1/0/0']);
    expect(tapped(['W/U'], { sources: [land(1, 'W')] })).toEqual(['o1/0/0']);
    expect(planPayment(request(['W/U'], { sources: [land(1, 'G')] }))).toBeNull();
  });

  test('{G/W}{G/W} can be paid GG, GW or WW (CR 107.4e example)', () => {
    expect(tapped(['G/W', 'G/W'], { sources: [land(1, 'G'), land(2, 'G')] })).toEqual([
      'o1/0/0',
      'o2/0/0',
    ]);
    expect(tapped(['G/W', 'G/W'], { sources: [land(1, 'G'), land(2, 'W')] })).toEqual([
      'o1/0/0',
      'o2/0/0',
    ]);
    expect(tapped(['G/W', 'G/W'], { sources: [land(1, 'W'), land(2, 'W')] })).toEqual([
      'o1/0/0',
      'o2/0/0',
    ]);
    expect(
      planPayment(request(['G/W', 'G/W'], { sources: [land(1, 'W'), land(2, 'U')] })),
    ).toBeNull();
  });

  test('hybrid symbols share lands with colored symbols correctly', () => {
    // {W}{W/U}: Plains pays W, Island pays the hybrid.
    expect(tapped(['W', 'W/U'], { sources: [land(1, 'U'), land(2, 'W')] })).toEqual([
      'o1/0/0',
      'o2/0/0',
    ]);
    // Only one W source and no blue: cannot pay both.
    expect(
      planPayment(request(['W', 'W/U'], { sources: [land(1, 'G'), land(2, 'W')] })),
    ).toBeNull();
  });

  test('monocolored hybrid {2/W} prefers the single colored mana', () => {
    expect(tapped(['2/W'], { sources: [land(1, 'R'), land(2, 'R'), land(3, 'W')] })).toEqual([
      'o3/0/0',
    ]);
  });

  test('monocolored hybrid falls back to two generic', () => {
    expect(tapped(['2/W'], { sources: [land(1, 'R'), land(2, 'G')] })).toEqual([
      'o1/0/0',
      'o2/0/0',
    ]);
    expect(planPayment(request(['2/W'], { sources: [land(1, 'R')] }))).toBeNull();
  });

  test('two {2/W} mix the options as needed', () => {
    expect(tapped(['2/W', '2/W'], { sources: [land(1, 'W'), land(2, 'R'), land(3, 'R')] })).toEqual(
      ['o1/0/0', 'o2/0/0', 'o3/0/0'],
    );
  });

  test('{C/W} accepts colorless or white', () => {
    expect(tapped(['C/W'], { sources: [land(1, 'C')] })).toEqual(['o1/0/0']);
    expect(tapped(['C/W'], { sources: [land(1, 'W')] })).toEqual(['o1/0/0']);
    expect(planPayment(request(['C/W'], { sources: [land(1, 'G')] }))).toBeNull();
  });

  test('Phyrexian mana is paid with mana when a matching source exists', () => {
    const plan = planPayment(request(['W/P'], { sources: [land(1, 'W')], lifeAvailable: 20 }));
    expect(plan?.lifePaid).toBe(0);
    expect(plan?.taps).toHaveLength(1);
  });

  test('Phyrexian mana is paid with 2 life when no mana is available (CR 107.4f)', () => {
    const plan = planPayment(request(['W/P'], { sources: [land(1, 'U')], lifeAvailable: 2 }));
    expect(plan).toEqual({ fromPool: [], taps: [], lifePaid: 2, leftover: [], spentTypes: [] });
  });

  test('not enough life means no payment', () => {
    expect(planPayment(request(['W/P'], { lifeAvailable: 1 }))).toBeNull();
    expect(planPayment(request(['W/P', 'W/P'], { lifeAvailable: 3 }))).toBeNull();
    expect(planPayment(request(['W/P'], { lifeAvailable: 0 }))).toBeNull();
  });

  test('{W/P}{W/P} mixes mana and life (CR 107.4f example)', () => {
    expect(planPayment(request(['W/P', 'W/P'], { lifeAvailable: 4 }))?.lifePaid).toBe(4);
    const mixed = planPayment(
      request(['W/P', 'W/P'], { sources: [land(1, 'W')], lifeAvailable: 4 }),
    );
    expect(mixed?.lifePaid).toBe(2);
    expect(mixed?.taps).toHaveLength(1);
    expect(
      planPayment(
        request(['W/P', 'W/P'], { sources: [land(1, 'W'), land(2, 'W')], lifeAvailable: 4 }),
      )?.lifePaid,
    ).toBe(0);
  });

  test('life is only paid for Phyrexian symbols, never for ordinary costs', () => {
    expect(planPayment(request(['W'], { lifeAvailable: 20 }))).toBeNull();
    expect(planPayment(request(['1', 'U/P'], { lifeAvailable: 20 }))).toBeNull();
  });

  test('{1}{U/P}: generic from a land, Phyrexian from life when the land is the wrong color', () => {
    const plan = planPayment(request(['1', 'U/P'], { sources: [land(1, 'R')], lifeAvailable: 2 }));
    expect(plan?.lifePaid).toBe(2);
    expect(plan?.taps.map((t) => t.object)).toEqual([oid(1)]);
  });

  test('a Phyrexian symbol needs the colored land rather than life when both could pay generic', () => {
    // Two lands: one Island, one Mountain. {1}{U/P}: Island -> U/P, Mountain -> generic, no life.
    const plan = planPayment(
      request(['1', 'U/P'], { sources: [land(1, 'R'), land(2, 'U')], lifeAvailable: 4 }),
    );
    expect(plan?.lifePaid).toBe(0);
    expect(plan?.taps).toHaveLength(2);
  });
});

describe('planPayment: snow and X', () => {
  test('{S} needs mana from a snow source (CR 107.4h)', () => {
    const snowForest = source(2, [['G']], { snow: true });
    expect(tapped(['S'], { sources: [land(1, 'G'), snowForest] })).toEqual(['o2/0/0']);
    expect(planPayment(request(['S'], { sources: [land(1, 'G')] }))).toBeNull();
  });

  test('snow mana in the pool pays {S}', () => {
    expect(
      planPayment(request(['S'], { pool: [mana('U'), mana('U', { snow: true })] }))?.fromPool,
    ).toEqual([1]);
  });

  test('{S} and a colored symbol need two different mana', () => {
    const snowForest = source(1, [['G']], { snow: true });
    expect(planPayment(request(['S', 'G'], { sources: [snowForest] }))).toBeNull();
    expect(tapped(['S', 'G'], { sources: [snowForest, land(2, 'G')] })).toEqual([
      'o1/0/0',
      'o2/0/0',
    ]);
    expect(tapped(['S', 'W'], { sources: [snowForest, land(2, 'W')] })).toEqual([
      'o1/0/0',
      'o2/0/0',
    ]);
  });

  test('a non-snow unit cannot pay {S}, a snow unit still pays generic', () => {
    const snowForest = source(1, [['G']], { snow: true });
    expect(tapped(['1'], { sources: [snowForest] })).toEqual(['o1/0/0']);
  });

  test('X costs use the announced value (CR 107.3a)', () => {
    const lands = [land(1, 'R'), land(2, 'R'), land(3, 'R'), land(4, 'R')];
    expect(tapped(['X', 'R'], { x: 3, sources: lands })).toEqual([
      'o1/0/0',
      'o2/0/0',
      'o3/0/0',
      'o4/0/0',
    ]);
    expect(planPayment(request(['X', 'R'], { x: 4, sources: lands }))).toBeNull();
    expect(tapped(['X', 'R'], { x: 0, sources: lands })).toEqual(['o1/0/0']);
  });

  test('two X symbols each take the announced value', () => {
    const lands = [1, 2, 3, 4, 5].map((n) => land(n, 'G'));
    expect(planPayment(request(['X', 'X'], { x: 2, sources: lands }))?.taps).toHaveLength(4);
    expect(planPayment(request(['X', 'X'], { x: 3, sources: lands }))).toBeNull();
  });

  test('X is ignored when the cost has no X, and rejects invalid values', () => {
    expect(planPayment(request(['G'], { x: 5, sources: [land(1, 'G')] }))?.taps).toHaveLength(1);
    expect(() => planPayment(request(['X'], { x: -1 }))).toThrow(RangeError);
    expect(() => planPayment(request(['X'], { x: 1.5 }))).toThrow(RangeError);
  });
});

describe('planPayment: restrictions (SPEC 17.1 A5, CR 106.6)', () => {
  test('restricted pool mana pays only the spells it allows', () => {
    const pool = [mana('G', { restriction: CREATURE_ONLY })];
    expect(planPayment(request(['G'], { pool, spell: { types: ['creature'] } }))?.fromPool).toEqual(
      [0],
    );
    expect(planPayment(request(['G'], { pool, spell: { types: ['instant'] } }))).toBeNull();
    expect(planPayment(request(['G'], { pool, spell: { ability: true } }))).toBeNull();
  });

  test('restricted pool mana is skipped in favor of other mana', () => {
    const plan = planPayment(
      request(['G'], {
        pool: [mana('G', { restriction: CREATURE_ONLY })],
        sources: [land(1, 'G')],
        spell: { types: ['sorcery'] },
      }),
    );
    expect(plan?.fromPool).toEqual([]);
    expect(plan?.taps).toHaveLength(1);
  });

  test('abilities-only mana pays abilities and never spells', () => {
    const pool = [mana('R', { restriction: ABILITIES_ONLY })];
    expect(planPayment(request(['R'], { pool, spell: { ability: true } }))?.fromPool).toEqual([0]);
    expect(planPayment(request(['R'], { pool, spell: { types: ['creature'] } }))).toBeNull();
  });

  test('restricted sources follow the same rule', () => {
    const treasureLike = source(1, ANY, { tier: 'sacrifice', restriction: CREATURE_ONLY });
    expect(tapped(['W'], { sources: [treasureLike], spell: { types: ['creature'] } })).toEqual([
      'o1/0/0',
    ]);
    expect(
      planPayment(request(['W'], { sources: [treasureLike], spell: { types: ['land'] } })),
    ).toBeNull();
  });

  test('restricted mana can pay part of a cost alongside unrestricted mana', () => {
    const plan = planPayment(
      request(['G', 'G'], {
        pool: [mana('G', { restriction: CREATURE_ONLY })],
        sources: [land(1, 'G')],
        spell: { types: ['creature'] },
      }),
    );
    expect(plan?.fromPool).toEqual([0]);
    expect(plan?.taps).toHaveLength(1);
  });

  test('restricted pool mana is spent before unrestricted pool mana', () => {
    const pool = [mana('W'), mana('W', { restriction: CREATURE_ONLY })];
    expect(planPayment(request(['W'], { pool, spell: { types: ['creature'] } }))?.fromPool).toEqual(
      [1],
    );
    expect(planPayment(request(['W'], { pool, spell: { types: ['sorcery'] } }))?.fromPool).toEqual([
      0,
    ]);
  });
});

describe('planPayment: pool first, tiers, waste', () => {
  test('pool mana is spent before any source is tapped', () => {
    const plan = planPayment(
      request(['W', '1'], { pool: [mana('W'), mana('R')], sources: [land(1, 'W'), land(2, 'G')] }),
    );
    expect(plan?.fromPool).toEqual([0, 1]);
    expect(plan?.taps).toEqual([]);
  });

  test('pool mana covers part of a cost and sources the rest', () => {
    const plan = planPayment(
      request(['U', 'U', '1'], { pool: [mana('U')], sources: [land(1, 'U'), land(2, 'G')] }),
    );
    expect(plan?.fromPool).toEqual([0]);
    expect(plan?.taps.map((t) => t.object)).toEqual([oid(1), oid(2)]);
  });

  test('only as much pool mana is spent as needed', () => {
    expect(
      planPayment(request(['1'], { pool: [mana('R'), mana('R'), mana('R')] }))?.fromPool,
    ).toEqual([0]);
  });

  test('pool mana alone can fail to pay and sources top it up', () => {
    expect(planPayment(request(['W'], { pool: [mana('U')] }))).toBeNull();
  });

  test('colorless sources first, then lands before artifacts, creatures last, sacrifice sources very last', () => {
    const elves = source(1, [['G']], { tier: 'creature' });
    const mindStone = source(2, [['C']], { tier: 'artifact' });
    const treasure = source(3, ANY, { tier: 'sacrifice' });
    const forest = source(9, [['G']]);
    // A colorless rock costs nothing in flexibility (issue 18): it goes before a colored land.
    expect(tapped(['1'], { sources: [elves, mindStone, treasure, forest] })).toEqual(['o2/0/0']);
    // A creature is kept for combat: a rock goes before it.
    expect(tapped(['1'], { sources: [elves, mindStone, treasure] })).toEqual(['o2/0/0']);
    expect(tapped(['1'], { sources: [elves, treasure, forest] })).toEqual(['o9/0/0']);
    expect(tapped(['1'], { sources: [elves, treasure] })).toEqual(['o1/0/0']);
    expect(tapped(['1'], { sources: [treasure] })).toEqual(['o3/0/0']);
  });

  test('a sacrifice source is used when it is the only way to pay', () => {
    const treasure = source(3, ANY, { tier: 'sacrifice' });
    expect(tapped(['W', 'U'], { sources: [land(1, 'W'), treasure] })).toEqual(['o1/0/0', 'o3/0/1']);
  });

  test('tier preference never makes a payable cost fail', () => {
    const elves = source(1, [['G']], { tier: 'creature' });
    expect(tapped(['G', 'G'], { sources: [elves, land(2, 'G')] })).toEqual(['o1/0/0', 'o2/0/0']);
  });

  test('a multi-mana outcome that would waste mana loses to an equal alternative', () => {
    const tomb = source(1, [['C', 'C']]);
    expect(tapped(['1'], { sources: [tomb, land(2, 'G')] })).toEqual(['o2/0/0']);
    // When the multi-mana source is the better fit it is used.
    expect(tapped(['2'], { sources: [tomb, land(2, 'G'), land(3, 'G')] })).toEqual(['o1/0/0']);
  });

  test('fewer taps within a tier beat many small taps', () => {
    const tomb = source(5, [['C', 'C']]);
    expect(tapped(['2'], { sources: [land(1, 'G'), land(2, 'G'), tomb] })).toEqual(['o5/0/0']);
  });
});

describe('planPayment: the least flexible mana first (issue 18)', () => {
  const wastes = land(5, 'C');
  test('a colorless land is tapped before a colored land for a generic cost', () => {
    expect(tapped(['1'], { sources: [land(1, 'G'), wastes] })).toEqual(['o5/0/0']);
    // The colorless land goes first; of two colored lands of one color count the lower id.
    expect(tapped(['2'], { sources: [land(1, 'G'), land(2, 'U'), wastes] })).toEqual([
      'o1/0/0',
      'o5/0/0',
    ]);
  });

  test('Sol Ring pays a generic cost before a colored land is tapped', () => {
    const solRing = source(7, [['C', 'C']], { tier: 'artifact' });
    expect(tapped(['2'], { sources: [land(1, 'G'), land(2, 'G'), solRing] })).toEqual(['o7/0/0']);
    expect(tapped(['3'], { sources: [land(1, 'G'), land(2, 'G'), solRing] })).toEqual([
      'o1/0/0',
      'o7/0/0',
    ]);
  });

  test('a basic land goes before a land that makes several colors, and before any-color mana', () => {
    const tower = source(1, ANY);
    const dual = source(2, [['W'], ['U']]);
    expect(tapped(['1'], { sources: [tower, dual, land(3, 'R')] })).toEqual(['o3/0/0']);
    expect(tapped(['1'], { sources: [tower, dual] })).toEqual(['o2/0/0']);
  });

  test('a colored cost still taps the source of that color: flexibility never changes what can be paid', () => {
    expect(tapped(['G'], { sources: [wastes, land(1, 'G')] })).toEqual(['o1/0/0']);
    expect(tapped(['G'], { sources: [source(1, ANY), land(2, 'G')] })).toEqual(['o2/0/0']);
    expect(tapped(['W', 'U'], { sources: [source(1, ANY), land(2, 'W')] })).toEqual([
      'o1/0/1',
      'o2/0/0',
    ]);
  });

  test('Delve, Improvise and Convoke resources come after real mana sources, flexibility or not', () => {
    const graveyardCard = {
      ...source(8, [['C']], { tier: 'artifact', genericOnly: true }),
      abilityIndex: -1,
    };
    expect(tapped(['1'], { sources: [graveyardCard, land(1, 'G')] })).toEqual(['o1/0/0']);
    expect(
      tapped(['1'], { sources: [graveyardCard, source(2, [['C', 'C']], { tier: 'artifact' })] }),
    ).toEqual(['o2/0/0']);
    expect(tapped(['2'], { sources: [graveyardCard, land(1, 'G')] })).toEqual([
      'o1/0/0',
      'o8/-1/0',
    ]);
  });

  test('a color kept in reserve still keeps its land untapped, and colorless goes first either way', () => {
    expect(tapped(['1'], { sources: [land(1, 'G'), wastes], reserve: ['G'] })).toEqual(['o5/0/0']);
    expect(tapped(['1'], { sources: [land(1, 'G'), land(2, 'U')], reserve: ['G'] })).toEqual([
      'o2/0/0',
    ]);
  });
});

describe('planPayment: reserve', () => {
  test('with a reserve color, sources of that color stay untapped when possible', () => {
    const sources = [land(1, 'G'), land(2, 'U')];
    expect(tapped(['1'], { sources })).toEqual(['o1/0/0']);
    expect(tapped(['1'], { sources, reserve: ['G'] })).toEqual(['o2/0/0']);
    expect(tapped(['1'], { sources, reserve: ['U'] })).toEqual(['o1/0/0']);
  });

  test('reserve never makes a payment fail', () => {
    expect(tapped(['G'], { sources: [land(1, 'G')], reserve: ['G'] })).toEqual(['o1/0/0']);
    expect(
      tapped(['G', 'G'], { sources: [land(1, 'G'), land(2, 'G')], reserve: ['G', 'G'] }),
    ).toEqual(['o1/0/0', 'o2/0/0']);
  });

  test('reserve is a preference between plans, not a different cost', () => {
    const sources = [land(1, 'G'), land(2, 'G'), land(3, 'W')];
    expect(tapped(['G'], { sources, reserve: ['G', 'W'] })).toEqual(['o1/0/0']);
  });

  test('reserve outranks the land, creature and artifact preference', () => {
    const mountain = land(1, 'R');
    const elves = source(2, [['G']], { tier: 'creature' });
    expect(tapped(['1'], { sources: [mountain, elves] })).toEqual(['o1/0/0']);
    expect(tapped(['1'], { sources: [mountain, elves], reserve: ['R'] })).toEqual(['o2/0/0']);
  });

  test('reserve does not push the payment onto a sacrifice source', () => {
    const treasure = source(1, ANY, { tier: 'sacrifice' });
    expect(tapped(['1'], { sources: [treasure, land(2, 'G')], reserve: ['G'] })).toEqual([
      'o2/0/0',
    ]);
  });

  test('an empty reserve changes nothing', () => {
    const sources = [land(1, 'G'), land(2, 'U')];
    expect(planPayment(request(['1'], { sources, reserve: [] }))).toEqual(
      planPayment(request(['1'], { sources })),
    );
  });
});

describe('planPayment: determinism and edge cases', () => {
  test('the same request gives the same plan, regardless of source order', () => {
    const sources = [
      land(5, 'G'),
      land(2, 'G'),
      source(4, ANY, { tier: 'sacrifice' }),
      source(3, [['W'], ['U']]),
      source(1, [['C', 'C']], { tier: 'artifact' }),
    ];
    const req = request(['G', 'W', '1'], { sources });
    const a = planPayment(req);
    expect(planPayment(req)).toEqual(a);
    expect(planPayment({ ...req, sources: [...sources].reverse() })).toEqual(a);
    expect(
      planPayment({
        ...req,
        sources: [sources[2], sources[0], sources[4], sources[1], sources[3]] as typeof sources,
      }),
    ).toEqual(a);
  });

  test('numeric object id order, not string order (o2 before o10)', () => {
    expect(tapped(['G'], { sources: [land(10, 'G'), land(2, 'G')] })).toEqual(['o2/0/0']);
  });

  test('the request is not mutated', () => {
    const req = request(['1', 'W/P'], {
      pool: [mana('W')],
      sources: [land(1, 'G')],
      lifeAvailable: 2,
    });
    const snapshot = JSON.stringify(req);
    planPayment(req);
    expect(JSON.stringify(req)).toBe(snapshot);
  });

  test('the plan is plain JSON data', () => {
    const plan = planPayment(
      request(['1'], { sources: [source(1, [['C', 'C']], { tier: 'artifact' })] }),
    );
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });

  test('impossible costs return null', () => {
    expect(planPayment(request(['W']))).toBeNull();
    expect(planPayment(request(['1', '1', '1'], { sources: [land(1, 'G')] }))).toBeNull();
    expect(
      planPayment(request(['S', 'S'], { sources: [source(1, [['G']], { snow: true })] })),
    ).toBeNull();
  });

  test('a large realistic payment is found quickly (40 sources, 10 mana, hybrid and Phyrexian)', () => {
    const colors: ManaColor[] = ['W', 'U', 'B', 'R', 'G'];
    const sources = Array.from({ length: 40 }, (_, i) =>
      i % 7 === 0
        ? source(i + 1, [['C', 'C']], { tier: 'artifact' })
        : i % 5 === 0
          ? source(i + 1, [['W'], ['U'], ['B'], ['R'], ['G']])
          : land(i + 1, colors[i % 5] as ManaColor),
    );
    const started = performance.now();
    const plan = planPayment(
      request(['4', 'W', 'U', 'B', 'R/G', 'W/U', '2/B', 'G/P'], {
        sources,
        lifeAvailable: 4,
        reserve: ['W', 'U'],
      }),
    );
    expect(performance.now() - started).toBeLessThan(2000);
    expect(plan).not.toBeNull();
  });

  test('an impossible large payment fails quickly too', () => {
    const sources = Array.from({ length: 40 }, (_, i) => land(i + 1, i % 2 === 0 ? 'W' : 'U'));
    const started = performance.now();
    expect(
      planPayment(request(['W', 'W', 'U', 'U', 'B', 'W/U', '2/R', '3'], { sources })),
    ).toBeNull();
    expect(performance.now() - started).toBeLessThan(2000);
  });

  test('every plan reports the pool indices sorted ascending without duplicates', () => {
    const plan = planPayment(
      request(['R', 'R', 'R'], { pool: [mana('R'), mana('G'), mana('R'), mana('R')] }),
    );
    expect(plan?.fromPool).toEqual([0, 2, 3]);
  });

  test('ManaObject leftover type is assignable to the pool', () => {
    const plan = planPayment(
      request(['1'], { sources: [source(1, [['C', 'C']], { tier: 'artifact' })] }),
    );
    const asPool: ManaObject[] = [...(plan?.leftover ?? [])];
    expect(asPool).toHaveLength(1);
  });
});

// D-183: the mana a plan spends on the cost itself, with the card types of the permanent that made each (CR 601.2h): "the amount of mana spent to cast it".
describe('planPayment: the mana spent on the cost (spentTypes)', () => {
  const typed = (n: number, produces: ManaColor[][], types: string[]) =>
    source(n, produces, { types });

  test('one entry for each mana spent, with the card types of its source', () => {
    const plan = planPayment(
      request(['2', 'G'], {
        sources: [typed(1, [['G']], ['land']), typed(2, [['C', 'C']], ['artifact'])],
      }),
    );
    expect(plan?.spentTypes.map((t) => t.join('+')).sort()).toEqual([
      'artifact',
      'artifact',
      'land',
    ]);
  });

  test('mana a source made and the cost did not use is left over, not spent', () => {
    const plan = planPayment(request(['1'], { sources: [typed(1, [['C', 'C']], ['artifact'])] }));
    expect(plan?.spentTypes).toEqual([['artifact']]);
    expect(plan?.leftover).toEqual([
      { color: 'C', snow: false, source: oid(1), restriction: null, sourceTypes: ['artifact'] },
    ]);
  });

  test('pool mana spends with the types its source had when it was made, and a mana of no known source with none', () => {
    const made: ManaObject = { ...mana('R', { src: 5 }), sourceTypes: ['artifact', 'creature'] };
    const plan = planPayment(request(['R', 'G'], { pool: [made, mana('G')] }));
    expect(plan?.spentTypes).toEqual([['artifact', 'creature'], []]);
  });

  test('Phyrexian mana paid with life is not mana spent', () => {
    const plan = planPayment(
      request(['W/P', 'U'], {
        sources: [typed(1, [['U']], ['land'])],
        lifeAvailable: 20,
      }),
    );
    expect(plan?.lifePaid).toBe(2);
    expect(plan?.spentTypes).toEqual([['land']]);
  });

  test('the mana that pays the activation cost of a costed mana ability is not spent on the cost (CR 605.3a)', () => {
    // "{1}, {T}: Add {U}{B}" (a Signet): a Forest pays its {1}, and the Signet's two mana pay {U}{B}. Two mana are spent on the cost, not three.
    const signet = source(2, [['U', 'B']], {
      tier: 'artifact',
      types: ['artifact'],
      cost: parseManaCost(['1']),
    });
    const plan = planPayment(
      request(['U', 'B'], { sources: [typed(1, [['G']], ['land']), signet] }),
    );
    expect(plan?.taps.map((t) => t.object).sort()).toEqual(['o1', 'o2']);
    expect(plan?.spentTypes).toEqual([['artifact'], ['artifact']]);
  });

  test('a costed ability paid from the pool: only the pool mana that is left pays the cost', () => {
    const signet = source(2, [['U', 'B']], {
      tier: 'artifact',
      types: ['artifact'],
      cost: parseManaCost(['1']),
    });
    const pool = [{ ...mana('G'), sourceTypes: ['land'] }];
    const plan = planPayment(request(['U', 'B'], { pool, sources: [signet] }));
    expect(plan?.fromPool).toEqual([0]);
    expect(plan?.spentTypes).toEqual([['artifact'], ['artifact']]);
  });
});
