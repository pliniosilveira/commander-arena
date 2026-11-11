/**
 * The pronoun "it" as a noun (CR 109.1: an object is whatever the words refer to). It says nothing
 * about the object: the binding pass decides what it refers to (`ir/bind.ts`: the most recent
 * single object noun; in a triggered ability about `~` alone, `~`), and nothing is guessed, so an
 * "it" with no antecedent is an `unboundReference`. Only the verbs that name `noun.it` in their
 * operands read it: a pump, a keyword gain, counters and a token copy. "That creature" is not read.
 */
import { pattern } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { BOUNDARY } from './phrases';

/**
 * `noun.it`: "it" (never "its" or "item"), and, since stage P30, "her" and "him" for a card the text names by a person's
 * pronoun ("you may put her into her owner's library", CR 109.1: the words refer to the same object whatever the pronoun).
 */
export const NOUN_IT = defineRule<IrNoun>({
  id: 'noun.it',
  family: 'noun',
  leading: ['it', 'her', 'him'],
  cites: ['CR 109.1 (Objects)'],
  examples: ['it', 'It', 'her', 'him'],
  rejects: ['its', 'item', 'that creature', 'them', 'itself', 'hers', 'himself', 'herd'],
  parse: node<RegExpExecArray, IrNoun>(
    'noun.it',
    pattern(new RegExp(`(?:it|her|him)${BOUNDARY}`, 'iu')),
    (m) => ({
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: m[0] },
      upTo: false,
      plural: false,
      other: false,
    }),
  ),
});

/**
 * `noun.that-token`: "that token" (stage P49, D-206, CR 111.2, 400.7j): the one token the instruction before made ("Create a 3/3 token. Then if ...,
 * put two +1/+1 counters on that token", "That token gains haste until end of turn"). The binding pass makes it the token of the sentence before and
 * nothing else (`Antecedent.token`); with no such token it is an unbound reference. "That tokens" and "that token's controller" are not read.
 */
export const NOUN_THAT_TOKEN = defineRule<IrNoun>({
  id: 'noun.that-token',
  family: 'noun',
  leading: ['that'],
  cites: ['CR 111.2 (Tokens)', 'CR 400.7 (General)'],
  examples: ['that token', 'That token'],
  rejects: ['that', 'that tokens', "that token's controller", 'that creature', 'those tokens'],
  parse: node<RegExpExecArray, IrNoun>(
    'noun.that-token',
    pattern(new RegExp(`that token${BOUNDARY}(?!['’])`, 'iu')),
    (m) => ({
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: m[0] },
      upTo: false,
      plural: false,
      other: false,
    }),
  ),
});

/**
 * `noun.each-of-them`: "each of them" (stage P48, D-205, CR 608.2c, 109.1), the several objects an earlier noun of the text named ("Tap up to two target creatures.
 * Put a stun counter on each of them."): bound like "them" to the most recent plural object noun, which a target slot of several targets is. Only the verbs
 * that name it in their operands read it (counters); "each of those" and "each of it" are not read.
 */
export const NOUN_EACH_OF_THEM = defineRule<IrNoun>({
  id: 'noun.each-of-them',
  family: 'noun',
  leading: ['each'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)', 'CR 109.1 (Objects)'],
  examples: ['each of them', 'Each of them'],
  rejects: [
    'each of it',
    'each of those',
    'each of the',
    'each of themselves',
    'each creature',
    'them',
  ],
  parse: node<RegExpExecArray, IrNoun>(
    'noun.each-of-them',
    pattern(new RegExp(`each of them${BOUNDARY}`, 'iu')),
    () => ({
      kind: 'noun',
      det: 'anaphor',
      // "them" is what the binding pass reads: the plural antecedent.
      filter: { raw: 'them' },
      upTo: false,
      plural: true,
      other: false,
    }),
  ),
});
