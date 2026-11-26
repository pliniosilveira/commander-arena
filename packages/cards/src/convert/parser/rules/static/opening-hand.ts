/**
 * Static rules about the opening hand (the Leylines): a card that may begin the game on the battlefield.
 */
import { pattern } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `static.begin-game-on-battlefield`: "If this card is in your opening hand, you may begin the game with it on the battlefield." (CR 103.6: opening-hand actions, taken in turn order
 * from the starting player before the first turn). The card itself (`~`, written "this card"), nothing more in the sentence. The engine's `beginGameOnBattlefield`. Not read: another
 * subject, a condition ("and you're not the starting player"), another zone, a counter or a different wording of the permission.
 */
export const STATIC_BEGIN_GAME_ON_BATTLEFIELD = defineRule<IrStatic>({
  id: 'static.begin-game-on-battlefield',
  family: 'static',
  leading: ['if'],
  cites: ['CR 103.6 (Starting the Game)'],
  examples: [
    'If this card is in your opening hand, you may begin the game with it on the battlefield.',
    'If ~ is in your opening hand, you may begin the game with it on the battlefield.',
  ],
  rejects: [
    'If this card is in your opening hand, you may begin the game with it on the battlefield',
    'If this card is in your opening hand, you may begin the game with it on the battlefield with a luck counter on it.',
    'If this card is in your opening hand and you’re not the starting player, you may begin the game with it on the battlefield.',
    'If ~ is in your graveyard, you may begin the game with it on the battlefield.',
    'If this card is in your opening hand, you may begin the game with it in your graveyard.',
    'If this card is in your opening hand, begin the game with it on the battlefield.',
    'If a card is in your opening hand, you may begin the game with it on the battlefield.',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /If (?:this card|~) is in your opening hand, you may begin the game with it on the battlefield\./u,
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
      rule: 'static.begin-game-on-battlefield',
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [{ kind: 'beginGameOnBattlefield' }],
        span,
        rule: 'static.begin-game-on-battlefield',
      },
      pos: r.pos,
    };
  },
});
