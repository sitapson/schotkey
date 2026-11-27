/**
 * The icon boundary: a fixed 62 px square centred on the 144 px key. Icons are scaled to fill it
 * as far as they can without distortion (a tall icon touches top and bottom, a wide one the
 * sides), measured by what they actually draw. Layouts never move or resize it; pips, gauges and
 * text go around it.
 */
export const ICON_BOUNDARY = { cx: 72, cy: 72, size: 62 };

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** SVG transform that scales and centres artwork whose drawn extent is `box` into the boundary. */
export function fitToBoundary(box: Box): string {
	const k = ICON_BOUNDARY.size / Math.max(box.w, box.h);
	return `translate(${ICON_BOUNDARY.cx} ${ICON_BOUNDARY.cy}) scale(${k.toFixed(4)}) translate(${(-(box.x + box.w / 2)).toFixed(2)} ${(-(box.y + box.h / 2)).toFixed(2)})`;
}
