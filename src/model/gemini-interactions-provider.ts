import { z } from "zod";

import type {
  ModelProvider,
  ModelProviderRequest,
  ModelProviderResponse,
} from "./model-provider.js";
import { ProviderRequestError } from "./model-provider.js";
import type { ModelRequestSettings } from "./types.js";

export const GEMINI_INTERACTIONS_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/interactions";
export const GEMINI_REQUEST_TIMEOUT_MS = 120_000;

export const BASELINE_MODEL_SETTINGS = {
  temperature: null,
  maxOutputTokens: 1_200,
  store: false,
  toolsEnabled: false,
  seed: 0,
  thinkingLevel: "low",
} as const satisfies ModelRequestSettings;

const geminiErrorSchema = z.object({
  error: z
    .object({
      code: z.number().int().optional(),
      message: z.string().optional(),
      status: z.string().optional(),
    })
    .optional(),
});

const geminiStepsSchema = z.array(
  z.object({
    type: z.string(),
    content: z
      .array(
        z.object({
          type: z.string(),
          text: z.string().optional(),
        }),
      )
      .optional(),
  }),
);

const geminiLegacyOutputsSchema = z.array(
  z.object({
    type: z.string(),
    text: z.string().optional(),
  }),
);

const geminiUsageSchema = z.object({
  total_input_tokens: z.number().int().nonnegative().optional(),
  total_output_tokens: z.number().int().nonnegative().optional(),
  total_thought_tokens: z.number().int().nonnegative().optional(),
  total_tokens: z.number().int().nonnegative().optional(),
});

const geminiInteractionSchema = z.object({
  id: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  status: z.string().optional(),
  output_text: z.string().optional(),
  steps: z.unknown().optional(),
  outputs: z.unknown().optional(),
  usage: z.unknown().optional(),
});

const geminiInteractionEnvelopeSchema = z.union([
  z.object({ interaction: geminiInteractionSchema }),
  geminiInteractionSchema,
]);

function describeEnvelopeShape(payload: unknown): string {
  if (payload === null) return "root:null";
  if (Array.isArray(payload)) return `root:array(${payload.length})`;
  if (typeof payload !== "object") return `root:${typeof payload}`;

  const root = payload as Record<string, unknown>;
  const rootShape = Object.entries(root)
    .slice(0, 12)
    .map(
      ([key, value]) =>
        `${key}:${Array.isArray(value) ? "array" : value === null ? "null" : typeof value}`,
    )
    .join("|");
  const nestedShape = Object.entries(root)
    .filter(
      ([, value]) =>
        value !== null && typeof value === "object" && !Array.isArray(value),
    )
    .slice(0, 4)
    .map(
      ([key, value]) =>
        `${key}{${Object.keys(value as Record<string, unknown>)
          .slice(0, 12)
          .join("|")}}`,
    )
    .join(",");

  return nestedShape.length === 0
    ? `root{${rootShape}}`
    : `root{${rootShape}} nested{${nestedShape}}`;
}

const diagnosisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "caseId",
    "verdict",
    "mechanism",
    "rootCause",
    "evidence",
    "confidence",
    "recommendedFix",
    "limitations",
  ],
  properties: {
    caseId: { type: "string" },
    verdict: { type: "string", enum: ["leak", "no-leak", "inconclusive"] },
    mechanism: { type: ["string", "null"] },
    rootCause: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["file", "symbol"],
          properties: {
            file: { type: "string" },
            symbol: { type: "string" },
          },
        },
        { type: "null" },
      ],
    },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source", "claim"],
        properties: {
          source: {
            type: "string",
            enum: ["runtime", "heap", "source", "console"],
          },
          claim: { type: "string" },
        },
      },
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    recommendedFix: { type: ["string", "null"] },
    limitations: { type: "array", items: { type: "string" } },
  },
} as const;

function extractOutputText(
  interaction: z.infer<typeof geminiInteractionSchema>,
): string {
  if (
    interaction.output_text !== undefined &&
    interaction.output_text.length > 0
  ) {
    return interaction.output_text;
  }

  const parsedSteps = geminiStepsSchema.safeParse(interaction.steps);
  const modelOutput = [...(parsedSteps.success ? parsedSteps.data : [])]
    .reverse()
    .find((step) => step.type === "model_output");
  const output = (modelOutput?.content ?? [])
    .filter((content) => content.type === "text")
    .map((content) => content.text ?? "")
    .join("");
  if (output.length === 0) {
    const parsedLegacyOutputs = geminiLegacyOutputsSchema.safeParse(
      interaction.outputs,
    );
    const legacyOutput = (
      parsedLegacyOutputs.success ? parsedLegacyOutputs.data : []
    )
      .filter((content) => content.type === "text")
      .map((content) => content.text ?? "")
      .join("");
    if (legacyOutput.length > 0) return legacyOutput;

    throw new ProviderRequestError(
      "Gemini returned no output text for the baseline interaction.",
    );
  }

  return output;
}

export class GeminiInteractionsProvider implements ModelProvider {
  readonly kind = "gemini-interactions";
  readonly settings = BASELINE_MODEL_SETTINGS;

  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly fetchImplementation: typeof fetch = fetch,
    private readonly requestTimeoutMs = GEMINI_REQUEST_TIMEOUT_MS,
  ) {}

  async generate(
    request: ModelProviderRequest,
  ): Promise<ModelProviderResponse> {
    let response: Response;
    try {
      response = await this.fetchImplementation(GEMINI_INTERACTIONS_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        signal: AbortSignal.timeout(this.requestTimeoutMs),
        body: JSON.stringify({
          model: this.model,
          input: request.prompt,
          store: this.settings.store,
          stream: false,
          background: false,
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema: diagnosisJsonSchema,
          },
          generation_config: {
            max_output_tokens: this.settings.maxOutputTokens,
            seed: this.settings.seed,
            thinking_level: this.settings.thinkingLevel,
            thinking_summaries: "none",
          },
        }),
      });
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        throw new ProviderRequestError(
          `Gemini request timed out after ${this.requestTimeoutMs} ms.`,
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new ProviderRequestError(
        `Gemini request could not be completed: ${message}`,
      );
    }

    const responseText = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = undefined;
    }
    if (!response.ok) {
      const providerError = geminiErrorSchema.safeParse(payload);
      const structuredMessage = providerError.success
        ? providerError.data.error?.message
        : undefined;
      const plainMessage =
        structuredMessage === undefined && responseText.trim().length > 0
          ? responseText.replace(/\s+/g, " ").trim().slice(0, 500)
          : undefined;
      const message = structuredMessage ?? plainMessage;
      throw new ProviderRequestError(
        `Gemini request failed with HTTP ${response.status}${
          message === undefined ? "." : `: ${message}`
        }`,
      );
    }

    const parsed = geminiInteractionEnvelopeSchema.safeParse(payload);
    if (!parsed.success) {
      const issueSummary = parsed.error.issues
        .slice(0, 4)
        .map((issue) => `${issue.path.join(".") || "root"}:${issue.code}`)
        .join(", ");
      throw new ProviderRequestError(
        `Gemini returned an invalid Interactions API envelope (${issueSummary}; ${describeEnvelopeShape(payload)}).`,
      );
    }
    const interaction =
      "interaction" in parsed.data ? parsed.data.interaction : parsed.data;
    if (
      interaction.status !== undefined &&
      interaction.status !== "completed"
    ) {
      throw new ProviderRequestError(
        `Gemini interaction did not complete successfully: ${interaction.status}.`,
      );
    }

    const parsedUsage = geminiUsageSchema.safeParse(interaction.usage);
    const usage = parsedUsage.success ? parsedUsage.data : undefined;
    const inputTokens = usage?.total_input_tokens;
    const generatedTokens = usage?.total_output_tokens;
    const thoughtTokens = usage?.total_thought_tokens ?? 0;
    const normalizedUsage =
      inputTokens === undefined || generatedTokens === undefined
        ? undefined
        : {
            inputTokens,
            outputTokens: generatedTokens + thoughtTokens,
            totalTokens:
              usage?.total_tokens ??
              inputTokens + generatedTokens + thoughtTokens,
          };
    return {
      text: extractOutputText(interaction),
      ...(interaction.id === undefined ? {} : { responseId: interaction.id }),
      ...(normalizedUsage === undefined ? {} : { usage: normalizedUsage }),
    };
  }
}
