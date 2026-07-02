export type ToolCategory = "terminal" | "file-read" | "file-write" | "edit" | "search" | "agent" | "default";

export function getToolCategory(name: string): ToolCategory {
	const n = name.trim().toLowerCase();
	if (n === "bash" || n.includes("execute") || n.includes("shell") || n === "run") return "terminal";
	if (n === "read" || n.includes("readfile") || n === "cat") return "file-read";
	if (n === "write" || n.includes("writefile") || n.includes("create")) return "file-write";
	if (n === "edit" || n.includes("modify") || n.includes("replace") || n.includes("patch")) return "edit";
	if (n.includes("search") || n.includes("grep") || n.includes("find") || n.includes("explore") || n.includes("list") || n.includes("ls")) return "search";
	if (n === "subagent" || n === "task" || n === "agent" || n === "delegate") return "agent";
	return "default";
}

export type WorkflowRole = "user" | "assistant" | "system" | "custom";

export interface WorkflowToolCall {
	id: string;
	name: string;
	args: Record<string, unknown>;
	result?: string;
	streamingOutput?: string;
	isError?: boolean;
	isRunning: boolean;
	isExpanded: boolean;
	startedAt?: number;
	endedAt?: number;
}

export interface WorkflowMessage {
	id: string;
	role: WorkflowRole;
	text: string;
	toolCalls: WorkflowToolCall[];
	thinking?: string;
	errorText?: string;
	isStreaming?: boolean;
	isThinkingStreaming?: boolean;
}

export interface WorkflowToolCallGroup {
	id: string;
	toolName: string;
	preview: string;
	category: ToolCategory;
	label: string;
	calls: WorkflowToolCall[];
}

export interface AssistantWorkflow {
	id: string;
	messages: WorkflowMessage[];
	toolCalls: WorkflowToolCall[];
	toolGroups: WorkflowToolCallGroup[];
	thinkingText: string;
	finalText: string;
	errorText: string;
	isStreaming: boolean;
	startedAt: number;
	endedAt: number;
	isTerminal: boolean;
}

export interface AssistantWorkflowCandidate {
	workflow: AssistantWorkflow;
	nextIndex: number;
}

interface ResolveWorkflowExpansionStateParams {
	workflowId: string;
	toolCalls: WorkflowToolCall[];
	isTerminal: boolean;
	keepWorkflowExpandedUntilAssistantText: boolean;
	runSawToolActivity: boolean;
	expandedWorkflowIds: ReadonlySet<string>;
	collapsedAutoWorkflowIds: ReadonlySet<string>;
}

interface CollectAssistantWorkflowParams {
	messages: WorkflowMessage[];
	startIndex: number;
	currentIsStreaming: boolean;
	keepWorkflowExpandedUntilAssistantText: boolean;
	runHasAssistantText: boolean;
	truncateText: (value: string, len: number) => string;
}

export function pickToolArg(args: Record<string, unknown>, keys: string[]): string {
	for (const key of keys) {
		const value = args[key];
		if (typeof value === "string" && value.trim().length > 0) return value.trim();
	}
	return "";
}

export function normalizeThinkingText(value: string): string {
	// Strip ANSI escape sequences (pi emits 256-color SGR codes in thinking
	// output; these render as colors in a terminal but as literal
	// "[38;5;66m..." garbage in the web UI since the ESC byte is non-printing).
	let text = value.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
	text = text.replace(/^\s*thinking\.\.\.\s*/i, "").trim();
	if (!text) return "";
	const paragraphs = text
		.split(/\n{2,}/)
		.map((part) => part.trim())
		.filter(Boolean);
	const deduped: string[] = [];
	const seen = new Set<string>();
	for (const part of paragraphs) {
		if (seen.has(part)) continue;
		seen.add(part);
		deduped.push(part);
	}
	text = deduped.join("\n\n").trim();
	const half = Math.floor(text.length / 2);
	if (text.length > 40 && text.length % 2 === 0 && text.slice(0, half) === text.slice(half)) {
		text = text.slice(0, half).trim();
	}
	return text;
}

export function isStandaloneCodeBlockMarkdown(value: string): boolean {
	const text = value.trim();
	if (!text) return false;
	if (/^```[^\n`]*\n[\s\S]*\n```$/.test(text)) return true;
	if (/^~~~[^\n~]*\n[\s\S]*\n~~~$/.test(text)) return true;
	return false;
}

function extractFilename(path: string): string {
	const parts = path.replace(/\\/g, "/").split("/");
	return parts[parts.length - 1] || path;
}

export function summarizeToolCall(
	toolCall: WorkflowToolCall,
	truncateText: (value: string, len: number) => string,
): string {
	const name = toolCall.name.trim().toLowerCase();
	const command = pickToolArg(toolCall.args, ["command", "cmd", "shell", "script"]);
	const path = pickToolArg(toolCall.args, ["path", "filePath", "targetPath", "from", "to"]);
	const query = pickToolArg(toolCall.args, ["query", "pattern", "glob", "name"]);
	const filename = path ? extractFilename(path) : null;
	const subagentType = pickToolArg(toolCall.args, ["subagent_type", "subagentType", "type", "agent"]);
	const subagentPrompt = pickToolArg(toolCall.args, ["prompt", "description", "task", "message"]);
	if (name === "subagent" || name === "task" || name === "agent" || name === "delegate") {
		const typeLabel = subagentType ? `[${subagentType}] ` : "";
		const promptText = subagentPrompt ? truncateText(subagentPrompt.replace(/\s+/g, " ").trim(), 60) : "subagent task";
		return `${typeLabel}${promptText}`;
	}
	if (name === "bash" && command) return truncateText(command, 84);
	if ((name === "read" || name === "readfile") && filename) return filename;
	if ((name === "write" || name === "writefile") && filename) return filename;
	if (name === "edit" && filename) return filename;
	if (name.includes("search") && query) return truncateText(query, 74);
	if ((name === "list" || name.includes("ls")) && path) return truncateText(path, 74);
	if (path) return truncateText(path, 74);
	return toolCall.name;
}

/**
 * Derive a short, human-readable "intent" label for a collapsed workflow.
 * Priority:
 *   1. The first meaningful sentence of the agent's thinking text.
 *   2. A tool-category summary (e.g. "Edit 3 files · Run 2 commands").
 *   3. null — caller should fall back to the existing duration label.
 */
export function deriveWorkflowIntent(workflow: AssistantWorkflow): string | null {
	const thinking = (workflow.thinkingText ?? "").trim();
	if (thinking) {
		// Split on sentence-ending punctuation + whitespace, or a newline.
		// Use a capturing group so the delimiter (punctuation/whitespace) is
		// returned as a separate array element and can be reattached to keep
		// the trailing punctuation (e.g. "Done. Next" → "Done."). Avoid
		// lookbehind ((?<=...)) — unsupported on macOS WebKit (throws
		// "Invalid regular expression: invalid group specifier name").
		const parts = thinking.split(/([.!?]\s+|\n)/);
		let firstSentence = parts[0];
		if (parts[1]) {
			// parts[1] is the delimiter (e.g. ". " or "\n"); reattach the
			// punctuation, drop the trailing whitespace.
			firstSentence += parts[1].trim();
		}
		firstSentence = firstSentence.trim();
		const cap = 80;
		if (!firstSentence) return null;
		return firstSentence.length > cap ? `${firstSentence.slice(0, cap - 1)}…` : firstSentence;
	}
	// Heuristic: summarize tool calls by category.
	const tally: Partial<Record<ToolCategory, number>> = {};
	for (const group of workflow.toolGroups) {
		tally[group.category] = (tally[group.category] ?? 0) + group.calls.length;
	}
	const parts: string[] = [];
	const edits = (tally["edit"] ?? 0) + (tally["file-write"] ?? 0);
	const reads = tally["file-read"] ?? 0;
	const terminal = tally["terminal"] ?? 0;
	const search = tally["search"] ?? 0;
	const agent = tally["agent"] ?? 0;
	const plural = (n: number) => (n === 1 ? "" : "s");
	if (edits) parts.push(`Edit ${edits} file${plural(edits)}`);
	if (reads) parts.push(`Read ${reads} file${plural(reads)}`);
	if (terminal) parts.push(`Run ${terminal} command${plural(terminal)}`);
	if (search) parts.push(`Search ${search} time${plural(search)}`);
	if (agent) parts.push(`Spawn ${agent} agent${plural(agent)}`);
	const phrase = parts.slice(0, 2).join(" · ");
	return phrase || null;
}

export function getToolLabel(category: ToolCategory, name: string): string {
	switch (category) {
		case "terminal": return "bash";
		case "file-read": return "read";
		case "file-write": return "write";
		case "edit": return "edit";
		case "search": return "search";
		case "agent": return "agent";
		default: return name;
	}
}

function buildToolCallGroups(
	toolCalls: WorkflowToolCall[],
	truncateText: (value: string, len: number) => string,
): WorkflowToolCallGroup[] {
	const groups: WorkflowToolCallGroup[] = [];
	for (const toolCall of toolCalls) {
		const preview = summarizeToolCall(toolCall, truncateText);
		const previous = groups[groups.length - 1];
		if (previous && previous.toolName === toolCall.name && previous.preview === preview) {
			previous.calls.push(toolCall);
			continue;
		}
		groups.push({
			id: `${toolCall.id}-group`,
			toolName: toolCall.name,
			preview,
			category: getToolCategory(toolCall.name),
			label: getToolLabel(getToolCategory(toolCall.name), toolCall.name),
			calls: [toolCall],
		});
	}
	return groups;
}

function isThinkingOnlyAssistantMessage(message: WorkflowMessage | undefined): boolean {
	if (!message || message.role !== "assistant") return false;
	if (message.toolCalls.length > 0) return false;
	if (message.text.trim().length > 0) return false;
	if ((message.errorText ?? "").trim().length > 0) return false;
	return Boolean((message.thinking ?? "").trim());
}

export function collectAssistantWorkflow({
	messages,
	startIndex,
	currentIsStreaming,
	keepWorkflowExpandedUntilAssistantText,
	runHasAssistantText,
	truncateText,
}: CollectAssistantWorkflowParams): AssistantWorkflowCandidate | null {
	const start = messages[startIndex];
	if (!start || start.role !== "assistant") return null;
	const startIsThinkingOnly = isThinkingOnlyAssistantMessage(start);
	const startHasTools = start.toolCalls.length > 0;
	if (!startIsThinkingOnly && !startHasTools) return null;

	const grouped: WorkflowMessage[] = [];
	let sawTools = false;
	let consumedFinalMessage = false;
	let cursor = startIndex;

	while (cursor < messages.length) {
		const candidate = messages[cursor];
		if (!candidate || candidate.role !== "assistant") break;
		const hasTools = candidate.toolCalls.length > 0;
		const hasText = candidate.text.trim().length > 0;
		const hasThinking = Boolean((candidate.thinking ?? "").trim());
		const hasError = Boolean((candidate.errorText ?? "").trim());

		if (hasTools) {
			grouped.push(candidate);
			sawTools = true;
			cursor += 1;
			continue;
		}

		if (!sawTools) {
			if (hasThinking && !hasText && !hasError) {
				grouped.push(candidate);
				cursor += 1;
				continue;
			}
			break;
		}

		if (!consumedFinalMessage && (hasText || hasError)) {
			grouped.push(candidate);
			consumedFinalMessage = true;
			cursor += 1;
			break;
		}

		if (!consumedFinalMessage && hasThinking) {
			grouped.push(candidate);
			cursor += 1;
			continue;
		}

		break;
	}

	if (grouped.length === 0) return null;
	const toolCalls = grouped.flatMap((entry) => entry.toolCalls);
	const isProvisionalWorkflow =
		toolCalls.length === 0 && currentIsStreaming && keepWorkflowExpandedUntilAssistantText && !runHasAssistantText;
	if (toolCalls.length === 0 && !isProvisionalWorkflow) return null;

	const startedAt = toolCalls.reduce((min, toolCall) => {
		if (!toolCall.startedAt) return min;
		return min === 0 ? toolCall.startedAt : Math.min(min, toolCall.startedAt);
	}, 0);
	const endedAt = toolCalls.reduce((max, toolCall) => {
		if (!toolCall.endedAt) return max;
		return Math.max(max, toolCall.endedAt);
	}, 0);
	const thinkingParts = grouped
		.map((entry) => normalizeThinkingText((entry.thinking ?? "").replace(/^\s+/, "")))
		.filter(Boolean);
	const dedupedThinkingParts = thinkingParts.filter((part, index) => index === 0 || part !== thinkingParts[index - 1]);
	const thinkingText = dedupedThinkingParts.join("\n\n").trim();
	const finalText = grouped
		.filter((entry) => entry.toolCalls.length === 0)
		.map((entry) => entry.text.trim())
		.filter(Boolean)
		.join("\n\n");
	const errorText = grouped
		.map((entry) => (entry.errorText ?? "").trim())
		.filter(Boolean)
		.join("\n");
	const workflowId = `workflow-${grouped[0]?.id ?? start.id}`;

	const nextIndex = Math.max(startIndex + 1, cursor);
	return {
		workflow: {
			id: workflowId,
			messages: grouped,
			toolCalls,
			toolGroups: buildToolCallGroups(toolCalls, truncateText),
			thinkingText,
			finalText,
			errorText,
			isStreaming: grouped.some((entry) => entry.isStreaming),
			startedAt,
			endedAt,
			isTerminal: nextIndex >= messages.length,
		},
		nextIndex,
	};
}

export function resolveWorkflowExpansionState({
	workflowId,
	toolCalls,
	isTerminal,
	keepWorkflowExpandedUntilAssistantText,
	runSawToolActivity,
	expandedWorkflowIds,
	collapsedAutoWorkflowIds,
}: ResolveWorkflowExpansionStateParams): {
	total: number;
	running: number;
	autoExpanded: boolean;
	expanded: boolean;
} {
	const total = toolCalls.length;
	const running = toolCalls.filter((toolCall) => toolCall.isRunning).length;
	const manualExpanded = expandedWorkflowIds.has(workflowId);
	const hasCompletedTools = total > 0 && running === 0;
	const autoExpanded =
		isTerminal &&
		!collapsedAutoWorkflowIds.has(workflowId) &&
		(hasCompletedTools || (keepWorkflowExpandedUntilAssistantText && (running > 0 || runSawToolActivity || total === 0)));
	const expanded = autoExpanded || manualExpanded;
	return {
		total,
		running,
		autoExpanded,
		expanded,
	};
}
