/**
 * Generates the marketplace icon.
 *
 * Kept as a script rather than a committed binary blob alone, so the colours and
 * proportions can be retuned without a design tool. There is no image library
 * here, so shapes are rasterised from signed distance fields and the PNG is
 * encoded by hand — both are small enough to be worth it for one 128px asset.
 *
 * The mark is `{ > }`: the braces every template language wraps its tags in,
 * around Emmet's nesting operator.
 *
 *   node scripts/make-icon.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const SIZE = 128;
/** Samples per axis, per pixel. Cheap at this size and removes all jaggies. */
const AA = 3;

const BACKGROUND_TOP = [0x16, 0x21, 0x3a];
const BACKGROUND_BOTTOM = [0x0b, 0x11, 0x20];
const BRACE = [0xe2, 0xe8, 0xf0];
const CHEVRON = [0x38, 0xbd, 0xf8];

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Distance from `p` to the segment `a`-`b`. */
function distanceToSegment(px, py, ax, ay, bx, by) {
	const vx = bx - ax;
	const vy = by - ay;
	const wx = px - ax;
	const wy = py - ay;
	const lengthSquared = vx * vx + vy * vy;
	const t = lengthSquared === 0 ? 0 : clamp01((wx * vx + wy * vy) / lengthSquared);
	const dx = wx - vx * t;
	const dy = wy - vy * t;
	return Math.hypot(dx, dy);
}

/** Distance from `p` to a rounded rectangle centred on the canvas. */
function distanceToRoundedRect(px, py, halfWidth, halfHeight, radius) {
	const qx = Math.abs(px - SIZE / 2) - (halfWidth - radius);
	const qy = Math.abs(py - SIZE / 2) - (halfHeight - radius);
	return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

/** Samples a cubic bezier into a polyline. */
function bezier(p0, c0, c1, p1, steps = 16) {
	const points = [];
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const u = 1 - t;
		points.push([
			u * u * u * p0[0] + 3 * u * u * t * c0[0] + 3 * u * t * t * c1[0] + t * t * t * p1[0],
			u * u * u * p0[1] + 3 * u * u * t * c0[1] + 3 * u * t * t * c1[1] + t * t * t * p1[1],
		]);
	}
	return points;
}

/**
 * Centreline of `{`, in a unit box. The brace pinches to a point at the middle
 * left, which is what stops it reading as a bracket.
 */
function bracePath() {
	return [
		...bezier([0.92, 0.02], [0.58, 0.02], [0.46, 0.06], [0.46, 0.2]),
		[0.46, 0.38],
		...bezier([0.46, 0.38], [0.46, 0.46], [0.22, 0.46], [0.06, 0.5]),
		...bezier([0.06, 0.5], [0.22, 0.54], [0.46, 0.54], [0.46, 0.62]),
		[0.46, 0.8],
		...bezier([0.46, 0.8], [0.46, 0.94], [0.58, 0.98], [0.92, 0.98]),
	];
}

/** Maps a unit path into a box, optionally mirrored for the closing brace. */
function place(path, x, y, width, height, mirrored) {
	return path.map(([ux, uy]) => [x + (mirrored ? 1 - ux : ux) * width, y + uy * height]);
}

function polylineDistance(px, py, points) {
	let best = Infinity;
	for (let i = 0; i < points.length - 1; i++) {
		const d = distanceToSegment(px, py, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
		if (d < best) {
			best = d;
		}
	}
	return best;
}

const unitBrace = bracePath();
const leftBrace = place(unitBrace, 8, 30, 30, 68, false);
const rightBrace = place(unitBrace, 90, 30, 30, 68, true);
const chevron = [
	[50, 42],
	[80, 64],
	[50, 86],
];

/** Coverage of each layer at one sample point, back to front. */
function sample(px, py) {
	const inCard = clamp01(0.5 - distanceToRoundedRect(px, py, 62, 62, 27));

	const braceDistance = Math.min(
		polylineDistance(px, py, leftBrace),
		polylineDistance(px, py, rightBrace),
	);
	const braceCoverage = clamp01(0.5 - (braceDistance - 3.4));
	const chevronCoverage = clamp01(0.5 - (polylineDistance(px, py, chevron) - 5.2));

	return { inCard, braceCoverage, chevronCoverage };
}

const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
	for (let x = 0; x < SIZE; x++) {
		let card = 0;
		let brace = 0;
		let chev = 0;
		for (let sy = 0; sy < AA; sy++) {
			for (let sx = 0; sx < AA; sx++) {
				const s = sample(x + (sx + 0.5) / AA, y + (sy + 0.5) / AA);
				card += s.inCard;
				brace += s.braceCoverage;
				chev += s.chevronCoverage;
			}
		}
		const samples = AA * AA;
		card /= samples;
		brace /= samples;
		chev /= samples;

		const t = y / (SIZE - 1);
		const rgb = [0, 1, 2].map((i) => lerp(BACKGROUND_TOP[i], BACKGROUND_BOTTOM[i], t));
		// Marks paint over the card, and are clipped by it so nothing spills past
		// the rounded corners.
		for (let i = 0; i < 3; i++) {
			rgb[i] = lerp(rgb[i], BRACE[i], brace * card);
			rgb[i] = lerp(rgb[i], CHEVRON[i], chev * card);
		}

		const at = (y * SIZE + x) * 4;
		pixels[at] = Math.round(rgb[0]);
		pixels[at + 1] = Math.round(rgb[1]);
		pixels[at + 2] = Math.round(rgb[2]);
		pixels[at + 3] = Math.round(card * 255);
	}
}

// --- PNG container -------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) {
		c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	}
	return c >>> 0;
});

function crc32(buffer) {
	let c = 0xffffffff;
	for (const byte of buffer) {
		c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
	}
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([length, body, crc]);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bit depth
header[9] = 6; // truecolour with alpha
// 10..12 stay zero: deflate, adaptive filtering, no interlace.

// Each scanline is prefixed with its filter type; 0 means none.
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
	raw[y * (SIZE * 4 + 1)] = 0;
	pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
	chunk('IHDR', header),
	chunk('IDAT', deflateSync(raw, { level: 9 })),
	chunk('IEND', Buffer.alloc(0)),
]);

const out = new URL('../icon.png', import.meta.url);
writeFileSync(out, png);
console.log(`wrote ${out.pathname} (${SIZE}x${SIZE}, ${png.length} bytes)`);
