/** The real precons of the app (D-137): snapshots, the offline client and the deck builder. */
export {
  buildPreconDeck,
  createPrecons,
  type DeckLibrary,
  type PreconDeck,
  type Precons,
  type ServiceFor,
} from './build';
export {
  blurbOf,
  type CommanderLook,
  commanderNameOf,
  type DeckChoice,
  deckChoices,
  savedDeckChoiceId,
  savedDeckIdOf,
} from './choices';
export { layeredClient } from './layered-client';
export { snapshotClient } from './snapshot-client';
export {
  CHALLENGES,
  infoOf,
  type LoadedSnapshots,
  loadSnapshots,
  type PreconInfo,
  SHIPPED,
} from './snapshots';
export {
  type ChallengeRequest,
  type StartOptions,
  type StartRequest,
  startChallengeOptions,
  startOptionsFor,
} from './start';
