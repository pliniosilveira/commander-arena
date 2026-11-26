/**
 * Lowerings of the cards where each opponent makes a named choice (Seize the Spotlight; CR 101.4, 608.2d): the choice, what is done for each player who chose a word, and the sentences that
 * read the creatures taken. Each is the engine's node for one template (`rules/effect/player-choices.ts`).
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import type { FeatureRef } from './features';
import type { Lowering } from './types';

const YOU = { kind: 'you' } as const;

/** The name the creatures taken "for each player who chose ..." are remembered under, which "those creatures" of the next sentence reads. */
const TAKEN_ID = 'choiceTaken';

/** "Each opponent chooses fame or fortune." (CR 101.4, 608.2d). */
export const EACH_PLAYER_CHOOSES: Lowering<IrClause, Effects> = {
  head: 'eachPlayerChooses',
  id: 'lower.each-player-chooses',
  needs: ['effect:eachPlayerChooses'],
  lower(clause) {
    const options = arg(clause, 'options');
    const who = arg(clause, 'who');
    if (
      options?.kind !== 'choiceKind' ||
      options.what !== 'option' ||
      options.options === undefined ||
      who?.kind !== 'name'
    ) {
      return failure(clause);
    }
    const effect: Effect = {
      kind: 'eachPlayerChooses',
      players: { kind: who.name === 'opponent' ? 'eachOpponent' : 'eachPlayer' },
      options: options.options,
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/** "For each player who chose fame, gain control of a creature that player controls until end of turn." (CR 101.4, 608.2d, 613.1b, 611.2). */
export const GAIN_CONTROL_PER_CHOOSER: Lowering<IrClause, Effects> = {
  head: 'gainControlPerChooser',
  id: 'lower.gain-control-per-chooser',
  needs: ['effect:chooseObjects', 'effect:gainControl', 'duration:untilEndOfTurn'],
  lower(clause) {
    const option = arg(clause, 'option');
    if (option?.kind !== 'name') return failure(clause);
    const effects: Effect[] = [
      {
        kind: 'chooseObjects',
        id: TAKEN_ID,
        filter: { zone: 'battlefield', types: ['creature'] },
        count: 1,
        exactly: true,
        perChoice: option.name,
      },
      {
        kind: 'gainControl',
        objects: { kind: 'chosen', id: TAKEN_ID },
        duration: 'untilEndOfTurn',
      },
    ];
    return { ok: true, value: effects, rule: clause.rule };
  },
};

/** "Untap those creatures and they gain haste until end of turn." (CR 701.26a, 702.10, 611.2). */
export const UNTAP_CHOSEN_GAIN_HASTE: Lowering<IrClause, Effects> = {
  head: 'untapChosenGainHaste',
  id: 'lower.untap-chosen-gain-haste',
  needs: ['effect:untap', 'effect:grantKeyword', 'duration:untilEndOfTurn'],
  lower(clause) {
    const taken = { kind: 'chosen', id: TAKEN_ID } as const;
    const effects: Effect[] = [
      { kind: 'untap', objects: taken },
      {
        kind: 'grantKeyword',
        objects: taken,
        keyword: { kind: 'haste' },
        duration: 'untilEndOfTurn',
      },
    ];
    return { ok: true, value: effects, rule: clause.rule };
  },
};

/** "For each player who chose fortune, you draw a card and create a Treasure token." (CR 101.4, 608.2c, 121.1, 111.10a). */
export const PER_CHOOSER_DRAW_TREASURE: Lowering<IrClause, Effects> = {
  head: 'perChooserDrawTreasure',
  id: 'lower.per-chooser-draw-treasure',
  needs: [
    'effect:repeat',
    'effect:draw',
    'effect:createToken',
    'amount:playerCount',
    'selector:eachPlayerWhoChose',
  ],
  lower(clause) {
    const option = arg(clause, 'option');
    if (option?.kind !== 'name') return failure(clause);
    const effect: Effect = {
      kind: 'repeat',
      times: {
        kind: 'playerCount',
        of: { kind: 'eachPlayerWhoChose', option: option.name },
      },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: YOU, count: 1 },
          { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 1 },
        ],
      },
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

export const PLAYER_CHOICES_NEEDS: readonly FeatureRef[] = [
  'effect:eachPlayerChooses',
  'effect:chooseObjects',
  'effect:gainControl',
  'effect:untap',
  'effect:grantKeyword',
  'effect:repeat',
  'effect:draw',
  'effect:createToken',
  'amount:playerCount',
  'selector:eachPlayerWhoChose',
  'duration:untilEndOfTurn',
];

export const PLAYER_CHOICES_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EACH_PLAYER_CHOOSES,
  GAIN_CONTROL_PER_CHOOSER,
  UNTAP_CHOSEN_GAIN_HASTE,
  PER_CHOOSER_DRAW_TREASURE,
];
