/**
 * The keyword line Living weapon (stage P31; D-139, D-140, CR 702.92): "Living weapon". The reminder text in parentheses is dropped
 * before the line is read; the triggered ability the keyword stands for (a 0/0 black Phyrexian Germ token, then the Equipment attached
 * to it) is the engine's, which writes it itself. Only an Equipment has it (CR 702.92a), which the lowering checks.
 */
import { map, pattern } from '../../combinators';
import type { IrKeyword } from '../../ir/types';
import { defineRule, node } from '../registry';

/** `keyword.living-weapon`: "Living weapon" (CR 702.92a). No parameter. */
export const KEYWORD_LIVING_WEAPON = defineRule<readonly IrKeyword[]>({
  id: 'keyword.living-weapon',
  family: 'keyword',
  leading: ['living'],
  cites: ['CR 702.92a (Living Weapon)'],
  examples: ['Living weapon', 'living weapon'],
  rejects: ['Living weapon 2', 'Living weapons', 'Living weapon, flying', 'Living'],
  parse: map(
    node<RegExpExecArray, IrKeyword>(
      'keyword.living-weapon',
      pattern(/living weapon(?![\p{L}\p{N}])/iu),
      () => ({ kind: 'keyword', name: 'livingWeapon', params: [] }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

/** `keyword.job-select`: "Job select" (CR 702.182a, D-206). No parameter; the reminder text in parentheses is dropped before the line is read. */
export const KEYWORD_JOB_SELECT = defineRule<readonly IrKeyword[]>({
  id: 'keyword.job-select',
  family: 'keyword',
  leading: ['job'],
  cites: ['CR 702.182a (Job Select)'],
  examples: ['Job select', 'job select'],
  rejects: ['Job select 2', 'Job selects', 'Job select, flying', 'Job', 'Job selected'],
  parse: map(
    node<RegExpExecArray, IrKeyword>(
      'keyword.job-select',
      pattern(/job select(?![\p{L}\p{N}])/iu),
      () => ({ kind: 'keyword', name: 'jobSelect', params: [] }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

export const LIVING_WEAPON_KEYWORD_RULES = [KEYWORD_LIVING_WEAPON, KEYWORD_JOB_SELECT];
