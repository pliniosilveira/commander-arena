// The Miracle Worker deck (issue 109), group E1: REAL cards of the golden corpus read through the grammar only and played in an engine scenario: "lose flying and can't have or gain
// flying" (Archetype of Imagination, CR 613.1f, 613.7), the attack tax with an X (Sphere of Safety, CR 508.1d, 508.1h, 118.12a) and the stun counter static (Fear of Sleep Paralysis).
import { readFileSync } from 'node:fs';
import { syntheticCard, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const real = (name: string) => {
  const golden = cards.find((c) => c.name === name);
  if (golden === undefined) throw new Error(`${name} is not in the golden corpus`);
  return importCard(fromGoldenCard(golden), undefined, NO_OVERRIDES);
};

const ARCHETYPE = real('Archetype of Imagination');
const SPHERE = real('Sphere of Safety');
const FEAR = real('Fear of Sleep Paralysis');

describe('the cards read', () => {
  test.each([ARCHETYPE, SPHERE, FEAR])(
    '$definition.name: supported, validateCard is clean',
    (card) => {
      expect(card.support.status).toBe('supported');
      expect(card.support.unparsed).toEqual([]);
      expect(validateCard(card.definition)).toEqual([]);
    },
  );

  test('Archetype: flying for its controller’s creatures, and no flying for every opponent’s', () => {
    expect(ARCHETYPE.definition.faces[0]?.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
          keyword: { kind: 'flying' },
        },
      },
      {
        kind: 'static',
        static: {
          kind: 'loseKeyword',
          subject: { kind: 'filter', filter: { types: ['creature'], controller: 'opponent' } },
          keyword: { kind: 'flying' },
          cantHave: true,
        },
      },
    ]);
  });

  test('Sphere: {1} for each enchantment its controller controls, for each attacker', () => {
    expect(SPHERE.definition.faces[0]?.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'attackTax',
          cost: [{ kind: 'mana', symbols: ['1'] }],
          planeswalkers: true,
          times: { kind: 'countOf', filter: { types: ['enchantment'], controller: 'you' } },
        },
      },
    ]);
  });
});

describe('Archetype of Imagination in the engine', () => {
  const ARCH = 'Archetype of Imagination';
  const BEARS = 'Grizzly Bears';
  const ANGEL = 'Serra Angel';
  const GUST = 'SYNTHETIC Gust of Wings';

  test('3 seats: its controller’s creatures fly, the creatures of both opponents lose flying', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .define(ARCHETYPE.definition)
      .battlefield(ARCH, BEARS)
      .seat(1)
      .battlefield(ANGEL, BEARS)
      .seat(2)
      .battlefield(ANGEL)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.derived('Grizzly Bears[0]', { keywords: ['flying'] });
    g.expect.derived(ARCH, { keywords: ['flying'] });
    g.expect.derived('Serra Angel[0]', { keywords: ['vigilance'] });
    g.expect.derived('Serra Angel[1]', { keywords: ['vigilance'] });
    g.expect.derived('Grizzly Bears[1]', { keywords: [] });
  });

  test('a creature that enters later is affected too, and only the keyword goes', () => {
    const g = scenario()
      .seat(0)
      .define(ARCHETYPE.definition)
      .battlefield(ARCH, 'Plains', 'Plains')
      .seat(1)
      .library('Island', 'Island')
      .hand(ANGEL)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(ANGEL, { pay: true });
    g.passAll();
    g.expect.derived(ANGEL, { keywords: ['vigilance'] });
  });

  test('a spell that gives flying to an opponent’s creature does nothing while it is out (CR 613.7)', () => {
    const g = scenario({ seats: 3 })
      .define(ARCHETYPE.definition)
      .define(syntheticCard(GUST))
      .seat(0)
      .battlefield('Island', 'Island')
      .hand(GUST)
      .battlefield(ARCH)
      .seat(1)
      .battlefield(BEARS)
      .seat(2)
      .battlefield(BEARS)
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    g.act(0).cast(GUST, { targets: ['Grizzly Bears[0]'], pay: true });
    g.passAll();
    g.expect.derived('Grizzly Bears[0]', { keywords: [] });
  });

  test('without it the same spell gives flying', () => {
    const g = scenario({ seats: 3 })
      .define(syntheticCard(GUST))
      .seat(0)
      .battlefield('Island', 'Island')
      .hand(GUST)
      .seat(1)
      .battlefield(BEARS)
      .seat(2)
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    g.act(0).cast(GUST, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.derived(BEARS, { keywords: ['flying'] });
  });

  test('each player controlling one: no creature has flying', () => {
    const g = scenario()
      .define(ARCHETYPE.definition)
      .seat(0)
      .battlefield(ARCH, BEARS)
      .seat(1)
      .battlefield(ARCH, BEARS)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.derived('Grizzly Bears[0]', { keywords: [] });
    g.expect.derived('Grizzly Bears[1]', { keywords: [] });
    g.expect.derived('Archetype of Imagination[0]', { keywords: [] });
    g.expect.derived('Archetype of Imagination[1]', { keywords: [] });
  });
});

describe('Fear of Sleep Paralysis in the engine', () => {
  const NAME = 'Fear of Sleep Paralysis';
  const BEARS = 'Grizzly Bears';
  const PATH = 'SYNTHETIC Wandering Path';

  test('its abilities: flying, eerie for three events, the stun counter lock', () => {
    const abilities = FEAR.definition.faces[0]?.abilities ?? [];
    const triggers = abilities.flatMap((a) => (a.kind === 'triggered' ? [a.trigger.kind] : []));
    expect(triggers).toEqual(['entersBattlefield', 'entersBattlefield', 'roomFullyUnlocked']);
    expect(abilities).toContainEqual({
      kind: 'static',
      static: {
        kind: 'cantRemoveCounters',
        counter: 'stun',
        permanents: { controller: 'opponent' },
      },
    });
  });

  test('another enchantment entering taps up to one target creature and stuns it; it then stays tapped', () => {
    const g = scenario({ seats: 3 })
      .define(FEAR.definition)
      .define(syntheticCard(PATH))
      .seat(0)
      .library('Island', 'Island')
      .hand(PATH)
      .battlefield(NAME, 'Forest', 'Forest', 'Forest')
      .seat(1)
      .library('Island', 'Island')
      .battlefield(BEARS, { label: 'bears' })
      .seat(2)
      .library('Island', 'Island')
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    g.act(0).cast(PATH, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('bears');
    g.passAll();
    g.expect.tapped('bears');
    g.expect.counters('bears', { stun: 1 });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('bears');
    g.expect.counters('bears', { stun: 1 });
  });
});

describe('Sphere of Safety in the engine', () => {
  const NAME = 'Sphere of Safety';
  const BEARS = 'Grizzly Bears';

  function game(mountains: number) {
    const b = scenario({ seats: 3 }).define(SPHERE.definition);
    b.seat(0).library('Island', 'Island').battlefield(BEARS, BEARS);
    b.seat(0).battlefield(...Array.from({ length: mountains }, () => 'Mountain'));
    b.seat(1).library('Island', 'Island').battlefield(NAME, 'Island');
    b.seat(2).library('Island', 'Island');
    const g = b.at('precombatMain', { active: 0 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    return g;
  }

  test('2 attackers on the controller pay {X} each, X the enchantments it controls (3 seats)', () => {
    const g = game(4);
    g.act(0).attack(['Grizzly Bears[0]', 'Grizzly Bears[1]'], { player: 1 });
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error(`expected payMana, got ${d?.kind}`);
    // Seat 1 controls one enchantment (the Sphere itself): {1} for each of the two creatures.
    expect(d.totalCost).toEqual(['1', '1']);
  });

  test('an attack on another opponent costs nothing', () => {
    const g = game(0);
    g.act(0).attack(['Grizzly Bears[0]', 'Grizzly Bears[1]'], { player: 2 });
    g.expect.combat({ attackers: ['Grizzly Bears[0]', 'Grizzly Bears[1]'] });
  });
});
