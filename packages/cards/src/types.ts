/**
 * Shared types of the card pipeline (SPEC 6, 7; M4). This file is the contract between the
 * decklist parser, the Scryfall client, the conversion and support-status code, deck validation
 * and the coverage reports. Plain data only: everything here survives structured cloning and
 * JSON, so it can cross the Worker boundary and be cached.
 */
import type { CardDefinition, FeatureRef } from '@commander-arena/engine';

// ---------------------------------------------------------------- decklists (SPEC 6.1)

export type DeckSection = 'commander' | 'main' | 'sideboard' | 'maybeboard' | 'companion';

export interface DeckEntry {
  /** The exact card name as Scryfall would match it: quotes normalized, extras stripped. */
  readonly name: string;
  readonly count: number;
  /** 1-based line number in the pasted text. */
  readonly line: number;
  /** Set code and collector number when the line had them, lower-cased and as written. */
  readonly set: string | null;
  readonly collector: string | null;
  /** Category tags such as `[Ramp]` or `#Removal`, without the brackets. */
  readonly tags: readonly string[];
  readonly foil: boolean;
}

export interface ParseError {
  readonly line: number;
  readonly text: string;
  readonly message: string;
}

export interface ParsedDecklist {
  readonly sections: Readonly<Record<DeckSection, readonly DeckEntry[]>>;
  /** True when the text had a Commander section or a commander tag on a line. */
  readonly hasCommanderMarking: boolean;
  readonly errors: readonly ParseError[];
}

// ---------------------------------------------------------------- stored Scryfall data (SPEC 6.2)

export type ColorLetter = 'W' | 'U' | 'B' | 'R' | 'G';

export interface StoredImageUris {
  readonly normal: string | null;
  readonly large: string | null;
  readonly artCrop: string | null;
}

export interface StoredFace {
  readonly name: string;
  readonly manaCost: string;
  readonly typeLine: string;
  readonly oracleText: string;
  readonly power: string | null;
  readonly toughness: string | null;
  readonly loyalty: string | null;
  readonly defense: string | null;
  readonly colors: readonly ColorLetter[];
  readonly imageUris: StoredImageUris | null;
  readonly artist: string | null;
}

export type CommanderLegality = 'legal' | 'not_legal' | 'banned' | 'restricted';

/** One card as the app stores it: the fields SPEC 6.2 lists, normalized from a Scryfall object. */
export interface StoredCard {
  readonly oracleId: string;
  readonly scryfallId: string;
  readonly name: string;
  readonly layout: string;
  /** One entry per face; a single-faced card has exactly one. */
  readonly faces: readonly StoredFace[];
  readonly cmc: number;
  readonly colorIdentity: readonly ColorLetter[];
  readonly keywords: readonly string[];
  readonly producedMana: readonly string[];
  readonly commanderLegality: CommanderLegality;
  readonly edhrecRank: number | null;
  /** Null when Scryfall does not send the field (it is optional, SPEC 6.2). */
  readonly gameChanger: boolean | null;
  /** Names of related tokens and parts, from `all_parts`. */
  readonly relatedParts: readonly { readonly name: string; readonly component: string }[];
  /** When the data was fetched, in milliseconds since the epoch (injected clock). */
  readonly fetchedAt: number;
}

// ---------------------------------------------------------------- support status (SPEC 7.1)

/** The kinds of phrase the grammar reads; a diagnostic names the one that was being filled. */
export const RULE_FAMILIES = [
  'trigger',
  'cost',
  'effect',
  'noun',
  'amount',
  'duration',
  'condition',
  'keyword',
  'static',
  'token',
  'restriction',
  'replacement',
  'modal',
] as const;
export type RuleFamily = (typeof RULE_FAMILIES)[number];

/**
 * Why an ability was dropped (D-064): the text was not recognised, it was recognised but the
 * engine cannot run it (`needs` says what is missing), or a pronoun had nothing to refer to.
 */
export const UNPARSED_REASONS = ['unrecognised', 'notRunnable', 'unboundReference'] as const;
export type UnparsedReason = (typeof UNPARSED_REASONS)[number];

/**
 * One ability the parser could not fully understand (SPEC 7.2). The first five fields are
 * schema 1; the rest are diagnostics v2 (SPEC A30, D-064) and optional, so a cached
 * report written before them stays valid.
 */
export interface UnparsedAbility {
  readonly face: number;
  readonly ability: number;
  readonly text: string;
  /** The text that was left when matching stopped. */
  readonly stoppedAt: string;
  /** The deepest grammar rule that was being tried, by its stable id (`none` when no rule began). */
  readonly closestRule: string;
  readonly reason?: UnparsedReason;
  /** The slot being filled when matching stopped ("noun"), for `unrecognised`. */
  readonly slot?: RuleFamily;
  /** Rule ids that matched before the stop, in text order (`trigger.enters`, `effect.exile`). */
  readonly recognised?: readonly string[];
  /** The engine features that are missing, for `notRunnable` (`effect:createToken`). */
  readonly needs?: readonly FeatureRef[];
  /** The word that had nothing to refer to, for `unboundReference` ("those cards"). */
  readonly reference?: string;
  /** `templateOf(text)`, so reports group abilities without parsing them again. */
  readonly template?: string;
}

export interface SupportReport {
  readonly status: 'supported' | 'unsupported';
  /** The `PARSER_VERSION` this was computed with. */
  readonly parserVersion: number;
  /** Where the definition came from: the Oracle text parser or an engine fixture. */
  readonly source: 'parser' | 'fixture';
  readonly unparsed: readonly UnparsedAbility[];
  /** Reasons that are not a parse failure, such as an unsupported layout or card type. */
  readonly reasons: readonly string[];
}

/** A card ready for the engine, with its support status. */
export interface ImportedCard {
  readonly stored: StoredCard;
  readonly definition: CardDefinition;
  readonly support: SupportReport;
}

// ---------------------------------------------------------------- deck validation (SPEC 6, test 26)

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  readonly severity: IssueSeverity;
  /** A stable code such as `deck-size`, `color-identity`, `singleton`, `banned`, `commander`. */
  readonly code: string;
  readonly message: string;
  /** Card names the issue is about. */
  readonly cards: readonly string[];
}

export interface DeckValidation {
  readonly ok: boolean;
  readonly issues: readonly ValidationIssue[];
}
