export type ModelUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type ModelRequestSettings = {
  temperature: number | null;
  maxOutputTokens: number;
  store: boolean;
  toolsEnabled: boolean;
  seed?: number;
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
};
