/**
 * The keyword line of Station (CR 702.184a, 721): "Station" with its reminder text taken off ("Tap another creature you control: Put charge counters equal to its power on this
 * Spacecraft. Station only as a sorcery."). The engine expands it into the activated ability (`rules/derive-keywords.ts`), so the lowering only builds the keyword node, and only
 * for a station card (a Spacecraft or a Planet, CR 702.184b, 721.1).
 */
import { map, pattern } from '../../combinators';
import type { IrKeyword } from '../../ir/types';
import { defineRule, node } from '../registry';

/** `keyword.station`: "Station" alone on its line (CR 702.184a). */
export const KEYWORD_STATION = defineRule<readonly IrKeyword[]>({
  id: 'keyword.station',
  family: 'keyword',
  leading: ['station'],
  cites: ['CR 702.184a (Station)', 'CR 702.184b (Station)', 'CR 721.4 (Station Cards)'],
  examples: ['Station', 'station'],
  rejects: [
    'Station 2',
    'Station.',
    'Station, flying',
    'Flying, station',
    'Stations',
    'Station Station',
    'Station {2}',
  ],
  parse: map(
    node<RegExpExecArray, IrKeyword>(
      'keyword.station',
      pattern(/station(?![\p{L}\p{N}])/iu),
      () => ({ kind: 'keyword', name: 'station', params: [] }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

export const STATION_KEYWORD_RULES = [KEYWORD_STATION];
