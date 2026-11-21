/**
 * Lowerings of the Federation Fleet deck, group F (exile, time counters, the command zone and a free cast): "Until your next turn, creatures can't attack you", "Put your commander into your
 * hand from the command zone", "For each of them, you may reselect which player or permanent that creature is attacking" and Cmdr. Troi's free cast. Same contract as effects.ts: each
 * declares the engine features it needs and is checked before it runs.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, eachObject, failure } from './clauses';
import { lowerFilter, playerSelectorOf } from './nouns';
import type { Lowering } from './types';

/**
 * "Until your next turn, creatures can't attack you." (CR 508.1a, 611.2a, 611.2c, 500.1): the engine's `creaturesCantAttackYou` of all creatures. The group is read when attackers are
 * declared, so the filter names no zone.
 */
const CREATURES_CANT_ATTACK_YOU: Lowering<IrClause, Effects> = {
  head: 'creaturesCantAttackYou',
  id: 'lower.creatures-cant-attack-you',
  needs: ['effect:creaturesCantAttackYou', 'duration:untilYourNextTurn'],
  takesDuration: true,
  lower(clause) {
    const objects = arg(clause, 'objects');
    if (objects?.kind !== 'noun' || objects.det !== 'each') return failure(clause);
    if (clause.duration?.scope !== 'untilYourNextTurn') return failure(clause);
    const { zone, ...rest } = objects.filter;
    void zone;
    const creatures = lowerFilter({ ...objects, filter: rest });
    if (!creatures.ok) return creatures;
    const effect: Effect = {
      kind: 'creaturesCantAttackYou',
      creatures: creatures.value,
      duration: 'untilYourNextTurn',
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/**
 * "Put your commander into your hand from the command zone." (CR 903.3, 608.2d): the engine's `moveToZone` of a `choose` among the commanders the controller owns in their command zone, to
 * their hand (not optional: with one candidate the engine chooses, with none nothing happens).
 */
const PUT_COMMANDER_TO_HAND: Lowering<IrClause, Effects> = {
  head: 'putCommanderToHand',
  id: 'lower.put-commander-to-hand',
  needs: ['effect:moveToZone', 'selector:choose', 'ability:chooseFromCommandZone'],
  lower(clause) {
    const named = arg(clause, 'objects');
    if (named?.kind !== 'noun' || named.filter.commander !== 'yours') return failure(clause);
    const move: Effect = {
      kind: 'moveToZone',
      objects: {
        kind: 'choose',
        filter: { zone: 'command', controller: 'you', commander: 'yours' },
      },
      to: 'hand',
    };
    return { ok: true, value: [move], rule: clause.rule };
  },
};

/**
 * "For each of them, you may reselect which player or permanent that creature is attacking." (CR 508.7, 608.2c): the engine's `reselectAttack` of the targets the sentence before chose, which
 * asks the controller of the effect for each of them. Only the targets of that sentence: a slot of several targets.
 */
const RESELECT_ATTACK_OF_THEM: Lowering<IrClause, Effects> = {
  head: 'reselectAttackOfThem',
  id: 'lower.reselect-attack-of-them',
  needs: ['effect:reselectAttack', 'selector:target', 'selector:attacking'],
  lower(clause, ctx) {
    const lowered = eachObject(clause, ctx, (objects) => ({ kind: 'reselectAttack', objects }));
    if (!lowered.ok) return lowered;
    const [only, ...more] = lowered.value;
    if (only === undefined || more.length > 0) return failure(clause);
    if (only.kind !== 'reselectAttack' || only.objects.kind !== 'target') return failure(clause);
    return lowered;
  },
};

/**
 * "Target opponent whose turn it is may cast a spell from their hand without paying its mana cost. If they do, you copy that spell. You may choose new targets for the copy. If they
 * don't, you draw a card." (CR 608.2g, 118.9, 608.2c, 707.10, 707.10c): the engine's `castFree` by the target (a spell of their own hand, remembered as `moved`), then a `conditional` on a
 * spell having been cast whose effect is the `copySpell` of it with new targets allowed and whose otherwise is the controller's draw.
 */
const OPPONENT_CASTS_FREE_YOU_COPY: Lowering<IrClause, Effects> = {
  head: 'opponentCastsFreeYouCopy',
  id: 'lower.opponent-casts-free-you-copy',
  needs: [
    'effect:castFree',
    'effect:conditional',
    'condition:didPrevious',
    'effect:copySpell',
    'effect:draw',
    'selector:moved',
    'selector:choose',
  ],
  lower(clause, ctx) {
    const who = arg(clause, 'who');
    if (who?.kind !== 'noun' || who.filter.player !== 'opponentWhoseTurn') return failure(clause);
    const player = playerSelectorOf(who, ctx);
    if (!player.ok) return player;
    const effects: Effects = [
      {
        kind: 'castFree',
        objects: { kind: 'choose', filter: { zone: 'hand' } },
        player: player.value,
        remember: true,
      },
      {
        kind: 'conditional',
        condition: { kind: 'didPrevious' },
        effect: { kind: 'copySpell', spell: { kind: 'moved' }, newTargets: 'may' },
        else: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ];
    return { ok: true, value: effects, rule: clause.rule };
  },
};

export const FEDERATION_F_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  CREATURES_CANT_ATTACK_YOU,
  PUT_COMMANDER_TO_HAND,
  RESELECT_ATTACK_OF_THEM,
  OPPONENT_CASTS_FREE_YOU_COPY,
];
