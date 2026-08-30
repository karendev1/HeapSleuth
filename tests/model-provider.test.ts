import { describe, expect, it, vi } from "vitest";

import {
  GeminiInteractionsProvider,
  GEMINI_INTERACTIONS_ENDPOINT,
} from "../src/model/gemini-interactions-provider.js";
import { ProviderRequestError } from "../src/model/model-provider.js";

describe("Gemini Interactions provider", () => {
  it("sends one stored-disabled, tool-free structured request", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: "interaction-1",
            model: "gemini-3.6-flash",
            status: "completed",
            steps: [
              {
                type: "model_output",
                content: [
                  { type: "text", text: '{"caseId":"event-listener"}' },
                ],
              },
            ],
            usage: {
              total_input_tokens: 120,
              total_output_tokens: 30,
              total_thought_tokens: 10,
              total_tokens: 160,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const provider = new GeminiInteractionsProvider(
      "gemini-3.6-flash",
      "test-secret",
      fetchImplementation,
    );

    const response = await provider.generate({
      caseId: "event-listener",
      prompt: "Static prompt",
    });

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImplementation.mock.calls[0] ?? [];
    expect(url).toBe(GEMINI_INTERACTIONS_ENDPOINT);
    expect(String(url)).not.toContain("test-secret");
    expect(options?.method).toBe("POST");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(options?.headers).toMatchObject({
      "Content-Type": "application/json",
      "x-goog-api-key": "test-secret",
    });
    const bodyText = String(options?.body);
    expect(bodyText).not.toContain("test-secret");
    const body = JSON.parse(bodyText);
    expect(body).toMatchObject({
      model: "gemini-3.6-flash",
      input: "Static prompt",
      store: false,
      stream: false,
      background: false,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: {
          type: "object",
          additionalProperties: false,
        },
      },
      generation_config: {
        max_output_tokens: 1_200,
        seed: 0,
        thinking_level: "low",
        thinking_summaries: "none",
      },
    });
    expect(body).not.toHaveProperty("tools");
    expect(body.generation_config).not.toHaveProperty("temperature");
    expect(response).toEqual({
      text: '{"caseId":"event-listener"}',
      responseId: "interaction-1",
      usage: { inputTokens: 120, outputTokens: 40, totalTokens: 160 },
    });
  });

  it("rejects an incomplete interaction without returning partial output", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: "interaction-2",
            status: "incomplete",
            steps: [
              {
                type: "model_output",
                content: [{ type: "text", text: "partial" }],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const provider = new GeminiInteractionsProvider(
      "gemini-3.6-flash",
      "test-secret",
      fetchImplementation,
    );

    await expect(
      provider.generate({ caseId: "event-listener", prompt: "Static prompt" }),
    ).rejects.toThrow("incomplete");
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("selects the independent verification response schema", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: "verification-1",
            status: "completed",
            output_text:
              '{"decision":"accept","issues":[],"revisedDiagnosis":null,"verificationSummary":"Supported."}',
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const provider = new GeminiInteractionsProvider(
      "gemini-3.6-flash",
      "test-secret",
      fetchImplementation,
    );

    await provider.generate({
      caseId: "event-listener",
      prompt: "Verifier prompt",
      responseFormat: "verification",
    });

    const [, options] = fetchImplementation.mock.calls[0] ?? [];
    const body = JSON.parse(String(options?.body));
    expect(body.response_format.schema).toMatchObject({
      type: "object",
      required: [
        "decision",
        "issues",
        "revisedDiagnosis",
        "verificationSummary",
      ],
      properties: {
        decision: { enum: ["accept", "revise", "inconclusive"] },
      },
    });
  });

  it("accepts a wrapped legacy output with partial usage fields", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            interaction: {
              id: "interaction-wrapped",
              outputs: [{ type: "text", text: '{"caseId":"event-listener"}' }],
              usage: {
                total_input_tokens: 90,
                total_output_tokens: 20,
                total_thought_tokens: 5,
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const provider = new GeminiInteractionsProvider(
      "gemini-3.6-flash",
      "test-secret",
      fetchImplementation,
    );

    await expect(
      provider.generate({ caseId: "event-listener", prompt: "Static prompt" }),
    ).resolves.toEqual({
      text: '{"caseId":"event-listener"}',
      responseId: "interaction-wrapped",
      usage: { inputTokens: 90, outputTokens: 25, totalTokens: 115 },
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("does not discard valid output when optional usage has another shape", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            status: "completed",
            steps: [
              {
                type: "model_output",
                content: [
                  { type: "text", text: '{"caseId":"event-listener"}' },
                ],
              },
            ],
            usage: { totalTokens: "not-the-REST-shape" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const provider = new GeminiInteractionsProvider(
      "gemini-3.6-flash",
      "test-secret",
      fetchImplementation,
    );

    await expect(
      provider.generate({ caseId: "event-listener", prompt: "Static prompt" }),
    ).resolves.toEqual({
      text: '{"caseId":"event-listener"}',
    });
  });

  it("reports a Gemini quota response without retrying", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              code: 429,
              status: "RESOURCE_EXHAUSTED",
              message: "Free-tier quota exhausted.",
            },
          }),
          { status: 429, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const provider = new GeminiInteractionsProvider(
      "gemini-3.6-flash",
      "test-secret",
      fetchImplementation,
    );

    await expect(
      provider.generate({ caseId: "event-listener", prompt: "Static prompt" }),
    ).rejects.toThrow(
      "Gemini request failed with HTTP 429: Free-tier quota exhausted.",
    );
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("classifies an injected transport failure without retrying", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => {
      throw new Error("Network unavailable.");
    });
    const provider = new GeminiInteractionsProvider(
      "gemini-3.6-flash",
      "test-secret",
      fetchImplementation,
    );

    await expect(
      provider.generate({ caseId: "event-listener", prompt: "Static prompt" }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("reports a bounded request timeout without retrying", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    const provider = new GeminiInteractionsProvider(
      "gemini-3.6-flash",
      "test-secret",
      fetchImplementation,
      25,
    );

    await expect(
      provider.generate({ caseId: "event-listener", prompt: "Static prompt" }),
    ).rejects.toThrow("Gemini request timed out after 25 ms.");
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });
});
