/**
 * Validation of the choice a permanent makes as it enters and of what reads it (D-100): "As this enters,
 * choose a creature type / a color" (`asEntersChoose`, CR 614.12, 614.12a) and the references to "the
 * chosen type" and "the chosen color" (`chosenType`, `chosenColor`, a static `setTypes`). Entry-time
 * choices are linked (CR 607.2d): a reference reads only a choice made by the same object's own ability.
 * A resolving creature-type choice instead belongs to that spell's effect sequence (D-566). This file
 * only imports types, so `validate-parts.ts` can call it.
 */
import type { Ability } from './types';
import type { AstIssue } from './validate-base';

type Choice = 'creatureType' | 'color' | 'option' | 'cardType' | 'lifePaid';

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
  if (o.notChosenType === true) found.add('creatureType');
  if (o.chosenColor === true) found.add('color');
  // D-149: "Add one mana of the chosen color" reads the same choice.
  if (o.kind === 'chosenColor') found.add('color');
  // Issue 144 (Throne of Eldraine): "monocolored spells of that color" and "Spend only mana of the chosen color" read the same choice.
  if (o.monocoloredChosen === true || o.onlyChosenColor === true) found.add('color');
  // D-376: "protection from the chosen card type", on a keyword or a player's protection, reads the card type the permanent chose.
  if (o.from === 'chosenCardType') found.add('cardType');
  // D-652: "protection from the chosen color" reads the color the permanent chose.
  if (o.from === 'chosenColor') found.add('color');
  // D-151: "Khans — ..." reads the option the permanent chose.
  if (o.kind === 'chosenOption') found.add('option');
  // CR 119.4: "the life paid as it entered" reads the amount the permanent paid.
  if (o.kind === 'lifePaidAsEntered') found.add('lifePaid');
  for (const [key, v] of Object.entries(o)) {
    if (key === 'definition' && o.kind === 'custom') continue;
    referencedChoices(v, found);
  }
}

function asksCreatureTypeWhileResolving(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(asksCreatureTypeWhileResolving);
  const o = value as Record<string, unknown>;
  if (o.kind === 'chooseCreatureType') return true;
  return Object.entries(o).some(
    ([key, child]) => key !== 'definition' && asksCreatureTypeWhileResolving(child),
  );
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
  // D-208: "you may reveal a Dragon card" and "choose a color" are two questions a land asks one after the other (the reveal first); any other pair is refused.
  let reveals = 0;
  let choices = 0;
  for (const a of abilities) {
    // CR 702.155b (D-151): a Saga with read ahead chooses its first chapter as it enters: one more question.
    if (a?.kind === 'keyword' && a.keyword?.kind === 'readAhead') questions += 1;
    if (a?.kind !== 'replacement') continue;
    if (a.replacement?.kind === 'asEntersChoose') {
      questions += 1;
      choices += 1;
      if (
        a.replacement.what === 'creatureType' ||
        a.replacement.what === 'color' ||
        a.replacement.what === 'option' ||
        a.replacement.what === 'cardType' ||
        a.replacement.what === 'lifePaid'
      ) {
        asked.push(a.replacement.what);
      }
      // Issue 184: "choose a color other than blue": the excluded color is a color, and only a choice of a color has one.
      const except = (a.replacement as { except?: unknown }).except;
      if (
        except !== undefined &&
        (a.replacement.what !== 'color' || !['W', 'U', 'B', 'R', 'G'].includes(except as string))
      ) {
        out.push({
          path: `${path}.abilities`,
          message: 'only a choice of a color has a color it leaves out, and it is one of the five',
        });
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
    } else if (a.replacement?.kind === 'entersTappedUnlessReveals') {
      questions += 1;
      reveals += 1;
    } else if (
      a.replacement?.kind === 'entersTappedUnlessPays' ||
      a.replacement?.kind === 'entersAsCopy'
    ) {
      questions += 1;
    }
  }
  const revealWithChoice = questions === 2 && reveals === 1 && choices === 1;
  if (questions > 1 && !revealWithChoice) {
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
  const resolutionTypeChoice = asksCreatureTypeWhileResolving(others);
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
    if (!asked.includes(choice) && !(choice === 'creatureType' && resolutionTypeChoice)) {
      out.push({
        path,
        message:
          choice === 'creatureType'
            ? 'it refers to the chosen creature type but does not choose one as it enters (CR 607.2d)'
            : choice === 'lifePaid'
              ? 'it refers to the life paid as it entered but does not pay any as it enters (CR 614.12)'
              : choice === 'cardType'
                ? 'it refers to the chosen card type but does not choose one as it enters (CR 607.2d)'
                : choice === 'option'
                  ? 'it refers to the chosen option but does not choose one as it enters (CR 607.2d)'
                  : 'it refers to the chosen color but does not choose one as it enters (CR 607.2d)',
      });
    }
  }
}
