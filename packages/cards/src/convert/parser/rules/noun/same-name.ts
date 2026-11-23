/**
 * Noun rule of Echoing Return (CR 201.2, 400.3, 608.2c): `noun.target-card-and-same-name`.
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule } from '../registry';
import { CARD_TYPES, NO_PARTS, permanentPhrase, toFilter, typeWords } from './phrases';

const ID = 'noun.target-card-and-same-name';

/**
 * `noun.target-card-and-same-name`: "target creature card and all other cards with the same name as that card from your graveyard" (CR 201.2: the name of a card; CR 608.2c: the
 * effect works out which cards have it as it resolves). The target is one card of your graveyard (a noun of its own, numbered with the other targets of the text: the binding pass
 * walks the `sameNameAsNoun` of the filter); the objects are every card of your graveyard with its name, itself included (the engine's `sameNameAs` of that target, read where an
 * effect's `each` selector is read). Not read: another graveyard than yours, a count, "up to", a target that is not a card of one card type, "the same name as" something else
 * than "that card", "other cards" with no "all", "a card".
 */
export const NOUN_TARGET_CARD_AND_SAME_NAME = defineRule<IrNoun>({
  id: ID,
  family: 'noun',
  leading: ['target'],
  cites: [
    'CR 201.2 (Name)',
    'CR 115.1 (Targets)',
    'CR 400.3 (General)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'target creature card and all other cards with the same name as that card from your graveyard',
    'target artifact card and all other cards with the same name as that card from your graveyard',
  ],
  rejects: [
    'target creature card and all other cards with the same name as that card from a graveyard',
    'target creature card and all other cards with the same name as that card',
    'target creature card and all cards with the same name as that card from your graveyard',
    'target creature card and all other cards with the same name as that creature from your graveyard',
    'target creature card and all other cards with the same name as target creature card from your graveyard',
    'two target creature cards and all other cards with the same name as that card from your graveyard',
    'target card and all other cards with the same name as that card from your graveyard',
    'target creature and all other cards with the same name as that card from your graveyard',
    'target creature card and other cards with the same name as that card from your graveyard',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('target '),
      typeWords(CARD_TYPES, false),
      pattern(
        / card and all other cards with the same name as that card from your graveyard(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, types] = r.value;
    if (types.length === 0) return fail(ctx, pos);
    const raw = ctx.text.slice(pos, r.pos);
    const targetFilter: IrFilter = {
      ...toFilter('graveyard', { ...NO_PARTS, types, controller: 'you' }, raw),
      card: true,
    };
    const target: IrNoun = {
      kind: 'noun',
      det: 'target',
      filter: targetFilter,
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: r.pos },
      rule: ID,
    };
    const everyCard: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: {
        ...toFilter('graveyard', { ...NO_PARTS, controller: 'you' }, raw),
        card: true,
        sameNameAsNoun: target,
      },
      upTo: false,
      plural: true,
      other: false,
      span: { start: pos, end: r.pos },
      rule: ID,
    };
    return { ok: true, value: everyCard, pos: r.pos };
  },
});

const TOKENS_ID = 'noun.target-permanent-and-same-name-tokens';

/**
 * `noun.target-permanent-and-same-name-tokens`: "target nonland permanent an opponent controls and all tokens that player controls with the same name as that permanent" (CR 201.2: the
 * name; CR 111.1: a token; CR 608.2c: the effect works out which tokens have the name as it resolves). The target is a permanent of a noun of its own (numbered with the other
 * targets of the text); the objects are that permanent and every token its controller controls that has its name (the engine's `each` with `sameNameAs`, `controlledBy` the controller of
 * that target and `plus` the target). The target must be said to be controlled by an opponent. Not read: "that player" for a player target, a count, "up to", "another", a target
 * that is not a battlefield permanent, "all other tokens", "that creature" for the name, tokens of a player the target does not name.
 */
export const NOUN_TARGET_PERMANENT_AND_SAME_NAME_TOKENS = defineRule<IrNoun>({
  id: TOKENS_ID,
  family: 'noun',
  leading: ['target'],
  cites: [
    'CR 201.2 (Name)',
    'CR 111.1 (Tokens)',
    'CR 115.1 (Targets)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'target nonland permanent an opponent controls and all tokens that player controls with the same name as that permanent',
    'target creature an opponent controls and all tokens that player controls with the same name as that creature',
  ],
  rejects: [
    'target nonland permanent an opponent controls and all tokens that player controls',
    'target nonland permanent an opponent controls and all other tokens that player controls with the same name as that permanent',
    'target nonland permanent an opponent controls and all tokens you control with the same name as that permanent',
    'target nonland permanent you control and all tokens that player controls with the same name as that permanent',
    'target nonland permanent and all tokens that player controls with the same name as that permanent',
    'target nonland permanent an opponent controls and all tokens that player controls with the same name as target permanent',
    'two target nonland permanents an opponent controls and all tokens that player controls with the same name as that permanent',
    'target nonland permanent an opponent controls and tokens that player controls with the same name as that permanent',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('target '),
      permanentPhrase(false),
      pattern(
        / and all tokens that player controls with the same name as that (?:permanent|creature|artifact|enchantment)(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, targetFilter, tail] = r.value;
    // Only a target an opponent controls: "that player" is its controller, and the spell is not about the caster's own permanents.
    if (targetFilter.controller !== 'opponent') return fail(ctx, pos);
    const noun = (tail[0] ?? '').toLowerCase().split(' as that ')[1] ?? '';
    if (noun !== 'permanent' && !(targetFilter.types ?? []).includes(noun)) return fail(ctx, pos);
    const raw = ctx.text.slice(pos, r.pos);
    const target: IrNoun = {
      kind: 'noun',
      det: 'target',
      filter: targetFilter,
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: r.pos },
      rule: TOKENS_ID,
    };
    const set: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: {
        ...toFilter('battlefield', { ...NO_PARTS, token: true }, raw),
        sameNameAsNoun: target,
        withNamedTarget: true,
        controllerOfNamed: true,
      },
      upTo: false,
      plural: true,
      other: false,
      span: { start: pos, end: r.pos },
      rule: TOKENS_ID,
    };
    return { ok: true, value: set, pos: r.pos };
  },
});

export const SAME_NAME_NOUN_RULES = [NOUN_TARGET_CARD_AND_SAME_NAME];

/** Read before `noun.target-permanent`, whose phrase would stop at "an opponent controls". */
export const SAME_NAME_TOKENS_NOUN_RULES = [NOUN_TARGET_PERMANENT_AND_SAME_NAME_TOKENS];
