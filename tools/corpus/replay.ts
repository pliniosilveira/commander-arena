// `pnpm corpus:replay`: replays the example line of every template in reports/templates.json
// through the CURRENT parser, to estimate which of the heaviest unparsed shapes it reads now.
// Offline: the examples are real Oracle lines, but no card data is read or fetched.
//
// This is an ability-level estimate, not card coverage. Each example is parsed as the only
// ability line of a SYNTHETIC face (parseFaceText, the same entry the converter uses), so the
// card-level checks of `importCard` (layout, printed values, `validateCard`) are excluded by
// construction. The face type matters to a few shapes (Equip needs an Equipment, Enchant an Aura,
// Crew a Vehicle, "Enchanted creature" an Aura, spell text an instant), and the card's real type
// is not known here and is not guessed: the line is tried in a few neutral faces (CONTEXTS) and
// counts as read when any of them reads it. A line the grammar reads whose lowering is missing
// engine features is `notRunnable` (the features are listed); text no rule reads is `unrecognised`.

import {
  DEFAULT_RULES,
  DEFAULT_SPELL_RULES,
  PARSER_VERSION,
  parseFaceText,
  type UnparsedAbility,
} from '@commander-arena/cards';

/** What the replay needs from one entry of templates.json. */
export interface ReplayTemplate {
  readonly template: string;
  readonly cards: number;
  readonly soloCards: number;
  readonly weight: number;
  readonly example: string;
}

/** The parts of templates.json the replay reads. */
export interface TemplatesFile {
  readonly source: string;
  readonly parserVersion: number;
  readonly cards: number;
  readonly unsupportedCards: number;
  readonly totalTemplates: number;
  readonly templates: readonly ReplayTemplate[];
}

export type ReplayClass = 'read' | 'notRunnable' | 'unboundReference' | 'unrecognised';

/** The order the classes are listed in. */
export const CLASSES: readonly ReplayClass[] = [
  'read',
  'notRunnable',
  'unboundReference',
  'unrecognised',
];

export interface ReplayOutcome {
  readonly kind: ReplayClass;
  /** `read`: the face the line was read in. Failures: the face whose result is reported. */
  readonly context: string;
  /** Failures only (empty for `read`). */
  readonly closestRule: string;
  readonly stoppedAt: string;
  /** `notRunnable`: the missing engine features. */
  readonly needs: readonly string[];
  /** `unboundReference`: the word that had nothing to refer to. */
  readonly reference: string;
}

export interface ReplayRow extends ReplayTemplate {
  readonly outcome: ReplayOutcome;
}

export interface ReplayResult {
  readonly source: string;
  readonly parserVersion: number;
  readonly cards: number;
  readonly unsupportedCards: number;
  readonly totalTemplates: number;
  /** The parser version the replay ran with. */
  readonly currentVersion: number;
  readonly rows: readonly ReplayRow[];
}

interface Context {
  readonly label: string;
  readonly types: readonly string[];
  readonly subtypes: readonly string[];
  /** An instant or sorcery face also reads spell text. */
  readonly spell: boolean;
}

/**
 * The synthetic faces a line is tried in, in order. Neutral: no name, no printed values and no
 * real card behind them. The first one that reads the line is the one reported.
 */
export const CONTEXTS: readonly Context[] = [
  { label: 'creature', types: ['creature'], subtypes: [], spell: false },
  { label: 'equipment', types: ['artifact'], subtypes: ['Equipment'], spell: false },
  { label: 'aura', types: ['enchantment'], subtypes: ['Aura'], spell: false },
  { label: 'vehicle', types: ['artifact'], subtypes: ['Vehicle'], spell: false },
  { label: 'instant', types: ['instant'], subtypes: [], spell: true },
];

/** The name of the synthetic face. The example already has its own name as `~`. */
export const SYNTHETIC_NAME = 'SYNTHETIC Replay Card';

type Attempt =
  | { readonly ok: true; readonly context: string }
  | { readonly ok: false; readonly context: string; readonly failure: UnparsedAbility };

function attempt(example: string, context: Context): Attempt {
  const parsed = parseFaceText(
    example,
    { name: SYNTHETIC_NAME, legendary: false },
    0,
    DEFAULT_RULES,
    context.spell ? DEFAULT_SPELL_RULES : [],
    context.types,
    context.subtypes,
  );
  const [failure] = parsed.unparsed;
  if (failure !== undefined) return { ok: false, context: context.label, failure };
  // A line the parser consumed completely leaves an ability, spell text or a cost of the face
  // ("As an additional cost to cast ~, ...", "you may cast ~ without paying its mana cost", which
  // live on the face, not in an ability); none at all means the text had nothing to read (empty
  // after normalization), which is not a reading.
  const read =
    parsed.abilities.length > 0 ||
    parsed.spell !== null ||
    parsed.additionalCosts.length > 0 ||
    parsed.alternativeCosts.length > 0;
  if (read) return { ok: true, context: context.label };
  return {
    ok: false,
    context: context.label,
    failure: {
      face: 0,
      ability: 0,
      text: example,
      stoppedAt: example,
      closestRule: 'none',
      reason: 'unrecognised',
    },
  };
}

/** How informative a failure is: a named gap beats an unnamed one beats a missing reading. */
function rank(failure: UnparsedAbility): number {
  switch (failure.reason) {
    case 'notRunnable':
      return (failure.needs?.length ?? 0) > 0 ? 4 : 3;
    case 'unboundReference':
      return 2;
    default:
      return 1;
  }
}

function outcomeOf(failure: UnparsedAbility, context: string): ReplayOutcome {
  const kind: ReplayClass =
    failure.reason === 'notRunnable' || failure.reason === 'unboundReference'
      ? failure.reason
      : 'unrecognised';
  return {
    kind,
    context,
    closestRule: failure.closestRule,
    stoppedAt: failure.stoppedAt,
    needs: [...(failure.needs ?? [])].sort(),
    reference: failure.reference ?? '',
  };
}

/** Classifies one example line. Never throws: a parser exception is reported as unrecognised. */
export function classifyExample(example: string): ReplayOutcome {
  let best: { failure: UnparsedAbility; context: string } | null = null;
  for (const context of CONTEXTS) {
    let tried: Attempt;
    try {
      tried = attempt(example, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      tried = {
        ok: false,
        context: context.label,
        failure: {
          face: 0,
          ability: 0,
          text: example,
          stoppedAt: `parser threw: ${message}`,
          closestRule: 'none',
          reason: 'unrecognised',
        },
      };
    }
    if (tried.ok) {
      return {
        kind: 'read',
        context: tried.context,
        closestRule: '',
        stoppedAt: '',
        needs: [],
        reference: '',
      };
    }
    // Better rank wins; among unrecognised results the one that read the most (the shortest
    // rest) wins; otherwise the first context keeps its place.
    const better =
      best === null ||
      rank(tried.failure) > rank(best.failure) ||
      (rank(tried.failure) === 1 &&
        rank(best.failure) === 1 &&
        tried.failure.stoppedAt.length < best.failure.stoppedAt.length);
    if (better) best = { failure: tried.failure, context: tried.context };
  }
  // CONTEXTS is not empty, so a failing line always leaves a best failure.
  if (best === null) throw new Error('no replay context');
  return outcomeOf(best.failure, best.context);
}

export function replayTemplates(file: TemplatesFile): ReplayResult {
  return {
    source: file.source,
    parserVersion: file.parserVersion,
    cards: file.cards,
    unsupportedCards: file.unsupportedCards,
    totalTemplates: file.totalTemplates,
    currentVersion: PARSER_VERSION,
    rows: file.templates.map((template) => ({
      ...template,
      outcome: classifyExample(template.example),
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The templates file, or an error message when it is not the shape `corpus:templates` writes. */
export function parseTemplatesFile(text: string): TemplatesFile | string {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return `not valid JSON (${error instanceof Error ? error.message : String(error)})`;
  }
  if (!isRecord(data) || !Array.isArray(data.templates)) return 'no "templates" array';
  const { source, parserVersion, cards, unsupportedCards, totalTemplates } = data;
  if (
    typeof source !== 'string' ||
    typeof parserVersion !== 'number' ||
    typeof cards !== 'number' ||
    typeof unsupportedCards !== 'number' ||
    typeof totalTemplates !== 'number'
  ) {
    return 'the header (source, parserVersion, cards, unsupportedCards, totalTemplates) is incomplete';
  }
  const templates: ReplayTemplate[] = [];
  for (const [index, entry] of data.templates.entries()) {
    if (
      !isRecord(entry) ||
      typeof entry.template !== 'string' ||
      typeof entry.example !== 'string' ||
      typeof entry.cards !== 'number' ||
      typeof entry.soloCards !== 'number' ||
      typeof entry.weight !== 'number'
    ) {
      return `templates[${index}] needs template, example, cards, soloCards and weight`;
    }
    templates.push({
      template: entry.template,
      example: entry.example,
      cards: entry.cards,
      soloCards: entry.soloCards,
      weight: entry.weight,
    });
  }
  return { source, parserVersion, cards, unsupportedCards, totalTemplates, templates };
}
