/**
 * Effect rule of group 5 of the Mind Flayarrrs deck (Extract from Darkness): "you put a creature card from a graveyard onto the battlefield under your control".
 */
import { literal, optional, pattern, sequence } from '../../combinators';
import type { IrFilter, IrFlag, IrNoun, IrZoneSpec } from '../../ir/types';
import { PERMANENT_TYPES, typeWords } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.put-chosen-graveyard-card';

/**
 * `effect.put-chosen-graveyard-card`: "(you) put a creature card from a graveyard onto the battlefield under your control" (CR 608.2d: the player chooses the card as the instruction
 * runs, it is not a target; CR 404.1: the candidates are the cards of every player's graveyard; CR 110.2a: it enters under the control of the player who puts it). The engine's
 * `moveToZone` of a `choose` selector with `anyGraveyard`. Mandatory: "you may" is not read (a choice of none is another gap), and neither are a card that is a target, a graveyard
 * that is yours or an opponent's, several cards, a card put onto the battlefield tapped or with something on it, and words joined to the clause.
 */
export const EFFECT_PUT_CHOSEN_GRAVEYARD_CARD = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['put', 'you'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 404.1 (Graveyard)',
    'CR 110.2a (Permanents)',
  ],
  examples: [
    'you put a creature card from a graveyard onto the battlefield under your control',
    'put a creature card from a graveyard onto the battlefield under your control',
    'you put an artifact card from a graveyard onto the battlefield under your control',
    'you put an artifact creature card from a graveyard onto the battlefield under your control',
  ],
  rejects: [
    'you may put a creature card from a graveyard onto the battlefield under your control',
    'you put target creature card from a graveyard onto the battlefield under your control',
    'you put a creature card from your graveyard onto the battlefield under your control',
    "you put a creature card from an opponent's graveyard onto the battlefield under your control",
    'you put two creature cards from a graveyard onto the battlefield under your control',
    'you put a creature card from a graveyard onto the battlefield',
    "you put a creature card from a graveyard onto the battlefield under its owner's control",
    'you put a creature card from a graveyard onto the battlefield tapped under your control',
    'you put a creature card from a graveyard onto the battlefield under your control and draw a card',
    'you put an instant card from a graveyard onto the battlefield under your control',
    'you put a card from a graveyard onto the battlefield under your control',
    'you put a creature card from a graveyard into your hand',
  ],
  parse: single(
    ID,
    (ctx, pos) => {
      const r = sequence(
        optional(literal('you '), null),
        literal('put '),
        spanned(
          sequence(
            pattern(/an? /i),
            typeWords(PERMANENT_TYPES, false),
            literal(' card from a graveyard'),
          ),
        ),
        spanned(literal(' onto the battlefield under your control')),
        // Nothing joined to the clause: a join says a second instruction, which is not read.
        pattern(/(?=\.|$)/u),
      )(ctx, pos);
      if (!r.ok) return r;
      const [, , card, onto] = r.value;
      const [, types] = card.value;
      const filter: IrFilter = {
        zone: 'graveyard',
        types,
        controller: 'you',
        card: true,
        raw: ctx.text.slice(card.span.start, card.span.end),
      };
      const objects: IrNoun = {
        kind: 'noun',
        det: 'a',
        filter,
        upTo: false,
        plural: false,
        other: false,
        span: card.span,
        rule: ID,
      };
      const to: IrZoneSpec = {
        kind: 'zoneSpec',
        zone: 'battlefield',
        span: onto.span,
        rule: ID,
      };
      const flag = (value: boolean): IrFlag => ({
        kind: 'flag',
        value,
        span: { start: pos, end: pos },
        rule: ID,
      });
      return {
        ok: true,
        value: { objects, to, may: flag(false), anyGraveyard: flag(true) },
        pos: r.pos,
      };
    },
    ({ objects, to, may, anyGraveyard }) => ({
      verb: 'putFromZone',
      args: { objects, to, may, anyGraveyard },
    }),
  ),
});

export const PUT_ANY_GRAVEYARD_EFFECT_RULES = [EFFECT_PUT_CHOSEN_GRAVEYARD_CARD].map(quietly);
