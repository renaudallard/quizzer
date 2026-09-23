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

### Editing sets

Blank rows are left out when a set is saved. A card with only one side filled
in, or an existing card that has been emptied, stops the save with a message
naming it, so no card and none of its progress disappears by accident; the
bin button next to a card is the way to delete it.

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
when a space sits next to it, so `km/h`, `24/7` or `collègue (m/f)` are
answers in their own right and must be typed whole.

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
    data/samples.json     four sample sets, loaded on demand
    js/
      app.js              bootstrap, route table, top bar wiring
      router.js           hash router with per route cleanup
      store.js            localStorage state, import and export
      srs.js              Leitner boxes and mastery levels
      study.js            widgets shared by the five modes
      chart.js            stat tiles, mastery bar, activity columns
      text.js             answer comparison and hint masking
      io.js               delimited text, downloads, share links
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

Your own sets are read out of `localStorage` before the run and put back after
it, so the page is safe to open on a browser that already holds real data.

## Data and privacy

Everything lives under a single `localStorage` key, `quizzer.v1`, on the
machine that runs the browser. Nothing is sent anywhere. Clearing the site
data clears the sets, so save a backup from time to time if the work matters.
Tabs of the same browser stay in step: what one saves, the others pick up at
once, so an older tab never writes stale data back.

When the browser refuses to save, because its storage is full or blocked, a
notice stays at the top of every page until saving works again, and closing
the tab asks first. A backup can still be downloaded in the meantime.

If the stored data is ever unreadable, it is copied aside to
`quizzer.v1.unreadable` rather than overwritten, and the app starts empty.
When the browser has no room left for that copy, nothing is saved during the
visit, so the original is never lost. "Tout effacer" removes the copy too, and
the storage figure in the settings counts it.

### Import and export

- **JSON** is a full backup: the sets with each card's progress, the session
  history, the daily activity behind the streak and the activity chart, and
  the settings. Restoring it merges rather than overwrites: a set already
  known by its id is replaced and new ones are added in file order, sessions
  are matched by id, each day keeps the higher of the two counts, and the
  settings in the file are applied at once. Importing the same backup twice
  changes nothing. Sessions whose set is missing, and entries that are not
  valid, are skipped. Older exports that only hold sets still import.
- **CSV** is quote aware on both sides, so a definition may contain a comma,
  a semicolon or a line break. A header row is recognised and skipped, in
  French, English or Dutch.
- **Pasted text** accepts tab, semicolon or comma as the separator, detected
  from the first line that holds data, with quoted fields taken into account.
  A line whose first character is `#` is a comment and is ignored; quote a
  term that starts with `#` to keep it. The CSV export does this by itself.
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
| `A` | cards | read aloud |

## Adding a language

1. Copy `js/i18n/fr.js` to `js/i18n/xx.js` and translate the values.
2. Import it in `js/i18n/index.js` and add it to `CATALOGS` and `LOCALES`.
3. Open `tests/harness.html`. It picks the new language up from `LOCALES`,
   renders every view in it and holds its keys and placeholders against
   French.

French stays the fallback for any key a catalogue is missing, and remains the
default for a visitor who has never chosen a language. To follow the browser
instead, change the one line in `setupLocale` in `js/app.js` that picks
`DEFAULT_LOCALE`.

## Accessibility and theming

Light and dark are separate token sets, not an automatic inversion, and both
follow the OS unless the top bar toggle overrides it. Every text colour meets
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
Spanish.

## Known limits

- Card sets live in one browser. There is no sync between devices; that is
  what export and share links are for.
- Leaving the editor through the top bar without saving loses the draft. The
  save button is always visible in the sticky bar, and closing the tab warns.
- Read aloud depends on the voices the browser and system provide.
- Switching language while a draft or a round is in progress leaves that page
  as it is until you move on, so nothing is lost; the top bar and everything
  shown afterwards switch at once.

## License

BSD 2-Clause, copyright (c) 2026 Renaud Allard <renaud@allard.it>. See
[LICENSE](LICENSE).
