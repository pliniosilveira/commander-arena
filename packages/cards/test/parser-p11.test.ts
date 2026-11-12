// Stage P11 (M6): the wordings of the references the engine runs since D-092 and D-096: the power and
// mana value of a target, "its controller" creating tokens and searching, "target player's
// graveyard", "Counter target spell unless its controller pays {N}", and "return a land you control
// to its owner's hand". Each line is read through the whole pipeline and compared with the engine
// AST written out here (the shapes `docs/MECHANICS.md` lists under "What the parser must produce"),
// and each near miss says where it stops. The lines are the real example lines of
// reports/template-replay.md and reports/backlog.md (the owner's run) unless a note says SYNTHETIC;
// no Oracle text of a real card is copied beyond those shapes, and no real card is marked supported
// here. That the engine runs what is lowered is in convert-grammar-engine-p11.test.ts.
import type { Effect, ObjectFilter } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { compileLine, DECLARED_NEEDS } from '../src/convert/parser/index';
import { dropped, readAll, SET, spellEffect, T1 } from './parser-p5-helpers';

const controllerOfT1 = { kind: 'controllerOf', of: T1 } as const;
const target = (filter: ObjectFilter) => ({ id: 't1', what: { kind: 'object', filter } }) as const;
const spellOf = (text: string, type: 'instant' | 'sorcery' = 'instant') => {
  const spell = readAll(text, type).spell;
  if (spell === undefined || spell === null) throw new Error(`"${text}" has no spell text`);
  return spell;
};

describe('the power of a target (CR 208.1, 608.2h): "Its controller gains life equal to its power"', () => {
  test("Swords to Plowshares' sentence reads the power of the target the clause before named", () => {
    const spell = spellOf('Exile target creature. Its controller gains life equal to its power.');
    expect(spell.targets).toEqual([target({ zone: 'battlefield', types: ['creature'] })]);
    expect(spell.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'exile', objects: T1 },
        {
          kind: 'gainLife',
          player: controllerOfT1,
          amount: { kind: 'powerOf', of: T1 },
        },
      ],
    });
  });

  test('"that creature\'s power" of a destroyed creature is the same node, for you', () => {
    expect(
      spellEffect(
        "Destroy target creature. You gain life equal to that creature's power.",
        'sorcery',
      ),
    ).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'destroy', objects: T1 },
        { kind: 'gainLife', player: { kind: 'you' }, amount: { kind: 'powerOf', of: T1 } },
      ],
    });
  });

  test('the power of ~ is still `this`', () => {
    expect(
      readAll('Whenever ~ attacks, you gain life equal to its power.', 'creature').abilities,
    ).toMatchObject([{ effect: { amount: { kind: 'powerOf', of: { kind: 'this' } } } }]);
  });

  test('a spell has no power: "its power" of a spell is not lowered', () => {
    expect(
      dropped('Counter target spell. Its controller gains life equal to its power.'),
    ).toMatchObject({ reason: 'notRunnable' });
  });
});

describe('the mana value of a target (CR 202.3, 608.2h): "You lose life equal to that card\'s mana value"', () => {
  test('after a reanimation, which reads as the engine move to the battlefield under your control', () => {
    const spell = spellOf(
      'Put target creature card from a graveyard onto the battlefield under your control. You lose life equal to that card’s mana value.',
      'sorcery',
    );
    expect(spell.targets).toEqual([target({ zone: 'graveyard', types: ['creature'] })]);
    expect(spell.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'moveToZone', objects: T1, to: 'battlefield', controller: 'you' },
        {
          kind: 'loseLife',
          player: { kind: 'you' },
          amount: { kind: 'manaValueOf', of: T1 },
        },
      ],
    });
  });

  test('"that permanent\'s mana value" after a destroy', () => {
    const spell = spellOf(
      'Destroy target creature or enchantment an opponent controls. You lose life equal to that permanent’s mana value.',
      'sorcery',
    );
    expect(spell.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'destroy', objects: T1 },
        {
          kind: 'loseLife',
          player: { kind: 'you' },
          amount: { kind: 'manaValueOf', of: T1 },
        },
      ],
    });
  });

  test('"its mana value" and the controller of the target as the player (SYNTHETIC)', () => {
    expect(
      spellEffect('Exile target creature. Its controller loses life equal to its mana value.'),
    ).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'exile', objects: T1 },
        { kind: 'loseLife', player: controllerOfT1, amount: { kind: 'manaValueOf', of: T1 } },
      ],
    });
  });

  test.each([
    [
      'Exile target creature. You lose life equal to its mana cost.',
      'equal to its mana cost.',
      'effect.player.life',
    ],
    [
      'Exile target creature. You gain life equal to its loyalty.',
      'equal to its loyalty.',
      'effect.player.life',
    ],
  ])('%s stops at "%s"', (text, stoppedAt, closestRule) => {
    expect(dropped(text)).toMatchObject({ reason: 'unrecognised', stoppedAt, closestRule });
  });

  test('the mana value of ~ itself is read by no rule: a trigger about ~ stays unread', () => {
    expect(
      dropped('When ~ enters, you lose life equal to ~’s mana value.', 'creature'),
    ).toMatchObject({ reason: 'unrecognised' });
  });

  test('the mana value of a pronoun that means ~ is read and not lowered (nothing tests it)', () => {
    expect(
      dropped('When ~ enters, you lose life equal to its mana value.', 'creature'),
    ).toMatchObject({ reason: 'notRunnable', closestRule: 'effect.player' });
  });
});

describe('"Put ... onto the battlefield" from a graveyard (CR 400.7, 110.2a)', () => {
  const move = (extra: Record<string, unknown>) => ({
    kind: 'moveToZone',
    objects: T1,
    to: 'battlefield',
    ...extra,
  });

  test.each([
    [
      'Put target creature card from a graveyard onto the battlefield under your control.',
      move({ controller: 'you' }),
    ],
    [
      'Put target creature card from a graveyard onto the battlefield.',
      move({ controller: 'you' }),
    ],
    [
      'Put target creature card from a graveyard onto the battlefield tapped under your control.',
      move({ controller: 'you', tapped: true }),
    ],
    [
      "Put target creature card from a graveyard onto the battlefield under its owner's control.",
      move({ controller: 'owner' }),
    ],
  ] as const)('%s', (text, effect) => {
    expect(spellEffect(text, 'sorcery')).toEqual(effect);
  });

  test.each([
    [
      'Put target creature card from a graveyard onto the battlefield under his control.',
      'under his control.',
    ],
    [
      'Put target creature card from a graveyard onto the battlefield with a +1/+1 counter on it.',
      'with a +1/+1 counter on it.',
    ],
    ['Put target creature card from a graveyard into your hand.', 'into your hand.'],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(dropped(text, 'sorcery')).toMatchObject({ reason: 'unrecognised', stoppedAt });
  });
});

describe('"Its controller creates ..." (CR 111.2): a token for the controller of the target', () => {
  test.each([
    [
      'Destroy target permanent. Its controller creates a 3/3 green Beast creature token.',
      'destroy',
      { power: 3, toughness: 3, colors: ['G'], subtypes: ['Beast'], name: 'Beast' },
      1,
    ],
    [
      'Destroy target permanent. Its controller creates a 3/3 green Elephant creature token.',
      'destroy',
      { power: 3, toughness: 3, colors: ['G'], subtypes: ['Elephant'], name: 'Elephant' },
      1,
    ],
    [
      'Destroy target nonland permanent. Its controller creates a 1/1 white Human creature token.',
      'destroy',
      { power: 1, toughness: 1, colors: ['W'], subtypes: ['Human'], name: 'Human' },
      1,
    ],
  ] as const)('%s', (text, verb, definition, count) => {
    const effect = spellEffect(text) as Extract<Effect, { kind: 'sequence' }>;
    const [first, second] = effect.effects;
    expect(first).toMatchObject({ kind: verb, objects: T1 });
    expect(second).toEqual({
      kind: 'createToken',
      token: {
        kind: 'custom',
        definition: expect.objectContaining({ types: ['creature'], ...definition }),
      },
      count,
      controller: controllerOfT1,
    });
  });

  test('a predefined token: "creates two Treasure tokens" after a counter', () => {
    const spell = spellOf(
      'Counter target noncreature spell. Its controller creates two Treasure tokens.',
    );
    expect(spell.targets).toEqual([
      target({ zone: 'stack', notTypes: ['creature'], stackKind: 'spell' }),
    ]);
    expect(spell.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'counter', objects: T1 },
        {
          kind: 'createToken',
          token: { kind: 'preset', preset: 'Treasure' },
          count: 2,
          controller: controllerOfT1,
        },
      ],
    });
  });

  test('without a sentence before it, "its controller" has nothing to mean', () => {
    expect(dropped('Its controller creates a Treasure token.')).toMatchObject({
      reason: 'unboundReference',
    });
  });

  test.each([
    [
      'Destroy target creature. Its controller creates a token that’s a copy of it.',
      'token that’s a copy of it.',
      'token.predefined',
    ],
    [
      'Counter target enchantment, instant, or sorcery spell. Its controller creates a 2/2 blue Bird creature token with changeling.',
      'with changeling.',
      'token.custom',
    ],
    [
      'Destroy target creature. Its controller creates Y Treasure tokens.',
      'Y Treasure tokens.',
      'effect.player.create-token',
    ],
    [
      'Destroy target creature. Its owner creates a Treasure token.',
      'Its owner creates a Treasure token.',
      'spell.effect',
    ],
    // Stage P28: another player creates a token (the controller of the token is the player named), a Treasure and not a
    // Banana.
    [
      'Destroy target creature. Target player creates a Banana token.',
      'Banana token.',
      'token.predefined',
    ],
    [
      // Manifest is read since D-967 (the top card of their library); several cards are another instruction and stay unread.
      'Exile target creature. Its controller manifests the top two cards of their library.',
      'the top two cards of their library.',
      'effect.player.manifest',
    ],
  ])('%s stops at "%s"', (text, stoppedAt, closestRule) => {
    expect(dropped(text)).toMatchObject({ reason: 'unrecognised', stoppedAt, closestRule });
  });
});

describe('"Its controller may search their library ..." (CR 701.23a, 608.2d, 110.2a)', () => {
  const search = (extra: Record<string, unknown>, tapped: boolean) => ({
    kind: 'search',
    player: controllerOfT1,
    optional: true,
    filter: { types: ['land'], supertypes: ['basic'] },
    max: 1,
    destinations: [{ zone: 'battlefield', ...(tapped ? { tapped: true } : {}), count: 1 }],
    reveal: false,
    shuffle: true,
    ...extra,
  });

  test("Path to Exile's sentence: the exile, then the search of the target's controller", () => {
    const spell = spellOf(
      'Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle.',
    );
    expect(spell.effect).toEqual({
      kind: 'sequence',
      effects: [{ kind: 'exile', objects: T1 }, search({}, true)],
    });
  });

  test('"put it onto the battlefield" is not tapped, and the same card may be a permanent an opponent controls', () => {
    expect(
      spellEffect(
        'Destroy target permanent an opponent controls. Its controller may search their library for a basic land card, put it onto the battlefield, then shuffle.',
        'sorcery',
      ),
    ).toEqual({
      kind: 'sequence',
      effects: [{ kind: 'destroy', objects: T1 }, search({}, false)],
    });
  });

  test('"that land\'s controller" is the same player (SYNTHETIC)', () => {
    expect(
      spellEffect(
        "Destroy target land. That land's controller may search their library for a basic land card, put it onto the battlefield tapped, then shuffle.",
        'sorcery',
      ),
    ).toEqual({
      kind: 'sequence',
      effects: [{ kind: 'destroy', objects: T1 }, search({}, true)],
    });
  });

  test('your own "you may search" in a trigger is the whole ability being optional, not this rule', () => {
    expect(
      readAll(
        'When ~ enters, you may search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.',
        'creature',
      ).abilities,
    ).toMatchObject([
      { kind: 'triggered', optional: true, effect: { kind: 'search', player: { kind: 'you' } } },
    ]);
  });

  test.each([
    [
      'Exile target creature. Its controller searches their library for a basic land card, put it onto the battlefield, then shuffle.',
      'searches their library for a basic land card, put it onto the battlefield, then shuffle.',
      'effect.player',
    ],
    [
      'Exile target creature. Its controller may search their library for a basic land card, reveal it, put it onto the battlefield, then shuffle.',
      ', reveal it, put it onto the battlefield, then shuffle.',
      'effect.search-by',
    ],
    [
      'Exile target creature. Its controller may search their library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.',
      'land cards, put them onto the battlefield tapped, then shuffle.',
      'effect.search-by',
    ],
    [
      'Exile target creature. Its controller may search their library for a basic land card, put it into their hand, then shuffle.',
      'into their hand, then shuffle.',
      'effect.search-by',
    ],
    [
      'Exile target creature. Its owner may search their library for a basic land card, put it onto the battlefield, then shuffle.',
      'Its owner may search their library for a basic land card, put it onto the battlefield, then shuffle.',
      'spell.effect',
    ],
    [
      'Exile target creature. You may search your library for a basic land card, put it onto the battlefield, then shuffle.',
      'may search your library for a basic land card, put it onto the battlefield, then shuffle.',
      'effect.player',
    ],
  ])('%s stops at "%s"', (text, stoppedAt, closestRule) => {
    expect(dropped(text)).toMatchObject({ reason: 'unrecognised', stoppedAt, closestRule });
  });
});

describe('"target player\'s graveyard": the cards of a graveyard selected by their owner (CR 108.3, 404.1)', () => {
  const wipe = (kind: 'any' | 'opponent' = 'any') => ({
    targets: [{ id: 't1', what: { kind: 'player', filter: kind } }],
    effect: {
      kind: 'exile',
      objects: { kind: 'each', filter: { zone: 'graveyard', owner: T1 } },
    },
  });

  test('as a spell: a player target and an exile of every card they own in a graveyard', () => {
    expect(spellOf('Exile target player’s graveyard.', 'sorcery')).toEqual(wipe());
    expect(spellOf("Exile target opponent's graveyard.", 'sorcery')).toEqual(wipe('opponent'));
  });

  test('as an enters trigger (the replay line): the target is declared by the trigger', () => {
    expect(
      readAll('When ~ enters, exile target player’s graveyard.', 'creature').abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        ...wipe(),
      },
    ]);
  });

  test('the whole Bojuka Bog shape: enters tapped, the trigger and the mana ability read', () => {
    const faces = readAll(
      '~ enters tapped.\nWhen ~ enters, exile target player’s graveyard.\n{T}: Add {B}.',
      'creature',
    );
    expect(faces.abilities).toHaveLength(3);
  });

  test.each([
    ['Exile target player’s library.', '’s library.', 'noun.player-graveyard'],
    ['Exile target player’s graveyard and library.', 'library.', 'spell.effect'],
    ['Exile your graveyard.', 'your graveyard.', 'effect.flicker'],
  ])('%s stops at "%s"', (text, stoppedAt, closestRule) => {
    expect(dropped(text, 'sorcery')).toMatchObject({
      reason: 'unrecognised',
      stoppedAt,
      closestRule,
    });
  });
});

describe('"Counter target spell unless its controller pays {N}" (CR 701.6, 118.12a, 608.2d)', () => {
  const unless = (filter: ObjectFilter, symbols: string[]) => ({
    targets: [target(filter)],
    effect: {
      kind: 'counterUnlessPays',
      objects: T1,
      cost: [{ kind: 'mana', symbols }],
    },
  });

  test.each([
    [
      'Counter target spell unless its controller pays {3}.',
      { zone: 'stack', stackKind: 'spell' },
      ['3'],
    ],
    [
      'Counter target spell unless its controller pays {1}.',
      { zone: 'stack', stackKind: 'spell' },
      ['1'],
    ],
    [
      'Counter target noncreature spell unless its controller pays {2}.',
      { zone: 'stack', notTypes: ['creature'], stackKind: 'spell' },
      ['2'],
    ],
    [
      'Counter target instant or sorcery spell unless its controller pays {1}.',
      {
        zone: 'stack',
        stackKind: 'spell',
        anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
      },
      ['1'],
    ],
    [
      'Counter target creature spell unless its controller pays {2}{U}.',
      { zone: 'stack', types: ['creature'], stackKind: 'spell' },
      ['2', 'U'],
    ],
  ] as const)('%s', (text, filter, symbols) => {
    expect(spellOf(text)).toEqual(unless(filter as ObjectFilter, [...symbols]));
  });

  test('another sentence of the spell is read after it', () => {
    expect(
      spellEffect('Counter target spell unless its controller pays {3}. Draw a card.'),
    ).toEqual({
      kind: 'sequence',
      effects: [
        {
          kind: 'counterUnlessPays',
          objects: T1,
          cost: [{ kind: 'mana', symbols: ['3'] }],
        },
        { kind: 'draw', player: { kind: 'you' }, count: 1 },
      ],
    });
  });

  test('a plain counter keeps its own rule', () => {
    expect(spellEffect('Counter target spell.')).toEqual({ kind: 'counter', objects: T1 });
    expect(dropped('Counter target spell with mana value X or less.')).toMatchObject({
      reason: 'unrecognised',
      stoppedAt: 'with mana value X or less.',
      closestRule: 'noun.target-spell',
    });
  });

  test.each([
    ['Counter target spell unless its controller pays {X}.', '{X}.'],
    ['Counter target spell unless its controller pays 2 life.', '2 life.'],
    ['Counter target spell unless its controller pays {R/W}.', '{R/W}.'],
    ['Counter target spell unless that player pays {3}.', 'unless that player pays {3}.'],
    ['Counter target spell unless you pay {3}.', 'unless you pay {3}.'],
    [
      'Counter target spell unless its controller discards a card.',
      'unless its controller discards a card.',
    ],
    [
      'Counter target spell unless its controller pays {3}. If that spell is countered this way, exile it instead of putting it into its owner’s graveyard.',
      'If that spell is countered this way, exile it instead of putting it into its owner’s graveyard.',
    ],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(dropped(text)).toMatchObject({ reason: 'unrecognised', stoppedAt });
  });
});

describe('"Return a land you control to its owner\'s hand": the controller chooses (CR 608.2d, 400.3)', () => {
  const bounce = (types: string[]) => ({
    kind: 'moveToZone',
    objects: { kind: 'choose', filter: { types, controller: 'you' } },
    to: 'hand',
  });

  test('the replay line: a bounce land trigger', () => {
    expect(
      readAll('When ~ enters, return a land you control to its owner’s hand.', 'creature')
        .abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: bounce(['land']),
      },
    ]);
  });

  test('other permanent types, in a spell, and with "you may" (SYNTHETIC)', () => {
    expect(spellEffect('Return an artifact you control to its owner’s hand.', 'sorcery')).toEqual(
      bounce(['artifact']),
    );
    expect(
      readAll(
        'When ~ enters, you may return a creature you control to its owner’s hand.',
        'creature',
      ).abilities,
    ).toMatchObject([{ kind: 'triggered', optional: true, effect: bounce(['creature']) }]);
  });

  test('"Return target land you control" is a target, not this', () => {
    expect(spellEffect('Return target land you control to its owner’s hand.', 'sorcery')).toEqual({
      kind: 'moveToZone',
      objects: T1,
      to: 'hand',
    });
  });

  test.each([
    ['Return a land to its owner’s hand.', 'to its owner’s hand.', 'effect.return'],
    [
      'Return a creature an opponent controls to its owner’s hand.',
      'an opponent controls to its owner’s hand.',
      'noun.a-permanent',
    ],
    [
      'Return another creature you control to its owner’s hand.',
      'you control to its owner’s hand.',
      'effect.return',
    ],
    [
      'Return two lands you control to their owners’ hands.',
      'lands you control to their owners’ hands.',
      'effect.return',
    ],
    ['Return a land you control to your hand.', 'to your hand.', 'effect.return'],
  ])('%s stops at "%s"', (text, stoppedAt, closestRule) => {
    expect(dropped(text, 'sorcery')).toMatchObject({
      reason: 'unrecognised',
      stoppedAt,
      closestRule,
    });
  });
});

describe('fear, intimidate and shadow: the engine runs them (D-094), so the vocabulary reads them', () => {
  test.each(['fear', 'intimidate', 'shadow'] as const)('the keyword line "%s"', (word) => {
    expect(readAll(word, 'creature').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: word } },
    ]);
  });

  test('in a list, granted until end of turn, and granted by Equipment', () => {
    expect(readAll('Shadow, intimidate', 'creature').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'shadow' } },
      { kind: 'keyword', keyword: { kind: 'intimidate' } },
    ]);
    expect(spellEffect('Target creature gains shadow until end of turn.')).toEqual({
      kind: 'grantKeyword',
      objects: T1,
      keyword: { kind: 'shadow' },
      duration: 'untilEndOfTurn',
    });
    expect(
      readAll('Equipped creature has intimidate.', 'artifact', ['Equipment']).abilities,
    ).toMatchObject([
      { kind: 'static', static: { kind: 'grantKeyword', keyword: { kind: 'intimidate' } } },
    ]);
  });

  test('storm is not in the keyword vocabulary: inside a list it stays unread (a line of its own since P27, landwalk since P12, skulk since P21)', () => {
    expect(dropped('Flying, storm', 'creature')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('what the lowering needs from the engine', () => {
  test('the features are declared, so the dimension test and the diagnostics know them', () => {
    for (const ref of [
      'amount:powerOf',
      'amount:manaValueOf',
      'effect:counterUnlessPays',
      'effect:createToken',
      'effect:search',
      'selector:ownerRef',
      'selector:controllerOf',
      'selector:choose',
      'cost:mana',
    ]) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });

  test('a recognised line lists the rules that read it', () => {
    const cases: [string, string[]][] = [
      [
        'Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle.',
        ['effect.exile', 'effect.search-by', 'noun.its-controller'],
      ],
      [
        'Counter target spell unless its controller pays {3}.',
        ['effect.counter-unless', 'noun.target-spell', 'cost.mana'],
      ],
      ['Exile target player’s graveyard.', ['effect.exile', 'noun.player-graveyard']],
      [
        'Put target creature card from a graveyard onto the battlefield under your control. You lose life equal to that card’s mana value.',
        ['effect.put-battlefield', 'effect.player', 'amount.mana-value-of'],
      ],
    ];
    for (const [text, ids] of cases) {
      const result = compileLine(text, { rules: SET, face: 'spell' });
      expect(result.ok ? result.recognised : result.failure.recognised, text).toEqual(
        expect.arrayContaining(ids),
      );
    }
  });
});
