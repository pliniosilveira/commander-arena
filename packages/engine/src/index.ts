/**
 * Public API of the rules engine. Every other package may import from here only
 * (see docs/SPEC.md section 4.1 and `.dependency-cruiser.cjs`).
 */

export type { ApplyResult } from './api';
export { applyAction, getLegalActions, legalActionsForDecision } from './api';
export type { CastAlternativeKind, FeatureDimension, FeatureRef } from './ast/features';
export {
  CAST_ALTERNATIVE_KINDS,
  FEATURE_VALUES,
  isFeatureSupported,
  isKnownFeature,
  SUPPORTED_FEATURES,
  splitFeatureRef,
} from './ast/features';
export { isValidManaSymbol } from './ast/symbols';
export type * from './ast/types';
export { ZONES } from './ast/types';
export type { AstIssue } from './ast/validate';
export { validateAbility, validateCard, validateCardStructure } from './ast/validate';
export { GRANTABLE_KEYWORDS } from './ast/validate-attach';
export type * from './cards/definition';
export {
  deckOf,
  FIXTURE_CARDS,
  fixtureCard,
  SYNTHETIC_CARDS,
  syntheticCard,
} from './cards/fixtures/index';
export { TOKEN_PRESETS } from './cards/tokens';
export * from './characteristics';
export { CREATURE_TYPES } from './data/creature-types';
export { PLANESWALKER_TYPES } from './data/planeswalker-types';
export { determinize } from './determinize';
export { stateHash } from './hash';
export * from './ids';
export { checkInvariants } from './invariants';
export type { PaymentPlan, PaymentRequest, PaymentSource } from './mana/index';
export { manaValue, parseManaCost, planPayment } from './mana/index';
export type * from './mana/types';
export { EMPTY_MANA_COST } from './mana/types';
export { createRng, nextInt, nextUint32, shuffle } from './rng/index';
export type * from './rng/types';
export { defaultDivision } from './rules/combat-flow';
export type { ControlEnd } from './rules/control';
export type { DeckConfig, GameConfig } from './rules/setup';
export { createGame } from './rules/setup';
export { sharesLandType } from './rules/share-type';
export type * from './state/actions';
export type * from './state/combat-types';
export type * from './state/decisions';
export { DECISION_KINDS, handleDecision } from './state/decisions';
export type * from './state/events';
export type * from './state/types';
export { DEFAULT_SETTINGS } from './state/types';
export { ENGINE_VERSION } from './version';
export type {
  AlternativeCostView,
  CombatView,
  FaceView,
  GameView,
  MeldView,
  ObjectView,
  SeatView,
} from './view';
export { getView } from './view';
