/**
 * Trigger rules of group 1 of the Prismari deck (issue 87, D-630, D-636): "you cast an instant or sorcery spell with mana value 5 or greater from your hand" (CR 601.2a, 601.2i), "one or
 * more creature tokens you control deal combat damage to a player" (CR 510.2, 603.2c) and "~ enters and whenever one or more creature tokens you control deal combat damage to a player"
 * (CR 603.2c, 603.6a: one ability that two events cause).
 */
import { fail, literal, type Parser, pattern, satisfy, sequence } from '../../combinators';
import type { IrNoun, IrTrigger } from '../../ir/types';
import { defineRule, family, quietly, spanned } from '../registry';
import { makeNoun } from './subjects';

const NOT_IN_WORD = '(?![\\p{L}\\p{N}])';

/**
 * `trigger.cast-from-hand`: "you cast an instant or sorcery spell with mana value 5 or greater from your hand" (CR 601.2a: the spell is cast from where the card was; CR 601.2i: the
 * ability triggers as the spell becomes cast). The spell `trigger.cast` reads, and "from your hand" (the engine's `castFromHand`). Not read: another zone, an opponent's hand,
 * another caster than you, "from your hand" with nothing before it.
 */
export const TRIGGER_CAST_FROM_HAND = defineRule<IrTrigger>({
  id: 'trigger.cast-from-hand',
  family: 'trigger',
  leading: ['you'],
  cites: [
    'CR 601.2a (Casting Spells)',
    'CR 601.2i (Casting Spells)',
    'CR 603.2 (Handling Triggered Abilities)',
  ],
  examples: [
    'you cast an instant or sorcery spell with mana value 5 or greater from your hand',
    'you cast a creature spell from your hand',
    'you cast a spell from your hand',
  ],
  rejects: [
    'you cast a spell from your graveyard',
    'you cast a spell from anywhere other than your hand',
    'you cast a spell',
    'you cast a spell from your hand or',
    "you cast a spell from an opponent's hand",
    'you cast a spell from a hand',
    'an opponent casts a spell from your hand',
    'a player casts a spell from your hand',
    'you cast from your hand',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      satisfy(
        family<IrTrigger>('trigger', { only: ['trigger.cast'] }),
        (t) => t.actor?.det === 'you',
      ),
      spanned(pattern(new RegExp(` from your hand${NOT_IN_WORD}`, 'iu'))),
    )(ctx, pos);
    if (!r.ok) return r;
    const [cast, tail] = r.value;
    const subject = cast.subject;
    if (subject === undefined) return fail(ctx, pos);
    const span = { start: pos, end: tail.span.end };
    return {
      ok: true,
      value: {
        ...cast,
        span,
        rule: 'trigger.cast-from-hand',
        subject: { ...subject, filter: { ...subject.filter, castFromHand: true } },
      },
      pos: r.pos,
    };
  },
});

/** The event of "one or more creature tokens you control deal combat damage to a player". */
function tokenDamageBatch(rule: string): Parser<IrTrigger> {
  return (ctx, pos) => {
    const r = sequence(
      spanned(pattern(new RegExp(`one or more creature tokens you control${NOT_IN_WORD}`, 'iu'))),
      spanned(pattern(new RegExp(` deal combat damage to a player${NOT_IN_WORD}`, 'iu'))),
    )(ctx, pos);
    if (!r.ok) return r;
    const [group, words] = r.value;
    const subject: IrNoun = {
      ...makeNoun(rule, group.span, 'a', {
        types: ['creature'],
        token: true,
        controller: 'you',
        raw: 'creature tokens you control',
      }),
      plural: true,
    };
    const said = 'a player';
    const recipient = makeNoun(
      rule,
      { start: words.span.end - said.length, end: words.span.end },
      'eachPlayer',
      { raw: said },
    );
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'combatDamageBatch',
        subject,
        damaged: 'player',
        recipient,
        args: {},
        span: { start: pos, end: r.pos },
        rule,
      } as IrTrigger,
      pos: r.pos,
    };
  };
}

/**
 * `trigger.token-combat-damage-batch`: "one or more creature tokens you control deal combat damage to a player" (CR 510.2: combat damage is dealt at once in a step; CR 603.2c: one trigger
 * for the whole event). The engine's `combatDamageBatch` of the creature tokens the controller controls. Not read: "to an opponent", a creature that is not a token, a number of them,
 * one creature ("deals"), another controller.
 */
export const TRIGGER_TOKEN_COMBAT_DAMAGE_BATCH = defineRule<IrTrigger>({
  id: 'trigger.token-combat-damage-batch',
  family: 'trigger',
  leading: ['one'],
  cites: [
    'CR 510.2 (Combat Damage Step)',
    'CR 603.2c (Handling Triggered Abilities)',
    'CR 120.2a (Damage)',
  ],
  examples: ['one or more creature tokens you control deal combat damage to a player'],
  rejects: [
    'one or more creature tokens you control deal combat damage to an opponent',
    'one or more creatures you control deal combat damage to a player',
    'two or more creature tokens you control deal combat damage to a player',
    'one or more creature tokens deal combat damage to a player',
    'one or more creature tokens you control deals combat damage to a player',
    'one or more creature tokens an opponent controls deal combat damage to a player',
    'one or more creature tokens you control deal damage to a player',
    'one or more creature tokens you control deal combat damage to a creature',
  ],
  parse: tokenDamageBatch('trigger.token-combat-damage-batch'),
});

/**
 * `trigger.enters-and-token-damage`: "~ enters and whenever one or more creature tokens you control deal combat damage to a player" (CR 603.2c, 603.6a): one ability that two events cause,
 * each by its own words ("When ~ enters and whenever ..."). It lowers to one engine ability for each event, sharing the effect, as `trigger.enters-and-cast` does. The second event is
 * `trigger.token-combat-damage-batch` as the card writes it.
 */
export const TRIGGER_ENTERS_AND_TOKEN_DAMAGE = quietly(
  defineRule<IrTrigger>({
    id: 'trigger.enters-and-token-damage',
    family: 'trigger',
    leading: ['~'],
    cites: [
      'CR 603.2c (Handling Triggered Abilities)',
      'CR 603.6a (Handling Triggered Abilities)',
      'CR 510.2 (Combat Damage Step)',
    ],
    examples: [
      '~ enters and whenever one or more creature tokens you control deal combat damage to a player',
    ],
    rejects: [
      '~ enters and whenever one or more creature tokens you control deal combat damage to an opponent',
      '~ enters and one or more creature tokens you control deal combat damage to a player',
      '~ enters, and whenever one or more creature tokens you control deal combat damage to a player',
      '~ enters or whenever one or more creature tokens you control deal combat damage to a player',
      '~ dies and whenever one or more creature tokens you control deal combat damage to a player',
      '~ enters and when one or more creature tokens you control deal combat damage to a player',
      '~ enters and whenever you cast a creature spell',
      'another creature enters and whenever one or more creature tokens you control deal combat damage to a player',
    ],
    parse: (ctx, pos) => {
      const r = sequence(
        satisfy(
          family<IrTrigger>('trigger', { only: ['trigger.enters'] }),
          (t) => t.subject?.det === 'self',
        ),
        literal(' and whenever '),
        family<IrTrigger>('trigger', { only: ['trigger.token-combat-damage-batch'] }),
      )(ctx, pos);
      if (!r.ok) return r;
      const [enters, , damage] = r.value;
      const span = { start: pos, end: r.pos };
      return {
        ok: true,
        value: { ...enters, span, rule: 'trigger.enters-and-token-damage', alternatives: [damage] },
        pos: r.pos,
      };
    },
  }),
);

export const PRISMARI_G1_TRIGGER_RULES = [
  TRIGGER_ENTERS_AND_TOKEN_DAMAGE,
  TRIGGER_CAST_FROM_HAND,
  TRIGGER_TOKEN_COMBAT_DAMAGE_BATCH,
];
