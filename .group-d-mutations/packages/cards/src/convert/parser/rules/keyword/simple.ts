/**
 * One keyword without a parameter, as the words of `SIMPLE_KEYWORDS` spell it ("flying", "first
 * strike") or `LANDWALKS` ("islandwalk", "nonbasic landwalk"; stage P12), stamped with the id of
 * the rule that reads it. `keyword.line` reads lists of them and `keyword.ward` reads them in
 * front of a ward cost.
 */
import { choice, map, type Parser, pattern } from '../../combinators';
import type { IrKeyword } from '../../ir/types';
import { node } from '../registry';
import { LANDWALKS, SIMPLE_KEYWORDS } from './vocabulary';

export function simpleKeyword(rule: string): Parser<IrKeyword> {
  return node<string, IrKeyword>(
    rule,
    choice(
      ...[...SIMPLE_KEYWORDS, ...LANDWALKS].map(([word]) =>
        // The word boundary keeps "flash" from matching the start of "flashback".
        map(
          pattern(new RegExp(`${word.replace(' ', '\\s+')}(?![\\p{L}\\p{N}])`, 'iu')),
          () => word,
        ),
      ),
    ),
    (name) => ({ kind: 'keyword', name, params: [] }),
  );
}
