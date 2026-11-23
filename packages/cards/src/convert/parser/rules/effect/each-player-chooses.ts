/**
 * The Aetherdrift energy deck (issue 105, Druid of Purification): "starting with you, each player may choose an artifact or enchantment you don't control" and "destroy each permanent chosen
 * this way" (CR 101.4: the players choose in turn order starting with the controller; CR 608.2d: the choice is made as the effect resolves; CR 701.8: destroy). The first sentence is the
 * choice, the second what is done to the permanents chosen; the lowering of the sentences joins the two into the engine's `eachPlayerChoosesDestroy`.
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule } from '../registry';
import { type Clauses, makeClause, single } from './operands';

export const EFFECT_EACH_PLAYER_MAY_CHOOSE = defineRule<Clauses>({
  id: 'effect.each-player-may-choose',
  family: 'effect',
  leading: ['starting'],
  cites: ['CR 101.4 (Handling Simultaneous Actions)', 'CR 608.2d (Resolving Spells and Abilities)'],
  examples: [
    "starting with you, each player may choose an artifact or enchantment you don't control",
    "starting with you, each player may choose an artifact you don't control",
  ],
  rejects: [
    "each player may choose an artifact or enchantment you don't control",
    "starting with you, each player chooses an artifact or enchantment you don't control",
    "starting with you, each opponent may choose an artifact or enchantment you don't control",
    "starting with target opponent, each player may choose an artifact you don't control",
    'starting with you, each player may choose an artifact or enchantment',
    "starting with you, each player may choose two artifacts you don't control",
    "starting with you, each player may choose an artifact you don't control and draw a card",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.each-player-may-choose';
    const r = sequence(
      literal('starting with you, each player may choose '),
      pattern(
        /an? (artifact|creature|enchantment|land|permanent)(?: or (artifact|creature|enchantment|land))? you don['’]t control(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, m] = r.value;
    const kinds = [m[1], m[2]]
      .filter((k): k is string => k !== undefined)
      .map((k) => k.toLowerCase());
    const span = { start: pos, end: r.pos };
    const named = kinds.filter((k) => k !== 'permanent');
    const members: IrFilter[] = named.map((k) => ({ types: [k], raw: k }));
    const what: IrNoun = {
      kind: 'noun',
      det: 'a',
      // "you don't control" is the permanents of the controller's opponents (CR 102.2), read from the controller of the effect.
      filter: {
        controller: 'opponent',
        raw: m[0],
        ...(named.length === 1 ? { types: named } : {}),
        ...(members.length > 1 ? { anyOf: members } : {}),
      },
      upTo: false,
      plural: false,
      other: false,
      span,
      rule: id,
    };
    return {
      ok: true,
      value: [makeClause(id, 'eachPlayerMayChoose', { what }, span)],
      pos: r.pos,
    };
  },
});

export const EFFECT_DESTROY_CHOSEN_THIS_WAY = defineRule<Clauses>({
  id: 'effect.destroy-chosen-this-way',
  family: 'effect',
  leading: ['destroy'],
  cites: ['CR 701.8 (Destroy)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: ['destroy each permanent chosen this way'],
  rejects: [
    'destroy each permanent chosen',
    'destroy each creature chosen this way',
    'destroy target permanent chosen this way',
    'destroy each permanent chosen this way and draw a card',
    'destroys each permanent chosen this way',
  ],
  parse: single(
    'effect.destroy-chosen-this-way',
    pattern(/destroy each permanent chosen this way(?![\p{L}\p{N}])/iu),
    () => ({ verb: 'destroyChosenThisWay', args: {} }),
  ),
});

export const EACH_PLAYER_CHOOSES_RULES = [
  EFFECT_EACH_PLAYER_MAY_CHOOSE,
  EFFECT_DESTROY_CHOSEN_THIS_WAY,
];
