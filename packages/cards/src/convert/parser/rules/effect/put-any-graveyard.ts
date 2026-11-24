/**
 * Effect rule of the Hosts of Mordor deck (Extract from Darkness): "you put a creature card from a graveyard onto the battlefield under your control" (CR 404.1 graveyard, 608.2d, 110.2a). Not a
 * target: the controller chooses any card of the kind in any player's graveyard as the instruction runs (a card the effect before it put there counts, CR 608.2c). The engine's `moveToZone`
 * of a `choose` selector that reads every graveyard (`fromAnyGraveyard`).
 */
import { literal, pattern, quiet, satisfy, sequence } from '../../combinators';
import type { IrFlag, IrNoun, IrZoneSpec } from '../../ir/types';
import { graveyardPhrase } from '../noun/phrases';
import { defineRule, spanned } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.put-any-graveyard';

export const EFFECT_PUT_ANY_GRAVEYARD = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['you'],
  cites: [
    'CR 404.1 (Graveyard)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 110.2a (Permanents)',
  ],
  examples: [
    'you put a creature card from a graveyard onto the battlefield under your control',
    'you put a permanent card from a graveyard onto the battlefield under your control',
  ],
  rejects: [
    'you put a creature card from your graveyard onto the battlefield under your control',
    'you put a creature card from an opponent’s graveyard onto the battlefield under your control',
    'you put two creature cards from a graveyard onto the battlefield under your control',
    'you put a creature card from a graveyard onto the battlefield',
    'you put a creature card from a graveyard onto the battlefield under its owner’s control',
    'you put a creature card from a graveyard into your hand',
    'you put target creature card from a graveyard onto the battlefield under your control',
    'you may put a creature card from a graveyard onto the battlefield under your control',
  ],
  parse: single(
    ID,
    (ctx, pos) => {
      // Quiet: a line that starts "You put ..." and is something else stops where it always did.
      const head = quiet(
        sequence(
          literal('you put '),
          spanned(
            sequence(
              pattern(/an? /iu),
              satisfy(
                graveyardPhrase(false, 'from'),
                (filter) => filter.controller === undefined && filter.zone === 'graveyard',
              ),
            ),
          ),
          spanned(literal(' onto the battlefield under your control')),
        ),
      )(ctx, pos);
      if (!head.ok) return head;
      const [, card, placed] = head.value;
      const [, filter] = card.value;
      const objects: IrNoun = {
        kind: 'noun',
        det: 'a',
        filter: { ...filter, card: true },
        upTo: false,
        plural: false,
        other: false,
        span: card.span,
        rule: ID,
      };
      const to: IrZoneSpec = {
        kind: 'zoneSpec',
        zone: 'battlefield',
        whose: 'you',
        span: placed.span,
        rule: ID,
      };
      const flag = (value: boolean): IrFlag => ({
        kind: 'flag',
        value,
        span: { start: pos, end: pos },
        rule: ID,
      });
      return { ok: true, value: { objects, to, may: flag(false), any: flag(true) }, pos: head.pos };
    },
    ({ objects, to, may, any }) => ({
      verb: 'putFromZone',
      args: { objects, to, may, everyGraveyard: any },
    }),
  ),
});

export const PUT_ANY_GRAVEYARD_RULES = [EFFECT_PUT_ANY_GRAVEYARD];
