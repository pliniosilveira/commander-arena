/**
 * SYNTHETIC CARDS FOR ESCALATE (CR 702.120). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-145 (the Dinosaurs slice): a "choose one or more" instant with Escalate {1} (three modes, one of them aimed
 * at a creature, one at a player), a "choose one or both" sorcery with Escalate {2}{R} (a colored escalate cost), and a "choose two" instant
 * with Escalate {1} to show that a fixed number of modes costs the escalate cost once. Names start with "SYNTHETIC "; oracleId is null.
 * The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { SpellMode } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const hit: SpellMode = {
  text: 'Deals 2 damage to target creature.',
  targets: [{ id: 'hit', what: { kind: 'object', filter: { types: ['creature'] } } }],
  effect: { kind: 'dealDamage', amount: 2, to: { kind: 'target', id: 'hit' } },
};
const draw: SpellMode = {
  text: 'Target player draws a card.',
  targets: [{ id: 'who', what: { kind: 'player', filter: 'any' } }],
  effect: { kind: 'draw', player: { kind: 'target', id: 'who' }, count: 1 },
};
const gain: SpellMode = {
  text: 'You gain 3 life.',
  effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 },
};

export const SYNTHETIC_ESCALATE_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Escalating Charm',
    manaCost: ['1', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Escalate {1} Choose one or more — • Deals 2 damage to target creature. • Target player draws a card. • You gain 3 life.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'escalate', cost: [{ kind: 'mana', symbols: ['1'] }] } },
    ],
    spell: { chooseModes: { min: 1, max: 3 }, modes: [hit, draw, gain] },
  }),
  singleFace({
    name: 'SYNTHETIC Costly Both',
    manaCost: ['R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Escalate {2}{R} Choose one or both — • Target player draws a card. • You gain 3 life.',
    abilities: [
      {
        kind: 'keyword',
        keyword: { kind: 'escalate', cost: [{ kind: 'mana', symbols: ['2', 'R'] }] },
      },
    ],
    spell: { chooseModes: { min: 1, max: 2 }, modes: [draw, gain] },
  }),
  singleFace({
    name: 'SYNTHETIC Escalating Kicker Charm',
    manaCost: ['1', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Kicker {1} Escalate {1} Choose one or both — • Target player draws a card. • You gain 3 life.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'kicker', cost: [{ kind: 'mana', symbols: ['1'] }] } },
      { kind: 'keyword', keyword: { kind: 'escalate', cost: [{ kind: 'mana', symbols: ['1'] }] } },
    ],
    spell: { chooseModes: { min: 1, max: 2 }, modes: [draw, gain] },
  }),
  singleFace({
    name: 'SYNTHETIC Fixed Pair',
    manaCost: ['1', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Escalate {1} Choose two — • Deals 2 damage to target creature. • Target player draws a card. • You gain 3 life.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'escalate', cost: [{ kind: 'mana', symbols: ['1'] }] } },
    ],
    spell: { chooseModes: { min: 2, max: 2 }, modes: [hit, draw, gain] },
  }),
];
