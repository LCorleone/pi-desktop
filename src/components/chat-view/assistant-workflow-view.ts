import { html, nothing, type TemplateResult } from "lit";
import type { AssistantWorkflow, ToolCategory, WorkflowToolCall, WorkflowToolCallGroup } from "./workflow-utils.js";
import { getToolCategory, getToolLabel } from "./workflow-utils.js";

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
	piGlyphIcon: () => TemplateResult;
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
	piGlyphIcon,
}: RenderAssistantWorkflowViewParams): TemplateResult {
	const { total, running, autoExpanded, expanded } = resolveWorkflowExpansionState(
		workflow.id,
		workflow.toolCalls,
		workflow.isTerminal,
	);
	const failed = workflow.toolCalls.filter((toolCall) => toolCall.isError).length;
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
										[...group.calls]
											.reverse()
											.map((call) => (call.streamingOutput ?? call.result ?? "").trim())
											.find((value) => value.length > 0) ?? "";
									const output = group.category === "agent" ? trimAgentOutput(rawOutput, groupRunning) : rawOutput;
									const statusLabel = groupRunning ? "running" : groupFailed ? "failed" : "success";
									return html`
										<div class="tool-workflow-item">
											<button
												class="tool-workflow-line ${groupRunning ? "running" : ""}"
												@click=${() => toggleToolGroupExpanded(workflow.id, group.id)}
												title=${output ? output.slice(0, 300) : undefined}
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
															: html`<pre class="tool-workflow-output">${output || "No output reported."}${groupRunning ? html`<span class="streaming-inline"></span>` : nothing}</pre>`}
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
						`
						: html`
							${workflow.finalText
								? html`<div class="assistant-content workflow-final-collapsed"><markdown-block .content=${workflow.finalText}></markdown-block></div>`
								: nothing}
							${workflow.errorText ? html`<div class="assistant-error-line">${workflow.errorText}</div>` : nothing}
						`}
				</div>
			</div>
		</div>
	`;
}
