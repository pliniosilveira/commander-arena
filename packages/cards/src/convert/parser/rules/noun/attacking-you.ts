/**
 * "Target creature that's attacking you or a planeswalker you control" (Soul Snare, CR 508.1b, 506.3, 115.1): one creature on the battlefield that was declared as an attacker
 * whose attack target is the controller of the ability as a player or a planeswalker that player controls (a battle is never covered). The engine's
 * `ObjectFilter.attackingYou: 'orPlaneswalkers'`, read as the target is chosen and again as the ability resolves (CR 608.2b).
 */
import { pattern } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule } from '../registry';
import { BOUNDARY } from './phrases';

export const NOUN_TARGET_CREATURE_ATTACKING_YOU = defineRule<IrNoun>({
  id: 'noun.target-creature-attacking-you',
  family: 'noun',
  leading: ['target'],
  cites: ['CR 508.1b (Declare Attackers Step)', 'CR 506.3 (Combat Phase)', 'CR 115.1 (Targets)'],
  examples: ["target creature that's attacking you or a planeswalker you control"],
  rejects: [
    "target creature that's attacking you",
    "target creature that's attacking you or a planeswalker",
    "target creature that's attacking a planeswalker you control",
    "target creatures that's attacking you or a planeswalker you control",
    "target creature that's attacking you or planeswalkers you control",
    "target creature you control that's attacking you or a planeswalker you control",
    "target permanent that's attacking you or a planeswalker you control",
    "creature that's attacking you or a planeswalker you control",
    "target creature that's attacking you or a planeswalker you control or",
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(
        `target creature that['’]s attacking you or a planeswalker you control${BOUNDARY}`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const noun: IrNoun = {
      kind: 'noun',
      det: 'target',
      filter: {
        zone: 'battlefield',
        types: ['creature'],
        attackingYou: 'orPlaneswalkers',
        raw: r.value[0],
      },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: r.pos },
      rule: 'noun.target-creature-attacking-you',
    };
    return { ok: true, value: noun, pos: r.pos };
  },
});

/**
 * `noun.target-creature-attacking-you-plain`: "target creature attacking you" (Lulu, Stern Guardian, CR 508.1b, 506.3, 115.1): one creature on the battlefield that was declared as an
 * attacker whose attack target is the controller of the ability as a player; a planeswalker or battle they control does not count. The engine's `ObjectFilter.attackingYou: true`,
 * read as the target is chosen and again as the ability resolves (CR 608.2b). "That's attacking you" is the same words with a relative clause.
 */
export const NOUN_TARGET_CREATURE_ATTACKING_YOU_PLAIN = defineRule<IrNoun>({
  id: 'noun.target-creature-attacking-you-plain',
  family: 'noun',
  leading: ['target'],
  cites: ['CR 508.1b (Declare Attackers Step)', 'CR 506.3 (Combat Phase)', 'CR 115.1 (Targets)'],
  examples: ['target creature attacking you', "target creature that's attacking you"],
  rejects: [
    'target creature attacking you or a planeswalker you control',
    "target creature that's attacking you or a planeswalker you control",
    'target creature attacking a planeswalker you control',
    'target creatures attacking you',
    'target creature you control attacking you',
    'target permanent attacking you',
    'creature attacking you',
    'target creature attacking you and',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(`target creature (?:that['’]s )?attacking you(?! (?:or|and)\\b)${BOUNDARY}`, 'iu'),
    )(ctx, pos);
    if (!r.ok) return r;
    const noun: IrNoun = {
      kind: 'noun',
      det: 'target',
      filter: { zone: 'battlefield', types: ['creature'], attackingYou: true, raw: r.value[0] },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: r.pos },
      rule: 'noun.target-creature-attacking-you-plain',
    };
    return { ok: true, value: noun, pos: r.pos };
  },
});

/**
 * `noun.target-creature-attacking-that-player`: "target nontoken creature that's attacking that player" (Echoing Assault, CR 508.1b, 508.6, 115.1): one creature on the battlefield (a nontoken
 * one when the words say so) declared as an attacker whose attack target is the player the trigger is about, as a player; a planeswalker or battle they control does not count. The engine's
 * `ObjectFilter.attackingOpponents: 'triggerAttacked'`, read as the target is chosen and again as the ability resolves (CR 608.2b); the lowering reads it only in a trigger with one
 * occurrence for each player attacked ("Whenever you attack a player"). Not read: "that opponent", "or a planeswalker", another kind of permanent, several targets, a controller.
 */
export const NOUN_TARGET_CREATURE_ATTACKING_THAT_PLAYER = defineRule<IrNoun>({
  id: 'noun.target-creature-attacking-that-player',
  family: 'noun',
  leading: ['target'],
  cites: [
    'CR 508.1b (Declare Attackers Step)',
    'CR 508.6 (Declare Attackers Step)',
    'CR 115.1 (Targets)',
  ],
  examples: [
    "target nontoken creature that's attacking that player",
    "target creature that's attacking that player",
    'target creature attacking that player',
    'target nontoken creature attacking that player',
  ],
  rejects: [
    "target nontoken creature that's attacking that opponent",
    "target creature that's attacking that player or a planeswalker they control",
    "target creature that's attacking that player and",
    "target creatures that's attacking that player",
    "target creature you control that's attacking that player",
    "target permanent that's attacking that player",
    "target nontoken permanent that's attacking that player",
    "nontoken creature that's attacking that player",
    "target creature that's attacking that players",
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(
        `target (nontoken )?creature (?:that['’]s )?attacking that player(?! (?:or|and)\\b)${BOUNDARY}(?!['’])`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const noun: IrNoun = {
      kind: 'noun',
      det: 'target',
      filter: {
        zone: 'battlefield',
        types: ['creature'],
        ...(r.value[1] === undefined ? {} : { token: false }),
        attackingOpponents: 'triggerAttacked',
        raw: r.value[0],
      },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: r.pos },
      rule: 'noun.target-creature-attacking-that-player',
    };
    return { ok: true, value: noun, pos: r.pos };
  },
});

export const ATTACKING_YOU_NOUN_RULES = [
  NOUN_TARGET_CREATURE_ATTACKING_YOU,
  NOUN_TARGET_CREATURE_ATTACKING_YOU_PLAIN,
  NOUN_TARGET_CREATURE_ATTACKING_THAT_PLAYER,
];
