# AI Provider — self-hosted Ollama

Folio's AI features (embeddings for taste-discovery, and recommendation-rationale
generation) run against a **self-hosted [Ollama](https://ollama.com) server on
the LAN**, not a hosted API.

## Why self-hosted

- **Cost.** No per-token billing; the models run on hardware we already own.
- **Data locality / privacy.** Users' reading journals and reflections are
  personal. With self-hosting that text never leaves the network — nothing is
  sent to a third-party API.
- **Control.** We pick and version the exact models (including the generation
  bake-off) without a vendor changing them underneath us.

## Configuration

All via environment variables (see `.env.example`). The real LAN address lives
only in the local, gitignored `.env` and is **never committed**.

| Variable | Purpose | Example |
| --- | --- | --- |
| `OLLAMA_BASE_URL` | Base URL of the Ollama server | `http://localhost:11434` |
| `OLLAMA_EMBEDDING_MODEL` | Embedding model (768-dim) | `nomic-embed-text` |
| `OLLAMA_GENERATION_MODEL` | Generation model | *(unset — pending bake-off)* |

## Models

- **Embeddings:** `nomic-embed-text` — 768-dimensional vectors (confirmed from a
  live response). Backs `BookEmbedding` and `TasteProfile.embedding`; similarity
  is computed in Postgres via pgvector cosine distance.
- **Generation:** chosen by the **C2 bake-off** between `gemma4:26b` and
  `qwen3.6:27b-64k` (both already pulled on the host). Until a winner is set in
  `OLLAMA_GENERATION_MODEL`, any generation call fails fast. The chosen value and
  the reasoning will be recorded here once the bake-off runs.

## Endpoints used

- `POST {OLLAMA_BASE_URL}/api/embed` — `{ model, input }` → `{ embeddings: number[][] }`
  (one vector per input).
- `POST {OLLAMA_BASE_URL}/api/chat` — `{ model, messages, stream: false }` →
  `{ message: { role, content } }`.

## Failure behavior — no silent fallback

There is **no fallback to a hosted provider**. If `OLLAMA_BASE_URL` is unset, the
generation model is unconfigured, or the host is unreachable / times out, the
call throws a clear, actionable error. This is intentional: a silent failover
would send private data off-network, which the privacy model forbids.
