/**
 * The opponent of a game started from the URL (`?autostart=...&ai=casual|normal`, D-164).
 * It is `casual` unless `ai` names another: the Playwright and unit tests were written against the
 * `CasualAgent`'s play, and only the menu and the import screen start the `HeuristicAgent`. A value
 * that names no agent is ignored; that includes `&ai=easy` of the removed Easy level (D-168), which
 * therefore plays as the default.
 */
import { type AiKind, isAiKind } from './protocol';

export function autostartAi(params: URLSearchParams): AiKind {
  const value = params.get('ai');
  return isAiKind(value) ? value : 'casual';
}
