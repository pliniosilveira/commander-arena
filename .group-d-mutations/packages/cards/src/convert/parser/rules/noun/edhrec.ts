/**
 * Noun rules of the Vraska EDHREC deck (stage P64, D-217): "creature tokens you control" (CR 111.1, 110.1), the subject of a static ability such as "Creature
 * tokens you control have haste."
 */
import { pattern, sequence } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { NO_PARTS, toFilter } from './phrases';

/**
 * `noun.token-permanents`: "creature tokens you control", "tokens you control": a plural group of the controller's tokens, with or without the card type
 * "creature" (CR 111.1: a token is a permanent that is not represented by a card). The group is whatever matches at any moment, as for `noun.plain-permanents`.
 * Not read: "nontoken", another type word ("artifact tokens"), "other", the singular, "target tokens", a controller other than "you".
 */
export const NOUN_TOKEN_PERMANENTS = defineRule<IrNoun>({
  id: 'noun.token-permanents',
  family: 'noun',
  leading: ['creature', 'tokens'],
  cites: ['CR 111.1 (Tokens)', 'CR 110.1 (Permanents)', 'CR 611.2c (Continuous Effects)'],
  examples: ['creature tokens you control', 'tokens you control'],
  rejects: [
    'creature token you control',
    'artifact tokens you control',
    'other creature tokens you control',
    'creature tokens your opponents control',
    'creature tokens',
    'target creature tokens',
    'nontoken creatures you control',
  ],
  parse: node<IrFilter, IrNoun>(
    'noun.token-permanents',
    (ctx, pos) => {
      const r = sequence(pattern(/(creature )?tokens you control(?![\p{L}\p{N}'’])/iu))(ctx, pos);
      if (!r.ok) return r;
      const creature = /^creature/iu.test(r.value[0][0]);
      return {
        ok: true,
        value: toFilter(
          'battlefield',
          {
            ...NO_PARTS,
            token: true,
            controller: 'you',
            types: creature ? ['creature'] : [],
          },
          r.value[0][0],
        ),
        pos: r.pos,
      };
    },
    (filter) => ({
      kind: 'noun',
      det: 'each',
      filter,
      upTo: false,
      plural: true,
      other: false,
    }),
  ),
});

/**
 * `noun.attacking-opponents`: "creatures attacking your opponents and/or planeswalkers they control" (CR 508.1b, 506.3, 611.2c): the creatures declared as
 * attackers of an opponent of the controller as a player, or of a planeswalker or battle an opponent controls; a group fixed as the effect resolves. The
 * engine's `ObjectFilter.attackingOpponents`. Not read: "attacking you", "attacking players", the singular, one of the two kinds of target alone.
 */
export const NOUN_ATTACKING_OPPONENTS = defineRule<IrNoun>({
  id: 'noun.attacking-opponents',
  family: 'noun',
  leading: ['creatures'],
  cites: [
    'CR 508.1b (Declare Attackers Step)',
    'CR 506.3 (Combat Phase)',
    'CR 611.2c (Continuous Effects)',
  ],
  examples: ['creatures attacking your opponents and/or planeswalkers they control'],
  rejects: [
    'creatures attacking your opponents',
    'creatures attacking you',
    'creatures attacking players',
    'creature attacking your opponents and/or planeswalkers they control',
    'creatures attacking your opponents and planeswalkers they control',
    'creatures attacking an opponent and/or planeswalkers they control',
  ],
  parse: node<IrFilter, IrNoun>(
    'noun.attacking-opponents',
    (ctx, pos) => {
      const r = pattern(
        /creatures attacking your opponents and\/or planeswalkers they control(?![\p{L}\p{N}'’])/iu,
      )(ctx, pos);
      if (!r.ok) return r;
      return {
        ok: true,
        value: {
          zone: 'battlefield',
          types: ['creature'],
          attackingOpponents: true,
          raw: r.value[0],
        },
        pos: r.pos,
      };
    },
    (filter) => ({
      kind: 'noun',
      det: 'each',
      filter,
      upTo: false,
      plural: true,
      other: false,
    }),
  ),
});

export const EDHREC_NOUN_RULES = [NOUN_TOKEN_PERMANENTS, NOUN_ATTACKING_OPPONENTS];
