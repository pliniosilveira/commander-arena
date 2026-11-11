/**
 * The "can the engine run it" half of validateAst (SPEC 17.2 A7, D-007). The structural checks
 * in validate.ts say an AST is well-formed; this says every node in it is in SUPPORTED_FEATURES.
 * A card that is marked `supported` but uses anything else is a bug in the card data, caught here
 * before it can reach a game.
 */
import type { CardDefinition, CardFace } from '../cards/definition';
import { LOOK_BACK_TRIGGER_KINDS, SUPPORTED_FEATURES } from './features';
import { overloadIssue } from './overload';
import type {
  Ability,
  Condition,
  Cost,
  Effect,
  ModeChoice,
  ObjectFilter,
  ObjectSelector,
  SpellMode,
  TargetSpec,
  Trigger,
} from './types';
import { kickerOnlyTargets } from './validate-cast';
import { layoutSupportIssues } from './validate-layouts';
import type { AstIssue } from './validate-parts';

const NO_TARGETS: ReadonlyMap<string, TargetSpec> = new Map();

/** The target slots of an ability or spell by id, for the checks that need to know what they match. */
function targetMap(specs: readonly TargetSpec[] | undefined): ReadonlyMap<string, TargetSpec> {
  return new Map((specs ?? []).map((spec) => [spec.id, spec]));
}

/**
 * Whether a card the filter matches could be an Aura (CR 303.4): false when the filter names a type
 * other than enchantment, excludes enchantments, or names a subtype that is not Aura (an Aura has no
 * land or creature subtypes) or the basic supertype.
 */
function mightMatchAura(f: ObjectFilter): boolean {
  const { anyOf, ...outer } = f;
  if (anyOf !== undefined) return anyOf.some((member) => mightMatchAura({ ...outer, ...member }));
  if (f.types !== undefined && !f.types.includes('enchantment')) return false;
  if (f.notTypes?.includes('enchantment')) return false;
  if (f.subtypes !== undefined && !f.subtypes.includes('Aura')) return false;
  if (f.supertypes?.includes('basic')) return false;
  return true;
}

/**
 * CR 303.4f: an Aura that enters the battlefield other than by resolving as an Aura spell has its
 * controller choose what it enchants, which the engine does not ask. So an effect that puts onto
 * the battlefield a card that could be an Aura is not implemented (docs/ROADMAP.md).
 */
function auraEntryIssue(filter: ObjectFilter | null, path: string, out: AstIssue[]): void {
  if (filter === null || !mightMatchAura(filter)) return;
  out.push({
    path,
    message:
      'putting a card that could be an Aura onto the battlefield without casting it is not implemented by the engine yet',
  });
}

/**
 * A token that is a copy of a permanent (CR 707.2) enters without the questions its original asks as
 * it enters, which the engine has no step for: an Aura chooses what to enchant (CR 303.4f). So a copy whose
 * source could be one is not implemented (the questions of a land, D-211, are asked: `rules/enter-token.ts`).
 * `filter` describes the permanent copied (a target slot, or what the trigger is
 * about); null when it cannot be known, which is refused too.
 */
function copySourceIssues(filter: ObjectFilter | null, path: string, out: AstIssue[]): void {
  if (filter === null) {
    out.push({
      path,
      message: 'a copy of a permanent the engine cannot tell the type of is not implemented yet',
    });
    return;
  }
  if (mightMatchAura(filter)) {
    out.push({
      path,
      message:
        'a token copy of a permanent that could be an Aura is not implemented by the engine yet (CR 303.4f)',
    });
  }
  // D-211 (CR 614.12): a token that is a copy of a land asks the questions of a shock land and of a land that reveals a card as a permanent does
  // (`rules/enter-token.ts`), so a copy whose source could be a land is run.
}

/** The filter of the cards an effect's selector names, when the selector says (a target slot, "each"). */
function selectedFilter(
  sel: ObjectSelector,
  targets: ReadonlyMap<string, TargetSpec>,
): ObjectFilter | null {
  if (sel.kind === 'each') return sel.filter;
  if (sel.kind !== 'target') return null;
  const what = targets.get(sel.id)?.what;
  return what?.kind === 'object' ? what.filter : null;
}

/**
 * The filter of the objects the latest moving effect named, for the `moved` reference after it
 * (CR 400.7j): null when that effect's selector gives none ("this").
 */
interface MovedFilter {
  current: ObjectFilter | null;
}

function walkEffect(
  effect: Effect,
  path: string,
  out: AstIssue[],
  targets: ReadonlyMap<string, TargetSpec> = NO_TARGETS,
  moved: MovedFilter = { current: null },
  subject: ObjectFilter | null = null,
): void {
  if (!SUPPORTED_FEATURES.effectKinds.includes(effect.kind)) {
    out.push({ path, message: `effect "${effect.kind}" is not implemented by the engine yet` });
  }
  switch (effect.kind) {
    case 'sequence':
      for (const [i, e] of effect.effects.entries()) {
        walkEffect(e, `${path}.effects[${i}]`, out, targets, moved, subject);
      }
      return;
    case 'conditional':
      // CR 608.2c: the condition must be one the engine evaluates; both branches are walked.
      conditionIssues(effect.condition, `${path}.condition`, out);
      walkEffect(effect.effect, `${path}.effect`, out, targets, moved, subject);
      if (effect.else !== undefined) {
        walkEffect(effect.else, `${path}.else`, out, targets, moved, subject);
      }
      return;
    case 'may':
      // D-135: "you may [do something]": the wrapped effect is held to the same rules.
      walkEffect(effect.effect, `${path}.effect`, out, targets, moved, subject);
      return;
    case 'chooseOne':
      // D-175: each offered instruction is held to the same rules, with the targets and the moved objects of the sequence around it.
      for (const [i, option] of effect.options.entries()) {
        walkEffect(option.effect, `${path}.options[${i}].effect`, out, targets, moved, subject);
      }
      return;
    case 'reflexive':
      // CR 603.12 (D-135): a triggered ability of its own: its own targets, and nothing carried over from the sequence.
      walkEffect(
        effect.effect,
        `${path}.effect`,
        out,
        targetMap(effect.targets),
        { current: null },
        null,
      );
      return;
    case 'mayCast': {
      // D-135: the permission is for a card in the graveyard (`runMayCast` skips any other).
      const zone = selectedFilter(effect.objects, targets)?.zone;
      if (zone !== 'graveyard') {
        out.push({
          path: `${path}.objects`,
          message:
            'a cast permission is for a card in a graveyard: the target says zone "graveyard"',
        });
      }
      return;
    }
    case 'changeTarget': {
      // CR 115.7a, 115.9a (D-181): the engine changes the one target of a spell or ability on the stack; a slot that could name a spell with
      // several targets would change them in a way (CR 115.7a: all or none) it does not run.
      const filter =
        effect.object.kind === 'target'
          ? selectedFilter({ kind: 'target', id: effect.object.id }, targets)
          : null;
      if (filter?.zone !== 'stack' || filter.singleTarget !== true) {
        out.push({
          path: `${path}.object`,
          message:
            'changing a target is run for a target spell or ability on the stack with a single target (singleTarget)',
        });
      }
      return;
    }
    case 'exile':
    case 'destroy':
      moved.current = selectedFilter(effect.objects, targets);
      return;
    case 'moveToZone': {
      // "It" (a `moved` reference) is whatever the effect before it named: a card that could be an
      // Aura cannot be put back onto the battlefield (CR 303.4f), whichever way it is named.
      const named =
        effect.objects.kind === 'moved'
          ? moved.current
          : effect.objects.kind === 'choose'
            ? effect.objects.filter
            : selectedFilter(effect.objects, targets);
      // D-149: an Aura card named by a target, `moved`, `each` or the like chooses what it enchants as it enters (CR 303.4f: `rules/aura-entry.ts`);
      // one picked by a `choose` selector from the hand or the graveyard is still not run.
      if (effect.to === 'battlefield' && effect.objects.kind === 'choose') {
        auraEntryIssue(named, `${path}.objects`, out);
      }
      moved.current = named;
      return;
    }
    case 'addMana':
      // A resolving spell or ability has no way to ask which color: only a mana
      // ability (CR 605.3b) lets the player choose, so choices are not run in an `addMana` effect.
      if (effect.mana.kind !== 'fixed') {
        out.push({
          path: `${path}.mana`,
          message: `a spell or ability effect adding "${effect.mana.kind}" mana is not implemented by the engine yet`,
        });
      }
      return;
    case 'search':
      for (const [i, d] of effect.destinations.entries()) {
        if (!SUPPORTED_FEATURES.searchDestinationKinds.includes(d.zone)) {
          out.push({
            path: `${path}.destinations[${i}]`,
            message: `putting a searched card into "${d.zone}" is not implemented by the engine yet`,
          });
        }
        if (d.zone === 'battlefield') auraEntryIssue(effect.filter, `${path}.filter`, out);
      }
      return;
    case 'revealUntil':
      // D-145: a card that could be an Aura cannot be put onto the battlefield without casting it (CR 303.4f); and it is "it" afterwards.
      if (effect.put === 'battlefield') auraEntryIssue(effect.filter, `${path}.filter`, out);
      moved.current = effect.filter;
      return;
    case 'lookAtTop':
      // CR 303.4f (D-230): an Aura taken onto the battlefield chooses what it enchants (`withAuraEntries` in `rules/look-take.ts`).
      return;
    case 'counterUnlessPays':
      // CR 702.21a: mana, life and discarding cards, no X (rules/pay-unless.ts, D-095).
      activationCostIssues(effect.cost, `${path}.cost`, out, ['mana', 'payLife', 'discard']);
      return;
    case 'mayPay':
      // CR 702.101a (D-120): paid as Ward's cost is (rules/pay-unless.ts): mana and life, no X.
      activationCostIssues(effect.cost, `${path}.cost`, out, ['mana', 'payLife']);
      walkEffect(effect.effect, `${path}.effect`, out, targets, moved, subject);
      return;
    case 'regenerate':
      // CR 701.19a, 514.2: the shield ends with the turn.
      if (!SUPPORTED_FEATURES.durationKinds.includes(effect.duration)) {
        out.push({
          path: `${path}.duration`,
          message: `duration "${effect.duration}" is not implemented by the engine yet`,
        });
      }
      return;
    case 'cumulativeUpkeep':
      // CR 702.24a (D-127): paid as `unlessPays` pays: mana, life and discarding cards, no X.
      activationCostIssues(effect.cost, `${path}.cost`, out, ['mana', 'payLife', 'discard']);
      return;
    case 'unlessPays':
      // CR 118.12a: paid as Ward's cost is (rules/pay-unless.ts), and, D-209, with energy; what happens when it is not is any effect.
      activationCostIssues(effect.cost, `${path}.cost`, out, [
        'mana',
        'payLife',
        'discard',
        'energy',
      ]);
      walkEffect(effect.effect, `${path}.effect`, out, targets, moved, subject);
      return;
    case 'becomeCopy':
      // CR 611.2a: only "until end of turn" has an end the engine runs (CR 514.2). The source must
      // be a permanent on the battlefield (a copy of an Aura or a land is a copy effect on an
      // object that already entered, so nothing is asked, unlike a token).
      if (!SUPPORTED_FEATURES.durationKinds.includes(effect.duration)) {
        out.push({
          path: `${path}.duration`,
          message: `duration "${effect.duration}" is not implemented by the engine yet`,
        });
      }
      if (effect.of.kind === 'target') {
        const zone = selectedFilter(effect.of, targets)?.zone;
        if (zone !== undefined && zone !== 'battlefield') {
          out.push({
            path: `${path}.of`,
            message: 'only a permanent on the battlefield can be copied by becoming a copy',
          });
        }
      }
      return;
    case 'modifyPt':
    case 'setPt':
    case 'loseAllAbilities':
    case 'setTypes':
    case 'setColors':
    case 'grantKeyword':
    case 'restrict':
      // CR 611.2a: only "until end of turn" has an end the engine runs (CR 514.2); a `restrict` also runs "for as long as you control this" (D-196).
      // D-230: and no end at all (`permanent`, CR 611.2a) for what an effect gives a permanent it put onto the battlefield: a base power and toughness, types, a keyword.
      if (
        effect.duration === 'permanent' &&
        (effect.kind === 'setPt' || effect.kind === 'setTypes' || effect.kind === 'grantKeyword')
      ) {
        return;
      }
      if (!SUPPORTED_FEATURES.durationKinds.includes(effect.duration)) {
        out.push({
          path: `${path}.duration`,
          message: `duration "${effect.duration}" is not implemented by the engine yet`,
        });
      }
      return;
    case 'sacrifice':
      if (!SUPPORTED_FEATURES.sacrificeSelectors.includes(effect.objects.kind as never)) {
        out.push({
          path: `${path}.objects`,
          message: `sacrificing "${effect.objects.kind}" is not implemented by the engine yet`,
        });
      }
      return;
    case 'createCopies':
      // D-213: the copies of a group; a source that could be an Aura asks a question the token has no step for (CR 303.4f).
      copySourceIssues(selectedFilter(effect.objects, targets), `${path}.objects`, out);
      return;
    case 'createToken': {
      const token = effect.token;
      if (token.kind === 'preset') {
        if (!SUPPORTED_FEATURES.tokenPresets.includes(token.preset)) {
          out.push({
            path: `${path}.token`,
            message: `the ${token.preset} token is not implemented by the engine yet`,
          });
        }
        return;
      }
      if (token.kind === 'copyOf') {
        if (!SUPPORTED_FEATURES.tokenKinds.includes('copyOf')) {
          out.push({ path: `${path}.token`, message: 'a token copy is not implemented yet' });
        } else if (token.object.kind === 'target') {
          copySourceIssues(selectedFilter(token.object, targets), `${path}.token.object`, out);
        } else if (token.object.kind === 'triggerSubject') {
          copySourceIssues(subject, `${path}.token.object`, out);
        }
        // `this` is checked against the card it sits on (`copiesThisIssues`).
        return;
      }
      const def = token.definition;
      for (const type of def.types) {
        if (!SUPPORTED_FEATURES.tokenTypes.includes(type)) {
          out.push({
            path: `${path}.token.definition.types`,
            message: `a ${type} token is not implemented by the engine yet`,
          });
        }
      }
      if (def.power === '*' || def.toughness === '*') {
        out.push({
          path: `${path}.token.definition.power`,
          message: 'characteristic-defining power/toughness (*) is not implemented yet',
        });
      }
      for (const [i, a] of def.abilities.entries()) {
        walkAbility(a, `${path}.token.definition.abilities[${i}]`, out, 'token');
        if (a.kind === 'static' && 'subject' in a.static && a.static.subject.kind === 'attached') {
          if (!def.subtypes.includes('Equipment')) {
            out.push({
              path: `${path}.token.definition.abilities[${i}]`,
              message: 'only an Equipment token can have an "attached" static ability',
            });
          }
        }
      }
      return;
    }
    default:
      return;
  }
}

/**
 * A symbol of a mana ability's cost the planner can plan: generic ({1}), one color ({U}, {C}) or a
 * hybrid symbol ({R/W}, {C/W}, {2/W}; CR 107.4e, D-099).
 */
const PLAIN_COST_SYMBOL = /^(0|[1-9][0-9]*|[WUBRGC]|[WUBRG]\/[WUBRG]|C\/[WUBRG]|2\/[WUBRG])$/;

function conditionIssues(c: Condition, path: string, out: AstIssue[]): void {
  if (!SUPPORTED_FEATURES.conditionKinds.includes(c.kind)) {
    out.push({ path, message: `condition "${c.kind}" is not implemented by the engine yet` });
    return;
  }
  switch (c.kind) {
    case 'and':
    case 'or':
      for (const [i, t] of c.terms.entries()) conditionIssues(t, `${path}.terms[${i}]`, out);
      return;
    case 'not':
      conditionIssues(c.term, `${path}.term`, out);
      return;
    default:
      return;
  }
}

/** Whether the condition reads the battlefield (counts permanents), at any depth. */
function conditionCountsPermanents(c: Condition): boolean {
  switch (c.kind) {
    case 'controlsAtLeast':
    case 'opponentControlsAtLeast':
    case 'controlsGreatest':
    case 'controlCommander':
      return true;
    case 'and':
    case 'or':
      return c.terms.some(conditionCountsPermanents);
    case 'not':
      return conditionCountsPermanents(c.term);
    default:
      return false;
  }
}

/**
 * Issues for the costs of an activated ability or of Cycling (CR 602.1, 702.29a): each kind must be
 * in `costKinds` (and in `allowed` when the caller narrows it). An {X} in a mana cost is announced
 * (CR 602.2b, D-103) only for the ability itself (`allowX`), not for a keyword's cost.
 */
function activationCostIssues(
  costs: readonly Cost[],
  path: string,
  out: AstIssue[],
  allowed?: readonly Cost['kind'][],
  allowX = false,
  /** D-135: the life paid may be an amount that reads the game: only the cost of an activated ability has it worked out. */
  allowLifeAmount = false,
): void {
  const sacrifices = costs.filter((c) => c.kind === 'sacrifice').length;
  const discards = costs.filter((c) => c.kind === 'discard').length;
  const tapping = costs.filter((c) => c.kind === 'tapCreatures').length;
  const tappingPermanents = costs.filter((c) => c.kind === 'tapPermanents').length;
  if (
    tappingPermanents > 1 ||
    (tappingPermanents === 1 && costs.some((c) => c.kind === 'mana' || c.kind === 'tapCreatures'))
  ) {
    // `breakDown` (rules/activate-costs.ts) pays the permanents to tap before the sacrifice and the discard and never
    // with mana: the player could have tapped them for mana first, and nothing promises they are still untapped.
    out.push({
      path,
      message:
        'a cost that taps untapped permanents combined with another one, a mana cost or a creature-tapping cost is not implemented by the engine yet',
    });
  }
  if (
    tapping > 1 ||
    (tapping === 1 &&
      costs.some((c) => c.kind === 'mana' || c.kind === 'sacrifice' || c.kind === 'discard'))
  ) {
    // `breakDown` (rules/activate-costs.ts) pays a crew cost alone: the creatures are chosen after
    // the other costs, and nothing promises they are still untapped or not spent on mana.
    out.push({
      path,
      message:
        'a creature-tapping cost combined with another creature-tapping, mana, sacrifice or discard cost is not implemented by the engine yet',
    });
  }
  if (sacrifices > 1) {
    // `breakDown` (rules/activate-costs.ts) pays one sacrifice; an ability with two is never offered.
    out.push({
      path,
      message: 'more than one sacrifice cost is not implemented by the engine yet',
    });
  }
  if (discards > 1) {
    // `breakDown` (rules/activate-costs.ts) pays one discard cost, of N cards.
    out.push({ path, message: 'more than one discard cost is not implemented by the engine yet' });
  }
  if (costs.filter((c) => c.kind === 'returnToHand').length > 1) {
    // `breakDown` pays one return cost (D-139), of N permanents.
    out.push({
      path,
      message:
        'more than one cost that returns permanents to hand is not implemented by the engine yet',
    });
  }
  for (const [i, c] of costs.entries()) {
    if (
      !SUPPORTED_FEATURES.costKinds.includes(c.kind) ||
      allowed?.includes(c.kind) === false ||
      // D-209: an energy cost is paid only where an `unlessPays` names it.
      (c.kind === 'energy' && allowed?.includes('energy') !== true)
    ) {
      out.push({
        path: `${path}[${i}]`,
        message: `cost "${c.kind}" is not implemented by the engine yet`,
      });
    } else if (c.kind === 'mana' && c.symbols.includes('X') && !allowX) {
      out.push({
        path: `${path}[${i}]`,
        message: 'X in the cost of a keyword is not implemented by the engine yet',
      });
    } else if (c.kind === 'payLife' && typeof c.amount !== 'number' && !allowLifeAmount) {
      out.push({
        path: `${path}[${i}]`,
        message:
          'life paid by an amount (equal to a count) is run only as the cost of an activated ability',
      });
    }
  }
}

/** Whether the filter, or one of its `anyOf` members, compares power or toughness (D-111). */
function filterComparesPt(f: ObjectFilter): boolean {
  return (
    f.power !== undefined || f.toughness !== undefined || (f.anyOf?.some(filterComparesPt) ?? false)
  );
}

/**
 * The permanents the `triggerSubject` of a trigger can be, as a filter: what the trigger names, a
 * land for landfall, any permanent for "whenever you sacrifice a permanent". Null when it is the
 * permanent the ability sits on (`this`, checked against its card) or not a permanent (a spell, a
 * step), where the question does not arise.
 */
function triggerSubjectFilter(t: Trigger): ObjectFilter | null {
  switch (t.kind) {
    case 'entersBattlefield':
    case 'dies':
    case 'attacks':
    case 'becomesTapped':
    case 'becomesUntapped':
    case 'blocks':
    case 'becomesBlocked':
    case 'dealsCombatDamage':
    case 'leavesBattlefield':
      return 'kind' in t.what ? null : t.what;
    case 'landfall':
      return { types: ['land'] };
    case 'permanentSacrificed':
      return t.filter ?? {};
    case 'tapsForMana':
      return t.what;
    default:
      return null;
  }
}

/**
 * The modes of a modal spell or ability (CR 700.2, D-114): each mode is a small spell, walked with its own
 * targets, and the condition that widens how many may be chosen must be one the engine evaluates.
 */
function walkModes(
  modes: readonly SpellMode[],
  choose: ModeChoice | undefined,
  path: string,
  out: AstIssue[],
  subject: ObjectFilter | null = null,
): void {
  if (choose?.maxIf !== undefined) {
    conditionIssues(choose.maxIf.condition, `${path}.chooseModes.maxIf.condition`, out);
  }
  for (const [i, mode] of modes.entries()) {
    walkEffect(
      mode.effect,
      `${path}.modes[${i}].effect`,
      out,
      targetMap(mode.targets),
      { current: null },
      subject,
    );
  }
}

/** `owner` is where the ability sits: a token cannot ask a question as it enters (see below). */
function walkAbility(
  a: Ability,
  path: string,
  out: AstIssue[],
  owner: 'card' | 'token' = 'card',
): void {
  if (!SUPPORTED_FEATURES.abilityKinds.includes(a.kind)) {
    out.push({ path, message: `ability kind "${a.kind}" is not implemented by the engine yet` });
    return;
  }
  switch (a.kind) {
    case 'mana':
      if (!SUPPORTED_FEATURES.manaProductionKinds.includes(a.production.kind)) {
        out.push({
          path: `${path}.production`,
          message: `mana production "${a.production.kind}" is not implemented by the engine yet`,
        });
      }
      for (const [i, c] of a.cost.entries()) {
        if (!SUPPORTED_FEATURES.manaAbilityCostKinds.includes(c.kind)) {
          out.push({
            path: `${path}.cost[${i}]`,
            message: `mana ability cost "${c.kind}" is not implemented by the engine yet`,
          });
        } else if (c.kind === 'sacrifice' && !('kind' in c.what) && c.what.zone !== undefined) {
          // CR 701.21a (D-216): the permanent itself, or a permanent of a kind the controller has ("Sacrifice a Spirit"); the filter is read on the battlefield.
          out.push({
            path: `${path}.cost[${i}]`,
            message:
              'a mana ability sacrifices a permanent of the battlefield: no zone in the filter',
          });
        } else if (c.kind === 'payLife' && typeof c.amount !== 'number') {
          // D-135: the life of a mana ability is a number (the payment planner reads it before anything resolves).
          out.push({
            path: `${path}.cost[${i}]`,
            message: 'a mana ability pays a fixed amount of life in this engine',
          });
        } else if (c.kind === 'mana' && !c.symbols.every((s) => PLAIN_COST_SYMBOL.test(s))) {
          // The planner pays an activation cost from generic, colored and hybrid mana: no X,
          // Phyrexian or snow.
          out.push({
            path: `${path}.cost[${i}]`,
            message:
              'a mana ability may cost only generic, single-color or hybrid mana in this engine',
          });
        }
      }
      if (a.activateOnlyIf !== undefined) {
        conditionIssues(a.activateOnlyIf, `${path}.activateOnlyIf`, out);
      }
      for (const [i, e] of (a.also ?? []).entries()) {
        if (!SUPPORTED_FEATURES.manaAbilityAlsoKinds.includes(e.kind)) {
          out.push({
            path: `${path}.also[${i}]`,
            message: `effect "${e.kind}" on a mana ability is not implemented by the engine yet`,
          });
        }
      }
      return;
    case 'static':
      if (!SUPPORTED_FEATURES.staticKinds.includes(a.static.kind)) {
        out.push({
          path: `${path}.static`,
          message: `static effect "${a.static.kind}" is not implemented by the engine yet`,
        });
      } else if (
        'subject' in a.static &&
        !SUPPORTED_FEATURES.staticSubjectKinds.includes(a.static.subject.kind)
      ) {
        out.push({
          path: `${path}.static.subject`,
          message: `static subject "${a.static.subject.kind}" is not implemented by the engine yet`,
        });
      } else if (
        a.static.kind !== 'modifyPt' &&
        // D-133: a restriction is read where the rule acts, after the layers, so its subject may compare power.
        a.static.kind !== 'restriction' &&
        'subject' in a.static &&
        a.static.subject.kind === 'filter' &&
        filterComparesPt(a.static.subject.filter)
      ) {
        // D-111: only a "+N/+N" effect (layer 7c) reads power or toughness; a keyword or ability granted in
        // layer 6 would have to decide before the layers that set them, which CR 613.8 settles only
        // case by case.
        out.push({
          path: `${path}.static.subject`,
          message: `a power or toughness comparison in the subject of a "${a.static.kind}" static ability is not implemented by the engine yet (CR 613.8)`,
        });
      } else if (a.static.kind === 'grantAbility') {
        // D-099: the ability a static ability gives is held to the same rules as one of the card.
        walkAbility(a.static.ability, `${path}.static.ability`, out, owner);
      }
      if (a.static.kind === 'restrictionUnless' && a.static.unless !== undefined) {
        // D-145: the condition that lifts the restriction is read where the rule acts, like any condition.
        conditionIssues(a.static.unless, `${path}.static.unless`, out);
      }
      return;
    case 'triggered':
      if (!SUPPORTED_FEATURES.triggerKinds.includes(a.trigger.kind)) {
        out.push({
          path: `${path}.trigger`,
          message: `trigger "${a.trigger.kind}" is not implemented by the engine yet`,
        });
      } else if (a.trigger.kind === 'chapter' && owner === 'token') {
        // A token has no `finalChapter` to check and no Saga face; only a card is a Saga here.
        out.push({
          path: `${path}.trigger`,
          message: 'a chapter ability on a token is not implemented by the engine yet',
        });
      }
      if (a.interveningIf !== undefined) {
        conditionIssues(a.interveningIf, `${path}.interveningIf`, out);
        // CR 603.10a: these triggers look back in time, and the engine reads the condition on the
        // battlefield as it is after the event, which would miscount what just left.
        if (
          LOOK_BACK_TRIGGER_KINDS.includes(a.trigger.kind) &&
          conditionCountsPermanents(a.interveningIf)
        ) {
          out.push({
            path: `${path}.interveningIf`,
            message: `an intervening "if" that counts permanents on a "${a.trigger.kind}" trigger is not implemented by the engine yet (CR 603.10a)`,
          });
        }
      }
      if (a.triggerCondition !== undefined) {
        conditionIssues(a.triggerCondition, `${path}.triggerCondition`, out);
        if (
          LOOK_BACK_TRIGGER_KINDS.includes(a.trigger.kind) &&
          conditionCountsPermanents(a.triggerCondition)
        ) {
          out.push({
            path: `${path}.triggerCondition`,
            message: `a condition that counts permanents on a "${a.trigger.kind}" trigger is not implemented by the engine yet (CR 603.10a)`,
          });
        }
      }
      if (a.modes !== undefined) {
        walkModes(a.modes, a.chooseModes, path, out, triggerSubjectFilter(a.trigger));
        return;
      }
      walkEffect(
        a.effect,
        `${path}.effect`,
        out,
        targetMap(a.targets),
        { current: null },
        triggerSubjectFilter(a.trigger),
      );
      return;
    case 'activated':
      activationCostIssues(a.cost, `${path}.cost`, out, undefined, true, true);
      if (a.costReducedIf !== undefined) {
        conditionIssues(a.costReducedIf.condition, `${path}.costReducedIf.condition`, out);
      }
      if (a.activateOnlyIf !== undefined) {
        conditionIssues(a.activateOnlyIf, `${path}.activateOnlyIf`, out);
      }
      if (a.modes !== undefined) {
        walkModes(a.modes, a.chooseModes, path, out);
        return;
      }
      walkEffect(a.effect, `${path}.effect`, out, targetMap(a.targets));
      return;
    case 'keyword':
      if (!SUPPORTED_FEATURES.keywordKinds.includes(a.keyword.kind)) {
        out.push({
          path: `${path}.keyword`,
          message: `keyword "${a.keyword.kind}" is not implemented by the engine yet`,
        });
      } else if (a.keyword.kind === 'cycling') {
        // CR 702.29a: the cost is paid like any activation cost; only mana and life are run.
        activationCostIssues(a.keyword.cost, `${path}.keyword.cost`, out, ['mana', 'payLife']);
      } else if (a.keyword.kind === 'equip') {
        // CR 702.6a: paid like any activation cost; only mana and life are run (as for Cycling).
        activationCostIssues(a.keyword.cost, `${path}.keyword.cost`, out, ['mana', 'payLife']);
      } else if (a.keyword.kind === 'ward') {
        // CR 702.21a: paid when the ward ability resolves (rules/pay-unless.ts): mana, life and
        // discarding cards (D-095), no X.
        activationCostIssues(a.keyword.cost, `${path}.keyword.cost`, out, [
          'mana',
          'payLife',
          'discard',
        ]);
      } else if (a.keyword.kind === 'kicker' || a.keyword.kind === 'multikicker') {
        // CR 702.33a, 702.33c: an additional cost; mana and life are paid by the cast (rules/cast.ts).
        activationCostIssues(a.keyword.cost, `${path}.keyword.cost`, out, ['mana', 'payLife']);
      } else if (a.keyword.kind === 'typecycling') {
        // CR 702.29e: paid like any activation cost, as for Cycling.
        activationCostIssues(a.keyword.cost, `${path}.keyword.cost`, out, ['mana', 'payLife']);
      } else if (a.keyword.kind === 'flashback') {
        // CR 702.34a: an alternative cost; mana only (rules/legality.ts, rules/cast.ts).
        activationCostIssues(a.keyword.cost, `${path}.keyword.cost`, out, ['mana']);
      } else if (a.keyword.kind === 'echo') {
        // CR 702.30a: paid as the echo trigger resolves (rules/pay-unless.ts); mana only, no X (D-127).
        activationCostIssues(a.keyword.cost, `${path}.keyword.cost`, out, ['mana']);
      } else if (a.keyword.kind === 'cumulativeUpkeep') {
        // CR 702.24a: the cost for each age counter is paid as `unlessPays` pays (rules/pay-unless.ts): mana, life
        // and discarding cards; "sacrifice a creature" and the like are not run (D-127).
        activationCostIssues(a.keyword.cost, `${path}.keyword.cost`, out, [
          'mana',
          'payLife',
          'discard',
        ]);
      } else if (a.keyword.kind === 'escalate') {
        // CR 702.120a: an additional cost paid as the spell is cast (rules/cast.ts); mana only, no X (D-145).
        activationCostIssues(a.keyword.cost, `${path}.keyword.cost`, out, ['mana']);
      } else if (a.keyword.kind === 'replicate') {
        // CR 702.56a: an additional cost paid as the spell is cast (rules/cast.ts); mana only, no X (D-129).
        activationCostIssues(a.keyword.cost, `${path}.keyword.cost`, out, ['mana']);
      } else if (a.keyword.kind === 'suspend') {
        // CR 702.62a: paid as the special action is taken (rules/special-actions.ts); mana only, no X (D-128).
        activationCostIssues(a.keyword.cost, `${path}.keyword.cost`, out, ['mana']);
      } else if (a.keyword.kind === 'encore') {
        // CR 702.141a: paid like any activation cost from the graveyard; mana only (D-185).
        activationCostIssues(a.keyword.cost, `${path}.keyword.cost`, out, ['mana']);
      } else if (a.keyword.kind === 'unearth') {
        // CR 702.84a: paid like any activation cost from the graveyard; mana only (D-124).
        activationCostIssues(a.keyword.cost, `${path}.keyword.cost`, out, ['mana']);
      } else if (a.keyword.kind === 'enchant' && owner === 'token') {
        // An Aura token would enter the battlefield with no spell to say what it enchants (CR 303.4f).
        out.push({
          path: `${path}.keyword`,
          message: 'an Aura token is not implemented by the engine yet',
        });
      }
      return;
    case 'replacement':
      if (!SUPPORTED_FEATURES.replacementKinds.includes(a.replacement.kind)) {
        out.push({
          path: `${path}.replacement`,
          message: `replacement "${a.replacement.kind}" is not implemented by the engine yet`,
        });
      }
      if (a.replacement.kind === 'entersTapped' && a.replacement.unless !== undefined) {
        conditionIssues(a.replacement.unless, `${path}.replacement.unless`, out);
      }
      if (
        (a.replacement.kind === 'entersTappedUnlessPays' ||
          a.replacement.kind === 'entersTappedUnlessReveals') &&
        owner === 'token'
      ) {
        // The question is asked while a card moves to the battlefield; creating a token has no such step.
        out.push({
          path: `${path}.replacement`,
          message: 'a token that asks to pay as it enters is not implemented by the engine yet',
        });
      }
      return;
    case 'level':
      // CR 716.2a (D-235): the abilities of a class level bar are held to the same rules as any other.
      for (const [i, inner] of a.abilities.entries()) {
        walkAbility(inner, `${path}.abilities[${i}]`, out, owner);
      }
      return;
    default:
      return;
  }
}

/** Whether the effect creates a token that is a copy of `this` permanent, at any depth. */
function copiesThis(effect: Effect): boolean {
  switch (effect.kind) {
    case 'createToken':
      return effect.token.kind === 'copyOf' && effect.token.object.kind === 'this';
    case 'sequence':
      return effect.effects.some(copiesThis);
    case 'conditional':
      return copiesThis(effect.effect) || (effect.else !== undefined && copiesThis(effect.else));
    default:
      return false;
  }
}

/**
 * "Create a token that's a copy of this" on a land or an Aura: the copy would enter without the
 * question the original asks (see `copySourceIssues`).
 */
function copiesThisIssues(face: CardFace, base: string, out: AstIssue[]): void {
  const copies = face.abilities.some(
    (a) => (a.kind === 'triggered' || a.kind === 'activated') && copiesThis(a.effect),
  );
  const asks =
    face.types.includes('land') ||
    face.abilities.some((a) => a.kind === 'keyword' && a.keyword.kind === 'enchant');
  if (copies && asks) {
    out.push({
      path: `${base}.abilities`,
      message:
        'a token copy of a land or an Aura is not implemented by the engine yet (CR 303.4f, 614.12)',
    });
  }
}

/**
 * The additional costs and the alternative cost of a face (D-095): each cost kind must be one the
 * engine pays (`costKinds`, narrowed by `ADDITIONAL_COST_KINDS` in the structural check), the
 * alternative must be in `castAlternatives`, and its condition must be one the engine evaluates.
 */
function additionalCostIssues(face: CardFace, base: string, out: AstIssue[]): void {
  for (const [i, c] of (face.additionalCosts ?? []).entries()) {
    if (!SUPPORTED_FEATURES.costKinds.includes(c.kind) || c.kind === 'exileFromGraveyard') {
      out.push({
        path: `${base}.additionalCosts[${i}]`,
        message: `cost "${c.kind}" is not implemented by the engine yet`,
      });
    } else if (c.kind === 'payLife' && typeof c.amount !== 'number') {
      out.push({
        path: `${base}.additionalCosts[${i}]`,
        message: 'life paid by an amount is run only as the cost of an activated ability',
      });
    }
  }
  // D-181: the costs of each way of a choice are held to the same rules.
  for (const [w, way] of (face.additionalCostChoice ?? []).entries()) {
    for (const [i, c] of way.entries()) {
      if (!SUPPORTED_FEATURES.costKinds.includes(c.kind) || c.kind === 'exileFromGraveyard') {
        out.push({
          path: `${base}.additionalCostChoice[${w}][${i}]`,
          message: `cost "${c.kind}" is not implemented by the engine yet`,
        });
      } else if (c.kind === 'payLife' && typeof c.amount !== 'number') {
        out.push({
          path: `${base}.additionalCostChoice[${w}][${i}]`,
          message: 'life paid by an amount is run only as the cost of an activated ability',
        });
      }
    }
  }
  for (const [i, alt] of (face.alternativeCosts ?? []).entries()) {
    if (!SUPPORTED_FEATURES.castAlternatives.includes(alt.kind)) {
      out.push({
        path: `${base}.alternativeCosts[${i}]`,
        message: `alternative cost "${alt.kind}" is not implemented by the engine yet`,
      });
    } else {
      if (alt.condition !== undefined) {
        conditionIssues(alt.condition, `${base}.alternativeCosts[${i}].condition`, out);
      }
      // D-121, CR 702.96a: overload changes the spell's text; the engine must be able to make the change.
      const refused = alt.kind === 'overload' ? overloadIssue(face.spell) : null;
      if (refused !== null) out.push({ path: `${base}.alternativeCosts[${i}]`, message: refused });
    }
  }
}

/** Issues for features outside SUPPORTED_FEATURES. Empty when the engine can execute the card. */
export function unsupportedFeatureIssues(def: CardDefinition): AstIssue[] {
  const out: AstIssue[] = [];
  if (!SUPPORTED_FEATURES.layouts.includes(def.layout)) {
    out.push({ path: 'layout', message: `layout "${def.layout}" is not implemented yet` });
  } else {
    out.push(...layoutSupportIssues(def));
  }
  for (const [f, face] of def.faces.entries()) {
    const base = `faces[${f}]`;
    for (const t of face.types) {
      if (!SUPPORTED_FEATURES.cardTypes.includes(t)) {
        out.push({ path: `${base}.types`, message: `card type "${t}" is not implemented yet` });
      }
    }
    // CR 208.2a, 604.3 (D-115): a printed '*' is run when a characteristic-defining ability defines it
    // (`validateCard` checks the pairing); a star nothing defines is not.
    for (const key of ['power', 'toughness'] as const) {
      const defined = face.abilities.some(
        (a) =>
          a.kind === 'static' &&
          a.static.kind === 'characteristicPt' &&
          a.static[key] !== undefined,
      );
      if (face[key] === '*' && !defined) {
        out.push({
          path: `${base}.${key}`,
          message: `a printed '*' ${key} with no characteristic-defining ability is not implemented by the engine`,
        });
      }
    }
    for (const [i, a] of face.abilities.entries()) walkAbility(a, `${base}.abilities[${i}]`, out);
    copiesThisIssues(face, base, out);
    additionalCostIssues(face, base, out);
    // CR 702.5c: every instance of enchant applies; the Aura's one target slot reads only one.
    if (
      face.abilities.filter((a) => a.kind === 'keyword' && a.keyword.kind === 'enchant').length > 1
    ) {
      out.push({
        path: `${base}.abilities`,
        message: 'more than one enchant ability is not implemented by the engine yet',
      });
    }
    // CR 702.33b: a second kicker cost is not run, and neither is a kicker with a multikicker (D-110: one
    // question, one cost); a card with two flashback costs would have two alternative costs to choose
    // from (CR 118.9a).
    const kickers = face.abilities.filter(
      (a) =>
        a.kind === 'keyword' && (a.keyword.kind === 'kicker' || a.keyword.kind === 'multikicker'),
    );
    if (kickers.length > 1) {
      out.push({
        path: `${base}.abilities`,
        message: 'more than one kicker or multikicker ability is not implemented by the engine yet',
      });
    }
    // CR 702.56b (D-129): each instance of replicate is paid and triggers separately; the engine asks one count, so
    // one instance is run.
    if (
      face.abilities.filter((a) => a.kind === 'keyword' && a.keyword.kind === 'replicate').length >
      1
    ) {
      out.push({
        path: `${base}.abilities`,
        message: 'more than one replicate ability is not implemented by the engine yet',
      });
    }
    const flashbacks = face.abilities.filter(
      (a) => a.kind === 'keyword' && a.keyword.kind === 'flashback',
    );
    if (flashbacks.length > 1) {
      out.push({
        path: `${base}.abilities`,
        message: 'more than one flashback ability is not implemented by the engine yet',
      });
    }
    const spell = face.spell;
    if (spell) {
      for (const id of kickerOnlyTargets(spell)) {
        out.push({
          path: `${base}.spell.targets`,
          message: `target "${id}" is used only if the spell was kicked (or only if it was not) but is not declared ifKicked or unlessKicked (CR 702.33g, 601.2c)`,
        });
      }
      if (spell.modes) walkModes(spell.modes, spell.chooseModes, `${base}.spell`, out);
      if (spell.effect) {
        walkEffect(spell.effect, `${base}.spell.effect`, out, targetMap(spell.targets));
      }
    }
  }
  return out;
}
