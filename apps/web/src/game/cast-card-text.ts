/**
 * Words for casting a target card from a graveyard as an effect resolves (D-350, CR 608.2g): "You may cast target instant or sorcery card from a graveyard, and mana of
 * any type can be spent to cast that spell. If that spell would be put into a graveyard, exile it instead". Read from the AST of the ability on the stack
 * (`StackAbility.effect`), never from a card's name or Oracle text. Pure functions, tested in `test/cast-card-text.test.ts`.
 */
import type {
  Effect,
  GameEvent,
  GameState,
  ObjectId,
  SeatId,
  StackAbility,
} from '@commander-arena/engine';

export type CastCardEffect = Extract<Effect, { kind: 'castCard' }>;

/** The riders the effect puts on the spell, as a sentence tail: ", and mana of any type can be spent to cast that spell. If that spell would be put into a graveyard, exile it instead". */
export function castCardRiders(effect: CastCardEffect): string {
  const any =
    effect.anyManaType === true ? ', and mana of any type can be spent to cast that spell' : '';
  const exile =
    effect.exileInstead === true
      ? '. If that spell would be put into a graveyard, exile it instead'
      : '';
  return `${any}${exile}`;
}

/** "You may cast target instant or sorcery card from a graveyard, and mana of any type can be spent to cast that spell. If that spell would be put into a graveyard, exile it instead". */
export function castCardText(effect: CastCardEffect, what: string): string {
  return `You may cast ${what}${castCardRiders(effect)}`;
}

/** The `castCard` effect inside an ability, found through the wrappers that keep the effect whole (a sequence, a "you may"). Null when there is none. */
export function castCardOf(effect: Effect | undefined): CastCardEffect | null {
  if (effect === undefined) return null;
  switch (effect.kind) {
    case 'castCard':
      return effect;
    case 'sequence':
      for (const e of effect.effects) {
        const found = castCardOf(e);
        if (found !== null) return found;
      }
      return null;
    case 'may':
      return castCardOf(effect.effect);
    default:
      return null;
  }
}

/** The question: "Cast Name from a graveyard, paying its mana cost? Any mana can be spent on it. If it would go to a graveyard, it is exiled instead." */
export function castCardPrompt(name: string, effect: CastCardEffect | null): string {
  const any = effect?.anyManaType === true ? ' Mana of any type can be spent on it.' : '';
  const exile =
    effect?.exileInstead === true
      ? ' If it would be put into a graveyard, it is exiled instead.'
      : '';
  return `Cast ${name} from a graveyard, paying its mana cost?${any}${exile}`;
}

/** The ability on the stack that asked, as its `castCard` effect. */
export function castCardOfAbility(ability: StackAbility | undefined): CastCardEffect | null {
  return ability === undefined ? null : castCardOf(ability.effect);
}

const who = (seat: SeatId, viewer: SeatId): string => (seat === viewer ? 'You' : 'Opponent');

/** The log line for the answer to the question of `castCard`; null for any other answer. The card is in a public graveyard. */
export function castCardAnswerLine(
  before: GameState,
  event: Extract<GameEvent, { kind: 'optionalAnswered' }>,
  viewer: SeatId,
): {
  readonly text: string;
  readonly seat: SeatId;
  readonly objects: readonly ObjectId[];
  readonly rule: string;
} | null {
  const asked = before.pending;
  if (asked?.kind !== 'confirmOptional' || asked.purpose !== 'castCard') return null;
  if (asked.source !== event.source) return null;
  const obj = asked.subject === undefined ? undefined : before.objects[asked.subject];
  const card = obj?.card === null || obj?.card === undefined ? undefined : before.cards[obj.card];
  const name =
    (card === undefined ? undefined : before.definitions[card.definition]?.name) ?? 'a card';
  const you = event.seat === viewer;
  const subject = who(event.seat, viewer);
  return {
    text: event.accepted
      ? `${subject} choose${you ? '' : 's'} to cast ${name} from a graveyard.`
      : `${subject} ${you ? "don't" : "doesn't"} cast ${name}; it stays in the graveyard.`,
    seat: event.seat,
    objects: asked.subject === undefined ? [] : [asked.subject],
    rule: 'CR 608.2g',
  };
}
