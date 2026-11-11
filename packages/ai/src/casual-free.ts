/**
 * CasualAgent and what D-145 adds to the decisions of a game:
 *
 *  - "You may cast a spell ... from your hand without paying its mana cost", "You may play the exiled card" (`chooseCards` of purpose 'cast',
 *    CR 608.2g): the agent always takes a card, because it costs nothing: the most expensive spell, and a land only when no spell is
 *    offered (a land's mana value is 0, so it is also what a spell with a mana value of 0 competes with).
 *  - "... fights ..." (`choosePermanent` of purpose 'fight', CR 701.14): the creature `subject` fights the one of the legal creatures it kills
 *    and survives, else one it kills, else the one that hurts it least.
 *  - Hideaway (CR 702.75a): the ability "You may play the exiled card" is activated in a main phase of the agent's own turn when it holds a
 *    card of its own that it may look at, face down in exile; the engine lists the option only when the cost is payable.
 */
import type {
  Action,
  ActivatedAbility,
  ChooseCardsDecision,
  ChoosePermanentDecision,
  GameView,
  ObjectView,
} from '@commander-arena/engine';
import { findObject, manaValueOf, powerOf, toughnessOf } from './casual-view';

/** The card to cast or play for free: the most expensive, a land last; the first listed on a tie. */
export function chooseFreeCast(view: GameView, d: ChooseCardsDecision): Action {
  const seen = new Map<string, ObjectView>(
    [...view.exile, ...(view.pendingCards ?? [])].map((o) => [o.id, o]),
  );
  const ranked = d.legal
    .map((id, index) => {
      const o = seen.get(id) ?? findObject(view, id);
      const land = o?.types.includes('land') === true;
      return { id, index, land: land ? 0 : 1, mv: o === undefined ? 0 : manaValueOf(o) };
    })
    .sort((a, b) => b.land - a.land || b.mv - a.mv || a.index - b.index);
  const best = ranked[0];
  return { kind: 'chooseCards', objects: best === undefined ? [] : [best.id] };
}

const remaining = (o: ObjectView): number => toughnessOf(o) - o.damage;

/** The creature the creature `subject` fights: see the file comment. */
export function chooseFightOpponent(view: GameView, d: ChoosePermanentDecision): Action {
  const me = d.subject === undefined ? undefined : findObject(view, d.subject);
  const ranked = d.legal
    .map((id, index) => {
      const foe = findObject(view, id);
      if (me === undefined || foe === undefined) return { id, index, score: 0, power: 0 };
      const kills = powerOf(me) >= remaining(foe);
      const survives = powerOf(foe) < remaining(me);
      return {
        id,
        index,
        score: kills && survives ? 3 : kills ? 2 : survives ? 1 : 0,
        power: powerOf(foe),
      };
    })
    .sort((a, b) => b.score - a.score || a.power - b.power || a.index - b.index);
  const chosen = ranked.slice(0, d.min).map((r) => r.id);
  return { kind: 'choosePermanents', objects: d.legal.filter((id) => chosen.includes(id)) };
}

/** Whether the effect (or one it holds under a condition) casts or plays the card this permanent exiled. */
function playsExiledCard(node: unknown): boolean {
  if (node === null || typeof node !== 'object') return false;
  const e = node as { kind?: unknown; objects?: { kind?: unknown }; effect?: unknown };
  if (e.kind === 'castFree') return e.objects?.kind === 'linkedExile';
  return e.kind === 'conditional' && playsExiledCard(e.effect);
}

/** "{cost}: You may play the exiled card without paying its mana cost" (Hideaway, D-145), wanted when a card of its own waits in exile. */
export function wantsPlayExiled(
  view: GameView,
  obj: ObjectView,
  ability: ActivatedAbility,
): boolean {
  if (!playsExiledCard(ability.effect)) return false;
  if (obj.controller !== view.viewer || obj.zone !== 'battlefield') return false;
  if (view.activeSeat !== view.viewer) return false;
  if (view.step !== 'precombatMain' && view.step !== 'postcombatMain') return false;
  // A card face down that the agent can read is one Hideaway exiled for it (foretold cards have their own flag).
  return view.exile.some(
    (o) =>
      o.owner === view.viewer &&
      o.faceDown === true &&
      o.foretold !== true &&
      o.name !== 'Face-down card',
  );
}
