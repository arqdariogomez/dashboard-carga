import TokenSaver from '@eimen/token-saver';

export interface PromptSanitizerOptions {
  removePoliteness?: boolean;
  removeFillers?: boolean;
  removeRedundantIntros?: boolean;
  tokenCharRatio?: number;
}

export interface SanitizedPromptResult {
  original: string;
  cleaned: string;
  charsSaved: number;
  estimatedTokensSaved: number;
}

const defaultOptions: PromptSanitizerOptions = {
  removePoliteness: true,
  removeFillers: true,
  removeRedundantIntros: true,
  tokenCharRatio: 4,
};

let saverInstance: TokenSaver | null = null;

function getSaver(options?: PromptSanitizerOptions) {
  if (!saverInstance) {
    saverInstance = new TokenSaver({ ...defaultOptions, ...(options || {}) });
  }
  return saverInstance;
}

function normalizeCleanedText(value: string): string {
  const cleaned = value.replace(/\s+,/g, ',').trim();
  return cleaned;
}

export function sanitizePromptDetailed(
  prompt: string,
  options?: PromptSanitizerOptions
): SanitizedPromptResult {
  if (!prompt || !prompt.trim()) {
    return {
      original: prompt,
      cleaned: prompt,
      charsSaved: 0,
      estimatedTokensSaved: 0,
    };
  }

  const saver = getSaver(options);
  const out = saver.process(prompt);
  const normalized = normalizeCleanedText(out.cleaned);

  return {
    original: out.original,
    cleaned: normalized || out.original,
    charsSaved: out.charsSaved,
    estimatedTokensSaved: out.estimatedTokensSaved,
  };
}

export function sanitizePrompt(prompt: string, options?: PromptSanitizerOptions): string {
  return sanitizePromptDetailed(prompt, options).cleaned;
}

