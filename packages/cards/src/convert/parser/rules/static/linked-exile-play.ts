/**
 * Static rule of Evendo Brushrazer: "During your turn, as long as you've sacrificed a nontoken permanent this turn, you may play cards exiled with ~." (CR 607.2a: linked abilities, CR 601.2a,
 * 305.1: playing a card, CR 604.1: static abilities).
 */
import { literal, sequence } from '../../combinators';
import type { IrCondition, IrNoun, IrStatic } from '../../ir/types';
import { defineRule, family } from '../registry';

/**
 * `static.play-linked-exile`: "During your turn, as long as <condition>, you may play cards exiled with ~." (CR 607.2a, 601.2a, 305.1): while it is the controller's turn and the condition holds,
 * the controller may play the cards the permanent exiled with its linked ability. The engine's `playFromLinkedExile` with the condition of the turn and the one of the words (`and`), read
 * where the card is played. The condition is one the grammar reads after "as long as" (a read of the turn log, which no layer changes). Not read: a missing "During your turn", another
 * turn, a card with no condition, "cast" for "play", a card exiled with another permanent ("exiled with target creature"), "a card" for "cards", a missing comma or period, any other
 * word after "play".
 */
export const STATIC_PLAY_LINKED_EXILE = defineRule<IrStatic>({
  id: 'static.play-linked-exile',
  family: 'static',
  leading: ['during'],
  cites: [
    'CR 607.2a (Linked Abilities)',
    'CR 601.2a (Casting Spells)',
    'CR 305.1 (Lands)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    "During your turn, as long as you've sacrificed a nontoken permanent this turn, you may play cards exiled with ~.",
    'During your turn, as long as you have sacrificed a creature this turn, you may play cards exiled with ~.',
  ],
  rejects: [
    "During your turn, as long as you've sacrificed a nontoken permanent this turn, you may play cards exiled with ~",
    "During your turn, as long as you've sacrificed a nontoken permanent this turn, you may cast cards exiled with ~.",
    "During your turn, as long as you've sacrificed a nontoken permanent this turn, you may play a card exiled with ~.",
    "During your turn, as long as you've sacrificed a nontoken permanent this turn, you may play cards exiled with target creature.",
    "During an opponent's turn, as long as you've sacrificed a nontoken permanent this turn, you may play cards exiled with ~.",
    "During your turn as long as you've sacrificed a nontoken permanent this turn, you may play cards exiled with ~.",
    "As long as you've sacrificed a nontoken permanent this turn, you may play cards exiled with ~.",
    'During your turn, you may play cards exiled with ~.',
    "During your turn, as long as you've sacrificed a nontoken permanent this turn you may play cards exiled with ~.",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('during your turn, as long as '),
      family<IrCondition>('condition', { only: ['condition.sacrificed-this-turn'] }),
      literal(', you may play cards exiled with ~.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, condition] = r.value;
    const span = { start: pos, end: r.pos };
    const subject: IrNoun = {
      kind: 'noun',
      det: 'you',
      filter: { raw: 'you' },
      upTo: false,
      plural: false,
      other: false,
      span,
      rule: 'static.play-linked-exile',
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [{ kind: 'linkedExilePlay' }],
        // "During your turn" and the condition after "as long as": both must hold.
        condition: {
          kind: 'condition',
          test: {
            kind: 'and',
            terms: [
              {
                kind: 'condition',
                test: { kind: 'yourTurn' },
                span: { start: pos, end: pos + 'during your turn'.length },
                rule: 'static.play-linked-exile',
              },
              condition,
            ],
          },
          span,
          rule: 'static.play-linked-exile',
        },
        span,
        rule: 'static.play-linked-exile',
      },
      pos: r.pos,
    };
  },
});

/**
 * `static.play-linked-exile-lands-and-spells`: "During your turn, if an opponent lost life this turn, you may play lands and cast spells from among cards exiled with ~." (Theater of Horrors;
 * CR 607.2a, 601.2a, 305.1, 604.1): the same permission as `static.play-linked-exile`, worded as the two actions that playing a card is (a land as a land play, a spell cast), under "During
 * your turn" and an "if" condition read where the card is played. Not read: a missing "During your turn", "as long as" for "if", "cast spells" alone, "play cards", a card exiled with another
 * permanent, a missing comma or period, any condition but the one of a player's life lost this turn.
 */
export const STATIC_PLAY_LINKED_EXILE_LANDS_AND_SPELLS = defineRule<IrStatic>({
  id: 'static.play-linked-exile-lands-and-spells',
  family: 'static',
  leading: ['during'],
  cites: [
    'CR 607.2a (Linked Abilities)',
    'CR 601.2a (Casting Spells)',
    'CR 305.1 (Lands)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    'During your turn, if an opponent lost life this turn, you may play lands and cast spells from among cards exiled with ~.',
    'During your turn, if a player lost life this turn, you may play lands and cast spells from among cards exiled with ~.',
  ],
  rejects: [
    'During your turn, if an opponent lost life this turn, you may play lands and cast spells from among cards exiled with ~',
    'During your turn, if an opponent lost life this turn, you may cast spells from among cards exiled with ~.',
    'During your turn, if an opponent lost life this turn, you may play cards exiled with ~.',
    'During your turn, if an opponent lost life this turn, you may play lands and cast spells from among cards exiled with target creature.',
    'During your turn, as long as an opponent lost life this turn, you may play lands and cast spells from among cards exiled with ~.',
    'If an opponent lost life this turn, you may play lands and cast spells from among cards exiled with ~.',
    'During your turn, if an opponent lost life this turn you may play lands and cast spells from among cards exiled with ~.',
    "During an opponent's turn, if an opponent lost life this turn, you may play lands and cast spells from among cards exiled with ~.",
    "During your turn, if you've sacrificed a creature this turn, you may play lands and cast spells from among cards exiled with ~.",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('during your turn, if '),
      family<IrCondition>('condition', { only: ['condition.a-player-lost-life-this-turn'] }),
      literal(', you may play lands and cast spells from among cards exiled with ~.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, condition] = r.value;
    const span = { start: pos, end: r.pos };
    const id = 'static.play-linked-exile-lands-and-spells';
    const subject: IrNoun = {
      kind: 'noun',
      det: 'you',
      filter: { raw: 'you' },
      upTo: false,
      plural: false,
      other: false,
      span,
      rule: id,
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [{ kind: 'linkedExilePlay' }],
        condition: {
          kind: 'condition',
          test: {
            kind: 'and',
            terms: [
              {
                kind: 'condition',
                test: { kind: 'yourTurn' },
                span: { start: pos, end: pos + 'during your turn'.length },
                rule: id,
              },
              condition,
            ],
          },
          span,
          rule: id,
        },
        span,
        rule: id,
      },
      pos: r.pos,
    };
  },
});

export const LINKED_EXILE_PLAY_STATIC_RULES = [
  STATIC_PLAY_LINKED_EXILE,
  STATIC_PLAY_LINKED_EXILE_LANDS_AND_SPELLS,
];
