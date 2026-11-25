// The launch video's timeline, in frames at 30 fps (35 s).
export const L_DURATION = 1050;

// 1. The callback (0-4 s): the teaser's stack, Zarqa peeks out and taps it into one ticket.
export const PEEK = 12; // clip A starts; she slides out from behind the stack
export const REMEMBER = 24; // "Remember these?"
export const TAP = PEEK + 77; // her tap lands on the stack
export const COMPRESS_END = TAP + 14; // the screenshots have folded into one small ticket

// 2. The reveal (4-8 s): the ticket flips into the app, the camera pulls back to a phone.
export const FLIP = 128; // the ticket turns...
export const FLIP_MID = 139; // ...and its other side is the app
export const PULL_BACK = 150; // the camera pulls back to reveal the phone
export const PULL_BACK_END = 190;
export const BETTER_WAY = 166; // "There's a better way." behind the phone
export const BRAND = 200; // ZARQA. The music kicks in.

// 3. Lost something? (8-15 s): the real lost-item flow, Zarqa points at the listing.
export const LOST = 240;
export const L_SCROLL = 270; // to the form
export const L_TYPE = 292; // "Black glasses in a brown case"
export const L_WHERE = 342; // the location field
export const L_PICK = 368; // "GU1 Library" picked
export const L_TO_BUTTON = 372;
export const L_PRESS = 388;
export const L_POSTED = 398; // My reports, with the new listing
export const POINT = 380; // clip B starts; her point lands as the listing does

// 4. Found something? (15-22 s): the phone slides out, a FOUND tag flips into the found flow.
export const FOUND = 450;
export const F_TAG_FLIP = 492;
export const F_SCROLL = 520;
export const F_TYPE = 537; // "Calculator next to an orange notebook"
export const F_WHERE = 576;
export const F_PICK = 596; // "GU2 UPAD Building"
export const F_RSA = 600; // drop it at the RSA desk
export const F_PRESS = 612;
export const F_POSTED = 618; // the drop-off code
export const NOD = 590; // clip C starts; her approving nod lands with the two cards
export const PAIR = 630; // LOST and FOUND cards side by side

// 5. One place (22-29 s): the cards slide in, the app fills up, items orbit and snap into a list.
export const ONE_PLACE = 660;
export const ORBIT = 720;
export const SNAP = 790;

// 6. The launch (29-35 s): the interface fades, Zarqa waves, ZARQA IS LIVE.
export const LAUNCH = 870;
export const WAVE = 905; // clip D starts
export const LOGO_BIG = 925;
export const LOGO_SETTLE = 950;
export const BRAND_SOUND = 958;
export const LIVE = 972;
export const SITE = 1000;
