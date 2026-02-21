// Comments in English as requested.

/**
 * User-facing documentation content (English).
 *
 * Notes about accuracy:
 * - Upstream behavior is implemented in the workflow executor as automatic ctx.input wiring for data edges.
 * - Condition branching is implemented via active incoming edges filtered by the condition output.
 * - Loop body receives a loop context object via loopStart (upstream + last iteration output).
 * - LLM nodes append upstream to the prompt automatically unless the prompt explicitly references {{input}}.
 * - Safety budgets are enforced by backend env variables (bytes-based) to prevent prompt/context blowups.
 */

export const en_doc = {
  general: {
    heading: 'About this application',
    markdown: `
LMStudio Web is a **workflow-based UI** for building and running reproducible, multi-step AI processes.

Instead of manually copy-pasting prompts and intermediate results, you build a directed graph (a workflow) and let the engine execute it.

## What it is

- A **workflow editor**: connect steps (nodes) with edges.
- A **run engine**: executes nodes in dependency order, stores intermediate results, and lets you pause/resume/cancel.
- A **tool-enabled pipeline**: web/document reads and other deterministic helpers can be used inside workflows.

## What it is not

- Not a "magic agent" that improvises actions without your graph.
- Not a chat UI replacement.
- Not a cloud service: it is designed for a **local LM Studio** setup.

## How you use it (mental model)

1. Create a workflow and add nodes.
2. Connect nodes using edges to define **data flow** and **execution order**.
3. Run it. Each run produces node outputs (upstreams) that downstream nodes can use.

If you think in terms of "pipelines" or "build graphs", you already understand the core idea.

## Runs: control and repeatability

Runs are designed to be controllable:

- **Pause**: the engine may finish the current tool/model call and then stop.
- **Resume**: continues where it left off.
- **Cancel**: stops the run.

This matters because complex workflows can be long-running and expensive.
    `.trim(),
  },
  workflows: {
    heading: 'Workflows, nodes and upstreams',
    markdown: `
This tab explains the workflow engine concepts and the **special behaviors** that matter in practice.

## What is a workflow?

A workflow is a **directed graph**:

- **Nodes** are steps.
- **Edges** connect nodes.

An edge does two things at once:

1. It creates a **dependency** (source must run before target).
2. It defines **upstream data flow** (source output becomes target input).

The engine executes the graph in a dependency-safe order (topological order). When multiple nodes are independent, execution order between them is not guaranteed.

## Nodes

Nodes are typed (for example: \`lmstudio.llm\`, \`workflow.loopStart\`). Each type has a dedicated executor on the backend.

Every node run produces an **output** (string/JSON) stored in the run context.

## Edges, dependencies and execution order

- If **A → B**, then **A is a dependency of B**.
- If **A → B → C**, the engine must execute **A, then B, then C**.
- If **A → B** and **A → D** (and D has no other deps), then **B and D can run in any order** after A.

## Upstreams (data flow)

An **upstream** is simply the output of a node that a downstream node receives.

**Rule:** If Node A has a data edge to Node B, then **Node B automatically receives Node A's output**.

### Data edges vs control edges

In the current UI convention:

- Only right → left edges (\`port-right\` → \`port-left\`) are treated as **data edges**.
- Other edges are treated as control flow and do not automatically become \`ctx.input\`.

### Templating (optional)

Templating exists to reference specific values, but it is not required for normal data flow.

- Use templating when you need *a specific property* from earlier nodes.
- Do not use templating just to "get the upstream". The upstream is already provided.

## LLM prompt input behavior

LLM nodes have an additional convenience behavior:

- If the prompt does **not** explicitly reference \`{{input}}\`, the engine **appends the upstream** to the prompt as a clearly separated section.
- If the prompt **does** reference \`{{input}}\` (or \`{{input.something}}\`), nothing is appended automatically.

This keeps simple workflows simple, while still allowing precise control.

## Condition branching (\`workflow.condition\`)

\`workflow.condition\` asks the model to evaluate a condition and returns a boolean.

**Branching rule:**

- If the output is **true**, only edges leaving the condition's **true** port are considered active.
- If the output is **false**, only edges leaving the condition's **false** port are active.

Nodes that have incoming edges but none of them are active will be **skipped**.

## Loops (\`workflow.loopStart\` / \`workflow.loopEnd\`)

Loops are where workflows become powerful and where mistakes can melt your machine.

### Loop structure

Typical shape:

\`loopStart → (body nodes...) → loopEnd\`

The loop runs the body repeatedly depending on the loop mode:

- **count**: run a fixed number of iterations.
- **while**: run while the condition stays true.
- **until**: run until the condition becomes true.

### Loop context (important)

Nodes directly connected to \`workflow.loopStart\` do **not** receive a plain string upstream.
Instead they receive a **loop context object**:

\`\`\`ts
{
  upstream: <the original upstream entering the loop>,
  last: <output from the previous iteration> | null,
  iteration: number, // 1-based
  index: number      // 0-based
}
\`\`\`

This is deliberate:

- it gives the loop body stable access to the original upstream,
- and it allows iterative refinement using \`last\`.

Nodes further inside the body behave normally:

- If \`loopStart → Node A → Node B\`, then **Node B receives Node A output**, not the loop context.

### Loop end aggregation

\`workflow.loopEnd\` aggregates the outputs across iterations:

\`\`\`ts
{
  items: string[],
  joined: string
}
\`\`\`

This makes it easy to build "chapter 1-5" style workflows.

### Loop condition input (controlled context growth)

For \`while\` / \`until\` modes, the loop condition needs additional context.
The engine evaluates the condition using:

- the **original upstream**, and
- the **accumulated loop outputs**.

This is the one place where upstream is allowed to "grow".

## Execution safety (budgets)

Large upstreams (especially web reads + loops) can create prompts that are too large for local models and may freeze your machine.

The backend can enforce byte-based budgets via env variables (examples):

- \`WORKFLOW_MAX_PROMPT_BYTES\`
- \`WORKFLOW_MAX_UPSTREAM_BYTES\`
- \`WORKFLOW_MAX_LOOP_CONDITION_BYTES\`
- \`WORKFLOW_MAX_LOOP_TOTAL_PRODUCED_BYTES\`

When a budget is exceeded, the run aborts early with a clear error (for example: "context budget exceeded").

## Node types (reference)

### \`lmstudio.llm\`
Executes an LLM call using a **Settings Profile**.

- If the profile name is **"Default"**, the engine uses the profile currently marked as default.
- Uses the profile's structured output configuration unless the UI overrides it.
- Tools are not executed implicitly here (tool usage is explicit via workflow nodes).

### \`workflow.asset\`
Asset picker.

- Opens a document and reads it using \`doc_read\`.
- The extracted content becomes the node output.

### \`workflow.tool\`
Executes a deterministic tool call (like the model would), returning structured intermediate results.

### \`workflow.condition\`
Evaluates a condition (boolean) and activates only the matching branch.

### \`workflow.loopStart\`
Defines the start of a loop and provides the loop context to directly connected body nodes.

### \`workflow.loopEnd\`
Defines the end of a loop and aggregates iteration outputs as \`{ items, joined }\`.

### \`workflow.merge\`
Merges outputs from multiple inputs (custom ports). Useful to merge condition branches into a single continuation.

### \`workflow.export\`
Creates an artifact from the incoming port outputs. No hidden magic.

### \`ui.preview\`
UI-only node. It exists to show previews in the frontend and does not need heavy backend logic.
    `.trim(),
  },
  tools: {
    heading: 'Tools (deterministic helpers)',
    markdown: `
Tools are deterministic operations the workflow can execute to produce reliable intermediate data.

They are different from LLM nodes:

- **Tools** are deterministic and reproducible.
- **LLMs** are probabilistic and generate text.

Tools are typically executed through \`workflow.tool\` nodes (or specialized nodes like \`workflow.asset\`).

## Web and document tools

### \`web_search(q, limit?)\`
Searches the web for recent information.

- Use for: current events, recent changes, finding relevant URLs.
- Returns: a list of results (titles, URLs, snippets).

### \`web_read(url)\`
Reads a single webpage URL and extracts the main text.

- Use for: turning a found URL into readable text.
- Returns: extracted page content (and/or an artifact reference, depending on configuration).

### \`doc_read(assetId)\`
Reads an uploaded document by asset id.

- Use for: turning user-provided files into workflow upstream.

## Time tools

### \`current_time(timezone?)\`
Returns the current date/time (timezone-aware). Helpful before interpreting phrases like "yesterday".

### \`resolve_relative_date(text, timezone?, baseTime?, forwardDate?)\`
Resolves human time phrases ("next Friday", "in 3 hours") to a concrete ISO timestamp.

### \`date_math(base?, add?, startOf?, endOf?, roundTo?, timezone?)\`
Deterministic date arithmetic (add/subtract, startOf/endOf, rounding).

## Math tools

### \`math(expression, variables?, precision?)\`
Deterministic calculator for expressions and optional variables.

## JSON tools

### \`json_validate(json, schema)\`
Validates JSON against JSON Schema and returns detailed validation errors.

### \`json_repair(text)\`
Attempts to turn JSON-ish text into valid JSON.

## Tool usage tips

- Prefer tools for **facts** and **structure**.
- Keep LLM nodes for **reasoning** and **writing**.
- In loops, keep tool outputs small or summarized to avoid context growth.
    `.trim(),
  },
};
