# Quizzer

A study site in the spirit of Quizlet: card sets you own, five ways to drill
them, and a spaced repetition schedule that decides what to show you today.

The interface is **French by default**. English and Dutch are one click away
in the top bar. Adding another language means writing one catalogue file and
registering it (see [Adding a language](#adding-a-language)).

No build step, no dependencies, no accounts, no server-side storage. Plain
HTML, CSS and ES modules.

## Running it

ES modules are blocked over `file://`, so the site needs to be served over
HTTP. Anything that serves static files will do:

    cd quizzer
    python3 -m http.server 8080

Then open <http://localhost:8080/>.

To publish it, copy the directory to any web server. There is nothing to
compile and nothing to configure.

## What it does

### Study modes

| Mode | What it is | Feeds the schedule |
|------|------------|--------------------|
| **Flashcards** | Flip through the cards, shuffle them, reverse them, mark the hard ones | no |
| **Révision espacée** | Only the cards that are due, graded by you as "à revoir" or "je savais" | yes |
| **Quiz** | Multiple choice, true or false and written answers, in either direction | yes |
| **Écrire** | Type every answer; a card you miss returns later in the round, and the score counts the cards right the first time | yes |
| **Associer** | Pair six terms with their definitions against the clock | best time only |

Flashcards deliberately change nothing: browsing a set is not self-testing, so
it would be dishonest to let it move cards up the ladder.

### Spaced repetition

Six Leitner boxes with intervals of 0, 1, 3, 7, 16 and 35 days. A correct
answer on a card that is due moves it up one box, a miss sends it back to
box 0 and therefore back into today's queue. New cards are always due. A
right answer given before the card is due counts in the statistics but leaves
the schedule alone, so a few quizzes in one sitting cannot push a card to the
35 day box.

When nothing is due, "Réviser quand même" goes through up to twenty cards,
those that come due soonest. A card that is not due yet shows when it will
be, and a right answer leaves that date alone.

The four mastery levels shown in the interface fold those boxes together:
box 0 is "à apprendre", boxes 1 and 2 "en cours", boxes 3 and 4
"presque acquis", box 5 "maîtrisé".

### Daily goal

The home page counts today's answers against a daily goal, 20 by default.
Clicking the tile opens the settings with the goal field ready to edit. Any
whole number from 5 to 200 is accepted; other values are rounded or brought
into that range, and emptying the field keeps the current goal. Once the goal
is reached the tile stops at the goal and its caption gives the real count.

### Sample sets

"Charger les exemples" adds the sets that ship with the site: Spanish basics,
European capitals, English irregular verbs, chemical symbols, and a Dutch
course for French speakers in twenty-six sets, about 900 words and phrases.
Sets 1 to 12 lay the basics, from first words and numbers to everyday verbs,
adjectives and the small words that hold sentences together. Sets 13 to 26
go further: work, school, nature and weather, animals, leisure, shopping,
travel and feelings, then telling the time, where "half drie" means half past
two, separable verbs, irregular verbs with their auxiliary, everyday
expressions, a de or het drill and plurals. Every noun comes with its
article, de or het, since it has to be learned with the word, and read aloud
speaks the Dutch side in Dutch. The Dutch was checked against a machine
translator and Wiktionary: meanings, spelling, articles, plurals and verb
forms. Cards that share a French answer, such as dank
je and dank u for merci, carry a hint that tells them apart, and where a word
has two usual French renderings both are accepted, as with de jas for le
manteau or la veste.

The button is on the empty home page and above your sets once you have some.
It only adds the sample sets you do not have yet, so sets added to the site
later can be loaded too, and one you deleted comes back. The list is checked
with the server on every click, so a copy the browser kept cannot hide new
sets.

### Editing sets

Blank rows are left out when a set is saved. A card with only one side filled
in, or an existing card that has been emptied, stops the save with a message
naming it, so no card and none of its progress disappears by accident; the
bin button next to a card is the way to delete it. Adding lines in bulk
clears away the blank rows nobody used, and nothing else.

"Symboles mathématiques", above the cards, opens a row of signs a keyboard
lacks: powers, roots, π, comparison signs, Greek letters and the like. A
click puts the sign where the cursor was in the last field used.

### Pictures

A card side can hold a picture, with or without text. The "Image" button
under each side picks one, and a picture pasted into a side's field, or
dropped on the side, lands there too. Pictures are shrunk to 800 pixels on
their longest side before they are kept, and one still over 2 MB is refused.
They live in the browser's IndexedDB, apart from the cards, so they leave the
room localStorage has for the rest.

A side may be a picture alone, such as a photo of a dog with `de hond` as the
answer. Answers are always typed or picked as text, so a quiz or Écrire
question asks toward the side that has text, whatever direction was chosen,
and a card with pictures on both sides and no text only appears in
flashcards, review and Associer. Read aloud skips a side that is only a
picture, and screen readers announce it as an image: put a few words next to
the picture when what it shows matters.

Pictures no card uses any more are let go at start-up once they are a day
old, so a draft still open elsewhere keeps its own. "Tout effacer" removes
them all.

### Grading written answers

Answers are compared after case folding and punctuation stripping, French
quotes, dashes and hyphens included, with spaces ignored: `leau` matches
`l'eau` and `pays bas` matches `Pays-Bas`. The ligatures œ, æ and ß always
match oe, ae and ss, so `coeur` is right for `cœur`. Symbols that carry
meaning, such as `#`, `/` or `%`, are kept, and an answer made only of
punctuation, such as `?`, is compared exactly as typed.

Numbers keep their meaning. A point, comma or colon between digits still
separates them, so `314` is wrong for `3,14` while `3.14` and `3 14` are
right; a space before a group of three digits only groups them, so `1000`
matches `1 000`; and a minus sign in front of a number counts, so `5` is
wrong for `-5`.

Formulas are graded as formulas. An answer that holds an operator or a maths
sign, such as `+`, `=`, `×`, `^`, `√`, `≤` or `²`, a factorial such as `5!`,
or that is built only from single letters, digits and operators, such as
`x-y` or `f(x)`, keeps its brackets and minus signs: `2x+1` is wrong for
`2(x+1)` and `xy` is wrong for `x-y`. Only case, spaces and a decimal comma
are overlooked, and there is no typo allowance, since one sign more or less
makes another formula.

Signs a keyboard lacks are typed the usual way: `x^2` for `x²`, `H2O` for
`H₂O`, `*` for `×` or `·`, `/` for `÷`, `<=`, `>=` and `!=` for `≤`, `≥` and
`≠`, `sqrt2` or `sqrt(2)` for `√2`, `1/2` for `½`, and `pi`, `alpha`,
`theta` and the other Greek letters by name. A star between anything but two
digits may be left out, so `2*x` is `2x`.

Two tolerances are on by default and can be turned off in the settings:

- **Accents.** `ecole` is accepted for `école`, and the verdict then shows
  the exact spelling. Letters with a stroke such as ø or ł count as
  accented. With the tolerance off the answer is graded "presque" and the
  interface says accents count.
- **Typos.** One wrong letter up to eight letters, two beyond that, gives
  "presque" rather than "raté". Under five letters nothing is forgiven.
  The length that counts is the expected answer's, not what was typed.

A definition may list alternatives with ` / ` or `;`, and a parenthesised
precision is optional: `voiture / auto (familier)` accepts `voiture`, `auto`,
`auto familier` and the whole definition. A slash only separates alternatives
when a space sits next to it, so `km/h` and `24/7` are answers in their own
right and must be typed whole. In `collègue (m/f)` the slash stays inside the
optional precision: `collègue` is right, `m` alone is not.

When several cards share a prompt, such as `hola` and `buenos días` which both
mean `bonjour`, each of their answers is right: the quiz never offers one as a
wrong option, and a typed answer may be any of them. Prompts are shared when
they differ only by case or punctuation; accents count, so `ou` and `où` stay
two different prompts. In Associer, tiles that read exactly the same are
interchangeable, and whichever of them is used, the rest of the board can
still be paired.

A wrong answer can still be claimed with the "Je l'avais" button. Nothing is
written to the store until you move to the next card, so the override never
counts the card twice.

## Layout

    index.html            page shell, written in French with data-i18n hooks
    css/style.css         design tokens, components, print sheet
    data/samples.json     sample sets, loaded on demand
    js/
      app.js              bootstrap, route table, top bar wiring
      router.js           hash router with per route cleanup
      store.js            localStorage state, import and export
      srs.js              Leitner boxes and mastery levels
      study.js            widgets shared by the five modes
      chart.js            stat tiles, mastery bar, activity columns
      text.js             answer comparison and hint masking
      io.js               delimited text, downloads, share links
      images.js           card pictures, kept in IndexedDB
      util.js             identifiers, shuffling, dates
      theme.js            light, dark and system
      language.js         language choice shared by top bar and settings
      dom.js              element builder and icon set
      i18n/index.js       translation engine
      i18n/fr.js          French catalogue, the reference
      i18n/en.js          English catalogue
      i18n/nl.js          Dutch catalogue
      views/              home, set, editor, stats, settings, transfer
      modes/              flashcards, review, quiz, write, match
    tests/harness.html    smoke test, open it in a browser
    tests/harness.js      the checks it runs

## Checking it still works

Serve the directory and open <http://localhost:8080/tests/harness.html>. It
exercises the store, the Leitner ladder, answer grading, the CSV and share link
round trips, and reading CSV files in UTF-8, UTF-16 and Windows-1252. It
renders all thirteen views in every interface language, failing on any key
that no catalogue holds and on any `{placeholder}` left unfilled. It checks
that each catalogue has exactly the French keys, with the same
`{placeholders}` in every string, and that the French text built into
`index.html` matches the French catalogue and its attribute keys exist. On the home
page it checks that the daily goal figure stops at the goal, that the goal tile
opens its setting with the field focused, and that percentages follow the
interface language. It restores a full backup into an emptied store and
compares every part, imports it a second time to show that nothing doubles,
and feeds in a damaged backup that must change nothing. It also plays a full
quiz, a full write round, a match round, a review session and a flashcard pass
to their summary screens.

Your own data, including any unreadable copy set aside, is read out of
`localStorage` before the run and put back after it, or as the page closes if
the run is cut short, so the page is safe to open on a browser that already
holds real data.

## Data and privacy

Everything lives under a single `localStorage` key, `quizzer.v1`, on the
machine that runs the browser. Nothing is sent anywhere. Clearing the site
data clears the sets, so save a backup from time to time if the work matters.
Tabs of the same browser stay in step: what one saves, the others pick up at
once, so an older tab never writes stale data back. A study page or a draft
keeps showing what it had until you move on.

When the browser refuses to save, because its storage is full or blocked, a
notice stays at the top of every page until saving works again, no message
claims that a change was saved, and closing the tab asks first. A backup can
still be downloaded in the meantime. Such a
tab keeps its own changes rather than take up what other tabs save, and once
it can save again, its copy is the one written.

If the stored data is ever unreadable, it is copied aside to
`quizzer.v1.unreadable` rather than overwritten, and the app starts empty.
When the browser has no room left for that copy, nothing is saved during the
visit, so the original is never lost. "Tout effacer" removes the copy too, and
the storage figure in the settings counts it.

### Import and export

- **JSON** is a full backup: the sets with each card's progress, the pictures
  the cards use, the session history, the daily activity behind the streak
  and the activity chart, and the settings. Restoring it merges rather than
  overwrites: a set already known by its id is replaced and new ones are
  added in file order, pictures come back with their cards, sessions are
  matched by id, each day keeps the higher of the two counts, and the
  settings in the file are applied at once. Importing the same backup twice
  changes nothing. Sessions whose set is missing, entries that are not
  valid, pictures that are not images or are over 2 MB, and settings of the
  wrong type, such as `"false"` for a switch, are skipped. Older exports
  that only hold sets still import.
- **CSV** is quote aware on both sides, so a definition may contain a comma,
  a semicolon or a line break. A header row is recognised and skipped, in
  French, English or Dutch.
- **Pasted text** accepts tab, semicolon or comma as the separator: the one
  found on the most lines that hold data wins, tab first, then semicolon, then
  comma on a tie, and quoted fields are taken into account.
  A line that starts with `#`, spaces and tabs aside, is a comment and is
  ignored, and a line of spaces or tabs holds no data; quote a term that
  starts with `#` to keep it. The CSV export does this by itself.
- **CSV files** open into the same box as pasted text, so the lines can be
  checked before the set is created. The file name becomes the title unless one
  was typed. UTF-16 files with a byte order mark, such as Excel's "Unicode
  Text" export, are read as such, and a file that is not UTF-8 is read as
  Windows-1252, the encoding Excel on Windows still uses for CSV.
- **Share links** carry the cards in the URL fragment, base64url encoded, so
  the recipient needs no account and the link never reaches a server.
  Progress is deliberately left behind. Very long sets make very long links.

## Keyboard

| Key | Where | What |
|-----|-------|------|
| `Space` / `Enter` | cards, review | flip or reveal |
| `←` `→` | cards | previous, next |
| `1` `2` | review | à revoir, je savais |
| `1` to `4` | quiz | pick an answer |
| `Enter` | quiz, write | check, then continue |
| `S` | cards | mark as hard |
| `A` | cards | read aloud the side in view |

## Adding a language

1. Copy `js/i18n/fr.js` to `js/i18n/xx.js` and translate the values.
2. Import it in `js/i18n/index.js` and add it to `CATALOGS` and `LOCALES`.
3. Open `tests/harness.html`. It picks the new language up from `LOCALES`,
   renders every view in it and holds its keys and placeholders against
   French.

French stays the fallback for any key a catalogue is missing, and remains the
default for a visitor who has never chosen a language. To follow the browser
instead, change the one line in `savedLanguage` in `js/language.js` that falls
back to `DEFAULT_LOCALE`.

## Accessibility and theming

Light and dark are separate token sets, not an automatic inversion, and both
follow the OS unless the top bar toggle overrides it. Printing always uses the
light set, since paper stays white. Every text colour meets
the WCAG AA ratio of 4.5:1 against the surfaces it sits on, in both themes. Charts carry a table
view alongside the picture, tooltips reach the keyboard as well as the
pointer, and the mastery ramp was checked for lightness ordering, step
separation and contrast against both surfaces. Animations step aside under
`prefers-reduced-motion`.

The flip card is a plain button. Only the side in view is exposed to screen
readers, so the answer is not read out before the card is turned, and turning
it announces the side that comes into view. Read aloud sits under the card and
speaks whichever side is showing.

Term and definition text carries its own `lang` attribute when the set
declares one, which is what makes read aloud pronounce a Spanish card in
Spanish. The announcement of a turned card carries it too.

Moving to another page puts the focus on the page and scrolls to the top.
Rebuilding the same page, after a language change or another tab's save,
does neither: the language menu keeps the focus, so it can be stepped through
with the arrow keys, and the page stays where it was scrolled.

## Known limits

- Card sets live in one browser. There is no sync between devices; that is
  what export and share links are for.
- Leaving the editor through the top bar without saving loses the draft. The
  save button is always visible in the sticky bar, and closing the tab warns.
- Read aloud depends on the voices the browser and system provide.
- Switching language on a study page, or while a draft is in progress, does
  not rebuild that page, so no round, result or draft is lost. What is already
  on screen keeps its language and only what the page draws afterwards, such
  as the next question, comes in the new one; the top bar switches at once,
  and so does every page opened afterwards.

## License

BSD 2-Clause, copyright (c) 2026 Renaud Allard <renaud@allard.it>. See
[LICENSE](LICENSE).
