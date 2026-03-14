# Benchmark for Docker Compose

## Task 1: Multi-container app

**Prompt:** Build a docker-compose.yml with nginx, node app, and postgres.

**Rubric:**
- correctness: Services start and work together
- completeness: All three services configured
- pattern_adherence: Uses docker compose conventions
- edge_cases: Handles port conflicts

## Task 2: Database backup

**Prompt:** Add a backup service to an existing docker-compose setup that dumps a MySQL database daily.

**Rubric:**
- correctness: Backup command runs correctly
- completeness: Includes scheduling and storage
- pattern_adherence: Clean compose syntax
- edge_cases: Handles backup failures

## Task 3: Multi-stage builds

**Prompt:** Optimize a Docker Compose setup using multi-stage builds for a Go application.

**Rubric:**
- correctness: Multi-stage build produces working image
- completeness: Both build and runtime stages defined
- pattern_adherence: Follows Docker build best practices
- edge_cases: Handles dependency caching
