/**
 * Static abilities of stage P31 (D-139, D-140): a permission to cast spells at instant speed ("You may cast artifact spells as though
 * they had flash.", CR 601.3b) and the characteristics a permanent takes from the card its linked ability exiled (CR 607.2a: "As long
 * as a card exiled with ~ is a creature card, ~ has the power, toughness, and creature types of the last creature card exiled with
 * it."). Each is one whole line.
 */
import { fail, literal, optional, pattern, quiet, satisfy, sequence } from '../../combinators';
import type { IrCondition, IrFilter, IrNoun, IrStatic, Span } from '../../ir/types';
import { CARD_TYPES, spellPhrase, typeWords } from '../noun/phrases';
import { SUBTYPE_WORD_NUMBERED } from '../noun/subtypes';
import { defineRule, family } from '../registry';
import { unit } from './grants';

function subjectNoun(det: IrNoun['det'], raw: string, span: Span, rule: string): IrNoun {
  return {
    kind: 'noun',
    det,
    filter: { raw },
    upTo: false,
    plural: false,
    other: false,
    span,
    rule,
  };
}

/**
 * `static.cast-as-though-flash`: "You may cast artifact spells as though they had flash.", "You may cast creature spells as though they
 * had flash.", "You may cast spells as though they had flash." (stage P31, D-140, CR 601.3b: an effect may let a player cast a spell at a
 * time they could not; CR 702.8a: flash lets a spell be cast any time its controller could cast an instant). The permission is the
 * controller's and names the spells as they are cast; it gives them no keyword.
 */
export const STATIC_CAST_AS_THOUGH_FLASH = defineRule<IrStatic>({
  id: 'static.cast-as-though-flash',
  family: 'static',
  leading: ['you'],
  cites: ['CR 601.3b (Casting Spells)', 'CR 702.8a (Flash)'],
  examples: [
    'You may cast artifact spells as though they had flash.',
    'You may cast creature spells as though they had flash.',
    'You may cast spells as though they had flash.',
    'You may cast green creature spells as though they had flash.',
  ],
  rejects: [
    'You may cast artifact spells as though they had flash',
    'You may cast artifact spells as though they had haste.',
    'You may cast artifact spells this turn as though they had flash.',
    'You may cast artifact spells from your graveyard as though they had flash.',
    'Each player may cast artifact spells as though they had flash.',
    'You may cast artifact spell as though it had flash.',
  ],
  parse: (ctx, pos) => {
    // Quiet: "You may cast this card from your hand ..." stops where it always did.
    const r = quiet(
      sequence(literal('you may cast '), spellPhrase(true), literal(' as though they had flash.')),
    )(ctx, pos);
    if (!r.ok) return r;
    const id = 'static.cast-as-though-flash';
    const spells: IrFilter = r.value[1];
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: subjectNoun('you', 'you', { start: pos, end: pos + 3 }, id),
        effects: [{ kind: 'castAsThoughFlash', spells }],
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

/**
 * `static.linked-exile`: "As long as a card exiled with ~ is a creature card, ~ has the power, toughness, and creature types of the last
 * creature card exiled with it. It's still a Shapeshifter." (stage P31, D-140, CR 607.2a: "exiled with ~" names the cards its linked
 * ability exiled; CR 613.4b, 613.1d: the power and toughness and the creature types are taken in their layers; CR 205.1a). The card type
 * is said twice and must be the same; "It's still a <type>." keeps a creature type of the table.
 */
export const STATIC_LINKED_EXILE = defineRule<IrStatic>({
  id: 'static.linked-exile',
  family: 'static',
  leading: ['as'],
  cites: [
    'CR 607.2a (Linked Abilities)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 205.1a (Type Line)',
  ],
  examples: [
    "As long as a card exiled with ~ is a creature card, ~ has the power, toughness, and creature types of the last creature card exiled with it. It's still a Shapeshifter.",
    'As long as a card exiled with ~ is a creature card, ~ has the power, toughness, and creature types of the last creature card exiled with it.',
  ],
  rejects: [
    "As long as a card exiled with ~ is a creature card, ~ has the power, toughness, and creature types of the last creature card exiled with it. It's still a Banana.",
    'As long as a card exiled with ~ is a creature card, ~ has the power, toughness, and creature types of the last artifact card exiled with it.',
    'As long as a card exiled with ~ is a creature card, ~ has the power and toughness of the last creature card exiled with it.',
    'As long as a card exiled with ~ is a creature card, ~ has the power, toughness, and creature types of the first creature card exiled with it.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('as long as a card exiled with ~ is a'),
      pattern(/n? /iu),
      typeWords(CARD_TYPES, false),
      literal(' card, ~ has the power, toughness, and creature types of the last '),
      typeWords(CARD_TYPES, false),
      literal(' card exiled with it.'),
      optional(
        sequence(
          literal(" it's still "),
          pattern(/an? /iu),
          satisfy(SUBTYPE_WORD_NUMBERED, (w) => w.plural !== true),
          literal('.'),
        ),
        null,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, , first, , second, , still] = r.value;
    if (first.join(' ') !== second.join(' ')) return fail(ctx, pos);
    const id = 'static.linked-exile';
    const at = ctx.text.indexOf('~', pos);
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: subjectNoun('self', '~', { start: at, end: at + 1 }, id),
        effects: [
          {
            kind: 'takeFromLinkedExile',
            from: { types: first, raw: first.join(' ') },
            alsoSubtypes: still === null ? [] : [still[2].subtype],
          },
        ],
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

/**
 * `static.attached-unless-monarch`: "Enchanted creature doesn't untap during its controller's untap step unless that player is the
 * monarch." (stage P31, D-140, CR 502.3: the untap step of the creature's controller; CR 725.1: the monarch is a designation of a
 * player). "That player" is the controller of the enchanted creature; the restriction applies while that player is not the monarch.
 */
export const STATIC_ATTACHED_UNLESS_MONARCH = defineRule<IrStatic>({
  id: 'static.attached-unless-monarch',
  family: 'static',
  leading: ['enchanted', 'equipped'],
  cites: ['CR 502.3 (Untap Step)', 'CR 725.1 (The Monarch)', 'CR 611.3a (Continuous Effects)'],
  examples: [
    "Enchanted creature doesn't untap during its controller's untap step unless that player is the monarch.",
  ],
  rejects: [
    "Enchanted creature doesn't untap during its controller's untap step unless that player is the monarch",
    "Enchanted creature doesn't untap during its controller's untap step unless you're the monarch.",
    "Enchanted creature can't block unless that player is the monarch.",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      unit(['noun.attached-permanent'], 'attached'),
      pattern(/ unless that player is the monarch\./iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [{ noun, effects }, words] = r.value;
    // "That player" is the controller of the untap step the restriction names: the restriction must be that one, alone.
    const [only, ...more] = effects;
    if (more.length > 0 || only?.kind !== 'restriction' || only.restriction !== 'doesntUntap') {
      return fail(ctx, pos);
    }
    const id = 'static.attached-unless-monarch';
    const span = { start: r.pos - words[0].length + 1, end: r.pos - 1 };
    const controller: IrNoun = {
      kind: 'noun',
      det: 'controllerOf',
      filter: { raw: 'that player' },
      upTo: false,
      plural: false,
      other: false,
      of: noun,
      span,
      rule: id,
    };
    const monarch: IrCondition = {
      kind: 'condition',
      test: { kind: 'designation', who: controller, designation: 'monarch' },
      span,
      rule: id,
    };
    const condition: IrCondition = {
      kind: 'condition',
      test: { kind: 'not', term: monarch },
      span,
      rule: id,
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: noun,
        effects,
        condition,
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

/**
 * `static.cast-self-as-though-flash`: "You may cast this spell as though it had flash if it targets a commander." (Danitha deck, D-1253; CR 601.3b, 601.3d,
 * 113.6d). The spell's own permission, with a condition that is about its targets: the engine's `castAsThoughFlash` on `this` with a `spellTargets` condition. The
 * subject is `~` ("this spell" after normalization). Not read: another condition ("if you control a Dragon" has no rule yet), the permission of another card, a
 * line that does not end in a period.
 */
export const STATIC_CAST_SELF_AS_THOUGH_FLASH = defineRule<IrStatic>({
  id: 'static.cast-self-as-though-flash',
  family: 'static',
  leading: ['you'],
  cites: [
    'CR 601.3b (Casting Spells)',
    'CR 601.3d (Casting Spells)',
    'CR 113.6d (Abilities That Function in Zones Other Than the Battlefield)',
    'CR 702.8a (Flash)',
  ],
  examples: [
    'You may cast ~ as though it had flash if it targets a commander.',
    'You may cast ~ as though it had flash if it targets a creature.',
    'You may cast ~ as though it had flash if it targets a creature commander.',
  ],
  rejects: [
    'You may cast ~ as though it had flash if it targets a commander',
    'You may cast ~ as though it had flash.',
    'You may cast ~ as though it had flash if it targets commanders.',
    'You may cast ~ as though it had flash if it targets a player.',
    'You may cast ~ as though it had flash if you control a Dragon.',
    'You may cast ~ as though it had haste if it targets a commander.',
    'You may cast ~ from your graveyard as though it had flash if it targets a commander.',
    'You may cast artifact spells as though they had flash if they target a commander.',
  ],
  parse: (ctx, pos) => {
    const head = quiet(literal('you may cast ~ as though it had flash'))(ctx, pos);
    if (!head.ok) return head;
    const cond = sequence(
      literal(' if '),
      family<IrCondition>('condition', { only: ['condition.it-targets'] }),
      literal('.'),
    )(ctx, head.pos);
    if (!cond.ok) return cond;
    const id = 'static.cast-self-as-though-flash';
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: subjectNoun('self', '~', { start: pos + 13, end: pos + 14 }, id),
        effects: [{ kind: 'castAsThoughFlash', spells: { raw: '~' } }],
        condition: cond.value[1],
        span: { start: pos, end: cond.pos },
        rule: id,
      },
      pos: cond.pos,
    };
  },
});

export const ARTIFACT_STATIC_RULES = [
  STATIC_CAST_AS_THOUGH_FLASH,
  STATIC_CAST_SELF_AS_THOUGH_FLASH,
  STATIC_LINKED_EXILE,
  STATIC_ATTACHED_UNLESS_MONARCH,
];
