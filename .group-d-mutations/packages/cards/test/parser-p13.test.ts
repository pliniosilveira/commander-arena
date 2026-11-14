// Stage P13 (M6): the costs slice of the engine (D-095, D-101): the additional costs to cast a spell,
// the cost reductions, the free cast with a commander, the discard cost of Ward and of an activated
// ability, and the counted amounts ("for each creature you control", "equal to the number of lands you
// control"). Each line is read through the whole pipeline and compared with the engine AST written
// out here (the shapes `docs/MECHANICS.md` lists under "What the parser must produce"), and each
// near miss says where it stops. The lines are the real example lines of reports/template-replay.md
// (the owner's run) unless a note says SYNTHETIC; no real card is marked supported here. That the
// engine runs what is lowered is in convert-grammar-engine-p13.test.ts.
import type { Ability, AlternativeCost, Cost, Effect } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { dropped, type FaceType, read, readAll, spellEffect, THIS } from './parser-p5-helpers';

/** The additional costs of a face read completely. */
const additional = (text: string, type: FaceType = 'sorcery'): readonly Cost[] =>
  readAll(text, type).additionalCosts;
const free = (text: string, type: FaceType = 'instant'): readonly AlternativeCost[] =>
  readAll(text, type).alternativeCosts;

const reduction = (spells: unknown, amount: unknown): Ability =>
  ({ kind: 'static', static: { kind: 'costReduction', spells, amount } }) as Ability;

const countOf = (filter: unknown) => ({ kind: 'countOf', filter });
const YOU = { kind: 'you' } as const;

describe('static.additional-cost: "As an additional cost to cast ~, ..." (CR 118.8, 601.2b)', () => {
  test.each([
    [
      'As an additional cost to cast this spell, sacrifice a creature.',
      [{ kind: 'sacrifice', what: { types: ['creature'] } }],
    ],
    [
      'As an additional cost to cast ~, sacrifice a creature.',
      [{ kind: 'sacrifice', what: { types: ['creature'] } }],
    ],
    [
      'As an additional cost to cast this spell, sacrifice an artifact or creature.',
      [{ kind: 'sacrifice', what: { anyOf: [{ types: ['artifact'] }, { types: ['creature'] }] } }],
    ],
    [
      'As an additional cost to cast this spell, sacrifice a land.',
      [{ kind: 'sacrifice', what: { types: ['land'] } }],
    ],
    ['As an additional cost to cast this spell, discard a card.', [{ kind: 'discard', count: 1 }]],
    [
      'As an additional cost to cast this spell, discard two cards.',
      [{ kind: 'discard', count: 2 }],
    ],
    // SYNTHETIC: the life, the mana and the two costs of the engine's fixtures (no real line in the replay).
    ['As an additional cost to cast this spell, pay 3 life.', [{ kind: 'payLife', amount: 3 }]],
    ['As an additional cost to cast this spell, pay {2}.', [{ kind: 'mana', symbols: ['2'] }]],
    [
      'As an additional cost to cast this spell, sacrifice a creature and discard a card.',
      [
        { kind: 'sacrifice', what: { types: ['creature'] } },
        { kind: 'discard', count: 1 },
      ],
    ],
  ] as const)('%s', (text, costs) => {
    expect(additional(text)).toEqual(costs);
  });

  test('the rest of the text is the spell, unchanged, and the cost is no ability', () => {
    const parsed = readAll(
      'As an additional cost to cast this spell, sacrifice a creature.\nDestroy target creature.',
      'instant',
    );
    expect(parsed.abilities).toEqual([]);
    expect(parsed.additionalCosts).toEqual([{ kind: 'sacrifice', what: { types: ['creature'] } }]);
    expect(parsed.spell?.effect).toEqual({
      kind: 'destroy',
      objects: { kind: 'target', id: 't1' },
    });
  });

  test('a permanent has the cost too, whichever line comes first', () => {
    const parsed = readAll(
      'Flying\nAs an additional cost to cast this spell, discard a card.',
      'creature',
    );
    expect(parsed.additionalCosts).toEqual([{ kind: 'discard', count: 1 }]);
    expect(parsed.abilities).toEqual([{ kind: 'keyword', keyword: { kind: 'flying' } }]);
  });

  test('two lines are both costs, in text order (the engine refuses a second sacrifice itself)', () => {
    const parsed = readAll(
      'As an additional cost to cast this spell, sacrifice a creature.\nAs an additional cost to cast this spell, pay 2 life.',
      'sorcery',
    );
    expect(parsed.additionalCosts).toEqual([
      { kind: 'sacrifice', what: { types: ['creature'] } },
      { kind: 'payLife', amount: 2 },
    ]);
  });

  test.each([
    // The engine has no "another", no two of a kind and no choice of costs (and "pay Y life" is not X).
    [
      'As an additional cost to cast this spell, pay Y life.',
      { stoppedAt: 'Y life.', closestRule: 'cost.pay-life', reason: 'unrecognised' },
    ],
    [
      'As an additional cost to cast this spell, sacrifice another creature.',
      {
        stoppedAt: 'sacrifice another creature.',
        closestRule: 'cost.sacrifice',
        reason: 'notRunnable',
      },
    ],
    [
      'As an additional cost to cast this spell, sacrifice two creatures.',
      {
        stoppedAt: 'sacrifice two creatures.',
        closestRule: 'cost.sacrifice',
        reason: 'notRunnable',
      },
    ],
    [
      'As an additional cost to cast this spell, sacrifice a creature and sacrifice a land.',
      {
        stoppedAt: 'As an additional cost to cast ~, sacrifice a creature and sacrifice a land.',
        closestRule: 'static.additional-cost',
        reason: 'notRunnable',
      },
    ],
    [
      'As an additional cost to cast this spell, discard a creature card.',
      { stoppedAt: 'creature card.', closestRule: 'cost.discard', reason: 'unrecognised' },
    ],
    [
      'As an additional cost to cast this spell, you may sacrifice a creature.',
      {
        stoppedAt: 'you may sacrifice a creature.',
        closestRule: 'static.additional-cost',
        reason: 'unrecognised',
      },
    ],
    // Stage P38 (D-182): a choice of two ways of one cost each is read ("pay 5 life or pay {2}"); a way of several costs is not.
    [
      'As an additional cost to cast this spell, sacrifice a creature and discard a card or pay {2}.',
      { stoppedAt: '{2}.', closestRule: 'cost.pay-life', reason: 'unrecognised' },
    ],
    [
      'As an additional cost to cast this spell, exile a card from your graveyard.',
      {
        stoppedAt: 'exile a card from your graveyard.',
        closestRule: 'static.additional-cost',
        reason: 'unrecognised',
      },
    ],
  ] as const)('stays unread: %s', (text, expected) => {
    expect(dropped(text, 'sorcery')).toMatchObject(expected);
  });
});

describe('static.free-cast: "If you control a commander, you may cast ~ without paying its mana cost." (CR 118.9, 903.3d)', () => {
  test('with the condition: the alternative cost has the engine condition', () => {
    expect(
      free('If you control a commander, you may cast this spell without paying its mana cost.'),
    ).toEqual([{ kind: 'free', condition: { kind: 'controlCommander' } }]);
  });

  test('the same on a permanent spell, with its other lines', () => {
    const parsed = readAll(
      'If you control a commander, you may cast ~ without paying its mana cost.\nFlash',
      'creature',
    );
    expect(parsed.alternativeCosts).toEqual([
      { kind: 'free', condition: { kind: 'controlCommander' } },
    ]);
    expect(parsed.abilities).toEqual([{ kind: 'keyword', keyword: { kind: 'flash' } }]);
  });

  test('SYNTHETIC: with no condition it is always allowed', () => {
    expect(free('You may cast this spell without paying its mana cost.')).toEqual([
      { kind: 'free' },
    ]);
  });

  test('the spell text is read as usual beside it', () => {
    const parsed = readAll(
      'If you control a commander, you may cast this spell without paying its mana cost.\nCounter target spell.',
      'instant',
    );
    expect(parsed.alternativeCosts).toHaveLength(1);
    expect(parsed.spell?.effect).toEqual({
      kind: 'counter',
      objects: { kind: 'target', id: 't1' },
    });
  });

  test.each([
    [
      'If you control a creature, you may cast this spell without paying its mana cost.',
      'may cast ~ without paying its mana cost.',
    ],
    [
      'You may cast this spell without paying its mana cost if you control a commander.',
      'if you control a commander.',
    ],
  ])('stays unread: %s', (text, stoppedAt) => {
    expect(dropped(text, 'instant')).toMatchObject({ reason: 'unrecognised', stoppedAt });
  });
});

describe('static.self-cost-reduction: "~ costs {1} less to cast for each ..." (CR 118.7a, 113.6d, 601.2f)', () => {
  test('"This spell costs {1} less to cast for each creature on the battlefield." on an instant', () => {
    const parsed = readAll(
      'This spell costs {1} less to cast for each creature on the battlefield.\nDraw a card.',
      'instant',
    );
    expect(parsed.abilities).toEqual([
      reduction({ kind: 'this' }, countOf({ types: ['creature'] })),
    ]);
    expect(parsed.spell?.effect).toEqual({ kind: 'draw', player: YOU, count: 1 });
  });

  test('the line of the replay, on a creature, with "~"', () => {
    expect(
      readAll('~ costs {1} less to cast for each creature on the battlefield.', 'creature')
        .abilities,
    ).toEqual([reduction({ kind: 'this' }, countOf({ types: ['creature'] }))]);
  });

  test('a flat reduction, and other things that are counted', () => {
    expect(readAll('This creature costs {2} less to cast.', 'creature').abilities).toEqual([
      reduction({ kind: 'this' }, 2),
    ]);
    expect(
      readAll('~ costs {1} less to cast for each card in your hand.', 'creature').abilities,
    ).toEqual([reduction({ kind: 'this' }, countOf({ zone: 'hand', controller: 'you' }))]);
    expect(
      readAll('~ costs {1} less to cast for each other creature you control.', 'creature')
        .abilities,
    ).toEqual([
      reduction({ kind: 'this' }, countOf({ types: ['creature'], other: true, controller: 'you' })),
    ]);
  });

  test.each([
    ['This spell costs {W} less to cast.', '{W} less to cast.'],
    // Stage P28: "{X} less ..., where X is ..." is read; {X} with no definition is not.
    ['~ costs {X} less to cast.', '{X} less to cast.'],
    ['This spell costs {1} more to cast.', 'more to cast.'],
    // Stage P38 (D-182): "if you control ..." is read; a condition about another player's permanents is not.
    [
      '~ costs {3} less to cast if an opponent controls a creature with power 4 or greater.',
      'an opponent controls a creature with power 4 or greater.',
    ],
    // The engine counts one for each: a step of {2} is not a count.
    [
      'This spell costs {2} less to cast for each creature on the battlefield.',
      'on the battlefield.',
    ],
  ])('stays unread: %s', (text, stoppedAt) => {
    expect(dropped(text, 'creature')).toMatchObject({
      reason: 'unrecognised',
      closestRule: 'static.self-cost-reduction',
      stoppedAt,
    });
  });
});

describe('static.spells-cost-reduction: "Artifact spells you cast cost {1} less to cast." (CR 118.7a, 604.2)', () => {
  test.each([
    [
      'Artifact spells you cast cost {1} less to cast.',
      { types: ['artifact'], controller: 'you' },
      1,
    ],
    [
      'Instant and sorcery spells you cast cost {1} less to cast.',
      { anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }], controller: 'you' },
      1,
    ],
    [
      'Creature spells you cast cost {1} less to cast.',
      { types: ['creature'], controller: 'you' },
      1,
    ],
    [
      'Noncreature spells you cast cost {1} less to cast.',
      { notTypes: ['creature'], controller: 'you' },
      1,
    ],
    [
      'Enchantment spells you cast cost {1} less to cast.',
      { types: ['enchantment'], controller: 'you' },
      1,
    ],
    [
      'Dragon spells you cast cost {2} less to cast.',
      { subtypes: ['Dragon'], controller: 'you' },
      2,
    ],
    ['Red spells you cast cost {1} less to cast.', { colors: ['R'], controller: 'you' }, 1],
    [
      'Black creature spells you cast cost {1} less to cast.',
      { types: ['creature'], colors: ['B'], controller: 'you' },
      1,
    ],
    [
      'Aura and Equipment spells you cast cost {1} less to cast.',
      { anyOf: [{ subtypes: ['Aura'] }, { subtypes: ['Equipment'] }], controller: 'you' },
      1,
    ],
    // SYNTHETIC: no real line has no type at all, or a count after the cost.
    ['Spells you cast cost {1} less to cast.', { controller: 'you' }, 1],
  ] as const)('%s', (text, spells, amount) => {
    expect(readAll(text, 'enchantment').abilities).toEqual([reduction(spells, amount)]);
  });

  test('SYNTHETIC: counted, with the permanent as the source', () => {
    expect(
      readAll(
        'Creature spells you cast cost {1} less to cast for each creature you control.',
        'enchantment',
      ).abilities,
    ).toEqual([
      reduction(
        { types: ['creature'], controller: 'you' },
        countOf({ types: ['creature'], controller: 'you' }),
      ),
    ]);
  });

  test.each([
    ['Creature spells you cast of the chosen player cost {1} less to cast.', 'none'],
    ['Creature spells you cast with flying cost {2} less to cast.', 'none'],
    ['Each spell you cast that’s red or green costs {1} less to cast.', 'none'],
    ['Artifact spells your opponents cast cost {1} more to cast.', 'none'],
    ['Legendary spells you cast cost {1} less to cast.', 'none'],
    ['Historic spells you cast cost {1} less to cast.', 'none'],
    ['Artifact spells you cast cost {W} less to cast.', 'static.spells-cost-reduction'],
  ])('stays unread: %s', (text, closestRule) => {
    expect(dropped(text, 'enchantment')).toMatchObject({ reason: 'unrecognised', closestRule });
  });
});

describe('cost.discard: "Ward—Discard a card." and "Discard a card: ..." (CR 701.9, 702.21a, 602.2b)', () => {
  test('Ward—Discard a card. is the keyword with the discard cost', () => {
    expect(readAll('Ward—Discard a card.', 'creature').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'ward', cost: [{ kind: 'discard', count: 1 }] } },
    ]);
    expect(readAll('Ward—Discard two cards.', 'creature').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'ward', cost: [{ kind: 'discard', count: 2 }] } },
    ]);
  });

  test('"Discard a card: ~ gets +1/+1 until end of turn." is an activated ability', () => {
    expect(
      readAll('Discard a card: ~ gets +1/+1 until end of turn.', 'creature').abilities,
    ).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'discard', count: 1 }],
        effect: {
          kind: 'modifyPt',
          objects: THIS,
          power: 1,
          toughness: 1,
          duration: 'untilEndOfTurn',
        },
      },
    ]);
  });

  test('the mana comes first in "{1}, Discard a card: ...", and a sacrifice may go with it', () => {
    expect(readAll('{1}, Discard a card: Draw a card.', 'artifact').abilities).toEqual([
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['1'] },
          { kind: 'discard', count: 1 },
        ],
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
    ]);
    expect(
      readAll('Sacrifice a creature, Discard a card: Draw a card.', 'artifact').abilities,
    ).toEqual([
      {
        kind: 'activated',
        cost: [
          { kind: 'sacrifice', what: { types: ['creature'] } },
          { kind: 'discard', count: 1 },
        ],
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
    ]);
  });

  test('"Discard two cards" is a count of two', () => {
    const [ability] = readAll('Discard two cards: Draw a card.', 'artifact').abilities;
    expect(ability).toMatchObject({ kind: 'activated', cost: [{ kind: 'discard', count: 2 }] });
  });

  test.each([
    ['Ward—Discard a creature card.', 'creature card.', 'cost.discard'],
    ['Ward—Discard your hand.', 'your hand.', 'cost.discard'],
    // A creature card is read since stage P50 (D-207, `cost.discard-filtered`); a color or a creature type is not.
    [
      'Discard a red card: ~ gets +1/+1 until end of turn.',
      'red card: ~ gets +1/+1 until end of turn.',
      'cost.discard',
    ],
    [
      'Discard ~: ~ gets +1/+1 until end of turn.',
      '~: ~ gets +1/+1 until end of turn.',
      'cost.discard',
    ],
  ])('stays unread: %s', (text, stoppedAt, closestRule) => {
    expect(dropped(text, 'creature')).toMatchObject({
      reason: 'unrecognised',
      stoppedAt,
      closestRule,
    });
  });

  test('two discards in one cost, and a discard in a mana ability, are read and refused by name', () => {
    expect(dropped('{1}, Discard a card, Discard a card: Draw a card.', 'artifact')).toMatchObject({
      reason: 'notRunnable',
      closestRule: 'ability.activated',
    });
    expect(dropped('{T}, Discard a card: Add {R}{R}.', 'artifact')).toMatchObject({
      reason: 'notRunnable',
      needs: ['manaCost:discard'],
    });
  });
});

describe('counted amounts: "for each ..." and "equal to the number of ..." (CR 608.2c, D-095)', () => {
  const draw = (count: unknown): Effect => ({ kind: 'draw', player: YOU, count }) as Effect;

  test.each([
    [
      'Draw a card for each creature you control.',
      countOf({ types: ['creature'], controller: 'you' }),
    ],
    ['Draw a card for each creature on the battlefield.', countOf({ types: ['creature'] })],
    [
      'Draw a card for each other creature you control.',
      countOf({ types: ['creature'], other: true, controller: 'you' }),
    ],
    [
      'Draw a card for each artifact you control.',
      countOf({ types: ['artifact'], controller: 'you' }),
    ],
    ['Draw a card for each land you control.', countOf({ types: ['land'], controller: 'you' })],
    ['Draw a card for each card in your hand.', countOf({ zone: 'hand', controller: 'you' })],
    [
      'Draw a card for each creature card in your graveyard.',
      countOf({ zone: 'graveyard', types: ['creature'], controller: 'you' }),
    ],
    ['Draw a card for each card in all graveyards.', countOf({ zone: 'graveyard' })],
    [
      'Draw a card for each artifact or creature you control.',
      countOf({ controller: 'you', anyOf: [{ types: ['artifact'] }, { types: ['creature'] }] }),
    ],
    [
      'Draw a card for each nonland permanent your opponents control.',
      countOf({ notTypes: ['land'], controller: 'opponent' }),
    ],
  ])('%s', (text, count) => {
    expect(spellEffect(text, 'sorcery')).toEqual(draw(count));
  });

  test('"You gain life equal to the number of lands you control." and the other life shapes', () => {
    expect(
      spellEffect('You gain life equal to the number of lands you control.', 'sorcery'),
    ).toEqual({
      kind: 'gainLife',
      player: YOU,
      amount: countOf({ types: ['land'], controller: 'you' }),
    });
    expect(spellEffect('You gain 1 life for each creature you control.', 'sorcery')).toEqual({
      kind: 'gainLife',
      player: YOU,
      amount: countOf({ types: ['creature'], controller: 'you' }),
    });
    expect(
      spellEffect('You lose life equal to the number of cards in your hand.', 'sorcery'),
    ).toEqual({
      kind: 'loseLife',
      player: YOU,
      amount: countOf({ zone: 'hand', controller: 'you' }),
    });
    expect(
      spellEffect(
        'You gain life equal to the number of creature cards in your graveyard.',
        'sorcery',
      ),
    ).toEqual({
      kind: 'gainLife',
      player: YOU,
      amount: countOf({ zone: 'graveyard', types: ['creature'], controller: 'you' }),
    });
  });

  test('"~ deals damage to target player equal to the number of creatures on the battlefield."', () => {
    const parsed = readAll(
      '~ deals damage to target player equal to the number of creatures on the battlefield.',
      'sorcery',
    );
    expect(parsed.spell).toEqual({
      targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
      effect: {
        kind: 'dealDamage',
        amount: countOf({ types: ['creature'] }),
        to: { kind: 'target', id: 't1' },
      },
    });
  });

  test('also in an activated ability, after the effect before it ("then you lose life equal to ...")', () => {
    const [ability] = readAll(
      '{1}{B}{B}, {T}: Draw a card, then you lose life equal to the number of cards in your hand.',
      'artifact',
    ).abilities;
    expect(ability).toEqual({
      kind: 'activated',
      cost: [{ kind: 'mana', symbols: ['1', 'B', 'B'] }, { kind: 'tap' }],
      effect: {
        kind: 'sequence',
        effects: [
          draw(1),
          { kind: 'loseLife', player: YOU, amount: countOf({ zone: 'hand', controller: 'you' }) },
        ],
      },
    });
  });

  test.each([
    // The engine counts objects of a filter: a quality it cannot say, a plain "creature" with no controller.
    ['Draw a card for each creature.', '.', 'amount.for-each'],
    ['Draw a card for each opponent.', 'opponent.', 'amount.for-each'],
    [
      'You gain 1 life for each creature you control with flying or reach.',
      'or reach.',
      'amount.for-each',
    ],
    [
      'Draw a card for each creature you control with a +1/+1 counter.',
      'with a +1/+1 counter.',
      'amount.for-each',
    ],
    [
      'Draw cards equal to the number of cards in your hand plus one.',
      'plus one.',
      'amount.number-of',
    ],
    [
      '~ deals damage to each creature equal to the number of lands you control.',
      'equal to the number of lands you control.',
      'noun.each-permanent',
    ],
    [
      '~ deals damage to target creature equal to the number of creatures.',
      '.',
      'amount.number-of',
    ],
  ])('stays unread: %s', (text, stoppedAt, closestRule) => {
    expect(dropped(text, 'sorcery')).toMatchObject({
      reason: 'unrecognised',
      stoppedAt,
      closestRule,
    });
  });

  test('a count after the duration of a pump is not read (stage P20 reads it in a static ability only)', () => {
    expect(
      dropped('~ gets +1/+0 until end of turn for each artifact you control.', 'creature'),
    ).toMatchObject({
      reason: 'unrecognised',
      stoppedAt: 'until end of turn for each artifact you control.',
    });
  });

  test('a token count of more than one multiplies the count (stage P28 reads it; stage P15 read "a token for each")', () => {
    const [ability] = readAll(
      'When ~ enters, create two 0/1 green Plant creature tokens for each land you control.',
      'creature',
    ).abilities;
    expect(ability).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'createToken',
        count: { kind: 'multiple', factor: 2, of: countOf({ types: ['land'], controller: 'you' }) },
      },
    });
  });
});

describe('what each lowering declares it needs', () => {
  test.each([
    'cost:sacrifice',
    'cost:discard',
    'cost:payLife',
    'cost:mana',
    'static:costReduction',
    'amount:countOf',
    'condition:controlCommander',
  ] as const)('%s is a feature a lowering can name', (ref) => {
    expect(DECLARED_NEEDS).toContain(ref);
  });

  test('the face costs are fields of the face: a line of them has no ability, and no spell text', () => {
    const parsed = read('As an additional cost to cast this spell, discard a card.', 'sorcery');
    expect(parsed.abilities).toEqual([]);
    expect(parsed.spell).toBeNull();
    expect(parsed.unparsed).toEqual([]);
  });
});
