export const de_doc = {
  general: {
    heading: 'Allgemein',
    markdown: `
Diese Seite dokumentiert **Workflows** und die wichtigsten Konventionen der Workflow-Engine.

## Was ist ein Workflow?
Ein Workflow ist ein gerichteter Graph aus **Nodes** (Knoten) und **Edges** (Kanten).

- Eine **Kante** bedeutet: der Source-Node muss vor dem Target-Node laufen.
- Der **Output** des Source-Nodes wird als **Upstream** an den Target-Node übergeben.

Die Engine führt Nodes anhand ihrer **Dependencies** aus (topologische Sortierung). Wenn zwei Nodes nur denselben Upstream brauchen, können sie in beliebiger Reihenfolge laufen.

## Upstream (Datenfluss)
Wenn **Node A** einen Edge zu **Node B** hat, dann bekommt **Node B automatisch den Output von Node A** als Upstream.

Das gilt auch ohne Templating.

### Templating (optional)
Templating ist dafür da, gezielt Werte in Felder zu injizieren.

- Nutze es, wenn du eine konkrete Eigenschaft aus einem Node brauchst.
- Nutze es nicht, wenn du nur den normalen Upstream willst. Der ist schon da.

## Runs: pausieren, fortsetzen, abbrechen
Runs sollten steuerbar sein:

- **Pause**: aktueller Tool/Model-Call darf noch fertig laufen, dann pausieren.
- **Resume**: macht an der Stelle weiter.
- **Cancel**: bricht den Run ab.

## Ausführungssicherheit (Budgets)
Loops und Web-Inhalte können große Upstreams erzeugen. Zur Sicherheit kann das Backend Budgets erzwingen, z. B.:

- max. Iterationen
- max. Prompt-Größe
- max. akkumulierte Loop-Condition-Daten

Wenn ein Budget überschritten wird, stoppt der Run mit einem klaren Fehler (z. B. „context budget exceeded“).
        `.trim(),
  },
  workflows: {
    heading: 'Workflow Nodes',
    markdown: `
Hier sind die workflow-spezifischen Node-Typen und ihr Upstream-Verhalten dokumentiert.

## Node Types

### \`lmstudio.llm\`
Führt einen LLM-Call mit einem **Settings-Profil** aus.

- Wenn das Profil **„Default“** ist, wird das aktuell als Default markierte Profil verwendet.
- Hier werden keine Tools ausgeführt.
- Structured Output kommt aus dem Profil, außer das Frontend überschreibt es gezielt (Checkbox in \`WorkflowNodeComponent\`).

### \`workflow.asset\`
Asset Picker.

- Öffnet ein Dokument und liest es via \`doc_read\`.
- Der Inhalt wird als Node-Output bereitgestellt (und damit Upstream für Downstream-Nodes).

### \`workflow.tool\`
Führt einen Tool-Call aus (so wie ein Modell es tun würde), um Zwischenergebnisse für spätere Nodes zu erzeugen.

### \`workflow.condition\`
Fragt die LLM, ob eine Bedingung erfüllt ist.

**Branching-Regel:**
- Bei **true** wird nur der **true-Strang** ausgeführt, der **false-Strang wird geskippt**.
- Bei **false** entsprechend umgekehrt.

**In Loops:** die Condition muss pro Iteration ausgewertet werden.

### \`workflow.loopStart\`
Markiert den Start einer Schleife.

Unterstützte Modi:
- **count**: feste Anzahl Iterationen (keine Condition-Abfrage)
- **until**: läuft, bis die Condition true wird
- **while**: läuft, solange die Condition true bleibt

**Body-Upstream (wichtig):**
Nodes, die direkt an \`workflow.loopStart\` hängen, erhalten einen *Loop-Kontext*:

\`\`\`ts
{
  upstream: <Upstream, mit dem man in die Schleife gekommen ist>,
  last: <Output der vorherigen Iteration> | null,
  iteration: number,
  index: number
}
\`\`\`

Nodes weiter im Body bekommen Upstream normal (z. B. \`Node A -> Node B\` bedeutet: Node B bekommt den Output von Node A).

### \`workflow.loopEnd\`
Markiert das Ende der Schleife.

Der Output aggregiert die Ergebnisse aus allen Iterationen:

\`\`\`ts
{
  items: string[],
  joined: string
}
\`\`\`

Beispiel: wenn eine LLM 5 Kapitel schreibt, enthält \`loopEnd\` Kapitel 1-5.

### \`workflow.merge\`
Führt mehrere Inputs zusammen, ähnlich wie \`loopEnd\`, aber mit Custom-Ports.

Typischer Use-Case: Condition-Stränge nachträglich zusammenführen, ohne dass es „knallt“.

### \`workflow.export\`
Erstellt ein Artefakt aus den Outputs der Eingangsports.

- Keine Magie: es wird exportiert, was reingeht.

### \`ui.preview\`
Frontend-Node.

- Backend macht hier meist nichts.
- Dient dem Rendern einer Vorschau im UI.
        `.trim(),
  },
};
