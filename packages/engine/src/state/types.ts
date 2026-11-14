/**
 * GameState: plain, JSON-serializable data (SPEC 4.2). No class instances, functions or cycles.
 * Updates produce new objects that share unchanged subtrees (SPEC 17.1 A6, D-006).
 *
 * Zones (CR 400): each seat owns library, hand, graveyard and command zone; battlefield, stack
 * and exile are shared. Every list holds ObjectIds. Library lists are ordered top first.
 */
import type {
  Ability,
  Cost,
  Effect,
  InlineChoice,
  Keyword,
  NamedAlternativeKind,
  ObjectFilter,
  PermanentAlternativeKind,
  Restriction,
  TokenDefinition,
  Zone,
} from '../ast/types';
import type { CardDefinition } from '../cards/definition';
import type { CardType, Characteristics, Color, Subtype } from '../characteristics';
import type { CardId, ObjectId, SeatId } from '../ids';
import type { ManaObject } from '../mana/types';
import type { RngState } from '../rng/types';
import type { ChosenTarget } from './chosen';
import type { AttackTarget } from './combat-types';
import type { PendingDecision, VoteCast } from './decisions';

export type StepId =
  | 'untap'
  | 'upkeep'
  | 'draw'
  | 'precombatMain'
  | 'beginningOfCombat'
  | 'declareAttackers'
  | 'declareBlockers'
  | 'firstStrikeDamage'
  | 'combatDamage'
  | 'endOfCombat'
  | 'postcombatMain'
  | 'end'
  | 'cleanup';

export type PhaseId = 'beginning' | 'precombatMain' | 'combat' | 'postcombatMain' | 'ending';

/** A physical card in the game (CR 108.1). Stable for the whole game. */
export interface CardInstance {
  readonly id: CardId;
  readonly owner: SeatId;
  /** Index into GameState.definitions. */
  readonly definition: number;
  readonly isCommander: boolean;
}

/** One object in one zone (CR 109.1, 400.7). A new ObjectId on every zone change. */
export interface GameObject {
  readonly id: ObjectId;
  /** The card this object is, or null for tokens and for abilities on the stack. */
  readonly card: CardId | null;
  readonly zone: Zone;
  /** Which seat's zone it is in, for per-seat zones; null for battlefield, stack and exile. */
  readonly zoneOwner: SeatId | null;
  readonly owner: SeatId;
  readonly controller: SeatId;
  /**
   * Which face is up (index into the definition's faces). Only a spell on the stack and a permanent
   * on the battlefield can have a face other than 0: the face that was cast or played, or the one a
   * double-faced permanent transformed to. In every other zone it is 0 (CR 712.8a, 715.4); a split
   * card has the characteristics of both halves there (CR 709.4), see `rules/layouts.ts`. A melded
   * permanent (`meldedWith`) has face 1, the combined back face (CR 712.8g).
   */
  readonly face: number;
  /**
   * D-277 (CR 701.42a, 712.4a): present on a melded permanent, which is one object represented by two cards: `card` is the first card and this is the
   * second (the counterpart of its meld pair). It exists only on the battlefield and phased out (CR 712.8g: only there are the two cards one object); in
   * every other zone each card is an ordinary object with its own front face (CR 712.4b, 712.8a), and a permanent that leaves becomes two objects, one for
   * each card (CR 712.21). `face` is 1, the combined back face. A commander card is always `card`, never this one, when exactly one of the two is
   * (`rules/melded.ts`). Absent for everything else.
   */
  readonly meldedWith?: CardId;
  readonly tapped: boolean;
  readonly counters: Readonly<Record<string, number>>;
  /** Damage marked this turn (CR 120.3). Removed in cleanup (CR 514.2). */
  readonly damage: number;
  /** True if any source of marked damage had deathtouch (CR 704.5h). */
  readonly damagedByDeathtouch: boolean;
  /**
   * Timestamp (CR 613.7) assigned when the object came under its current controller's control.
   * An object is summoning sick (CR 302.6) while this is later than its controller's
   * `turnStartTimestamp`.
   */
  readonly timestamp: number;
  /**
   * When control of this permanent last went back to someone because a control-changing effect ended (D-189, CR 302.6, 613.1b): a timestamp
   * from the state-wide counter. The permanent has not been under that controller's control since before then, so it is summoning sick again if
   * that is later than the start of their turn (`rules/control.ts`, `controlledSince`). Absent for a permanent whose control never went back.
   */
  readonly controlChangedAt?: number;
  /** Tokens carry their own characteristics and abilities. */
  readonly token: TokenData | null;
  /**
   * Present on a copy of a spell on the stack (CR 707.10, D-129): the card whose face the spell copies. A copy of a
   * spell is a spell with no card of its own (`card` is null: it is not a card, CR 707.10), so its printed values
   * and its spell text are read from this card's definition, at `face`. It cannot move anywhere but to the
   * battlefield, as a token (CR 707.10f, 608.3f); anywhere else it ceases to exist (CR 707.10a, 704.5e). Absent
   * for everything else (a copy of a copy names the same card).
   */
  readonly copyOf?: CardId;
  /** The object an Aura or Equipment is attached to (CR 303.4, 301.5). */
  readonly attachedTo: ObjectId | null;
  /** For a battle: the player who protects it (CR 310.8). Null for everything else. */
  readonly protector: SeatId | null;
  /** Stack objects only. */
  readonly stack: StackData | null;
  /**
   * Present (true) on a permanent that entered from a kicked spell (CR 702.33d): "When this
   * enters, if it was kicked" reads it. Absent otherwise.
   */
  readonly kicked?: true;
  /**
   * The Ring-bearer designation (CR 701.54a, 701.54b, D-196): present on a creature that is the Ring-bearer of the player it names. It is a
   * designation, not a copiable value (a copy effect does not touch it) and a new object after any zone change (CR 400.7) has none. It
   * ends when another creature becomes that player's Ring-bearer, or when another player gains control of the creature (`rules/ring.ts`,
   * `endLostRingBearers`, with the state-based actions). "Is your Ring-bearer" (CR 701.54e) is true only while the creature is on the battlefield
   * under that player's control (`isRingBearerOf`). Absent for everything else.
   */
  readonly ringBearer?: SeatId;
  /**
   * Present on a face-down permanent (CR 708.2, 701.40a, D-308): it has only the characteristics the rules give a face-down permanent (a 2/2 creature with no name, no
   * subtypes, no mana cost, no text: layer 1b, `rules/copiable.ts`) until it is turned face up (CR 708.8). `by` is what made it face down (`'manifest'`; the later kinds,
   * Morph, Megamorph, Disguise, cloak, would be other values) and `n` its label number, the smallest positive integer no other face-down permanent has, which it keeps
   * for as long as it is face down so that a player can tell their face-down permanents apart (CR 708.6). It is a designation, not a copiable value, and the object's own:
   * a new object after any zone change (CR 400.7, 708.9) is face up. Read only through `rules/face-down.ts`, never as the field (`test/face-down-reads.test.ts`). Absent
   * for every face-up object.
   */
  readonly faceDown?: { readonly by: FaceDownBy; readonly n: number };
  /**
   * The pairing designation (CR 702.95b, D-285): present on a creature that is paired with another, naming the other (`with`) and the player who formed the
   * pair (`by`, the controller of the soulbond ability: both are under their control). It is on both objects. It is a designation, not a copiable value (a
   * copy or a token that copies a paired creature is unpaired) and a new object after any zone change (CR 400.7, 702.95e) has none. It ends when either
   * leaves the battlefield, another player gains control of either, or either stops being a creature (`rules/pairing.ts`, `rules/pairing-sba.ts`); it
   * survives phasing (CR 702.26d). Read only through `rules/pairing.ts`, never as the field (`test/paired-reads.test.ts`). Absent for everything else.
   */
  readonly paired?: { readonly with: ObjectId; readonly by: SeatId };
  /**
   * The permanent is phased out (CR 702.26b, D-234): `zone` is `'phased'` and this is the player who controlled it as it phased out (or, for an Aura, Equipment or
   * Fortification that phased out indirectly with what it is attached to, the controller of that permanent): it phases in as that player's untap step begins.
   */
  readonly phasedBy?: SeatId;
  /**
   * The level of the permanent (CR 716.2a-d, D-235): a designation, set by "[Cost]: Level N"; absent means level 1 (CR 716.2d). It is not a copiable value and stays as long as the
   * object does (it is a new object, at level 1, when it changes zones, CR 400.7).
   */
  readonly level?: number;
  /**
   * The monstrous designation (CR 701.37b, D-445): set by the monstrosity action, kept until the permanent leaves the battlefield. It has no rules meaning but to be a marker, is not an
   * ability and is not a copiable value; a new object after any zone change (CR 400.7) is not monstrous.
   */
  readonly monstrous?: true;
  /**
   * "If it would leave the battlefield, exile it instead of putting it anywhere else" (CR 614.1a, 614.6, D-1430), set by the effect `exileIfLeaves` on the permanent an earlier
   * effect put onto the battlefield (Whip of Erebos): it is exiled instead of going to any other zone, whatever its abilities. Not a copiable value; a new object after any
   * zone change (CR 400.7) has none.
   */
  readonly exileIfLeaves?: true;
  /**
   * Present (true) on an emblem (CR 114, D-201): an object in the command zone of the player who got it (`owner` and `controller`), with no characteristics but
   * the abilities its `token` record gives it, which work from there (CR 114.4): `derive` reads its static abilities and `findTriggers` its triggered ones.
   * It is not a card and not a permanent, never leaves the command zone (CR 114.5) and is not a token that ceases to exist there (CR 704.5d is about the
   * other zones). Absent for everything else.
   */
  readonly emblem?: true;
  /**
   * Present on a permanent that entered from a spell cast for its evoke cost (CR 702.74a, D-121): the
   * fact "its evoke cost was paid", which gives it the sacrifice trigger (`rules/derive-alt.ts`). A new
   * object after any zone change (CR 400.7) has none. Absent otherwise.
   */
  readonly alt?: PermanentAlternativeKind;
  /**
   * How many times the spell this permanent came from was kicked, when it was kicked with Multikicker (CR
   * 702.33c, D-110): "for each time it was kicked" reads it. Absent for a permanent that was not kicked
   * and for one that came from a spell kicked with plain Kicker (which has `kicked` and counts once).
   */
  readonly kicks?: number;
  /**
   * The opponent a spell's gift was promised to (CR 702.174a, D-135), kept by the permanent the spell became: "when it enters,
   * if its gift cost was paid, they draw a card" and "if the gift was promised" read it. Absent when no gift was promised.
   */
  readonly giftTo?: SeatId;
  /**
   * The cards this permanent exiled with a linked ability (CR 607.2a, D-139: "Imprint", "exiled with this creature"), in the order they
   * were exiled; `exile.linked` records them and the static `takeFromLinkedExile` reads them. A card that has left exile is a new object
   * (CR 400.7) and no longer one of them: readers keep only those still in exile. It is this object's own: gone when the permanent
   * leaves the battlefield. Absent when nothing was exiled with it.
   */
  readonly linkedExile?: readonly ObjectId[];
  /**
   * Present on a card in exile that a Hideaway ability exiled face down (CR 702.75a, D-145): the permanent whose ability exiled it, whose
   * controller may look at it for as long as that permanent is still on the battlefield as the same object (nobody may when it left). It is
   * the exile object's own: a new object after any zone change (CR 400.7) has none. Absent otherwise.
   */
  readonly hideaway?: ObjectId;
  /**
   * Present (true) on a card an effect exiled face down (CR 406.3, 406.3a, D-187: "exile the top two cards of target opponent's library face down"):
   * it has no characteristics, and nobody but those in `lookers` may look at it (`getView`). It is the exile object's own: a new object after any zone
   * change (CR 400.7), including the one that casting it makes, has none (a card turns face up as it is cast or played, CR 406.3a). Absent otherwise.
   */
  readonly exiledFaceDown?: true;
  /** The players who may look at a card exiled face down (CR 406.3, D-187: "you may look at and play those cards"), until it leaves exile. Absent when no one may. */
  readonly lookers?: readonly SeatId[];
  /**
   * Present on a card in exile that its owner foretold (CR 702.143a, D-128): the number of the turn in which it was
   * exiled face down. It may be cast for its foretell cost in a later turn ("after the current turn has ended"). A
   * foretold card is face down: only its owner may look at it (`getView`). It is the exile object's own: a new
   * object after any zone change (CR 400.7) has none. Absent otherwise.
   */
  readonly foretoldTurn?: number;
  /**
   * Present (true) on a card in exile that resolved as an Adventure (CR 715.3d): its owner may cast
   * the card's normal face from there, but not as an Adventure again. Absent otherwise; it ends
   * with the object (CR 400.7), whatever zone the card goes to next.
   */
  readonly onAdventure?: true;
  /**
   * CR 722.3a (D-214): the permanent has the designation "prepared" (it has a prepare spell and "enters prepared" or an effect gave it). It goes with the permanent: a
   * permanent that leaves the battlefield is a new object and is not prepared (CR 400.7).
   */
  readonly prepared?: true;
  /** CR 722.3c (D-214): on a prepared permanent, the copy of its prepare spell that waits in exile for as long as it stays on the battlefield and prepared. */
  readonly prepareCopy?: ObjectId;
  /**
   * CR 722.3c (D-214): on the copy of a prepare spell in exile, the prepared permanent it was made for. Its controller may cast it (and the permanent loses the
   * designation as it is cast); it exists only while that permanent is on the battlefield and prepared (an exception to CR 704.5e).
   */
  readonly prepareOf?: ObjectId;
  /**
   * Present on a card in exile that resolved as an Adventure its controller did not own (D-187: a card taken from another player's library and
   * cast from exile): that controller, who may cast the card from exile (CR 715.3d: "its controller exiles it. For as long as that card remains
   * exiled, that player may play it"). Absent when the controller owns it, and then its owner may.
   */
  readonly adventureBy?: SeatId;
  /**
   * The timestamp (CR 613.7g) of the last time this permanent transformed, absent if it never did.
   * An ability put on the stack earlier cannot transform it again (CR 701.27f).
   */
  readonly transformedAt?: number;
  /**
   * What the controller chose as this permanent entered the battlefield (CR 614.12; D-100): "As this
   * enters, choose a creature type / a color". Public. It is the new object's own (CR 400.7): gone
   * when the permanent leaves the battlefield, and not copied (CR 707.2). Absent when nothing was chosen.
   */
  readonly chosen?: ChosenValues;
  /**
   * Present (true) on a permanent that chose haste instead of the counter as it entered, for an instance of riot (CR 702.136a, D-185): "If you
   * don't, it gains haste." `derive` gives it haste while this is set (`rules/derive-alt.ts`), so a later "loses all abilities" takes the haste
   * away as it does the haste of a dashed creature. It is the new object's own (CR 400.7) and is not copied (CR 707.2). Absent otherwise.
   */
  readonly riotHaste?: true;
}

/** What made a permanent face down (D-308): only `manifest` is built. The face-down proposal's Morph, Megamorph and Disguise, and cloak, would be more values. */
export type FaceDownBy = 'manifest';

/** The choices made as a permanent entered (D-100). A face asks at most one question, so one field is set. */
export interface ChosenValues {
  /** A creature type of CR 205.3m, spelled as `CREATURE_TYPES` lists it. */
  readonly creatureType?: Subtype;
  readonly color?: Color;
  /** A card type of CR 205.2a that the engine models (`CARD_TYPES`): "choose a card type" (D-376, Serra's Emissary). */
  readonly cardType?: CardType;
  /** A name chosen from a list the card gives (D-151: "choose Khans or Dragons"). */
  readonly option?: string;
}

export interface TokenData {
  readonly characteristics: Characteristics;
  readonly abilities: readonly Ability[];
  /**
   * The card whose prepare spell this token has, when it is a copy of a preparation card or of a token that has one (CR 722.2b: the existence and values of the
   * prepare spell are part of the copiable values, D-225). Absent for every other token.
   */
  readonly prepareOf?: CardId;
}

/** A triggered ability of the AST (CR 603). */
export type TriggeredAbility = Extract<Ability, { kind: 'triggered' }>;

/** An activated ability of the AST (CR 602). */
export type ActivatedAbility = Extract<Ability, { kind: 'activated' }>;

/** The text an ability keeps on the stack (CR 113.7a, 602.2a, 603.3). */
export type StackAbility = TriggeredAbility | ActivatedAbility;

/** The mana spent to cast a spell (D-183): the total and, for each card type, how many of it came from a source with that type. */
export interface ManaSpent {
  readonly total: number;
  readonly fromTypes: Readonly<Record<string, number>>;
  /** How many of them came from a snow source (CR 107.4h, 106.3: "for each {S} spent to cast this spell"); left out when none did. */
  readonly snow?: number;
}

export interface StackData {
  readonly kind: 'spell' | 'ability';
  /**
   * For abilities: the object that is the source (it may have left the battlefield or the hand,
   * CR 113.7a), the index of the ability among its derived abilities, and the ability itself: it
   * exists on the stack independently of its source (CR 113.7a, 602.2a, 603.3) so its text is kept
   * here. Null for spells.
   */
  readonly source: ObjectId | null;
  readonly abilityIndex: number | null;
  readonly ability: StackAbility | null;
  /**
   * Set on an inherent ability of the monarch (CR 725.2, D-127) or of the Ring (CR 701.54c, D-196): it has no source (`source` is null), is
   * shown as "The monarch" or "The Ring" and carries the text of the rule. Absent for every other object.
   */
  readonly inherent?: InherentAbility;
  readonly chosenTargets: readonly ChosenTarget[];
  /**
   * The X announced as the spell was cast or the ability activated (CR 107.3a, 601.2b, D-103), which
   * `Amount` `x` reads and "enters with X counters" reads for the permanent the spell becomes (CR
   * 107.3m). Null when the spell or ability has no X to announce, or it was cast without paying its
   * mana cost (X is 0 then, CR 107.3b); an ability put on the stack by a trigger has none.
   */
  readonly x: number | null;
  /**
   * The modes chosen for a modal spell or ability (CR 700.2, D-114): indices into its `modes`, in printed
   * order (the order they run in). Empty for everything that is not modal.
   */
  readonly chosenModes: readonly number[];
  /** True when cast from the command zone: commander tax was paid (CR 903.8). */
  readonly castFromCommandZone: boolean;
  /** The zone the spell was cast from (CR 601.2a, D-206): "if this spell was cast from a graveyard". Absent for an ability and for a copy. */
  readonly castFrom?: Zone;
  /** True when a kicker cost was paid at least once (CR 702.33d). Always false for an ability. */
  readonly kicked: boolean;
  /**
   * How many times the multikicker cost was paid (CR 702.33c, D-110), at least 1 when present. Absent for
   * a spell that has no multikicker, and for one whose caster paid it no times (`kicked` is false then).
   */
  readonly kicks?: number;
  /**
   * How many times the replicate cost was paid (CR 702.56a, D-129), at least 1 when present. Absent for a spell that has
   * no replicate and for one whose caster paid it no times. A copy of the spell has it too (CR 707.10: the choices
   * made for the spell are copied), which makes no difference to it: only casting triggers Replicate.
   */
  readonly replicated?: number;
  /**
   * The opponent the caster promised a gift to as the spell was cast (CR 702.174a, 702.174k, D-135): "the chosen player". Absent
   * when the spell has no gift or the gift was not promised. A copy of the spell has it too (CR 707.10), which makes no
   * difference to it: the gift happens as the spell resolves, once, for the spell that was cast.
   */
  readonly giftTo?: SeatId;
  /**
   * The option of the face's additional cost choice the caster picked as the spell was cast (`CardFace.additionalCostChoice`, CR 118.8, 601.2b, D-181):
   * 0 the first ("sacrifice an artifact or creature"), 1 the second ("pay {4}"). Absent when the face has no such choice.
   */
  readonly costOption?: 0 | 1;
  /**
   * True when cast from the graveyard by paying its flashback cost (CR 702.34a): the spell is
   * exiled instead of going anywhere else when it leaves the stack. Always false for an ability.
   */
  readonly flashback: boolean;
  /**
   * True when cast without paying its mana cost (CR 118.9, D-095): the `free` alternative cost.
   * Absent otherwise, and for an ability.
   */
  readonly free?: true;
  /**
   * True when the spell was cast as the effect of its suspend ability (CR 702.62a, D-128): if it is a creature spell
   * the permanent it becomes has haste (`GameObject.alt` `suspend`). Absent otherwise, and for an ability.
   */
  readonly suspended?: true;
  /**
   * The mana spent to cast the spell (CR 601.2h, D-183): how many in all, and how many came from a source with each card type (a source with two
   * types counts for each, an artifact creature for artifact and for creature). "The amount of mana spent to cast it" and "for each mana from an
   * artifact source spent to cast it" read it. Mana that paid the activation cost of a mana ability, life paid for Phyrexian mana and what
   * Convoke, Improvise or Delve paid instead of mana are not counted. Written as the cost is paid; absent for a spell that was cast for no mana
   * (cast without paying its mana cost, a cost of {0}) and for a copy of a spell (CR 707.10: a copy is not cast), and for an ability.
   */
  readonly manaSpent?: ManaSpent;
  /**
   * True when mana that carries a haste rider was spent on the spell (D-151: "If that mana is spent on a Dragon creature spell, it gains haste until
   * end of turn"), or when an effect that let the spell be cast says it gains haste until end of turn (Thundermane Dragon): the permanent the spell
   * becomes has haste until the end of that turn. Absent otherwise, and for an ability.
   */
  readonly hasteUntilEnd?: true;
  /**
   * A spell cast from the graveyard with the permission of a permanent (`playFromGraveyardOnceEachTurn`, D-232): that permanent, and what the permanent the spell becomes
   * does or has because of it (enters tapped; gains an ability). Applied as the spell enters the battlefield (`rules/zones.ts`).
   */
  readonly graveyardPlay?: {
    readonly source: ObjectId;
    readonly entersTapped?: true;
    readonly gains?: Ability;
  };
  /**
   * The named alternative cost the spell was cast for (D-121): `overload` (CR 702.96a: its text has
   * "each" where it said "target", so it has no targets). Absent for a spell cast without one, for the
   * `free` and `flashback` alternatives (they have their own fields) and for an ability.
   */
  readonly alt?: NamedAlternativeKind;
  /**
   * True when an effect lets mana of any type be spent to cast this spell (D-351, CR 609.4b: "mana of any type can be spent to cast that spell"): any mana pays any
   * mana symbol of its cost, colored or colorless. A spend restriction of the mana itself and the snow of {S} still apply. Absent otherwise, and for an ability.
   */
  readonly anyManaType?: true;
  /**
   * True when an effect says "If that spell would be put into a graveyard, exile it instead" (D-352, CR 614.1a): when this spell would leave the stack for a graveyard
   * (it resolved, was countered, fizzled) the card is put into exile instead. It belongs to the spell, not to a permanent: it ends when the card becomes another object
   * (CR 400.7). Absent otherwise, and for an ability.
   */
  readonly exileInstead?: true;
  /**
   * "Exile that card instead of putting it into your graveyard as it resolves. If you do, return it to your hand at the beginning of the next end step" (D-439,
   * CR 614.1a, 608.2n, 603.7): set on a spell by the effect `exileOnResolve`. When this instant or sorcery resolves and would be put into its owner's graveyard it is exiled instead, and
   * a delayed triggered ability of `by` (with `source` as its source) returns the card to its owner's hand at the beginning of the next end step. A spell that does not resolve is not
   * changed. It ends when the card becomes another object (CR 400.7). Absent otherwise, and for an ability.
   */
  readonly exileOnResolve?: {
    readonly by: SeatId;
    readonly source: ObjectId;
  };
  /**
   * True when the spell was cast as the effect of a resolving ability allows (CR 608.2g, Cascade, D-120), which
   * lets any card be cast without paying its mana cost, not only a card with that alternative cost of its own.
   * Absent otherwise, and for an ability.
   */
  readonly byEffect?: true;
  /**
   * For a spell that was cast (CR 601.2i, D-129): how many spells had been cast this turn, by every player, before
   * it (CR 702.40a: Storm copies it once for each of them). Fixed as the spell is cast: spells cast in response do
   * not change it. Absent for a copy of a spell (it is not cast) and for an ability.
   */
  readonly spellsCastBefore?: number;
  /**
   * For a triggered ability that reads the object whose event caused it (`triggerSubject`, for
   * example Ward's targeting spell): that object, as the ability was put on the stack. Absent for
   * every other object on the stack.
   */
  readonly triggerSubject?: ObjectId;
  /**
   * For a triggered ability that reads the player its event is about (`triggerPlayer`, D-133) or the damage that caused
   * it (`triggerDamage`): that player and that amount, as the ability was put on the stack. Absent for every other object.
   */
  readonly triggerPlayer?: SeatId;
  readonly triggerDamage?: number;
  /** For a triggered ability that reads `attackersAttackedYou` (D-149): the players its attack event was declared at. */
  readonly triggerAttacked?: readonly SeatId[];
  /**
   * For an activated ability whose cost sacrificed permanents (D-133): the ids they had on the battlefield, which the
   * `sacrificedCost` reference reads (from last-known information: they are gone). Absent for every other object.
   */
  readonly sacrificedAsCost?: readonly ObjectId[];
  /**
   * For an activated ability whose cost exiled cards from the graveyard (`exileFromGraveyard`, D-232): the cards as they are in exile now (new objects, CR 400.7), in the order
   * chosen, which `splitCostExiled` reads. Absent for every other object.
   */
  readonly exiledAsCost?: readonly ObjectId[];
  /**
   * For a reflexive triggered ability (CR 603.12, D-177): the ids of the permanents the resolution that created it had sacrificed, which the
   * `sacrificed` reference reads (from last-known information: they are gone). Absent for every other object.
   */
  readonly sacrificedBefore?: readonly ObjectId[];
  /** For a reflexive ability (D-231): what the resolution that created it had counted (`PendingTrigger.thisWayBefore`). */
  readonly thisWayBefore?: ThisWayCounts;
  /** For a `leftGraveyard` ability (D-232): the cards that left the graveyard, as the objects they are now (`PendingTrigger.cards`). */
  readonly triggerCards?: readonly ObjectId[];
  /**
   * For a chapter ability of a Saga on the stack (CR 714.2): the chapter number that was reached,
   * so "Chapter II" can be shown even for an ability that covers several (CR 714.2c). Absent for
   * every other object on the stack.
   */
  readonly chapter?: number;
}

export type { ChosenTarget } from './chosen';

export interface SeatState {
  readonly id: SeatId;
  readonly life: number;
  readonly poison: number;
  readonly library: readonly ObjectId[];
  readonly hand: readonly ObjectId[];
  readonly graveyard: readonly ObjectId[];
  readonly command: readonly ObjectId[];
  readonly manaPool: readonly ManaObject[];
  readonly landsPlayedThisTurn: number;
  /**
   * How many cards this player has drawn this turn (CR 121.1), whoever's turn it is: reset as each turn
   * begins. A draw replaced by the command zone (CR 903.9b) is not counted. Read by the `drawn` trigger's
   * `nth` (D-111).
   */
  readonly cardsDrawnThisTurn: number;
  /**
   * How much life this player has lost this turn (CR 119.3), whoever's turn it is: combat and other damage,
   * life-loss effects and life paid (CR 119.4). Reset as each turn begins (`rules/flow.ts`). Written only by
   * `loseLifeBy` (`state/ops.ts`); read by Spectacle ("if an opponent lost life this turn", CR 702.137a, D-124).
   */
  readonly lifeLostThisTurn: number;
  /**
   * How many spells this player has cast this turn (CR 601.2i), whoever's turn it is: reset as each turn begins. A
   * copy of a spell is not cast and is not counted (CR 707.10). Storm (CR 702.40a) counts these over all players
   * (D-129).
   */
  readonly spellsCastThisTurn: number;
  /**
   * How many turns this player has had, the current one included when it is theirs (CR 500.1; D-149): raised as each of their
   * turns begins. "During your first, second, or third turns of the game" reads it (`ownTurnNumber`).
   */
  readonly turnsTaken: number;
  /** True once the seat tried to draw from an empty library since SBAs were last checked. */
  readonly drewFromEmptyLibrary: boolean;
  readonly mulligans: number;
  /** Timestamp at which this seat's most recent turn began (CR 302.6). */
  readonly turnStartTimestamp: number;
  /**
   * The value `turnStartTimestamp` had before this seat's current turn began (0 before its first turn). "Since the
   * beginning of your last upkeep" (CR 702.30a, Echo, D-127) is read as "after this timestamp": the upkeep of a
   * turn begins right after the turn does and no one can act in between (CR 502.4).
   */
  readonly previousTurnStartTimestamp: number;
  readonly hasLost: boolean;
  /**
   * The emblem named The Ring (CR 701.54c, D-196): present once the Ring has tempted this player. The emblem is a record of the seat, not an
   * object (nothing else reads an emblem's characteristics and the engine has no emblem objects): `tempted` is how many times the Ring has
   * tempted the player, which turns on its four abilities (`rules/ring.ts`). The emblem stays for the rest of the game (CR 114.1).
   * Absent until the first time.
   */
  readonly ring?: { readonly tempted: number };
  /**
   * The city's blessing (CR 702.131c, D-264): a designation this player has for the rest of the game, set by Ascend (`rules/city-blessing.ts`).
   * Any number of players may have it. Absent until the first time. Public.
   */
  readonly citysBlessing?: true;
  /**
   * The energy counters the player has (CR 107.14, 122.1, D-209), kept for the rest of the game; paid by removing them. Absent until the first time
   * (a player has none). Public.
   */
  readonly energy?: number;
  /** The commander cards chosen for this seat, in order. */
  readonly commanders: readonly CardId[];
  readonly handSizeMax: number | null;
}

export interface TurnState {
  /** 1-based turn counter for the whole game. */
  readonly number: number;
  readonly activeSeat: SeatId;
  readonly phase: PhaseId;
  readonly step: StepId;
  /** Seat that currently holds priority, or null when no one does. */
  readonly prioritySeat: SeatId | null;
  /** Seats that have passed in succession since the last action (CR 117.4). */
  readonly passedInSuccession: readonly SeatId[];
  /** Additional land plays granted this turn by effects (CR 305.2). */
  readonly extraLandDrops: number;
  /**
   * Phases added to this turn that have not begun yet (CR 500.8, D-151, D-187), in the order they will occur. An effect that adds a phase "after this
   * phase" puts it directly after the phase that is going on, so it goes first in this list (CR 500.8: the most recently created one occurs first);
   * when a phase ends, the first of the list begins, and when the list is empty the turn goes on with the phase after the one of its own sequence
   * that the last added phase followed. Absent when none is waiting.
   */
  readonly addedPhases?: readonly AddedPhase[];
  /**
   * Present while an added phase is going on (D-187): the phase of the turn's own sequence it follows. When the added phases end the turn goes on with
   * the phase after that one, and an effect that adds a phase "after this phase" in the added one adds it after the added one.
   */
  readonly addedAfter?: PhaseId;
  /**
   * Present, and `true`, once the active player has drawn a card (or tried to, from an empty library) in the draw step that is going on (D-379, CR 504.1): "except
   * the first one you draw in each of your draw steps" reads it. Every step that begins clears it; a draw that was skipped or replaced is not a draw.
   */
  readonly drewInDrawStep?: true;
}

/**
 * A phase an effect added to the turn (CR 500.8): a combat phase ("there's an additional combat phase after this phase") or a beginning phase
 * ("there is an additional beginning phase after this phase", D-356: untap, upkeep and draw steps, CR 500.1).
 */
export interface AddedPhase {
  readonly phase: 'combat' | 'beginning';
  /** The phase of the turn's own sequence it follows (what `TurnState.addedAfter` becomes as it begins). */
  readonly after: PhaseId;
  /**
   * "At the beginning of that combat, untap all creatures you control" (CR 603.7, D-187): a delayed triggered ability of the player who controlled
   * the effect, created as this phase begins (nothing can happen between the effect and the phase that is not a step of this turn), that triggers as
   * the beginning of combat step of this phase begins and goes on the stack like any other.
   */
  readonly atBeginning?: {
    readonly source: ObjectId;
    readonly controller: SeatId;
    readonly effect: Effect;
  };
}

export type GameResult =
  | { readonly kind: 'win'; readonly winner: SeatId }
  | { readonly kind: 'draw' };

export interface GameSettings {
  readonly freeFirstMulligan: boolean;
  readonly startingLife: number;
  readonly maxHandSize: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  freeFirstMulligan: false,
  startingLife: 40,
  maxHandSize: 7,
};

/**
 * D-279: two cards that were one melded permanent, now two objects in the same zone, whose order a player chooses: their owner for a graveyard or a library
 * (CR 712.21a), the player who exiled the permanent for exile (CR 712.21b).
 * `first` is the object that has the default place (put in the zone first: lower in a graveyard or library, the earlier timestamp in exile).
 */
export interface MeldOrder {
  /** The player who chooses the order and is asked. */
  readonly seat: SeatId;
  readonly first: ObjectId;
  readonly second: ObjectId;
  readonly zone: 'graveyard' | 'library' | 'exile';
}

/** Characteristics of an object immediately before it left its zone (CR 113.7a, 603.10). */
export interface LastKnownInfo {
  readonly object: GameObject;
  /**
   * The object this one became when it moved to another zone, set as it moves (CR 400.7): what "it" means
   * for an ability that looks for the card its source became (Persist's "return it", `thisCard`). It is
   * only a pointer: it names a live object only while that object has not moved again.
   */
  readonly successor?: ObjectId;
  /**
   * D-277 (CR 712.21c): for a melded permanent that left, the object the second card became (`successor` is the first card's). An effect that can find
   * the new object of a melded permanent finds both cards (`rules/melded.ts`, `successorsOf`). Absent for everything else.
   */
  readonly companionSuccessor?: ObjectId;
  readonly characteristics: Characteristics;
  readonly abilities: readonly Ability[];
  readonly power: number | null;
  readonly toughness: number | null;
  /** The base power it had (CR 208.4b, D-431); absent in a record made before it was kept. */
  readonly basePower?: number | null;
}

/**
 * A triggered ability that has triggered and waits to be put on the stack the next time a player
 * would receive priority (CR 603.3). `controller` is who controlled the source when it triggered
 * (CR 603.3a).
 */
/**
 * The inherent triggered abilities that belong to no object: the two of the monarch (CR 725.2, D-127: the end-step draw, and the steal) and the
 * three of the Ring that turn on as it tempts a player more often (CR 701.54c, D-196: the loot when the Ring-bearer attacks, the sacrifice of the
 * creature that blocks it, the life loss when it deals combat damage to a player).
 */
export type InherentAbility =
  | 'monarchDraw'
  | 'monarchSteal'
  | 'ringLoot'
  | 'ringBlocked'
  | 'ringDamage';

export interface PendingTrigger {
  /**
   * The id the source had where it was checked: on the battlefield, or just before it left. Null for an inherent
   * ability that has no source (the monarch's, CR 725.2, D-127), which `inherent` names.
   */
  readonly source: ObjectId | null;
  /** The monarch's inherent triggered abilities (CR 725.2, D-127): the ability has no source and no index. */
  readonly inherent?: InherentAbility;
  readonly controller: SeatId;
  readonly abilityIndex: number;
  readonly ability: TriggeredAbility;
  /** The object whose event caused the trigger, when there is one. */
  readonly subject: ObjectId | null;
  /** The player the event is about (`triggerPlayer`, D-133) and the damage it dealt (`triggerDamage`), when it has them. */
  readonly player?: SeatId;
  readonly damage?: number;
  /** For a reflexive ability (D-177): the permanents the resolution that created it had sacrificed (`StackData.sacrificedBefore`). */
  readonly sacrificedBefore?: readonly ObjectId[];
  /** For a reflexive ability (D-231): what the resolution that created it had counted (`ThisWayCounts`), read by its `thisWay` amounts. */
  readonly thisWayBefore?: ThisWayCounts;
  /** For a `leftGraveyard` trigger (D-232): the cards that left the graveyard in the events that triggered it, as the objects they became. */
  readonly cards?: readonly ObjectId[];
  /** For an `attackBatch` trigger (D-149): the players the creatures declared were attacking, in the order declared (a planeswalker or battle is no player). */
  readonly attacked?: readonly SeatId[];
  /** For a chapter ability (CR 714.2): the chapter number that was reached. Absent otherwise. */
  readonly chapter?: number;
  /**
   * Set while triggers are being put on the stack, on a trigger that came about during that process
   * (a Ward trigger from a trigger's target, CR 601.2c, 603.3d). It waits for the next round
   * (CR 603.3b: "abilities that triggered during this process go on the stack" afterwards), and the
   * flag is cleared when the round ends (`rules/trigger-stack.ts`).
   */
  readonly deferred?: true;
}

/**
 * A delayed triggered ability (CR 603.7): created as a spell resolves, it waits for its trigger event
 * and then triggers once, whatever has become of the permanent or of that permanent's abilities (it is
 * not an ability of `source`, CR 603.7e). `source` is the object it refers to (CR 603.7c: a permanent that
 * changed zones is a new object it no longer names) and `controller` who controlled the spell that
 * created it (CR 603.7d).
 */
export interface DelayedTrigger {
  readonly source: ObjectId;
  readonly controller: SeatId;
  readonly ability: TriggeredAbility;
  /** The object the trigger's `triggerSubject` is, when it is not the one whose event triggers it. */
  readonly subject?: ObjectId;
  /**
   * The player the effect is about, fixed as the ability was created (D-217, CR 603.7c): "Its controller may draw up to two cards at the beginning of the
   * next turn's upkeep" names the player who controlled the countered spell. The effect reads it as `triggerPlayer`.
   */
  readonly player?: SeatId;
  /**
   * "When you next cast an instant or sorcery spell this turn" (D-336, CR 603.7, 514.2): the ability ends, unused, in the cleanup step of the turn it was
   * created in. Absent for the abilities that wait for a step, which may wait for a later turn.
   */
  readonly untilEndOfTurn?: true;
}

/**
 * A card exiled "until this leaves the battlefield" (CR 610.3, `exile.until`, cleanup C): the second one-shot effect that returns it is
 * created immediately after the permanent `source` leaves the battlefield, so it is not a triggered ability and does not use the stack
 * (`rules/exile-return.ts`). It names the card (`card`: the object in exile) and `controller`, who controlled the ability that exiled it.
 */
export interface ExileReturn {
  readonly source: ObjectId;
  readonly card: ObjectId;
  readonly controller: SeatId;
  /**
   * "Until an opponent becomes the monarch" (D-231, CR 610.3): the card is not returned when `source` leaves but when a player other than `controller` becomes the monarch,
   * which sets `released`.
   */
  readonly untilMonarch?: true;
  readonly released?: true;
}

/**
 * Triggered abilities being put on the stack one seat at a time (CR 603.3b, 603.3d). It exists while
 * a triggered ability that needs targets waits for its controller's `targets` decision: `queue`
 * holds that seat's other triggers still to go on the stack, in the order chosen, and `awaiting` is
 * the ability on the stack whose targets are being chosen. After the answer the engine goes on with
 * `queue`, then with the other seats' triggers, then priority. `null` the rest of the time.
 */
export interface TriggeringContext {
  readonly seat: SeatId;
  readonly queue: readonly PendingTrigger[];
  readonly awaiting: ObjectId | null;
}

/**
 * The casting transaction (CR 601.2, SPEC 17.1 A3, D-003). While it exists, the proposed spell is
 * on the stack but not yet cast. `snapshot` is the whole state before the cast began: cancelling,
 * or discovering the cast is illegal (CR 733), restores it.
 */
export interface CastingContext {
  readonly seat: SeatId;
  /** The proposed spell, or the activated ability being activated, on the stack. */
  readonly object: ObjectId;
  /** The card's object before it moved to the stack (valid in `snapshot`); the source of an ability. */
  readonly from: ObjectId;
  readonly fromZone: Zone;
  /**
   * Where the transaction is. A modal spell or ability first asks which modes (`modes`, CR 601.2b, 700.2a,
   * D-114), when there is more than one legal choice. A spell with kicker then asks whether to pay it (`kicker`, CR
   * 601.2b). A spell or ability with an {X} in its cost then asks for X (`x`, CR 601.2b, 602.2b,
   * D-103), before the targets. A spell then pays its total cost (CR 601.2f-h): the mana (`payment`), then what its
   * additional costs ask (D-095), the permanent to sacrifice (`sacrifice`), the cards to discard
   * (`discard`) and the other cards of the graveyard an escape cost exiles (`exile`, D-124). An activation (CR 602.2) pays its non-mana costs as soon as targets are chosen, then
   * asks for mana (`payment`), then for the permanent to sacrifice (`sacrifice`), the cards to
   * discard (`discard`) or the creatures to tap (`crew`, CR 702.122a).
   */
  readonly stage:
    | 'modes'
    | 'kicker'
    | 'x'
    | 'targets'
    | 'payOptions'
    | 'payment'
    | 'sacrifice'
    | 'discard'
    | 'exile'
    | 'crew'
    | 'tap'
    | 'bounce'
    | 'blight';
  /**
   * The spell is being cast only because of its own conditional flash ("You may cast this spell as though it had flash if it targets a commander", D-408,
   * CR 601.3b, 601.3d): its targets are chosen from the objects this filter matches. Absent for every other cast.
   */
  readonly flashTargets?: ObjectFilter;
  /** Mana symbols of the total cost, locked in at CR 601.2f. Empty until the payment stage. */
  readonly totalCost: readonly string[];
  readonly commanderTax: number;
  /**
   * For a spell, what its total cost asks besides mana once the mana is paid (CR 601.2h, D-095): the
   * filter of the permanent to sacrifice and the number of cards to discard. Set when the total
   * cost is locked in (CR 601.2f); absent before, and for an activation.
   */
  readonly extra?: {
    readonly sacrifice: ObjectFilter | null;
    readonly discard: number;
    /** How many other cards of the caster's graveyard to exile (Escape, CR 702.138a, D-124); 0 for none. */
    readonly exile: number;
    /** The untapped permanents to tap as part of the cost (the `tapPermanents` alternative cost, D-149), or null. */
    readonly tap?: { readonly filter: ObjectFilter; readonly count: number } | null;
  };
  /**
   * The cost-payment keywords of the spell (Convoke, Improvise, Delve, D-120) not yet asked about, in order,
   * while the stage is `payOptions`: the one being asked is the pending decision's `mechanism`. Absent
   * when the spell has none or none is left.
   */
  readonly optionsLeft?: readonly ('convoke' | 'improvise' | 'delve')[];
  /**
   * True when the spell is cast as the effect of a resolving ability allows (CR 608.2g, Cascade, D-120): no
   * player receives priority after it is cast, and the resolution goes on (rules/cast.ts `finishCast`).
   */
  readonly duringResolution?: true;
  /**
   * While a cost that returns permanents to their owners' hands is being paid and a commander in it waits for its owner's answer
   * (CR 903.9b, D-139): the permanents still to return, the first being the commander. Absent otherwise.
   */
  readonly bounce?: { readonly queue: readonly ObjectId[] };
  /** Set when this transaction activates an ability (CR 602.2) instead of casting a spell. */
  readonly activation: ActivationContext | null;
  readonly snapshot: GameState;
}

/** The ability being activated (CR 602.2) as the casting transaction needs to remember it. */
export interface ActivationContext {
  /** The object the ability belongs to (valid in the snapshot; it may leave while paying). */
  readonly source: ObjectId;
  readonly abilityIndex: number;
  readonly ability: ActivatedAbility;
  /**
   * The X announced for the ability (CR 602.2b, D-103); 0 until it is, and for an ability with no X in
   * its cost. The same value is `StackData.x` of the ability's object.
   */
  readonly x: number;
}

export type Instruction =
  /** Run one effect node of the resolving spell or ability. */
  | { readonly kind: 'effect'; readonly effect: Effect; readonly as?: SeatId }
  /**
   * One player's "may" of a `playersMay` effect (D-210): `seat` is asked (a `confirmOptional`, answered by that player); when they accept, `effect` runs, as
   * `as` when it is set (that player is "you" in it); when they decline, `otherwise` runs as the controller. `answer` is null until they answer.
   */
  | {
      readonly kind: 'playerMay';
      readonly seat: SeatId;
      readonly effect: Effect;
      readonly as?: SeatId;
      readonly otherwise?: Effect;
      readonly answer: boolean | null;
    }
  /**
   * CR 701.21: sacrifice one permanent (checked against its controller as it runs). Emits
   * `sacrificed` after the zone change.
   */
  | {
      readonly kind: 'sacrifice';
      readonly object: ObjectId;
      readonly seat?: SeatId;
      /** The last-known information of this permanent was recorded as the event of several leaving together began (D-283, `MoveRequest.lkiRecorded`). */
      readonly lkiRecorded?: true;
    }
  /**
   * CR 608.2d: the controller chooses permanents to sacrifice. `chosen` is null until asked (or
   * chosen automatically); then the choice is run as sacrifice instructions.
   */
  | {
      readonly kind: 'chooseSacrifice';
      readonly filter: ObjectFilter;
      readonly count: number;
      /** "Any number of other permanents" (`ChooseSelector.anyNumber`, D-135): none to all of the candidates; `count` is 0. */
      readonly anyNumber?: true;
      /** "One or more" (`ChooseSelector.atLeastOne`, D-187): with `anyNumber`, at least one of the candidates. */
      readonly atLeastOne?: true;
      /** "A creature with the greatest power among creatures they control" (`ChooseSelector.greatest`, D-135). */
      readonly greatest?: 'power' | 'toughness' | 'manaValue';
      readonly chosen: readonly ObjectId[] | null;
      /** The player who sacrifices, when it is not the controller of the effect ("defending player sacrifices"). */
      readonly seat?: SeatId;
      /**
       * "Each player sacrifices a creature" (CR 101.4, cleanup C): the players who choose after `seat`, in APNAP order, and what the earlier
       * ones chose. Nothing is sacrificed until the last has chosen; then every creature chosen is sacrificed at once.
       */
      readonly together?: {
        readonly later: readonly SeatId[];
        readonly held: readonly { readonly seat: SeatId; readonly objects: readonly ObjectId[] }[];
      };
    }
  /**
   * CR 608.2d: an effect that moves a permanent the controller chooses
   * ("return a land you control to its owner's hand"): the controller chooses `count` permanents
   * they control that match `filter`. `chosen` is null until asked (or chosen automatically); then
   * the choice is run as move instructions to `to`. See rules/move-choice.ts.
   */
  /**
   * "You may tap X untapped Myr you control" (`tap` with a `choose` selector, D-139, CR 701.26a): the controller chooses among the
   * untapped permanents they control that match (`anyNumber`: none to all, else exactly `count`, or all of them when no more match)
   * and the chosen are tapped. See rules/tap-choice.ts.
   */
  /**
   * "Reselect which player or permanent target attacking creature is attacking" (`reselectAttack`, D-139, CR 508.7): the controller of
   * the effect chooses `object`'s new attack target with a `chooseOption` decision (`purpose` 'attackTarget'), unless it has no other
   * target. `chosen` is the option answered (see rules/reselect-attack.ts), null until then.
   */
  | {
      readonly kind: 'reselectAttack';
      readonly object: ObjectId;
      readonly chosen: string | null;
    }
  /**
   * "The Ring tempts you" (`ringTempts`, CR 701.54a, D-196): the controller of the effect gets the emblem if they have none (CR 701.54c), the
   * Ring has tempted them one more time, and they choose a creature they control to be their Ring-bearer (a `choosePermanent` decision of
   * purpose 'ringBearer', unless they control no creature or just one). `chosen` is the answer, null until then and until the emblem is
   * given. See rules/ring.ts.
   */
  | {
      readonly kind: 'ringTempts';
      readonly chosen: readonly ObjectId[] | null;
    }
  /**
   * "You may pair this creature with another unpaired creature you control" (`pair`, CR 702.95a, D-286): the effect of the two abilities soulbond stands for.
   * The controller is asked which creature (a `choosePermanent` decision of purpose 'soulbond', `min` 0) while there is one to pair with; `chosen` is the answer,
   * null until then, and an empty answer is a decline. See rules/soulbond.ts.
   */
  | {
      readonly kind: 'pair';
      readonly partner: 'choose' | 'triggerSubject';
      readonly chosen: readonly ObjectId[] | null;
    }
  /**
   * "Empower Jace N" (`empowerJace`, CR 701.71a, D-201): the controller creates a blue Jace planeswalker token if they control none, chooses a Jace
   * planeswalker token they control (a `choosePermanent` decision of purpose 'empowerJace', asked only with two or more) and puts `amount` loyalty
   * counters on it. `chosen` is the answer, null until then. See rules/empower.ts.
   */
  | {
      readonly kind: 'empowerJace';
      readonly amount: number;
      readonly chosen: readonly ObjectId[] | null;
    }
  /**
   * "Amass Zombies N" (`amass`, CR 701.47a, D-367): the controller creates a 0/0 black `subtype` Army creature token if they control no Army creature, chooses an
   * Army creature they control (a `choosePermanent` decision of purpose 'amass', asked only with two or more), puts `amount` +1/+1 counters on it and, if it is not
   * a `subtype`, it becomes one in addition to its other types for good. `chosen` is the answer, null until then. See rules/amass.ts.
   */
  | {
      readonly kind: 'amass';
      readonly subtype: Subtype;
      readonly amount: number;
      /** The token (if one was to be made) has been made: the instruction is at the choice of the Army. */
      readonly made?: true;
      readonly chosen: readonly ObjectId[] | null;
    }
  /**
   * Permanents instructed to connive at the same time (`connive`, CR 701.50c, D-223): `pending` are the ones still to connive, each with the player who
   * controls it (or last controlled it, if it is no longer on the battlefield: CR 701.50b). The first player in APNAP order who controls one or more of them
   * chooses one of them (a `choosePermanent` decision of purpose 'conniveOrder', asked only when that player has more than one) and it connives: its controller
   * draws a card, then discards a card (and a nonland card discarded puts a +1/+1 counter on it if it is still on the battlefield); then this instruction
   * comes again for the rest. `chosen` is the answer, null until then. See rules/connive.ts.
   */
  | {
      readonly kind: 'conniveNext';
      readonly pending: readonly { readonly object: ObjectId; readonly seat: SeatId }[];
      readonly chosen: readonly ObjectId[] | null;
    }
  /**
   * "For each player, you choose from among the permanents that player controls an artifact, a creature, an enchantment, and a planeswalker. Then each player
   * sacrifices all other nonland permanents they control" (D-231, `rules/spare.ts`): `players` are the players, active player first, `types` the card types of the
   * choices; `step` counts the (player, type) choices made, `spared` is what has been chosen, `chosen` the answer to the choice now asked (null until then).
   */
  | {
      readonly kind: 'spare';
      readonly players: readonly SeatId[];
      readonly types: readonly CardType[];
      readonly step: number;
      readonly spared: readonly ObjectId[];
      readonly chosen: readonly ObjectId[] | null;
    }
  /**
   * "Choose a creature card in an opponent's graveyard, then that player chooses a creature card in your graveyard. You may return those cards to the battlefield under their
   * owners' control" (`returnGraveyardPair`, D-272, `rules/graveyard-pair.ts`): `stage` is the step that comes next. `theirs`: the controller chooses a card of `cardType` among the
   * graveyards of their opponents. `mine`: the owner of that card chooses one in the controller's graveyard. `ask`: the controller may return the cards chosen (`answer` is null until
   * they answer; declining drops the instruction). `theirs` and `mine` are the cards chosen so far; `chosen` is the answer to the question being asked, null until then.
   */
  | {
      readonly kind: 'graveyardPair';
      readonly cardType: CardType;
      readonly stage: 'theirs' | 'mine' | 'ask';
      readonly theirs: ObjectId | null;
      readonly mine: ObjectId | null;
      readonly chosen: readonly ObjectId[] | null;
      readonly answer: boolean | null;
    }
  /**
   * "An opponent chooses one of the exiled cards. You put that card on the bottom of your library and return the other to the battlefield tapped" (D-232,
   * `splitCostExiled`): `seat` is the opponent who chooses, `cards` the cards the cost exiled that are still in exile, `chosen` the answer (null until then).
   */
  | {
      readonly kind: 'splitExiled';
      readonly seat: SeatId;
      readonly cards: readonly ObjectId[];
      readonly chosen: readonly ObjectId[] | null;
    }
  /**
   * "..., then you may have this creature become a copy of an artifact or creature card from among those cards" (D-232, `becomeCopyOfCard`): `cards` are the candidates,
   * `objects` the permanents that become the copy; `chosen` is the answer of the controller when there are several (null until then).
   */
  | {
      readonly kind: 'copyFromCards';
      readonly cards: readonly ObjectId[];
      readonly objects: readonly ObjectId[];
      readonly chosen: readonly ObjectId[] | null;
    }
  | {
      readonly kind: 'chooseTap';
      readonly filter: ObjectFilter;
      readonly count: number;
      readonly anyNumber?: true;
      /** "Untap up to three lands" (D-216): the tapped permanents the filter matches, none up to `count`, are untapped instead of tapped. */
      readonly untap?: true;
      readonly chosen: readonly ObjectId[] | null;
    }
  | {
      readonly kind: 'chooseMove';
      readonly filter: ObjectFilter;
      readonly count: number;
      readonly to: 'hand' | 'graveyard' | 'library' | 'battlefield' | 'exile';
      /** The player who chooses among the cards they own (`exileOwnGraveyardCard`, D-231): the controller of the effect when left out. */
      readonly seat?: SeatId;
      /** The nonland cards that really go to exile are counted as `thisWay` `exiledNonland` (D-231). */
      readonly countsNonland?: true;
      readonly position: 'top' | 'bottom' | number;
      /** "You may ..." (`ChooseSelector.optional`, D-139): none up to `count` are chosen. */
      readonly optional?: true;
      /** Moving a card chosen from the hand or the graveyard onto the battlefield (D-139): how it enters. */
      readonly tapped?: boolean;
      readonly controller?: 'owner' | 'you';
      readonly withCounters?: { readonly counter: string; readonly count: number };
      /**
       * "You may put a land card from among them into your hand" (`ChooseSelector.fromMoved`, D-411): the only cards that can be chosen, the new objects the effect
       * before it moved (`ResolutionContext.lastMoved`), when the choice was made; the instruction also starts `performed` again, as a "you may" does (D-135).
       */
      readonly among?: readonly ObjectId[];
      readonly chosen: readonly ObjectId[] | null;
    }
  /**
   * CR 701.23 (Search): `seat` looks through their own library (the controller of the effect, or
   * another player the effect names). `accepted` is null until a "may" search (`search.optional`)
   * has been answered by `seat`, and true for a search that is not optional; a declined search ends
   * here and does nothing, not even the shuffle. `chosen` is null until they have chosen the cards
   * found (a search with no card to find never asks); then the cards are revealed if the effect
   * says so, moved, and `seat`'s library is shuffled if the effect says so.
   */
  | {
      readonly kind: 'search';
      readonly search: Extract<Effect, { kind: 'search' }>;
      readonly seat: SeatId;
      readonly accepted: boolean | null;
      readonly chosen: readonly ObjectId[] | null;
    }
  /**
   * "Look at the top three cards of your library. Put one of them into your hand, put one of them on the bottom of your library, and exile one
   * of them" (`lookAndSplit`, D-216): `toHand` and `toBottom` are the piles once chosen (undefined until then); `chosen` is the answer of the
   * question being asked. See rules/look-split.ts.
   */
  | {
      readonly kind: 'lookSplit';
      readonly seat: SeatId;
      readonly count: number;
      readonly hand: number;
      readonly bottom: number;
      readonly exile: number;
      readonly toHand?: readonly ObjectId[];
      readonly toBottom?: readonly ObjectId[];
      readonly chosen: readonly ObjectId[] | null;
    }
  /**
   * "Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard." (`revealAndSeparate`,
   * D-303, CR 700.3): `seat` is the controller, who receives the piles; `separator` makes them and `chooser` picks which goes where; `cards` are the cards revealed, top first, still
   * in the library. `chosen` is the answer to the question being asked (the cards of pile 1 while the separator is asked); `first` is pile 1 once made; `pick` the pile that was
   * chosen. See rules/pile-separate.ts.
   */
  | {
      readonly kind: 'pileSeparate';
      readonly seat: SeatId;
      readonly separator: SeatId;
      readonly chooser: SeatId;
      readonly cards: readonly ObjectId[];
      readonly chosenTo: 'hand' | 'graveyard';
      readonly otherTo: 'hand' | 'graveyard';
      readonly first?: readonly ObjectId[];
      readonly chosen: readonly ObjectId[] | null;
      readonly pick?: 1 | 2;
    }
  /**
   * "Look at the top six cards of your library. You may reveal an artifact card from among them and put it into your hand. Put the rest
   * on the bottom of your library in a random order" (`lookAtTop`, D-139), in two stages: `take` looks, asks which matching cards to take
   * (`chosen` is null until answered; no question when none matches) and moves them to the hand; `rest` puts `left` (the cards looked at
   * and not taken) where `rest` says. See rules/look-take.ts.
   */
  | {
      readonly kind: 'lookTake';
      readonly stage: 'take' | 'rest';
      readonly seat: SeatId;
      readonly count: number;
      readonly filter: ObjectFilter;
      readonly max: number;
      /** Where the cards taken go (`take.to`, D-145): the hand when left out. */
      readonly to?: 'hand' | 'battlefield' | 'exileFaceDown';
      /** The fewest cards that must be taken when some match (`take.min`, D-145: Hideaway exiles one of them). */
      readonly min?: number;
      readonly tapped?: true;
      /** Only cards with this mana value or less may be taken (`take.manaValueAtMost`, D-145), worked out when the effect started. */
      readonly manaValueAtMost?: number;
      /** The most the mana values of the cards taken may add up to (`take.totalManaValue`, D-230). */
      readonly totalManaValue?: number;
      /** The cards taken are not revealed (`take.hidden`, D-324): "Put two of them into your hand". */
      readonly hidden?: true;
      /** Every card of the top is revealed to everyone (`revealAll`, D-396, CR 701.20a): "Reveal the top five cards of your library". */
      readonly revealAll?: true;
      /** With `revealAll`: the cards have been revealed (the event came out), so the instruction asks the question now (D-396). */
      readonly revealed?: true;
      /** `bottomChosen` (D-324): the rest go on the bottom in the order their owner chooses (an `arrange` instruction of purpose 'bottom'). */
      readonly rest: 'bottomRandom' | 'graveyard' | 'top' | 'bottomChosen';
      readonly chosen: readonly ObjectId[] | null;
      readonly left?: readonly ObjectId[];
    }
  /**
   * "You may pay any amount of {R}. When you do, ..." (`payAnyAmount`, D-151): `amount` is how many times `seat` pays `symbol`, null until they
   * have answered the `chooseX` decision (purpose 'payAnyAmount'). With a positive amount the payment is asked next (`payMana`, as for "you may pay")
   * and then the reflexive ability is created. See rules/pay-amount.ts.
   */
  | {
      readonly kind: 'payAmount';
      readonly seat: SeatId;
      readonly effect: Extract<Effect, { kind: 'payAnyAmount' }>;
      readonly amount: number | null;
    }
  /**
   * "Its controller may draw up to two cards" (`draw` with `upTo`, D-217): `amount` is how many cards `seat` draws, null until they have answered the `chooseX`
   * decision (purpose 'drawUpTo') whose most is `max`. See rules/draw-up-to.ts.
   */
  | {
      readonly kind: 'drawUpTo';
      readonly seat: SeatId;
      readonly max: number;
      readonly amount: number | null;
    }
  /**
   * "Behold a Dragon" (`behold`, CR 701.4, D-151): `seat` chooses a card in their hand or a permanent they control that `filter` matches
   * (a `chooseCards` decision of purpose 'behold'); `chosen` is the answer, null until then. See rules/behold.ts.
   */
  | {
      readonly kind: 'behold';
      readonly seat: SeatId;
      readonly filter: ObjectFilter;
      readonly chosen: readonly ObjectId[] | null;
    }
  /**
   * "Each of those tokens fights a different one of those creatures" (`fight` with `pairing`, D-145, CR 701.14): the controller pairs the
   * creatures in `fighters`, first to last, each with a creature of `pool` no earlier fighter took, asking with a `choosePermanent` decision
   * (purpose 'fight', `subject` the fighter) unless one is left; `chosen` is the answer to the question asked for `fighters[0]`, null until
   * then. When every fighter has a partner (or none is left) the fights are made, in order, from `pairs`. See rules/fight.ts.
   */
  | {
      readonly kind: 'fightPairs';
      readonly fighters: readonly ObjectId[];
      readonly pool: readonly ObjectId[];
      readonly pairs: readonly (readonly [ObjectId, ObjectId])[];
      readonly chosen: readonly ObjectId[] | null;
    }
  /**
   * An Aura card put onto the battlefield by an effect (D-149, CR 303.4f, 303.4g): the player it enters under chooses what it enchants
   * (a `choosePermanent` decision of purpose 'auraHost', `chosen` the answer, null until then), and it then enters attached to it; with
   * no legal object it stays where it is. The other fields are the move's. See rules/aura-entry.ts.
   */
  | {
      readonly kind: 'auraEntry';
      readonly object: ObjectId;
      readonly tapped: boolean;
      readonly controller?: 'owner' | 'you';
      readonly withCounters?: { readonly counter: string; readonly count: number };
      readonly chosen: readonly ObjectId[] | null;
    }
  /**
   * "Proliferate" (`proliferate`, D-149, CR 701.34a): the controller chooses among the permanents that have a counter and the players with
   * poison counters (a `choosePermanent` decision of purpose 'proliferate'); `chosen` is the permanents answered, null until then, and
   * `players` the players. See rules/proliferate.ts.
   */
  | {
      readonly kind: 'proliferate';
      readonly chosen: readonly ObjectId[] | null;
      readonly players: readonly SeatId[];
    }
  /** CR 701.24 (Shuffle): `seat` shuffles their library with the game's random number generator. */
  | {
      readonly kind: 'shuffle';
      readonly seat: SeatId;
      /** Cards of the library left out of the shuffle and kept where they are (CR 701.24b, D-405: the card a search found and is to put on top). */
      readonly keep?: readonly ObjectId[];
    }
  /**
   * CR 701.9 (Discard): `seat` discards `count` cards of their choice (all of their hand if it has
   * fewer). `chosen` is null until they have chosen.
   */
  | {
      readonly kind: 'discard';
      readonly seat: SeatId;
      readonly count: number;
      /** "... unless you discard an artifact card" (`discard.unless`, D-139): one card this filter matches is an answer too. */
      readonly unless?: ObjectFilter;
      /** "Discard any number of cards" (`discard.anyNumber`, D-151): the player chooses none, some or all of the hand. */
      readonly anyNumber?: true;
      /** "Discard a card at random" (`discard.random`, D-209, CR 701.9b): the cards come from the hand as the game's generator picks them. */
      readonly random?: true;
      /** The creature that connives (CR 701.50a, D-209): a nonland card discarded puts a +1/+1 counter on it, if it is still on the battlefield. */
      readonly conniver?: ObjectId;
      readonly chosen: readonly ObjectId[] | null;
    }
  /**
   * CR 701.22 (Scry), 701.25 (Surveil), or "look at the top N cards and put them back in any order":
   * `seat` looks at the top `count` cards of their library (fewer when it holds fewer) and arranges
   * them. `arranged` is null until they have answered the `arrangeCards` decision (nothing is asked
   * for no card, and for one card that can only go back where it is); then the library is reordered
   * and, for a surveil, the cards put into the graveyard are moved. Purpose `bottom` (D-324, CR 401.4:
   * "put the rest on the bottom of your library in any order") arranges `cards`, the cards named by
   * the effect that are still in the library, which go to the bottom in the order chosen (answered in
   * `other`); `count` is how many there are. See rules/arrange.ts.
   */
  | {
      readonly kind: 'arrange';
      readonly purpose: 'scry' | 'surveil' | 'reorder' | 'bottom';
      readonly seat: SeatId;
      readonly count: number;
      readonly cards?: readonly ObjectId[];
      readonly arranged: {
        readonly top: readonly ObjectId[];
        readonly other: readonly ObjectId[];
      } | null;
    }
  /**
   * "Put N cards from your hand on top of your library in any order": `seat` chooses `count` cards
   * of their hand (all of it when it holds fewer). `chosen` is null until they have answered the
   * `chooseCards` decision with purpose 'putOnTop'; the first card chosen ends up on top.
   */
  | {
      readonly kind: 'putOnTop';
      readonly seat: SeatId;
      readonly count: number;
      readonly chosen: readonly ObjectId[] | null;
    }
  /** CR 603.5: an optional ability asks its controller before anything else happens. */
  | { readonly kind: 'confirmOptional'; readonly answer: boolean | null }
  /**
   * CR 614.12, 111.2: one token with `definition` enters under `seat`'s control, and the definition has an
   * "As this enters, choose ..." ability: `chosen` is null until `seat` has answered the `chooseOption`
   * decision, then the token is created with the answer. Made by a `createToken` effect only when the
   * token asks; tokens that ask nothing are created at once (D-100).
   */
  | {
      readonly kind: 'enterToken';
      readonly seat: SeatId;
      readonly definition: TokenDefinition;
      readonly chosen: ChosenValues | null;
      /** The token enters tapped (`createToken.tapped`, D-131). */
      readonly tapped?: true;
      /**
       * The replacement effects of the creation of tokens were applied to the event this token belongs to (D-221, CR 616.1): the effect settled all the tokens it
       * creates at once and `definition` is one of the results, so the token is made as it is. Absent for a token whose event is this one alone (Encore's copy),
       * which is settled as its instruction runs.
       */
      readonly settled?: true;
      /** The creatures its controller chose to sacrifice for devour (CR 702.82a, D-185), null until asked; absent when the definition has no devour. */
      readonly devoured?: readonly ObjectId[] | null;
      /** The answers to the riot questions so far, one for each instance of riot (CR 702.136b, D-185): `counter` or `haste`. */
      readonly riot?: readonly string[];
      /** The card of the hand revealed for the "reveal a card" of a land this token is a copy of (CR 701.20a, D-225), once the player chose among several. */
      readonly revealed?: ObjectId;
      /** The token is a copy made by Encore for this opponent (CR 702.141a, D-185): it is required to attack them, has haste and is sacrificed at the next end step. */
      readonly encoreFor?: SeatId;
    }
  /**
   * "Counter it unless its controller pays [cost]" (CR 702.21a, 701.6) for the spell or ability
   * `object` on the stack. `stage` is 'ask' until its controller has answered the question, then
   * 'discard' while they choose the cards to discard when the cost has a discard (`chooseCards`
   * decision), then 'pay' while they pay the mana (`payMana` decision, same purpose). `purpose` is 'ward' for the
   * triggering spell or ability of a trigger (Ward) and 'counterUnlessPays' for a target spell or
   * ability ("Counter target spell unless its controller pays {3}"); it is the purpose of both
   * questions. See rules/pay-unless.ts.
   */
  | {
      readonly kind: 'counterUnlessPays';
      readonly object: ObjectId;
      readonly cost: readonly Cost[];
      readonly stage: 'ask' | 'discard' | 'pay';
      readonly purpose: 'ward' | 'counterUnlessPays';
    }
  /**
   * "[Do something] unless [a player] pays [cost]" (CR 118.12a, D-111) for the player `seat`: the payer.
   * `stage` is 'ask' until they have answered, then 'discard' while they choose cards for a discard cost,
   * then 'pay' while they pay the mana, as for `counterUnlessPays` (rules/pay-unless.ts; the purpose of
   * both questions is 'unlessPays'). When they decline, cannot pay or back out, `effect` runs (after a
   * `mayEffect` question to the controller when `optional`); when they pay nothing more happens.
   */
  | {
      readonly kind: 'unlessPays';
      readonly seat: SeatId;
      readonly cost: readonly Cost[];
      readonly stage: 'ask' | 'discard' | 'pay';
      readonly effect: Effect;
      readonly optional: boolean;
      /**
       * "You may pay [cost]. If you do, [effect]" (`mayPay`, CR 702.101a, D-120): `seat` is the controller,
       * and `effect` runs when they pay, not when they do not. The purpose of both questions is 'mayPay'.
       */
      readonly ifPaid?: true;
      /** An upkeep keyword's payment (D-127): carried into the decisions it asks (`upkeep`). */
      readonly upkeep?: 'echo' | 'cumulativeUpkeep';
    }
  /**
   * CR 702.85a (Cascade, D-120): the resolution of a cascade ability, in stages. `start` exiles cards from the top of the
   * library of the controller until a nonland card with a lower mana value than the source spell is
   * exiled (`found`; every card exiled is in `exiled`), and goes on to `ask` when that card could be cast, else
   * `bottom`. `ask` asks the controller (`confirmOptional`, purpose 'cascade'); the answer starts the free cast
   * of `found` (CR 608.2g: no player gets priority; the spell goes on the stack and this ability goes on
   * resolving) or goes on to `bottom`, which puts the exiled cards that were not cast on the bottom of the
   * library in a random order (the seeded generator) and ends the ability. See rules/cascade.ts.
   */
  | {
      readonly kind: 'cascade';
      readonly stage: 'start' | 'ask' | 'bottom';
      readonly exiled: readonly ObjectId[];
      readonly found: ObjectId | null;
      /**
       * Discover and its relatives (`exileUntilCast`, CR 701.57, D-151): not a cascade of a spell, so there is no mana value of a source to stay under;
       * `foundAtMost` bounds the card found, `castAtMost` the card that may be cast, `rest` says where the others go, and a card found that is not cast
       * goes into the hand.
       */
      readonly variant?: {
        readonly foundAtMost?: number;
        readonly castAtMost?: number;
        readonly rest: 'bottomRandom' | 'stayExiled';
      };
    }
  /**
   * CR 707.10, 707.10c, 702.40a (D-129): put `count` copies of the spell `spell` (an object on the stack, or its
   * last-known information when it has left) onto the stack, one after the other, under the control of the
   * controller of the resolving spell or ability. `make` creates the next copy, a spell with the original's choices
   * and targets, and goes on at once when `newTargets` is `'no'` or there is nothing to choose; otherwise it goes on to
   * `targets`, which asks the controller for the targets of `copy` (`targets` decision with `forCopy`) and is
   * answered by `rules/copy-spell.ts` `answerCopyTargets`, after which the next copy is made. See rules/copy-spell.ts.
   */
  | {
      readonly kind: 'copySpell';
      readonly spell: ObjectId;
      readonly count: number;
      readonly newTargets: 'may' | 'no';
      readonly stage: 'make' | 'targets' | 'each';
      readonly copy: ObjectId | null;
      /**
       * D-438 (CR 707.10e): "for each other creature you control that the spell could target": the stage `each` finds the permanents this filter names that are a legal target
       * for the spell's targets, and makes a copy for each (`retarget`: the one permanent that copy targets in every instance of the word "target"). `controller` is the player
       * the copies belong to when it is not the controller of the resolving ability ("that player copies that spell").
       */
      readonly forEach?: ObjectFilter;
      readonly controller?: SeatId;
      readonly retarget?: ObjectId;
    }
  /**
   * CR 115.7a, 115.7b (D-181): "Change the target of target spell or ability with a single target." The target of `object`, a spell or ability on
   * the stack with one target, is changed to another legal target for its slot, chosen by the controller of the resolving spell or ability. With
   * no other legal target nothing changes; with one it is taken; with several a `targets` decision (`forChange`) asks. See rules/change-target.ts.
   */
  | { readonly kind: 'changeTarget'; readonly object: ObjectId }
  /**
   * CR 702.62a, 702.35a, 702.94a (Suspend, Madness and Miracle, D-128, D-274): the resolution of `castExiled`. `start` looks at the card the
   * ability belongs to (it must still be that card, in exile, or in its owner's hand for Miracle) and goes on to `ask` when it could be
   * cast, else it ends: a suspended card stays exiled, a card exiled by madness goes to its owner's graveyard, a miracle card stays in the hand. `ask` asks the owner
   * (`confirmOptional`, purpose 'suspend' or 'madness', the card as `subject`); accepting begins the cast as CR
   * 608.2g says (no player gets priority), declining ends the ability the same way as above. See rules/cast-exiled.ts.
   */
  | {
      readonly kind: 'castExiled';
      readonly mode: 'suspend' | 'madness' | 'miracle';
      readonly stage: 'start' | 'ask';
      readonly card: ObjectId | null;
    }
  /**
   * "You may cast target instant or sorcery card from a graveyard" (`castCard`, D-350, CR 608.2g): the resolution of the effect. `start` looks at `card` (the
   * target as it is now: it must still be in a graveyard, CR 608.2b) and goes on to `ask` when it could be cast, else it ends and the card stays where it is. `ask`
   * asks the controller (`confirmOptional`, purpose 'castCard', the card as `subject`); accepting begins the cast as CR 608.2g says (no player gets priority) and the
   * riders the effect carries become part of the spell on the stack (`StackData.anyManaType`, `exileInstead`), declining ends the effect. See rules/cast-card.ts.
   */
  | {
      readonly kind: 'castCard';
      readonly stage: 'start' | 'ask';
      readonly card: ObjectId;
      readonly anyManaType: boolean;
      readonly exileInstead: boolean;
    }
  /**
   * "You may [effect]" inside an effect (D-111): the controller of the resolving spell or ability is asked
   * (`confirmOptional`, no purpose), and `effect` runs when they accept; declining drops only this
   * instruction, not the rest of the ability (unlike the ability-level `confirmOptional`, CR 603.5).
   */
  | { readonly kind: 'mayEffect'; readonly effect: Effect; readonly answer: boolean | null }
  /**
   * "Create a Food token or a Treasure token" (`chooseOne`, D-175, CR 608.2d): the controller chooses one of `options` with a `chooseOption`
   * decision (`purpose` 'effect', the labels as options), then that option's effect runs. `chosen` is the index answered, null until then.
   */
  | {
      readonly kind: 'chooseOne';
      readonly options: readonly InlineChoice[];
      readonly chosen: number | null;
      /** D-229: the player who chooses, when it is not the controller ("Target player adds one mana of any color"). */
      readonly chooser?: SeatId;
    }
  /**
   * "Target creature gains protection from the color of your choice until end of turn" (CR 702.16, 608.2d; D-451): the controller chooses one of the five colors
   * with a `chooseOption` decision (`purpose` 'protectionColor'), then `effect` (a `grantKeyword` whose keyword is `protection` from `colorOfChoice`) runs with
   * that color in its place. `chosen` is the color answered, null until then. Not asked when no permanent is left for the effect to affect (CR 608.2b).
   */
  | {
      readonly kind: 'protectionColor';
      readonly effect: Extract<Effect, { readonly kind: 'grantKeyword' }>;
      readonly chosen: Color | null;
    }
  /**
   * "Starting with you, each player votes for profit or security" (`vote`, CR 701.38a, D-194): `cast` is the votes so far, in the order they were
   * cast. The next voter is the first player still in the game, in turn order from the controller of the effect, who is not in `cast`; a
   * `chooseOption` decision (`purpose` 'vote', the words as options) asks them. When everyone has voted the tally goes to `ResolutionContext.votes`.
   */
  | {
      readonly kind: 'vote';
      readonly options: readonly string[];
      readonly cast: readonly VoteCast[];
    }
  /**
   * CR 702.94a (Miracle, D-274): the player who drew a card with miracle as the first card of their turn is asked whether to reveal it (`confirmOptional`,
   * purpose 'miracleReveal', the card as `subject`); `answer` is theirs, null until asked. Accepting reveals the card (`cardsRevealed`, `miracleRevealed`),
   * whose trigger goes on the stack once the resolution is over. It sits in the queue between the draw of that card and the next draw of the same
   * instruction ("as you draw it"). See rules/miracle.ts.
   */
  | {
      readonly kind: 'miracleReveal';
      readonly seat: SeatId;
      readonly card: ObjectId;
      readonly answer: boolean | null;
    }
  /**
   * CR 121.2: `seat` draws `count` cards, one at a time. `commanderChoice` records the owner's
   * answer to CR 903.9b for the card being drawn (a commander on top of the library) once asked,
   * and is null again for the next card. See rules/draw.ts.
   */
  | {
      readonly kind: 'draw';
      readonly seat: SeatId;
      readonly count: number;
      readonly commanderChoice: boolean | null;
      /** An earlier card of this instruction was already counted for `thisWay` `playersDrew` (D-131). */
      readonly counted?: true;
      /**
       * The next `replacedLeft` draws of this instruction are the ones a `drawInstead` replacement made in place of a draw (D-379, CR 614.5, 614.11a): the
       * effects that made them do not replace them again, and they go before the draws the replaced one was followed by. Absent when none are waiting.
       */
      readonly replacedLeft?: number;
    }
  /** Move one object. `commanderChoice` records the owner's answer to CR 903.9b when asked. */
  | {
      readonly kind: 'move';
      readonly object: ObjectId;
      readonly to: 'hand' | 'graveyard' | 'library' | 'battlefield' | 'exile';
      readonly position: 'top' | 'bottom' | number;
      readonly tapped: boolean;
      readonly commanderChoice: boolean | null;
      /** Enter the battlefield under the owner's control or the resolving ability's controller's. */
      readonly controller?: 'owner' | 'you';
      /** Enters the battlefield with these counters on it (`moveToZone.withCounters`). */
      readonly withCounters?: { readonly counter: string; readonly count: number };
      /** The permanent returns by unearth (CR 702.84a, D-124): it remembers it, and a delayed exile is created. */
      readonly alt?: 'unearth';
      /** A nonland card that goes to exile is counted as `thisWay` `exiledNonland` (D-231, `exileOwnGraveyardCard`). */
      readonly countsNonland?: true;
      /** Creatures destroyed together replace each other's deaths (D-133, `MoveRequest.replacers`). */
      readonly replacers?: readonly ObjectId[];
      /** The last-known information of this permanent was recorded as the event of several leaving together began (D-283, `MoveRequest.lkiRecorded`). */
      readonly lkiRecorded?: true;
      /** The card exiled is remembered by this permanent (`exile.linked`, D-139: "exiled with this creature"). */
      readonly linkTo?: ObjectId;
      /** The Aura enters attached to this permanent (CR 303.4f, `auraEntry`, D-149). */
      readonly attachTo?: ObjectId;
      /** The card exiled is returned to the battlefield when this permanent leaves it (`exile.until`, CR 610.3): an `ExileReturn` is recorded. */
      readonly untilLeaves?: ObjectId;
      /** "Until an opponent becomes the monarch" (D-231, CR 610.3): the permanent whose ability exiled the card; the card comes back when an opponent of its controller becomes the monarch. */
      readonly untilMonarch?: ObjectId;
      /**
       * The card exiled is face down (CR 406.3): with `linkTo`, visible to the controller of `linkTo` (Hideaway, D-145: its `hideaway` is `linkTo`);
       * without, nobody may look at it (D-187: its `exiledFaceDown` is set, and an effect may let a player look).
       */
      readonly faceDown?: true;
      /** The land is played (CR 305.1, 305.2a: it counts as the player's land play), as an effect allows (`castFree` with `play`, D-145). */
      readonly playAsLand?: true;
      /**
       * Enters the battlefield at the same time as the other consecutive moves that carry this flag (CR 603.6a, D-272: "return those cards to the battlefield"): the
       * `zoneChanged` events of the run say `simultaneous`, and `findTriggers` lets each permanent of the run see every other one enter; the replacement effects of a card of the run read the
       * battlefield without the permanents that entered before it in the run (`MoveRequest.alongside`, `rules/enters-run.ts`, CR 614.12).
       */
      readonly together?: true;
    }
  /**
   * "You may cast a spell with mana value 5 or less from your hand without paying its mana cost" (`castFree`, D-145, CR 608.2g): the
   * controller chooses (a `chooseCards` decision, purpose 'cast') among the cards of `objects` they could cast, or play with `play`, and
   * `chosen` is the answer, null until then. A land chosen is played as the instruction runs next; a spell is cast by the answer itself
   * (`rules/cast-free-answer.ts`: the cast begins as the question is answered, no player receives priority, and the resolution goes on
   * after it). See rules/cast-free.ts.
   */
  | {
      readonly kind: 'castFree';
      readonly objects: Extract<Effect, { kind: 'castFree' }>['objects'];
      readonly play: boolean;
      readonly chosen: readonly ObjectId[] | null;
    };

/**
 * A spell or ability that is resolving (CR 608.2). Effects run one instruction at a time so the
 * engine can stop for a decision in the middle and resume from the same place.
 */
export interface ResolutionContext {
  /** The spell or ability on the stack that is resolving. */
  readonly object: ObjectId;
  /**
   * What "this" means: the spell itself, or for an ability the permanent it belongs to, which may
   * no longer exist (its last-known information is used, CR 113.7a, 608.2h).
   */
  readonly source: ObjectId;
  readonly controller: SeatId;
  readonly queue: readonly Instruction[];
  /** Targets that were still legal when resolution began (CR 608.2b). */
  readonly legalTargets: readonly ChosenTarget[];
  /**
   * The answer to the question a permanent asked as it entered the battlefield (CR 614.12: "you may
   * pay 2 life, or it enters tapped"), for the move that asked it; true means paid. Absent or null
   * until answered, and cleared once that move is done.
   */
  readonly entersPaid?: boolean | null;
  /**
   * The answer to the choice a permanent made as it entered the battlefield (CR 614.12a: "As this
   * enters, choose a creature type"), for the move that asked it. Absent until answered, and cleared
   * once that move is done.
   */
  readonly entersChosen?: ChosenValues | null;
  /** The answer to "you may have it become a copy of any creature" (CR 707.9, D-151) for the move that asked it: the permanent copied, or null for none. Cleared once that move is done. */
  readonly entersCopy?: ObjectId | null;
  /**
   * The answer to "you may sacrifice any number of creatures" of devour (CR 702.82a, D-185) for the move that asked it: the creatures to sacrifice,
   * none being an answer. Absent until answered, and cleared once that move is done.
   */
  readonly entersDevour?: readonly ObjectId[];
  /** The answers to the riot questions (CR 702.136a, 702.136b, D-185) of the move that asks them, one for each instance so far: `counter` or `haste`. Cleared once that move is done. */
  readonly entersRiot?: readonly string[];
  /** The card of the hand revealed for "you may reveal a Mountain or Plains card from your hand" (CR 701.20a, D-225), for the move that asked. Absent until answered; cleared once that move is done. */
  readonly entersRevealed?: ObjectId;
  /**
   * The new objects the previous `exile`, `destroy` or `moveToZone` effect of this resolution
   * produced, which the `moved` object reference means (CR 400.7j). Reset when the next such
   * effect starts; absent until one has run.
   */
  readonly lastMoved?: readonly ObjectId[];
  /**
   * What `triggerSubject` means for a triggered ability that reads it: the object whose event
   * caused the trigger (`StackData.triggerSubject`). Absent for everything else.
   */
  readonly triggerSubject?: ObjectId;
  /** What `triggerPlayer` and `triggerDamage` mean for a triggered ability that reads them (D-133): `StackData.triggerPlayer`, `triggerDamage`. */
  readonly triggerPlayer?: SeatId;
  readonly triggerDamage?: number;
  /** What `attackersAttackedYou` reads (D-149): `StackData.triggerAttacked`. */
  readonly triggerAttacked?: readonly SeatId[];
  /** What `sacrificedCost` means (D-133): `StackData.sacrificedAsCost`. */
  readonly costSacrificed?: readonly ObjectId[];
  /** The cards the cost of this activated ability exiled from the graveyard (D-232, `StackData.exiledAsCost`). */
  readonly costExiled?: readonly ObjectId[];
  /** The cards that left the graveyard and triggered this ability (D-232, `StackData.triggerCards`). */
  readonly triggerCards?: readonly ObjectId[];
  /**
   * What `sacrificed` means (D-177): the ids the permanents had when the `sacrifice` instructions of this resolution sacrificed them, in order, or,
   * for a reflexive ability, those of the resolution that created it (`StackData.sacrificedBefore`).
   */
  readonly sacrificed?: readonly ObjectId[];
  /**
   * The total life players have lost to `loseLife` instructions of this resolution so far, which the amount
   * `lifeLostThisWay` reads (CR 702.101a, D-120). Absent until some life was lost.
   */
  readonly lifeLost?: number;
  /** What the earlier instructions of this resolution did, which `thisWay` amounts read (D-131). Absent until one did something. */
  readonly thisWay?: ThisWayCounts;
  /**
   * How much the instructions since the last `may` effect of this resolution actually did (D-135): cards discarded, drawn,
   * milled, permanents sacrificed and objects moved. `didPrevious` ("if you do") and `reflexive` ("when you do") read
   * whether it is more than 0; a `may` effect resets it to 0 as it comes up. Absent until one is counted.
   */
  readonly performed?: number;
  /** The natural result of the latest `rollDie` of this resolution (CR 706.2, D-271), which the condition `dieResult` reads. Absent until a die is rolled. */
  readonly dieResult?: number;
  /**
   * The keys answered so far to the replacement questions (CR 616.1, D-191) of the instruction at the head of the queue, in the order the
   * questions came: the damage it deals is simulated again with them (nothing is dealt until no question is left) and the next question, if
   * any, is asked. Cleared once that instruction is done.
   */
  readonly damageAnswers?: readonly string[];
  // D-221: the same list holds the answers to the questions of the order of the replacement effects of the creation of tokens (CR 616.1) that the
  // instruction at the head asks, with the same replay.
  /**
   * The tally of the latest `vote` of this resolution (CR 701.38a, D-194): for each option, how many players voted for it (an option nobody chose is
   * absent). What the amount `votesFor` reads. Absent until a vote has been completed.
   */
  readonly votes?: Readonly<Record<string, number>>;
}

/**
 * What the instructions of one resolution have done so far, for the `thisWay` amounts (D-131): the permanents sacrificed
 * by `sacrifice` effects, the permanents `destroy` effects destroyed, and the players who drew at least one card in
 * `draw` effects. Each is added to as the instruction runs and never reset within the resolution.
 */
export interface ThisWayCounts {
  readonly sacrificed?: number;
  readonly destroyed?: number;
  /** The nonland cards `exileOwnGraveyardCard` put into exile (D-231). */
  readonly exiledNonland?: number;
  /** The nontoken creatures the controller of the effect controlled that a `destroy` destroyed (D-230). */
  readonly destroyedOwnNontoken?: number;
  readonly playersDrew?: number;
  /** The permanents tapped by `tap` effects, for "the number of Myr tapped this way" (D-139). */
  readonly tapped?: number;
  /** The cards discarded by `discard` effects, for "then draw that many cards" (D-151). */
  readonly discarded?: number;
  /** The total mana value of the cards milled by `mill` effects, for "equal to the total mana value of those cards" (D-210). */
  readonly milledValue?: number;
  /** The creature cards, and the other cards, discarded by `discard` effects (D-210: "if a creature card was discarded this way"). */
  readonly discardedCreature?: number;
  readonly discardedNoncreature?: number;
  /** The instant and sorcery cards discarded by `discard` effects (D-358: "if you discarded an instant or sorcery card this way"). */
  readonly discardedInstantOrSorcery?: number;
  /** The players who discarded a card to a `discard` effect (D-210: "each player who discarded a card this way"), in the order they did. */
  readonly discardedBy?: readonly SeatId[];
}

/** An attacking creature (CR 508.1k). `blocked` stays true even if its blockers leave (CR 509.1h). */
export interface AttackerState {
  readonly object: ObjectId;
  readonly target: AttackTarget;
  readonly blocked: boolean;
  /**
   * For an attacker of a planeswalker or battle (D-200, CR 508.5, 506.4c): the player who was its defending player as it was declared, the controller of
   * the planeswalker or the protector of the battle. The creature may be blocked by that player's creatures, and its target is gone (it is attacking nothing and
   * deals no combat damage) once the permanent leaves, changes controller or protector, or stops being a planeswalker or battle (CR 506.4).
   */
  readonly defender?: SeatId;
  /** The attacked planeswalker or battle was removed from combat (CR 506.4): the creature attacks no player, planeswalker or battle any more (CR 506.4c). */
  readonly targetGone?: true;
}

/**
 * The combat phase in progress (CR 506). Created when attackers are declared and cleared when the
 * combat phase ends. A creature that left the battlefield is no longer in combat (CR 506.4), which
 * is checked against the battlefield rather than by editing these lists.
 */
export interface CombatState {
  readonly attackers: readonly AttackerState[];
  readonly blocks: readonly { readonly blocker: ObjectId; readonly attacker: ObjectId }[];
  /** Creatures that had first strike or double strike as the first damage step began (CR 510.4). */
  readonly firstStrikers: readonly ObjectId[] | null;
}

/**
 * What a continuous effect does to the objects it affects, and so which layer `derive` applies it
 * in (CR 613.1): `setTypes` in layer 4, `setColors` in 5, `loseAllAbilities` and `grantKeyword` in
 * 6, `setPt` in 7b (CR 613.4b), `modifyPt` in 7c (CR 613.4c), and `copy` in layer 1 (CR 613.2a).
 * The numbers of `setPt` and `modifyPt` are what the effect's amounts came to as it resolved (CR 611.2c,
 * 608.2h, D-115): "-X/-X" with X = 2 is stored as -2/-2, and "+1/+1 for each artifact" as the count then.
 */
export type ContinuousChange =
  /**
   * "You may cast target card from your graveyard this turn" (D-135, CR 601.2, 611.2a): `seat` may cast the card the effect's
   * `objects` names from its owner's graveyard until the effect ends with the turn. No layer: read where casting is decided
   * (`rules/legality.ts`, `mayCastFromGraveyard`).
   */
  | {
      readonly kind: 'castPermission';
      readonly seat: SeatId;
      /**
       * "If that spell would be put into your graveyard, exile it instead" (D-359, CR 614.1a): the spell cast with this permission carries `StackData.exileInstead`
       * (`rules/cast.ts`, `beginCast`). Absent when the effect has no such rider.
       */
      readonly exileInstead?: true;
    }
  /**
   * "Gain control of target creature" (`gainControl`, D-189, CR 613.1b): `seat` controls each permanent the effect's `objects` names while the effect
   * lasts. Layer 2: `controllerOf` (`rules/control.ts`) reads it, after the stored controller (the player the permanent entered under, CR 110.2) and
   * before anything else; of several the one with the latest timestamp decides (CR 613.7), and one that ends leaves the others. It never changes the
   * owner (CR 108.3) or a stack object.
   */
  | { readonly kind: 'control'; readonly seat: SeatId }
  /**
   * "You may play that card this turn" (`mayPlay`, D-151, CR 601.2, 305.1, 611.2a): `seat` may cast the card in exile `objects` names, or play it when it
   * is a land, until the effect ends. No layer: read where casting and playing are decided (`rules/legality.ts`, `mayPlayFromExile`).
   */
  | { readonly kind: 'playPermission'; readonly seat: SeatId }
  | { readonly kind: 'modifyPt'; readonly power: number; readonly toughness: number }
  | { readonly kind: 'setPt'; readonly power: number; readonly toughness: number }
  | { readonly kind: 'loseAllAbilities' }
  /**
   * A regeneration shield (CR 701.19a, D-120): no layer, it is read where a permanent would be destroyed
   * (`rules/regenerate.ts`). One shield protects the one permanent in `objects`, once, until end of turn.
   */
  | { readonly kind: 'regenerate' }
  | { readonly kind: 'grantKeyword'; readonly keyword: Keyword }
  /** D-230 (Backup): an ability, granted in layer 6 for the duration of the effect. */
  | { readonly kind: 'grantAbility'; readonly ability: Ability }
  /**
   * "Can't be blocked this turn" and the like (`restrict`, D-094): no layer. It gives the effect's
   * objects a restriction as the rules read it (CR 613.11) and is not an ability, so "loses all
   * abilities" leaves it. `derive` lists it in `restrictions`.
   */
  | { readonly kind: 'restrict'; readonly restriction: Restriction }
  /**
   * "Creatures your opponents control attack each combat if able [and attack a player other than you if able]" (`requireAttack`, CR 508.1d, 611.2c,
   * D-179): no layer and no fixed set (`objects` is empty): the requirement is read where attackers are declared (`rules/combat-legality.ts`), for
   * each creature `filter` matches then, with `controller` as "you". `awayFrom` is the controller of the effect when it also says "attack a player
   * other than you if able".
   */
  | {
      readonly kind: 'requireAttack';
      readonly filter: ObjectFilter;
      readonly controller: SeatId;
      readonly awayFrom?: SeatId;
    }
  /**
   * "Attacks that opponent this turn if able" (`encore`, CR 702.141a, 508.1d, D-185): the objects of the effect must attack the player `seat` when
   * attackers are declared, if they are able to attack that player; a permanent or another player they could attack instead does not satisfy it.
   * A requirement of the rules, not a characteristic: read in `rules/combat-legality.ts`, not in a layer.
   */
  | { readonly kind: 'mustAttackPlayer'; readonly seat: SeatId }
  /** Either list may be absent: the part left out is not changed. See the `setTypes` effect. */
  | {
      readonly kind: 'setTypes';
      readonly types?: readonly CardType[];
      readonly subtypes?: readonly Subtype[];
      /** CR 205.1b: add to the types and subtypes the object has instead of replacing them. */
      readonly additive?: true;
      /** D-229 (CR 205.1a): card types the object loses ("isn't a creature"); the subtypes only they allowed go with them. */
      readonly remove?: readonly CardType[];
    }
  | { readonly kind: 'setColors'; readonly colors: readonly Color[] }
  /**
   * Layer 1 (CR 613.2a): the object becomes a copy: the copiable values (CR 707.2) it was given when
   * the effect began replace its own (CR 707.2b: later changes to the original do not reach it).
   */
  | { readonly kind: 'copy'; readonly values: CopiableValues }
  /**
   * A prevention shield (CR 615): no layer, it is read where damage is dealt (`rules/prevention.ts`).
   * It protects the effect's `objects` and `players`, unless `recipients` widens that. `amount` is
   * what is left of the shield (CR 615.7), or 'all'. A numeric shield protects one recipient: the
   * effect that makes it, one per permanent or player named (CR 615.11), has them in `objects` or
   * `players`, or it protects `recipients`.
   */
  | {
      readonly kind: 'preventDamage';
      readonly scope: 'all' | 'combat' | 'noncombat';
      readonly amount: number | 'all';
      /**
       * Whom else it protects: `any` is every creature, planeswalker, battle and player; `each` is
       * the permanents on the battlefield `filter` matches as damage would be dealt, with `controller`
       * as "you" (CR 611.2c: a prevention effect changes the rules of the game, so what it covers is
       * not fixed when it begins). Absent: only the effect's `objects` and `players`.
       */
      readonly recipients?:
        | { readonly kind: 'any' }
        | { readonly kind: 'each'; readonly filter: ObjectFilter; readonly controller: SeatId };
      /** Only damage dealt by these sources (CR 609.7a); absent: any source. */
      readonly sources?: readonly ObjectId[];
      /**
       * Only damage dealt by a source this filter matches as the damage would be dealt (D-145: "by non-Spider creatures"), with
       * `controller` as "you"; absent: any source. Together with `sources` both must hold (the effect never sets both).
       */
      readonly sourceFilter?: { readonly filter: ObjectFilter; readonly controller: SeatId };
    };

/**
 * The copiable values of an object (CR 707.2): the characteristics and abilities derived from the
 * text printed on it, as modified by copy effects. What a copy takes from the original.
 */
export interface CopiableValues {
  readonly characteristics: Characteristics;
  readonly abilities: readonly Ability[];
}

/**
 * A continuous effect generated by the resolution of a spell or ability (CR 611.2), kept in the game
 * state until it ends. `objects` is the set it affects, fixed when the effect begins (CR 611.2c):
 * an object that left and came back is a new object (CR 400.7) and is not in it. `timestamp` is
 * taken from the state-wide counter when the effect is created (CR 613.7b) and `id` is
 * `ce<timestamp>`; the effects are listed in timestamp order. `rules/derive-layers.ts` applies
 * them layer by layer, and within a layer in timestamp order. The cleanup step removes the
 * `until: 'endOfTurn'` ones (CR 514.2); a `permanent` one lasts for the rest of the game
 * (CR 611.2a, "if no duration is stated").
 */
export interface ContinuousEffect {
  readonly id: string;
  readonly timestamp: number;
  readonly objects: readonly ObjectId[];
  /** The players a prevention shield protects (`change.kind` 'preventDamage'); absent otherwise. */
  readonly players?: readonly SeatId[];
  readonly until: EffectEnd;
  readonly change: ContinuousChange;
}

/**
 * When a continuous effect ends: with the turn (`endOfTurn`, CR 514.2), never (`permanent`, CR 611.2a), at the end of a given turn of a player
 * (`turnEnd`: the cleanup step of the turn in which `seat` has had `turnsTaken` turns, D-151: "until the end of your next turn") or as the end step
 * of such a turn begins (`endStep`: "until your next end step"), or as such a turn begins (`turnStart`: "until your next turn", D-179).
 */
export type EffectEnd =
  | 'endOfTurn'
  | 'permanent'
  | {
      readonly kind: 'turnEnd' | 'endStep' | 'turnStart';
      readonly seat: SeatId;
      readonly turnsTaken: number;
    }
  /**
   * "For as long as you control this" (D-189, CR 611.2b): while `seat` controls the permanent `source` and that object is on the battlefield; it
   * ends, for good, as that stops being so (`rules/control-effects.ts`, `endLostControlEffects`, run with the state-based actions).
   */
  | { readonly kind: 'whileControlling'; readonly seat: SeatId; readonly source: ObjectId }
  /**
   * "For as long as this Saga remains on the battlefield" (D-207, CR 611.2b): while the object `source` is on the battlefield; it ends, for good, as that stops
   * being so (`endLostControlEffects`, with the state-based actions). Whoever controls it does not matter.
   */
  | { readonly kind: 'whileOnBattlefield'; readonly source: ObjectId };

/**
 * What happened this turn that some abilities ask about (D-139), kept for the whole game state and emptied as each turn begins
 * (`rules/flow.ts`): the activated abilities that were activated ("Activate only once each turn", CR 602.5b) and the combat damage dealt to
 * players ("whose controller was dealt combat damage by this creature this turn").
 */
export interface TurnLog {
  /** The permanents whose "once during each of your turns, you may ... from your graveyard" has been used this turn (D-232, `playFromGraveyardOnceEachTurn`). */
  readonly graveyardPlays?: readonly ObjectId[];
  /**
   * Each activated ability activated this turn: the object it belongs to and its index among that object's abilities. `loyalty` is set
   * when the ability was a loyalty ability (D-200): CR 606.3 allows one loyalty ability of a permanent a turn, whichever it is.
   */
  readonly activated: readonly {
    readonly object: ObjectId;
    readonly abilityIndex: number;
    readonly loyalty?: true;
  }[];
  /** Each combat damage event to a player this turn: the source that dealt it and the player dealt it (damage prevented entirely is not here). */
  readonly combatDamaged: readonly { readonly source: ObjectId; readonly player: SeatId }[];
  /** Each time a player gained life this turn (D-149), in order, one entry for each life gain event: "for the first time each turn". */
  readonly lifeGained: readonly SeatId[];
  /** The life each player has gained this turn, by seat (D-252, CR 119.3): the sum of every life gain after replacement, for "if you gained 3 or more life this turn". */
  readonly lifeGainedTotal: readonly number[];
  /** Each triggered ability that has triggered this turn (D-149): "this ability triggers only once each turn" (CR 603.2). */
  readonly triggered: readonly { readonly object: ObjectId; readonly abilityIndex: number }[];
  /**
   * Each triggered ability whose controller has taken the action it represents this turn (D-256): "Do this only once each turn" (CR 603.2h): the
   * source permanent, the ability on it and the player who took the action (the source's controller as the ability resolved).
   */
  readonly actionTaken: readonly {
    readonly object: ObjectId;
    readonly abilityIndex: number;
    readonly seat: SeatId;
  }[];
  /**
   * Each permanent that entered the battlefield this turn (D-151, Celebration: "two or more nonland permanents entered the battlefield under your
   * control this turn"), in order: who controlled it as it entered, its card types as it entered and whether it is a token. It stays when the
   * permanent leaves (CR 400.7: a new object is a new entry).
   */
  readonly entered: readonly {
    /** The permanent itself (D-151, Read ahead: a Saga "the turn it entered the battlefield"). */
    readonly object: ObjectId;
    readonly controller: SeatId;
    readonly types: readonly CardType[];
    readonly token: boolean;
  }[];
  /** The damage each player has been dealt this turn, by seat (D-151, CR 120.3): all damage that was dealt after prevention, combat or not. */
  readonly damageTaken: readonly number[];
  /**
   * Each time a creature was declared as an attacker this turn, by its id (D-151): a creature that attacks in two combat phases appears twice.
   * "Whenever this creature attacks for the first time each turn" reads it.
   */
  readonly attacked: readonly ObjectId[];
  /**
   * Each player a creature was declared as an attacker attacking this turn (D-269, CR 508.6: a player has "attacked [a player]" if they declared
   * creatures as attackers attacking that player), in order: the creature and the player. A creature that attacks a planeswalker or a battle attacks
   * that permanent, not the player who controls or protects it, so it adds no entry; a creature put onto the battlefield attacking was never declared
   * as an attacker (CR 508.4: it is "attacking" but never "attacked"; CR 508.6) and adds none; a reselected attack (CR 508.7a) keeps the entry of the
   * player it was declared attacking and adds none for the new one.
   * "Each player this creature attacked this turn" reads it.
   */
  readonly attackedPlayers: readonly { readonly attacker: ObjectId; readonly player: SeatId }[];
  /**
   * Each card that was put into a graveyard from the battlefield this turn (D-179, CR 700.4: "put there from the battlefield this turn"), by the id it has
   * in the graveyard: a card that moved on from there is a new object (CR 400.7) and is not in it. A token is not (it is not a card).
   */
  readonly graveyarded: readonly ObjectId[];
  /**
   * Each time a card left a graveyard this turn (D-206, CR 400.7), by the seat that owns the card, in order: "if a card left your graveyard this turn".
   * A card that goes from one graveyard to another is not here (it stays in a graveyard: no zone change of that kind is made).
   */
  readonly leftGraveyard: readonly SeatId[];
  /** The modes a triggered ability chose this turn, by the permanent it belongs to (D-151, "choose one that hasn't been chosen this turn"). */
  readonly modesChosen: readonly { readonly source: ObjectId; readonly mode: number }[];
  /**
   * Each spell cast this turn (D-444, CR 601.2i), in order: who cast it and its card types as it was cast. A copy is not cast (CR 707.10) and is not here.
   * "Activate only if you've cast an instant or sorcery spell this turn" reads it.
   */
  readonly castSpells: readonly { readonly seat: SeatId; readonly types: readonly CardType[] }[];
}

export const EMPTY_TURN_LOG: TurnLog = {
  activated: [],
  combatDamaged: [],
  lifeGained: [],
  lifeGainedTotal: [],
  triggered: [],
  actionTaken: [],
  entered: [],
  damageTaken: [],
  attacked: [],
  attackedPlayers: [],
  graveyarded: [],
  leftGraveyard: [],
  modesChosen: [],
  castSpells: [],
};

export interface GameState {
  readonly engineVersion: number;
  readonly settings: GameSettings;
  /** The seed the game started with. With the action log it reproduces the game exactly. */
  readonly seed: number;
  readonly rng: RngState;
  readonly nextObjectNumber: number;
  readonly nextDecisionNumber: number;
  readonly nextTimestamp: number;
  readonly definitions: readonly CardDefinition[];
  readonly cards: Readonly<Record<CardId, CardInstance>>;
  readonly objects: Readonly<Record<ObjectId, GameObject>>;
  readonly seats: readonly SeatState[];
  /**
   * The monarch (CR 725.1, D-127): the player with the designation, or null while no effect has made anyone the
   * monarch (or when the monarch left the game and no player could take over, CR 725.4). One at most (CR 725.3).
   */
  readonly monarch: SeatId | null;
  /**
   * When each player last became the monarch, as a timestamp (CR 610.3b, D-231): "exile ... until an opponent becomes the monarch" does not exile when an opponent became it after the
   * ability triggered. Keyed by the seat; a seat that never became the monarch has no entry. Absent in a game saved before D-231.
   */
  readonly monarchBecameAt?: Readonly<Record<number, number>>;
  /** What has happened this turn that abilities ask about (D-139): see `TurnLog`. */
  readonly turnLog: TurnLog;
  readonly battlefield: readonly ObjectId[];
  /** The permanents that are phased out (D-234, CR 702.26): objects whose `zone` is `'phased'`. Absent in a game saved before D-234. */
  readonly phased?: readonly ObjectId[];
  readonly exile: readonly ObjectId[];
  /** Top of the stack is the last element (CR 405.2). */
  readonly stack: readonly ObjectId[];
  readonly turn: TurnState;
  /** Commander tax counter: times each commander card was cast from the command zone (CR 903.8). */
  readonly commanderCasts: Readonly<Record<CardId, number>>;
  /** Combat damage dealt to each seat by each commander card (CR 903.10a). */
  readonly commanderDamage: Readonly<Record<string, number>>;
  readonly lki: Readonly<Record<ObjectId, LastKnownInfo>>;
  /** Commander objects put into a graveyard or exile since state-based actions were last checked (CR 903.9a). */
  readonly commanderWatch: readonly ObjectId[];
  /**
   * D-279 (CR 712.21a, 712.21b): the pairs of cards a melded permanent became as it left the battlefield for a graveyard, a library or exile, waiting for their
   * owner to order them (the order of two cards in a graveyard or a library, the timestamp order of two exiled cards), asked as state-based actions are
   * next checked. Absent when there are none (so a game without meld hashes as before).
   */
  readonly meldOrders?: readonly MeldOrder[];
  /** Triggered abilities that have triggered and wait to go on the stack (CR 603.3). */
  readonly pendingTriggers: readonly PendingTrigger[];
  /**
   * Delayed triggered abilities created by a spell or ability, waiting for their event (CR 603.7), oldest
   * first. Each triggers once and is removed when it does (D-121: Dash's return to the hand).
   */
  readonly delayedTriggers: readonly DelayedTrigger[];
  /** Cards exiled "until this leaves the battlefield" that wait to return (CR 610.3), oldest first. */
  readonly exileReturns: readonly ExileReturn[];
  /** Continuous effects from resolved spells and abilities, oldest first (CR 611.2, 613.7). */
  readonly continuousEffects: readonly ContinuousEffect[];
  readonly casting: CastingContext | null;
  /** Triggers being put on the stack, paused for a target choice (CR 603.3d); null otherwise. */
  readonly triggering: TriggeringContext | null;
  readonly combat: CombatState | null;
  readonly resolution: ResolutionContext | null;
  /** Number of actions applied so far; the length of the action log. */
  readonly actionCount: number;
  /** The one decision the engine is waiting on (SPEC 17.1 A2), or null when the game is over. */
  readonly pending: PendingDecision | null;
  readonly result: GameResult | null;
}
