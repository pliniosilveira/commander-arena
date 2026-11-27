/**
 * Structural invariants of a GameState, for property tests and the soak test (SPEC 12). Returns a
 * list of violations; an empty list means the state is consistent. Not used by the engine itself.
 */

import { CARD_TYPES, COLORS } from './characteristics';
import { CREATURE_TYPES } from './data/creature-types';
import { PLANESWALKER_TYPES } from './data/planeswalker-types';
import type { ObjectId } from './ids';
import {
  buybackCostOf,
  flashbackCostOf,
  kickerLikeCostOf,
  manaCostAsFlashbackCost,
  multikickerCostOf,
  replicateCostOf,
} from './rules/alt-costs';
import { derive } from './rules/derive';
import { entersChoice, entersOptions } from './rules/enters';
import { faceOf } from './rules/legality';
import { cardsOf, isCommanderCardId, meldCardsIssue } from './rules/melded';
import { modalOfObject } from './rules/modes';
import { linkedPartnerOf } from './rules/pairing';
import { abilityXCost, hasX, NO_X, spellXCost } from './rules/x-value';
import { printedCard } from './state/ops';
import type { GameState } from './state/types';

export function checkInvariants(state: GameState): string[] {
  const problems: string[] = [];
  const seen = new Map<ObjectId, string>();
  const note = (id: ObjectId, where: string) => {
    const prev = seen.get(id);
    if (prev !== undefined) problems.push(`${id} is in two zone lists: ${prev} and ${where}`);
    else seen.set(id, where);
    const obj = state.objects[id];
    if (!obj) problems.push(`${id} is listed in ${where} but is not an object`);
  };
  // CR 726.3, 726.4: the initiative is a seat of the game, and while the game goes on one still in it.
  if (state.initiative !== undefined && state.initiative !== null) {
    const holder = state.seats[state.initiative];
    if (holder === undefined)
      problems.push(`the initiative is held by seat ${state.initiative}, which does not exist`);
    else if (holder.hasLost && state.result === null)
      problems.push('the player with the initiative has left the game');
  }
  // CR 725.3, 725.4 (D-127): the monarch is a seat of the game, and while the game goes on one still in it.
  if (state.monarch !== null) {
    const monarch = state.seats[state.monarch];
    if (monarch === undefined)
      problems.push(`the monarch is seat ${state.monarch}, which does not exist`);
    else if (monarch.hasLost && state.result === null)
      problems.push('the monarch has left the game');
  }
  // CR 701.54a, 701.54c, 400.7 (D-196): a Ring-bearer is a permanent of a player the Ring has tempted, and a player has one at most.
  const bearers = new Map<number, string>();
  for (const obj of Object.values(state.objects)) {
    if (obj.ringBearer === undefined) continue;
    if (obj.zone !== 'battlefield')
      problems.push(`${obj.id} is a Ring-bearer but is in ${obj.zone}`);
    if (state.seats[obj.ringBearer]?.ring === undefined) {
      problems.push(
        `${obj.id} is the Ring-bearer of seat ${obj.ringBearer}, whom the Ring never tempted`,
      );
    }
    const other = bearers.get(obj.ringBearer);
    if (other !== undefined) {
      problems.push(`${other} and ${obj.id} are both the Ring-bearer of seat ${obj.ringBearer}`);
    }
    bearers.set(obj.ringBearer, obj.id);
  }
  // CR 702.95b, 702.95d, 702.95e, 400.7 (D-285): a pairing is a link of two creatures from both sides, formed by one player; both are permanents in play
  // (on the battlefield or phased out, CR 702.26d). A link whose partner has left, changed hands or stopped being a creature is cleared by the state-based
  // actions, which have run whenever a player has priority, and is read as no pair meanwhile (`rules/pairing.ts`): so that the pair still stands is asked only
  // while a player has priority (a resolution that destroys a creature or takes it can leave a stale link until it ends).
  const priority = state.pending?.kind === 'priority';
  for (const obj of Object.values(state.objects)) {
    const link = obj.paired;
    if (link === undefined) continue;
    if (obj.zone !== 'battlefield' && obj.zone !== 'phased')
      problems.push(`${obj.id} is paired but is in ${obj.zone}`);
    if (link.with === obj.id) problems.push(`${obj.id} is paired with itself`);
    if (state.seats[link.by] === undefined)
      problems.push(`${obj.id} is paired by seat ${link.by}, which does not exist`);
    const other = state.objects[link.with];
    if (other === undefined) {
      if (priority) problems.push(`${obj.id} is paired with ${link.with}, which does not exist`);
      continue;
    }
    if (other.paired?.with !== obj.id) {
      if (priority)
        problems.push(`${obj.id} is paired with ${other.id}, which is not paired with it`);
    } else if (other.paired.by !== link.by) {
      problems.push(`${obj.id} and ${other.id} are paired by different players`);
    } else if (priority && linkedPartnerOf(state, obj) === null) {
      problems.push(
        `${obj.id} and ${other.id} are paired but not both controlled by seat ${link.by}`,
      );
    } else if (priority && obj.zone === 'battlefield') {
      for (const o of [obj, other]) {
        if (o.zone === 'battlefield' && !derive(state, o).types.includes('creature'))
          problems.push(`${o.id} is paired but is not a creature`);
      }
    }
  }
  for (const s of state.seats) {
    for (const zone of ['library', 'hand', 'graveyard', 'command'] as const) {
      for (const id of s[zone]) {
        note(id, `seat${s.id}.${zone}`);
        const obj = state.objects[id];
        if (obj && (obj.zone !== zone || obj.zoneOwner !== s.id)) {
          problems.push(`${id} says ${obj.zone}/${obj.zoneOwner} but is in seat${s.id}.${zone}`);
        }
      }
    }
  }
  for (const [list, name] of [
    [state.battlefield, 'battlefield'],
    [state.exile, 'exile'],
    [state.stack, 'stack'],
    // D-234 (CR 702.26): the permanents that are phased out.
    [state.phased ?? [], 'phased'],
  ] as const) {
    for (const id of list) {
      note(id, name);
      const obj = state.objects[id];
      if (obj && obj.zone !== name) problems.push(`${id} says ${obj.zone} but is in ${name}`);
    }
  }
  for (const [id, obj] of Object.entries(state.objects)) {
    if (!seen.has(id as ObjectId)) problems.push(`${id} is an object in no zone list`);
    if (obj.damage < 0) problems.push(`${id} has negative damage`);
    // CR 400.7, 301.5, 303.4: only a permanent is attached to anything, and never to itself.
    if (obj.attachedTo !== null) {
      // CR 702.26g (D-234): an Aura, Equipment or Fortification that phased out with what it is attached to stays attached to it.
      if (obj.zone !== 'battlefield' && obj.zone !== 'phased')
        problems.push(`${id} is attached but is not on the battlefield`);
      if (obj.attachedTo === obj.id) problems.push(`${id} is attached to itself`);
    }
    // CR 303.4, 303.4d (D-629): an Aura that enchants a player is on the battlefield (or phased out), enchants a seat of the game, and is attached to no object.
    if (obj.attachedToPlayer !== undefined) {
      if (obj.zone !== 'battlefield' && obj.zone !== 'phased')
        problems.push(`${id} enchants a player but is not on the battlefield`);
      if (state.seats[obj.attachedToPlayer] === undefined)
        problems.push(`${id} enchants a player who is not in the game`);
      if (obj.attachedTo !== null) problems.push(`${id} is attached to an object and a player`);
    }
    for (const [counter, n] of Object.entries(obj.counters)) {
      if (n < 0) problems.push(`${id} has a negative ${counter} counter count`);
    }
    // CR 702.33d, 702.34a: only a card with the keyword can have been kicked or cast with
    // flashback, a spell on the stack carries the fact and a permanent keeps `kicked`.
    const face = faceOf(state, obj);
    if (
      obj.stack?.kicked === true &&
      (obj.stack.kind !== 'spell' || kickerLikeCostOf(face) === null)
    ) {
      problems.push(`${id} is kicked but is not a spell with kicker`);
    }
    // CR 702.33c (D-110): a count of kicks belongs to a kicked spell with multikicker, and a kicked spell
    // that has a count has at least one.
    if (obj.stack?.kicks !== undefined) {
      const kicks = obj.stack.kicks;
      if (
        !Number.isSafeInteger(kicks) ||
        kicks < 1 ||
        obj.stack.kicked !== true ||
        obj.stack.kind !== 'spell' ||
        multikickerCostOf(face) === null
      ) {
        problems.push(`${id} has ${kicks} kicks that it cannot have`);
      }
    }
    // CR 601.2h (D-183): the mana spent to cast a spell belongs to a spell, is at least 1 when present, and no card type has more of it than there is.
    if (obj.stack?.manaSpent !== undefined) {
      const { total, fromTypes, fromSubtypes, snow } = obj.stack.manaSpent;
      if (
        obj.stack.kind !== 'spell' ||
        !Number.isSafeInteger(total) ||
        total < 1 ||
        Object.values(fromTypes).some((n) => !Number.isSafeInteger(n) || n < 1 || n > total) ||
        Object.values(fromSubtypes ?? {}).some(
          (n) => !Number.isSafeInteger(n) || n < 1 || n > total,
        ) ||
        (snow !== undefined && (!Number.isSafeInteger(snow) || snow < 1 || snow > total))
      ) {
        problems.push(`${id} has mana spent that it cannot have`);
      }
    }
    // CR 702.56a (D-129): a count of replicate payments belongs to a spell that has a replicate cost, and is at least 1 when
    // present. The face prints it or an effect gave it as the spell was cast (the permanent may have left since, CR 113.7a), and a given cost is a mana cost.
    if (obj.stack?.replicated !== undefined) {
      const n = obj.stack.replicated;
      if (
        !Number.isSafeInteger(n) ||
        n < 1 ||
        obj.stack.kind !== 'spell' ||
        (replicateCostOf(face) === null && (face?.manaCost ?? null) === null)
      ) {
        problems.push(`${id} was replicated ${n} times, which it cannot be`);
      }
    }
    // CR 702.27a (Galadriel group 3): a spell was bought back only if it is a spell whose face has a buyback cost.
    if (
      obj.stack?.boughtBack === true &&
      (obj.stack.kind !== 'spell' || buybackCostOf(face) === null)
    ) {
      problems.push(`${id} was bought back but is not a spell with buyback`);
    }
    // CR 107.3a (D-103): an X was announced only for a spell or activated ability on the stack that
    // has an {X} or "pay X life" to announce (a spell cast without paying its mana cost has none, CR
    // 107.3b), and is a whole number.
    if (obj.stack?.x != null) {
      const x = obj.stack.x;
      const announced =
        obj.stack.kind === 'spell'
          ? spellXCost(
              face,
              obj.stack.flashback ? 'flashback' : obj.stack.free ? 'free' : undefined,
              obj.stack.kicked === true,
            )
          : obj.stack.ability?.kind === 'activated'
            ? abilityXCost(obj.stack.ability.cost)
            : NO_X;
      if (obj.zone !== 'stack' || !Number.isSafeInteger(x) || x < 0 || !hasX(announced)) {
        problems.push(`${id} has an announced X of ${x} that it cannot have`);
      }
    }
    // CR 700.2, 700.2d (D-114, D-344): the modes chosen for a spell or ability on the stack are distinct (a mode only a repeatable
    // choice may repeat), in printed order and within the number its text lets the controller choose; a modal one that is on the stack for good
    // (not being cast, activated or put on the stack) has them chosen, and nothing else has any.
    const modal = obj.zone === 'stack' ? modalOfObject(obj, face?.spell) : null;
    const modes = obj.stack?.chosenModes ?? [];
    if (modes.length > 0 || modal !== null) {
      const choosing = state.casting?.object === id || state.triggering?.awaiting === id;
      const limit = Math.max(modal?.choose.max ?? 0, modal?.choose.maxIf?.max ?? 0);
      const repeats = modal?.choose.repeatable === true;
      const inRange = modes.every(
        (m, i) =>
          Number.isInteger(m) &&
          m >= 0 &&
          m < (modal?.modes.length ?? 0) &&
          (i === 0 || (repeats ? (modes[i - 1] ?? 0) <= m : (modes[i - 1] ?? 0) < m)),
      );
      const counted =
        modal !== null &&
        modes.length <= limit &&
        (choosing ? true : modes.length >= modal.choose.min);
      if (modal === null || !inRange || !counted) {
        problems.push(`${id} has chosen modes [${modes.join(', ')}] that it cannot have`);
      }
    }
    // CR 707.10 (D-129): a copy of a spell is a spell on the stack with no card of its own, whose face is the one it
    // copies; it is nothing else, and is not a token until it becomes one (CR 707.10f).
    if (obj.copyOf !== undefined) {
      if (
        obj.card !== null ||
        obj.token !== null ||
        // CR 722.3c (D-214): the copy of a prepare spell waits in exile, made for a prepared permanent. D-654 (CR 707.12): the copy of a card waits in exile, made by the effect that is
        // resolving, for as long as that resolution lasts.
        (obj.prepareOf === undefined && obj.cardCopy !== true
          ? obj.zone !== 'stack' || obj.stack?.kind !== 'spell'
          : obj.zone !== 'exile' || obj.stack !== null) ||
        state.cards[obj.copyOf] === undefined
      ) {
        problems.push(`${id} is a copy of a spell but is not a spell on the stack with no card`);
      }
    }
    // CR 708.2, 708.6 (D-308): a face-down object is a card on the battlefield (or phased out), and its label is its own among the face-down permanents.
    if (obj.faceDown !== undefined) {
      // CR 708.4: a card cast face down is a face-down spell on the stack until it resolves.
      const downSpell = obj.zone === 'stack' && obj.faceDown.by === 'morph';
      if (obj.zone !== 'battlefield' && obj.zone !== 'phased' && !downSpell) {
        problems.push(`${id} is face down but is in ${obj.zone}`);
      }
      if (obj.card === null || obj.token !== null) {
        problems.push(`${id} is face down but is not a card`);
      }
      if (!(obj.faceDown.n >= 1))
        problems.push(`${id} is face down with the label ${obj.faceDown.n}`);
      const same = [...state.battlefield, ...(state.phased ?? [])].filter(
        (other) => other !== id && state.objects[other]?.faceDown?.n === obj.faceDown?.n,
      );
      if (same.length > 0) problems.push(`${id} is face down with the label of ${same.join(', ')}`);
    }
    // A permanent that transformed after entering kicked may show a face without the keyword.
    // A copy of a spell shows the face it copies (D-129).
    const card = printedCard(obj);
    const faces =
      card === null ? [] : (state.definitions[state.cards[card]?.definition ?? -1]?.faces ?? []);
    // The token a copy of a kicked permanent spell became (CR 707.10f) has the kicker keyword among its abilities.
    const tokenKicker =
      obj.token?.abilities.some(
        (a) =>
          a.kind === 'keyword' && (a.keyword.kind === 'kicker' || a.keyword.kind === 'multikicker'),
      ) === true;
    if (
      obj.kicked === true &&
      ((obj.zone !== 'battlefield' && obj.zone !== 'phased') ||
        !(faces.some((f) => kickerLikeCostOf(f) !== null) || tokenKicker))
    ) {
      problems.push(`${id} remembers being kicked but is not a permanent with kicker`);
    }
    // D-110: a permanent that remembers a count of kicks remembers being kicked, and the count is at least 1.
    if (obj.kicks !== undefined && (obj.kicked !== true || !(obj.kicks >= 1))) {
      problems.push(`${id} remembers ${obj.kicks} kicks without having been kicked`);
    }
    // CR 107.3m (Hylda group 3): the X of the spell a permanent came from is remembered by a permanent only (on the battlefield or phased out, CR 702.26b), and only when it was at least 1.
    if (
      obj.castX !== undefined &&
      ((obj.zone !== 'battlefield' && obj.zone !== 'phased') ||
        !Number.isSafeInteger(obj.castX) ||
        obj.castX < 1)
    ) {
      problems.push(`${id} remembers the X ${obj.castX} of a spell it cannot have come from`);
    }
    // CR 601.2a: the zone a permanent's spell was cast from is remembered by a permanent only (on the battlefield or phased out, CR 702.26b: it stays as it was).
    if (obj.castFrom !== undefined && obj.zone !== 'battlefield' && obj.zone !== 'phased') {
      problems.push(`${id} remembers a cast but is not a permanent`);
    }
    // CR 712.8a, 715.4: a face other than the front one is up only on the stack and the battlefield (or phased out, CR 702.26b: a phased-out permanent is
    // treated as though it does not exist but stays as it was, with the face it had up).
    // A double-faced token (CR 111.10i, issue 81: the Incubator) has a face 1 when it has a back face.
    if (
      card === null
        ? obj.face !== 0 && !(obj.face === 1 && obj.token?.back !== undefined)
        : obj.face < 0 || obj.face >= Math.max(1, faces.length)
    ) {
      problems.push(`${id} has face ${obj.face}, which its card does not have`);
    }
    if (
      obj.face !== 0 &&
      obj.zone !== 'stack' &&
      obj.zone !== 'battlefield' &&
      obj.zone !== 'phased' &&
      obj.prepareOf === undefined
    ) {
      problems.push(`${id} has face ${obj.face} in ${obj.zone}`);
    }
    // CR 701.42a, 712.4a, 712.8g (D-277): a melded permanent is one object on the battlefield (or phased out) represented by the two cards of a meld pair,
    // with the combined back face up; its commander card, if exactly one of the two is, is its first card.
    if (obj.meldedWith !== undefined) {
      if (obj.zone !== 'battlefield' && obj.zone !== 'phased') {
        problems.push(`${id} is melded but is in ${obj.zone}`);
      }
      if (obj.card === null || obj.token !== null || obj.face !== 1) {
        problems.push(`${id} is melded but is not a card with its combined back face up`);
      } else {
        const issue = meldCardsIssue(state, obj.card, obj.meldedWith);
        if (issue !== null) problems.push(`${id} is melded but ${issue}`);
        else if (isCommanderCardId(state, obj.meldedWith) && !isCommanderCardId(state, obj.card)) {
          problems.push(`${id} is melded but its commander card is not its first card`);
        }
      }
    } else if (
      card !== null &&
      obj.face === 1 &&
      state.definitions[state.cards[card]?.definition ?? -1]?.layout === 'meld'
    ) {
      problems.push(`${id} has the combined back face of a meld card but is not melded`);
    }
    // CR 722.3c (D-214): a prepared permanent and the copy of its prepare spell in exile name each other.
    if (obj.prepared === true) {
      const copy = obj.prepareCopy === undefined ? undefined : state.objects[obj.prepareCopy];
      if (obj.zone !== 'battlefield' || copy?.prepareOf !== obj.id || copy.zone !== 'exile') {
        problems.push(`${id} is prepared without the copy of its prepare spell in exile`);
      }
    }
    if (obj.prepareOf !== undefined) {
      const permanent = state.objects[obj.prepareOf];
      if (
        permanent === undefined ||
        permanent.zone !== 'battlefield' ||
        permanent.prepared !== true ||
        permanent.prepareCopy !== id
      ) {
        problems.push(`${id} is a prepare spell in exile whose permanent is not prepared`);
      }
    }
    // CR 715.3d: only a card in exile can be on an Adventure.
    if (obj.onAdventure === true && (obj.zone !== 'exile' || obj.card === null)) {
      problems.push(`${id} is on an Adventure but is not a card in exile`);
    }
    // CR 614.12a, 400.7 (D-100): a choice made as a permanent entered belongs to a permanent whose card
    // or token asks that question, and is one of its options; it is gone when the permanent leaves (phasing out is
    // no change of zone: a phased-out permanent keeps it, CR 702.26b).
    if (obj.chosen !== undefined) {
      const { creatureType, color, cardType, planeswalkerType, lifePaid, player, cardName } =
        obj.chosen;
      const kinds = new Set(
        (obj.token === null ? faces.map((f) => f.abilities) : [obj.token.abilities]).map(
          entersChoice,
        ),
      );
      if (obj.zone !== 'battlefield' && obj.zone !== 'phased') {
        problems.push(`${id} has a choice but is not on the battlefield`);
      }
      if (
        creatureType !== undefined &&
        (!CREATURE_TYPES.includes(creatureType) || !kinds.has('creatureType'))
      ) {
        problems.push(`${id} chose creature type ${creatureType}, which it cannot have`);
      }
      if (color !== undefined && (!COLORS.includes(color) || !kinds.has('color'))) {
        problems.push(`${id} chose color ${color}, which it cannot have`);
      }
      // D-376: a chosen card type is one of `CARD_TYPES` that its card asks for.
      if (cardType !== undefined && (!CARD_TYPES.includes(cardType) || !kinds.has('cardType'))) {
        problems.push(`${id} chose card type ${cardType}, which it cannot have`);
      }
      // CR 205.3j: a chosen planeswalker type is one of `PLANESWALKER_TYPES` that its card asks for.
      if (
        planeswalkerType !== undefined &&
        (!PLANESWALKER_TYPES.includes(planeswalkerType) || !kinds.has('planeswalkerType'))
      ) {
        problems.push(`${id} chose planeswalker type ${planeswalkerType}, which it cannot have`);
      }
      // CR 614.12a: a chosen player is a seat of the game, and only a card that asks to choose a player has one.
      if (
        player !== undefined &&
        (!state.seats.some((s) => s.id === player) || !kinds.has('player'))
      ) {
        problems.push(`${id} chose player ${player}, which it cannot have`);
      }
      // CR 119.4: the life paid as it entered is a whole number, and only a card that asks to pay life has one.
      if (
        lifePaid !== undefined &&
        (!Number.isInteger(lifePaid) || lifePaid < 0 || !kinds.has('lifePaid'))
      ) {
        problems.push(`${id} paid ${lifePaid} life as it entered, which it cannot have`);
      }
      // CR 614.12a: a chosen player is a seat of the game, and a chosen name is a one-line text; only a card that asks for them has one.
      if (
        player !== undefined &&
        (!Number.isInteger(player) ||
          player < 0 ||
          player >= state.seats.length ||
          !kinds.has('player'))
      ) {
        problems.push(`${id} chose player ${player}, which it cannot have`);
      }
      if (cardName !== undefined && (cardName.trim() === '' || !kinds.has('cardName'))) {
        problems.push(`${id} chose card name "${cardName}", which it cannot have`);
      }
      // D-151: a named option is one of those its card offers.
      const { option } = obj.chosen;
      if (option !== undefined) {
        const offered = (
          obj.token === null ? faces.map((f) => f.abilities) : [obj.token.abilities]
        ).flatMap((abilities) => entersOptions(abilities));
        if (!kinds.has('option') || !offered.includes(option)) {
          problems.push(`${id} chose option ${option}, which it cannot have`);
        }
      }
    }
    if (obj.transformedAt !== undefined && obj.zone !== 'battlefield') {
      problems.push(`${id} has transformed but is not on the battlefield`);
    }
    if (obj.stack?.flashback === true) {
      // CR 702.34a: a printed flashback, or flashback with the cost equal to the mana cost that something gave the card.
      if (
        obj.stack.kind !== 'spell' ||
        (flashbackCostOf(face) === null && manaCostAsFlashbackCost(face) === null)
      ) {
        problems.push(`${id} was cast with flashback but is not a spell with flashback`);
      }
      if (obj.zone !== 'stack')
        problems.push(`${id} was cast with flashback but is not on the stack`);
    }
    // CR 118.9, D-095: only a spell on the stack whose face lists the free alternative cost was cast
    // without paying its mana cost.
    if (obj.stack?.free === true) {
      if (obj.stack.kind !== 'spell' || obj.zone !== 'stack') {
        problems.push(
          `${id} was cast without paying its mana cost but is not a spell on the stack`,
        );
      } else if (
        obj.stack.byEffect !== true &&
        face?.alternativeCosts?.some((a) => a.kind === 'free') !== true
      ) {
        problems.push(
          `${id} was cast without paying its mana cost but has no such alternative cost`,
        );
      }
    }
    // CR 118.9a, D-121: a spell on the stack was cast for one alternative cost at most, and a named one
    // is one its face lists.
    if (obj.stack?.alt !== undefined) {
      if (obj.stack.kind !== 'spell' || obj.zone !== 'stack') {
        problems.push(
          `${id} was cast for its ${obj.stack.alt} cost but is not a spell on the stack`,
        );
      } else if (
        face?.alternativeCosts?.some((a) => a.kind === obj.stack?.alt) !== true &&
        !(obj.stack.alt === 'escape' && obj.stack.escapeGrant !== undefined) &&
        !(obj.stack.alt === 'miracle' && obj.stack.miracleGrant !== undefined) &&
        !(obj.stack.alt === 'evoke' && obj.stack.evokeGrant !== undefined)
      ) {
        problems.push(
          `${id} was cast for its ${obj.stack.alt} cost but has no such alternative cost`,
        );
      }
      if (obj.stack.flashback || obj.stack.free === true) {
        problems.push(`${id} was cast for two alternative costs (CR 118.9a)`);
      }
    }
    // D-121, D-124: a permanent that remembers an alternative cost (or that it was unearthed) is one on the
    // battlefield whose face lists it (the unearth keyword).
    if (obj.alt !== undefined) {
      if (obj.zone !== 'battlefield') {
        problems.push(`${id} remembers its ${obj.alt} cost but is not on the battlefield`);
      } else if (
        // The token a copy of an evoked or dashed permanent spell became remembers the cost too (CR 707.10), and a
        // token has no alternative costs to look up.
        obj.token === null &&
        (obj.alt === 'unearth' || obj.alt === 'suspend'
          ? !face?.abilities.some((a) => a.kind === 'keyword' && a.keyword.kind === obj.alt) &&
            !(obj.alt === 'unearth' && obj.unearthGranted === true)
          : face?.alternativeCosts?.some((a) => a.kind === obj.alt) !== true &&
            !(obj.alt === 'escape' && obj.escapeGranted === true) &&
            !(obj.alt === 'evoke' && obj.evokeGranted === true))
      ) {
        problems.push(`${id} remembers its ${obj.alt} cost but has no such alternative cost`);
      }
    }
    // D-128: a spell cast by its suspend ability is a spell on the stack of a card with suspend; a foretold card is
    // a card in exile with a foretell cost; time counters are only on cards in exile with suspend or on permanents.
    if (obj.stack?.suspended === true) {
      if (obj.stack.kind !== 'spell' || obj.zone !== 'stack') {
        problems.push(`${id} was cast by suspend but is not a spell on the stack`);
      } else if (
        !face?.abilities.some((a) => a.kind === 'keyword' && a.keyword.kind === 'suspend')
      ) {
        problems.push(`${id} was cast by suspend but has no suspend ability`);
      }
    }
    if (obj.foretoldTurn !== undefined) {
      if (obj.zone !== 'exile') problems.push(`${id} is foretold but is not in exile`);
      else if (face?.alternativeCosts?.some((a) => a.kind === 'foretell') !== true) {
        problems.push(`${id} is foretold but has no foretell cost`);
      }
    }
  }
  // Every card is exactly one live object, except the cards of a seat that left the game (CR 800.4a), cards currently represented by a stack object
  // that is not a card (none today) or tokens, which have no card.
  const objectsPerCard = new Map<string, number>();
  for (const obj of Object.values(state.objects)) {
    // D-277: a melded permanent is one object that two cards represent; each of them is on it.
    for (const card of cardsOf(obj)) objectsPerCard.set(card, (objectsPerCard.get(card) ?? 0) + 1);
  }
  for (const [card, instance] of Object.entries(state.cards)) {
    const n = objectsPerCard.get(card) ?? 0;
    // CR 800.4a (issue 336): the cards of a player who left a game that goes on have left the game with them. A game that has ended keeps its board.
    if (n === 0 && state.result === null && state.seats[instance.owner]?.hasLost === true) continue;
    if (n !== 1) problems.push(`card ${card} has ${n} objects, expected 1`);
  }
  for (const s of state.seats) {
    // CR 103.2b, 702.139c: a companion has card data, and once brought it is a card of the game its owner owns (until then it is outside the game).
    if (s.companion !== undefined) {
      const { definition, brought } = s.companion;
      if (state.definitions[definition] === undefined)
        problems.push(`seat${s.id} has a companion with no card data`);
      else if (
        brought &&
        !Object.values(state.cards).some((c) => c.owner === s.id && c.definition === definition)
      ) {
        problems.push(`seat${s.id} brought its companion but it is not a card of the game`);
      }
    }
    if (s.manaPool.length < 0) problems.push(`seat${s.id} has a negative pool`);
    if (s.landsPlayedThisTurn < 0) problems.push(`seat${s.id} has negative land plays`);
    if (s.cardsDrawnThisTurn < 0) problems.push(`seat${s.id} has a negative count of cards drawn`);
    if (s.spellsCastThisTurn < 0) problems.push(`seat${s.id} has a negative count of spells cast`);
    if (s.lifeLostThisTurn < 0) problems.push(`seat${s.id} has a negative count of life lost`);
  }
  if (state.pending === null && state.result === null) {
    problems.push('the game is running but nothing is pending');
  }
  if (state.result !== null && state.pending !== null)
    problems.push('the game is over but a decision is pending');
  return problems;
}
