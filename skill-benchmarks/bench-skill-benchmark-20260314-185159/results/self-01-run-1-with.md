# Benchmark Tasks for Docker Compose Best Practices Skill

Here are 3 benchmark tasks designed to measure whether the Docker Compose skill meaningfully improves agent output quality. Each task targets specific knowledge the skill teaches and includes a rubric with evaluable criteria across 4 dimensions.

---

## Task 1: Production-Ready Multi-Service Setup

**ID:** `dc-01`

**Prompt:**

> Create a `docker-compose.yml` for a web application with the following services: a Node.js API server, a PostgreSQL database, and a Redis cache. The setup should be production-ready and follow best practices for service dependencies, networking, and data persistence.

**Rubric:**

| Dimension | Criterion |
|-----------|-----------|
| `correctness` | Uses `depends_on` with `condition: service_healthy` and defines `healthcheck` blocks for PostgreSQL and Redis rather than using fixed `sleep` delays or bare `depends_on` |
| `completeness` | Includes all three services with proper health checks, named volumes for PostgreSQL data, an explicit custom network, and environment variables sourced from `.env` or secrets — no hard-coded credentials |
| `pattern_adherence` | Creates an explicit named network (not relying on the default bridge), uses named volumes (not bind mounts) for persistent database storage, and separates secrets from the compose file |
| `edge_cases` | Handles the scenario where PostgreSQL is slow to accept connections by using a proper health check command (`pg_isready`) rather than just checking if the port is open |

---

## Task 2: Development vs. Production Override

**ID:** `dc-02`

**Prompt:**

> Write a `docker-compose.yml` base file and a `docker-compose.override.yml` for development that adds bind mounts for hot reloading. The application has a Python Flask API and a MySQL database. Explain when to use bind mounts vs. named volumes.

**Rubric:**

| Dimension | Criterion |
|-----------|-----------|
| `correctness` | Base compose uses named volumes for MySQL data persistence; override file introduces bind mounts only for the application source code in development — correctly distinguishing the two use cases |
| `completeness` | Provides both files, explains the volume distinction (named for persistence, bind for dev iteration), includes health check for MySQL, and does not hard-code database credentials in either file |
| `pattern_adherence` | Follows the compose file override pattern (base + override), uses named volumes in production, bind mounts only in development override as the skill specifies |
| `edge_cases` | Addresses the risk of bind-mounting over the `node_modules` or `venv` directory inside the container, and the pitfall of relying on bind mounts in production environments |

---

## Task 3: Secrets Management in Docker Compose

**ID:** `dc-03`

**Prompt:**

> You have a `docker-compose.yml` with a PostgreSQL database and a Django application. The current setup has database credentials hard-coded in the environment section. Refactor it to follow security best practices for secret management.

**Rubric:**

| Dimension | Criterion |
|-----------|-----------|
| `correctness` | Removes hard-coded credentials from `docker-compose.yml` and replaces them with either `.env` file references (`${VAR}` syntax) or Docker secrets (`secrets:` top-level key) |
| `completeness` | Covers both the database service and the application service credentials, adds `.env` to `.gitignore`, and shows the `.env` file format or secret file structure |
| `pattern_adherence` | Follows the skill's directive: "Never hard-code secrets in docker-compose.yml. Use .env files or external secret managers" — demonstrates at least one of the recommended approaches |
| `edge_cases` | Addresses the pitfall of committing `.env` files to version control, and mentions that Docker secrets (with Swarm or compose secrets) provide better security than `.env` for production deployments |
