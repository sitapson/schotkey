/** Builds 144×144 SVG key images so buttons need no image files to show state. */

export interface KeyFace {
	label: string;
	color: string;
	value?: string;
	/** Small corner dot: green = live feed, grey = offline. */
	live: boolean;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function renderKey({ label, color, value, live }: KeyFace): string {
	const lines = wrap(label.toUpperCase(), 9).slice(0, 3);
	const size = lines.length > 2 ? 22 : 26;
	const top = value ? 52 : 78 - ((lines.length - 1) * size) / 2;
	const text = lines
		.map((l, i) => `<text x="72" y="${top + i * (size + 4)}" font-size="${size}">${esc(l)}</text>`)
		.join("");
	const valueText = value ? `<text x="72" y="122" font-size="30" font-weight="700">${esc(value)}</text>` : "";
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">` +
		`<rect width="144" height="144" fill="#12171d"/>` +
		`<rect x="6" y="6" width="132" height="132" rx="14" fill="${esc(color)}"/>` +
		`<g fill="#fff" font-family="Segoe UI, Arial, sans-serif" font-weight="600" text-anchor="middle">${text}${valueText}</g>` +
		`</svg>`;
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

function wrap(text: string, width: number): string[] {
	const out: string[] = [];
	let line = "";
	for (const word of text.split(/\s+/).filter(Boolean)) {
		if (line && (line + " " + word).length > width) {
			out.push(line);
			line = word;
		} else line = line ? `${line} ${word}` : word;
	}
	if (line) out.push(line);
	return out.length ? out : [""];
}

export function formatValue(v: unknown): string {
	if (typeof v === "number") return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(Number.isInteger(v) ? 0 : 1);
	if (typeof v === "boolean") return v ? "ON" : "OFF";
	return v === undefined || v === null ? "—" : String(v).slice(0, 8);
}
