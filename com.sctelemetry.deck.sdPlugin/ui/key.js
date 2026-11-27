/**
 * SC Button settings panel: show only the settings that apply.
 *  - data-show="kinds or choices", e.g. "status power" or "gauge:custom": shown for those button
 *    choices ("power:engines" is kind "power"). Nothing but the dropdown shows until a choice is made.
 *  - data-press="long": also needs that Press option (e.g. the Long press ms slider).
 */
(() => {
	const state = { button: undefined, pressMode: "tap" };

	function apply() {
		const choice = state.button;
		const kind = (choice || "").split(":")[0];
		for (const el of document.querySelectorAll("[data-show]")) {
			const list = el.dataset.show.split(/\s+/);
			let show = !!choice && (list.includes(kind) || list.includes(choice));
			if (show && el.dataset.press) show = el.dataset.press === state.pressMode;
			el.style.display = show ? "block" : "none";
		}
	}

	function watch(key, fallback) {
		const update = (v) => {
			const value = v ?? fallback;
			if (value === state[key]) return;
			state[key] = value;
			apply();
		};
		const [get] = window.SDPIComponents.useSettings(key, update, 0);
		get().then(update);
		// A change made in this panel isn't echoed back as a settings event, so also check the
		// stored value regularly (it's updated as soon as the control changes).
		setInterval(() => get().then(update), 300);
	}

	apply();
	watch("button", undefined);
	watch("pressMode", "tap");
})();
