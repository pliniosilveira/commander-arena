// Spells with an {X} that act on creatures (the Quandrix Unlimited deck, group D1), read by the grammar and run by the engine: Curse of the Swine (already read before this group),
// Oversimplify, Primal Might, Biomass Mutation and Silkguard. The first block reads the REAL Oracle text of each card from the golden corpus, whole, and says what it lowers
// to; the rest play those real cards through `applyAction` with the scenario DSL (the creatures and the Aura on the board are engine fixtures, one SYNTHETIC), plus the near
// misses the grammar must not read.
import { readFileSync } from 'node:fs';
import { type CardDefinition, type Effect, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parseOnly, spellCard } from './convert-grammar-helpers';

const CORPUS = new URL('./fixtures/corpus/golden.jsonl', import.meta.url);
const GOLDEN: readonly GoldenCard[] = parseGolden(readFileSync(CORPUS, 'utf8'));

const real = (name: string) => {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  return importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
};

const LIB = Array.from({ length: 12 }, () => 'Plains');
const BEARS = 'Grizzly Bears'; // 2/2
const ANGEL = 'Serra Angel'; // 4/4 flying vigilance
const GROWTH = 'SYNTHETIC Growth Aura'; // Enchant permanent. Enchanted creature gets +1/+1.

const CURSE = 'Curse of the Swine';
const OVERSIMPLIFY = 'Oversimplify';
const MIGHT = 'Primal Might';
const BIOMASS = 'Biomass Mutation';
const SILKGUARD = 'Silkguard';

const FRACTAL = 'Fractal';

const base = () =>
  scenario()
    .seat(0)
    .library(...LIB)
    .seat(1)
    .library(...LIB)
    .seat(0);

describe('the real cards, whole', () => {
  test.each([CURSE, OVERSIMPLIFY, MIGHT, BIOMASS, SILKGUARD])('%s is supported', (name) => {
    const imported = real(name);
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
  });

  test('Primal Might: the pump, then a fight with a second target that may be left out', () => {
    expect(real(MIGHT).definition.faces[0]?.spell).toMatchObject({
      x: true,
      targets: [{ id: 't1' }, { id: 't2', min: 0, max: 1 }],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'modifyPt', power: { kind: 'x' }, toughness: { kind: 'x' } },
          {
            kind: 'fight',
            fighters: { kind: 'target', id: 't1' },
            against: { kind: 'target', id: 't2' },
          },
        ],
      },
    });
  });

  test('Biomass Mutation: base power and toughness X/X for the creatures you control, until end of turn', () => {
    expect(real(BIOMASS).definition.faces[0]?.spell).toEqual({
      x: true,
      effect: {
        kind: 'setPt',
        objects: {
          kind: 'each',
          filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
        },
        power: { kind: 'x' },
        toughness: { kind: 'x' },
        duration: 'untilEndOfTurn',
      },
    });
  });

  test('Silkguard: a counter on each of up to X targets, then hexproof for Auras, Equipment and modified creatures', () => {
    expect(real(SILKGUARD).definition.faces[0]?.spell).toMatchObject({
      x: true,
      targets: [{ id: 't1', countX: true, min: 0 }],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'addCounters', counter: '+1/+1', count: 1 },
          {
            kind: 'grantKeyword',
            objects: {
              kind: 'each',
              filter: {
                controller: 'you',
                anyOf: [
                  { subtypes: ['Aura'] },
                  { subtypes: ['Equipment'] },
                  { types: ['creature'], modified: true },
                ],
              },
            },
            keyword: { kind: 'hexproof' },
            duration: 'untilEndOfTurn',
          },
        ],
      },
    });
  });

  test('Oversimplify: exile all, each player makes the token, counters for what they lost', () => {
    expect(real(OVERSIMPLIFY).definition.faces[0]?.spell).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exile', objects: { kind: 'each' } },
          { kind: 'createToken', controller: { kind: 'eachPlayer' } },
          {
            kind: 'addCounters',
            objects: { kind: 'moved' },
            counter: '+1/+1',
            count: { kind: 'thisWay', what: 'exiledPowerOwn' },
            perController: true,
          },
        ],
      },
    });
  });
});

describe('the engine refuses what would read nothing', () => {
  const withEffects = (
    definition: CardDefinition,
    change: (effects: readonly Effect[]) => readonly Effect[],
  ): CardDefinition => {
    const face = definition.faces[0];
    const spell = face?.spell;
    if (face === undefined || spell == null || spell.effect?.kind !== 'sequence') {
      throw new Error('expected a sequence');
    }
    const effects = change(spell.effect.effects);
    return {
      ...definition,
      faces: [{ ...face, spell: { ...spell, effect: { ...spell.effect, effects } } }],
    };
  };

  test('Oversimplify as lowered is valid', () => {
    expect(validateCard(real(OVERSIMPLIFY).definition)).toEqual([]);
  });

  test('the total power exiled needs perController', () => {
    const broken = withEffects(real(OVERSIMPLIFY).definition, (effects) =>
      effects.map((e) => {
        if (e.kind !== 'addCounters') return e;
        const { perController: _drop, ...rest } = e;
        return rest;
      }),
    );
    expect(validateCard(broken).map((i) => i.message)).toContain(
      'exiledPowerOwn is read only by an addCounters with perController',
    );
  });

  test('the total power exiled needs an exile before it', () => {
    const broken = withEffects(real(OVERSIMPLIFY).definition, (effects) => effects.slice(1));
    expect(
      validateCard(broken)
        .map((i) => i.message)
        .join('\n'),
    ).toContain('needs an exile effect');
  });
});

describe('the grammar does not read near misses', () => {
  const status = (text: string, type: 'Instant' | 'Sorcery' = 'Sorcery') =>
    parseOnly(spellCard('SYNTHETIC Near Miss', text, { type, manaCost: '{X}{G}' })).support.status;

  test.each([
    // no duration: base power and toughness would last for ever, a different effect
    'Creatures you control have base power and toughness X/X.',
    // not the creatures of one group
    'Target creature has base power and toughness X/X until end of turn.',
    // the second target is "up to one", never "up to two"
    "Target creature you control gets +X/+X until end of turn. Then it fights up to two target creatures you don't control.",
    // the first creature is not optional
    "Up to one target creature you control fights up to one target creature you don't control.",
    // counters for what a player controlled that was destroyed: another count
    'Destroy all creatures. Each player creates a 0/0 green and blue Fractal creature token and puts a number of +1/+1 counters on it equal to the total power of creatures they controlled that were destroyed this way.',
    // the group of Silkguard's second sentence is exactly that one
    'Auras and modified creatures you control gain hexproof until end of turn.',
  ])('is not supported: %s', (text) => {
    expect(status(text)).not.toBe('supported');
  });
});

describe('Primal Might (CR 701.14 Fight, 608.2b)', () => {
  const board = () =>
    base()
      .define(real(MIGHT).definition)
      .hand(MIGHT)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest')
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .battlefield(ANGEL, { label: 'theirs' })
      .battlefield(BEARS, { label: 'weak' })
      .seat(0)
      .at('precombatMain')
      .build();

  test('X = 2: the creature is 4/4 and fights, dealing and taking damage equal to power', () => {
    const g = board();
    g.act(0).cast(MIGHT).x(2).targets(['mine', 'weak']).pay();
    g.passAll();
    // The 4/4 (2/2 with +2/+2) kills the Bears, which deal 2 to it.
    g.expect.noObject(BEARS, { zone: 'battlefield', seat: 1 });
    g.expect.pt('mine', 4, 4);
    g.expect.damage('mine', 2);
  });

  test('the pump lasts until end of turn only', () => {
    const g = board();
    g.act(0).cast(MIGHT).x(3).targets(['mine', 'weak']).pay();
    g.passAll();
    g.expect.pt('mine', 5, 5);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.pt('mine', 2, 2);
  });

  test('"up to one": with no creature to fight chosen, the creature only gets the bonus', () => {
    const g = board();
    g.act(0).cast(MIGHT).x(1).targets(['mine']).pay();
    g.passAll();
    g.expect.pt('mine', 3, 3);
    g.expect.damage('mine', 0);
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('only a creature you do not control can be the second target', () => {
    const g = base()
      .define(real(MIGHT).definition)
      .hand(MIGHT)
      .battlefield('Forest', 'Forest')
      .battlefield(BEARS, { label: 'mine' })
      .battlefield(BEARS, { label: 'mine2' })
      .at('precombatMain')
      .build();
    expect(() => g.act(0).cast(MIGHT).x(1).targets(['mine', 'mine2']).pay()).toThrow();
  });
});

describe('Biomass Mutation (CR 613.4b, 611.2c)', () => {
  const board = () =>
    base()
      .define(real(BIOMASS).definition)
      .hand(BIOMASS)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .battlefield(BEARS, { label: 'a' })
      .battlefield(ANGEL, { label: 'b' })
      .battlefield(BEARS, { label: 'c', counters: { '+1/+1': 2 } })
      .battlefield(GROWTH, { attachedTo: 'a' })
      .seat(1)
      .battlefield(BEARS, { label: 'theirs' })
      .seat(0)
      .at('precombatMain')
      .build();

  test('X = 3: every creature you control has base 3/3; counters and bonuses still apply on top', () => {
    const g = board();
    g.act(0).cast(BIOMASS).x(3).pay();
    g.passAll();
    g.expect.pt('a', 4, 4); // base 3/3 + Aura +1/+1
    g.expect.pt('b', 3, 3);
    g.expect.pt('c', 5, 5); // base 3/3 + two counters
    g.expect.pt('theirs', 2, 2);
  });

  test('X = 0: the creatures are 0/0 and the 2/2 without counters dies', () => {
    const g = board();
    g.act(0).cast(BIOMASS).x(0).pay();
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard');
    g.expect.pt('c', 2, 2);
  });

  test('a creature that arrives later is not affected (CR 611.2c)', () => {
    const g = base()
      .define(real(BIOMASS).definition)
      .hand(BIOMASS, BEARS)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .battlefield(ANGEL, { label: 'b' })
      .at('precombatMain')
      .build();
    g.act(0).cast(BIOMASS).x(1).pay();
    g.passAll();
    g.expect.pt('b', 1, 1);
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.pt(BEARS, 2, 2);
  });
});

describe('Silkguard (CR 700.9 Modified, 702.11 Hexproof, 107.3 {X})', () => {
  const board = () =>
    base()
      .define(real(SILKGUARD).definition)
      .hand(SILKGUARD)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest')
      .battlefield(BEARS, { label: 'a' })
      .battlefield(BEARS, { label: 'b' })
      .battlefield(BEARS, { label: 'plain' })
      .battlefield(BEARS, { label: 'countered', counters: { stun: 1 } })
      .battlefield(GROWTH, { attachedTo: 'plain' })
      .seat(1)
      .battlefield(BEARS, { label: 'theirs', counters: { '+1/+1': 1 } })
      .seat(0)
      .at('precombatMain')
      .build();

  const hexproof = (g: ReturnType<typeof board>, label: string) =>
    g
      .view(0)
      .battlefield.find((o) => o.id === g.id(label))
      ?.keywords.includes('hexproof');

  test('X = 2: two creatures get a counter and hexproof, so do the creatures that were already modified', () => {
    const g = board();
    g.act(0).cast(SILKGUARD).x(2).targets(['a', 'b']).pay();
    g.passAll();
    g.expect.counters('a', { '+1/+1': 1 });
    g.expect.counters('b', { '+1/+1': 1 });
    g.expect.counters('plain', {});
    expect(hexproof(g, 'a')).toBe(true);
    expect(hexproof(g, 'b')).toBe(true);
    // Modified before: a counter of another kind, and the Aura that enchants a creature of yours.
    expect(hexproof(g, 'countered')).toBe(true);
    expect(hexproof(g, 'plain')).toBe(true);
    // The Aura itself is one of the permanents that gain it.
    expect(hexproof(g, GROWTH)).toBe(true);
  });

  test('the counters are put first, so a creature that had none is modified by this very spell', () => {
    const g = base()
      .define(real(SILKGUARD).definition)
      .hand(SILKGUARD)
      .battlefield('Forest', 'Forest')
      .battlefield(BEARS, { label: 'a' })
      .battlefield(BEARS, { label: 'b' })
      .at('precombatMain')
      .build();
    g.act(0).cast(SILKGUARD).x(1).targets(['a']).pay();
    g.passAll();
    expect(hexproof(g, 'a')).toBe(true);
    expect(hexproof(g, 'b')).toBe(false);
  });

  test('X = 0: no counters, and only what was modified already gains hexproof', () => {
    const g = board();
    g.act(0).cast(SILKGUARD).x(0).pay();
    g.passAll();
    expect(hexproof(g, 'a')).toBe(false);
    expect(hexproof(g, 'plain')).toBe(true);
    expect(hexproof(g, 'countered')).toBe(true);
    g.expect.counters('countered', { stun: 1 });
  });

  test('a creature an opponent controls is not given hexproof, modified or not', () => {
    const g = board();
    g.act(0).cast(SILKGUARD).x(1).targets(['a']).pay();
    g.passAll();
    const theirs = g.view(1).battlefield.find((o) => o.id === g.id('theirs'));
    expect(theirs?.keywords).not.toContain('hexproof');
  });

  test('X caps the targets: more than X is refused', () => {
    const g = board();
    expect(() => g.act(0).cast(SILKGUARD).x(1).targets(['a', 'b']).pay()).toThrow();
  });

  test('the hexproof ends with the turn', () => {
    const g = board();
    g.act(0).cast(SILKGUARD).x(1).targets(['a']).pay();
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(hexproof(g, 'a')).toBe(false);
  });
});

describe('Oversimplify (CR 608.2h, 111.2, 122.6)', () => {
  const FIVE = ['Forest', 'Forest', 'Island', 'Island', 'Island'] as const;

  test('each player gets a Fractal with counters equal to the total power of their own creatures that were exiled', () => {
    const g = base()
      .define(real(OVERSIMPLIFY).definition)
      .hand(OVERSIMPLIFY)
      .battlefield(...FIVE)
      .battlefield(BEARS, { label: 'a' })
      .battlefield(ANGEL, { label: 'b' })
      .seat(1)
      .battlefield(BEARS, { label: 'theirs' })
      .seat(0)
      .at('precombatMain')
      .build();
    g.act(0).cast(OVERSIMPLIFY, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.zone(ANGEL, 'exile', { seat: 0 });
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    const fractals = g
      .view(0)
      .battlefield.filter((o) => o.name === FRACTAL)
      .map((o) => [o.controller, o.power, o.toughness]);
    expect(fractals).toEqual(
      expect.arrayContaining([
        [0, 6, 6],
        [1, 2, 2],
      ]),
    );
    expect(fractals).toHaveLength(2);
  });

  test('the power counted is the power as it was (a counter and an Aura count)', () => {
    const g = base()
      .define(real(OVERSIMPLIFY).definition)
      .hand(OVERSIMPLIFY)
      .battlefield(...FIVE)
      .battlefield(BEARS, { label: 'a', counters: { '+1/+1': 2 } })
      .battlefield(GROWTH, { attachedTo: 'a' })
      .seat(1)
      .battlefield('Forest')
      .seat(0)
      .at('precombatMain')
      .build();
    g.act(0).cast(OVERSIMPLIFY, { pay: true });
    g.passAll();
    const mine = g.view(0).battlefield.find((o) => o.name === FRACTAL && o.controller === 0);
    expect(mine?.power).toBe(5);
    expect(mine?.toughness).toBe(5);
  });

  test('a player who controlled no creature gets a 0/0 token that dies', () => {
    const g = base()
      .define(real(OVERSIMPLIFY).definition)
      .hand(OVERSIMPLIFY)
      .battlefield(...FIVE)
      .battlefield(ANGEL, { label: 'b' })
      .at('precombatMain')
      .build();
    g.act(0).cast(OVERSIMPLIFY, { pay: true });
    g.passAll();
    const fractals = g.view(0).battlefield.filter((o) => o.name === FRACTAL);
    expect(fractals.map((o) => [o.controller, o.power])).toEqual([[0, 4]]);
  });

  test('a noncreature permanent is not exiled and adds nothing', () => {
    const g = base()
      .define(real(OVERSIMPLIFY).definition)
      .hand(OVERSIMPLIFY)
      .battlefield(...FIVE)
      .battlefield(BEARS, { label: 'a' })
      .at('precombatMain')
      .build();
    g.act(0).cast(OVERSIMPLIFY, { pay: true });
    g.passAll();
    g.expect.zone('Forest', 'battlefield');
    const mine = g.view(0).battlefield.find((o) => o.name === FRACTAL && o.controller === 0);
    expect(mine?.power).toBe(2);
  });
});

describe('Curse of the Swine (CR 107.3, 111.2): the engine runs the line read before this group', () => {
  test('X = 2 exiles two creatures; each controller gets a 2/2 Boar', () => {
    const g = base()
      .define(real(CURSE).definition)
      .hand(CURSE)
      .battlefield('Island', 'Island', 'Island', 'Island')
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .battlefield(ANGEL, { label: 'theirs' })
      .seat(0)
      .at('precombatMain')
      .build();
    g.act(0).cast(CURSE).x(2).targets(['mine', 'theirs']).pay();
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.zone(ANGEL, 'exile', { seat: 1 });
    const boars = g
      .view(0)
      .battlefield.filter((o) => o.name === 'Boar')
      .map((o) => [o.controller, o.power, o.toughness]);
    expect(boars).toEqual(
      expect.arrayContaining([
        [0, 2, 2],
        [1, 2, 2],
      ]),
    );
    expect(boars).toHaveLength(2);
  });
});
