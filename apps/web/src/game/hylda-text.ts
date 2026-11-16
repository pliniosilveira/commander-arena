/**
 * The words of group 2 of the Hylda deck (D-517 to D-525), as pure functions of the AST: "doesn't untap during its controller's next untap step", "creatures your opponents
 * control enter tapped", "all creatures target player controls". Nothing here reads a card's Oracle text: a wording that drifts from the AST fails the tests
 * (`apps/web/test/hylda-g2-text.test.ts`).
 */
import type { Effect } from '@commander-arena/engine';
import { thingsPhrase } from './filter-text';

/**
 * "Target creature doesn't untap during its controller's next untap step", "Those creatures don't untap during their controllers' next untap steps": the effect of a
 * `restrict` of `doesntUntap` until the next untap step (CR 502.3, 611.2a). `subject` is the objects as the words say them, `plural` whether they are several.
 */
export function keepTappedText(subject: string, plural: boolean): string {
  const head = `${subject.charAt(0).toUpperCase()}${subject.slice(1)}`;
  return plural
    ? `${head} don't untap during their controllers' next untap steps`
    : `${head} doesn't untap during its controller's next untap step`;
}

/** Whether the words of a group of objects say several of them ("each creature ..." is one at a time, but the group is untapped as one): a group, "up to two", "X". */
export function isSeveral(subject: string): boolean {
  return (
    /^(?:all |each |up to |x |two |three |those )/iu.test(subject) || /\bcreatures\b/u.test(subject)
  );
}

/**
 * "Until your next turn, creatures your opponents control enter tapped": the effect `permanentsEnterTapped`. Null for a group the words cannot say (never guessed).
 */
export function entersTappedText(
  effect: Extract<Effect, { kind: 'permanentsEnterTapped' }>,
): string | null {
  const group = thingsPhrase(effect.permanents, true)
    ?.replace(' on the battlefield', '')
    .replace(/ an opponent controls$/u, ' your opponents control');
  if (group === null || group === undefined) return null;
  const when = effect.duration === 'untilEndOfTurn' ? 'this turn' : 'until your next turn';
  return effect.duration === 'untilEndOfTurn'
    ? `${group.charAt(0).toUpperCase()}${group.slice(1)} enter tapped ${when}`
    : `Until your next turn, ${group} enter tapped`;
}

/**
 * "all creatures target player controls": the group of an `each` whose filter names the player chosen as a target (`controlledBy`), said from the filter without that field and
 * the words of the target. Null when the filter says more than the words know.
 */
export function groupOfTargetPlayerText(
  filter: Parameters<typeof thingsPhrase>[0],
  player: string,
): string | null {
  const { controlledBy: _player, ...rest } = filter;
  void _player;
  const group = thingsPhrase(rest, true)?.replace(' on the battlefield', '');
  return group === null || group === undefined ? null : `all ${group} ${player} controls`;
}
