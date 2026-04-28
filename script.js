// Room names shown in the breadcrumb trail
const roomNames = ["Entrance", "Doors", "Fork", "Crown", "Echoes", "Gate"];

// Global timer budget in seconds
const TOTAL_TIME = 120;
// How long each entrance clue stays visible (ms) before fading
const CLUE_TOTAL_MS = 16000;
// Duration of the CSS fade-out animation (ms); must match --clue-fade-ms in CSS
const CLUE_FADE_MS = 1400;

// Each entry is one possible run phrase: exact text, partial-match anchors, and wrong decoys
const phrasePools = [
  {
    text: "The hurried hand grasps only shadows.",
    anchors: ["hurried", "hand", "shadows"],
    decoys: [
      "The hurried mind grasps only shadows.",
      "The hurried hand holds only darkness.",
      "The patient hand grasps only shadows."
    ]
  },
  {
    text: "A restless eye mistakes glitter for truth.",
    anchors: ["restless", "glitter", "truth"],
    decoys: [
      "A restless eye mistakes gold for truth.",
      "A restless hand mistakes glitter for truth.",
      "A restless eye mistakes glitter for safety."
    ]
  },
  {
    text: "Quick fingers lose what patient memory keeps.",
    anchors: ["quick", "memory", "keeps"],
    decoys: [
      "Quick fingers lose what patient caution keeps.",
      "Quick hands lose what patient memory keeps.",
      "Quick fingers find what patient memory keeps."
    ]
  },
  {
    text: "What wakes first is not what opens last.",
    anchors: ["wakes", "opens", "last"],
    decoys: [
      "What wakes first is not what closes last.",
      "What wakes early is not what opens last.",
      "What wakes first is what opens last."
    ]
  }
];

// Fixed set of 4 glyphs — same symbols every run, but meaning/order is reshuffled
const glyphPool = [
  "𓂀Δ𓂀",
  "Ψ○Ψ",
  "Ω≋Ω",
  "𐤀◈𐤀"
];

// Shape-based hint word for each glyph, used in the crown clue (never shown in the entrance)
const glyphHintWords = {
  "𓂀Δ𓂀": "eye",
  "Ψ○Ψ": "trident",
  "Ω≋Ω": "wave",
  "𐤀◈𐤀": "diamond"
};

// Display labels for the four glyph meanings
const meaningLabels = {
  truth: "Truth",
  danger: "Danger",
  hidden: "Hidden Way",
  final: "Final Key"
};

// Prose strings for each compass direction used in statue clues and hints
const directionMeta = {
  east: { wall: "eastern wall", cue: "toward the dawn" },
  north: { wall: "northern wall", cue: "toward the northern stars" },
  south: { wall: "southern wall", cue: "toward the heat of the south" },
  west: { wall: "western wall", cue: "toward the setting sun" }
};

// The four statue guardians; assigned to directions randomly each run
const guardians = ["Falcon", "Jackal", "Serpent", "Lion"];

// Mutable run state — reset on page reload
const state = {
  roomIndex: 0,
  started: false,
  ended: false,         // true once ending() fires; guards against double-render
  timeLeft: TOTAL_TIME,
  lastTick: null,       // timestamp of last rAF tick
  timerFrame: null,     // rAF handle
  memories: [],         // flavor collectibles shown in ending stats
  route: [],            // machine-readable key path for the network graph
  routeLabels: [],      // human-readable route labels (not currently displayed)
  mistakes: 0,          // 5+ mistakes triggers "Lost to the Stone" mid-run
  glyphCorrect: false,
  statueCorrect: false,
  phraseSolved: false,
  hiddenFound: false,   // true if player took the hidden-way door
  crownResisted: false,
  statueHinted: false,  // true if player studied wall reliefs in crown room
  crownTextKnown: false,// true if player grabbed the crown (gets phrase hint in echoes)
  crownGateHint: false  // true if player grabbed the crown (gets glyph hint at gate)
};

const runConfig = createRunConfig();

const content = document.getElementById("content");
const message = document.getElementById("message");
const choices = document.getElementById("choices");
const room = document.getElementById("room");
const crumbs = document.getElementById("crumbs");
const timerText = document.getElementById("timerText");
const timerFill = document.getElementById("timerFill");
const mainCard = document.getElementById("mainCard");

document.documentElement.style.setProperty("--clue-fade-ms", `${CLUE_FADE_MS}ms`);

function fmt(seconds) {
  seconds = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function updateTimerDisplay() {
  const pct = Math.max(0, state.timeLeft / TOTAL_TIME) * 100;
  timerText.textContent = fmt(state.timeLeft);
  timerFill.style.width = pct + "%";
  timerFill.classList.toggle("warn", pct <= 45 && pct > 22);
  timerFill.classList.toggle("low", pct <= 22);
}

function tick(now) {
  if (!state.started || state.ended) return;
  if (state.lastTick == null) state.lastTick = now;
  const delta = (now - state.lastTick) / 1000;
  state.lastTick = now;
  state.timeLeft -= delta;
  updateTimerDisplay();
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    updateTimerDisplay();
    state.mistakes++;
    record("Time Expired", "time-out");
    ending("lost");
    return;
  }
  state.timerFrame = requestAnimationFrame(tick);
}

function startGlobalTimer() {
  if (state.started) return;
  state.started = true;
  state.lastTick = performance.now();
  updateTimerDisplay();
  state.timerFrame = requestAnimationFrame(tick);
  document.querySelector('.global-timer').style.display = 'flex';
}

function stopGlobalTimer() {
  cancelAnimationFrame(state.timerFrame);
  state.timerFrame = null;
  state.ended = true;
  updateTimerDisplay();
  document.querySelector('.global-timer').style.display = 'none';
}

function adjustTime(seconds, reason, kind) {
  state.timeLeft = Math.min(TOTAL_TIME, Math.max(0, state.timeLeft + seconds));
  updateTimerDisplay();
  const sign = seconds > 0 ? "+" : "";
  showMessage(`${reason}<br><strong>${sign}${seconds} seconds</strong>`, kind || (seconds >= 0 ? "timegain" : "timeloss"));
  if (seconds < 0) pulse();
  if (state.timeLeft <= 0) { ending("lost"); return; }
  if (seconds < 0 && state.mistakes >= 5 && !state.ended) { record("Too Many Mistakes", "mistake-overflow"); ending("lost"); }
}

function setRoom(index) {
  state.roomIndex = index;
  crumbs.innerHTML = roomNames.map((name, i) => i === index ? `<span class="current">${name}</span>` : `<span>${name}</span>`).join(" ");
}

function screen(index, html) {
  if (index >= 0) setRoom(index);
  room.classList.remove("fade-enter");
  void room.offsetWidth;
  room.classList.add("fade-enter");
  content.innerHTML = html;
  choices.innerHTML = "";
  message.style.display = "none";
  message.className = "message";
}

function showMessage(text, kind = "") {
  message.style.display = "block";
  message.className = "message" + (kind ? " " + kind : "");
  message.innerHTML = text;
}

function pulse() {
  mainCard.classList.remove("shake");
  void mainCard.offsetWidth;
  mainCard.classList.add("shake");
}

function addChoice(label, action) {
  const button = document.createElement("button");
  button.innerHTML = label;
  button.onclick = action;
  choices.appendChild(button);
}

function shuffled(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[.,!?;:"'`“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningKeyToText(key, lower = false) {
  const label = meaningLabels[key] || key;
  return lower ? label.toLowerCase() : label;
}

function getGlyphSequenceText(sequence) {
  return sequence.map(key => runConfig.glyphByMeaning[key]).join(" → ");
}

// Randomly decides whether the crown engraving reveals the first glyph, last, or both
function pickCrownHintMode() {
  const roll = Math.random();
  if (roll < 0.33) return "first";
  if (roll < 0.66) return "last";
  return "both";
}

function getCodeWordText(meaning) {
  return runConfig.codeWordByMeaning[meaning].toUpperCase();
}

// Builds the crown engraving text using shape-based code words, not raw glyph symbols
function getCrownHintLine() {
  const firstMeaning = runConfig.glyphSequence[0];
  const lastMeaning = runConfig.glyphSequence[runConfig.glyphSequence.length - 1];
  const firstWord = getCodeWordText(firstMeaning);
  const lastWord = getCodeWordText(lastMeaning);

  if (runConfig.crownHintMode === "first") {
    return `First light sees ${firstWord}.`;
  }
  if (runConfig.crownHintMode === "last") {
    return `Last light seals ${lastWord}.`;
  }
  return `First light sees ${firstWord}. Last light seals ${lastWord}.`;
}

// Generates all per-run randomized puzzle data: phrase, glyph encoding, glyph order,
// guardian-direction mapping, final statue direction, and crown hint mode.
// Called once at page load; all rooms read from this object.
function createRunConfig() {
  const phrasePack = shuffled(phrasePools)[0];
  const meanings = ["truth", "danger", "hidden", "final"];
  const pickedGlyphs = shuffled(glyphPool);
  const randomizedMeanings = shuffled(meanings);
  const glyphByMeaning = {};
  const codeWordByMeaning = {};

  randomizedMeanings.forEach((meaning, index) => {
    glyphByMeaning[meaning] = pickedGlyphs[index];
    codeWordByMeaning[meaning] = glyphHintWords[pickedGlyphs[index]];
  });

  const glyphSequence = shuffled(meanings);
  const directionKeys = Object.keys(directionMeta);
  const directionOrder = shuffled(directionKeys);
  const guardianByDirection = {};

  directionOrder.forEach((dir, index) => {
    guardianByDirection[dir] = guardians[index];
  });

  const finalDirection = shuffled(directionKeys)[0];

  return {
    phrasePack,
    normalizedPhrase: normalizeText(phrasePack.text),
    glyphByMeaning,
    codeWordByMeaning,
    glyphSequence,
    guardianByDirection,
    finalDirection,
    crownHintMode: pickCrownHintMode()
  };
}

// Generates 1 correct + 3 wrong glyph-order options for the gate room
function buildGateGlyphOptions() {
  const correct = runConfig.glyphSequence;
  const seen = new Set([correct.join("|")]);
  const options = [{ sequence: correct, correct: true }];

  while (options.length < 4) {
    const candidate = shuffled(correct);
    const key = candidate.join("|");
    if (!seen.has(key)) {
      seen.add(key);
      options.push({ sequence: candidate, correct: false });
    }
  }

  return shuffled(options);
}

// Returns the statue placement paragraph typed into the entrance clue panel
function getStatueLineText() {
  const order = ["east", "north", "south", "west"];
  return order
    .map(dir => {
      const guardian = runConfig.guardianByDirection[dir].toLowerCase();
      return `• A ${guardian} watches the ${directionMeta[dir].wall}.`;
    })
    .join("\n");
}

// HTML shown when the player pays 20s to review faded entrance clues
function getReviewMemoryHtml() {
  const glyphLines = runConfig.glyphSequence
    .map(key => `${runConfig.glyphByMeaning[key]} = ${meaningKeyToText(key)}`)
    .join("<br>");

  const statueLines = ["east", "north", "south", "west"]
    .map(dir => `${runConfig.guardianByDirection[dir]} ${dir}`)
    .join(". ");

  return `${glyphLines}<br><br>"${runConfig.phrasePack.text}"<br><br>${statueLines}.`;
}

function continueWith(label, next) {
  if (state.ended) return;
  choices.innerHTML = "";
  addChoice(label, next);
}

function addMemory(memory) {
  if (!state.memories.includes(memory)) {
    state.memories.push(memory);
  }
}

function record(label, key) {
  state.routeLabels.push(label);
  state.route.push(key || label.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
}

// Types text character-by-character into el. Returns a promise that resolves false
// if the element is removed from the DOM before typing completes (room changed).
function typeInto(el, text, speed = 16) {
  return new Promise(resolve => {
    if (!el || !el.isConnected) return resolve(false);
    el.textContent = "";
    el.classList.add("typed-cursor");
    let i = 0;
    const step = () => {
      if (!el.isConnected) {
        el.classList.remove("typed-cursor");
        resolve(false);
        return;
      }
      el.textContent = text.slice(0, i);
      i++;
      if (i <= text.length) setTimeout(step, speed);
      else { el.classList.remove("typed-cursor"); resolve(true); }
    };
    step();
  });
}

// Schedules a CSS fade-out on el after totalDuration ms (fade begins CLUE_FADE_MS before end)
function fadeAfter(el, totalDuration = CLUE_TOTAL_MS) {
  if (!el) return;
  const delay = Math.max(0, totalDuration - CLUE_FADE_MS);
  setTimeout(() => {
    if (el.isConnected) el.classList.add("fade-away");
  }, delay);
}

// --- GAME LOGIC --- //
// Each function below corresponds to one room or sub-screen.
// Rooms call continueWith() or addChoice() to wire up the next step.

document.querySelector('.global-timer').style.display = 'none';

async function entranceSequence() {
  const statues = document.getElementById("statueText");
  const glyphs = document.getElementById("glyphPanel");
  const phrase = document.getElementById("phrasePanel");
  
  const statuesShown = await typeInto(statues, `Four statues hold the chamber in place:\n\n${getStatueLineText()}`, 12);
  if (!statuesShown) return;
  fadeAfter(statues);
  
  await new Promise(r => setTimeout(r, 600));
  const glyphLines = runConfig.glyphSequence
    .map(key => `${runConfig.glyphByMeaning[key]} = ${meaningKeyToText(key)}`)
    .join("\n");
  const glyphsShown = await typeInto(glyphs, glyphLines, 13);
  if (!glyphsShown) return;
  addMemory("Glyph sequence");
  fadeAfter(glyphs);
  
  await new Promise(r => setTimeout(r, 600));
  const phraseShown = await typeInto(phrase, `\u201c${runConfig.phrasePack.text}\u201d`, 18);
  if (!phraseShown) return;
  addMemory("Vanished sentence");
  fadeAfter(phrase);
}

function reviewEntranceMemory() {
  record("Reviewed Entrance Clues", "entrance-review");
  adjustTime(-20, "You wait for the glow to return and read the faded words again.", "timeloss");
  content.insertAdjacentHTML("beforeend", `
    <div class="memory-box">${getReviewMemoryHtml()}</div>
  `);
  const box = content.querySelector(".memory-box:last-of-type");
  fadeAfter(box);
  continueWith("Leave the entrance hall", doors);
}

function start() {
  screen(-1, `
    <h2>The Awakening</h2>
    <div class="story">After days of cutting through jungle vines and broken stone, you find a temple that should not still be standing.

The door seals behind you.

Blue fire moves through the walls in thin, branching lines. It looks less like magic and more like a living mind waking up.

A voice enters the chamber:

<em>"The stone does not repeat itself. It remembers only what you connect."</em>

Every glowing clue you reveal will fade after a short moment. What remains is what you remember.</div>
  `);
  document.getElementById("crumbs").innerHTML = ""; 
  addChoice("Enter the temple", () => { startGlobalTimer(); record("Entered Temple", "start"); entrance(); });
}

function entrance() {
  screen(0, `
    <h2>Room 1 — The Entrance Hall</h2>
    <div class="goal">Let the room speak. Remember what fades.</div>
    <div id="entranceStory" class="story fade-in">The door seals shut behind you.

The chamber is still. Then blue light moves through the walls, and words begin to appear.</div>
    <div id="statueText" class="memory-box typed-clue"></div>
    <div id="glyphPanel" class="memory-box typed-clue compact"></div>
    <div id="phrasePanel" class="memory-box typed-clue compact"></div>
    <p class="small-note">Read carefully. Each clue will vanish.</p>
  `);
  setTimeout(() => entranceSequence(), 2000); 
  addChoice("Leave now", () => { record("Left Entrance Quickly", "entrance-quick"); doors(); });
  addChoice("Review the vanished text <span class='choice-meta'>Costs 20 seconds, but guarantees you see it again.</span>", reviewEntranceMemory);
}

function doors() {
  const truthGlyph = runConfig.glyphByMeaning.truth;
  const dangerGlyph = runConfig.glyphByMeaning.danger;
  const hiddenGlyph = runConfig.glyphByMeaning.hidden;
  const shownGlyphs = shuffled([dangerGlyph, truthGlyph, hiddenGlyph]);

  screen(1, `
    <h2>Room 2 — The Hall of Three Doors</h2>
    <div class="goal">Choose the symbol that best matches what you remember.</div>
    <div class="story">Three doors rise from the dust.

One bears <strong>${shownGlyphs[0]}</strong>.
One bears <strong>${shownGlyphs[1]}</strong>.
One bears <strong>${shownGlyphs[2]}</strong>.

The wrong path may still lead forward, but it will cost time.</div>
  `);
  const doorChoices = shuffled([
    {
      label: `Enter the door marked ${dangerGlyph}`,
      action: () => {
        state.mistakes++;
        record("Danger Door (Trap)", "door-danger");
        adjustTime(-20, "The floor snaps open. You survive, but recovery costs time.", "timeloss");
        continueWith("Push onward", fork);
      }
    },
    {
      label: `Enter the door marked ${truthGlyph}`,
      action: () => {
        addMemory("Truth door recognized");
        record("Truth Door (Correct)", "door-truth");
        adjustTime(5, "The stone accepts your choice and opens without resistance.", "timegain");
        continueWith("Continue", fork);
      }
    },
    {
      label: `Enter the door marked ${hiddenGlyph}`,
      action: () => {
        state.hiddenFound = true;
        addMemory("Hidden way discovered");
        record("Hidden Way Door", "door-hidden");
        adjustTime(12, "A side seam opens. The shortcut curves back ahead of the main route.", "timegain");
        continueWith("Return to the main path", fork);
      }
    }
  ]);
  doorChoices.forEach(choice => addChoice(choice.label, choice.action));
}

function fork() {
  const shortcutChance = state.hiddenFound ? 0.65 : 0.45;
  const chanceLabel = Math.round(shortcutChance * 100);
  screen(2, `
    <h2>Room 3 — The Forked Corridor</h2>
    <div class="goal">Decide whether the shortcut is worth it.</div>
    <div class="story">The corridor splits.

<strong>Left passage:</strong> steady, visible, slow.
It costs 8 seconds, but nothing can collapse above you.

<strong>Right passage:</strong> cracked ceiling, shorter route.
${state.hiddenFound ? "The hidden seam you found earlier reveals stronger supports above this route." : "You can only judge the route by crumbling stone and guesswork."}
Estimated chance it holds: ${chanceLabel}%.</div>
  `);
  addChoice("Take the left passage <span class='choice-meta'>Safe, but slower by 8 seconds.</span>", () => {
    record("Safe Passage", "fork-safe");
    adjustTime(-8, "You take the steady path and move forward without risk.", "timeloss");
    continueWith("Enter the golden chamber", crown);
  });
  addChoice(`Take the right shortcut <span class='choice-meta'>${chanceLabel}%: +18 seconds. ${100 - chanceLabel}%: -25 seconds.</span>`, () => {
    const success = Math.random() < shortcutChance;
    if (success) {
      addMemory("Risk paid off");
      record("Shortcut Succeeded", "fork-risk-win");
      adjustTime(18, "The cracked ceiling holds. The shortcut saves a clean stretch of time.", "timegain");
    } else {
      state.mistakes++;
      record("Shortcut Collapsed", "fork-risk-loss");
      adjustTime(-25, "Stone breaks above you. Escaping the collapse costs serious time.", "timeloss");
    }
    continueWith("Enter the golden chamber", crown);
  });
}

function crown() {
  const crownHintLine = getCrownHintLine();
  const hintedGuardian = runConfig.guardianByDirection[runConfig.finalDirection].toLowerCase();
  const hintedCue = directionMeta[runConfig.finalDirection].cue;

  screen(3, `
    <h2>Room 4 — The Chamber of Greed</h2>
    <div class="goal">Decide what is signal and what is bait.</div>
    <div class="story">Gold covers the floor. Gems glitter in the hands of broken statues.

At the center, a crown waits beneath a narrow shaft of light.

Fresh footprints lead toward it. None lead away.

Along the far wall, chipped reliefs show crowned guardians turned in different directions.</div>
  `);
  addChoice("Claim the crown immediately <span class='choice-meta'>High risk: lose time, but gain exact text.</span>", () => {
    state.mistakes++;
    state.crownTextKnown = true;
    state.crownGateHint = true;
    record("Grabbed False Crown", "crown-grab");
    addMemory("Crown inscription copied");
    addMemory("Crown alignment clue");
    adjustTime(-28, "A pressure plate drops beneath you. You recover, but the trap eats precious time.", "timeloss");
    content.insertAdjacentHTML("beforeend", `
      <div class="memory-box">Inside the crown ring:<br>"${runConfig.phrasePack.text}"<br><br>Outer engraving:<br>"${crownHintLine}"</div>
    `);
    const box = content.querySelector(".memory-box:last-of-type");
    fadeAfter(box);
    continueWith("Leave the false treasure behind", echoes);
  });
  addChoice("Study the wall reliefs <span class='choice-meta'>Medium risk: lose a little time for a directional hint.</span>", () => {
    state.crownResisted = true;
    state.statueHinted = true;
    addMemory("Reliefs decoded");
    record("Studied Wall Reliefs", "crown-inspect");
    adjustTime(-5, `You trace a worn relief: a ${hintedGuardian} with a broken crown, facing ${hintedCue}. The clue costs time, but stays with you.`, "timeloss");
    continueWith("Carry the clue forward", echoes);
  });
  addChoice("Ignore the room and move on <span class='choice-meta'>Low risk: gain time now, but carry less info.</span>", () => {
    state.crownResisted = true;
    addMemory("Ignored the false crown");
    record("Ignored Greed Chamber", "crown-ignore");
    adjustTime(5, "You keep your momentum and leave the chamber unanswered.", "timegain");
    continueWith("Move deeper", echoes);
  });
}

function echoes() {
  screen(4, `
    <h2>Room 5 — The Chamber of Echoes</h2>
    <div class="goal">Recover the sentence that vanished.</div>
    <div class="story">A circular altar glows in the dark.

"Type the words that vanished from the entrance wall," the voice says.

Two options:
• Type it yourself — correct gets +20s, partial gets +8s, wrong costs −8s.
• Pick from fragments — easier, but one is a trap. Right gets +8s, wrong costs −18s.</div>
  `);
  addChoice("Type it from memory <span class='choice-meta'>Higher reward. You must remember the exact sentence.</span>", typePhrase);
  addChoice("Choose from fragments <span class='choice-meta'>Easier, but one option is a trap.</span>", phraseChoices);
}

function typePhrase() {
  screen(4, `
    <h2>Type From Memory</h2>
    <div class="story">Type the exact sentence you saw on the entrance wall.</div>
    ${state.crownTextKnown ? `<p class="story-hint">The crown's inner ring repeats in your mind: "${runConfig.phrasePack.text}"</p>` : ""}
    <input id="phraseInput" placeholder="Type the sentence..." autocomplete="off" />
    <p class="small-note" style="margin-top: 12px;">Press Enter or click Confirm when ready.</p>
  `);
  const input = document.getElementById("phraseInput");
  if (input) {
    setTimeout(() => input.focus(), 80);
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        submitPhraseAnswer();
      }
    });
  }
  addChoice("Confirm Answer", submitPhraseAnswer);
}

function submitPhraseAnswer() {
  const input = document.getElementById("phraseInput");
  if (!input) return;
  const rawAnswer = input.value.trim();
  if (!rawAnswer) {
    showMessage("The altar waits. Speak a sentence before you test the memory.", "bad");
    pulse();
    return;
  }

  const answer = normalizeText(rawAnswer);
  if (answer === runConfig.normalizedPhrase) {
    state.phraseSolved = true;
    addMemory("Perfect sentence recall");
    record("Typed Perfect Recall", "echo-perfect");
    adjustTime(20, "The altar brightens. Perfect recall stabilizes the chamber.", "timegain");
  } else {
    const anchorMatches = runConfig.phrasePack.anchors.reduce((count, anchor) => {
      return count + (answer.includes(anchor) ? 1 : 0);
    }, 0);
    if (anchorMatches >= 2) {
    state.phraseSolved = true;
    addMemory("Partial sentence recall");
    record("Typed Partial Recall", "echo-partial");
    adjustTime(8, "The memory is incomplete, but the important pattern survives.", "timegain");
    } else {
      state.mistakes++;
      record("Typed Wrong Phrase", "echo-fail");
      adjustTime(-8, "The altar stays dark. The memory does not connect.", "timeloss");
    }
  }
  continueWith("Approach the final gate", gate);
}

function phraseChoices() {
  const phraseOptions = [
    [runConfig.phrasePack.text, true, "echo-fragment-right", "Guessed Right Fragment"],
    ...runConfig.phrasePack.decoys.map(decoy => [decoy, false, "echo-fragment-wrong", "Guessed Wrong Fragment"])
  ];

  screen(4, `
    <h2>The Stones Speak</h2>
    <div class="story">Four fragments appear. One matches the sentence you saw.</div>
  `);
  shuffled(phraseOptions).forEach(([label, correct, key, routeLabel]) => {
    addChoice(label, () => {
      record(routeLabel, key);
      if (correct) {
        state.phraseSolved = true;
        addMemory("Pattern recognition");
        adjustTime(8, "The words align with the memory. The altar accepts the connection.", "timegain");
      } else {
        state.mistakes++;
        adjustTime(-18, "Wrong sentence. The altar rejects the answer and goes dark.", "timeloss");
      }
      continueWith("Approach the final gate", gate);
    });
  });
}

function gate() {
  const gateOptions = buildGateGlyphOptions();
  const crownHintLine = getCrownHintLine();

  screen(5, `
    <h2>Room 6 — The Final Gate</h2>
    <div class="goal">Connect first memory to final action.</div>
    <div class="story">A black stone gate waits at the center of the temple.

Four sockets glow across its surface.

Inscription:
"What was seen first shall open what is last."</div>
    <p class="story-hint">The gate is testing order, not luck. Think back to the very first symbol sequence the chamber revealed.</p>
  ${state.crownGateHint ? `<p class="story-hint">A line from the crown returns: "${crownHintLine}"</p>` : ""}
  `);

  gateOptions.forEach(option => {
    addChoice(getGlyphSequenceText(option.sequence), () => {
      if (option.correct) {
        state.glyphCorrect = true;
        addMemory("Final glyph order");
        record("Correct Gate Glyphs", "gate-glyph-right");
        adjustTime(10, "The sockets align. The first lock opens.", "timegain");
      } else {
        wrongGlyph();
      }
      continueWith("Answer the final question", statueQuestion);
    });
  });
}

function wrongGlyph() {
  state.glyphCorrect = false;
  state.mistakes++;
  record("Wrong Gate Glyphs", "gate-glyph-wrong");
  adjustTime(-16, "The sockets flare and reject the order.", "timeloss");
}

function statueQuestion() {
  const direction = runConfig.finalDirection;
  const directionWall = directionMeta[direction].wall;
  const directionCue = directionMeta[direction].cue;
  const correctGuardian = runConfig.guardianByDirection[direction];

  screen(5, `
    <h2>The Final Verification</h2>
    <div class="story">The gate asks one last question:

"Which guardian stood at the ${directionWall}?"</div>
    ${state.statueHinted ? `<p class="story-hint">A carved figure comes back to you: a ${correctGuardian.toLowerCase()} with a broken crown, facing ${directionCue}.</p>` : ""}
  `);
  
  const statueChoices = shuffled([
    ...guardians.filter(name => name !== correctGuardian).map(name => ({
      label: name,
      action: wrongStatue
    })),
    {
      label: correctGuardian,
      action: () => {
        state.statueCorrect = true;
        addMemory("Final guardian remembered");
        record("Remembered Guardian", "gate-statue-right");
        ending("won");
      }
    }
  ]);
  
  statueChoices.forEach(choice => addChoice(choice.label, choice.action));
}

function wrongStatue() {
  state.statueCorrect = false;
  state.mistakes++;
  record(`Failed Statue Question`, "gate-statue-wrong");
  adjustTime(-20, "The gate shudders. The wrong guardian brings ruin.", "timeloss");
  ending("survived"); 
}

// --- CANVAS GRAPH DRAWING --- //

function drawNetwork() {
  const canvas = document.getElementById('networkCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  const rect = canvas.parentElement.getBoundingClientRect();
  const w = canvas.width = rect.width - 28; 
  const h = canvas.height = 380;
  
  ctx.clearRect(0, 0, w, h);
  
  const mapLayers = [
    [ {id: 'start', label: 'Start', type: 'neutral'} ],
    [ {id: 'entrance-quick', label: 'Quick', type: 'neutral'}, {id: 'entrance-review', label: 'Review', type: 'neutral'} ],
    [ {id: 'door-truth', label: 'Truth', type: 'good'}, {id: 'door-hidden', label: 'Hidden', type: 'good'}, {id: 'door-danger', label: 'Danger', type: 'bad'} ],
    [ {id: 'fork-safe', label: 'Safe', type: 'good'}, {id: 'fork-risk-win', label: 'Shortcut', type: 'good'}, {id: 'fork-risk-loss', label: 'Collapse', type: 'bad'} ],
    [ {id: 'crown-ignore', label: 'Ignore', type: 'neutral'}, {id: 'crown-inspect', label: 'Inspect', type: 'good'}, {id: 'crown-grab', label: 'Grab', type: 'bad'} ],
    [ {id: 'echo-perfect', label: 'Perfect', type: 'good'}, {id: 'echo-partial', label: 'Partial', type: 'good'}, {id: 'echo-fragment-right', label: 'Frag Right', type: 'good'}, {id: 'echo-fail', label: 'Type Fail', type: 'bad'}, {id: 'echo-fragment-wrong', label: 'Frag Wrong', type: 'bad'} ],
    [ {id: 'gate-glyph-right', label: 'Glyph Right', type: 'good'}, {id: 'gate-glyph-wrong', label: 'Glyph Wrong', type: 'bad'} ],
    [ {id: 'gate-statue-right', label: 'Guardian ✓', type: 'good'}, {id: 'gate-statue-wrong', label: 'Wrong ✗', type: 'bad'}, {id: 'time-out', label: 'Time Out', type: 'bad'} ]
  ];

  const paddingX = 45;
  const paddingY = 40;
  const stepX = (w - paddingX * 2) / (mapLayers.length - 1);
  
  const nodeCoords = {};
  mapLayers.forEach((layer, i) => {
    const x = paddingX + (i * stepX);
    const count = layer.length;
    layer.forEach((node, j) => {
      let y = count === 1 ? h / 2 : paddingY + ((h - 2 * paddingY) / (count - 1)) * j;
      nodeCoords[node.id] = { x, y, ...node };
    });
  });

  const cGrey = "rgba(255, 255, 255, 0.12)";
  const cGood = "#9dcf9c";
  const cBad = "#d86d55";
  const cNeutral = "#e8bd72"; 

  function getColor(type) {
    if (type === 'good') return cGood;
    if (type === 'bad') return cBad;
    return cNeutral;
  }

  ctx.lineWidth = 1;
  for (let i = 0; i < mapLayers.length - 1; i++) {
    mapLayers[i].forEach(n1 => {
      mapLayers[i + 1].forEach(n2 => {
        const v1Index = state.route.indexOf(n1.id);
        const v2Index = state.route.indexOf(n2.id);
        const isTraversedEdge = (v1Index !== -1 && v2Index !== -1 && v2Index === v1Index + 1);
        
        if (!isTraversedEdge && n2.id !== 'time-out') { 
          ctx.beginPath();
          ctx.strokeStyle = cGrey;
          ctx.moveTo(nodeCoords[n1.id].x, nodeCoords[n1.id].y);
          ctx.lineTo(nodeCoords[n2.id].x, nodeCoords[n2.id].y);
          ctx.stroke();
        }
      });
    });
  }

  ctx.lineWidth = 2.5;
  for (let i = 0; i < state.route.length - 1; i++) {
    const id1 = state.route[i];
    const id2 = state.route[i+1];
    if (nodeCoords[id1] && nodeCoords[id2]) {
      ctx.beginPath();
      ctx.strokeStyle = getColor(nodeCoords[id2].type); 
      ctx.moveTo(nodeCoords[id1].x, nodeCoords[id1].y);
      ctx.lineTo(nodeCoords[id2].x, nodeCoords[id2].y);
      ctx.stroke();
    }
  }

  Object.values(nodeCoords).forEach(n => {
    const isVisited = state.route.includes(n.id);
    
    ctx.beginPath();
    ctx.arc(n.x, n.y, isVisited ? 6 : 4, 0, Math.PI * 2);
    
    if (isVisited) {
      ctx.fillStyle = getColor(n.type);
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 10;
    } else {
      ctx.fillStyle = cGrey;
      ctx.shadowBlur = 0;
    }
    
    ctx.fill();
    ctx.shadowBlur = 0;
    
    if (isVisited) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.font = "bold 11px system-ui, sans-serif";
    } else {
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.font = "10px system-ui, sans-serif";
    }
    
    ctx.textAlign = "center";
    ctx.fillText(n.label, n.x, n.y - 12);
  });
}

// --- ENDING --- //

function getEndingDetails(type) {
  if (type === "lost") {
    const byMistakes = state.timeLeft > 0;
    return {
      title: "Lost to the Stone",
      desc: byMistakes
        ? "You stumbled too many times. The temple's guardians sealed the passage, leaving you trapped in the dark."
        : "Your time ran out. The temple's mechanisms ground to a halt, trapping you in the dark.",
      flavor: byMistakes ? "The stone does not forgive the reckless." : "The code is forgotten once more.",
      stateKey: "lost"
    };
  } else if (type === "won" && state.mistakes <= 1 && state.timeLeft >= 30) {
    return {
      title: "The Flawless Mind",
      desc: "You navigated the temple perfectly. The gate opens wide, revealing the ancient core intact.",
      flavor: "You grasped the truth, not the shadows.",
      stateKey: "perfect"
    };
  } else {
    return {
      title: "The Battered Survivor",
      desc: "The final gate yields to you. You stumbled along the way, but your memory held strong when it mattered most.",
      flavor: "The path was jagged, but complete.",
      stateKey: "survivor"
    };
  }
}

function ending(type = "won") {
  if (state.ended) return;
  stopGlobalTimer();
  document.getElementById("crumbs").innerHTML = `<span class="current">Conclusion</span>`;
  
  const endData = getEndingDetails(type);
  
  const endingHtml = `
    <h2 style="color: ${type === 'lost' ? 'var(--danger)' : 'var(--good)'}; font-size: 2.2rem; text-align: center; margin-bottom: 8px;">
      ${endData.title}
    </h2>
    <p style="text-align: center; color: var(--muted); font-style: italic; margin-bottom: 32px;">"${endData.flavor}"</p>
    
    <div class="story" style="text-align: center;">${endData.desc}</div>

    <div class="network-wrap">
      <canvas id="networkCanvas"></canvas>
      <div class="legend">
         <span class="dot path"></span> Neutral / Progress Step
         <span class="dot syn"></span> Correct / Time Gain
         <span class="dot" style="background:var(--danger); box-shadow: 0 0 8px var(--danger);"></span> Mistake / Trap
      </div>
    </div>

    <div class="ending-grid">
      <div class="panel">
        <h3>Your Journey Stats</h3>
        <div class="stat-row">
          <span class="stat-label">Time Remaining:</span>
          <span class="stat-value" style="color: ${state.timeLeft > 0 ? 'var(--gold)' : 'var(--danger)'}">${fmt(state.timeLeft)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Mistakes Made:</span>
          <span class="stat-value">${state.mistakes}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Memories Collected:</span>
          <span class="stat-value">${state.memories.length} / 8</span>
        </div>
        <div class="stat-row" style="margin-top: 16px; border:none;">
          <button onclick="location.reload()" style="text-align: center;">Enter the Temple Again</button>
        </div>
      </div>
      
      <div class="panel">
        <h3>Mutually Exclusive Endings</h3>
        <div class="endings-list">
          <div class="ending-card ${endData.stateKey === 'perfect' ? 'achieved' : ''}">
            <div class="ending-card-title">The Flawless Mind</div>
            <div class="ending-card-req">Win with 0–1 mistakes and at least 30 seconds remaining.</div>
          </div>
          <div class="ending-card ${endData.stateKey === 'survivor' ? 'achieved' : ''}">
            <div class="ending-card-title">The Battered Survivor</div>
            <div class="ending-card-req">Reach the end despite triggering traps or errors.</div>
          </div>
          <div class="ending-card ${endData.stateKey === 'lost' ? 'achieved' : ''}">
            <div class="ending-card-title">Lost to the Stone</div>
            <div class="ending-card-req">Run out of time, or make 5 or more mistakes.</div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  screen(-1, endingHtml);
  
  setTimeout(drawNetwork, 100);
  window.addEventListener('resize', drawNetwork);
}

// Initialize the game
window.onload = start;
