declare module '@eimen/token-saver' {
  interface TokenSaverOptions {
    removePoliteness?: boolean;
    removeFillers?: boolean;
    removeRedundantIntros?: boolean;
    tokenCharRatio?: number;
  }

  interface TokenSaverProcessResult {
    original: string;
    cleaned: string;
    charsSaved: number;
    estimatedTokensSaved: number;
  }

  export default class TokenSaver {
    constructor(options?: TokenSaverOptions);
    clean(prompt: string): string;
    process(prompt: string): TokenSaverProcessResult;
  }
}

