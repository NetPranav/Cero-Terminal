// Infrastructure Layer Interfaces for Cero

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface OSBridge {
  executeShellCommand(command: string, args?: string[]): Promise<CommandResult>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  readClipboard(): Promise<string>;
  writeClipboard(text: string): Promise<void>;
  getSystemInfo(): Promise<Record<string, string>>;
}

export interface AIProviderConfig {
  apiKey?: string;
  model: string;
  temperature?: number;
  baseUrl?: string;
}

export interface AIProvider {
  initialize(config: AIProviderConfig): void;
  generateText(prompt: string): Promise<string>;
  streamText(prompt: string, onToken: (token: string) => void): Promise<void>;
}
