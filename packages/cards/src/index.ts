/**
 * The card pipeline: decklist parsing, the Scryfall client and cache, conversion to engine
 * definitions with support status, deck validation (M4). Overrides and the
 * grammar grow in M5 and M6.
 */

export * from './convert/index';
export {
  fromGoldenCard,
  type GoldenCard,
  type GoldenFace,
  type GoldenGroup,
  goldenGroup,
  goldenKey,
  goldenLine,
  parseGolden,
  toGoldenCard,
} from './corpus/golden';
export {
  CARD_DATA_ENCODING,
  CARD_DATA_SUMMARY,
  cardDataBlock,
  cardDataPayload,
  cardDataText,
  ISSUE_CARD_SOURCE,
  parseCardDataText,
} from './corpus/issue-block';
export * from './decklist/index';
export * from './precon/index';
export * from './scryfall/index';
export type * from './types';
export { RULE_FAMILIES, UNPARSED_REASONS } from './types';
export * from './validate/index';
export { PARSER_VERSION } from './version';
