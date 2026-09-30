// ─── Crystal Clips Platform Frontend Logic ────────────────────────────────────

let currentUser = null;
let currentFilter = "all";
let currentSearch = "";
let selectedFile = null;
let videoDuration = null;
let selectedTags = ["LateGame", "Solo"];

document.addEventListener("DOMContentLoaded", () => {
  initAuth();
  fetchStats();
  fetchClips();
  setupEventListeners();
});

// ── Auth Handling ────────────────────────────────────────────────────────────
async function initAuth() {
  const userArea = document.getElementById("userArea");
  const footerUserTag = document.getElementById("footerUserTag");

  try {
    const res = await fetch("/api/auth/me");
    const data = await res.json();
    currentUser = data.user;

    if (currentUser) {
      // User is logged in with Discord
      userArea.innerHTML = `
        <div class="user-menu">
          <div class="user-profile">
            <img src="${currentUser.avatarUrl || '/default-avatar.png'}" alt="${currentUser.displayName}" class="user-avatar" onerror="this.src='/default-avatar.png'">
            <span class="user-name">@${currentUser.displayName}</span>
            <span class="user-role-badge">${currentUser.role || 'MEMBER'}</span>
          </div>
          <button type="button" class="btn btn--primary btn--sm" id="headerUploadBtn">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Upload
          </button>
          <button type="button" class="btn btn--glass btn--xs" id="logoutBtn" title="Sign Out">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      `;

      document.getElementById("headerUploadBtn")?.addEventListener("click", openUploadModal);
      document.getElementById("logoutBtn")?.addEventListener("click", handleLogout);
      footerUserTag.textContent = `@${currentUser.displayName}`;

      // Update modal attribution
      document.getElementById("attrAvatar").src = currentUser.avatarUrl || "/default-avatar.png";
      document.getElementById("attrName").textContent = `@${currentUser.displayName}`;
      document.getElementById("attrRole").textContent = currentUser.role || "MEMBER";
    } else {
      // Not logged in: Show Discord Login
      userArea.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <a href="/api/auth/discord/login" class="btn btn--discord btn--sm">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
            <span>Login with Discord</span>
          </a>
          <button type="button" class="btn btn--glass btn--xs" id="devLoginBtn" title="Test sign-in">Dev Login</button>
        </div>
      `;

      document.getElementById("devLoginBtn")?.addEventListener("click", handleDevLogin);
      footerUserTag.textContent = "Guest";
    }
  } catch (e) {
    console.error("Auth init error:", e);
  }
}

async function handleLogout() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.reload();
}

async function handleDevLogin() {
  const username = prompt("Enter nickname to test with:", "starless");
  if (!username) return;
  await fetch("/api/auth/dev-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  window.location.reload();
}

// ── Stats Fetch ──────────────────────────────────────────────────────────────
async function fetchStats() {
  try {
    const res = await fetch("/api/stats");
    const data = await res.json();
    if (data.ok) {
      document.getElementById("statClips").textContent = data.totalClips || 0;
      document.getElementById("statLikes").textContent = data.totalLikes || 0;
      document.getElementById("statCreators").textContent = data.activeCreators || 0;
    }
  } catch (e) {
    console.error("Stats fetch error:", e);
  }
}

// ── Clips Fetch & Render ─────────────────────────────────────────────────────
async function fetchClips() {
  const grid = document.getElementById("clipsGrid");
  const emptyState = document.getElementById("emptyState");
  grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px;"><span class="spinner-sm"></span> Loading clips...</div>`;

  try {
    const url = new URL("/api/clips", window.location.origin);
    url.searchParams.set("filter", currentFilter);
    if (currentSearch) url.searchParams.set("search", currentSearch);

    const res = await fetch(url);
    const data = await res.json();
    const clips = data.clips || [];

    grid.innerHTML = "";

    if (clips.length === 0) {
      emptyState.style.display = "flex";
      const emptyText = document.getElementById("emptyStateText");
      if (currentSearch) {
        emptyText.textContent = `No clips matched "${currentSearch}". Try a different keyword.`;
      } else if (currentFilter === "my") {
        emptyText.textContent = "You haven't uploaded any clips yet. Drop your first 30s highlight!";
      } else {
        emptyText.textContent = "No clips available yet. Be the first to upload a 30-second clip!";
      }
      return;
    }

    emptyState.style.display = "none";
    clips.forEach((clip) => {
      grid.appendChild(createClipCardElement(clip));
    });
  } catch (e) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #f87171; padding: 30px;">Failed to load clips feed. Please check backend connection.</div>`;
  }
}

function formatDuration(sec) {
  const mins = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${mins}:${s.toString().padStart(2, "0")}`;
}

function formatTimeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function createClipCardElement(clip) {
  const card = document.createElement("article");
  card.className = "clip-card";
  card.id = `clip-${clip.id}`;

  const totalVotes = (clip.likes || 0) + (clip.dislikes || 0);
  const likeRatio = totalVotes > 0 ? Math.round((clip.likes / totalVotes) * 100) : 100;

  const roleColor = clip.uploader.roleColor || "#a855f7";

  card.innerHTML = `
    <!-- Header -->
    <div class="clip-card__header">
      <div class="clip-card__uploader">
        <img src="${clip.uploader.avatarUrl || '/default-avatar.png'}" alt="${clip.uploader.displayName}" class="clip-card__avatar" onerror="this.src='/default-avatar.png'">
        <div class="clip-card__uploader-text">
          <div class="clip-card__name-row">
            <span class="clip-card__author">${clip.uploader.displayName}</span>
            <span class="clip-card__role" style="color: ${roleColor}; background: ${roleColor}18; border: 1px solid ${roleColor}40">
              ${clip.uploader.role || 'COMMUNITY'}
            </span>
          </div>
          <span class="clip-card__time">${formatTimeAgo(clip.createdAt)}</span>
        </div>
      </div>

      <button type="button" class="clip-card__delete" title="Delete clip" data-id="${clip.id}">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      </button>
    </div>

    <!-- 16:9 Video -->
    <div class="clip-card__media">
      <video src="${clip.videoUrl}" class="clip-card__video" loop playsinline preload="metadata"></video>
      <div class="clip-card__play-overlay">
        <div class="clip-card__play-btn">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <polygon points="6 4 20 12 6 20 6 4" />
          </svg>
        </div>
      </div>
      <div class="clip-card__duration-pill">
        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span>${formatDuration(clip.duration)}</span>
      </div>
    </div>

    <!-- Content: Title & Tags -->
    <div class="clip-card__content">
      <h3 class="clip-card__title" title="${clip.title}">${clip.title}</h3>
      <div class="clip-card__tags">
        ${(clip.tags || []).map((t) => `<span class="clip-card__tag">#${t}</span>`).join("")}
      </div>
    </div>

    <!-- Footer: Likes & Dislikes -->
    <div class="clip-card__footer">
      <div class="clip-card__vote-group">
        <button type="button" class="vote-btn vote-btn--like ${clip.userVote === 'like' ? 'vote-btn--liked' : ''}" data-id="${clip.id}">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="${clip.userVote === 'like' ? 'currentColor' : 'none'}" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
          </svg>
          <span class="like-count">${clip.likes || 0}</span>
        </button>

        <button type="button" class="vote-btn vote-btn--dislike ${clip.userVote === 'dislike' ? 'vote-btn--disliked' : ''}" data-id="${clip.id}">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="${clip.userVote === 'dislike' ? 'currentColor' : 'none'}" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
          </svg>
          <span class="dislike-count">${clip.dislikes || 0}</span>
        </button>
      </div>

      <button type="button" class="share-btn" data-url="${window.location.origin}/#clip-${clip.id}">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        <span>Share</span>
      </button>
    </div>

    <!-- Ratio bar -->
    <div class="clip-card__ratio" title="${likeRatio}% positive">
      <div class="clip-card__ratio-fill" style="width: ${likeRatio}%"></div>
    </div>
  `;

  // Video play/pause interaction
  const media = card.querySelector(".clip-card__media");
  const video = card.querySelector(".clip-card__video");
  const overlay = card.querySelector(".clip-card__play-overlay");

  media.addEventListener("click", () => {
    if (video.paused) {
      video.play().then(() => {
        overlay.style.display = "none";
        video.controls = true;
      }).catch(() => {});
    } else {
      video.pause();
      overlay.style.display = "flex";
      video.controls = false;
    }
  });

  video.addEventListener("ended", () => {
    overlay.style.display = "flex";
    video.controls = false;
  });

  // Like button
  card.querySelector(".vote-btn--like").addEventListener("click", (e) => {
    e.stopPropagation();
    handleVote(clip.id, "like", card);
  });

  // Dislike button
  card.querySelector(".vote-btn--dislike").addEventListener("click", (e) => {
    e.stopPropagation();
    handleVote(clip.id, "dislike", card);
  });

  // Share button
  const shareBtn = card.querySelector(".share-btn");
  shareBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(shareBtn.dataset.url);
    const span = shareBtn.querySelector("span");
    const original = span.textContent;
    span.textContent = "Copied!";
    span.style.color = "var(--emerald)";
    setTimeout(() => {
      span.textContent = original;
      span.style.color = "";
    }, 2000);
  });

  // Delete button
  card.querySelector(".clip-card__delete").addEventListener("click", (e) => {
    e.stopPropagation();
    if (confirm(`Delete clip "${clip.title}"?`)) {
      handleDeleteClip(clip.id, card);
    }
  });

  return card;
}

// ── Voting Logic ─────────────────────────────────────────────────────────────
async function handleVote(clipId, type, card) {
  try {
    const res = await fetch(`/api/clips/${clipId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });

    const data = await res.json();
    if (data.ok) {
      const likeBtn = card.querySelector(".vote-btn--like");
      const dislikeBtn = card.querySelector(".vote-btn--dislike");
      const likeCount = card.querySelector(".like-count");
      const dislikeCount = card.querySelector(".dislike-count");
      const ratioFill = card.querySelector(".clip-card__ratio-fill");

      likeCount.textContent = data.likes;
      dislikeCount.textContent = data.dislikes;

      likeBtn.classList.toggle("vote-btn--liked", data.userVote === "like");
      dislikeBtn.classList.toggle("vote-btn--disliked", data.userVote === "dislike");

      const total = data.likes + data.dislikes;
      const ratio = total > 0 ? Math.round((data.likes / total) * 100) : 100;
      ratioFill.style.width = `${ratio}%`;
    }
  } catch (e) {
    console.error("Voting error:", e);
  }
}

// ── Delete Clip Logic ────────────────────────────────────────────────────────
async function handleDeleteClip(clipId, card) {
  try {
    const res = await fetch(`/api/clips/${clipId}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      card.style.opacity = "0";
      card.style.transform = "scale(0.95)";
      setTimeout(() => {
        card.remove();
        fetchStats();
      }, 200);
    }
  } catch (e) {
    alert("Failed to delete clip: " + e.message);
  }
}

// ── Modal & Upload Setup ─────────────────────────────────────────────────────
function openUploadModal() {
  if (!currentUser) {
    document.getElementById("authGateModal").style.display = "flex";
    return;
  }
  document.getElementById("uploadModal").style.display = "flex";
  resetUploadForm();
}

function closeAuthGateModal() {
  document.getElementById("authGateModal").style.display = "none";
}

function closeUploadModal() {
  document.getElementById("uploadModal").style.display = "none";
  resetUploadForm();
}

function resetUploadForm() {
  selectedFile = null;
  videoDuration = null;
  document.getElementById("videoFileInput").value = "";
  document.getElementById("clipTitleInput").value = "";
  document.getElementById("charCount").textContent = "0 / 90";
  document.getElementById("dropzoneEmpty").style.display = "flex";
  document.getElementById("dropzonePreview").style.display = "none";
  document.getElementById("durationMeter").style.display = "none";
  document.getElementById("errorBanner").style.display = "none";
  document.getElementById("publishBtn").disabled = true;
  const player = document.getElementById("previewVideoPlayer");
  player.pause();
  player.removeAttribute("src");
}

function handleFileSelection(file) {
  const errorBanner = document.getElementById("errorBanner");
  const errorText = document.getElementById("errorBannerText");
  const durationMeter = document.getElementById("durationMeter");
  const durationDot = document.getElementById("durationDot");
  const durationText = document.getElementById("durationText");
  const durationBadge = document.getElementById("durationBadge");
  const publishBtn = document.getElementById("publishBtn");

  errorBanner.style.display = "none";

  // Validate format
  if (!file.type.startsWith("video/") && !file.name.match(/\.(mp4|webm|mov|mkv)$/i)) {
    errorText.textContent = "Invalid file format! Only video files (.mp4, .webm, .mov) are allowed.";
    errorBanner.style.display = "flex";
    return;
  }

  selectedFile = file;
  const objectUrl = URL.createObjectURL(file);

  // Setup preview player
  const player = document.getElementById("previewVideoPlayer");
  player.src = objectUrl;
  document.getElementById("previewFileName").textContent = file.name;
  document.getElementById("dropzoneEmpty").style.display = "none";
  document.getElementById("dropzonePreview").style.display = "block";

  // Read video duration metadata
  player.onloadedmetadata = () => {
    videoDuration = player.duration;
    durationMeter.style.display = "flex";

    if (videoDuration > 30.5) {
      // OVER 30 SECONDS: BLOCK UPLOAD!
      durationMeter.className = "duration-meter duration-meter--invalid";
      durationText.innerHTML = `Duration: <strong>${videoDuration.toFixed(1)}s</strong> (Exceeds 30.0s Limit!)`;
      durationBadge.textContent = "❌ Too Long";
      errorText.textContent = `Video is ${Math.round(videoDuration)} seconds long! Clips cannot exceed 30 seconds. Please trim your clip before uploading.`;
      errorBanner.style.display = "flex";
      publishBtn.disabled = true;
    } else {
      // VALID DURATION (<= 30 SECONDS)
      durationMeter.className = "duration-meter duration-meter--valid";
      durationText.innerHTML = `Duration: <strong>${videoDuration.toFixed(1)}s</strong> / 30.0s MAX`;
      durationBadge.textContent = "✓ Valid Length";
      errorBanner.style.display = "none";

      // Pre-fill title if empty
      const titleInput = document.getElementById("clipTitleInput");
      if (!titleInput.value.trim()) {
        const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
        titleInput.value = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
        document.getElementById("charCount").textContent = `${titleInput.value.length} / 90`;
      }

      publishBtn.disabled = !document.getElementById("clipTitleInput").value.trim();
    }
  };
}

// ── Submit Clip Upload Form ──────────────────────────────────────────────────
async function handlePublishSubmit(e) {
  e.preventDefault();
  if (!selectedFile || videoDuration === null || videoDuration > 30.5) return;

  const title = document.getElementById("clipTitleInput").value.trim();
  if (!title) return;

  const publishBtn = document.getElementById("publishBtn");
  publishBtn.disabled = true;
  publishBtn.innerHTML = `<span class="spinner-sm"></span> Publishing...`;

  const formData = new FormData();
  formData.append("video", selectedFile);
  formData.append("title", title);
  formData.append("duration", videoDuration);
  formData.append("tags", JSON.stringify(selectedTags));

  try {
    const res = await fetch("/api/clips/upload", {
      method: "POST",
      body: formData,
    });

    let data;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      data = await res.json();
    } else {
      const text = await res.text();
      if (text.includes("<!DOCTYPE") || res.status === 404) {
        throw new Error(
          "Upload failed: Backend API not reachable. Make sure the Node.js server (server.js) is running on port 5000!"
        );
      }
      throw new Error(text || `Server error (${res.status})`);
    }

    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Upload failed");
    }

    closeUploadModal();
    fetchStats();
    fetchClips();
  } catch (err) {
    const errorBanner = document.getElementById("errorBanner");
    const errorText = document.getElementById("errorBannerText");
    errorText.textContent = err.message || "Failed to publish clip.";
    errorBanner.style.display = "flex";
  } finally {
    publishBtn.disabled = false;
    publishBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span>Publish Clip</span>
    `;
  }
}

// ── Event Listeners ──────────────────────────────────────────────────────────
function setupEventListeners() {
  // Modal toggles
  document.getElementById("openUploadBtn")?.addEventListener("click", openUploadModal);
  document.getElementById("emptyUploadBtn")?.addEventListener("click", openUploadModal);
  document.getElementById("closeModalBtn")?.addEventListener("click", closeUploadModal);
  document.getElementById("cancelModalBtn")?.addEventListener("click", closeUploadModal);

  // Auth gate modal listeners
  document.getElementById("closeAuthGateBtn")?.addEventListener("click", closeAuthGateModal);
  document.getElementById("authGateModal")?.addEventListener("click", (e) => {
    if (e.target.id === "authGateModal") closeAuthGateModal();
  });
  document.getElementById("authGateDevBtn")?.addEventListener("click", handleDevLogin);

  // Close modal when clicking on overlay
  document.getElementById("uploadModal")?.addEventListener("click", (e) => {
    if (e.target.id === "uploadModal") closeUploadModal();
  });

  // Dropzone file select
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("videoFileInput");

  dropzone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelection(e.target.files[0]);
    }
  });

  // Drag & drop
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dropzone--active");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dropzone--active");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dropzone--active");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  });

  // Change video button
  document.getElementById("changeVideoBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    selectedFile = null;
    videoDuration = null;
    fileInput.value = "";
    document.getElementById("dropzoneEmpty").style.display = "flex";
    document.getElementById("dropzonePreview").style.display = "none";
    document.getElementById("durationMeter").style.display = "none";
    document.getElementById("errorBanner").style.display = "none";
    document.getElementById("publishBtn").disabled = true;
  });

  // Title character counter
  const titleInput = document.getElementById("clipTitleInput");
  titleInput?.addEventListener("input", (e) => {
    document.getElementById("charCount").textContent = `${e.target.value.length} / 90`;
    const publishBtn = document.getElementById("publishBtn");
    publishBtn.disabled = !e.target.value.trim() || videoDuration === null || videoDuration > 30.5;
  });

  // Tags pill selection
  const tagPills = document.querySelectorAll(".tag-pill");
  tagPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      const tag = pill.dataset.tag;
      if (selectedTags.includes(tag)) {
        selectedTags = selectedTags.filter((t) => t !== tag);
        pill.classList.remove("tag-pill--active");
      } else {
        selectedTags.push(tag);
        pill.classList.add("tag-pill--active");
      }
    });
  });

  // Upload Form Submit
  document.getElementById("uploadForm")?.addEventListener("submit", handlePublishSubmit);

  // Filter tabs
  const filterPills = document.querySelectorAll("#filterPills .pill");
  filterPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      filterPills.forEach((p) => p.classList.remove("pill--active"));
      pill.classList.add("pill--active");
      currentFilter = pill.dataset.filter;
      fetchClips();
    });
  });

  // Search input
  const searchInput = document.getElementById("searchInput");
  const clearBtn = document.getElementById("clearSearchBtn");

  searchInput?.addEventListener("input", (e) => {
    currentSearch = e.target.value.trim();
    clearBtn.style.display = currentSearch ? "block" : "none";
    fetchClips();
  });

  clearBtn?.addEventListener("click", () => {
    searchInput.value = "";
    currentSearch = "";
    clearBtn.style.display = "none";
    fetchClips();
  });
}
