// "This land enters tapped unless you control two or more basic lands." and its relatives.
// Pins: CR 614.1c and 614.12 (a permanent's own "enters tapped" replacement is applied as it enters,
// looking at the game as it would be with the permanent not yet on the battlefield, so it never
// counts itself), CR 205.4a (basic is a supertype: a nonbasic land is not a basic land),
// CR 109.4 (you control the permanents under your control, never an opponent's), CR 111.1 (a
// token entering is a permanent entering).
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-mana.ts) or defined in this file, or the
// real fixtures named.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import type { Ability, Condition } from '../src/index';
import { validateAbility, validateCard, validateCardStructure } from '../src/index';
import { evaluateCondition } from '../src/rules/conditions';
import { scenario } from '../src/testing/index';

const CHECK = 'SYNTHETIC Basic Check Land';
const OTHERS = 'SYNTHETIC Other Lands Land';
const CROWD = 'SYNTHETIC Crowd Land';

describe('"unless you control two or more basic lands" (CR 614.12)', () => {
  const enters = (...battlefield: string[]) => {
    const b = scenario().seat(0).hand(CHECK);
    if (battlefield.length > 0) b.battlefield(...battlefield);
    const g = b.seat(1).build();
    g.act(0).playLand(CHECK);
    return g;
  };

  test('no basic lands: it enters tapped', () => {
    enters().expect.tapped(CHECK, true);
  });

  test('one basic land: it enters tapped', () => {
    enters('Forest').expect.tapped(CHECK, true);
  });

  test('two basic lands: it enters untapped', () => {
    enters('Forest', 'Island').expect.tapped(CHECK, false);
  });

  test('three basic lands: untapped (two or more)', () => {
    enters('Forest', 'Island', 'Swamp').expect.tapped(CHECK, false);
  });

  test('nonbasic lands do not count (CR 205.4a)', () => {
    enters('Command Tower', 'SYNTHETIC Dual Land').expect.tapped(CHECK, true);
  });

  test('one basic and one nonbasic are not two basics', () => {
    enters('Forest', 'Command Tower').expect.tapped(CHECK, true);
  });

  test('a creature is not a land: basic lands only', () => {
    enters('Forest', 'Grizzly Bears').expect.tapped(CHECK, true);
  });

  test("the opponent's basic lands do not count (you control)", () => {
    const g = scenario()
      .seat(0)
      .hand(CHECK)
      .seat(1)
      .battlefield('Forest', 'Island', 'Swamp')
      .build();
    g.act(0).playLand(CHECK);
    g.expect.tapped(CHECK, true);
  });

  test('a tapped basic land still counts: control, not untapped', () => {
    const g = scenario()
      .seat(0)
      .hand(CHECK)
      .battlefield('Forest', { tapped: true })
      .battlefield('Island', { tapped: true })
      .build();
    g.act(0).playLand(CHECK);
    g.expect.tapped(CHECK, false);
  });

  test('a land that enters tapped makes no mana until it untaps, one that enters untapped does', () => {
    const tapped = enters();
    expect(tapped.act(0).try.tapForMana(CHECK, { color: 'W' }).ok).toBe(false);
    const untapped = enters('Forest', 'Island');
    untapped.act(0).tapForMana(CHECK, { color: 'U' });
    untapped.expect.pool(0, 'U');
  });
});

describe('"unless you control two or more other lands": the entering land does not count itself', () => {
  test('one other land: tapped', () => {
    const g = scenario().seat(0).hand(OTHERS).battlefield('Forest').build();
    g.act(0).playLand(OTHERS);
    g.expect.tapped(OTHERS, true);
  });

  test('two other lands of any kind: untapped', () => {
    const g = scenario().seat(0).hand(OTHERS).battlefield('Forest', 'Command Tower').build();
    g.act(0).playLand(OTHERS);
    g.expect.tapped(OTHERS, false);
  });

  test('a copy of itself already in play is another land', () => {
    const g = scenario().seat(0).hand(OTHERS).battlefield(OTHERS, 'Forest').build();
    g.act(0).playLand(OTHERS);
    // The copy already in play and the Forest are two other lands; the one entering is not counted.
    g.expect.tapped({ name: OTHERS, nth: 1 }, false);
  });
});

describe('"unless you have two or more opponents"', () => {
  test('in a two-player game it always enters tapped', () => {
    const g = scenario().seat(0).hand(CROWD).battlefield('Forest', 'Forest').seat(1).build();
    g.act(0).playLand(CROWD);
    g.expect.tapped(CROWD, true);
  });
});

describe('the combinators and and or and not', () => {
  const landWith = (name: string, unless: Condition) =>
    singleFace({
      name,
      manaCost: null,
      types: ['land'],
      colors: [],
      colorIdentity: ['G'],
      oracleText: 'SYNTHETIC enters tapped unless a combined condition holds. {T}: Add {G}.',
      abilities: [
        { kind: 'replacement', replacement: { kind: 'entersTapped', unless } },
        { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['G'] } },
      ],
    });
  const BASIC: Condition = {
    kind: 'controlsAtLeast',
    filter: { types: ['land'], supertypes: ['basic'] },
    count: 1,
  };
  const OPPONENT: Condition = { kind: 'opponentsAtLeast', count: 1 };
  const CROWDED: Condition = { kind: 'opponentsAtLeast', count: 2 };

  const play = (unless: Condition, ...battlefield: string[]) => {
    const card = landWith('SYNTHETIC Combined Land', unless);
    const b = scenario().define(card).seat(0).hand('SYNTHETIC Combined Land');
    if (battlefield.length > 0) b.battlefield(...battlefield);
    const g = b.seat(1).build();
    g.act(0).playLand('SYNTHETIC Combined Land');
    return g.object('SYNTHETIC Combined Land').tapped;
  };

  test('and: both terms must hold', () => {
    const both: Condition = { kind: 'and', terms: [BASIC, OPPONENT] };
    expect(play(both, 'Forest')).toBe(false);
    expect(play(both)).toBe(true); // no basic land
    const crowd: Condition = { kind: 'and', terms: [BASIC, CROWDED] };
    expect(play(crowd, 'Forest')).toBe(true); // one opponent, not two
  });

  test('or: one term is enough', () => {
    const either: Condition = { kind: 'or', terms: [BASIC, CROWDED] };
    expect(play(either, 'Forest')).toBe(false);
    expect(play(either)).toBe(true);
  });

  test('not: the opposite', () => {
    const noBasic: Condition = { kind: 'not', term: BASIC };
    expect(play(noBasic)).toBe(false); // unless you control no basic land
    expect(play(noBasic, 'Forest')).toBe(true);
  });

  test('evaluateCondition reads the controller and the count directly', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Forest', 'Island')
      .seat(1)
      .battlefield('Swamp')
      .build();
    const mine = { controller: 0, source: null } as const;
    const theirs = { controller: 1, source: null } as const;
    const two: Condition = { ...BASIC, count: 2 };
    expect(evaluateCondition(g.state, two, mine)).toBe(true);
    expect(evaluateCondition(g.state, two, theirs)).toBe(false);
    expect(evaluateCondition(g.state, OPPONENT, mine)).toBe(true);
    expect(evaluateCondition(g.state, CROWDED, mine)).toBe(false);
  });
});

describe('a token that enters tapped unless a condition holds (CR 111.1)', () => {
  const maker = singleFace({
    name: 'SYNTHETIC Golem Maker',
    manaCost: null,
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'SYNTHETIC Create a 1/1 Golem; it enters tapped unless you control two or more artifacts.',
    spell: {
      effect: {
        kind: 'createToken',
        count: 1,
        token: {
          kind: 'custom',
          definition: {
            name: 'Golem',
            manaCost: null,
            supertypes: [],
            types: ['artifact', 'creature'],
            subtypes: ['Golem'],
            colors: [],
            power: 1,
            toughness: 1,
            loyalty: null,
            defense: null,
            oracleText: '',
            abilities: [
              {
                kind: 'replacement',
                replacement: {
                  kind: 'entersTapped',
                  unless: {
                    kind: 'controlsAtLeast',
                    filter: { types: ['artifact'] },
                    count: 2,
                  },
                },
              },
            ],
          },
        },
      },
    },
  });

  test('with fewer than two artifacts it enters tapped, with two it enters untapped', () => {
    const few = scenario()
      .define(maker)
      .seat(0)
      .hand('SYNTHETIC Golem Maker')
      .battlefield('Sol Ring')
      .build();
    few.act(0).cast('SYNTHETIC Golem Maker');
    few.passAll();
    few.expect.tapped('Golem', true);
    const many = scenario()
      .define(maker)
      .seat(0)
      .hand('SYNTHETIC Golem Maker')
      .battlefield('Sol Ring', 'SYNTHETIC Signet')
      .build();
    many.act(0).cast('SYNTHETIC Golem Maker');
    many.passAll();
    many.expect.tapped('Golem', false);
  });
});

describe('a land put onto the battlefield by a spell is checked the same way', () => {
  test('Land Recall returns the land tapped or untapped by the same rule', () => {
    const tapped = scenario()
      .seat(0)
      .hand('SYNTHETIC Land Recall')
      .pool('C')
      .graveyard(CHECK)
      .battlefield('Forest')
      .build();
    tapped.act(0).cast('SYNTHETIC Land Recall', { targets: [CHECK], pay: true });
    tapped.passAll();
    tapped.expect.tapped(CHECK, true);
    const untapped = scenario()
      .seat(0)
      .hand('SYNTHETIC Land Recall')
      .pool('C')
      .graveyard(CHECK)
      .battlefield('Forest', 'Island')
      .build();
    untapped.act(0).cast('SYNTHETIC Land Recall', { targets: [CHECK], pay: true });
    untapped.passAll();
    untapped.expect.tapped(CHECK, false);
  });
});

describe('validation of Condition', () => {
  const replacement = (unless: unknown): Ability =>
    ({ kind: 'replacement', replacement: { kind: 'entersTapped', unless } }) as Ability;
  const issues = (unless: unknown) => validateAbility(replacement(unless)).map((i) => i.path);

  test('the fixtures that use it are valid and supported', () => {
    for (const name of [CHECK, OTHERS, CROWD]) {
      const def = scenario()
        .seat(0)
        .battlefield(name)
        .build()
        .state.definitions.find((d) => d.name === name);
      expect(def && validateCard(def), name).toEqual([]);
    }
  });

  test('valid shapes', () => {
    expect(
      issues({ kind: 'controlsAtLeast', filter: { types: ['land'], other: true }, count: 2 }),
    ).toEqual([]);
    expect(issues({ kind: 'opponentsAtLeast', count: 2 })).toEqual([]);
    expect(issues({ kind: 'not', term: { kind: 'opponentsAtLeast', count: 1 } })).toEqual([]);
    expect(issues({ kind: 'and', terms: [{ kind: 'opponentsAtLeast', count: 1 }] })).toEqual([]);
  });

  test('bad counts, empty combinators, unknown kinds and filters that cannot be counted', () => {
    expect(issues({ kind: 'opponentsAtLeast', count: 0 })).toEqual([
      'ability.replacement.unless.count',
    ]);
    expect(issues({ kind: 'controlsAtLeast', filter: {}, count: 1.5 })).toEqual([
      'ability.replacement.unless.count',
    ]);
    expect(issues({ kind: 'and', terms: [] })).toEqual(['ability.replacement.unless.terms']);
    expect(issues({ kind: 'or' })).toEqual(['ability.replacement.unless.terms']);
    expect(issues({ kind: 'sometimes' })).toEqual(['ability.replacement.unless']);
    expect(
      issues({ kind: 'controlsAtLeast', filter: { controller: 'opponent' }, count: 1 }),
    ).toEqual(['ability.replacement.unless.filter.controller']);
    expect(issues({ kind: 'controlsAtLeast', filter: { zone: 'graveyard' }, count: 1 })).toEqual([
      'ability.replacement.unless.filter.zone',
    ]);
    expect(issues({ kind: 'not', term: { kind: 'opponentsAtLeast', count: -1 } })).toEqual([
      'ability.replacement.unless.term.count',
    ]);
  });

  test('a structurally valid card with a condition is a supported card', () => {
    const card = singleFace({
      name: 'SYNTHETIC Plain Check',
      manaCost: null,
      types: ['land'],
      colors: [],
      colorIdentity: [],
      oracleText: 'SYNTHETIC',
      abilities: [replacement({ kind: 'opponentsAtLeast', count: 1 })],
    });
    expect(validateCardStructure(card)).toEqual([]);
    expect(validateCard(card)).toEqual([]);
  });
});

// "This land enters tapped unless your opponents control eight or more lands." (D-236). The condition is an `amountIs` of a `countOf`
// whose filter names the opponents as the controllers: the lands of ALL the opponents together (CR 109.4, 102.2), read through
// `controllerOf` (CR 110.2, 613.1b), never the field of the object. The card here is written by hand in the test; it is not a
// fixture of the engine.
describe('"unless your opponents control N or more lands" (D-236, CR 614.12, 109.4)', () => {
  const STEPPE = 'SYNTHETIC Opponents Land';
  const steppe = singleFace({
    name: STEPPE,
    manaCost: null,
    types: ['land'],
    subtypes: ['Mountain', 'Plains'],
    colors: [],
    colorIdentity: ['R', 'W'],
    oracleText: 'SYNTHETIC',
    abilities: [
      {
        kind: 'replacement',
        replacement: {
          kind: 'entersTapped',
          unless: {
            kind: 'amountIs',
            amount: { kind: 'countOf', filter: { types: ['land'], controller: 'opponent' } },
            compare: { cmp: 'atLeast', value: 8 },
          },
        },
      },
    ],
  });

  const play = (opponentLands: number, extra: readonly string[] = []) => {
    const b = scenario().define(steppe).seat(0).hand(STEPPE).seat(1);
    if (opponentLands > 0) b.battlefield('Mountain', { count: opponentLands });
    if (extra.length > 0) b.battlefield(...extra);
    const g = b.build();
    g.act(0).playLand(STEPPE);
    return g;
  };

  test('the card is valid and supported', () => {
    expect(validateCard(steppe)).toEqual([]);
  });

  test.each([0, 1, 7])('%i lands on the other side: it enters tapped', (n) => {
    play(n).expect.tapped(STEPPE, true);
  });

  test.each([8, 9, 12])('%i lands on the other side: it enters untapped (eight or more)', (n) => {
    play(n).expect.tapped(STEPPE, false);
  });

  test('your own lands never count', () => {
    const g = scenario()
      .define(steppe)
      .seat(0)
      .hand(STEPPE)
      .battlefield('Mountain', { count: 8 })
      .seat(1)
      .battlefield('Mountain', { count: 7 })
      .build();
    g.act(0).playLand(STEPPE);
    g.expect.tapped(STEPPE, true);
  });

  test('only lands count, tapped or not: eight permanents of which seven are lands is not enough', () => {
    play(7, ['Grizzly Bears']).expect.tapped(STEPPE, true);
    const g = scenario()
      .define(steppe)
      .seat(0)
      .hand(STEPPE)
      .seat(1)
      .battlefield('Mountain', { count: 8, tapped: true })
      .build();
    g.act(0).playLand(STEPPE);
    g.expect.tapped(STEPPE, false);
  });

  test('a land of the opponent that you control does not count, and one of yours that the opponent controls does (CR 110.2)', () => {
    // Eight lands owned by seat 1 and controlled by seat 0: the opponents control none of them.
    const stolen = scenario()
      .define(steppe)
      .seat(0)
      .hand(STEPPE)
      .seat(1)
      .battlefield('Mountain', { count: 8, controller: 0 })
      .build();
    stolen.act(0).playLand(STEPPE);
    stolen.expect.tapped(STEPPE, true);
    // Eight lands owned by seat 0 and controlled by seat 1: the opponent controls all of them.
    const lent = scenario()
      .define(steppe)
      .seat(0)
      .hand(STEPPE)
      .battlefield('Mountain', { count: 8, controller: 1 })
      .seat(1)
      .build();
    lent.act(0).playLand(STEPPE);
    lent.expect.tapped(STEPPE, false);
  });

  test('the same land under the other player: the roles swap', () => {
    const g = scenario()
      .define(steppe)
      .seat(0)
      .battlefield('Mountain', { count: 8 })
      .seat(1)
      .hand(STEPPE)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).playLand(STEPPE);
    g.expect.tapped(STEPPE, false);
  });
});
