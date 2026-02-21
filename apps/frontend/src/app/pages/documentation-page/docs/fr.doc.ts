export const fr_doc = {
  general: {
    heading: 'Général',
    markdown: `
Cette page documente les **workflows** et les conventions les plus importantes du moteur d’exécution.

## Qu’est-ce qu’un workflow ?
Un workflow est un graphe orienté composé de **nœuds** et de **liaisons**.

- Une **liaison** signifie : le nœud source doit s’exécuter avant le nœud cible.
- La **sortie** du nœud source devient l’**upstream** (entrée) du nœud cible.

Le moteur exécute les nœuds selon leurs **dépendances** (ordre topologique). Si deux nœuds dépendent uniquement du même upstream, leur ordre relatif peut varier.

## Upstream (flux de données)
Si **Node A** est relié à **Node B**, alors **Node B reçoit automatiquement la sortie de Node A** comme upstream.

Cela fonctionne même sans templating.

### Templating (optionnel)
Le templating sert à injecter des valeurs précises dans des champs.

- Utilise-le quand tu veux une propriété spécifique d’un nœud.
- Ne l’utilise pas juste pour “avoir l’upstream”, il est déjà disponible.

## Runs : pause, reprise, annulation
Les runs doivent être contrôlables :

- **Pause** : autorisé de terminer l’appel tool/modèle en cours puis de s’arrêter.
- **Resume** : reprend là où ça s’est arrêté.
- **Cancel** : stoppe le run.

## Sécurité (budgets)
Les boucles et le contenu web peuvent produire de très gros upstreams. Le backend peut appliquer des budgets, par exemple :

- nombre max d’itérations
- taille max du prompt
- taille max du contexte de condition de boucle

Si un budget est dépassé, le run s’arrête avec une erreur claire (ex. : « context budget exceeded »).
        `.trim(),
  },
  workflows: {
    heading: 'Nœuds de workflow',
    markdown: `
Cette section documente les types de nœuds workflow et leur comportement upstream.

## Types de nœuds

### \`lmstudio.llm\`
Exécute un appel LLM via un **profil de paramètres**.

- Si le profil est « Default », le profil actuellement marqué comme défaut est utilisé.
- Aucun tool n’est nécessaire ici.
- Le structured output vient du profil, sauf override explicite via l’UI (checkbox dans \`WorkflowNodeComponent\`).

### \`workflow.asset\`
Sélecteur d’asset.

- Ouvre un document et le lit via \`doc_read\`.
- Le contenu devient la sortie du nœud.

### \`workflow.tool\`
Exécute un tool call pour produire des résultats intermédiaires utilisables ensuite.

### \`workflow.condition\`
Demande au LLM si la condition est satisfaite.

**Règle de branchement :**
- Si **true**, seul le chemin true s’exécute (le false est ignoré).
- Si **false**, seul le chemin false s’exécute.

**Dans une boucle :** évaluation par itération.

### \`workflow.loopStart\`
Début d’une boucle.

Modes :
- **count** : nombre fixe d’itérations
- **until** : jusqu’à ce que la condition devienne true
- **while** : tant que la condition reste true

**Upstream du body (important) :**
Les nœuds connectés directement à \`workflow.loopStart\` reçoivent un contexte de boucle :

\`\`\`ts
{
  upstream: <upstream d’entrée de la boucle>,
  last: <sortie de l’itération précédente> | null,
  iteration: number,
  index: number
}
\`\`\`

Les nœuds plus loin dans le body reçoivent l’upstream normal (ex. \`A -> B\`).

### \`workflow.loopEnd\`
Fin d’une boucle.

La sortie agrège toutes les itérations :

\`\`\`ts
{
  items: string[],
  joined: string
}
\`\`\`

### \`workflow.merge\`
Fusionne plusieurs entrées, similaire à \`loopEnd\`, avec des ports personnalisés.

### \`workflow.export\`
Crée un artefact à partir des outputs entrants. Pas de magie.

### \`ui.preview\`
Nœud purement UI pour afficher une prévisualisation.
        `.trim(),
  },
};
