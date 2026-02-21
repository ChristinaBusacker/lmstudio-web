/**
 * Workflow safety budgets.
 *
 * We cannot reliably read GPU/VRAM pressure from LM Studio, so we protect the host by
 * enforcing deterministic size limits (bytes) on upstream/context/prompt payloads.
 */

export type WorkflowBudgetErrorMeta = {
  label: string;
  limitBytes: number;
  actualBytes: number;
};

export class WorkflowBudgetExceededError extends Error {
  readonly meta: WorkflowBudgetErrorMeta;

  constructor(meta: WorkflowBudgetErrorMeta) {
    super(
      `context budget exceeded: ${meta.label} is ${meta.actualBytes} bytes (limit ${meta.limitBytes} bytes)`,
    );
    this.name = 'WorkflowBudgetExceededError';
    this.meta = meta;
  }
}

function readEnvInt(name: string, fallback: number): number {
  const raw = (process.env[name] ?? '').trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Returns the current workflow budgets.
 *
 * Implemented as a function (not a constant) so tests and runtime can adjust limits
 * by changing process.env without requiring a process restart.
 */
export function getWorkflowBudgets() {
  return {
    // Conservative defaults that avoid "processing prompt" freezes for many local setups.
    // Users can override via env.
    maxPromptBytes: readEnvInt('WORKFLOW_MAX_PROMPT_BYTES', 200_000),
    maxUpstreamBytes: readEnvInt('WORKFLOW_MAX_UPSTREAM_BYTES', 80_000),
    maxLoopConditionBytes: readEnvInt('WORKFLOW_MAX_LOOP_CONDITION_BYTES', 120_000),
    maxLoopTotalProducedBytes: readEnvInt('WORKFLOW_MAX_LOOP_TOTAL_PRODUCED_BYTES', 250_000),
  };
}

export function byteLengthUtf8(text: string): number {
  return Buffer.byteLength(text ?? '', 'utf8');
}

export function ensureWithinBudget(text: string, limitBytes: number, label: string): void {
  const actualBytes = byteLengthUtf8(text);
  if (actualBytes > limitBytes) {
    throw new WorkflowBudgetExceededError({ label, limitBytes, actualBytes });
  }
}
