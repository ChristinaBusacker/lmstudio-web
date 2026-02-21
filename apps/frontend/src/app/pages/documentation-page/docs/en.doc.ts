export const en_doc = {
  general: {
    heading: 'General concepts',
    markdown: `
This page documents **Workflows** and the most important conventions used by the workflow engine.

## What is a workflow?
A workflow is a directed graph of **nodes** connected by **edges**.

- An **edge** means: the source node must run before the target node.
- The **output** of the source node becomes the **upstream input** for the target node.

The engine executes nodes based on their **dependencies** (topological order). If two nodes only depend on the same upstream node, they may execute in any order.

## Upstream (data flow)
If **Node A** has an edge to **Node B**, then **Node B receives Node A’s output** as its upstream.

This is true even if you do not use templating.

### Templating (optional)
Templating lets you inject specific values into fields.

- Use it when you need a specific property from a previous node.
- Do not use it when you just want the normal upstream. The upstream is already available.

## Runs: pause, resume, cancel
Runs should be controllable:

- **Pause**: it’s okay to finish the currently running model/tool call and pause afterwards.
- **Resume**: continues where it left off.
- **Cancel**: stops the run.

## Execution safety (budgets)
Loops and web content can produce large upstreams. For safety the backend can enforce budgets like:

- max iterations
- max prompt size
- max accumulated loop context

When a budget is exceeded, the run stops with a clear error (for example: “context budget exceeded”).
        `.trim(),
  },
  workflows: {
    heading: 'Workflow nodes',
    markdown: `
This section documents the workflow-specific node types and their upstream behavior.

## Node types

### \`lmstudio.llm\`
Executes an LLM call using a **Settings Profile**.

- If the profile name is **“Default”**, the engine uses the profile currently marked as default.
- No tool execution is required here.
- Uses the structured output configuration from the profile, unless the UI overrides it (checkbox in \`WorkflowNodeComponent\`).

### \`workflow.asset\`
Asset picker.

- Opens a document and reads it using the \`doc_read\` tool.
- The document content becomes the node output (and thus upstream for downstream nodes).

### \`workflow.tool\`
Executes a tool call (like a model would), to produce intermediate results that can be used by later nodes.

### \`workflow.condition\`
Asks the LLM whether a condition is fulfilled.

**Branching rule:**
- If the model answers **true**, only the **true branch** runs and the **false branch is skipped**.
- If the model answers **false**, only the **false branch** runs.

**Inside loops:** the condition must evaluate per-iteration and respect the current iteration state.

### \`workflow.loopStart\`
Marks the start of a loop.

Supported loop modes:
- **count**: run a fixed number of iterations (no condition call)
- **until**: run until the condition becomes true
- **while**: run while the condition stays true

**Body upstream behavior (important):**
Nodes directly connected to \`workflow.loopStart\` receive a *loop context*:

\`\`\`ts
{
  upstream: <the original upstream entering the loop>,
  last: <the output of the previous iteration> | null,
  iteration: number,
  index: number
}
\`\`\`

This keeps the loop body stable and prevents accidental “context growth”.

Nodes further inside the body receive upstream normally (e.g. \`Node A -> Node B\` means Node B receives Node A output).

### \`workflow.loopEnd\`
Marks the end of a loop.

Its output aggregates all iteration results:

\`\`\`ts
{
  items: string[],
  joined: string
}
\`\`\`

Example: if an LLM writes 5 chapters, \`loopEnd\` upstream contains chapters 1-5.

### \`workflow.merge\`
Merges outputs from multiple inputs, similar to \`loopEnd\`, but with custom ports.

Common use case: merge branches after a condition without breaking the graph.

### \`workflow.export\`
Creates an artifact from the incoming port outputs.

- No magic: it exports what goes in.

### \`ui.preview\`
Frontend-only helper.

- Typically no backend work.
- The node exists to render previews in the UI.
        `.trim(),
  },
};
