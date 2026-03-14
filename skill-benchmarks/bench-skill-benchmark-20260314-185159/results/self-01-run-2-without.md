# Docker Compose Benchmark Tasks

Here are 3 tasks to evaluate the Docker Compose skill:

## Task 1

**Prompt:** Write a docker-compose.yml file for running a WordPress site with a MySQL backend.

**Rubric:**
- correctness: MySQL and WordPress are properly configured
- completeness: Includes all needed environment variables and ports
- pattern_adherence: Uses standard compose format
- edge_cases: Considers restart policies

## Task 2

**Prompt:** Set up a Docker Compose environment for a microservices architecture with 3 services.

**Rubric:**
- correctness: Services can communicate
- completeness: All services are defined
- pattern_adherence: Follows microservice patterns
- edge_cases: Handles service failures

## Task 3

**Prompt:** Create a Docker Compose file that includes monitoring with Prometheus and Grafana.

**Rubric:**
- correctness: Prometheus scrapes metrics correctly
- completeness: Both Prometheus and Grafana are configured
- pattern_adherence: Uses standard monitoring setup
- edge_cases: Data persistence is considered
