# Benchmark Tasks for Docker Compose Best Practices Skill

Here are 3 benchmark tasks designed to evaluate whether the Docker Compose best practices skill meaningfully improves agent output quality.

## Task 1: Multi-Service Health Check Configuration

**ID:** `dc-01`

**Prompt:**
"I have a Node.js API that connects to PostgreSQL and Redis on startup. Write a `docker-compose.yml` that ensures the API only starts after both database services are healthy and ready to accept connections."

**Rubric:**

| Dimension | Criterion |
|-----------|-----------|
| `correctness` | Uses `depends_on` with `condition: service_healthy` and defines `healthcheck` blocks for both PostgreSQL (using `pg_isready`) and Redis (using `redis-cli ping`) |
| `completeness` | Includes all three services (api, postgres, redis), health check intervals/timeouts/retries, and proper restart policies |
| `pattern_adherence` | Uses health checks instead of fixed delays (e.g., no `sleep` or `wait-for-it` scripts); follows the skill's rule: "Always use `depends_on` with health checks rather than fixed delays" |
| `edge_cases` | Handles the case where a service becomes unhealthy after initial startup (restart policy), and configures reasonable timeout values to avoid infinite startup waits |

**Why this tests the skill:** The skill explicitly teaches using `depends_on` with health checks over fixed delays. An agent without this skill might use `restart: always` and hope for the best, or suggest a `wait-for-it.sh` script.

---

## Task 2: Network Isolation for Multi-Tenant Services

**ID:** `dc-02`

**Prompt:**
"I'm running three microservices: `auth`, `billing`, and `notifications`. The `auth` service needs to be reachable by both `billing` and `notifications`, but `billing` and `notifications` should NOT be able to communicate with each other directly. Write the `docker-compose.yml` networking configuration."

**Rubric:**

| Dimension | Criterion |
|-----------|-----------|
| `correctness` | Creates two explicit named networks (e.g., `billing-net` and `notifications-net`), places `auth` on both, and `billing`/`notifications` on their respective networks only |
| `completeness` | Defines all three services, both networks, assigns networks at the service level, and verifies isolation by not placing `billing` and `notifications` on the same network |
| `pattern_adherence` | Uses explicitly defined named networks instead of the default bridge network; follows the skill's rule: "Create explicit networks instead of relying on the default bridge network" |
| `edge_cases` | Considers that the default bridge network still exists and may need `external: false` or explicit attachment exclusion to prevent unintended connectivity |

**Why this tests the skill:** The skill specifically warns against relying on the default bridge network. This task requires understanding network isolation — agents without the skill typically just put all services on the default network.

---

## Task 3: Secure Configuration with Persistent Data

**ID:** `dc-03`

**Prompt:**
"Write a production-ready `docker-compose.yml` for a WordPress site with MySQL. The setup needs: persistent database storage that survives container recreation, and secure handling of the MySQL root password and WordPress database credentials."

**Rubric:**

| Dimension | Criterion |
|-----------|-----------|
| `correctness` | Uses named volumes for MySQL data persistence (e.g., `db_data:/var/lib/mysql`) and loads secrets from `.env` file or Docker secrets — not hard-coded in the compose file |
| `completeness` | Defines both services, named volumes in top-level `volumes:` block, environment variables using `${VAR}` syntax with `.env` file reference, and includes a `.env.example` or notes about required variables |
| `pattern_adherence` | Named volumes for persistent data (not bind mounts); secrets via `.env` or external manager; follows both "Use named volumes for persistent data" and "Never hard-code secrets in docker-compose.yml" |
| `edge_cases` | Addresses what happens if `.env` is missing (docker-compose behavior), includes `.env` in `.gitignore` recommendation, and considers volume backup strategy or volume driver options |

**Why this tests the skill:** This task combines two skill teachings — named volumes and secret management. It specifically probes the pitfall of hard-coding secrets, which the skill explicitly warns against. An agent without the skill often hard-codes `MYSQL_ROOT_PASSWORD: mypassword` directly in the YAML.
