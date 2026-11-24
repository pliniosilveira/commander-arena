/**
 * Noun rule of group C of the Counter Blitz deck (Endless Detour): a target that is a spell on the stack, a nonland permanent on the battlefield or a card in a graveyard.
 */
import { literal, map } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { NO_PARTS, toFilter } from './phrases';

type Bare = Omit<IrNoun, 'span' | 'rule'>;

const ID = 'noun.target-spell-permanent-or-graveyard-card';

/**
 * `noun.target-spell-permanent-or-graveyard-card`: "target spell, nonland permanent, or card in a graveyard" (CR 115.1, 601.2c, 405.1, 404.1: one target, a spell on the stack, a nonland
 * permanent on the battlefield or a card of any graveyard, chosen as the spell is put on the stack). The engine's `objectOrSpell` slot with a `card` half. Not read: another order, other
 * kinds, a plural, "target spell, permanent, or card in a graveyard" (a land is a permanent), a controller or an owner, a kind of spell, "card in your graveyard".
 */
export const NOUN_TARGET_SPELL_PERMANENT_OR_GRAVEYARD_CARD = defineRule<IrNoun>({
  id: ID,
  family: 'noun',
  leading: ['target'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 405.1 (Stack)',
    'CR 404.1 (Graveyard)',
    'CR 601.2c (Casting Spells)',
  ],
  examples: ['target spell, nonland permanent, or card in a graveyard'],
  rejects: [
    'target spell, permanent, or card in a graveyard',
    'target nonland permanent, spell, or card in a graveyard',
    'target spell, nonland permanent, or card in your graveyard',
    'target spell, nonland permanent or card in a graveyard',
    'target spells, nonland permanents, or cards in a graveyard',
    'target spell, nonland permanent, or card',
    'target spell or nonland permanent',
    'spell, nonland permanent, or card in a graveyard',
  ],
  parse: node<string, IrNoun>(
    ID,
    map(literal('target spell, nonland permanent, or card in a graveyard'), (raw) => raw),
    (raw): Bare => {
      const orSpell: IrFilter = { ...toFilter('stack', NO_PARTS, 'spell'), stackKind: 'spell' };
      const orCard: IrFilter = toFilter('graveyard', NO_PARTS, 'card in a graveyard');
      return {
        kind: 'noun',
        det: 'target',
        filter: toFilter('battlefield', { ...NO_PARTS, notTypes: ['land'] }, raw),
        orSpell,
        orCard,
        upTo: false,
        plural: false,
        other: false,
      };
    },
  ),
});

export const COUNTER_BLITZ_C_NOUN_RULES = [NOUN_TARGET_SPELL_PERMANENT_OR_GRAVEYARD_CARD];
