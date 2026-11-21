# Jurassic Maths — nouvelles questions (sans figures)

Le quiz affiché sur la page d'accueil contient désormais 10 questions sur les aires, Pythagore, les puissances et le calcul littéral.

- Modification des énoncés : `daily-math/src/data/quizzes.json`, premier élément de `quizzes`.
- L'ancien questionnaire est conservé comme deuxième élément, mais l'interface utilise uniquement le premier.
- Les réponses peuvent être des nombres (virgule ou point), des mots, des expressions simples ou des lettres de QCM.
- Les variantes doivent être inscrites explicitement dans `acceptedAnswers` : l'application ne fait **pas** de calcul symbolique général.
- La correction utilise la même fonction au navigateur et au serveur, `daily-math/src/lib/checkAnswer.mjs`.
- Les réponses saisies sont enregistrées pour la page professeur `/admin` lors des nouvelles tentatives.
- Aucune figure géométrique n'a été ajoutée à ce quiz. L'exemple SVG précédent a été supprimé.

## Déploiement Render

Conserver le service Web avec `Root Directory = daily-math`, `Build Command = npm ci --include=dev && npm run build`, `Start Command = node server/index.mjs`.
Les variables `DATABASE_URL` et `ADMIN_PASSWORD` doivent rester définies dans Render (ne pas les écrire dans le dépôt).
Envoyer les fichiers dans le dépôt GitHub puis relancer le déploiement.

## Vérifications

Les 10 réponses prévues et 10 contre-exemples ont été testés avec la fonction de validation partagée ; la syntaxe des modules JavaScript a été vérifiée.
Une compilation complète Vite/TypeScript n'a pas pu être effectuée dans cet environnement : les dépendances npm ne sont pas disponibles localement et `npm ci` n'a pas pu les télécharger.
