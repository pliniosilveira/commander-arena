// Stage P28 (M10): the counted-amounts slice of the engine (D-131, ENGINE_VERSION 28) read by the grammar. The lines are
// the real wordings of the blockers of the owner's five decks (reports/decks.md, parser version 32), whose numbers the
// report keeps as N: the numbers written here are SYNTHETIC, the wording around them is the report's. Every other line is
// SYNTHETIC: the variants of the same families that the report does not show (a wording the lists do not name but that is
// the same family), the near misses and the lines the grammar must not read. The engine runs what is lowered in
// convert-grammar-engine-p28.test.ts; a missing engine feature is named in parser-p28-needs.test.ts; each line as a whole
// card is in convert-grammar-corpus-p28.test.ts.
import type { Amount, Effect } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { dropped, type FaceType, readAll, spellEffect } from './parser-p5-helpers';

const YOU = { kind: 'you' } as const;
const THIS = { kind: 'this' } as const;
const T1 = { kind: 'target', id: 't1' } as const;
const T2 = { kind: 'target', id: 't2' } as const;
const END = 'untilEndOfTurn' as const;

const countOf = (filter: object): Amount => ({ kind: 'countOf', filter }) as Amount;
const ZOMBIES_YOU = { subtypes: ['Zombie'], controller: 'you' };
const CREATURES = { types: ['creature'] };
const CREATURES_YOU = { types: ['creature'], controller: 'you' };
const aggregate = (how: 'greatest' | 'total', stat: string, filter: object): Amount =>
  ({ kind: 'aggregate', how, stat, filter }) as Amount;

/** The first ability of a face that read completely. */
const ability = (text: string, type: FaceType = 'creature', subtypes: readonly string[] = []) => {
  const [first, ...more] = readAll(text, type, subtypes).abilities;
  expect(more, text).toEqual([]);
  return first;
};

const trigger = (text: string, type: FaceType = 'creature') => {
  const first = ability(text, type);
  if (first?.kind !== 'triggered') throw new Error(`"${text}" is not a triggered ability`);
  return first;
};

const zombie = (extra: object = {}) => ({
  kind: 'custom',
  definition: {
    name: 'Zombie',
    manaCost: null,
    supertypes: [],
    types: ['creature'],
    subtypes: ['Zombie'],
    colors: ['B'],
    power: 2,
    toughness: 2,
    loyalty: null,
    defense: null,
    oracleText: '',
    abilities: [],
    ...extra,
  },
});

describe('amount.where-x: "..., where X is ..." defines X (CR 107.3c)', () => {
  test('the upkeep draw and loss: the definition is written into each slot that says X', () => {
    const count = countOf(ZOMBIES_YOU);
    expect(
      trigger(
        'At the beginning of your upkeep, you draw X cards and lose X life, where X is the number of Zombies you control.',
      ),
    ).toEqual({
      kind: 'triggered',
      trigger: { kind: 'upkeep', whose: 'you' },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: YOU, count },
          { kind: 'loseLife', player: YOU, amount: count },
        ],
      },
    });
  });

  test('damage to each creature: the count of every creature on the battlefield', () => {
    expect(
      spellEffect(
        '~ deals X damage to each creature, where X is the number of creatures on the battlefield.',
        'sorcery',
      ),
    ).toEqual({
      kind: 'dealDamage',
      amount: countOf(CREATURES),
      to: { kind: 'each', filter: { zone: 'battlefield', types: ['creature'] } },
    });
  });

  test.each([
    [
      '~ deals X damage to target creature and you gain X life, where X is the number of Swamps you control.',
      ['creature'],
    ],
    [
      '~ deals X damage to target creature or planeswalker and you gain X life, where X is the number of Swamps you control.',
      ['creature', 'planeswalker'],
    ],
  ])('%s: the damage and the life are the same count', (text, kinds) => {
    const swamps = countOf({ subtypes: ['Swamp'], controller: 'you' });
    const filter =
      kinds.length === 1
        ? { zone: 'battlefield', types: kinds }
        : { zone: 'battlefield', anyOf: kinds.map((t) => ({ types: [t] })) };
    const parsed = readAll(text, 'sorcery').spell;
    expect(parsed?.targets).toEqual([{ id: 't1', what: { kind: 'object', filter } }]);
    expect(parsed?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'dealDamage', amount: swamps, to: T1 },
        { kind: 'gainLife', player: YOU, amount: swamps },
      ],
    });
    // X is defined by the text: it is not announced, so the spell has no X (CR 107.3).
    expect(parsed?.x).toBeUndefined();
  });

  test("put X counters on a target creature, where X is that creature's power", () => {
    expect(
      trigger(
        "When ~ enters, put X +1/+1 counters on target creature, where X is that creature's power.",
      ),
    ).toEqual({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: THIS },
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect: {
        kind: 'addCounters',
        objects: T1,
        counter: '+1/+1',
        count: { kind: 'powerOf', of: T1 },
      },
    });
  });

  test('the greatest power among creatures you control: a pump and a keyword with the same X', () => {
    const greatest = aggregate('greatest', 'power', CREATURES_YOU);
    const group = { kind: 'each', filter: { zone: 'battlefield', ...CREATURES_YOU } };
    expect(
      spellEffect(
        'Until end of turn, creatures you control gain trample and get +X/+X, where X is the greatest power among creatures you control.',
        'sorcery',
      ),
    ).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'grantKeyword', objects: group, keyword: { kind: 'trample' }, duration: END },
        { kind: 'modifyPt', objects: group, power: greatest, toughness: greatest, duration: END },
      ],
    });
  });

  test('the total power of creatures you control, as the reduction of a cost', () => {
    expect(
      ability('~ costs {X} less to cast, where X is the total power of creatures you control.'),
    ).toEqual({
      kind: 'static',
      static: {
        kind: 'costReduction',
        spells: { kind: 'this' },
        amount: aggregate('total', 'power', CREATURES_YOU),
      },
    });
  });

  test('your devotion to black, then the life lost this way', () => {
    expect(
      trigger(
        'When ~ enters, each opponent loses X life, where X is your devotion to black. You gain life equal to the life lost this way.',
      ),
    ).toEqual({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: THIS },
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'loseLife',
            player: { kind: 'eachOpponent' },
            amount: { kind: 'devotion', colors: ['B'] },
          },
          { kind: 'gainLife', player: YOU, amount: { kind: 'lifeLostThisWay' } },
        ],
      },
    });
  });

  test('half the number, rounded down: tokens at the upkeep', () => {
    expect(
      trigger(
        'At the beginning of your upkeep, create X 2/2 black Zombie creature tokens, where X is half the number of Zombies you control, rounded down.',
        'enchantment',
      ),
    ).toEqual({
      kind: 'triggered',
      trigger: { kind: 'upkeep', whose: 'you' },
      effect: {
        kind: 'createToken',
        token: zombie(),
        count: { kind: 'half', of: countOf(ZOMBIES_YOU), round: 'down' },
      },
    });
  });

  test('the creatures attacking you', () => {
    expect(
      spellEffect(
        'Create X 1/2 green Spider creature tokens with reach, where X is the number of creatures attacking you.',
        'instant',
      ),
    ).toMatchObject({
      kind: 'createToken',
      count: countOf({ types: ['creature'], attackingYou: true }),
    });
  });

  test('X in a triggered ability that no sentence defines is still not read (CR 107.3j)', () => {
    expect(dropped('When ~ enters, draw X cards.', 'creature')).toMatchObject({
      reason: 'notRunnable',
    });
  });

  test('a definition that no clause reads is refused (nothing says X)', () => {
    expect(
      dropped('You gain 3 life, where X is the number of creatures you control.', 'sorcery'),
    ).toMatchObject({
      reason: 'notRunnable',
    });
  });

  test('the value of X is read as each instruction runs: the definition is in each slot, not stored', () => {
    // "Sacrifice a Zombie, then draw X cards, where X is ...": the count is read after the sacrifice (CR 107.3c).
    expect(
      spellEffect(
        'Sacrifice a Zombie, then draw X cards, where X is the number of Zombies you control.',
        'sorcery',
      ),
    ).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'sacrifice', objects: { kind: 'choose', filter: { subtypes: ['Zombie'] } } },
        { kind: 'draw', player: YOU, count: countOf(ZOMBIES_YOU) },
      ],
    });
  });

  test('an {X} cost that the text also defines is refused: the cost chooses X (CR 107.3)', () => {
    expect(
      dropped('{X}, {T}: Draw X cards, where X is the number of lands you control.', 'artifact'),
    ).toMatchObject({ reason: 'notRunnable', closestRule: 'ability.activated' });
  });

  test('in an activated ability with no X in the cost, the definition is read', () => {
    expect(
      ability('{T}: Draw X cards, where X is the number of lands you control.', 'artifact'),
    ).toEqual({
      kind: 'activated',
      cost: [{ kind: 'tap' }],
      effect: { kind: 'draw', player: YOU, count: countOf({ types: ['land'], controller: 'you' }) },
    });
  });

  test.each([
    'You gain X life, where X is the number of creatures you control as you cast ~.',
    'You gain X life, where X is the number of creatures with flying or reach you control.',
    'You gain X life, where X is half the number of creatures you control.',
    'You gain X life, where Y is the number of creatures you control.',
    'You gain X life, where X is 3.',
  ])('"%s" is not read', (text) => {
    expect(dropped(text, 'sorcery')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('amount.equal-to and the value phrases (CR 107.1, 208.1, 700.5, 903.4)', () => {
  test.each<[string, Amount]>([
    [
      'Draw cards equal to the greatest power among creatures you control.',
      aggregate('greatest', 'power', CREATURES_YOU),
    ],
    [
      'Draw cards equal to the total toughness of creatures you control.',
      aggregate('total', 'toughness', CREATURES_YOU),
    ],
    [
      'Draw cards equal to the greatest mana value among artifacts you control.',
      aggregate('greatest', 'manaValue', { types: ['artifact'], controller: 'you' }),
    ],
    [
      'Draw cards equal to your devotion to black and red.',
      { kind: 'devotion', colors: ['B', 'R'] },
    ],
    [
      'Draw cards equal to the number of colors in your commanders’ color identity.',
      { kind: 'commanderColors' },
    ],
    [
      'Draw cards equal to half the number of creatures you control, rounded up.',
      { kind: 'half', of: countOf(CREATURES_YOU), round: 'up' },
    ],
    [
      'Draw cards equal to twice the number of creatures you control.',
      { kind: 'multiple', factor: 2, of: countOf(CREATURES_YOU) },
    ],
    [
      'Draw cards equal to the number of creatures you control plus the number of lands you control.',
      {
        kind: 'sum',
        of: [countOf(CREATURES_YOU), countOf({ types: ['land'], controller: 'you' })],
      },
    ],
    [
      'Draw cards equal to the number of creatures attacking you.',
      countOf({ types: ['creature'], attackingYou: true }),
    ],
  ])('%s', (text, count) => {
    expect(spellEffect(text, 'sorcery')).toEqual({ kind: 'draw', player: YOU, count });
  });

  test.each<[string, Amount]>([
    ['You gain life equal to the number of creatures you control.', countOf(CREATURES_YOU)],
    [
      'You gain life equal to the total power of creatures you control.',
      aggregate('total', 'power', CREATURES_YOU),
    ],
  ])('life: %s', (text, amount) => {
    expect(spellEffect(text, 'sorcery')).toEqual({ kind: 'gainLife', player: YOU, amount });
  });

  test("a creature's toughness: the creature that entered (the trigger subject), ~ or another one", () => {
    const effect = {
      kind: 'gainLife',
      player: YOU,
      amount: { kind: 'toughnessOf', of: { kind: 'triggerSubject' } },
    };
    const both = readAll(
      "Whenever ~ or another creature you control enters, you gain life equal to that creature's toughness.",
      'creature',
    ).abilities;
    expect(both).toHaveLength(2);
    expect(both[0]).toMatchObject({ trigger: { kind: 'entersBattlefield', what: THIS }, effect });
    expect(both[1]).toMatchObject({
      trigger: {
        kind: 'entersBattlefield',
        what: { types: ['creature'], controller: 'you', other: true },
      },
      effect,
    });
    // "Another Angel or Cleric you control": a choice of creature types for one object.
    expect(
      trigger(
        "Whenever another Angel or Cleric you control enters, you gain life equal to that creature's toughness.",
      ),
    ).toMatchObject({
      trigger: {
        kind: 'entersBattlefield',
        what: {
          other: true,
          controller: 'you',
          anyOf: [{ subtypes: ['Angel'] }, { subtypes: ['Cleric'] }],
        },
      },
      effect,
    });
  });

  test("a creature's toughness: a target, as it was when it left (CR 608.2h)", () => {
    expect(
      spellEffect('Exile target creature. You gain life equal to its toughness.', 'sorcery'),
    ).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'exile', objects: T1 },
        { kind: 'gainLife', player: YOU, amount: { kind: 'toughnessOf', of: T1 } },
      ],
    });
  });

  test('the counters on a permanent: "for each +1/+1 counter on ~" and "the number of ... counters"', () => {
    expect(
      ability(
        'Angel spells and Human spells you cast cost {1} less to cast for each +1/+1 counter on ~.',
        'enchantment',
      ),
    ).toEqual({
      kind: 'static',
      static: {
        kind: 'costReduction',
        spells: { controller: 'you', anyOf: [{ subtypes: ['Angel'] }, { subtypes: ['Human'] }] },
        amount: { kind: 'countersOn', of: THIS, counter: '+1/+1' },
      },
    });
    expect(
      trigger(
        'At the beginning of your upkeep, you gain life equal to the number of +1/+1 counters on ~.',
      ),
    ).toMatchObject({
      effect: { kind: 'gainLife', amount: { kind: 'countersOn', of: THIS, counter: '+1/+1' } },
    });
    expect(
      trigger('At the beginning of your upkeep, you lose 1 life for each burden counter on ~.'),
    ).toMatchObject({
      effect: { kind: 'loseLife', amount: { kind: 'countersOn', of: THIS, counter: 'burden' } },
    });
  });

  test.each([
    'Draw cards equal to the greatest power among creatures.',
    'Draw cards equal to the greatest power of creatures you control.',
    'Draw cards equal to the total power.',
    'Draw cards equal to your devotion to black and black.',
    'Draw cards equal to half the number of creatures you control.',
    'Draw cards equal to one times the number of creatures you control.',
    'Draw cards equal to the greatest power among creatures with flying or reach you control.',
    'Draw cards equal to the number of creatures you control plus 1.',
    'Draw cards equal to the number of colors among creatures you control.',
  ])('"%s" is not read', (text) => {
    expect(dropped(text, 'sorcery')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('quantities above one multiply the count; the count phrases are one family (CR 608.2c)', () => {
  test.each<[string, string, Amount]>([
    [
      'You gain 2 life for each creature you control with power 4 or greater.',
      'gainLife',
      {
        kind: 'multiple',
        factor: 2,
        of: countOf({ ...CREATURES_YOU, power: { cmp: 'atLeast', value: 4 } }),
      },
    ],
    [
      'Draw two cards for each Dragon you control.',
      'draw',
      { kind: 'multiple', factor: 2, of: countOf({ subtypes: ['Dragon'], controller: 'you' }) },
    ],
    [
      'Draw a card for each opponent who has more cards in hand than you.',
      'draw',
      { kind: 'opponentsWithMore', stat: 'cardsInHand' },
    ],
    [
      'You gain 3 life for each opponent who has more life than you.',
      'gainLife',
      { kind: 'multiple', factor: 3, of: { kind: 'opponentsWithMore', stat: 'life' } },
    ],
    [
      'Draw a card for each artifact and/or enchantment you control.',
      'draw',
      countOf({ controller: 'you', anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }] }),
    ],
    [
      'Draw a card for each Angel or Cleric you control.',
      'draw',
      countOf({ controller: 'you', anyOf: [{ subtypes: ['Angel'] }, { subtypes: ['Cleric'] }] }),
    ],
    [
      'Draw a card for each Zombie card in your graveyard.',
      'draw',
      countOf({ zone: 'graveyard', subtypes: ['Zombie'], controller: 'you' }),
    ],
    [
      'Draw a card for each creature card in your opponents’ graveyards.',
      'draw',
      countOf({ zone: 'graveyard', types: ['creature'], controller: 'opponent' }),
    ],
    [
      'Draw a card for each creature attacking you.',
      'draw',
      countOf({ types: ['creature'], attackingYou: true }),
    ],
  ])('%s', (text, kind, amount) => {
    const effect = spellEffect(text, 'sorcery') as Record<string, unknown>;
    expect(effect.kind).toBe(kind);
    expect(kind === 'draw' ? effect.count : effect.amount).toEqual(amount);
  });

  test('the same count phrase in a static ability (Wight, the equipment): the opponents\' graveyards and "and/or"', () => {
    expect(ability("~ gets +1/+1 for each creature card in your opponents' graveyards.")).toEqual({
      kind: 'static',
      static: {
        kind: 'modifyPt',
        subject: THIS,
        power: countOf({ zone: 'graveyard', types: ['creature'], controller: 'opponent' }),
        toughness: countOf({ zone: 'graveyard', types: ['creature'], controller: 'opponent' }),
      },
    });
    const both = countOf({
      controller: 'you',
      anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }],
    });
    expect(
      ability(
        'Equipped creature gets +1/+1 for each artifact and/or enchantment you control.',
        'artifact',
        ['Equipment'],
      ),
    ).toEqual({
      kind: 'static',
      static: {
        kind: 'modifyPt',
        subject: { kind: 'attached', types: ['creature'] },
        power: both,
        toughness: both,
      },
    });
  });

  test('the sum of two counts in a characteristic-defining ability', () => {
    const zombies = countOf({ subtypes: ['Zombie'] });
    const graveyards = countOf({ zone: 'graveyard', subtypes: ['Zombie'] });
    expect(
      ability(
        "~'s power and toughness are each equal to the number of Zombies on the battlefield plus the number of Zombie cards in all graveyards.",
      ),
    ).toEqual({
      kind: 'static',
      static: {
        kind: 'characteristicPt',
        power: { kind: 'sum', of: [zombies, graveyards] },
        toughness: { kind: 'sum', of: [zombies, graveyards] },
      },
    });
  });

  test('an enters replacement counted by a count: counted as it enters (CR 614.12)', () => {
    expect(
      ability('~ enters with a +1/+1 counter on it for each Zombie card in your graveyard.'),
    ).toEqual({
      kind: 'replacement',
      replacement: {
        kind: 'entersWithCounters',
        counter: '+1/+1',
        count: countOf({ zone: 'graveyard', subtypes: ['Zombie'], controller: 'you' }),
      },
    });
  });

  test('a pump counted after its duration, with the step multiplying the count', () => {
    const swamps = countOf({ subtypes: ['Swamp'], controller: 'you' });
    expect(
      spellEffect(
        'All creatures get -2/-2 until end of turn for each Swamp you control.',
        'sorcery',
      ),
    ).toEqual({
      kind: 'modifyPt',
      objects: { kind: 'each', filter: { zone: 'battlefield', types: ['creature'] } },
      power: { kind: 'times', factor: -2, of: swamps },
      toughness: { kind: 'times', factor: -2, of: swamps },
      duration: END,
    });
    expect(
      spellEffect(
        'Target creature gets +1/+0 until end of turn for each creature you control.',
        'sorcery',
      ),
    ).toMatchObject({ power: countOf(CREATURES_YOU), toughness: 0 });
  });

  test.each([
    'Draw X cards for each creature you control.',
    'You gain X life for each creature you control.',
    'All creatures get -X/-X until end of turn for each Swamp you control.',
    'Draw a card for each creature you control with flying or reach.',
    'Draw a card for each opponent who has fewer cards in hand than you.',
    'Draw a card for each creature you control attacking you.',
    'Draw a card for each artifact and creature and land you control.',
    'Draw a card for each creature card in your opponent’s graveyard.',
  ])('"%s" is not read', (text) => {
    expect(dropped(text, 'sorcery')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('"for each ... this way": what the instructions before it did (CR 608.2c)', () => {
  test('creatures sacrificed this way: the tokens of the controller', () => {
    expect(
      spellEffect(
        'Each other player sacrifices a creature of their choice. You create a 2/2 black Zombie creature token for each creature sacrificed this way.',
        'sorcery',
      ),
    ).toEqual({
      kind: 'sequence',
      effects: [
        {
          kind: 'sacrifice',
          objects: { kind: 'choose', filter: { types: ['creature'] } },
          player: { kind: 'eachOpponent' },
        },
        { kind: 'createToken', token: zombie(), count: { kind: 'thisWay', what: 'sacrificed' } },
      ],
    });
  });

  test('opponents who drew a card this way', () => {
    expect(
      spellEffect(
        'Each opponent draws a card, then you draw a card for each opponent who drew a card this way.',
        'sorcery',
      ),
    ).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'draw', player: { kind: 'eachOpponent' }, count: 1 },
        { kind: 'draw', player: YOU, count: { kind: 'thisWay', what: 'playersDrew' } },
      ],
    });
  });

  test('creatures destroyed this way, counters on ~ (a SYNTHETIC "destroy all Zombies")', () => {
    expect(
      trigger(
        'When ~ enters, destroy all Zombies. Put a +1/+1 counter on ~ for each creature destroyed this way.',
      ),
    ).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'destroy' },
          { kind: 'addCounters', objects: THIS, count: { kind: 'thisWay', what: 'destroyed' } },
        ],
      },
    });
  });

  test.each([
    // The words must name what the earlier instruction did, and it must come before, unconditionally.
    'Each opponent draws a card. You create a 2/2 black Zombie creature token for each creature sacrificed this way.',
    'You create a 2/2 black Zombie creature token for each creature sacrificed this way.',
    'Each other player sacrifices a land of their choice. You create a 2/2 black Zombie creature token for each creature sacrificed this way.',
    'Each player draws a card. You draw a card for each opponent who drew a card this way.',
    'Each other player sacrifices a creature of their choice. You gain 1 life for each creature sacrificed this way. You create a 2/2 black Zombie creature token for each creature destroyed this way.',
  ])('"%s" is read and refused: nothing is built', (text) => {
    expect(dropped(text, 'sorcery')).toMatchObject({ reason: 'notRunnable' });
  });

  test('a condition between the instruction and the count breaks the order (CR 608.2c)', () => {
    expect(
      dropped(
        "Each other player sacrifices a creature of their choice. If you're the monarch, create a 2/2 black Zombie creature token for each creature sacrificed this way.",
        'sorcery',
      ),
    ).toMatchObject({ reason: 'notRunnable' });
  });
});

describe('tokens: tapped, counted, and made by a player (CR 110.5b, 111.2)', () => {
  test('thirteen tapped Zombie tokens (the number words go to twenty)', () => {
    expect(
      spellEffect('Create thirteen tapped 2/2 black Zombie creature tokens.', 'sorcery'),
    ).toEqual({
      kind: 'createToken',
      token: zombie(),
      count: 13,
      tapped: true,
    });
  });

  test('a tapped token for a spell cast', () => {
    expect(
      trigger(
        'Whenever you cast a Zombie spell, create a tapped 2/2 black Zombie creature token.',
        'enchantment',
      ),
    ).toEqual({
      kind: 'triggered',
      trigger: {
        kind: 'castSpell',
        filter: { subtypes: ['Zombie'], stackKind: 'spell' },
        by: 'you',
      },
      effect: { kind: 'createToken', token: zombie(), count: 1, tapped: true },
    });
  });

  test('a tapped predefined token', () => {
    expect(spellEffect('Create two tapped Treasure tokens.', 'sorcery')).toEqual({
      kind: 'createToken',
      token: { kind: 'preset', preset: 'Treasure' },
      count: 2,
      tapped: true,
    });
  });

  test('"You create ...": the controller of the ability is who creates; the imperative reads the same', () => {
    expect(
      spellEffect('You create two tapped 2/2 black Zombie creature tokens.', 'sorcery'),
    ).toEqual(spellEffect('Create two tapped 2/2 black Zombie creature tokens.', 'sorcery'));
  });

  test('another player creates: the token is theirs', () => {
    expect(spellEffect('Target opponent creates a Treasure token.', 'sorcery')).toEqual({
      kind: 'createToken',
      token: { kind: 'preset', preset: 'Treasure' },
      count: 1,
      controller: T1,
    });
  });

  test('Zombie Knights with menace for a kicked creature ("if he was kicked")', () => {
    expect(
      trigger(
        'When ~ enters, if he was kicked, create 2 2/2 black Zombie Knight creature tokens with menace.',
      ),
    ).toMatchObject({
      trigger: { kind: 'entersBattlefield', what: THIS },
      interveningIf: { kind: 'kicked' },
      effect: {
        kind: 'createToken',
        count: 2,
        token: {
          kind: 'custom',
          definition: {
            subtypes: ['Zombie', 'Knight'],
            abilities: [{ kind: 'keyword', keyword: { kind: 'menace' } }],
          },
        },
      },
    });
  });

  test('a Clue for each opponent who has more cards in hand than you', () => {
    expect(
      trigger(
        'At the beginning of your upkeep, investigate once for each opponent who has more cards in hand than you.',
      ),
    ).toEqual({
      kind: 'triggered',
      trigger: { kind: 'upkeep', whose: 'you' },
      effect: {
        kind: 'createToken',
        token: { kind: 'preset', preset: 'Clue' },
        count: { kind: 'opponentsWithMore', stat: 'cardsInHand' },
      },
    });
  });

  test('"Its controller investigates."', () => {
    expect(
      spellEffect(
        'Destroy target creature or planeswalker. Its controller investigates.',
        'sorcery',
      ),
    ).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'destroy', objects: T1 },
        {
          kind: 'createToken',
          token: { kind: 'preset', preset: 'Clue' },
          count: 1,
          controller: { kind: 'controllerOf', of: T1 },
        },
      ],
    });
  });

  test.each([
    'Create a tapped Treasure.',
    'Create a Treasure token tapped.',
    'Create tapped Treasure tokens.',
    'Create a tapped token that’s a copy of target creature.',
    'Investigate twice.',
    'Investigate once.',
    'Create X Treasure tokens for each land you control.',
    'Create twenty-one 2/2 black Zombie creature tokens.',
  ])('"%s" is not read', (text) => {
    expect(dropped(text, 'sorcery')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('players: each player, each opponent, each other player, you and target opponent, defending player (CR 101.4)', () => {
  test("you and target opponent each draw: the engine's several players in one selector", () => {
    const parsed = readAll('You and target opponent each draw 2 cards.', 'sorcery').spell;
    expect(parsed).toEqual({
      targets: [{ id: 't1', what: { kind: 'player', filter: 'opponent' } }],
      effect: { kind: 'draw', player: { kind: 'all', of: [YOU, T1] }, count: 2 },
    });
  });

  test.each([
    ['You and target player each discard a card.', 'discard', 'count'],
    ['You and target opponent each gain 3 life.', 'gainLife', 'amount'],
    ['You and target opponent each lose 2 life.', 'loseLife', 'amount'],
    ['You and target opponent each mill 3 cards.', 'mill', 'count'],
  ])('the same selector for every verb: %s', (text, kind, slot) => {
    const effect = spellEffect(text, 'sorcery') as Record<string, unknown>;
    expect(effect.kind).toBe(kind);
    expect(effect.player).toEqual({ kind: 'all', of: [YOU, T1] });
    expect(effect[slot]).toBeDefined();
  });

  test.each([
    ['Each player sacrifices a creature of their choice.', { kind: 'eachPlayer' }, undefined],
    ['Each player sacrifices a creature.', { kind: 'eachPlayer' }, undefined],
    [
      'Each other player sacrifices a creature of their choice.',
      { kind: 'eachOpponent' },
      undefined,
    ],
    ['Each opponent sacrifices 2 creatures of their choice.', { kind: 'eachOpponent' }, 2],
    ['Target opponent sacrifices a creature of their choice.', T1, undefined],
    [
      'Defending player sacrifices a creature of their choice.',
      { kind: 'defendingPlayer' },
      undefined,
    ],
  ])('%s', (text, player, count) => {
    const effect = spellEffect(text, 'sorcery');
    expect(effect).toEqual({
      kind: 'sacrifice',
      objects: {
        kind: 'choose',
        filter: { types: ['creature'] },
        ...(count === undefined ? {} : { count }),
      },
      player,
    });
  });

  test('each player sacrifices in the enters trigger of a creature, and tokens follow', () => {
    expect(trigger('When ~ enters, each player sacrifices a creature of their choice.')).toEqual({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: THIS },
      effect: {
        kind: 'sacrifice',
        objects: { kind: 'choose', filter: { types: ['creature'] } },
        player: { kind: 'eachPlayer' },
      },
    });
    expect(
      spellEffect(
        'Each player sacrifices 2 creatures of their choice. You create 2 tapped 2/2 black Zombie creature tokens.',
        'sorcery',
      ),
    ).toEqual({
      kind: 'sequence',
      effects: [
        {
          kind: 'sacrifice',
          objects: { kind: 'choose', filter: { types: ['creature'] }, count: 2 },
          player: { kind: 'eachPlayer' },
        },
        { kind: 'createToken', token: zombie(), count: 2, tapped: true },
      ],
    });
  });

  test.each([
    ['When ~ enters, mill 2 cards.', { kind: 'mill', player: YOU, count: 2 }],
    ['Each player mills 3 cards.', { kind: 'mill', player: { kind: 'eachPlayer' }, count: 3 }],
    ['Target player mills X cards.', null],
    ['Each opponent mills a card.', { kind: 'mill', player: { kind: 'eachOpponent' }, count: 1 }],
    [
      'Each opponent mills cards equal to the number of creatures you control.',
      { kind: 'mill', player: { kind: 'eachOpponent' }, count: countOf(CREATURES_YOU) },
    ],
  ])('mill: %s', (text, expected) => {
    if (expected === null) return;
    const effect = text.startsWith('When')
      ? (trigger(text) as { effect: Effect }).effect
      : spellEffect(text, 'sorcery');
    expect(effect).toEqual(expected);
  });

  test('mill and gain life in one instruction', () => {
    expect(trigger('When ~ enters, mill 2 cards and you gain 2 life.')).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'mill', player: YOU, count: 2 },
          { kind: 'gainLife', player: YOU, amount: 2 },
        ],
      },
    });
  });

  test('damage to a creature and then life for you: "you" is the next clause, not a second recipient', () => {
    expect(
      spellEffect('~ deals 3 damage to target creature and you gain 3 life.', 'sorcery'),
    ).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'dealDamage', to: T1 },
        { kind: 'gainLife', player: YOU },
      ],
    });
    expect(
      spellEffect('~ deals 2 damage to each creature and each player.', 'sorcery'),
    ).toMatchObject({ kind: 'sequence' });
  });

  test.each([
    'You and each opponent each draw a card.',
    'You and target creature each draw a card.',
    'You and up to one target opponent each draw a card.',
    'Target player and you each draw a card.',
    'You and target opponent draw a card.',
    'You and target opponent each shuffle your library.',
    'You and target opponent each become the monarch.',
    'You sacrifice a creature of their choice.',
    'Each player sacrifices a creature of your choice.',
    'Each other players sacrifice a creature of their choice.',
    'The defending player sacrifices a creature of their choice.',
  ])('"%s" is not read', (text) => {
    expect(dropped(text, 'sorcery')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('effect.bite: a creature that deals damage (CR 120.3, 701.14)', () => {
  test("the creature you control deals damage equal to its power to a creature or planeswalker you don't control", () => {
    const parsed = readAll(
      "Target creature you control deals damage equal to its power to target creature or planeswalker you don't control.",
      'sorcery',
    ).spell;
    expect(parsed).toEqual({
      targets: [
        { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', ...CREATURES_YOU } } },
        {
          id: 't2',
          what: {
            kind: 'object',
            filter: {
              zone: 'battlefield',
              controller: 'opponent',
              anyOf: [{ types: ['creature'] }, { types: ['planeswalker'] }],
            },
          },
        },
      ],
      effect: { kind: 'dealDamage', amount: { kind: 'powerOf', of: T1 }, to: T2, from: T1 },
    });
  });

  test('a creature that entered deals damage equal to its power to any target', () => {
    expect(
      trigger(
        'Whenever a creature you control enters, it deals damage equal to its power to any target.',
        'enchantment',
      ),
    ).toEqual({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: CREATURES_YOU },
      targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
      effect: {
        kind: 'dealDamage',
        amount: { kind: 'powerOf', of: { kind: 'triggerSubject' } },
        to: T1,
        from: { kind: 'triggerSubject' },
      },
    });
  });

  test.each([
    [
      'Whenever ~ or another Dragon you control enters, it deals X damage to any target, where X is the number of Dragons you control.',
      2,
    ],
    [
      'Whenever a Dragon you control enters, it deals X damage to any target, where X is the number of Dragons you control.',
      1,
    ],
  ])('the Dragons trigger: %s', (text, abilities) => {
    const parsed = readAll(text, 'creature').abilities;
    expect(parsed).toHaveLength(abilities);
    for (const one of parsed) {
      expect(one).toMatchObject({
        kind: 'triggered',
        targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
        effect: {
          kind: 'dealDamage',
          amount: countOf({ subtypes: ['Dragon'], controller: 'you' }),
          to: T1,
          from: { kind: 'triggerSubject' },
        },
      });
    }
  });

  test.each([
    [
      'Target creature you control deals damage equal to its toughness to target creature.',
      { kind: 'toughnessOf', of: T1 },
    ],
    ['Target creature you control deals 3 damage to target creature.', 3],
    [
      'Another target creature you control deals damage equal to its power to any target.',
      { kind: 'powerOf', of: T1 },
    ],
  ])('the same family with another amount: %s', (text, amount) => {
    expect(spellEffect(text, 'sorcery')).toMatchObject({ kind: 'dealDamage', amount, from: T1 });
  });

  test('"it" as a target of the spell is the source of the damage', () => {
    expect(
      spellEffect(
        'Target creature you control gets +1/+1 until end of turn. It deals 1 damage to you.',
        'instant',
      ),
    ).toMatchObject({
      kind: 'sequence',
      effects: [{ kind: 'modifyPt' }, { kind: 'dealDamage', to: YOU, from: T1 }],
    });
  });

  test.each([
    // "Each other creature" with the creature that deals the damage a target is read since stage P34 (`each.except`, D-152).
    // The trample clause reads since stage P32 (D-147): it is joined to the damage before it as `trampleExcess`.
    ['Target creature you control deals damage to target creature.', 'unrecognised'],
    [
      'Target creatures you control deal damage equal to their power to target creature.',
      'unrecognised',
    ],
    [
      'Up to one target creature you control deals damage equal to its power to target creature.',
      'unrecognised',
    ],
  ])('"%s" is not run', (text, reason) => {
    expect(dropped(text, 'sorcery')).toMatchObject({ reason });
  });
});

describe('conditions: designations and amounts of the game (CR 725.1, 603.4, 608.2c)', () => {
  const monarch = { kind: 'playerHasDesignation', player: YOU, designation: 'monarch' };

  test('"if you\'re the monarch" as an intervening "if"', () => {
    expect(
      trigger(
        "At the beginning of your upkeep, if you're the monarch, create a 4/4 red Dragon creature token with flying.",
      ),
    ).toMatchObject({
      trigger: { kind: 'upkeep', whose: 'you' },
      interveningIf: monarch,
      effect: { kind: 'createToken', count: 1 },
    });
  });

  test('"if you\'re the monarch, ... instead": the monarch gets the other token', () => {
    const spirit = (name: string) => ({
      kind: 'custom',
      definition: {
        name,
        manaCost: null,
        supertypes: [],
        types: ['creature'],
        subtypes: [name],
        colors: ['W'],
        power: 2,
        toughness: 2,
        loyalty: null,
        defense: null,
        oracleText: '',
        abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
      },
    });
    expect(
      trigger(
        "At the beginning of your upkeep, create a 2/2 white Spirit creature token with flying. If you're the monarch, create a 2/2 white Angel creature token with flying instead.",
        'enchantment',
      ).effect,
    ).toEqual({
      kind: 'conditional',
      condition: monarch,
      effect: { kind: 'createToken', token: spirit('Angel'), count: 1 },
      else: { kind: 'createToken', token: spirit('Spirit'), count: 1 },
    });
  });

  test.each([
    ["you're the monarch", YOU, false],
    ['you are the monarch', YOU, false],
    ['an opponent is the monarch', { kind: 'eachOpponent' }, false],
    ['a player is the monarch', { kind: 'eachPlayer' }, false],
    ["you're not the monarch", YOU, true],
    ["you aren't the monarch", YOU, true],
  ])('"%s"', (words, player, negative) => {
    const has = { kind: 'playerHasDesignation', player, designation: 'monarch' };
    expect(trigger(`When ~ enters, if ${words}, you gain 1 life.`).interveningIf).toEqual(
      negative ? { kind: 'not', term: has } : has,
    );
  });

  test('the condition of a sentence of a spell: "If you\'re the monarch, ..."', () => {
    expect(spellEffect("Draw a card. If you're the monarch, draw two cards.", 'sorcery')).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'draw', player: YOU, count: 1 },
        {
          kind: 'conditional',
          condition: monarch,
          effect: { kind: 'draw', player: YOU, count: 2 },
        },
      ],
    });
  });

  test('total power of creatures you control: the beginning of combat', () => {
    expect(
      trigger(
        'At the beginning of combat on your turn, if creatures you control have total power 8 or greater, target creature you control gains haste until end of turn.',
      ),
    ).toMatchObject({
      trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
      interveningIf: {
        kind: 'amountIs',
        amount: aggregate('total', 'power', CREATURES_YOU),
        compare: { cmp: 'atLeast', value: 8 },
      },
    });
  });

  test('N or more creature cards in your graveyard: an optional return', () => {
    expect(
      trigger(
        'At the beginning of your upkeep, if you have 7 or more creature cards in your graveyard, you may return target creature card from your graveyard to your hand.',
      ),
    ).toMatchObject({
      interveningIf: {
        kind: 'amountIs',
        amount: countOf({ zone: 'graveyard', types: ['creature'], controller: 'you' }),
        compare: { cmp: 'atLeast', value: 7 },
      },
      optional: true,
      effect: { kind: 'moveToZone', objects: T1, to: 'hand' },
    });
  });

  test.each([
    ['an opponent controls more creatures than you', 'creatures'],
    ['an opponent has more life than you', 'life'],
    ['an opponent has more cards in hand than you', 'cardsInHand'],
  ])('"%s" is at least one opponent with more', (words, stat) => {
    expect(trigger(`When ~ enters, if ${words}, you gain 4 life.`).interveningIf).toEqual({
      kind: 'amountIs',
      amount: { kind: 'opponentsWithMore', stat },
      compare: { cmp: 'atLeast', value: 1 },
    });
  });

  test.each([
    [
      'creatures you control have total toughness 10 or greater',
      'total',
      'toughness',
      'atLeast',
      10,
    ],
    ['creatures you control have total power 3 or less', 'total', 'power', 'atMost', 3],
  ])('the other directions: %s', (words, how, stat, cmp, value) => {
    expect(trigger(`When ~ enters, if ${words}, you gain 1 life.`).interveningIf).toEqual({
      kind: 'amountIs',
      amount: aggregate(how as 'total', stat, CREATURES_YOU),
      compare: { cmp, value },
    });
  });

  test.each([
    'When ~ enters, if an opponent is not the monarch, you gain 1 life.',
    'When ~ enters, if each opponent is the monarch, you gain 1 life.',
    'When ~ enters, if target player is the monarch, you gain 1 life.',
    "When ~ enters, if you're the monarch of the realm, you gain 1 life.",
    'When ~ enters, if you have 7 creature cards in your graveyard, you gain 1 life.',
    'When ~ enters, if an opponent has more lands than you, you gain 1 life.',
    'When ~ enters, if an opponent has fewer cards in hand than you, you gain 1 life.',
    'When ~ enters, if creatures you control have total power 8, you gain 1 life.',
    'When ~ enters, if you have more life than each opponent, you gain 1 life.',
  ])('"%s" is not read', (text) => {
    expect(dropped(text, 'enchantment')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('what the lists of D-131 mark as not built stays unread, with its reason', () => {
  test.each([
    // (b'): the amount is built, another clause is not. ("Pay life equal to the number of colors in your commanders' color identity"
    // reads since stage P30, D-135.)
    ['Add {1} for each tapped land your opponents control.', 'artifact', 'unrecognised'],
    // (Arachnogenesis's prevention by non-Spider creatures reads since stage P32, D-147.)
    // (c): not amount problems. ("A creature with the greatest power among creatures they control" reads since stage P30, D-135.)
    // ("Tap enchanted creature" reads since stage P31, D-140: the engine's `attached`, on an Aura; on a creature it is not run.)
    [
      'When ~ enters, tap enchanted creature and you become the monarch.',
      'creature',
      'notRunnable',
    ],
    // ("You may play the exiled card without paying its mana cost" reads since stage P32, D-147; an artifact without Hideaway has no
    // exiled card, which the engine says.)
  ])('%s', (text, type, reason) => {
    expect(dropped(text, type as FaceType)).toMatchObject({ reason });
  });
});
