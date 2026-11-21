# Jurassic Maths — réponses des élèves et figures géométriques

## Réponses des élèves

La page `/admin` affiche désormais les valeurs numériques saisies, la réponse attendue, le statut juste/faux et la date de chaque réponse. L'export CSV inclut aussi ces détails. Les anciennes réponses restent visibles, mais les valeurs saisies avant cette mise à jour ne peuvent pas être reconstruites. Les élèves restent anonymes : l'identifiant navigateur ne prouve pas leur identité.

## Ajouter une figure à un exercice

1. Placez un fichier `.svg`, `.png`, `.jpg` ou `.webp` dans `daily-math/public/figures/`.
2. Dans `daily-math/src/data/quizzes.json`, ajoutez à **une question** le champ optionnel suivant :

```json
"figure": {
  "src": "/figures/triangle-abc.svg",
  "alt": "Triangle ABC rectangle en A, AB = 4 cm et AC = 3 cm",
  "caption": "Figure non à l’échelle"
}
```

Une figure d'exemple est incluse dans `public/figures/triangle-abc.svg`. Vous pouvez la remplacer par votre propre schéma. Les questions sans champ `figure` restent inchangées.

**Exemple de question complète (à ajouter manuellement si souhaité) :**

```json
{
  "id": "geo1",
  "category": "Géométrie",
  "difficulty": 2,
  "statement": "Le triangle ABC est rectangle en A. AB = 4 cm et AC = 3 cm. Quelle est l'aire du triangle, en cm² ?",
  "answer": "6",
  "explanation": "Aire = (4 × 3) / 2 = 6 cm².",
  "figure": { "src": "/figures/triangle-abc.svg", "alt": "Triangle ABC rectangle en A avec côtés de 4 cm et 3 cm" }
}
```

Le système actuel accepte uniquement des réponses numériques. Un éditeur visuel des exercices dans l'admin et des réponses dessinées nécessiteraient un développement supplémentaire.

## Déployer

Copiez les fichiers modifiés dans votre dépôt GitHub en respectant les chemins, puis faites un commit et poussez-le. Render redéploiera le site (si le déploiement automatique est activé). Gardez `Root Directory = daily-math`, `Build Command = npm ci --include=dev && npm run build`, `Start Command = node server/index.mjs`. Aucune migration SQL n'est nécessaire : les données sont stockées dans la colonne JSONB existante.
