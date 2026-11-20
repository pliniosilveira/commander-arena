/**
 * "Max speed — [ability]" (issue 144, CR 702.178a): a keyword label that "means 'As long as your speed is 4, this object has "[ability]"'". It is not an ability word (CR 207.2c): the
 * ability after the dash is read as written, and the label puts the condition `maxSpeed` (CR 702.179e) on it: as the `activateOnlyIf` of an activated or a mana ability, as the `condition` of
 * a static ability. Any other kind of ability (a triggered one, a keyword, a replacement) is not read with the label: the engine has no condition for it, and the line is refused as a whole.
 */
import type { Ability, Condition } from '@commander-arena/engine';

/** The label at the start of a line, with the em dash that follows it (CR 702.178a). */
const MAX_SPEED_LABEL = /^max speed — (?=\S)/i;

/** The line without its "Max speed — " label, or null when it has none. */
export function withoutMaxSpeedLabel(line: string): string | null {
  const m = MAX_SPEED_LABEL.exec(line);
  return m === null ? null : line.slice(m[0].length);
}

const MAX_SPEED: Condition = { kind: 'maxSpeed', player: { kind: 'you' } };

const both = (existing: Condition | undefined): Condition =>
  existing === undefined ? MAX_SPEED : { kind: 'and', terms: [existing, MAX_SPEED] };

/** The ability as long as the player's speed is 4, or null when no condition of the engine can say so for that kind of ability. */
function atMaxSpeed(ability: Ability): Ability | null {
  switch (ability.kind) {
    case 'mana':
    case 'activated':
      return { ...ability, activateOnlyIf: both(ability.activateOnlyIf) };
    case 'static':
      return { ...ability, condition: both(ability.condition) };
    default:
      return null;
  }
}

/** Every ability of a "Max speed — ..." line at max speed, or null when one of them cannot be. */
export function atMaxSpeedAll(abilities: readonly Ability[]): readonly Ability[] | null {
  const out: Ability[] = [];
  for (const ability of abilities) {
    const gated = atMaxSpeed(ability);
    if (gated === null) return null;
    out.push(gated);
  }
  return out;
}
