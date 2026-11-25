/**
 * The dungeon cards of the game (CR 309): data only. A dungeon is a series of rooms joined by arrows (CR 309.4); each room has a room ability whose full text is "When you
 * move your venture marker into this room, [effect]" (CR 309.4c). The effects are ordinary effects of the AST, run as the room ability resolves.
 *
 * Undercity is the only dungeon: the one that "venture into Undercity" and the initiative name (CR 726.2). Its rooms are the real ones (Scryfall, Undercity):
 * Secret Entrance leads to Forge and Lost Well; Forge to Trap! and Arena; Lost Well to Arena and Stash; Trap! to Archives; Arena to Archives and Catacombs; Stash to
 * Catacombs; Archives and Catacombs to Throne of the Dead Three, the bottommost room.
 */
import type {
  DungeonId,
  Effect,
  ObjectSelector,
  TargetSpec,
  TokenDefinition,
  UndercityRoom,
} from '../ast/types';

export interface RoomData {
  /** The name printed on the dungeon card (CR 309.4b: flavor text). */
  readonly name: string;
  /** The effect of the room ability, as the card words it (without the "When you move your venture marker into this room" the rules add, CR 309.4c). */
  readonly text: string;
  /** The rooms an arrow leads to, in the order of the card (empty for the bottommost room). */
  readonly exits: readonly UndercityRoom[];
  readonly effect: Effect;
  readonly targets?: readonly TargetSpec[];
}

export interface DungeonData {
  /** The name of the dungeon card. */
  readonly name: string;
  /** The topmost room: where a venture marker is put as the dungeon enters (CR 309.4a). */
  readonly top: UndercityRoom;
  readonly rooms: Readonly<Record<UndercityRoom, RoomData>>;
}

const YOU = { kind: 'you' } as const;
const T1: ObjectSelector = { kind: 'target', id: 't1' };
const CREATURE_TARGET: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
};

/** "a 4/1 black Skeleton creature token with menace" (Catacombs). */
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

const UNDERCITY: DungeonData = {
  name: 'Undercity',
  top: 'secretEntrance',
  rooms: {
    secretEntrance: {
      name: 'Secret Entrance',
      text: 'Search your library for a basic land card, reveal it, put it into your hand, then shuffle.',
      exits: ['forge', 'lostWell'],
      effect: {
        kind: 'search',
        player: YOU,
        filter: { types: ['land'], supertypes: ['basic'] },
        max: 1,
        destinations: [{ zone: 'hand', count: 1 }],
        reveal: true,
        shuffle: true,
      },
    },
    forge: {
      name: 'Forge',
      text: 'Put two +1/+1 counters on target creature.',
      exits: ['trap', 'arena'],
      targets: [CREATURE_TARGET],
      effect: { kind: 'addCounters', objects: T1, counter: '+1/+1', count: 2 },
    },
    lostWell: {
      name: 'Lost Well',
      text: 'Scry 2.',
      exits: ['arena', 'stash'],
      effect: { kind: 'scry', count: 2 },
    },
    trap: {
      name: 'Trap!',
      text: 'Target player loses 5 life.',
      exits: ['archives'],
      targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
      effect: { kind: 'loseLife', player: { kind: 'target', id: 't1' }, amount: 5 },
    },
    arena: {
      name: 'Arena',
      text: 'Goad target creature.',
      exits: ['archives', 'catacombs'],
      targets: [CREATURE_TARGET],
      effect: { kind: 'goad', objects: T1 },
    },
    stash: {
      name: 'Stash',
      text: 'Create a Treasure token.',
      exits: ['catacombs'],
      effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 1 },
    },
    archives: {
      name: 'Archives',
      text: 'Draw a card.',
      exits: ['throneOfTheDeadThree'],
      effect: { kind: 'draw', player: YOU, count: 1 },
    },
    catacombs: {
      name: 'Catacombs',
      text: 'Create a 4/1 black Skeleton creature token with menace.',
      exits: ['throneOfTheDeadThree'],
      effect: {
        kind: 'createToken',
        token: { kind: 'custom', definition: SKELETON },
        count: 1,
      },
    },
    throneOfTheDeadThree: {
      name: 'Throne of the Dead Three',
      text: 'Reveal the top ten cards of your library. Put a creature card from among them onto the battlefield with three +1/+1 counters on it. It gains hexproof until your next turn. Then shuffle.',
      exits: [],
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'lookAtTop',
            count: 10,
            revealAll: true,
            take: {
              filter: { types: ['creature'] },
              min: 1,
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
          { kind: 'shuffle', player: YOU },
        ],
      },
    },
  },
};

export const DUNGEONS: Readonly<Record<DungeonId, DungeonData>> = { undercity: UNDERCITY };

/** The key of the inherent ability that stands for the room ability of `room` of Undercity (`InherentAbility`). */
export const roomAbilityKey = (room: UndercityRoom): `undercity:${UndercityRoom}` =>
  `undercity:${room}`;

/** The rooms of Undercity, topmost first. */
export const UNDERCITY_ROOMS = Object.keys(UNDERCITY.rooms) as UndercityRoom[];
