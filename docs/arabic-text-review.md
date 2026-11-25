# Zarqa: every piece of text, in English and Arabic

This is a draft for review. Nothing in the app has changed yet. It holds all **767** strings on the app's screens (`web/src/i18n/en.json`), plus **195** more that come from other places: the server's emails, phone alerts, Zarqa's lines in chats, error messages, status labels and campus place names.

To make changes, edit the Arabic column here, or tell me the key (or the English line) and what it should say.

## The style I used

Formal Classical Arabic (فصحى), chosen to fit a mascot named after Zarqa al-Yamama:

- **Zarqa speaks as a woman, in the first person** (أنا زرقاء، لمحتُ، سأواصل). When the user speaks to her, they use the feminine: «ابحثي عن متاعي», «ليس لي، واصلي البحث».
- **Classical words where people will still understand them**: لُقَطة for a found item (the traditional legal term), ضالّة, متاع, لله درُّك for "You're a legend", جزاك الله خيرًا, and «أبصرَت الجيوشَ على مسيرة ثلاثة أيام، فما مفاتيحُك عليها بعسير» for the sign-in legend.
- **Everyday words where a classical one would confuse people**: هاتف, بريد, تطبيق, إشعارات, الواي فاي.
- **Two-line headlines** ("Is this / yours?") are split where Arabic word order allows: «أهذا / لك؟». A few (chats, reports) are reworded: «مجالسُ / حديثك», «سجلُّ / بلاغاتك».
- Arabic has no capital letters, so the English ALL-CAPS labels are plain text here. Their size and weight will carry the emphasis.
- Quotation marks are «», and the commas and question marks are the Arabic ones (، ؟).

## Decisions for you to confirm

1. **"Found item" = لُقَطة.** It's the classical term, but some students may not know it. The alternative is «معثور عليه» (clearer, but longer). "Lost item" = مفقود.
2. **Addressing the user.** Arabic has no neutral "you", so I used the masculine form, which is the convention in Arabic apps (أضعتَ، وجدتَ، تحقّق). Other options: gender-neutral rewording where possible, or a choice in Profile.
3. **Names kept in Latin letters**: GUtech, RSA, codes like K7P-4QM, email addresses, and brands (AirPods, Safari, OpenAI…). "Zarqa" becomes زرقاء. Would you like the RSA desk named differently in Arabic, for example مكتب شؤون الطلبة?
4. **Counts.** Arabic nouns change form after a number (1, 2, 3 to 10, 11 and up), but the app has only "one" and "many" versions. I wrote counts as «البلاغات: {n}», which reads correctly for every number. The full plural forms can come later.
5. **Digits.** Western digits (0 to 9) or Arabic-Indic digits (٠ to ٩)? This draft uses Western.
6. **Terms and Privacy.** Arabic is Oman's official language, so the Arabic Terms and Privacy notice could carry legal weight. Someone fluent in legal Arabic should check them, and the notice should say which version wins if the two disagree.
7. **`profile.language.sub`** currently says "English only for now. Arabic is coming." Once Arabic ships, I'd change it to «العربية أو الإنجليزية».

## Not covered here (part of building the Arabic option)

- **What people type**: report descriptions and chat messages stay in whatever language they were written in.
- **The AI's "Why I think so" reasons** are written in English by the matching model. Showing them in Arabic means either asking the model to answer in the reader's language or translating its answer. Both change the matching prompts, which the project rules say to benchmark first.
- **Dates and times** will come from the phone's Arabic formatting. The server's handover time ("Mon 3:00 PM") needs the same treatment.
- **Arabic place names for matching**: so that «المكتبة» or «المصلى» in an Arabic report matches the right campus place, the place list needs Arabic aliases as well as the display names in Part 2.
- **Right-to-left layout**: mirroring the screens, the tilted stickers and the slide direction of page transitions.


# Part 1: App screens (`web/src/i18n/en.json`)

## General (errors, loading, page titles)

| Key | English | العربية |
|---|---|---|
| `app.tagline` | Lost it. Found it. Zarqa. | ضاعَ. وُجِدَ. زرقاء. |
| `common.back` | Back | رجوع |
| `common.comingSoon` | Coming soon | قريبًا |
| `placeholder.zarqa` | I'm still drawing this screen. Check back soon. | ما زلتُ أرسم هذه الصفحة، فعُد إليها عمّا قريب. |
| `notFound.title` | Lost page | صفحة ضالّة |
| `notFound.zarqa` | Even I can't see this one. Let's head home. | حتى أنا لا أبصر هذه. هلمّ بنا إلى الرئيسية. |
| `common.error` | Something went wrong. Try again. | حدث خطأ. حاول مرة أخرى. |
| `common.offline` | Can't reach Zarqa. Check your connection. | تعذّر الوصول إلى زرقاء. تحقّق من اتصالك. |
| `common.retry` | Try again | حاول مجددًا |
| `common.loading` | Loading… | جارٍ التحميل… |
| `common.loadError` | Couldn't load this. Check your connection and try again. | تعذّر تحميل هذا. تحقّق من اتصالك ثم حاول مجددًا. |
| `common.backHome` | Back home | إلى الرئيسية |
| `common.unread` | {label}, {n} unread | {label}، غير المقروءة: {n} |
| `common.pageTitle` | {page} · Zarqa | {page} · زرقاء |
| `session.slow` | Still trying to reach Zarqa… | ما زلنا نحاول الوصول إلى زرقاء… |
| `session.unreachable.title` | Can't reach Zarqa | تعذّر الوصول إلى زرقاء |
| `session.unreachable.zarqa` | I can't reach the server right now. Check your Wi-Fi or data. I'll keep trying. | لا أستطيع الوصول إلى الخادم الآن. تحقّق من شبكة الواي فاي أو بيانات الهاتف، وسأظلّ أحاول. |
| `session.signedOut` | You were signed out. Sign in again to carry on. | خرجتَ من حسابك. سجّل الدخول مجددًا لتُكمل. |
| `crash.title` | Something broke | انكسر شيء ما |
| `crash.zarqa` | Something broke on this page. Reloading usually fixes it. | انكسر شيء في هذه الصفحة، وإعادة تحميلها تُصلحه في الغالب. |
| `crash.reload` | Reload | أعِد التحميل |
| `route.signin` | Sign in | تسجيل الدخول |
| `route.welcome` | Welcome | مرحبًا |
| `route.home` | Home | الرئيسية |
| `route.reports` | My reports | بلاغاتي |
| `route.report` | Report | بلاغ |
| `route.match` | Possible match | مطابقة محتملة |
| `route.chats` | Chats | المحادثات |
| `route.chat` | Chat | محادثة |
| `route.admin` | Admin | الإدارة |


## Sign-in, welcome and the terms update

| Key | English | العربية |
|---|---|---|
| `signin.h1` | Lost it. | ضاعَ. |
| `signin.h2` | Found it. | وُجِدَ. |
| `signin.h3` | Zarqa. | زرقاء. |
| `signin.legend` | SHE SAW ARMIES 3 DAYS AWAY. YOUR KEYS ARE EASY. | أبصرَت الجيوشَ على مسيرة ثلاثة أيام، فما مفاتيحُك عليها بعسير. |
| `signin.intro` | Post what you lost or found. Zarqa matches the two. | انشر ما أضعتَ أو ما وجدتَ، وزرقاء تجمع بين الاثنين. |
| `signin.emailLabel` | UNIVERSITY EMAIL | البريد الجامعي |
| `signin.send` | Send me a code | أرسِلوا إليّ رمزًا |
| `signin.sending` | Sending… | جارٍ الإرسال… |
| `signin.help` | We'll email you a 6-digit code. GUtech emails only. | سنرسل إليك رمزًا من ست خانات. لبريد GUtech فقط. |
| `signin.needEmail` | Type your GUtech email first. | اكتب بريدك في GUtech أولًا. |
| `signin.needConsent` | Tick the box to agree to the Terms and Privacy first. | ضع علامة في المربع لتوافق على الشروط وسياسة الخصوصية أولًا. |
| `signin.haveCode` | I already have a code | عندي رمز من قبل |
| `signin.terms` | Terms | الشروط |
| `signin.privacy` | Privacy | الخصوصية |
| `signin.consent.a` | I accept the  | أقبل  |
| `signin.consent.and` |  and  |  و |
| `signin.consent.b` |  | _(empty)_ |
| `signin.helpLink` | Help | مساعدة |
| `signin.code.h1` | Check your | تفقّد |
| `signin.code.h2` | inbox. | بريدك. |
| `signin.code.sentTo` | We sent a 6-digit code to | أرسلنا رمزًا من ست خانات إلى |
| `signin.code.label` | YOUR CODE | رمزك |
| `signin.code.go` | Let me in | أدخِلني |
| `signin.code.checking` | Checking… | جارٍ التحقق… |
| `signin.code.otherEmail` | Use another email | استعمل بريدًا آخر |
| `signin.code.resend` | Resend code | أعِد إرسال الرمز |
| `signin.code.resendIn` | Resend in {s}s | إعادة الإرسال بعد {s} ث |
| `signin.code.resent` | New code on its way to {email}. Any code from the last 10 minutes works. | رمز جديد في طريقه إلى {email}. وأيُّ رمز من الدقائق العشر الأخيرة يصلح. |
| `signin.code.zarqa` | No code? Peek in your junk folder. It expires in 10 minutes. | لم يصلك الرمز؟ ألقِ نظرة في مجلد الرسائل غير المرغوبة. وصلاحيته عشر دقائق. |
| `welcome.h1` | What do we | بِمَ |
| `welcome.h2` | call you? | نُناديك؟ |
| `welcome.waveAlt` | Zarqa waving hello | زرقاء تلوّح بالتحية |
| `welcome.zarqa` | I am Zarqa. I find things. You tell me your name, I tell the finder. | أنا زرقاء، أجدُ الأشياء. أخبرني باسمك، وأنا أخبر من وجد متاعك. |
| `welcome.label` | FIRST NAME | الاسم الأول |
| `welcome.go` | Let’s go | هيّا بنا |
| `welcome.saving` | Saving… | جارٍ الحفظ… |
| `welcome.needName` | Type the first name other students should see. | اكتب الاسم الأول الذي يراه سائر الطلبة. |
| `welcome.help` | Only your first name shows in chats. You can hide it in your profile. | لا يظهر في المحادثات إلا اسمك الأول، ولك أن تخفيه من ملفك الشخصي. |
| `signin.test.title` | TEST MODE | وضع التجربة |
| `signin.test.body` | Email isn't set up yet, so here's your code. Anyone can sign in this way until it's switched off. | لم يُهيَّأ البريد بعد، فهذا رمزك. يستطيع أيُّ أحد الدخول بهذه الطريقة حتى يُطفأ هذا الوضع. |
| `signin.test.use` | Use code {code} | استعمل الرمز {code} |
| `consent.update.title` | Quick one | أمرٌ يسير |
| `consent.update.body` | Zarqa has new Terms and a new Privacy notice. Tick the box to carry on. | لدى زرقاء شروط جديدة وإشعار خصوصية جديد. ضع علامة في المربع لتُكمل. |
| `consent.update.go` | Continue | تابع |
| `consent.update.saving` | Saving… | جارٍ الحفظ… |
| `consent.update.needTick` | Tick the box to agree to the Terms and Privacy first. | ضع علامة في المربع لتوافق على الشروط وسياسة الخصوصية أولًا. |
| `consent.update.stale` | Zarqa needs a quick refresh to show the latest Terms. | تحتاج زرقاء إلى تحديث سريع لتعرض أحدث الشروط. |
| `consent.update.reload` | Reload Zarqa | أعِد تحميل زرقاء |
| `consent.update.signingOut` | Signing out… | جارٍ الخروج… |
| `consent.update.signOut` | Sign out | تسجيل الخروج |


## Home

| Key | English | العربية |
|---|---|---|
| `home.headA.lost` | What went | ما الذي |
| `home.headB.lost` | missing? | ضاع منك؟ |
| `home.headA.found` | Who lost | مَن أضاع |
| `home.headB.found` | this? | هذا؟ |
| `home.myReports` | My reports | بلاغاتي |
| `home.reportsMeta` | {active} ACTIVE | النشطة: {active} |
| `home.reportsWaiting` | {n} MATCH WAITING | مطابقة تنتظرك: {n} |
| `home.reportsWaitingMany` | {n} MATCHES WAITING | مطابقات تنتظرك: {n} |
| `home.chats` | Chats | المحادثات |
| `home.profile` | Open your profile | افتح ملفك الشخصي |
| `home.mode.lost.big` | LOST | أضعتُ |
| `home.mode.lost.small` | I lost something | أضعتُ شيئًا |
| `home.mode.found.big` | FOUND | وجدتُ |
| `home.mode.found.small` | I found something | وجدتُ شيئًا |


## Report form

| Key | English | العربية |
|---|---|---|
| `form.tag.lost` | LOST ITEM REPORT | بلاغ عن مفقود |
| `form.tag.found` | FOUND ITEM REPORT | بلاغ عن لُقَطة |
| `form.photos.lost` | Got a photo of it? (optional) | أعندك صورة له؟ (اختياري) |
| `form.photos.found` | Snap a photo of it | التقط له صورة |
| `form.photoCta.lost` | ADD | أضِف |
| `form.photoCta.found` | SNAP | التقِط |
| `form.addPhoto` | Add a photo | أضِف صورة |
| `form.name.lost` | What did you lose? | ما الذي أضعتَه؟ |
| `form.name.found` | What did you find? | ما الذي وجدتَه؟ |
| `form.where.lost` | Where did you last have it? | أين كان معك آخرَ مرة؟ |
| `form.where.found` | Where did you find it? | أين وجدتَه؟ |
| `form.where.placeholder` | Library, cafeteria… | المكتبة، المقصف… |
| `form.when.lost` | When did you lose it? | متى أضعتَه؟ |
| `form.when.found` | When did you find it? | متى وجدتَه؟ |
| `form.date` | DATE | التاريخ |
| `form.time` | TIME | الوقت |
| `form.today` | TODAY | اليوم |
| `form.submit.lost` | Find my stuff | ابحثي عن متاعي |
| `form.submit.found` | Post found item | انشر اللُّقَطة |
| `form.time.none` | NOT SURE | لستُ متأكدًا |
| `form.time.pick` | Pick a time (optional) | اختر وقتًا (اختياري) |
| `form.time.clear` | Clear the time | امسح الوقت |
| `form.when.toggle` | I know when | أعرف متى |
| `form.when.on` | I KNOW | أعرف |
| `form.when.off` | NOT SURE | لستُ متأكدًا |
| `form.removePhoto` | Remove photo {n} | احذف الصورة {n} |
| `form.photoLoading` | Loading photo… | جارٍ تحميل الصورة… |
| `form.photosBusy` | Hang on, your photos are still loading. | تمهّل، صورك ما زالت تُحمَّل. |
| `form.consentFirst` | Agree to the Terms and Privacy notice first, then post. Your form stays as it is. | وافق على الشروط وسياسة الخصوصية أولًا ثم انشر. نموذجك باقٍ على حاله. |
| `form.photosDropped` | Only 4 photos fit. I kept the first ones. | لا يتّسع إلا لأربع صور، فأبقيتُ الأوائل منها. |
| `form.text.count` | {n}/{max} | {n}/{max} |
| `form.draft.restored` | Picked up where you left off. | أكملنا من حيث توقفت. |
| `form.draft.clear` | Start over | ابدأ من جديد |
| `form.posting` | Posting… | جارٍ النشر… |
| `form.text.placeholder.lost` | e.g. Black AirPods Pro case with a cat sticker on the back | مثلًا: علبة سماعات AirPods Pro سوداء عليها ملصق قطة من الخلف |
| `form.text.placeholder.found` | e.g. Black umbrella with a wooden handle | مثلًا: مظلّة سوداء بمقبض خشبي |
| `form.text.hint` | Say what it is, plus colour, brand, stickers or marks. The more detail, the better I match. | قل ما هو، واذكر اللون والعلامة التجارية والملصقات أو العلامات. وكلما زدتَ تفصيلًا أحسنتُ المطابقة. |
| `form.cardNotice.title.lost` | LOST A CARD OR ID? | أضعتَ بطاقة أو هوية؟ |
| `form.cardNotice.body.lost` | Add the issuer and colour, plus your first name if it's printed on the card. Leave out ID and card numbers. | اذكر الجهة المُصدِرة واللون، واسمك الأول إن كان مطبوعًا على البطاقة. ولا تكتب أرقام الهوية أو البطاقة. |

**`form.cardNotice.photo.lost`**

> Photos: I cover the numbers and barcodes before anyone else or the matching AI sees them; your name and face stay visible. If I can't cover every number, the photo stays private to you.

<div dir="rtl">

الصور: أغطّي الأرقام والرموز الشريطية قبل أن يراها أحد غيرك أو ذكاء المطابقة، ويبقى اسمك ووجهك ظاهرين. فإن لم أستطع تغطية كل رقم، بقيت الصورة خاصة بك.

</div>

| Key | English | العربية |
|---|---|---|
| `form.cardNotice.title.found` | FOUND SOMEONE’S CARD? | وجدتَ بطاقة أحدهم؟ |
| `form.cardNotice.body.found` | Add the first name on the card, plus the issuer and colour. Skip the surname, ID and card numbers. | اذكر الاسم الأول المكتوب على البطاقة، والجهة المُصدِرة واللون. ودَع اسم العائلة وأرقام الهوية والبطاقة. |

**`form.cardNotice.photo.found`**

> Photos: I cover the numbers and barcodes, then show that copy to a possible owner and the matching AI so they can tell if it's theirs. The name and face stay visible. If I can't cover every number, the photo stays private to you.

<div dir="rtl">

الصور: أغطّي الأرقام والرموز الشريطية، ثم أعرض تلك النسخة على المالك المحتمل وذكاء المطابقة ليعرف إن كانت له. ويبقى الاسم والوجه ظاهرين. فإن لم أستطع تغطية كل رقم، بقيت الصورة خاصة بك.

</div>

| Key | English | العربية |
|---|---|---|
| `form.text.missing` | Tell me what it is first. | أخبرني ما هو أولًا. |
| `form.photoError` | I couldn't read that photo. Try another one. | لم أستطع قراءة تلك الصورة. جرّب غيرها. |
| `form.photoN` | Photo {n} | الصورة {n} |
| `form.where.list` | Campus places | أماكن الحرم |
| `form.limit` | {n} posts left · 10 per 24 hours | المتبقي من المنشورات: {n} · عشرة في كل 24 ساعة |
| `form.limit.none` | That's 10 posts in 24 hours. Try again a bit later. | بلغتَ عشرة منشورات في 24 ساعة. حاول بعد حين. |
| `form.rsa` | I'll drop it at the RSA desk | سأسلّمه إلى مكتب RSA |
| `form.rsa.note` | No chat, no meetup: you hand it in, the owner collects it from the RSA. You'll get a drop code. | بلا محادثة ولا لقاء: تسلّمه أنت، ويستلمه صاحبه من مكتب RSA. وسيصلك رمز تسليم. |


## My reports

| Key | English | العربية |
|---|---|---|
| `reports.title` | Your reports | بلاغاتك |
| `reports.count` | {n} REPORTS | البلاغات: {n} |
| `reports.countOne` | 1 REPORT | بلاغ واحد |
| `reports.h1` | Your | سجلُّ |
| `reports.h2` | reports | بلاغاتك |
| `reports.filter` | Show | اعرض |
| `reports.filter.all` | ALL | الكل |
| `reports.filter.lost` | LOST | المفقودات |
| `reports.filter.found` | FOUND | اللُّقَطات |
| `reports.spotted` | Zarqa spotted a match | لمحَت زرقاء مطابقة |
| `reports.posted.lost` | Posted! I'm on the lookout. You'll hear from me the second something turns up. | نُشر! أنا على المرصد، وستسمع مني في اللحظة التي يظهر فيها شيء. |
| `reports.posted.found` | Posted! You're a legend. I'll find whoever's missing it. | نُشر! لله درُّك. سأجد من فقده. |
| `reports.empty` | Nothing posted yet. Lost or found something? Tell me on the home screen. | لم تنشر شيئًا بعد. أضعتَ شيئًا أو وجدتَه؟ أخبرني في الصفحة الرئيسية. |
| `reports.postOne` | Post something | انشر شيئًا |
| `reports.allDone` | All wrapped up. Nice. | قُضي الأمر كلُّه. أحسنت. |
| `reports.kind.lost` | LOST | مفقود |
| `reports.kind.found` | FOUND | لُقَطة |
| `reports.filterEmpty.lost` | No lost reports here. | لا بلاغات عن مفقودات هنا. |
| `reports.filterEmpty.found` | No found reports here. | لا بلاغات عن لُقَطات هنا. |
| `reports.anotherMatch` | Zarqa spotted another one: have a look | لمحَت زرقاء واحدة أخرى: ألقِ نظرة |
| `reports.readySticker` | Go get it | اذهب فخذه |
| `reports.closedNotice` | Closed. I've stopped looking for it. | أُغلق. كففتُ عن البحث عنه. |
| `reports.deletedNotice` | Deleted. It's gone for good. | حُذف. ذهب إلى غير رجعة. |
| `reports.posted.rsa` | Posted! You're a legend. Here's your drop code. | نُشر! لله درُّك. هذا رمز التسليم. |


## Report page

| Key | English | العربية |
|---|---|---|
| `detail.where` | WHERE | أين |
| `detail.whereUnknown` | Not sure | لستُ متأكدًا |
| `detail.when` | WHEN | متى |
| `detail.whenUnknown` | Not sure | لستُ متأكدًا |

**`detail.private`**

> Only you see this original. If I can cover every number on it, a possible owner, the RSA desk and the matching AI see a copy with the numbers and barcodes covered.

<div dir="rtl">

لا يرى هذا الأصلَ أحدٌ سواك. فإن استطعتُ تغطية كل رقم فيه، رأى المالكُ المحتمل ومكتبُ RSA وذكاءُ المطابقة نسخةً غُطّيت فيها الأرقام والرموز الشريطية.

</div>

| Key | English | العربية |
|---|---|---|
| `detail.private.Pending` | Only you see these originals. I'm covering the numbers and barcodes now; until that's done, nobody else sees the photos. | لا يرى هذه الأصولَ أحدٌ سواك. أنا أغطّي الأرقام والرموز الشريطية الآن، وإلى أن أفرغ لا يرى الصورَ أحدٌ غيرك. |
| `detail.private.Ready` | Only you see these originals. Numbers and barcodes are covered on the copy a possible owner, the RSA desk and the matching AI see. | لا يرى هذه الأصولَ أحدٌ سواك. وقد غُطّيت الأرقام والرموز الشريطية في النسخة التي يراها المالك المحتمل ومكتب RSA وذكاء المطابقة. |
| `detail.private.Private` | I couldn't cover every number, so the photo stays private to you. Describe the card in words so its owner can recognise it. | لم أستطع تغطية كل رقم، فبقيت الصورة خاصة بك. صِف البطاقة بالكلمات ليعرفها صاحبها. |
| `detail.searching.lost` | Still hunting. I check every new found report against this one. | ما زلتُ أتحرّى. أقابل كل بلاغ لُقَطة جديد بهذا البلاغ. |
| `detail.searching.found` | Waiting for the owner to post. I'll connect you the moment they do. | في انتظار أن ينشر صاحبه. سأصل بينكما لحظة ينشر. |
| `detail.closeLost` | I found it myself | وجدتُه بنفسي |
| `detail.closeFound` | Close this report | أغلق هذا البلاغ |
| `detail.delete` | Delete report | احذف البلاغ |
| `detail.openChat` | Open the chat | افتح المحادثة |
| `detail.posted` | POSTED {day} | نُشر {day} |
| `detail.loading` | Your report | بلاغك |
| `detail.gone.h1` | Report not found | البلاغ غير موجود |
| `detail.gone` | This report isn't here any more. Your reports show what I'm still looking for. | لم يعد هذا البلاغ هنا. بلاغاتك تُريك ما لا أزال أبحث عنه. |
| `detail.gone.back` | My reports | بلاغاتي |
| `detail.photo` | Photo {n} of {total} | الصورة {n} من {total} |
| `detail.photo.open` | Open photo {n} of {total} | افتح الصورة {n} من {total} |
| `detail.photo.close` | Close photo | أغلق الصورة |
| `detail.close.title` | Close it? | أتغلقه؟ |
| `detail.close.body` | I'll stop looking for it. You can't reopen it, but you can always post it again. | سأكفّ عن البحث عنه. لا يمكنك إعادة فتحه، ولكن لك أن تنشره من جديد متى شئت. |
| `detail.close.go` | Close it | أغلقه |
| `detail.close.keep` | Keep looking | واصل البحث |
| `detail.delete.title` | Delete it? | أتحذفه؟ |
| `detail.delete.body` | The report and its photos go for good. This can't be undone. | يذهب البلاغ وصوره إلى غير رجعة، ولا يمكن التراجع عن هذا. |
| `detail.delete.go` | Delete it | احذفه |
| `detail.delete.keep` | Keep it | أبقِه |
| `detail.deleting` | Deleting… | جارٍ الحذف… |
| `detail.seeMatch` | See the match | اطّلع على المطابقة |
| `detail.matchWaiting` | I spotted something that could be yours. Have a look and tell me. | لمحتُ شيئًا قد يكون لك. ألقِ نظرة وأخبرني. |
| `detail.earlierChat` | Earlier chat | محادثة سابقة |
| `detail.returned.lost` | Got it back. Told you I'd find it. | عاد إليك. ألم أقل لك إني سأجده؟ |
| `detail.returned.found` | It's back with its owner. You're a legend. | عاد إلى صاحبه. لله درُّك. |
| `detail.ended.Expired` | I stopped looking after 60 days without a match. | كففتُ عن البحث بعد ستين يومًا بلا مطابقة. |
| `detail.ended.Closed` | This one is closed. I'm not looking for it any more. | أُغلق هذا البلاغ، ولم أعد أبحث عنه. |
| `detail.repost` | Still looking? Post it again | ما زلت تبحث؟ انشره من جديد |
| `detail.edit` | Edit details | عدّل التفاصيل |
| `detail.edit.h2` | Fix the details | أصلِح التفاصيل |
| `detail.edit.text` | WHAT IT IS | ما هو |
| `detail.edit.where` | WHERE | أين |
| `detail.edit.date` | DAY (OPTIONAL) | اليوم (اختياري) |
| `detail.edit.time` | TIME (OPTIONAL) | الوقت (اختياري) |
| `detail.edit.save` | Save changes | احفظ التغييرات |
| `detail.edit.cancel` | Cancel | إلغاء |
| `detail.edit.saved` | Saved. I'm checking it again. | حُفظ. وأنا أعيد النظر فيه. |
| `detail.edit.missing` | Tell me what it is first. | أخبرني ما هو أولًا. |
| `detail.what` | WHAT IT IS | ما هو |
| `detail.rsa.label` | DROP CODE | رمز التسليم |
| `detail.rsa.bring` | Take it to the RSA desk and show this code. They'll mark it received. | احمله إلى مكتب RSA وأظهِر هذا الرمز، فيسجّلونه مستلَمًا. |
| `detail.rsa.held` | The RSA desk has it. Nothing else to do: the owner collects it there. | هو عند مكتب RSA. لا شيء عليك بعد الآن: يستلمه صاحبه من هناك. |
| `detail.rsa.claimed` | The owner has a pickup code and will collect it from the RSA desk. | لدى صاحبه رمز استلام، وسيستلمه من مكتب RSA. |
| `detail.rsa.waiting` | The owner is waiting for this. Take it to the RSA desk and show this code. | صاحبه ينتظره. احمله إلى مكتب RSA وأظهِر هذا الرمز. |
| `detail.rsa.instead` | Drop it at the RSA desk instead | سلّمه إلى مكتب RSA بدلًا من ذلك |
| `detail.rsa.insteadTitle` | Drop it at the RSA desk? | أتسلّمه إلى مكتب RSA؟ |
| `detail.rsa.insteadBody` | You'll get a drop code to show there, and the owner collects it from the desk. You can't switch back to meeting them. | سيصلك رمز تسليم تُظهره هناك، ويستلمه صاحبه من المكتب. ولا يمكنك العودة إلى لقائه. |
| `detail.rsa.insteadGo` | Yes, the RSA desk | نعم، مكتب RSA |
| `detail.rsa.insteadKeep` | Keep it for now | أبقِه معي الآن |
| `detail.pickup` | See my pickup code | اعرض رمز الاستلام |


## Possible match and pickup

| Key | English | العربية |
|---|---|---|
| `match.title` | Is this yours? | أهذا لك؟ |
| `match.spottedAt` | ZARQA SPOTTED THIS · {when} | لمحَته زرقاء · {when} |
| `match.h1` | Is this | أهذا |
| `match.h2` | yours? | لك؟ |
| `match.youLost` | YOU LOST | أضعتَ |
| `match.someoneFound` | SOMEONE FOUND | وجد أحدُهم |
| `match.small` | SMALL CHANCE | احتمال ضئيل |
| `match.looks` | LOOKS LIKE IT | يبدو أنه هو |
| `match.big` | BIG CHANCE | احتمال كبير |
| `match.theirPhotos` | The finder's photos | صور الواجد |
| `match.covered` | Card photo: I covered its numbers and barcodes. The original stays with the finder. | صورة بطاقة: غطّيتُ أرقامها ورموزها الشريطية، والأصل يبقى عند الواجد. |
| `match.photoN` | Finder's photo {n} of {total} | صورة الواجد {n} من {total} |
| `match.photoFailed` | Photo didn't load | لم تُحمَّل الصورة |
| `match.privatePhoto` | The finder took a card photo, and it stays private. Tap Could be mine and ask them for the name on it. | التقط الواجد صورة بطاقة، وهي تبقى خاصة. اضغط «قد يكون لي» واسأله عن الاسم المكتوب عليها. |
| `match.privatePhoto.rsa` | The finder took a card photo, and it stays private. The RSA desk checks the name against your student ID. | التقط الواجد صورة بطاقة، وهي تبقى خاصة. ويطابق مكتب RSA الاسمَ ببطاقتك الجامعية. |
| `match.viewer.close` | Close photo | أغلق الصورة |
| `match.viewer.prev` | Previous photo | الصورة السابقة |
| `match.viewer.next` | Next photo | الصورة التالية |
| `match.stamp.small` | MAYBE? | لعلّه؟ |
| `match.stamp.looks` | MATCH? | أهو هو؟ |
| `match.stamp.big` | MATCH | هو هو |
| `match.reasons` | Why I think so | لِمَ أظنّ ذلك |
| `match.theirWords` | What they wrote | ما كتبه |
| `match.mine` | Could be mine | قد يكون لي |
| `match.mineBusy` | Opening chat… | جارٍ فتح المحادثة… |
| `match.mineBusy.rsa` | Getting your code… | جارٍ جلب رمزك… |

**`match.mineNote`**

> Opens a chat with the finder. They'll see your report, its photos and your first name (if Profile shows it). Not the same item? Either of you can say so there and I keep looking.

<div dir="rtl">

تُفتح محادثة مع الواجد، فيرى بلاغك وصوره واسمك الأول (إن كان ظاهرًا في ملفك). ليس هو الشيء نفسه؟ لأيٍّ منكما أن يقول ذلك هناك، وأواصل أنا البحث.

</div>

| Key | English | العربية |
|---|---|---|
| `match.notMine` | Not mine, keep looking | ليس لي، واصلي البحث |
| `match.reject.title` | Sure it's not yours? | أمتأكد أنه ليس لك؟ |
| `match.reject.body` | I won't show you this one again. I'll keep looking for yours. | لن أعرض عليك هذا مرة أخرى، وسأواصل البحث عن متاعك. |
| `match.reject.go` | Not mine | ليس لي |
| `match.reject.keep` | Look again | انظر مرة أخرى |
| `match.taken` | Someone else claimed this one first. If it turns out not to be theirs, it opens up here again, so check back later. | سبقك أحدهم إلى ادّعاء هذا. فإن تبيّن أنه ليس له، عاد متاحًا هنا، فعُد لاحقًا. |
| `match.openChat` | Open the chat | افتح المحادثة |
| `match.chattingH1` | You're chatting | أنتما تتحادثان |
| `match.gone` | This match has moved on. Your reports show what I'm still looking for. | مضت هذه المطابقة. بلاغاتك تُريك ما لا أزال أبحث عنه. |
| `match.goneH1` | Moved on | مضت |
| `match.toReports` | My reports | بلاغاتي |
| `match.closedH1` | Closed | أُغلقت |
| `match.closed` | This one's closed. I'm still looking for yours. | أُغلق هذا، وما زلتُ أبحث عن متاعك. |
| `match.rejectedNow` | Got it, not yours. I'll keep looking. | فهمت، ليس لك. سأواصل البحث. |
| `match.expired` | This suggestion has ended. My reports show what I'm still looking for. | انتهى هذا الاقتراح. بلاغاتي تُريك ما لا أزال أبحث عنه. |

**`match.mineNote.rsa`**

> The finder is taking it to the RSA desk. No chat: you get a pickup code, and I'll ping you when it's there. Not yours after all? You can say so on the next screen.

<div dir="rtl">

الواجد يحمله إلى مكتب RSA. بلا محادثة: يصلك رمز استلام، وأُنبّهك حين يصل. أليس لك في آخر الأمر؟ لك أن تقول ذلك في الصفحة التالية.

</div>

| Key | English | العربية |
|---|---|---|
| `match.mineNote.rsaHeld` | It's at the RSA desk. No chat: you get a pickup code to collect it. Not yours after all? You can say so on the next screen. | هو في مكتب RSA. بلا محادثة: يصلك رمز استلام لتستلمه. أليس لك في آخر الأمر؟ لك أن تقول ذلك في الصفحة التالية. |
| `match.pickup.label` | PICKUP CODE | رمز الاستلام |
| `match.pickup.h1` | Go get it | اذهب فخذه |
| `match.pickup.notYetH1` | Not there yet | لم يصل بعد |
| `match.release.link` | Not mine after all | ليس لي في آخر الأمر |
| `match.release.title` | Not yours after all? | أليس لك في آخر الأمر؟ |
| `match.release.body` | Your pickup code stops working and both reports go back to searching. I'll keep looking for yours. | يتوقف رمز استلامك عن العمل، ويعود البلاغان إلى البحث. وسأواصل البحث عن متاعك. |
| `match.release.go` | Not mine | ليس لي |
| `match.release.keep` | Keep my code | أبقِ رمزي |
| `match.pickup.ready` | It’s waiting at the RSA desk. Show this code and they’ll check it against your description. | هو في انتظارك في مكتب RSA. أظهِر هذا الرمز، فيطابقونه بوصفك. |
| `match.pickup.notYet` | The finder hasn’t dropped it off yet. I’ll ping you the moment the RSA has it. | لم يسلّمه الواجد بعد. سأُنبّهك في اللحظة التي يصل فيها إلى المكتب. |
| `match.pickup.where` | RSA desk · GUtech campus | مكتب RSA · حرم GUtech |
| `match.pickup.bring` | Bring your student ID. | أحضِر بطاقتك الجامعية. |
| `match.pickup.collected` | Collected. Back where it belongs! | استُلم. عاد إلى حيث ينبغي! |


## Chats

| Key | English | العربية |
|---|---|---|
| `chats.title` | Chats | المحادثات |
| `chats.h1` | Your | مجالسُ |
| `chats.h2` | chats | حديثك |
| `chats.unread` | {n} UNREAD | غير المقروءة: {n} |
| `chats.youLost` | YOU LOST | أضعتَ |
| `chats.youFound` | YOU FOUND | وجدتَ |
| `chats.returned` | RETURNED | رُدّ |
| `chats.closed` | CLOSED | مُغلقة |
| `chats.empty` | No chats yet. When someone says an item could be theirs, the chat shows up here. | لا محادثات بعد. حين يقول أحدهم إن شيئًا قد يكون له، تظهر المحادثة هنا. |
| `chats.tip` | Hand things over on campus, somewhere public. Ask a question only the owner would know. | سلّم الأشياء داخل الحرم الجامعي في مكان عام، واسأل سؤالًا لا يعرف جوابه إلا صاحبها. |
| `chats.unreadCount` | {n} unread | غير المقروءة: {n} |
| `chat.title` | Chat | محادثة |
| `chat.with` | Chat with | محادثة مع |
| `chat.foundYours` | MAY HAVE FOUND YOUR ITEM | لعلّه وجد متاعك |
| `chat.lostIt` | THINKS IT'S THEIRS | يظنّه له |
| `chat.status.active` | CHATTING | محادثة جارية |
| `chat.status.returned` | RETURNED | رُدّ |
| `chat.status.closed` | CLOSED | مُغلقة |
| `chat.openMatch` | Open the match | افتح المطابقة |
| `chat.openReport` | Open your report | افتح بلاغك |
| `chat.gone` | This chat is gone. The other person may have left Zarqa. If you still need the item, your report shows what I'm still looking for. | ذهبت هذه المحادثة، ولعلّ الطرف الآخر غادر زرقاء. فإن كنت ما زلت تحتاج الشيء، فبلاغك يُريك ما لا أزال أبحث عنه. |
| `chat.toReports` | My reports | بلاغاتي |
| `chat.safety` | Meet somewhere public on campus. RSA staff can read this chat to keep handovers safe. | التقيا في مكان عام داخل الحرم. ولموظفي مكتب RSA أن يقرؤوا هذه المحادثة حفاظًا على سلامة التسليم. |
| `chat.safety.tips` | Safety tips | نصائح السلامة |
| `chat.safety.help` | Report a problem | أبلِغ عن مشكلة |
| `chat.you` | You | أنت |
| `chat.zarqa` | Zarqa | زرقاء |
| `chat.sentAt` | {who}, {time} | {who}، {time} |
| `chat.newMessages` | New messages | رسائل جديدة |
| `chat.reconnecting` | Reconnecting… new messages will show up when you're back online. | جارٍ إعادة الاتصال… ستظهر الرسائل الجديدة حين تعود إلى الشبكة. |
| `chat.tooLong` | {n} / 2000 | {n} / 2000 |
| `chat.pending.handover` | {name} suggested {when} | اقترح {name} {when} |
| `chat.pending.return` | {name} says it's back. Can you confirm? | يقول {name} إنه رُدّ. أتؤكّد؟ |
| `chat.pending.view` | View | اعرض |
| `chat.handover.past` | Confirmed. | أُكّد. |
| `chat.notIt.title` | Close this chat for both of you? | أتغلق هذه المحادثة عنكما كليكما؟ |
| `chat.notIt.body` | It can't be reopened. {name} will see it's closed, and Zarqa keeps looking for both of you. | لا يمكن إعادة فتحها. سيرى {name} أنها أُغلقت، وتواصل زرقاء البحث لكليكما. |
| `chat.notIt.go` | Close the chat | أغلق المحادثة |
| `chat.notIt.keep` | Keep chatting | واصل الحديث |
| `chat.messages` | Messages | الرسائل |
| `chat.return.ask.lost` | I got it back | استرددتُه |
| `chat.return.ask.found` | I handed it over | سلّمتُه |
| `chat.return.you` | YOU · RETURNED? | أنت · أرُدّ؟ |
| `chat.return.they` | {name} · RETURNED? | {name} · أرُدّ؟ |
| `chat.return.yes` | Yes, it's back | نعم، رُدّ |
| `chat.return.no` | Not yet | ليس بعد |
| `chat.return.withdraw` | Undo | تراجَع |
| `chat.return.done` | Both confirmed. It's back. | أكّد كلاكما. لقد رُدّ. |
| `chat.today` | Today | اليوم |
| `chat.handover.suggested` | HANDOVER · SUGGESTED | تسليم · مقترَح |
| `chat.handover.confirmed` | HANDOVER · CONFIRMED | تسليم · مؤكَّد |
| `chat.handover.confirm` | Confirm | أكِّد |
| `chat.handover.another` | Suggest another | اقترح غيره |
| `chat.handover.seeYou` | Confirmed. See you there. | أُكّد. نلقاك هناك. |
| `chat.handover.waiting` | Waiting for {name} to confirm. | في انتظار تأكيد {name}. |
| `chat.suggestTime` | + Suggest a time | + اقترح موعدًا |
| `chat.quick.where` | Where should we meet? | أين نلتقي؟ |
| `chat.quick.omw` | On my way | أنا في الطريق |
| `chat.quick.late` | Running 5 min late | سأتأخر خمس دقائق |
| `chat.quick.thanks` | Thank you so much! | جزاك الله خيرًا! |
| `chat.message` | Message | رسالة |
| `chat.placeholder` | Message {name} | راسل {name} |
| `chat.send` | Send | أرسِل |
| `chat.notIt` | Not the same item after all? | ليس هو الشيء نفسه في آخر الأمر؟ |
| `chat.closedReturned` | Returned. This chat is closed. | رُدّ. أُغلقت هذه المحادثة. |
| `chat.closedNotIt` | Not the same item. This chat is closed. | ليس هو الشيء نفسه. أُغلقت هذه المحادثة. |
| `chat.plan.title` | SUGGEST A HANDOVER | اقترح موعد تسليم |
| `chat.plan.place` | Where? e.g. Library entrance | أين؟ مثلًا: مدخل المكتبة |
| `chat.plan.day` | Day | اليوم |
| `chat.plan.time` | Time | الوقت |
| `chat.plan.where` | Where | المكان |
| `chat.plan.past` | That time has already passed. Pick a later one. | مضى هذا الوقت. اختر وقتًا بعده. |
| `chat.plan.send` | Send | أرسِل |
| `chat.plan.cancel` | Cancel | إلغاء |
| `chat.returned.title` | RETURNED. | رُدَّ إلى صاحبه. |
| `chat.returned.alt` | Zarqa holding up a returned item | زرقاء ترفع شيئًا قد رُدّ |
| `chat.returned.body` | Back where it belongs. Zarqa saw this coming three days ago. | عاد إلى حيث ينبغي. وقد رأت زرقاء هذا قبل ثلاثة أيام. |
| `chat.returned.home` | Back home | إلى الرئيسية |
| `chat.returned.keep` | See the chat | اعرض المحادثة |
| `chat.returned.body.found` | You helped {name} get it back. That's the whole point. Thank you. | أعنتَ {name} على استرداده، وهذا هو المقصود كلُّه. شكرًا لك. |


## Alerts prompt

| Key | English | العربية |
|---|---|---|
| `alerts.label` | DON'T MISS IT | لا يفُتْك |
| `alerts.body` | Turn on alerts and I'll ping you the second I spot a match or someone messages you. | فعّل التنبيهات أُنبّهك في اللحظة التي ألمح فيها مطابقة أو يراسلك فيها أحد. |
| `alerts.install` | On iPhone, alerts need Zarqa on your Home Screen: tap Share, then 'Add to Home Screen', and open it from there. | على الآيفون تحتاج التنبيهات أن تكون زرقاء على شاشتك الرئيسية: اضغط «مشاركة» ثم «إضافة إلى الشاشة الرئيسية»، وافتحها من هناك. |
| `alerts.turnOn` | Turn on | فعّلها |
| `alerts.later` | Later | لاحقًا |
| `alerts.on` | Alerts are on for this phone. | التنبيهات مفعّلة على هذا الهاتف. |
| `alerts.failed` | Couldn't turn alerts on. Check your connection and try again. | تعذّر تفعيل التنبيهات. تحقّق من اتصالك وحاول مجددًا. |


## Profile

| Key | English | العربية |
|---|---|---|
| `profile.title` | Profile | الملف الشخصي |
| `profile.changePhoto` | Change photo | غيّر الصورة |
| `profile.photoUploading` | Uploading your photo… | جارٍ رفع صورتك… |
| `profile.removePhoto` | Remove photo | احذف الصورة |
| `profile.removePhoto.title` | Remove your photo? | أتحذف صورتك؟ |
| `profile.removePhoto.body` | Your profile photo is deleted from Zarqa, for you and the people you chat with. You can add a new one any time. | تُحذف صورة ملفك من زرقاء، عندك وعند من تحادثهم. ولك أن تضيف غيرها متى شئت. |
| `profile.removePhoto.go` | Remove photo | احذف الصورة |
| `profile.removePhoto.keep` | Keep it | أبقِها |
| `profile.photoSeen` | People you chat with see your photo and first name. | يرى من تحادثهم صورتك واسمك الأول. |
| `profile.photoHidden` | Your name is hidden, so chats show no photo either. | اسمك مخفيّ، فلا تظهر صورتك في المحادثات كذلك. |
| `profile.editName` | Change name | غيّر الاسم |
| `profile.editName.help` | This is the name finders and the RSA desk see. | هذا هو الاسم الذي يراه الواجدون ومكتب RSA. |
| `profile.editName.save` | Save | احفظ |
| `profile.editName.cancel` | Cancel | إلغاء |
| `profile.student` | GUTECH STUDENT | طالب في GUtech |
| `profile.staff` | GUTECH STAFF | موظف في GUtech |
| `profile.posts` | POSTS | المنشورات |
| `profile.gotBack` | GOT BACK | استرددتُ |
| `profile.helped` | HELPED RETURN | أعنتُ على ردّه |
| `profile.statsFailed` | Couldn’t load your numbers. | تعذّر تحميل أرقامك. |
| `profile.staffTools` | STAFF | الموظفون |
| `profile.settings` | SETTINGS | الإعدادات |
| `profile.alerts` | Match alerts | تنبيهات المطابقة |
| `profile.alerts.sub` | When Zarqa spots a possible match | حين تلمح زرقاء مطابقة محتملة |
| `profile.alerts.default` | Not on for this phone yet. Turn it on to get a ping for matches and chat messages. | لم تُفعَّل على هذا الهاتف بعد. فعّلها ليصلك تنبيه بالمطابقات ورسائل المحادثات. |
| `profile.alerts.turnOn` | Turn on for this phone | فعّلها على هذا الهاتف |
| `profile.alerts.denied` | Notifications are blocked for Zarqa in your browser settings, so this phone won’t ping. You’ll still get match emails. | الإشعارات محجوبة عن زرقاء في إعدادات متصفحك، فلن يُنبّهك هذا الهاتف. وستصلك رسائل المطابقة بالبريد مع ذلك. |
| `profile.alerts.unsupported` | This browser can’t show alerts. You’ll still get match emails. | هذا المتصفح لا يعرض التنبيهات. وستصلك رسائل المطابقة بالبريد مع ذلك. |
| `profile.alerts.failed` | Couldn’t turn on alerts for this phone. Try again. | تعذّر تفعيل التنبيهات على هذا الهاتف. حاول مجددًا. |
| `profile.showName` | Show my first name in chats | أظهِر اسمي الأول في المحادثات |
| `profile.showName.sub` | Otherwise you appear as “GUtech student”, with no photo | وإلا ظهرتَ باسم «طالب في GUtech» بلا صورة |
| `profile.language` | Language | اللغة |
| `profile.language.sub` | English only for now. Arabic is coming. | العربية أو الإنجليزية |
| `profile.tips` | Safe handover tips | نصائح للتسليم الآمن |
| `profile.help` | Help & feedback | المساعدة والملاحظات |
| `profile.privacy` | Privacy | الخصوصية |
| `profile.terms` | Terms | الشروط |
| `profile.admin` | Admin | الإدارة |
| `profile.signOut` | SIGN OUT | تسجيل الخروج |
| `profile.signingOut` | SIGNING OUT… | جارٍ الخروج… |
| `profile.signOutFailed` | Couldn’t sign out: Zarqa can’t be reached. Check your connection and try again. | تعذّر تسجيل الخروج: لا يمكن الوصول إلى زرقاء. تحقّق من اتصالك وحاول مجددًا. |
| `profile.delete` | Delete my account | احذف حسابي |
| `profile.deleting` | Deleting… | جارٍ الحذف… |
| `profile.deleteSheet.title` | Delete your account? | أتحذف حسابك؟ |

**`profile.deleteSheet.body`**

> Your account, reports, photos, chats and alerts are removed from Zarqa. Matching logs are kept for up to 182 days, and items handed in at the RSA desk stay listed until the desk closes them.

<div dir="rtl">

يُزال حسابك وبلاغاتك وصورك ومحادثاتك وتنبيهاتك من زرقاء. وتُحفظ سجلات المطابقة مدةً أقصاها 182 يومًا، وتبقى الأشياء المسلَّمة إلى مكتب RSA مدرجةً حتى يغلقها المكتب.

</div>

| Key | English | العربية |
|---|---|---|
| `profile.deleteSheet.next` | Continue | تابع |
| `profile.deleteSheet.keep` | Keep my account | أبقِ حسابي |
| `profile.deleteFinal.title` | This can’t be undone | لا رجعة في هذا |
| `profile.deleteFinal.body` | Once it’s gone, Zarqa can’t bring back your reports or chats. Delete your account for good? | إذا ذهب فلن تستطيع زرقاء أن تعيد بلاغاتك ولا محادثاتك. أتحذف حسابك نهائيًا؟ |
| `profile.deleteFinal.go` | Delete for good | احذفه نهائيًا |
| `profile.rsa` | RSA desk | مكتب RSA |


## Terms, Privacy, Help and Tips

| Key | English | العربية |
|---|---|---|
| `info.review.terms` | Version of 13 November 2026. If these terms change in a way that matters, Zarqa asks you to agree again. | نسخة 13 نوفمبر 2026. إن تغيّرت هذه الشروط تغييرًا ذا شأن، طلبت منك زرقاء الموافقة من جديد. |
| `info.review.privacy` | Version of 13 November 2026. If this notice changes in a way that matters, Zarqa asks you to agree again. | نسخة 13 نوفمبر 2026. إن تغيّر هذا الإشعار تغييرًا ذا شأن، طلبت منك زرقاء الموافقة من جديد. |
| `info.contact.label` | CONTACT | التواصل |
| `info.contact` | hello@tryzarqa.com | hello@tryzarqa.com |
| `info.navigation` | About Zarqa | عن زرقاء |
| `info.pdpl` | Oman's data protection law, and where to complain (Ministry of Transport, Communications and IT) | قانون حماية البيانات الشخصية في عُمان، وجهة تقديم الشكوى (وزارة النقل والاتصالات وتقنية المعلومات) |
| `info.terms.title` | Terms | الشروط |
| `info.privacy.title` | Privacy | الخصوصية |
| `info.help.title` | Help & feedback | المساعدة والملاحظات |
| `info.tips.title` | Safe handover tips | نصائح للتسليم الآمن |
| `info.terms.0.title` | A little campus teamwork | شيءٌ من التعاون في الحرم |

**`info.terms.0.body`**

> Zarqa is a student-made lost-and-found service for the GUtech community. It isn't run by GUtech and isn't an official university channel, though the GUtech RSA desk helps with items handed in there. Using Zarqa means you agree to these terms and to the Privacy notice.

<div dir="rtl">

زرقاء خدمةٌ للمفقودات واللُّقَطات صنعها طلبةٌ لمجتمع GUtech. وليست من إدارة GUtech ولا قناةً جامعيةً رسمية، وإن كان مكتب RSA في GUtech يُعين في الأشياء المسلَّمة إليه. واستعمالك زرقاء يعني موافقتك على هذه الشروط وعلى إشعار الخصوصية.

</div>

| Key | English | العربية |
|---|---|---|
| `info.terms.1.title` | Who can use it | مَن يحقّ له استعمالها |

**`info.terms.1.body`**

> You need to be 18 or older and sign in with your own GUtech email. If you're under 18, hand in or ask about items at the RSA desk in person instead. One account per person, and keep your sign-in codes to yourself.

<div dir="rtl">

يجب أن تكون قد بلغتَ الثامنة عشرة، وأن تسجّل الدخول ببريدك الخاص في GUtech. فإن كنت دون الثامنة عشرة، فسلِّم الأشياء أو اسأل عنها في مكتب RSA حضوريًا. لكل شخص حساب واحد، واحتفظ برموز الدخول لنفسك.

</div>

| Key | English | العربية |
|---|---|---|
| `info.terms.2.title` | Keep it honest | التزم الصدق |

**`info.terms.2.body`**

> Only post things you really lost or found, and only share photos and details you have the right to share. Don't claim someone else's property, pretend to be someone else, harass anyone or post unlawful content. Oman's laws apply, including the Cyber Crime Law. We may close reports or suspend accounts that break these rules, and may report serious misuse to GUtech or the authorities.

<div dir="rtl">

لا تنشر إلا ما أضعتَه أو وجدتَه حقًّا، ولا تشارك من الصور والتفاصيل إلا ما يحقّ لك مشاركته. لا تدّعِ ملك غيرك، ولا تنتحل شخصية أحد، ولا تؤذِ أحدًا، ولا تنشر محتوى مخالفًا للقانون. وتسري قوانين عُمان، ومنها قانون مكافحة جرائم تقنية المعلومات. ولنا أن نغلق البلاغات أو نوقف الحسابات التي تخالف هذه القواعد، وأن نُبلغ GUtech أو الجهات المختصة عن إساءة الاستعمال الجسيمة.

</div>

| Key | English | العربية |
|---|---|---|
| `info.terms.3.title` | A match is a suggestion | المطابقة اقتراحٌ لا أكثر |

**`info.terms.3.body`**

> AI can miss items or suggest the wrong one. Check identifying details before handing anything over. Zarqa doesn't hold items (only the RSA desk does, for things handed in there), verify ownership, guarantee a return or arrange the handover for you. Meet safely and never pay to unlock a match.

<div dir="rtl">

قد يغفل الذكاء الاصطناعي عن أشياء أو يقترح غير الصواب، فتحقّق من التفاصيل المميِّزة قبل أن تسلّم شيئًا. ولا تحتفظ زرقاء بالأشياء (وإنما يحتفظ بها مكتب RSA لما سُلِّم إليه)، ولا تتحقق من الملكية، ولا تضمن الردّ، ولا ترتّب التسليم نيابةً عنك. التقوا في أمان، ولا تدفع مالًا قطّ لكشف مطابقة.

</div>

| Key | English | العربية |
|---|---|---|
| `info.terms.4.title` | No guarantees | بلا ضمانات |

**`info.terms.4.body`**

> Zarqa is free, run by a student, and provided as it is, with no guarantees. It may change, pause or stop. As far as the law allows, we aren’t responsible for lost, damaged or wrongly returned items, or for what happens when users meet.

<div dir="rtl">

زرقاء مجانية، يديرها طالب، وتُقدَّم على حالها بلا أي ضمانات. وقد تتغيّر أو تتوقف مؤقتًا أو نهائيًا. وفي الحدود التي يسمح بها القانون، لسنا مسؤولين عن الأشياء الضائعة أو التالفة أو المردودة إلى غير أهلها، ولا عمّا يجري حين يلتقي المستخدمون.

</div>

| Key | English | العربية |
|---|---|---|
| `info.terms.5.title` | Changes, leaving and the law | التغييرات والمغادرة والقانون |

**`info.terms.5.body`**

> If these terms or the Privacy notice change in a way that matters, Zarqa asks you to agree again before you carry on. You can leave any time: close your reports or delete your account in Profile. These terms are governed by the laws of the Sultanate of Oman. Questions or a report of misuse: email hello@tryzarqa.com.

<div dir="rtl">

إن تغيّرت هذه الشروط أو إشعار الخصوصية تغييرًا ذا شأن، طلبت منك زرقاء الموافقة من جديد قبل أن تُكمل. ولك أن تغادر متى شئت: أغلق بلاغاتك أو احذف حسابك من الملف الشخصي. وتخضع هذه الشروط لقوانين سلطنة عُمان. وللأسئلة أو الإبلاغ عن إساءة الاستعمال: راسل hello@tryzarqa.com.

</div>

| Key | English | العربية |
|---|---|---|
| `info.privacy.0.title` | Who's responsible | مَن المسؤول |

**`info.privacy.0.body`**

> Zarqa is run by a GUtech student (the operator), who is responsible for your data (the data controller) and also acts as its data protection officer. Zarqa isn't run by GUtech. For any privacy question or request, email hello@tryzarqa.com.

<div dir="rtl">

يدير زرقاءَ طالبٌ في GUtech (المشغِّل)، وهو المسؤول عن بياناتك (المتحكِّم في البيانات)، ويتولّى كذلك مهام مسؤول حماية البيانات. وليست زرقاء من إدارة GUtech. ولأي سؤال أو طلب يتعلق بالخصوصية، راسل hello@tryzarqa.com.

</div>

| Key | English | العربية |
|---|---|---|
| `info.privacy.1.title` | What we collect | ما الذي نجمعه |

**`info.privacy.1.body`**

> We collect:
> - your university email, first name, profile settings and optional profile photo
> - your lost and found reports, their photos, match results and matching logs
> - chats, handover details and read markers
> - if you turn on push alerts, your browser’s push subscription
> 
> Uploaded photos are re-encoded with their location and camera data (EXIF) removed. Sign-in uses one session cookie and short-lived sign-in codes. There are no ads, no analytics and no tracking cookies.

<div dir="rtl">

نجمع:
- بريدك الجامعي واسمك الأول وإعدادات ملفك وصورة ملفك الاختيارية
- بلاغاتك عن المفقودات واللُّقَطات وصورها ونتائج المطابقة وسجلاتها
- المحادثات وتفاصيل التسليم وعلامات القراءة
- اشتراك الإشعارات في متصفحك، إن فعّلت التنبيهات

يُعاد ترميز الصور المرفوعة مع إزالة بيانات الموقع والكاميرا (EXIF) منها. ويستعمل تسجيل الدخول ملفّ تعريف ارتباط واحدًا للجلسة ورموز دخول قصيرة الأجل. ولا إعلانات ولا تحليلات ولا ملفات تعريف ارتباط للتتبّع.

</div>

| Key | English | العربية |
|---|---|---|
| `info.privacy.2.title` | Why we use it | لماذا نستعملها |

**`info.privacy.2.body`**

> Only to run the lost-and-found: to sign you in, match lost and found reports, let owners and finders talk and arrange handovers, work with the RSA desk, send you the emails and alerts the service needs, and keep it safe from misuse. We never sell your data and never send marketing or advertising.

<div dir="rtl">

لا نستعملها إلا لتشغيل خدمة المفقودات: لتسجيل دخولك، ومطابقة بلاغات المفقودات باللُّقَطات، وتمكين المالكين والواجدين من التحادث وترتيب التسليم، والعمل مع مكتب RSA، وإرسال ما تحتاجه الخدمة من رسائل وتنبيهات، وصونها من إساءة الاستعمال. ولا نبيع بياناتك أبدًا، ولا نرسل تسويقًا ولا إعلانات.

</div>

| Key | English | العربية |
|---|---|---|
| `info.privacy.3.title` | Your consent | موافقتك |

**`info.privacy.3.body`**

> We use your data because you expressly agree to it. Zarqa asks for that consent, and records when you gave it and to which version, before you can use the service. That includes processing outside Oman (see below). You can withdraw consent at any time by deleting your account in Profile or emailing us. Zarqa is for people aged 18 or older. If RSA desk staff file a report for you at your request, Zarqa asks for your consent when you first sign in.

<div dir="rtl">

نستعمل بياناتك لأنك وافقت على ذلك صراحةً. تطلب زرقاء هذه الموافقة، وتسجّل متى أعطيتها ولأي نسخة، قبل أن تستعمل الخدمة. ويشمل ذلك المعالجة خارج عُمان (انظر أدناه). ولك أن تسحب موافقتك متى شئت بحذف حسابك من الملف الشخصي أو بمراسلتنا. وزرقاء لمن بلغ الثامنة عشرة فما فوق. وإن رفع موظفو مكتب RSA بلاغًا عنك بطلب منك، طلبت زرقاء موافقتك عند أول تسجيل دخول لك.

</div>

| Key | English | العربية |
|---|---|---|
| `info.privacy.4.title` | Who can see it? | مَن يستطيع رؤيتها؟ |

**`info.privacy.4.body`**

> There is no public list of reports. Who sees what:
> - The person who lost an item: possible matches for their report, with ordinary photos and covered card photos.
> - Owner and finder: once the owner says an item could be theirs, a private chat between the two of them. Your profile photo shows there only while your first name does; with your name hidden you appear as “GUtech student”, with no photo.
> - GUtech RSA desk staff: owner–finder chats (read-only, to keep handovers safe), and every found report with its photos and the finder’s first name (if shown). When someone claims an item at the desk, they also see the owner’s first name and description. If you ask for an item at the desk, staff can file a lost report for you under your GUtech email.
> - Admins: reports, owner emails, photos (card photos only covered), possible matches (some before the owner sees them) and matching logs, to moderate the service. The operator has server access for maintenance.
> 
> Photos of cards and IDs are first covered on our own server by text recognition (OCR) that hides every number, machine-readable line and barcode it finds; names, faces and logos stay visible. Only that covered copy is ever shown: to a possible owner while they decide, to the finder or owner after a claim, to RSA staff and to admins. If covering fails or any number is still readable, the photo stays visible only to its uploader, and the original is never shown to anyone else.

<div dir="rtl">

لا توجد قائمة عامة بالبلاغات. ومن يرى ماذا:
- من أضاع شيئًا: المطابقات المحتملة لبلاغه، بالصور العادية وصور البطاقات المغطّاة.
- المالك والواجد: حين يقول المالك إن شيئًا قد يكون له، تُفتح محادثة خاصة بينهما وحدهما. وتظهر صورة ملفك هناك ما دام اسمك الأول ظاهرًا؛ فإن أخفيتَ اسمك ظهرتَ باسم «طالب في GUtech» بلا صورة.
- موظفو مكتب RSA في GUtech: محادثات المالكين والواجدين (للقراءة فقط، حفاظًا على سلامة التسليم)، وكل بلاغات اللُّقَطات بصورها والاسم الأول للواجد (إن كان ظاهرًا). وحين يطالب أحدٌ بشيء في المكتب، يرون كذلك الاسم الأول للمالك ووصفه. وإن سألتَ عن شيء في المكتب، فللموظفين أن يرفعوا بلاغ فقدٍ عنك ببريدك في GUtech.
- المشرفون: البلاغات وبريد أصحابها والصور (صور البطاقات مغطّاةً فقط) والمطابقات المحتملة (بعضها قبل أن يراها المالك) وسجلات المطابقة، للإشراف على الخدمة. وللمشغِّل صلاحية الوصول إلى الخادم لأعمال الصيانة.

تُغطّى صور البطاقات والهويات أولًا على خادمنا نحن بتقنية التعرّف على النصوص (OCR) التي تُخفي كل رقم وكل سطر مقروء آليًا وكل رمز شريطي تجده؛ وتبقى الأسماء والوجوه والشعارات ظاهرة. ولا يُعرض إلا تلك النسخة المغطّاة: على المالك المحتمل وهو يقرّر، وعلى الواجد أو المالك بعد المطالبة، وعلى موظفي مكتب RSA والمشرفين. فإن أخفقت التغطية أو بقي أي رقم مقروءًا، بقيت الصورة ظاهرة لرافعها وحده، ولا يُعرض الأصل على أحد غيره أبدًا.

</div>

| Key | English | العربية |
|---|---|---|
| `info.privacy.5.title` | Processing outside Oman | المعالجة خارج عُمان |

**`info.privacy.5.body`**

> Zarqa needs providers outside Oman to work:
> - Contabo (Europe) hosts our server.
> - OpenAI (United States) reads report text and permitted photos to find matches.
> - DeepSeek (China) and TypeSafe step in only when the main AI is unavailable.
> - Resend (United States) sends our emails, with Brevo (France) as a backup.
> - Your browser’s push service delivers alerts you turn on.
> 
> Original card and ID photos never go to any provider: the covering runs on our own server. We chose providers we believe protect data to a standard comparable to Oman’s law. Please don’t write identity numbers, bank details, or health or other sensitive details in reports.

<div dir="rtl">

تحتاج زرقاء إلى مزوّدين خارج عُمان لتعمل:
- Contabo (أوروبا) تستضيف خادمنا.
- OpenAI (الولايات المتحدة) تقرأ نصوص البلاغات والصور المسموح بها لإيجاد المطابقات.
- DeepSeek (الصين) وTypeSafe لا تتدخلان إلا حين يتعذّر الذكاء الاصطناعي الرئيسي.
- Resend (الولايات المتحدة) ترسل رسائلنا البريدية، وBrevo (فرنسا) احتياطًا.
- خدمة الإشعارات في متصفحك توصل التنبيهات التي تفعّلها.

لا تذهب صور البطاقات والهويات الأصلية إلى أي مزوّد أبدًا: فالتغطية تجري على خادمنا نحن. وقد اخترنا مزوّدين نعتقد أنهم يحمون البيانات بمستوى يضاهي قانون عُمان. ونرجو ألا تكتب في البلاغات أرقام الهوية ولا البيانات المصرفية ولا البيانات الصحية أو غيرها من البيانات الحساسة.

</div>

| Key | English | العربية |
|---|---|---|
| `info.privacy.6.title` | How long? | إلى متى؟ |

**`info.privacy.6.body`**

> - Open reports expire after 60 days without an update.
> - Finished reports (returned, expired or closed), their photos and chats are deleted about six months (182 days) after that.
> - Matching logs are kept for up to 182 days, even after you delete your account.
> - Accounts stay until you delete them.
> - Nightly server backups are kept for 14 days.
> - Found items handed in at the RSA desk stay listed until the RSA closes them, because the item is still on their shelf.
> 
> Cleanup runs daily, so removal isn’t instant.

<div dir="rtl">

- تنتهي البلاغات المفتوحة بعد ستين يومًا بلا تحديث.
- تُحذف البلاغات المنتهية (المردودة أو المنقضية أو المغلقة) وصورها ومحادثاتها بعد نحو ستة أشهر (182 يومًا) من ذلك.
- تُحفظ سجلات المطابقة مدةً أقصاها 182 يومًا، حتى بعد حذف حسابك.
- تبقى الحسابات حتى تحذفها.
- تُحفظ النسخ الاحتياطية الليلية للخادم 14 يومًا.
- تبقى اللُّقَطات المسلَّمة إلى مكتب RSA مدرجةً حتى يغلقها المكتب، لأن الشيء ما زال على رفّه.

يجري التنظيف يوميًا، فالإزالة ليست فورية.

</div>

| Key | English | العربية |
|---|---|---|
| `info.privacy.7.title` | Your rights | حقوقك |

**`info.privacy.7.body`**

> Under Oman’s Personal Data Protection Law you can:
> - withdraw your consent
> - ask us to correct, update or block your data
> - get a copy of it, or have it sent to another provider
> - have it deleted
> 
> Much of this you can do in the app: change your name, photo and settings in Profile, close or delete your reports, or use Profile › Delete my account, which removes your account, reports, photos, chats and alerts from the live service. For anything else, email hello@tryzarqa.com: we reply within 45 days, free of charge. If you think your data was handled unlawfully, you can complain to the Ministry of Transport, Communications and Information Technology (linked at the end of this notice).

<div dir="rtl">

بموجب قانون حماية البيانات الشخصية في عُمان، لك أن:
- تسحب موافقتك
- تطلب منا تصحيح بياناتك أو تحديثها أو حجبها
- تحصل على نسخة منها، أو تُنقل إلى مزوّد آخر
- تُحذف

وكثير من ذلك تستطيعه داخل التطبيق: غيّر اسمك وصورتك وإعداداتك من الملف الشخصي، وأغلق بلاغاتك أو احذفها، أو استعمل الملف الشخصي › احذف حسابي، فيُزال حسابك وبلاغاتك وصورك ومحادثاتك وتنبيهاتك من الخدمة. ولما سوى ذلك، راسل hello@tryzarqa.com: نردّ في غضون 45 يومًا بلا مقابل. وإن رأيت أن بياناتك عولجت على نحو مخالف للقانون، فلك أن تشكو إلى وزارة النقل والاتصالات وتقنية المعلومات (الرابط في آخر هذا الإشعار).

</div>

| Key | English | العربية |
|---|---|---|
| `info.privacy.8.title` | Keeping it safe | صونها |

**`info.privacy.8.body`**

> Connections are encrypted (HTTPS), the server is locked down to the operator, and backups can be read only by the operator. Only the people described above can see your data. If a breach puts your data at risk, we'll tell the Ministry and you within 72 hours of finding out, with what happened and what we're doing about it.

<div dir="rtl">

الاتصالات مشفّرة (HTTPS)، والخادم مقصور على المشغِّل، ولا يقرأ النسخ الاحتياطية إلا المشغِّل. ولا يرى بياناتك إلا من وُصفوا أعلاه. وإن عرّض اختراقٌ بياناتك للخطر، أخبرنا الوزارة وأخبرناك في غضون 72 ساعة من علمنا به، بما جرى وبما نفعله حياله.

</div>

| Key | English | العربية |
|---|---|---|
| `info.privacy.9.title` | Changes to this notice | التغييرات على هذا الإشعار |
| `info.privacy.9.body` | If this notice changes in a way that matters, Zarqa asks for your consent again before you carry on. This version is dated 13 November 2026. | إن تغيّر هذا الإشعار تغييرًا ذا شأن، طلبت زرقاء موافقتك من جديد قبل أن تُكمل. وهذه النسخة مؤرّخة في 13 نوفمبر 2026. |
| `info.help.0.title` | Lost something? | أضعتَ شيئًا؟ |

**`info.help.0.body`**

> Post a lost report from Home. Add the brand, colour, identifying marks and where and when you last had it. Zarqa looks for possible matches: check My reports, and turn on Match alerts in Profile so you hear about them. If nothing shows up yet, check My reports again later or ask at the RSA desk.

<div dir="rtl">

انشر بلاغ فقدٍ من الرئيسية، واذكر العلامة التجارية واللون والعلامات المميِّزة، وأين ومتى كان معك آخر مرة. وتبحث زرقاء عن المطابقات المحتملة: تفقّد «بلاغاتي»، وفعّل «تنبيهات المطابقة» من الملف الشخصي لتعلم بها. وإن لم يظهر شيء بعد، فعُد إلى «بلاغاتي» لاحقًا أو اسأل في مكتب RSA.

</div>

| Key | English | العربية |
|---|---|---|
| `info.help.1.title` | Found something? | وجدتَ شيئًا؟ |

**`info.help.1.body`**

> Post a found report. You can keep the item and meet the owner: when the owner says an item could be theirs, a chat opens so you can check ownership and arrange a handover. Or switch on “I’ll drop it at the RSA desk”, take it there and show your drop code; the owner collects it from the RSA desk with a pickup code, no chat needed. When the item is back with its owner, tap “I handed it over” in the chat; the owner confirms with “I got it back”.

<div dir="rtl">

انشر بلاغ لُقَطة. لك أن تحتفظ بالشيء وتلقى صاحبه: فحين يقول المالك إن شيئًا قد يكون له، تُفتح محادثة لتتحقق من الملكية وترتّب التسليم. أو فعّل «سأسلّمه إلى مكتب RSA»، واحمله إلى هناك وأظهِر رمز التسليم؛ فيستلمه صاحبه من مكتب RSA برمز استلام، بلا حاجة إلى محادثة. وحين يعود الشيء إلى صاحبه، اضغط «سلّمتُه» في المحادثة، ويؤكّد المالك بـ«استرددتُه».

</div>

| Key | English | العربية |
|---|---|---|
| `info.help.2.title` | Something feels off? | أترى شيئًا مريبًا؟ |

**`info.help.2.body`**

> For a bug, mistaken claim, abusive message, privacy request or feedback, email hello@tryzarqa.com. Include a report reference if useful, but never send bank-card details, identity documents or sign-in codes. This inbox is not an emergency service.

<div dir="rtl">

للإبلاغ عن عطل، أو ادّعاء خاطئ، أو رسالة مسيئة، أو طلب يتعلق بالخصوصية، أو لإبداء ملاحظة، راسل hello@tryzarqa.com. واذكر مرجع البلاغ إن كان مفيدًا، ولكن لا ترسل أبدًا بيانات البطاقات المصرفية ولا وثائق الهوية ولا رموز الدخول. وهذا البريد ليس خدمة طوارئ.

</div>

| Key | English | العربية |
|---|---|---|
| `info.help.3.title` | Can’t sign in? | لا تستطيع الدخول؟ |

**`info.help.3.body`**

> Use your GUtech email. The 6-digit code usually arrives within a minute: check your junk or spam folder too. A code works for 10 minutes; if it runs out, ask for a new one. Still stuck? Email hello@tryzarqa.com.

<div dir="rtl">

استعمل بريدك في GUtech. يصل الرمز ذو الخانات الست في الغالب خلال دقيقة، فتفقّد مجلد الرسائل غير المرغوبة أيضًا. يصلح الرمز عشر دقائق، فإن انقضت فاطلب رمزًا جديدًا. وإن بقيت عالقًا، فراسل hello@tryzarqa.com.

</div>

| Key | English | العربية |
|---|---|---|
| `info.help.4.title` | Not getting alerts? | لا تصلك التنبيهات؟ |

**`info.help.4.body`**

> Turn on Match alerts in Profile, then allow notifications when your phone asks. With Match alerts on, match emails arrive even without phone alerts, but chat messages only reach you as alerts or in the app.
> 
> - On iPhone, alerts only work once Zarqa is on your Home Screen: open it in Safari, tap Share, then “Add to Home Screen”, and open Zarqa from there.
> - If notifications are blocked, allow them for Zarqa in your browser or phone settings, then check Profile again.

<div dir="rtl">

فعّل «تنبيهات المطابقة» من الملف الشخصي، ثم اسمح بالإشعارات حين يسألك هاتفك. ومع تفعيل تنبيهات المطابقة تصلك رسائل المطابقة بالبريد ولو بلا تنبيهات الهاتف، أما رسائل المحادثات فلا تصلك إلا تنبيهاتٍ أو داخل التطبيق.

- على الآيفون، لا تعمل التنبيهات إلا إذا كانت زرقاء على شاشتك الرئيسية: افتحها في Safari، واضغط «مشاركة» ثم «إضافة إلى الشاشة الرئيسية»، وافتح زرقاء من هناك.
- إن كانت الإشعارات محجوبة، فاسمح بها لزرقاء من إعدادات المتصفح أو الهاتف، ثم تفقّد الملف الشخصي مجددًا.

</div>

| Key | English | العربية |
|---|---|---|
| `info.tips.0.title` | Meet where people are | التقيا حيث الناس |
| `info.tips.0.body` | Choose a busy campus spot in daylight. Bring a friend if that feels better. Use chat to agree on a place and time, then confirm the handover. | اختر بقعة عامرة في الحرم في وضح النهار، واصحب صديقًا إن كان ذلك أطيب لنفسك. اتفقا عبر المحادثة على المكان والموعد، ثم أكّدا التسليم. |
| `info.tips.1.title` | Check the little details | تحقّق من التفاصيل الصغيرة |

**`info.tips.1.body`**

> Ask the person to describe a detail you haven’t shared, such as a sticker or what’s inside a case. A match, even a BIG CHANCE one, is a clue, not proof of ownership.

<div dir="rtl">

اطلب من الشخص أن يصف تفصيلًا لم تذكره، كملصق أو ما في داخل علبة. والمطابقة، ولو كانت «احتمالًا كبيرًا»، قرينةٌ لا دليلُ ملكية.

</div>

| Key | English | العربية |
|---|---|---|
| `info.tips.2.title` | Keep private things private | صُن ما هو خاص |

**`info.tips.2.body`**

> Don’t share identity numbers, bank-card details, passwords or sign-in codes. For an ID or card, describe it without copying its numbers. Its uploaded photo is shown to others only with the numbers covered.

<div dir="rtl">

لا تشارك أرقام الهوية ولا بيانات البطاقات المصرفية ولا كلمات المرور ولا رموز الدخول. وإن كانت هوية أو بطاقة، فصِفها دون أن تنقل أرقامها. ولا تُعرض صورتها المرفوعة على الآخرين إلا والأرقام مغطّاة.

</div>

| Key | English | العربية |
|---|---|---|
| `info.tips.3.title` | No pressure, no payments | لا ضغط ولا دفع |

**`info.tips.3.body`**

> Don’t pay a fee or follow an unfamiliar link to claim an item. If something feels wrong, stop the handover and email hello@tryzarqa.com. Once the item is safely back, tap “I got it back” in the chat so Zarqa can stop searching.

<div dir="rtl">

لا تدفع رسومًا ولا تتبع رابطًا غريبًا لتطالب بشيء. وإن رابك أمر، فأوقف التسليم وراسل hello@tryzarqa.com. وحين يعود الشيء إليك سالمًا، اضغط «استرددتُه» في المحادثة لتكفّ زرقاء عن البحث.

</div>


## RSA desk (staff only)

| Key | English | العربية |
|---|---|---|
| `rsa.title` | RSA desk | مكتب RSA |
| `rsa.tab.desk` | Desk | المكتب |
| `rsa.tab.shelf` | Shelf | الرفّ |
| `rsa.tab.found` | Found | اللُّقَطات |

**`rsa.found.note`**

> The newest 300 found items on Zarqa. If someone asks for one at the desk, match it to them by email, even if they never reported it. Card and ID photos show only their covered copy.

<div dir="rtl">

أحدث 300 لُقَطة في زرقاء. إن سأل أحدٌ عن واحدة منها في المكتب، فطابقها له ببريده، ولو لم يرفع بلاغًا قط. ولا تظهر من صور البطاقات والهويات إلا نسختها المغطّاة.

</div>

| Key | English | العربية |
|---|---|---|
| `rsa.found.empty` | No found items yet. | لا لُقَطات بعد. |
| `rsa.found.filter` | Show | اعرض |
| `rsa.found.filter.open` | Can be matched | قابلة للمطابقة |
| `rsa.found.filter.shelf` | On the shelf | على الرفّ |
| `rsa.found.filter.all` | All | الكل |
| `rsa.search` | Search | بحث |
| `rsa.search.items` | Title, place, finder or code | العنوان أو المكان أو الواجد أو الرمز |
| `rsa.search.chats` | Item or name | الشيء أو الاسم |
| `rsa.search.none` | Nothing matches that search. | لا شيء يوافق هذا البحث. |
| `rsa.search.close` | Closest by meaning | الأقرب معنًى |
| `rsa.search.closeNote` | Not exact matches. These are Zarqa's best guesses for what you typed. | ليست مطابقة تامة، وإنما هي أقرب ما تظنّه زرقاء لما كتبت. |
| `rsa.count` | {n} items | الأشياء: {n} |
| `rsa.countOne` | 1 item | شيء واحد |
| `rsa.match.open` | Match to someone | طابِقه لشخص |
| `rsa.match.openAgain` | Match to someone else | طابِقه لشخص آخر |
| `rsa.match.openLabel` | Match to someone: {title} | طابِقه لشخص: {title} |
| `rsa.match.sentTo` | Already sent to: {emails} | أُرسل من قبل إلى: {emails} |
| `rsa.match.note` | Someone asked for this at the desk? Their email is enough: Zarqa keeps track of it for them, even if they never reported it. | سأل أحدهم عن هذا في المكتب؟ يكفي بريده: تحفظه زرقاء له، ولو لم يرفع بلاغًا قط. |
| `rsa.match.email` | Their GUtech email | بريده في GUtech |
| `rsa.match.handOver` | They're here: hand it over now | هو هنا: سلّمه إليه الآن |
| `rsa.match.checking` | Checking… | جارٍ التحقق… |
| `rsa.match.confirmSend` | Send them the match? | أترسل إليه المطابقة؟ |
| `rsa.match.confirmHandOver` | Hand it over now? | أتسلّمه الآن؟ |
| `rsa.match.known` | {email} is on Zarqa as {name}. | {email} مسجَّل في زرقاء باسم {name}. |
| `rsa.match.knownNoName` | {email} is already on Zarqa. | {email} مسجَّل في زرقاء من قبل. |
| `rsa.match.unknown` | No Zarqa account yet for {email}. Check the spelling with them: Zarqa makes one when you send this. | لا حساب في زرقاء بعدُ لـ{email}. تحقّق معه من الكتابة: تُنشئ زرقاء الحساب حين ترسل هذا. |
| `rsa.match.bodySend` | They see the match when they open Zarqa, and get an email if their match alerts are on. | يرى المطابقة حين يفتح زرقاء، ويصله بريد إن كانت تنبيهات المطابقة عنده مفعّلة. |
| `rsa.match.bodyHandOver` | Check their student ID first. The item is marked returned. | تحقّق من بطاقته الجامعية أولًا. ويُسجَّل الشيء مردودًا. |
| `rsa.match.item` | Item: “{title}”. | الشيء: «{title}». |
| `rsa.match.submit` | Send them the match | أرسِل إليه المطابقة |
| `rsa.match.submitHandOver` | Hand it over | سلّمه |
| `rsa.match.cancel` | Cancel | إلغاء |
| `rsa.match.sent` | Sent to {email}. They can claim it in Zarqa. | أُرسل إلى {email}، وله أن يطالب به في زرقاء. |
| `rsa.match.handedOver` | Handed over to {email}. Marked returned. | سُلّم إلى {email}، وسُجّل مردودًا. |
| `rsa.tab.chats` | Chats | المحادثات |
| `rsa.tab.team` | Team | الفريق |
| `rsa.code` | Drop or pickup code | رمز التسليم أو الاستلام |
| `rsa.code.hint` | Codes look like K7P-4QM. | الرموز على هيئة K7P-4QM. |
| `rsa.code.short` | Codes have 6 characters. | الرمز ست خانات. |
| `rsa.code.badChar` | Codes never use 0, O, 1, I, L, 2, Z, 5, S, 8 or B. Check that character with them. | لا تستعمل الرموز أبدًا 0 ولا O ولا 1 ولا I ولا L ولا 2 ولا Z ولا 5 ولا S ولا 8 ولا B. تحقّق معه من هذا الحرف. |
| `rsa.lookup` | Look it up | ابحث عنه |
| `rsa.lookingUp` | Looking it up… | جارٍ البحث… |
| `rsa.drop.h` | Someone is handing this in | أحدهم يسلّم هذا |
| `rsa.drop.h.held` | Already on the shelf | على الرفّ من قبل |
| `rsa.drop.h.waiting` | On the shelf: the owner is coming | على الرفّ: صاحبه آتٍ |
| `rsa.drop.h.collected` | Already collected | استُلم من قبل |
| `rsa.drop.h.closed` | This report was closed | أُغلق هذا البلاغ |
| `rsa.drop.h.expired` | This report expired | انتهى هذا البلاغ |
| `rsa.drop.h.other` | Found item | لُقَطة |
| `rsa.drop.receive` | Mark as received | سجّله مستلَمًا |
| `rsa.drop.receiveConfirm` | Mark it received? | أتسجّله مستلَمًا؟ |
| `rsa.drop.receiveBody` | Item: “{title}” ({code}). Check it's the one in front of you. Zarqa tells the finder it's safe at the desk. | الشيء: «{title}» ({code}). تحقّق أنه هو الذي بين يديك. وتُخبر زرقاء الواجد أنه في أمان عند المكتب. |
| `rsa.drop.receiveBodyClaimed` | Item: “{title}” ({code}). Check it's the one in front of you. Zarqa tells the finder, and tells the owner it's ready to collect. | الشيء: «{title}» ({code}). تحقّق أنه هو الذي بين يديك. وتُخبر زرقاء الواجد، وتُخبر صاحبه أنه جاهز للاستلام. |
| `rsa.drop.received` | On the shelf: “{title}” ({code}). | على الرفّ: «{title}» ({code}). |
| `rsa.drop.claimWaiting` | Already claimed. When the owner comes, they’ll show pickup code {code}. | طالب به صاحبه من قبل. حين يأتي، سيُظهر رمز الاستلام {code}. |
| `rsa.drop.ownerHere` | Owner is here | صاحبه هنا |
| `rsa.drop.ownerHereLabel` | Owner is here: {title} | صاحبه هنا: {title} |
| `rsa.pickup.h` | Someone is collecting this | أحدهم يستلم هذا |
| `rsa.pickup.check` | Compare what they say with the item, and the name on their student ID with their email. | قابِل ما يقوله بالشيء، والاسمَ الذي على بطاقته الجامعية ببريده. |
| `rsa.pickup.owner` | OWNER | المالك |
| `rsa.pickup.said` | WHAT THEY LOST | ما أضاعه |
| `rsa.pickup.noDetails` | They gave no details. Ask them to describe it before you show it. | لم يذكر تفاصيل. اطلب منه أن يصفه قبل أن تُريه إياه. |
| `rsa.pickup.item` | ITEM ON THE SHELF | الشيء الذي على الرفّ |
| `rsa.pickup.itemSince` | ON THE SHELF SINCE {date} | على الرفّ منذ {date} |
| `rsa.pickup.notIn` | NOT HANDED IN YET | لم يُسلَّم بعد |
| `rsa.pickup.notInNote` | Not handed in yet: the finder still has it. Ask the owner to come back when Zarqa tells them it's ready. | لم يُسلَّم بعد: ما زال عند الواجد. اطلب من صاحبه أن يعود حين تُخبره زرقاء أنه جاهز. |
| `rsa.pickup.handover` | Hand it over | سلّمه |
| `rsa.pickup.handoverConfirm` | Hand it to {name}? | أتسلّمه إلى {name}؟ |
| `rsa.pickup.handoverBody` | Item: “{title}”. Check their student ID first. It's marked returned. | الشيء: «{title}». تحقّق من بطاقته الجامعية أولًا. ويُسجَّل مردودًا. |
| `rsa.pickup.handoverBodyEmail` | Item: “{title}”. Check the name on their student ID fits {email}. It's marked returned. | الشيء: «{title}». تحقّق أن الاسم الذي على بطاقته الجامعية يوافق {email}. ويُسجَّل مردودًا. |
| `rsa.pickup.reject` | It's not theirs | ليس له |
| `rsa.pickup.rejectConfirm` | It's not theirs? | أليس له؟ |
| `rsa.pickup.rejectBody` | Their claim is cancelled and pickup code {code} stops working. This can't be undone. The item stays where it is and Zarqa keeps looking for both. | تُلغى مطالبته ويتوقف رمز الاستلام {code} عن العمل، ولا رجعة في هذا. ويبقى الشيء حيث هو، وتواصل زرقاء البحث لكليهما. |
| `rsa.pickup.done` | Handed to {name}: “{title}”. Marked returned. | سُلّم إلى {name}: «{title}». وسُجّل مردودًا. |
| `rsa.pickup.rejected` | Not theirs: pickup code {code} is cancelled. “{title}” stays on the shelf. | ليس له: أُلغي رمز الاستلام {code}. ويبقى «{title}» على الرفّ. |
| `rsa.state.expected` | On its way | في الطريق |
| `rsa.state.held` | On the shelf | على الرفّ |
| `rsa.state.claimed` | Claimed | مُطالَب به |
| `rsa.state.collected` | Collected | مُستلَم |
| `rsa.state.closed` | Closed | مُغلق |
| `rsa.state.expired` | Expired | منتهٍ |
| `rsa.state.finder` | With the finder | عند الواجد |
| `rsa.state.chatting` | Owner and finder chatting | المالك والواجد يتحادثان |
| `rsa.state.returned` | Returned | رُدّ |
| `rsa.finder` | Found by {name} | وجده {name} |
| `rsa.age.days` | On the shelf {n} days (since {date}) | على الرفّ منذ {date} (الأيام: {n}) |
| `rsa.age.oneDay` | On the shelf 1 day (since {date}) | على الرفّ يومًا واحدًا (منذ {date}) |
| `rsa.age.today` | On the shelf since today | على الرفّ منذ اليوم |
| `rsa.age.expected` | Not handed in yet. It expires by itself if nobody brings it. | لم يُسلَّم بعد. وينتهي من تلقاء نفسه إن لم يحمله أحد. |
| `rsa.age.collected` | Collected {date} | استُلم {date} |
| `rsa.age.closed` | Given away or closed by the desk {date} | أُعطي أو أغلقه المكتب {date} |
| `rsa.age.expired` | Expired {date} | انتهى {date} |
| `rsa.shelf.empty` | Nothing here yet. | لا شيء هنا بعد. |
| `rsa.shelf.done` | Show finished items | اعرض الأشياء المنتهية |
| `rsa.shelf.active` | Show current items | اعرض الأشياء الحالية |
| `rsa.shelf.group.held` | On the shelf ({n}) | على الرفّ ({n}) |
| `rsa.shelf.group.claimed` | Claimed, waiting for pickup ({n}) | مُطالَب بها، تنتظر الاستلام ({n}) |
| `rsa.shelf.group.expected` | On its way ({n}) | في الطريق ({n}) |
| `rsa.shelf.old` | Only 60+ days | ما تجاوز 60 يومًا فقط |
| `rsa.shelf.close` | Give away / close | أعطِه / أغلقه |
| `rsa.shelf.closeLabel` | Give away or close: {title} | أعطِه أو أغلقه: {title} |
| `rsa.shelf.closeConfirm` | Give it away or close it? | أتعطيه أو تغلقه؟ |
| `rsa.shelf.closeBody` | Item: “{title}”. It leaves the shelf and Zarqa stops matching it. This can't be undone. | الشيء: «{title}». يغادر الرفّ وتكفّ زرقاء عن مطابقته. ولا رجعة في هذا. |
| `rsa.shelf.closed` | Closed: “{title}”. | أُغلق: «{title}». |
| `rsa.photo` | Photo of {title} | صورة {title} |
| `rsa.photo.open` | Open photo {n} of {title} | افتح الصورة {n} من {title} |
| `rsa.photo.close` | Close photo | أغلق الصورة |
| `rsa.sensitive` | Card or ID: the photo stays private. | بطاقة أو هوية: الصورة تبقى خاصة. |
| `rsa.covered` | Card or ID: numbers and barcodes covered. The original stays with the finder. | بطاقة أو هوية: غُطّيت الأرقام والرموز الشريطية، والأصل يبقى عند الواجد. |
| `rsa.keep` | Go back | ارجع |
| `rsa.chats.note` | Read-only. You can see chats, but you can’t post or change anything. | للقراءة فقط. ترى المحادثات، ولكن لا تستطيع أن تكتب فيها أو تغيّر شيئًا. |
| `rsa.chats.empty` | No chats yet. | لا محادثات بعد. |
| `rsa.chats.between` | {lost} (owner) · {found} (finder) | {lost} (المالك) · {found} (الواجد) |
| `rsa.chats.messages` | {n} messages | الرسائل: {n} |
| `rsa.chats.messagesOne` | 1 message | رسالة واحدة |
| `rsa.chats.back` | All chats | كل المحادثات |
| `rsa.chats.zarqa` | Zarqa | زرقاء |
| `rsa.chats.owner` | Owner | المالك |
| `rsa.chats.finder` | Finder | الواجد |
| `rsa.chats.handover` | Handover: {when} · {place} | التسليم: {when} · {place} |
| `rsa.chats.status.active` | Open | مفتوحة |
| `rsa.chats.status.returned` | Item returned | رُدّ الشيء |
| `rsa.chats.status.closed` | Ended | انتهت |
| `rsa.chats.handover.suggested` | suggested, waiting for an answer | مقترَح، في انتظار الرد |
| `rsa.chats.handover.confirmed` | agreed | متّفَق عليه |
| `rsa.chats.handover.replaced` | replaced by a newer time | حلّ محلَّه موعد أحدث |
| `rsa.team.note` | People listed here can use the RSA desk. They sign in with their GUtech email. | من يُدرَجون هنا يستطيعون استعمال مكتب RSA، ويسجّلون الدخول ببريدهم في GUtech. |
| `rsa.team.email` | Colleague’s email | بريد الزميل |
| `rsa.team.add` | Add | أضِف |
| `rsa.team.addConfirm` | Give {email} the RSA desk? | أتمنح {email} صلاحية مكتب RSA؟ |
| `rsa.team.addBody` | They can see every found item, read every chat, hand items over and add or remove colleagues. | يستطيع أن يرى كل اللُّقَطات، ويقرأ كل المحادثات، ويسلّم الأشياء، ويضيف الزملاء أو يزيلهم. |
| `rsa.team.added` | Added {email}. They can open the RSA desk now. | أُضيف {email}، ويستطيع فتح مكتب RSA الآن. |
| `rsa.team.already` | {email} is already on the team. | {email} في الفريق من قبل. |
| `rsa.team.remove` | Remove | أزِل |
| `rsa.team.removeLabel` | Remove {email} | أزِل {email} |
| `rsa.team.removeConfirm` | Remove {email} from the RSA desk? | أتزيل {email} من مكتب RSA؟ |
| `rsa.team.removeBody` | They lose access at once. A colleague can add them again later. | يفقد الصلاحية فورًا، ولزميلٍ أن يضيفه مرة أخرى لاحقًا. |
| `rsa.team.removed` | Removed {email}. | أُزيل {email}. |
| `rsa.team.you` | you | أنت |
| `rsa.loading` | Loading… | جارٍ التحميل… |


## Admin (admins only)

| Key | English | العربية |
|---|---|---|
| `admin.title` | Behind the lookout | خلف المرصد |
| `admin.loading` | One moment... | لحظة… |
| `admin.users` | Students & staff | الطلبة والموظفون |
| `admin.newUsers30d` | Joined in 30 days | انضمّوا في 30 يومًا |
| `admin.returned` | Items returned | أشياء رُدّت |
| `admin.pendingJobs` | Matching queue | طابور المطابقة |
| `admin.failedJobs` | Failed jobs | مهام أخفقت |
| `admin.spendTodayUsd` | AI spend today | إنفاق الذكاء الاصطناعي اليوم |
| `admin.spend30dUsd` | AI spend, 30 days | إنفاق الذكاء الاصطناعي، 30 يومًا |
| `admin.spendUnderCent` | under $0.01 | أقل من 0.01 دولار |
| `admin.numbers` | Numbers | الأرقام |
| `admin.refresh` | Refresh numbers | حدّث الأرقام |
| `admin.refreshing` | Refreshing... | جارٍ التحديث… |
| `admin.reports` | Reports | البلاغات |
| `admin.matches` | Matches | المطابقات |
| `admin.decidedBy` | Match reviewers | مراجِعو المطابقات |
| `admin.noneYet` | None yet | لا شيء بعد |
| `admin.kind.lost` | Lost | مفقود |
| `admin.kind.found` | Found | لُقَطة |
| `admin.decider.Debate` | Debate (two advocates and a judge) | مناظرة (محاميان وحَكَم) |
| `admin.decider.LunaFallback` | Single review (fallback) | مراجعة واحدة (احتياطية) |
| `admin.decider.RsaStaff` | RSA desk, by hand | مكتب RSA، يدويًا |
| `admin.matchStatus.Suggested` | Suggested | مقترَحة |
| `admin.matchStatus.Confirmed` | Confirmed | مؤكَّدة |
| `admin.matchStatus.Rejected` | Not theirs | ليست له |
| `admin.matchStatus.Expired` | Expired | منتهية |
| `admin.matchStatus.Held` | Waiting for review | بانتظار المراجعة |
| `admin.matchStatus.Withheld` | Never shown | لم تُعرض قط |
| `admin.search` | Search reports | ابحث في البلاغات |
| `admin.searchHint` | Title, description or owner email | العنوان أو الوصف أو بريد صاحبه |
| `admin.filter` | Report status | حالة البلاغ |
| `admin.all` | All statuses | كل الحالات |
| `admin.limit` | Showing the latest 200 matching reports. Each match log shows its latest 100 entries. | تُعرض أحدث 200 بلاغ مطابق للبحث، ويعرض كل سجل مطابقة أحدث 100 قيد فيه. |
| `admin.empty` | No reports here yet. | لا بلاغات هنا بعد. |
| `admin.noResults` | No reports match that search. | لا بلاغات توافق هذا البحث. |
| `admin.posted` | Posted {date} | نُشر {date} |
| `admin.sampleTag` | Sample | نموذج |
| `admin.bannedTag` | Banned | محظور |
| `admin.adminTag` | Admin | مشرف |
| `admin.sensitive` | Card or ID: the photo stays private to the uploader (numbers couldn't all be covered, or it's from before covering). | بطاقة أو هوية: تبقى الصورة خاصة برافعها (تعذّرت تغطية كل الأرقام، أو هي من قبل التغطية). |
| `admin.covered` | Card or ID: numbers and barcodes covered. The original stays with the uploader. | بطاقة أو هوية: غُطّيت الأرقام والرموز الشريطية، والأصل يبقى عند رافعها. |
| `admin.photo` | Photo of {title} | صورة {title} |
| `admin.photoOpen` | Open photo of {title} | افتح صورة {title} |
| `admin.photoClose` | Close photo | أغلق الصورة |
| `admin.cancel` | Cancel | إلغاء |
| `admin.close` | Close report | أغلق البلاغ |
| `admin.closing` | Closing... | جارٍ الإغلاق… |
| `admin.closeTitle` | Close this report? | أتغلق هذا البلاغ؟ |
| `admin.closeConfirm` | It stops matching and can't be reopened here. | يتوقف عن المطابقة، ولا يمكن إعادة فتحه من هنا. |
| `admin.closeInChat` | Heads up: it's in a chat right now. | تنبيه: هو في محادثة الآن. |
| `admin.closePickup` | Heads up: it's waiting for pickup at the RSA desk. | تنبيه: هو في انتظار الاستلام في مكتب RSA. |
| `admin.closeGo` | Close it | أغلقه |
| `admin.ban` | Ban owner | احظر صاحبه |
| `admin.unban` | Unban owner | ارفع الحظر عن صاحبه |
| `admin.banning` | Banning... | جارٍ الحظر… |
| `admin.unbanning` | Restoring... | جارٍ الاستعادة… |
| `admin.banTitle` | Ban this person? | أتحظر هذا الشخص؟ |
| `admin.unbanTitle` | Restore their access? | أتعيد إليه صلاحية الدخول؟ |
| `admin.banGo` | Ban them | احظره |
| `admin.unbanGo` | Restore access | أعِد الصلاحية |
| `admin.banConfirm` | Ban {email}? Their open reports will close and they will lose access. | أتحظر {email}؟ ستُغلق بلاغاته المفتوحة ويفقد صلاحية الدخول. |
| `admin.unbanConfirm` | Restore access for {email}? Closed reports stay closed. | أتعيد الصلاحية إلى {email}؟ البلاغات المغلقة تبقى مغلقة. |
| `admin.viewLog` | View match log | اعرض سجل المطابقة |
| `admin.hideLog` | Hide match log | أخفِ سجل المطابقة |
| `admin.log` | Match log | سجل المطابقة |
| `admin.noLog` | No matching activity recorded yet. | لم يُسجَّل أي نشاط مطابقة بعد. |
| `admin.logVs` | vs “{title}” ({kind}) | مقابل «{title}» ({kind}) |
| `admin.logScore` | score {score} | الدرجة {score} |
| `admin.held.title` | To review | للمراجعة |
| `admin.held.note` | Matches that scored under 0.60. The owner can't see one until you approve it. Left alone, it's shown after 48 hours. | مطابقات نالت أقل من 0.60. لا يراها صاحبها حتى توافق عليها، فإن تُركت عُرضت بعد 48 ساعة. |
| `admin.held.empty` | Nothing to review. | لا شيء للمراجعة. |
| `admin.held.tag` | Small chance | احتمال ضئيل |
| `admin.held.score` | score {score} | الدرجة {score} |
| `admin.held.auto` | Shown by itself {when} | تُعرض تلقائيًا {when} |
| `admin.held.reasons` | Why Zarqa thinks so | لِمَ تظنّ زرقاء ذلك |
| `admin.held.approve` | Approve | وافِق |
| `admin.held.approving` | Approving... | جارٍ الموافقة… |
| `admin.held.approveTitle` | Show this match to the owner? | أتعرض هذه المطابقة على صاحبها؟ |
| `admin.held.approveConfirm` | They get the usual match alert now. It shows as Small chance. | يصله تنبيه المطابقة المعتاد الآن، وتظهر بوسم «احتمال ضئيل». |
| `admin.held.approveGo` | Approve it | وافِق عليها |
| `admin.held.reject` | Reject | ارفض |
| `admin.held.rejecting` | Rejecting... | جارٍ الرفض… |
| `admin.held.rejectTitle` | Reject this match? | أترفض هذه المطابقة؟ |
| `admin.held.rejectConfirm` | The owner never sees it, and Zarqa won't suggest this pair again. Both reports keep searching. | لا يراها صاحبها أبدًا، ولن تقترح زرقاء هذا الزوج مرة أخرى. ويظل البلاغان قيد البحث. |
| `admin.held.rejectGo` | Reject it | ارفضها |
| `admin.status.Open` | Open | مفتوح |
| `admin.status.InChat` | Chatting | في محادثة |
| `admin.status.Returned` | Returned | رُدّ |
| `admin.status.Closed` | Closed | مُغلق |
| `admin.status.Expired` | Expired | منتهٍ |
| `admin.status.Pickup` | Waiting at RSA | ينتظر في مكتب RSA |
| `admin.rematch` | Re-check open reports | أعِد فحص البلاغات المفتوحة |
| `admin.rematchConfirm` | Matching runs again for every open report, which spends model budget. Pairs that were already suggested or rejected stay as they are. | تجري المطابقة من جديد لكل بلاغ مفتوح، وهذا يستهلك من ميزانية النماذج. والأزواج التي اقتُرحت أو رُفضت من قبل تبقى على حالها. |
| `admin.rematchDone` | Queued {n} open reports. Matches show up in the next few minutes. | أُدرجت في الطابور بلاغات مفتوحة عددها {n}. وتظهر المطابقات في الدقائق القليلة القادمة. |
| `admin.rematchOne` | Queued 1 open report. A match shows up in the next few minutes. | أُدرج بلاغ مفتوح واحد في الطابور. وتظهر المطابقة في الدقائق القليلة القادمة. |
| `admin.rematchNone` | No open reports to re-check. | لا بلاغات مفتوحة لإعادة فحصها. |
| `admin.rematchTitle` | Re-check open reports? | أتعيد فحص البلاغات المفتوحة؟ |
| `admin.rematchGo` | Re-check them | أعِد فحصها |
| `admin.rematching` | Queuing... | جارٍ الإدراج… |
| `admin.email.title` | Email check | فحص البريد |

**`admin.email.note`**

> Sends you one test email through each email provider, so you know the backup works before the day it's needed. Each one counts toward that provider's daily limit.

<div dir="rtl">

يرسل إليك رسالة تجريبية واحدة عبر كل مزوّد بريد، لتعلم أن الاحتياطي يعمل قبل يوم الحاجة إليه. وتُحتسب كل رسالة من الحدّ اليومي لمزوّدها.

</div>

| Key | English | العربية |
|---|---|---|
| `admin.email.send` | Send me a test email | أرسِل إليّ رسالة تجريبية |
| `admin.email.sending` | Sending... | جارٍ الإرسال… |
| `admin.email.sheetTitle` | Send a test email? | أترسل رسالة تجريبية؟ |
| `admin.email.confirm` | One email per provider goes to your own address. | تذهب رسالة واحدة عن كل مزوّد إلى بريدك أنت. |
| `admin.email.go` | Send it | أرسِلها |
| `admin.email.none` | No email provider is set, so emails only go to the server log. | لم يُضبط أي مزوّد بريد، فلا تذهب الرسائل إلا إلى سجلّ الخادم. |
| `admin.email.okLine` | {provider}: sent. | {provider}: أُرسلت. |
| `admin.email.failLine` | {provider}: failed ({error}). | {provider}: أخفقت ({error}). |
| `admin.email.allOk` | {lines} Check {to}, and its Junk folder. | {lines} تفقّد {to}، ومجلد الرسائل غير المرغوبة فيه. |
| `admin.danger` | Demo and danger tools | أدوات العرض والخطر |
| `admin.sample.title` | Sample data | بيانات نموذجية |
| `admin.sample.note` | Made-up people, reports, matches, chats and RSA items for showing Zarqa off. They're never matched with real reports and never emailed. | أشخاص وبلاغات ومطابقات ومحادثات وأشياء في مكتب RSA مختلَقة، لعرض زرقاء. لا تُطابَق أبدًا ببلاغات حقيقية، ولا يُرسل إليها بريد. |
| `admin.sample.fill` | Fill sample data | املأ البيانات النموذجية |
| `admin.sample.on` | Sample data is in: {reports} reports from {users} made-up people. They're marked Sample in the list. | البيانات النموذجية موجودة: البلاغات {reports}، والأشخاص المختلَقون {users}. وهي موسومة بـ«نموذج» في القائمة. |
| `admin.sample.off` | No sample data in the app right now. | لا بيانات نموذجية في التطبيق الآن. |
| `admin.sample.filling` | Adding sample data... | جارٍ إضافة البيانات النموذجية… |
| `admin.sample.deleting` | Deleting sample data... | جارٍ حذف البيانات النموذجية… |
| `admin.sample.fillTitle` | Add sample data? | أتضيف بيانات نموذجية؟ |
| `admin.sample.fillGo` | Add it | أضِفها |
| `admin.sample.deleteTitle` | Delete sample data? | أتحذف البيانات النموذجية؟ |
| `admin.sample.fillConfirm` | Any earlier sample data is replaced. Sample people are never matched with real reports. | تحلّ محلَّ أي بيانات نموذجية سابقة. ولا يُطابَق الأشخاص النموذجيون ببلاغات حقيقية أبدًا. |
| `admin.sample.filled` | Added {reports} sample reports from {users} made-up people. | أُضيفت بلاغات نموذجية: {reports}، من أشخاص مختلَقين: {users}. |
| `admin.sample.delete` | Delete sample data | احذف البيانات النموذجية |
| `admin.sample.deleteConfirm` | Only the made-up people and their reports go. Real reports stay as they are. | لا يذهب إلا الأشخاص المختلَقون وبلاغاتهم، وتبقى البلاغات الحقيقية على حالها. |
| `admin.sample.deleted` | Sample data deleted. | حُذفت البيانات النموذجية. |
| `admin.wipe.title` | Delete everything | احذف كل شيء |

**`admin.wipe.note`**

> Deletes every report, chat, photo and account except admins. RSA staff emails stay on the team. This can't be undone here; only the nightly backup can bring it back.

<div dir="rtl">

يحذف كل بلاغ ومحادثة وصورة وحساب، عدا المشرفين. وتبقى عناوين بريد موظفي مكتب RSA في الفريق. ولا يمكن التراجع عن هذا من هنا؛ ولا يعيده إلا النسخ الاحتياطي الليلي.

</div>

| Key | English | العربية |
|---|---|---|
| `admin.wipe.label` | Type {site} to confirm | اكتب {site} للتأكيد |
| `admin.wipe.scope` | On {site} this deletes {reports} reports and {users} accounts. | يحذف هذا من {site}: البلاغات {reports}، والحسابات {users}. |
| `admin.wipe.waiting` | The numbers have to load before this can run. | يجب أن تُحمَّل الأرقام قبل أن يُنفَّذ هذا. |
| `admin.wipe.mismatch` | Not quite: type {site} exactly. | ليس تمامًا: اكتب {site} كما هو. |
| `admin.wipe.button` | Delete everything | احذف كل شيء |
| `admin.wipe.busy` | Deleting everything... | جارٍ حذف كل شيء… |
| `admin.wipe.sheetTitle` | Delete everything on {site}? | أتحذف كل شيء من {site}؟ |
| `admin.wipe.go` | Yes, delete everything | نعم، احذف كل شيء |
| `admin.wipe.done` | Deleted {reports} reports and {users} accounts. | حُذف من البلاغات: {reports}، ومن الحسابات: {users}. |


# Part 2: Text the server sends and other places outside en.json

## Report status labels (the coloured pills, from the server)

_Source: `server/Zarqa.Api/Reports/ReportEndpoints.cs`_

| English | العربية |
|---|---|
| Searching | قيد البحث |
| Possible match | مطابقة محتملة |
| Chatting | في محادثة |
| Returned | رُدّ |
| Closed | مُغلق |
| Expired | منتهٍ |
| Bring to RSA | احمله إلى RSA |
| At the RSA | في مكتب RSA |
| Ready to collect | جاهز للاستلام |
| Claimed at RSA | مُطالَب به في RSA |

## Zarqa's own lines inside chats

_Source: `server/Zarqa.Api/Chat/*.cs`_

| English | العربية |
|---|---|
| You two matched. Ask a question only the owner would know, and meet somewhere public. | تطابقتما. اسأل سؤالًا لا يعرف جوابه إلا صاحبه، والتقيا في مكان عام. |
| Returned. Back where it belongs. Thank you both! | رُدّ. عاد إلى حيث ينبغي. شكرًا لكما! |
| Not the same item after all. I'll keep looking for both of you. | ليس هو الشيء نفسه في آخر الأمر. سأواصل البحث لكليكما. |
| Not back yet. Keep chatting and sort out the handover. | لم يُردّ بعد. واصلا الحديث ورتّبا التسليم. |
| That was taken back. It's not marked returned yet. | سُحب ذلك، ولم يُسجَّل مردودًا بعد. |
| Handover: {when} · {place} | التسليم: {when} · {place} |
| Someone else has already claimed this one at the RSA desk. If it turns out not to be theirs, it opens up here again. | سبقك أحدهم إلى المطالبة بهذا في مكتب RSA. فإن تبيّن أنه ليس له، عاد متاحًا هنا. |
| Someone else is already talking to the finder about this one. If it turns out not to be theirs, it opens up here again. | أحدٌ غيرك يحادث الواجد في هذا الآن. فإن تبيّن أنه ليس له، عاد متاحًا هنا. |
| Matched by the RSA desk after you asked for it. | طابقه مكتب RSA بعد أن سألتَ عنه. |
| This one isn't waiting for review any more. | لم يعد هذا في انتظار المراجعة. |

## "Why I think so" reasons written by code

_Source: `server/Zarqa.Api/Matching/Reasons.cs`_

| English | العربية |
|---|---|
| Same kind of item: {category} | النوع نفسه: {category} |
| Same spot: {place} | المكان نفسه: {place} |
| Found within the hour | وُجد في غضون ساعة |
| Found about {hours} hours later | وُجد بعد نحو {hours} ساعة |
| Found the same day | وُجد في اليوم نفسه |
| Found the next day | وُجد في اليوم التالي |
| Found {days} days later | وُجد بعد {days} يومًا |

## Push alerts on the phone

_Source: `server/Zarqa.Api/Notifications/Notifier.cs`_

| English | العربية |
|---|---|
| Zarqa spotted something 👀 | لمحَت زرقاء شيئًا 👀 |
| Someone found something that might be yours: “{title}”. Tap to see. | وجد أحدهم شيئًا قد يكون لك: «{title}». اضغط لتراه. |
| Someone thinks it's theirs | أحدهم يظنّه له |
| {name} thinks this could be theirs: “{item}”. Ask something only the owner would know. | يظنّ {name} أن هذا قد يكون له: «{item}». اسأله عن شيء لا يعرفه إلا صاحبه. |
| Handover confirmed: {when} | أُكّد التسليم: {when} |
| {name} suggested a handover | اقترح {name} موعد تسليم |
| The RSA has it ✅ | هو عند مكتب RSA ✅ |
| Safe at the RSA desk: “{title}”. You're a legend. | في أمان عند مكتب RSA: «{title}». لله درُّك. |
| Ready to collect 🎉 | جاهز للاستلام 🎉 |
| It's at the RSA desk: “{title}”. Pickup code {code}. | هو في مكتب RSA: «{title}». رمز الاستلام {code}. |
| Back where it belongs 💛 | عاد إلى حيث ينبغي 💛 |
| What you found is back with its owner: “{title}”. Thank you! | ما وجدتَه عاد إلى صاحبه: «{title}». شكرًا لك! |

## Sign-in code email

_Source: `server/Zarqa.Api/Email/SignInCodeEmail.cs`_

| English | العربية |
|---|---|
| Your Zarqa code: {code}  (subject) | رمزك في زرقاء: {code} |
| YOUR SIGN-IN CODE | رمز دخولك |
| Your Zarqa sign-in code is {code} | رمز دخولك إلى زرقاء هو {code} |
| It works for 10 minutes. Type it into Zarqa and you're in. | يصلح عشر دقائق. اكتبه في زرقاء وتدخل. |
| It works for 10 minutes. If you didn't ask for it, ignore this email: nobody can sign in without the code. | يصلح عشر دقائق. وإن لم تطلبه فتجاهل هذه الرسالة: لا يستطيع أحد الدخول بلا الرمز. |
| Didn't ask for this? Ignore it. Nobody can sign in without the code. | لم تطلب هذا؟ تجاهله. لا يستطيع أحد الدخول بلا الرمز. |
| Zarqa · the GUtech lost & found, made by students for students. | زرقاء · مفقودات GUtech ولُقَطاتها، صنعها الطلبة للطلبة. |

## Notice emails (matches, claims, pickup, expiry, admin test)

_Source: `server/Zarqa.Api/Notifications/Notifier.cs, Admin/Retention.cs, Admin/AdminEndpoints.cs`_

| English | العربية |
|---|---|
| Open Zarqa (tryzarqa.com) on your phone to see it. | افتح زرقاء (tryzarqa.com) على هاتفك لتراه. |
| Turn these emails off in Profile → Match alerts. | أوقِف هذه الرسائل من الملف الشخصي ← تنبيهات المطابقة. |
| You get this email because it's about your own report. | تصلك هذه الرسالة لأنها تخصّ بلاغك أنت. |
| Zarqa spotted a possible match: {title}  (subject) | لمحَت زرقاء مطابقة محتملة: {title} |
| ZARQA SPOTTED SOMETHING | لمحَت زرقاء شيئًا |
| Could this be yours? | أيكون هذا لك؟ |
| Someone found an item that might be yours and handed it to the RSA desk. Open Zarqa and check the match: if it's yours, you'll get a pickup code. | وجد أحدهم شيئًا قد يكون لك وسلّمه إلى مكتب RSA. افتح زرقاء وانظر في المطابقة: فإن كان لك، وصلك رمز استلام. |
| Someone found an item that might be yours. Open Zarqa and check the match: if it's yours, you can message the finder right away. | وجد أحدهم شيئًا قد يكون لك. افتح زرقاء وانظر في المطابقة: فإن كان لك، فلك أن تراسل الواجد في الحال. |
| Someone thinks it's theirs: {item}  (subject) | أحدهم يظنّه له: {item} |
| YOU'RE A LEGEND | لله درُّك |
| Someone thinks it's theirs | أحدهم يظنّه له |
| {name} saw your found report and thinks it could be theirs. Open Zarqa to chat: ask a question only the owner would know, then meet somewhere public on campus. | رأى {name} بلاغ اللُّقَطة الذي نشرته ويظنّه له. افتح زرقاء للمحادثة: اسأل سؤالًا لا يعرف جوابه إلا صاحبه، ثم التقيا في مكان عام داخل الحرم. |
| Your item is ready to collect: {title}  (subject) | متاعك جاهز للاستلام: {title} |
| READY TO COLLECT | جاهز للاستلام |
| It's at the RSA desk | هو في مكتب RSA |
| Show the pickup code {code} at the RSA desk and bring your student ID. They'll check it against your description and hand it over. | أظهِر رمز الاستلام {code} في مكتب RSA وأحضِر بطاقتك الجامعية، فيطابقونه بوصفك ويسلّمونه إليك. |
| STILL HAVE IT? | أما زال عندك؟ |
| Your found report has expired | انتهى بلاغ اللُّقَطة الذي نشرته |
| It's been 60 days with no owner, so Zarqa stopped matching it. If you still have it, post it again on the home screen or take it to the RSA desk. | مضى ستون يومًا بلا صاحب، فكفّت زرقاء عن مطابقته. فإن كان ما زال عندك، فانشره من جديد من الرئيسية أو احمله إلى مكتب RSA. |
| STILL LOOKING? | أما زلت تبحث؟ |
| Your lost report has expired | انتهى بلاغ الفقد الذي نشرته |
| It's been 60 days, so Zarqa stopped matching it. If you're still looking, post it again on the home screen and I'll keep watching. | مضى ستون يومًا، فكفّت زرقاء عن مطابقته. فإن كنت ما زلت تبحث، فانشره من جديد من الرئيسية وأنا أواصل الترقّب. |
| Zarqa test email ({provider})  (subject) | رسالة زرقاء التجريبية ({provider}) |
| TEST | اختبار |
| {provider} can send | {provider} يستطيع الإرسال |
| An admin asked for this test email. It went through {provider}. | طلب مشرفٌ هذه الرسالة التجريبية، وقد مرّت عبر {provider}. |
| Sent from the admin page. | أُرسلت من صفحة الإدارة. |

## Error messages from the server

_Source: `server/Zarqa.Api/**`_

| English | العربية |
|---|---|
| That's not a GUtech email. Use the one ending in gutech.edu.om. | ليس هذا بريدًا في GUtech. استعمل البريد المنتهي بـ gutech.edu.om. |
| We've already sent you 3 codes. Type the one in your inbox (check junk too), or wait 15 minutes for another. | أرسلنا إليك ثلاثة رموز من قبل. اكتب الذي في بريدك (وتفقّد الرسائل غير المرغوبة أيضًا)، أو انتظر 15 دقيقة لرمز آخر. |
| We couldn't send the email just now. Try again in a minute. | تعذّر إرسال الرسالة الآن. حاول بعد دقيقة. |
| Enter the 6-digit code from your email. | أدخِل الرمز ذا الخانات الست من بريدك. |
| Slow down a little and try again in a moment. | تمهّل قليلًا وحاول بعد لحظة. |
| That code has expired. Ask for a new one. | انتهت صلاحية ذلك الرمز. اطلب رمزًا جديدًا. |
| Wrong code. {left} tries left. | رمز خاطئ. المحاولات المتبقية: {left}. |
| Wrong code. 1 try left. | رمز خاطئ. بقيت محاولة واحدة. |
| Wrong code. Ask for a new one. | رمز خاطئ. اطلب رمزًا جديدًا. |
| This account can't sign in. Contact us via Help. | لا يستطيع هذا الحساب الدخول. تواصل معنا عبر المساعدة. |
| The Terms have changed. Close Zarqa and open it again to see the latest version. | تغيّرت الشروط. أغلق زرقاء وافتحها من جديد لترى أحدث نسخة. |
| Agree to the Terms and Privacy first. | وافق على الشروط وسياسة الخصوصية أولًا. |
| Use letters only, up to 40 characters. | استعمل الحروف فقط، حتى 40 حرفًا. |
| That's a lot of posts in 24 hours. Try again later. | هذه منشورات كثيرة في 24 ساعة. حاول لاحقًا. |
| Send the report as a form. | أرسِل البلاغ في نموذج. |
| Send the photo as a form. | أرسِل الصورة في نموذج. |
| Is it lost or found? | أهو مفقود أم لُقَطة؟ |
| Tell me what it is first. | أخبرني ما هو أولًا. |
| Keep it under 500 characters. | اجعله دون 500 حرف. |
| Up to {n} photos. | حتى {n} صور. |
| Photo {n} is too big (15 MB max). | الصورة {n} كبيرة جدًا (الحدّ 15 ميغابايت). |
| Photo {n} isn't a photo I can read. Try a JPEG or PNG. | الصورة {n} ليست صورة أستطيع قراءتها. جرّب JPEG أو PNG. |
| Pick a photo. | اختر صورة. |
| That photo is too big (15 MB max). | تلك الصورة كبيرة جدًا (الحدّ 15 ميغابايت). |
| That file isn't a photo we can read. | ذلك الملف ليس صورة نستطيع قراءتها. |
| Only reports that are still searching can be edited. | لا يُعدَّل إلا ما كان من البلاغات قيد البحث. |
| Only found items go to the RSA desk. | لا يُسلَّم إلى مكتب RSA إلا اللُّقَطات. |
| This one is already on its way back to its owner. | هذا في طريقه إلى صاحبه من قبل. |
| Finish the chat first: mark it returned there. | أنهِ المحادثة أولًا: سجّله مردودًا هناك. |
| Someone is collecting this at the RSA desk. The RSA closes it when they do. | أحدهم يستلم هذا من مكتب RSA، ويغلقه المكتب حين يستلمه. |
| The RSA has it now, so they'll close it when it's collected. | هو عند مكتب RSA الآن، فيغلقونه حين يُستلم. |
| This one is with the RSA desk, so it stays. | هذا عند مكتب RSA، فيبقى. |
| This report has a chat, so it stays. You can close it instead. | لهذا البلاغ محادثة، فيبقى. ولك أن تغلقه بدلًا من ذلك. |
| Give the item a name (up to 80 characters). | سمِّ الشيء (حتى 80 حرفًا). |
| Keep the category short. | اجعل الصنف قصيرًا. |
| Keep the description under 500 characters. | اجعل الوصف دون 500 حرف. |
| Keep the place under 120 characters. | اجعل المكان دون 120 حرفًا. |
| That date doesn't look right. | لا يبدو ذلك التاريخ صحيحًا. |
| That date is in the future. | ذلك التاريخ في المستقبل. |
| That date is more than a year ago. | ذلك التاريخ قبل أكثر من سنة. |
| That time doesn't look right. | لا يبدو ذلك الوقت صحيحًا. |
| This match isn't open any more. | لم تعد هذه المطابقة قائمة. |
| This pickup isn't open any more. | لم يعد هذا الاستلام قائمًا. |
| This chat is closed. | هذه المحادثة مغلقة. |
| Type a message first. | اكتب رسالة أولًا. |
| That message is too long. | تلك الرسالة طويلة جدًا. |
| Where should you meet? | أين تلتقيان؟ |
| Pick a day and a time. | اختر يومًا ووقتًا. |
| That time has already passed. | مضى ذلك الوقت. |
| The other person confirms your suggestion. | الطرف الآخر هو من يؤكّد اقتراحك. |
| The other person confirms this. | الطرف الآخر هو من يؤكّد هذا. |
| That suggestion was replaced. Check the newest one. | حلّ محلَّ ذلك الاقتراح غيرُه. انظر في أحدثها. |
| They already asked. Confirm their ticket instead. | قد سأل هو من قبل، فأكّد طلبه بدلًا من ذلك. |
| That request isn't open any more. | لم يعد ذلك الطلب قائمًا. |
| That push subscription doesn't look right. | لا يبدو اشتراك الإشعارات ذاك صحيحًا. |
| Codes look like K7P-4QM. | الرموز على هيئة K7P-4QM. |
| No item with that code. Check it with them again. | لا شيء بهذا الرمز. تحقّق منه معه مرة أخرى. |
| No item with that code. | لا شيء بهذا الرمز. |
| That pickup code isn't active any more. | لم يعد رمز الاستلام ذاك ساريًا. |
| That pickup code isn't active. | رمز الاستلام ذاك غير سارٍ. |
| This report is already finished. | انتهى هذا البلاغ من قبل. |
| This one is already finished. | انتهى هذا من قبل. |
| Use their GUtech email address. | استعمل بريده في GUtech. |
| This item is already on its way back to someone. | هذا الشيء في طريقه إلى أحدهم من قبل. |
| Only items on the shelf can be handed over now. | لا يُسلَّم الآن إلا ما كان على الرفّ. |
| That account is banned. | ذلك الحساب محظور. |
| That's the person who found it. | هذا هو من وجده. |
| Already sent to them. They can claim it in Zarqa. | أُرسل إليه من قبل، وله أن يطالب به في زرقاء. |
| Someone has claimed it. Hand it over or mark it not theirs first. | طالب به أحدهم. سلّمه إليه أو سجّل أنه ليس له أولًا. |
| It was never handed in, so there's nothing to give away. It expires by itself. | لم يُسلَّم قط، فلا شيء يُعطى. وينتهي من تلقاء نفسه. |
| You can't remove yourself. Ask a colleague. | لا تستطيع إزالة نفسك. اطلب ذلك من زميل. |
| Admins can't be banned here. | لا يمكن حظر المشرفين من هنا. |
| Type {word} to confirm. | اكتب {word} للتأكيد. |

## Campus places (the place picker; from the GUtech map)

_Source: `server/Zarqa.Api/Data/Seed/locations.json`_

| English | العربية |
|---|---|
| GU1 Main Building | المبنى الرئيسي GU1 |
| Main Entrance | المدخل الرئيسي |
| Oman Hall | قاعة عُمان |
| Sports Hall | الصالة الرياضية |
| Ground Canteen | مقصف الطابق الأرضي |
| GU1 Prayer Room | مصلّى GU1 |
| Copy Centre | مركز النسخ |
| Mechatronics Lab | مختبر الميكاترونكس |
| UPAD Department | قسم UPAD |
| GUbridge | GUbridge |
| Faculty of Sciences | كلية العلوم |
| 4th Floor Faculties | كليات الطابق الرابع |
| GU1 Library | مكتبة GU1 |
| GU1 Smoking Area | منطقة التدخين في GU1 |
| GU1 Parking | مواقف GU1 |
| GU2 UPAD Building | مبنى UPAD في GU2 |
| Germany Hall | قاعة ألمانيا |
| GU2 UPAD Hall | قاعة UPAD في GU2 |
| UPAD Studio | مَرسم UPAD |
| GU2 Prayer Room | مصلّى GU2 |
| GU2 Parking | مواقف GU2 |
| Dirt Parking | المواقف الترابية |
| Girls Dorms Parking | مواقف سكن الطالبات |
| Female Residences | سكن الطالبات |
| Boys Dorms | سكن الطلاب |
| Museum | المتحف (مركز تاريخ العلوم) |
| Finland Oman School | المدرسة الفنلندية العُمانية |
| Oman Hydrogen Centre | مركز عُمان للهيدروجين |
| Engineering Workshops | الورش الهندسية |
| Padel Courts | ملاعب البادل |
| Grass Pitch | الملعب العشبي |
| Student Parking | مواقف الطلبة |

## Item kinds (used by matching and the "Same kind of item" reason)

_Source: `server/Zarqa.Api/Reports/Categories.cs`_

| English | العربية |
|---|---|
| Electronics | أجهزة إلكترونية |
| Stationery | قرطاسية |
| Bags | حقائب |
| Wallets & cards | محافظ وبطاقات |
| Accessories | حُليّ ولوازم |
| Clothing | ثياب |
| Books | كتب |
| Keys | مفاتيح |
| Bottles | قوارير |
| Sports | رياضة |
| Other | أخرى |

## Text written straight into the web code (image descriptions, page description)

_Source: `web/src/screens/*.tsx, web/index.html, web/vite.config.ts`_

| English | العربية |
|---|---|
| Zarqa  (logo and mascot image description) | زرقاء |
| Zarqa winking | زرقاء تغمز |
| Zarqa, happy | زرقاء فرِحة |
| Zarqa shading her eyes, looking far into the distance | زرقاء تظلّل عينيها وتنظر إلى البعيد |
| About  (sign-in footer links, for screen readers) | عن زرقاء |
| The GUtech lost & found. Post what you lost or found, Zarqa matches the two.  (app description) | مفقودات GUtech ولُقَطاتها. انشر ما أضعتَ أو وجدتَ، وزرقاء تجمع بين الاثنين. |
