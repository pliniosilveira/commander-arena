/**
 * Validation of the choice a permanent makes as it enters and of what reads it (D-100): "As this enters,
 * choose a creature type / a color" (`asEntersChoose`, CR 614.12, 614.12a) and the references to "the
 * chosen type" and "the chosen color" (`chosenType`, `chosenColor`, a static `setTypes`). The two kinds of
 * ability are linked (CR 607.2d): a reference reads only a choice made by the same object's own ability,
 * so a card (or token definition) that refers to a choice must ask for it, and ask at most one question as
 * it enters. This file only imports types, so `validate-parts.ts` can call it.
 */
import type { Ability } from './types';
import type { AstIssue } from './validate-base';

type Choice = 'creatureType' | 'color' | 'option' | 'cardType';

/**
 * Every choice the value refers to: an object with `chosenType: true` refers to the creature type, one with
 * `chosenColor: true` to the color. A custom token's definition is its own owner (the token has its own
 * abilities, checked on their own), so the scan does not go into it.
 */
function referencedChoices(value: unknown, found: Set<Choice>): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const v of value) referencedChoices(v, found);
    return;
  }
  const o = value as Record<string, unknown>;
  if (o.chosenType === true) found.add('creatureType');
  if (o.chosenColor === true) found.add('color');
  // D-149: "Add one mana of the chosen color" reads the same choice.
  if (o.kind === 'chosenColor') found.add('color');
  // D-1170: "protection from the chosen card type", on a keyword or a player's protection, reads the card type the permanent chose.
  if (o.from === 'chosenCardType') found.add('cardType');
  // D-151: "Khans — ..." reads the option the permanent chose.
  if (o.kind === 'chosenOption') found.add('option');
  for (const [key, v] of Object.entries(o)) {
    if (key === 'definition' && o.kind === 'custom') continue;
    referencedChoices(v, found);
  }
}

/** Every option name a `chosenOption` condition inside the value refers to (D-151). */
function referencedOptionNames(value: unknown, found: Set<string>): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const v of value) referencedOptionNames(v, found);
    return;
  }
  const o = value as Record<string, unknown>;
  if (o.kind === 'chosenOption' && typeof o.option === 'string') found.add(o.option);
  for (const [key, v] of Object.entries(o)) {
    if (key === 'definition' && o.kind === 'custom') continue;
    referencedOptionNames(v, found);
  }
}

/**
 * The checks of one object's abilities: it asks at most one question as it enters, only a permanent asks
 * one, and every choice that `abilities` and `others` (spell text, costs) refer to is one it asks.
 * `path` is where the abilities are (`faces[0]`), `isPermanent` whether the object is a permanent.
 */
export function chosenIssues(
  abilities: readonly Ability[],
  others: readonly unknown[],
  path: string,
  isPermanent: boolean,
  out: AstIssue[],
): void {
  if (!Array.isArray(abilities)) return;
  const asked: Choice[] = [];
  let questions = 0;
  for (const a of abilities) {
    // CR 702.155b (D-151): a Saga with read ahead chooses its first chapter as it enters: one more question.
    if (a?.kind === 'keyword' && a.keyword?.kind === 'readAhead') questions += 1;
    if (a?.kind !== 'replacement') continue;
    if (a.replacement?.kind === 'asEntersChoose') {
      questions += 1;
      if (
        a.replacement.what === 'creatureType' ||
        a.replacement.what === 'color' ||
        a.replacement.what === 'option' ||
        a.replacement.what === 'cardType'
      ) {
        asked.push(a.replacement.what);
      }
      // D-151: "choose Khans or Dragons": at least two different names, and only that kind of choice has them.
      const named = a.replacement.options;
      if (a.replacement.what === 'option') {
        if (
          !Array.isArray(named) ||
          named.length < 2 ||
          named.some((n) => typeof n !== 'string' || n === '') ||
          new Set(named).size !== named.length
        ) {
          out.push({
            path: `${path}.abilities`,
            message: 'a choice among options names at least two different options',
          });
        }
      } else if (named !== undefined) {
        out.push({
          path: `${path}.abilities`,
          message: 'only a choice among options (what: "option") lists options',
        });
      }
    } else if (
      a.replacement?.kind === 'entersTappedUnlessPays' ||
      a.replacement?.kind === 'entersTappedUnlessReveals' ||
      a.replacement?.kind === 'entersAsCopy'
    ) {
      questions += 1;
    }
  }
  if (questions > 1) {
    out.push({
      path: `${path}.abilities`,
      message:
        'at most one ability may ask a question as the permanent enters (a choice, or paying life to enter untapped)',
    });
  }
  if (asked.length > 0 && !isPermanent) {
    out.push({
      path: `${path}.abilities`,
      message: 'only a permanent can ask "As this enters, choose ..." (CR 614.12)',
    });
  }
  const used = new Set<Choice>();
  referencedChoices(abilities, used);
  referencedChoices(others, used);
  // D-151: a `chosenOption` names one of the options the permanent chooses among.
  const names = new Set<string>();
  referencedOptionNames(abilities, names);
  referencedOptionNames(others, names);
  const offered = abilities.flatMap((a) =>
    a?.kind === 'replacement' &&
    a.replacement?.kind === 'asEntersChoose' &&
    a.replacement.what === 'option'
      ? (a.replacement.options ?? [])
      : [],
  );
  for (const name of names) {
    if (asked.includes('option') && !offered.includes(name)) {
      out.push({
        path,
        message: `it refers to the option "${name}", which it does not offer as it enters (CR 607.2d)`,
      });
    }
  }
  for (const choice of used) {
    if (!asked.includes(choice)) {
      out.push({
        path,
        message:
          choice === 'creatureType'
            ? 'it refers to the chosen creature type but does not choose one as it enters (CR 607.2d)'
            : choice === 'cardType'
              ? 'it refers to the chosen card type but does not choose one as it enters (CR 607.2d)'
              : choice === 'option'
                ? 'it refers to the chosen option but does not choose one as it enters (CR 607.2d)'
                : 'it refers to the chosen color but does not choose one as it enters (CR 607.2d)',
      });
    }
  }
}
