/**
 * The Aetherdrift energy deck (issue 105): "You may pay eight {E} rather than pay the mana cost for permanent spells you cast." (Nissa, Worldsoul Speaker; CR 118.9: an alternative cost, chosen
 * as the spell is cast, CR 107.14: energy is paid by removing counters, CR 613.1f: a static ability of a permanent gives it to spells). The engine's `grantEnergyAlternative`.
 */
import { pattern } from '../../combinators';
import type { IrStatic } from '../../ir/types';
import { defineRule } from '../registry';
import { staticOf, subjectNoun } from './angels-words';

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
