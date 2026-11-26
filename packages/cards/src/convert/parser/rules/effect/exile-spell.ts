/**
 * `effect.exile-spell`: "exile target spell an opponent controls" (Smirking Spelljacker; CR 406.1, 405.1, 115.1: the spell is a target on the stack, and an exiled spell does not resolve, CR 608.2b). The
 * engine's `exile` of a target slot of a spell; the permanent that exiles it remembers it when another ability of its face reads "a card exiled with it" (`linkExile`, CR 607.2a). A rule of its own, and
 * quiet, so the words of the other exile rule ("exile target Banana.") keep stopping where they always did. Not read: another operand ("exile target spell or creature"), "until", two targets.
 */
import { literal, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';
import { type Clauses, single } from './operands';

export const EFFECT_EXILE_SPELL = defineRule<Clauses>({
  id: 'effect.exile-spell',
  family: 'effect',
  leading: ['exile'],
  cites: [
    'CR 406.1 (Exile)',
    'CR 405.1 (Stack)',
    'CR 115.1 (Targets)',
    'CR 608.2b (Resolving Spells and Abilities)',
  ],
  examples: [
    'exile target spell',
    'exile target spell an opponent controls',
    "exile target spell you don't control",
    'exile target creature spell an opponent controls',
  ],
  rejects: [
    'exile target spell or creature',
    'exile target spell an opponent controls until ~ leaves the battlefield',
    'exile target spells an opponent controls',
    'exile two target spells an opponent controls',
    'exile target spell you control',
    'exile target Banana',
    'exile that spell',
  ],
  parse: single(
    'effect.exile-spell',
    sequence(literal('exile '), family<IrNoun>('noun', { only: ['noun.target-spell'] })),
    ([, objects]) => ({ verb: 'exile', args: { objects } }),
  ),
});

export const EXILE_SPELL_RULES = [EFFECT_EXILE_SPELL].map(quietly);
