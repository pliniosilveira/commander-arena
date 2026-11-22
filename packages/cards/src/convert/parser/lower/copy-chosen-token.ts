/**
 * Lowering of "create a token that's a copy of a non-Saga token you control" (Summon: Good King Mog XII; CR 707.2, 111.4, 608.2d): the controller chooses one token of theirs that is not a
 * Saga as the instruction resolves, and a token is created with the copiable values of the one chosen. The engine's `chooseObjects` and a `createToken` of a `copyOf` the object chosen.
 */
import type { IrClause } from '../ir/types';
import type { Effects } from './clauses';
import type { Lowering } from './types';

const CHOSEN_ID = 'copied-token';

const CREATE_COPY_OF_CHOSEN_TOKEN: Lowering<IrClause, Effects> = {
  head: 'createCopyOfChosenToken',
  id: 'lower.create-copy-of-chosen-token',
  needs: ['effect:chooseObjects', 'effect:createToken', 'selector:chosen'],
  lower: (clause) => ({
    ok: true,
    value: [
      {
        kind: 'chooseObjects',
        id: CHOSEN_ID,
        filter: { token: true, controller: 'you', notSubtypes: ['Saga'] },
        count: 1,
        exactly: true,
      },
      {
        kind: 'createToken',
        token: { kind: 'copyOf', object: { kind: 'chosen', id: CHOSEN_ID } },
        count: 1,
      },
    ],
    rule: clause.rule,
  }),
};

export const COPY_CHOSEN_TOKEN_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  CREATE_COPY_OF_CHOSEN_TOKEN,
];
