// The opponent profile (issue 653, step 2b): the traits of a card read from the engine's parsed abilities, the
// profile of a decklist (capabilities, archetype, route), the profile of an opponent at one decision (what it
// may still hold, the haste its battlefield gives), and the questions the threat scenarios and the crack-back
// ask of it. Cards named SYNTHETIC are test cards; the others are the engine's fixtures.
import {
  type Ability,
  type CardDefinition,
  createRng,
  determinize,
  fixtureCard,
  type GameState,
  type SpellText,
} from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { type CardTraits, traitsOf } from '../src/heuristic-card-traits';
import { archetypeOf, deckOf, deckProfile, profileOf, routeOf } from '../src/heuristic-profile';
import {
  atLeastOne,
  hiddenAttackersOf,
  opponentsOf,
  poolOf,
  threatsOf,
} from '../src/heuristic-threats';
import { DEFAULT_WEIGHTS } from '../src/index';
import { creature } from './heuristic-helpers';

/** A SYNTHETIC card of one face: an instant or sorcery with `spell`, or a permanent with `abilities`. */
function card(
  name: string,
  types: CardDefinition['faces'][number]['types'],
  parts: { spell?: SpellText; abilities?: readonly Ability[]; cost?: string[] },
): CardDefinition {
  return {
    oracleId: null,
    name,
    layout: 'normal',
    faces: [
      {
        name,
        manaCost: parts.cost ?? ['2'],
        supertypes: [],
        types,
        subtypes: [],
        colors: [],
        power: null,
        toughness: null,
        loyalty: null,
        defense: null,
        oracleText: '',
        abilities: parts.abilities ?? [],
        spell: parts.spell ?? null,
      },
    ],
    colorIdentity: [],
    support: 'supported',
  };
}

const TARGET = { kind: 'target', id: 't1' } as const;
const CREATURE_SLOT = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
} as const;

const WRATH = card('SYNTHETIC Wrath', ['sorcery'], {
  spell: {
    effect: { kind: 'destroy', objects: { kind: 'each', filter: { types: ['creature'] } } },
  },
});
const OWN_SWEEP = card('SYNTHETIC Own Sweep', ['sorcery'], {
  spell: {
    effect: {
      kind: 'destroy',
      objects: { kind: 'each', filter: { types: ['creature'], controller: 'you' } },
    },
  },
});
const SHATTER = card('SYNTHETIC Shatter', ['instant'], {
  spell: {
    targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['artifact'] } } }],
    effect: { kind: 'destroy', objects: TARGET },
  },
});
const GROWTH = card('SYNTHETIC Growth', ['instant'], {
  spell: {
    targets: [CREATURE_SLOT],
    effect: {
      kind: 'modifyPt',
      objects: TARGET,
      power: 3,
      toughness: 3,
      duration: 'untilEndOfTurn',
    },
  },
});
const SHRINK = card('SYNTHETIC Shrink', ['instant'], {
  spell: {
    targets: [CREATURE_SLOT],
    effect: {
      kind: 'modifyPt',
      objects: TARGET,
      power: -4,
      toughness: -4,
      duration: 'untilEndOfTurn',
    },
  },
});
const FOG = card('SYNTHETIC Fog', ['instant'], {
  spell: {
    effect: {
      kind: 'preventDamage',
      scope: 'combat',
      amount: 'all',
      to: { kind: 'any' },
      duration: 'untilEndOfTurn',
    },
  },
});
const DRAIN = card('SYNTHETIC Drain', ['sorcery'], {
  spell: { effect: { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 2 } },
});
const ANOTHER_COMBAT = card('SYNTHETIC Another Combat', ['sorcery'], {
  spell: { effect: { kind: 'extraCombat' } },
});
const ANOTHER_TURN = card('SYNTHETIC Another Turn', ['sorcery'], {
  spell: { effect: { kind: 'extraTurn', player: { kind: 'you' } } },
});
const BANNER = card('SYNTHETIC Haste Banner', ['enchantment'], {
  abilities: [
    {
      kind: 'static',
      static: {
        kind: 'grantKeyword',
        subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
        keyword: { kind: 'haste' },
      },
    },
  ],
});
const EXECUTIONER = {
  ...creature('SYNTHETIC Executioner 2/2', 2, 2),
  faces: [
    {
      ...(creature('SYNTHETIC Executioner 2/2', 2, 2).faces[0] as CardDefinition['faces'][number]),
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          targets: [CREATURE_SLOT],
          effect: { kind: 'destroy', objects: TARGET },
        },
      ],
    },
  ],
} as CardDefinition;

/** The traits that are true, by name. */
const on = (t: CardTraits): string[] =>
  Object.entries(t)
    .filter(([, v]) => v === true)
    .map(([k]) => k)
    .sort();

describe('the traits of a card, from its parsed abilities', () => {
  test('counterspells, removal, burn and card draw', () => {
    expect(on(traitsOf(fixtureCard('Counterspell')))).toEqual(['counter', 'instantSpeed']);
    expect(on(traitsOf(fixtureCard('Murder')))).toEqual(['instantSpeed', 'removal']);
    expect(on(traitsOf(fixtureCard('Unsummon')))).toEqual(['instantSpeed', 'removal']);
    // "Any target": a creature or a player, so it is removal and reach.
    expect(on(traitsOf(fixtureCard('Lightning Bolt')))).toEqual([
      'instantSpeed',
      'reach',
      'removal',
    ]);
    expect(on(traitsOf(fixtureCard('Divination')))).toEqual([]);
    expect(on(traitsOf(SHRINK))).toEqual(['instantSpeed', 'removal']);
    // An artifact is not a creature or a planeswalker: not removal of what attacks or blocks.
    expect(on(traitsOf(SHATTER))).toEqual(['instantSpeed']);
  });

  test('wipes are the creatures of a filter that is not only the caster own', () => {
    expect(on(traitsOf(WRATH))).toEqual(['wipe']);
    expect(on(traitsOf(OWN_SWEEP))).toEqual([]);
  });

  test('creatures: haste, flash, evasion, and removal as they enter', () => {
    const raging = traitsOf(fixtureCard('Raging Goblin'));
    expect(on(raging)).toEqual(['creature', 'haste']);
    expect(raging.power).toBe(1);
    expect(on(traitsOf(fixtureCard('Serra Angel')))).toEqual(['creature', 'evasive']);
    expect(on(traitsOf(creature('SYNTHETIC Flash 7/7', 7, 7, ['flash'])))).toEqual([
      'creature',
      'flash',
      'instantSpeed',
    ]);
    expect(on(traitsOf(EXECUTIONER))).toEqual(['creature', 'removal']);
  });

  test('tricks, fogs, drains, extra combats, extra turns and haste for others', () => {
    expect(on(traitsOf(GROWTH))).toEqual(['instantSpeed', 'trick']);
    expect(on(traitsOf(FOG))).toEqual(['fog', 'instantSpeed']);
    expect(on(traitsOf(DRAIN))).toEqual(['reach']);
    expect(on(traitsOf(ANOTHER_COMBAT))).toEqual(['extraCombat']);
    expect(on(traitsOf(ANOTHER_TURN))).toEqual(['winsOutright']);
    expect(on(traitsOf(BANNER))).toEqual(['hasteGiver']);
    expect(traitsOf(fixtureCard('Forest')).land).toBe(true);
  });

  test('the traits are kept for the definition object', () => {
    expect(traitsOf(WRATH)).toBe(traitsOf(WRATH));
  });
});

/** A decklist of `n` copies of each card, as traits. */
const deck = (...entries: [CardDefinition, number][]): CardTraits[] =>
  entries.flatMap(([def, n]) => Array.from({ length: n }, () => traitsOf(def)));

const BEARS = fixtureCard('Grizzly Bears');
const FOREST = fixtureCard('Forest');
const SEVEN = creature('SYNTHETIC Big 7/7', 7, 7, [], { cost: ['7'] });

describe('the profile of a decklist', () => {
  test('aggro: many cheap creatures; control: few creatures and many answers', () => {
    expect(archetypeOf(deck([BEARS, 30], [FOREST, 38], [GROWTH, 5]))).toBe('aggro');
    expect(
      archetypeOf(
        deck(
          [BEARS, 8],
          [fixtureCard('Counterspell'), 8],
          [fixtureCard('Murder'), 8],
          [fixtureCard('Divination'), 12],
          [FOREST, 38],
        ),
      ),
    ).toBe('control');
    expect(archetypeOf(deck([BEARS, 12], [SEVEN, 8], [fixtureCard('Divination'), 12]))).toBe(
      'midrange',
    );
    expect(archetypeOf(deck([BEARS, 30], [ANOTHER_TURN, 2], [FOREST, 38]))).toBe('combo');
  });

  test('the route: a commander that kills alone, many creatures, or spells', () => {
    const list = deck([BEARS, 30], [FOREST, 38]);
    expect(routeOf(traitsOf(SEVEN), list)).toBe('commander');
    expect(routeOf(traitsOf(fixtureCard('Serra Angel')), list)).toBe('commander');
    expect(routeOf(traitsOf(BEARS), list)).toBe('combat');
    expect(routeOf(traitsOf(BEARS), deck([BEARS, 5], [fixtureCard('Divination'), 30]))).toBe(
      'spells',
    );
  });

  test('counts and curve', () => {
    const p = deckProfile(deck([BEARS, 10], [WRATH, 2], [FOREST, 8]), traitsOf(BEARS));
    expect(p).toMatchObject({ cards: 20, lands: 8, creatures: 10, curve: 2 });
    expect(p.can.wipe).toBe(2);
    expect(p.can.haste).toBe(0);
  });
});

/**
 * Seat 0 in its main phase; seat 1 owns `hand`, `library`, `graveyard` and `battlefield` (all its cards are known to
 * seat 0 as its decklist, SPEC A31).
 */
function table(spec: {
  hand: string[];
  library: [string, number][];
  graveyard?: string[];
  battlefield?: string[];
  untapped?: boolean;
  /** Its seven lands (default Forest). */
  land?: string;
}) {
  let b = scenario().define(SEVEN).define(BANNER).define(HASTY_SEVEN).define(FLASH_SEVEN);
  b = b.seat(0).battlefield('Grizzly Bears').library('Island', { count: 10 }).seat(1);
  b = b.hand(...spec.hand);
  b = b.battlefield(spec.land ?? 'Forest', { count: 7, tapped: spec.untapped !== true });
  if (spec.battlefield !== undefined) b = b.battlefield(...spec.battlefield);
  if (spec.graveyard !== undefined) b = b.graveyard(...spec.graveyard);
  for (const [name, count] of spec.library) b = b.library(name, { count });
  const g = b.at('precombatMain', { active: 0 }).build();
  return { g, view: g.view(0), sample: determinize(g.state, 0, createRng(3)) };
}

const HASTY_SEVEN = creature('SYNTHETIC Hasty 7/7', 7, 7, ['haste'], { cost: ['7'] });
const FLASH_SEVEN = creature('SYNTHETIC Flash 7/7', 7, 7, ['flash'], { cost: ['7'] });

describe('the profile of an opponent at one decision', () => {
  test('its decklist, what it may still hold, and the haste its battlefield gives', () => {
    const { view, sample } = table({
      hand: [HASTY_SEVEN.name, 'Forest'],
      library: [
        [HASTY_SEVEN.name, 2],
        ['Forest', 20],
      ],
      graveyard: [HASTY_SEVEN.name],
    });
    const p = profileOf(view, sample, 1, poolOf(sample, 1));
    // Four in the decklist; the one in the graveyard has been seen, so three may still be in its hand or library.
    expect(p.can.haste).toBe(4);
    expect(p.unseen.haste).toBe(3);
    expect(p.pool).toBe(24);
    expect(p.hasteOnBoard).toBe(false);
    expect(deckOf(sample, 1)).toBe(deckOf(sample, 1));
    const banner = table({
      hand: ['Forest'],
      library: [['Forest', 5]],
      battlefield: [BANNER.name],
    });
    expect(profileOf(banner.view, banner.sample, 1, poolOf(banner.sample, 1)).hasteOnBoard).toBe(
      true,
    );
    // Face down it shows no card (CR 708.5): what the sample deals under it is not read.
    const g = scenario()
      .define(BANNER)
      .seat(0)
      .library('Island', { count: 5 })
      .seat(1)
      .battlefield(BANNER.name, { faceDown: true })
      .library('Forest', { count: 5 })
      .at('precombatMain', { active: 0 })
      .build();
    const samples = Array.from({ length: 12 }, (_, i) => determinize(g.state, 0, createRng(i)));
    // The definition of the card under the face-down permanent (the only permanent on the battlefield).
    const under = (s: GameState): number | undefined => {
      const id = g.view(0).battlefield[0]?.id;
      const card = id === undefined ? undefined : s.objects[id]?.card;
      return card === undefined || card === null ? undefined : s.cards[card]?.definition;
    };
    // Some samples deal the Banner itself under it; none reads it.
    expect(samples.some((s) => under(s) === under(g.state))).toBe(true);
    for (const s of samples)
      expect(profileOf(g.view(0), s, 1, poolOf(s, 1)).hasteOnBoard).toBe(false);
  });

  test('the same on every sample of the same position', () => {
    const { g, view } = table({
      hand: [HASTY_SEVEN.name, 'Forest', 'Forest'],
      library: [
        [HASTY_SEVEN.name, 3],
        ['Forest', 20],
      ],
    });
    const a = determinize(g.state, 0, createRng(1));
    const b = determinize(g.state, 0, createRng(2));
    expect(profileOf(view, a, 1, poolOf(a, 1))).toEqual(profileOf(view, b, 1, poolOf(b, 1)));
  });
});

describe('the questions the profile makes worth asking', () => {
  const kinds = (t: ReturnType<typeof table>) =>
    threatsOf(t.view, t.sample, DEFAULT_WEIGHTS).map((x) => x.kind);

  test('a big creature is a threat only when it can attack before the agent next turn', () => {
    const plain = { hand: [SEVEN.name, 'Forest'], library: [[SEVEN.name, 3] as [string, number]] };
    expect(kinds(table({ ...plain, library: [...plain.library, ['Forest', 20]] }))).toEqual([]);
    const hasty = table({
      hand: [HASTY_SEVEN.name, 'Forest'],
      library: [
        [HASTY_SEVEN.name, 3],
        ['Forest', 20],
      ],
    });
    expect(kinds(hasty)).toEqual(['threat']);
    // A permanent of the opponent that gives haste makes its plain 7/7s threats too.
    const banner = table({
      ...plain,
      library: [...plain.library, ['Forest', 20]],
      battlefield: [BANNER.name],
    });
    expect(kinds(banner)).toEqual(['threat']);
  });

  test('a counterspell of an aggro deck needs twice the chance of one of another deck', () => {
    // One Counterspell in a pool of 41 and a hand of 5: about 12%, above `minThreatChance` and below twice it.
    const counter = (filler: string) =>
      table({
        hand: [filler, filler, filler, filler, filler],
        library: [
          ['Counterspell', 1],
          [filler, 35],
        ],
        untapped: true,
        land: 'Island',
      });
    const aggro = counter('Grizzly Bears');
    const other = counter('Divination');
    expect(deckOf(aggro.sample, 1).archetype).toBe('aggro');
    expect(deckOf(other.sample, 1).archetype).toBe('midrange');
    expect(kinds(other)).toEqual(['counter']);
    expect(kinds(aggro)).toEqual([]);
  });

  test('the crack-back asks for a creature from the hand only of a deck that has one it can pay for', () => {
    const plain = table({
      hand: [SEVEN.name, 'Forest'],
      library: [
        [SEVEN.name, 3],
        ['Forest', 20],
      ],
    });
    expect(hiddenAttackersOf(plain.view, plain.sample).size).toBe(0);
    const hasty = table({
      hand: [HASTY_SEVEN.name, 'Forest'],
      library: [
        [HASTY_SEVEN.name, 3],
        ['Forest', 20],
      ],
    });
    const h = hiddenAttackersOf(hasty.view, hasty.sample, opponentsOf(hasty.view, hasty.sample));
    // Four in a pool of 25, and a hand of 2 that draws one more.
    expect(h.get(1)?.chance).toBeCloseTo(atLeastOne(25, 4, 3), 12);
    expect(h.get(1)?.attacker).toMatchObject({ name: HASTY_SEVEN.name, power: 7, tapped: false });
    // A flash creature counts only with the mana open now: seven tapped Forests pay for none.
    const tapped = table({ hand: [FLASH_SEVEN.name], library: [[FLASH_SEVEN.name, 3]] });
    expect(hiddenAttackersOf(tapped.view, tapped.sample).size).toBe(0);
    const open = table({
      hand: [FLASH_SEVEN.name],
      library: [[FLASH_SEVEN.name, 3]],
      untapped: true,
    });
    expect(hiddenAttackersOf(open.view, open.sample).get(1)?.chance).toBe(1);
  });
});
