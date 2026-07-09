(function () {
  let data = window.FRIENDS_DATA || { Episodes: [], Seasons: [], TotalEpisodes: 0, TotalLines: 0 };
  let episodes = [];
  let episodeMap = new Map();
  let allLines = [];

  const storeKey = "friendsEnglishArena.profiles.v2";
  const todayKey = new Date().toISOString().slice(0, 10);
  const isHosted = /^https?:$/.test(location.protocol);
  const apiBase = (window.FRIENDS_API_BASE || "").replace(/\/$/, "");
  const nodes = {};
  const store = loadStore();
  const room = { code: "", state: null, timer: 0, busy: false };
  let profile = null;

  document.addEventListener("DOMContentLoaded", bootstrap);

  async function bootstrap() {
    await loadData();
    prepareData();
    init();
    registerServiceWorker();
  }

  async function loadData() {
    const params = new URLSearchParams(location.search);
    const configuredUrl = params.get("data") || window.FRIENDS_DATA_URL || "";
    if (configuredUrl) {
      data = await fetchData(configuredUrl);
      return;
    }
    if (window.FRIENDS_DATA && window.FRIENDS_DATA.Episodes) {
      data = window.FRIENDS_DATA;
      return;
    }
    if (isHosted) {
      try {
        data = await fetchData("data/friends-data.json");
        return;
      } catch (error) {
        console.warn("JSON data could not be loaded, using fallback data.", error);
      }
    }
    data = window.FRIENDS_DATA || data;
  }

  async function fetchData(url) {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Data load failed: ${response.status}`);
    const text = await response.text();
    if (/^\s*window\.FRIENDS_DATA\s*=/.test(text)) {
      const sandbox = {};
      Function("window", text)(sandbox);
      return sandbox.FRIENDS_DATA;
    }
    return JSON.parse(text);
  }

  function prepareData() {
    episodes = [...(data.Episodes || [])].sort((a, b) => a.Season - b.Season || a.Episode - b.Episode);
    episodeMap = new Map(episodes.map((episode) => [episode.Id, episode]));
    allLines = episodes.flatMap((episode) =>
      (episode.Lines || []).map((line) => ({
        ...line,
        episodeId: episode.Id,
        episodeTitle: episode.Title,
        season: episode.Season,
        episode: episode.Episode,
      }))
    ).filter((line) => line.English && line.Turkish);
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || !isHosted) return;
    navigator.serviceWorker.register("sw.js").catch((error) => {
      console.warn("Service worker could not be registered.", error);
    });
  }

  function init() {
    bindNodes();
    bindEvents();
    loadActiveProfile();
    ensureProfile();
    render();
  }

  function bindNodes() {
    [
      "profileGate",
      "profileForm",
      "profileNameInput",
      "savedProfiles",
      "gateSummary",
      "activeProfileName",
      "switchProfile",
      "dataSummary",
      "seasonSelect",
      "episodeSearch",
      "episodeList",
      "episodeKicker",
      "episodeTitle",
      "lineMeta",
      "episodeProgressText",
      "xpText",
      "episodeProgressBar",
      "resetEpisode",
      "reviewEpisode",
      "lineCounter",
      "lineTime",
      "englishLine",
      "translationBox",
      "turkishLine",
      "translationEditor",
      "translationInput",
      "saveTranslation",
      "cancelTranslation",
      "restoreTranslation",
      "prevLine",
      "nextLine",
      "revealTranslation",
      "editTranslation",
      "markHard",
      "markReview",
      "markKnown",
      "saveVocab",
      "reviewCount",
      "startReview",
      "reviewTime",
      "reviewEnglish",
      "reviewTurkish",
      "reviewKnown",
      "reviewAgain",
      "quizTime",
      "quizPrompt",
      "quizOptions",
      "quizFeedback",
      "newQuiz",
      "roomCodeInput",
      "createRoom",
      "joinRoom",
      "leaveRoom",
      "roomStatus",
      "duelScores",
      "nextDuel",
      "duelTime",
      "duelPrompt",
      "duelOptions",
      "duelFeedback",
      "vocabCount",
      "vocabList",
      "clearVocab",
      "todayXp",
      "knownCount",
      "reviewStatCount",
      "leaderRows",
    ].forEach((id) => {
      nodes[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    nodes.profileForm.addEventListener("submit", (event) => {
      event.preventDefault();
      activateProfile(nodes.profileNameInput.value);
    });
    nodes.switchProfile.addEventListener("click", () => {
      saveProfile();
      store.activeName = "";
      saveStore();
      profile = null;
      render();
    });
    nodes.seasonSelect.addEventListener("change", () => {
      profile.season = nodes.seasonSelect.value === "all" ? "all" : Number(nodes.seasonSelect.value);
      const first = filteredEpisodes()[0];
      if (first) setEpisode(first.Id);
      saveProfile();
      render();
    });
    nodes.episodeSearch.addEventListener("input", renderEpisodeList);
    document.querySelectorAll(".mode-tab").forEach((button) => {
      button.addEventListener("click", () => {
        profile.mode = button.dataset.mode;
        profile.editingTranslation = false;
        if (profile.mode === "quiz" && !profile.quiz.lineId) makeQuiz();
        if (profile.mode === "review" && !profile.reviewLineId) chooseReviewLine();
        if (profile.mode === "duel" && !profile.localDuel.lineId && !room.code) makeLocalDuelRound();
        saveProfile();
        render();
      });
    });

    nodes.prevLine.addEventListener("click", () => moveStudy(-1));
    nodes.nextLine.addEventListener("click", () => moveStudy(1));
    nodes.revealTranslation.addEventListener("click", () => {
      profile.revealed = !profile.revealed;
      if (!profile.revealed) profile.editingTranslation = false;
      saveProfile();
      renderStudy();
    });
    nodes.editTranslation.addEventListener("click", startTranslationEdit);
    nodes.cancelTranslation.addEventListener("click", () => {
      profile.editingTranslation = false;
      saveProfile();
      renderStudy();
    });
    nodes.saveTranslation.addEventListener("click", saveTranslationEdit);
    nodes.restoreTranslation.addEventListener("click", restoreTranslation);
    nodes.markHard.addEventListener("click", () => rateCurrent("hard", 12));
    nodes.markReview.addEventListener("click", () => rateCurrent("review", 8));
    nodes.markKnown.addEventListener("click", () => rateCurrent("known", 10));
    nodes.saveVocab.addEventListener("click", saveCurrentVocab);
    nodes.resetEpisode.addEventListener("click", resetCurrentEpisode);
    nodes.reviewEpisode.addEventListener("click", addEpisodeToReview);

    nodes.startReview.addEventListener("click", () => {
      chooseReviewLine();
      saveProfile();
      renderReview();
    });
    nodes.reviewKnown.addEventListener("click", () => rateReviewLine("known"));
    nodes.reviewAgain.addEventListener("click", () => rateReviewLine("review"));

    nodes.newQuiz.addEventListener("click", () => {
      makeQuiz();
      renderQuiz();
    });
    nodes.quizOptions.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-option]");
      if (button) answerQuiz(button.dataset.option);
    });

    nodes.createRoom.addEventListener("click", createRoom);
    nodes.joinRoom.addEventListener("click", joinRoom);
    nodes.leaveRoom.addEventListener("click", leaveRoom);
    nodes.nextDuel.addEventListener("click", nextDuelRound);
    nodes.duelOptions.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-option]");
      if (button) answerDuel(button.dataset.option);
    });

    nodes.clearVocab.addEventListener("click", () => {
      profile.vocab = [];
      saveProfile();
      renderVocab();
      renderStats();
    });
  }

  function loadStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(storeKey) || "{}");
      return {
        activeName: parsed.activeName || "",
        profiles: parsed.profiles || {},
      };
    } catch (error) {
      return { activeName: "", profiles: {} };
    }
  }

  function saveStore() {
    localStorage.setItem(storeKey, JSON.stringify(store));
  }

  function loadActiveProfile() {
    if (store.activeName && store.profiles[store.activeName]) {
      profile = store.profiles[store.activeName];
    }
  }

  function activateProfile(rawName) {
    const name = cleanName(rawName);
    if (!name) return;
    if (profile) saveProfile();
    profile = normalizeProfile(store.profiles[name] || { name });
    store.profiles[name] = profile;
    store.activeName = name;
    saveProfile();
    render();
  }

  function saveProfile() {
    if (!profile) return;
    profile = normalizeProfile(profile);
    store.profiles[profile.name] = profile;
    store.activeName = profile.name;
    saveStore();
  }

  function normalizeProfile(input) {
    const firstEpisode = episodes[0];
    const p = input || {};
    const defaultLineId = firstEpisode?.Lines?.find((line) => line.English && line.Turkish)?.Id || "";
    return {
      name: cleanName(p.name) || "Misafir",
      episodeId: episodeMap.has(p.episodeId) ? p.episodeId : firstEpisode?.Id || "",
      season: p.season || "all",
      currentLineByEpisode: p.currentLineByEpisode || {},
      revealed: Boolean(p.revealed),
      editingTranslation: Boolean(p.editingTranslation),
      mode: p.mode || "study",
      ratings: p.ratings || {},
      translationOverrides: p.translationOverrides || {},
      vocab: Array.isArray(p.vocab) ? p.vocab : [],
      xp: Number(p.xp || 0),
      today: p.today && p.today.date === todayKey ? p.today : { date: todayKey, xp: 0 },
      quiz: p.quiz || {},
      reviewLineId: p.reviewLineId || "",
      localDuel: p.localDuel || {
        score: 0,
        lineId: defaultLineId,
        options: [],
        selected: "",
        answered: false,
        feedback: "",
      },
    };
  }

  function ensureProfile() {
    if (!profile) return;
    profile = normalizeProfile(profile);
    if (!profile.currentLineByEpisode[profile.episodeId]) {
      profile.currentLineByEpisode[profile.episodeId] = firstStudyLineId(profile.episodeId) || "";
    }
    if (!profile.localDuel.options?.length) makeLocalDuelRound();
  }

  function render() {
    nodes.gateSummary.textContent = `${data.TotalEpisodes || episodes.length} bolum - ${data.TotalLines || allLines.length} replik`;
    renderProfileGate();
    if (!profile) return;
    ensureProfile();
    renderShell();
    renderModes();
    renderSeasonSelect();
    renderEpisodeList();
    renderCurrentView();
    renderStats();
  }

  function renderProfileGate() {
    nodes.profileGate.classList.toggle("is-active", !profile);
    const names = Object.keys(store.profiles).sort((a, b) => a.localeCompare(b, "tr"));
    nodes.savedProfiles.innerHTML = names.length
      ? names.map((name) => `<button type="button" data-profile="${escapeAttr(name)}">${escapeHtml(name)}</button>`).join("")
      : `<div class="empty-state">Kayitli profil yok</div>`;
    nodes.savedProfiles.querySelectorAll("button[data-profile]").forEach((button) => {
      button.addEventListener("click", () => activateProfile(button.dataset.profile));
    });
  }

  function renderShell() {
    const episode = currentEpisode();
    const studyLines = getStudyLines();
    const knownInEpisode = (episode?.Lines || []).filter((line) => profile.ratings[line.Id] === "known").length;
    const percent = episode?.Lines?.length ? Math.round((knownInEpisode / episode.Lines.length) * 100) : 0;

    nodes.activeProfileName.textContent = profile.name;
    nodes.dataSummary.textContent = `${data.TotalEpisodes || episodes.length} bolum - ${data.TotalLines || allLines.length} replik`;
    nodes.episodeKicker.textContent = episode ? `Sezon ${episode.Season} - Bolum ${episode.Episode}` : "Sezon";
    nodes.episodeTitle.textContent = episode?.Title || "Bolum sec";
    nodes.lineMeta.textContent = `${studyLines.length} yeni / ${episode?.LineCount || 0} toplam`;
    nodes.episodeProgressText.textContent = `${percent}%`;
    nodes.xpText.textContent = `${profile.xp || 0} XP`;
    nodes.episodeProgressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  }

  function renderModes() {
    document.querySelectorAll(".mode-tab").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.mode === profile.mode);
    });
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("is-active"));
    const activeView = document.getElementById(`${profile.mode}View`);
    if (activeView) activeView.classList.add("is-active");
  }

  function renderSeasonSelect() {
    const seasons = ["all", ...new Set(episodes.map((episode) => episode.Season))];
    nodes.seasonSelect.innerHTML = seasons.map((season) => {
      const value = season === "all" ? "all" : String(season);
      const label = season === "all" ? "Tum sezonlar" : `Sezon ${season}`;
      return `<option value="${value}">${label}</option>`;
    }).join("");
    nodes.seasonSelect.value = String(profile.season);
  }

  function renderEpisodeList() {
    const list = filteredEpisodes();
    if (!list.length) {
      nodes.episodeList.innerHTML = `<div class="empty-state">Bolum bulunamadi</div>`;
      return;
    }
    nodes.episodeList.innerHTML = list.map((episode) => {
      const active = episode.Id === profile.episodeId ? " is-active" : "";
      const known = (episode.Lines || []).filter((line) => profile.ratings[line.Id] === "known").length;
      return `
        <button type="button" class="episode-button${active}" data-episode="${episode.Id}">
          <span class="episode-number">${episode.Episode}</span>
          <span>
            <span class="episode-name">${escapeHtml(episode.Title)}</span>
            <span class="episode-lines">S${episode.Season} - ${known}/${episode.LineCount} biliniyor</span>
          </span>
          <span aria-hidden="true">&rsaquo;</span>
        </button>
      `;
    }).join("");
    nodes.episodeList.querySelectorAll(".episode-button").forEach((button) => {
      button.addEventListener("click", () => {
        setEpisode(button.dataset.episode);
        saveProfile();
        render();
      });
    });
  }

  function renderCurrentView() {
    renderStudy();
    renderReview();
    if (profile.mode === "quiz") renderQuiz();
    if (profile.mode === "duel") renderDuel();
    if (profile.mode === "vocab") renderVocab();
  }

  function renderStudy() {
    const line = currentStudyLine();
    const lines = getStudyLines();
    const index = line ? Math.max(0, lines.findIndex((item) => item.Id === line.Id)) : -1;
    if (!profile.revealed) profile.editingTranslation = false;
    const canShowTranslation = Boolean(line && profile.revealed);
    const isEditingTranslation = Boolean(canShowTranslation && profile.editingTranslation);

    nodes.lineCounter.textContent = line ? `${index + 1} / ${lines.length}` : "Yeni replik yok";
    nodes.lineTime.textContent = line?.Time || "";
    nodes.englishLine.textContent = line?.English || "Bu bolumde calisilacak yeni replik kalmadi.";
    nodes.turkishLine.textContent = line ? getTranslation(line) : "";
    nodes.translationBox.classList.toggle("is-hidden", !canShowTranslation);
    nodes.translationEditor.hidden = !isEditingTranslation;
    nodes.translationInput.value = isEditingTranslation && line ? getTranslation(line) : "";
    nodes.revealTranslation.textContent = profile.revealed ? "Ceviriyi kapat" : "Ceviriyi ac";
    nodes.prevLine.disabled = !line || index <= 0;
    nodes.nextLine.disabled = !line || index >= lines.length - 1;
    nodes.editTranslation.hidden = !canShowTranslation;
    nodes.editTranslation.disabled = !canShowTranslation;
    nodes.markHard.disabled = !line;
    nodes.markReview.disabled = !line;
    nodes.markKnown.disabled = !line;
    nodes.saveVocab.disabled = !line;
  }

  function renderReview() {
    const lines = getReviewLines();
    const line = reviewLine();
    nodes.reviewCount.textContent = `${lines.length} replik`;
    nodes.reviewTime.textContent = line?.Time || "";
    nodes.reviewEnglish.textContent = line?.English || "Tekrar listesi bos.";
    nodes.reviewTurkish.textContent = line ? getTranslation(line) : "";
    nodes.reviewKnown.disabled = !line;
    nodes.reviewAgain.disabled = !line;
  }

  function renderQuiz() {
    if (!profile.quiz.lineId) makeQuiz();
    const line = lineById(profile.quiz.lineId);
    if (!line) return;
    const correctAnswer = getTranslation(line);
    nodes.quizTime.textContent = line.Time || "Quiz";
    nodes.quizPrompt.textContent = line.English;
    nodes.quizOptions.innerHTML = (profile.quiz.options || []).map((option) => {
      const selected = profile.quiz.selected === option;
      const correct = profile.quiz.answered && option === correctAnswer;
      const wrong = selected && profile.quiz.answered && option !== correctAnswer;
      return `<button type="button" data-option="${escapeAttr(option)}" class="${correct ? "is-correct" : wrong ? "is-wrong" : ""}">${escapeHtml(option)}</button>`;
    }).join("");
    nodes.quizFeedback.textContent = profile.quiz.feedback || "";
  }

  function renderDuel() {
    if (room.code && room.state) {
      renderRoomDuel();
      return;
    }
    renderLocalDuel();
  }

  function renderLocalDuel() {
    const line = lineById(profile.localDuel.lineId) || pick(quizPool());
    if (!line) return;
    nodes.roomStatus.textContent = isHosted ? "Yerel" : "Web icin server.js";
    nodes.duelScores.innerHTML = scoreHtml([{ name: profile.name, score: profile.localDuel.score || 0 }]);
    nodes.duelTime.textContent = line.Time || "";
    nodes.duelPrompt.textContent = line.English;
    const correctAnswer = getTranslation(line);
    nodes.duelOptions.innerHTML = (profile.localDuel.options || []).map((option) => {
      const selected = profile.localDuel.selected === option;
      const correct = profile.localDuel.answered && option === correctAnswer;
      const wrong = selected && profile.localDuel.answered && option !== correctAnswer;
      return `<button type="button" data-option="${escapeAttr(option)}" class="${correct ? "is-correct" : wrong ? "is-wrong" : ""}">${escapeHtml(option)}</button>`;
    }).join("");
    nodes.duelFeedback.textContent = profile.localDuel.feedback || "";
  }

  function renderRoomDuel() {
    const state = room.state;
    const line = lineById(state.lineId);
    const players = Object.values(state.players || {}).sort((a, b) => a.joinedAt - b.joinedAt);
    const myAnswer = state.answers?.[profile.name];
    nodes.roomStatus.textContent = `Oda ${state.code}`;
    nodes.roomCodeInput.value = state.code;
    nodes.duelScores.innerHTML = scoreHtml(players);
    nodes.duelTime.textContent = line?.Time || "";
    nodes.duelPrompt.textContent = line?.English || "Yeni tur bekleniyor.";
    nodes.duelOptions.innerHTML = (state.options || []).map((option) => {
      const selected = myAnswer === option;
      const correct = state.revealed && option === state.correctAnswer;
      const wrong = selected && state.revealed && option !== state.correctAnswer;
      const label = line && option === line.Turkish ? getTranslation(line) : option;
      return `<button type="button" data-option="${escapeAttr(option)}" class="${correct ? "is-correct" : wrong ? "is-wrong" : ""}" ${myAnswer ? "disabled" : ""}>${escapeHtml(label)}</button>`;
    }).join("");
    nodes.duelFeedback.textContent = state.feedback || (myAnswer ? "Cevap bekleniyor" : "");
  }

  function renderVocab() {
    nodes.vocabCount.textContent = `${profile.vocab.length} kayit`;
    if (!profile.vocab.length) {
      nodes.vocabList.innerHTML = `<div class="empty-state">Defter bos</div>`;
      return;
    }
    nodes.vocabList.innerHTML = profile.vocab.map((item) => `
      <article class="vocab-item">
        <div class="vocab-meta">
          <span>S${item.season}E${item.episode} - ${escapeHtml(item.time || "")}</span>
          <span>${escapeHtml(item.episodeTitle || "")}</span>
        </div>
        <strong>${escapeHtml(item.english)}</strong>
        <p>${escapeHtml(item.turkish)}</p>
      </article>
    `).join("");
  }

  function renderStats() {
    const known = Object.values(profile.ratings || {}).filter((rating) => rating === "known").length;
    const review = getReviewLines().length;
    nodes.todayXp.textContent = `${profile.today?.xp || 0} XP`;
    nodes.knownCount.textContent = known;
    nodes.reviewStatCount.textContent = review;
    const players = room.state ? Object.values(room.state.players || {}) : [{ name: profile.name, score: profile.localDuel.score || 0 }];
    nodes.leaderRows.innerHTML = players
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .map((player) => `<div class="leader-row"><span>${escapeHtml(player.name)}</span><strong>${player.score || 0}</strong></div>`)
      .join("");
  }

  function filteredEpisodes() {
    const query = normalize(nodes.episodeSearch?.value || "");
    return episodes.filter((episode) => {
      const seasonOk = profile.season === "all" || episode.Season === Number(profile.season);
      const text = normalize(`s${episode.Season} e${episode.Episode} ${episode.Title}`);
      return seasonOk && (!query || text.includes(query));
    });
  }

  function currentEpisode() {
    return episodeMap.get(profile.episodeId) || episodes[0];
  }

  function setEpisode(id) {
    if (!episodeMap.has(id)) return;
    profile.episodeId = id;
    if (!profile.currentLineByEpisode[id]) {
      profile.currentLineByEpisode[id] = firstStudyLineId(id) || firstEpisodeLineId(id) || "";
    }
    profile.revealed = false;
    profile.editingTranslation = false;
    profile.quiz = {};
    profile.reviewLineId = "";
    profile.localDuel.lineId = "";
  }

  function getStudyLines() {
    const episode = currentEpisode();
    return (episode?.Lines || []).filter((line) => line.English && line.Turkish && profile.ratings[line.Id] !== "known");
  }

  function currentStudyLine() {
    const lines = getStudyLines();
    if (!lines.length) return null;
    let id = profile.currentLineByEpisode[profile.episodeId];
    if (!lines.some((line) => line.Id === id)) {
      id = lines[0].Id;
      profile.currentLineByEpisode[profile.episodeId] = id;
    }
    return lines.find((line) => line.Id === id) || lines[0];
  }

  function firstStudyLineId(episodeId) {
    const episode = episodeMap.get(episodeId);
    return (episode?.Lines || []).find((line) => line.English && line.Turkish && profile.ratings[line.Id] !== "known")?.Id || "";
  }

  function firstEpisodeLineId(episodeId) {
    const episode = episodeMap.get(episodeId);
    return (episode?.Lines || []).find((line) => line.English && line.Turkish)?.Id || "";
  }

  function moveStudy(delta) {
    const lines = getStudyLines();
    const line = currentStudyLine();
    if (!line) return;
    const index = lines.findIndex((item) => item.Id === line.Id);
    const next = lines[Math.min(Math.max(index + delta, 0), lines.length - 1)];
    if (next) profile.currentLineByEpisode[profile.episodeId] = next.Id;
    profile.revealed = false;
    profile.editingTranslation = false;
    saveProfile();
    renderShell();
    renderStudy();
    renderStats();
  }

  function rateCurrent(rating, xp) {
    const line = currentStudyLine();
    if (!line) return;
    profile.ratings[line.Id] = rating;
    if (rating === "hard") addVocab(line);
    addXp(xp);
    const nextId = nextStudyLineId(line.Id);
    if (nextId) profile.currentLineByEpisode[profile.episodeId] = nextId;
    profile.revealed = false;
    profile.editingTranslation = false;
    saveProfile();
    render();
  }

  function nextStudyLineId(currentId) {
    const lines = getStudyLines().filter((line) => line.Id !== currentId);
    if (!lines.length) return "";
    const episode = currentEpisode();
    const fullIndex = (episode?.Lines || []).findIndex((line) => line.Id === currentId);
    return lines.find((line) => (episode?.Lines || []).findIndex((item) => item.Id === line.Id) > fullIndex)?.Id || lines[0].Id;
  }

  function resetCurrentEpisode() {
    const episode = currentEpisode();
    (episode?.Lines || []).forEach((line) => {
      delete profile.ratings[line.Id];
    });
    profile.currentLineByEpisode[episode.Id] = firstEpisodeLineId(episode.Id);
    profile.revealed = false;
    saveProfile();
    render();
  }

  function addEpisodeToReview() {
    const episode = currentEpisode();
    (episode?.Lines || []).forEach((line) => {
      if (line.English && line.Turkish) profile.ratings[line.Id] = "review";
    });
    profile.reviewLineId = firstEpisodeLineId(episode.Id);
    saveProfile();
    render();
  }

  function getReviewLines() {
    const episode = currentEpisode();
    return (episode?.Lines || []).filter((line) => ["hard", "review"].includes(profile.ratings[line.Id]));
  }

  function chooseReviewLine() {
    const lines = getReviewLines();
    profile.reviewLineId = pick(lines)?.Id || "";
  }

  function reviewLine() {
    const lines = getReviewLines();
    if (!lines.length) return null;
    if (!lines.some((line) => line.Id === profile.reviewLineId)) chooseReviewLine();
    return lines.find((line) => line.Id === profile.reviewLineId) || lines[0];
  }

  function rateReviewLine(rating) {
    const line = reviewLine();
    if (!line) return;
    profile.ratings[line.Id] = rating;
    addXp(rating === "known" ? 8 : 4);
    chooseReviewLine();
    saveProfile();
    render();
  }

  function startTranslationEdit() {
    const line = currentStudyLine();
    if (!line || !profile.revealed) return;
    profile.editingTranslation = true;
    profile.revealed = true;
    saveProfile();
    renderStudy();
    nodes.translationInput.focus();
  }

  function saveTranslationEdit() {
    const line = currentStudyLine();
    if (!line) return;
    const value = nodes.translationInput.value.trim();
    if (!value) return;
    if (value === line.Turkish) delete profile.translationOverrides[line.Id];
    else profile.translationOverrides[line.Id] = value;
    profile.editingTranslation = false;
    saveProfile();
    render();
  }

  function restoreTranslation() {
    const line = currentStudyLine();
    if (!line) return;
    delete profile.translationOverrides[line.Id];
    profile.editingTranslation = false;
    saveProfile();
    render();
  }

  function getTranslation(line) {
    return profile.translationOverrides[line.Id] || line.Turkish || "";
  }

  function addXp(amount) {
    profile.xp = Number(profile.xp || 0) + amount;
    if (!profile.today || profile.today.date !== todayKey) profile.today = { date: todayKey, xp: 0 };
    profile.today.xp += amount;
  }

  function saveCurrentVocab() {
    const line = currentStudyLine();
    if (!line) return;
    addVocab(line);
    saveProfile();
    renderStats();
  }

  function addVocab(line) {
    if (profile.vocab.some((item) => item.id === line.Id)) return;
    const episode = currentEpisode();
    profile.vocab.unshift({
      id: line.Id,
      english: line.English,
      turkish: getTranslation(line),
      time: line.Time,
      season: episode.Season,
      episode: episode.Episode,
      episodeTitle: episode.Title,
    });
  }

  function makeQuiz() {
    const pool = quizPool();
    const line = pick(pool);
    if (!line) return;
    profile.quiz = {
      lineId: line.Id,
      options: makeOptions(line, pool),
      selected: "",
      answered: false,
      feedback: "",
    };
    saveProfile();
  }

  function answerQuiz(option) {
    if (profile.quiz.answered) return;
    const line = lineById(profile.quiz.lineId);
    const correct = line && option === getTranslation(line);
    profile.quiz.selected = option;
    profile.quiz.answered = true;
    profile.quiz.feedback = correct ? "+15 XP" : "Dogru cevap yesil";
    if (correct) addXp(15);
    saveProfile();
    renderQuiz();
    renderStats();
  }

  function quizPool() {
    const episode = currentEpisode();
    const local = (episode?.Lines || []).filter((line) => line.English && line.Turkish);
    return local.length >= 4 ? local : allLines;
  }

  function makeOptions(line, pool) {
    const options = [getTranslation(line)];
    const candidates = shuffle(pool.filter((item) => item.Turkish && item.Id !== line.Id));
    for (const item of candidates) {
      const text = getTranslation(item);
      if (options.length >= 4) break;
      if (text && !options.includes(text)) options.push(text);
    }
    return shuffle(options);
  }

  function makeLocalDuelRound() {
    const pool = quizPool();
    const line = pick(pool);
    if (!line) return;
    profile.localDuel.lineId = line.Id;
    profile.localDuel.options = makeOptions(line, pool);
    profile.localDuel.selected = "";
    profile.localDuel.answered = false;
    profile.localDuel.feedback = "";
    saveProfile();
  }

  async function nextDuelRound() {
    if (room.code) {
      try {
        await apiPost("/api/room/next", { roomCode: room.code, name: profile.name, episodeId: profile.episodeId });
        await pollRoom();
      } catch (error) {
        nodes.duelFeedback.textContent = "Yeni tur baslatilamadi.";
      }
      return;
    }
    makeLocalDuelRound();
    renderDuel();
  }

  async function answerDuel(option) {
    if (room.code) {
      if (room.state?.answers?.[profile.name]) return;
      try {
        await apiPost("/api/room/answer", { roomCode: room.code, name: profile.name, answer: option });
        await pollRoom();
      } catch (error) {
        nodes.duelFeedback.textContent = "Cevap gonderilemedi.";
      }
      return;
    }
    if (profile.localDuel.answered) return;
    const line = lineById(profile.localDuel.lineId);
    const correct = line && option === getTranslation(line);
    profile.localDuel.selected = option;
    profile.localDuel.answered = true;
    profile.localDuel.feedback = correct ? "+10" : "Dogru cevap yesil";
    if (correct) {
      profile.localDuel.score = Number(profile.localDuel.score || 0) + 10;
      addXp(6);
    }
    saveProfile();
    renderDuel();
    renderStats();
  }

  async function createRoom() {
    if (!isHosted) {
      nodes.duelFeedback.textContent = "Telefon duellosu icin server.js ile ac.";
      return;
    }
    try {
      const result = await apiPost("/api/room/create", { name: profile.name, episodeId: profile.episodeId });
      setRoom(result.room);
    } catch (error) {
      nodes.duelFeedback.textContent = "Bu yayinda oda API yok. server.js ya da FRIENDS_API_BASE gerekli.";
    }
  }

  async function joinRoom() {
    if (!isHosted) {
      nodes.duelFeedback.textContent = "Telefon duellosu icin server.js ile ac.";
      return;
    }
    const code = nodes.roomCodeInput.value.trim().toUpperCase();
    if (!code) return;
    try {
      const result = await apiPost("/api/room/join", { roomCode: code, name: profile.name });
      setRoom(result.room);
    } catch (error) {
      nodes.duelFeedback.textContent = "Odaya baglanilamadi.";
    }
  }

  function leaveRoom() {
    room.code = "";
    room.state = null;
    clearInterval(room.timer);
    room.timer = 0;
    renderDuel();
    renderStats();
  }

  function setRoom(nextState) {
    room.code = nextState.code;
    room.state = nextState;
    nodes.roomCodeInput.value = nextState.code;
    if (!room.timer) room.timer = setInterval(pollRoom, 1000);
    renderDuel();
    renderStats();
  }

  async function pollRoom() {
    if (!room.code || room.busy) return;
    room.busy = true;
    try {
      const result = await apiGet(`/api/room/state?room=${encodeURIComponent(room.code)}&name=${encodeURIComponent(profile.name)}`);
      if (result.room) {
        room.state = result.room;
        renderDuel();
        renderStats();
      }
    } catch (error) {
      nodes.duelFeedback.textContent = "Oda baglantisi bekleniyor";
    } finally {
      room.busy = false;
    }
  }

  async function apiGet(path) {
    const response = await fetch(apiUrl(path));
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async function apiPost(path, body) {
    const response = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  function apiUrl(path) {
    if (!apiBase) return path;
    return `${apiBase}${path}`;
  }

  function scoreHtml(players) {
    const list = players.length ? players : [{ name: profile.name, score: 0 }];
    return list.map((player) => `
      <div class="score-tile">
        <span>${escapeHtml(player.name)}</span>
        <strong>${player.score || 0}</strong>
      </div>
    `).join("");
  }

  function lineById(id) {
    for (const episode of episodes) {
      const found = (episode.Lines || []).find((line) => line.Id === id);
      if (found) {
        return { ...found, episodeId: episode.Id, episodeTitle: episode.Title, season: episode.Season, episode: episode.Episode };
      }
    }
    return null;
  }

  function pick(list) {
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  function shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function cleanName(value) {
    return String(value || "").trim().replace(/\s+/g, " ").slice(0, 24);
  }

  function normalize(value) {
    return String(value || "")
      .toLocaleLowerCase("tr-TR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
