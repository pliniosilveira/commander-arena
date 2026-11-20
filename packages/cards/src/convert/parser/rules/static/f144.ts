/**
 * Static ability rule of deck support issue 144 (Conspicuous Snoop): the permanent has the activated abilities of the card on top of its controller's library (CR 613.1f, 401.5).
 */
import { choice, literal, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { CARD_TYPES, typeWords } from '../noun/phrases';
import { SUBTYPE_WORD_NUMBERED } from '../noun/subtypes';
import { defineRule, quietly } from '../registry';

/**
 * `static.top-card-abilities`: "As long as the top card of your library is a Goblin card, ~ has all activated abilities of that card." (CR 613.1f: the abilities are given in layer 6;
 * CR 401.5: the top card of a library is a card in a library, which is known only through other abilities; CR 113.6: the ability of the permanent works as long as it is on the
 * battlefield). The card is a creature type ("a Goblin card") or a card type ("a creature card"). The engine's `grantActivatedAbilitiesOfTopCard`; the words "as long as" are the
 * ability itself, not a condition. Not read: another library ("an opponent's"), another number of cards, triggered or all abilities ("has all abilities of that card"), another subject
 * than `~`, "that card's" for the top card, a second condition.
 */
export const STATIC_TOP_CARD_ABILITIES = defineRule<IrStatic>({
  id: 'static.top-card-abilities',
  family: 'static',
  leading: ['as'],
  cites: [
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 401.5 (Library)',
    'CR 113.6 (Abilities)',
    'CR 602.1 (Activating Activated Abilities)',
  ],
  examples: [
    'As long as the top card of your library is a Goblin card, ~ has all activated abilities of that card.',
    'As long as the top card of your library is a creature card, ~ has all activated abilities of that card.',
    'As long as the top card of your library is an Elf card, ~ has all activated abilities of that card.',
  ],
  rejects: [
    "As long as the top card of an opponent's library is a Goblin card, ~ has all activated abilities of that card.",
    'As long as the top card of your library is a Goblin card, ~ has all abilities of that card.',
    'As long as the top card of your library is a Goblin card, ~ has all triggered abilities of that card.',
    'As long as the top card of your library is a Goblin card, ~ has all activated abilities of that card',
    'As long as the top card of your library is a Goblin card, target creature has all activated abilities of that card.',
    'As long as the top card of your library is a Goblin card, ~ has all activated abilities of that card and flying.',
    'As long as the top card of your library is a Goblin, ~ has all activated abilities of that card.',
    'As long as the top two cards of your library are Goblin cards, ~ has all activated abilities of that card.',
    'As long as the top card of your library is a Goblin card, ~ has the activated abilities of that card.',
    'As long as the top card of your graveyard is a Goblin card, ~ has all activated abilities of that card.',
  ],
  parse: (ctx, pos) => {
    const id = 'static.top-card-abilities';
    const tail = literal(' card, ~ has all activated abilities of that card.');
    // A card type ("a creature card") or a creature type ("a Goblin card").
    const kind = choice(
      map(sequence(typeWords(CARD_TYPES, false), tail), ([types]) => ({
        types,
        subtypes: [] as string[],
      })),
      map(
        sequence(
          satisfy(SUBTYPE_WORD_NUMBERED, (w) => w.plural !== true),
          tail,
        ),
        ([w]) => ({ types: [] as string[], subtypes: [w.subtype] }),
      ),
    );
    const r = sequence(
      literal('as long as the top card of your library is '),
      pattern(/an? /iu),
      kind,
    )(ctx, pos);
    if (!r.ok) return r;
    const { types, subtypes } = r.value[2];
    const at = ctx.text.indexOf('~', pos);
    const subject: IrNoun = {
      kind: 'noun',
      det: 'self',
      filter: { raw: '~' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: at, end: at + 1 },
      rule: id,
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [
          {
            kind: 'grantActivatedAbilitiesOfTopCard',
            card: {
              ...(types.length > 0 ? { types } : {}),
              ...(subtypes.length > 0 ? { subtypes } : {}),
              raw: 'card',
            },
          },
        ],
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

export const F144_STATIC_RULES = [STATIC_TOP_CARD_ABILITIES].map(quietly);
