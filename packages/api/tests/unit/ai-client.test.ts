import {
  chatCompletion,
  ollamaBaseUrl,
  resolveGenerationModel,
} from "../../../shared/ai/client";
import {
  generateEmbedding,
  generateEmbeddings,
} from "../../../shared/ai/embeddings";

// The AI client talks to the self-hosted Ollama server over HTTP. These tests
// mock global fetch to assert the request shapes and the fail-loud behavior —
// no live Ollama host is required.

type FetchLike = typeof fetch;

function mockFetchResolved(payload: unknown, ok = true, status = 200): jest.Mock {
  const fn = jest.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => payload,
    text: async () =>
      typeof payload === "string" ? payload : JSON.stringify(payload),
  });
  global.fetch = fn as unknown as FetchLike;
  return fn;
}

function mockFetchRejected(err: Error): jest.Mock {
  const fn = jest.fn().mockRejectedValue(err);
  global.fetch = fn as unknown as FetchLike;
  return fn;
}

describe("Ollama AI client", () => {
  beforeEach(() => {
    process.env.OLLAMA_BASE_URL = "http://ollama.test:11434";
    process.env.OLLAMA_EMBEDDING_MODEL = "nomic-embed-text";
    process.env.OLLAMA_GENERATION_MODEL = "test-gen-model";
  });

  afterEach(() => {
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_EMBEDDING_MODEL;
    delete process.env.OLLAMA_GENERATION_MODEL;
    jest.restoreAllMocks();
  });

  it("chatCompletion posts to /api/chat and returns the message content", async () => {
    const fetchMock = mockFetchResolved({
      message: { role: "assistant", content: "a grounded answer" },
    });

    const out = await chatCompletion([{ role: "user", content: "hi" }], {
      temperature: 0.2,
    });

    expect(out).toBe("a grounded answer");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://ollama.test:11434/api/chat");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("test-gen-model");
    expect(body.stream).toBe(false);
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(body.options).toEqual({ temperature: 0.2 });
  });

  it("generateEmbedding posts to /api/embed and returns the vector", async () => {
    const fetchMock = mockFetchResolved({ embeddings: [[0.1, 0.2, 0.3]] });

    const vec = await generateEmbedding("a quiet novel");

    expect(vec).toEqual([0.1, 0.2, 0.3]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://ollama.test:11434/api/embed");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("nomic-embed-text");
    expect(body.input).toBe("a quiet novel");
  });

  it("generateEmbeddings returns one vector per input", async () => {
    mockFetchResolved({ embeddings: [[1, 2], [3, 4]] });
    await expect(generateEmbeddings(["a", "b"])).resolves.toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("fails loudly when the Ollama host is unreachable (no fallback)", async () => {
    mockFetchRejected(new Error("connect ECONNREFUSED"));
    await expect(
      chatCompletion([{ role: "user", content: "hi" }]),
    ).rejects.toThrow(/unreachable or timed out/i);
  });

  it("throws a clear error on a non-2xx Ollama response", async () => {
    mockFetchResolved({ error: "model not found" }, false, 404);
    await expect(generateEmbedding("x")).rejects.toThrow(/returned 404/i);
  });

  it("requires OLLAMA_BASE_URL", () => {
    delete process.env.OLLAMA_BASE_URL;
    expect(() => ollamaBaseUrl()).toThrow(/OLLAMA_BASE_URL is not configured/);
  });

  it("requires a generation model (pending the bake-off)", () => {
    delete process.env.OLLAMA_GENERATION_MODEL;
    expect(() => resolveGenerationModel()).toThrow(/generation model/i);
  });
});
