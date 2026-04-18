FROM node:20-bookworm-slim AS node_runtime

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

ARG PIP_INDEX_URL
ARG PIP_EXTRA_INDEX_URL

WORKDIR /app

COPY --from=node_runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node_runtime /usr/local/lib/node_modules /usr/local/lib/node_modules

RUN ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -sf /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

COPY pyproject.toml README.md ./
COPY app ./app

RUN set -eux; \
    for i in 1 2 3; do \
      set -- pip install --no-cache-dir --no-build-isolation --retries 10 --timeout 120; \
      if [ -n "${PIP_INDEX_URL:-}" ]; then set -- "$@" --index-url "$PIP_INDEX_URL"; fi; \
      if [ -n "${PIP_EXTRA_INDEX_URL:-}" ]; then set -- "$@" --extra-index-url "$PIP_EXTRA_INDEX_URL"; fi; \
      "$@" . && break; \
      if [ "$i" -eq 3 ]; then \
        echo "pip install failed after retries"; \
        exit 1; \
      fi; \
      echo "pip install failed (attempt $i), retrying..."; \
      sleep $((i * 5)); \
    done

RUN mkdir -p /app/data

EXPOSE 8001

CMD ["sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8001}"]
