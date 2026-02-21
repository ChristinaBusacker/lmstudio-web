// Comments in English as requested.

/**
 * User-facing documentation content (German).
 *
 * Accuracy notes:
 * - Upstream wiring is implemented via data edges (port-right -> port-left) as ctx.input.
 * - Condition branching is implemented by filtering active edges based on boolean condition output.
 * - LoopStart provides a loop context object (upstream + last iteration output) to directly connected body nodes.
 * - LLM nodes append upstream automatically unless the prompt explicitly references {{input}}.
 * - Safety budgets are enforced by backend env variables (bytes) to avoid oversized prompts.
 */

export const de_doc = {
  general: {
    heading: 'Über diese Anwendung',
    markdown: `
LMStudio Web ist eine **workflow-basierte Oberfläche**, um reproduzierbare, mehrstufige KI-Prozesse zu bauen und auszuführen.

Statt Zwischenstände manuell zu kopieren oder "Prompt-Ketten" im Chat zu verwalten, modellierst du einen Ablauf als Graph und lässt die Engine ihn deterministisch abarbeiten.

## Was es ist

- Ein **Workflow-Editor**: Schritte (Nodes) werden verbunden (Edges).
- Eine **Run-Engine**: führt Nodes in Abhängigkeits-Reihenfolge aus, speichert Ergebnisse und erlaubt Pause/Resume/Cancel.
- Ein **Tool-fähiges System**: Web-/Dokument-Lesen und andere deterministische Helfer können in Workflows genutzt werden.

## Was es nicht ist

- Kein "Agent", der sich selbst einen Ablauf ausdenkt.
- Kein reines Chat-UI.
- Kein Cloud-Service, sondern für eine **lokale LM Studio** Umgebung gedacht.

## Wie man damit arbeitet (Mental Model)

1. Workflow erstellen und Nodes hinzufügen.
2. Nodes mit Edges verbinden, um **Datenfluss** und **Ausführungsreihenfolge** festzulegen.
3. Run starten. Jeder Node erzeugt Output, der als Upstream weitergegeben werden kann.

Wenn du schon mal Build-Graphen, Pipelines oder DAGs gebaut hast: das ist genau diese Denkweise.

## Runs: Kontrolle und Wiederholbarkeit

Runs sollen kontrollierbar sein:

- **Pause**: es ist okay, den aktuellen Tool-/Model-Call zu Ende zu führen und danach anzuhalten.
- **Resume**: macht genau dort weiter, wo gestoppt wurde.
- **Cancel**: bricht den Run ab.

Das ist wichtig, weil Workflows lang laufen können und lokale Modelle empfindlich auf riesige Kontexte reagieren.
    `.trim(),
  },
  workflows: {
    heading: 'Workflows, Nodes und Upstreams',
    markdown: `
Dieser Tab erklärt die wichtigsten Konzepte der Workflow-Engine und die **Sonderfälle**, die in der Praxis relevant sind.

## Was ist ein Workflow?

Ein Workflow ist ein **gerichteter Graph**:

- **Nodes** sind Schritte.
- **Edges** verbinden Nodes.

Eine Edge hat zwei Bedeutungen:

1. **Dependency**: Source muss vor Target laufen.
2. **Upstream-Datenfluss**: Source-Output wird als Input für Target bereitgestellt.

Die Engine führt Nodes in einer dependency-sicheren Reihenfolge aus (topologische Sortierung). Wenn mehrere Nodes unabhängig sind, ist die Reihenfolge zwischen ihnen nicht garantiert.

## Nodes

Nodes sind typisiert (z. B. \`lmstudio.llm\`, \`workflow.loopStart\`). Jede Node-Type hat im Backend eine eigene Ausführungslogik.

Jeder Node-Run produziert ein **Ergebnis** (String/JSON), das im Run-Kontext gespeichert wird.

## Edges, Dependencies und Ausführungsreihenfolge

- Wenn **A → B**, ist **A** eine Dependency von **B**.
- Wenn **A → B → C**, muss die Engine **A, dann B, dann C** ausführen.
- Wenn **A → B** und **A → D** (und D hat sonst keine deps), können **B und D** nach A in beliebiger Reihenfolge laufen.

## Upstreams (Datenfluss)

Ein **Upstream** ist der Output eines Nodes, der einem Downstream-Node als Input zur Verfügung gestellt wird.

**Grundregel:** Wenn Node A eine Data-Edge zu Node B hat, erhält **Node B automatisch den Output von Node A**.

### Data-Edges vs Control-Edges

Nach aktueller UI-Konvention gilt:

- Nur Edges von \`port-right\` nach \`port-left\` werden als **Data-Edges** behandelt und werden automatisch zu \`ctx.input\`.
- Andere Edges sind Control-Flow und erzeugen nicht automatisch \`ctx.input\`.

### Templating (optional)

Templating gibt dir Feinkontrolle, ist aber nicht nötig, um den normalen Upstream zu bekommen.

- Nutze Templating, wenn du *eine bestimmte Eigenschaft* aus einem vorherigen Node brauchst.
- Nutze Templating nicht nur dafür, "den Upstream" zu bekommen. Der ist bereits da.

## LLM-Input-Verhalten

LLM-Nodes haben ein Convenience-Verhalten:

- Wenn der Prompt **nicht** explizit \`{{input}}\` referenziert, hängt die Engine den Upstream automatisch an den Prompt an (klar getrennt als "UPSTREAM").
- Wenn der Prompt \`{{input}}\` oder \`{{input.xyz}}\` enthält, wird nichts automatisch angehängt.

So bleiben einfache Workflows simpel, ohne dass du Kontrolle verlierst.

## Condition-Branching (\`workflow.condition\`)

\`workflow.condition\` fragt ein Modell, ob eine Bedingung erfüllt ist, und liefert **boolean** zurück.

**Regel:**

- Output **true** → nur der **true-Strang** wird ausgeführt.
- Output **false** → nur der **false-Strang** wird ausgeführt.

Nodes, die zwar In-Edges haben, aber keine aktive Edge (weil falscher Branch), werden **geskippt**.

## Loops (\`workflow.loopStart\` / \`workflow.loopEnd\`)

Loops sind mächtig und gleichzeitig die häufigste Quelle für "Kontext wächst unendlich".

### Aufbau

Typischer Ablauf:

\`loopStart → (Body Nodes...) → loopEnd\`

Loop-Modi:

- **count**: feste Anzahl an Iterationen (keine Condition-Abfrage)
- **while**: läuft solange die Condition true bleibt
- **until**: läuft bis die Condition true wird

### Loop Context (entscheidend)

Nodes, die **direkt** an \`workflow.loopStart\` hängen, erhalten keinen simplen String, sondern einen **Loop Context**:

\`\`\`ts
{
  upstream: <ursprünglicher Input des Loops>,
  last: <Output der vorherigen Iteration> | null,
  iteration: number, // 1-basiert
  index: number      // 0-basiert
}
\`\`\`

Warum?

- stabiler Zugriff auf den ursprünglichen Upstream
- iterative Verbesserung über \`last\` ohne dass der gesamte Kontext unkontrolliert wächst

Nodes tiefer im Body verhalten sich normal:

- Wenn \`loopStart → Node A → Node B\`, dann bekommt **Node B nur den Output von Node A** (nicht den Loop Context).

### Loop End Aggregation

\`workflow.loopEnd\` aggregiert die Ergebnisse über alle Iterationen:

\`\`\`ts
{
  items: string[],
  joined: string
}
\`\`\`

Beispiel: 5 Kapitel schreiben → \`loopEnd\` enthält Kapitel 1-5.

### Condition-Input im Loop (kontrolliertes Wachstum)

Für \`while\`/\`until\` muss die Condition mehr Kontext bekommen.
Die Engine bewertet die Condition mit:

- ursprünglichem Upstream
- akkumulierten Loop Outputs

Das ist der eine Ort, an dem Kontext wachsen darf.

## Execution Safety (Budgets)

Web-Reads + Loops können riesige Upstreams erzeugen. Lokale Modelle können dabei den Rechner einfrieren ("processing prompt").

Darum gibt es im Backend (bytes-basiert) Budgets via Env:

- \`WORKFLOW_MAX_PROMPT_BYTES\`
- \`WORKFLOW_MAX_UPSTREAM_BYTES\`
- \`WORKFLOW_MAX_LOOP_CONDITION_BYTES\`
- \`WORKFLOW_MAX_LOOP_TOTAL_PRODUCED_BYTES\`

Wenn ein Budget überschritten wird, bricht der Run früh und sauber ab (z. B. "context budget exceeded").

## Node Types (Referenz)

### \`lmstudio.llm\`
Führt eine LLM-Abfrage aus, basierend auf einem **Settings Profil**.

- Profilname **"Default"** → nimmt das aktuell als Default markierte Profil.
- Nutzt Structured Output aus dem Profil, außer die UI überschreibt es.
- Tools werden nicht implizit ausgeführt (Tools sind explizit im Workflow).

### \`workflow.asset\`
Asset Picker.

- liest ein Dokument per \`doc_read\`
- stellt den Inhalt als Output bereit

### \`workflow.tool\`
Führt einen deterministischen Tool-Call aus und stellt das Ergebnis als Upstream bereit.

### \`workflow.condition\`
Condition-Node (boolean) mit Branching (true/false).

### \`workflow.loopStart\`
Loop Start + Loop Context Provider.

### \`workflow.loopEnd\`
Loop End + Aggregation \`{ items, joined }\`.

### \`workflow.merge\`
Führt mehrere Eingänge zusammen (custom Ports). Ideal zum Mergen nach einer Condition.

### \`workflow.export\`
Erstellt ein Artefakt aus den eingehenden Port-Outputs. Keine "Magic".

### \`ui.preview\`
UI-Node zur Vorschau im Frontend. Backend-Logik minimal.
    `.trim(),
  },
  tools: {
    heading: 'Tools (deterministische Helfer)',
    markdown: `
Tools sind deterministische Operationen, die Workflows ausführen können, um zuverlässige Zwischenergebnisse zu erzeugen.

Unterschied zu LLM-Nodes:

- **Tools** sind reproduzierbar (gleicher Input → gleicher Output).
- **LLMs** sind probabilistisch und generieren Text.

Tools werden typischerweise über \`workflow.tool\` Nodes ausgeführt (oder über spezialisierte Nodes wie \`workflow.asset\`).

## Web- und Dokument-Tools

### \`web_search(q, limit?)\`
Sucht im Web nach aktuellen Informationen.

- Use-Case: News, aktuelle Fakten, relevante URLs finden.
- Output: Liste von Treffern (Titel, URL, Snippet).

### \`web_read(url)\`
Liest eine Webseite und extrahiert den Haupttext.

- Use-Case: gefundene URLs in lesbaren Content verwandeln.
- Output: extrahierter Text (und je nach Setup ein Artefakt/Referenz).

### \`doc_read(assetId)\`
Liest ein hochgeladenes Dokument anhand seiner Asset-ID.

## Zeit-Tools

### \`current_time(timezone?)\`
Gibt die aktuelle Zeit zurück (timezone-aware). Hilft bei relativen Begriffen wie "gestern".

### \`resolve_relative_date(text, timezone?, baseTime?, forwardDate?)\`
Löst relative Datumsangaben ("nächsten Freitag") zu einem konkreten ISO-Timestamp auf.

### \`date_math(base?, add?, startOf?, endOf?, roundTo?, timezone?)\`
Deterministische Datums-Arithmetik.

## Mathe

### \`math(expression, variables?, precision?)\`
Deterministischer Rechner.

## JSON

### \`json_validate(json, schema)\`
Validiert JSON gegen ein JSON Schema.

### \`json_repair(text)\`
Versucht JSON-artigen Text zu reparieren und in valides JSON zu konvertieren.

## Tipps

- Tools für **Fakten** und **Struktur** verwenden.
- LLM-Nodes für **Schreiben** und **Reasoning**.
- In Loops Tool-Outputs klein halten oder zusammenfassen, um Kontextwachstum zu vermeiden.
    `.trim(),
  },
};
