/**
 * Effect rule of issue 160 (D-612): "Populate." (CR 701.36), the keyword action of Rootborn Defenses: choose a creature token you control and create a token that is a copy
 * of it. The engine runs `populate` (`rules/populate.ts`).
 */
import { pattern } from '../../combinators';
import { defineRule, quietly } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.populate';

/**
 * `effect.populate`: "populate" (CR 701.36a: choose a creature token you control and create a token that's a copy of that creature token; CR 701.36b: with none, no token).
 * The word alone: there is no number or object after it. Not read: "populate 2", "populating", "populate it", "populate target creature token".
 */
export const EFFECT_POPULATE = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['populate'],
  cites: ['CR 701.36a (Populate)', 'CR 701.36b (Populate)'],
  examples: ['populate', 'Populate'],
  rejects: [
    'populate 2',
    'populating',
    'populate it',
    'populate target creature token',
    'populates',
    'populate twice',
  ],
  parse: single(ID, pattern(/populate(?![\p{L}\p{N}])/iu), () => ({ verb: 'populate', args: {} })),
});

export const POPULATE_EFFECT_RULES = [EFFECT_POPULATE].map(quietly);
