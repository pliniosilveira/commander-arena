// Validation of the nodes of D-135 that move cards and follow up on what a player did: `may`, `reflexive`, the conditions `didPrevious`
// and `objectMatches`, `mayCast`, `payLife` with an amount, "Nth from the top", `anyNumber` and `greatest` of a sacrifice choice,
// `leavesBattlefield.to` as a list, `entersBattlefield.tapped`, `costReducedIf`, `notSupertypes` and `opponentControlsAtLeast`.
// A node is well-formed (validateCardStructure) and executable (validateCard) only as the engine runs it.
import { describe, expect, test } from 'vitest';
import {
  type Ability,
  type CardDefinition,
  type Effect,
  isFeatureSupported,
  type TargetSpec,
  validateCard,
  validateCardStructure,
} from '../src/index';
import { singleFaceCard } from './dsl-helpers';

const YOU = { kind: 'you' } as const;
const T1 = { kind: 'target', id: 't1' } as const;
const THIS = { kind: 'this' } as const;
const GRAVE_CREATURE: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'graveyard', types: ['creature'], controller: 'you' } },
};
const discard: Effect = { kind: 'discard', player: YOU, count: 1 };
const draw: Effect = { kind: 'draw', player: YOU, count: 1 };

function sorcery(effect: Effect, targets?: readonly TargetSpec[]): CardDefinition {
  return singleFaceCard({
    name: 'SYNTHETIC Validation Probe',
    manaCost: ['1'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: '',
    spell: { ...(targets === undefined ? {} : { targets }), effect },
  });
}
function creature(abilities: Ability[]): CardDefinition {
  return singleFaceCard({
    name: 'SYNTHETIC Validation Creature',
    manaCost: ['1'],
    types: ['creature'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: '',
    abilities,
  });
}
const land = (abilities: Ability[]): CardDefinition =>
  singleFaceCard({
    name: 'SYNTHETIC Validation Land',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: [],
    oracleText: '',
    abilities,
  });
const messages = (card: CardDefinition): string[] =>
  validateCard(card).map((i) => `${i.path}: ${i.message}`);
const structural = (card: CardDefinition): string[] =>
  validateCardStructure(card).map((i) => `${i.path}: ${i.message}`);
const spell = (e: Effect, targets?: readonly TargetSpec[]) => messages(sorcery(e, targets));
const seq = (...effects: Effect[]): Effect => ({ kind: 'sequence', effects });
const mayDiscardThen = (then: Effect): Effect =>
  seq(
    { kind: 'may', effect: discard },
    { kind: 'conditional', condition: { kind: 'didPrevious' }, effect: then },
  );

describe('"you may [do something]" and "if you do"', () => {
  test('a may effect of discard, sacrifice, exile, a move, draw or mill is runnable', () => {
    const kinds: Effect[] = [
      discard,
      draw,
      { kind: 'mill', player: YOU, count: 2 },
      { kind: 'sacrifice', objects: { kind: 'choose', filter: { types: ['creature'] } } },
      { kind: 'moveToZone', objects: T1, to: 'hand' },
      { kind: 'exile', objects: T1 },
    ];
    for (const effect of kinds) {
      expect(spell({ kind: 'may', effect }, [GRAVE_CREATURE]), effect.kind).toEqual([]);
    }
  });

  test('"you may" of another effect is refused: "if you do" could not tell whether it was done', () => {
    expect(spell({ kind: 'may', effect: { kind: 'gainLife', player: YOU, amount: 1 } })).toEqual([
      expect.stringContaining('could not tell whether gainLife was done'),
    ]);
  });

  test('didPrevious needs a may effect before it in the same sequence', () => {
    const bare: Effect = { kind: 'conditional', condition: { kind: 'didPrevious' }, effect: draw };
    expect(spell(bare)).toEqual([expect.stringContaining('needs a "may" effect before it')]);
    // D-139: after an effect whose doing the engine can tell ("exile it. If you do, ..."), "if you do" can be read without a "may".
    expect(spell(seq(draw, bare))).toEqual([]);
    expect(spell(seq({ kind: 'gainLife', player: YOU, amount: 1 }, bare))).toEqual([
      expect.stringContaining('needs a "may" effect'),
    ]);
    expect(spell(mayDiscardThen(draw))).toEqual([]);
  });

  test('didPrevious is read inside and, or and not', () => {
    const combined = seq(
      { kind: 'may', effect: discard },
      {
        kind: 'conditional',
        condition: { kind: 'not', term: { kind: 'didPrevious' } },
        effect: draw,
      },
    );
    expect(spell(combined)).toEqual([]);
  });

  test('didPrevious is refused where nothing resolves: an intervening "if", "activate only if"', () => {
    const intervening = creature([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        interveningIf: { kind: 'didPrevious' },
        effect: draw,
      },
    ]);
    expect(messages(intervening)).toEqual([
      expect.stringContaining('didPrevious is only valid in a conditional effect'),
    ]);
  });
});

describe('reflexive triggers (CR 603.12)', () => {
  const reflexive = (effect: Effect, targets: TargetSpec[] = [GRAVE_CREATURE]): Effect => ({
    kind: 'reflexive',
    targets,
    effect,
  });
  const returned: Effect = { kind: 'moveToZone', objects: T1, to: 'hand' };

  test('a reflexive trigger after a may effect, with its own targets, is runnable', () => {
    expect(spell(seq({ kind: 'may', effect: discard }, reflexive(returned)))).toEqual([]);
  });

  test('it needs a may effect before it', () => {
    expect(spell(reflexive(returned))).toEqual([
      expect.stringContaining('needs a "may" effect before it'),
    ]);
  });

  test('it ends its sequence', () => {
    expect(spell(seq({ kind: 'may', effect: discard }, reflexive(returned), draw))).toEqual([
      expect.stringContaining('the last effect of its sequence'),
    ]);
  });

  test('its effect reads its own targets, not those of the ability that created it', () => {
    const outer: TargetSpec = { id: 't9', what: { kind: 'player', filter: 'any' } };
    const bad = seq(
      { kind: 'may', effect: discard },
      reflexive({ kind: 'dealDamage', amount: 1, to: { kind: 'target', id: 't9' } }),
    );
    expect(structural(sorcery(bad, [outer]))).toEqual([
      'faces[0].spell.effect.effects[1].effect.to: target "t9" is not declared on this ability or spell mode',
    ]);
  });
});

describe('a condition on an object a reference names', () => {
  const matches = (of: unknown, filter: unknown): Effect =>
    ({
      kind: 'conditional',
      condition: { kind: 'objectMatches', of, filter },
      effect: draw,
    }) as Effect;

  test('a target or the moved object against a filter is runnable', () => {
    expect(
      spell(
        seq({ kind: 'moveToZone', objects: T1, to: 'hand' }, matches(T1, { subtypes: ['Zombie'] })),
        [GRAVE_CREATURE],
      ),
    ).toEqual([]);
    expect(
      spell(
        seq(
          { kind: 'moveToZone', objects: T1, to: 'battlefield' },
          matches({ kind: 'moved' }, { subtypes: ['Angel'] }),
        ),
        [GRAVE_CREATURE],
      ),
    ).toEqual([]);
  });

  test('an undeclared target is refused, and so is a reference of another kind', () => {
    expect(structural(sorcery(matches(T1, { subtypes: ['Zombie'] })))).toEqual([
      'faces[0].spell.effect.condition.of: target "t1" is not declared on this ability or spell mode',
    ]);
    expect(spell(matches({ kind: 'this' }, { subtypes: ['Zombie'] }))).toEqual([
      expect.stringContaining('reads a target, the object that was moved'),
    ]);
  });

  test('"moved" needs a move before it', () => {
    expect(spell(matches({ kind: 'moved' }, { subtypes: ['Zombie'] }))).toEqual([
      expect.stringContaining("'moved' needs an exile, destroy or moveToZone effect"),
    ]);
  });

  test('the filter describes the object: no zone, controller or owner', () => {
    for (const filter of [{ zone: 'hand' }, { controller: 'you' }, { stackKind: 'spell' }]) {
      expect(spell(matches(T1, filter), [GRAVE_CREATURE]), JSON.stringify(filter)).toEqual([
        expect.stringContaining('objectMatches describes the object'),
      ]);
    }
  });

  test('it is refused in an intervening "if"', () => {
    const card = creature([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        interveningIf: { kind: 'objectMatches', of: T1, filter: {} },
        effect: draw,
      },
    ]);
    expect(messages(card)).toEqual([
      expect.stringContaining('objectMatches is only valid in a conditional effect'),
    ]);
  });
});

describe('the permission to cast a card from the graveyard this turn', () => {
  test('a target in a graveyard until end of turn is runnable', () => {
    expect(
      spell({ kind: 'mayCast', objects: T1, duration: 'untilEndOfTurn' }, [GRAVE_CREATURE]),
    ).toEqual([]);
  });

  test('a card that is not in a graveyard cannot be given the permission', () => {
    const hand: TargetSpec = {
      id: 't1',
      what: { kind: 'object', filter: { zone: 'exile', types: ['creature'] } },
    };
    expect(spell({ kind: 'mayCast', objects: T1, duration: 'untilEndOfTurn' }, [hand])).toEqual([
      expect.stringContaining('a cast permission is for a card in a graveyard'),
    ]);
  });

  test('it names a target, and lasts until end of turn', () => {
    expect(
      structural(
        sorcery({
          kind: 'mayCast',
          objects: { kind: 'each', filter: {} },
          duration: 'untilEndOfTurn',
        }),
      ),
    ).toEqual([expect.stringContaining('names a target card')]);
    expect(
      structural(
        sorcery({ kind: 'mayCast', objects: T1, duration: 'permanent' } as never, [GRAVE_CREATURE]),
      ),
    ).toEqual([expect.stringContaining('lasts until end of turn')]);
  });
});

describe('life paid by an amount', () => {
  const well = (cost: Ability extends never ? never : unknown[]) =>
    land([{ kind: 'activated', cost, effect: draw } as Ability]);
  const tap = { kind: 'tap' };

  test('an activated ability may pay life equal to a count or to the commander colors', () => {
    expect(messages(well([tap, { kind: 'payLife', amount: { kind: 'commanderColors' } }]))).toEqual(
      [],
    );
    expect(
      messages(
        well([
          tap,
          { kind: 'payLife', amount: { kind: 'countOf', filter: { types: ['creature'] } } },
        ]),
      ),
    ).toEqual([]);
  });

  test('the amount reads the game now: not an X, a target or a power', () => {
    expect(structural(well([tap, { kind: 'payLife', amount: { kind: 'x' } }]))).toEqual([
      expect.stringContaining('a life payment reads what the game says now'),
    ]);
    expect(
      structural(well([tap, { kind: 'payLife', amount: { kind: 'powerOf', of: THIS } }])),
    ).toEqual([expect.stringContaining('not powerOf')]);
  });

  test('a mana ability, an additional cost and a keyword cost pay a number', () => {
    const mana: Ability = {
      kind: 'mana',
      cost: [tap, { kind: 'payLife', amount: { kind: 'commanderColors' } }] as never,
      production: { kind: 'fixed', mana: ['B'] },
    };
    expect(messages(land([mana]))).toEqual([
      expect.stringContaining('a mana ability pays a fixed amount of life'),
    ]);
    const kicker: Ability = {
      kind: 'keyword',
      keyword: { kind: 'kicker', cost: [{ kind: 'payLife', amount: { kind: 'commanderColors' } }] },
    };
    expect(messages(creature([kicker]))).toEqual([
      expect.stringContaining('only as the cost of an activated ability'),
    ]);
    const additional = singleFaceCard({
      name: 'SYNTHETIC Validation Additional',
      manaCost: ['1'],
      types: ['sorcery'],
      colors: [],
      colorIdentity: [],
      oracleText: '',
      additionalCosts: [{ kind: 'payLife', amount: { kind: 'commanderColors' } }],
      spell: { effect: draw },
    });
    expect(messages(additional)).toEqual([
      expect.stringContaining(
        'life paid by an amount is run only as the cost of an activated ability',
      ),
    ]);
  });
});

describe('a cost reduced when a condition holds', () => {
  const ability = (
    costReducedIf: unknown,
    cost: unknown[] = [{ kind: 'mana', symbols: ['4', 'B'] }],
  ) =>
    creature([
      { kind: 'activated', cost, functionsIn: 'graveyard', effect: draw, costReducedIf } as Ability,
    ]);
  const nonbasic = {
    kind: 'opponentControlsAtLeast',
    filter: { types: ['land'], notSupertypes: ['basic'] },
    count: 4,
  };

  test('a reduction of generic mana with a condition on the opponents is runnable', () => {
    expect(messages(ability({ generic: 4, condition: nonbasic }))).toEqual([]);
  });

  test('the reduction is a positive whole number of a mana cost', () => {
    expect(structural(ability({ generic: 0, condition: nonbasic }))).toEqual([
      expect.stringContaining('positive whole number'),
    ]);
    expect(
      structural(ability({ generic: 1, condition: nonbasic }, [{ kind: 'payLife', amount: 1 }])),
    ).toEqual([expect.stringContaining('only a mana cost can be reduced')]);
  });

  test('"an opponent controls" names the opponent: the filter sets no controller, and counts at least one', () => {
    expect(
      structural(
        ability({ generic: 1, condition: { ...nonbasic, filter: { controller: 'you' } } }),
      ),
    ).toEqual([expect.stringContaining('the filter sets no controller')]);
    expect(structural(ability({ generic: 1, condition: { ...nonbasic, count: 0 } }))).toEqual([
      expect.stringContaining('count must be a positive integer'),
    ]);
  });

  test('"nonbasic" names supertypes the engine knows', () => {
    expect(
      structural(
        ability({
          generic: 1,
          condition: { ...nonbasic, filter: { notSupertypes: ['elite'] } },
        }),
      ),
    ).toEqual([expect.stringContaining('unknown supertype')]);
  });
});

describe('triggers: how a permanent entered, and where it went', () => {
  const entering = (tapped: unknown) =>
    creature([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS, tapped },
        effect: draw,
      } as Ability,
    ]);
  const leaving = (to: unknown) =>
    creature([
      {
        kind: 'triggered',
        trigger: { kind: 'leavesBattlefield', what: THIS, to },
        effect: draw,
      } as Ability,
    ]);

  test('enters untapped and enters tapped are runnable, anything but a boolean is not', () => {
    expect(messages(entering(false))).toEqual([]);
    expect(messages(entering(true))).toEqual([]);
    expect(structural(entering('no'))).toEqual([
      expect.stringContaining('tapped must be a boolean'),
    ]);
  });

  test('leaves the battlefield for one zone or a list of two or more', () => {
    expect(messages(leaving('exile'))).toEqual([]);
    expect(messages(leaving(['graveyard', 'exile']))).toEqual([]);
    expect(structural(leaving(['exile']))).toEqual([
      expect.stringContaining('a zone, or a list of at least two zones'),
    ]);
    expect(structural(leaving(['exile', 'exile']))).toEqual([
      expect.stringContaining('a zone is listed once'),
    ]);
    expect(structural(leaving(['graveyard', 'battlefield']))).toEqual([
      expect.stringContaining('cannot leave the battlefield for "battlefield"'),
    ]);
  });
});

describe('library positions and sacrifice choices', () => {
  const move = (position: unknown, to: 'library' | 'hand' = 'library'): Effect =>
    ({ kind: 'moveToZone', objects: THIS_CARD, to, position }) as Effect;
  const THIS_CARD = { kind: 'thisCard' } as const;
  const dies = (effect: Effect) =>
    creature([{ kind: 'triggered', trigger: { kind: 'dies', what: THIS }, effect }]);

  test('top, bottom, and a number of 2 or more from the top', () => {
    for (const position of ['top', 'bottom', 2, 3, 10]) {
      expect(messages(dies(move(position))), String(position)).toEqual([]);
    }
  });

  test('1, 0, a fraction and a negative number are refused (one from the top is "top"); so is another zone', () => {
    for (const position of [1, 0, 2.5, -3, 'middle']) {
      expect(structural(dies(move(position))), String(position)).toEqual([
        expect.stringContaining('position is only valid'),
      ]);
    }
    expect(structural(dies(move(3, 'hand')))).toEqual([
      expect.stringContaining('position is only valid'),
    ]);
  });

  const sacrifice = (selector: unknown): Effect =>
    ({ kind: 'sacrifice', objects: selector }) as Effect;
  test('any number of other permanents, and the greatest power among them', () => {
    expect(spell(sacrifice({ kind: 'choose', filter: { other: true }, anyNumber: true }))).toEqual(
      [],
    );
    expect(
      spell(sacrifice({ kind: 'choose', filter: { types: ['creature'] }, greatest: 'power' })),
    ).toEqual([]);
  });

  test('any number has no count; the stat is power, toughness or mana value', () => {
    expect(
      structural(sorcery(sacrifice({ kind: 'choose', filter: {}, anyNumber: true, count: 2 }))),
    ).toEqual([expect.stringContaining('any number of permanents has no count')]);
    expect(
      structural(sorcery(sacrifice({ kind: 'choose', filter: {}, greatest: 'loyalty' }))),
    ).toEqual([expect.stringContaining('unknown stat')]);
  });

  test('they belong to a sacrifice, not to a move', () => {
    const moved: Effect = {
      kind: 'moveToZone',
      objects: { kind: 'choose', filter: { controller: 'you' }, anyNumber: true },
      to: 'hand',
    };
    expect(structural(sorcery(moved))).toEqual([
      expect.stringContaining('anyNumber and greatest belong to a sacrifice choice'),
    ]);
  });
});

describe('the features list them', () => {
  test('each new node is supported', () => {
    for (const ref of [
      'effect:may',
      'effect:reflexive',
      'effect:mayCast',
      'condition:didPrevious',
      'condition:objectMatches',
      'condition:opponentControlsAtLeast',
      'selector:notSupertypes',
      'selector:anyNumber',
      'selector:greatest',
      'trigger:entersUntapped',
      'trigger:leavesToAnyOf',
      'ability:costReducedIf',
    ] as const) {
      expect(isFeatureSupported(ref), ref).toBe(true);
    }
  });
});
