require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const cookieParser = require("cookie-parser");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 5000;

// Enable trust proxy for Cloudflare (handles cf-connecting-ip, x-forwarded-proto HTTPS)
app.set("trust proxy", true);

// Discord OAuth Configuration
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || "1548286557532725258";
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "";

// Cloudflare & Custom Domain dynamic redirect URI resolver
function getRedirectUri(req) {
  if (process.env.DISCORD_REDIRECT_URI && !process.env.DISCORD_REDIRECT_URI.includes("localhost")) {
    return process.env.DISCORD_REDIRECT_URI;
  }
  if (process.env.PUBLIC_DOMAIN) {
    const base = process.env.PUBLIC_DOMAIN.replace(/\/+$/, "");
    return `${base}/api/auth/discord/callback`;
  }
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.get("host") || `localhost:${PORT}`;
  return `${proto}://${host}/api/auth/discord/callback`;
}

// Ensure data and uploads directories exist
const UPLOADS_DIR = path.join(__dirname, "uploads", "clips");
const DATA_DIR = path.join(__dirname, "data");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

// JSON Database helper
const CLIPS_FILE = path.join(DATA_DIR, "clips.json");
const VOTES_FILE = path.join(DATA_DIR, "votes.json");

function readJsonFile(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e);
    return defaultValue;
  }
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error(`Error writing ${filePath}:`, e);
  }
}

// In-memory / persistent stores
let clips = readJsonFile(CLIPS_FILE, []);
let votes = readJsonFile(VOTES_FILE, {}); // { [clipId]: { [userId]: "like" | "dislike" } }

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser("crystal_clips_secret_salt"));

// Static files
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads"), { acceptRanges: true }));

// Multer Storage for Video Clips
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || ".mp4";
    const uniqueSuffix = Date.now() + "_" + Math.random().toString(36).substring(2, 8);
    cb(null, `clip_${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max file size
  fileFilter: (req, file, cb) => {
    const allowedExts = [".mp4", ".webm", ".mov", ".mkv"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype.startsWith("video/") || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only video files (.mp4, .webm, .mov) are allowed!"), false);
    }
  },
});

// Helper: Extract current user from session cookie
function getSessionUser(req) {
  try {
    const token = req.cookies?.crystal_user || req.headers["x-user-session"];
    if (!token) return null;
    return JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
  } catch (e) {
    return null;
  }
}

function getClientIdentifier(req) {
  const user = getSessionUser(req);
  if (user && user.id) return `user_${user.id}`;
  const cfIp =
    req.headers["cf-connecting-ip"] ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.ip;
  return `ip_${cfIp || "anonymous"}`;
}

// ─── Discord OAuth2 Endpoints ────────────────────────────────────────────────

// Redirect to Discord OAuth dialog
app.get("/api/auth/discord/login", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.cookie("oauth_state", state, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    maxAge: 600000,
  });

  const redirectUri = getRedirectUri(req);

  const discordAuthUrl =
    `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=identify` +
    `&state=${state}`;

  res.redirect(discordAuthUrl);
});

// Discord OAuth callback
app.get("/api/auth/discord/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.redirect("/?error=missing_code");
  }

  const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
  const redirectUri = getRedirectUri(req);

  try {
    if (!CLIENT_SECRET) {
      // If client secret is not configured yet, provide seamless mock auth with Discord user info
      const mockUser = {
        id: "1548286557532725258",
        username: "starless",
        displayName: "starless",
        avatar: null,
        avatarUrl: "/default-avatar.png",
        role: "DEVELOPER",
        roleColor: "#a855f7",
      };

      const sessionToken = Buffer.from(JSON.stringify(mockUser)).toString("base64");
      res.cookie("crystal_user", sessionToken, {
        httpOnly: false,
        secure: isHttps,
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 86400 * 1000,
      });
      return res.redirect("/?login=success");
    }

    // Exchange code for Access Token
    const tokenParams = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code: code.toString(),
      redirect_uri: redirectUri,
    });

    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      body: tokenParams,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Discord token exchange failed:", errText);
      return res.redirect("/?error=token_exchange_failed");
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // Fetch Discord User Profile
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      return res.redirect("/?error=fetch_user_failed");
    }

    const discordUser = await userRes.json();

    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=128`
      : "/default-avatar.png";

    const userProfile = {
      id: discordUser.id,
      username: discordUser.username,
      displayName: discordUser.global_name || discordUser.username,
      avatar: discordUser.avatar,
      avatarUrl,
      role: discordUser.id === "1548286557532725258" ? "DEVELOPER" : "COMMUNITY",
      roleColor: "#a855f7",
    };

    const sessionToken = Buffer.from(JSON.stringify(userProfile)).toString("base64");
    res.cookie("crystal_user", sessionToken, {
      httpOnly: false,
      secure: isHttps,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 86400 * 1000,
    });

    res.redirect("/?login=success");
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.redirect("/?error=oauth_internal_error");
  }
});

// Quick dev login (for testing without live Discord secret)
app.post("/api/auth/dev-login", (req, res) => {
  const { username = "starless" } = req.body;
  const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
  const userProfile = {
    id: "dev_" + Math.random().toString(36).substring(2, 8),
    username,
    displayName: username,
    avatarUrl: "/default-avatar.png",
    role: "DEVELOPER",
    roleColor: "#a855f7",
  };

  const sessionToken = Buffer.from(JSON.stringify(userProfile)).toString("base64");
  res.cookie("crystal_user", sessionToken, {
    httpOnly: false,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 86400 * 1000,
  });
  res.json({ ok: true, user: userProfile, token: sessionToken });
});

// Get current session user
app.get("/api/auth/me", (req, res) => {
  const user = getSessionUser(req);
  res.json({ user });
});

// Logout
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("crystal_user", { path: "/" });
  res.json({ ok: true });
});

// ─── Clips API Endpoints ─────────────────────────────────────────────────────

// GET /api/clips - Retrieve all community clips
app.get("/api/clips", (req, res) => {
  const clientId = getClientIdentifier(req);
  const user = getSessionUser(req);
  const { filter = "all", search = "", tag = "" } = req.query;

  let result = clips.map((clip) => {
    const clipVotes = votes[clip.id] || {};
    const userVote = clipVotes[clientId] || (user ? clipVotes[`user_${user.id}`] : null) || null;

    let likesCount = 0;
    let dislikesCount = 0;
    for (const v of Object.values(clipVotes)) {
      if (v === "like") likesCount++;
      if (v === "dislike") dislikesCount++;
    }

    return {
      ...clip,
      likes: Math.max(clip.likes || 0, likesCount),
      dislikes: Math.max(clip.dislikes || 0, dislikesCount),
      userVote,
    };
  });

  // Search filter
  if (search) {
    const q = search.toString().toLowerCase();
    result = result.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.uploader.displayName.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  // Tag filter
  if (tag) {
    const t = tag.toString().toLowerCase();
    result = result.filter((c) => c.tags.some((tg) => tg.toLowerCase() === t));
  }

  // Tab filter
  if (filter === "trending") {
    result.sort((a, b) => b.likes - a.likes);
  } else if (filter === "my" && user) {
    result = result.filter((c) => c.uploader.id === user.id);
  } else {
    // Default: Latest
    result.sort((a, b) => b.createdAt - a.createdAt);
  }

  res.json({ ok: true, clips: result, total: result.length });
});

// POST /api/clips/upload - Upload a new clip (Max 30 seconds!)
app.post("/api/clips/upload", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: "No video file provided." });
  }

  const user = getSessionUser(req);
  if (!user) {
    try {
      fs.unlinkSync(req.file.path);
    } catch (e) {}
    return res.status(401).json({
      ok: false,
      error: "Authentication required: Please log in with Discord before uploading clips.",
    });
  }

  const { title, duration, tags } = req.body;

  if (!title || !title.trim()) {
    // Delete uploaded file if title is invalid
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ ok: false, error: "Clip title is required." });
  }

  const durationNum = parseFloat(duration) || 0;
  // STRICT RULE: Max 30 seconds!
  if (durationNum > 30.5) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({
      ok: false,
      error: `Video exceeds 30 seconds limit (${durationNum.toFixed(1)}s)! Clips cannot be longer than 30s.`,
    });
  }

  let parsedTags = ["LateGame", "Solo"];
  if (tags) {
    try {
      parsedTags = Array.isArray(tags) ? tags : JSON.parse(tags);
    } catch {
      parsedTags = tags.toString().split(",").map((t) => t.trim()).filter(Boolean);
    }
  }

  const newClip = {
    id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    title: title.trim().substring(0, 90),
    duration: Math.round(durationNum * 10) / 10,
    videoUrl: `/uploads/clips/${req.file.filename}`,
    fileName: req.file.originalname,
    fileSize: req.file.size,
    uploader: {
      id: user?.id || `anon_${Date.now()}`,
      displayName: user?.displayName || user?.username || "Crystal Player",
      username: user?.username || "player",
      avatarUrl: user?.avatarUrl || "/default-avatar.png",
      role: user?.role || "COMMUNITY",
      roleColor: user?.roleColor || "#a855f7",
    },
    createdAt: Date.now(),
    likes: 0,
    dislikes: 0,
    tags: parsedTags,
    views: 1,
  };

  clips.unshift(newClip);
  writeJsonFile(CLIPS_FILE, clips);

  res.status(201).json({ ok: true, clip: newClip });
});

// POST /api/clips/:id/vote - Toggle Like or Dislike
app.post("/api/clips/:id/vote", (req, res) => {
  const { id } = req.params;
  const { type } = req.body; // "like" or "dislike"
  const clientId = getClientIdentifier(req);

  const clip = clips.find((c) => c.id === id);
  if (!clip) {
    return res.status(404).json({ ok: false, error: "Clip not found" });
  }

  if (!votes[id]) votes[id] = {};

  const currentVote = votes[id][clientId];
  let finalVote = null;

  if (type === "like") {
    if (currentVote === "like") {
      delete votes[id][clientId];
      clip.likes = Math.max(0, (clip.likes || 1) - 1);
    } else {
      if (currentVote === "dislike") {
        clip.dislikes = Math.max(0, (clip.dislikes || 1) - 1);
      }
      votes[id][clientId] = "like";
      clip.likes = (clip.likes || 0) + 1;
      finalVote = "like";
    }
  } else if (type === "dislike") {
    if (currentVote === "dislike") {
      delete votes[id][clientId];
      clip.dislikes = Math.max(0, (clip.dislikes || 1) - 1);
    } else {
      if (currentVote === "like") {
        clip.likes = Math.max(0, (clip.likes || 1) - 1);
      }
      votes[id][clientId] = "dislike";
      clip.dislikes = (clip.dislikes || 0) + 1;
      finalVote = "dislike";
    }
  }

  writeJsonFile(CLIPS_FILE, clips);
  writeJsonFile(VOTES_FILE, votes);

  res.json({
    ok: true,
    likes: clip.likes,
    dislikes: clip.dislikes,
    userVote: finalVote,
  });
});

// DELETE /api/clips/:id - Delete a clip
app.delete("/api/clips/:id", (req, res) => {
  const { id } = req.params;
  const index = clips.findIndex((c) => c.id === id);

  if (index === -1) {
    return res.status(404).json({ ok: false, error: "Clip not found" });
  }

  const clip = clips[index];

  // Try to remove video file from disk
  if (clip.videoUrl) {
    const filename = path.basename(clip.videoUrl);
    const fullPath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch (e) {
        console.warn("Failed to delete video file:", e);
      }
    }
  }

  clips.splice(index, 1);
  delete votes[id];

  writeJsonFile(CLIPS_FILE, clips);
  writeJsonFile(VOTES_FILE, votes);

  res.json({ ok: true, deletedId: id });
});

// GET /api/stats - Global statistics
app.get("/api/stats", (req, res) => {
  const totalClips = clips.length;
  let totalLikes = 0;
  const creators = new Set();

  for (const c of clips) {
    totalLikes += c.likes || 0;
    if (c.uploader?.displayName) creators.add(c.uploader.displayName);
  }

  res.json({
    ok: true,
    totalClips,
    totalLikes,
    activeCreators: creators.size,
    lateGameArenaStatus: "ONLINE READY",
    serverStatus: "Operational",
  });
});

// Fallback: serve frontend
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start Server
app.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(`  ✦ CRYSTAL CLIPS PLATFORM & API SERVER`);
  console.log(`  URL: http://localhost:${PORT}`);
  const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
  console.log(`=================================================\n`);
});
