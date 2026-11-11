/**
 * The decks of the match harness (M7b): three fixed lists of 24 cards of real-card fixtures that the
 * engine fully supports (no SYNTHETIC cards), each with lands, creatures and a few spells, and a
 * commander. Colors are two per deck, so the mana works. Every game plays the SAME list on both seats
 * (a mirror, PRIOR_ART 7.2 heuristic 10), so a difference in results comes from the agents.
 *
 * They are small on purpose (like the decks of the AI game tests): a game is over, by damage or by an empty library, in a few dozen turns.
 * They are not tuned; they exist to give both agents creatures to attack and block with, burn and
 * removal to aim, and a land drop to make every turn.
 */
import { type DeckConfig, deckOf } from '@commander-arena/engine';

type Entries = [name: string, count: number][];

const make = (commander: string, rest: Entries): DeckConfig => ({
  cards: deckOf([[commander, 1], ...rest]),
  commanders: [0],
});

/** White and green: bears and elves, a Spider, Serra Angel, an Angel's Mercy and a Sol Ring. */
const GREEN_WHITE = make('Isamaru, Hound of Konda', [
  ['Plains', 4],
  ['Forest', 4],
  ['Command Tower', 1],
  ['Llanowar Elves', 2],
  ['Grizzly Bears', 2],
  ['Youthful Knight', 1],
  ['Fencing Ace', 1],
  ["Healer's Hawk", 1],
  ['Giant Spider', 2],
  ['Serra Angel', 2],
  ["Angel's Mercy", 1],
  ['Sol Ring', 1],
  ['Divination', 1],
]);

/** White and red aggro: cheap attackers and burn. */
const RED_WHITE = make('Isamaru, Hound of Konda', [
  ['Plains', 4],
  ['Mountain', 4],
  ['Command Tower', 1],
  ['Raging Goblin', 3],
  ['Youthful Knight', 2],
  ['Fencing Ace', 1],
  ["Healer's Hawk", 1],
  ['Grizzly Bears', 1],
  ['Serra Angel', 1],
  ['Lightning Bolt', 2],
  ['Sol Ring', 1],
  ['Wall of Stone', 1],
  ['Unsummon', 1],
]);

/** Black and green: big bodies and removal, Yargle as the commander. */
const BLACK_GREEN = make('Yargle, Glutton of Urborg', [
  ['Swamp', 4],
  ['Forest', 4],
  ['Command Tower', 1],
  ['Llanowar Elves', 2],
  ['Typhoid Rats', 2],
  ['Grizzly Bears', 3],
  ['Giant Spider', 2],
  ['Murder', 2],
  ['Sol Ring', 1],
  ['Divination', 1],
  ['Unsummon', 1],
]);

export const ARENA_DECKS: readonly DeckConfig[] = [GREEN_WHITE, RED_WHITE, BLACK_GREEN];
