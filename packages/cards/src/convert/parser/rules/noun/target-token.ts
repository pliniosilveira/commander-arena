/**
 * Noun rule "target token you control" (Hazel of the Rootbloom; CR 111.1, 115.1: a token is a permanent on the battlefield, of any type; one target).
 */
import { map, pattern } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { BOUNDARY } from './phrases';

/**
 * `noun.target-token-you-control`: "target token you control" (CR 111.1, 115.1, 109.4): one target, a token of any type on the battlefield that the ability's controller controls. Not
 * read: "target tokens you control", "target token" (no controller said), "target creature token you control" (`noun.target-permanent`), "another target token you control".
 */
export const NOUN_TARGET_TOKEN_YOU_CONTROL = defineRule<IrNoun>({
  id: 'noun.target-token-you-control',
  family: 'noun',
  leading: ['target'],
  cites: ['CR 111.1 (Tokens)', 'CR 115.1 (Targets)', 'CR 109.4 (Objects)'],
  examples: ['target token you control'],
  rejects: [
    'target tokens you control',
    'target token',
    'target token an opponent controls',
    'another target token you control',
    'target creature token you control',
    'target token you controlling',
  ],
  parse: node<string, IrNoun>(
    'noun.target-token-you-control',
    map(pattern(new RegExp(`target token you control${BOUNDARY}`, 'iu')), (m) => m[0]),
    (raw) => ({
      kind: 'noun',
      det: 'target',
      filter: { zone: 'battlefield', token: true, controller: 'you', raw },
      upTo: false,
      plural: false,
      other: false,
    }),
  ),
});

export const TARGET_TOKEN_NOUN_RULES = [NOUN_TARGET_TOKEN_YOU_CONTROL];
