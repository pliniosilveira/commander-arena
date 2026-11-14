import { choice, literal, map, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family, quietly, spanned } from '../registry';
import { type Clauses, makeClause, single } from './operands';

const TYPES = ['artifact', 'battle', 'creature', 'enchantment', 'land', 'planeswalker'];
const CARD = spanned(
  pattern(
    /(permanent|artifact|battle|creature|enchantment|land|planeswalker) card from your graveyard/iu,
  ),
);

function cardNoun(word: string, span: { start: number; end: number }, rule: string): IrNoun {
  return {
    kind: 'noun',
    det: 'a',
    upTo: false,
    plural: false,
    other: false,
    filter: {
      zone: 'graveyard',
      controller: 'you',
      card: true,
      raw: '',
      ...(word === 'permanent'
        ? { anyOf: TYPES.map((type) => ({ types: [type], raw: '' })) }
        : { types: [word] }),
    },
    span,
    rule,
  };
}

export const YOU_RETURN = defineRule<Clauses>({
  id: 'effect.you-return',
  family: 'effect',
  leading: ['you'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'you return a land card from your graveyard to your hand',
    'you return up to one target creature card from your graveyard to your hand',
  ],
  rejects: ['you return a land card from your graveyard to your library', 'you sacrifice a land'],
  parse: map(
    sequence(
      literal('you '),
      family<Clauses>('effect', { only: ['effect.return', 'effect.return-chosen-card'] }),
    ),
    ([, clauses]) => clauses.map((clause) => ({ ...clause, rule: 'effect.you-return' })),
  ),
});

export const SACRIFICED_RETURN_ANOTHER = defineRule<Clauses>({
  id: 'effect.sacrificed-return-another',
  family: 'effect',
  leading: ['if'],
  cites: [
    'CR 701.21 (Sacrifice)',
    'CR 400.7 (General)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'if you sacrificed a permanent this way, you may return another permanent card from your graveyard to your hand',
    'if you sacrificed a permanent this way, you may return another creature card from your graveyard to your hand',
  ],
  rejects: [
    'if an opponent sacrificed a permanent this way, you may return another permanent card from your graveyard to your hand',
    'if you sacrificed a creature this way, you may return another permanent card from your graveyard to your hand',
    'if you sacrificed a permanent this way, you may return another permanent card from a graveyard to your hand',
  ],
  parse: single(
    'effect.sacrificed-return-another',
    sequence(
      literal('if you sacrificed a permanent this way, you may return another '),
      CARD,
      literal(' to your hand'),
    ),
    ([, card]) => ({
      verb: 'sacrificedReturnAnother',
      args: {
        objects: cardNoun(
          (card.value[1] ?? '').toLowerCase(),
          card.span,
          'effect.sacrificed-return-another',
        ),
      },
    }),
  ),
});

export const LOSE_PLAYER_COUNTERS = defineRule<Clauses>({
  id: 'effect.lose-all-player-counters',
  family: 'effect',
  leading: ['each', 'target', 'you'],
  cites: ['CR 122.1 (Counters)'],
  examples: [
    'each opponent loses all counters',
    'target player loses all counters',
    'you lose all counters',
  ],
  rejects: ['each opponent loses all poison counters', 'each opponent loses two counters'],
  parse: (ctx, pos) => {
    const r = sequence(
      family<IrNoun>('noun', { only: ['noun.player'] }),
      choice(literal(' loses all counters'), literal(' lose all counters')),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      pos: r.pos,
      value: [
        makeClause(
          'effect.lose-all-player-counters',
          'removeAllPlayerCounters',
          { player: r.value[0] },
          { start: pos, end: r.pos },
        ),
      ],
    };
  },
});

export const GRAVEYARD_CHOICE_RULES = [
  YOU_RETURN,
  SACRIFICED_RETURN_ANOTHER,
  LOSE_PLAYER_COUNTERS,
].map(quietly);
