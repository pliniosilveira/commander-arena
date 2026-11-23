/**
 * Noun rules of group 4 of the Limit Break deck (issue 96): "all artifacts that player controls" (Hellkite Tyrant).
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { BOUNDARY, permanentPhrase } from './phrases';

/**
 * `noun.all-permanents-of-that-player`: "all artifacts that player controls", "all creatures that player controls" (CR 109.4, 110.1, 608.2c): every permanent of the kind that the
 * player the text named ("that player": the player the trigger is about) controls, as `noun.each-permanent-of-player` reads "each creature that player controls". The player is the
 * anaphor the binding pass resolves (the engine's `controlledBy`); which permanents it names is fixed as the effect resolves (CR 608.2c). Not read: "each", "other", a singular, no
 * controller words, "you control" or "your opponents control" (the plain `noun.all-permanents`), "that opponent", a controller said twice.
 */
export const NOUN_ALL_PERMANENTS_OF_THAT_PLAYER = defineRule<IrNoun>({
  id: 'noun.all-permanents-of-that-player',
  family: 'noun',
  leading: ['all'],
  cites: [
    'CR 109.4 (Objects)',
    'CR 110.1 (Permanents)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'all artifacts that player controls',
    'all creatures that player controls',
    'all nonland permanents that player controls',
  ],
  rejects: [
    'all artifacts',
    'all artifacts you control',
    'all artifacts your opponents control',
    'all artifact that player controls',
    'each artifact that player controls',
    'all other artifacts that player controls',
    'all artifacts that opponent controls',
    'all artifacts target player controls',
    'all artifacts that player',
    'all artifacts you control that player controls',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('all '),
      permanentPhrase(true, 'all'),
      spanned(pattern(new RegExp(` that player controls${BOUNDARY}`, 'iu'))),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, filter, suffix] = r.value;
    // A permanent phrase that already says who controls it ("all artifacts you control that player controls") is not this phrase.
    if (filter.controller !== undefined) return fail(ctx, pos);
    const start = suffix.span.start + 1;
    const player: IrNoun = {
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: 'that player' },
      upTo: false,
      plural: false,
      other: false,
      span: { start, end: start + 'that player'.length },
      rule: 'noun.all-permanents-of-that-player',
    };
    const noun: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: { ...filter, controller: { noun: player }, raw: ctx.text.slice(pos, r.pos) },
      upTo: false,
      plural: true,
      other: false,
      span: { start: pos, end: r.pos },
      rule: 'noun.all-permanents-of-that-player',
    };
    return { ok: true, value: noun, pos: r.pos };
  },
});

/** Before `noun.all-permanents`, whose phrase ("all artifacts") is the first words of this one. */
export const LIMIT_BREAK_G4_EARLY_NOUN_RULES = [NOUN_ALL_PERMANENTS_OF_THAT_PLAYER];
