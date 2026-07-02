// ponytail: module-level session constraints ref, set by main.ts on workspace switch.
// Global constraints read from localStorage on each call so they stay fresh.

const GLOBAL_KEY = "pi-desktop.global-constraints.v1";

let _sessionConstraints: string[] = [];

export function setActiveSessionConstraints(constraints: string[]): void {
	_sessionConstraints = [...constraints];
}

function loadGlobalConstraints(): string[] {
	try {
		const raw = localStorage.getItem(GLOBAL_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) return parsed.filter((c: unknown) => typeof c === "string" && c.trim().length > 0).map((c: string) => c.trim());
		}
	} catch { /* ignore */ }
	return [];
}

export function getActiveConstraints(): string[] {
	return [...loadGlobalConstraints(), ..._sessionConstraints];
}

export function getConstraintsPrefix(): string {
	const all = getActiveConstraints();
	if (all.length === 0) return "";
	const lines = all.map((c) => `- ${c}`).join("\n");
	return `<constraints>\nThe following constraints are ACTIVE and MUST be respected. They are non-negotiable guardrails:\n${lines}\n</constraints>\n\n`;
}
