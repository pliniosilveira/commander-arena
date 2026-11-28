/**
 * Effect rules of group 2 of the Hylda deck (issue 42, D-517 to D-525): "doesn't untap during its controller's next untap step" (Sleep, Send to Sleep, Icy Blast, Niblis of Frost,
 * Cone of Cold, Dreamshackle Geist) and "until your next turn, creatures your opponents control enter tapped" (Cone of Cold).
 */
import { fail, literal, pattern } from '../../combinators';
import type { IrDuration, IrNoun } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, operands, single } from './operands';

const RULE = 'effect.doesnt-untap-next';

/** The words after the objects: one object "doesn't untap", several "don't untap", and whose next untap step it is. */
const SINGULAR_WORDS =
  / doesn['’]t untap during (?:its controller['’]s|that player['’]s) next untap step(?![\p{L}\p{N}])/iu;
const PLURAL_WORDS =
  / don['’]t untap during (?:their controllers['’] next untap steps|their controller['’]s next untap step|that player['’]s next untap step)(?![\p{L}\p{N}])/iu;

/**
 * `effect.doesnt-untap-next`: "target creature doesn't untap during its controller's next untap step", "those creatures don't untap during their controllers' next untap steps",
 * "those creatures don't untap during that player's next untap step" (CR 502.3, 611.2a, 701.43b: an effect can keep a permanent from untapping; here until the next untap step of
 * its controller has run). The objects are a target, an object or group an earlier instruction named ("that creature", "those creatures"); the engine's `restrict` of `doesntUntap`
 * with the duration `untilNextUntapStep`: each permanent keeps it until the untap step of its controller (as it is then) has come, whether or not it was tapped. One object says
 * "doesn't", "its controller's" and "step"; several say "don't", "their controllers'" and "steps" ("that player's next untap step" is read of either). Not read: the step of "your"
 * or "each" player, "untap step" with no "next", "until", "this turn", a number that disagrees with the verb, another verb, "doesn't untap" alone, "during its controller's untap step".
 */
export const EFFECT_DOESNT_UNTAP_NEXT = defineRule<Clauses>({
  id: RULE,
  family: 'effect',
  leading: ['target', 'that', 'those', 'up', 'one', 'it'],
  cites: [
    'CR 502.3 (Untap Step)',
    'CR 611.2a (Continuous Effects)',
    'CR 701.43b (Exert)',
    'CR 115.1 (Targets)',
  ],
  examples: [
    "target creature doesn't untap during its controller's next untap step",
    'target creature doesn’t untap during its controller’s next untap step',
    "that creature doesn't untap during its controller's next untap step",
    "those creatures don't untap during their controllers' next untap steps",
    "those creatures don't untap during that player's next untap step",
    "those creatures don't untap during their controller's next untap step",
    "up to two target creatures don't untap during their controllers' next untap steps",
    "target permanent doesn't untap during its controller's next untap step",
    // Junk Winder: "Tap target nonland permanent an opponent controls. It doesn't untap during its controller's next untap step."
    "it doesn't untap during its controller's next untap step",
    "It doesn't untap during its controller's next untap step",
  ],
  rejects: [
    "target creature doesn't untap during your next untap step",
    "target creature doesn't untap during its controller's untap step",
    "target creature doesn't untap during its controller's next untap steps",
    "target creature don't untap during its controller's next untap step",
    "those creatures doesn't untap during their controllers' next untap steps",
    "those creatures don't untap during their controllers' next untap step",
    "target creature doesn't untap during each player's next untap step",
    "target creature doesn't untap",
    "target creature doesn't untap during its controller's next untap step this turn",
    "target creature doesn't untap until its controller's next untap step",
    "target creature can't untap during its controller's next untap step",
    "target creature doesn't untap during its controller's next upkeep",
    "creatures you control don't untap during their controllers' next untap steps",
    "~ doesn't untap during its controller's next untap step",
    "it doesn't untap during its controller's next untap steps",
    "it don't untap during its controller's next untap step",
    "it doesn't untap during your next untap step",
  ],
  parse: single(
    RULE,
    (ctx, pos) => {
      const subject = operands(
        ['noun.target-permanent', 'noun.that-object', 'noun.those-creatures', 'noun.it'],
        RULE,
      )(ctx, pos);
      if (!subject.ok) return subject;
      // One noun only: a list of objects is not read.
      if (subject.value.kind !== 'noun') return fail(ctx, pos);
      const noun = subject.value;
      const words = pattern(noun.plural ? PLURAL_WORDS : SINGULAR_WORDS)(ctx, subject.pos);
      if (!words.ok) return words;
      return { ok: true, value: noun, pos: words.pos };
    },
    (objects) => ({ verb: 'doesntUntapNext', args: { objects } }),
  ),
});

/**
 * `effect.group-enters-tapped`: "until your next turn, creatures your opponents control enter tapped" (CR 614.1c, 614.12, 611.2a, 500.1: a replacement effect for a group of permanents
 * as they enter, until the next turn of the controller begins). The group is a plural permanent noun with the controller the words name ("your opponents control"); the engine's
 * `permanentsEnterTapped`. Not read: "this turn" (another duration), no duration, "other", a singular, "enter the battlefield tapped" (another wording), a group with no controller,
 * "target creatures", more words after "tapped".
 */
export const EFFECT_GROUP_ENTERS_TAPPED = defineRule<Clauses>({
  id: 'effect.group-enters-tapped',
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 614.1c (Replacement Effects)',
    'CR 614.12 (Replacement Effects)',
    'CR 611.2a (Continuous Effects)',
    'CR 500.1 (Beginning Phase)',
  ],
  examples: [
    'until your next turn, creatures your opponents control enter tapped',
    'Until your next turn, creatures your opponents control enter tapped',
    'until your next turn, creatures you control enter tapped',
    'until your next turn, nonland permanents your opponents control enter tapped',
  ],
  rejects: [
    'until your next turn, creatures your opponents control enter',
    'until your next turn, creatures your opponents control enter untapped',
    'until your next turn, creature your opponents control enters tapped',
    'until your next turn, creatures enter tapped',
    'until your next turn, other creatures your opponents control enter tapped',
    'until end of turn, creatures your opponents control enter tapped',
    'until your next turn, target creatures enter tapped',
    'creatures your opponents control enter tapped',
    'until your next turn, creatures your opponents control enter tapped and draw a card',
    'until your next turn, creatures your opponents control enter the battlefield tapped',
  ],
  parse: single(
    'effect.group-enters-tapped',
    (ctx, pos) => {
      const lead = spanned(pattern(/until your next turn, /iu))(ctx, pos);
      if (!lead.ok) return lead;
      const subject = family<IrNoun>('noun', { only: ['noun.plain-permanents'] })(ctx, lead.pos);
      if (!subject.ok) return subject;
      const noun = subject.value;
      // A plural group with a controller of the words ("your opponents control"), and nothing else about it but its kind.
      if (
        !noun.plural ||
        noun.det !== 'each' ||
        noun.other ||
        noun.filter.controller === undefined
      ) {
        return fail(ctx, pos);
      }
      const words = spanned(literal(' enter tapped'))(ctx, subject.pos);
      if (!words.ok) return words;
      return {
        ok: true,
        value: { noun, span: { start: pos, end: words.pos } },
        pos: words.pos,
      };
    },
    ({ noun, span }) => {
      const duration: IrDuration = {
        kind: 'duration',
        scope: 'untilYourNextTurn',
        span,
        rule: 'effect.group-enters-tapped',
      };
      return { verb: 'groupEntersTapped', args: { objects: noun }, duration };
    },
  ),
});

export const HYLDA_G2_EFFECT_RULES = [EFFECT_DOESNT_UNTAP_NEXT, EFFECT_GROUP_ENTERS_TAPPED];
