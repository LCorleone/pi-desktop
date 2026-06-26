import { html, nothing, type TemplateResult } from "lit";
import type { AssistantWorkflow, ToolCategory, WorkflowToolCall, WorkflowToolCallGroup } from "./workflow-utils.js";
import { getToolCategory, getToolLabel, pickToolArg } from "./workflow-utils.js";
import { renderTurnStatsFooter, type TurnStats } from "./turn-stats-utils.js";

/**
 * Trim agent (subagent) streamed output to a rolling window so the live
 * progress view stays compact instead of dumping every status ping.
 * Subagents emit lines like "0 tool uses", "1 tool uses", ... as they work;
 * showing only the tail keeps the panel readable.
 */
function trimAgentOutput(output: string, running: boolean): string {
	const lines = output.split("\n").filter((l) => l.trim().length > 0);
	if (lines.length === 0) return output.trim();
	const limit = running ? 4 : 15;
	if (lines.length <= limit) return lines.join("\n");
	return `...\n${lines.slice(-limit).join("\n")}`;
}

/**
 * Emulate terminal carriage-return behavior for display. Tools like curl,
 * wget, npm, and pip render an updating progress bar by emitting `\r` to
 * move the cursor back to the start of the line and overwriting it. In a
 * `<pre>` those `\r`s become a wall of duplicate lines and the latest
 * state scrolls out of view. Per logical line we keep only the text after
 * the last `\r`, which is how a terminal ends up displaying it.
 */
function collapseCarriageReturns(value: string): string {
	return value
		.replace(/\r\n/g, "\n")
		.split("\n")
		.map((line) => {
			const last = line.lastIndexOf("\r");
			return last === -1 ? line : line.slice(last + 1);
		})
		.join("\n");
}

function formatTokenCount(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M token`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k token`;
	return `${n} token`;
}

interface SubagentNotification {
	description: string | null;
	status: string | null;
	summary: string | null;
	result: string | null;
	totalTokens: number | null;
	toolUses: number | null;
	durationMs: number | null;
}

/**
 * Parse a pi-subagents <task-notification> XML block from agent tool output.
 * Returns null if no task-notification block is present.
 * Tolerant: handles missing fields, XML-escaped entities, and surrounding text.
 */
function parseSubagentNotification(raw: string): SubagentNotification | null {
	const match = raw.match(/<task-notification>([\s\S]*?)<\/task-notification>/);
	if (!match) return null;
	const block = match[1];
	const pickTag = (tag: string): string | null => {
		const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
		if (!m) return null;
		return unescapeXml(m[1].trim());
	};
	const num = (tag: string): number | null => {
		const v = pickTag(tag);
		if (v === null) return null;
		const n = Number(v);
		return Number.isFinite(n) ? n : null;
	};
	let description: string | null = null;
	const summary = pickTag("summary");
	if (summary) {
		// summary looks like: Agent "description" completed
		const dm = summary.match(/Agent\s+"([^"]*)"\s+(.*)$/);
		if (dm) {
			description = dm[1];
		}
	}
	return {
		description,
		status: pickTag("status"),
		summary,
		result: pickTag("result"),
		totalTokens: num("total_tokens"),
		toolUses: num("tool_uses"),
		durationMs: num("duration_ms"),
	};
}

function unescapeXml(s: string): string {
	return s
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, "&");
}

/** A single line in a unified diff. */
export interface DiffLine {
	kind: "added" | "removed" | "context";
	text: string;
}

interface ModifiedFile {
	path: string;
	name: string;
	operation: "created" | "modified";
	diffLines?: DiffLine[];
}

/** Extract the file path from a write/edit/create tool call's args. */
function extractToolFilePath(args: Record<string, unknown>): string | null {
	const keys = ["path", "filePath", "file_path", "targetPath", "target_path", "filename", "fileName"];
	for (const key of keys) {
		const v = args[key];
		if (typeof v === "string" && v.trim().length > 0) return v.trim();
	}
	return null;
}

function isWriteTool(name: string): boolean {
	const n = name.trim().toLowerCase();
	return (
		n === "write" ||
		n === "writefile" ||
		n === "write_file" ||
		n === "edit" ||
		n === "editfile" ||
		n === "edit_file" ||
		n === "create" ||
		n === "createfile" ||
		n === "create_file" ||
		n === "notebookedit" ||
		n === "notebook_edit"
	);
}

function isCreateTool(name: string): boolean {
	const n = name.trim().toLowerCase();
	return n === "create" || n === "createfile" || n === "create_file";
}

/** Scan a workflow's tool calls for write/edit/create ops and return deduped modified files. */
function extractModifiedFiles(toolCalls: WorkflowToolCall[]): ModifiedFile[] {
	const out: ModifiedFile[] = [];
	for (const tc of toolCalls) {
		if (!isWriteTool(tc.name)) continue;
		if (tc.isError) continue;
		if (tc.isRunning) continue;
		const path = extractToolFilePath(tc.args);
		if (!path) continue;
		const name = basename(path);
		const operation: "created" | "modified" = isCreateTool(tc.name) ? "created" : "modified";
		// For edit tools, compute a diff from oldText/newText args.
		let diffLines: DiffLine[] | undefined;
		const normalizedName = tc.name.trim().toLowerCase();
		if (normalizedName === "edit" || normalizedName === "editfile" || normalizedName === "edit_file") {
			const pairs = extractEditPairs(tc.args);
			if (pairs.length > 0) {
				diffLines = pairs.flatMap((p) => computeLineDiff(p.oldText, p.newText));
			}
		}
		out.push({ path, name, operation, diffLines });
	}
	// Dedupe by path; last op wins (create then edit → modified)
	const map = new Map<string, ModifiedFile>();
	for (const f of out) map.set(f.path, f);
	return [...map.values()];
}

function basename(path: string): string {
	const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
	return parts[parts.length - 1] || path;
}

/**
 * Compute a compact unified line diff between old and new text.
 * Dependency-free: a simple LCS-free approach that emits one "removed" line
 * per old line that isn't a prefix of new, and one "added" line per new line.
 * Good enough for short edit hunks (which is what edit tools produce).
 */

/** Count added/removed lines for a compact "diff +n -m" stat label. */
function computeDiffStats(diffLines: DiffLine[]): { added: number; removed: number } {
	let added = 0;
	let removed = 0;
	for (const line of diffLines) {
		if (line.kind === "added") added += 1;
		else if (line.kind === "removed") removed += 1;
	}
	return { added, removed };
}
function computeLineDiff(oldText: string, newText: string): DiffLine[] {
	const oldLines = oldText.replace(/\r\n/g, "\n").split("\n");
	const newLines = newText.replace(/\r\n/g, "\n").split("\n");
	const out: DiffLine[] = [];
	const max = Math.max(oldLines.length, newLines.length);
	for (let i = 0; i < max; i += 1) {
		const o = oldLines[i];
		const n = newLines[i];
		if (o === n) {
			if (o !== undefined) out.push({ kind: "context", text: o });
		} else {
			if (o !== undefined) out.push({ kind: "removed", text: o });
			if (n !== undefined) out.push({ kind: "added", text: n });
		}
	}
	return out;
}

/** Extract oldText/newText edit pairs from an edit tool call's args. */
function extractEditPairs(args: Record<string, unknown>): { oldText: string; newText: string }[] {
	const pairs: { oldText: string; newText: string }[] = [];
	// Single-edit form: { oldText, newText }
	if (typeof args.oldText === "string" && typeof args.newText === "string") {
		pairs.push({ oldText: args.oldText, newText: args.newText });
	}
	// Multi-edit form: { edits: [{ oldText, newText }, ...] }
	if (Array.isArray(args.edits)) {
		for (const e of args.edits) {
			if (e && typeof e === "object") {
				const eo = e as Record<string, unknown>;
				if (typeof eo.oldText === "string" && typeof eo.newText === "string") {
					pairs.push({ oldText: eo.oldText, newText: eo.newText });
				}
			}
		}
	}
	return pairs;
}

const toolCategorySvg = (category: ToolCategory): TemplateResult => {
	switch (category) {
		case "terminal":
			return html`<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M3.5 5L5.5 7L3.5 9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 9H10.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;
		case "file-read":
			return html`<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 1.5H8.5L11 4V12.5H3V1.5Z" stroke="currentColor" stroke-width="1.2"/><path d="M8.5 1.5V4H11" stroke="currentColor" stroke-width="1.2"/><circle cx="7" cy="7.5" r="2" stroke="currentColor" stroke-width="1"/><circle cx="7" cy="7.5" r="0.8" fill="currentColor"/></svg>`;
		case "file-write":
			return html`<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 1.5H8.5L11 4V12.5H3V1.5Z" stroke="currentColor" stroke-width="1.2"/><path d="M8.5 1.5V4H11" stroke="currentColor" stroke-width="1.2"/><path d="M9.5 7.5L11 6L12.5 7.5L11 9L9.5 7.5Z" fill="currentColor"/></svg>`;
		case "edit":
			return html`<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 10.5V12.5H4L10.5 6L8.5 4L2 10.5Z" fill="currentColor"/><path d="M9.5 5L11 3.5L12.5 5L11 6.5L9.5 5Z" fill="currentColor"/></svg>`;
		case "search":
			return html`<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" stroke-width="1.2"/><path d="M9 9L12.5 12.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;
		case "agent":
			return html`<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2.5" y="3.5" width="9" height="7" rx="1.5" stroke="currentColor" stroke-width="1.2"/><circle cx="5" cy="7" r="0.9" fill="currentColor"/><circle cx="9" cy="7" r="0.9" fill="currentColor"/><path d="M7 3.5V2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="7" cy="1.5" r="0.6" fill="currentColor"/><path d="M4.5 10.5V11.5M9.5 10.5V11.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;
		default:
			return html`<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="4" stroke="currentColor" stroke-width="1.2"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/><path d="M7 3V4.5M7 9.5V11M3 7H4.5M9.5 7H11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;
	}
};

type WorkflowExpansionState = {
	total: number;
	running: number;
	autoExpanded: boolean;
	expanded: boolean;
};

interface RenderAssistantWorkflowViewParams {
	workflow: AssistantWorkflow;
	resolveWorkflowExpansionState: (
		workflowId: string,
		toolCalls: WorkflowToolCall[],
		isTerminal: boolean,
	) => WorkflowExpansionState;
	normalizeThinkingText: (value: string) => string;
	summarizeToolCall: (toolCall: WorkflowToolCall) => string;
	renderToolPreview: (preview: string) => TemplateResult;
	formatDuration: (ms: number) => string;
	isWorkflowThinkingExpanded: (thinkingId: string) => boolean;
	toggleWorkflowThinkingExpanded: (thinkingId: string) => void;
	isToolGroupExpanded: (workflowId: string, groupId: string) => boolean;
	toggleToolGroupExpanded: (workflowId: string, groupId: string) => void;
	toggleToolWorkflowExpanded: (workflowId: string, autoExpanded: boolean, currentlyExpanded: boolean) => void;
	clearCollapsedWorkflowState: (workflowId: string) => void;
	onOpenFile?: (filePath: string) => void;
	onDiffToggle?: () => void;
	onOpenDiff?: (filePath: string, diffLines: DiffLine[], fileName: string) => void;
	piGlyphIcon: () => TemplateResult;
	getTurnStats?: (messageId: string) => TurnStats | undefined;
}

type WorkflowDetailEntry =
	| {
		kind: "thinking";
		id: string;
		text: string;
		animating: boolean;
	}
	| {
		kind: "group";
		group: WorkflowToolCallGroup;
	};

/**
 * Tracks which modified-file diff cards are expanded. Module scope so the
 * expansion state persists across re-renders.
 */
const modifiedFileDiffExpanded = new Set<string>();

export function renderAssistantWorkflowView({
	workflow,
	resolveWorkflowExpansionState,
	normalizeThinkingText,
	summarizeToolCall,
	renderToolPreview,
	formatDuration,
	isWorkflowThinkingExpanded,
	toggleWorkflowThinkingExpanded,
	isToolGroupExpanded,
	toggleToolGroupExpanded,
	toggleToolWorkflowExpanded,
	clearCollapsedWorkflowState,
	onOpenFile,
	onDiffToggle,
	onOpenDiff,
	piGlyphIcon,
	getTurnStats,
}: RenderAssistantWorkflowViewParams): TemplateResult {
	const { total, running, autoExpanded, expanded } = resolveWorkflowExpansionState(
		workflow.id,
		workflow.toolCalls,
		workflow.isTerminal,
	);
	const failed = workflow.toolCalls.filter((toolCall) => toolCall.isError).length;
	const modifiedFiles = extractModifiedFiles(workflow.toolCalls);
	const renderModifiedFiles = (): TemplateResult | typeof nothing => {
		if (modifiedFiles.length === 0) return nothing;
		return html`
			<div class="workflow-modified-files">
				${modifiedFiles.map((f) => {
					const hasDiff = Boolean(f.diffLines && f.diffLines.length > 0);
					const expanded = modifiedFileDiffExpanded.has(f.path);
					const stats = hasDiff ? computeDiffStats(f.diffLines!) : null;
					return html`
						<div class="workflow-modified-file-row">
							<div class="workflow-modified-file-actions">
								<button
									class="workflow-modified-file ${onOpenFile ? "" : "no-action"}"
									title=${f.path}
									@click=${onOpenFile ? () => onOpenFile(f.path) : undefined}
								>
									<span class="workflow-modified-file-icon">${toolCategorySvg(f.operation === "created" ? "file-write" : "edit")}</span>
									<span class="workflow-modified-file-name">${f.name}</span>
									<span class="workflow-modified-file-op">${stats ? html`diff <span class="diff-stat-add">+${stats.added}</span> <span class="diff-stat-remove">-${stats.removed}</span>` : f.operation}</span>
								</button>
								${hasDiff
									? html`<button
										class="workflow-modified-file-diff-toggle"
										title=${expanded ? "Hide diff" : "Show diff"}
										aria-label=${expanded ? "Hide diff" : "Show diff"}
										aria-expanded=${expanded}
										@click=${() => {
											if (onOpenDiff) {
												onOpenDiff(f.path, f.diffLines!, f.name);
											} else {
												if (expanded) modifiedFileDiffExpanded.delete(f.path);
												else modifiedFileDiffExpanded.add(f.path);
												onDiffToggle?.();
											}
										}}
									>${expanded ? "▾" : "▸"}</button>`
									: nothing}
							</div>
							${hasDiff && expanded && !onOpenDiff
								? html`<pre class="workflow-modified-file-diff">${(f.diffLines ?? []).map((line) => {
										const cls =
											line.kind === "added" ? "diff-add" : line.kind === "removed" ? "diff-remove" : "diff-context";
										const prefix = line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " ";
										return html`<span class=${cls}>${prefix} ${line.text}</span>`;
									})}</pre>`
								: nothing}
						</div>
					`;
				})}
			</div>
		`;
	};
	const durationMs =
		workflow.startedAt > 0
			? (running > 0 ? Date.now() : Math.max(workflow.endedAt, workflow.startedAt)) - workflow.startedAt
			: 0;
	const durationLabel = durationMs > 0 ? formatDuration(durationMs) : "0s";
	const summaryPrimary = durationLabel;
	const completed = Math.max(0, total - running - failed);
	const summaryParts: string[] = [];
	if (completed > 0) summaryParts.push(`${completed} complete`);
	if (failed > 0) summaryParts.push(`${failed} failed`);
	if (running > 0) summaryParts.push(`${running} running`);
	if (summaryParts.length === 0 && total > 0) summaryParts.push(`${total} complete`);
	const summarySecondary = summaryParts.join(" · ");
	const hasFinalContent = Boolean(workflow.finalText || workflow.errorText);
	const detailEntries: WorkflowDetailEntry[] = [];
	let lastThinkingFull = "";
	for (const message of workflow.messages) {
		const normalizedThinking = normalizeThinkingText((message.thinking ?? "").replace(/^\s+/, ""));
		if (normalizedThinking) {
			let displayThinking = normalizedThinking;
			if (lastThinkingFull) {
				if (normalizedThinking.startsWith(lastThinkingFull)) {
					displayThinking = normalizedThinking.slice(lastThinkingFull.length).replace(/^\s+/, "").trim();
				} else if (lastThinkingFull.startsWith(normalizedThinking)) {
					displayThinking = "";
				}
			}
			lastThinkingFull = normalizedThinking;

			// [thinking-diag] TEMP: log workflow thinking dedup result
			console.debug("[thinking-diag] workflow-build", { msgId: message.id, fullLen: normalizedThinking.length, displayLen: displayThinking.length, hadPrevFull: (lastThinkingFull ?? "").length > 0 });

			const previous = detailEntries[detailEntries.length - 1];
			if (!displayThinking) {
				if (previous && previous.kind === "thinking") {
					previous.animating = previous.animating || Boolean(message.isThinkingStreaming);
				}
			} else if (previous && previous.kind === "thinking") {
				previous.animating = previous.animating || Boolean(message.isThinkingStreaming);
				if (displayThinking === previous.text || previous.text.startsWith(displayThinking)) {
					// no-op: duplicate or shorter repeat
				} else if (displayThinking.startsWith(previous.text)) {
					previous.text = displayThinking;
				} else {
					detailEntries.push({
						kind: "thinking",
						id: `${workflow.id}:thinking:${message.id}`,
						text: displayThinking,
						animating: Boolean(message.isThinkingStreaming),
					});
				}
			} else {
				detailEntries.push({
					kind: "thinking",
					id: `${workflow.id}:thinking:${message.id}`,
					text: displayThinking,
					animating: Boolean(message.isThinkingStreaming),
				});
			}
		}

		for (const toolCall of message.toolCalls) {
			const preview = summarizeToolCall(toolCall);
			const previous = detailEntries[detailEntries.length - 1];
			if (previous && previous.kind === "group" && previous.group.toolName === toolCall.name && previous.group.preview === preview) {
				previous.group.calls.push(toolCall);
				continue;
			}
			detailEntries.push({
				kind: "group",
				group: {
					id: `${toolCall.id}-group`,
					toolName: toolCall.name,
					preview,
					category: getToolCategory(toolCall.name),
					label: getToolLabel(getToolCategory(toolCall.name), toolCall.name),
					calls: [toolCall],
				},
			});
		}
	}
	if (!expanded) {
		clearCollapsedWorkflowState(workflow.id);
	}

	// Per-turn stats footer attaches to the turn's final assistant message id.
	const lastWorkflowMessageId = workflow.messages[workflow.messages.length - 1]?.id ?? workflow.id;
	const turnStats = getTurnStats?.(lastWorkflowMessageId);

	return html`
		<div class="chat-row assistant-row assistant-workflow-row" data-message-id=${workflow.id}>
			<div class="message-shell assistant-message-shell">
				<div class="assistant-block">
					<button
						class="tool-workflow-summary"
						@click=${() => {
							toggleToolWorkflowExpanded(workflow.id, autoExpanded, expanded);
						}}
					>
						<span class="workflow-divider" aria-hidden="true"></span>
						<span class="workflow-summary-center">
							<span class="workflow-summary-label">${summaryPrimary}</span>
							${summarySecondary ? html`<span class="workflow-summary-meta">${summarySecondary}</span>` : nothing}
							<span class="workflow-summary-caret">${expanded ? "▾" : "▸"}</span>
						</span>
						<span class="workflow-divider" aria-hidden="true"></span>
					</button>
					${expanded
						? html`
							<div class="tool-workflow-list">
								${detailEntries.map((entry) => {
									if (entry.kind === "thinking") {
										const thinkingExpanded = isWorkflowThinkingExpanded(entry.id);
										const thinkingAnimating = running === 0 && entry.animating;
										const thinkingLabel = thinkingAnimating ? "Thinking…" : "Thought";
										return html`
											<div class="tool-workflow-thinking">
												<button class="tool-workflow-thinking-toggle ${thinkingAnimating ? "animating" : "done"}" @click=${() => toggleWorkflowThinkingExpanded(entry.id)}>
													${thinkingAnimating ? html`<span class="tool-workflow-inline-pi" aria-hidden="true">${piGlyphIcon()}</span>` : nothing}
													<span class="tool-workflow-thinking-text">${thinkingLabel}</span>
												</button>
												${thinkingExpanded ? html`<div class="tool-workflow-thinking-content">${entry.text}</div>` : nothing}
											</div>
										`;
									}
									const group = entry.group;
									const count = group.calls.length;
									const groupRunning = group.calls.some((toolCall) => toolCall.isRunning);
									const groupFailed = group.calls.some((toolCall) => toolCall.isError);
									const groupExpanded = isToolGroupExpanded(workflow.id, group.id);
									const rawOutput =
										collapseCarriageReturns(
											[...group.calls]
												.reverse()
												.map((call) => (call.streamingOutput ?? call.result ?? "").trim())
												.find((value) => value.length > 0) ?? "",
										);
									const output = group.category === "agent" ? trimAgentOutput(rawOutput, groupRunning) : rawOutput;
									const statusLabel = groupRunning ? "running" : groupFailed ? "failed" : "success";
									const terminalCommand = group.category === "terminal" && group.calls.length > 0
										? pickToolArg(group.calls[0].args, ["command", "cmd", "shell", "script"])
										: "";
									const tooltipText = terminalCommand ? terminalCommand.slice(0, 500) : (output ? output.slice(0, 300) : undefined);
									return html`
										<div class="tool-workflow-item ${groupRunning ? "running" : groupFailed ? "failed" : "done"}">
											<button
												class="tool-workflow-line ${groupRunning ? "running" : groupFailed ? "failed" : "done"}"
												@click=${() => toggleToolGroupExpanded(workflow.id, group.id)}
												title=${tooltipText || nothing}
											>
												${groupRunning
													? html`<span class="tool-workflow-inline-pi" aria-hidden="true">${piGlyphIcon()}</span>`
													: html`<span class="tool-workflow-category-icon" aria-hidden="true">${toolCategorySvg(group.category)}</span>`}
												<span class="tool-workflow-label">${group.label}</span>
									<span class="tool-workflow-line-text ${groupRunning ? "running" : ""}">${renderToolPreview(group.preview)}</span>
												${count > 1 ? html`<span class="tool-workflow-count">×${count}</span>` : nothing}
											</button>
											${groupExpanded
												? html`
													<div class="tool-workflow-details">
														${group.category === "agent"
															? (() => {
																	const notif = parseSubagentNotification(rawOutput);
																	if (notif) {
																		const stats: string[] = [];
																		if (notif.toolUses !== null) stats.push(`${notif.toolUses} tool use${notif.toolUses === 1 ? "" : "s"}`);
																		if (notif.totalTokens !== null) stats.push(formatTokenCount(notif.totalTokens));
																		if (notif.durationMs !== null) stats.push(formatDuration(notif.durationMs));
																		const statusOk = notif.status !== "error" && notif.status !== "stopped" && notif.status !== "aborted";
																		return html`
																			<div class="ext-agent-card">
																				<div class="ext-agent-card-header">
																					<span class="ext-agent-card-status ${statusOk ? "ok" : "err"}">${statusOk ? "✓" : "✗"}</span>
																					<span class="ext-agent-card-desc">${notif.description ?? group.preview}</span>
																					${notif.status ? html`<span class="ext-agent-card-state">${notif.status}</span>` : nothing}
																				</div>
																				${stats.length ? html`<div class="ext-agent-card-stats">${stats.map((s) => html`<span>${s}</span>`)}</div>` : nothing}
																				${notif.result ? html`<pre class="ext-agent-card-result">${notif.result}</pre>` : nothing}
																			</div>
																		`;
																	}
																	// No task-notification XML — fall back to cleaned text
																	return html`<pre class="tool-workflow-output">${groupRunning ? "working…" : (output || "No output reported.")}${groupRunning ? html`<span class="streaming-inline"></span>` : nothing}</pre>`;
															})()
															: html`
																${terminalCommand ? html`<pre class="tool-workflow-command">${terminalCommand}</pre>` : nothing}
																<pre class="tool-workflow-output">${output || "No output reported."}${groupRunning ? html`<span class="streaming-inline"></span>` : nothing}</pre>`}
														<div class="tool-workflow-detail-meta"><span class="tool-workflow-detail-status ${groupRunning ? "running" : groupFailed ? "error" : "done"}"><span class="tool-status-dot"></span>${statusLabel}</span></div>
													</div>
												`
												: nothing}
										</div>
									`;
								})}
							</div>
							${hasFinalContent ? html`<div class="assistant-final-divider"><span>Agent</span></div>` : nothing}
							${workflow.finalText
								? html`<div class="assistant-content"><markdown-block .content=${workflow.finalText}></markdown-block></div>`
								: nothing}
							${workflow.errorText ? html`<div class="assistant-error-line">${workflow.errorText}</div>` : nothing}
							${renderModifiedFiles()}
							${turnStats ? renderTurnStatsFooter(turnStats) : nothing}
						`
						: html`
							${workflow.finalText
								? html`<div class="assistant-content workflow-final-collapsed"><markdown-block .content=${workflow.finalText}></markdown-block></div>`
								: nothing}
							${workflow.errorText ? html`<div class="assistant-error-line">${workflow.errorText}</div>` : nothing}
							${renderModifiedFiles()}
							${turnStats ? renderTurnStatsFooter(turnStats) : nothing}
						`}
				</div>
			</div>
		</div>
	`;
}
