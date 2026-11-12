/**
 * Modal rules (stage P19, D-105, D-114): the lead line of a modal spell or ability, read before the
 * bullets. "Choose one —", "Choose two —", "Choose one or both —" and "Choose one or more —" say how
 * many of the modes the controller chooses (CR 700.2); the commander wording widens "choose one" to both
 * modes (CR 903.3d is what "controls a commander" means). The bullets are not rules: each is read as a
 * spell of its own by the effect family, and a mode no rule reads leaves the whole card unread.
 *
 * "Choose three. You may choose the same mode more than once." (D-1000, CR 700.2d) is read by `modal.choose-repeatable`.
 *
 * Not read, because the engine does not run them (D-114): "Choose three —" on its own, "Choose up to one", "Choose
 * any number —", "Choose X —", a choice made by another player (CR 700.2e), a mode with a cost before its
 * effect (CR 700.2h: Spree, and Escalate and Entwine, whose keyword lines have no rule) and pawprint modes (CR 700.2i).
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrCondition, IrModeChoice, IrModeHeader } from '../../ir/types';
import { defineRule, family } from '../registry';

/** The word before the dash: how many modes, as the engine's `ModeChoice` wants them. */
const CHOICES: ReadonlyMap<string, IrModeChoice> = new Map([
  ['one', { min: 1, max: 1 }],
  ['two', { min: 2, max: 2 }],
  // "both" are the two modes of a spell that has exactly two (CR 700.2).
  ['one or both', { min: 1, max: 2, exactly: 2 }],
  ['one or more', { min: 1, max: 'all' }],
]);

/**
 * `modal.choose`: "Choose one —", "Choose two —", "Choose one or both —", "Choose one or more —" (CR 700.2:
 * a spell or ability is modal when it has two or more bulleted options and an instruction to choose a
 * number of them; CR 700.2a and 700.2b: the controller chooses as the spell is cast, the ability is
 * activated or the triggered ability is put on the stack; CR 700.2d: the same mode is not chosen twice).
 * The em dash (U+2014) ends the line and the bullets follow.
 */
export const MODAL_CHOOSE = defineRule<IrModeHeader>({
  id: 'modal.choose',
  family: 'modal',
  leading: ['choose'],
  cites: [
    'CR 700.2 (General)',
    'CR 700.2a (General)',
    'CR 700.2b (General)',
    'CR 700.2d (General)',
  ],
  examples: [
    'Choose one —',
    'Choose two —',
    'Choose one or both —',
    'Choose one or more —',
    'choose one —',
  ],
  rejects: [
    'Choose one',
    'Choose one -',
    'Choose three —',
    'Choose up to two —',
    'Choose any number —',
    'Choose X —',
    'Choose one at random —',
    'Choose a creature type —',
    'Choose one. If you control a commander as you cast ~, you may choose both instead.',
    'Choose one — ',
    'Choose one or both or more —',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/choose (one or both|one or more|one|two) —$/i)(ctx, pos);
    if (!r.ok) return r;
    const choose = CHOICES.get((r.value[1] ?? '').toLowerCase());
    if (choose === undefined) return { ok: false };
    const header: IrModeHeader = {
      kind: 'modeHeader',
      choose,
      span: { start: pos, end: r.pos },
      rule: 'modal.choose',
    };
    return { ok: true, value: header, pos: r.pos };
  },
});

/**
 * `modal.choose-commander`: "Choose one. If you control a commander as you cast ~, you may choose both
 * instead." (CR 700.2, 903.3d). One mode is chosen, or both when the controller controls a commander as
 * the spell is cast (the engine's `maxIf`, read as the modes are chosen). It fits a spell with exactly two
 * modes, which is what "both" means; the card's own name or "this spell" is `~` after normalization.
 */
export const MODAL_CHOOSE_COMMANDER = defineRule<IrModeHeader>({
  id: 'modal.choose-commander',
  family: 'modal',
  leading: ['choose'],
  cites: ['CR 700.2 (General)', 'CR 700.2a (General)', 'CR 903.3d (Commander)'],
  examples: [
    'Choose one. If you control a commander as you cast ~, you may choose both instead.',
    'choose one. if you control a commander as you cast ~, you may choose both instead.',
  ],
  rejects: [
    'Choose one. If you control a commander as you cast ~, you may choose both instead',
    'Choose one. If you control a commander, you may choose both instead.',
    'Choose one. If you control two commanders as you cast ~, you may choose both instead.',
    'Choose one. If an opponent controls a commander as you cast ~, you may choose both instead.',
    'Choose one. If you control a commander as you cast ~, you may choose all instead.',
    'Choose two. If you control a commander as you cast ~, you may choose both instead.',
    'Choose one —',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('choose one. if '),
      family<IrCondition>('condition', { only: ['condition.control-commander'] }),
      literal(' as you cast ~, you may choose both instead.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const header: IrModeHeader = {
      kind: 'modeHeader',
      choose: { min: 1, max: 1, exactly: 2, widen: r.value[1] },
      span: { start: pos, end: r.pos },
      rule: 'modal.choose-commander',
    };
    return { ok: true, value: header, pos: r.pos };
  },
});

/**
 * `modal.choose-widen`: "Choose one. If you control a Wizard as you cast ~, you may choose two instead." (D-297, CR 700.2, 700.2a: the controller
 * chooses the modes as the spell is cast; the engine's `maxIf` reads the condition then). One mode is chosen, or two while the condition holds, however
 * many modes the spell has (two or more): "both" is the wording of `modal.choose-commander`, which is two modes and the commander condition. The
 * condition is the one of `condition.control-a` ("you control a Wizard", "you control an artifact"); "two" is the only number read.
 */
export const MODAL_CHOOSE_WIDEN = defineRule<IrModeHeader>({
  id: 'modal.choose-widen',
  family: 'modal',
  leading: ['choose'],
  cites: ['CR 700.2 (General)', 'CR 700.2a (General)'],
  examples: [
    'Choose one. If you control a Wizard as you cast ~, you may choose two instead.',
    'choose one. if you control an artifact as you cast ~, you may choose two instead.',
    'Choose one. If you control a Dragon as you cast ~, you may choose two instead.',
  ],
  rejects: [
    'Choose one. If you control a Wizard as you cast ~, you may choose two instead',
    'Choose one. If you control a Wizard, you may choose two instead.',
    'Choose one. If you control a Wizard as you cast ~, you may choose both instead.',
    'Choose one. If you control a Wizard as you cast ~, you may choose three instead.',
    'Choose one. If you control a Wizard as you cast ~, you may choose all instead.',
    'Choose one. If an opponent controls a Wizard as you cast ~, you may choose two instead.',
    'Choose one. If you control two Wizards as you cast ~, you may choose two instead.',
    'Choose two. If you control a Wizard as you cast ~, you may choose two instead.',
    'Choose one —',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('choose one. if '),
      family<IrCondition>('condition', { only: ['condition.control-a'] }),
      literal(' as you cast ~, you may choose two instead.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const header: IrModeHeader = {
      kind: 'modeHeader',
      choose: { min: 1, max: 1, widen: r.value[1], widenTo: 2 },
      span: { start: pos, end: r.pos },
      rule: 'modal.choose-widen',
    };
    return { ok: true, value: header, pos: r.pos };
  },
});

/**
 * `modal.choose-not-repeated`: "Choose one that hasn't been chosen this turn —" (CR 700.2, 603.3c: the modes of a triggered ability are chosen as it
 * goes on the stack; a mode that the same permanent chose earlier this turn may not be chosen again, and the ability is removed from the stack when
 * none is left). One mode.
 */
export const MODAL_CHOOSE_NOT_REPEATED = defineRule<IrModeHeader>({
  id: 'modal.choose-not-repeated',
  family: 'modal',
  leading: ['choose'],
  cites: ['CR 700.2 (General)', 'CR 700.2b (General)', 'CR 603.3c (Handling Triggered Abilities)'],
  examples: [
    "Choose one that hasn't been chosen this turn —",
    'choose one that hasn’t been chosen this turn —',
  ],
  rejects: [
    "Choose one that hasn't been chosen this turn",
    "Choose two that haven't been chosen this turn —",
    "Choose one that hasn't been chosen —",
    "Choose one that hasn't been chosen this game —",
    "Choose one that hasn't been chosen this turn -",
    'Choose one —',
    "Choose one or both that haven't been chosen this turn —",
  ],
  parse: (ctx, pos) => {
    const r = pattern(/choose one that hasn['’]t been chosen this turn —$/i)(ctx, pos);
    if (!r.ok) return r;
    const header: IrModeHeader = {
      kind: 'modeHeader',
      choose: { min: 1, max: 1, notRepeatedThisTurn: true },
      span: { start: pos, end: r.pos },
      rule: 'modal.choose-not-repeated',
    };
    return { ok: true, value: header, pos: r.pos };
  },
});

/** The number words of a repeatable choice: "Choose three." (two to ten, the most the engine lists, D-1000). */
const NUMBER_WORDS: ReadonlyMap<string, number> = new Map([
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
  ['ten', 10],
]);

/**
 * `modal.choose-repeatable`: "Choose three. You may choose the same mode more than once." and "Choose up to three. You may choose the same mode more
 * than once." (D-1000, CR 700.2, 700.2a, 700.2d: the controller chooses the modes as the spell is cast, and may choose the same one again; a mode
 * chosen several times is treated as if it appeared that many times in sequence). The header is the first line, with no dash; the bullets follow. The
 * engine's `ModeChoice.repeatable`: the number may be more than the number of bullets, and "up to" lets the controller choose fewer, down to none.
 */
export const MODAL_CHOOSE_REPEATABLE = defineRule<IrModeHeader>({
  id: 'modal.choose-repeatable',
  family: 'modal',
  leading: ['choose'],
  cites: [
    'CR 700.2 (General)',
    'CR 700.2a (General)',
    'CR 700.2d (General)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'Choose three. You may choose the same mode more than once.',
    'choose two. you may choose the same mode more than once.',
    'Choose up to five. You may choose the same mode more than once.',
  ],
  rejects: [
    'Choose three. You may choose the same mode more than once',
    'Choose three. You may choose the same mode twice.',
    'Choose one. You may choose the same mode more than once.',
    'Choose up to one. You may choose the same mode more than once.',
    'Choose three —',
    'Choose three.',
    'Choose X. You may choose the same mode more than once.',
    'Choose eleven. You may choose the same mode more than once.',
    'Choose one or more. You may choose the same mode more than once.',
    'Choose three. You may choose the same mode more than once. —',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /choose (up to )?(two|three|four|five|six|seven|eight|nine|ten)\. you may choose the same mode more than once\.$/i,
    )(ctx, pos);
    if (!r.ok) return r;
    const max = NUMBER_WORDS.get((r.value[2] ?? '').toLowerCase());
    if (max === undefined) return { ok: false };
    const header: IrModeHeader = {
      kind: 'modeHeader',
      choose: { min: r.value[1] === undefined ? max : 0, max, repeatable: true },
      span: { start: pos, end: r.pos },
      rule: 'modal.choose-repeatable',
    };
    return { ok: true, value: header, pos: r.pos };
  },
});

export const MODAL_RULES = [
  MODAL_CHOOSE,
  MODAL_CHOOSE_COMMANDER,
  MODAL_CHOOSE_WIDEN,
  MODAL_CHOOSE_NOT_REPEATED,
  MODAL_CHOOSE_REPEATABLE,
];
