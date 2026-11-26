/**
 * Noun rules of group 2 of the Lorehold Spirit deck (issue 86, Quintorius, Loremaster): "target noncreature, nonland card from your graveyard" and "target card exiled with ~".
 */
import { fail, literal, many, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule } from '../registry';
import { BOUNDARY, MODIFIER, NO_PARTS, toFilter } from './phrases';

/**
 * `noun.target-nonmatching-graveyard-card`: "target noncreature, nonland card from your graveyard" (CR 404.1, 115.1, 205.2a): one card of your own graveyard that is none of the card types the
 * words leave out ("noncreature", "nonland"), each type said with its own "non", the comma between two of them optional. The engine's `notTypes` of a card in your graveyard. Read only by
 * `effect.exile`, which names it. Not read: a type that is named (that is `noun.target-graveyard-card`), another modifier ("nontoken", a color), a card of a graveyard that is not yours, the
 * plural, "up to", "target noncreature card" with no graveyard, one "non" word twice.
 */
export const NOUN_TARGET_NONMATCHING_GRAVEYARD_CARD = defineRule<IrNoun>({
  id: 'noun.target-nonmatching-graveyard-card',
  family: 'noun',
  leading: ['target'],
  cites: ['CR 404.1 (Graveyard)', 'CR 115.1 (Targets)', 'CR 205.2a (Card Types)'],
  examples: [
    'target noncreature, nonland card from your graveyard',
    'target noncreature nonland card from your graveyard',
    'target nonland card from your graveyard',
    'target noncreature card from your graveyard',
    'target nonartifact, noncreature, nonland card from your graveyard',
  ],
  rejects: [
    'target noncreature, nonland card',
    'target noncreature, nonland card from a graveyard',
    "target noncreature, nonland card from an opponent's graveyard",
    'target noncreature, nonland cards from your graveyard',
    'two target noncreature, nonland cards from your graveyard',
    'up to one target noncreature, nonland card from your graveyard',
    'target nontoken card from your graveyard',
    'target nonland creature card from your graveyard',
    'target nonland nonland card from your graveyard',
    'target card from your graveyard',
    'noncreature, nonland card from your graveyard',
    'target noncreature, nonland permanent card from your graveyard',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('target '),
      many(MODIFIER),
      pattern(new RegExp(`card${BOUNDARY}`, 'iu')),
      literal(' from your graveyard'),
    )(ctx, pos);
    if (!r.ok) return r;
    const parts = r.value[1].reduce((acc, m) => m(acc), NO_PARTS);
    // Only the words that leave a card type out: each once, at least one.
    const plain =
      parts.notTypes.length > 0 &&
      new Set(parts.notTypes).size === parts.notTypes.length &&
      parts.types.length === 0 &&
      parts.supertypes.length === 0 &&
      parts.colors.length === 0 &&
      parts.tapped === undefined &&
      parts.token === undefined &&
      parts.notSubtypes.length === 0 &&
      !parts.colorless &&
      parts.notColors.length === 0 &&
      parts.keywords.length === 0 &&
      parts.notKeywords.length === 0 &&
      parts.notSupertypes.length === 0 &&
      !parts.attacking &&
      !parts.attackingOrBlocking &&
      !parts.blocking &&
      !parts.historic &&
      !parts.modified &&
      !parts.equipped &&
      parts.facing === undefined &&
      !parts.commander &&
      parts.outlaw === undefined &&
      parts.colorCount === undefined;
    if (!plain) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        kind: 'noun',
        det: 'target',
        filter: {
          ...toFilter(
            'graveyard',
            { ...NO_PARTS, notTypes: parts.notTypes, controller: 'you' },
            ctx.text.slice(pos, r.pos),
          ),
          card: true,
        },
        upTo: false,
        plural: false,
        other: false,
        span: { start: pos, end: r.pos },
        rule: 'noun.target-nonmatching-graveyard-card',
      },
      pos: r.pos,
    };
  },
});

/**
 * `noun.target-card-exiled-with-self`: "target card exiled with ~" (CR 607.2a, 115.1, 400.7): one card in exile that the permanent the ability belongs to exiled with its linked ability. The
 * engine's `exiledWithSource` of a card in exile. Read only by `effect.cast-exiled-with-self`, which names it. Not read: another permanent ("exiled with target creature"), the plural, "up to",
 * "target card exiled with it", another noun than a card type ("target creature or land card exiled with ~").
 */
export const NOUN_TARGET_CARD_EXILED_WITH_SELF = defineRule<IrNoun>({
  id: 'noun.target-card-exiled-with-self',
  family: 'noun',
  leading: ['target'],
  cites: ['CR 607.2a (Linked Abilities)', 'CR 115.1 (Targets)', 'CR 400.7 (General)'],
  examples: ['target card exiled with ~'],
  rejects: [
    'target card exiled with it',
    'target cards exiled with ~',
    'two target cards exiled with ~',
    'up to one target card exiled with ~',
    'target creature or land card exiled with ~',
    'target Zombie card exiled with ~',
    'target card exiled with target creature',
    'target card exiled with',
    'card exiled with ~',
    'target card in exile',
    'target card exiled with ~ this turn',
    'target creature card with mana value 3 exiled with ~',
    'target creature card with mana value X or less exiled with ~',
  ],
  parse: (ctx, pos) => {
    // The Darkness Crystal: a card type before "card" ("target creature card exiled with ~").
    const r = pattern(
      new RegExp(
        `target (?:(artifact|creature|enchantment|land|planeswalker|instant|sorcery) )?card( with mana value X)? exiled with ~${BOUNDARY}`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const type = r.value[1]?.toLowerCase();
    // Shelob, Dread Weaver (CR 107.3a, 202.3, 607.2a): "target creature card with mana value X exiled with ~": the X announced for the ability with {X} in its cost.
    const valueX = r.value[2] !== undefined;
    return {
      ok: true,
      value: {
        kind: 'noun',
        det: 'target',
        filter: {
          zone: 'exile',
          card: true,
          ...(type === undefined ? {} : { types: [type] }),
          exiledWithSelf: true,
          ...(valueX ? { manaValueX: true as const } : {}),
          raw: ctx.text.slice(pos, r.pos),
        },
        upTo: false,
        plural: false,
        other: false,
        span: { start: pos, end: r.pos },
        rule: 'noun.target-card-exiled-with-self',
      },
      pos: r.pos,
    };
  },
});

export const LOREHOLD_G2_NOUN_RULES = [
  NOUN_TARGET_NONMATCHING_GRAVEYARD_CARD,
  NOUN_TARGET_CARD_EXILED_WITH_SELF,
];
