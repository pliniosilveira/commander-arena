/**
 * A play-out worker (issue 653, step 2c): a child of the game Worker that plays the turn planner's lines when
 * the pool (`play-out-pool.ts`) asks. It holds no game: the planning's states arrive in an `open` message and
 * are kept until `close`, and each `run` plays one line on one scenario with the planner's own code
 * (`PlanService`) and answers its trace.
 */
import { PlanService, simAgentsOf } from '@commander-arena/ai';
import type { PoolReply, PoolRequest } from './play-out-pool';

interface Scope {
  onmessage: ((event: { readonly data: PoolRequest }) => void) | null;
  postMessage(message: PoolReply): void;
}

const scope = self as unknown as Scope;
const service = new PlanService(simAgentsOf);

scope.onmessage = ({ data }) => {
  if (data.t === 'open') {
    service.open(data.job, data.spec);
  } else if (data.t === 'close') {
    service.close(data.job);
  } else {
    try {
      scope.postMessage({
        t: 'done',
        id: data.id,
        trace: service.run(data.job, data.line, data.scenario, data.record, data.horizon),
      });
    } catch (error) {
      scope.postMessage({
        t: 'failed',
        id: data.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
};
