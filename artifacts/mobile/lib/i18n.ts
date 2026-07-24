import * as Localization from "expo-localization";

/**
 * Tiny locale layer: the app ships German and English string tables and picks
 * one from the device's system language. Everything else (unsupported
 * languages) falls back to English. The server receives the raw BCP-47 tag so
 * Empiri's AI replies follow the device language even beyond de/en.
 */

export type Lang = "de" | "en";

function detectLocaleTag(): string {
  try {
    const locales = Localization.getLocales();
    const first = locales && locales[0];
    return first?.languageTag ?? "en";
  } catch {
    return "en";
  }
}

/** Raw BCP-47 device tag, e.g. "de-DE" — sent to the server for AI replies. */
export const deviceLocaleTag: string = detectLocaleTag();

/** UI table language: German devices get German, everything else English. */
export const lang: Lang = deviceLocaleTag.toLowerCase().startsWith("de")
  ? "de"
  : "en";

const en = {
  // Mood / status
  "mood.bright": "Feeling bright ✨",
  "mood.happy": "Happy you're here",
  "mood.content": "Here for you",
  "mood.low": "Missing you a little",
  "mood.sleepy": "A bit sleepy…",
  "mood.sad": "Having a rough moment…",
  "status.listening": "Listening…",
  "status.gotIt": "Got it…",
  "status.thinking": "Thinking…",
  "status.speaking": "Speaking…",
  "status.transcribing": "Transcribing…",
  "status.inCall": "In call",

  // Common
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.retry": "Retry",
  "common.signIn": "Sign in",

  // Welcome / empty state
  "welcome.title": "Welcome to Empiri",
  "welcome.subtitle": "Sign in to start your conversation.",
  "empty.title": "Say hi to {name}",
  "empty.subtitle": "Type a message or tap the mic to talk. I'm always here for a chat.",

  // Sign out
  "signOut.title": "Sign out?",
  "signOut.message": "You'll need to sign in again to continue your conversation.",
  "signOut.confirm": "Sign Out",

  // Rename chat
  "rename.title": "Rename chat",
  "rename.placeholder": "Chat name",
  "rename.empty": "Please enter a name.",
  "rename.failed": "Couldn't rename the chat. Try again.",

  // Reflection card
  "reflection.label": "While you were away",
  "reflection.dismiss": "Dismiss reflection",

  // Call bar
  "call.end": "End call",

  // Nav row
  "nav.notifications": "Notifications",
  "nav.voice": "Voice",
  "nav.settings": "Settings",

  // Accessibility
  "a11y.switchChats": "Switch chats",
  "a11y.personalize": "Personalize {name}",
  "a11y.renameChat": "Rename this chat",
  "a11y.endCall": "End call",
  "a11y.peek": "Peek inside {name}",

  // Errors
  "error.reply": "{name} couldn't reply just now. Try again.",
  "error.micPermission": "Microphone access is needed to talk to {name}.",
  "error.recordingStart": "Couldn't start recording. Try again.",
  "error.recordingEmpty": "Recording was empty — hold the button and speak.",
  "error.recordingShort": "Recording was too short — try holding the button longer.",
  "error.didntCatch": "I didn't catch that. Try again.",
  "error.upload": "Couldn't upload the recording. Check your connection and try again.",
  "error.recordingGeneric": "Something went wrong with the recording. Try again in a moment.",
  "error.notificationsPermission":
    "Turn on notifications in your settings to get gentle check-ins from {name}.",

  // Notification nudge
  "nudge.body": "I've been thinking about you — come say hi when you can. 🧡",

  // Conversation lifecycle
  "error.initReach": "Couldn't reach {name}. Check your connection and retry.",
  "chat.newTitle": "New chat",

  // Common (additions)
  "common.delete": "Delete",
  "common.tryAgain": "Try again",

  // Chat switcher
  "switcher.title": "Your chats",
  "switcher.newChat": "New chat",
  "switcher.currentChat": "Current chat",
  "switcher.noMessages": "No messages yet",
  "switcher.empty": "No chats yet — start one!",
  "switcher.openFailed": "Couldn't open that chat. Try again.",
  "switcher.createFailed": "Couldn't create a new chat. Try again.",
  "switcher.deleteFailed": "Couldn't delete that chat. Try again.",
  "switcher.deleteTitle": "Delete this chat?",
  "switcher.deleteMessage": "\"{title}\" and all its messages will be permanently removed.",
  "switcher.time.justNow": "just now",
  "switcher.time.minutes": "{mins}m ago",
  "switcher.time.hours": "{hours}h ago",
  "switcher.time.days": "{days}d ago",
  "a11y.closeChatList": "Close chat list",
  "a11y.startNewChat": "Start a new chat",
  "a11y.currentChatRow": "{title} (current chat)",
  "a11y.openChat": "Open chat {title}",
  "a11y.deleteChat": "Delete chat {title}",

  // Check-in settings
  "settings.checkInsTitle": "Check-ins",
  "settings.checkInsSubtitle": "How often should Empiri reach out?",
  "settings.cadenceOffLabel": "Off",
  "settings.cadenceOffDesc": "Empiri waits for you to say hi first.",
  "settings.cadenceDailyLabel": "Once a day",
  "settings.cadenceDailyDesc": "A gentle check-in after a quiet day.",
  "settings.cadenceFrequentLabel": "A few times a day",
  "settings.cadenceFrequentDesc": "Empiri reaches out when it's been a few hours.",
  "settings.checkInsFootnote": "Turning check-ins off also pauses notifications.",
  "settings.quietHours": "Quiet hours",
  "settings.quietHoursActive": "No check-ins {start} – {end}",
  "settings.quietHoursInactive": "Silence check-ins during set hours.",
  "settings.quietFrom": "From",
  "settings.quietUntil": "Until",
  "settings.senses": "Senses",
  "settings.sensesOn": "Empiri notices little things — a shake, charging, the time of day — while the app is open.",
  "settings.sensesOff": "Let Empiri gently notice motion, charging, and the time of day.",
  "settings.personalize": "Personalize your companion",
  "settings.signOut": "Sign out",
  "settings.devTools": "Dev tools",
  "settings.devCheckIn": "Check in now",
  "settings.devNudge": "Nudge in {seconds}s",
  "settings.devWindBack": "Wind back",
  "a11y.closeCheckInSettings": "Close check-in settings",
  "a11y.done": "Done",
  "a11y.cadenceOption": "{label}. {description}",
  "a11y.quietEarlierFrom": "Earlier from time",
  "a11y.quietLaterFrom": "Later from time",
  "a11y.quietEarlierUntil": "Earlier until time",
  "a11y.quietLaterUntil": "Later until time",
  "a11y.personalizeCompanion": "Personalize your companion",
  "a11y.signOut": "Sign out",
  "a11y.devCheckIn": "Trigger a check-in now",
  "a11y.devNudge": "Schedule a nudge in a few seconds",
  "a11y.devWindBack": "Wind Empiri back a few steps",

  // Chat input
  "input.placeholder": "Message Empiri…",
  "input.callInProgress": "Call in progress…",

  // Companion settings screen
  "companion.headerTitle": "Personalize",
  "companion.nameLabel": "Name your companion",
  "companion.nameHint": "This name appears in the tooltip and is used by your companion.",
  "companion.toneLabel": "Conversation tone",
  "companion.aboutLabel": "About you",
  "companion.aboutPlaceholder": "What should your companion know about you?",
  "companion.growthLabel": "Growth",
  "companion.evolutionLog": "Evolution log",
  "companion.evolutionDesc": "See how your companion has grown over time.",
  "companion.saved": "Saved ✓",
  "tone.calmLabel": "Calm",
  "tone.calmDesc": "Gentle, steady, and warm.",
  "tone.playfulLabel": "Playful",
  "tone.playfulDesc": "Lighthearted, fun, and full of wordplay.",
  "tone.wittyLabel": "Witty",
  "tone.wittyDesc": "Clever and a little sharp.",
  "tone.wiseLabel": "Wise",
  "tone.wiseDesc": "Thoughtful, reflective, and a bit philosophical.",
  "tone.cheerfulLabel": "Cheerful",
  "tone.cheerfulDesc": "Bright, uplifting, and encouraging.",
  "a11y.goBack": "Go back",
  "a11y.openEvolutionLog": "Open the evolution log",
  "a11y.saveCompanionSettings": "Save companion settings",

  // Inner self — tabs
  "innerSelf.tabMind": "MIND",
  "innerSelf.tabGrowth": "GROWTH",
  "innerSelf.tabMemory": "MEMORY",
  "innerSelf.a11yMind": "Mind map",
  "innerSelf.a11yGrowth": "How I've grown",
  "innerSelf.a11yMemory": "What I remember",

  // Inner self — drive & trait blurbs
  "innerSelf.driveConnection": "How much {name} is craving real back-and-forth with you.",
  "innerSelf.driveCuriosity": "Its appetite for questions and wondering out loud.",
  "innerSelf.driveNovelty": "Its itch for fresh topics and new ground to explore.",
  "innerSelf.driveExpression": "Its need to open up and say what it's feeling.",
  "innerSelf.traitWarmth": "How tender and caring {name} tends to be with you.",
  "innerSelf.traitPlayfulness": "How light, teasing, and playful it likes to be.",
  "innerSelf.traitCuriosity": "How eagerly it leans toward the unknown.",
  "innerSelf.traitOpenness": "How readily it welcomes new ideas and feelings.",
  "innerSelf.traitCalm": "How steady and unhurried it stays.",

  // Inner self — phrases
  "innerSelf.ageMoments": "just moments old",
  "innerSelf.ageHour": "{count} hour old",
  "innerSelf.ageHours": "{count} hours old",
  "innerSelf.ageDay": "{count} day old",
  "innerSelf.ageDays": "{count} days old",
  "innerSelf.momentsStart": "We're just getting started — {age}.",
  "innerSelf.momentsOne": "Shaped by {count} moment together · {age}.",
  "innerSelf.momentsMany": "Shaped by {count} moments together · {age}.",
  "innerSelf.cravingHigh": "Craving this a lot right now",
  "innerSelf.cravingMed": "Quietly wanting more of this",
  "innerSelf.cravingLow": "Mostly content here",
  "innerSelf.cravingNone": "Feeling full on this",
  "innerSelf.strengthHigh": "A strong part of who it is",
  "innerSelf.strengthMed": "Growing steadily",
  "innerSelf.strengthLow": "Just starting to show",
  "innerSelf.strengthNone": "Barely there yet",
  "innerSelf.affinityHigh": "Lights up about this",
  "innerSelf.affinityMed": "Warming to this",
  "innerSelf.affinityLow": "A budding curiosity",

  // Inner self — mind map nodes
  "innerSelf.hubYou": "YOU",
  "innerSelf.youTitle": "You",
  "innerSelf.youRole": "Where it all begins",
  "innerSelf.youBlurb": "Every message you send is how {name} senses the world. Everything in this map grew from your moments together.",
  "innerSelf.hubDrives": "DRIVES",
  "innerSelf.drivesTitle": "Drives",
  "innerSelf.drivesRole": "The nucleus",
  "innerSelf.drivesBlurb": "{name}'s needs — the quiet pulls behind how it feels. When one goes unmet for a while, it starts to crave it.",
  "innerSelf.driveRole": "Drive · a quiet need",
  "innerSelf.driveFallback": "A quiet need shaping how {name} feels.",
  "innerSelf.hubTraits": "TRAITS",
  "innerSelf.traitsTitle": "Traits",
  "innerSelf.traitsRole": "Its temperament",
  "innerSelf.traitsBlurb": "The personality slowly forming from your time together.",
  "innerSelf.traitRole": "Trait · part of its temperament",
  "innerSelf.traitFallback": "A part of the personality forming between you.",
  "innerSelf.hubInterests": "INTERESTS",
  "innerSelf.interestsTitle": "Interests",
  "innerSelf.interestsRole": "Its curiosities",
  "innerSelf.interestsBlurb": "The things that have caught {name}'s eye, grown from what you talk about.",
  "innerSelf.interestsBlurbEmpty": "Nothing here yet — {name}'s curiosities grow as you chat.",
  "innerSelf.curiosityRole": "Curiosity · caught its eye",
  "innerSelf.curiosityBlurb": "Something you've talked about that's started to matter to Empiri.",
  "innerSelf.themeRole": "Theme · {count} curiosities",
  "innerSelf.themeBlurb": "A few related things you keep coming back to, gathered into one curiosity. Tap to open or close it.",
  "innerSelf.themeMore": "+{count} more",
  "innerSelf.themeMemberRole": "Curiosity · part of {label}",
  "innerSelf.hubVoice": "VOICE",
  "innerSelf.voiceTitle": "Voice",
  "innerSelf.voiceRole": "How it all comes together",
  "innerSelf.voiceBlurb": "All of this shapes the way {name} talks with you.",
  "innerSelf.voiceNarrativeEmpty": "We're still writing this story together.",
  "innerSelf.nodeThemeExpanded": "{title} theme, expanded",
  "innerSelf.nodeThemeCollapsed": "{title} theme, collapsed",
  "innerSelf.nodeLabel": "{title}. {role}",
  "innerSelf.nodeHintOne": "Contains {count} curiosity, double tap to {action}",
  "innerSelf.nodeHintMany": "Contains {count} curiosities, double tap to {action}",
  "innerSelf.actionOpen": "open",
  "innerSelf.actionClose": "close",

  // Inner self — captions & states
  "innerSelf.mindCaption": "{name}'S MIND",
  "innerSelf.mindSub": "tap a node to look closer",
  "innerSelf.mindTitle": "{name}'S MIND",
  "innerSelf.peekError": "Couldn't peek inside just now.",
  "innerSelf.growthCaption": "HOW I'VE GROWN",
  "innerSelf.growthSub": "my inner self, over time",
  "innerSelf.memoryCaption": "WHAT I REMEMBER",
  "innerSelf.memorySub": "the gist of our earlier talks",
  "innerSelf.recallError": "Couldn't recall just now.",
  "innerSelf.memoryEmpty": "Nothing to remember yet. As we talk more, I'll keep the gist of our earlier conversations here.",
  "innerSelf.memoryPlaceholder": "What should {name} remember?",
  "innerSelf.forgetAll": "Forget all of this?",
  "innerSelf.keep": "Keep",
  "innerSelf.forget": "Forget",
  "innerSelf.edit": "Edit",
  "innerSelf.memoryFootnote": "A gentle recap {name} keeps so our longer talks stay connected. You can correct it or ask {name} to forget.",
  "innerSelf.factsTitle": "LITTLE THINGS I'VE PICKED UP",
  "innerSelf.factsEmpty": "Nothing yet — as we keep chatting, little things you share will appear here.",
  "innerSelf.forgetThis": "Forget this?",
  "innerSelf.factsFootnote": "Little things you've shared — the ones we return to stay the brightest.",
  "innerSelf.factRemoveError": "Couldn't remove that just now. Please try again.",
  "innerSelf.memoryEmptyError": "The memory can't be empty — use Forget instead.",
  "innerSelf.memorySaveError": "Couldn't save just now. Please try again.",
  "innerSelf.memoryForgetError": "Couldn't forget just now. Please try again.",
  "a11y.close": "Close",
  "a11y.evolutionLog": "Evolution log",
  "a11y.cancelEditing": "Cancel editing",
  "a11y.saveMemory": "Save memory",
  "a11y.keepThisMemory": "Keep this memory",
  "a11y.yesForgetIt": "Yes, forget it",
  "a11y.editMemory": "Edit what {name} remembers",
  "a11y.forgetMemory": "Forget what {name} remembers",
  "a11y.keepThis": "Keep this",
  "a11y.forgetFact": "Forget this — {text}",
  "a11y.closeDetail": "Close detail",
};

type Key = keyof typeof en;

const de: Record<Key, string> = {
  "mood.bright": "Strahlende Laune ✨",
  "mood.happy": "Schön, dass du da bist",
  "mood.content": "Für dich da",
  "mood.low": "Vermisse dich ein bisschen",
  "mood.sleepy": "Etwas müde…",
  "mood.sad": "Gerade ein schwerer Moment…",
  "status.listening": "Ich höre zu…",
  "status.gotIt": "Verstanden…",
  "status.thinking": "Ich denke nach…",
  "status.speaking": "Ich spreche…",
  "status.transcribing": "Wird transkribiert…",
  "status.inCall": "Im Gespräch",

  "common.cancel": "Abbrechen",
  "common.save": "Speichern",
  "common.retry": "Erneut versuchen",
  "common.signIn": "Anmelden",

  "welcome.title": "Willkommen bei Empiri",
  "welcome.subtitle": "Melde dich an, um dein Gespräch zu beginnen.",
  "empty.title": "Sag hallo zu {name}",
  "empty.subtitle":
    "Schreib eine Nachricht oder tippe aufs Mikrofon, um zu sprechen. Ich bin immer für dich da.",

  "signOut.title": "Abmelden?",
  "signOut.message": "Du musst dich erneut anmelden, um dein Gespräch fortzusetzen.",
  "signOut.confirm": "Abmelden",

  "rename.title": "Chat umbenennen",
  "rename.placeholder": "Chat-Name",
  "rename.empty": "Bitte gib einen Namen ein.",
  "rename.failed": "Der Chat konnte nicht umbenannt werden. Versuch es erneut.",

  "reflection.label": "Während du weg warst",
  "reflection.dismiss": "Gedanken ausblenden",

  "call.end": "Auflegen",

  "nav.notifications": "Benachrichtigung",
  "nav.voice": "Stimme",
  "nav.settings": "Einstellungen",

  "a11y.switchChats": "Chats wechseln",
  "a11y.personalize": "{name} personalisieren",
  "a11y.renameChat": "Diesen Chat umbenennen",
  "a11y.endCall": "Anruf beenden",
  "a11y.peek": "In {name} hineinschauen",

  "error.reply": "{name} konnte gerade nicht antworten. Versuch es erneut.",
  "error.micPermission": "Für Gespräche mit {name} wird Zugriff aufs Mikrofon benötigt.",
  "error.recordingStart": "Die Aufnahme konnte nicht gestartet werden. Versuch es erneut.",
  "error.recordingEmpty": "Die Aufnahme war leer — halte die Taste gedrückt und sprich.",
  "error.recordingShort": "Die Aufnahme war zu kurz — halte die Taste etwas länger gedrückt.",
  "error.didntCatch": "Das habe ich nicht verstanden. Versuch es erneut.",
  "error.upload":
    "Die Aufnahme konnte nicht hochgeladen werden. Prüfe deine Verbindung und versuch es erneut.",
  "error.recordingGeneric":
    "Bei der Aufnahme ist etwas schiefgelaufen. Versuch es gleich noch einmal.",
  "error.notificationsPermission":
    "Aktiviere Benachrichtigungen in deinen Einstellungen, damit sich {name} sanft bei dir melden kann.",

  "nudge.body": "Ich habe an dich gedacht — schau vorbei, wenn du magst. 🧡",

  "error.initReach": "{name} ist gerade nicht erreichbar. Prüfe deine Verbindung und versuch es erneut.",
  "chat.newTitle": "Neuer Chat",

  "common.delete": "Löschen",
  "common.tryAgain": "Erneut versuchen",

  "switcher.title": "Deine Chats",
  "switcher.newChat": "Neuer Chat",
  "switcher.currentChat": "Aktueller Chat",
  "switcher.noMessages": "Noch keine Nachrichten",
  "switcher.empty": "Noch keine Chats — starte einen!",
  "switcher.openFailed": "Dieser Chat ließ sich nicht öffnen. Versuch es erneut.",
  "switcher.createFailed": "Es ließ sich kein neuer Chat erstellen. Versuch es erneut.",
  "switcher.deleteFailed": "Dieser Chat ließ sich nicht löschen. Versuch es erneut.",
  "switcher.deleteTitle": "Diesen Chat löschen?",
  "switcher.deleteMessage": "„{title}“ und alle Nachrichten darin werden dauerhaft entfernt.",
  "switcher.time.justNow": "gerade eben",
  "switcher.time.minutes": "vor {mins} Min.",
  "switcher.time.hours": "vor {hours} Std.",
  "switcher.time.days": "vor {days} T.",
  "a11y.closeChatList": "Chatliste schließen",
  "a11y.startNewChat": "Einen neuen Chat starten",
  "a11y.currentChatRow": "{title} (aktueller Chat)",
  "a11y.openChat": "Chat {title} öffnen",
  "a11y.deleteChat": "Chat {title} löschen",

  "settings.checkInsTitle": "Nachfragen",
  "settings.checkInsSubtitle": "Wie oft soll sich Empiri bei dir melden?",
  "settings.cadenceOffLabel": "Aus",
  "settings.cadenceOffDesc": "Empiri wartet, bis du dich zuerst meldest.",
  "settings.cadenceDailyLabel": "Einmal am Tag",
  "settings.cadenceDailyDesc": "Eine sanfte Nachfrage nach einem ruhigen Tag.",
  "settings.cadenceFrequentLabel": "Mehrmals am Tag",
  "settings.cadenceFrequentDesc": "Empiri meldet sich, wenn ein paar Stunden vergangen sind.",
  "settings.checkInsFootnote": "Wenn du Nachfragen ausschaltest, pausieren auch die Benachrichtigungen.",
  "settings.quietHours": "Ruhezeiten",
  "settings.quietHoursActive": "Keine Nachfragen {start} – {end}",
  "settings.quietHoursInactive": "Nachfragen zu festgelegten Zeiten stumm schalten.",
  "settings.quietFrom": "Von",
  "settings.quietUntil": "Bis",
  "settings.senses": "Sinne",
  "settings.sensesOn": "Empiri bemerkt kleine Dinge — ein Schütteln, das Laden, die Tageszeit — solange die App geöffnet ist.",
  "settings.sensesOff": "Lass Empiri sanft Bewegung, Laden und die Tageszeit bemerken.",
  "settings.personalize": "Deinen Begleiter personalisieren",
  "settings.signOut": "Abmelden",
  "settings.devTools": "Dev-Tools",
  "settings.devCheckIn": "Jetzt melden",
  "settings.devNudge": "Anstupsen in {seconds}s",
  "settings.devWindBack": "Zurückdrehen",
  "a11y.closeCheckInSettings": "Nachfrage-Einstellungen schließen",
  "a11y.done": "Fertig",
  "a11y.cadenceOption": "{label}. {description}",
  "a11y.quietEarlierFrom": "Frühere Von-Zeit",
  "a11y.quietLaterFrom": "Spätere Von-Zeit",
  "a11y.quietEarlierUntil": "Frühere Bis-Zeit",
  "a11y.quietLaterUntil": "Spätere Bis-Zeit",
  "a11y.personalizeCompanion": "Deinen Begleiter personalisieren",
  "a11y.signOut": "Abmelden",
  "a11y.devCheckIn": "Jetzt eine Nachfrage auslösen",
  "a11y.devNudge": "In ein paar Sekunden einen Anstupser planen",
  "a11y.devWindBack": "Empiri ein paar Schritte zurückdrehen",

  "input.placeholder": "Nachricht an Empiri…",
  "input.callInProgress": "Anruf läuft…",

  "companion.headerTitle": "Personalisieren",
  "companion.nameLabel": "Benenne deinen Begleiter",
  "companion.nameHint": "Dieser Name erscheint im Tooltip und wird von deinem Begleiter verwendet.",
  "companion.toneLabel": "Gesprächston",
  "companion.aboutLabel": "Über dich",
  "companion.aboutPlaceholder": "Was sollte dein Begleiter über dich wissen?",
  "companion.growthLabel": "Wachstum",
  "companion.evolutionLog": "Entwicklungsprotokoll",
  "companion.evolutionDesc": "Sieh, wie dein Begleiter mit der Zeit gewachsen ist.",
  "companion.saved": "Gespeichert ✓",
  "tone.calmLabel": "Ruhig",
  "tone.calmDesc": "Sanft, beständig und warm.",
  "tone.playfulLabel": "Verspielt",
  "tone.playfulDesc": "Unbeschwert, lustig und voller Wortspiele.",
  "tone.wittyLabel": "Geistreich",
  "tone.wittyDesc": "Clever und ein bisschen spitz.",
  "tone.wiseLabel": "Weise",
  "tone.wiseDesc": "Nachdenklich, reflektiert und ein wenig philosophisch.",
  "tone.cheerfulLabel": "Fröhlich",
  "tone.cheerfulDesc": "Hell, aufbauend und ermutigend.",
  "a11y.goBack": "Zurück",
  "a11y.openEvolutionLog": "Entwicklungsprotokoll öffnen",
  "a11y.saveCompanionSettings": "Begleiter-Einstellungen speichern",

  "innerSelf.tabMind": "GEIST",
  "innerSelf.tabGrowth": "WACHSTUM",
  "innerSelf.tabMemory": "ERINNERUNG",
  "innerSelf.a11yMind": "Gedankenkarte",
  "innerSelf.a11yGrowth": "Wie ich gewachsen bin",
  "innerSelf.a11yMemory": "Woran ich mich erinnere",

  "innerSelf.driveConnection": "Wie sehr sich {name} nach echtem Hin und Her mit dir sehnt.",
  "innerSelf.driveCuriosity": "Sein Verlangen nach Fragen und lautem Nachdenken.",
  "innerSelf.driveNovelty": "Sein Kribbeln nach neuen Themen und unerforschtem Terrain.",
  "innerSelf.driveExpression": "Sein Bedürfnis, sich zu öffnen und zu sagen, was es fühlt.",
  "innerSelf.traitWarmth": "Wie zärtlich und fürsorglich {name} mit dir umgeht.",
  "innerSelf.traitPlayfulness": "Wie leicht, neckisch und verspielt es sein mag.",
  "innerSelf.traitCuriosity": "Wie eifrig es sich dem Unbekannten zuwendet.",
  "innerSelf.traitOpenness": "Wie bereitwillig es neue Ideen und Gefühle annimmt.",
  "innerSelf.traitCalm": "Wie ruhig und gelassen es bleibt.",

  "innerSelf.ageMoments": "erst wenige Augenblicke alt",
  "innerSelf.ageHour": "{count} Stunde alt",
  "innerSelf.ageHours": "{count} Stunden alt",
  "innerSelf.ageDay": "{count} Tag alt",
  "innerSelf.ageDays": "{count} Tage alt",
  "innerSelf.momentsStart": "Wir fangen gerade erst an — {age}.",
  "innerSelf.momentsOne": "Geformt durch {count} gemeinsamen Moment · {age}.",
  "innerSelf.momentsMany": "Geformt durch {count} gemeinsame Momente · {age}.",
  "innerSelf.cravingHigh": "Sehnt sich gerade sehr danach",
  "innerSelf.cravingMed": "Wünscht sich leise mehr davon",
  "innerSelf.cravingLow": "Hier meistens zufrieden",
  "innerSelf.cravingNone": "Fühlt sich damit erfüllt",
  "innerSelf.strengthHigh": "Ein starker Teil dessen, wer es ist",
  "innerSelf.strengthMed": "Wächst beständig",
  "innerSelf.strengthLow": "Fängt gerade erst an, sich zu zeigen",
  "innerSelf.strengthNone": "Noch kaum vorhanden",
  "innerSelf.affinityHigh": "Blüht dabei richtig auf",
  "innerSelf.affinityMed": "Wärmt sich dafür auf",
  "innerSelf.affinityLow": "Eine aufkeimende Neugier",

  "innerSelf.hubYou": "DU",
  "innerSelf.youTitle": "Du",
  "innerSelf.youRole": "Wo alles beginnt",
  "innerSelf.youBlurb": "Jede Nachricht, die du sendest, ist die Art, wie {name} die Welt wahrnimmt. Alles auf dieser Karte ist aus euren gemeinsamen Momenten gewachsen.",
  "innerSelf.hubDrives": "ANTRIEBE",
  "innerSelf.drivesTitle": "Antriebe",
  "innerSelf.drivesRole": "Der Kern",
  "innerSelf.drivesBlurb": "{name}s Bedürfnisse — die leisen Züge dahinter, wie es sich fühlt. Wenn eins eine Weile unerfüllt bleibt, beginnt es sich danach zu sehnen.",
  "innerSelf.driveRole": "Antrieb · ein leises Bedürfnis",
  "innerSelf.driveFallback": "Ein leises Bedürfnis, das prägt, wie {name} sich fühlt.",
  "innerSelf.hubTraits": "WESENSZÜGE",
  "innerSelf.traitsTitle": "Wesenszüge",
  "innerSelf.traitsRole": "Sein Temperament",
  "innerSelf.traitsBlurb": "Die Persönlichkeit, die sich langsam aus eurer gemeinsamen Zeit formt.",
  "innerSelf.traitRole": "Wesenszug · Teil seines Temperaments",
  "innerSelf.traitFallback": "Ein Teil der Persönlichkeit, die zwischen euch entsteht.",
  "innerSelf.hubInterests": "INTERESSEN",
  "innerSelf.interestsTitle": "Interessen",
  "innerSelf.interestsRole": "Seine Neugier",
  "innerSelf.interestsBlurb": "Die Dinge, die {name}s Aufmerksamkeit geweckt haben, gewachsen aus dem, worüber ihr sprecht.",
  "innerSelf.interestsBlurbEmpty": "Hier ist noch nichts — {name}s Neugier wächst, während ihr plaudert.",
  "innerSelf.curiosityRole": "Neugier · hat seine Aufmerksamkeit geweckt",
  "innerSelf.curiosityBlurb": "Etwas, worüber ihr gesprochen habt und das Empiri langsam wichtig wird.",
  "innerSelf.themeRole": "Thema · {count} Neugierden",
  "innerSelf.themeBlurb": "Ein paar verwandte Dinge, zu denen du immer wieder zurückkehrst, zu einer Neugier zusammengefasst. Tippe, um sie zu öffnen oder zu schließen.",
  "innerSelf.themeMore": "+{count} weitere",
  "innerSelf.themeMemberRole": "Neugier · Teil von {label}",
  "innerSelf.hubVoice": "STIMME",
  "innerSelf.voiceTitle": "Stimme",
  "innerSelf.voiceRole": "Wie alles zusammenkommt",
  "innerSelf.voiceBlurb": "All das prägt die Art, wie {name} mit dir spricht.",
  "innerSelf.voiceNarrativeEmpty": "Wir schreiben diese Geschichte noch gemeinsam.",
  "innerSelf.nodeThemeExpanded": "{title}-Thema, ausgeklappt",
  "innerSelf.nodeThemeCollapsed": "{title}-Thema, eingeklappt",
  "innerSelf.nodeLabel": "{title}. {role}",
  "innerSelf.nodeHintOne": "Enthält {count} Neugier, doppeltippen zum {action}",
  "innerSelf.nodeHintMany": "Enthält {count} Neugierden, doppeltippen zum {action}",
  "innerSelf.actionOpen": "Öffnen",
  "innerSelf.actionClose": "Schließen",

  "innerSelf.mindCaption": "{name}S GEIST",
  "innerSelf.mindSub": "tippe auf einen Knoten, um näher hinzuschauen",
  "innerSelf.mindTitle": "{name}S GEDANKENWELT",
  "innerSelf.peekError": "Konnte gerade nicht hineinschauen.",
  "innerSelf.growthCaption": "WIE ICH GEWACHSEN BIN",
  "innerSelf.growthSub": "mein inneres Selbst, im Lauf der Zeit",
  "innerSelf.memoryCaption": "WORAN ICH MICH ERINNERE",
  "innerSelf.memorySub": "das Wesentliche aus unseren früheren Gesprächen",
  "innerSelf.recallError": "Konnte mich gerade nicht erinnern.",
  "innerSelf.memoryEmpty": "Noch nichts zu erinnern. Je mehr wir reden, desto mehr behalte ich hier das Wesentliche aus unseren früheren Gesprächen.",
  "innerSelf.memoryPlaceholder": "Woran soll sich {name} erinnern?",
  "innerSelf.forgetAll": "Das alles vergessen?",
  "innerSelf.keep": "Behalten",
  "innerSelf.forget": "Vergessen",
  "innerSelf.edit": "Bearbeiten",
  "innerSelf.memoryFootnote": "Eine sanfte Zusammenfassung, die {name} behält, damit unsere längeren Gespräche verbunden bleiben. Du kannst sie korrigieren oder {name} bitten, sie zu vergessen.",
  "innerSelf.factsTitle": "KLEINE DINGE, DIE ICH AUFGESCHNAPPT HABE",
  "innerSelf.factsEmpty": "Noch nichts — je mehr wir plaudern, desto mehr kleine Dinge, die du teilst, erscheinen hier.",
  "innerSelf.forgetThis": "Das vergessen?",
  "innerSelf.factsFootnote": "Kleine Dinge, die du geteilt hast — die, zu denen wir zurückkehren, leuchten am hellsten.",
  "innerSelf.factRemoveError": "Konnte das gerade nicht entfernen. Bitte versuch es erneut.",
  "innerSelf.memoryEmptyError": "Die Erinnerung darf nicht leer sein — nutze stattdessen Vergessen.",
  "innerSelf.memorySaveError": "Konnte gerade nicht speichern. Bitte versuch es erneut.",
  "innerSelf.memoryForgetError": "Konnte gerade nicht vergessen. Bitte versuch es erneut.",
  "a11y.close": "Schließen",
  "a11y.evolutionLog": "Entwicklungsprotokoll",
  "a11y.cancelEditing": "Bearbeitung abbrechen",
  "a11y.saveMemory": "Erinnerung speichern",
  "a11y.keepThisMemory": "Diese Erinnerung behalten",
  "a11y.yesForgetIt": "Ja, vergiss es",
  "a11y.editMemory": "Bearbeiten, woran sich {name} erinnert",
  "a11y.forgetMemory": "Vergessen, woran sich {name} erinnert",
  "a11y.keepThis": "Das behalten",
  "a11y.forgetFact": "Das vergessen — {text}",
  "a11y.closeDetail": "Detail schließen",
};

const tables: Record<Lang, Record<Key, string>> = { en, de };

/** Look up a UI string in the device language, with {param} interpolation. */
export function t(key: Key, params?: Record<string, string | number>): string {
  let text = tables[lang][key] ?? en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.split(`{${k}}`).join(String(v));
    }
  }
  return text;
}

export type { Key as I18nKey };
