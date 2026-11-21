# Jurassic Maths — déploiement Render + Neon

Ce projet est complet : il contient le quiz React/Vite, le T. rex HD, le backend Node.js, l'accès enseignant `/admin` et l'enregistrement dans Neon PostgreSQL. Aucun élève n'a besoin de créer de compte ni de saisir de code.

**Important :** l'IP et l'identifiant de navigateur peuvent aider à regrouper des visites mais ne prouvent pas l'identité de l'élève. Informez l'élève de la collecte des données et de leur conservation.

## 1. Cas de ton dépôt actuel `mathmaze`

Ton dépôt GitHub contient déjà le vrai projet **dans `daily-math/`**. Les fichiers `package.json` et `package-lock.json` placés directement à la racine `mathmaze/` correspondent à une fausse piste et ne doivent pas servir à la compilation.

- Ouvre Render → ton **Web Service** → **Settings** → **Build & Deploy**.
- Règle **Root Directory** sur `daily-math` (ni `mathmaze`, ni `mathmaze/daily-math`).
- Mets **Build Command** à `npm ci && npm run build`.
- Mets **Start Command** à `node server/index.mjs`.
- Sur GitHub, assure-toi d'avoir les `daily-math/package.json`, `daily-math/package-lock.json` et `daily-math/src/AdminDashboard.tsx` **corrigés**. Utilise le ZIP « correctif du dépôt existant » fourni à part.
- Sur Render → **Environment**, renseigne `DATABASE_URL` (Neon) et `ADMIN_PASSWORD` (12 caractères minimum). Ne publie jamais ces valeurs.
- Redéploie le dernier commit.

Si tu utilises un **Blueprint** Render, un `render.yaml` placé à la racine du dépôt peut contenir `rootDir: daily-math` (celui du ZIP « correctif » est déjà prêt).

## 2. Cas d'un nouveau dépôt propre (ZIP « projet complet »)

Les fichiers de ce ZIP constituent la **racine du projet**, sans dossier `daily-math` supplémentaire. Dépose-les dans un nouveau dépôt GitHub privé, à la racine, avec `render.yaml`, `package.json` et `tsconfig.json` au même niveau.

Dans Render, crée un service Web Node (plan Free) :
- **Root Directory** : vide ;
- **Build Command** : `npm ci && npm run build` ;
- **Start Command** : `node server/index.mjs` ;
- **Environment** : `DATABASE_URL`, `ADMIN_PASSWORD`.

Tu peux aussi créer un **Blueprint** utilisant le `render.yaml` fourni.

## 3. Tester avant le déploiement

Dans le dossier qui contient **le bon** `package.json` :

```bash
npm ci
npm run build
npm run lint
```

Un avertissement sur la taille du bundle n'empêche pas la mise en ligne. Le serveur démarre seulement si les variables `DATABASE_URL` et `ADMIN_PASSWORD` sont configurées.

Pour tester localement : copie `.env.example` en `.env`, remplis les variables **uniquement sur ton ordinateur**, puis exécute :

```bash
node --env-file=.env server/index.mjs
```

Ouvre `http://localhost:3001` et `http://localhost:3001/admin`. Si tu utilises Vite (`npm run dev`), il faut un proxy pour `/api` ou tester directement avec le serveur sur le port 3001.

## 4. Vérification une fois Render actif

- `https://TON-SITE.onrender.com/api/health` → `{ "ok": true }`.
- `https://TON-SITE.onrender.com/` → quiz + T. rex HD.
- `https://TON-SITE.onrender.com/admin` → connexion professeur, résultats, export CSV.
- Neon : une table `homework_attempts` est créée au premier démarrage.

Render Free peut se mettre en veille après inactivité. Neon conserve les données quand Render redémarre. Les quotas gratuits peuvent évoluer.

## 5. Fichiers sensibles

**Ne publie jamais** `.env`, `node_modules/`, `.git/`, `dist/` ou `server/stats.json`. Le ZIP nettoyé ne les contient pas. Ton dépôt GitHub d'origine avait `daily-math/server/stats.json` suivi par Git : pour arrêter de le suivre, exécute à la racine du dépôt :

```bash
git rm --cached daily-math/server/stats.json
git add daily-math/.gitignore
git commit -m "Ne plus versionner les statistiques locales"
git push
```

Cela supprime le fichier de la version courante du dépôt mais **pas des anciens commits**. Si le dépôt a été rendu public, examine l'historique et traite les données personnelles qui y figurent.

Le mot de passe enseignant et la connexion Neon restent uniquement dans les variables secrètes de Render. Évite les variables client `VITE_` pour ces secrets.

## 6. Ce qui a été vérifié

- Compilation TypeScript + Vite : réussie localement.
- ESLint : réussi localement.
- Cohérence du `package-lock.json` avec `npm ci --dry-run --offline` : réussie.
- Syntaxe du serveur Node : validée.
- **Non vérifié :** connexion réelle à ton compte Neon, démarrage sur Render et usage dans un navigateur public. Ces tests nécessitent tes comptes privés.
