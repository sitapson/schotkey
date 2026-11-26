/**
 * Sends keystrokes as hardware scancodes (SendInput + KEYEVENTF_SCANCODE),
 * which Star Citizen reads reliably — unlike virtual-key events.
 *
 * Uses one long-lived PowerShell child process that compiles a tiny C# helper
 * once, then takes commands on stdin. No native Node modules to build or bundle.
 */
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";

interface Scan {
	code: number;
	extended: boolean;
}

// Scancode set 1. "e" = extended (E0-prefixed) key.
const SCANCODES: Record<string, [number, boolean?]> = {
	ESC: [0x01], ESCAPE: [0x01], "1": [0x02], "2": [0x03], "3": [0x04], "4": [0x05], "5": [0x06], "6": [0x07], "7": [0x08], "8": [0x09], "9": [0x0a], "0": [0x0b],
	MINUS: [0x0c], EQUALS: [0x0d], BACKSPACE: [0x0e], TAB: [0x0f],
	Q: [0x10], W: [0x11], E: [0x12], R: [0x13], T: [0x14], Y: [0x15], U: [0x16], I: [0x17], O: [0x18], P: [0x19],
	LBRACKET: [0x1a], RBRACKET: [0x1b], ENTER: [0x1c], LCTRL: [0x1d],
	A: [0x1e], S: [0x1f], D: [0x20], F: [0x21], G: [0x22], H: [0x23], J: [0x24], K: [0x25], L: [0x26],
	SEMICOLON: [0x27], APOSTROPHE: [0x28], GRAVE: [0x29], LSHIFT: [0x2a], BACKSLASH: [0x2b],
	Z: [0x2c], X: [0x2d], C: [0x2e], V: [0x2f], B: [0x30], N: [0x31], M: [0x32],
	COMMA: [0x33], PERIOD: [0x34], SLASH: [0x35], RSHIFT: [0x36], NUMMULTIPLY: [0x37], LALT: [0x38], SPACE: [0x39], CAPSLOCK: [0x3a],
	F1: [0x3b], F2: [0x3c], F3: [0x3d], F4: [0x3e], F5: [0x3f], F6: [0x40], F7: [0x41], F8: [0x42], F9: [0x43], F10: [0x44],
	NUMLOCK: [0x45], SCROLLLOCK: [0x46],
	NUM7: [0x47], NUM8: [0x48], NUM9: [0x49], NUMMINUS: [0x4a], NUM4: [0x4b], NUM5: [0x4c], NUM6: [0x4d], NUMPLUS: [0x4e],
	NUM1: [0x4f], NUM2: [0x50], NUM3: [0x51], NUM0: [0x52], NUMDECIMAL: [0x53],
	F11: [0x57], F12: [0x58],
	// F13–F24 are unused by most apps: great for Stream Deck-only binds in SC.
	F13: [0x64], F14: [0x65], F15: [0x66], F16: [0x67], F17: [0x68], F18: [0x69], F19: [0x6a], F20: [0x6b], F21: [0x6c], F22: [0x6d], F23: [0x6e], F24: [0x76],
	RCTRL: [0x1d, true], RALT: [0x38, true], NUMENTER: [0x1c, true], NUMDIVIDE: [0x35, true],
	INSERT: [0x52, true], DELETE: [0x53, true], HOME: [0x47, true], END: [0x4f, true], PAGEUP: [0x49, true], PAGEDOWN: [0x51, true],
	UP: [0x48, true], DOWN: [0x50, true], LEFT: [0x4b, true], RIGHT: [0x4d, true],
};
const ALIASES: Record<string, string> = { ALT: "LALT", CTRL: "LCTRL", CONTROL: "LCTRL", SHIFT: "LSHIFT", RETURN: "ENTER", DEL: "DELETE", INS: "INSERT", PGUP: "PAGEUP", PGDN: "PAGEDOWN" };

/** A sequence of combos, e.g. "LAlt+N" or "LCtrl+F13, wait 200, N". */
export type Step = { combo: Scan[] } | { wait: number };

export function parseKeys(spec: string): Step[] {
	return spec
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
		.map((part): Step => {
			const wait = /^wait\s+(\d+)$/i.exec(part);
			if (wait) return { wait: Number(wait[1]) };
			return {
				combo: part.split("+").map((name) => {
					const key = name.trim().toUpperCase().replace(/\s+/g, "");
					const entry = SCANCODES[ALIASES[key] ?? key];
					if (!entry) throw new Error(`Unknown key "${name.trim()}"`);
					return { code: entry[0], extended: !!entry[1] };
				}),
			};
		});
}

const HELPER = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class SCKeys {
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public InputUnion U; }
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  public static uint Key(ushort scan, bool extended, bool up) {
    var i = new INPUT();
    i.type = 1;
    i.U.ki.wScan = scan;
    i.U.ki.dwFlags = 0x8u | (extended ? 0x1u : 0u) | (up ? 0x2u : 0u);
    return SendInput(1, new INPUT[] { i }, Marshal.SizeOf(typeof(INPUT)));
  }
}
"@
[Console]::Out.WriteLine('ready')
while ($null -ne ($line = [Console]::In.ReadLine())) {
  foreach ($cmd in $line.Split(';')) {
    $p = $cmd.Trim().Split(' ')
    if ($p[0] -eq 'k') { [void][SCKeys]::Key([uint16]$p[1], $p[2] -eq '1', $p[3] -eq '1') }
    elseif ($p[0] -eq 's') { Start-Sleep -Milliseconds ([int]$p[1]) }
  }
}
`;

export class Keyboard {
	private proc?: ChildProcessWithoutNullStreams;

	constructor(private readonly log: { warn(...a: unknown[]): unknown } = console) {}

	/** Starts the helper early so the first press isn't delayed by PowerShell startup. */
	warmUp(): void {
		this.ensure();
	}

	/** Tap: press the whole sequence, holding each combo for `holdMs`. */
	tap(steps: Step[], holdMs = 40): void {
		const cmds: string[] = [];
		for (const step of steps) {
			if ("wait" in step) {
				cmds.push(`s ${step.wait}`);
				continue;
			}
			cmds.push(...this.down(step.combo), `s ${holdMs}`, ...this.up(step.combo), "s 20");
		}
		this.send(cmds);
	}

	/** Hold: press and keep the last combo down until `release()` — mirrors the physical key. */
	press(steps: Step[]): void {
		const combo = lastCombo(steps);
		if (combo) this.send(this.down(combo));
	}

	release(steps: Step[]): void {
		const combo = lastCombo(steps);
		if (combo) this.send(this.up(combo));
	}

	dispose(): void {
		this.proc?.stdin.end();
		this.proc?.kill();
		this.proc = undefined;
	}

	private down(combo: Scan[]) {
		return combo.map((k) => `k ${k.code} ${k.extended ? 1 : 0} 0`);
	}

	private up(combo: Scan[]) {
		return [...combo].reverse().map((k) => `k ${k.code} ${k.extended ? 1 : 0} 1`);
	}

	private send(cmds: string[]): void {
		this.ensure().stdin.write(cmds.join(";") + "\n");
	}

	private ensure(): ChildProcessWithoutNullStreams {
		if (this.proc && this.proc.exitCode === null) return this.proc;
		const encoded = Buffer.from(HELPER, "utf16le").toString("base64");
		const proc = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
			windowsHide: true,
		});
		proc.stderr.on("data", (d) => {
			const text = String(d).trim();
			// PowerShell serializes progress records to stderr as CLIXML when redirected; that's noise.
			if (text && !text.startsWith("#< CLIXML") && !text.startsWith("<Objs")) this.log.warn(`Keyboard helper: ${text}`);
		});
		proc.on("exit", () => {
			if (this.proc === proc) this.proc = undefined;
		});
		this.proc = proc;
		return proc;
	}
}

function lastCombo(steps: Step[]): Scan[] | undefined {
	for (let i = steps.length - 1; i >= 0; i--) {
		const s = steps[i];
		if ("combo" in s) return s.combo;
	}
	return undefined;
}
