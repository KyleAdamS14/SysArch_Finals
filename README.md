# Pokemon Team Tracker: Dockerized, with Jenkins CI/CD

A small multi-module app (build and look up Pokemon teams) packaged with **Docker**
and automatically tested, built and deployed by **Jenkins** every time code is pushed.

## Architecture

```
Browser --> proxy (Nginx, published on :8080)
              |-- /              --> frontend        (static Nginx)
              |-- /api/pokemon   --> team-api        (Node/Express) --> db (PostgreSQL, volume db-data)
              `-- /api/lookup    --> lookup-service  (Node/Express) --> pokeapi.co

network: pokemon-net     volume: db-data

Developer --git push--> GitHub --(Jenkins polls every 2 min)--> Jenkins
Jenkins: Checkout > Test > Build Images (tag = build #) > Deploy > Smoke Test
```

| Container | Technology | Role |
|---|---|---|
| proxy | Nginx 1.27 (unprivileged) | Only public entry point (port 8080) |
| frontend | Static HTML/JS on Nginx | Pages; footer shows the build number |
| team-api | Node 20 + Express + pg | CRUD for Pokemon records, `/health` |
| lookup-service | Node 20 + Express + axios | PokeAPI relay + typo suggestions, `/health` |
| db | PostgreSQL 16 (Alpine) | Stores records in named volume `db-data` |
| jenkins (separate compose) | Jenkins LTS + Docker CLI | CI/CD server on port 8081 |

## Prerequisites
Git and Docker Desktop (Windows: WSL 2 enabled). Check with `docker version`, `docker compose version`, `git --version`.

## 1. Run the app (no Jenkins yet)
```
copy .env.example .env        # Windows (use cp on Mac/Linux), then edit the password in .env
docker compose up -d --build
```
Open http://localhost:8080. Useful commands:
```
docker compose ps             # what is running + health
docker compose logs -f team-api
docker compose down           # stop (data is kept in the volume)
docker compose down -v        # stop AND delete the database volume
```

## 2. Start Jenkins
```
cd infra/jenkins
docker compose up -d --build
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```
Open http://localhost:8081, paste the password, install suggested plugins, then also install **Docker Pipeline**, and create the admin user.
Check Jenkins can use Docker: `docker exec jenkins docker ps`.

## 3. Jenkins credentials and job
1. Manage Jenkins > Credentials > Global > Add: kind **Secret file**, upload your real `.env`, ID = `pokemonteam-env`.
2. If the repo is private, also add a GitHub personal access token (kind: Username with password).
3. New Item > **Pipeline** > *Pipeline script from SCM* > Git > repository URL, branch `*/main`, Script Path `Jenkinsfile`.
4. Run **Build Now** once. This first run also registers the Poll SCM trigger written in the Jenkinsfile.

## 4. Automatic trigger
The Jenkinsfile contains `pollSCM('H/2 * * * *')`: Jenkins checks the repository every ~2 minutes and builds when there is a new commit. No manual click needed.
(Faster option: a GitHub webhook to `https://<public-url>/github-webhook/` through ngrok, plus `githubPush()` in `triggers`.)

## 5. Demo checklist
1. Show `docker compose ps` and http://localhost:8080 (footer shows the build number).
2. Change a heading, `git commit`, `git push`. Watch Jenkins start the build by itself.
3. Refresh the page: the change and the new build number are live.
4. Break a test (for example change an expected value in `team-api/tests/app.test.js`), push: the build fails at **Test**, the site stays on the old version. Revert and push again.
5. Persistence: add a Pokemon, redeploy, it is still there (named volume `db-data`).
6. Rollback to an older build, for example build 5:
```
TAG=5 docker compose -p pokemonteam up -d --no-build
```
(this works because every image is tagged with its build number).

## Run tests locally
```
cd team-api && npm install && npm test
cd ../lookup-service && npm install && npm test
```

## Security note
Jenkins mounts `/var/run/docker.sock` and runs as root. This gives Jenkins full control of the host's Docker. Acceptable for a lab, not for production. Safer options: dedicated build agents, rootless Docker, Docker-in-Docker with TLS, Kaniko.

## Notes
`validate.js` is intentionally copied into `frontend/`, `team-api/src/` and `lookup-service/src/` because each Docker image is built only from its own folder. If you change the rules, update all three copies.

## Team
| Role | Member |
|---|---|
| Project Lead / Scrum Master | Santos, Kyle Adam P. |
| DevOps / CI-CD Engineer | Aguila, Thiro S. |
| Infrastructure Engineer | Serrano, Jondy C. |
| Backend and Database Engineer | Peralta, Zhyrus O. |
| Frontend, QA, and Documentation Lead | Turla, Jhoel Renz S. |
