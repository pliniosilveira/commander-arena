/**
 * Clause lowerings: one per IR verb, each declaring the engine features it needs. The grammar
 * understands more than the engine runs; `needs` is what turns the difference into a precise
 * "recognised, not runnable" diagnostic (D-063, D-068).
 */
import type {
  Ability,
  Amount,
  CardType,
  ChooseSelector,
  Color,
  Cost,
  Effect,
  ManaColor,
  ManaProduction,
  ObjectRef,
  PlayerSelector,
  TokenDefinition,
} from '@commander-arena/engine';
import type { IrClause, IrManaSpec, IrNoun, IrZoneSpec } from '../ir/types';
import { keywordKind, plainKeyword } from '../rules/keyword/vocabulary';
import { lowerAmount } from './amounts';
import { ANGEL_LOWERINGS } from './angels';
import { ARDEN_LOWERINGS } from './arden';
import { CHANGE_TARGET } from './change-target';
import { amountArg, arg, type Effects, eachObject, failure, operand } from './clauses';
import { lowerCondition } from './conditions';
import {
  BECOMES,
  DELAYED_RETURN,
  DELAYED_RETURN_AT_UPKEEP,
  FLICKER,
  GRANT_KEYWORD,
  LOSE_ALL_ABILITIES,
  RESTRICT,
  SET_PT,
} from './continuous';
import { GAIN_CONTROL } from './control';
import { lowerCopyToken } from './copies';
import { COPY_SPELL } from './copy-spell';
import { lowerCost } from './costs';
import { DAWNBREAK_LOWERINGS } from './dawnbreak';
import { DESTINY_LOWERINGS } from './destiny';
import { DINOSAUR_LOWERINGS } from './dinosaurs';
import { DRAGON_LOWERINGS } from './dragons';
import { EDHREC_LOWERINGS } from './edhrec';
import { PUMP, SEARCH } from './effects-more';
import { missingFeatures } from './features';
import { GAIN_STATIC_ABILITY } from './granted-static';
import { HOFRI_LOWERINGS } from './hofri';
import { KORVOLD_LOWERINGS } from './korvold';
import { MELD_LOWERINGS } from './meld';
import { NIV_LOWERINGS } from './niv';
import { NIV_GROUP_3_C_LOWERINGS } from './niv-group-3-c';
import {
  attackedByOf,
  colorLetter,
  itemsOf,
  lowerFilter,
  objectRefOf,
  objectSelectorOf,
  playerSelectorOf,
  recipientOf,
} from './nouns';
import { PILES_LOWERINGS } from './piles';
import { PLANESWALKER_LOWERINGS } from './planeswalker';
import { PREVENT_DAMAGE } from './prevent';
import { lowerTokenAbility, tokenRulesText } from './tokens';
import type { LowerContext, LowerFailure, Lowering, LowerResult } from './types';
import { VRASKA_LOWERINGS } from './vraska';

/**
 * "Untap ~", "exile ~", "return ~ to its owner's hand": the effect acts on the permanent the
 * ability is on, so that permanent has to be there when it runs. It is not in a "dies" trigger of
 * itself or after a cost that sacrificed it (`selfGone`: it is a new object in the graveyard, CR
 * 400.7), and a spell's `~` is the spell on the stack, not a permanent (CR 112.1, 110.1): the one
 * thing a resolving spell can do to itself is exile itself ("Exile ~." at the end of Teferi's
 * Protection, a spell that is exiled instead of put into its owner's graveyard, CR 608.2n).
 */
function selfRefusal(clause: IrClause, ctx: LowerContext): LowerFailure | null {
  const objects = operand(clause, 'objects');
  // "It" bound to `~` (the binding pass says so with the reference `self`) is `~` too.
  const aboutSelf = (item: IrNoun) => item.det === 'self' || item.ref === 'self';
  if (objects === undefined || !itemsOf(objects).some(aboutSelf)) return null;
  if (ctx.owner === 'spell') return clause.verb === 'exile' ? null : failure(clause);
  return ctx.selfGone ? failure(clause) : null;
}

/**
 * "Tap it", "untap it" after the target was destroyed, exiled, sacrificed or returned by an earlier
 * instruction: "it" is then a card somewhere else, which has no tapped state to change (CR 400.7,
 * 701.26a). The same for "exile it" (stage P30: "Destroy target creature. Exile it." names an object
 * that is gone, CR 400.7). Read, and refused with no feature to name.
 */
function goneRefusal(clause: IrClause, ctx: LowerContext, verb: string): LowerFailure | null {
  if (verb !== 'tap' && verb !== 'untap' && verb !== 'exile') return null;
  const objects = operand(clause, 'objects');
  if (objects === undefined) return null;
  return itemsOf(objects).some((item) => item.ref !== undefined && ctx.removed.has(item.ref))
    ? failure(clause)
    : null;
}

function simple(
  verb: 'destroy' | 'exile' | 'counter' | 'tap' | 'untap' | 'transform',
): Lowering<IrClause, Effects> {
  return {
    head: verb,
    id: `lower.${verb}`,
    needs: [`effect:${verb}`],
    lower: (clause, ctx) =>
      selfRefusal(clause, ctx) ??
      goneRefusal(clause, ctx, verb) ??
      // "... until ~ leaves the battlefield" lasts as long as a permanent does: an instant or a sorcery has none (stage P33, D-150).
      (verb === 'exile' &&
      (clause.args.until !== undefined || clause.args.untilMonarch !== undefined) &&
      ctx.owner === 'spell'
        ? failure(clause)
        : null) ??
      // "You may exile it" in a trigger of ~ dying: the card the permanent became (stage P30, D-135).
      eachObject(
        clause,
        ctx,
        (objects) =>
          // "... until ~ leaves the battlefield" (stage P33, D-150, CR 610.3): the cards return when the permanent with the ability leaves.
          verb === 'exile' && clause.args.until !== undefined
            ? { kind: verb, objects, until: 'sourceLeaves' }
            : // "... until an opponent becomes the monarch" (stage P70, D-231, CR 610.3): the cards return when an opponent of the controller becomes the monarch.
              verb === 'exile' && clause.args.untilMonarch !== undefined
              ? { kind: verb, objects, until: 'opponentBecomesMonarch' }
              : { kind: verb, objects },
        'objects',
        // D-178: "untap that land" and "tap it" after a search name the card it found (the engine's `moved`).
        verb === 'exile'
          ? // D-206: "you may exile that card from your graveyard" names the card a discard trigger is about.
            { thisCard: true, triggerSubject: true }
          : verb === 'tap' || verb === 'untap'
            ? { moved: true }
            : {},
      ),
  };
}

/**
 * "{1}{B}: Regenerate ~.", "Regenerate target creature." (CR 701.19a, stage P21): a regeneration shield for each
 * permanent the operand names, until end of turn (CR 514.2; the text says no duration, "this turn" is
 * understood). The permanent has to be there when the effect runs, so a spell cannot regenerate itself (it is
 * the spell on the stack, CR 112.1) and a permanent that is already gone cannot be (`selfRefusal`).
 */
const REGENERATE: Lowering<IrClause, Effects> = {
  head: 'regenerate',
  id: 'lower.regenerate',
  needs: ['effect:regenerate', 'duration:untilEndOfTurn'],
  lower: (clause, ctx) =>
    selfRefusal(clause, ctx) ??
    eachObject(clause, ctx, (objects) => ({
      kind: 'regenerate',
      objects,
      duration: 'untilEndOfTurn',
    })),
};

/**
 * "Counter target spell unless its controller pays {3}" (CR 701.6, 118.12a): the engine's
 * `counterUnlessPays` on a target spell, asked of the spell's controller (CR 608.2d). The cost is
 * the mana the clause names.
 */
const COUNTER_UNLESS: Lowering<IrClause, Effects> = {
  head: 'counterUnlessPays',
  id: 'lower.counter-unless',
  needs: ['effect:counterUnlessPays', 'selector:target', 'cost:mana'],
  lower(clause, ctx) {
    const objects = operand(clause, 'objects');
    const costs = arg(clause, 'cost');
    if (objects?.kind !== 'noun' || costs?.kind !== 'costList') return failure(clause);
    const spell = objectRefOf(objects, ctx);
    if (!spell.ok) return spell;
    if (spell.value.kind !== 'target') return failure(clause);
    const cost: Cost[] = [];
    for (const item of costs.costs) {
      const lowered = lowerCost(item);
      if (!lowered.ok) return lowered;
      cost.push(lowered.value);
    }
    return {
      ok: true,
      value: [{ kind: 'counterUnlessPays', objects: spell.value, cost }],
      rule: clause.rule,
    };
  },
};

const DAMAGE: Lowering<IrClause, Effects> = {
  head: 'dealDamage',
  id: 'lower.damage',
  needs: ['effect:dealDamage'],
  lower(clause, ctx) {
    // "It deals 1 damage to you": the damage comes from the ability's own source when "it" is `~` (the binding pass
    // says so with the reference `self`). Since stage P28 (D-131) the creature that deals the damage may be another
    // object: "Target creature you control deals damage equal to its power to target creature you don't control" and
    // "Whenever a creature you control enters, it deals damage equal to its power to any target" are the engine's
    // `from` (a bite, CR 120.3: the creature is the source of the damage; it takes none back, unlike a fight).
    const source = arg(clause, 'source');
    let from: ObjectRef | undefined;
    if (source !== undefined) {
      if (source.kind !== 'noun') return failure(clause);
      if (source.ref !== 'self') {
        const blocked = missingFeatures(['selector:damageSource']);
        if (blocked.length > 0) return failure(clause, blocked);
        const ref = objectRefOf(source, ctx, { triggerSubject: true });
        if (!ref.ok) return ref;
        if (ref.value.kind !== 'target' && ref.value.kind !== 'triggerSubject') {
          return failure(clause);
        }
        from = ref.value;
      }
    }
    const amount = amountArg(clause, 'amount', ctx);
    if (!amount.ok) return amount;
    const to = operand(clause, 'to');
    if (to === undefined) return failure(clause);
    const effects: Effect[] = [];
    for (const item of itemsOf(to)) {
      // "Each other creature" leaves out the source of the ability, not the creature that deals the damage: it cannot
      // be said of another source (stage P28). Stage P34 (D-152): with the creature a target, the engine says which one is left out
      // (`except`): "Target creature you control deals damage equal to its power to each other creature and each opponent."
      if (from !== undefined && item.other) {
        if (from.kind !== 'target' || item.det !== 'each') return failure(clause);
        const group = objectSelectorOf({ ...item, other: false }, ctx);
        if (!group.ok) return group;
        if (group.value.kind !== 'each') return failure(clause);
        effects.push({
          kind: 'dealDamage',
          amount: amount.value,
          to: { ...group.value, except: from },
          from,
        });
        continue;
      }
      // "the player or planeswalker it's attacking" (stage P31, D-140): what the creature attacks.
      const recipient =
        item.det === 'attackedBy' ? attackedByOf(item, ctx) : recipientOf(item, ctx);
      if (!recipient.ok) return recipient;
      effects.push({
        kind: 'dealDamage',
        amount: amount.value,
        to: recipient.value,
        ...(from === undefined ? {} : { from }),
      });
    }
    return { ok: true, value: effects, rule: clause.rule };
  },
};

function zoneOf(clause: IrClause): IrZoneSpec | undefined {
  const a = arg(clause, 'to');
  return a?.kind === 'zoneSpec' ? a : undefined;
}

/**
 * "Return a land you control to its owner's hand": the controller chooses among their permanents
 * as the effect resolves (CR 608.2d), the engine's `choose` selector of a move to a hand. The
 * engine requires `controller: 'you'`, which the noun says; a choice cannot enter the battlefield.
 */
function lowerChosenReturn(clause: IrClause, what: IrNoun, zone: string): LowerResult<Effects> {
  if (zone !== 'hand') return failure(clause);
  const blocked = missingFeatures(['selector:choose']);
  if (blocked.length > 0) return failure(clause, blocked);
  const filter = lowerFilter(what);
  if (!filter.ok) return filter;
  if (filter.value.controller !== 'you') return failure(clause);
  return {
    ok: true,
    value: [{ kind: 'moveToZone', objects: { kind: 'choose', filter: filter.value }, to: 'hand' }],
    rule: clause.rule,
  };
}

/**
 * "Return this card from your graveyard to the battlefield with a +1/+1 counter on it" (stage P30, D-135, CR 113.6b, 400.7, 122.6): an
 * ability of the card itself that works from the graveyard. Only the lowering of an ordinary activated ability allows it
 * (`ctx.graveyardSource`), which then gives the ability `functionsIn: 'graveyard'`; the card enters under its owner's control, which
 * is its controller's when it is activated from their own graveyard, with the counters it enters with (CR 614.1c).
 */
function lowerReturnSelf(
  clause: IrClause,
  to: IrZoneSpec,
  ctx: LowerContext,
): LowerResult<Effects> {
  const what = operand(clause, 'objects');
  if (what?.kind !== 'noun' || what.det !== 'self' || !ctx.graveyardSource) return failure(clause);
  const blocked = missingFeatures(['selector:this']);
  if (blocked.length > 0) return failure(clause, blocked);
  ctx.usedGraveyardSource = true;
  // "... to the battlefield attached to target creature you control with power 1 or less" (stage P50, D-207, CR 303.4g): the host is a target of the ability.
  const host = operand(clause, 'attachTo');
  let attachTo: { kind: 'target'; id: string } | undefined;
  if (host !== undefined) {
    if (to.zone !== 'battlefield') return failure(clause);
    const ref = host.kind === 'noun' ? objectRefOf(host, ctx) : null;
    if (ref === null || !ref.ok) return ref ?? failure(clause);
    if (ref.value.kind !== 'target') return failure(clause);
    attachTo = { kind: 'target', id: ref.value.id };
  }
  const effect: Effect =
    to.zone === 'battlefield'
      ? {
          kind: 'moveToZone',
          objects: { kind: 'this' },
          to: 'battlefield',
          controller: 'owner',
          ...(to.counters === undefined ? {} : { withCounters: { ...to.counters } }),
          ...(attachTo === undefined ? {} : { attachTo }),
        }
      : { kind: 'moveToZone', objects: { kind: 'this' }, to: 'hand' };
  return { ok: true, value: [effect], rule: clause.rule };
}

const RETURN: Lowering<IrClause, Effects> = {
  head: 'return',
  id: 'lower.return',
  needs: ['effect:moveToZone'],
  lower(clause, ctx) {
    const to = zoneOf(clause);
    // "Return the exiled card to its owner's graveyard" (stage P68, D-230, CR 607.2a, 400.3): the card a linked ability exiled goes to its owner's graveyard.
    const linked = operand(clause, 'objects');
    if (to?.zone === 'graveyard' && linked?.kind === 'noun' && linked.det === 'linkedExile') {
      return eachObject(
        clause,
        ctx,
        (objects) => ({ kind: 'moveToZone', objects, to: 'graveyard' }),
        'objects',
      );
    }
    if (to === undefined || (to.zone !== 'hand' && to.zone !== 'battlefield')) {
      return failure(clause);
    }
    if (to.from === 'graveyard') return lowerReturnSelf(clause, to, ctx);
    const zone = to.zone;
    const refused = selfRefusal(clause, ctx);
    if (refused !== null) return refused;
    const chosen = operand(clause, 'objects');
    if (chosen?.kind === 'noun' && chosen.det === 'a') {
      return lowerChosenReturn(clause, chosen, zone);
    }
    // "Destroy target creature. Return it to its owner's hand." names an object that is gone, a card somewhere else now (CR 400.7).
    if (
      zone === 'hand' &&
      chosen !== undefined &&
      itemsOf(chosen).some((item) => item.ref !== undefined && ctx.removed.has(item.ref))
    ) {
      return failure(clause);
    }
    // "Whenever a nontoken creature you control dies, return that card to the battlefield under its owner's control" (stage P68, D-230, CR 400.7, 603.10a): the card
    // the permanent that died became in the graveyard, if it is still there.
    if (
      chosen?.kind === 'noun' &&
      zone === 'battlefield' &&
      chosen.det === 'triggerSubject' &&
      /^that card/iu.test(chosen.filter.raw)
    ) {
      const blocked = missingFeatures(['selector:triggerCard', 'selector:triggerSubject']);
      if (blocked.length > 0) return failure(clause, blocked);
      return {
        ok: true,
        value: [
          {
            kind: 'moveToZone',
            objects: { kind: 'triggerCard' },
            to: 'battlefield',
            controller: to.whose ?? 'you',
            ...(to.tapped === true ? { tapped: true } : {}),
            ...(to.counters === undefined ? {} : { withCounters: { ...to.counters } }),
          },
        ],
        rule: clause.rule,
      };
    }
    // "Return that nonland permanent card to the battlefield" (stage P33, D-150, CR 608.2c): the card an earlier instruction chose from a
    // graveyard; a pronoun for anything else (a permanent on the battlefield, a player) is not a card to return.
    if (chosen?.kind === 'noun' && chosen.det === 'anaphor' && /^that /iu.test(chosen.filter.raw)) {
      const spec = ctx.targets.find((t) => t.id === chosen.ref);
      if (spec?.what.kind !== 'object' || spec.what.filter.zone !== 'graveyard') {
        return failure(clause);
      }
    }
    // CR 110.2a: what an effect puts onto the battlefield is controlled by the player performing it
    // unless the text says otherwise; the node says so rather than lean on the engine's default.
    // "Return it to its owner's hand" in a trigger of ~ dying (stage P35, D-176, CR 700.4, 400.7): "it" is the card the permanent became.
    return eachObject(
      clause,
      ctx,
      (objects) =>
        zone === 'battlefield'
          ? {
              kind: 'moveToZone',
              objects,
              to: zone,
              controller: to.whose ?? 'you',
              ...(to.tapped === true ? { tapped: true } : {}),
              // "... with a finality counter on it" (stage P68, D-230, CR 122.6): the counter it enters with.
              ...(to.counters === undefined ? {} : { withCounters: { ...to.counters } }),
            }
          : { kind: 'moveToZone', objects, to: zone },
      'objects',
      zone === 'hand' ? { thisCard: true } : {},
    );
  },
};

/**
 * "Put ~ on top of its owner's library", "put target card from your graveyard on top of your
 * library" (CR 401.3): the engine moves the object to its owner's library, at the top or the bottom.
 */
const PUT_LIBRARY: Lowering<IrClause, Effects> = {
  head: 'putLibrary',
  id: 'lower.put-library',
  needs: ['effect:moveToZone'],
  lower(clause, ctx) {
    const to = zoneOf(clause);
    if (to?.zone !== 'library' || to.position === undefined) return failure(clause);
    const position = to.position;
    const refused = selfRefusal(clause, ctx);
    if (refused !== null) return refused;
    // "Put it into its owner's library third from the top" (stage P30, D-135, CR 401.7): "it" may be the card the permanent became.
    return eachObject(
      clause,
      ctx,
      (objects) => ({ kind: 'moveToZone', objects, to: 'library', position }),
      'objects',
      { thisCard: true },
    );
  },
};

/**
 * "Tap X untapped Myr you control", "tap two untapped creatures you control" (stage P31, D-140, CR 701.26a, 608.2d): the controller
 * chooses among the untapped permanents of the kind they control as the instruction runs, any number for "X" (`anyNumber`) or that many
 * (`count`); the engine's `tap` of a `choose` selector. "X" names the number chosen, which only "If you do" after it reads.
 */
const TAP_CHOSEN: Lowering<IrClause, Effects> = {
  head: 'tapChosen',
  id: 'lower.tap-chosen',
  needs: ['effect:tap', 'selector:choose'],
  lower(clause) {
    const objects = arg(clause, 'objects');
    if (objects?.kind !== 'noun' || objects.det !== 'a') return failure(clause);
    const anyNumber = objects.anyNumber === true;
    if (anyNumber) {
      const blocked = missingFeatures(['selector:anyNumber']);
      if (blocked.length > 0) return failure(clause, blocked);
    }
    const count = objects.count?.kind === 'number' ? objects.count.value : 1;
    if (!anyNumber && objects.count !== undefined && objects.count.kind !== 'number') {
      return failure(clause);
    }
    const filter = lowerFilter(objects);
    if (!filter.ok) return filter;
    const chosen: ChooseSelector = {
      kind: 'choose',
      filter: filter.value,
      ...(anyNumber ? { anyNumber: true as const } : count > 1 ? { count } : {}),
    };
    return { ok: true, value: [{ kind: 'tap', objects: chosen }], rule: clause.rule };
  },
};

/**
 * "Untap up to three lands" (stage P63, D-216, CR 701.26a, 608.2d): the controller chooses none up to the count among the tapped permanents of the kind
 * as the instruction runs, whoever controls them; the engine's `untap` of a `choose` selector with `upTo`.
 */
const UNTAP_CHOSEN: Lowering<IrClause, Effects> = {
  head: 'untapChosen',
  id: 'lower.untap-chosen',
  needs: ['effect:untap', 'selector:choose', 'selector:upTo'],
  lower(clause) {
    const objects = arg(clause, 'objects');
    if (objects?.kind !== 'noun' || objects.det !== 'a' || objects.count?.kind !== 'number') {
      return failure(clause);
    }
    const filter = lowerFilter(objects);
    if (!filter.ok) return filter;
    const chosen: ChooseSelector = {
      kind: 'choose',
      filter: filter.value,
      count: objects.count.value,
      upTo: true,
    };
    return { ok: true, value: [{ kind: 'untap', objects: chosen }], rule: clause.rule };
  },
};

/**
 * "You may reselect which player or permanent target attacking creature is attacking" (stage P31, D-140, CR 508.7): the engine's
 * `reselectAttack` of the target creature, which its controller's opponents' players, planeswalkers and battles are offered for.
 */
const RESELECT_ATTACK: Lowering<IrClause, Effects> = {
  head: 'reselectAttack',
  id: 'lower.reselect-attack',
  needs: ['effect:reselectAttack', 'selector:target', 'selector:attacking'],
  lower(clause, ctx) {
    const objects = operand(clause, 'objects');
    if (objects?.kind !== 'noun' || objects.det !== 'target') return failure(clause);
    return eachObject(clause, ctx, (selected) => ({ kind: 'reselectAttack', objects: selected }));
  },
};

/**
 * "You may put an artifact card from your hand onto the battlefield" (stage P31, D-140, CR 400.7, 110.2a, 608.2d): the controller chooses a
 * card of the kind among the cards they own in that zone as the instruction runs (none with "you may"), the engine's `moveToZone` of a
 * `choose` selector (`optional` for "you may"); it enters under their control.
 */
const PUT_FROM_ZONE: Lowering<IrClause, Effects> = {
  head: 'putFromZone',
  id: 'lower.put-from-zone',
  needs: ['effect:moveToZone', 'selector:choose'],
  lower(clause) {
    const objects = arg(clause, 'objects');
    const to = zoneOf(clause);
    const may = arg(clause, 'may');
    if (objects?.kind !== 'noun' || objects.det !== 'a') return failure(clause);
    // "You may return a creature card from your graveyard to your hand" (stage P35, D-176, CR 608.2d): a card chosen from the graveyard,
    // none when the player may and does not.
    if (to?.zone === 'hand') {
      const filter = lowerFilter(objects);
      if (!filter.ok) return filter;
      const optionalReturn = may?.kind === 'flag' && may.value;
      const move: Effect = {
        kind: 'moveToZone',
        objects: {
          kind: 'choose',
          filter: filter.value,
          ...(optionalReturn ? { optional: true as const } : {}),
        },
        to: 'hand',
      };
      return { ok: true, value: [move], rule: clause.rule };
    }
    if (to?.zone !== 'battlefield') return failure(clause);
    const filter = lowerFilter(objects);
    if (!filter.ok) return filter;
    const optional = may?.kind === 'flag' && may.value;
    const move: Effect = {
      kind: 'moveToZone',
      objects: {
        kind: 'choose',
        filter: filter.value,
        ...(optional ? { optional: true as const } : {}),
      },
      to: 'battlefield',
      ...(to.tapped === true ? { tapped: true } : {}),
    };
    // "... onto the battlefield tapped and attacking" (stage P34, D-152, CR 508.4): the creature joins the combat, never declared as an
    // attacker, so nothing triggers from the declaration; the engine's `enterAttacking` of what was just put.
    if (to.attacking === true) {
      const blocked = missingFeatures(['effect:enterAttacking']);
      if (blocked.length > 0) return failure(clause, blocked);
      return {
        ok: true,
        value: [move, { kind: 'enterAttacking', objects: { kind: 'moved' } }],
        rule: clause.rule,
      };
    }
    return { ok: true, value: [move], rule: clause.rule };
  },
};

/**
 * "You may cast target Zombie creature card from your graveyard this turn" (stage P30, D-135, CR 601.2, 611.2a): the engine's
 * `mayCast` on the target card, for the rest of the turn (CR 514.2). The card is a target of the text, of your own graveyard.
 */
const MAY_CAST: Lowering<IrClause, Effects> = {
  head: 'mayCast',
  id: 'lower.may-cast',
  needs: ['effect:mayCast', 'selector:target', 'duration:untilEndOfTurn'],
  lower(clause, ctx) {
    const objects = operand(clause, 'objects');
    if (objects?.kind !== 'noun' || objects.det !== 'target') return failure(clause);
    return eachObject(clause, ctx, (selected) => ({
      kind: 'mayCast',
      objects: selected,
      duration: 'untilEndOfTurn',
    }));
  },
};

/** The mana a spec produces; a color choice is only possible while paying for a mana ability. */
export function lowerMana(spec: IrManaSpec): ManaProduction {
  switch (spec.what.kind) {
    case 'symbols':
      return { kind: 'fixed', mana: spec.what.symbols as ManaColor[] };
    case 'oneOf':
      return { kind: 'oneOf', colors: spec.what.colors as ManaColor[] };
    case 'anyColor':
      return spec.what.count === undefined
        ? { kind: 'anyColor' }
        : { kind: 'anyColor', count: spec.what.count };
    case 'commanderIdentity':
      return { kind: 'commanderIdentity' };
    case 'chosenColor':
      return { kind: 'chosenColor' };
    case 'devotionToChosenColor':
      // CR 605.3b, 700.5: only after "Choose a color." in a mana ability (`lowerChosenColorDevotion`); the ordinary lowering of an instruction refuses it.
      return { kind: 'anyColorDevotion' };
    case 'anyCombination':
      return spec.what.distinct === true
        ? { kind: 'anyCombination', count: spec.what.count, distinct: true }
        : { kind: 'anyCombination', count: spec.what.count };
    case 'combination':
      // The engine stores a combination in the order W, U, B, R, G, C (CR 106.4: the pool does not
      // order mana), so {R}{W} is `['W', 'R']`.
      return {
        kind: 'combination',
        options: spec.what.options.map((option) => sortedMana(option)),
      };
    case 'couldProduce':
      // CR 106.7: the permanents are the lands of one player; "any type" keeps colorless.
      return {
        kind: 'couldProduce',
        lands: { types: ['land'], controller: spec.what.whose === 'you' ? 'you' : 'opponent' },
        ...(spec.what.anyType ? { anyType: true } : {}),
      };
  }
}

const MANA_ORDER = ['W', 'U', 'B', 'R', 'G', 'C'];

function sortedMana(symbols: readonly string[]): ManaColor[] {
  return [...symbols].sort((a, b) => MANA_ORDER.indexOf(a) - MANA_ORDER.indexOf(b)) as ManaColor[];
}

const ADD_MANA: Lowering<IrClause, Effects> = {
  head: 'addMana',
  id: 'lower.add-mana',
  needs: ['effect:addMana'],
  lower(clause, ctx) {
    const spec = arg(clause, 'mana');
    if (spec?.kind !== 'manaSpec') return failure(clause);
    // "Add {R} for each tapped land your opponents control." (stage P34, D-152, CR 106.1): the fixed mana once for each of an amount read
    // as the effect runs; a spell or a triggered ability only (a mana ability fixes its production before it resolves, CR 605.1a).
    if (arg(clause, 'times') !== undefined) {
      if (spec.what.kind !== 'symbols') return failure(clause);
      const times = amountArg(clause, 'times', ctx);
      if (!times.ok) return times;
      const mana = spec.what.symbols as ManaColor[];
      return {
        ok: true,
        value: [{ kind: 'addMana', mana: { kind: 'fixed', mana, times: times.value } }],
        rule: clause.rule,
      };
    }
    // "Add an additional {C}" (stage P31) is only the effect of a triggered mana ability, which `lowerTriggered` builds itself.
    if (arg(clause, 'additional') !== undefined) return failure(clause);
    // The interpreter's addMana effect adds fixed mana only: it has no color decision while a
    // spell or ability resolves (a mana ability chooses while paying instead).
    if (spec.what.kind !== 'symbols') {
      return { ok: false, needs: ['selector:colorChoice'], at: spec.span, rule: spec.rule };
    }
    return {
      ok: true,
      value: [{ kind: 'addMana', mana: lowerMana(spec) }],
      rule: clause.rule,
    };
  },
};

/**
 * "Choose a color." (CR 105.1, 605.3b): a color is chosen as the mana ability that says so resolves, which `lowerChosenColorDevotion` reads together with the sentence
 * after it. Anywhere else the engine has no way to ask for a color while an instruction resolves, so it is reported, never guessed.
 */
const CHOOSE_COLOR: Lowering<IrClause, Effects> = {
  head: 'chooseColor',
  id: 'lower.choose-color',
  needs: [],
  lower: (clause) => ({
    ok: false,
    needs: ['selector:colorChoice'],
    at: clause.span,
    rule: clause.rule,
  }),
};

function playerVerb(
  verb: 'draw' | 'discard' | 'gainLife' | 'loseLife' | 'gainEnergy' | 'shuffle' | 'mill',
): Lowering<IrClause, Effects> {
  return {
    head: verb,
    id: `lower.${verb}`,
    needs: [`effect:${verb}`],
    lower(clause, ctx) {
      const who = arg(clause, 'player');
      if (who?.kind !== 'noun') return failure(clause);
      const player = playerSelectorOf(who, ctx);
      if (!player.ok) return player;
      if (verb === 'shuffle') {
        return { ok: true, value: [{ kind: 'shuffle', player: player.value }], rule: clause.rule };
      }
      // "Discard their hand" (stage P52, D-210, CR 701.9): as many cards as the hand holds, counted as the instruction comes up.
      if (verb === 'discard' && arg(clause, 'hand') !== undefined) {
        const blocked = missingFeatures(['amount:countOf']);
        if (blocked.length > 0) return failure(clause, blocked);
        return {
          ok: true,
          value: [
            {
              kind: 'discard',
              player: player.value,
              count: { kind: 'countOf', filter: { zone: 'hand', controller: 'you' } },
            },
          ],
          rule: clause.rule,
        };
      }
      const amount = amountArg(clause, 'amount', ctx);
      if (!amount.ok) return amount;
      // "Each opponent loses life equal to the life that player lost this turn" (D-1112, CR 119.3): the amount of another player than "you" (who is "that
      // player"), of a loss of life; each affected player's own number.
      if (typeof amount.value === 'object' && amount.value.kind === 'lifeLostThisTurn') {
        if (verb !== 'loseLife' || player.value.kind === 'you') return failure(clause);
      }
      // "Discard any number of cards" (stage P34, D-152, CR 701.9): the player chooses none, some or all of the hand; what was discarded
      // is what "that many" counts afterwards.
      if (verb === 'discard' && arg(clause, 'anyNumber') !== undefined) {
        ctx.thisWay = 'discarded';
        return {
          ok: true,
          value: [{ kind: 'discard', player: player.value, count: 0, anyNumber: true }],
          rule: clause.rule,
        };
      }
      // "Discard two cards unless you discard an artifact card" (stage P31, D-140, CR 701.9): the one card of a kind instead.
      const unless = arg(clause, 'unless');
      if (unless !== undefined) {
        if (verb !== 'discard' || unless.kind !== 'noun') return failure(clause);
        const filter = lowerFilter(unless);
        if (!filter.ok) return filter;
        return {
          ok: true,
          value: [
            { kind: 'discard', player: player.value, count: amount.value, unless: filter.value },
          ],
          rule: clause.rule,
        };
      }
      // "Discard a card at random" (stage P51, D-209, CR 701.9b): nobody chooses which.
      const random = arg(clause, 'random');
      if (random !== undefined) {
        if (verb !== 'discard' || random.kind !== 'flag' || !random.value) return failure(clause);
        return {
          ok: true,
          value: [{ kind: 'discard', player: player.value, count: amount.value, random: true }],
          rule: clause.rule,
        };
      }
      // D-327: "Mill a card. You may play that card this turn.": the cards the controller milled are what "that card" of the sentence after it names.
      if (verb === 'mill' && player.value.kind === 'you') ctx.exiled = 'milled';
      const effect: Effect =
        verb === 'draw' || verb === 'discard' || verb === 'mill'
          ? { kind: verb, player: player.value, count: amount.value }
          : { kind: verb, player: player.value, amount: amount.value };
      return { ok: true, value: [effect], rule: clause.rule };
    },
  };
}

/**
 * "Manifest the top card of your library." and "Its controller manifests the top card of their library." (CR 701.40a, D-314): the player the clause names puts the top card of
 * their library onto the battlefield face down.
 */
const MANIFEST: Lowering<IrClause, Effects> = {
  head: 'manifest',
  id: 'lower.manifest',
  needs: ['effect:manifest'],
  lower(clause, ctx) {
    const who = arg(clause, 'player');
    if (who?.kind !== 'noun') return failure(clause);
    const player = playerSelectorOf(who, ctx);
    if (!player.ok) return player;
    return { ok: true, value: [{ kind: 'manifest', player: player.value }], rule: clause.rule };
  },
};

/**
 * "You draw a card at the beginning of the next turn's upkeep." (CR 603.7, stage P26, D-128): the engine's
 * `delayedTrigger` at the upkeep of each turn (`whose: 'each'`, the next one to begin, whoever's it is), whose effect
 * is the draw by the controller (the grammar reads "you" only). The amount is a fixed number of at least 1, as
 * `validateCard` requires of a delayed effect.
 */
const DELAYED_DRAW: Lowering<IrClause, Effects> = {
  head: 'delayedDraw',
  id: 'lower.delayedDraw',
  needs: ['effect:delayedTrigger', 'effect:draw'],
  lower(clause, ctx) {
    const who = arg(clause, 'player');
    if (who?.kind !== 'noun') return failure(clause);
    const player = playerSelectorOf(who, ctx);
    if (!player.ok) return player;
    if (player.value.kind !== 'you') return failure(clause);
    const amount = amountArg(clause, 'amount', ctx);
    if (!amount.ok) return amount;
    if (
      typeof amount.value !== 'number' ||
      !Number.isSafeInteger(amount.value) ||
      amount.value < 1
    ) {
      return failure(clause);
    }
    return {
      ok: true,
      value: [
        {
          kind: 'delayedTrigger',
          at: { step: 'upkeep', whose: 'each' },
          effect: { kind: 'draw', player: player.value, count: amount.value },
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "You become the monarch" (CR 725.1, stage P25, D-127): the engine's effect names the one player, here the
 * controller (the grammar reads "you" only).
 */
const BECOME_MONARCH: Lowering<IrClause, Effects> = {
  head: 'becomeMonarch',
  id: 'lower.becomeMonarch',
  needs: ['effect:becomeMonarch'],
  lower(clause, ctx) {
    const who = arg(clause, 'player');
    if (who?.kind !== 'noun') return failure(clause);
    const player = playerSelectorOf(who, ctx);
    if (!player.ok) return player;
    return {
      ok: true,
      value: [{ kind: 'becomeMonarch', player: player.value }],
      rule: clause.rule,
    };
  },
};

/**
 * "Scry 2", "Surveil 1", "look at the top three cards of your library, then put them back in any
 * order" and "put two cards from your hand on top of your library" (CR 701.22a, 701.25a, 401.2,
 * 401.4): the engine's own nodes, always about the controller's library, so no player is named.
 */
function libraryVerb(
  verb: 'scry' | 'surveil' | 'lookAndReorder' | 'putFromHandOnTop',
): Lowering<IrClause, Effects> {
  return {
    head: verb,
    id: `lower.${verb}`,
    needs: [`effect:${verb}`],
    lower(clause, ctx) {
      const count = amountArg(clause, 'count', ctx);
      if (!count.ok) return count;
      return { ok: true, value: [{ kind: verb, count: count.value }], rule: clause.rule };
    },
  };
}

/**
 * "Look at the top three cards of your library. Put one of them into your hand, put one of them on the bottom of your library, and exile one of them."
 * (stage P63, D-216, CR 401.2, 608.2c): the engine's `lookAndSplit` of the controller's own library. The card it exiles is what "the exiled card" of
 * the sentence after it names (`mayPlay`).
 */
const LOOK_AND_SPLIT: Lowering<IrClause, Effects> = {
  head: 'lookAndSplit',
  id: 'lower.look-and-split',
  needs: ['effect:lookAndSplit'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    const piles = (['hand', 'bottom', 'exile'] as const).map((name) => arg(clause, name));
    if (!count.ok) return count;
    const [hand, bottom, exile] = piles.map((p) => (p?.kind === 'number' ? p.value : Number.NaN));
    if (hand === undefined || bottom === undefined || exile === undefined) return failure(clause);
    if ([hand, bottom, exile].some((n) => !Number.isInteger(n))) return failure(clause);
    // "You may play the exiled card this turn" after it: the one card the instruction exiled.
    ctx.exiled = 'top';
    return {
      ok: true,
      value: [{ kind: 'lookAndSplit', count: count.value, hand, bottom, exile }],
      rule: clause.rule,
    };
  },
};

/**
 * "Each player sacrifices all permanents they control that are one or more colors", "each opponent sacrifices all creatures they
 * control" (stage P31, D-140, CR 701.21a, 101.4): each permanent of the kind is sacrificed by its controller at once, nobody choosing.
 * The engine's `sacrifice` of an `each` selector with no `player`: "each player" leaves the controller open, "each opponent" is the
 * permanents an opponent of the controller controls. Another subject (a target player, "you") is not lowered.
 */
function lowerSacrificeAll(clause: IrClause, what: IrNoun): LowerResult<Effects> {
  const who = arg(clause, 'player');
  if (who?.kind !== 'noun' || (who.det !== 'eachPlayer' && who.det !== 'eachOpponent')) {
    return failure(clause);
  }
  const blocked = missingFeatures(['selector:each', `selector:${who.det}`]);
  if (blocked.length > 0) return failure(clause, blocked);
  const filter = lowerFilter(what);
  if (!filter.ok) return filter;
  const controller = who.det === 'eachOpponent' ? { controller: 'opponent' as const } : {};
  return {
    ok: true,
    value: [
      { kind: 'sacrifice', objects: { kind: 'each', filter: { ...filter.value, ...controller } } },
    ],
    rule: clause.rule,
  };
}

/**
 * "Look at the top six cards of your library. You may reveal an artifact card from among them and put it into your hand. Put the rest on
 * the bottom of your library in a random order." (stage P31, D-140, CR 401.2, 701.20a): the engine's `lookAtTop`, the controller's own
 * library, one card of the kind at most, the rest on the bottom in a random order or into the graveyard. The kind describes a card in a
 * library: no zone or controller.
 */
const LOOK_TAKE: Lowering<IrClause, Effects> = {
  head: 'lookTake',
  id: 'lower.look-take',
  needs: ['effect:lookAtTop'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    const take = arg(clause, 'take');
    const toGraveyard = arg(clause, 'toGraveyard');
    if (take?.kind !== 'noun' || toGraveyard?.kind !== 'flag') return failure(clause);
    const filter = lowerFilter(take);
    if (!filter.ok) return filter;
    // Stage P32 (D-147, CR 401.2, 701.20a): the card taken may go onto the battlefield ("and put it onto the battlefield"), and may
    // have a mana value no greater than an amount read as the effect resolves ("with mana value less than or equal to the number of
    // lands you control").
    const onto = arg(clause, 'ontoBattlefield');
    const toBattlefield = onto?.kind === 'flag' && onto.value;
    const top = arg(clause, 'onTop');
    const onTop = top?.kind === 'flag' && top.value;
    let atMost: Amount | undefined;
    if (arg(clause, 'manaValueAtMost') !== undefined) {
      const lowered = amountArg(clause, 'manaValueAtMost', ctx);
      if (!lowered.ok) return lowered;
      atMost = lowered.value;
    }
    return {
      ok: true,
      value: [
        {
          kind: 'lookAtTop',
          count: count.value,
          take: {
            filter: filter.value,
            max: 1,
            ...(toBattlefield ? { to: 'battlefield' as const } : {}),
            ...(atMost === undefined ? {} : { manaValueAtMost: atMost }),
          },
          // "Look at the top card of your library. If it's a creature card of the chosen type, you may reveal it and put it into your hand."
          // (stage P34, D-152): the card looked at stays on top of the library unless it is taken.
          rest: toGraveyard.value ? 'graveyard' : onTop ? 'top' : 'bottomRandom',
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Look at the top five cards of your library. Put two of them into your hand and the rest on the bottom of your library in any order." (Stock Up, D-324, CR 401.2, 401.4,
 * 701.20a): the engine's `lookAtTop`, the controller's own library, exactly `taken` cards of any kind put into the hand without being revealed, the rest on the bottom in the order
 * the controller chooses.
 */
const LOOK_TAKE_BOTTOM: Lowering<IrClause, Effects> = {
  head: 'lookTakeBottom',
  id: 'lower.look-take-bottom',
  needs: ['effect:lookAtTop'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    const taken = arg(clause, 'taken');
    if (!count.ok) return count;
    if (taken?.kind !== 'number') return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'lookAtTop',
          count: count.value,
          take: { filter: {}, max: taken.value, min: taken.value, hidden: true },
          rest: 'bottomChosen',
        },
      ],
      rule: clause.rule,
    };
  },
};

/** "Sacrifice ~" or "sacrifice another permanent / a creature" (CR 701.21). */
const SACRIFICE: Lowering<IrClause, Effects> = {
  head: 'sacrifice',
  id: 'lower.sacrifice',
  needs: ['effect:sacrifice'],
  lower(clause, ctx) {
    const what = arg(clause, 'objects');
    if (what?.kind !== 'noun') return failure(clause);
    ctx.thisWay = 'sacrificed';
    // "Each player sacrifices all permanents they control that are one or more colors" (stage P31, D-140, CR 701.21a): every
    // permanent of the kind goes with its own controller, the engine's `each` selector with no `player`.
    if (what.det === 'each' && what.rule === 'noun.all-they-control') {
      return lowerSacrificeAll(clause, what);
    }
    // The permanent itself is sacrificed by its controller, never by "each player".
    if (arg(clause, 'player') !== undefined && what.det !== 'a') return failure(clause);
    // "Sacrifice it" (stage P23) is the permanent itself only when the binding pass made "it" `~`; "it" as a
    // target or as another object is not something its controller can be said to control (CR 701.21a).
    const itself = what.det === 'self' || (what.det === 'anaphor' && what.ref === 'self');
    if (itself) {
      const ref = objectRefOf({ ...what, det: 'self' }, ctx);
      if (!ref.ok) return ref;
      return { ok: true, value: [{ kind: 'sacrifice', objects: ref.value }], rule: clause.rule };
    }
    if (what.det !== 'a') return failure(clause);
    // "Any number of other permanents" and "a creature with the greatest power among creatures they control" (stage P30, D-135).
    const blocked = missingFeatures([
      'selector:choose',
      ...(what.anyNumber === true ? (['selector:anyNumber'] as const) : []),
      ...(what.atLeastOne === true ? (['selector:atLeastOne'] as const) : []),
      ...(what.greatest !== undefined ? (['selector:greatest'] as const) : []),
    ]);
    if (blocked.length > 0) return failure(clause, blocked);
    const filter = lowerFilter(what);
    if (!filter.ok) return filter;
    const count = what.count?.kind === 'number' ? what.count.value : 1;
    // "... When you do, ~ deals damage equal to that creature's power" (stage P36, D-178, CR 603.12, 608.2h): the one permanent chosen is what
    // "that creature" means in an amount that follows, the engine's `sacrificed`.
    ctx.sacrificedRef =
      count === 1 && what.anyNumber !== true && !what.plural ? (what.ref ?? null) : null;
    const chosen: ChooseSelector = {
      kind: 'choose',
      filter: filter.value,
      ...(what.anyNumber === true ? { anyNumber: true as const } : {}),
      ...(what.atLeastOne === true ? { atLeastOne: true as const } : {}),
      ...(what.greatest === undefined ? {} : { greatest: what.greatest }),
      ...(count > 1 && what.anyNumber !== true ? { count } : {}),
    };
    // "Each player sacrifices a creature of their choice." (stage P28, CR 701.21a, 101.4): each player the noun names
    // chooses among the permanents they control, in the order of CR 101.4.
    const who = arg(clause, 'player');
    let by: { player?: PlayerSelector } = {};
    if (who !== undefined) {
      if (who.kind !== 'noun') return failure(clause);
      const player = playerSelectorOf(who, ctx);
      if (!player.ok) return player;
      by = { player: player.value };
    }
    return {
      ok: true,
      value: [{ kind: 'sacrifice', objects: chosen, ...by }],
      rule: clause.rule,
    };
  },
};

/**
 * "Attach ~ to target creature you control" (CR 701.3): `~` is an Aura or Equipment that is on the
 * battlefield, and the destination one target. A spell cannot attach itself, a permanent that is
 * gone cannot be attached, and the engine's attach moves one object to one other.
 */
const ATTACH: Lowering<IrClause, Effects> = {
  head: 'attach',
  id: 'lower.attach',
  needs: ['effect:attach'],
  lower(clause, ctx) {
    const object = arg(clause, 'object');
    const to = arg(clause, 'to');
    if (object?.kind !== 'noun' || to?.kind !== 'noun') return failure(clause);
    if (ctx.owner === 'spell' || ctx.selfGone) return failure(clause);
    if (to.plural || to.upTo || (to.count?.kind === 'number' && to.count.value !== 1)) {
      return failure(clause);
    }
    const what = objectRefOf(object, ctx);
    if (!what.ok) return what;
    if (what.value.kind !== 'this') return failure(clause);
    const onto = objectRefOf(to, ctx, { token: true });
    if (!onto.ok) return onto;
    return {
      ok: true,
      value: [{ kind: 'attach', object: what.value, to: onto.value }],
      rule: clause.rule,
    };
  },
};

/** "Put a +1/+1 counter on ~" (CR 122.6). */
const ADD_COUNTERS: Lowering<IrClause, Effects> = {
  head: 'addCounters',
  id: 'lower.add-counters',
  needs: ['effect:addCounters'],
  takesObjectTest: true,
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    const counter = arg(clause, 'counter');
    if (counter?.kind !== 'counterSpec') return failure(clause);
    return eachObject(
      clause,
      ctx,
      (objects) => ({
        kind: 'addCounters',
        objects,
        counter: counter.name,
        count: count.value,
      }),
      'objects',
      { triggerSubject: true, moved: true, token: true },
    );
  },
};

/**
 * "Create a Treasure token", "create two 1/1 white Soldier creature tokens" (CR 111.2, 111.10).
 * A predefined token the engine cannot run (Food and Clue carry abilities it cannot activate yet,
 * Map and Blood are not in the AST) is reported with `token:<name>`.
 */
const CREATE_TOKEN: Lowering<IrClause, Effects> = {
  head: 'createToken',
  id: 'lower.create-token',
  needs: ['effect:createToken', 'effect:chooseOne'],
  lower(clause, ctx) {
    const other = arg(clause, 'alternative');
    if (other === undefined) return lowerCreateToken(clause, ctx);
    return lowerEitherToken(clause, other, ctx);
  },
};

/**
 * "Create a Food token or a Treasure token" (stage P35, D-176, CR 608.2d): the controller chooses which of the two is created as the
 * instruction resolves, the engine's `chooseOne` of two `createToken`. Each is a predefined token of one, worded for the choice as the
 * instruction it is ("create a Food token").
 */
function lowerEitherToken(
  clause: IrClause,
  other: IrClause['args'][string],
  ctx: LowerContext,
): LowerResult<Effects> {
  const first = arg(clause, 'token');
  if (first?.kind !== 'token' || other.kind !== 'token') return failure(clause);
  const options: { label: string; effect: Effect }[] = [];
  for (const token of [first, other]) {
    if (token.predefined === undefined) return failure(clause);
    const made = lowerCreateToken({ ...clause, args: { ...clause.args, token } }, ctx);
    if (!made.ok) return made;
    const [effect, ...rest] = made.value;
    if (effect?.kind !== 'createToken' || rest.length > 0 || effect.count !== 1) {
      return failure(clause);
    }
    options.push({ label: `create a ${token.predefined} token`, effect });
  }
  const blocked = missingFeatures(['effect:chooseOne']);
  if (blocked.length > 0) return failure(clause, blocked);
  return { ok: true, value: [{ kind: 'chooseOne', options }], rule: clause.rule };
}

/** The name of a created token, with the card's own short name where the text said the tilde (D-266); null when that name is not known here. */
function ownTokenName(named: string, ctx: LowerContext): string | null {
  if (!named.includes('~')) return named;
  return ctx.selfName === '' ? null : named.split('~').join(ctx.selfName);
}

function lowerCreateToken(clause: IrClause, ctx: LowerContext): LowerResult<Effects> {
  const token = arg(clause, 'token');
  if (token?.kind !== 'token') return failure(clause);
  const count = lowerAmount(token.count, ctx, clause.rule);
  if (!count.ok) return count;
  const at = { at: token.span, rule: token.rule };
  // "Create two tapped Treasure tokens" (stage P28, CR 110.5b, D-131): the tokens enter tapped.
  if (token.tapped === true) {
    const missing = missingFeatures(['token:tapped']);
    if (missing.length > 0) return { ok: false, needs: missing, ...at };
  }
  const entersTapped = token.tapped === true ? { tapped: true as const } : {};
  // "Its controller creates ...": the token is created under that player's control (CR 111.2).
  const who = arg(clause, 'player');
  let by: { controller?: PlayerSelector } = {};
  if (who !== undefined) {
    if (who.kind !== 'noun' || token.copyOf !== undefined) return failure(clause);
    const selector = playerSelectorOf(who, ctx);
    if (!selector.ok) return selector;
    // "You create ..." is the controller of the ability, which is who creates a token unless the node says otherwise.
    if (selector.value.kind !== 'you') by = { controller: selector.value };
  }
  if (token.copyOf !== undefined) return lowerCopyToken(token, token.copyOf, clause, ctx);
  if (token.predefined !== undefined) {
    const name = token.predefined;
    const blocked = missingFeatures([`token:${name}`]);
    if (blocked.length > 0) return { ok: false, needs: blocked, ...at };
    if (name === 'Map' || name === 'Blood') return { ok: false, needs: [`token:${name}`], ...at };
    return {
      ok: true,
      value: [
        {
          kind: 'createToken',
          token: { kind: 'preset', preset: name },
          count: count.value,
          ...entersTapped,
          ...by,
        },
      ],
      rule: clause.rule,
    };
  }
  const blocked = missingFeatures(['token:custom']);
  if (blocked.length > 0) return { ok: false, needs: blocked, ...at };
  const colors: Color[] = [];
  for (const word of token.colors ?? []) {
    const letter = colorLetter(word);
    if (letter === undefined) return { ok: false, needs: [], ...at };
    colors.push(letter);
  }
  const types = (token.types ?? []) as CardType[];
  const creature = types.includes('creature');
  if (!creature || token.power === undefined || token.toughness === undefined) {
    return { ok: false, needs: [], ...at };
  }
  const subtypes = [...(token.subtypes ?? [])];
  // "with flying": a keyword ability of the token itself (CR 702), one for each word.
  const abilities: Ability[] = [];
  for (const word of token.keywords ?? []) {
    // "with flying and devour 2" (stage P40, D-186, CR 702.82a): the one keyword of a token that takes a number.
    const devour = /^devour ([1-9]\d*)$/.exec(word);
    if (devour !== null) {
      const unsupportedDevour = missingFeatures(['ability:keyword', 'keyword:devour']);
      if (unsupportedDevour.length > 0) return { ok: false, needs: unsupportedDevour, ...at };
      abilities.push({ kind: 'keyword', keyword: { kind: 'devour', count: Number(devour[1]) } });
      continue;
    }
    const kind = keywordKind(word);
    if (kind === undefined) return { ok: false, needs: [], ...at };
    const unsupported = missingFeatures(['ability:keyword', `keyword:${kind}`]);
    if (unsupported.length > 0) return { ok: false, needs: unsupported, ...at };
    abilities.push({ kind: 'keyword', keyword: plainKeyword(kind) });
  }
  // "with \"When ~ dies, you gain 1 life.\"" (stage P35, D-176, CR 111.4, 113.1): the abilities in quotes, the token's own.
  for (const quoted of token.abilities ?? []) {
    const own = lowerTokenAbility(quoted, types, subtypes, ctx);
    if (!own.ok) return own;
    abilities.push(own.value);
  }
  // CR 111.4: the name the effect gives the token. "named ~'s Pridemate" (D-266): the card's own short name, which normalization wrote as the tilde;
  // a context that does not know it (a quoted ability, where the tilde is the token) refuses the name instead of guessing.
  const named = token.named === undefined ? undefined : ownTokenName(token.named, ctx);
  if (named === null) return { ok: false, needs: [], ...at };
  const definition: TokenDefinition = {
    // CR 111.4: the name the effect gives the token, or else its creature types.
    name: named ?? subtypes.join(' '),
    manaCost: null,
    supertypes: token.legendary === true ? ['legendary'] : [],
    types,
    subtypes,
    colors,
    power: token.power,
    toughness: token.toughness,
    loyalty: null,
    defense: null,
    // The words of the token's abilities, which the card face prints (CR 111.4): its keywords on one line, then each ability in
    // quotes as the card writes it. A token with no abilities has no text.
    oracleText: tokenRulesText(token.keywords ?? [], token.abilities ?? [], named),
    abilities,
  };
  return {
    ok: true,
    value: [
      {
        kind: 'createToken',
        token: { kind: 'custom', definition },
        count: count.value,
        ...entersTapped,
        ...by,
      },
    ],
    rule: clause.rule,
  };
}

export const EFFECT_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  SACRIFICE,
  ADD_COUNTERS,
  CREATE_TOKEN,
  DAMAGE,
  simple('destroy'),
  simple('exile'),
  RETURN,
  PUT_LIBRARY,
  PUT_FROM_ZONE,
  TAP_CHOSEN,
  UNTAP_CHOSEN,
  RESELECT_ATTACK,
  MAY_CAST,
  simple('counter'),
  COUNTER_UNLESS,
  simple('tap'),
  simple('untap'),
  simple('transform'),
  REGENERATE,
  ADD_MANA,
  CHOOSE_COLOR,
  playerVerb('draw'),
  playerVerb('discard'),
  playerVerb('gainLife'),
  playerVerb('gainEnergy'),
  playerVerb('loseLife'),
  playerVerb('mill'),
  MANIFEST,
  playerVerb('shuffle'),
  BECOME_MONARCH,
  DELAYED_DRAW,
  COPY_SPELL,
  CHANGE_TARGET,
  libraryVerb('scry'),
  libraryVerb('surveil'),
  libraryVerb('lookAndReorder'),
  LOOK_AND_SPLIT,
  libraryVerb('putFromHandOnTop'),
  LOOK_TAKE,
  LOOK_TAKE_BOTTOM,
  PUMP,
  GRANT_KEYWORD,
  RESTRICT,
  LOSE_ALL_ABILITIES,
  BECOMES,
  SET_PT,
  FLICKER,
  DELAYED_RETURN,
  DELAYED_RETURN_AT_UPKEEP,
  SEARCH,
  PREVENT_DAMAGE,
  ATTACH,
  ...DINOSAUR_LOWERINGS,
  ...ANGEL_LOWERINGS,
  ...ARDEN_LOWERINGS,
  ...VRASKA_LOWERINGS,
  ...HOFRI_LOWERINGS,
  ...PILES_LOWERINGS,
  ...DAWNBREAK_LOWERINGS,
  ...EDHREC_LOWERINGS,
  ...DRAGON_LOWERINGS,
  ...KORVOLD_LOWERINGS,
  ...NIV_LOWERINGS,
  ...NIV_GROUP_3_C_LOWERINGS,
  ...PLANESWALKER_LOWERINGS,
  ...DESTINY_LOWERINGS,
  ...MELD_LOWERINGS,
  GAIN_STATIC_ABILITY,
  GAIN_CONTROL,
];

const BY_VERB = new Map(EFFECT_LOWERINGS.map((l) => [l.head, l]));

/** Lowers one clause: the engine features first, then the node. */
export function lowerClause(clause: IrClause, ctx: LowerContext): LowerResult<Effects> {
  const lowering = BY_VERB.get(clause.verb);
  if (lowering === undefined) return failure(clause);
  const missing = missingFeatures(lowering.needs);
  if (missing.length > 0) return failure(clause, missing);
  // The engine has no "you may" or conditions on spell effects yet; a clause that carries one is
  // not lowered rather than half-run.
  if (clause.condition?.test.kind === 'objectMatches' && lowering.takesObjectTest === true) {
    // "Put a +1/+1 counter on it if it's a creature" (group 4 of the Vraska deck, CR 608.2c): the test is read when the instruction comes up.
    const blocked = missingFeatures(['effect:conditional']);
    if (blocked.length > 0) return failure(clause, blocked);
    const test = lowerCondition(clause.condition, false, ctx);
    if (!test.ok) return test;
    const { condition: _test, ...plain } = clause;
    const inner = lowering.lower(plain, ctx);
    if (!inner.ok) return inner;
    return {
      ok: true,
      value: inner.value.map(
        (effect): Effect => ({ kind: 'conditional', condition: test.value, effect }),
      ),
      rule: clause.rule,
    };
  }
  if (clause.condition !== undefined) {
    const test = clause.condition.test.kind;
    // The IR's "if you control N or more ..." is the engine's `controlsAtLeast`.
    const kind =
      test === 'control'
        ? 'controlsAtLeast'
        : test === 'designation'
          ? 'playerHasDesignation'
          : test === 'opponentControls'
            ? 'opponentControlsAtLeast'
            : test === 'sameName'
              ? 'sameNameAtLeast'
              : test === 'attachedTo' || test === 'putThisWay'
                ? 'objectMatches'
                : test === 'discardedThisWay'
                  ? 'thisWayAtLeast'
                  : test;
    return failure(
      clause,
      kind === 'raw' || kind === 'hadCounters' || kind === 'declined' || kind === 'unlessReturn'
        ? []
        : missingFeatures([`condition:${kind}`]),
    );
  }
  // Only the verbs that read `duration` take one ("until end of turn" on a tap or a destroy is
  // not something the engine would apply), and the engine runs only some durations.
  if (clause.duration !== undefined && lowering.takesDuration !== true) {
    // "until your next end step" is only the length of a permission to play exiled cards (stage P34), and so is "for as long as they remain exiled"
    // (stage P41): no other duration of the engine says them.
    const scope = clause.duration.scope;
    return failure(
      clause,
      scope === 'untilYourNextEndStep' ||
        scope === 'whileExiled' ||
        scope === 'whileYouControlSelf' ||
        scope === 'whileSelfRemains'
        ? []
        : missingFeatures([`duration:${scope}`]),
    );
  }
  // A permission ("you may play that card") is no choice the engine asks about: the clause is read with or without the words.
  if (clause.optional && lowering.acceptsOptional !== true) return failure(clause);
  return lowering.lower(clause, ctx);
}
