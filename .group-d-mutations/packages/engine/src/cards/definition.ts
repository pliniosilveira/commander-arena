/**
 * A card as the engine sees it: Scryfall identity, base characteristics per face, and the
 * ability AST. Produced by the Oracle parser or by hand-written overrides, and by the
 * test-card fixtures.
 */
import type { Ability, AlternativeCost, Cost, SpellText, TokenDefinition } from '../ast/types';
import type { Characteristics } from '../characteristics';

export interface CardFace extends Characteristics {
  readonly abilities: readonly Ability[];
  /**
   * A Saga's final chapter number: the greatest chapter number its chapter abilities have (CR
   * 714.2d). Present on the face of a Saga (layout `saga`); `validateCard` checks that every
   * chapter from 1 to it has exactly one chapter ability. The engine itself reads the final chapter
   * from the abilities the permanent has now (`rules/saga.ts`), so this is data the card carries,
   * not a second source of truth.
   */
  readonly finalChapter?: number;
  /**
   * "As an additional cost to cast this spell, sacrifice a creature / discard a card" (CR 118.8,
   * 601.2b, 601.2f-h; D-095): costs paid with the spell's total cost whenever the spell is cast from
   * a normal or an alternative cost. The kinds run: `sacrifice` of a filter (a permanent the caster
   * controls, never "this"), `discard` of N cards, `payLife` of a fixed amount and `mana` (without
   * X). At most one sacrifice and one discard. The caster chooses what to sacrifice and discard as
   * the cost is paid (after the mana), and a spell whose additional cost cannot be paid is not
   * castable. "Pay X life" is not supported (spells with X are not). Kicker is a keyword, not this.
   */
  readonly additionalCosts?: readonly Cost[];
  /**
   * "As an additional cost to cast this spell, sacrifice an artifact or creature or pay {4}." (CR 118.8, 601.2b, D-181): an additional cost the
   * caster pays in one of two ways, announced as the spell is cast (after the kicker and before X and the targets): the first option's costs or the
   * second's, together with `additionalCosts`. Each option is a list of the costs `additionalCosts` takes (`sacrifice`, `discard`, `payLife`, `mana`
   * without X), and together with `additionalCosts` at most one sacrifice and one discard. A way that cannot be paid is not offered; the question
   * is not asked when only one can. The caster is asked with a `confirmOptional` of purpose `costChoice`: accepting is the first option.
   */
  readonly additionalCostChoice?: readonly [readonly Cost[], readonly Cost[]];
  /** Alternative costs the card's text gives it (CR 118.9): see `AlternativeCost`. At most one. */
  readonly alternativeCosts?: readonly AlternativeCost[];
  /** Resolution text for spells (instants, sorceries, and permanents with "when cast" text). */
  readonly spell: SpellText | null;
}

export type CardLayout =
  | 'normal'
  | 'split'
  | 'adventure'
  | 'transform'
  | 'modal_dfc'
  | 'saga'
  // CR 716 (D-235): a Class enchantment, one face, its class level bars among its abilities.
  | 'class'
  // CR 722 (D-214): faces[0] is the card, faces[1] its prepare spell, which is never cast from the card.
  | 'prepare'
  // CR 701.42, 712.4 (D-277): a meld card. faces[0] is the front face (the only face outside the battlefield, CR 712.4b, 712.8a, 712.8b), faces[1] the combined
  // back face of its meld pair, read from the card of that face and the same on both cards of the pair (CR 712.8g); `meld` names the counterpart.
  | 'meld';

export interface CardDefinition {
  /** Scryfall oracle_id. Null only in hand-written fixtures that have not been matched yet. */
  readonly oracleId: string | null;
  readonly name: string;
  readonly layout: CardLayout;
  readonly faces: readonly CardFace[];
  /** Color identity for Commander deck rules (CR 903.4), from Scryfall. */
  readonly colorIdentity: readonly ('W' | 'U' | 'B' | 'R' | 'G')[];
  /**
   * Layout `meld` only (D-277, CR 701.42b, 712.5): the other card of the meld pair. A card's counterpart is the card with this name, whose own `meld.partner`
   * is this card's name and whose `faces[1]` is the same combined face; nothing else can be melded with it. The engine compares these data; it never names a card.
   */
  readonly meld?: { readonly partner: string };
  /** SPEC 7.1: supported or unsupported, never partial. */
  readonly support: 'supported' | 'unsupported';
}

/** Tokens are defined inline by the effect that creates them (see `TokenSpec` in the AST). */
export type { TokenDefinition };
