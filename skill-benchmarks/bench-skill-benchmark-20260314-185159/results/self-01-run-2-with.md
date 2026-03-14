# Benchmark Tasks — Docker Compose Best Practices

Below are 3 benchmark tasks with detailed rubrics targeting the specific knowledge taught by the Docker Compose skill: health-check-based dependencies, explicit networking, named volumes, and secrets management.

---

## Task 1: Migrating from `links` to Modern Networking

**ID:** `dc-01`

**Prompt:**

> You inherited a legacy `docker-compose.yml` that uses `links:` to connect a Rails app to a PostgreSQL database and a Memcached service. The file also uses the default bridge network. Refactor it to use modern Docker Compose networking practices.

**Rubric:**

| Dimension | Criterion |
|-----------|-----------|
| `correctness` | Replaces deprecated `links:` with an explicit user-defined network, uses service names as hostnames for DNS-based discovery, and removes any hardcoded IP addresses |
| `completeness` | Covers all three services (Rails, PostgreSQL, Memcached), creates at least one named network, updates connection strings to use service names, and adds `depends_on` with health checks |
| `pattern_adherence` | Creates an explicit named network instead of relying on the default bridge (directly follows the skill's networking section). Uses named volumes for PostgreSQL data storage |
| `edge_cases` | Addresses services that may need to be on different network segments (e.g., isolating the database from the cache), and handles the case where legacy code references container names differently than service names |

---

## Task 2: Health Check Configuration for a Microservices Stack

**ID:** `dc-02`

**Prompt:**

> Set up `depends_on` with health checks for a stack containing: an API gateway, two microservices (auth-service and order-service), a RabbitMQ message broker, and a MongoDB database. Each service should only start after its dependencies are truly ready, not just running.

**Rubric:**

| Dimension | Criterion |
|-----------|-----------|
| `correctness` | Each service specifies `depends_on` with `condition: service_healthy`, and each dependency has a meaningful `healthcheck` command (e.g., `rabbitmqctl status` for RabbitMQ, `mongosh --eval "db.runCommand('ping')"` for MongoDB) |
| `completeness` | All 5 services have correct dependency chains, health check definitions include `interval`, `timeout`, `retries`, and `start_period` fields, and the startup order matches the logical dependency graph |
| `pattern_adherence` | Uses `depends_on` with health checks rather than fixed delays or wrapper scripts — exactly as specified by the skill's Service Dependencies section |
| `edge_cases` | Addresses what happens when RabbitMQ takes longer than expected to initialize (tuning `start_period` and `retries`), and handles the circular dependency risk if services depend on each other |

---

## Task 3: Secure Environment Variable Management

**ID:** `dc-03`

**Prompt:**

> A team's `docker-compose.yml` contains the following environment block for a Python service: `POSTGRES_PASSWORD: mysecretpassword`, `API_KEY: sk-prod-1234567890`, `JWT_SECRET: hardcoded-jwt-secret`. Refactor this to follow secret management best practices, providing at least two approaches (development and production).

**Rubric:**

| Dimension | Criterion |
|-----------|-----------|
| `correctness` | Removes all hard-coded credentials from the compose file, demonstrates `.env` file approach with `${VAR}` substitution syntax for development, and Docker secrets or external secret manager for production |
| `completeness` | Covers all three secrets (DB password, API key, JWT secret), shows both a dev approach (.env) and production approach (Docker secrets or vault), includes `.gitignore` entry for `.env`, and provides example `.env` file |
| `pattern_adherence` | Directly implements the skill's guidance: "Never hard-code secrets in docker-compose.yml. Use .env files or external secret managers" — demonstrates both recommended paths |
| `edge_cases` | Warns about `.env` files being accidentally committed to git, mentions that `docker compose config` can leak interpolated secrets to stdout, and addresses secret rotation strategy |
