/**
 * The named alternative costs Overload (CR 702.96), Evoke (CR 702.74), Dash (CR 702.109),
 * Spectacle (CR 702.137) and Escape (CR 702.138) in the UI and the log (D-121, D-124), and the
 * unearth mark of a permanent (CR 702.84a). The engine lists one `castSpell { object, alternative }`
 * option for each cost that can be paid, `ObjectView.alternativeCosts` says what each costs now
 * (after commander tax and cost reductions) and `ObjectView.alternative` marks a spell on the stack,
 * and a permanent that entered from an evoked, dashed or escaped spell or from unearth. The words
 * below are read from those fields and nothing else.
 */
import type { CastAlternativeKind, ObjectView } from '@commander-arena/engine';

/** The cast kinds this file words; `flashback` and `free` have their own wording (flashback.ts). */
export type NamedAlternative = Exclude<CastAlternativeKind, 'flashback' | 'free'>;

/** What `ObjectView.alternative` can hold: a named cast kind, or `unearth` (an ability, not a cast). */
export type MarkedAlternative = NonNullable<ObjectView['alternative']>;

export const ALTERNATIVE_NAMES: Readonly<Record<NamedAlternative, string>> = {
  overload: 'Overload',
  evoke: 'Evoke',
  dash: 'Dash',
  spectacle: 'Spectacle',
  escape: 'Escape',
  madness: 'Madness',
  foretell: 'Foretell',
  // D-149: "pay {W} and tap four untapped creatures ... rather than pay this spell's mana cost".
  tapPermanents: 'Tap creatures',
};

/** True for the alternatives whose cost the card's view carries: overload, evoke, dash, spectacle, escape. */
export function isNamedAlternative(
  alternative: CastAlternativeKind | undefined,
): alternative is NamedAlternative {
  return alternative !== undefined && Object.hasOwn(ALTERNATIVE_NAMES, alternative);
}

/** "for its overload cost": how the log says a spell was cast with it (CR 601.2b). */
export function alternativeLogWords(kind: NamedAlternative): string {
  // D-149 (CR 118.9): the cost taps creatures; it has no keyword to name.
  if (kind === 'tapPermanents') return 'by tapping creatures';
  return `for its ${kind} cost`;
}

/** What a badge says and what hovering it explains; `null` from `alternativeBadge` for none. */
export interface AlternativeBadge {
  readonly text: string;
  readonly title: string;
  /** The line the preview panel lists. */
  readonly fact: string;
}

const STACK_BADGES: Readonly<Partial<Record<MarkedAlternative, AlternativeBadge>>> = {
  overload: {
    text: 'overloaded',
    title: 'Cast for its overload cost: "target" in its text reads "each". It has no targets.',
    fact: 'Cast for its overload cost: "target" reads "each"',
  },
  evoke: {
    text: 'evoked',
    title:
      'Cast for its evoke cost. When it enters, its controller sacrifices it (an ability that uses the stack).',
    fact: 'Cast for its evoke cost: sacrificed when it enters',
  },
  dash: {
    text: 'dashed',
    title:
      'Cast for its dash cost. It has haste and returns to its owner’s hand at the beginning of the next end step.',
    fact: 'Cast for its dash cost: haste, returns to its owner’s hand at the next end step',
  },
  spectacle: {
    text: 'spectacle',
    title: 'Cast for its spectacle cost: an opponent lost life this turn.',
    fact: 'Cast for its spectacle cost',
  },
  escape: {
    text: 'escaped',
    title:
      'Cast from the graveyard for its escape cost, exiling other cards from the graveyard. It goes to the graveyard, not exile, when it leaves the stack.',
    fact: 'Cast from the graveyard for its escape cost',
  },
  madness: {
    text: 'madness',
    title: 'Cast from exile for its madness cost, after it was discarded.',
    fact: 'Cast for its madness cost',
  },
  foretell: {
    text: 'foretold',
    title: 'Cast from exile for its foretell cost, after it was foretold in an earlier turn.',
    fact: 'Cast for its foretell cost',
  },
};

/** A spell cast as the effect of its suspend ability (CR 702.62a, D-128); `alternative` is not set for it. */
const SUSPENDED_SPELL: AlternativeBadge = {
  text: 'suspended',
  title:
    'Cast without paying its mana cost because its last time counter was removed. A creature spell gives a permanent with haste.',
  fact: 'Cast from suspend without paying its mana cost: a creature has haste',
};

const PERMANENT_BADGES: Readonly<Partial<Record<MarkedAlternative, AlternativeBadge>>> = {
  evoke: {
    text: 'evoked',
    title: 'Evoked: sacrificed when it enters.',
    fact: 'Evoked: sacrificed when it enters',
  },
  dash: {
    text: 'dashed',
    title:
      'Dashed: it has haste and returns to its owner’s hand at the beginning of the next end step.',
    fact: 'Dashed: returns to its owner’s hand at the next end step',
  },
  escape: {
    text: 'escaped',
    title: 'Escaped: it was cast from the graveyard for its escape cost.',
    fact: 'Escaped: cast from the graveyard for its escape cost',
  },
  suspend: {
    text: 'suspended',
    title: 'Cast from suspend: it has haste.',
    fact: 'Cast from suspend: it has haste (it loses it if it loses its abilities)',
  },
  unearth: {
    text: 'unearthed',
    title:
      'Unearthed: it has haste and is exiled at the beginning of the next end step. If it would leave the battlefield, it is exiled instead.',
    fact: 'Unearthed: exiled at the end of turn, and if it would leave the battlefield it is exiled instead',
  },
};

/**
 * The badge of a spell on the stack that was cast with a named alternative cost ("overloaded",
 * "evoked", "dashed", "spectacle", "escaped") and of the permanent that entered from an evoked,
 * dashed or escaped spell or came back by unearth. A card in any other zone has none, whatever its
 * view says.
 */
export function alternativeBadge(
  o: Pick<ObjectView, 'alternative' | 'zone'> & Partial<Pick<ObjectView, 'suspended'>>,
): AlternativeBadge | null {
  if (o.zone === 'stack' && o.suspended === true) return SUSPENDED_SPELL;
  if (o.alternative === undefined) return null;
  if (o.zone === 'stack') return STACK_BADGES[o.alternative] ?? null;
  return o.zone === 'battlefield' ? (PERMANENT_BADGES[o.alternative] ?? null) : null;
}
