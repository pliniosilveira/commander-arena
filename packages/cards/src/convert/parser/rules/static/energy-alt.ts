/**
 * The Aetherdrift energy deck (issue 105): "You may pay eight {E} rather than pay the mana cost for permanent spells you cast." (Nissa, Worldsoul Speaker; CR 118.9: an alternative cost, chosen
 * as the spell is cast, CR 107.14: energy is paid by removing counters, CR 613.1f: a static ability of a permanent gives it to spells). The engine's `grantEnergyAlternative`.
 */
import { pattern } from '../../combinators';
import type { IrStatic } from '../../ir/types';
import { defineRule } from '../registry';
import { staticOf, subjectNoun } from './angels-words';

export const STATIC_PAY_ZERO_ALT_COST_FROM_EXILE = defineRule<IrStatic>({
  id: 'static.pay-zero-alt-cost-creatures-from-exile',
  family: 'static',
  leading: ['once'],
  cites: [
    'CR 118.9 (Alternative Costs)',
    'CR 601.2a (Casting Spells)',
    'CR 601.2b (Casting Spells)',
    'CR 613.1f (Interaction of Continuous Effects)',
  ],
  examples: [
    'Once each turn, you may pay {0} rather than pay the mana cost for a creature spell you cast from exile.',
  ],
  rejects: [
    'Once each turn, you may pay {0} rather than pay the mana cost for a creature spell you cast from exile',
    'Once each turn, you may pay {1} rather than pay the mana cost for a creature spell you cast from exile.',
    'Once each turn, you may pay {0} rather than pay the mana cost for a creature spell you cast from your graveyard.',
    'Once each turn, you may pay {0} rather than pay the mana cost for a creature spell you cast.',
    'Once each turn, you may pay {0} rather than pay the mana cost for a spell you cast from exile.',
    'Once each turn, you may pay {0} rather than pay the mana cost for creature spells you cast from exile.',
    'You may pay {0} rather than pay the mana cost for a creature spell you cast from exile.',
    'Once each turn, you may pay {0} rather than pay the mana cost for a creature spell an opponent casts from exile.',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /once each turn, you may pay \{0\} rather than pay the mana cost for a creature spell you cast from exile\.(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const id = 'static.pay-zero-alt-cost-creatures-from-exile';
    return {
      ok: true,
      value: staticOf(
        id,
        subjectNoun('you', 'you', { start: pos, end: r.pos }, id),
        [
          {
            kind: 'energyAlternative',
            count: 0,
            fromExile: true,
            oncePerTurn: true,
            types: ['creature'],
          },
        ],
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});

export const STATIC_PAY_ENERGY_ALT_COST = defineRule<IrStatic>({
  id: 'static.pay-energy-alt-cost-permanents',
  family: 'static',
  leading: ['you'],
  cites: [
    'CR 118.9 (Alternative Costs)',
    'CR 107.14 (Energy)',
    'CR 601.2b (Casting Spells)',
    'CR 613.1f (Interaction of Continuous Effects)',
  ],
  examples: [
    'You may pay eight {E} rather than pay the mana cost for permanent spells you cast.',
    'You may pay {E}{E} rather than pay the mana cost for permanent spells you cast.',
  ],
  rejects: [
    'You may pay eight {E} rather than pay the mana cost for permanent spells you cast',
    'You may pay eight {E} rather than pay the mana cost for creature spells you cast.',
    'You may pay eight {E} rather than pay the mana cost for permanent spells your opponents cast.',
    'You may pay eight {E} rather than pay the mana cost for permanent spells you cast from your hand.',
    'You may pay 8 life rather than pay the mana cost for permanent spells you cast.',
    'You may pay {1}{E} rather than pay the mana cost for permanent spells you cast.',
    'If you control a Swamp, you may pay eight {E} rather than pay the mana cost for permanent spells you cast.',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /you may pay (?:(one|two|three|four|five|six|seven|eight|nine|ten) \{E\}|((?:\{E\}){1,10})) rather than pay the mana cost for permanent spells you cast\.(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const words = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    const count =
      r.value[1] !== undefined
        ? words.indexOf(r.value[1].toLowerCase()) + 1
        : (r.value[2] ?? '').length / 3;
    return {
      ok: true,
      value: staticOf(
        'static.pay-energy-alt-cost-permanents',
        subjectNoun(
          'you',
          'you',
          { start: pos, end: r.pos },
          'static.pay-energy-alt-cost-permanents',
        ),
        [{ kind: 'energyAlternative', count }],
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});
