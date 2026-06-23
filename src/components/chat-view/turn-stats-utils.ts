import { html, type TemplateResult } from "lit";

/**
 * Per-turn stats footer — ports the pi-emote TUI extension's `agent_end`
 * telemetry verbatim (tps + cache hit-rate metrics). The pure logic here is
 * Lit-free; `renderTurnStatsFooter` is the shared view helper used by both the
 * workflow and plain assistant render paths.
 */

// --- Usage reading (same robust dotted-path helper as session-stats-utils) ---

function readNumberPath(source: Record<string, unknown>, path: string): number | null {
	const parts = path.split(".");
	let current: unknown = source;
	for (const part of parts) {
		if (!current || typeof current !== "object") return null;
		current = (current as Record<string, unknown>)[part];
	}
	if (typeof current === "number" && Number.isFinite(current)) return current;
	if (typeof current === "string") {
		const parsed = Number(current);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function pickNumber(source: Record<string, unknown>, paths: string[]): number | null {
	for (const path of paths) {
		const value = readNumberPath(source, path);
		if (value !== null) return value;
	}
	return null;
}

const USAGE_INPUT_PATHS = ["usage.input", "usage.inputTokens", "usage.input_tokens"];
const USAGE_OUTPUT_PATHS = ["usage.output", "usage.outputTokens", "usage.output_tokens"];
const USAGE_CACHE_READ_PATHS = ["usage.cacheRead", "usage.cache_read"];
const USAGE_CACHE_WRITE_PATHS = ["usage.cacheWrite", "usage.cache_write"];

// --- Types ---

/**
 * Mutable cumulative cache state, kept across turns (mirrors the extension's
 * CacheMetrics). Reset on session_start / model_select / session_compact.
 */
export interface CacheState {
	totalCacheRead: number;
	totalPromptTokens: number; // input + cacheRead + cacheWrite
	totalMissTokens: number;
	baselinePrompt: number; // promoted from pendingPrompt at each turn boundary
	pendingPrompt: number; // last assistant message's promptTokens (carries across turns)
	lastHitRate: number | null; // latest single-message cache hit rate (C)
	messageCount: number;
}

export interface TurnStats {
	tps: number;
	input: number; // sum of usage.input over the turn's assistant messages
	output: number; // sum of usage.output over the turn's assistant messages
	elapsed: number; // seconds
	cache: CacheState; // frozen snapshot at this turn boundary
}

export function createEmptyCacheState(): CacheState {
	return {
		totalCacheRead: 0,
		totalPromptTokens: 0,
		totalMissTokens: 0,
		baselinePrompt: 0,
		pendingPrompt: 0,
		lastHitRate: null,
		messageCount: 0,
	};
}

function isAssistantMessage(message: unknown): boolean {
	if (!message || typeof message !== "object") return false;
	return (message as { role?: unknown }).role === "assistant";
}

/**
 * Implements the extension's agent_end algorithm exactly:
 * - Sum input/output across all assistant messages (no skip).
 * - Promote pendingPrompt → baselinePrompt at the turn boundary.
 * - For each non-aborted/error assistant message, accumulate cache metrics.
 * Mutates `cache` in place (cumulative) and returns a TurnStats with a frozen
 * snapshot of the cache so the stored footer doesn't drift on later turns.
 */
export function computeTurnStats(opts: {
	startMs: number;
	endMs: number;
	assistantMessages: Array<Record<string, unknown>>;
	cache: CacheState;
}): TurnStats {
	const { startMs, endMs, assistantMessages, cache } = opts;
	const elapsedMs = Math.max(0, endMs - startMs);
	const elapsed = elapsedMs / 1000;

	let input = 0;
	let output = 0;
	for (const msg of assistantMessages) {
		if (!isAssistantMessage(msg)) continue;
		input += pickNumber(msg, USAGE_INPUT_PATHS) ?? 0;
		output += pickNumber(msg, USAGE_OUTPUT_PATHS) ?? 0;
	}

	const tps = elapsed > 0 && output > 0 ? output / elapsed : 0;

	// Promote pendingPrompt → baselinePrompt (shared by all assistant msgs this turn).
	cache.baselinePrompt = cache.pendingPrompt;

	for (const msg of assistantMessages) {
		if (!isAssistantMessage(msg)) continue;
		const stopReason = typeof msg.stopReason === "string" ? msg.stopReason : "";
		if (stopReason === "aborted" || stopReason === "error") continue;

		const inputTokens = pickNumber(msg, USAGE_INPUT_PATHS) ?? 0;
		const cacheRead = pickNumber(msg, USAGE_CACHE_READ_PATHS) ?? 0;
		const cacheWrite = pickNumber(msg, USAGE_CACHE_WRITE_PATHS) ?? 0;
		const promptTokens = inputTokens + cacheRead + cacheWrite;
		if (promptTokens <= 0) continue;

		const miss = Math.max(0, cache.baselinePrompt - cacheRead);
		cache.totalMissTokens += miss;
		cache.pendingPrompt = promptTokens;
		cache.totalCacheRead += cacheRead;
		cache.totalPromptTokens += promptTokens;
		cache.lastHitRate = (cacheRead / promptTokens) * 100;
		cache.messageCount += 1;
	}

	return { tps, input, output, elapsed, cache: { ...cache } };
}

// --- Formatting (matches the extension's displayed info line) ---

// Token counts use two decimals at the k boundary (e.g. 17.67k), one at M.
function formatTokens(count: number): string {
	if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
	if (count >= 1_000) return `${(count / 1000).toFixed(2)}k`;
	return count.toString();
}

export type TurnStatsSegmentKind = "tps" | "io" | "time" | "cache" | "miss";

export interface TurnStatsSegment {
	label: string;
	value: string;
	kind: TurnStatsSegmentKind;
	/** Present for cache hit-rate values (C/T/R) so the view can color them. */
	colorValue?: number;
}

/**
 * Builds the ordered segments for the footer: tps · new/out · time · [C T R M].
 * Cache segments only appear once at least one assistant message had usage.
 * Mirrors pi-emote's buildInfoLines, including the messageCount>1 gate on R.
 */
export function turnStatsSegments(stats: TurnStats): TurnStatsSegment[] {
	const segments: TurnStatsSegment[] = [
		{ label: "tps:", value: stats.tps.toFixed(1), kind: "tps" },
		{ label: "new/out:", value: `${formatTokens(stats.input)}/${formatTokens(stats.output)}`, kind: "io" },
		{ label: "time:", value: `${stats.elapsed.toFixed(1)}s`, kind: "time" },
	];

	const cache = stats.cache;
	if (cache.messageCount > 0) {
		if (cache.lastHitRate !== null) {
			segments.push({ label: "C:", value: cache.lastHitRate.toFixed(1), kind: "cache", colorValue: cache.lastHitRate });
		}
		const tPct = cache.totalPromptTokens > 0 ? (cache.totalCacheRead / cache.totalPromptTokens) * 100 : 0;
		segments.push({ label: "T:", value: tPct.toFixed(1), kind: "cache", colorValue: tPct });

		const totalInput = cache.totalPromptTokens - cache.totalCacheRead;
		const rPct =
			totalInput > 0
				? Math.max(0, (1 - cache.totalMissTokens / totalInput) * 100)
				: cache.totalPromptTokens > 0
					? 100
					: 0;
		if (cache.messageCount > 1) {
			segments.push({ label: "R:", value: rPct.toFixed(1), kind: "cache", colorValue: rPct });
		} else {
			segments.push({ label: "R:", value: "--.-", kind: "cache" });
		}

		segments.push({ label: "M:", value: formatTokens(cache.totalMissTokens), kind: "miss" });
	}

	return segments;
}

/**
 * Cache hit-rate color class — matches pi-emote's colorByCacheThreshold:
 * ≥95 success, ≥85 default (no class), ≥75 warning, <75 danger.
 */
function cacheValueClass(value: number): string {
	if (value >= 95) return "cache-good";
	if (value >= 85) return "";
	if (value >= 75) return "cache-mid";
	return "cache-low";
}

/** Shared footer markup for both assistant render paths. */
export function renderTurnStatsFooter(stats: TurnStats): TemplateResult {
	const segments = turnStatsSegments(stats);
	return html`
		<div class="turn-stats">
			${segments.map((segment) => {
				const extra = segment.colorValue !== undefined ? cacheValueClass(segment.colorValue) : "";
				const valueClass = extra ? `turn-stat-value ${extra}` : "turn-stat-value";
				return html`<span class="turn-stat">
					<span class="turn-stat-label">${segment.label}</span>
					<span class=${valueClass}>${segment.value}</span>
				</span>`;
			})}
		</div>
	`;
}

/** Plain-string form (handy for tests / debugging). */
export function formatTurnStats(stats: TurnStats): string {
	return turnStatsSegments(stats)
		.map((segment) => `${segment.label}${segment.value}`)
		.join(" ");
}
