/**
 * The dungeons the engine knows (CR 309, 701.49): a dungeon is data, the rooms of its card with the arrows that lead from each to the next and the effect of its room ability
 * (CR 309.4c: "When you move your venture marker into this room, [effect]"). The first room is the topmost (CR 309.4a) and a room that leads nowhere is the bottommost, which
 * completes the dungeon once its ability has left the stack (CR 309.6, 309.7). Only Undercity, the dungeon the initiative ventures into (CR 726.2), is built.
 *
 * The room texts are the Oracle text of the dungeon card "Undercity" (Scryfall, fetched by the deck-support workflow); the rooms are written with the engine's own effects.
 */
import type { DungeonId, Effect, TargetSpec, TokenDefinition } from '../ast/types';

/** One room of a dungeon card. */
export interface DungeonRoom {
  /** The id the venture marker names (`SeatState.dungeon.room`): the room's name in lower case, with dashes (CR 309.4b: the name is flavor text, so it is only a label). */
  readonly id: string;
  /** The name printed on the room. */
  readonly name: string;
  /** The text of the room ability's effect, as printed. */
  readonly text: string;
  /** The rooms an arrow from this one points to, in the order the card draws them. Empty for the bottommost room. */
  readonly leadsTo: readonly string[];
  /** What the room ability does, as an effect of the player who owns the dungeon. */
  readonly effect: Effect;
  /** The targets of the room ability, chosen as it is put on the stack (CR 603.3d). */
  readonly targets?: readonly TargetSpec[];
}

/** A dungeon card: its name and its rooms, the topmost first. */
export interface DungeonDef {
  readonly id: DungeonId;
  readonly name: string;
  readonly rooms: readonly DungeonRoom[];
}

const TARGET_CREATURE: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
};

/** The 4/1 black Skeleton creature token with menace of the Catacombs. */
const SKELETON: TokenDefinition = {
  name: 'Skeleton',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Skeleton'],
  colors: ['B'],
  power: 4,
  toughness: 1,
  loyalty: null,
  defense: null,
  oracleText: 'Menace',
  abilities: [{ kind: 'keyword', keyword: { kind: 'menace' } }],
};

export const UNDERCITY: DungeonDef = {
  id: 'undercity',
  name: 'Undercity',
  rooms: [
    {
      id: 'secret-entrance',
      name: 'Secret Entrance',
      text: 'Search your library for a basic land card, reveal it, put it into your hand, then shuffle.',
      leadsTo: ['forge', 'lost-well'],
      effect: {
        kind: 'search',
        player: { kind: 'you' },
        filter: { types: ['land'], supertypes: ['basic'] },
        max: 1,
        destinations: [{ zone: 'hand', count: 1 }],
        reveal: true,
        shuffle: true,
      },
    },
    {
      id: 'forge',
      name: 'Forge',
      text: 'Put two +1/+1 counters on target creature.',
      leadsTo: ['trap', 'arena'],
      effect: {
        kind: 'addCounters',
        objects: { kind: 'target', id: 't1' },
        counter: '+1/+1',
        count: 2,
      },
      targets: [TARGET_CREATURE],
    },
    {
      id: 'lost-well',
      name: 'Lost Well',
      text: 'Scry 2.',
      leadsTo: ['arena', 'stash'],
      effect: { kind: 'scry', count: 2 },
    },
    {
      id: 'trap',
      name: 'Trap!',
      text: 'Target player loses 5 life.',
      leadsTo: ['archives'],
      effect: { kind: 'loseLife', player: { kind: 'target', id: 't1' }, amount: 5 },
      targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
    },
    {
      id: 'arena',
      name: 'Arena',
      text: 'Goad target creature.',
      leadsTo: ['archives', 'catacombs'],
      effect: { kind: 'goad', objects: { kind: 'target', id: 't1' } },
      targets: [TARGET_CREATURE],
    },
    {
      id: 'stash',
      name: 'Stash',
      text: 'Create a Treasure token.',
      leadsTo: ['catacombs'],
      effect: {
        kind: 'createToken',
        token: { kind: 'preset', preset: 'Treasure' },
        count: 1,
      },
    },
    {
      id: 'archives',
      name: 'Archives',
      text: 'Draw a card.',
      leadsTo: ['throne-of-the-dead-three'],
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    },
    {
      id: 'catacombs',
      name: 'Catacombs',
      text: 'Create a 4/1 black Skeleton creature token with menace.',
      leadsTo: ['throne-of-the-dead-three'],
      effect: {
        kind: 'createToken',
        token: { kind: 'custom', definition: SKELETON },
        count: 1,
      },
    },
    {
      id: 'throne-of-the-dead-three',
      name: 'Throne of the Dead Three',
      text: 'Reveal the top ten cards of your library. Put a creature card from among them onto the battlefield with three +1/+1 counters on it. It gains hexproof until your next turn. Then shuffle.',
      leadsTo: [],
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'lookAtTop',
            count: 10,
            revealAll: true,
            take: {
              filter: { types: ['creature'] },
              max: 1,
              to: 'battlefield',
              withCounters: { counter: '+1/+1', count: 3 },
            },
            rest: 'top',
          },
          {
            kind: 'grantKeyword',
            objects: { kind: 'moved' },
            keyword: { kind: 'hexproof' },
            duration: 'untilYourNextTurn',
          },
          { kind: 'shuffle', player: { kind: 'you' } },
        ],
      },
    },
  ],
};

/** Every dungeon, by id. */
export const DUNGEONS: Readonly<Record<DungeonId, DungeonDef>> = { undercity: UNDERCITY };

/** The room of the dungeon with the id, or undefined. */
export function roomOf(dungeon: DungeonId, room: string): DungeonRoom | undefined {
  return DUNGEONS[dungeon].rooms.find((r) => r.id === room);
}

/** CR 309.4a: the topmost room, where a venture marker is put as the dungeon enters. */
export function topmostRoom(dungeon: DungeonId): DungeonRoom {
  return DUNGEONS[dungeon].rooms[0] as DungeonRoom;
}
