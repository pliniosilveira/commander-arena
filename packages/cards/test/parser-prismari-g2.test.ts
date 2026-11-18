// The Prismari deck (issue 87), group 2 (D-633 and later): the lines of Prismari Pianist, Rootha, Renegade Bull, Manaform Hellkite, Magma Opus, Furygale Flocking, Leitmotif Composer,
// Restless Spire, Galazeth Prismari, Brazen Borrower, Deep Analysis and Rousing Refrain. The first line of each block is the real Oracle text of the acceptance card read through the whole
// pipeline (with `~` for the card's own name); the other lines are near misses the grammar must not read (another comparison, another quantity of the spell, another duration, another
// zone, a name that is not the card's own). The engine runs what is lowered in convert-grammar-engine-prismari-g2.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { read, readAll, withoutFeature } from './parser-p5-helpers';

const NOT_READ = (text: string, type: Parameters<typeof read>[1] = 'creature') => {
  const parsed = read(text, type);
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.spell ?? null, text).toBeNull();
  expect(parsed.unparsed, text).toHaveLength(1);
};

const ELEMENTAL = (power: number, toughness: number, abilities: readonly object[] = []) => ({
  name: 'Elemental',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Elemental'],
  colors: ['U', 'R'],
  power,
  toughness,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities,
});
const FLYING = { kind: 'keyword', keyword: { kind: 'flying' } } as const;
const HASTE = { kind: 'keyword', keyword: { kind: 'haste' } } as const;
const INSTANT_OR_SORCERY = [{ types: ['instant'] }, { types: ['sorcery'] }];
const CAST_INSTANT_OR_SORCERY = {
  kind: 'castSpell',
  filter: { stackKind: 'spell', anyOf: INSTANT_OR_SORCERY },
  by: 'you',
} as const;
const SPELL_MANA_VALUE = { kind: 'manaValueOf', of: { kind: 'triggerSubject' } } as const;

describe('Prismari Pianist: three tokens instead of one when the spell’s mana value is 5 or greater (CR 202.3)', () => {
  const REAL =
    "Whenever you cast an instant or sorcery spell, create a 1/1 blue and red Elemental creature token. If that spell's mana value is 5 or greater, create three of those tokens instead.";
  const token = (count: number) => ({
    kind: 'createToken',
    token: { kind: 'custom', definition: ELEMENTAL(1, 1) },
    count,
  });

  test('the real line: a conditional on the mana value of the spell cast, three instead of one', () => {
    expect(readAll(REAL).abilities).toEqual([
      {
        kind: 'triggered',
        trigger: CAST_INSTANT_OR_SORCERY,
        effect: {
          kind: 'conditional',
          condition: {
            kind: 'objectMatches',
            of: { kind: 'triggerSubject' },
            filter: { manaValue: { cmp: 'atLeast', value: 5 } },
          },
          effect: token(3),
          else: token(1),
        },
      },
    ]);
  });

  test('without "instead" the three come on top of the one: a sequence, not a replacement', () => {
    const parsed = readAll(REAL.replace(' instead', ''));
    expect(parsed.abilities[0]).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [token(1), { kind: 'conditional', effect: token(3) }],
      },
    });
  });

  test('not read: "5 or less", "that creature’s" mana value', () => {
    NOT_READ(REAL.replace('5 or greater', '5 or less'));
    NOT_READ(REAL.replace("that spell's", "that creature's"));
  });
});

describe('Rootha, Mastering the Moment: X is the greatest mana value among the spells cast this turn (CR 601.2i)', () => {
  const REAL =
    "At the beginning of combat on your turn, if you've cast an instant or sorcery spell this turn, create an X/X blue and red Elemental creature token with flying and haste, where X is the greatest mana value among instant and sorcery spells you've cast this turn.";

  test('the real line: an intervening if, and an X/X token whose size is the greatest mana value cast', () => {
    expect(readAll(REAL).abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
        effect: {
          kind: 'createToken',
          token: {
            kind: 'custom',
            definition: ELEMENTAL(0, 0, [FLYING, HASTE]),
            ptAmount: { kind: 'greatestManaValueCast', ofTypes: ['instant', 'sorcery'] },
          },
          count: 1,
        },
        interveningIf: { kind: 'spellsCastThisTurn', atLeast: 1, ofTypes: ['instant', 'sorcery'] },
      },
    ]);
  });

  test('without the intervening if the line is still read', () => {
    readAll(REAL.replace("if you've cast an instant or sorcery spell this turn, ", ''));
  });

  test('not read: the greatest power, the spells of the opponents', () => {
    NOT_READ(REAL.replace('greatest mana value', 'greatest power'));
    NOT_READ(REAL.replace("spells you've cast", 'spells your opponents have cast'));
  });
});

describe('Renegade Bull: +X/+0 where X is the mana value of the spell cast, and the copy of an exiled card (CR 707.12)', () => {
  test('the pump: the mana value of the trigger’s spell, until end of turn', () => {
    const parsed = readAll(
      "Whenever you cast an instant or sorcery spell, ~ gets +X/+0 until end of turn, where X is that spell's mana value.",
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: CAST_INSTANT_OR_SORCERY,
        effect: {
          kind: 'modifyPt',
          objects: { kind: 'this' },
          power: SPELL_MANA_VALUE,
          toughness: 0,
          duration: 'untilEndOfTurn',
        },
      },
    ]);
  });

  test('not read: the power of the spell, the mana value of "that creature"', () => {
    NOT_READ(
      "Whenever you cast an instant or sorcery spell, ~ gets +X/+0 until end of turn, where X is that spell's power.",
    );
    NOT_READ(
      "Whenever you cast an instant or sorcery spell, ~ gets +X/+0 until end of turn, where X is that creature's mana value.",
    );
  });

  const ATTACK =
    'Whenever ~ attacks, exile up to one target instant or sorcery card from your graveyard and copy it. You may cast the copy without paying its mana cost.';

  test('the attack trigger: exile the card (up to one), then copy the exiled card and cast the copy', () => {
    expect(readAll(ATTACK).abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'graveyard', controller: 'you', anyOf: INSTANT_OR_SORCERY },
            },
            min: 0,
            max: 1,
          },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exile', objects: { kind: 'target', id: 't1' } },
            { kind: 'copyCardAndCast', objects: { kind: 'moved' } },
          ],
        },
      },
    ]);
  });

  test('not read: the copy is not cast, or is cast by paying its cost', () => {
    NOT_READ(ATTACK.replace(' You may cast the copy without paying its mana cost.', ''));
    NOT_READ(ATTACK.replace('without paying its mana cost', 'by paying its mana cost'));
    NOT_READ(ATTACK.replace('You may cast the copy', 'You must cast the copy'));
  });
});

describe('Manaform Hellkite: X is the mana spent to cast the spell, the token is exiled at the next end step (CR 601.2h)', () => {
  const REAL =
    'Whenever you cast a noncreature spell, create an X/X red Dragon Illusion creature token with flying and haste, where X is the amount of mana spent to cast that spell. Exile that token at the beginning of the next end step.';

  test('the real line: the mana spent on the trigger’s spell, and a delayed exile of the token', () => {
    const parsed = readAll(REAL);
    expect(parsed.abilities).toMatchObject([
      {
        kind: 'triggered',
        trigger: { kind: 'castSpell', filter: { notTypes: ['creature'], stackKind: 'spell' } },
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'createToken',
              token: { ptAmount: { kind: 'manaSpent', of: { kind: 'triggerSubject' } } },
            },
            {
              kind: 'delayedTrigger',
              at: { step: 'endStep', whose: 'each' },
              effect: { kind: 'exile', objects: { kind: 'moved' } },
            },
          ],
        },
      },
    ]);
  });

  test('without the exile sentence the token stays: the line is a lone create', () => {
    const parsed = readAll(
      REAL.replace(' Exile that token at the beginning of the next end step.', ''),
    );
    expect(parsed.abilities[0]).toMatchObject({ effect: { kind: 'createToken' } });
  });

  test('not read: another end step, the mana spent to cast a creature', () => {
    NOT_READ(REAL.replace('the next end step', 'your next end step'));
    NOT_READ(REAL.replace('cast that spell', 'cast that creature'));
  });
});

describe('Magma Opus: damage divided among any number of targets (CR 601.2d, 115.4)', () => {
  test('the divided damage: any target, any number, four to divide', () => {
    const parsed = readAll('~ deals 4 damage divided as you choose among any number of targets.');
    expect(parsed.spell).toEqual({
      targets: [{ id: 't1', what: { kind: 'anyTarget' }, divide: { total: 4 } }],
      effect: { kind: 'dealDividedDamage', to: { kind: 'target', id: 't1' } },
    });
  });

  test('not read: a maximum ("up to three targets")', () => {
    NOT_READ('~ deals 4 damage divided as you choose among up to three targets.', 'instant');
  });
});

describe('Furygale Flocking: for each opponent, tokens that attack that opponent if able (CR 508.1d)', () => {
  const REAL =
    'For each opponent, create two 3/3 blue and red Elemental creature tokens with flying that attack that opponent this turn if able. They gain haste until end of turn.';

  test('the real line: two tokens for each opponent that must attack, and haste for them', () => {
    expect(readAll(REAL, 'sorcery').spell).toEqual({
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'createToken',
            token: { kind: 'custom', definition: ELEMENTAL(3, 3, [FLYING]) },
            count: 2,
            forEachOpponent: { mustAttack: true },
          },
          {
            kind: 'grantKeyword',
            objects: { kind: 'moved' },
            keyword: { kind: 'haste' },
            duration: 'untilEndOfTurn',
          },
        ],
      },
    });
  });

  test('the cost reduction: one less for each instant and sorcery card in your graveyard', () => {
    expect(
      readAll(
        'This spell costs {1} less to cast for each instant and sorcery card in your graveyard.',
        'sorcery',
      ).abilities,
    ).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'costReduction',
          spells: { kind: 'this' },
          amount: {
            kind: 'countOf',
            filter: { zone: 'graveyard', controller: 'you', anyOf: INSTANT_OR_SORCERY },
          },
        },
      },
    ]);
  });

  test('not read: "each opponent" for "that opponent", no "if able", each player', () => {
    NOT_READ(REAL.replace('attack that opponent', 'attack each opponent'), 'sorcery');
    NOT_READ(REAL.replace(' if able', ''), 'sorcery');
    NOT_READ(REAL.replace('For each opponent', 'For each player'), 'sorcery');
  });
});

describe('Leitmotif Composer: creatures named like it can’t be blocked (CR 201.2, 509.1b)', () => {
  test('the activated ability: the creatures with the card’s own name', () => {
    expect(readAll("{2}{U}: Creatures named ~ can't be blocked this turn.").abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['2', 'U'] }],
        effect: {
          kind: 'restrict',
          objects: { kind: 'each', filter: { types: ['creature'], named: 'SYNTHETIC Card' } },
          restriction: 'cantBeBlocked',
          duration: 'untilEndOfTurn',
        },
      },
    ]);
  });

  test('not read: another name (a name that is not the card’s own is never guessed), another restriction, no duration', () => {
    NOT_READ("{2}{U}: Creatures named Nobody Atall can't be blocked this turn.");
    NOT_READ("{2}{U}: Creatures named ~ can't attack this turn.");
    NOT_READ("{2}{U}: Creatures named ~ can't be blocked.");
  });

  test('the copy trigger of a spell of mana value 5 or greater is read', () => {
    readAll(
      "Whenever you cast an instant or sorcery spell with mana value 5 or greater, create a token that's a copy of ~.",
    );
  });
});

describe('Restless Spire: a land that becomes a creature, first strike on its controller’s turn (CR 613.1d, 604.1)', () => {
  const REAL =
    '{U}{R}: Until end of turn, ~ becomes a 2/1 blue and red Elemental creature with "During your turn, ~ has first strike." It\'s still a land.';

  test('the real line: types added, colors set, 2/1, and first strike on its controller’s turn only', () => {
    expect(readAll(REAL, 'land').abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['U', 'R'] }],
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'setTypes',
              objects: { kind: 'this' },
              types: ['creature'],
              subtypes: ['Elemental'],
              additive: true,
              duration: 'untilEndOfTurn',
            },
            {
              kind: 'setColors',
              objects: { kind: 'this' },
              colors: ['U', 'R'],
              duration: 'untilEndOfTurn',
            },
            {
              kind: 'setPt',
              objects: { kind: 'this' },
              power: 2,
              toughness: 1,
              duration: 'untilEndOfTurn',
            },
            {
              kind: 'grantKeyword',
              objects: { kind: 'this' },
              keyword: { kind: 'firstStrike' },
              duration: 'untilEndOfTurn',
              duringYourTurn: true,
            },
          ],
        },
      },
    ]);
  });

  test('not read: no "still a land", another keyword in the quotes, no creature type or colors', () => {
    NOT_READ(REAL.replace(" It's still a land.", ''), 'land');
    NOT_READ(REAL.replace('has first strike', 'has first strike and haste'), 'land');
    NOT_READ(REAL.replace('blue and red Elemental creature', 'blue and red creature'), 'land');
  });
});

describe('Galazeth Prismari: artifacts that tap for mana to spend on instants and sorceries only (CR 106.6)', () => {
  const REAL =
    'Artifacts you control have "{T}: Add one mana of any color. Spend this mana only to cast an instant or sorcery spell."';

  test('the real line: a granted mana ability with a spend-only restriction', () => {
    expect(readAll(REAL, 'creature').abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantAbility',
          subject: { kind: 'filter', filter: { types: ['artifact'], controller: 'you' } },
          ability: {
            kind: 'mana',
            cost: [{ kind: 'tap' }],
            production: { kind: 'anyColor' },
            spendOnly: { types: ['instant', 'sorcery'] },
          },
        },
      },
    ]);
  });

  test('not read: a restriction that also covers an ability’s activation', () => {
    NOT_READ(REAL.replace('spell."', 'spell or activate an ability."'));
  });
});

describe('Brazen Borrower: can block only creatures with flying (CR 509.1b)', () => {
  test('the static restriction on the creature itself', () => {
    expect(readAll('~ can block only creatures with flying.').abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'restriction',
          subject: { kind: 'this' },
          restriction: 'canBlockOnlyFlying',
        },
      },
    ]);
  });

  test('not read: another quality of the attacker, any creature, flying or reach', () => {
    NOT_READ('~ can block only creatures with reach.');
    NOT_READ('~ can block only creatures.');
    NOT_READ('~ can block only creatures with flying or reach.');
  });
});

describe('Rousing Refrain: mana that stays until end of turn, and the spell exiled with time counters (CR 500.5, 702.62b)', () => {
  const REAL =
    "Add {R} for each card in target opponent's hand. Until end of turn, you don't lose this mana as steps and phases end. Exile ~ with three time counters on it.";

  test('the real line: red mana for each card in the target opponent’s hand that stays, then the exile', () => {
    expect(readAll(REAL, 'sorcery').spell).toEqual({
      targets: [{ id: 't1', what: { kind: 'player', filter: 'opponent' } }],
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'addMana',
            mana: {
              kind: 'fixed',
              mana: ['R'],
              times: {
                kind: 'countOf',
                filter: { zone: 'hand', owner: { kind: 'target', id: 't1' } },
              },
              staysUntilEndOfTurn: true,
            },
          },
          { kind: 'exileSpellWithTimeCounters', count: 3 },
        ],
      },
    });
  });

  test('without the sentence about the mana staying the mana empties as usual', () => {
    const parsed = readAll(
      "Add {R} for each card in target opponent's hand. Exile ~ with three time counters on it.",
      'sorcery',
    );
    expect(JSON.stringify(parsed.spell)).not.toContain('staysUntilEndOfTurn');
  });

  test('not read: another duration, "a time counter"', () => {
    NOT_READ(REAL.replace('Until end of turn', 'Until your next turn'), 'sorcery');
    NOT_READ(REAL.replace('three time counters', 'a time counter'), 'sorcery');
  });
});

describe('a feature the engine lacks is named, not guessed (D-068, D-115)', () => {
  test.each([
    [
      'selector:manaStays',
      "Add {R}. Until end of turn, you don't lose this mana as steps and phases end.",
      'sorcery',
    ],
    [
      'effect:exileSpellWithTimeCounters',
      'Draw a card. Exile ~ with three time counters on it.',
      'sorcery',
    ],
    [
      'effect:copyCardAndCast',
      'Whenever ~ attacks, exile up to one target instant or sorcery card from your graveyard and copy it. You may cast the copy without paying its mana cost.',
      'creature',
    ],
    [
      'selector:tokensPerOpponent',
      'For each opponent, create two 3/3 blue and red Elemental creature tokens with flying that attack that opponent this turn if able. They gain haste until end of turn.',
      'sorcery',
    ],
    [
      'amount:greatestManaValueCast',
      "At the beginning of combat on your turn, create an X/X blue and red Elemental creature token, where X is the greatest mana value among instant and sorcery spells you've cast this turn.",
      'creature',
    ],
    ['selector:named', "{2}{U}: Creatures named ~ can't be blocked this turn.", 'creature'],
  ] as const)('without %s: %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });
});
