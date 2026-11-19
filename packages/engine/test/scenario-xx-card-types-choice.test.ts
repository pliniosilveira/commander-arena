// "You may exile any number of cards from your graveyard with four or more card types among them. If you do, put a permanent card from among them onto the battlefield with a finality
// counter on it." (Death Toll deck, Winter, Cynical Opportunist's delirium ability): a constraint on the WHOLE set of cards chosen (`ChooseSelector.minCardTypes`), then a choice among the cards
// exiled (`fromMoved` of the cards in exile). Pins: CR 205.2a (card types: a supertype or a subtype is no card type), CR 608.2c (a later instruction reads what an earlier one did, "if you do"),
// CR 608.2d (the player chooses as the instruction comes up), CR 122.6 (a permanent that enters with a counter), CR 400.7 (the cards exiled are new objects).
// All cards are SYNTHETIC or real fixtures (basic lands, Grizzly Bears, Sol Ring, Lightning Bolt, Divination, Murder).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import {
  applyAction,
  type CardDefinition,
  type Effect,
  type ObjectFilter,
  validateCard,
} from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';

const PERMANENT_CARD: ObjectFilter = {
  anyOf: ['artifact', 'creature', 'enchantment', 'land', 'planeswalker', 'battle'].map((t) => ({
    types: [t as 'artifact'],
  })),
};

const choice = (n: number): Effect => ({
  kind: 'moveToZone',
  objects: {
    kind: 'choose',
    filter: { zone: 'graveyard', controller: 'you' },
    anyNumber: true,
    optional: true,
    minCardTypes: n,
  },
  to: 'exile',
});

/** "At the beginning of your end step, you may exile any number of cards from your graveyard with `n` or more card types among them. If you do, put a permanent card from among them onto the battlefield with a finality counter on it." */
function reaper(name: string, n: number): CardDefinition {
  const effect: Effect = {
    kind: 'sequence',
    effects: [
      choice(n),
      {
        kind: 'conditional',
        condition: { kind: 'didPrevious' },
        effect: {
          kind: 'moveToZone',
          objects: {
            kind: 'choose',
            filter: { ...PERMANENT_CARD, zone: 'exile', controller: 'you' },
            fromMoved: true,
          },
          to: 'battlefield',
          controller: 'you',
          withCounters: { counter: 'finality', count: 1 },
        },
      },
    ],
  };
  return singleFace({
    name,
    manaCost: ['2', 'B', 'G'],
    types: ['creature'],
    subtypes: ['Human'],
    colors: ['B', 'G'],
    colorIdentity: ['B', 'G'],
    power: 2,
    toughness: 3,
    oracleText: `At the beginning of your end step, you may exile any number of cards from your graveyard with ${n} or more card types among them. If you do, put a permanent card from among them onto the battlefield with a finality counter on it.`,
    abilities: [{ kind: 'triggered', trigger: { kind: 'endStep', whose: 'you' }, effect }],
  });
}

const REAPER = reaper('SYNTHETIC Delirium Reaper', 4);
const PAIR_REAPER = reaper('SYNTHETIC Pair Reaper', 2);
const SPIRIT = singleFace({
  name: 'SYNTHETIC Tide Spirit',
  manaCost: ['1', 'W'],
  types: ['enchantment'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: 'SYNTHETIC enchantment with no abilities.',
});

const CLOCKWORK = singleFace({
  name: 'SYNTHETIC Clockwork Bear',
  manaCost: ['3'],
  types: ['artifact', 'creature'],
  subtypes: ['Bear'],
  colors: [],
  colorIdentity: [],
  power: 2,
  toughness: 2,
  oracleText: 'SYNTHETIC artifact creature with no abilities.',
});

// Land (Island), creature (Grizzly Bears), artifact (Sol Ring), instant (Lightning Bolt), sorcery (Divination), enchantment (SPIRIT), artifact creature (CLOCKWORK).
function endStep(
  reaperCard: CardDefinition,
  yard: readonly string[],
  exiled: readonly string[] = [],
): ScenarioGame {
  let b = scenario()
    .define(reaperCard)
    .define(SPIRIT)
    .define(CLOCKWORK)
    .seat(0)
    .battlefield(reaperCard.name);
  for (const name of yard) b = b.graveyard(name);
  for (const name of exiled) b = b.exile(name);
  const g = b
    .library('Swamp', 'Swamp', 'Swamp')
    .seat(1)
    .library('Llanowar Elves')
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
  g.advanceTo('end');
  g.passAll();
  return g;
}

/** The names of the cards `seat 0` owns in the zone, sorted. */
const namesIn = (g: ScenarioGame, zone: 'graveyard' | 'exile'): string[] =>
  Object.values(g.state.objects)
    .filter((o) => o.zone === zone && o.owner === 0)
    .map((o) => {
      const card = o.card === null ? undefined : g.state.cards[o.card];
      return card === undefined ? '?' : (g.state.definitions[card.definition]?.name ?? '?');
    })
    .sort();

const FOUR = ['Island', 'Grizzly Bears', 'Sol Ring', 'Lightning Bolt'];

describe('the card definitions are valid', () => {
  test('the synthetic reapers validate', () => {
    expect(validateCard(REAPER)).toEqual([]);
    expect(validateCard(PAIR_REAPER)).toEqual([]);
  });
});

describe('"any number of cards ... with four or more card types among them" (CR 205.2a)', () => {
  test('the question lists every card of the graveyard, may be answered with none, and says the minimum', () => {
    const g = endStep(REAPER, [...FOUR, 'Divination']);
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('move');
    expect(d.zone).toBe('graveyard');
    expect(d.legal).toHaveLength(5);
    expect(d.min).toBe(0);
    expect(d.max).toBe(5);
    expect(d.minCardTypes?.count).toBe(4);
    expect(d.prompt).toContain('4 or more card types');
  });

  test('three card types are refused, whatever the number of cards (two lands, a creature and an artifact)', () => {
    const g = endStep(REAPER, [...FOUR, 'Forest']);
    const before = g.hash();
    const three = ['Island', 'Forest', 'Grizzly Bears', 'Sol Ring'].map((n) => g.id(n));
    const refused = applyAction(g.state, 0, { kind: 'chooseCards', objects: three });
    expect(refused.ok).toBe(false);
    expect(g.hash()).toBe(before);
  });

  test('exactly four card types: all exiled, then one permanent among them goes to the battlefield with a finality counter', () => {
    const g = endStep(REAPER, [...FOUR, 'Divination']);
    g.act(0).chooseCards(...FOUR);
    // Island, Grizzly Bears and Sol Ring are permanent cards: the player chooses one of them (the Bolt is not one).
    const d = chooseCardsDecision(g);
    expect(d.zone).toBe('exile');
    expect(d.legal).toHaveLength(3);
    expect(d.min).toBe(1);
    expect(d.max).toBe(1);
    expect(d.prompt).toContain('exiled this way');
    g.act(0).chooseCards('Grizzly Bears');
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.counters('Grizzly Bears', { finality: 1 });
    expect(namesIn(g, 'exile')).toEqual(['Island', 'Lightning Bolt', 'Sol Ring']);
    expect(namesIn(g, 'graveyard')).toEqual(['Divination']);
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('more than four card types, and more cards than that: all are exiled, still one permanent comes back', () => {
    const g = endStep(REAPER, [...FOUR, 'Divination', 'SYNTHETIC Tide Spirit', 'Forest']);
    g.act(0).chooseCards(...FOUR, 'Divination', 'SYNTHETIC Tide Spirit', 'Forest');
    g.act(0).chooseCards('Sol Ring');
    g.expect.zone('Sol Ring', 'battlefield', { seat: 0 });
    g.expect.counters('Sol Ring', { finality: 1 });
    expect(namesIn(g, 'graveyard')).toEqual([]);
    expect(namesIn(g, 'exile')).toHaveLength(6);
    g.expect.invariants();
  });

  test('a card with two types counts for both: an artifact creature, a land and an instant are four card types with three cards', () => {
    const g = endStep(REAPER, [
      'SYNTHETIC Clockwork Bear',
      'Island',
      'Lightning Bolt',
      'Divination',
    ]);
    g.act(0).chooseCards('SYNTHETIC Clockwork Bear', 'Island', 'Lightning Bolt');
    expect(chooseCardsDecision(g).legal).toHaveLength(2);
    g.act(0).chooseCards('SYNTHETIC Clockwork Bear');
    g.expect.zone('SYNTHETIC Clockwork Bear', 'battlefield', { seat: 0 });
    g.expect.counters('SYNTHETIC Clockwork Bear', { finality: 1 });
    g.expect.invariants();
  });

  test('a subtype is no card type: Island and Forest are one card type, so three types in all and nothing is asked', () => {
    const g = endStep(REAPER, ['Island', 'Forest', 'Grizzly Bears', 'Lightning Bolt']);
    g.expect.pending('priority', 0);
    expect(namesIn(g, 'exile')).toEqual([]);
  });

  test('declining (choosing no card) exiles nothing and puts nothing onto the battlefield', () => {
    const g = endStep(REAPER, [...FOUR]);
    g.act(0).chooseCards();
    g.expect.pending('priority', 0);
    expect(namesIn(g, 'graveyard')).toEqual([...FOUR].sort());
    expect(namesIn(g, 'exile')).toEqual([]);
    g.expect.noObject('Grizzly Bears', { zone: 'battlefield' });
  });

  test('an empty graveyard asks nothing and does nothing', () => {
    const g = endStep(REAPER, []);
    g.expect.pending('priority', 0);
    expect(namesIn(g, 'exile')).toEqual([]);
  });

  test('fewer than four card types among every card of the graveyard: nothing is asked', () => {
    const g = endStep(REAPER, ['Island', 'Grizzly Bears', 'Sol Ring']);
    g.expect.pending('priority', 0);
    expect(namesIn(g, 'graveyard')).toHaveLength(3);
  });

  test('no permanent card among the cards exiled: the exile happens and nothing comes back', () => {
    const g = endStep(PAIR_REAPER, ['Divination', 'Lightning Bolt', 'Murder']);
    g.act(0).chooseCards('Divination', 'Lightning Bolt');
    g.expect.pending('priority', 0);
    expect(namesIn(g, 'exile')).toEqual(['Divination', 'Lightning Bolt']);
    expect(namesIn(g, 'graveyard')).toEqual(['Murder']);
    g.expect.invariants();
  });

  test('the only permanent card among the cards exiled is not asked about', () => {
    const g = endStep(PAIR_REAPER, ['Island', 'Lightning Bolt']);
    g.act(0).chooseCards('Island', 'Lightning Bolt');
    g.expect.zone('Island', 'battlefield', { seat: 0 });
    g.expect.counters('Island', { finality: 1 });
    g.expect.pending('priority', 0);
  });

  test('a card that was already in exile is not a candidate for "from among them"', () => {
    const g = endStep(PAIR_REAPER, ['Divination', 'Lightning Bolt'], ['Forest']);
    g.act(0).chooseCards('Divination', 'Lightning Bolt');
    g.expect.noObject('Forest', { zone: 'battlefield' });
    g.expect.pending('priority', 0);
  });
});

describe('the answers listed for the choice (any other legal set is accepted all the same)', () => {
  test('nothing, the small sets that reach four card types, and everything that qualifies; none has fewer than four types', () => {
    const g = endStep(REAPER, [...FOUR, 'Divination', 'Forest', 'SYNTHETIC Tide Spirit']);
    const listed = g
      .legalActions(0)
      .filter((a): a is Extract<typeof a, { kind: 'chooseCards' }> => a.kind === 'chooseCards');
    expect(listed.some((a) => a.objects.length === 0)).toBe(true);
    expect(listed.some((a) => a.objects.length === 7)).toBe(true);
    expect(listed.some((a) => a.objects.length === 4)).toBe(true);
    // No card here has two types, so fewer than four cards cannot have four card types.
    expect(listed.every((a) => a.objects.length === 0 || a.objects.length >= 4)).toBe(true);
    for (const a of listed) expect(applyAction(g.state, 0, a).ok).toBe(true);
  });

  test('the list stays small for a long graveyard', () => {
    const lands = Array.from({ length: 30 }, () => 'Island');
    const g = endStep(REAPER, [
      ...lands,
      'Grizzly Bears',
      'Sol Ring',
      'Lightning Bolt',
      'Divination',
    ]);
    const listed = g.legalActions(0).filter((a) => a.kind === 'chooseCards');
    expect(listed.length).toBeLessThanOrEqual(500);
    expect(listed.length).toBeGreaterThan(2);
  });

  test('a legal set the list does not show is accepted (six cards chosen by hand)', () => {
    const g = endStep(REAPER, [...FOUR, 'Divination', 'Forest', 'SYNTHETIC Tide Spirit']);
    const six = [...FOUR, 'Forest', 'Divination'];
    const result = applyAction(g.state, 0, {
      kind: 'chooseCards',
      objects: six.map((n) => g.id(n)),
    });
    expect(result.ok).toBe(true);
  });
});

describe('a choice with no card type minimum is unchanged', () => {
  test('exiling one card of the graveyard with an ordinary optional choice has no minimum', () => {
    const effect: Effect = {
      kind: 'moveToZone',
      objects: {
        kind: 'choose',
        filter: { zone: 'graveyard', controller: 'you' },
        optional: true,
      },
      to: 'exile',
    };
    const card = singleFace({
      name: 'SYNTHETIC Plain Exiler',
      manaCost: ['1', 'B'],
      types: ['creature'],
      colors: ['B'],
      colorIdentity: ['B'],
      power: 1,
      toughness: 1,
      oracleText: 'At the beginning of your end step, you may exile a card from your graveyard.',
      abilities: [{ kind: 'triggered', trigger: { kind: 'endStep', whose: 'you' }, effect }],
    });
    const g = endStep(card, ['Island', 'Lightning Bolt']);
    const d = chooseCardsDecision(g);
    expect(d.minCardTypes).toBeUndefined();
    expect(d.min).toBe(0);
    expect(d.max).toBe(1);
    g.act(0).chooseCards('Island');
    expect(namesIn(g, 'exile')).toEqual(['Island']);
  });
});

describe('validation', () => {
  const withChoice = (selector: object): CardDefinition => {
    const card = reaper('SYNTHETIC Bad Reaper', 4);
    return {
      ...card,
      faces: [
        {
          ...card.faces[0],
          abilities: [
            {
              kind: 'triggered',
              trigger: { kind: 'endStep', whose: 'you' },
              effect: { kind: 'moveToZone', objects: selector, to: 'exile' },
            },
          ],
        },
      ],
    } as unknown as CardDefinition;
  };
  const base = {
    kind: 'choose',
    filter: { zone: 'graveyard', controller: 'you' },
    anyNumber: true,
    optional: true,
    minCardTypes: 4,
  };

  test('the valid shape passes', () => {
    expect(validateCard(withChoice(base))).toEqual([]);
  });

  test.each([
    ['without anyNumber', { ...base, anyNumber: undefined }],
    ['without optional', { ...base, optional: undefined }],
    ['with a count', { ...base, count: 2 }],
    ['one card type', { ...base, minCardTypes: 1 }],
    ['from the hand', { ...base, filter: { zone: 'hand', controller: 'you' } }],
    ['anyNumber alone is a sacrifice choice', { ...base, minCardTypes: undefined }],
  ])('%s is refused', (_name, selector) => {
    expect(validateCard(withChoice(selector)).length).toBeGreaterThan(0);
  });
});
