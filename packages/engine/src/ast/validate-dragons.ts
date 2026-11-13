/**
 * Checks of the Dragons slice (D-151): the shapes of the effects, triggers, statics, conditions and replacements that slice adds, and what
 * they need of the card they are printed on. `validate.ts` calls into this file, and `validate-parts.ts` for the effects it does not know
 * itself (through `Scope.checkEffectExt`: this file needs its building blocks, so it cannot be imported by it).
 */

import type { CardFace } from '../cards/definition';
import { GRANTABLE_KEYWORDS } from './features';
import type { Ability, Effect, Replacement, StaticEffect } from './types';
import { isOneOf, kindOf, triggerHasPlayer } from './validate-base';
import {
  type AstIssue,
  checkAmount,
  checkEffect,
  checkFilter,
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
        if (kindOf(e.from) !== 'target') {
          issue(out, `${path}.from`, 'the library whose top cards are exiled is a target');
        }
      }
      if (e.faceDown !== undefined && e.faceDown !== true) {
        issue(out, `${path}.faceDown`, 'faceDown must be true when present');
      }
      return true;
    case 'mayPlay':
      // D-151: "you may play that card this turn": the cards an earlier effect of the sequence exiled.
      if (kindOf(e.objects) !== 'moved') {
        issue(out, `${path}.objects`, "a play permission names the exiled cards: 'moved'");
      } else {
        checkRef(e.objects, 'object', `${path}.objects`, scope, out);
      }
      if (!isOneOf(e.lasts, ['endOfTurn', 'endOfYourNextTurn', 'yourNextEndStep', 'whileExiled'])) {
        issue(out, `${path}.lasts`, `unknown end ${JSON.stringify(e.lasts)}`);
      }
      if (e.lookAt !== undefined && e.lookAt !== true) {
        issue(out, `${path}.lookAt`, 'lookAt must be true when present');
      }
      return true;
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
      if (!isOneOf(e.to, ['battlefield', 'hand'])) {
        issue(
          out,
          `${path}.to`,
          `a revealed card is put onto the battlefield or into the hand, not ${JSON.stringify(e.to)}`,
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
      if (!isOneOf(e.symbol, ['W', 'U', 'B', 'R', 'G', 'C', '1'])) {
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
      const own = declareTargets(e.reflexive?.targets, `${path}.reflexive.targets`, out);
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
      // CR 500.8 (D-1130): "after this phase": the postcombat main phase the trigger is about; the phase added is a beginning phase, which ends in the draw step.
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
      if (scope.attackTrigger !== true && scope.mainPhaseTrigger !== true) {
        issue(
          out,
          path,
          'an additional combat phase is added by a triggered ability of an attack or one that checks that it is your main phase',
        );
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
      if (scope.attackTrigger !== true) {
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
  } else {
    issue(
      out,
      `${path}.functionsIn`,
      'only a static or a triggered ability works from the graveyard here',
    );
  }
}

const MANA_COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];

/** The static effects D-151 adds. True when `s` is one of them (it was checked here). */
export function checkDragonsStatic(s: StaticEffect, path: string, out: AstIssue[]): boolean {
  switch (s?.kind) {
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
      return true;
    case 'playFromGraveyardOnceEachTurn':
      // CR 601.2a, 305.1 (D-232): the spells (as the card in the graveyard is) and/or the land that may be played from the graveyard, once each turn.
      if (s.cast === undefined && s.land !== true) {
        issue(out, path, 'the permission names the spells to cast, a land to play, or both');
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
        f.zone !== undefined ||
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
        }
      });
    }
  }
  return true;
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
    const choose = (a as { chooseModes?: { notRepeatedThisTurn?: unknown } }).chooseModes;
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
  const spell = JSON.stringify(face.spell ?? null);
  if (
    spell.includes('"controller":"triggerPlayer"') ||
    spell.includes('"controller":"defendingPlayer"') ||
    spell.includes('"notRepeatedThisTurn"')
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
