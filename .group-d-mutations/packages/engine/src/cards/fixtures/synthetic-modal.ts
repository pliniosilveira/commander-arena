/**
 * SYNTHETIC MODAL CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests and the soak games of modal spells and abilities (D-105, D-114, CR 700.2):
 * "choose one" with three modes (one of them aimed at a target), "choose two" with a target in two modes,
 * "choose one or both" with two targeted modes, "choose one or more", a "choose one" that lets a player with a
 * commander choose both, a modal spell with kicker, a modal spell with X, modal enters and attack triggers,
 * and a modal activated ability. Names start with "SYNTHETIC "; oracleId is null. The text describes what
 * the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, Effect, SpellMode, TargetSpec } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const X = { kind: 'x' } as const;
const OPPONENTS = { kind: 'eachOpponent' } as const;

const target = (id: string) => ({ kind: 'target', id }) as const;
const creature = (id: string): TargetSpec => ({
  id,
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
});
const opposingCreature = (id: string): TargetSpec => ({
  id,
  what: {
    kind: 'object',
    filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
  },
});
const opposingArtifact = (id: string): TargetSpec => ({
  id,
  what: {
    kind: 'object',
    filter: { zone: 'battlefield', types: ['artifact'], controller: 'opponent' },
  },
});
const anyPlayer = (id: string): TargetSpec => ({ id, what: { kind: 'player', filter: 'any' } });
const opponentPlayer = (id: string): TargetSpec => ({
  id,
  what: { kind: 'player', filter: 'opponent' },
});

const damage = (amount: number | typeof X, id: string): Effect => ({
  kind: 'dealDamage',
  amount,
  to: target(id),
});
const draw = (count: number | typeof X = 1): Effect => ({ kind: 'draw', player: YOU, count });
const gain = (amount: number): Effect => ({ kind: 'gainLife', player: YOU, amount });

const mode = (text: string, effect: Effect, target?: TargetSpec): SpellMode => ({
  text,
  effect,
  ...(target === undefined ? {} : { targets: [target] }),
});

/** An empty effect: the `effect` of a modal ability, whose effects are in its modes (D-114). */
const NONE: Effect = { kind: 'sequence', effects: [] };

const KICKER_ONE: Ability = {
  kind: 'keyword',
  keyword: { kind: 'kicker', cost: [{ kind: 'mana', symbols: ['1'] }] },
};

const imp = (name: string, oracleText: string, abilities: readonly Ability[]): CardDefinition =>
  singleFace({
    name,
    manaCost: ['2', 'G'],
    types: ['creature'],
    subtypes: ['Imp'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText,
    abilities,
  });

export const SYNTHETIC_MODAL_LIST: readonly CardDefinition[] = [
  // "Choose one — • ~ deals 3 damage to target creature. • Draw a card. • You gain 3 life."
  singleFace({
    name: 'SYNTHETIC Three Way Charm',
    manaCost: ['1', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Choose one — • Deals 3 damage to target creature. • Draw a card. • You gain 3 life.',
    spell: {
      chooseModes: { min: 1, max: 1 },
      modes: [
        mode('Deals 3 damage to target creature.', damage(3, 'kill'), creature('kill')),
        mode('Draw a card.', draw()),
        mode('You gain 3 life.', gain(3)),
      ],
    },
  }),
  // "Choose two — • Deals 2 damage to target creature. • Target player gains 3 life. • Draw a card."
  singleFace({
    name: 'SYNTHETIC Twin Charm',
    manaCost: ['1', 'R', 'W'],
    types: ['instant'],
    colors: ['W', 'R'],
    colorIdentity: ['W', 'R'],
    oracleText:
      'Choose two — • Deals 2 damage to target creature. • Target player gains 3 life. • Draw a card.',
    spell: {
      chooseModes: { min: 2, max: 2 },
      modes: [
        mode('Deals 2 damage to target creature.', damage(2, 'hit'), creature('hit')),
        mode(
          'Target player gains 3 life.',
          {
            kind: 'gainLife',
            player: target('who'),
            amount: 3,
          },
          anyPlayer('who'),
        ),
        mode('Draw a card.', draw()),
      ],
    },
  }),
  // "Choose one or both — • Draw a card. • You gain 4 life."
  singleFace({
    name: 'SYNTHETIC Both Charm',
    manaCost: ['2', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Choose one or both — • Draw a card. • You gain 4 life.',
    spell: {
      chooseModes: { min: 1, max: 2 },
      modes: [mode('Draw a card.', draw()), mode('You gain 4 life.', gain(4))],
    },
  }),
  // "Choose one or both — • Deals 2 damage to target creature. • Deals 2 damage to target opponent."
  singleFace({
    name: 'SYNTHETIC Split Strike',
    manaCost: ['1', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Choose one or both — • Deals 2 damage to target creature. • Deals 2 damage to target opponent.',
    spell: {
      chooseModes: { min: 1, max: 2 },
      modes: [
        mode('Deals 2 damage to target creature.', damage(2, 'c'), creature('c')),
        mode('Deals 2 damage to target opponent.', damage(2, 'p'), opponentPlayer('p')),
      ],
    },
  }),
  // "Choose one or more — • Draw a card. • You gain 2 life. • Deals 1 damage to target creature."
  singleFace({
    name: 'SYNTHETIC Many Charm',
    manaCost: ['3', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'Choose one or more — • Draw a card. • You gain 2 life. • Deals 1 damage to target creature.',
    spell: {
      chooseModes: { min: 1, max: 3 },
      modes: [
        mode('Draw a card.', draw()),
        mode('You gain 2 life.', gain(2)),
        mode('Deals 1 damage to target creature.', damage(1, 'ping'), creature('ping')),
      ],
    },
  }),
  // "Choose one. If you control a commander as you cast this spell, you may choose both instead.
  //  • Draw a card. • You gain 3 life."
  singleFace({
    name: 'SYNTHETIC Command Charm',
    manaCost: ['1', 'W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'Choose one. If you control a commander as you cast this spell, you may choose both instead. • Draw a card. • You gain 3 life.',
    spell: {
      chooseModes: {
        min: 1,
        max: 1,
        maxIf: { condition: { kind: 'controlCommander' }, max: 2 },
      },
      modes: [mode('Draw a card.', draw()), mode('You gain 3 life.', gain(3))],
    },
  }),
  // "Kicker {1}. Choose one — • Deals 2 damage to target creature. • Draw a card."
  singleFace({
    name: 'SYNTHETIC Kicked Charm',
    manaCost: ['R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Kicker {1}. Choose one — • Deals 2 damage to target creature. • Draw a card.',
    abilities: [KICKER_ONE],
    spell: {
      chooseModes: { min: 1, max: 1 },
      modes: [
        mode('Deals 2 damage to target creature.', damage(2, 'k'), creature('k')),
        mode('Draw a card.', draw()),
      ],
    },
  }),
  // "Choose one — • Deals X damage to target creature. • Draw X cards."
  singleFace({
    name: 'SYNTHETIC X Charm',
    manaCost: ['X', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Choose one — • Deals X damage to target creature. • Draw X cards.',
    spell: {
      x: true,
      chooseModes: { min: 1, max: 1 },
      modes: [
        mode('Deals X damage to target creature.', damage(X, 'xd'), creature('xd')),
        mode('Draw X cards.', draw(X)),
      ],
    },
  }),
  // "When this creature enters, choose one — • You gain 3 life. • It deals 2 damage to target creature an
  //  opponent controls."
  imp(
    'SYNTHETIC Modal Greeter',
    'When this creature enters, choose one — • You gain 3 life. • It deals 2 damage to target creature an opponent controls.',
    [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: NONE,
        chooseModes: { min: 1, max: 1 },
        modes: [
          mode('You gain 3 life.', gain(3)),
          mode(
            'It deals 2 damage to target creature an opponent controls.',
            damage(2, 'hit'),
            opposingCreature('hit'),
          ),
        ],
      },
    ],
  ),
  // "When this creature enters, choose one — • Destroy target artifact an opponent controls. • It deals 2
  //  damage to target creature an opponent controls." Both modes need a target.
  imp(
    'SYNTHETIC Modal Hunter',
    'When this creature enters, choose one — • Destroy target artifact an opponent controls. • It deals 2 damage to target creature an opponent controls.',
    [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: NONE,
        chooseModes: { min: 1, max: 1 },
        modes: [
          mode(
            'Destroy target artifact an opponent controls.',
            { kind: 'destroy', objects: target('art') },
            opposingArtifact('art'),
          ),
          mode(
            'It deals 2 damage to target creature an opponent controls.',
            damage(2, 'hit'),
            opposingCreature('hit'),
          ),
        ],
      },
    ],
  ),
  // "When this creature enters, choose two — • Draw a card. • It deals 1 damage to target creature an
  //  opponent controls. • Target player gains 2 life."
  imp(
    'SYNTHETIC Twin Greeter',
    'When this creature enters, choose two — • Draw a card. • It deals 1 damage to target creature an opponent controls. • Target player gains 2 life.',
    [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: NONE,
        chooseModes: { min: 2, max: 2 },
        modes: [
          mode('Draw a card.', draw()),
          mode(
            'It deals 1 damage to target creature an opponent controls.',
            damage(1, 'hit'),
            opposingCreature('hit'),
          ),
          mode(
            'Target player gains 2 life.',
            { kind: 'gainLife', player: target('who'), amount: 2 },
            anyPlayer('who'),
          ),
        ],
      },
    ],
  ),
  // "Whenever this creature attacks, choose one — • Draw a card. • It deals 1 damage to target creature an
  //  opponent controls."
  imp(
    'SYNTHETIC Modal Raider',
    'Whenever this creature attacks, choose one — • Draw a card. • It deals 1 damage to target creature an opponent controls.',
    [
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        effect: NONE,
        chooseModes: { min: 1, max: 1 },
        modes: [
          mode('Draw a card.', draw()),
          mode(
            'It deals 1 damage to target creature an opponent controls.',
            damage(1, 'hit'),
            opposingCreature('hit'),
          ),
        ],
      },
    ],
  ),
  // "{1}, {T}: Choose one — • Draw a card. • Deals 2 damage to target creature. • You gain 2 life."
  singleFace({
    name: 'SYNTHETIC Modal Totem',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{1}, {T}: Choose one — • Draw a card. • Deals 2 damage to target creature. • You gain 2 life.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['1'] }, { kind: 'tap' }],
        effect: NONE,
        chooseModes: { min: 1, max: 1 },
        modes: [
          mode('Draw a card.', draw()),
          mode('Deals 2 damage to target creature.', damage(2, 'zap'), creature('zap')),
          mode('You gain 2 life.', gain(2)),
        ],
      },
    ],
  }),
  // "{T}: Choose one — • Deals 2 damage to target creature an opponent controls. • Destroy target artifact
  // an opponent controls." Both modes need a target, so it can be activated only when one exists.
  singleFace({
    name: 'SYNTHETIC Picky Totem',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{T}: Choose one — • Deals 2 damage to target creature an opponent controls. • Destroy target artifact an opponent controls.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        effect: NONE,
        chooseModes: { min: 1, max: 1 },
        modes: [
          mode(
            'Deals 2 damage to target creature an opponent controls.',
            damage(2, 'hit'),
            opposingCreature('hit'),
          ),
          mode(
            'Destroy target artifact an opponent controls.',
            { kind: 'destroy', objects: target('art') },
            opposingArtifact('art'),
          ),
        ],
      },
    ],
  }),
  // "Choose one — • Each opponent loses 2 life. • You gain 2 life." (no targets, for the soak games)
  singleFace({
    name: 'SYNTHETIC Drain Charm',
    manaCost: ['B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Choose one — • Each opponent loses 2 life. • You gain 2 life.',
    spell: {
      chooseModes: { min: 1, max: 1 },
      modes: [
        mode('Each opponent loses 2 life.', { kind: 'loseLife', player: OPPONENTS, amount: 2 }),
        mode('You gain 2 life.', gain(2)),
      ],
    },
  }),
];
