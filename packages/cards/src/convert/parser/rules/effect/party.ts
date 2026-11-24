/**
 * Effect rules of the party (CR 700.8): "each player chooses a party from among creatures they control, then sacrifices the rest" (Stick Together). The lowering is in
 * `lower/party.ts`.
 */
import { pattern } from '../../combinators';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.each-player-chooses-a-party-and-sacrifices-the-rest`: "each player chooses a party from among creatures they control, then sacrifices the rest" (CR 700.8d: for each of
 * Cleric, Rogue, Warrior and Wizard each player chooses up to one creature they control of that type; CR 701.21a, 101.4: the players choose in APNAP order and the rest are sacrificed
 * together). The engine's `chooseParty` of every player. Not read: a player other than "each player", another kind of permanent, "the others", more words after it.
 */
export const EFFECT_EACH_PLAYER_CHOOSES_A_PARTY = defineRule<Clauses>({
  id: 'effect.each-player-chooses-a-party-and-sacrifices-the-rest',
  family: 'effect',
  leading: ['each'],
  cites: ['CR 700.8d (General)', 'CR 701.21a (Sacrifice)', 'CR 101.4 (The Magic Golden Rules)'],
  examples: [
    'each player chooses a party from among creatures they control, then sacrifices the rest',
  ],
  rejects: [
    'each opponent chooses a party from among creatures they control, then sacrifices the rest',
    'each player chooses a party from among artifacts they control, then sacrifices the rest',
    'each player chooses a party from among creatures they control, then sacrifices the others',
    'each player chooses a party from among creatures they control, then discards the rest',
    'each player chooses a party from among creatures you control, then sacrifices the rest',
    'each player chooses a party from among creatures they control, then sacrifices the rest and draws a card',
    'each player chooses a party, then sacrifices the rest',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /each player chooses a party from among creatures they control, then sacrifices the rest(?![\p{L}\p{N}]| and )/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [
        makeClause(
          'effect.each-player-chooses-a-party-and-sacrifices-the-rest',
          'chooseParty',
          {},
          r.value.span,
        ),
      ],
      pos: r.pos,
    };
  },
});

export const PARTY_EFFECT_RULES = [EFFECT_EACH_PLAYER_CHOOSES_A_PARTY].map(quietly);
