/**
 * Lowerings of group C of the Counter Blitz deck (Saga creatures, modal and choice text). Same contract as effects.ts: each declares the engine features it needs and is checked before it runs.
 */
import type { CardType, ChooseSelector, Cost, Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { lowerCost } from './costs';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

/**
 * "Until your next turn, creatures can't attack you unless their controller pays {2} for each of those creatures." (Summon: Yojimbo, CR 508.1d, 508.1h, 611.2c): the engine's
 * `creaturesCantAttackYou` of all creatures with a `tax`. The group is read when attackers are declared, so the filter names no zone.
 */
const CREATURES_CANT_ATTACK_YOU_UNLESS_PAY: Lowering<IrClause, Effects> = {
  head: 'creaturesCantAttackYouUnlessPay',
  id: 'lower.creatures-cant-attack-you-unless-pay',
  needs: [
    'effect:creaturesCantAttackYou',
    'duration:untilYourNextTurn',
    'ability:attackTaxUntil',
    'cost:mana',
  ],
  takesDuration: true,
  lower(clause) {
    const objects = arg(clause, 'objects');
    const costs = arg(clause, 'cost');
    if (objects?.kind !== 'noun' || objects.det !== 'each' || costs?.kind !== 'costList') {
      return failure(clause);
    }
    if (clause.duration?.scope !== 'untilYourNextTurn') return failure(clause);
    const { zone, ...rest } = objects.filter;
    void zone;
    const creatures = lowerFilter({ ...objects, filter: rest });
    if (!creatures.ok) return creatures;
    const tax: Cost[] = [];
    for (const item of costs.costs) {
      const lowered = lowerCost(item);
      if (!lowered.ok) return lowered;
      tax.push(lowered.value);
    }
    const effect: Effect = {
      kind: 'creaturesCantAttackYou',
      creatures: creatures.value,
      duration: 'untilYourNextTurn',
      tax,
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/**
 * "Each opponent chooses a creature with the greatest mana value among creatures they control. Return those creatures to their owners' hands." (Summon: Valefor, CR 608.2d, 101.4): the engine's
 * `moveToZone` to the hand of a `choose` of battlefield permanents, `player` each opponent, with `greatest` or `least` of the stat when the choice names one.
 */
const EACH_OPPONENT_CHOOSES_RETURN: Lowering<IrClause, Effects> = {
  head: 'eachOpponentChoosesReturn',
  id: 'lower.each-opponent-chooses-return',
  needs: [
    'effect:moveToZone',
    'selector:choose',
    'selector:eachOpponent',
    'ability:moveChoosePlayers',
  ],
  lower(clause) {
    const what = arg(clause, 'what');
    const extreme = arg(clause, 'extreme');
    const stat = arg(clause, 'stat');
    if (what?.kind !== 'name') return failure(clause);
    if ((extreme === undefined) !== (stat === undefined)) return failure(clause);
    let ranked: Pick<ChooseSelector, 'greatest' | 'least'> = {};
    if (extreme?.kind === 'name' && stat?.kind === 'name') {
      const key = stat.name === 'mana value' ? 'manaValue' : stat.name;
      if (key !== 'power' && key !== 'toughness' && key !== 'manaValue') return failure(clause);
      ranked = extreme.name === 'greatest' ? { greatest: key } : { least: key };
    }
    const choose: ChooseSelector = {
      kind: 'choose',
      filter: {
        zone: 'battlefield',
        controller: 'you',
        ...(what.name === 'permanent' ? {} : { types: [what.name as CardType] }),
      },
      ...ranked,
    };
    const effect: Effect = {
      kind: 'moveToZone',
      objects: choose,
      to: 'hand',
      player: { kind: 'eachOpponent' },
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

export const COUNTER_BLITZ_C_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  CREATURES_CANT_ATTACK_YOU_UNLESS_PAY,
  EACH_OPPONENT_CHOOSES_RETURN,
];
