/**
 * Noun rules of group 10 of the Hashaton deck (issue 31, D-386): "X target creature cards from your graveyard" (Restless Dreams: "As an additional cost to cast this
 * spell, discard X cards. Return X target creature cards from your graveyard to your hand.").
 */
import { literal, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, node, spanned } from '../registry';
import { graveyardPhrase } from './phrases';

type Bare = Omit<IrNoun, 'span' | 'rule'>;

/**
 * `noun.x-target-graveyard-cards`: "X target creature cards from your graveyard", "X target cards from your graveyard" (CR 107.3a, 601.2b-c, 404.1, 115.1): as many targets as the X
 * announced for the spell, cards of your own graveyard (the plural phrase of `noun.target-graveyard-card`, with X for the count). Its own rule, so the phrase "X target ..." is read only
 * where an effect asks for this noun by its id (`effect.return`); the lowering reads the X as the engine's `countX` and only in the text of a spell. Not read: "X target creature card",
 * "X target creatures", "up to X target creature cards", "X target creature cards from a graveyard", "X creature cards from your graveyard", "Y target creature cards from your graveyard",
 * "{X} target creature cards from your graveyard".
 */
export const NOUN_X_TARGET_GRAVEYARD_CARDS = defineRule<IrNoun>({
  id: 'noun.x-target-graveyard-cards',
  family: 'noun',
  leading: ['x'],
  cites: [
    'CR 107.3a (Numbers and Symbols)',
    'CR 601.2b (Casting Spells)',
    'CR 601.2c (Casting Spells)',
    'CR 404.1 (Graveyard)',
    'CR 115.1 (Targets)',
  ],
  examples: [
    'X target creature cards from your graveyard',
    'X target cards from your graveyard',
    'X target land cards from your graveyard',
    'x target creature cards from your graveyard',
  ],
  rejects: [
    'X target creature card from your graveyard',
    'X target creatures',
    'up to X target creature cards from your graveyard',
    'X target creature cards from a graveyard',
    "X target creature cards from an opponent's graveyard",
    'X creature cards from your graveyard',
    'Y target creature cards from your graveyard',
    '{X} target creature cards from your graveyard',
    'X target creature cards',
    'two target creature cards from your graveyard',
  ],
  parse: node<
    { count: { span: { start: number; end: number } }; filter: IrNoun['filter'] },
    IrNoun
  >(
    'noun.x-target-graveyard-cards',
    map(
      sequence(
        spanned(literal('X')),
        literal(' target '),
        // Your graveyard only: the cards go to your hand (CR 400.3), and "X target creature cards from a graveyard" is another sentence.
        satisfy(graveyardPhrase(true, 'from'), (filter) => filter.controller === 'you'),
      ),
      ([count, , filter]) => ({ count, filter }),
    ),
    ({ count, filter }): Bare => ({
      kind: 'noun',
      det: 'target',
      filter,
      count: { kind: 'x', span: count.span },
      upTo: false,
      plural: true,
      other: false,
    }),
  ),
});

/**
 * `noun.up-to-x-target-graveyard-cards`: "up to X target Zombie cards from your graveyard" (Rot Hulk: "return up to X target Zombie cards from your graveyard to the battlefield, where X is
 * the number of opponents you have", CR 107.3c, 115.1, 601.2c, 603.3d, 404.1): none to as many targets as the X the sentence defines, of cards of your own graveyard. The count is the
 * word X; the lowering needs the sentence's "where X is ..." to say what it is (an X nothing defines is the X of a spell, which "up to X" of a spell's text does not read here) and
 * reads it only in a triggered ability. Not read: "X target Zombie cards" (`noun.x-target-graveyard-cards`), "up to X target Zombie card", "up to X target creatures", "up to X
 * target Zombie cards from a graveyard", "up to Y target Zombie cards from your graveyard", "up to {X} target Zombie cards from your graveyard".
 */
export const NOUN_UP_TO_X_TARGET_GRAVEYARD_CARDS = defineRule<IrNoun>({
  id: 'noun.up-to-x-target-graveyard-cards',
  family: 'noun',
  leading: ['up'],
  cites: [
    'CR 107.3c (Numbers and Symbols)',
    'CR 603.3d (Handling Triggered Abilities)',
    'CR 601.2c (Casting Spells)',
    'CR 404.1 (Graveyard)',
    'CR 115.1 (Targets)',
  ],
  examples: [
    'up to X target Zombie cards from your graveyard',
    'up to X target creature cards from your graveyard',
    'up to X target cards from your graveyard',
    'up to x target land cards from your graveyard',
  ],
  rejects: [
    'up to X target Zombie card from your graveyard',
    'up to X target creatures',
    'up to X target Zombie cards from a graveyard',
    "up to X target Zombie cards from an opponent's graveyard",
    'up to Y target Zombie cards from your graveyard',
    'up to {X} target Zombie cards from your graveyard',
    'up to X Zombie cards from your graveyard',
    'X target Zombie cards from your graveyard',
    'up to two target Zombie cards from your graveyard',
    'up to X target Zombie cards',
  ],
  parse: node<
    { count: { span: { start: number; end: number } }; filter: IrNoun['filter'] },
    IrNoun
  >(
    'noun.up-to-x-target-graveyard-cards',
    map(
      sequence(
        literal('up to '),
        spanned(pattern(/[Xx](?![\p{L}\p{N}])/u)),
        literal(' target '),
        // Your graveyard only, as for the X of a spell: another player's graveyard is another sentence.
        satisfy(graveyardPhrase(true, 'from'), (filter) => filter.controller === 'you'),
      ),
      ([, count, , filter]) => ({ count, filter }),
    ),
    ({ count, filter }): Bare => ({
      kind: 'noun',
      det: 'target',
      filter,
      count: { kind: 'x', span: count.span },
      upTo: true,
      plural: true,
      other: false,
    }),
  ),
});

export const HASHATON_G10_NOUN_RULES = [
  NOUN_X_TARGET_GRAVEYARD_CARDS,
  NOUN_UP_TO_X_TARGET_GRAVEYARD_CARDS,
];
