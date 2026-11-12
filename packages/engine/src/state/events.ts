/**
 * Events (SPEC 4.2): every change emits typed events. The same stream drives trigger detection,
 * the game log and UI animation. Proposed changes pass through replacement and prevention first
 * (SPEC 17.1 A1); events describe what actually happened.
 */
import type { CastAlternativeKind } from '../ast/features';
import type { Zone } from '../ast/types';
import type { CardId, ObjectId, SeatId } from '../ids';
import type { ChosenTarget } from './chosen';
import type { AttackTarget } from './combat-types';
import type { StepId } from './types';

export type GameEvent =
  | { readonly kind: 'gameStarted'; readonly startingSeat: SeatId; readonly seed: number }
  | { readonly kind: 'mulliganTaken'; readonly seat: SeatId; readonly count: number }
  | { readonly kind: 'handKept'; readonly seat: SeatId }
  | { readonly kind: 'turnBegan'; readonly seat: SeatId; readonly turn: number }
  | { readonly kind: 'stepBegan'; readonly step: StepId; readonly seat: SeatId }
  | {
      readonly kind: 'zoneChanged';
      readonly card: CardId | null;
      readonly from: ObjectId;
      readonly to: ObjectId;
      readonly fromZone: Zone;
      readonly toZone: Zone;
      /**
       * Put onto the battlefield at the same time as the other consecutive `simultaneous` events (CR 603.6a, D-272): one event puts several permanents onto the battlefield,
       * so each of them is checked for the enters triggers of all the others. Only on an event that enters the battlefield.
       */
      readonly simultaneous?: true;
      /**
       * D-277 (CR 712.21, 701.42a): the second card of a melded permanent. A melded permanent is one object represented by two cards, so one permanent
       * enters (or leaves) the battlefield and two cards move: the first card's event is the permanent's and this one is only the other card's own move
       * (a trigger about permanents entering or leaving does not count it again; a trigger about cards does). Only on a move to or from the battlefield.
       */
      readonly component?: true;
    }
  /**
   * D-277 (CR 701.42a): two cards were exiled and melded: `permanent` is the one object that entered the battlefield, `cards` the two cards that
   * represent it (the first card's object entered, the second card is its `meldedWith`), `from` the two exile objects they were.
   */
  | {
      readonly kind: 'melded';
      readonly permanent: ObjectId;
      readonly cards: readonly [CardId, CardId];
      readonly from: readonly [ObjectId, ObjectId];
    }
  /**
   * D-277 (CR 701.42c): an effect told a player to meld objects that can't be melded (a token, a card that is not part of a meld pair, a card that is
   * no longer where it was); `objects` stay in their zone. `reason` says which rule stopped it.
   */
  | { readonly kind: 'meldFailed'; readonly objects: readonly ObjectId[]; readonly reason: string }
  /**
   * CR 701.40a (Manifest, D-309): `seat` manifested a card: the card was put onto the battlefield face down as a 2/2 creature, `object` is that permanent. The card is
   * not named (hidden information, CR 708.5): the `zoneChanged` event that comes before it has no card either. `from` is the seat whose library it came from (public: a
   * library's owner is, its cards are not): `seat` for "manifest the top card of your library", another seat for "of target opponent's library".
   */
  | {
      readonly kind: 'manifested';
      readonly seat: SeatId;
      readonly from: SeatId;
      readonly object: ObjectId;
    }
  /**
   * CR 116.2b, 701.40b, 708.8 (D-310): `seat` turned the face-down permanent `object` face up, a special action that does not use the stack. `card` is the card it
   * represents, which is public from now on; `object` is the same object (no zone change, so nothing entered: no enters ability triggers, CR 708.8). `cost` is the mana
   * symbols paid.
   */
  | {
      readonly kind: 'turnedFaceUp';
      readonly seat: SeatId;
      readonly object: ObjectId;
      readonly card: CardId;
      readonly cost: readonly string[];
    }
  /**
   * `seat` drew a card (CR 121.1): `object` is the card in their hand. `nth` is how many cards they have
   * drawn this turn including this one (D-111), which the `drawn` trigger's `nth` compares.
   */
  | {
      readonly kind: 'cardDrawn';
      readonly seat: SeatId;
      readonly object: ObjectId;
      readonly nth: number;
    }
  | { readonly kind: 'drewFromEmptyLibrary'; readonly seat: SeatId }
  | { readonly kind: 'libraryShuffled'; readonly seat: SeatId }
  /**
   * CR 706.1, 706.2 (D-271): `seat` rolled a die of `sides` sides; `result` is the natural result (the engine has no modifiers of a roll), drawn from the
   * seeded generator of the game. A random event: the host does not let the player undo past it, as for a draw or a shuffle.
   */
  | {
      readonly kind: 'dieRolled';
      readonly seat: SeatId;
      readonly sides: number;
      readonly result: number;
    }
  /**
   * CR 701.17a (Mill, D-131): `seat` put the top cards of their library into their graveyard, as the new objects they
   * became there (CR 400.7), in the order they were milled (the top card first). One event for each player and each
   * instruction; a player with an empty library mills nothing and no event is emitted for them.
   */
  | { readonly kind: 'milled'; readonly seat: SeatId; readonly objects: readonly ObjectId[] }
  | {
      readonly kind: 'landPlayed';
      readonly seat: SeatId;
      readonly object: ObjectId;
      /** The face played when it is not face 0 (a modal double-faced card's back face, CR 712.12). */
      readonly face?: number;
    }
  | {
      readonly kind: 'spellCast';
      readonly seat: SeatId;
      readonly object: ObjectId;
      readonly fromZone: Zone;
      /** How many spells the caster has cast this turn, this one included (D-229, "their second spell each turn"). */
      readonly nth: number;
      readonly commanderTax: number;
      /** Present (true) when a kicker cost was paid, at least once (CR 702.33d). */
      readonly kicked?: true;
      /** How many times the multikicker cost was paid (CR 702.33c); present when it is at least 1. */
      readonly kicks?: number;
      /** How many times the replicate cost was paid (CR 702.56a, D-129); present when it is at least 1. */
      readonly replicas?: number;
      /** The opponent the gift was promised to (CR 702.174a, D-135); present when the caster promised one. */
      readonly gift?: SeatId;
      /**
       * Present when cast by an alternative cost: from the graveyard with flashback (CR 702.34a), or
       * without paying its mana cost (CR 118.9, D-095), or for a named alternative cost (D-121: overload).
       */
      readonly alternative?: CastAlternativeKind;
      /**
       * The face cast, present when it is not face 0: the second half of a split card (CR 709.3),
       * an Adventure (CR 715.3), the back face of a modal double-faced card (CR 712.11b).
       */
      readonly face?: number;
      /** The X announced for the spell (CR 107.3a, D-103); present when it had an X to announce. */
      readonly x?: number;
      /** Present (true) when it was cast as the effect of its suspend ability (CR 702.62a, D-128). */
      readonly suspended?: true;
    }
  /**
   * A copy of a spell was put onto the stack (CR 707.10, D-129): by Storm, or by an effect that copies a spell. `copy`
   * is the new object (a spell that was not cast, so there is no `spellCast` for it), `original` the spell it copies (it
   * may have left the stack since), `seat` the player who controls the copy. The copy has the original's targets until
   * its controller has chosen new ones (`becameTarget` follows for each target it ends up with).
   */
  | {
      readonly kind: 'spellCopied';
      readonly seat: SeatId;
      readonly original: ObjectId;
      readonly copy: ObjectId;
    }
  /**
   * The target of a spell or ability on the stack was changed to another legal one (CR 115.7a, 115.7b, D-181): `object` is the spell or ability,
   * `seat` the player whose effect changed it, `from` the target it had and `to` the one it has now. `becameTarget` follows when the new target is
   * an object (Ward and the like). Nothing is emitted when the target could not be changed (CR 115.7a: it stays as it was).
   */
  | {
      readonly kind: 'targetChanged';
      readonly seat: SeatId;
      readonly object: ObjectId;
      readonly from: ChosenTarget;
      readonly to: ChosenTarget;
    }
  | {
      readonly kind: 'abilityActivated';
      readonly seat: SeatId;
      readonly source: ObjectId;
      readonly abilityIndex: number;
      readonly stackObject: ObjectId | null;
      /** The X announced for the ability (CR 602.2b, D-103); present when its cost had an X. */
      readonly x?: number;
    }
  /**
   * The modes of a modal spell or ability were chosen (CR 601.2b, 602.2b, 603.3c, 700.2, D-114): for a
   * spell being cast, an ability being activated or a triggered ability being put on the stack.
   * `source` is the spell or ability on the stack; `modes` are indices into its modes, in printed order.
   * `automatic` is true when the engine chose because only one choice was legal.
   */
  | {
      readonly kind: 'modesChosen';
      readonly seat: SeatId;
      readonly source: ObjectId;
      readonly modes: readonly number[];
      readonly automatic: boolean;
    }
  | { readonly kind: 'manaAdded'; readonly seat: SeatId; readonly count: number }
  | { readonly kind: 'manaEmptied'; readonly seat: SeatId; readonly count: number }
  | { readonly kind: 'tapped'; readonly object: ObjectId }
  /**
   * A player tapped a permanent for mana: activated a mana ability of it with {T} in its cost (CR 106.12), right after its `tapped` (D-189). `object` is
   * the permanent as it was tapped; it may be gone by the end of the same ability (a sacrifice is part of it). "Whenever an opponent taps an artifact for
   * mana" reads it.
   */
  | { readonly kind: 'tappedForMana'; readonly object: ObjectId; readonly seat: SeatId }
  /**
   * A permanent changed controller (CR 110.2, 613.1b, D-189): a control-changing effect began or ended and who controls the permanent is not who did
   * (`from`) but `to`. `permanent` is removed from combat when it was in it (`removedFromCombat`, CR 506.4).
   */
  | {
      readonly kind: 'controlChanged';
      readonly object: ObjectId;
      readonly from: SeatId;
      readonly to: SeatId;
    }
  | { readonly kind: 'untapped'; readonly object: ObjectId }
  | { readonly kind: 'priorityPassed'; readonly seat: SeatId }
  | {
      readonly kind: 'attackersDeclared';
      readonly seat: SeatId;
      readonly attackers: readonly { readonly object: ObjectId; readonly target: AttackTarget }[];
    }
  | {
      readonly kind: 'blockersDeclared';
      readonly seat: SeatId;
      readonly blocks: readonly { readonly blocker: ObjectId; readonly attacker: ObjectId }[];
    }
  | { readonly kind: 'removedFromCombat'; readonly object: ObjectId }
  /**
   * Cards that were exiled went to the bottom of their owner's library in a random order (CR 702.85a, Cascade,
   * D-120). Only the number is told: which card went where is hidden, so no zone change is reported.
   */
  | { readonly kind: 'cardsBottomed'; readonly seat: SeatId; readonly count: number }
  /**
   * A regeneration shield replaced a destruction (CR 701.19a, D-120): the permanent was not destroyed;
   * its damage was removed, it was tapped (a `tapped` event follows when it was untapped) and, if it was
   * attacking or blocking, it was removed from combat (`removedFromCombat`).
   */
  | { readonly kind: 'regenerated'; readonly object: ObjectId }
  | { readonly kind: 'resolved'; readonly object: ObjectId }
  /**
   * The object is removed from the stack without resolving: every target was illegal (CR 608.2b),
   * or `reason` is 'interveningIf' and the "if" of a triggered ability no longer held (CR 603.4).
   */
  | {
      readonly kind: 'fizzled';
      readonly object: ObjectId;
      readonly reason?: 'interveningIf';
    }
  | { readonly kind: 'countered'; readonly object: ObjectId }
  | {
      readonly kind: 'damageDealt';
      readonly source: ObjectId;
      readonly to:
        | { readonly kind: 'object'; readonly id: ObjectId }
        | { readonly kind: 'player'; readonly seat: SeatId };
      readonly amount: number;
      /** True for combat damage (CR 510); commander damage counts only combat damage. */
      readonly combat: boolean;
    }
  /**
   * Damage that would have been dealt was prevented by a shield (CR 615.1, 615.6): `amount` is the
   * part that was prevented, and the same step's `damageDealt` (if any) has the rest. Nothing
   * damage does (life loss, marked damage, lifelink) happens for it.
   */
  | {
      readonly kind: 'damagePrevented';
      readonly source: ObjectId;
      readonly to:
        | { readonly kind: 'object'; readonly id: ObjectId }
        | { readonly kind: 'player'; readonly seat: SeatId };
      readonly amount: number;
      readonly combat: boolean;
    }
  /**
   * Damage that would have been dealt to `from` is dealt to `to` instead (CR 614.9, D-192): a redirection effect, such as the one of Ancient
   * Adamantoise. `amount` is what was redirected, dealt by `source` to `to` as its own `damageDealt` (CR 120.3: what it does depends on `to`).
   */
  | {
      readonly kind: 'damageRedirected';
      readonly source: ObjectId;
      readonly from:
        | { readonly kind: 'object'; readonly id: ObjectId }
        | { readonly kind: 'player'; readonly seat: SeatId };
      readonly to:
        | { readonly kind: 'object'; readonly id: ObjectId }
        | { readonly kind: 'player'; readonly seat: SeatId };
      readonly amount: number;
      readonly combat: boolean;
    }
  /** `seat` had `from` energy counters and has `to` (CR 107.14, 122.1, D-209): gained with "You get {E}{E}", paid with {E}. */
  | {
      readonly kind: 'energyChanged';
      readonly seat: SeatId;
      readonly from: number;
      readonly to: number;
    }
  /** CR 722.3a, 722.3c (D-214): `object` became prepared and the copy of its prepare spell was made in exile. */
  | { readonly kind: 'prepared'; readonly object: ObjectId; readonly copy: ObjectId }
  | {
      readonly kind: 'lifeChanged';
      readonly seat: SeatId;
      readonly from: number;
      readonly to: number;
    }
  /**
   * `seat` gained `amount` life (CR 119.3, 119.7; D-149), after any replacement of the amount (`lifeGainBonus`): one event for each gain,
   * together with its `lifeChanged`. `nth` counts the player's gains this turn, this one included ("for the first time each turn").
   */
  | {
      readonly kind: 'lifeGained';
      readonly seat: SeatId;
      readonly amount: number;
      readonly nth: number;
    }
  /**
   * `seat`'s poison counters changed (CR 120.3b infect damage, CR 120.3g toxic, CR 122.1): `from` and `to`
   * are the totals before and after. Ten or more is a loss at the next state-based action check (CR 704.5c).
   */
  | {
      readonly kind: 'poisonChanged';
      readonly seat: SeatId;
      readonly from: number;
      readonly to: number;
    }
  | {
      readonly kind: 'counterAdded';
      readonly object: ObjectId;
      readonly counter: string;
      readonly count: number;
      /** The player who put the counters (CR 122.6a; D-149), when one did: "whenever you put one or more +1/+1 counters on ~". */
      readonly by?: SeatId;
    }
  | {
      readonly kind: 'counterRemoved';
      readonly object: ObjectId;
      readonly counter: string;
      readonly count: number;
    }
  | { readonly kind: 'died'; readonly object: ObjectId; readonly card: CardId | null }
  /**
   * CR 701.21 (Sacrifice): `permanent` is the id the permanent had on the battlefield (its
   * last-known information is in `GameState.lki`); emitted after its zone change.
   */
  | { readonly kind: 'sacrificed'; readonly permanent: ObjectId; readonly controller: SeatId }
  /** CR 111.1: a token entered the battlefield. It has no previous object. */
  | {
      readonly kind: 'tokenCreated';
      readonly seat: SeatId;
      readonly object: ObjectId;
      readonly name: string;
    }
  /** CR 114.1 (D-201): `seat` got an emblem, `object`, in the command zone. */
  | { readonly kind: 'emblemCreated'; readonly seat: SeatId; readonly object: ObjectId }
  /**
   * CR 603.3: a triggered ability was put on the stack as `stackObject`. `chapter` is the chapter
   * number reached, for a Saga's chapter ability (CR 714.2).
   */
  | {
      readonly kind: 'abilityTriggered';
      readonly seat: SeatId;
      readonly source: ObjectId;
      readonly abilityIndex: number;
      readonly stackObject: ObjectId;
      readonly chapter?: number;
    }
  /**
   * CR 603.3d: a triggered ability was removed as it was to be put on the stack, because a choice it
   * requires had no legal choice: `reason` 'noLegalTargets' says a target slot had fewer legal
   * targets than the ability needs ("destroy target creature an opponent controls" when there is
   * none). It never became an object on the stack, so there is no `abilityTriggered` for it.
   * `source` is the id its source had when it triggered (last-known information when it has left);
   * `chapter` is the chapter reached, for a Saga's chapter ability.
   */
  | {
      readonly kind: 'abilityRemoved';
      readonly seat: SeatId;
      readonly source: ObjectId;
      readonly abilityIndex: number;
      /** `noLegalModes`: a modal ability with no legal choice of modes (CR 603.3c, 700.2b). */
      readonly reason: 'noLegalTargets' | 'noLegalModes';
      readonly chapter?: number;
    }
  /**
   * An effect made `seat` choose permanents (CR 608.2d), or a cost did: `'sacrifice'` for the
   * permanents sacrificed, `'effect'` for the permanents an effect moves ("return a land you control
   * to its owner's hand"), `'crew'` for the creatures tapped to pay a crew cost (CR 702.122b; `source`
   * is then the crew ability on the stack). `automatic` is true when the engine chose because only
   * one legal choice existed (or no more than the number required).
   */
  | {
      readonly kind: 'permanentsChosen';
      readonly seat: SeatId;
      readonly source: ObjectId;
      readonly objects: readonly ObjectId[];
      readonly purpose: 'sacrifice' | 'crew' | 'effect' | 'tap' | 'bounce' | 'fight';
      readonly automatic: boolean;
      /** For purpose `'fight'` (D-145): the creature the chosen one is paired with; for the choice of what an Aura enters enchanting (D-149): the Aura. */
      readonly subject?: ObjectId;
    }
  /**
   * CR 701.34a (Proliferate, D-149): `seat` proliferated: each permanent in `objects` and each player in `players` was given one more counter of
   * each kind it had (the `counterAdded` and `poisonChanged` events follow). Emitted even when nothing was chosen, once a choice was offered.
   */
  | {
      readonly kind: 'proliferated';
      readonly seat: SeatId;
      readonly source: ObjectId;
      readonly objects: readonly ObjectId[];
      readonly players: readonly SeatId[];
    }
  /**
   * CR 701.14a (Fight, D-145): the creatures `objects` fought: each dealt damage equal to its power to the other (the damage events follow). Not
   * emitted when one of them was no longer a creature on the battlefield (CR 701.14b).
   */
  | { readonly kind: 'fought'; readonly objects: readonly [ObjectId, ObjectId] }
  /**
   * CR 601.2c, 602.2b, 603.3d: `object` (a permanent or any object) became the target of the spell
   * or ability `by` as its targets were chosen, once per object for each spell or ability. Emitted
   * as the spell is cast or the ability activated, before `spellCast` or `abilityActivated`; for a
   * triggered ability, after its `abilityTriggered` (the ability is on the stack when its targets
   * are chosen).
   */
  | {
      readonly kind: 'becameTarget';
      readonly object: ObjectId;
      readonly by: ObjectId;
      readonly seat: SeatId;
    }
  /**
   * CR 704.5j (Legend rule): `seat` controlled several legendary permanents named `name` and chose
   * to keep `kept` (an id on the battlefield); the others went to their owners' graveyards, which
   * their `zoneChanged` events show.
   */
  | {
      readonly kind: 'legendRule';
      readonly seat: SeatId;
      readonly name: string;
      readonly kept: ObjectId;
    }
  /**
   * CR 701.23 (Search): `seat` searched their own library and found `found` cards (0 when they
   * found none or nothing matched). The cards' names are public only through `cardsRevealed`.
   */
  | { readonly kind: 'librarySearched'; readonly seat: SeatId; readonly found: number }
  /** "Look at the top six cards of your library" (D-139): `seat` looked at `count` cards; which they are stays hidden (`cardsRevealed` tells the ones revealed). */
  | { readonly kind: 'topCardsLooked'; readonly seat: SeatId; readonly count: number }
  /**
   * CR 701.22 (Scry): `seat` looked at the top cards of their library and put `top` of them back on
   * top and `bottom` on the bottom (counts: which cards stay hidden). Emitted after the cards moved,
   * also when the library held no card (both 0, CR 701.22d); never for "scry 0" (CR 701.22b).
   */
  | {
      readonly kind: 'scried';
      readonly seat: SeatId;
      readonly top: number;
      readonly bottom: number;
    }
  /**
   * CR 701.25 (Surveil): `seat` looked at the top cards of their library, put `toGraveyard` of them
   * into the graveyard and `top` back on top (counts). The cards that went to the graveyard are
   * public through their own `zoneChanged` events, which follow this one. Never for "surveil 0"
   * (CR 701.25c); with an empty library both are 0 (CR 701.25d).
   */
  | {
      readonly kind: 'surveiled';
      readonly seat: SeatId;
      readonly top: number;
      readonly toGraveyard: number;
    }
  /**
   * CR 701.20 (Reveal): `seat` showed these cards, from `from`, to every player. Emitted by a
   * search that reveals what it found, before the cards move. `names` are in the order of `cards`.
   */
  | {
      readonly kind: 'cardsRevealed';
      readonly seat: SeatId;
      readonly cards: readonly CardId[];
      readonly names: readonly string[];
      readonly from: Zone;
    }
  /**
   * CR 700.3 (D-303): `seat` separated the revealed cards into two piles; `first` and `second` are the names of the cards of each, in library order. Public: the cards were revealed
   * (`cardsRevealed`) and are still in the library. A pile may be empty (CR 700.3d).
   */
  | {
      readonly kind: 'pilesSeparated';
      readonly seat: SeatId;
      readonly first: readonly string[];
      readonly second: readonly string[];
    }
  /** CR 700.3 (D-303): `seat` chose pile `pile` (1 or 2, as `pilesSeparated` lists them); `names` are its cards, which go where the effect says. */
  | {
      readonly kind: 'pileChosen';
      readonly seat: SeatId;
      readonly pile: 1 | 2;
      readonly names: readonly string[];
    }
  /** CR 603.5: the controller of an optional ("you may") triggered ability answered. */
  | {
      readonly kind: 'optionalAnswered';
      readonly seat: SeatId;
      readonly source: ObjectId;
      readonly accepted: boolean;
    }
  /**
   * The affected player chose which of several effects to apply first to a damage event (CR 616.1, D-191): the answer to a `chooseOption`
   * decision with purpose `'replacement'`. `source` is the source of the damage, `option` the key of the effect and `text` what it does.
   */
  | {
      readonly kind: 'replacementChosen';
      readonly seat: SeatId;
      readonly source: ObjectId;
      readonly option: string;
      readonly text: string;
    }
  /**
   * CR 614.12a (D-100): a player made the choice "As this enters, choose a creature type / a color"
   * for the permanent `source` about to enter (the object that was asked about; for a token, the
   * spell or ability that creates it). `option` is the creature type or the color letter chosen. With purpose `'vote'` (CR 701.38a, D-194) it is
   * one vote of `seat` in a vote of the spell or ability `source`, for the option the card words; a vote is public, so the log says who voted for what.
   */
  | {
      readonly kind: 'optionChosen';
      readonly seat: SeatId;
      readonly source: ObjectId;
      readonly purpose:
        | 'creatureType'
        | 'color'
        | 'option'
        | 'attackTarget'
        | 'effect'
        | 'riot'
        | 'vote';
      readonly option: string;
    }
  /**
   * A permanent entered as a copy of another (CR 707.9, D-151): "As this artifact enters, you may have it become a copy of any creature on the
   * battlefield". `object` is the new permanent and `copied` the permanent it copies.
   */
  | { readonly kind: 'enteredAsCopy'; readonly object: ObjectId; readonly copied: ObjectId }
  /**
   * A card was discarded (CR 701.9a): `object` is the card as it was in the hand, `to` what it became in the graveyard (or in exile, for a card with
   * madness, CR 702.35a); null when it could not be found. "Whenever you discard a card" triggers from this (D-206).
   */
  | {
      readonly kind: 'discarded';
      readonly seat: SeatId;
      readonly object: ObjectId;
      readonly to: ObjectId | null;
    }
  /**
   * A card was cycled (CR 702.29c, 702.29f, D-179): `seat` discarded it to pay an activation cost of a cycling ability (Cycling or typecycling). `object`
   * is the card in the zone it wound up in (the graveyard, or exile for a card with madness); the `discarded` event before it has the id the card had in
   * the hand. "When you cycle this card" triggers from there.
   */
  | { readonly kind: 'cycled'; readonly seat: SeatId; readonly object: ObjectId }
  /**
   * A card with madness was discarded and exiled instead of going to the graveyard (CR 702.35a, D-128). `object` is
   * the card in exile (public: exile is a public zone); the `discarded` event before it has the id the card had in
   * the hand. Its madness ability triggers.
   */
  | { readonly kind: 'madnessExiled'; readonly seat: SeatId; readonly object: ObjectId }
  /**
   * CR 702.94a (Miracle, D-274): `seat` revealed the card `object`, in their hand, as they drew it (the first card they drew this turn); "When
   * you reveal this card this way" triggers from this. The reveal itself is public through the `cardsRevealed` event before it.
   */
  | { readonly kind: 'miracleRevealed'; readonly seat: SeatId; readonly object: ObjectId }
  /**
   * A card was suspended (CR 702.62a, D-128): `seat` paid its suspend cost and exiled it, face up, with `count` time
   * counters. `object` is the card in exile (public). The `counterAdded` event for the time counters follows.
   */
  | {
      readonly kind: 'suspended';
      readonly seat: SeatId;
      readonly object: ObjectId;
      readonly count: number;
    }
  /**
   * A card was foretold (CR 702.143a, D-128): `seat` paid {2} and exiled it from their hand face down. `object` is the card
   * in exile; nothing in the event says what the card is (the other player is told only that it is there). It names
   * no cost and carries no card id.
   */
  | { readonly kind: 'foretold'; readonly seat: SeatId; readonly object: ObjectId }
  /** CR 701.3 (Attach): an Aura or Equipment became attached to a permanent. */
  | { readonly kind: 'attached'; readonly object: ObjectId; readonly to: ObjectId }
  /**
   * CR 701.3d: an Aura or Equipment became unattached from `from` and stays on the battlefield
   * (an Aura that falls off goes to the graveyard, which is its `zoneChanged`). `reason` is
   * 'replaced' when it was attached to another permanent (CR 701.3b: the Equipment moved), 'left'
   * when `from` is no longer on the battlefield (CR 704.5n), 'illegal' when `from` is still there
   * but can no longer be equipped (CR 704.5n, 704.5p).
   */
  | {
      readonly kind: 'unattached';
      readonly object: ObjectId;
      readonly from: ObjectId;
      readonly reason: 'left' | 'illegal' | 'replaced';
    }
  | { readonly kind: 'commanderMovedToCommandZone'; readonly card: CardId; readonly from: Zone }
  | { readonly kind: 'playerLost'; readonly seat: SeatId; readonly reason: LossReason }
  | { readonly kind: 'gameEnded'; readonly result: 'win' | 'draw'; readonly winner: SeatId | null }
  | { readonly kind: 'conceded'; readonly seat: SeatId }
  /**
   * The monarch designation moved (CR 725.1, 725.3, 725.4, D-127): `from` is the previous monarch (null if there was
   * none), `to` the new one (null when the monarch left the game and nobody could take over, CR 725.4).
   */
  | {
      readonly kind: 'monarchChanged';
      readonly from: SeatId | null;
      readonly to: SeatId | null;
    }
  /** `seat` got the city's blessing (CR 702.131b, D-264): they controlled ten or more permanents, one of them with Ascend. Once per player. */
  | { readonly kind: 'citysBlessingGained'; readonly seat: SeatId }
  /**
   * The Ring tempted `seat` (CR 701.54a, 701.54d, D-196), once they had done what the rule says, even when some or all of it was impossible.
   * `times` is how often it has tempted them now (the emblem has abilities from 2, 3 and 4), `bearer` the creature they chose as their
   * Ring-bearer (null when they control no creature) and `first` is true when this gave them the emblem named The Ring (CR 701.54c).
   * "Whenever the Ring tempts you" triggers on it.
   */
  | {
      readonly kind: 'ringTempted';
      readonly seat: SeatId;
      readonly times: number;
      readonly bearer: ObjectId | null;
      readonly first: boolean;
    }
  /**
   * A creature stopped being the Ring-bearer of `seat` (CR 701.54a), because another creature became it or because another player gained
   * control of it. Not emitted for one that left the battlefield (it is a new object, CR 400.7, and the designation is simply gone).
   */
  | { readonly kind: 'ringBearerLost'; readonly seat: SeatId; readonly object: ObjectId }
  /**
   * Two creatures became paired (CR 702.95a, 702.95b, D-286): `a` is the creature whose soulbond ability paired them and `b` the other (the one that
   * entered, for "whenever another creature you control enters"); `by` is the player who controls both and the ability.
   */
  | {
      readonly kind: 'creaturesPaired';
      readonly a: ObjectId;
      readonly b: ObjectId;
      readonly by: SeatId;
    }
  /**
   * A pair ended while its creature `a` stays on the battlefield (CR 702.95e, D-285): `b` is the one that was its partner. `why`: `left` (the partner left
   * the battlefield, so it is a new object), `control` (another player gained control of one of them) or `notCreature` (one stopped being a creature).
   * Not emitted when both leave together: there is no creature left to say it about.
   */
  | {
      readonly kind: 'creaturesUnpaired';
      readonly a: ObjectId;
      readonly b: ObjectId;
      readonly why: 'left' | 'control' | 'notCreature';
    };

export type LossReason =
  | 'life'
  | 'emptyLibrary'
  | 'poison'
  | 'commanderDamage'
  | 'concede'
  /** An effect said the player loses the game (CR 104.3e, D-269). */
  | 'effect';
