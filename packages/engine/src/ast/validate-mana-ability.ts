/**
 * Validation of a whole mana ability (CR 605.1a): its costs, what it produces, the effects it
 * carries and the restriction on activating it (CR 602.5b, D-099). It is the mana ability of a card
 * and the one a static `grantAbility` gives. Split from `validate.ts` and `validate-mana.ts`.
 */
import { CARD_TYPES, COLORS } from '../characteristics';
import type { ManaAbility, ObjectFilter } from './types';
import { checkBattlefieldFilter } from './validate-attach';
import { issue, kindOf, type Out } from './validate-base';
import { checkByEffectsAlso, checkManaAbilityAlso, checkManaProduction } from './validate-mana';
import {
  checkCondition,
  checkCosts,
  checkDelayedCast,
  checkEnumList,
  checkFilter,
  checkStateAmount,
  filterSome,
  readsCombatOrSource,
} from './validate-parts';

export function checkManaAbility(a: ManaAbility, path: string, out: Out): void {
  checkCosts(a.cost, `${path}.cost`, out);
  // CR 119.4: paying 0 life is no cost, so a life cost of a mana ability names at least 1.
  (Array.isArray(a.cost) ? a.cost : []).forEach((c, i) => {
    if (c?.kind === 'payLife' && Number.isSafeInteger(c.amount) && c.amount < 1) {
      issue(out, `${path}.cost[${i}].amount`, 'life paid must be at least 1');
    }
    if (c?.kind === 'sacrifice' && c.count !== undefined) {
      issue(
        out,
        `${path}.cost[${i}].count`,
        'a mana ability sacrifices one permanent: no count (D-133)',
      );
    }
    if (c?.kind === 'sacrifice' && c.anyNumber !== undefined) {
      issue(
        out,
        `${path}.cost[${i}].anyNumber`,
        'a mana ability sacrifices one permanent: no "any number" (D-491)',
      );
    }
    if (c?.kind === 'mana' && c.onlyChosenColor !== undefined) {
      issue(
        out,
        `${path}.cost[${i}].onlyChosenColor`,
        'spending only mana of the chosen color is a restriction on the cost of an activated ability, not of a mana ability',
      );
    }
    if (
      c?.kind === 'removeCounters' &&
      (c.counter === undefined || c.countX !== undefined || c.fromOne !== undefined)
    ) {
      issue(
        out,
        `${path}.cost[${i}]`,
        'a mana ability takes a named kind of counter off its own permanent: no X, no choice of kind, no single permanent',
      );
    }
    if (c?.kind === 'removeCounters' && c.among !== undefined) {
      issue(
        out,
        `${path}.cost[${i}].among`,
        'a mana ability takes counters off its own permanent: no "from among" (Federation Fleet group D)',
      );
    }
    if (c?.kind === 'tapPermanents' && c.count !== 1) {
      issue(
        out,
        `${path}.cost[${i}].count`,
        'a mana ability taps one permanent besides its source (D-625)',
      );
    }
    if (c?.kind === 'tapPermanents' && (a.cost ?? []).some((o) => o?.kind === 'sacrifice')) {
      issue(
        out,
        `${path}.cost[${i}]`,
        'a mana ability that taps a permanent does not also sacrifice one: the player would name two choices (D-625)',
      );
    }
    if (c?.kind === 'sacrifice' && c.countX !== undefined) {
      issue(
        out,
        `${path}.cost[${i}].countX`,
        'a mana ability sacrifices one permanent: no X (it uses no stack to announce one, D-488)',
      );
    }
  });
  checkManaProduction(a.production, `${path}.production`, out);
  // CR 107.3, 605.3b (Hazel of the Rootbloom): the X of "Add X mana in any combination of colors" is the number of permanents the one "Tap X untapped ..." cost taps, so each
  // needs the other; that cost does not come with a choice of another kind (a sacrifice, a single permanent to tap, a counter) or a production that replaces its own.
  const tapsX = (Array.isArray(a.cost) ? a.cost : []).filter((c) => c?.kind === 'tapPermanentsX');
  if (tapsX.length > 1) {
    issue(out, `${path}.cost`, 'a mana ability taps X permanents in one cost only');
  }
  if (tapsX.length === 1 && a.production?.kind !== 'anyCombinationTapped') {
    issue(
      out,
      `${path}.production`,
      'a cost that taps X permanents is paired with the production of X mana in any combination of colors',
    );
  }
  if (a.production?.kind === 'anyCombinationTapped' && tapsX.length !== 1) {
    issue(
      out,
      `${path}.cost`,
      'the production of X mana in any combination of colors needs the cost that taps X permanents',
    );
  }
  if (
    tapsX.length > 0 &&
    ((a.cost ?? []).some(
      (c) => c?.kind === 'sacrifice' || c?.kind === 'tapPermanents' || c?.kind === 'removeCounters',
    ) ||
      a.instead !== undefined ||
      a.putCounter !== undefined)
  ) {
    issue(
      out,
      `${path}.cost`,
      'a mana ability that taps X permanents has no other choice to make: no sacrifice, other tap cost, counters or replacing production',
    );
  }
  if (a.production?.kind === 'producedType') {
    issue(
      out,
      `${path}.production`,
      'one mana of a type a permanent produced is only the effect of a "tapped for mana" triggered mana ability (CR 605.1b), not what a mana ability makes',
    );
  }
  // CR 605.1a, 605.3b: "Add {C} for each charge counter on this artifact" (Elementalist's Palette), "Add {U} for each artifact you control" (Uthros, Titanic Godcore): the count is read as the
  // ability is activated and is what the game says then (a count, the counters on this permanent, ...): no target, no X and no earlier instruction to read. A cost that gives a permanent
  // up or takes counters off could change what it counts, so the two are not combined.
  if (a.production?.kind === 'fixed' && a.production.times !== undefined) {
    checkStateAmount(
      a.production.times,
      `${path}.production.times`,
      out,
      'the mana a mana ability makes',
    );
    if (
      (a.cost ?? []).some(
        (c) => c?.kind === 'sacrifice' || c?.kind === 'removeCounters' || c?.kind === 'putCounters',
      )
    ) {
      issue(
        out,
        `${path}.production.times`,
        'the count is read before the costs are paid: no cost that gives up a permanent or takes counters off',
      );
    }
  }
  // D-650: the mana that stays through steps and phases is the mana of a spell or a triggered ability's instruction; a mana ability's mana empties as any mana does.
  if (
    a.production?.kind === 'fixed' &&
    (a.production.staysUntilEndOfTurn !== undefined ||
      a.production.staysUntilEndOfCombat !== undefined)
  ) {
    issue(
      out,
      `${path}.production.staysUntilEndOfTurn`,
      'the mana of a mana ability empties as steps and phases end',
    );
  }
  // "Add X mana of any one color, where X is this creature's power": an amount the game says now, read for the permanent itself (CR 605.1a: no X, no target).
  if (a.production?.kind === 'anyColorAmount' || a.production?.kind === 'anyCombinationAmount') {
    const amount = a.production.amount;
    if (typeof amount === 'object' && amount !== null && amount.kind === 'powerOf') {
      if (kindOf(amount.of) !== 'this') {
        issue(
          out,
          `${path}.production.amount.of`,
          'a mana ability reads the power of this permanent only',
        );
      }
    } else {
      checkStateAmount(amount, `${path}.production.amount`, out, 'the mana a mana ability makes');
    }
    // CR 113.7a, 605.3b (Glittering Stockpile): giving up this permanent leaves the counters on it as they were, so an amount that counts only those may be combined with it.
    const ownCounters =
      typeof amount === 'object' &&
      amount !== null &&
      amount.kind === 'countersOn' &&
      kindOf(amount.of) === 'this';
    if (
      (a.cost ?? []).some(
        (c) =>
          (c?.kind === 'sacrifice' && !(ownCounters && kindOf(c.what) === 'this')) ||
          c?.kind === 'removeCounters' ||
          c?.kind === 'putCounters',
      )
    ) {
      issue(
        out,
        `${path}.cost`,
        'the amount is counted before the costs are paid: no cost that gives up a permanent or takes counters off',
      );
    }
  }
  // "For each color among permanents you control, add one mana of that color." (CR 105.2): the colors among the battlefield permanents a filter matches, counted before the costs are paid.
  if (a.production?.kind === 'eachColorAmong') {
    const filter = a.production.filter;
    if (filter === undefined || filter === null) {
      issue(out, `${path}.production.filter`, 'eachColorAmong needs a filter');
    } else {
      checkBattlefieldFilter(filter, `${path}.production.filter`, out);
      if (
        filterSome(
          filter,
          (f) => readsCombatOrSource(f) || f.power !== undefined || f.toughness !== undefined,
        )
      ) {
        issue(
          out,
          `${path}.production.filter`,
          'eachColorAmong cannot read the combat, the source power, power or toughness',
        );
      }
    }
    if (
      (a.cost ?? []).some(
        (c) => c?.kind === 'sacrifice' || c?.kind === 'removeCounters' || c?.kind === 'putCounters',
      )
    ) {
      issue(
        out,
        `${path}.cost`,
        'the colors are counted before the costs are paid: no cost that gives up a permanent or takes counters off',
      );
    }
  }
  if (a.oncePerTurn !== undefined && a.oncePerTurn !== true) {
    issue(out, `${path}.oncePerTurn`, 'oncePerTurn must be true');
  }
  // CR 605.3b, 122.6 (Empowered Autogenerator, Glittering Stockpile): the counters the ability puts on its own permanent before its mana is added, so that an amount counts after them; a
  // production that counts nothing is not told apart from putting them after the mana.
  if (a.putCounter !== undefined) {
    if (typeof a.putCounter.counter !== 'string' || a.putCounter.counter === '') {
      issue(out, `${path}.putCounter.counter`, 'the kind of counter is a name');
    }
    if (!Number.isSafeInteger(a.putCounter.count) || a.putCounter.count < 1) {
      issue(out, `${path}.putCounter.count`, 'count must be a positive integer');
    }
  }
  if (a.production?.kind === 'anyColorAmong') {
    // CR 106.1b: the cards whose colors are looked at; the filter reads a zone and what the objects are, nothing of the combat, a target or X.
    const filter = a.production.filter as ObjectFilter | undefined | null;
    if (filter === undefined || filter === null) {
      issue(out, `${path}.production.filter`, 'anyColorAmong needs a filter for the objects');
    } else {
      checkFilter(filter, `${path}.production.filter`, out);
      if (filterSome(filter, (f) => f.stackKind !== undefined || f.zone === 'stack')) {
        issue(
          out,
          `${path}.production.filter.zone`,
          'the stack has no cards to read colors from here',
        );
      }
    }
    // The colors are read before the costs are paid (CR 605.3a), so a cost that gives up a permanent could change them.
    if ((a.cost ?? []).some((c) => c?.kind === 'sacrifice')) {
      issue(
        out,
        `${path}.cost`,
        'the colors are read before the costs are paid: no cost that gives up a permanent',
      );
    }
  }
  if (a.production?.kind === 'couldProduce') {
    // The permanents whose mana is looked at are on the battlefield (CR 106.7).
    if (a.production.lands === undefined || a.production.lands === null) {
      issue(out, `${path}.production.lands`, 'couldProduce needs a filter for the permanents');
    } else {
      checkBattlefieldFilter(a.production.lands, `${path}.production.lands`, out);
    }
  }
  if (a.production?.kind === 'byEffects' && (a.also === undefined || a.also.length === 0)) {
    issue(
      out,
      `${path}.also`,
      'a mana ability that makes its mana by effects needs the effects (also)',
    );
  }
  if (a.also !== undefined) {
    if (!Array.isArray(a.also) || a.also.length === 0) {
      issue(out, `${path}.also`, 'also must be a non-empty list when present');
    } else {
      a.also.forEach((e, i) => {
        // CR 603.7, 605.1a (Brass Infiniscope): the delayed trigger a mana ability creates is checked as that of any effect.
        if (e?.kind === 'delayedCast') {
          checkDelayedCast(
            e,
            `${path}.also[${i}]`,
            {
              owner: 'ability',
              targets: new Map(),
              xAllowed: false,
              checkAbility: () => undefined,
              checkContinuous: () => undefined,
              checkEffectExt: () => false,
            },
            out,
          );
          return;
        }
        if (a.production?.kind === 'byEffects') {
          checkByEffectsAlso(e, `${path}.also[${i}]`, out);
        } else {
          checkManaAbilityAlso(e, `${path}.also[${i}]`, out);
        }
      });
    }
  }
  if (a.activateOnlyIf !== undefined) {
    checkCondition(a.activateOnlyIf, `${path}.activateOnlyIf`, out);
  }
  // D-149: "Spend this mana only to cast an Angel spell": the card types and creature types of the spells it may pay for.
  if (a.spendOnly !== undefined) {
    const only = a.spendOnly;
    if (only === null || typeof only !== 'object') {
      issue(out, `${path}.spendOnly`, 'spendOnly names the types and subtypes of the spells');
    } else {
      if (only.typesOrSubtypes !== undefined) {
        if (only.typesOrSubtypes !== true) {
          issue(
            out,
            `${path}.spendOnly.typesOrSubtypes`,
            'typesOrSubtypes must be true when present',
          );
        }
        if (
          only.types === undefined ||
          only.subtypes === undefined ||
          only.notTypes !== undefined ||
          only.chosenType !== undefined ||
          only.qualities !== undefined ||
          only.alsoAbilities !== undefined
        ) {
          issue(
            out,
            `${path}.spendOnly.typesOrSubtypes`,
            'typesOrSubtypes needs both types and subtypes and goes with nothing else',
          );
        }
      }
      if (only.xCost !== undefined && only.xCost !== true) {
        issue(out, `${path}.spendOnly.xCost`, 'xCost must be true when present');
      }
      if (only.abilitiesOnly !== undefined && only.abilitiesOnly !== true) {
        issue(out, `${path}.spendOnly.abilitiesOnly`, 'abilitiesOnly must be true when present');
      }
      if (
        only.abilitiesOnly === true &&
        (only.types !== undefined ||
          only.subtypes !== undefined ||
          only.chosenType !== undefined ||
          only.alsoAbilities !== undefined ||
          only.qualities !== undefined ||
          only.xCost !== undefined)
      ) {
        issue(out, `${path}.spendOnly`, 'spendOnly abilitiesOnly names nothing else');
      }
      if (
        only.xCost === true &&
        (only.types !== undefined ||
          only.subtypes !== undefined ||
          only.chosenType !== undefined ||
          only.alsoAbilities !== undefined ||
          only.qualities !== undefined)
      ) {
        issue(out, `${path}.spendOnly`, 'spendOnly xCost names no types, subtypes or qualities');
      }
      if (only.qualities !== undefined) {
        if (!Array.isArray(only.qualities) || only.qualities.length === 0) {
          issue(
            out,
            `${path}.spendOnly.qualities`,
            'qualities must be a non-empty list when present',
          );
        } else {
          if (only.chosenType === true) {
            issue(
              out,
              `${path}.spendOnly`,
              'spendOnly names qualities or the chosen type, not both',
            );
          }
          only.qualities.forEach((q, i) => {
            const ok =
              q?.kind === 'hasX' ||
              (q?.kind === 'manaValueAtLeast' && Number.isSafeInteger(q.value) && q.value >= 1);
            if (!ok) {
              issue(
                out,
                `${path}.spendOnly.qualities[${i}]`,
                'a quality is hasX or manaValueAtLeast of a whole number from 1',
              );
            }
          });
        }
      }
      // Issue 144 (Throne of Eldraine): "monocolored spells of that color" stands alone.
      if (only.monocoloredChosen !== undefined && only.monocoloredChosen !== true) {
        issue(
          out,
          `${path}.spendOnly.monocoloredChosen`,
          'monocoloredChosen must be true when present',
        );
      }
      if (
        only.monocoloredChosen === true &&
        (only.types !== undefined ||
          only.subtypes !== undefined ||
          only.chosenType !== undefined ||
          only.alsoAbilities !== undefined ||
          only.qualities !== undefined ||
          only.xCost !== undefined)
      ) {
        issue(out, `${path}.spendOnly`, 'spendOnly monocoloredChosen names nothing else');
      }
      // CR 106.6 (Jegantha, the Wellspring): "This mana can't be spent to pay generic mana costs" stands alone.
      if (only.notGeneric !== undefined && only.notGeneric !== true) {
        issue(out, `${path}.spendOnly.notGeneric`, 'notGeneric must be true when present');
      }
      if (
        only.notGeneric === true &&
        (only.types !== undefined ||
          only.subtypes !== undefined ||
          only.chosenType !== undefined ||
          only.alsoAbilities !== undefined ||
          only.qualities !== undefined ||
          only.xCost !== undefined ||
          only.abilitiesOnly !== undefined ||
          only.monocoloredChosen !== undefined)
      ) {
        issue(out, `${path}.spendOnly`, 'spendOnly notGeneric names nothing else');
      }
      // Issue 102 (Lord of the Forsaken): "a spell from your graveyard" stands alone.
      if (only.fromGraveyard !== undefined && only.fromGraveyard !== true) {
        issue(out, `${path}.spendOnly.fromGraveyard`, 'fromGraveyard must be true when present');
      }
      if (
        only.fromGraveyard === true &&
        (only.types !== undefined ||
          only.subtypes !== undefined ||
          only.chosenType !== undefined ||
          only.alsoAbilities !== undefined ||
          only.qualities !== undefined ||
          only.xCost !== undefined ||
          only.abilitiesOnly !== undefined ||
          only.monocoloredChosen !== undefined)
      ) {
        issue(out, `${path}.spendOnly`, 'spendOnly fromGraveyard names nothing else');
      }
      // CR 106.6, 108.3 (Thieving Varmint): "spells you don't own" stands alone.
      if (only.notOwned !== undefined && only.notOwned !== true) {
        issue(out, `${path}.spendOnly.notOwned`, 'notOwned must be true when present');
      }
      if (
        only.notOwned === true &&
        (only.types !== undefined ||
          only.subtypes !== undefined ||
          only.chosenType !== undefined ||
          only.alsoAbilities !== undefined ||
          only.qualities !== undefined ||
          only.xCost !== undefined ||
          only.abilitiesOnly !== undefined ||
          only.monocoloredChosen !== undefined ||
          only.notGeneric !== undefined ||
          only.fromGraveyard !== undefined)
      ) {
        issue(out, `${path}.spendOnly`, 'spendOnly notOwned names nothing else');
      }
      // CR 106.6, 701.40b (Overgrown Zealot): "to turn permanents face up" stands alone.
      if (only.turnFaceUp !== undefined && only.turnFaceUp !== true) {
        issue(out, `${path}.spendOnly.turnFaceUp`, 'turnFaceUp must be true when present');
      }
      if (
        only.turnFaceUp === true &&
        (only.types !== undefined ||
          only.notTypes !== undefined ||
          only.subtypes !== undefined ||
          only.chosenType !== undefined ||
          only.alsoAbilities !== undefined ||
          only.qualities !== undefined ||
          only.xCost !== undefined ||
          only.abilitiesOnly !== undefined ||
          only.monocoloredChosen !== undefined ||
          only.notGeneric !== undefined ||
          only.fromGraveyard !== undefined ||
          only.notOwned !== undefined)
      ) {
        issue(out, `${path}.spendOnly`, 'spendOnly turnFaceUp names nothing else');
      }
      if (
        only.types === undefined &&
        only.subtypes === undefined &&
        only.turnFaceUp !== true &&
        only.fromGraveyard !== true &&
        only.notOwned !== true &&
        only.chosenType !== true &&
        only.qualities === undefined &&
        only.xCost !== true &&
        only.abilitiesOnly !== true &&
        only.monocoloredChosen !== true &&
        only.notGeneric !== true
      ) {
        issue(out, `${path}.spendOnly`, 'spendOnly names at least one type or subtype');
      }
      // Issue 199: "of the chosen type" stands in for the subtypes.
      if (only.chosenType !== undefined && only.chosenType !== true) {
        issue(out, `${path}.spendOnly.chosenType`, 'chosenType must be true when present');
      }
      if (only.chosenType === true && only.subtypes !== undefined) {
        issue(out, `${path}.spendOnly`, 'spendOnly names subtypes or the chosen type, not both');
      }
      // D-151: "... or activate abilities of Dragons".
      if (only.alsoAbilities !== undefined && only.alsoAbilities !== true) {
        issue(out, `${path}.spendOnly.alsoAbilities`, 'alsoAbilities must be true when present');
      }
      checkEnumList(out, `${path}.spendOnly.types`, only.types, CARD_TYPES, 'card type');
      if (only.subtypes !== undefined) {
        if (!Array.isArray(only.subtypes) || only.subtypes.length === 0) {
          issue(
            out,
            `${path}.spendOnly.subtypes`,
            'subtypes must be a non-empty list when present',
          );
        } else {
          only.subtypes.forEach((t, i) => {
            if (typeof t !== 'string' || t === '') {
              issue(out, `${path}.spendOnly.subtypes[${i}]`, 'a subtype is a name');
            }
          });
        }
      }
    }
  }
  // D-151: "If that mana is spent on a Dragon creature spell, it gains haste until end of turn": the spells it names and what it grants.
  if (a.spentRider !== undefined) {
    const rider = a.spentRider;
    if (rider === null || typeof rider !== 'object') {
      issue(out, `${path}.spentRider`, 'spentRider names the spells and what it grants');
    } else {
      const scry = rider.grants;
      if (
        scry !== 'haste' &&
        !(
          typeof scry === 'object' &&
          scry !== null &&
          (('scry' in scry && Number.isInteger(scry.scry) && scry.scry >= 1) ||
            ('scryCommanderCasts' in scry && scry.scryCommanderCasts === true) ||
            ('countersCommanderCasts' in scry && scry.countersCommanderCasts === true) ||
            // D-328: "copy that spell" with or without "you may choose new targets for the copy".
            ('copySpell' in scry && (scry.copySpell === 'may' || scry.copySpell === 'no')) ||
            // Issue 121 (Forger's Foundry): "you may exile that spell instead of putting it into its owner's graveyard as it resolves".
            ('exileLinked' in scry && scry.exileLinked === true))
        )
      ) {
        issue(
          out,
          `${path}.spentRider.grants`,
          'a rider is haste, a scry of one or more, a scry or counters of the times the commander was cast, a copy of the spell or the exile of the spell',
        );
      }
      if (rider.spells === null || typeof rider.spells !== 'object') {
        issue(out, `${path}.spentRider.spells`, 'spells names the card types and subtypes');
      } else {
        if (
          rider.spells.types === undefined &&
          rider.spells.subtypes === undefined &&
          rider.spells.sharesTypeWithCommander !== true &&
          rider.spells.commander !== true &&
          rider.spells.colors === undefined
        ) {
          issue(out, `${path}.spentRider.spells`, 'the spells have at least one type or subtype');
        }
        if (
          rider.spells.sharesTypeWithCommander !== undefined &&
          rider.spells.sharesTypeWithCommander !== true
        ) {
          issue(out, `${path}.spentRider.spells.sharesTypeWithCommander`, 'only true is allowed');
        }
        if (rider.spells.commander !== undefined && rider.spells.commander !== true) {
          issue(out, `${path}.spentRider.spells.commander`, 'only true is allowed');
        }
        // Issue 121: "with mana value 3 or less": a whole number of 0 or more.
        if (
          rider.spells.manaValueAtMost !== undefined &&
          (!Number.isSafeInteger(rider.spells.manaValueAtMost) || rider.spells.manaValueAtMost < 0)
        ) {
          issue(
            out,
            `${path}.spentRider.spells.manaValueAtMost`,
            'manaValueAtMost is a whole number of 0 or more',
          );
        }
        checkEnumList(
          out,
          `${path}.spentRider.spells.types`,
          rider.spells.types,
          CARD_TYPES,
          'card type',
        );
        // D-328: "a red instant or sorcery spell": the colors of the spell, one or more of the five.
        checkEnumList(
          out,
          `${path}.spentRider.spells.colors`,
          rider.spells.colors,
          COLORS,
          'color',
        );
        if (
          rider.spells.subtypes !== undefined &&
          (!Array.isArray(rider.spells.subtypes) || rider.spells.subtypes.length === 0)
        ) {
          issue(
            out,
            `${path}.spentRider.spells.subtypes`,
            'subtypes must be a non-empty list when present',
          );
        }
      }
    }
  }
  // D-145: "If [condition], add [other mana] instead": the condition is an ordinary one, the production is checked like the ability's.
  if (a.instead !== undefined) {
    if (a.instead === null || typeof a.instead !== 'object') {
      issue(out, `${path}.instead`, 'instead names a condition and the production that replaces');
    } else {
      checkCondition(a.instead.condition, `${path}.instead.condition`, out);
      checkManaProduction(a.instead.production, `${path}.instead.production`, out);
      if (a.instead.production?.kind === 'producedType') {
        issue(
          out,
          `${path}.instead.production`,
          'producedType is only the effect of a triggered mana ability',
        );
      }
      if (a.instead.production?.kind === 'anyColorAmong') {
        issue(
          out,
          `${path}.instead.production`,
          'the replacing production does not look at other permanents',
        );
      }
      // Incubation Druid (CR 106.7): a "could produce" production may replace another "could produce" production (three mana of the type instead of one), never a fixed or other one.
      if (a.instead.production?.kind === 'couldProduce' && a.production?.kind !== 'couldProduce') {
        issue(
          out,
          `${path}.instead.production`,
          'the replacing production does not look at other permanents unless the ability does too',
        );
      }
      // The replacing production names lands of its own, on the battlefield.
      if (a.instead.production?.kind === 'couldProduce') {
        const lands = a.instead.production.lands;
        if (lands === undefined || lands === null) {
          issue(
            out,
            `${path}.instead.production.lands`,
            'couldProduce needs a filter for the permanents',
          );
        } else {
          checkBattlefieldFilter(lands, `${path}.instead.production.lands`, out);
        }
      }
    }
  }
  if (kindOf(a) !== 'mana') issue(out, path, 'a mana ability has kind "mana"');
}
