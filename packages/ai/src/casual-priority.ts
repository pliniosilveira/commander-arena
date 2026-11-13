/**
 * CasualAgent priority decisions. The engine lists `playLand` and `castSpell` only when they are
 * legal and affordable, so the agent never has to check costs. The casting flow pays with
 * `payAuto`, so manual mana abilities (`activateAbility`) are never needed and never sent, and the
 * agent never concedes. It activates only the abilities `casual-activations.ts` describes. After the
 * hand spells it casts a card from the graveyard with flashback when one is worth casting (step 2b);
 * the kicker question is answered in `casual-permanents.ts` (it pays whenever it is asked).
 *
 * The cost of a spell is what the view shows (`castCost`, with reductions and commander tax), and the
 * additional costs it asks (a sacrifice, a discard, life) must be worth paying (`casual-costs.ts`). A
 * card the engine lets it cast without paying its mana cost ("If you control a commander, you may cast
 * this spell without paying its mana cost") is cast that way: it costs the same additional costs and
 * saves the mana. Among equally valuable spells the cheaper one goes first, and a permanent that
 * makes the others cheaper goes before them.
 *
 * A face-down permanent of its own that would be better face up is turned up with the mana left after the spells (`casual-face-down.ts`).
 *
 * A card with several faces (split, Adventure, double-faced) has one option per face; each option is
 * judged as that face (`asFace`) and the agent plays one face per card (`pickFace`): an Adventure
 * card casts the Adventure first when its text names a target (and a hostile one exists), else the
 * creature, and the creature later from exile; a split or modal card casts the first face it can
 * afford and finds worthwhile. A modal card's land face is played only while the agent has fewer
 * than four lands and has no other land to play.
 */
import type {
  Action,
  GameView,
  NamedAlternativeKind,
  ObjectView,
  PriorityDecision,
} from '@commander-arena/engine';
import { chooseActivation, chooseRegenerateActivation } from './casual-activations';
import { alternativeSpend, chooseNamedAlternative } from './casual-alt-costs';
import { auraHasHost, isAura } from './casual-attachments';
import { copiesTargetSpell, copyWorthCasting, hasStorm } from './casual-copies';
import { additionalCostsWorthPaying, discountsHand, ownGraveyardCreatures } from './casual-costs';
import { chooseTurnFaceUp } from './casual-face-down';
import { isHelpfulSpell } from './casual-helpful';
import { chooseSpecialAction } from './casual-later';
import { hasWorthwhileMode, isModalText } from './casual-modes';
import { grantsLandDrops } from './casual-play-rules';
import { isPreventionSpell, preventionKey, worthCastingPrevention } from './casual-prevention';
import {
  asFace,
  effectiveCost,
  findObject,
  isLand,
  manaValueOf,
  opposingCreatures,
  ownCreatureCount,
} from './casual-view';
import { multikickerHasRoom, needsPaidX, xSpellHasRoom } from './casual-x';

/**
 * What a spell's text says it targets. The targets decision comes only after the cast has started
 * and `cancel` is never used (it can loop), so `worthCasting` decides beforehand whether a hostile
 * target will exist.
 */
const TARGETS_SPELL = /target (activated or triggered ability|(\w+ )?spell)/i;
const TARGETS_CREATURE = /target creature/i;
/** "Return X target creature cards from your graveyard": as many of its own creature cards as X (D-386). */
const RETURNS_X_CREATURE_CARDS = /\bX target creature cards? from your graveyard/i;
const TARGETS_PERMANENT = /target (artifact|enchantment|planeswalker|battle|permanent)/i;

/** Mass removal: only worth it when the opponent loses more creatures than we do. */
const SWEEPER = /destroy all creatures|each creature|all creatures/i;

const isNonPermanentSpell = (o: ObjectView): boolean =>
  o.types.includes('instant') || o.types.includes('sorcery');

/**
 * Whether casting `spell` now is sensible. Permanents (creatures, artifacts, ...) are always cast.
 * An instant or sorcery that needs a hostile target is cast only when one will exist:
 * - text naming a target spell (a counterspell): only when the top object of the stack is the
 *   opponent's, so it cannot be aimed at our own spell;
 * - text naming a target creature (removal, bounce): only when the opponent controls a creature;
 *   other permanent types: when the opponent controls any permanent;
 * - a pump or keyword gain on a target creature (`casual-helpful.ts`): only when we control one.
 * Spells without such a target (burn that may go face, draw, life gain, discard) are cast freely.
 * A board wipe is cast only when the opponent has more creatures than we do.
 * A damage prevention spell (a Fog) is cast only to survive combat damage (`casual-prevention.ts`).
 */
export function worthCasting(view: GameView, spell: ObjectView): boolean {
  // An Aura needs a host on the right side: the cast cannot be cancelled once it has started.
  if (isAura(spell)) return auraHasHost(view, spell);
  if (!isNonPermanentSpell(spell)) return true;
  if (isPreventionSpell(spell)) return worthCastingPrevention(view, spell);
  // A modal spell (D-114): worth casting when some mode is worth choosing now; the other modes' targets
  // do not matter (the engine offers it only when a legal set of modes exists).
  if (isModalText(spell.oracleText)) return hasWorthwhileMode(view, spell.oracleText);
  // D-386: "Return X target creature cards from your graveyard to your hand" has no hostile target: it is worth casting when a creature card of its own graveyard can be returned
  // (what it discards is judged with the additional cost, `additionalCostsWorthPaying`).
  if (RETURNS_X_CREATURE_CARDS.test(spell.oracleText))
    return ownGraveyardCreatures(view).length > 0;
  if (SWEEPER.test(spell.oracleText)) {
    return opposingCreatures(view).length > ownCreatureCount(view);
  }
  // D-129: a spell that copies a spell helps only when the spell on top is one of ours.
  if (copiesTargetSpell(spell.oracleText)) return copyWorthCasting(view);
  if (TARGETS_SPELL.test(spell.oracleText)) {
    const top = view.stack[view.stack.length - 1];
    return top !== undefined && top.controller !== view.viewer;
  }
  // A pump or a keyword gain needs a creature of our own to help, not one of the opponent's.
  if (isHelpfulSpell(spell) && TARGETS_CREATURE.test(spell.oracleText)) {
    return ownCreatureCount(view) > 0;
  }
  if (TARGETS_CREATURE.test(spell.oracleText)) return opposingCreatures(view).length > 0;
  if (TARGETS_PERMANENT.test(spell.oracleText)) {
    return view.battlefield.some((o) => o.controller !== view.viewer);
  }
  return true;
}

/** `worthCasting`, and at most one prevention spell per turn (a second adds nothing). */
function allowed(view: GameView, spell: ObjectView, activations: ReadonlySet<string>): boolean {
  if (isPreventionSpell(spell) && activations.has(preventionKey(view))) return false;
  return additionalCostsWorthPaying(view, spell) && worthCasting(view, spell);
}

/** One way to play a card: the card as the face an option names, and the option's `face`. */
export interface Play {
  readonly obj: ObjectView;
  /** Present exactly when the engine's option carries a face (a card with several to choose from). */
  readonly face: number | undefined;
  /** True for the cast without paying the mana cost (`alternative: 'free'`). */
  readonly free?: true;
  /** The named alternative cost the play pays (Overload, Evoke, Dash, Spectacle: `casual-alt-costs.ts`, D-121, D-124). */
  readonly alt?: NamedAlternativeKind;
}

export const withFace = (face: number | undefined) => (face === undefined ? {} : { face });

/** Whether a land option is the back-face land of a modal double-faced card that is also a spell. */
const isSpellLand = (p: Play): boolean =>
  p.obj.layout === 'modal_dfc' && p.obj.faces?.some((f) => !f.types.includes('land')) === true;

/** Land to play: one that enters untapped if possible (a tapped land wastes this turn's mana). */
export function chooseLand(lands: readonly Play[], draw: (n: number) => number): Play | undefined {
  const untapped = lands.filter((l) => !/enters (the battlefield )?tapped/i.test(l.obj.oracleText));
  const pool = untapped.length > 0 ? untapped : lands;
  if (pool.length === 0) return undefined;
  return pool[draw(pool.length)];
}

/**
 * The lands the agent would play: every land card, and a modal double-faced card's land face too,
 * but only while the agent has fewer than four lands: after that the card is worth more as the
 * spell on its other face, which the spell step may cast. A plain land is always preferred to one.
 */
export function landPlays(view: GameView, d: PriorityDecision): Play[] {
  const plays = d.options.flatMap((o) => {
    const base = o.kind === 'playLand' ? findObject(view, o.object) : undefined;
    return base === undefined
      ? []
      : [
          {
            obj: asFace(base, o.kind === 'playLand' ? o.face : undefined),
            face: o.kind === 'playLand' ? o.face : undefined,
          },
        ];
  });
  const plain = plays.filter((p) => !isSpellLand(p));
  if (plain.length > 0) return plain;
  const lands = view.battlefield.filter((o) => o.controller === view.viewer && isLand(o)).length;
  return lands < 4 ? plays : [];
}

/** CR 715.3: the text of an Adventure names a target (the spell needs one to be worth casting). */
const namesTarget = (o: ObjectView): boolean => /\btarget\b/i.test(o.oracleText);

/**
 * The face to cast of one card, from the faces the engine offers that are worth casting (listed in
 * face order). An Adventure card casts its Adventure first when that names a target (`worthCasting`
 * has checked one exists), else the creature; a split or modal double-faced card casts the first
 * face it can afford and judges worthwhile (the spell step picks among cards by mana value).
 */
function pickFace(faces: readonly Play[]): Play | undefined {
  const [first] = faces;
  if (first === undefined || faces.length === 1) return first;
  if (first.obj.layout === 'adventure') {
    const adventure = faces.find((p) => p.face === 1);
    if (adventure !== undefined && namesTarget(adventure.obj)) return adventure;
    return faces.find((p) => p.face === 0) ?? first;
  }
  return first;
}

/**
 * The casts from hand, command zone or exile (an Adventure) worth making: one play per card. A card
 * with a free option (`alternative: 'free'`, D-095) is cast that way: the same additional costs, no
 * mana; a card that can only be cast free (no mana for the ordinary cast) is still a play.
 */
export function spellPlays(
  view: GameView,
  d: PriorityDecision,
  activations: ReadonlySet<string>,
): Play[] {
  const byCard = new Map<string, Play[]>();
  for (const o of d.options) {
    // A card in the graveyard (flashback, escape) is a play of its own, considered after the hand (below).
    if (o.kind !== 'castSpell' || o.alternative === 'flashback' || o.alternative === 'escape')
      continue;
    const base = findObject(view, o.object);
    if (base === undefined) continue;
    const free = o.alternative === 'free';
    const alt = o.alternative === undefined || free ? undefined : o.alternative;
    const play: Play = {
      obj: asFace(base, o.face),
      face: o.face,
      ...(free ? { free: true } : {}),
      ...(alt === undefined ? {} : { alt }),
    };
    if (!allowed(view, play.obj, activations)) continue;
    // D-103: X is 0 for a spell cast without paying its mana cost or for an alternative cost (CR 107.3b), which makes an
    // instant or sorcery with an {X} worth nothing; and a paid one is cast only with some X to spend. D-237: the same
    // for a creature that enters with X +1/+1 counters and dies on arrival at X = 0 (issue 131).
    if (needsPaidX(play.obj)) {
      if (free || alt !== undefined || !xSpellHasRoom(view, play.obj)) continue;
    }
    // D-110: a Multikicker spell is cast only with mana to kick it at least once.
    if (
      isNonPermanentSpell(play.obj) &&
      !free &&
      alt === undefined &&
      !multikickerHasRoom(view, play.obj, effectiveCost(play.obj))
    ) {
      continue;
    }
    byCard.set(base.id, [...(byCard.get(base.id) ?? []), play]);
  }
  return [...byCard.values()].flatMap((plays) => {
    // One play per face: the free option replaces the ordinary one of the same face, and a named alternative
    // cost (D-121) replaces it when `chooseNamedAlternative` wants it.
    const perFace = new Map<number | undefined, Play>();
    const named = new Map<number | undefined, Map<NamedAlternativeKind, Play>>();
    for (const p of plays) {
      if (p.alt !== undefined) {
        const forFace = named.get(p.face) ?? new Map<NamedAlternativeKind, Play>();
        forFace.set(p.alt, p);
        named.set(p.face, forFace);
        continue;
      }
      const have = perFace.get(p.face);
      if (have === undefined || p.free === true) perFace.set(p.face, p);
    }
    for (const [face, offered] of named) {
      const ordinary = perFace.get(face);
      const first = offered.values().next().value as Play | undefined;
      if (first === undefined) continue;
      const kind = chooseNamedAlternative(
        view,
        first.obj,
        new Set(offered.keys()),
        ordinary !== undefined,
      );
      const chosen = kind === undefined ? undefined : offered.get(kind);
      if (chosen !== undefined) perFace.set(face, chosen);
    }
    return pickFace([...perFace.values()]) ?? [];
  });
}

/** The cost a play spends: nothing for a free cast, the alternative cost it pays, else what the view says it costs now. */
export const spendOf = (p: Play): number =>
  p.free === true ? 0 : p.alt === undefined ? effectiveCost(p.obj) : alternativeSpend(p.obj, p.alt);

export function choosePriorityAction(
  view: GameView,
  d: PriorityDecision,
  draw: (n: number) => number,
  activations: Set<string> = new Set(),
): Action {
  // 0. A creature of ours about to die that can regenerate does so first, with the mana that is there.
  const saving = chooseRegenerateActivation(view, d, activations);
  if (saving !== null) return saving;

  // 1. A land, if one is playable.
  const land = chooseLand(landPlays(view, d), draw);
  if (land !== undefined) return { kind: 'playLand', object: land.obj.id, ...withFace(land.face) };

  // 2. The most expensive worthwhile spell from hand, command zone or exile (ties by PRNG). A cast
  // with an alternative cost (flashback) is a different play and is considered below. A card with
  // several faces is one play: see `pickFace`.
  const spells = spellPlays(view, d, activations);
  if (spells.length > 0) {
    // A permanent that makes the hand cheaper goes first; then the most valuable spell (printed mana
    // value), and among equals the one that costs least now, so reductions are counted.
    const reducers = spells.filter(
      (s) => discountsHand(view, s.obj) || grantsLandDrops(view, s.obj),
    );
    const earlier = reducers.length > 0 ? reducers : spells;
    // D-129 (CR 702.40a): a Storm spell is cast late in the turn, after every other spell worth casting: it copies
    // itself once for each spell cast before it.
    const others = earlier.filter((s) => !hasStorm(s.obj));
    const pool = others.length > 0 ? others : earlier;
    const best = Math.max(...pool.map((s) => manaValueOf(s.obj)));
    const valued = pool.filter((s) => manaValueOf(s.obj) === best);
    const cheapest = Math.min(...valued.map(spendOf));
    const top = valued.filter((s) => spendOf(s) === cheapest);
    const chosen = top[draw(top.length)];
    if (chosen !== undefined) {
      if (isPreventionSpell(chosen.obj)) activations.add(preventionKey(view));
      return {
        kind: 'castSpell',
        object: chosen.obj.id,
        ...(chosen.free === true ? { alternative: 'free' as const } : {}),
        ...(chosen.alt === undefined ? {} : { alternative: chosen.alt }),
        ...withFace(chosen.face),
      };
    }
  }

  // 2b. Flashback (CR 702.34a): only once no worthwhile spell is left to cast from the hand, so a
  // card in the graveyard never takes the mana a better hand cast needs. The most expensive
  // worthwhile one by printed mana value (the flashback cost itself is not shown on a view); ties
  // by PRNG. The engine lists the option only when the cost can be paid.
  const flashbacks = d.options.flatMap((o) => {
    const obj =
      o.kind === 'castSpell' && o.alternative === 'flashback'
        ? findObject(view, o.object)
        : undefined;
    return obj !== undefined && allowed(view, obj, activations) ? [obj] : [];
  });
  if (flashbacks.length > 0) {
    const best = Math.max(...flashbacks.map(manaValueOf));
    const top = flashbacks.filter((s) => manaValueOf(s) === best);
    const chosen = top[draw(top.length)];
    if (chosen !== undefined) {
      if (isPreventionSpell(chosen)) activations.add(preventionKey(view));
      return { kind: 'castSpell', object: chosen.id, alternative: 'flashback' };
    }
  }

  // 2c. Escape (CR 702.138a, D-124): like flashback, only once no worthwhile spell is left to cast from the hand.
  // The most valuable worthwhile card by printed mana value; ties by PRNG. The engine lists the option only when
  // the escape cost and the other cards to exile are there; which cards go is answered by `chooseEscapeExile`.
  const escapes = d.options.flatMap((o) => {
    const obj =
      o.kind === 'castSpell' && o.alternative === 'escape' ? findObject(view, o.object) : undefined;
    return obj !== undefined && allowed(view, obj, activations) ? [obj] : [];
  });
  if (escapes.length > 0) {
    const best = Math.max(...escapes.map(manaValueOf));
    const top = escapes.filter((s) => manaValueOf(s) === best);
    const chosen = top[draw(top.length)];
    if (chosen !== undefined)
      return { kind: 'castSpell', object: chosen.id, alternative: 'escape' };
  }

  // 2d. The special actions of Suspend and Foretell (D-128, `casual-later.ts`): once nothing worth casting is left.
  const special = chooseSpecialAction(view, d, worthCasting);
  if (special !== null) return special;

  // 2e. A face-down permanent of ours that is worth turning face up (D-313, `casual-face-down.ts`): with the mana left after the spells.
  const faceUp = chooseTurnFaceUp(view, d);
  if (faceUp !== null) return faceUp;

  // 3. A land to cycle, or a pump that changes the combat (see casual-activations.ts).
  const activation = chooseActivation(view, d, activations);
  if (activation !== null) return activation;

  // 4. Pass. Never activateAbility, never concede.
  return { kind: 'pass' };
}
