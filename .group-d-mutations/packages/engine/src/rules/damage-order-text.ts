/**
 * The words of an effect that modifies a damage event, for the question that asks which to apply first (CR 616.1, D-191), built from what
 * the engine holds: "Prevent the next 3 damage that would be dealt to you this turn". The recipient is the one of the event (a shield
 * made for "each creature you control" is one effect for each creature, and a group of recipients is not listed in a question about one
 * of them). Nothing here reads hidden information.
 */
import type { PreventScope } from '../ast/types';
import type { ObjectId } from '../ids';
import type { DamageRecipient } from '../state/combat-types';
import type { GameState } from '../state/types';
import type { DamageModifier } from './damage-modifier';
import { derive } from './derive';
import { describeFilter } from './search-prompt';

const SCOPE_WORDS: Readonly<Record<PreventScope, string>> = {
  all: 'damage',
  combat: 'combat damage',
  noncombat: 'noncombat damage',
};

/** The name of a permanent as it is now, or as it last was. */
export function nameOf(state: GameState, id: ObjectId): string {
  const live = state.objects[id];
  if (live !== undefined) return derive(state, live).name;
  return state.lki[id]?.characteristics.name ?? 'a source';
}

/** "you" for the player the question is about, "Grizzly Bears" for a permanent. */
function recipientWords(state: GameState, to: DamageRecipient): string {
  return to.kind === 'player' ? 'you' : nameOf(state, to.id);
}

/** What the effect says, in the words of a card: for the shield, static ability or redirection `modifier` that applies to damage dealt to `to`. */
export function modifierText(
  state: GameState,
  modifier: DamageModifier,
  to: DamageRecipient,
): string {
  const { origin } = modifier;
  if (origin.kind === 'redirect') {
    // CR 614.9 (D-192): the same damage is dealt to the creature with the effect instead.
    return `Deal it to ${nameOf(state, origin.redirect.object)} instead`;
  }
  if (origin.kind === 'static') {
    const { prevention } = origin;
    return `Prevent all ${SCOPE_WORDS[prevention.scope]} that would be dealt to ${nameOf(state, prevention.object)}`;
  }
  const c = origin.shield.change;
  const amount = c.amount === 'all' ? 'all' : `the next ${c.amount}`;
  const where = c.recipients?.kind === 'any' ? '' : ` to ${recipientWords(state, to)}`;
  let by = '';
  if (c.sources !== undefined) {
    by = ` by ${c.sources.map((id) => nameOf(state, id)).join(' and ')}`;
  } else if (c.sourceFilter !== undefined) {
    const words = describeFilter(c.sourceFilter.filter);
    by = ` by ${words === '' ? 'a source' : `a ${words}`}`;
  }
  return `Prevent ${amount} ${SCOPE_WORDS[c.scope]} that would be dealt${where}${by} this turn`;
}
