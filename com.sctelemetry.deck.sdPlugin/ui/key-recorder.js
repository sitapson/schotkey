/**
 * <key-recorder setting="keys">: a field that records a key combination instead of taking typed
 * text. Click it, then press the keys (e.g. hold Right Alt and press L): it saves "RAlt+L" in the
 * plugin's own key names (src/input/keyboard.ts). Modifiers alone (e.g. just Right Alt) are saved
 * when released. The × button clears the binding.
 *
 * Needs sdpi-components loaded first (uses SDPIComponents.useSettings to read and save).
 */
(() => {
	// KeyboardEvent.code (the physical key, whatever the layout) -> the plugin's key name.
	const NAMES = {
		ControlLeft: "LCtrl", ControlRight: "RCtrl", ShiftLeft: "LShift", ShiftRight: "RShift",
		AltLeft: "LAlt", AltRight: "RAlt", MetaLeft: "LWin", MetaRight: "RWin",
		Escape: "Esc", Tab: "Tab", CapsLock: "CapsLock", Space: "Space", Enter: "Enter", Backspace: "Backspace",
		Minus: "Minus", Equal: "Equals", BracketLeft: "LBracket", BracketRight: "RBracket", Semicolon: "Semicolon",
		Quote: "Apostrophe", Backquote: "Grave", Backslash: "Backslash", IntlBackslash: "Oem102", Comma: "Comma", Period: "Period", Slash: "Slash",
		Insert: "Insert", Delete: "Delete", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
		ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
		NumLock: "NumLock", ScrollLock: "ScrollLock",
		NumpadAdd: "NumPlus", NumpadSubtract: "NumMinus", NumpadMultiply: "NumMultiply", NumpadDivide: "NumDivide",
		NumpadDecimal: "NumDecimal", NumpadEnter: "NumEnter",
	};
	const MODIFIERS = ["LCtrl", "RCtrl", "LShift", "RShift", "LAlt", "RAlt", "LWin", "RWin"];

	function nameOf(code) {
		if (NAMES[code]) return NAMES[code];
		let m;
		if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
		if ((m = /^Digit(\d)$/.exec(code))) return m[1];
		if ((m = /^Numpad(\d)$/.exec(code))) return "Num" + m[1];
		if ((m = /^F(\d{1,2})$/.exec(code)) && +m[1] >= 1 && +m[1] <= 24) return "F" + m[1];
		return undefined;
	}

	class KeyRecorder extends HTMLElement {
		connectedCallback() {
			if (this.shadowRoot) return;
			const root = this.attachShadow({ mode: "open" });
			root.innerHTML = `
				<style>
					:host { display: flex; gap: 4px; align-items: stretch; }
					.field { flex: 1; min-height: 26px; box-sizing: border-box; padding: 4px 8px; border-radius: 3px; border: 1px solid #3d3d3d;
						background: #3d3d3d; color: #d8d8d8; font: 9pt "Segoe UI", system-ui, sans-serif; cursor: pointer; outline: none;
						display: flex; align-items: center; user-select: none; }
					.field.empty { color: #8a8a8a; }
					.field.recording { border-color: #3fd0c9; background: #24363a; color: #ffffff; }
					.field.error { border-color: #ff4f4f; }
					button { width: 26px; border: 1px solid #3d3d3d; border-radius: 3px; background: #3d3d3d; color: #bbb; cursor: pointer; font-size: 11pt; padding: 0; }
					button:hover { color: #fff; }
				</style>
				<div class="field" tabindex="0" title="Click, then press the key combination (e.g. hold Right Alt and press L)"></div>
				<button type="button" title="Clear">&times;</button>`;
			this.field = root.querySelector(".field");
			this.clear = root.querySelector("button");
			this.held = new Set(); // plugin key names currently down
			this.recording = false;
			this.value = "";

			const [get, set] = window.SDPIComponents.useSettings(this.getAttribute("setting") || "keys", (v) => this.show(v ?? ""), 0);
			this.save = set;
			get().then((v) => this.show(v ?? ""));

			this.field.addEventListener("focus", () => this.start());
			this.field.addEventListener("click", () => this.start());
			this.field.addEventListener("blur", () => this.stop());
			this.field.addEventListener("keydown", (e) => this.down(e));
			this.field.addEventListener("keyup", (e) => this.up(e));
			this.clear.addEventListener("click", () => this.commit(""));
		}

		show(v, error) {
			this.value = v;
			if (this.recording) return;
			this.field.textContent = error || v || "Click, then press keys";
			this.field.classList.toggle("empty", !v && !error);
			this.field.classList.toggle("error", !!error);
		}

		start() {
			if (this.recording) return;
			this.recording = true;
			this.held.clear();
			this.mainPressed = false;
			this.peak = "";
			this.field.classList.add("recording");
			this.field.classList.remove("empty", "error");
			this.field.textContent = "Press keys\u2026";
		}

		stop() {
			this.recording = false;
			this.held.clear();
			this.field.classList.remove("recording");
			this.show(this.value);
		}

		combo(extra) {
			const mods = MODIFIERS.filter((m) => this.held.has(m));
			return [...mods, ...(extra ? [extra] : [])].join("+");
		}

		down(e) {
			if (!this.recording) return;
			e.preventDefault();
			e.stopPropagation();
			if (e.repeat) return;
			const name = nameOf(e.code);
			if (!name) {
				this.recording = false;
				this.field.classList.remove("recording");
				this.show(this.value, `That key isn't supported (${e.code || e.key})`);
				setTimeout(() => this.field.blur(), 0);
				return;
			}
			// Windows sends a fake Left Ctrl with Right Alt (AltGr) on many layouts: drop it.
			if (name === "RAlt" && e.getModifierState && e.getModifierState("AltGraph")) this.held.delete("LCtrl");
			if (MODIFIERS.includes(name)) {
				this.held.add(name);
				this.peak = this.combo(); // the most modifiers held at once, for a modifiers-only bind
				this.field.textContent = this.peak + "+\u2026";
				return;
			}
			// A main key finishes the combination.
			this.mainPressed = true;
			this.commit(this.combo(name));
		}

		up(e) {
			if (!this.recording) return;
			e.preventDefault();
			e.stopPropagation();
			const name = nameOf(e.code);
			// Modifiers only (e.g. a bind on Right Alt alone): saved once they are all released.
			if (name && MODIFIERS.includes(name) && !this.mainPressed) {
				this.held.delete(name);
				if (this.held.size === 0 && this.peak) this.commit(this.peak);
			}
		}

		commit(v) {
			this.value = v;
			this.save(v);
			this.recording = false;
			this.field.classList.remove("recording");
			this.show(v);
			this.field.blur();
		}
	}

	customElements.define("key-recorder", KeyRecorder);
})();
