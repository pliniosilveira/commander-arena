/**
 * The named alternative costs Overload (CR 702.96), Evoke (CR 702.74), Dash (CR 702.109), Bestow (CR 702.103),
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
  // CR 702.103: cast as an Aura spell that enchants a creature.
  bestow: 'Bestow',
  spectacle: 'Spectacle',
  escape: 'Escape',
  harmonize: 'Harmonize',
  madness: 'Madness',
  miracle: 'Miracle',
  foretell: 'Foretell',
  // CR 702.37c: cast face down as a 2/2 creature for {3}.
  morph: 'Morph',
  // D-667 (CR 702.81a): cast from the graveyard by discarding a land card.
  retrace: 'Retrace',
  // CR 702.133a: cast from the graveyard by discarding a card.
  jumpStart: 'Jump-start',
  // D-149: "pay {W} and tap four untapped creatures ... rather than pay this spell's mana cost".
  tapPermanents: 'Tap creatures',
  // Issue 159: "cast this from your graveyard by paying {B}{B} and sacrificing two creatures".
  sacrificeFromGraveyard: 'Sacrifice creatures',
  // CR 118.9, 701.21a (Flare of Malice): "You may sacrifice a nontoken black creature rather than pay this spell's mana cost".
  sacrificePermanents: 'Sacrifice a creature',
  // CR 118.9, 118.4 (Snuff Out): "If you control a Swamp, you may pay 4 life rather than pay this spell's mana cost".
  payLife: 'Pay life',
  // Issue 81 (CR 702.176a): enters with time counters and is not a creature until the last is removed.
  impending: 'Impending',
  // CR 702.152a: haste, "When this creature dies, draw a card", sacrificed at the beginning of the next end step.
  blitz: 'Blitz',
  // CR 118.9: "Rather than pay the mana cost of the next spell you cast this turn, you may pay life equal to that spell's mana value" (Marshland Bloodcaster).
  lifeForMana: 'Pay life',
  // Issue 105 (CR 118.9, 107.14, Nissa, Worldsoul Speaker): "You may pay eight {E} rather than pay the mana cost for permanent spells you cast." Tlincalli Hunter: "you may pay {0} rather than pay the mana cost for a creature spell you cast from exile" (no energy).
  energyGrant: 'Pay alternative cost',
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
  if (kind === 'sacrificeFromGraveyard') return 'from the graveyard by sacrificing creatures';
  if (kind === 'sacrificePermanents') return 'by sacrificing creatures';
  // CR 118.9, 118.4: the life is the card's own number, which the cast event does not carry.
  if (kind === 'payLife') return 'by paying life rather than mana';
  // CR 702.37c, 708.4: the card is the face-down spell; it pays {3}, not its morph cost (that turns it face up).
  if (kind === 'morph') return 'face down';
  // CR 118.9: the life is the spell's mana value, which the cast event does not carry: the log says how the cost was paid.
  if (kind === 'lifeForMana') return 'by paying life rather than mana';
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
  bestow: {
    text: 'bestowed',
    title:
      'Cast for its bestow cost: an Aura spell with enchant creature. If its target is illegal as it resolves, it resolves as a creature.',
    fact: 'Cast for its bestow cost: an Aura spell that targets a creature',
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
  harmonize: {
    text: 'harmonize',
    title:
      'Cast from the graveyard for its harmonize cost; a tapped creature’s power reduced the cost. It is exiled when it leaves the stack.',
    fact: 'Cast from the graveyard for its harmonize cost: exiled when it leaves the stack',
  },
  madness: {
    text: 'madness',
    title: 'Cast from exile for its madness cost, after it was discarded.',
    fact: 'Cast for its madness cost',
  },
  miracle: {
    text: 'miracle',
    title:
      'Cast from the hand for its miracle cost, after it was revealed as the first card drawn this turn.',
    fact: 'Cast for its miracle cost',
  },
  foretell: {
    text: 'foretold',
    title: 'Cast from exile for its foretell cost, after it was foretold in an earlier turn.',
    fact: 'Cast for its foretell cost',
  },
  blitz: {
    text: 'blitzed',
    title:
      'Cast for its blitz cost. It has haste and "When this creature dies, draw a card", and is sacrificed at the beginning of the next end step.',
    fact: 'Cast for its blitz cost: haste, draws a card when it dies, sacrificed at the next end step',
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
  bestow: {
    text: 'bestowed',
    title: 'Bestowed: an Aura while it is attached to a creature; a creature again once it is not.',
    fact: 'Bestowed: an Aura while attached, a creature once unattached',
  },
  blitz: {
    text: 'blitzed',
    title:
      'Blitzed: it has haste and "When this creature dies, draw a card", and is sacrificed at the beginning of the next end step.',
    fact: 'Blitzed: haste, draws a card when it dies, sacrificed at the next end step',
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
