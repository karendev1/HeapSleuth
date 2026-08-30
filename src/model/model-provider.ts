import type { ModelRequestSettings, ModelUsage } from "./types.js";

export type ModelProviderRequest = {
  caseId: string;
  prompt: string;
  responseFormat?: "diagnosis" | "verification";
};

export type ModelProviderResponse = {
  text: string;
  responseId?: string;
  usage?: ModelUsage;
};

export class ProviderRequestError extends Error {
  override readonly name = "ProviderRequestError";
}

export interface ModelProvider {
  readonly kind: string;
  readonly model: string;
  readonly settings: ModelRequestSettings;
  generate(request: ModelProviderRequest): Promise<ModelProviderResponse>;
}
