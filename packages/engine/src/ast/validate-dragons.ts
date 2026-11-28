/**
 * Checks of the Dragons slice (D-151): the shapes of the effects, triggers, statics, conditions and replacements that slice adds, and what
 * they need of the card they are printed on. `validate.ts` calls into this file, and `validate-parts.ts` for the effects it does not know
 * itself (through `Scope.checkEffectExt`: this file needs its building blocks, so it cannot be imported by it).
 */

import type { CardFace } from '../cards/definition';
import { CARD_TYPES, isNonCreatureSubtype, SUPERTYPES } from '../characteristics';
import { GRANTABLE_KEYWORDS } from './features';
import type { Ability, Effect, ObjectFilter, Replacement, StaticEffect } from './types';
import { checkGrantedParameter } from './validate-attach';
import { isCount, isOneOf, kindOf, triggerHasPlayer } from './validate-base';
import {
  type AstIssue,
  checkAmount,
  checkEffect,
  checkEnumList,
  checkFilter,
  checkObjectSelector,
  checkPlayerSelector,
  checkRef,
  declareTargets,
  filterSome,
  issue,
  readsCombatOrSource,
  type Scope,
} from './validate-parts';

/** The effect kinds D-151 adds. True when `e` is one of them (it was checked here). */
export function checkDragonsEffect(
  e: Effect,
  path: string,
  scope: Scope,
  out: AstIssue[],
): boolean {
  switch (e?.kind) {
    case 'exileTop':
      // D-151: "exile the top card of your library": the controller's own library, a count read as the effect runs.
      checkAmount(e.count, `${path}.count`, scope, out);
      // D-187: "the top two cards of target opponent's library": one player, a target (CR 115.1).
      if (e.from !== undefined) {
        checkPlayerSelector(e.from, `${path}.from`, scope, out);
        // Issue 279: or "each player's library" (`eachPlayer`). Issue 144: or "that player's library", the player of the event (`triggerPlayer`, valid where it is).
        const owner = kindOf(e.from);
        if (
          owner !== 'target' &&
          owner !== 'eachPlayer' &&
          owner !== 'triggerPlayer' &&
          owner !== 'triggerDamagedPlayers' &&
          owner !== 'eachOpponent' &&
          // Mind's Dilation (CR 608.2h): "that player exiles the top card of their library" in a cast trigger: the controller of the spell that was cast, from last-known information.
          !(
            e.from.kind === 'controllerOf' &&
            kindOf((e.from as { of: unknown }).of as never) === 'triggerSubject'
          )
        ) {
          issue(
            out,
            `${path}.from`,
            "the library whose top cards are exiled is a target, each player's ('eachPlayer'), each opponent's ('eachOpponent'), the player of the event ('triggerPlayer'), the controller of the spell that caused the trigger or the opponents a batch damaged ('triggerDamagedPlayers')",
          );
        }
      }
      if (e.faceDown !== undefined && e.faceDown !== true) {
        issue(out, `${path}.faceDown`, 'faceDown must be true when present');
      }
      if (e.bottom !== undefined) {
        if (e.bottom !== true) issue(out, `${path}.bottom`, 'bottom must be true when present');
        if (e.linked === true || e.lookAt === true || e.randomOpponent === true) {
          issue(
            out,
            `${path}.bottom`,
            'the bottom cards are exiled without linked, lookAt or randomOpponent',
          );
        }
      }
      if (e.lookAt !== undefined) {
        if (e.lookAt !== true) issue(out, `${path}.lookAt`, 'lookAt must be true when present');
        if (e.linked !== true || e.faceDown !== true) {
          issue(out, `${path}.lookAt`, 'looking at the cards exiled needs linked and faceDown');
        }
      }
      // CR 607.2a: the cards exiled with the permanent: its own, face up, from the controller's library, so an ability's.
      if (e.linked !== undefined) {
        if (e.linked !== true) issue(out, `${path}.linked`, 'linked must be true when present');
        // Lobelia, Defender of Bag End (CR 607.2a, 406.3): the cards of each opponent's library, face down, which the controller looked at (`lookAt`).
        const faceDownLooked = e.faceDown === true && e.lookAt === true;
        if (!faceDownLooked && (e.faceDown === true || e.from !== undefined)) {
          issue(
            out,
            `${path}.linked`,
            'a linked exile of the top cards is face up and from the controller’s own library, or face down and looked at (lookAt)',
          );
        }
        if (faceDownLooked && kindOf(e.from) !== 'eachOpponent') {
          issue(
            out,
            `${path}.from`,
            'the cards looked at and exiled face down are each opponent’s',
          );
        }
        if (scope.owner === 'spell') {
          issue(
            out,
            `${path}.linked`,
            'the cards exiled with a permanent are exiled by an ability of it',
          );
        }
      }
      return true;
    case 'mayPlay':
      // D-151: "you may play that card this turn": the cards an earlier effect of the sequence exiled.
      if (kindOf(e.objects) !== 'moved' && kindOf(e.objects) !== 'linkedExile') {
        issue(
          out,
          `${path}.objects`,
          "a play permission names the exiled cards: 'moved', or the cards exiled with this permanent: 'linkedExile'",
        );
      } else {
        checkRef(e.objects, 'object', `${path}.objects`, scope, out);
      }
      // Lobelia (CR 118.9): "without paying its mana cost", of the cards exiled with this permanent.
      if (e.free !== undefined) {
        if (e.free !== true) issue(out, `${path}.free`, 'free must be true when present');
        if (kindOf(e.objects) !== 'linkedExile' && kindOf(e.objects) !== 'moved') {
          issue(out, `${path}.free`, "a free play permission names 'linkedExile' or 'moved' cards");
        }
        // Issue 101: no mana is spent on a free play, so the any-color rider has nothing to act on.
        if (e.anyManaColor !== undefined) {
          issue(out, `${path}.free`, 'a free play does not spend mana as though of any color');
        }
      }
      if (
        !isOneOf(e.lasts, [
          'endOfTurn',
          'endOfYourNextTurn',
          'yourNextEndStep',
          'whileExiled',
          'untilSourceExilesAnother',
        ])
      ) {
        issue(out, `${path}.lasts`, `unknown end ${JSON.stringify(e.lasts)}`);
      }
      if (e.lookAt !== undefined && e.lookAt !== true) {
        issue(out, `${path}.lookAt`, 'lookAt must be true when present');
      }
      // The Ruinous Powers (CR 603.7, 119.3): "When you cast a spell this way, its owner loses life equal to its mana value": the one effect a cast rider of a play permission has.
      if (
        e.whenCast !== undefined &&
        (e.lasts !== 'endOfTurn' ||
          JSON.stringify(e.whenCast) !==
            JSON.stringify({
              kind: 'loseLife',
              player: { kind: 'ownerOf', of: { kind: 'triggerSubject' } },
              amount: { kind: 'manaValueOf', of: { kind: 'triggerSubject' } },
            }))
      ) {
        issue(
          out,
          `${path}.whenCast`,
          'a cast rider of a play permission is "its owner loses life equal to its mana value" (loseLife of the ownerOf the triggerSubject, the manaValueOf the triggerSubject), for a permission that lasts until end of turn',
        );
      }
      // Urianger Augurelt (CR 601.2f): "Spells you cast this way cost {2} less to cast": generic mana off the cost, so a cost that is not free.
      if (e.lessGeneric !== undefined) {
        if (!isCount(e.lessGeneric) || e.lessGeneric < 1) {
          issue(out, `${path}.lessGeneric`, 'lessGeneric must be a positive whole number');
        }
        if (e.free === true) {
          issue(out, `${path}.lessGeneric`, 'a free play has no cost to reduce');
        }
      }
      // Durnan (CR 702.125a): "That spell has undaunted": a cost reduction, so a cost that is not free.
      if (e.undaunted !== undefined) {
        if (e.undaunted !== true)
          issue(out, `${path}.undaunted`, 'undaunted must be true when present');
        if (e.free === true) issue(out, `${path}.undaunted`, 'a free play has no cost to reduce');
      }
      // Nashi, Moon Sage's Scion (CR 118.9, 601.2): "pay life equal to its mana value rather than paying its mana cost" and "play one of those cards".
      if (e.lifeForMana !== undefined) {
        if (
          e.lifeForMana !== true ||
          e.free !== undefined ||
          e.lessGeneric !== undefined ||
          e.undaunted !== undefined ||
          e.anyManaColor !== undefined ||
          e.anyManaType !== undefined ||
          kindOf(e.objects) !== 'moved'
        ) {
          issue(
            out,
            `${path}.lifeForMana`,
            "lifeForMana is true, on the cards an effect before moved ('moved'), with no free, lessGeneric, undaunted, anyManaColor or anyManaType (a spell paid for with life has no mana cost to change)",
          );
        }
      }
      if (e.oneOf !== undefined) {
        if (e.oneOf !== true || kindOf(e.objects) !== 'moved' || e.lasts !== 'endOfTurn') {
          issue(
            out,
            `${path}.oneOf`,
            "oneOf is true, on the cards an effect before moved ('moved'), for a permission that lasts until end of turn",
          );
        }
      }
      // Aerial Extortionist (CR 108.3, 611.2b): "its owner may cast it" for as long as the card remains exiled: a permission to cast, held by the card's owner.
      if (e.byOwner !== undefined) {
        if (
          e.byOwner !== true ||
          e.castOnly !== true ||
          e.lasts !== 'whileExiled' ||
          kindOf(e.objects) !== 'moved' ||
          e.oneOf !== undefined ||
          e.lookAt !== undefined
        ) {
          issue(
            out,
            `${path}.byOwner`,
            "byOwner is true, on the cards an effect before moved ('moved'), with castOnly and lasts whileExiled, and with no oneOf or lookAt",
          );
        }
      }
      if (e.creatureSpellsOnly !== undefined) {
        if (e.creatureSpellsOnly !== true || e.castOnly !== true) {
          issue(
            out,
            `${path}.creatureSpellsOnly`,
            'creatureSpellsOnly is true and is about the spell that is cast: needs castOnly',
          );
        }
      }
      // Narset, Enlightened Master: only the cards the filter describes, and only to cast them.
      if (e.cards !== undefined) {
        checkFilter(e.cards, `${path}.cards`, out);
        if (e.castOnly !== true) {
          issue(out, `${path}.cards`, 'a filter of the cards that may be cast needs castOnly');
        }
        if (e.cards.zone !== undefined || e.cards.controller !== undefined) {
          issue(out, `${path}.cards`, 'the filter of the cards names no zone or controller');
        }
      }
      // Lorehold group 1: "you may cast it this turn".
      if (e.castOnly !== undefined && e.castOnly !== true) {
        issue(out, `${path}.castOnly`, 'castOnly must be true when present');
      }
      // Issue 101 (CR 903.3, 508.1): "during any turn you attacked with a commander": the permission is used in some turns only, so it lasts while the cards are exiled, and it is to play.
      if (e.duringTurnsAttackedWithCommander !== undefined) {
        if (e.duringTurnsAttackedWithCommander !== true) {
          issue(
            out,
            `${path}.duringTurnsAttackedWithCommander`,
            'duringTurnsAttackedWithCommander must be true when present',
          );
        }
        if (e.lasts !== 'whileExiled' || e.castOnly !== undefined) {
          issue(
            out,
            `${path}.duringTurnsAttackedWithCommander`,
            'a permission for turns of a commander attack lasts while exiled and is not castOnly',
          );
        }
      }
      // Issue 144 (CR 609.4b): "you may spend mana as though it were mana of any color to cast that spell" is about casting a spell.
      if (e.anyManaColor !== undefined) {
        if (e.anyManaColor !== true) {
          issue(out, `${path}.anyManaColor`, 'anyManaColor must be true when present');
        }
      }
      // Hostage Taker (CR 609.4b), Dire Fleet Daredevil (CR 614.1a): riders of the spell cast with the permission.
      for (const rider of ['anyManaType', 'exileInstead'] as const) {
        if (e[rider] === undefined) continue;
        if (e[rider] !== true) issue(out, `${path}.${rider}`, `${rider} must be true when present`);
        // Lidless Gaze ("you may play those cards, and mana of any type can be spent to cast those spells"): `anyManaType` is about the spells cast, so it also goes with a permission to
        // play (a land card among the cards is played as usual); `exileInstead` is the rider of one spell and needs `castOnly`.
        if (rider === 'exileInstead' && e.castOnly !== true) {
          issue(
            out,
            `${path}.${rider}`,
            `${rider} is about the spell that is cast: needs castOnly`,
          );
        }
        if (e.free === true && rider === 'anyManaType') {
          issue(out, `${path}.${rider}`, 'a free play spends no mana');
        }
      }
      return true;
    case 'mayCastEachType':
      // CR 601.2, 118.9: a free cast of one card of each card type, among the cards an earlier effect of the sequence exiled.
      if (kindOf(e.objects) !== 'moved') {
        issue(
          out,
          `${path}.objects`,
          "a permission to cast by type names the exiled cards: 'moved'",
        );
      } else {
        checkRef(e.objects, 'object', `${path}.objects`, scope, out);
      }
      if (!isOneOf(e.lasts, ['endOfTurn', 'endOfYourNextTurn', 'yourNextEndStep', 'whileExiled'])) {
        issue(out, `${path}.lasts`, `unknown end ${JSON.stringify(e.lasts)}`);
      }
      return true;
    case 'playerSpellsCostLess': {
      // CR 601.2f, 118.7a, 611.2a (Will Kenrith): the players named, the spells being cast (no zone, nothing the spell targets), a whole number of generic mana, until the controller's next turn.
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      const { targetsObject, ...spell } = (e.spells ?? {}) as ObjectFilter;
      if (e.spells === undefined || e.spells === null) {
        issue(out, `${path}.spells`, 'playerSpellsCostLess names the spells it applies to');
      } else {
        checkFilter(spell, `${path}.spells`, out);
        if (targetsObject !== undefined) {
          issue(out, `${path}.spells`, 'playerSpellsCostLess cannot read what the spell targets');
        }
        if (
          filterSome(
            spell,
            (f) =>
              f.zone !== undefined ||
              f.stackKind !== undefined ||
              f.controller !== undefined ||
              f.owner !== undefined,
          )
        ) {
          issue(
            out,
            `${path}.spells`,
            'the filter describes a spell being cast: no zone, stackKind, controller or owner (the player is `player`)',
          );
        }
      }
      if (!Number.isInteger(e.amount) || e.amount < 1) {
        issue(out, `${path}.amount`, 'a whole number of generic mana, at least 1');
      }
      if (e.duration !== 'untilYourNextTurn') {
        issue(out, `${path}.duration`, 'this lasts until the next turn of the controller');
      }
      return true;
    }
    case 'nextSpellPayLife':
      // CR 118.9, 601.2b: no fields: the controller's next spell this turn may be cast by paying life equal to its mana value.
      return true;
    case 'nextSpellModifier': {
      // Issue 121 (CR 601.2f, 702.40a, 702.85a): the next spell the controller casts that the filter describes, in this turn: a spell being cast (no zone), a reduction of generic
      // mana read as the effect resolves, and/or Storm or Cascade, the keywords that work as the spell is cast.
      const { targetsObject, ...spell } = (e.spells ?? {}) as ObjectFilter;
      if (e.spells === undefined || e.spells === null) {
        issue(out, `${path}.spells`, 'nextSpellModifier names the spells it applies to');
      } else {
        checkFilter(spell, `${path}.spells`, out);
        if (targetsObject !== undefined) {
          issue(out, `${path}.spells`, 'nextSpellModifier cannot read what the spell targets');
        }
        if (filterSome(spell, (f) => f.zone !== undefined || f.stackKind !== undefined)) {
          issue(
            out,
            `${path}.spells`,
            'the filter describes a spell being cast: zone and stackKind are not set',
          );
        }
      }
      if (e.lessGeneric === undefined && e.grants === undefined) {
        issue(out, path, 'nextSpellModifier needs a reduction or a keyword to grant');
      }
      if (e.lessGeneric !== undefined)
        checkAmount(e.lessGeneric, `${path}.lessGeneric`, scope, out);
      if (e.grants !== undefined && e.grants !== 'storm' && e.grants !== 'cascade') {
        issue(
          out,
          `${path}.grants`,
          'a spell is given storm or cascade only: the keywords that work as it is cast',
        );
      }
      return true;
    }
    case 'exileUntilCast':
      // CR 701.57 (D-151): whole-number limits on the card found and on the card cast, and what happens to the rest.
      for (const key of ['foundAtMost', 'castAtMost'] as const) {
        const value = e[key];
        if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
          issue(out, `${path}.${key}`, `${key} must be a non-negative whole number`);
        }
      }
      if (!isOneOf(e.rest, ['bottomRandom', 'stayExiled'])) {
        issue(out, `${path}.rest`, `unknown place for the rest ${JSON.stringify(e.rest)}`);
      }
      return true;
    case 'revealTopCast':
      // CR 701.20a, 608.2g: the limit on the mana value of the card revealed, an amount read as the effect runs.
      checkAmount(e.manaValueBelow, `${path}.manaValueBelow`, scope, out);
      return true;
    case 'replaceEnchant':
      // CR 702.5a, 613.1f (Animate Dead): the Aura with the ability swaps one enchant ability of permanents for another.
      if (e.objects?.kind !== 'this' || scope.owner !== 'ability') {
        issue(
          out,
          `${path}.objects`,
          'a replaceEnchant is about the Aura the ability belongs to: this',
        );
      }
      for (const key of ['loses', 'gains'] as const) {
        const k = e[key];
        if (k?.kind !== 'enchant' || k.player !== undefined) {
          issue(out, `${path}.${key}`, `${key} is an enchant ability of permanents or cards`);
        } else {
          checkFilter(k.filter, `${path}.${key}.filter`, out);
        }
      }
      return true;
    case 'becomeAura': {
      // CR 303.4, 702.5a (Necromancy): the permanent the ability belongs to is an Aura from now on, with an enchant ability of permanents.
      if (e.objects?.kind !== 'this' || scope.owner !== 'ability') {
        issue(
          out,
          `${path}.objects`,
          'a becomeAura is about the permanent the ability belongs to: this',
        );
      }
      const k = e.enchant;
      if (k?.kind !== 'enchant' || k.player !== undefined) {
        issue(out, `${path}.enchant`, 'enchant is an enchant ability of permanents');
      } else {
        checkFilter(k.filter, `${path}.enchant.filter`, out);
      }
      return true;
    }
    case 'revealTopCard':
      // CR 701.20a: the players who reveal the top card of their own library.
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      return true;
    case 'revealTopDuel':
      // CR 701.20a, 119.3: "the other player" is defined only when exactly two players are named, so the selector is `all` of two members.
      checkPlayerSelector(e.players, `${path}.players`, scope, out);
      if (e.players?.kind !== 'all' || e.players.of.length !== 2) {
        issue(
          out,
          `${path}.players`,
          'a revealTopDuel names two players, { kind: "all", of: [a, b] }, so that "the other player" is defined',
        );
      }
      return true;
    case 'revealTopBranches': {
      // CR 701.20a, 608.2c: the players who reveal, and the branches each described by what the card in the library is.
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      if (!Array.isArray(e.branches) || e.branches.length === 0) {
        issue(out, `${path}.branches`, 'a revealTopBranches has at least one branch');
        return true;
      }
      let moving = 0;
      for (const [i, branch] of e.branches.entries()) {
        const at = `${path}.branches[${i}]`;
        checkFilter(branch.ifMatches, `${at}.ifMatches`, out);
        if (
          filterSome(
            branch.ifMatches,
            (f) =>
              f.zone !== undefined ||
              f.controller !== undefined ||
              f.owner !== undefined ||
              f.stackKind !== undefined ||
              f.other !== undefined ||
              readsCombatOrSource(f),
          )
        ) {
          issue(
            out,
            `${at}.ifMatches`,
            'the card is in the library: no zone, controller, owner, stackKind, other, or anything read from the game',
          );
        }
        if (branch.onMatch === undefined && branch.to === undefined) {
          issue(out, at, 'a branch does something: it writes onMatch, to, or both');
        }
        if (branch.onMatch !== undefined) {
          // `moved` names the card revealed (still in the library) for what a branch does first; no target of its own and no X.
          checkEffect(
            branch.onMatch,
            `${at}.onMatch`,
            { ...scope, xAllowed: false, movedAvailable: true },
            out,
          );
        }
        if (
          branch.asController !== undefined &&
          (branch.asController !== true || branch.onMatch === undefined)
        ) {
          issue(
            out,
            `${at}.asController`,
            'asController is true, and only for a branch with onMatch',
          );
        }
        if (branch.to !== undefined) {
          moving += 1;
          if (!isOneOf(branch.to, ['battlefield', 'hand'])) {
            issue(
              out,
              `${at}.to`,
              `a revealed card is put onto the battlefield or into the hand, not ${JSON.stringify(branch.to)}`,
            );
          }
        }
        if (
          branch.tapped !== undefined &&
          (branch.tapped !== true || branch.to !== 'battlefield')
        ) {
          issue(
            out,
            `${at}.tapped`,
            'tapped is true, and only for a card put onto the battlefield',
          );
        }
      }
      if (moving > 1) {
        issue(
          out,
          `${path}.branches`,
          'at most one branch puts the card somewhere: the card moves once',
        );
      }
      return true;
    }
    case 'revealTop':
      // CR 701.20 (D-151): the players who reveal, the cards in the library that go on, and where they go.
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      checkFilter(e.ifMatches, `${path}.ifMatches`, out);
      if (
        filterSome(
          e.ifMatches,
          (f) =>
            f.zone !== undefined ||
            f.controller !== undefined ||
            f.owner !== undefined ||
            f.stackKind !== undefined ||
            f.other !== undefined ||
            readsCombatOrSource(f),
        )
      ) {
        issue(
          out,
          `${path}.ifMatches`,
          'the card is in the library: no zone, controller, owner, stackKind, other, or anything read from the game',
        );
      }
      if ((e.to === undefined) === (e.onMatch === undefined)) {
        issue(out, path, 'a revealTop writes exactly one of to (where the card goes) and onMatch');
      }
      if (e.to !== undefined && !isOneOf(e.to, ['battlefield', 'hand'])) {
        issue(
          out,
          `${path}.to`,
          `a revealed card is put onto the battlefield or into the hand, not ${JSON.stringify(e.to)}`,
        );
      }
      if (e.onMatch !== undefined) {
        // Galadriel group 1: what is done when the card revealed matches. It reads nothing of the card (the engine does not name it), so no target and no "it".
        checkEffect(e.onMatch, `${path}.onMatch`, { ...scope, xAllowed: false }, out);
      }
      if (e.otherwiseTo !== undefined && (e.otherwiseTo !== 'hand' || e.to === undefined)) {
        issue(
          out,
          `${path}.otherwiseTo`,
          'otherwiseTo is "hand", and only with `to` (a card that matches onMatch stays on top)',
        );
      }
      if (e.tapped !== undefined && (e.tapped !== true || e.to !== 'battlefield')) {
        issue(
          out,
          `${path}.tapped`,
          'tapped is true, and only for a card put onto the battlefield',
        );
      }
      return true;
    case 'payAnyAmount': {
      // CR 603.12 (D-151): one kind of mana, and a reflexive ability of its own whose "that much" is what was paid.
      // D-257: or a generic {1} paid X times, a most (`atMost`), and an "If you do" instruction (`ifPaid`) in place of the reflexive ability, whose X is the number paid.
      if (e.cost !== undefined) {
        // Issue 121: "pay {2}{R} any number of times": the mana of one payment, in place of one symbol.
        if (e.symbol !== undefined) {
          issue(out, `${path}.symbol`, 'a payment is one symbol or a cost, not both');
        }
        if (
          !Array.isArray(e.cost) ||
          e.cost.length === 0 ||
          !e.cost.every((s) => typeof s === 'string' && /^(?:\d+|[WUBRGC])$/.test(s))
        ) {
          issue(
            out,
            `${path}.cost`,
            'the cost of one payment is mana symbols: numbers and colors, no X or hybrid',
          );
        }
      } else if (!isOneOf(e.symbol, ['W', 'U', 'B', 'R', 'G', 'C', '1', 'E'])) {
        issue(
          out,
          `${path}.symbol`,
          `a symbol of mana paid any number of times, not ${JSON.stringify(e.symbol)}`,
        );
      }
      if (e.paid !== undefined) {
        issue(out, `${path}.paid`, "paid is the engine's own and is never written in a card");
      }
      if (e.atMost !== undefined) {
        // The most is read before X is known: no X of its own.
        checkAmount(e.atMost, `${path}.atMost`, { ...scope, xAllowed: false }, out);
      }
      if (e.ifPaid !== undefined) {
        if (e.reflexive !== undefined) {
          issue(
            out,
            `${path}.ifPaid`,
            'what is done once the payment is made is a reflexive ability (CR 603.12) or an "If you do" (`ifPaid`), not both',
          );
        }
        // CR 107.3f: X is the number paid; "that much" is still the event's own, and the targets are the ability's.
        checkEffect(e.ifPaid, `${path}.ifPaid`, { ...scope, xAllowed: true }, out);
        if (JSON.stringify(e.ifPaid).includes('"manaValueX"')) {
          issue(
            out,
            `${path}.ifPaid`,
            'the follow-up reads X as an amount, not as a mana value filter',
          );
        }
        return true;
      }
      // Issue 121: "exile up to that many target cards": a slot of the reflexive ability may take up to as many targets as were paid (`upToTriggerAmount`).
      const own = declareTargets(
        e.reflexive?.targets,
        `${path}.reflexive.targets`,
        out,
        false,
        false,
        false,
        false,
        true,
      );
      const inner: Scope = {
        owner: scope.owner,
        targets: own,
        xAllowed: false,
        triggerDamage: true,
        checkAbility: scope.checkAbility,
        checkContinuous: scope.checkContinuous,
        checkEffectExt: scope.checkEffectExt,
      };
      if (e.reflexive?.effect === undefined) {
        issue(out, `${path}.reflexive.effect`, 'the reflexive ability needs an effect');
      } else {
        checkEffect(e.reflexive.effect, `${path}.reflexive.effect`, inner, out);
      }
      return true;
    }
    case 'behold':
      // CR 701.4 (D-151): a quality of a card in the hand or of a permanent: the zone and who controls it are what behold says.
      checkFilter(e.filter, `${path}.filter`, out);
      if (
        filterSome(
          e.filter,
          (f) =>
            f.zone !== undefined ||
            f.controller !== undefined ||
            f.owner !== undefined ||
            f.stackKind !== undefined ||
            f.other !== undefined ||
            readsCombatOrSource(f),
        )
      ) {
        issue(
          out,
          `${path}.filter`,
          'the quality of a card or permanent: no zone, controller, owner, stackKind, other, or anything read from the game',
        );
      }
      return true;
    case 'extraBeginningPhase':
      // CR 500.8 (D-356): "after this phase": the postcombat main phase the trigger is about; the phase added is a beginning phase, which ends in the draw step.
      if (scope.postcombatMainTrigger !== true) {
        issue(
          out,
          path,
          'an additional beginning phase is added by a triggered ability of the beginning of the postcombat main phase',
        );
      }
      return true;
    case 'extraCombat':
      // CR 500.8 (D-151): "after this phase": the combat phase the attack is part of.
      if (
        scope.attackTrigger !== true &&
        scope.exertTrigger !== true &&
        scope.combatDamageTrigger !== true &&
        scope.mainPhaseTrigger !== true &&
        scope.combatPhaseCondition !== true &&
        scope.combatStepSpell !== true
      ) {
        issue(
          out,
          path,
          'an additional combat phase is added by a triggered ability of an attack or of combat damage, one that checks that it is your main phase, an effect that checks that it is your combat phase, or a spell cast only during a step of combat',
        );
      }
      // Illusionist's Gambit (CR 508.1c, 508.1d): what binds "those creatures" in that combat: a set of permanents, and at least one of the requirement and the restriction.
      if (e.those !== undefined) {
        checkObjectSelector(e.those.objects, `${path}.those.objects`, scope, out);
        for (const flag of ['attackIfAble', 'cantAttackYou'] as const) {
          if (e.those[flag] !== undefined && e.those[flag] !== true) {
            issue(out, `${path}.those.${flag}`, `${flag} must be true when present`);
          }
        }
        if (e.those.attackIfAble !== true && e.those.cantAttackYou !== true) {
          issue(out, `${path}.those`, 'those needs attackIfAble or cantAttackYou');
        }
      }
      // D-187: "At the beginning of that combat, untap all creatures you control": a delayed group untap, with no target and nothing to read from the
      // ability that created it (CR 603.7c: that ability is gone when it triggers).
      if (e.atBeginning !== undefined) {
        if (e.atBeginning.kind !== 'untap' || kindOf(e.atBeginning.objects) !== 'each') {
          issue(
            out,
            `${path}.atBeginning`,
            'what happens at the beginning of that combat is untapping a group',
          );
        } else {
          const inner: Scope = {
            owner: scope.owner,
            targets: new Map(),
            xAllowed: false,
            checkAbility: scope.checkAbility,
            checkContinuous: scope.checkContinuous,
            checkEffectExt: scope.checkEffectExt,
          };
          checkEffect(e.atBeginning, `${path}.atBeginning`, inner, out);
        }
      }
      return true;
    case 'enterAttacking':
      // CR 508.4 (D-151): the creatures an earlier effect of the sequence put onto the battlefield.
      if (kindOf(e.objects) !== 'moved') {
        issue(out, `${path}.objects`, "the creatures that enter attacking are what moved: 'moved'");
      } else {
        checkRef(e.objects, 'object', `${path}.objects`, scope, out);
      }
      if (
        e.thatPlayerOrTheirPlaneswalkers !== undefined &&
        e.thatPlayerOrTheirPlaneswalkers !== true
      ) {
        issue(out, `${path}.thatPlayerOrTheirPlaneswalkers`, 'it is true or left out');
      }
      if (e.asReturned !== undefined) {
        // Ninjutsu (CR 702.49a, unverified): the engine writes it into the keyword's expansion, which is never read from a card.
        issue(out, `${path}.asReturned`, 'asReturned is written by the engine for Ninjutsu');
      } else if (scope.attackTrigger !== true && scope.attackBatchTrigger !== true) {
        issue(out, path, 'a creature enters attacking in a triggered ability of an attack');
      }
      return true;
    default:
      return false;
  }
}

/**
 * CR 113.6b, 604.2, 603.2 (D-151): an ability that works from the graveyard. A static one is a `grantKeyword` or a `modifyPt` over a group
 * (the card in the graveyard has no characteristics to change); a triggered one reacts to something else, so its trigger names no `this` or
 * `attached` permanent and is not a state, chapter or mana trigger.
 */
export function checkGraveyardAbility(a: Ability, path: string, out: AstIssue[]): void {
  const where = (a as { functionsIn?: unknown }).functionsIn;
  if (where === undefined) return;
  if (where === 'exile') {
    // CR 113.6b, 702.62b (Nihilith): a triggered ability of a card in exile, which needs the card suspended (the card has no other way to be in exile with its abilities running).
    // Greater Gargadon (CR 113.6b, 602.5b, 702.62b): or an activated ability that can be activated only while its card is suspended.
    if (a.kind === 'activated') {
      if (!JSON.stringify(a.activateOnlyIf ?? null).includes('"thisSuspended"')) {
        issue(
          out,
          `${path}.functionsIn`,
          "an activated ability that works from exile needs 'activateOnlyIf' thisSuspended",
        );
      }
      return;
    }
    if (a.kind !== 'triggered') {
      issue(
        out,
        `${path}.functionsIn`,
        'only a triggered or an activated ability works from exile here',
      );
      return;
    }
    if (!JSON.stringify(a.interveningIf ?? null).includes('"thisSuspended"')) {
      issue(
        out,
        `${path}.functionsIn`,
        "a triggered ability that works from exile needs the intervening if 'thisSuspended'",
      );
    }
    if (a.trigger?.kind !== 'putIntoGraveyard' || a.trigger.self === true) {
      issue(
        out,
        `${path}.trigger`,
        'a trigger that works from exile is read for a card put into a graveyard only (the engine finds its card in exile for no other event)',
      );
    }
    return;
  }
  if (where !== 'graveyard') {
    issue(
      out,
      `${path}.functionsIn`,
      `an ability works from the graveyard only, not ${String(where)}`,
    );
    return;
  }
  if (a.kind === 'static') {
    const kind = a.static?.kind;
    if (kind !== 'grantKeyword' && kind !== 'modifyPt') {
      issue(
        out,
        `${path}.functionsIn`,
        `a static ability that works from the graveyard grants a keyword or changes power and toughness, not ${String(kind)}`,
      );
    } else if (kindOf(a.static.subject) !== 'filter') {
      issue(
        out,
        `${path}.static.subject`,
        'a static ability that works from the graveyard affects a group of permanents (a filter), not the card itself',
      );
    }
  } else if (a.kind === 'triggered') {
    const trigger = a.trigger;
    const what = (trigger as { what?: { kind?: string } }).what;
    if (
      ['state', 'chapter', 'tappedForMana', 'tapsForMana', 'becomesTarget'].includes(trigger?.kind)
    ) {
      issue(out, `${path}.trigger`, `a ${trigger.kind} trigger cannot work from the graveyard`);
    }
    if (
      what !== undefined &&
      'kind' in what &&
      (what.kind === 'this' || what.kind === 'attached')
    ) {
      issue(
        out,
        `${path}.trigger.what`,
        'a trigger that works from the graveyard watches other permanents: not "this" or "attached"',
      );
    }
    if (trigger?.kind === 'castSpell' && trigger.self === true) {
      issue(
        out,
        `${path}.trigger`,
        'a trigger that works from the graveyard is not a cast trigger of the spell itself',
      );
    }
  } else if (a.kind === 'replacement') {
    // CR 113.6b, 614.12 (Dearly Departed): the permanents that enter are not the card, so a group replacement may work from the graveyard.
    if (a.replacement?.kind !== 'othersEnterWithCounters') {
      issue(
        out,
        `${path}.functionsIn`,
        `a replacement that works from the graveyard is a group that enters with counters, not ${String(a.replacement?.kind)}`,
      );
    }
  } else {
    issue(
      out,
      `${path}.functionsIn`,
      'only a static, a replacement or a triggered ability works from the graveyard here',
    );
  }
}

const MANA_COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];

/** The static effects D-151 adds. True when `s` is one of them (it was checked here). */
export function checkDragonsStatic(s: StaticEffect, path: string, out: AstIssue[]): boolean {
  switch (s?.kind) {
    case 'unspentManaBecomesColorless':
      // CR 106.4, 614.1a (issue 81, Omnath): no parameters; the permanent's own ability.
      return true;
    case 'surveilLookAdditional':
      // CR 701.25a (Enhanced Surveillance): a positive whole number of cards more.
      if (!Number.isSafeInteger(s.count) || s.count < 1) {
        issue(out, `${path}.count`, 'count must be a whole number of at least 1');
      }
      return true;
    case 'unspentManaStays':
      // CR 500.5, 106.4 (D-151): "You don't lose unspent red mana as steps and phases end": the colors of mana that stay.
      if (!Array.isArray(s.colors) || s.colors.length === 0) {
        issue(out, `${path}.colors`, 'unspentManaStays names at least one color of mana');
      } else {
        s.colors.forEach((c, i) => {
          if (!isOneOf(c, MANA_COLORS)) {
            issue(out, `${path}.colors[${i}]`, `unknown mana color ${JSON.stringify(c)}`);
          }
        });
        if (new Set(s.colors).size !== s.colors.length) {
          issue(out, `${path}.colors`, 'a color is named once');
        }
      }
      return true;
    case 'castFromTopOfLibrary':
      // CR 601.3 (D-151): the spells the top card may be: a filter describing the card as it is in the library.
      checkFilter(s.spells, `${path}.spells`, out);
      if (
        filterSome(
          s.spells,
          (f) =>
            f.zone !== undefined ||
            f.owner !== undefined ||
            f.controller !== undefined ||
            f.stackKind !== undefined ||
            readsCombatOrSource(f),
        )
      ) {
        issue(
          out,
          `${path}.spells`,
          'the spell is the top card of your library: no zone, owner, controller, stackKind, or anything read from the game',
        );
      }
      if (s.gainsHaste !== undefined && s.gainsHaste !== true) {
        issue(out, `${path}.gainsHaste`, 'gainsHaste must be true when present');
      }
      // CR 601.2b, 118.8: the permanent sacrificed as an additional cost, a filter of permanents the caster controls.
      if (s.sacrifice !== undefined) {
        checkFilter(s.sacrifice, `${path}.sacrifice`, out);
        if (
          filterSome(
            s.sacrifice,
            (f) =>
              f.zone !== undefined ||
              f.owner !== undefined ||
              f.controller !== undefined ||
              f.stackKind !== undefined ||
              readsCombatOrSource(f),
          )
        ) {
          issue(
            out,
            `${path}.sacrifice`,
            'the permanent sacrificed is one the caster controls: no zone, owner, controller, stackKind, or anything read from the game',
          );
        }
      }
      return true;
    case 'activateAsThoughHaste':
      // CR 702.10b (issue 345): the creatures are battlefield permanents, read for the controller of the permanent with the permanent as the source.
      checkFilter(s.creatures, `${path}.creatures`, out);
      if (
        filterSome(
          s.creatures,
          (f) => f.zone !== undefined || f.stackKind !== undefined || readsCombatOrSource(f),
        )
      ) {
        issue(
          out,
          `${path}.creatures`,
          'the creatures are battlefield permanents: no zone, stackKind, or anything read from the game',
        );
      }
      return true;
    case 'loyaltyActivationLimit':
      // CR 606.3: the planeswalkers are battlefield permanents, read for the controller of the permanent with the permanent as the source.
      checkFilter(s.planeswalkers, `${path}.planeswalkers`, out);
      if (
        filterSome(
          s.planeswalkers,
          (f) => f.zone !== undefined || f.stackKind !== undefined || readsCombatOrSource(f),
        )
      ) {
        issue(
          out,
          `${path}.planeswalkers`,
          'the planeswalkers are battlefield permanents: no zone, stackKind, or anything read from the game',
        );
      }
      if (!Number.isInteger(s.timesEachTurn) || s.timesEachTurn < 2) {
        issue(
          out,
          `${path}.timesEachTurn`,
          'timesEachTurn is an integer of 2 or more (CR 606.3 allows one)',
        );
      }
      return true;
    case 'playLandsFromGraveyard':
    case 'playLandsFromTopOfLibrary':
      // CR 305.1: the land cards that may be played from the graveyard or the top of the library, as the card there is.
      if (s.lands !== undefined) {
        checkFilter(s.lands, `${path}.lands`, out);
        if (
          filterSome(
            s.lands,
            (f) =>
              f.zone !== undefined ||
              f.owner !== undefined ||
              f.controller !== undefined ||
              f.stackKind !== undefined ||
              readsCombatOrSource(f),
          )
        ) {
          issue(
            out,
            `${path}.lands`,
            'the land is a card in your graveyard or library: no zone, owner, controller, stackKind, or anything read from the game',
          );
        }
      }
      return true;
    case 'playFromGraveyardEachType':
      return true;
    case 'playSurveiledFromGraveyard':
    // CR 701.25a (Eye of Duskmantle): no parameters; the permanent's own ability.
    case 'playFromLinkedExile':
      // CR 607.2a, 601.2a (Evendo Brushrazer): no parameters; the cards are the ones the permanent exiled with its linked ability (checked by `checkLinkedExile`).
      return true;
    case 'playFromGraveyardOnceEachTurn':
      // CR 601.2a, 305.1 (D-232): the spells (as the card in the graveyard is) and/or the land that may be played from the graveyard, once each turn.
      if (s.cast === undefined && s.land !== true) {
        issue(out, path, 'the permission names the spells to cast, a land to play, or both');
      }
      // Issue 102 (Kotis): "by exiling three other cards from your graveyard": an additional cost of the spell cast this way.
      if (
        s.exileOthers !== undefined &&
        (!Number.isSafeInteger(s.exileOthers) || s.exileOthers < 1 || s.cast === undefined)
      ) {
        issue(out, `${path}.exileOthers`, 'exileOthers is a whole number from 1, only with cast');
      }
      // CR 601.2b, 118.8 (Exploration Broodship): "by sacrificing a land in addition to paying its other costs": the permanent the spell cast this way sacrifices.
      if (s.sacrifice !== undefined) {
        if (s.cast === undefined) issue(out, `${path}.sacrifice`, 'sacrifice is only with cast');
        else checkFilter(s.sacrifice, `${path}.sacrifice`, out);
        if (filterSome(s.sacrifice, (f) => f.zone !== undefined && f.zone !== 'battlefield')) {
          issue(out, `${path}.sacrifice.zone`, 'the permanent to sacrifice is on the battlefield');
        }
      }
      if (s.cast !== undefined) {
        checkFilter(s.cast, `${path}.cast`, out);
        if (
          filterSome(
            s.cast,
            (f) =>
              f.zone !== undefined ||
              f.owner !== undefined ||
              f.controller !== undefined ||
              f.stackKind !== undefined ||
              readsCombatOrSource(f),
          )
        ) {
          issue(
            out,
            `${path}.cast`,
            'the spell is a card in your graveyard: no zone, owner, controller, stackKind, or anything read from the game',
          );
        }
      }
      if (s.putElsewhereThisTurn !== undefined) {
        if (s.putElsewhereThisTurn !== true) {
          issue(
            out,
            `${path}.putElsewhereThisTurn`,
            'putElsewhereThisTurn must be true when present',
          );
        } else if (s.cast === undefined || s.land === true) {
          issue(
            out,
            `${path}.putElsewhereThisTurn`,
            'putElsewhereThisTurn is only for a permission to cast',
          );
        }
      }
      if (s.land !== undefined && s.land !== true)
        issue(out, `${path}.land`, 'land must be true when present');
      if (s.entersTapped !== undefined && s.entersTapped !== true) {
        issue(out, `${path}.entersTapped`, 'entersTapped must be true when present');
      }
      if (s.gains !== undefined && s.gains.kind !== 'triggered') {
        issue(out, `${path}.gains`, 'the ability the permanent gains is a triggered ability');
      }
      return true;
    default:
      return false;
  }
}

/** The replacement kinds D-151 adds. True when `r` is one of them (it was checked here). */
export function checkDragonsReplacement(r: Replacement, path: string, out: AstIssue[]): boolean {
  if (r?.kind !== 'entersAsCopy') return false;
  // CR 707.9, 614.12: "As this enters, you may have it become a copy of any creature on the battlefield until end of turn, except it has haste".
  checkFilter(r.what, `${path}.what`, out);
  if (
    filterSome(
      r.what,
      (f) =>
        (f.zone !== undefined &&
          !(
            (r.fromGraveyard === true || r.exileTwoFromGraveyards !== undefined) &&
            f.zone === 'graveyard'
          )) ||
        f.stackKind !== undefined ||
        f.attacking !== undefined ||
        f.attackingYou !== undefined ||
        f.other !== undefined,
    )
  ) {
    issue(
      out,
      `${path}.what`,
      'what is copied is a permanent on the battlefield: no zone, stackKind, combat or other',
    );
  }
  // Federation Fleet deck (CR 614.12, 707.9, 700.4): "... a copy of any creature card in your graveyard that was put there from the battlefield this turn".
  if (r.fromGraveyard !== undefined && r.fromGraveyard !== true) {
    issue(out, `${path}.fromGraveyard`, 'fromGraveyard is true when present');
  }
  if (r.fromGraveyard === true && r.what?.zone !== 'graveyard') {
    issue(out, `${path}.what`, 'what names the zone graveyard when the copy is of a card there');
  }
  // The Mimeoplasm (CR 614.12, 707.9b, 122.6): "exile two creature cards from graveyards ... a copy of one of those cards with additional +1/+1 counters equal to the power of the other".
  if (r.exileTwoFromGraveyards !== undefined) {
    const x = r.exileTwoFromGraveyards;
    if (typeof x !== 'object' || x === null || typeof x.counter !== 'string' || x.counter === '') {
      issue(
        out,
        `${path}.exileTwoFromGraveyards.counter`,
        'exileTwoFromGraveyards names a counter',
      );
    }
    if (r.what?.zone !== 'graveyard' || r.fromGraveyard !== undefined) {
      issue(
        out,
        `${path}.what`,
        'the cards exiled from graveyards are in the zone graveyard, and the copy is not of one in the graveyard of the controller (fromGraveyard)',
      );
    }
    if (r.optional !== true || r.duration !== 'permanent') {
      issue(out, `${path}`, 'exiling two cards is a "may" and the copy lasts for good');
    }
  }
  if (r.keepName !== undefined && r.keepName !== true) {
    issue(out, `${path}.keepName`, 'keepName is true when present');
  }
  if (r.addSupertypes !== undefined) {
    if (!Array.isArray(r.addSupertypes) || r.addSupertypes.length === 0) {
      issue(out, `${path}.addSupertypes`, 'addSupertypes is a non-empty list when present');
    } else {
      checkEnumList(out, `${path}.addSupertypes`, r.addSupertypes, SUPERTYPES, 'supertype');
    }
  }
  if (r.notLegendary !== undefined && r.notLegendary !== true) {
    issue(out, `${path}.notLegendary`, 'notLegendary is true when present');
  }
  if (r.extraCounters !== undefined) {
    if (!Array.isArray(r.extraCounters) || r.extraCounters.length === 0) {
      issue(out, `${path}.extraCounters`, 'extraCounters is a non-empty list when present');
    } else {
      r.extraCounters.forEach((c, i) => {
        if (!isOneOf(c?.type, ['creature', 'planeswalker'])) {
          issue(
            out,
            `${path}.extraCounters[${i}].type`,
            'the card type is creature or planeswalker',
          );
        }
        if (typeof c?.counter !== 'string' || c.counter === '') {
          issue(out, `${path}.extraCounters[${i}].counter`, 'a kind of counter');
        }
      });
    }
  }
  if (r.optional !== undefined && r.optional !== true) {
    issue(out, `${path}.optional`, 'optional is true or absent');
  }
  if (!isOneOf(r.duration, ['untilEndOfTurn', 'permanent'])) {
    issue(out, `${path}.duration`, `unknown duration ${JSON.stringify(r.duration)}`);
  }
  if (r.gains !== undefined) {
    if (!Array.isArray(r.gains) || r.gains.length === 0) {
      issue(out, `${path}.gains`, 'gains lists at least one keyword, or is absent');
    } else {
      r.gains.forEach((k, i) => {
        if (!GRANTABLE_KEYWORDS.includes(k?.kind)) {
          issue(out, `${path}.gains[${i}]`, 'only keywords without parameters can be gained');
        } else if (k?.kind === 'riot') {
          issue(
            out,
            `${path}.gains[${i}]`,
            'riot is applied as a permanent enters, not gained afterwards',
          );
        } else {
          checkGrantedParameter(k, `${path}.gains[${i}]`, out);
        }
      });
    }
  }
  // CR 707.9b, 702.128b: "except if this creature was embalmed, the token has no mana cost, it's white, and it's a Zombie in addition to its other types".
  if (r.ifEmbalmed !== undefined) {
    const x = r.ifEmbalmed;
    if (typeof x !== 'object' || x === null) {
      issue(out, `${path}.ifEmbalmed`, 'ifEmbalmed is a set of exceptions');
    } else {
      if (
        x.setColors !== undefined &&
        (!Array.isArray(x.setColors) ||
          x.setColors.some((c) => !isOneOf(c, ['W', 'U', 'B', 'R', 'G'])))
      ) {
        issue(out, `${path}.ifEmbalmed.setColors`, 'setColors is a list of colors');
      }
      if (x.noManaCost !== undefined && x.noManaCost !== true) {
        issue(out, `${path}.ifEmbalmed.noManaCost`, 'noManaCost must be true when present');
      }
      if (
        x.addSubtypes !== undefined &&
        (!Array.isArray(x.addSubtypes) ||
          x.addSubtypes.length === 0 ||
          x.addSubtypes.some((t) => typeof t !== 'string' || isNonCreatureSubtype(t)))
      ) {
        issue(
          out,
          `${path}.ifEmbalmed.addSubtypes`,
          'addSubtypes is a non-empty list of creature types',
        );
      }
    }
  }
  // CR 707.9b, 107.3m: "except it enters with X additional +1/+1 counters on it".
  if (r.withX !== undefined && (typeof r.withX.counter !== 'string' || r.withX.counter === '')) {
    issue(out, `${path}.withX.counter`, 'withX names a counter');
  }
  // Issue 103 (CR 707.9b): "except it's a Dragon in addition to its other types".
  if (
    r.addSubtypes !== undefined &&
    (!Array.isArray(r.addSubtypes) ||
      r.addSubtypes.length === 0 ||
      r.addSubtypes.some((t) => typeof t !== 'string' || isNonCreatureSubtype(t)))
  ) {
    issue(out, `${path}.addSubtypes`, 'addSubtypes is a non-empty list of creature types');
  }
  // CR 707.9b (Phyrexian Metamorph): "except it's an artifact in addition to its other types".
  if (r.addTypes !== undefined) {
    if (!Array.isArray(r.addTypes) || r.addTypes.length === 0) {
      issue(out, `${path}.addTypes`, 'addTypes is a non-empty list of card types');
    } else {
      checkEnumList(out, `${path}.addTypes`, r.addTypes, CARD_TYPES, 'card type');
    }
  }
  return true;
}

/** The abilities of the tokens a spell describes (`createToken` of a described token), wherever the effect is nested. */
function tokenAbilitiesOf(value: unknown): Ability[] {
  const found: Ability[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (
      record.kind === 'custom' &&
      Array.isArray((record.definition as { abilities?: unknown })?.abilities)
    ) {
      found.push(...(record.definition as { abilities: Ability[] }).abilities);
    }
    Object.values(record).forEach(walk);
  };
  walk(value);
  return found;
}

/**
 * What the Dragons slice's shapes need of the face (D-151): Read ahead, a mode that cannot repeat this turn (a triggered ability only), and the
 * filter and selector that name the player of the event ("that opponent", "each other opponent": a triggered ability whose event is about a player).
 */
export function checkDragonsFace(face: CardFace, path: string, out: AstIssue[]): void {
  checkReadAheadFace(face, path, out);
  face.abilities.forEach((a, i) => {
    const p = `${path}.abilities[${i}]`;
    const triggered = a?.kind === 'triggered';
    const choose = (
      a as {
        chooseModes?: { notRepeatedThisTurn?: unknown; notRepeatedBySource?: unknown };
      }
    ).chooseModes;
    if (choose?.notRepeatedThisTurn !== undefined) {
      if (choose.notRepeatedThisTurn !== true) {
        issue(
          out,
          `${p}.chooseModes.notRepeatedThisTurn`,
          'notRepeatedThisTurn is true when present',
        );
      }
      if (!triggered) {
        issue(
          out,
          `${p}.chooseModes`,
          'only a triggered ability can choose modes that were not chosen this turn',
        );
      }
    }
    if (choose?.notRepeatedBySource !== undefined) {
      if (choose.notRepeatedBySource !== true) {
        issue(
          out,
          `${p}.chooseModes.notRepeatedBySource`,
          'notRepeatedBySource is true when present',
        );
      }
      if (!triggered) {
        issue(
          out,
          `${p}.chooseModes`,
          'only a triggered ability can choose modes that were not chosen by its source',
        );
      }
    }
    // The player of the event is the trigger's: a filter that says `controller: "triggerPlayer"` outside such an ability matches nothing.
    if (JSON.stringify(a ?? null).includes('"controller":"triggerPlayer"')) {
      if (!triggered || !triggerHasPlayer(a.trigger)) {
        issue(
          out,
          p,
          "controller 'triggerPlayer' needs a triggered ability whose event is about a player",
        );
      }
    }
  });
  // CR 508.5 (D-151): "creature defending player controls" is read from the combat the source is in: an ability of an attacking creature.
  face.abilities.forEach((a, i) => {
    if (!JSON.stringify(a ?? null).includes('"controller":"defendingPlayer"')) return;
    const inner = a?.kind === 'static' && a.static?.kind === 'grantAbility' ? a.static.ability : a;
    const ok =
      inner?.kind === 'triggered' &&
      (inner.trigger?.kind === 'attacks' || inner.trigger?.kind === 'attackBatch');
    if (!ok) {
      issue(
        out,
        `${path}.abilities[${i}]`,
        "controller 'defendingPlayer' needs a triggered ability of an attacking creature (an attacks trigger)",
      );
    }
  });
  // CR 508.5: a player named as defending player ("cards in defending player's hand", Mr. Foxglove; "their graveyard", Guiltfeeder) exists only for an attacking creature,
  // so it is read in a trigger of one; elsewhere there is no defending player and the count would be of nobody's cards.
  face.abilities.forEach((a, i) => {
    if (!JSON.stringify(a ?? null).includes('"owner":{"kind":"defendingPlayer"}')) return;
    const inner = a?.kind === 'static' && a.static?.kind === 'grantAbility' ? a.static.ability : a;
    const kind = inner?.kind === 'triggered' ? inner.trigger?.kind : undefined;
    if (kind !== 'attacks' && kind !== 'attackBatch' && kind !== 'becomesUnblocked') {
      issue(
        out,
        `${path}.abilities[${i}]`,
        "the owner 'defendingPlayer' needs a triggered ability of an attacking creature",
      );
    }
  });
  // CR 111.4, 113.1 (Wake the Dragon): a token a spell creates has abilities of its own, triggered ones too: they are checked as the abilities they are, and the words of the
  // spell are read without them.
  const withoutTokenAbilities = (value: unknown): string =>
    JSON.stringify(value ?? null, (key, v: unknown) => (key === 'abilities' ? undefined : v));
  tokenAbilitiesOf(face.spell).forEach((a, i) => {
    if (!JSON.stringify(a ?? null).includes('"controller":"triggerPlayer"')) return;
    if (a?.kind !== 'triggered' || !triggerHasPlayer(a.trigger)) {
      issue(
        out,
        `${path}.spell.token.abilities[${i}]`,
        "controller 'triggerPlayer' needs a triggered ability whose event is about a player",
      );
    }
  });
  const spell = withoutTokenAbilities(face.spell);
  if (
    spell.includes('"controller":"triggerPlayer"') ||
    spell.includes('"controller":"defendingPlayer"') ||
    spell.includes('"owner":{"kind":"defendingPlayer"}') ||
    spell.includes('"notRepeatedThisTurn"') ||
    spell.includes('"notRepeatedBySource"')
  ) {
    issue(
      out,
      `${path}.spell`,
      "a spell has no trigger: controller 'triggerPlayer' and notRepeatedThisTurn belong to a triggered ability",
    );
  }
}

/** What Read ahead needs of the face it is printed on (CR 702.155, 714.3b, D-151): a Saga with chapter abilities, once. */
export function checkReadAheadFace(face: CardFace, path: string, out: AstIssue[]): void {
  const keywords = face.abilities.filter(
    (a) => a?.kind === 'keyword' && a.keyword?.kind === 'readAhead',
  ).length;
  if (keywords === 0) return;
  if (keywords > 1) {
    issue(out, `${path}.abilities`, 'multiple instances of read ahead are redundant (CR 702.155c)');
  }
  const chapters = face.abilities.some(
    (a) => a?.kind === 'triggered' && a.trigger?.kind === 'chapter',
  );
  if (!face.subtypes.includes('Saga') || !chapters) {
    issue(
      out,
      `${path}.abilities`,
      'read ahead belongs to a Saga with chapter abilities (CR 702.155b)',
    );
  }
}
