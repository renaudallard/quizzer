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
| **Écrire** | Type every answer; a card you miss returns later in the round | yes |
| **Associer** | Pair six terms with their definitions against the clock | best time only |

Flashcards deliberately change nothing: browsing a set is not self-testing, so
it would be dishonest to let it move cards up the ladder.

### Spaced repetition

Six Leitner boxes with intervals of 0, 1, 3, 7, 16 and 35 days. A correct
answer moves a card up one box, a miss sends it back to box 0 and therefore
back into today's queue. New cards are always due.

The four mastery levels shown in the interface fold those boxes together:
box 0 is "à apprendre", boxes 1 and 2 "en cours", boxes 3 and 4
"presque acquis", box 5 "maîtrisé".

### Daily goal

The home page counts today's answers against a daily goal, 20 by default.
Clicking the tile opens the settings with the goal field ready to edit; any
value from 5 to 200 is accepted. Once the goal is reached the tile stops at
the goal and its caption gives the real count.

### Grading written answers

Answers are compared after case folding, whitespace collapsing and punctuation
stripping. Two tolerances are on by default and can be turned off in the
settings:

- **Accents.** `ecole` is accepted for `école`. With the tolerance off the
  answer is graded "presque" and the interface says accents count.
- **Typos.** One wrong letter up to eight characters, two beyond that, gives
  "presque" rather than "raté". Under five characters nothing is forgiven.

A definition may list alternatives with `/` or `;`, and a parenthesised
precision is optional: `voiture / auto (familier)` accepts `voiture`, `auto`
and `auto familier`.

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
round trips, and reading CSV files in UTF-8 and in Windows-1252. It renders all
thirteen views in every interface language, asserting that no untranslated key
reaches the screen. It checks that each catalogue has exactly the French keys,
with the same `{placeholders}` in every string, and that the French text built
into `index.html` matches the French catalogue. On the home page it checks that
the daily goal figure stops at the goal, that the goal tile opens its setting
with the field focused, and that percentages follow the interface language. It restores a full backup into an emptied store and
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

If the stored JSON is ever unreadable, it is moved aside to
`quizzer.v1.unreadable` rather than overwritten, and the app starts empty.

### Import and export

- **JSON** is a full backup: the sets with each card's progress, the session
  history, the daily activity behind the streak and the activity chart, and
  the settings. Restoring it merges rather than overwrites: a set already
  known by its id is replaced and new ones are added in file order, sessions
  are matched by id, each day keeps the higher of the two counts, and the
  settings in the file are applied at once. Importing the same backup twice
  changes nothing. Sessions whose set is missing, and entries that are not
  valid, are skipped. Older exports that only hold sets still import.
- **CSV** is quote aware on both sides, so a definition may contain a comma. A
  header row is recognised and skipped, in French, English or Dutch.
- **Pasted text** accepts tab, semicolon or comma as the separator, detected
  from the first usable line. Lines starting with `#` are ignored.
- **CSV files** open into the same box as pasted text, so the lines can be
  checked before the set is created. The file name becomes the title unless one
  was typed. A file that is not UTF-8 is read as Windows-1252, the encoding
  Excel on Windows still uses for CSV.
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
follow the OS unless the top bar toggle overrides it. Charts carry a table
view alongside the picture, tooltips reach the keyboard as well as the
pointer, and the mastery ramp was checked for lightness ordering, step
separation and contrast against both surfaces. Animations step aside under
`prefers-reduced-motion`.

Term and definition text carries its own `lang` attribute when the set
declares one, which is what makes read aloud pronounce a Spanish card in
Spanish.

## Known limits

- Card sets live in one browser. There is no sync between devices; that is
  what export and share links are for.
- Leaving the editor through the top bar without saving loses the draft. The
  save button is always visible in the sticky bar, and closing the tab warns.
- Read aloud depends on the voices the browser and system provide.

## License

BSD 2-Clause, copyright (c) 2026 Renaud Allard <renaud@allard.it>. See
[LICENSE](LICENSE).
