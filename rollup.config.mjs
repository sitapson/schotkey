import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import { mkdirSync } from "node:fs";

const sdPlugin = "com.sctelemetry.deck.sdPlugin";
const isWatching = !!process.env.ROLLUP_WATCH;

// The SDK's file logger crashes at startup if logs/ is missing (seen when linked via a junction).
mkdirSync(`${sdPlugin}/logs`, { recursive: true });

const plugins = () => [
	typescript({ sourceMap: isWatching, inlineSources: isWatching }),
	nodeResolve({ browser: false, exportConditions: ["node"], preferBuiltins: true }),
	commonjs(),
	json(),
	{
		name: "emit-module-package-file",
		generateBundle() {
			this.emitFile({ fileName: "package.json", source: `{ "type": "module" }`, type: "asset" });
		},
	},
];

/** @type {import("rollup").RollupOptions[]} */
export default [
	// The Stream Deck plugin itself.
	{
		input: "src/plugin.ts",
		output: { file: `${sdPlugin}/bin/plugin.js`, format: "es", sourcemap: isWatching },
		plugins: [
			{
				name: "watch-externals",
				buildStart() {
					this.addWatchFile(`${sdPlugin}/manifest.json`);
				},
			},
			...plugins(),
		],
	},
	// Standalone probe: `npm run probe` — discovers the game's gRPC schema and records samples.
	{
		input: "src/probe.ts",
		output: { file: "dist/probe.js", format: "es" },
		plugins: plugins(),
	},
];
