// Frame numbers at 30 fps. After the finger they follow the music (audio/elevenlabs-score-final.mp3,
// 110 BPM): a short hush, a big hit at 11.975 s, a groove on a 0.544 s beat, a final hit at 20.82 s,
// then it rings out.
export const FPS = 30;

// The frames the 16 screenshots land on, in order, each with its ping.
export const POST_NOTES = [
	20, 49, 80, // the first post
	122, 142, 156, 161, 171, // the problem grows
	182, 189, 200, 213, 230, 241, 247, 273, // chaos, the 20 rial pair last
];

export const FINGER = 307; // 10.23 s: finger up, every screenshot freezes
export const COLLAPSE = 318; // 10.6 s: the freeze ends, the screenshots collapse one after another
export const MERGE = 356; // the settled stack folds...
export const TICKET = 359; // 11.975 s: ...into the ticket, on the music's big hit
export const THERE = 412; // 13.73 s, on a beat: the ticket vanishes, "THERE" lands
export const IS = 428; // 14.27 s, the next beat: "IS.", then both words hold
export const IDENTITY = 461; // 15.36 s, on a beat: ZARQA. COMING SOON, with the biggest hit
export const STICKER = 477; // 15.90 s, the next beat: the COMING SOON sticker slaps on
export const BLACK = 625; // 20.82 s: hard cut to black on the music's final hit
export const DURATION = 705; // 23.5 s: the music rings out under the black

export const ZARQA_ENTER = 238; // ~7.9 s, as the chaos peaks

// Where the screenshots stack, and where the ticket they become is centred.
export const STACK = {x: 540, y: 720, width: 600, aspect: 0.72};
