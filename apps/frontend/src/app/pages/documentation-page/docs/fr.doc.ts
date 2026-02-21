// Comments in English as requested.

/**
 * User-facing documentation content (French).
 *
 * Accuracy notes:
 * - Upstream wiring is implemented via data edges (port-right -> port-left) as ctx.input.
 * - Condition branching is implemented by filtering active edges based on boolean condition output.
 * - LoopStart provides a loop context object (upstream + last iteration output) to directly connected body nodes.
 * - LLM nodes append upstream automatically unless the prompt explicitly references {{input}}.
 * - Safety budgets are enforced by backend env variables (bytes) to avoid oversized prompts.
 */

export const fr_doc = {
  general: {
    heading: "À propos de l'application",
    markdown: `
LMStudio Web est une **interface orientée workflows** pour construire et exécuter des processus IA multi-étapes, de manière reproductible.

Au lieu de gérer des chaînes de prompts à la main (copier-coller, notes, etc.), vous modélisez un flux sous forme de graphe et le moteur l’exécute.

## Ce que c’est

- Un **éditeur de workflows** : des étapes (nœuds) reliées par des connexions (arêtes).
- Un **moteur d’exécution** : exécute les nœuds dans l’ordre des dépendances, stocke les résultats intermédiaires, permet pause/reprise/annulation.
- Un système **avec outils** : lecture web/documents et autres aides déterministes utilisables dans les workflows.

## Ce que ce n’est pas

- Pas un « agent magique » qui improvise tout seul.
- Pas un remplacement d’interface de chat.
- Pas un service cloud, mais un outil pensé pour une configuration **LM Studio locale**.

## Comment l’utiliser (modèle mental)

1. Créer un workflow et ajouter des nœuds.
2. Relier les nœuds pour définir le **flux de données** et l’**ordre d’exécution**.
3. Lancer un run. Chaque nœud produit un output utilisable comme upstream par les suivants.

Si vous connaissez les pipelines/DAGs, vous êtes déjà à la maison.

## Runs : contrôle et répétabilité

- **Pause** : on peut terminer l’appel en cours (outil/modèle) puis s’arrêter.
- **Reprise** : continue là où le run s’est arrêté.
- **Annulation** : stoppe le run.

Sur des modèles locaux, le contrôle est crucial, surtout quand les prompts deviennent gros.
    `.trim(),
  },
  workflows: {
    heading: 'Workflows, nœuds et upstreams',
    markdown: `
Cet onglet explique les concepts du moteur de workflows et les **comportements spéciaux** importants en pratique.

## Qu’est-ce qu’un workflow ?

Un workflow est un **graphe orienté** :

- Des **nœuds** (nodes) représentent des étapes.
- Des **arêtes** (edges) relient ces étapes.

Une arête a deux effets :

1. **Dépendance** : la source doit s’exécuter avant la cible.
2. **Flux de données** : l’output de la source devient l’upstream de la cible.

Le moteur exécute le graphe dans un ordre sûr (tri topologique). Si plusieurs nœuds sont indépendants, leur ordre relatif n’est pas garanti.

## Nœuds

Chaque nœud a un type (ex. \`lmstudio.llm\`, \`workflow.loopStart\`) et une logique d’exécution dédiée côté backend.
Chaque exécution produit un output (string/JSON) stocké dans le contexte du run.

## Arêtes, dépendances et ordre d’exécution

- **A → B** : A est une dépendance de B.
- **A → B → C** : A puis B puis C.
- **A → B** et **A → D** (sans autres deps) : B et D peuvent s’exécuter dans n’importe quel ordre après A.

## Upstreams (flux de données)

Un upstream est l’output d’un nœud fourni comme input au nœud suivant.

**Règle :** si Node A a une arête de données vers Node B, alors **Node B reçoit automatiquement l’output de Node A**.

### Arêtes de données vs arêtes de contrôle

Convention actuelle de l’UI :

- seules les arêtes \`port-right\` → \`port-left\` sont considérées comme **arêtes de données** (alimentent \`ctx.input\`).
- les autres arêtes sont du contrôle (ne construisent pas automatiquement \`ctx.input\`).

### Templating (optionnel)

Le templating sert à viser des valeurs précises, pas à « récupérer l’upstream ».

- utilisez-le pour une propriété spécifique,
- sinon, l’upstream est déjà disponible.

## Comportement d’input des nœuds LLM

Pour simplifier les cas courants :

- si le prompt ne référence pas explicitement \`{{input}}\`, le moteur **ajoute automatiquement** l’upstream à la fin du prompt (section séparée).
- si le prompt référence \`{{input}}\` / \`{{input.xxx}}\`, rien n’est ajouté automatiquement.

## Branching conditionnel (\`workflow.condition\`)

\`workflow.condition\` demande au modèle si une condition est vraie ou fausse et retourne un booléen.

- output **true** : seule la branche **true** est active.
- output **false** : seule la branche **false** est active.

Si un nœud a des arêtes entrantes mais aucune n’est active, il est **skippé**.

## Boucles (\`workflow.loopStart\` / \`workflow.loopEnd\`)

Les boucles sont puissantes, et aussi une source classique d’explosion de contexte.

### Structure

\`loopStart → (nœuds du body...) → loopEnd\`

Modes :

- **count** : nombre d’itérations fixe
- **while** : tant que la condition reste true
- **until** : jusqu’à ce que la condition devienne true

### Contexte de boucle (important)

Les nœuds directement reliés à \`workflow.loopStart\` reçoivent un **objet de contexte**, pas un texte brut :

\`\`\`ts
{
  upstream: <input original entrant dans la boucle>,
  last: <output de l’itération précédente> | null,
  iteration: number, // 1-based
  index: number      // 0-based
}
\`\`\`

Les nœuds plus loin dans le body suivent la règle normale :

- \`loopStart → Node A → Node B\` ⇒ Node B reçoit uniquement l’output de Node A.

### Agrégation au \`loopEnd\`

\`workflow.loopEnd\` agrège les outputs :

\`\`\`ts
{
  items: string[],
  joined: string
}
\`\`\`

### Input de condition en boucle (croissance contrôlée)

Pour les modes \`while\`/\`until\`, la condition est évaluée avec :

- l’upstream original
- les outputs accumulés de la boucle

C’est l’endroit prévu pour la croissance de contexte.

## Sécurité d’exécution (budgets)

Les gros upstreams (web_read + boucles) peuvent créer des prompts trop grands pour les modèles locaux.
Le backend peut donc appliquer des budgets (en octets) via env :

- \`WORKFLOW_MAX_PROMPT_BYTES\`
- \`WORKFLOW_MAX_UPSTREAM_BYTES\`
- \`WORKFLOW_MAX_LOOP_CONDITION_BYTES\`
- \`WORKFLOW_MAX_LOOP_TOTAL_PRODUCED_BYTES\`

En cas de dépassement : arrêt propre avec un message clair (ex. « context budget exceeded »).

## Types de nœuds (référence)

### \`lmstudio.llm\`
Appel LLM basé sur un **profil de settings**.

- Profil "Default" ⇒ profil marqué par défaut.
- Structured output selon le profil, sauf override UI.
- Les tools ne sont pas exécutés implicitement.

### \`workflow.asset\`
Sélecteur d’asset : lit un document via \`doc_read\`.

### \`workflow.tool\`
Exécute un tool déterministe et expose le résultat.

### \`workflow.condition\`
Condition booléenne + branching.

### \`workflow.loopStart\`
Début de boucle + provider du loop context.

### \`workflow.loopEnd\`
Fin de boucle + agrégation \`{ items, joined }\`.

### \`workflow.merge\`
Fusionne plusieurs entrées (ports personnalisés), utile après une condition.

### \`workflow.export\`
Crée un artefact à partir des outputs des ports entrants.

### \`ui.preview\`
Nœud UI : aperçu côté frontend.
    `.trim(),
  },
  tools: {
    heading: 'Outils (helpers déterministes)',
    markdown: `
Les tools sont des opérations déterministes exécutables dans un workflow pour produire des données intermédiaires fiables.

- Tools : reproductibles.
- LLM : génération probabiliste.

## Outils web & documents

### \`web_search(q, limit?)\`
Recherche sur le web (utile pour l’actualité et les URLs).

### \`web_read(url)\`
Lit une page web et extrait le texte principal.

### \`doc_read(assetId)\`
Lit un document uploadé via son assetId.

## Outils temps

### \`current_time(timezone?)\`
Retourne la date/heure actuelle avec timezone.

### \`resolve_relative_date(text, timezone?, baseTime?, forwardDate?)\`
Résout des expressions relatives en timestamp ISO.

### \`date_math(...)\`
Arithmétique de dates déterministe.

## Maths

### \`math(expression, variables?, precision?)\`
Calculateur déterministe.

## JSON

### \`json_validate(json, schema)\`
Valide du JSON contre un JSON Schema.

### \`json_repair(text)\`
Répare du texte « JSON-ish » en JSON valide.

## Conseils

- Utilisez les tools pour les faits/structure.
- Gardez les LLM nodes pour l’écriture/raisonnement.
- Dans les boucles : résumer et limiter les outputs pour éviter les prompts énormes.
    `.trim(),
  },
};
