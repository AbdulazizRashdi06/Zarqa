// Synthesizes the notification pings for the lost-and-found posts into public/audio:
// two soft bell notes (D6 then G6), at four rising pitches for the four stages.
// Run: node scripts/make-pings.mjs
import {mkdirSync, writeFileSync} from 'node:fs';

const RATE = 44100;
const OUT = new URL('../public/audio/', import.meta.url);
mkdirSync(OUT, {recursive: true});

const writeWav = (name, samples) => {
	const n = samples.length;
	const buf = Buffer.alloc(44 + n * 4);
	buf.write('RIFF', 0);
	buf.writeUInt32LE(36 + n * 4, 4);
	buf.write('WAVEfmt ', 8);
	buf.writeUInt32LE(16, 16);
	buf.writeUInt16LE(1, 20);
	buf.writeUInt16LE(2, 22);
	buf.writeUInt32LE(RATE, 24);
	buf.writeUInt32LE(RATE * 4, 28);
	buf.writeUInt16LE(4, 32);
	buf.writeUInt16LE(16, 34);
	buf.write('data', 36);
	buf.writeUInt32LE(n * 4, 40);
	for (let i = 0; i < n; i++) {
		const v = Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767);
		buf.writeInt16LE(v, 44 + i * 4);
		buf.writeInt16LE(v, 46 + i * 4);
	}
	writeFileSync(new URL(name, OUT), buf);
	console.log(`wrote public/audio/${name} (${(n / RATE).toFixed(2)} s)`);
};

const bell = (out, start, freq, amp) => {
	const s0 = Math.round(start * RATE);
	for (let i = 0; s0 + i < out.length; i++) {
		const t = i / RATE;
		const env = Math.min(1, t / 0.003) * Math.exp(-t / 0.11);
		out[s0 + i] +=
			amp *
			env *
			(Math.sin(2 * Math.PI * freq * t) +
				0.25 * Math.sin(2 * Math.PI * freq * 2.01 * t) * Math.exp(-t / 0.04));
	}
};

const semitone = (base, n) => base * 2 ** (n / 12);
[0, 2, 4, 7].forEach((shift, idx) => {
	const out = new Float32Array(Math.round(0.5 * RATE));
	bell(out, 0, semitone(1174.66, shift), 0.8); // D6
	bell(out, 0.075, semitone(1567.98, shift), 0.7); // G6
	let max = 0;
	for (const v of out) max = Math.max(max, Math.abs(v));
	for (let i = 0; i < out.length; i++) out[i] *= 0.55 / max;
	writeWav(`ping-${idx}.wav`, out);
});
