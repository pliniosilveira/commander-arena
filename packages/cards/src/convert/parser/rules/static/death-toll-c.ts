/**
 * Static rules of the Death Toll deck, group C (Grist, the Hunger Tide): the card is a creature of its own off the battlefield.
 */
import { pattern } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `static.creature-off-battlefield`: "As long as ~ isn't on the battlefield, it's a 1/1 Insect creature in addition to its other types." (CR 604.3: a characteristic-defining ability
 * works in every zone; CR 613.1d, 613.4a: the type in layer 4, the power and toughness in layer 7a). The card itself (`~`), a power and toughness of two numbers, one creature type, and
 * "in addition to its other types". The engine's `creatureOffBattlefield`. Not read: another subject ("it" for the card is the tilde), another zone, a condition, "isn't a creature".
 */
export const STATIC_CREATURE_OFF_BATTLEFIELD = defineRule<IrStatic>({
  id: 'static.creature-off-battlefield',
  family: 'static',
  leading: ['as'],
  cites: [
    'CR 604.3 (Handling Static Abilities)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.4a (Interaction of Continuous Effects)',
  ],
  examples: [
    "As long as ~ isn't on the battlefield, it's a 1/1 Insect creature in addition to its other types.",
    'As long as ~ isn’t on the battlefield, it’s a 2/2 Elf creature in addition to its other types.',
  ],
  rejects: [
    "As long as ~ isn't on the battlefield, it's a 1/1 Insect creature in addition to its other types",
    "As long as ~ isn't on the battlefield, it's a 1/1 Insect creature.",
    "As long as ~ isn't on the battlefield, it's a 1/1 creature in addition to its other types.",
    "As long as ~ isn't on the battlefield, it's an Insect creature in addition to its other types.",
    "As long as ~ isn't on the battlefield, it's a 1/1 Insect Bat creature in addition to its other types.",
    "As long as ~ isn't in your graveyard, it's a 1/1 Insect creature in addition to its other types.",
    "As long as ~ is on the battlefield, it's a 1/1 Insect creature in addition to its other types.",
    "As long as you control ~, it's a 1/1 Insect creature in addition to its other types.",
    "As long as ~ isn't on the battlefield, it's a 1/1 insect creature in addition to its other types.",
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /[Aa]s long as ~ isn['’]t on the battlefield, it['’]s a (\d+)\/(\d+) (\p{Lu}[\p{L}]*) creature in addition to its other types\./u,
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const subject: IrNoun = {
      kind: 'noun',
      det: 'self',
      filter: { raw: '~' },
      upTo: false,
      plural: false,
      other: false,
      span,
      rule: 'static.creature-off-battlefield',
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [
          {
            kind: 'creatureOffBattlefield',
            power: Number(r.value[1]),
            toughness: Number(r.value[2]),
            subtypes: [r.value[3] ?? ''],
          },
        ],
        span,
        rule: 'static.creature-off-battlefield',
      },
      pos: r.pos,
    };
  },
});

export const DEATH_TOLL_C_STATIC_RULES = [STATIC_CREATURE_OFF_BATTLEFIELD];
