# Benchmark Design: Docker Compose Best Practices

Three benchmark tasks for A/B testing the Docker Compose skill. Each targets specific teachings from the skill to ensure measurable deltas between "with" and "without" variants.

---

## Task 1: Container Startup Orchestration

**ID:** `dc-01`

**Prompt:**

> Design a `docker-compose.yml` for a three-tier application: Nginx reverse proxy → Express.js API → PostgreSQL database with PostGIS extension. The critical requirement is that each service must wait for its downstream dependency to be fully operational before starting — not just running.

**Rubric:**

| Dimension | Criterion |
|-----------|-----------|
| `correctness` | Uses `depends_on` with `condition: service_healthy` for the startup chain (Nginx → API → DB). Each service's `healthcheck` uses an appropriate command: `pg_isready` for PostgreSQL, an HTTP endpoint check for Express, and a connectivity check for Nginx |
| `completeness` | Defines health checks with all relevant fields (interval, timeout, retries, start_period) for all services. Includes named volumes for PostgreSQL data, explicit network definitions, and sources credentials from `.env` |
| `pattern_adherence` | Follows the skill's directive on using health-check-based `depends_on` instead of fixed delays, explicit named networks rather than default bridge, and named volumes over bind mounts for persistent data |
| `edge_cases` | Handles PostGIS extension initialization timing (database may accept connections before extensions are loaded), and the Nginx startup failure if upstream is unavailable (configures retry or fail-open behavior) |

---

## Task 2: Data Persistence Strategy

**ID:** `dc-02`

**Prompt:**

> A development team uses bind mounts (`./data:/var/lib/postgresql/data`) for their PostgreSQL database in both development and production Docker Compose files. They frequently lose data after `docker compose down -v`. Diagnose the problem and propose a corrected setup that properly distinguishes dev and production volume strategies.

**Rubric:**

| Dimension | Criterion |
|-----------|-----------|
| `correctness` | Correctly identifies that `docker compose down -v` removes named volumes AND bind mounts, and explains that named volumes with explicit declarations survive `down` (without `-v`). Proposes named volumes for production |
| `completeness` | Provides both a corrected production compose (named volumes) and development compose (bind mounts acceptable), explains the `down -v` flag behavior, includes backup strategy for named volumes |
| `pattern_adherence` | Directly follows the skill's volume guidance: "Use named volumes for persistent data. Bind mounts are for development only" — shows clear separation between environments |
| `edge_cases` | Addresses the scenario where a developer accidentally runs `down -v` in production, recommends external backup of named volumes, and mentions that bind mount paths are host-OS dependent (Windows vs Linux path formats) |

---

## Task 3: Network Isolation and Security

**ID:** `dc-03`

**Prompt:**

> You have a compose stack with a public-facing web app, an internal API, a worker process, and a Redis cache. Currently all services are on the default network and can all reach each other. Redesign the networking to follow the principle of least privilege — each service should only be able to communicate with the services it actually needs.

**Rubric:**

| Dimension | Criterion |
|-----------|-----------|
| `correctness` | Creates multiple explicit named networks (e.g., `frontend`, `backend`, `worker-net`) and assigns each service only to the networks it needs. The web app and API share a network, the API and Redis share another, and the worker and Redis share a third |
| `completeness` | Covers all 4 services, defines all needed networks, explains which service is on which network and why, and includes the `networks:` top-level definition block |
| `pattern_adherence` | Follows the skill's networking principle: "Create explicit networks instead of relying on the default bridge network" — implements network segmentation rather than a flat topology |
| `edge_cases` | Handles the case where the web app might need to reach Redis directly for session storage (requires an additional shared network), and notes that the `default` network still exists unless explicitly disabled with `external: false` |
