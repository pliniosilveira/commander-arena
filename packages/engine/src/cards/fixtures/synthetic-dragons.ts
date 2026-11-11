/**
 * SYNTHETIC CARDS OF THE DRAGONS SLICE (D-151). NOT REAL MAGIC CARDS. One list of the files below, as `synthetic.ts` registers it.
 */
import type { CardDefinition } from '../definition';
import { SYNTHETIC_DRAGONS_COMBAT_LIST } from './synthetic-dragons-combat';
import { SYNTHETIC_DRAGONS_DAMAGE_LIST } from './synthetic-dragons-damage';
import { SYNTHETIC_DRAGONS_ENTERS_LIST } from './synthetic-dragons-enters';
import { SYNTHETIC_DRAGONS_EXISTING_LIST } from './synthetic-dragons-existing';
import { SYNTHETIC_DRAGONS_GRAVEYARD_LIST } from './synthetic-dragons-graveyard';
import { SYNTHETIC_DRAGONS_IMPULSE_LIST } from './synthetic-dragons-impulse';
import { SYNTHETIC_DRAGONS_LIBRARY_LIST } from './synthetic-dragons-library';
import { SYNTHETIC_DRAGONS_MANA_LIST } from './synthetic-dragons-mana';
import { SYNTHETIC_DRAGONS_REVEAL_LIST } from './synthetic-dragons-reveal';
import { SYNTHETIC_DRAGONS_SAGA_LIST } from './synthetic-dragons-saga';
import { SYNTHETIC_DRAGONS_TURNLOG_LIST } from './synthetic-dragons-turnlog';

export const SYNTHETIC_DRAGONS_LIST: readonly CardDefinition[] = [
  ...SYNTHETIC_DRAGONS_COMBAT_LIST,
  ...SYNTHETIC_DRAGONS_DAMAGE_LIST,
  ...SYNTHETIC_DRAGONS_ENTERS_LIST,
  ...SYNTHETIC_DRAGONS_EXISTING_LIST,
  ...SYNTHETIC_DRAGONS_GRAVEYARD_LIST,
  ...SYNTHETIC_DRAGONS_IMPULSE_LIST,
  ...SYNTHETIC_DRAGONS_LIBRARY_LIST,
  ...SYNTHETIC_DRAGONS_MANA_LIST,
  ...SYNTHETIC_DRAGONS_REVEAL_LIST,
  ...SYNTHETIC_DRAGONS_SAGA_LIST,
  ...SYNTHETIC_DRAGONS_TURNLOG_LIST,
];
