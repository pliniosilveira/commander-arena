/**
 * Statements about the permanent an Equipment or Aura is attached to that hold only while a condition does (Multiclass Baldric; CR 604.4, 611.3a, 613.1f, 615.1): keywords that
 * each have a condition of their own ("Equipped creature has lifelink if you control a Cleric, deathtouch if you control a Rogue, ..."), and damage prevented to the attached
 * permanent ("As long as you have a full party, prevent all damage that would be dealt to equipped creature.").
 */
import { fail, literal, type Parser, pattern, sequence } from '../../combinators';
import type { IrCondition, IrNoun, IrStatic, IrStaticEffect } from '../../ir/types';
import { KEYWORD_WORD } from '../keyword/list';
import { defineRule, family, quietly } from '../registry';
import { STATIC_CONDITION } from './conditional';

const PERIOD = pattern(/\./);

const ATTACHED: Parser<IrNoun> = family<IrNoun>('noun', { only: ['noun.attached-permanent'] });

/** One "<keyword> if <condition>" of the list. */
const KEYWORD_IF: Parser<{ keyword: string; condition: IrCondition }> = (ctx, pos) => {
  const read = sequence(KEYWORD_WORD, literal(' if '), STATIC_CONDITION)(ctx, pos);
  if (!read.ok) return read;
  const [keyword, , condition] = read.value;
  return { ok: true, value: { keyword, condition }, pos: read.pos };
};

/**
 * `static.attached-keywords-if`: "Equipped creature has lifelink if you control a Cleric, deathtouch if you control a Rogue, haste if you control a Warrior, and flying if you
 * control a Wizard." (CR 611.3a, 613.1f): the attached permanent has each keyword while its own condition holds, so each keyword is a static ability with that condition (the
 * IR's `effectConditions`, one for each effect). At least two keywords, each different, and each with a condition; Oracle's shape, a comma between all but the last two and ", and"
 * (or " and" for two) before the last. Not read: one keyword with one condition (`static.conditional-suffix`), a keyword with no condition, an "as long as", a condition that
 * is not one a static ability reads.
 */
export const STATIC_ATTACHED_KEYWORDS_IF = defineRule<IrStatic>({
  id: 'static.attached-keywords-if',
  family: 'static',
  leading: ['enchanted', 'equipped'],
  cites: [
    'CR 611.3a (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 604.4 (Handling Static Abilities)',
  ],
  examples: [
    'Equipped creature has lifelink if you control a Cleric, deathtouch if you control a Rogue, haste if you control a Warrior, and flying if you control a Wizard.',
    'Equipped creature has flying if you control a Wizard and haste if you control a Warrior.',
    'Enchanted creature has vigilance if you control a Cleric, and lifelink if you control a Rogue.',
  ],
  rejects: [
    'Equipped creature has flying if you control a Wizard.',
    'Equipped creature has lifelink if you control a Cleric, deathtouch if you control a Rogue, haste if you control a Warrior, and flying if you control a Wizard',
    'Equipped creature has lifelink if you control a Cleric, deathtouch, and flying if you control a Wizard.',
    'Equipped creature has lifelink if you control a Cleric and lifelink if you control a Rogue.',
    'Equipped creature has lifelink if you control a Cleric, flying if you control a Wizard.',
    'Equipped creature has lifelink if you control a Cleric and deathtouch if you control a Rogue and flying if you control a Wizard.',
    'Equipped creature has lifelink if you control a banana and flying if you control a Wizard.',
    'Equipped creature gets +1/+1 if you control a Cleric and has flying if you control a Wizard.',
    'Equipped creatures have lifelink if you control a Cleric and flying if you control a Wizard.',
  ],
  parse: (ctx, pos) => {
    const head = sequence(ATTACHED, literal(' has '))(ctx, pos);
    if (!head.ok) return head;
    const [subject] = head.value;
    const items: { keyword: string; condition: IrCondition }[] = [];
    const separators: string[] = [];
    let end = head.pos;
    for (;;) {
      const item = KEYWORD_IF(ctx, end);
      if (!item.ok) break;
      items.push(item.value);
      end = item.pos;
      const sep = /^(, and |, | and )/u.exec(ctx.text.slice(end, end + 6));
      if (sep === null) break;
      // A separator that is not followed by another "<keyword> if <condition>" is no separator of this list.
      if (!KEYWORD_IF(ctx, end + sep[0].length).ok) break;
      separators.push(sep[0]);
      end += sep[0].length;
    }
    // Oracle shape: "A and B", "A, B, and C": commas between all but the last two, ", and" (or " and" for two) before the last.
    const last = separators.length - 1;
    const shaped = separators.every((s, i) =>
      i < last ? s === ', ' : last === 0 ? s === ' and ' || s === ', and ' : s === ', and ',
    );
    if (items.length < 2 || !shaped) return fail(ctx, pos);
    const keywords = items.map((i) => i.keyword);
    if (keywords.some((k, i) => keywords.indexOf(k) !== i)) return fail(ctx, pos);
    const stop = PERIOD(ctx, end);
    if (!stop.ok) return stop;
    const effects: IrStaticEffect[] = keywords.map((keyword) => ({
      kind: 'grantKeyword',
      keyword,
    }));
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects,
        effectConditions: items.map((i) => i.condition),
        span: { start: pos, end: stop.pos },
        rule: 'static.attached-keywords-if',
      },
      pos: stop.pos,
    };
  },
});

const SCOPE_WORDS = '(all|all combat|all noncombat) damage';

/**
 * `static.prevent-damage-to-attached`: "Prevent all damage that would be dealt to enchanted creature.", "As long as you have a full party, prevent all damage that would be dealt
 * to equipped creature." (CR 615.1, 615.6, 303.4, 301.5, 604.4): the Aura or Equipment prevents all the damage of the scope that would be dealt to the permanent it is attached to,
 * perhaps while a condition holds (read for the controller of the Aura or Equipment). Only all of it, to the attached permanent, with no duration. Not read: "the next 3 damage",
 * a source ("by creatures"), another recipient, "to ~" (`static.prevent-damage-to-self`) and a duration.
 */
export const STATIC_PREVENT_DAMAGE_TO_ATTACHED = defineRule<IrStatic>({
  id: 'static.prevent-damage-to-attached',
  family: 'static',
  leading: ['as', 'prevent'],
  cites: [
    'CR 615.1 (Prevention Effects)',
    'CR 615.6 (Prevention Effects)',
    'CR 604.4 (Handling Static Abilities)',
    'CR 611.3a (Continuous Effects)',
  ],
  examples: [
    'Prevent all damage that would be dealt to enchanted creature.',
    'Prevent all combat damage that would be dealt to equipped creature.',
    'Prevent all noncombat damage that would be dealt to enchanted creature.',
    'As long as you have a full party, prevent all damage that would be dealt to equipped creature.',
    'As long as you control a Cleric, prevent all combat damage that would be dealt to enchanted creature.',
  ],
  rejects: [
    'Prevent all damage that would be dealt to equipped creature',
    'Prevent all damage that would be dealt to ~.',
    'Prevent all damage that would be dealt to you.',
    'Prevent all damage that would be dealt to equipped creatures.',
    'Prevent the next 3 damage that would be dealt to equipped creature.',
    'Prevent all damage that would be dealt to equipped creature by creatures.',
    'Prevent all damage that would be dealt to equipped creature this turn.',
    'As long as you have a full party, prevent all damage that would be dealt to equipped creature',
    'As long as you have a full party prevent all damage that would be dealt to equipped creature.',
    'As long as you have a full party, prevent all damage that would be dealt to ~.',
    'As long as you have a full party, draw a card.',
  ],
  parse: (ctx, pos) => {
    const lead = sequence(STATIC_CONDITION, literal(', '))(ctx, pos + 'as long as '.length);
    const hasLead = /^as long as /iu.test(ctx.text.slice(pos, pos + 11)) && lead.ok;
    if (/^as /iu.test(ctx.text.slice(pos, pos + 3)) && !hasLead) return fail(ctx, pos);
    const start = hasLead && lead.ok ? lead.pos : pos;
    const read = sequence(
      pattern(new RegExp(`prevent ${SCOPE_WORDS} that would be dealt to `, 'iu')),
      ATTACHED,
      PERIOD,
    )(ctx, start);
    if (!read.ok) return read;
    const [head, subject] = read.value;
    const word = (head[1] ?? '').toLowerCase();
    const scope = word === 'all combat' ? 'combat' : word === 'all noncombat' ? 'noncombat' : 'all';
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [{ kind: 'preventDamageToThis', scope }],
        ...(hasLead && lead.ok ? { condition: lead.value[0] } : {}),
        span: { start: pos, end: read.pos },
        rule: 'static.prevent-damage-to-attached',
      },
      pos: read.pos,
    };
  },
});

export const ATTACHED_CONDITION_STATIC_RULES = [
  STATIC_ATTACHED_KEYWORDS_IF,
  STATIC_PREVENT_DAMAGE_TO_ATTACHED,
].map(quietly);
