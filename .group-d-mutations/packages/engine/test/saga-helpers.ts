/** Helpers shared by the Saga tests (CR 714). Cards are SYNTHETIC (src/cards/fixtures/synthetic-sagas.ts). */
import type { ObjectView } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';

export const RITE = 'SYNTHETIC Rite of Three'; // {2}{W} I: gain 1, II: gain 2, III: gain 4
export const ECHO = 'SYNTHETIC Echo Verse'; // {1}{U} "I, II": gain 1, III: gain 5
export const GOLEM = 'SYNTHETIC Rising Golem'; // {3}{R} I, II: gain 1, III: a 3/3 Golem token
export const TALE = 'SYNTHETIC Brief Tale'; // {W} I: gain 1, II: gain 2
export const SURGE = 'SYNTHETIC Lore Surge'; // {W} instant: a lore counter on target Saga
export const FLOOD = 'SYNTHETIC Lore Flood'; // {1}{W} instant: two lore counters on target Saga
export const BREAKER = 'SYNTHETIC Saga Breaker'; // {W} instant: destroy target Saga
export const FLICKER = 'SYNTHETIC Saga Flicker'; // {1}{U} instant: exile target Saga, return it

export const MIRROR = 'SYNTHETIC Saga Mirror'; // {2}{U} instant: a token copy of target Saga

export const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

/** Both players pass once: the top object of the stack resolves (CR 117.4). */
export function resolveTop(g: ScenarioGame): ScenarioGame {
  g.pass();
  return g.pass();
}

/** The view, from seat 0, of an object on the battlefield or the stack, by id. */
export function viewById(g: ScenarioGame, id: string): ObjectView {
  const v = g.view(0);
  const found = [...v.battlefield, ...v.stack].find((o) => o.id === id);
  if (found === undefined) throw new Error(`${id} is not on the battlefield or the stack`);
  return found;
}

/** The chapter numbers of the chapter abilities put on the stack so far, in order. */
export function chaptersTriggered(g: ScenarioGame): (number | undefined)[] {
  return g.events.flatMap((e) => (e.kind === 'abilityTriggered' ? [e.chapter] : []));
}
