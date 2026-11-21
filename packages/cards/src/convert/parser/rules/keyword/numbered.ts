/**
 * The keywords that take one whole number, written after the word: "Toxic 1" (CR 702.164a),
 * "Annihilator 2" (CR 702.86a), "Afflict 3" (CR 702.130a, D-472), "Bushido 1" (CR 702.45a, stage P21), "Hideaway 4" (CR 702.75a, stage P32) and "Devour 2" (CR 702.82a, stage P40; "Devour [quality]", CR 702.82c, is not read: the number must follow the word). Read by `keyword.line` like the keywords without a parameter, so
 * they stand alone or in a list ("Trample, toxic 1"); the engine expands Annihilator and Bushido into
 * their triggered abilities and reads Toxic where combat damage is dealt, so the lowering only builds
 * the keyword with its number.
 */
import { choice, literal, map, type Parser, pattern, sequence } from '../../combinators';
import type { IrAmount, IrKeyword } from '../../ir/types';
import { node } from '../registry';
import { CREW_POWER } from './ward-crew';

/** The words that take a number, and the AST kind each one is. */
export const NUMBERED_KEYWORDS = [
  'toxic',
  'annihilator',
  // D-472 (CR 702.130a): "Afflict 3".
  'afflict',
  // Issue 102 (CR 702.52a): "Dredge 3".
  'dredge',
  'bushido',
  'hideaway',
  'devour',
  // Issue 101 (CR 702.181a): "Mobilize 1".
  'mobilize',
  // Issue 101 (CR 702.123a): "Fabricate 2".
  'fabricate',
  // Stage P68 (D-230, CR 702.165): "Backup 1".
  'backup',
] as const;

/**
 * "devour Food 3" (CR 702.82c, the variant "Devour [quality]"): the quality, a capitalised type word, between the word and the number. The IR keyword carries it as
 * `quality`; the lowering reads it only where the engine does (an artifact type).
 */
function devourWithQuality(rule: string): Parser<IrKeyword> {
  return node<[string, IrAmount], IrKeyword>(
    rule,
    map(
      sequence(pattern(/[Dd]evour ([A-Z][a-z]+) (?=[1-9])/u), CREW_POWER),
      ([head, amount]): [string, IrAmount] => [head[1] ?? '', amount],
    ),
    ([quality, amount]) => ({ kind: 'keyword', name: 'devour', params: [amount], quality }),
  );
}

/** "toxic 1": the word, a space and a positive whole number in digits (the form Oracle text uses). */
export function numberedKeyword(rule: string): Parser<IrKeyword> {
  return choice(
    devourWithQuality(rule),
    ...NUMBERED_KEYWORDS.map((word) =>
      node<IrAmount, IrKeyword>(
        rule,
        map(sequence(literal(`${word} `), CREW_POWER), ([, amount]) => amount),
        (amount) => ({ kind: 'keyword', name: word, params: [amount] }),
      ),
    ),
  );
}
