/**
 * Trigger rules of stage P30 (D-135, D-136): how a permanent entered and where it went when it left. "~ enters untapped"
 * (CR 603.6a) and "~ dies or is put into exile from the battlefield" (CR 700.4, 603.6c, 603.10a). Each says what the text says;
 * what the engine can run is the lowering's business.
 */
import { choice, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule } from '../registry';
import { isPlainLandYouControl, permanentOrAttachedSubject, triggerSubject } from './subjects';

const NOT_IN_WORD = '(?![\\p{L}\\p{N}])';

/** The words that leave `~` and the like: the subjects a permanent that left can be said of. */
const ATTACHABLE_LEADING = ['~', 'another', 'a', 'an', 'equipped', 'enchanted'];

/**
 * `trigger.enters-state`: "~ enters untapped", "~ enters tapped", "another creature you control enters untapped" (CR 603.6a: a
 * permanent entering the battlefield; CR 614.1c: a replacement effect may make it enter tapped, so how it entered is what it is
 * as the event is noticed). The state the permanent entered in, not one it was put in later. The engine's `entersBattlefield` with
 * `tapped`. A land you control is `trigger.landfall`'s ("a land you control enters" has no state in the engine).
 */
export const TRIGGER_ENTERS_STATE = defineRule<IrTrigger>({
  id: 'trigger.enters-state',
  family: 'trigger',
  leading: ['~', 'another', 'a', 'an'],
  cites: [
    'CR 603.6a (Handling Triggered Abilities)',
    'CR 614.1c (Replacement Effects)',
    'CR 110.5b (Permanents)',
  ],
  examples: [
    '~ enters untapped',
    '~ enters the battlefield untapped',
    '~ enters tapped',
    'another creature you control enters untapped',
    'a creature enters tapped',
  ],
  rejects: [
    '~ enters',
    '~ enters the battlefield',
    '~ enters untapped or attacks',
    '~ enter untapped',
    '~ enters untap',
    '~ enters tapped and attacking',
    'a land you control enters untapped',
    '~ dies untapped',
    '~ enters the battlefield tapped and',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      satisfy(triggerSubject('trigger.enters-state'), (s) => !isPlainLandYouControl(s)),
      pattern(new RegExp(` enters(?: the battlefield)? (untapped|tapped)${NOT_IN_WORD}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    const [subject, words] = r.value;
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'enters',
        subject,
        entersTapped: (words[1] ?? '').toLowerCase() === 'tapped',
        args: {},
        span: { start: pos, end: r.pos },
        rule: 'trigger.enters-state',
      },
      pos: r.pos,
    };
  },
});

/**
 * `trigger.leaves-to`: "~ dies or is put into exile from the battlefield", "~ is put into exile from the battlefield" (CR 700.4: "dies"
 * means put into a graveyard from the battlefield; CR 603.6c: leaves-the-battlefield abilities trigger when a permanent goes to another
 * zone; CR 603.10a: they look back in time). The zones it went to are what the text names: a graveyard and exile, or exile alone. The
 * engine's `leavesBattlefield` with `to`. "Dies" alone is `trigger.dies`.
 */
export const TRIGGER_LEAVES_TO = defineRule<IrTrigger>({
  id: 'trigger.leaves-to',
  family: 'trigger',
  leading: ATTACHABLE_LEADING,
  cites: [
    'CR 700.4 (General)',
    'CR 603.6c (Handling Triggered Abilities)',
    'CR 603.10a (Handling Triggered Abilities)',
    'CR 406.1 (Exile)',
  ],
  examples: [
    '~ dies or is put into exile from the battlefield',
    '~ is put into exile from the battlefield',
    'another creature you control dies or is put into exile from the battlefield',
    'a creature dies or is put into exile from the battlefield',
    'equipped creature dies or is put into exile from the battlefield',
  ],
  rejects: [
    '~ dies',
    '~ is put into exile',
    '~ dies or is put into exile',
    '~ dies or is put into exile from the battlefield or attacks',
    '~ dies or is put into your graveyard from the battlefield',
    '~ die or is put into exile from the battlefield',
    '~ is put into a graveyard or exile from the battlefield',
    '~ leaves the battlefield',
    '~ is put into exile from a graveyard',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      permanentOrAttachedSubject('trigger.leaves-to'),
      choice<readonly ('graveyard' | 'exile')[]>(
        map(
          pattern(
            new RegExp(` dies or is put into exile from the battlefield${NOT_IN_WORD}`, 'iu'),
          ),
          () => ['graveyard', 'exile'],
        ),
        map(
          pattern(new RegExp(` is put into exile from the battlefield${NOT_IN_WORD}`, 'iu')),
          () => ['exile'],
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [subject, to] = r.value;
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'leavesBattlefield',
        subject,
        to: [...to],
        args: {},
        span: { start: pos, end: r.pos },
        rule: 'trigger.leaves-to',
      },
      pos: r.pos,
    };
  },
});

export const TRIGGER_DIES_OWN_GRAVEYARD = defineRule<IrTrigger>({
  id: 'trigger.dies-own-graveyard',
  family: 'trigger',
  leading: ['another', 'a', 'an'],
  cites: ['CR 700.4 (General)', 'CR 603.10a (Handling Triggered Abilities)'],
  examples: ['another creature is put into your graveyard from the battlefield'],
  rejects: ['another creature is put into your graveyard from anywhere'],
  parse: (ctx, pos) => {
    const r = sequence(
      triggerSubject('trigger.dies-own-graveyard'),
      pattern(/ is put into your graveyard from the battlefield(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      pos: r.pos,
      value: {
        kind: 'trigger',
        event: 'dies',
        subject: r.value[0],
        by: 'you',
        args: {},
        span: { start: pos, end: r.pos },
        rule: 'trigger.dies-own-graveyard',
      },
    };
  },
});

export const RECURSION_TRIGGER_RULES = [
  TRIGGER_DIES_OWN_GRAVEYARD,
  TRIGGER_LEAVES_TO,
  TRIGGER_ENTERS_STATE,
];
