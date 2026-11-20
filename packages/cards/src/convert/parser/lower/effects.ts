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
import { ADAPT_LOWERINGS } from './adapt';
import { ADDITIONAL_LAND_LOWERINGS } from './additional-land';
import { lowerAmount } from './amounts';
import { ANGEL_LOWERINGS } from './angels';
import { ARDEN_LOWERINGS } from './arden';
import { AURA_GRAVEYARD_LOWERINGS } from './aura-graveyard';
import { lowerAuraToken } from './aura-token';
import { CHANGE_TARGET } from './change-target';
import { CHOSEN_COLOR_MANA_LOWERINGS } from './chosen-color-mana';
import { amountArg, arg, type Effects, eachObject, failure, operand } from './clauses';
import { lowerCondition } from './conditions';
import {
  BECOMES,
  DELAYED_RETURN,
  DELAYED_RETURN_AT_UPKEEP,
  DELAYED_RETURN_THIS_CARD,
  DELAYED_RETURN_THIS_CARD_ATTACHED,
  DELAYED_RETURN_TO_BATTLEFIELD,
  DELAYED_RETURN_TO_HAND,
  FLICKER,
  GAIN_ALL_CREATURE_TYPES,
  GRANT_KEYWORD,
  LOSE_ALL_ABILITIES,
  LOSE_HEXPROOF_SHROUD,
  RESTRICT,
  SET_PT,
} from './continuous';
import { GAIN_CONTROL } from './control';
import { CONTROLLER_DAMAGE_LOWERINGS } from './controller-damage';
import { lowerCopyToken } from './copies';
import { COPY_ONE_OF_THEM_LOWERINGS } from './copy-one-of-them';
import { COPY_SPELL, EXILE_ON_RESOLVE } from './copy-spell';
import { lowerCost } from './costs';
import { DACK_LOWERINGS } from './dack';
import { DAMAGE_BATCH_LOWERINGS } from './damage-batch';
import { DANITHA_G1B_LOWERINGS } from './danitha-g1b';
import { DANITHA_G2_LOWERINGS } from './danitha-g2';
import { DAWNBREAK_LOWERINGS } from './dawnbreak';
import { DEATH_TOLL_B_LOWERINGS } from './death-toll-b';
import { DEATH_TOLL_C_LOWERINGS } from './death-toll-c';
import { DEATH_TOLL_WINTER_LOWERINGS } from './death-toll-winter';
import { DESTINY_LOWERINGS } from './destiny';
import { DINOSAUR_LOWERINGS } from './dinosaurs';
import { DRAGON_LOWERINGS } from './dragons';
import { EDHREC_LOWERINGS } from './edhrec';
import { PUMP, SEARCH } from './effects-more';
import { ENCHANTED_PLAYER_LOWERINGS } from './enchanted-player';
import { EXILE_OWN_GRAVEYARD_LOWERINGS } from './exile-own-graveyards';
import { EXILED_WITH_LOWERINGS } from './exiled-with';
import { FEATHER_G2_LOWERINGS } from './feather-g2';
import { missingFeatures } from './features';
import { FINALE_LOWERINGS } from './finale';
import { FLASH_PERMISSION_LOWERINGS } from './flash-permission';
import { GALADRIEL_G1_LOWERINGS } from './galadriel-g1';
import { GALADRIEL_G3_LOWERINGS } from './galadriel-g3';
import { GIDEON_LOWERINGS } from './gideon';
import { GISA_G4_LOWERINGS } from './gisa-g4';
import { GRANT_ABILITY } from './granted-ability';
import { GAIN_STATIC_ABILITY } from './granted-static';
import { GRAVEYARD_CAST_LOWERINGS } from './graveyard-cast';
import { GRAVEYARD_CHOICE_LOWERINGS } from './graveyard-choice';
import { GRAVEYARD_COPY_LOWERINGS } from './graveyard-copy';
import { HASHATON_G5_LOWERINGS } from './hashaton-g5';
import { HASHATON_G7_LOWERINGS } from './hashaton-g7';
import { HASHATON_G9_LOWERINGS } from './hashaton-g9';
import { HASHATON_GROUP_4_LOWERINGS } from './hashaton-group-4';
import { HOFRI_LOWERINGS } from './hofri';
import { HYLDA_G2_LOWERINGS } from './hylda-g2';
import { HYLDA_G3_LOWERINGS } from './hylda-g3';
import { JESKAI_CASTFREE_LOWERINGS } from './jeskai-castfree';
import { JESKAI_FLASHBACK_LOWERINGS } from './jeskai-flashback';
import { KORVOLD_LOWERINGS } from './korvold';
import { LOOK_ELSE_LOWERINGS } from './look-else';
import { LOREHOLD_G1_LOWERINGS } from './lorehold-g1';
import { LOREHOLD_G2_LOWERINGS } from './lorehold-g2';
import { MELD_LOWERINGS } from './meld';
import { MOVE_COUNTERS_LOWERINGS } from './move-counters';
import { NEXT_SPELL_LOWERINGS } from './next-spell';
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
import { PLAYER_MANA_ABILITY_LOWERINGS } from './player-mana-ability';
import { POPULATE_LOWERINGS } from './populate';
import { PREPARE_LOWERINGS } from './prepare';
import { PREVENT_DAMAGE } from './prevent';
import { PRISMARI_G1_LOWERINGS } from './prismari-g1';
import { PRISMARI_G2_LOWERINGS } from './prismari-g2';
import { PRISMARI_G3_LOWERINGS } from './prismari-g3';
import { PUT_MILLED_LOWERINGS } from './put-milled';
import { QUANDRIX_LOWERINGS } from './quandrix';
import { QUANDRIX_D1_LOWERINGS } from './quandrix-d1';
import { QUANDRIX_D2_LOWERINGS } from './quandrix-d2';
import { QUANDRIX_G_LOWERINGS } from './quandrix-g';
import { QUICK_DRAW_LOWERINGS } from './quick-draw';
import { RAMP_LANDS_LOWERINGS } from './ramp-lands';
import { RETURN_CONTROL_LOWERINGS } from './return-control';
import { REVEAL_TAKE_LOWERINGS } from './reveal-take';
import { REVEAL_TOP_DUEL_LOWERINGS } from './reveal-top-duel';
import { SEARCH_PAIR_LOWERINGS } from './search-pair';
import { lowerTokenAbility, tokenRulesText } from './tokens';
import { TROYAN_G4_LOWERINGS } from './troyan-g4';
import type { LowerContext, LowerFailure, Lowering, LowerResult } from './types';
import { UNBOUND_I_LOWERINGS } from './unbound-i';
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

/**
 * "Choose an opponent at random that ~ didn't attack during your last combat. ~ attacks that player this combat if able. If you can't choose an opponent this way, tap ~." (CR 508.1d,
 * 701.26a): the engine's `attackRandomOpponent` of the creature the ability belongs to.
 */
const ATTACK_RANDOM_OPPONENT: Lowering<IrClause, Effects> = {
  head: 'attackRandomOpponent',
  id: 'lower.attack-random-opponent',
  needs: ['effect:attackRandomOpponent'],
  lower: (clause) => ({
    ok: true,
    value: [{ kind: 'attackRandomOpponent', creature: { kind: 'this' } }],
    rule: clause.rule,
  }),
};

/** "Choose an opponent at random. ~ attacks that player this combat if able." (CR 508.1d): the engine's `attackRandomOpponent` with `anyOpponent`. */
const ATTACK_RANDOM_OPPONENT_ANY: Lowering<IrClause, Effects> = {
  head: 'attackRandomOpponentAny',
  id: 'lower.attack-random-opponent-any',
  needs: ['effect:attackRandomOpponent'],
  lower: (clause) => ({
    ok: true,
    value: [{ kind: 'attackRandomOpponent', creature: { kind: 'this' }, anyOpponent: true }],
    rule: clause.rule,
  }),
};

/** "Goad target creature", "goad it", "goad each creature target player controls" (CR 701.15a, D-639, D-651): the engine's `goad` on what the operand names. */
const GOAD: Lowering<IrClause, Effects> = {
  head: 'goad',
  id: 'lower.goad',
  needs: ['effect:goad'],
  lower(clause, ctx) {
    const operandNoun = operand(clause, 'objects');
    if (operandNoun?.kind !== 'noun') return failure(clause);
    const object = objectSelectorOf(operandNoun, ctx, { moved: true, token: true });
    if (!object.ok) return object;
    // "The tokens are goaded for the rest of the game" (CR 701.15a, 611.2b): no end.
    const forever = arg(clause, 'forever');
    return {
      ok: true,
      value: [
        {
          kind: 'goad',
          objects: object.value,
          ...(forever?.kind === 'flag' && forever.value ? { forever: true as const } : {}),
        },
      ],
      rule: clause.rule,
    };
  },
};

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
        // D-446 (CR 115.3, 601.2c): "Target creature you control deals damage equal to its power to another target creature": "another" is a target that is not the target
        // of the slot before it, the creature that deals the damage; the engine's `differentFrom`.
        if (from.kind === 'target' && item.det === 'target' && itemsOf(to).length === 1) {
          const apart = recipientOf({ ...item, other: false, otherTarget: true }, ctx);
          if (!apart.ok) return apart;
          effects.push({ kind: 'dealDamage', amount: amount.value, to: apart.value, from });
          continue;
        }
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
  if (filter.value.controller !== 'you' && filter.value.zone !== 'graveyard')
    return failure(clause);
  const count = what.count?.kind === 'number' ? what.count.value : undefined;
  if (what.upTo === true && (count === undefined || filter.value.zone !== 'graveyard')) {
    return failure(clause);
  }
  return {
    ok: true,
    value: [
      {
        kind: 'moveToZone',
        objects: {
          kind: 'choose',
          filter: filter.value,
          ...(count === undefined ? {} : { count }),
          ...(what.upTo === true ? { optional: true } : {}),
        },
        to: 'hand',
      },
    ],
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
  // D-657 (Screams from Within, CR 603.10a, 303.4f): "When enchanted creature dies, return this card from your graveyard to the battlefield": the Aura has gone to the graveyard
  // with the creature and comes back as the card it is now (`thisCard`); it chooses what it enchants as it enters (`rules/aura-entry.ts`).
  if (
    what?.kind === 'noun' &&
    what.det === 'self' &&
    ctx.auraDies &&
    to.zone === 'battlefield' &&
    operand(clause, 'attachTo') === undefined
  ) {
    const blockedCard = missingFeatures(['selector:thisCard']);
    if (blockedCard.length > 0) return failure(clause, blockedCard);
    return {
      ok: true,
      value: [
        {
          kind: 'moveToZone',
          objects: { kind: 'thisCard' },
          to: 'battlefield',
          controller: to.whose ?? 'you',
          ...(to.tapped === true ? { tapped: true } : {}),
          ...(to.counters === undefined ? {} : { withCounters: { ...to.counters } }),
        },
      ],
      rule: clause.rule,
    };
  }
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
          ...(to.tapped === true ? { tapped: true } : {}),
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
    // "Return it to the battlefield" of a dies or leaves trigger (D-568): `it` is the card the
    // permanent became. The same words in a spell or an unrelated trigger do not establish a card to return.
    if (
      zone === 'battlefield' &&
      chosen?.kind === 'noun' &&
      /^it$/iu.test(chosen.filter.raw.trim()) &&
      !ctx.itIsCard
    ) {
      // Meren of Clan Nel Toth: "Choose target creature card in your graveyard. ... return it to the battlefield": "it" is the card the earlier instruction chose from a graveyard (CR 608.2c).
      const spec = ctx.targets.find((t) => t.id === chosen.ref);
      if (spec?.what.kind !== 'object' || spec.what.filter.zone !== 'graveyard') {
        return failure(clause);
      }
    }
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
    // "When enchanted creature dies, return that card to the battlefield under its owner's control" (issue 89, Gift of Immortality, CR 400.7, 603.10a): "that card" is the card the
    // enchanted creature became in the graveyard, not the creature the Aura was attached to (the binding pass names that one).
    if (
      ctx.auraDies &&
      zone === 'battlefield' &&
      chosen?.kind === 'noun' &&
      chosen.det === 'enchanted' &&
      chosen.rule === 'noun.that-card' &&
      operand(clause, 'attachTo') === undefined
    ) {
      const blocked = missingFeatures(['selector:triggerCard', 'selector:triggerSubject']);
      if (blocked.length > 0) return failure(clause, blocked);
      ctx.returnedDyingCard = true;
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
    // graveyard; a pronoun for anything else (a permanent on the battlefield, a player) is not a card to return. D-362 (Victimize): "the chosen cards" the same.
    if (
      chosen?.kind === 'noun' &&
      chosen.det === 'anaphor' &&
      /^(?:that|the chosen) /iu.test(chosen.filter.raw)
    ) {
      const spec = ctx.targets.find((t) => t.id === chosen.ref);
      if (spec?.what.kind !== 'object' || spec.what.filter.zone !== 'graveyard') {
        return failure(clause);
      }
    }
    // "... to the battlefield attached to that token" (issue 89, Forum Filibuster, CR 303.4f, 400.7j): the token the instruction before made, which names it.
    const hostNoun = operand(clause, 'attachTo');
    let attachTo: { readonly kind: 'moved' } | undefined;
    if (hostNoun !== undefined) {
      if (zone !== 'battlefield' || hostNoun.kind !== 'noun') return failure(clause);
      const host = objectRefOf(hostNoun, ctx, { token: true });
      if (!host.ok) return host;
      if (host.value.kind !== 'moved') return failure(clause);
      const blockedHost = missingFeatures(['ability:attachedToMoved']);
      if (blockedHost.length > 0) return failure(clause, blockedHost);
      attachTo = { kind: 'moved' };
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
              ...(attachTo === undefined ? {} : { attachTo }),
            }
          : { kind: 'moveToZone', objects, to: zone },
      'objects',
      zone === 'hand' || zone === 'battlefield' ? { thisCard: true } : {},
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
  lower(clause, ctx) {
    const objects = arg(clause, 'objects');
    if (
      objects?.kind !== 'noun' ||
      objects.det !== 'a' ||
      (objects.count?.kind !== 'number' && objects.count?.kind !== 'x')
    ) {
      return failure(clause);
    }
    const filter = lowerFilter(objects);
    if (!filter.ok) return filter;
    // "Untap up to X lands, where X is ..." (CR 107.3c): the amount the sentence defines X as, read as the instruction runs.
    const count = lowerAmount(objects.count, ctx, clause.rule);
    if (!count.ok) return count;
    const chosen: ChooseSelector = {
      kind: 'choose',
      filter: filter.value,
      count: count.value,
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
  needs: ['effect:moveToZone', 'selector:choose', 'ability:chooseAlsoGraveyard', 'amount:votesFor'],
  lower(clause, ctx) {
    const named = arg(clause, 'objects');
    const to = zoneOf(clause);
    const may = arg(clause, 'may');
    if (named?.kind !== 'noun' || named.det !== 'a') return failure(clause);
    // "... with mana value less than or equal to that damage" (issue 103, CR 202.3): the filter's limit is the damage of the trigger, read as the effect runs.
    let limit: Amount | undefined;
    let objects: IrNoun = named;
    if (named.filter.manaValueAtMostAmount !== undefined) {
      const blocked = missingFeatures(['selector:manaValueAtMost']);
      if (blocked.length > 0) return failure(clause, blocked);
      const amount = lowerAmount(named.filter.manaValueAtMostAmount, ctx, clause.rule);
      if (!amount.ok) return amount;
      if (
        typeof amount.value !== 'object' ||
        amount.value.kind !== 'triggerDamage' ||
        to?.zone !== 'battlefield'
      ) {
        return failure(clause);
      }
      limit = amount.value;
      const { manaValueAtMostAmount: _amount, ...rest } = named.filter;
      void _amount;
      objects = { ...named, filter: rest };
    }
    // CR 107.3a, 202.3: "a permanent card with mana value X or less": the X of the spell, read as the cards are chosen (`ObjectFilter.manaValueAtMost`).
    if (arg(clause, 'manaValueAtMost') !== undefined) {
      const blocked = missingFeatures(['selector:manaValueAtMost']);
      if (blocked.length > 0) return failure(clause, blocked);
      if (limit !== undefined || to?.zone !== 'battlefield') return failure(clause);
      const x = amountArg(clause, 'manaValueAtMost', ctx);
      if (!x.ok) return x;
      limit = x.value;
    }
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
    const lowered = lowerFilter(objects);
    if (!lowered.ok) return lowered;
    const filter = {
      ok: true as const,
      value: limit === undefined ? lowered.value : { ...lowered.value, manaValueAtMost: limit },
    };
    const optional = may?.kind === 'flag' && may.value;
    // D-544 (CR 608.2d): "from your hand or graveyard": the cards of both places are the candidates.
    const both = arg(clause, 'alsoGraveyard');
    // Issue 103 (CR 701.38b, 608.2c): "You may put a permanent card from your hand onto the battlefield for each free vote": up to that many cards, chosen as it resolves.
    const votes = arg(clause, 'count');
    let count: Amount | undefined;
    // CR 107.3a, 608.2d (Worldsoul's Rage): "Put up to X land cards from your hand and/or graveyard onto the battlefield tapped": up to the X of the spell, from the cards of both places.
    if (votes !== undefined && votes.kind === 'x') {
      if (
        !optional ||
        to.attacking === true ||
        filter.value.zone !== 'hand' ||
        both?.kind !== 'flag'
      ) {
        return failure(clause);
      }
      const lowered = lowerAmount(votes, ctx, clause.rule);
      if (!lowered.ok) return lowered;
      count = lowered.value;
    } else if (votes !== undefined) {
      if (
        votes.kind !== 'votesFor' ||
        !optional ||
        to.attacking === true ||
        filter.value.zone !== 'hand' ||
        both?.kind === 'flag'
      ) {
        return failure(clause);
      }
      const lowered = lowerAmount(votes, ctx, clause.rule);
      if (!lowered.ok) return lowered;
      count = lowered.value;
    }
    const move: Effect = {
      kind: 'moveToZone',
      objects: {
        kind: 'choose',
        filter: filter.value,
        ...(count === undefined ? {} : { count }),
        ...(optional ? { optional: true as const } : {}),
        ...(both?.kind === 'flag' && both.value ? { alsoGraveyard: true as const } : {}),
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
  needs: [
    'effect:mayCast',
    'selector:target',
    'duration:untilEndOfTurn',
    'effect:gainActivatedAbilitiesOf',
  ],
  lower(clause, ctx) {
    const objects = operand(clause, 'objects');
    if (objects?.kind !== 'noun' || objects.det !== 'target') return failure(clause);
    // D-359: "If that spell would be put into your graveyard, exile it instead" is the rider of the permission (`exileInstead`).
    const exile = arg(clause, 'exileInstead');
    if (exile !== undefined && exile.kind !== 'flag') return failure(clause);
    // Issue 159 (Havengul Lich): "target creature card in a graveyard" (any player's), and the rider "When you cast it this turn, ~ gains all activated abilities of that card".
    const any = arg(clause, 'anyGraveyard');
    const rider = arg(clause, 'whenCast');
    if (
      (any !== undefined && any.kind !== 'flag') ||
      (rider !== undefined && rider.kind !== 'flag')
    ) {
      return failure(clause);
    }
    return eachObject(clause, ctx, (selected) => ({
      kind: 'mayCast',
      objects: selected,
      duration: 'untilEndOfTurn',
      ...(exile?.value === true ? { exileInstead: true as const } : {}),
      ...(any?.value === true ? { anyGraveyard: true as const } : {}),
      ...(rider?.value === true
        ? {
            whenCast: {
              kind: 'gainActivatedAbilitiesOf' as const,
              to: { kind: 'this' as const },
              from: { kind: 'triggerSubject' as const },
              duration: 'untilEndOfTurn' as const,
            },
          }
        : {}),
    }));
  },
};

/**
 * "You may cast Zombie spells from your graveyard this turn" (issue 159, CR 601.2, 611.2a): the engine's `mayCastSpells`, a permission for the rest of the turn that covers
 * every card of the controller's graveyard the filter describes.
 */
const MAY_CAST_SPELLS: Lowering<IrClause, Effects> = {
  head: 'mayCastSpells',
  id: 'lower.may-cast-spells',
  // "You may" is the sentence's own offer and the permission is optional anyway (nobody has to cast).
  acceptsOptional: true,
  needs: ['effect:mayCastSpells', 'duration:untilEndOfTurn'],
  lower(clause) {
    const objects = operand(clause, 'objects');
    if (objects?.kind !== 'noun') return failure(clause);
    const filter = lowerFilter(objects);
    if (!filter.ok) return filter;
    return {
      ok: true,
      value: [{ kind: 'mayCastSpells', spells: filter.value, duration: 'untilEndOfTurn' }],
      rule: clause.rule,
    };
  },
};

/**
 * The mana a spec produces; a color choice is only possible while paying for a mana ability. Null for the specs whose count comes from elsewhere in the ability ("one mana of
 * that color for each ...", "X mana of any one color, where X is ..."): `lowerManaAbility` builds those itself.
 */
export function lowerMana(spec: IrManaSpec): ManaProduction | null {
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
      return spec.what.or === undefined
        ? { kind: 'chosenColor' }
        : { kind: 'chosenColor', or: spec.what.or };
    case 'thatColor':
    case 'anyOneColorX':
      return null;
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

/**
 * "Prevent all combat damage that would be dealt to you this turn. For each 1 damage prevented this way, create a 2/1 white and black Inkling creature token with flying." (CR 615.5,
 * 615.6, 111.2): the shield `lower.prevent-damage` makes, and the token the engine makes for each 1 damage it prevents (`preventDamage.perPrevented`), one token of a predefined or a
 * described kind with no entry condition of its own.
 */
const PREVENT_DAMAGE_PER_PREVENTED: Lowering<IrClause, Effects> = {
  head: 'preventDamagePerPrevented',
  id: 'lower.prevent-damage-per-prevented',
  needs: ['effect:preventDamage', 'duration:untilEndOfTurn', 'selector:tokensPerPrevented'],
  takesDuration: true,
  lower(clause, ctx) {
    const { token, ...rest } = clause.args;
    if (token?.kind !== 'token') return failure(clause);
    const shield = PREVENT_DAMAGE.lower({ ...clause, verb: 'preventDamage', args: rest }, ctx);
    if (!shield.ok) return shield;
    const [prevented, ...others] = shield.value;
    if (prevented?.kind !== 'preventDamage' || others.length > 0) return failure(clause);
    const { duration: _duration, ...tokenClause } = clause;
    void _duration;
    const made = lowerCreateToken({ ...tokenClause, verb: 'createToken', args: { token } }, ctx);
    if (!made.ok) return made;
    const [created, ...more] = made.value;
    if (
      created?.kind !== 'createToken' ||
      more.length > 0 ||
      created.count !== 1 ||
      created.controller !== undefined ||
      created.tapped !== undefined ||
      created.attacking !== undefined ||
      created.forEachOpponent !== undefined ||
      (created.token.kind !== 'custom' && created.token.kind !== 'preset') ||
      (created.token.kind === 'custom' && created.token.ptAmount !== undefined)
    ) {
      return failure(clause);
    }
    const blocked = missingFeatures(['effect:createToken']);
    if (blocked.length > 0) return failure(clause, blocked);
    return {
      ok: true,
      value: [{ ...prevented, perPrevented: { token: created.token } }],
      rule: clause.rule,
    };
  },
};

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
    // "Until end of turn, you don't lose this mana as steps and phases end." (Prismari deck group 2, D-650, CR 500.5): the fixed mana the effect adds stays in the pool until the turn
    // ends. A choice of mana would be chosen later than the sentence says, so only fixed mana.
    const staysFlag = arg(clause, 'stays');
    const stays = staysFlag?.kind === 'flag' && staysFlag.value;
    if (stays) {
      const blockedStays = missingFeatures(['selector:manaStays']);
      if (blockedStays.length > 0) return failure(clause, blockedStays);
      if (spec.what.kind !== 'symbols') return failure(clause);
    }
    // "Add {R} for each tapped land your opponents control." (stage P34, D-152, CR 106.1): the fixed mana once for each of an amount read
    // as the effect runs; a spell or a triggered ability only (a mana ability fixes its production before it resolves, CR 605.1a).
    if (arg(clause, 'times') !== undefined) {
      if (spec.what.kind !== 'symbols' && spec.what.kind !== 'oneOf') return failure(clause);
      const times = amountArg(clause, 'times', ctx);
      if (!times.ok) return times;
      if (spec.what.kind === 'oneOf') {
        const blocked = missingFeatures(['effect:chooseOne']);
        if (blocked.length > 0) return failure(clause, blocked);
        return {
          ok: true,
          value: [
            {
              kind: 'chooseOne',
              times: times.value,
              options: spec.what.colors.map((color) => ({
                label: `{${color}}`,
                effect: { kind: 'addMana', mana: { kind: 'fixed', mana: [color as ManaColor] } },
              })),
            },
          ],
          rule: clause.rule,
        };
      }
      const mana = spec.what.symbols as ManaColor[];
      return {
        ok: true,
        value: [
          {
            kind: 'addMana',
            mana: {
              kind: 'fixed',
              mana,
              times: times.value,
              ...(stays ? { staysUntilEndOfTurn: true as const } : {}),
            },
          },
        ],
        rule: clause.rule,
      };
    }
    // "Add an additional {C}" (stage P31) is only the effect of a triggered mana ability, which `lowerTriggered` builds itself.
    if (arg(clause, 'additional') !== undefined) return failure(clause);
    // "Add four mana in any combination of colors." (CR 106.1b, 608.2d): each mana is a color chosen on its own as the instruction resolves, which is the engine's
    // `chooseOne` of the five colors repeated `count` times, each option adding one mana of that color. "Different colors" cannot be said this way: the
    // choices would not exclude one another.
    if (spec.what.kind === 'anyCombination' && spec.what.distinct !== true) {
      const blocked = missingFeatures(['effect:chooseOne']);
      if (blocked.length > 0) return failure(clause, blocked);
      return {
        ok: true,
        value: [
          {
            kind: 'chooseOne',
            times: spec.what.count,
            options: (['W', 'U', 'B', 'R', 'G'] as const).map((color) => ({
              label: `{${color}}`,
              effect: { kind: 'addMana', mana: { kind: 'fixed', mana: [color] } } as Effect,
            })),
          },
        ],
        rule: clause.rule,
      };
    }
    // "Whenever a land you control enters, add one mana of any color." (Lotus Cobra, CR 106.1b, 608.2d, 605.1b): an instruction of a spell or of an ability that is not a mana ability
    // (a triggered ability whose event is not a mana ability uses the stack, CR 605.1b), so the color is chosen as it resolves: the engine's `chooseOne` of the five colors, each
    // option adding the mana of that one color ("two mana of any one color" adds both of the same color).
    if (spec.what.kind === 'anyColor' && !stays) {
      const blocked = missingFeatures(['effect:chooseOne']);
      if (blocked.length > 0) return failure(clause, blocked);
      const count = spec.what.count ?? 1;
      return {
        ok: true,
        value: [
          {
            kind: 'chooseOne',
            options: (['W', 'U', 'B', 'R', 'G'] as const).map((color) => ({
              label: `{${color}}`,
              effect: {
                kind: 'addMana',
                mana: { kind: 'fixed', mana: Array.from({ length: count }, () => color) },
              } as Effect,
            })),
          },
        ],
        rule: clause.rule,
      };
    }
    // The interpreter's addMana effect adds fixed mana only: it has no color decision while a
    // spell or ability resolves (a mana ability chooses while paying instead).
    if (spec.what.kind !== 'symbols') {
      return { ok: false, needs: ['selector:colorChoice'], at: spec.span, rule: spec.rule };
    }
    const produced = lowerMana(spec);
    if (produced === null) return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'addMana',
          mana:
            stays && produced.kind === 'fixed'
              ? { ...produced, staysUntilEndOfTurn: true as const }
              : produced,
        },
      ],
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

const CHOOSE_CREATURE_TYPE: Lowering<IrClause, Effects> = {
  head: 'chooseCreatureType',
  id: 'lower.choose-creature-type',
  needs: ['effect:chooseCreatureType'],
  lower: (clause) => ({
    ok: true,
    value: [{ kind: 'chooseCreatureType' }],
    rule: clause.rule,
  }),
};

function playerVerb(
  verb:
    | 'draw'
    | 'discard'
    | 'gainLife'
    | 'loseLife'
    | 'gainEnergy'
    | 'gainExperience'
    | 'shuffle'
    | 'mill',
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
        // "Each player discards their hand" (Lorehold group 3, CR 701.9a): each player discards the hand they have as their instruction comes up, so the count is not the controller's.
        // "Discard all the cards in your hand" (CR 701.9a, 608.2c): the same whole-hand discard, whose cards "that many" counts afterwards.
        if (player.value.kind !== 'you' || arg(clause, 'allCards') !== undefined) {
          if (arg(clause, 'allCards') !== undefined) ctx.thisWay = 'discarded';
          return {
            ok: true,
            value: [{ kind: 'discard', player: player.value, count: 0, hand: true }],
            rule: clause.rule,
          };
        }
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
      // "Each opponent loses life equal to the life that player lost this turn" (D-365, CR 119.3): the amount of another player than "you" (who is "that
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
      // CR 701.9, 101.4 (Plaguecrafter): "each player who can't discards a card": the players choose in turn and the cards go together.
      if (verb === 'discard' && player.value.kind === 'couldntSacrificeThisWay') {
        const blocked = missingFeatures(['selector:discardTogether']);
        if (blocked.length > 0) return failure(clause, blocked);
        return {
          ok: true,
          value: [{ kind: 'discard', player: player.value, count: amount.value, together: true }],
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
    // "Put the rest on the bottom of your library in any order" (CR 401.4): the engine's `bottomChosen`.
    const ordered = arg(clause, 'chosenOrder');
    const chosenOrder = ordered?.kind === 'flag' && ordered.value;
    let atMost: Amount | undefined;
    if (arg(clause, 'manaValueAtMost') !== undefined) {
      const lowered = amountArg(clause, 'manaValueAtMost', ctx);
      if (!lowered.ok) return lowered;
      atMost = lowered.value;
    }
    // CR 608.2g (issue 100, "You may cast an instant or sorcery spell ... from among them without paying its mana cost"): the card taken is cast from the library.
    const cast = arg(clause, 'castFree');
    const castFree = cast?.kind === 'flag' && cast.value;
    if (castFree) {
      const blocked = missingFeatures(['effect:castFree']);
      if (blocked.length > 0) return failure(clause, blocked);
      if (toBattlefield || toGraveyard.value || onTop) return failure(clause);
    }
    const look: Effect = {
      kind: 'lookAtTop',
      count: count.value,
      take: {
        filter: filter.value,
        max: 1,
        ...(toBattlefield ? { to: 'battlefield' as const } : {}),
        ...(castFree ? { to: 'castFree' as const } : {}),
        ...(atMost === undefined ? {} : { manaValueAtMost: atMost }),
      },
      // "Look at the top card of your library. If it's a creature card of the chosen type, you may reveal it and put it into your hand."
      // (stage P34, D-152): the card looked at stays on top of the library unless it is taken.
      rest: toGraveyard.value
        ? 'graveyard'
        : onTop
          ? 'top'
          : chosenOrder
            ? 'bottomChosen'
            : 'bottomRandom',
    };
    // D-658 (Armored Skyhunter, CR 301.5, 701.3): "If an Equipment is put onto the battlefield this way, you may attach it to a creature you control": the creature is chosen as
    // the effect resolves (none: the Equipment stays unattached), and only for an Equipment.
    const attach = arg(clause, 'attachEquipment');
    if (attach?.kind === 'flag' && attach.value) {
      if (!toBattlefield) return failure(clause);
      const blocked = missingFeatures([
        'effect:chooseObjects',
        'effect:attach',
        'effect:conditional',
      ]);
      if (blocked.length > 0) return failure(clause, blocked);
      const id = 'attach1';
      return {
        ok: true,
        value: [
          look,
          {
            kind: 'conditional',
            condition: {
              kind: 'objectMatches',
              of: { kind: 'moved' },
              filter: { subtypes: ['Equipment'] },
            },
            effect: {
              kind: 'sequence',
              effects: [
                {
                  kind: 'chooseObjects',
                  id,
                  filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
                  count: 1,
                },
                { kind: 'attach', object: { kind: 'moved' }, to: { kind: 'chosen', id } },
              ],
            },
          },
        ],
        rule: clause.rule,
      };
    }
    return { ok: true, value: [look], rule: clause.rule };
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

/** One chosen card goes to the hand without reveal; the remaining cards are ordered on top (CR 401.4). */
const LOOK_TAKE_ONE_TOP: Lowering<IrClause, Effects> = {
  head: 'lookTakeOneTop',
  id: 'lower.look-take-one-top',
  needs: ['effect:lookAtTop'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    return {
      ok: true,
      value: [
        {
          kind: 'lookAtTop',
          count: count.value,
          take: { filter: {}, max: 1, min: 1, hidden: true },
          rest: 'topChosen',
        },
      ],
      rule: clause.rule,
    };
  },
};

/** One of two looked-at cards goes to the hand, the other to the bottom (CR 401.4). */
const LOOK_TAKE_ONE_BOTTOM: Lowering<IrClause, Effects> = {
  head: 'lookTakeOneBottom',
  id: 'lower.look-take-one-bottom',
  needs: ['effect:lookAtTop'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    return {
      ok: true,
      value: [
        {
          kind: 'lookAtTop',
          count: count.value,
          take: { filter: {}, max: 1, min: 1, hidden: true },
          rest: 'bottomRandom',
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
    // CR 107.3a, 701.21a (Nahiri's Lithoforming): "Sacrifice X lands": the number of permanents is the X of the spell, read as the effect runs (D-131); with fewer than X to
    // sacrifice, all of them are (the engine's choice takes what there is).
    let xCount: Amount | undefined;
    if (what.count?.kind === 'x') {
      const x = lowerAmount(what.count, ctx, clause.rule);
      if (!x.ok) return x;
      xCount = x.value;
    }
    const count = what.count?.kind === 'number' ? what.count.value : 1;
    // "... When you do, ~ deals damage equal to that creature's power" (stage P36, D-178, CR 603.12, 608.2h): the one permanent chosen is what
    // "that creature" means in an amount that follows, the engine's `sacrificed`.
    ctx.sacrificedRef =
      count === 1 && xCount === undefined && what.anyNumber !== true && !what.plural
        ? (what.ref ?? null)
        : null;
    const chosen: ChooseSelector = {
      kind: 'choose',
      filter: filter.value,
      ...(what.anyNumber === true ? { anyNumber: true as const } : {}),
      ...(what.atLeastOne === true ? { atLeastOne: true as const } : {}),
      ...(what.greatest === undefined ? {} : { greatest: what.greatest }),
      ...(xCount !== undefined ? { count: xCount } : {}),
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
  // D-660 (Ajani's Chosen): "If that enchantment is an Aura, you may attach it to the token": the test of the clause is read when the instruction comes up.
  takesObjectTest: true,
  // D-660 (Ajani's Chosen): "If that enchantment is an Aura, you may attach it to the token": the offer is the engine's `may` of the attach, asked as it comes up.
  acceptsOptional: true,
  lower(clause, ctx) {
    if (clause.optional) {
      const blocked = missingFeatures(['effect:may']);
      if (blocked.length > 0) return failure(clause, blocked);
      const attached = ATTACH.lower({ ...clause, optional: false }, ctx);
      if (!attached.ok) return attached;
      return {
        ok: true,
        value: attached.value.map((effect) => ({ kind: 'may' as const, effect })),
        rule: clause.rule,
      };
    }
    const object = arg(clause, 'object');
    const to = arg(clause, 'to');
    if (object?.kind !== 'noun' || to?.kind !== 'noun') return failure(clause);
    if (ctx.owner === 'spell' || ctx.selfGone) return failure(clause);
    if (to.plural || to.upTo || (to.count?.kind === 'number' && to.count.value !== 1)) {
      return failure(clause);
    }
    // D-660 (Ajani's Chosen): "If that enchantment is an Aura, you may attach it to the token": the Aura the trigger is about, read for a trigger of an enchantment entering.
    const what = objectRefOf(object, ctx, { triggerSubject: true });
    if (!what.ok) return what;
    if (what.value.kind !== 'this' && what.value.kind !== 'triggerSubject') return failure(clause);
    const onto = objectRefOf(to, ctx, { token: true, triggerSubject: true });
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
  // "You may put a +1/+1 counter on a creature" is read (below) as the choice of up to one creature; any other optional counters instruction is refused.
  acceptsOptional: true,
  lower(clause, ctx) {
    const counter = arg(clause, 'counter');
    if (counter?.kind !== 'counterSpec') return failure(clause);
    const objectsArg = arg(clause, 'objects');
    if (
      clause.optional &&
      !(
        objectsArg?.kind === 'noun' &&
        objectsArg.det === 'a' &&
        objectsArg.filter.controller === undefined &&
        !objectsArg.plural &&
        objectsArg.count === undefined &&
        objectsArg.ref !== undefined &&
        arg(clause, 'player') === undefined
      )
    ) {
      return failure(clause);
    }
    // "Target player puts a +1/+1 counter on each creature they control" (CR 115.1, 122.6): the player is a target of its own (read first, so it is the slot "they" names), and the
    // permanents are the `each` selector of that player's.
    const putter = arg(clause, 'player');
    if (putter !== undefined) {
      if (
        putter.kind !== 'noun' ||
        objectsArg?.kind !== 'noun' ||
        objectsArg.rule !== 'noun.each-permanent-they-control'
      ) {
        return failure(clause);
      }
      const who = playerSelectorOf(putter, ctx);
      if (!who.ok) return who;
    }
    if (
      objectsArg?.kind === 'noun' &&
      objectsArg.det === 'a' &&
      objectsArg.ref !== undefined &&
      // D-653 (Breena, the Demagogue): "put two +1/+1 counters on a creature you control" is one the controller must choose, as "up to one" is one they may.
      (objectsArg.upTo === true ||
        (objectsArg.filter.controller === 'you' &&
          !objectsArg.plural &&
          objectsArg.count === undefined) ||
        // "You may put a +1/+1 counter on a creature" (Zimone's Hypothesis, Quandrix Unlimited deck, group G): a creature of any player, none chosen is not doing it.
        (clause.optional &&
          objectsArg.filter.controller === undefined &&
          !objectsArg.plural &&
          objectsArg.count === undefined))
    ) {
      const filter = lowerFilter(objectsArg);
      if (!filter.ok) return filter;
      const count = amountArg(clause, 'count', ctx);
      if (!count.ok) return count;
      ctx.chosenObjectRefs.add(objectsArg.ref);
      const anyPlayer = clause.optional && objectsArg.filter.controller === undefined;
      return {
        ok: true,
        value: [
          {
            kind: 'chooseObjects',
            id: objectsArg.ref,
            filter: anyPlayer ? filter.value : { ...filter.value, controller: 'you' },
            count: 1,
            ...(objectsArg.upTo === true || anyPlayer ? {} : { exactly: true as const }),
          },
          {
            kind: 'addCounters',
            objects: { kind: 'chosen', id: objectsArg.ref },
            counter: counter.name,
            count: count.value,
          },
        ],
        rule: clause.rule,
      };
    }
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
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
 * "Double the number of +1/+1 counters on target creature you control" (CR 701.10, 122.6): the engine's `doubleCounters`, one for each object
 * of the operand; "it" may be the permanent whose event caused the trigger.
 */
const DOUBLE_COUNTERS: Lowering<IrClause, Effects> = {
  head: 'doubleCounters',
  id: 'lower.double-counters',
  needs: ['effect:doubleCounters'],
  lower(clause, ctx) {
    const counter = arg(clause, 'counter');
    if (counter?.kind !== 'counterSpec') return failure(clause);
    return eachObject(
      clause,
      ctx,
      (objects) => ({ kind: 'doubleCounters', objects, counter: counter.name }),
      'objects',
      { triggerSubject: true },
    );
  },
};

/**
 * "Create a Treasure token", "create two 1/1 white Soldier creature tokens" (CR 111.2, 111.10).
 * A predefined token the engine cannot run (Food and Clue carry abilities it cannot activate yet,
 * Blood is not in the AST) is reported with `token:<name>`.
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
  // "For each opponent, create two 3/3 ... tokens with flying that attack that opponent this turn if able." (Prismari deck group 2, D-652, CR 111.2, 508.1d): the same tokens, made for
  // each opponent and required to attack it. A custom creature token only, with no controller of its own.
  const perOpponent = arg(clause, 'perOpponentAttack');
  if (perOpponent?.kind === 'flag' && perOpponent.value) {
    const blockedEach = missingFeatures(['selector:tokensPerOpponent']);
    if (blockedEach.length > 0) return failure(clause, blockedEach);
    const { perOpponentAttack: _flag, ...args } = clause.args;
    const inner = lowerCreateToken({ ...clause, args }, ctx);
    if (!inner.ok) return inner;
    const [made, ...rest] = inner.value;
    if (
      made?.kind !== 'createToken' ||
      rest.length > 0 ||
      made.token.kind !== 'custom' ||
      made.controller !== undefined
    ) {
      return failure(clause);
    }
    return {
      ok: true,
      value: [{ ...made, forEachOpponent: { mustAttack: true } }],
      rule: clause.rule,
    };
  }
  const count = lowerAmount(token.count, ctx, clause.rule);
  if (!count.ok) return count;
  const at = { at: token.span, rule: token.rule };
  // "Create two tapped Treasure tokens" (stage P28, CR 110.5b, D-131): the tokens enter tapped.
  if (token.tapped === true) {
    const missing = missingFeatures(['token:tapped']);
    if (missing.length > 0) return { ok: false, needs: missing, ...at };
  }
  // D-648 (CR 508.4): "that's attacking that opponent": only in a trigger about a player attacking one of your opponents, which names the player attacked.
  let entersAttacking: { attacking?: { at: PlayerSelector } } = {};
  if (token.attackingThatOpponent === true) {
    if (ctx.attackedPlayer === null) return { ok: false, needs: [], ...at };
    const missing = missingFeatures([...ctx.attackedPlayer.needs, 'token:attacking']);
    if (missing.length > 0) return { ok: false, needs: missing, ...at };
    entersAttacking = { attacking: { at: ctx.attackedPlayer.selector } };
  }
  // CR 508.4, 110.5b: "that's tapped and attacking": only in the effect of an attack batch trigger of the controller, which names the players the declaration attacked.
  if (token.tappedAndAttacking === true) {
    if (ctx.attackBatchPlayer === null) return { ok: false, needs: [], ...at };
    const missing = missingFeatures([
      ...ctx.attackBatchPlayer.needs,
      'token:attacking',
      'token:tapped',
    ]);
    if (missing.length > 0) return { ok: false, needs: missing, ...at };
    entersAttacking = { attacking: { at: ctx.attackBatchPlayer.selector } };
  }
  const entersTapped = {
    ...(token.tapped === true || token.tappedAndAttacking === true
      ? { tapped: true as const }
      : {}),
    ...entersAttacking,
  };
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
    if (name === 'Blood') return { ok: false, needs: [`token:${name}`], ...at };
    // CR 111.10, 303.7: a Role token is an Aura token; the engine creates it only attached to the target the text names (`createToken.attachTo`).
    let attachTo: { kind: 'target'; id: string } | undefined;
    const host = arg(clause, 'attachTo');
    if (name === 'Wicked Role') {
      if (host?.kind !== 'noun' || host.det !== 'target' || count.value !== 1) {
        return { ok: false, needs: [], ...at };
      }
      const ref = objectRefOf(host, ctx);
      if (!ref.ok) return ref;
      if (ref.value.kind !== 'target') return failure(clause);
      attachTo = { kind: 'target', id: ref.value.id };
    } else if (host !== undefined) {
      return failure(clause);
    }
    return {
      ok: true,
      value: [
        {
          kind: 'createToken',
          token: { kind: 'preset', preset: name },
          count: count.value,
          ...entersTapped,
          ...by,
          ...(attachTo === undefined ? {} : { attachTo }),
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
  // CR 303.4f, 111.4 (issue 89): "a white Aura enchantment token named Contract attached to target creature ... The token has enchant creature": an Aura token, created attached to the
  // target the text names; it is not a creature and has no power or toughness.
  if (token.subtypes?.includes('Aura') === true || token.enchantsCreature === true) {
    return lowerAuraToken(clause, token, count.value, entersTapped, by, colors, types, ctx);
  }
  const creature = types.includes('creature');
  // D-543 (CR 208.2a, 604.3): a token with no numbers has a characteristic-defining ability in its quotes that defines both ("Beau's power and toughness are each equal
  // to ..."); a token with numbers never has one (the star and the ability go together, `validateCard`).
  const definesPt =
    token.ptAmount === true
      ? false
      : (token.power === undefined) !== (token.toughness === undefined)
        ? null
        : token.power === undefined;
  if (!creature || definesPt === null) {
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
    const toxic = /^toxic ([1-9]\d*)$/.exec(word);
    if (toxic !== null) {
      const unsupportedToxic = missingFeatures(['ability:keyword', 'keyword:toxic']);
      if (unsupportedToxic.length > 0) return { ok: false, needs: unsupportedToxic, ...at };
      abilities.push({ kind: 'keyword', keyword: { kind: 'toxic', count: Number(toxic[1]) } });
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
  // CR 305.6 (Verdant Kraken): a land token that has a basic land type has its intrinsic "{T}: Add [mana symbol]", as a land card that prints the type has it as an ability of its
  // definition (the engine adds the ability only for a type a land gains, `landTypeAbilities`). Listed after the abilities of the token's own text, in the order of the subtypes.
  if (types.includes('land')) {
    for (const subtype of subtypes) {
      const mana = Object.hasOwn(BASIC_LAND_MANA, subtype) ? BASIC_LAND_MANA[subtype] : undefined;
      if (mana !== undefined) {
        abilities.push({
          kind: 'mana',
          cost: [{ kind: 'tap' }],
          production: { kind: 'fixed', mana: [mana] },
        });
      }
    }
  }
  const defines = abilities.filter(
    (a) => a.kind === 'static' && a.static.kind === 'characteristicPt',
  );
  if (definesPt ? defines.length !== 1 : defines.length > 0) return { ok: false, needs: [], ...at };
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
    power: token.power ?? (token.ptAmount === true ? 0 : '*'),
    toughness: token.toughness ?? (token.ptAmount === true ? 0 : '*'),
    loyalty: null,
    defense: null,
    // The words of the token's abilities, which the card face prints (CR 111.4): its keywords on one line, then each ability in
    // quotes as the card writes it. A token with no abilities has no text.
    oracleText: tokenRulesText(token.keywords ?? [], token.abilities ?? [], named),
    abilities,
  };
  let ptAmount: Amount | undefined;
  if (token.ptAmount === true) {
    const amount = lowerAmount({ kind: 'x', span: token.span }, ctx, clause.rule);
    if (!amount.ok) return amount;
    ptAmount = amount.value;
  }
  return {
    ok: true,
    value: [
      {
        kind: 'createToken',
        token: { kind: 'custom', definition, ...(ptAmount === undefined ? {} : { ptAmount }) },
        count: count.value,
        ...entersTapped,
        ...by,
      },
    ],
    rule: clause.rule,
  };
}

/** The mana of the intrinsic ability of each basic land type (CR 305.6). */
const BASIC_LAND_MANA: Readonly<Record<string, ManaColor | undefined>> = {
  Plains: 'W',
  Island: 'U',
  Swamp: 'B',
  Mountain: 'R',
  Forest: 'G',
};

const PLAYER_LOCK: Lowering<IrClause, Effects> = {
  head: 'playerLock',
  id: 'lower.player-lock',
  needs: ['effect:grantPlayerProtectionEverything', 'effect:preventPlayerLifeTotalChange'],
  lower(clause, ctx) {
    const named = arg(clause, 'player');
    if (named?.kind !== 'noun') return failure(clause);
    const player = playerSelectorOf(named, ctx);
    if (!player.ok) return player;
    return {
      ok: true,
      value: [
        {
          kind: 'grantPlayerProtectionEverything',
          player: player.value,
          duration: 'untilNextTurn',
        },
        {
          kind: 'preventPlayerLifeTotalChange',
          player: player.value,
          duration: 'untilNextTurn',
        },
      ],
      rule: clause.rule,
    };
  },
};

export const EFFECT_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  SACRIFICE,
  ADD_COUNTERS,
  DOUBLE_COUNTERS,
  CREATE_TOKEN,
  {
    head: 'createPerOpponent',
    id: 'lower.create-per-opponent',
    needs: ['effect:forEachPlayer', 'effect:createToken'],
    lower: (clause, ctx) => {
      const lowered = lowerCreateToken(clause, ctx);
      if (!lowered.ok) return lowered;
      return {
        ok: true,
        value: [
          {
            kind: 'forEachPlayer',
            players: { kind: 'eachOpponent' },
            effect: { kind: 'sequence', effects: lowered.value },
          },
        ],
        rule: clause.rule,
      };
    },
  },
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
  MAY_CAST_SPELLS,
  simple('counter'),
  COUNTER_UNLESS,
  simple('tap'),
  simple('untap'),
  GOAD,
  ATTACK_RANDOM_OPPONENT,
  ATTACK_RANDOM_OPPONENT_ANY,
  simple('transform'),
  REGENERATE,
  ADD_MANA,
  CHOOSE_COLOR,
  CHOOSE_CREATURE_TYPE,
  playerVerb('draw'),
  playerVerb('discard'),
  playerVerb('gainLife'),
  playerVerb('gainEnergy'),
  playerVerb('gainExperience'),
  playerVerb('loseLife'),
  PLAYER_LOCK,
  playerVerb('mill'),
  MANIFEST,
  playerVerb('shuffle'),
  BECOME_MONARCH,
  DELAYED_DRAW,
  COPY_SPELL,
  EXILE_ON_RESOLVE,
  CHANGE_TARGET,
  libraryVerb('scry'),
  libraryVerb('surveil'),
  libraryVerb('lookAndReorder'),
  LOOK_AND_SPLIT,
  libraryVerb('putFromHandOnTop'),
  {
    head: 'putFromHandOnBottom',
    id: 'lower.put-from-hand-on-bottom',
    needs: ['effect:putFromHandOnBottom'],
    lower: (clause) => ({
      ok: true,
      value: [{ kind: 'putFromHandOnBottom' }],
      rule: clause.rule,
    }),
  },
  LOOK_TAKE,
  LOOK_TAKE_BOTTOM,
  LOOK_TAKE_ONE_TOP,
  LOOK_TAKE_ONE_BOTTOM,
  PUMP,
  GRANT_KEYWORD,
  GRANT_ABILITY,
  RESTRICT,
  LOSE_ALL_ABILITIES,
  LOSE_HEXPROOF_SHROUD,
  BECOMES,
  GAIN_ALL_CREATURE_TYPES,
  SET_PT,
  FLICKER,
  DELAYED_RETURN,
  DELAYED_RETURN_TO_BATTLEFIELD,
  DELAYED_RETURN_TO_HAND,
  DELAYED_RETURN_AT_UPKEEP,
  DELAYED_RETURN_THIS_CARD,
  DELAYED_RETURN_THIS_CARD_ATTACHED,
  SEARCH,
  PREVENT_DAMAGE,
  PREVENT_DAMAGE_PER_PREVENTED,
  ATTACH,
  ...DINOSAUR_LOWERINGS,
  // Quandrix Unlimited deck, group G: "Distribute X +1/+1 counters among any number of target creatures you control".
  ...QUANDRIX_G_LOWERINGS,
  ...JESKAI_CASTFREE_LOWERINGS,
  ...ANGEL_LOWERINGS,
  ...QUANDRIX_D1_LOWERINGS,
  ...ARDEN_LOWERINGS,
  // Issue 89 (Animate Dead): the Aura that returns the card it enchants.
  ...AURA_GRAVEYARD_LOWERINGS,
  ...VRASKA_LOWERINGS,
  ...HASHATON_G5_LOWERINGS,
  ...HOFRI_LOWERINGS,
  // Issue 258 (D-585): the sentence after "Choose a color.", reported alone (the pair is lowered by `lowerStep`).
  ...CHOSEN_COLOR_MANA_LOWERINGS,
  // D-393, D-394 (Hashaton, group 9): the exile of a random card from a hand, then "put it onto the battlefield" and "cast it without paying its mana cost".
  ...HASHATON_G9_LOWERINGS,
  ...DANITHA_G1B_LOWERINGS,
  ...DEATH_TOLL_B_LOWERINGS,
  // D-411: "you may put a land card from among them into your hand" after a mill.
  ...DANITHA_G2_LOWERINGS,
  // Death Toll deck (Winter): "you may exile any number of cards from your graveyard with four or more card types among them. If you do, put a permanent card from among them onto the battlefield".
  ...DEATH_TOLL_WINTER_LOWERINGS,
  // Issue 104: "you may exile a creature card from your graveyard. If you do, create a token that's a copy of that card, ...".
  ...GRAVEYARD_COPY_LOWERINGS,
  // D-445: "Monstrosity 5".
  ...FEATHER_G2_LOWERINGS,
  // Quandrix Unlimited deck, group I: "double the value of X".
  ...UNBOUND_I_LOWERINGS,
  // D-459, D-460: "It gains haste.", "Exile it at the beginning of the next end step.", "If it would leave the battlefield, exile it instead ...", "Put each creature card exiled with ~ onto the battlefield ...".
  ...GISA_G4_LOWERINGS,
  ...PRISMARI_G1_LOWERINGS,
  ...PRISMARI_G2_LOWERINGS,
  // Prismari deck, group 3 (issue 87): spells cast from among exiled cards, piles of exiled cards, and the instructions that exile them.
  ...PRISMARI_G3_LOWERINGS,
  // D-517, D-519: "Those creatures don't untap during ... next untap step", "Until your next turn, creatures ... enter tapped".
  ...HYLDA_G2_LOWERINGS,
  // Galadriel deck, group 1 (issue 43): "reveal the top card of your library. If it's a creature or land card, draw a card."
  ...GALADRIEL_G1_LOWERINGS,
  // Galadriel deck, group 3 (issue 43): an exchange of control, a counter unless the controller pays an amount, "draw a card and reveal it" with counters removed, "its activated
  // abilities can't be activated this turn".
  ...GALADRIEL_G3_LOWERINGS,
  ...GRAVEYARD_CHOICE_LOWERINGS,
  ...PILES_LOWERINGS,
  ...REVEAL_TAKE_LOWERINGS,
  ...LOOK_ELSE_LOWERINGS,
  ...DAWNBREAK_LOWERINGS,
  ...PREPARE_LOWERINGS,
  ...EDHREC_LOWERINGS,
  ...DRAGON_LOWERINGS,
  ...EXILE_OWN_GRAVEYARD_LOWERINGS,
  ...KORVOLD_LOWERINGS,
  // Valakut Exploration: "put them into their owner's graveyard, then ~ deals that much damage to each opponent" after "if there are cards exiled with ~".
  ...EXILED_WITH_LOWERINGS,
  ...FINALE_LOWERINGS,
  ...GIDEON_LOWERINGS,
  ...REVEAL_TOP_DUEL_LOWERINGS,
  ...NIV_LOWERINGS,
  ...QUANDRIX_LOWERINGS,
  // Quandrix Unlimited deck, group D2: reveal X cards or until X cards of a kind, the cards of the kind onto the battlefield tapped.
  ...QUANDRIX_D2_LOWERINGS,
  ...DAMAGE_BATCH_LOWERINGS,
  ...ADAPT_LOWERINGS,
  ...NEXT_SPELL_LOWERINGS,
  ...PUT_MILLED_LOWERINGS,
  ...QUICK_DRAW_LOWERINGS,
  ...DACK_LOWERINGS,
  ...DEATH_TOLL_C_LOWERINGS,
  // Hylda deck, group 3 (issue 42): "shuffle ~ and target creature ... into their owners' libraries".
  ...HYLDA_G3_LOWERINGS,
  ...FLASH_PERMISSION_LOWERINGS,
  ...PLAYER_MANA_ABILITY_LOWERINGS,
  // Lorehold Spirit deck, group 1 (issue 86): "exile one of them from your graveyard", "shuffle any number of target cards from your graveyard into your library" and "each creature deals damage to itself".
  ...JESKAI_FLASHBACK_LOWERINGS,
  ...LOREHOLD_G1_LOWERINGS,
  // Issue 279 (Rakdos Charm): "each creature deals 1 damage to its controller".
  ...CONTROLLER_DAMAGE_LOWERINGS,
  // Lorehold Spirit deck, group 2 (issue 86): "Choose target card exiled with ~. You may cast that card this turn without paying its mana cost. ..."
  ...LOREHOLD_G2_LOWERINGS,
  ...NIV_GROUP_3_C_LOWERINGS,
  ...GRAVEYARD_CAST_LOWERINGS,
  ...HASHATON_G7_LOWERINGS,
  ...HASHATON_GROUP_4_LOWERINGS,
  ...TROYAN_G4_LOWERINGS,
  ...POPULATE_LOWERINGS,
  ...COPY_ONE_OF_THEM_LOWERINGS,
  ...ADDITIONAL_LAND_LOWERINGS,
  ...RAMP_LANDS_LOWERINGS,
  ...MOVE_COUNTERS_LOWERINGS,
  ...SEARCH_PAIR_LOWERINGS,
  ...ENCHANTED_PLAYER_LOWERINGS,
  ...RETURN_CONTROL_LOWERINGS,
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
              : test === 'attachedTo' ||
                  test === 'putThisWay' ||
                  test === 'exiledThisWay' ||
                  test === 'triggerSpellManaValue' ||
                  test === 'milledThisWay'
                ? 'objectMatches'
                : test === 'discardedThisWay' ||
                    test === 'discardedSpellThisWay' ||
                    test === 'destroyedThisWay' ||
                    test === 'searchedThisWay'
                  ? 'thisWayAtLeast'
                  : test === 'otherAttachedToHost' || test === 'xAtLeast'
                    ? 'amountIs'
                    : test === 'attackersAtYou'
                      ? 'attackersAtYouAtLeast'
                      : test === 'attackedHasMoreLife'
                        ? 'attackedHasMoreLifeThanOtherOpponent'
                        : test;
    return failure(
      clause,
      kind === 'raw' ||
        kind === 'hadCounters' ||
        kind === 'declined' ||
        kind === 'notPutOntoBattlefield' ||
        kind === 'youDont' ||
        kind === 'notDeclaredAttacker' ||
        kind === 'enteredFromGraveyard' ||
        kind === 'costContainsX' ||
        kind === 'unlessReturn' ||
        kind === 'cardsExiledWithSelf'
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
