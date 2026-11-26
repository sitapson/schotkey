// Lists every field the telemetry stream can send, from the extracted schema.
//
//   node scripts/list-fields.mjs [schema.protoset] [probe .jsonl for example values] [out.md]
//
// Re-run after `npm run extract-schema` when the game is patched.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import protobuf from "protobufjs";
import descriptor from "protobufjs/ext/descriptor/index.js";

const schemaFile = process.argv[2] ?? "com.sctelemetry.deck.sdPlugin/schema/telemetry.protoset";
const samplesFile =
	process.argv[3] ??
	(existsSync("probe-output") ? readdirSync("probe-output").filter((f) => f.endsWith(".jsonl")).map((f) => join("probe-output", f))[0] : undefined);
const outFile = process.argv[4] ?? "docs/TELEMETRY_FIELDS.md";

const set = descriptor.FileDescriptorSet.decode(readFileSync(schemaFile));
const root = protobuf.Root.fromDescriptor(set);
root.resolveAll();

let service, method;
const walkNs = (ns) => {
	for (const obj of ns.nestedArray) {
		if (obj instanceof protobuf.Service && !service) service = obj;
		else if (obj instanceof protobuf.Namespace) walkNs(obj);
	}
};
walkNs(root);
method = service.methodsArray.find((m) => m.responseStream) ?? service.methodsArray[0];
method.resolve();
const response = method.resolvedResponseType;

// Example values: last value seen for each path in a probe recording.
const examples = new Map();
const flatten = (v, p, out) => {
	if (v === null || v === undefined) return;
	if (Array.isArray(v)) v.forEach((x, i) => flatten(x, `${p}.${i}`, out));
	else if (typeof v === "object") for (const [k, x] of Object.entries(v)) flatten(x, p ? `${p}.${k}` : k, out);
	else {
		const safe = redact(p, v);
		if (safe !== undefined) out.set(p, safe);
	}
};
// Personal values never go into the docs: the aUEC balance, and the long entity IDs the
// game appends to ship / seat / weapon names (e.g. SHIP_NAME_123456789012).
function redact(path, v) {
	if (/uec_balance/.test(path)) return undefined;
	return typeof v === "string" ? v.replace(/_\d{9,}/g, "_…") : v;
}
let sampleCount = 0;
if (samplesFile && existsSync(samplesFile)) {
	for (const line of readFileSync(samplesFile, "utf8").split("\n")) {
		if (!line.trim()) continue;
		sampleCount++;
		flatten(JSON.parse(line), "", examples);
	}
}

const short = (t) => t.replace(/^\.?sc\.game\.telemetry\.v1\./, "");
const enumValues = (e, path) => {
	const names = Object.keys(e.values);
	// Strip the shared prefix so the list is readable: VEHICLE_COMPONENT_DEPLOYMENT_STATE_DEPLOYED -> DEPLOYED
	let prefix = names.length > 1 ? names.reduce((a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return a.slice(0, i); }) : "";
	prefix = prefix.slice(0, prefix.lastIndexOf("_") + 1);
	return { prefix, values: names.map((n) => n.slice(prefix.length)) };
};

const sections = new Map(); // top-level -> rows
const enums = new Map();
function walk(type, path, depth, seen) {
	for (const f of type.fieldsArray) {
		f.resolve();
		if (f.partOf && f.partOf.name.startsWith("_") && f.partOf.fieldsArray.length === 1) {
			// proto3 `optional`: fine, just note it below
		}
		const p = path ? `${path}.${f.name}` : f.name;
		const listPath = f.repeated ? `${p}.N` : p;
		const top = p.split(".")[0];
		if (!sections.has(top)) sections.set(top, []);
		const rows = sections.get(top);
		const exKey = f.repeated ? `${p}.0` : p;

		if (f.resolvedType instanceof protobuf.Type) {
			if (seen.has(f.resolvedType.fullName)) {
				rows.push({ path: listPath, type: `${short(f.resolvedType.fullName)} (recursive)`, note: "" });
				continue;
			}
			if (f.repeated) rows.push({ path: listPath, type: `list of ${short(f.resolvedType.fullName)}`, note: "N = 0, 1, 2…" });
			walk(f.resolvedType, f.repeated ? `${p}.N` : p, depth + 1, new Set([...seen, f.resolvedType.fullName]));
		} else {
			let type = f.type;
			let note = "";
			if (f.resolvedType instanceof protobuf.Enum) {
				const { prefix, values } = enumValues(f.resolvedType);
				enums.set(short(f.resolvedType.fullName), { prefix, values });
				type = `enum ${short(f.resolvedType.fullName)}`;
			}
			if (f.repeated) type = `list of ${type}`;
			const ex = examples.has(exKey.replace(/\.N(?=\.|$)/g, ".0")) ? JSON.stringify(examples.get(exKey.replace(/\.N(?=\.|$)/g, ".0"))) : "";
			rows.push({ path: listPath, type, example: ex, note });
		}
	}
}
walk(response, "", 0, new Set([response.fullName]));

const fieldCount = [...sections.values()].reduce((n, r) => n + r.filter((x) => !x.type.startsWith("list of ") || !/^[A-Z]/.test(x.type.slice(8))).length, 0);
let md = `# Star Citizen telemetry fields\n\n`;
md += `Every field \`${service.fullName.slice(1)}/${method.name}\` can send, from the schema extracted from the game exe.\n\n`;
md += `- **Use in SC Hotkey:** pick the path in the *Telemetry field* dropdown, or type it. In lists, replace \`N\` with 0, 1, 2… (e.g. \`weapons.weapons.0.ready_to_fire\`).\n`;
md += `- **Enums** arrive as full names such as \`VEHICLE_COMPONENT_DEPLOYMENT_STATE_DEPLOYED\`. In *ON when value is* you can type just the end: \`DEPLOYED\`.\n`;
md += `- **Example** values are from a ${sampleCount ? `${sampleCount}-message recording` : "recording"} on LIVE. A blank example means the field wasn't sent then (e.g. no turret seat, no events). Personal values (aUEC balance, entity IDs in names) are removed.\n`;
md += `- Generated by \`node scripts/list-fields.mjs\`. Re-run after a game patch and \`npm run extract-schema\`.\n\n`;

const sectionTitles = { actor: "Player (actor)", vehicle: "Vehicle", weapons: "Weapons", turret: "Turret", force_feedback: "Force feedback", events: "Events" };
md += `## Contents\n\n`;
for (const top of sections.keys()) md += `- [${sectionTitles[top] ?? top}](#${(sectionTitles[top] ?? top).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}) — ${sections.get(top).length} entries\n`;
md += `- [Enum values](#enum-values)\n\n`;

for (const [top, rows] of sections) {
	md += `## ${sectionTitles[top] ?? top}\n\n| Field | Type | Example |\n| --- | --- | --- |\n`;
	for (const r of rows) md += `| \`${r.path}\` | ${r.type}${r.note ? ` (${r.note})` : ""} | ${r.example ? `\`${r.example.length > 60 ? r.example.slice(0, 57) + "…" : r.example}\`` : ""} |\n`;
	md += `\n`;
}
md += `## Enum values\n\nShown without their shared prefix. The game sends the full name (prefix + value).\n\n| Enum | Prefix | Values |\n| --- | --- | --- |\n`;
for (const [name, { prefix, values }] of [...enums].sort()) md += `| ${name} | \`${prefix}\` | ${values.map((v) => `\`${v}\``).join(", ")} |\n`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, md);
// Same data as JSON, for scripts/fields-page.mjs.
writeFileSync(
	outFile.replace(/\.md$/i, ".json"),
	JSON.stringify(
		{
			method: `${service.fullName.slice(1)}/${method.name}`,
			sampleCount,
			sections: [...sections].map(([key, rows]) => ({ key, title: sectionTitles[key] ?? key, rows })),
			enums: [...enums].sort().map(([name, e]) => ({ name, ...e })),
		},
		null,
		1,
	),
);
console.log(`Wrote ${outFile}: ${[...sections.values()].reduce((n, r) => n + r.length, 0)} entries in ${sections.size} sections, ${enums.size} enums, examples from ${sampleCount} messages`);
