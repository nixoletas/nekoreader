/**
 * English — the reference dictionary.
 *
 * Every other language is typed against this one, so a key added here breaks
 * the build until both are filled in. That is on purpose: a missing string
 * should be caught by `tsc`, not by someone reading a half-translated screen.
 *
 * Placeholders are `{name}` and get filled by `fmt()`. Anything that changes
 * with a count is a `{ one, other }` pair, picked by `plural()`.
 */
export const en = {
  brand: {
    name: "Nekoreader",
    kicker: "read and mark up",
    tagline: "Your books, your notes, on every device.",
  },

  common: {
  privacy: "Privacy",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving…",
    close: "Close",
    ok: "OK",
    done: "Done",
    open: "Open",
    remove: "Remove",
    default: "Default",
    fit: "Fit",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    biggerText: "Bigger text",
    smallerText: "Smaller text",
    justAMoment: "One moment…",
    offline: "offline",
    backToLibrary: "Back to your books",
    backToReading: "Back to reading",
  },

  lang: {
    label: "Language",
    change: "Change language",
  },

  theme: {
    label: "Theme",
    system: "Device",
    light: "Light",
    dark: "Dark",
    systemLong: "Device theme",
    lightLong: "Light theme",
    darkLong: "Dark theme",
    systemLower: "device theme",
    lightLower: "light theme",
    darkLower: "dark theme",
    /** "Light theme · tap for dark theme" */
    hint: "{current} · tap for {next}",
    /** Screen readers get a sentence instead of a fragment. */
    aria: "{current}. Switch to {next}.",
  },

  time: {
    justNow: "just now",
    minutes: { one: "{n} min ago", other: "{n} min ago" },
    hours: { one: "{n} h ago", other: "{n} h ago" },
    days: { one: "{n} day ago", other: "{n} days ago" },
  },

  unit: {
    page: "page",
    chapter: "chapter",
    pageCap: "Page",
    chapterCap: "Chapter",
    pages: "Pages",
    chapters: "Chapters",
    chapterN: "Chapter {n}",
  },

  auth: {
    login: {
      title: "Your books",
      subtitle: "Sign in to pick up where you left off.",
      footer: "Your books and your notes stay in your account, on any device.",
      google: "Continue with Google",
      /** Dito na tela, e não escondido: quem não tem conta Google não entra. */
      onlyGoogle: "Google is the only way in — no password to create, and none to forget.",
    },
    errors: {
      rateLimit: "Too many tries. Wait a bit.",
      providerDisabled: "Signing in with Google isn't set up yet.",
    },
  },

  shelf: {
    signOut: "Sign out",
    noConnection: "No connection",
    loadFailed: "I couldn't load your books.",
    offlineEmpty: "No connection, and nothing saved on this device yet.",
    continueReading: "Continue reading",
    heading: "Your books",
    count: { one: "{n} book", other: "{n} books" },
    emptyTitle: "Nothing here yet",
    emptyHint: "Add your first book above — PDF or EPUB. The cover comes from the file itself.",
    /** "page 105 of 431" — assembled from unit.page / unit.chapter. */
    position: "{unit} {current}",
    positionOf: "{unit} {current} of {total}",
  },

  upload: {
    add: "Add a book",
    dragHint: "Drag a PDF or EPUB here, or ",
    tapHint: "tap to choose",
    onlyPdfEpub: "I can read PDF or EPUB files.",
    sessionExpired: "Your session expired. Sign in again.",
    reading: "Reading {file}",
    storing: "Putting it on the shelf",
    failed: "{file} failed: {message}",
  },

  card: {
    deleteTitle: "Remove “{title}” from your books?",
    deleteMessage: "The notes go with it. This can't be undone.",
    deleteConfirm: "Remove it",
    deleteFailed: "I couldn't delete it",
    deleteAria: "Delete {title}",
    coverChange: "Change the cover",
    coverChangeAria: "Change the cover of {title}",
    coverFailed: "I couldn't change the cover",
    editAria: "Edit title and author of {title}",
    edit: "Edit title and author",
    offlineRemoveTitle: "Remove the offline copy of “{title}”?",
    offlineAvailable: "Available offline",
    offlineMake: "Make available offline",
    offlineMakeAria: "Make {title} available offline",
    offlineRemoveAria: "Remove offline copy of {title}",
    offlineDownloading: "Downloading for offline reading",
    downloadFailed: "I couldn't download the book",
    pageShort: "p.",
    chapterShort: "ch.",
  },

  edit: {
    title: "Edit the book",
    bookTitle: "Title",
    author: "Author",
    authorPlaceholder: "optional",
    detect: "Read it from the file",
    detecting: "Reading the file…",
    fromMetadata: "Came from the file's own details.",
    fromCoverImage: "Read from the cover image — worth a check.",
    fromCoverText: "Read from the cover text — worth a check.",
    nothingFound: "Nothing usable in the file — you'll have to type it.",
    readFailed: "I couldn't read the file.",
    needTitle: "The book needs a name.",
  },

  reader: {
    openFailed: "I couldn't open this book",
    fileFailed: "I couldn't open the file",
    notFound: "Book not found.",
    loadFailed: "I couldn't load this book.",
    offlineNever: "No connection, and this book has never been opened on this device — open it once online first.",
    urlFailed: "No link generated.",
    editTitleHint: "{title} — tap to edit title and author",
    prevPage: "Previous page",
    nextPage: "Next page",
    prevChapter: "Previous chapter",
    nextChapter: "Next chapter",
    prevShort: "Previous",
    nextShort: "Next",
    allPages: "See all pages",
    allChapters: "See all chapters",
    seePages: "See pages",
    seeChapters: "See chapters",
    checkOriginal: "Check the original",
    exportBook: "Export the book",
    bookmarked: "Bookmarked",
    bookmark: "Bookmark",
    bookmarkedAria: "Page bookmarked",
    bookmarkAria: "Bookmark this page",
    notes: "Notes",
    goToPage: "Go to page",
    goToChapter: "Go to chapter",
    of: "of",
    howToRead: "How to read",
    modePage: "Page",
    modeText: "Text",
    modeGroup: "Reading mode",
    pageSize: "Page size · {pct}%",
    textSize: "Text size · {pct}%",
    toc: "Contents",
    /** Shown under the page, telling people what they can do with it. */
    hintEpub: "Swipe or use ← → to change chapter · select text to mark it",
    hintPage: "Select text to mark it · swipe or use ← → to turn the page",
    hintText: "Text rebuilt from the PDF, images in place — select text to mark it",
    /** Tooltip on the page counter when the book numbers itself. */
    fileNumbering: "Page {page} of {total} in the file",
    bookNumbering: "book numbering · file {page}/{total}",
    pageInBook: "Page {label} in the book · {page} in the file",
    sync: {
      offline: "No connection — reading offline",
      offlinePending: { one: "No connection · {n} change to sync", other: "No connection · {n} changes to sync" },
      syncing: { one: "Syncing {n} change…", other: "Syncing {n} changes…" },
      pendingAria: { one: "{n} change to sync", other: "{n} changes to sync" },
      saved: "Everything saved",
      savedAria: "saved",
      savingAria: "saving",
    },
    handoff: {
      title: "Pick up where you left off on {device}?",
      messagePage: "There you're on page {there} ({when}). Here you're on page {here}.",
      messageChapter: "There you're on chapter {there} ({when}). Here you're on chapter {here}.",
      goPage: "Go to page {there}",
      goChapter: "Go to chapter {there}",
      stay: "Stay here",
    },
  },

  panel: {
    tabContents: "Contents",
    tabSearch: "Search",
    tabNotes: "Notes {n}",
    tabPages: "Pages {n}",
    tabChapters: "Chapters {n}",
    readAll: "Read them all on one page",
    emptyNotes: "Nothing marked yet. Select some text on the page and pick a colour.",
    emptyBookmarksPages: "No pages saved. Use the bookmark to come back here later.",
    emptyBookmarksChapters: "No chapters saved. Use the bookmark to come back here later.",
    removeBookmark: "Remove bookmark",
  },

  toc: {
    reading: "Reading the contents…",
    scanning: "Looking for the chapters in the text… {pct}%",
    scanNote: "This PDF's bookmarks don't say what page each chapter starts on, so I'm looking for the titles. This only happens once.",
    none: "This book has no contents — not in the bookmarks, not in the headings either.",
    failed: "I couldn't read this book's contents.",
    noPage: "Couldn't work out what page this starts on",
  },

  search: {
    placeholder: "Search in the book",
    clear: "Clear",
    hint: "Type a word or a phrase to find it in the book.",
    tooShort: "Type at least two letters.",
    reading: "Opening the book…",
    /** Enquanto o livro e lido pela primeira vez. */
    scanning: "Reading the book… {pct}%",
    scanNote: "The whole book is read once, here on your device. The next search is instant.",
    count: { one: "{n} result", other: "{n} results" },
    more: "Only the first {n} are listed.",
    none: "Nothing found for “{term}”.",
    /** Livro digitalizado, sem camada de texto. */
    noText: "There's no text to search here — this book is a scan. Run OCR on a page in Text mode and it becomes searchable.",
    failed: "I couldn't search this book.",
  },

  errors: {
    title: "Something went wrong",
    body: "This screen hit an error. Trying again usually sorts it out.",
    retry: "Try again",
    toShelf: "Back to my books",
    notFoundTitle: "This page doesn't exist",
    notFoundBody: "The link may be wrong, or what it pointed to is gone.",
    home: "Go to the start",
  },

  highlight: {
    colors: {
      yellow: "Amber",
      green: "Green",
      blue: "Blue",
      pink: "Pink",
    },
    markIn: "Mark in {color}",
    deleteAria: "Delete highlight",
    noteAdd: "Write a note",
    noteEdit: "Edit note",
    notePlaceholder: "What did this passage make you think?",
    titleAdd: "Give the highlight a title",
    titleEdit: "Rename highlight",
    titleShort: "Give it a title",
    titlePlaceholder: "e.g. definition of metadata",
    noText: "(passage with no text)",
  },

  notesPage: {
    heading: "Notes",
    count: { one: "{n} passage", other: "{n} passages" },
    openFailed: "I couldn't open it",
    loadFailed: "I couldn't load the notes.",
    offlineNever: "No connection, and this book hasn't been opened on this device yet.",
    emptyTitle: "No notes yet",
    emptyHint: "Select a passage while reading and pick a colour — it shows up here.",
  },

  text: {
    openingBook: "Opening the book",
    runOcr: "Read the text (OCR)",
    runningOcr: "Reading the page…",
    ocrNote: "The first time, the language pack is downloaded; after that the reading happens entirely on this device.",
    viewAsPage: "View as a page",
    noTextLayer: "This page has no text layer — it's a scan. You can have the text read here, on your device.",
    emptyChapter: "This chapter is empty — probably just a title page or a full-page image.",
    ocrFailedWith: "I couldn't read the text: {message}",
    ocrFailed: "I couldn't read the text on this page.",
    pdfFailed: "Couldn't read the PDF.",
    epubFailed: "Couldn't read the EPUB.",
    canvasFailed: "I couldn't open this PDF.",
  },

  pagesView: {
    title: "Pages",
    titleChapters: "Chapters",
    goTo: "go to",
    opening: "Opening the book…",
    dialog: "Pages of the book",
    ofTotal: "{current} of {total}",
  },

  original: {
    title: "Original",
    page: "page {label}",
    dialog: "Page {label}, original",
    failed: "I couldn't draw this page.",
  },

  exportBook: {
    title: "Export the book",
    converting: "Rebuilding the whole book — {pct}%",
    done: "Done — {file} was saved to your downloads.",
    failed: "I couldn't convert this book.",
    epubTitle: "EPUB",
    epubDescription: "A reflowable book with images, contents and the original page numbers — opens in Kindle, Apple Books, Kobo.",
    markdownTitle: "Markdown",
    markdownDescription: "Plain text with headings, quotes, code and tables. Every page marked, ready to cite in Obsidian or Notion.",
    localOnly: "The conversion happens on this device — the book is never uploaded anywhere.",
    contents: "Contents",
    pages: "Pages",
    excerpt: "Excerpt {n}",
  },

  device: {
    unknown: "Device",
    /** "Chrome on Windows" */
    on: "{browser} on {device}",
    androidTablet: "Android tablet",
  },

  fail: {
    generic: "Something went wrong.",
    epubNoChapters: "This EPUB doesn't list any chapter to read.",
    epubInvalid: "This doesn't look like an EPUB — META-INF/container.xml is missing.",
    epubNoOpf: "The EPUB's index (OPF) isn't in the file.",
    bookDownload: "I couldn't download the book. {detail}",
    coverNotImage: "Pick an image file.",
    coverTooBig: "That image is too big (max {max}).",
    coverProcess: "I couldn't process that image.",
  },

  landing: {
    metaTitle: "Nekoreader — read PDFs and keep your notes",
    metaDescription:
      "Open a PDF or EPUB, mark the passages that matter, and pick up on any device exactly where you stopped.",
    navSignIn: "Sign in",
    navStart: "Start reading",
    heroTitle: "The definitive Book Reader",
    heroLead:
      "Convert complex PDFs and EPUBs into reflowable, markable, beautiful text. Take notes and sync between devices.",
    heroCta: "Start reading — it's free",
    heroNote: "Web & PWA — Simple, Easy.",
    heroAltWeb: "The reader on a computer, with a highlighted passage and the notes panel open",
    heroAltCelular: "The same book open on a phone",
    shelfAltWeb: "The bookshelf on a computer, with covers, reading progress and a book to continue",
    shelfAltCelular: "The same bookshelf on a phone",
    stepsTitle: "How it works",
    steps: [
      {
        title: "Add a book",
        body: "Drag a PDF or EPUB onto the page. The cover and the title come from the file itself, so your shelf looks like a shelf.",
      },
      {
        title: "Mark what matters",
        body: "Select a passage and pick a colour. Give it a title, write a note next to it. Everything stays with the book.",
      },
      {
        title: "Come back anytime",
        body: "Close the tab in the middle of a paragraph. Open your phone later and the book opens on that paragraph.",
      },
    ],
    featuresTitle: "What you get",
    features: [
      {
        title: "The page number the book prints",
        body: "A file starts counting at the cover; a book starts at chapter one. When you're on page 105 of the book, it says 105 — the number you'd tell a friend.",
      },
      {
        title: "Hard pages made readable",
        body: "Cramped columns and tiny type can be shown as plain flowing text, with the pictures kept in place. The original page is always one tap away.",
      },
      {
        title: "Scanned books too",
        body: "For a book that's only photographs of pages, it can read the text off the image so you can select and mark it. That happens on your device.",
      },
      {
        title: "Reading on the train",
        body: "Save a book to your device and it opens without a connection. Anything you mark while offline is synced the moment you're back.",
      },
      {
        title: "Take your notes with you",
        body: "Turn a book into an EPUB or a text file, page numbers included, and keep reading it wherever you like.",
      },
      {
        title: "English and Portuguese",
        body: "The app follows your browser, and you can change it whenever you want.",
      },
    ],
    trustTitle: "Plainly said",
    trust: [
      "Your books are yours. They sit in your account, private, and you can delete them whenever you want.",
      "No ads, and nothing is sold to anyone.",
      "It runs in the browser. On your phone you can add it to the home screen and it behaves like any other app.",
    ],
    ctaTitle: "Bring a book",
    ctaBody: "Sign in with Google, drag a PDF in, and see what it looks like.",
    ctaButton: "Start reading",
    footerRights: "Built for people who write in their books.",
    support: "Help me buy the domain",
    supportWhy: "Nekoreader runs on a free plan and doesn't have its own domain yet. If it's useful to you, you can chip in.",
  },
} as const;
