import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

// Zarqa visual system (design/HANDOFF.md, web/src/index.css).
export const C = {
	ground: '#222634',
	surface: '#2e3343',
	slate: '#434e5f',
	paper: '#f2eee8',
	paperLine: '#cfc6ba',
	tan: '#bd9777',
	tanLabel: '#8a6a4f',
	sage: '#8e9da0',
	ink: '#222634',
} as const;

export const FONT = {
	display: 'Anton, Impact, sans-serif',
	body: 'Figtree, system-ui, sans-serif',
	mono: '"JetBrains Mono", ui-monospace, monospace',
} as const;

loadFont({family: 'Anton', url: staticFile('fonts/anton-latin-400-normal.woff2'), weight: '400'});
loadFont({family: 'Figtree', url: staticFile('fonts/figtree-latin-400-normal.woff2'), weight: '400'});
loadFont({family: 'Figtree', url: staticFile('fonts/figtree-latin-500-normal.woff2'), weight: '500'});
loadFont({family: 'Figtree', url: staticFile('fonts/figtree-latin-600-normal.woff2'), weight: '600'});
loadFont({family: 'Figtree', url: staticFile('fonts/figtree-latin-700-normal.woff2'), weight: '700'});
loadFont({family: 'Figtree', url: staticFile('fonts/figtree-latin-800-normal.woff2'), weight: '800'});
loadFont({
	family: 'JetBrains Mono',
	url: staticFile('fonts/jetbrains-mono-latin-700-normal.woff2'),
	weight: '700',
});
