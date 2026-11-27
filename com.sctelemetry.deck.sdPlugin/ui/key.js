/**
 * SC Button settings panel: show only the settings that apply to the chosen button.
 * Elements carry data-show="kinds or choices", e.g. "status power" or "gauge:custom";
 * the choice "power:engines" is kind "power". Nothing but the dropdown shows until a choice is made.
 */
(() => {
	function apply(choice) {
		const kind = (choice || "").split(":")[0];
		for (const el of document.querySelectorAll("[data-show]")) {
			const list = el.dataset.show.split(/\s+/);
			el.style.display = choice && (list.includes(kind) || list.includes(choice)) ? "block" : "none";
		}
	}
	let shown;
	const update = (v) => {
		if (v === shown) return;
		shown = v;
		apply(v);
	};
	const [get] = window.SDPIComponents.useSettings("button", update, 0);
	apply(undefined);
	get().then(update);
	// A change made in this panel isn't echoed back as a settings event, so also check the stored
	// choice regularly (it's updated as soon as the dropdown changes).
	setInterval(() => get().then(update), 300);
})();
