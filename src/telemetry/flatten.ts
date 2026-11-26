export type Leaf = string | number | boolean | null;

/**
 * Flattens a nested message into dotted paths, e.g.
 * { ship: { gear: { deployed: true } } } -> { "ship.gear.deployed": true }.
 * Arrays use their index: "party.members.0.name".
 */
export function flatten(value: unknown, prefix = "", out: Record<string, Leaf> = {}): Record<string, Leaf> {
	if (value === null || value === undefined) {
		if (prefix) out[prefix] = null;
	} else if (Array.isArray(value)) {
		value.forEach((v, i) => flatten(v, prefix ? `${prefix}.${i}` : String(i), out));
	} else if (value instanceof Uint8Array) {
		out[prefix] = `<${value.length} bytes>`;
	} else if (typeof value === "object") {
		for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
	} else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		out[prefix] = value;
	} else {
		out[prefix] = String(value);
	}
	return out;
}
