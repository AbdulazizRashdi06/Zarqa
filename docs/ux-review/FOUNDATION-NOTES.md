# Shared foundation: guide for the area fixers

Written by the agent that built the shared foundation (commits dd5822e, 198b56a, 044e8fe on this branch).

USAGE GUIDE FOR AREA FIXERS. Start from commit 044e8fe.

1) Page states: import { LoadingState, LoadError, InlineError, Notice, UserText, ConfirmSheet } from '../components/states'

- LoadingState({ label?: string }): a centred spinner, role=status. It appears only after 300ms. Use it while data loads.
  if (!data && !error) return <LoadingState />

- LoadError({ onRetry: () => void, message?: string, busy?: boolean }): Zarqa says the load failed and offers a Try again BigButton (role=alert). Use it when a load fails. NEVER show an empty state ("No chats yet", "0 REPORTS") for a failed load.
  if (error) return <LoadError onRetry={load} />

- InlineError({ children?, onPaper?: boolean, id?: string, className?: string }): a role=alert <p> that renders nothing when empty, so it can stay in the tree. Pass onPaper inside a Ticket.
  <InlineError onPaper>{error}</InlineError>

- Notice({ children, action?: { label, onClick } }): a one-line paper strip with role=status. Use it for confirmations and for Undo.
  {closed && <Notice action={{ label: 'Undo', onClick: undo }}>Closed the {title}.</Notice>}

- UserText({ as?: ElementType = 'span', className?, children }): for anything a user typed (titles, descriptions, messages, names). It sets dir=auto and the global class user-text (unicode-bidi: plaintext; overflow-wrap: anywhere).
  <UserText as="h1" className={s.title}>{report.title}</UserText>

- ConfirmSheet({ open, title, body?, confirmLabel, cancelLabel, onConfirm, onCancel, busy?, error? }): an in-app bottom sheet built on a native <dialog> (focus trap, Esc and backdrop cancel). Replace every window.confirm with it.
  <ConfirmSheet open={asking} title={t('detail.close.title')} body={t('detail.close.body')} confirmLabel={t('detail.close.go')} cancelLabel={t('detail.close.keep')} busy={busy} error={err} onConfirm={close} onCancel={() => setAsking(false)} />

2) ui.tsx changes
- BigButton has variant 'tan' | 'dark' | 'surface'. 'surface' is an outlined bar for secondary or final actions on the dark page (ReportDetail close, F192/F42). Labels wrap to two lines now, so do not add nowrap or ellipsis. Always pass busy={busy} while working, which also sets aria-busy.
  <BigButton variant="surface" label={t('detail.close')} onClick={() => setAsking(true)} />
- BackHeader({ to='/', label?, right?, previous?: boolean }): Back goes back through history when the page before is `to`; otherwise it replaces the current page with `to`. Pass `previous` on pages reachable from several places (Info pages, F92) to return to whatever in-app page came before. Do not build your own back links.
- RoundButton with badge now reads "Label, N unread". Do not add your own aria text for the badge.
- StatusPill accepts unknown pills (neutral style).
- Switch: the on state is tan-dark. Do not override it.

3) Navigation (lib/nav.tsx, lib/back.ts, lib/transition.ts)
- Every route change sets document.title from the route (routeTitle in nav.tsx), focuses the page's first h1 inside #root, and announces it. Make sure every screen state (loading, error, empty) renders exactly one h1. If your screen autofocuses an input on mount, that wins and is fine. Do NOT set document.title yourselves; add a route in routeTitle if you add one.
- useNavigate() from lib/transition also accepts a number: navigate(-1) goes back with the slide. useBack() from lib/back gives back(to, anyPrevious?).
- Taps within 300ms of a tap navigation are dropped, and the page ignores pointer events for 250ms after a change. Tests that click straight after a navigation may need a short wait (Playwright retries anyway).
- After showing one-shot location state (for example `posted`), clear it with navigate(pathname, { replace: true, state: null }) so revisiting the page does not replay it.

4) Session (auth fixer owns SessionProvider/session.ts from now on)
- useSession() now also returns unreachable and signedOut. A 401 from any api() call outside /auth/* signs the user out automatically, so screens should NOT handle 401 themselves.
- returnPath(), rememberReturnPath() and clearReturnPath() are in auth/session.ts. SignIn and Welcome already navigate to returnPath() ?? '/'.
- signOut() now unsubscribes push on this device first.

5) API (lib/api.ts): requests time out (15s, 60s for apiForm) and throw ApiError(status 0, \"Can't reach Zarqa…\"). Keep catching ApiError and showing err.message as before. New strings: common.offline, common.retry, common.loading, common.loadError, common.backHome.

6) CSS utilities (index.css)
- .user-text and .wrap.
- .on-paper: put it on paper surfaces that are NOT inside a Ticket. It gives light native controls and an ink focus ring (fixes F114/F151-style issues). Ticket already does this.
- data-layout=\"wide\" on a page's root <main> lets RSA and Admin grow to 1100px at 900px+ (F112/F140); you lay out the grid yourselves.
- #root pads env(safe-area-inset-bottom). Screens must NOT add the inset again. Exception: fixed or positioned sheets outside the flow (consent.module.css .sheet, the Returned overlay) still need calc(… + env(safe-area-inset-bottom)) on their own padding. Chat and Match opt out with :global(#root):has(> .page) and keep their own inset.
- html and body have overflow-x: clip. Still fix the real overflow (Home mascot, F189).

7) Error boundary: pages crash into a Reload / Back home page, but still default your arrays (photoIds ?? [], reasons ?? [], messages ?? []) so a missing field doesn't crash the page at all.

8) Push (lib/push.ts): enablePush() throws when registration fails after permission was granted, so show InlineError and allow retrying. refreshPush() now re-subscribes. Use pushState() to drive the Profile row (F86/F199).

9) Server
- NoticeEmail.Build(label, headline, body, item?: string, footer = NoticeEmail.OwnReportFooter). Pass the user's title as `item`, never inside a sentence. Use footer: NoticeEmail.AlertsFooter only for emails that Match alerts can turn off.
- Retention.cs still builds the expiry email with the title inside its headline and one shared text for both kinds: the admin fixer should split it by kind (F160).

10) The card regex changed on BOTH sides (lib/rules.ts and Categories.cs). Keep them in sync.

11) New i18n keys are next to common.error: common.*, session.*, crash.*, route.*. Add yours next to your own screen's keys.

## Already fixed by the foundation

Do not redo these. Where a finding also lists your area, adopt the shared piece in your screens.

- F15: P0. The card/ID regex, both server (Categories.IsSensitive) and web (lib/rules.ts SENSITIVE_RE), now also matches atm, visa, mastercard, debit, credit, mulkiya, iqama and i.d, plus the Arabic stems بطاق, هوي[ةت], جواز, رخص[ةت], ملكي[ةت], بنك, مصرف and صراف. Ar…
- F176: SessionProvider now tracks `unreachable`. When /me fails with anything other than a 401, the app shows a "Can't reach Zarqa" page with Try again and keeps the URL. It retries automatically when the network comes back, when the app becomes visible, and every 10…
- F177: api.ts calls a registered unauthorized handler on any 401 outside /auth/*. SessionProvider responds by setting me to null and signedOut to true. RequireSession then redirects to /signin, and GuestOnly shows the notice "You were signed out. Sign in again to car…
- F182: api() aborts after 15s and apiForm() after 60s, then throws ApiError(common.offline, 0). After 5s the splash shows "Still trying to reach Zarqa…" with a Try again button.
- F184: RequireSession saves the requested path in sessionStorage. SignIn, Welcome and GuestOnly then go to returnPath() ?? '/', and the saved path is cleared once the user reaches it.
- F180: ErrorBoundary (keyed by pathname) wraps the routes. A crash shows the Something broke page with Reload and Back home buttons instead of a blank app. StatusPill uses a neutral style for unknown pills. Screens still need to default their own arrays (see notes).
- F142: RouteSettled sets a per-route document.title such as "My reports · Zarqa". After the page has rendered it moves focus to the page's h1 (tabindex -1, no visible ring), but only if the page did not already focus something. It also announces the page name through…
- F198: BackHeader now uses useBack (lib/back.ts). It calls navigate(-1) when the previous in-app history entry is its `to` (or any in-app page when `previous` is set). Otherwise it replaces the current page with `to`. useNavigate now accepts a number.
- F205: A second tap navigation within 300ms is ignored (claimTapNavigation in Link and Back). Taps are blocked for 250ms after a route change (data-settling, pointer-events none). A Link to the page you are already on replaces instead of pushing.
- F207: The page slide is shorter: old page 140ms, new page 220ms, reduced-motion fade 160ms. The report-ticket 380ms animation is unchanged.
- F206: #root now pads its bottom by env(safe-area-inset-bottom). Chat and Match already handle the inset themselves, so each module got a one-rule opt-out: :global(#root):has(> .page) { padding-bottom: 0 }. ConfirmSheet includes the inset.
- F211: index.css adds touch-action: manipulation on :root and an opacity 0.6 press state for inline links (:where(a):active).
- F203: Anton is now declared in index.css with font-display: block, using the fontsource woff2 file. A build-only vite plugin preloads the hashed Anton and Figtree 600/700 woff2 files. The fallback stack is now Impact, 'Arial Narrow', sans-serif-condensed, sans-serif…
- F147: BigButton labels wrap to two lines instead of being cut off with an ellipsis. Font size is clamp(20px, 7vw, 27px), the button uses min-height 66px, and long words wrap (overflow-wrap: anywhere).
- F155: The switch's on track is now var(--tan-dark).
- F197: signOut first calls disablePushOnThisDevice(): it posts to /push/unsubscribe and then runs subscription.unsubscribe(). Server-side deletion at logout was not added (see needsOwner).
- F159: Notifier pushes, email subjects and email headlines no longer build the user's title into a sentence. The title is quoted after a colon, and in emails it sits on its own line. The RSA confirm strings are the rsa fixer's.
- F160: NoticeEmail.Build now takes a `footer` parameter. Only the match-spotted email says "Turn these emails off in Profile → Match alerts"; the others, including the expiry email, say "You get this email because it's about your own report." The maker line is now th…
- F156: Removed orientation: 'portrait' from the manifest.
- F201: lib/pwa.ts registers the service worker in prompt mode (registerType 'prompt', injectRegister false) and checks for updates on visibilitychange and hourly. A waiting version is applied when the app goes to the background or on the next route change. Program.cs…
- F209: icons/** and logo.png are now in workbox globIgnores, and includeManifestIcons is false. The precache dropped from about 1.6MB to 1.1MB.
- F208: index.html now draws the background and the wordmark inside #root before the script loads. The splash logo pulses (opacity only) and shows a retry hint after 5s.
- F101: In push-sw.js, a tap on a notification while the app is open posts a {type:'navigate'} message; RouteSettled receives it and routes in place. Uncontrolled windows fall back to an awaited navigate, then to openWindow. The badge (an opaque full-colour icon) is r…
- F189: Added overflow-x: clip on html and body as a safety net. Home's own mascot overflow is still the home fixer's job.
- F149: RoundButton's accessible name now includes the badge, e.g. "Chats, 2 unread" (common.unread). The bare number on Chats rows is the chat fixer's.
- F23: Shared part only: refreshPush() now re-subscribes when permission is granted but there is no subscription, and enablePush() still throws on failure so screens can show it.
- F86: Shared part only: the push.ts behaviour above. Driving the Profile row from pushState() is left to profile-info.
- F199: Shared part only: refreshPush retries the subscription. The nudge position and the Later snooze are home's and profile's.
- F42: Shared part only: added ConfirmSheet to replace window.confirm, and BigButton variant="surface" as a visible bar on dark pages. Reports adopts them.
- F192: Shared part only: added BigButton variant="surface". ReportDetail switches to it.
- F92: Shared part only: BackHeader has a `previous` prop that goes back to any in-app previous page, falling back to `to`. Info adopts it.
- F76: Shared part only: .ticket now sets color-scheme: light, so native pickers and checkboxes on paper are drawn light. An .on-paper utility class covers paper elements outside a Ticket.
- F114: Shared part only: the same color-scheme: light on Ticket and the .on-paper utility. RSA adds class="on-paper" if its form is not inside a Ticket.
- F79: Shared part only: the viewport meta now includes interactive-widget=resizes-content. Hiding composer rows is the chat fixer's.
- F112: Shared part only: putting data-layout="wide" on a page's root <main> lets #root grow to 1100px from 900px wide. RSA lays out its own grid.
- F140: Shared part only: the same data-layout="wide" opt-in. Admin lays out its own grid.
- F52: Shared part only: the finder's push and email now say the owner "thinks this could be theirs" and to ask something only the owner would know. The note under the button and the chat header are match's and chat's.
- F53: Shared part only: the match email and push now say "might be yours" for every level instead of "looks a lot like yours".
- F168: Shared part (P3): the api.ts error strings are now in en.json (common.offline, common.error), and common.backHome was added for Placeholder.
- F167: Shared part (P3): the email maker line is now consistent. The en.json pass belongs to each area.
- F144: Added LoadingState and LoadError (with Retry) in components/states.tsx.
- F178: Added LoadError for failed loads, so screens show it instead of an empty state.
- F181: Added InlineError (role=alert, readable on dark and on paper).
- F148: Added UserText (dir=auto) and the global .user-text class (unicode-bidi: plaintext; overflow-wrap: anywhere).
- F186: Added the global .wrap utility (overflow-wrap: anywhere; min-width: 0). UserText also wraps.

## Skipped by the foundation

- F204: Thumbnails need a second stored copy of every photo, including the covered copy of card photos, plus a size parameter on the photo endpoint in ReportEndpoints, which reports owns. That touches the card-privacy pipeline days before launch. Recommend doing it af…
- F9: No shared cause: the placeholder and code-box colours are set in SignIn.module.css, which auth owns.
- F151: P3, and the change is in the RSA screen's file. The rsa fixer can add class="on-paper" to the team rows, or the one-line outline rule.
- F43: No shared part: the push link is already correct, and the Returned celebration is ReportDetail's.
- F55: BigButton already supported busy, and it now also sets aria-busy. The rest of the fix is in Match.tsx and Match.module.css.
- F109: Shared building blocks are ready (ConfirmSheet, Notice with an action). The change itself is RSA's screen and RsaEndpoints.
- F115: The address lookup and the input attributes are in the RSA screen and server files, not mine.
- F173: ThreadDto and the Chat screen belong to the chat fixer. The notification links are unchanged.

## Left for the owner to decide

- F169: Email fallback for chat events would be new notification types. Recommend: send a NoticeEmail (already supports item and footer) for return requests, handover confirmed and "not the same item" / RSA "not theirs". For chat messages, email only when the recipient has no push subscription, at most once until they read the chat.
- F51: The server does not keep the promise "Zarqa will tell you if it frees up". Recommend that the match fixer change the copy to "Check back later" now. After launch, add a push when a found report returns to Open, sent to owners who still have a Suggested match on it.
- F158: The finder gets no push when the owner claims an RSA drop-off before it is handed in. Recommend a new push to the finder ("The owner is waiting: bring it to the RSA desk with code X") from the RSA branch of /matches/{id}/confirm. The ReportDetail copy fix belongs to reports.
- F197: The client unsubscribe on sign-out is done. As a backstop, the logout endpoint (AuthEndpoints, auth-owned) could delete the caller's push subscription for the endpoint sent with the logout request. It needs a small API change, so the owner should decide.
