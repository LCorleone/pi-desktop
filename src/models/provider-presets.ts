export interface ProviderPreset {
	key: string;
	name: string;
	baseUrl: string;
	docsUrl?: string;
	apiKeyPlaceholder?: string;
	defaultModels: Array<{
		id: string;
		name: string;
		reasoning?: boolean;
		contextWindow?: number;
		maxTokens?: number;
	}>;
	compat?: {
		supportsDeveloperRole?: boolean;
		supportsReasoningEffort?: boolean;
	};
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
	{
		key: "deepseek",
		name: "DeepSeek",
		baseUrl: "https://api.deepseek.com",
		docsUrl: "https://platform.deepseek.com/api-docs",
		apiKeyPlaceholder: "sk-...",
		compat: { supportsDeveloperRole: true, supportsReasoningEffort: false },
		defaultModels: [
			{ id: "deepseek-chat", name: "DeepSeek V3", contextWindow: 64000, maxTokens: 8192 },
			{ id: "deepseek-reasoner", name: "DeepSeek R1", reasoning: true, contextWindow: 64000, maxTokens: 8192 },
		],
	},
	{
		key: "together",
		name: "Together AI",
		baseUrl: "https://api.together.xyz/v1",
		docsUrl: "https://docs.together.ai/docs/quickstart",
		apiKeyPlaceholder: "tgp_v1_...",
		compat: { supportsDeveloperRole: true, supportsReasoningEffort: false },
		defaultModels: [
			{ id: "meta-llama/Llama-3.3-70B-Instruct-Turbo", name: "Llama 3.3 70B Turbo", contextWindow: 128000, maxTokens: 4096 },
			{ id: "deepseek-ai/DeepSeek-V3", name: "DeepSeek V3", contextWindow: 128000, maxTokens: 4096 },
			{ id: "mistralai/Mixtral-8x22B-Instruct-v0.1", name: "Mixtral 8x22B", contextWindow: 65536, maxTokens: 4096 },
		],
	},
	{
		key: "groq",
		name: "Groq",
		baseUrl: "https://api.groq.com/openai/v1",
		docsUrl: "https://console.groq.com/docs",
		apiKeyPlaceholder: "gsk_...",
		compat: { supportsDeveloperRole: true, supportsReasoningEffort: false },
		defaultModels: [
			{ id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", contextWindow: 128000, maxTokens: 8192 },
			{ id: "llama-3.1-8b-instant", name: "Llama 3.1 8B", contextWindow: 128000, maxTokens: 8192 },
			{ id: "mixtral-8x7b-32768", name: "Mixtral 8x7B", contextWindow: 32768, maxTokens: 4096 },
		],
	},
	{
		key: "perplexity",
		name: "Perplexity",
		baseUrl: "https://api.perplexity.ai",
		docsUrl: "https://docs.perplexity.ai/home",
		apiKeyPlaceholder: "pplx-...",
		compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
		defaultModels: [
			{ id: "llama-3.1-sonar-large-128k-online", name: "Sonar Large", contextWindow: 128000, maxTokens: 4096 },
			{ id: "llama-3.1-sonar-small-128k-online", name: "Sonar Small", contextWindow: 128000, maxTokens: 4096 },
			{ id: "llama-3.1-sonar-huge-128k-online", name: "Sonar Huge", contextWindow: 128000, maxTokens: 4096 },
		],
	},
	{
		key: "fireworks",
		name: "Fireworks AI",
		baseUrl: "https://api.fireworks.ai/inference/v1",
		docsUrl: "https://docs.fireworks.ai",
		apiKeyPlaceholder: "fw_...",
		compat: { supportsDeveloperRole: true, supportsReasoningEffort: false },
		defaultModels: [
			{ id: "accounts/fireworks/models/llama-v3p3-70b-instruct", name: "Llama 3.3 70B", contextWindow: 128000, maxTokens: 8192 },
			{ id: "accounts/fireworks/models/deepseek-v3", name: "DeepSeek V3", contextWindow: 128000, maxTokens: 8192 },
		],
	},
	{
		key: "mistral",
		name: "Mistral",
		baseUrl: "https://api.mistral.ai/v1",
		docsUrl: "https://docs.mistral.ai",
		apiKeyPlaceholder: "Jd4H...",
		compat: { supportsDeveloperRole: true, supportsReasoningEffort: false },
		defaultModels: [
			{ id: "mistral-large-latest", name: "Mistral Large", contextWindow: 128000, maxTokens: 8192 },
			{ id: "mistral-small-latest", name: "Mistral Small", contextWindow: 32000, maxTokens: 4096 },
			{ id: "open-mistral-nemo", name: "Mistral Nemo", contextWindow: 128000, maxTokens: 4096 },
		],
	},
	{
		key: "openrouter",
		name: "OpenRouter",
		baseUrl: "https://openrouter.ai/api/v1",
		docsUrl: "https://openrouter.ai/docs",
		apiKeyPlaceholder: "sk-or-v1-...",
		compat: { supportsDeveloperRole: true, supportsReasoningEffort: false },
		defaultModels: [
			{ id: "openrouter/auto", name: "Auto (best model)", contextWindow: 128000, maxTokens: 4096 },
		],
	},
	{
		key: "xai",
		name: "xAI",
		baseUrl: "https://api.x.ai/v1",
		docsUrl: "https://docs.x.ai/docs",
		apiKeyPlaceholder: "xai-...",
		compat: { supportsDeveloperRole: true, supportsReasoningEffort: false },
		defaultModels: [
			{ id: "grok-2-1212", name: "Grok 2", contextWindow: 128000, maxTokens: 8192 },
			{ id: "grok-beta", name: "Grok Beta", contextWindow: 128000, maxTokens: 8192 },
		],
	},
	{
		key: "cerebras",
		name: "Cerebras",
		baseUrl: "https://api.cerebras.ai/v1",
		docsUrl: "https://docs.cerebras.ai",
		apiKeyPlaceholder: "cerebras-...",
		compat: { supportsDeveloperRole: true, supportsReasoningEffort: false },
		defaultModels: [
			{ id: "llama3.1-8b", name: "Llama 3.1 8B", contextWindow: 8192, maxTokens: 4096 },
			{ id: "llama3.1-70b", name: "Llama 3.1 70B", contextWindow: 8192, maxTokens: 4096 },
		],
	},
	{
		key: "github-models",
		name: "GitHub Models",
		baseUrl: "https://models.inference.ai.azure.com",
		docsUrl: "https://docs.github.com/en/github-models",
		apiKeyPlaceholder: "ghp_...",
		compat: { supportsDeveloperRole: true, supportsReasoningEffort: false },
		defaultModels: [
			{ id: "gpt-4o", name: "GPT-4o", contextWindow: 128000, maxTokens: 16384 },
			{ id: "gpt-4o-mini", name: "GPT-4o Mini", contextWindow: 128000, maxTokens: 16384 },
		],
	},
	{
		key: "opencode-zen",
		name: "OpenCode Zen",
		baseUrl: "https://opencode.ai/zen/v1",
		docsUrl: "https://opencode.ai/zen",
		apiKeyPlaceholder: "opencode-...",
		compat: { supportsDeveloperRole: true, supportsReasoningEffort: false },
		defaultModels: [
			{ id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", contextWindow: 128000, maxTokens: 8192 },
			{ id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", contextWindow: 128000, maxTokens: 16384 },
			{ id: "deepseek-v4-flash-free", name: "DeepSeek V4 Flash Free", contextWindow: 128000, maxTokens: 16384 },
			{ id: "kimi-k2.6", name: "Kimi K2.6", contextWindow: 128000, maxTokens: 8192 },
			{ id: "glm-5.1", name: "GLM 5.1", contextWindow: 128000, maxTokens: 8192 },
			{ id: "minimax-m2.7", name: "MiniMax M2.7", contextWindow: 128000, maxTokens: 8192 },
			{ id: "grok-build-0.1", name: "Grok Build 0.1", contextWindow: 128000, maxTokens: 8192 },
			{ id: "mimo-v2.5-free", name: "MiMo-V2.5 Free", contextWindow: 128000, maxTokens: 16384 },
			{ id: "big-pickle", name: "Big Pickle", contextWindow: 128000, maxTokens: 4096 },
		],
	},
	{
		key: "opencode-go",
		name: "OpenCode Go",
		baseUrl: "https://opencode.ai/zen/go/v1",
		docsUrl: "https://opencode.ai/go",
		apiKeyPlaceholder: "opencode-...",
		compat: { supportsDeveloperRole: true, supportsReasoningEffort: false },
		defaultModels: [
			{ id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", contextWindow: 128000, maxTokens: 8192 },
			{ id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", contextWindow: 128000, maxTokens: 16384 },
			{ id: "kimi-k2.7-code", name: "Kimi K2.7 Code", contextWindow: 128000, maxTokens: 8192 },
			{ id: "kimi-k2.6", name: "Kimi K2.6", contextWindow: 128000, maxTokens: 8192 },
			{ id: "glm-5.2", name: "GLM-5.2", contextWindow: 128000, maxTokens: 8192 },
			{ id: "glm-5.1", name: "GLM-5.1", contextWindow: 128000, maxTokens: 8192 },
			{ id: "mimo-v2.5", name: "MiMo-V2.5", contextWindow: 128000, maxTokens: 16384 },
			{ id: "mimo-v2.5-pro", name: "MiMo-V2.5 Pro", contextWindow: 128000, maxTokens: 8192 },
			{ id: "minimax-m3", name: "MiniMax M3", contextWindow: 128000, maxTokens: 8192 },
			{ id: "minimax-m2.7", name: "MiniMax M2.7", contextWindow: 128000, maxTokens: 8192 },
			{ id: "qwen3.7-max", name: "Qwen3.7 Max", reasoning: true, contextWindow: 128000, maxTokens: 8192 },
			{ id: "qwen3.7-plus", name: "Qwen3.7 Plus", contextWindow: 128000, maxTokens: 16384 },
		],
	},
];

export function getProviderPresetByKey(key: string): ProviderPreset | undefined {
	return PROVIDER_PRESETS.find((p) => p.key === key);
}
