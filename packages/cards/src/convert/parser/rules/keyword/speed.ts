/**
 * The keyword line Start your engines! (issue 144, CR 702.179a, 704.5aa): "Start your engines!" with its exclamation mark and no parameter. The reminder text in parentheses is dropped
 * before the line is read. The speed it gives is the engine's (`rules/speed.ts`).
 */
import { map, pattern } from '../../combinators';
import type { IrKeyword } from '../../ir/types';
import { defineRule, node } from '../registry';

/** `keyword.start-your-engines`: "Start your engines!" (CR 702.179a). */
export const KEYWORD_START_YOUR_ENGINES = defineRule<readonly IrKeyword[]>({
  id: 'keyword.start-your-engines',
  family: 'keyword',
  leading: ['start'],
  cites: ['CR 702.179a (Start Your Engines!)', 'CR 704.5aa (State-Based Actions)'],
  examples: ['Start your engines!', 'start your engines!'],
  rejects: [
    'Start your engines',
    'Start your engines! 2',
    'Start your engines!!',
    'Start your engines!, flying',
    'Start your engine!',
    'Start your engines',
  ],
  parse: map(
    node<RegExpExecArray, IrKeyword>(
      'keyword.start-your-engines',
      pattern(/start your engines!(?![\p{L}\p{N}!])/iu),
      () => ({ kind: 'keyword', name: 'startYourEngines', params: [] }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

export const SPEED_KEYWORD_RULES = [KEYWORD_START_YOUR_ENGINES];
