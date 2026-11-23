/**
 * What a stack object says: the words of a triggered or activated ability (what set it off and what it does), the
 * modes chosen and the targets. One place for the stack panel and for the preview panel, so the card on top of the
 * stack is explained the same way in both.
 */
import type { ObjectId, ObjectView, SeatId } from '@commander-arena/engine';
import { withAnnouncedX } from '../../game/amount-text';
import { copyAbilityWords } from '../../game/copy-text';
import { sharesText } from '../../game/dinosaurs-text';
import { delayedWording, dropYou, laterAbilityWords } from '../../game/later-text';
import { inherentWording, isInherentAbility } from '../../game/monarch-text';
import { triggerCondition, triggerGist } from '../decisions/ability-label';
import { chosenModesLine } from '../decisions/modes-picker';
import { targetLabel } from './objects';

export interface StackWording {
  readonly inherent: boolean;
  readonly triggered: boolean;
  readonly when: string | null;
  readonly gist: string;
  readonly does: string | null;
  readonly later: ReturnType<typeof laterAbilityWords>;
  readonly copies: ReturnType<typeof copyAbilityWords>;
  readonly monarchWords: string | null;
  readonly modes: string | null;
  readonly targets: readonly string[];
  readonly shares: string | null;
  /** Writes the X announced for the spell or ability where the text says X (issue 107). */
  readonly sayX: (text: string) => string;
}

export function stackWording(
  item: ObjectView,
  index: ReadonlyMap<ObjectId, ObjectView>,
  viewer: SeatId,
  activated: boolean,
  seatCount = 2,
): StackWording {
  const mine = item.controller === viewer;
  // The monarch's abilities (CR 725.2) have no source and no card: worded from the kind.
  const inherent = isInherentAbility(item);
  const triggered = item.abilitySource !== undefined || inherent;
  // What set a triggered ability off, and what it does: "At the beginning of combat on your turn,
  // you gain 1 life". A shape the words do not know shows nothing (the source's name is above).
  const source = item.abilitySource === undefined ? undefined : index.get(item.abilitySource);
  const monarchWords =
    inherent && item.ability !== undefined
      ? inherentWording(item.ability, item.controller === viewer)
      : null;
  // Suspend's and Madness's abilities are the engine's own (D-128): "Remove a time counter from Name."
  // A delayed trigger of an effect says "the next turn's upkeep" (CR 603.7).
  const later =
    inherent || item.ability === undefined
      ? null
      : laterAbilityWords(item.ability, item.name, mine);
  // Storm's and Replicate's triggers say what they copy (D-129).
  const copies =
    inherent || item.ability === undefined ? null : copyAbilityWords(item.ability, source);
  const delayed =
    inherent || item.ability === undefined ? null : delayedWording(item.ability, item.oracleText);
  const when = inherent
    ? null
    : (later?.when ??
      copies?.when ??
      delayed ??
      triggerCondition(item.ability, item.name, source ?? item));
  const words = item.ability === undefined || inherent ? '' : triggerGist(item.ability, source);
  const gist = later !== null || copies !== null ? '' : delayed !== null ? dropYou(words) : words;
  // An activated ability has no "when": its words are what it does, as Unearth's (D-124) would
  // otherwise show only the card's name.
  const does =
    later?.does ?? copies?.does ?? (when === null && activated && gist !== '' ? gist : null);
  // "Chosen: Destroy target artifact; Draw a card": the modes of a modal spell or ability (D-114).
  // Issue 107: the X announced for the spell or ability is written into the words that say X.
  const sayX = (text: string): string =>
    item.x === undefined ? text : withAnnouncedX(text, item.x);
  const modes = chosenModesLine(item);
  const targets = item.targets.map((t) => targetLabel(t, index, viewer, seatCount));
  // D-145 (CR 601.2d): a spell that divided damage shows each target with its share, "3 damage to Goblin, 2 damage to Elf".
  const shares = sharesText(item.targets, (t) => targetLabel(t, index, viewer, seatCount));
  return {
    inherent,
    triggered,
    when,
    gist,
    does,
    later,
    copies,
    monarchWords,
    modes,
    targets,
    shares,
    sayX,
  };
}
