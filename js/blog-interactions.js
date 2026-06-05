const interactionConfig = {
  repo: "INTMAX-jpg/INTMAX-jpg.github.io",
  likeStorageKey: "ZIXI_BLOG_LOCAL_LIKES",
  siteLikeStorageKey: "ZIXI_SITE_LIKE_COUNT",
  siteLikeClientKey: "ZIXI_SITE_LIKE_CLIENT_ID",
  siteLikesTable: "site_likes",
  commentsTable: "post_comments",
  siteCommentsTable: "site_comments",
  siteCommentLikesTable: "site_comment_likes",
};

const authConfig = {
  supabaseUrl: "https://lfjmmzvabkpneglaevvi.supabase.co",
  supabaseKey: "sb_publishable_H5yhsQ854nw7VJuQXS1EJg_PYdGaMyC",
};

let supabaseClientPromise = null;
let currentSession = null;
let authInitialized = false;
let authListenerInitialized = false;
let activePostContext = null;
let galleryPreloadStarted = false;
const galleryNoteIntroStorageKey = "ZIXI_GALLERY_NOTE_INTRO_SEEN";
const homeNoteIntroStorageKey = "ZIXI_HOME_NOTE_INTRO_SEEN";
let galleryNoteIntroTimer = null;
let galleryNoteIntroCleanupTimer = null;
let homeNoteIntroTimer = null;
let homeNoteIntroCleanupTimer = null;
let homeNoteScrollY = 0;
let homeNoteInteractionLocked = false;

function isGalleryPage() {
  return window.location.pathname.startsWith("/masonry");
}

function hasSeenGalleryNoteIntro() {
  try {
    return sessionStorage.getItem(galleryNoteIntroStorageKey) === "true";
  } catch (error) {
    return false;
  }
}

function markGalleryNoteIntroSeen() {
  try {
    sessionStorage.setItem(galleryNoteIntroStorageKey, "true");
  } catch (error) {}
}

const galleryNoteText = "\u6444\u5f71<br>\u5c31\u50cf\u662f\u4ece\u8fd9\u4e16\u754c\u88c1\u4e0b\u4e86\u4e00\u5e27<br>\u5e26\u7ed9\u5239\u90a3\u7a7f\u8d8a\u65f6\u7a7a\u7684\u529b\u91cf~<br><span class=\"gallery-note-signature\">--Zixi</span>";

function removeGalleryNoteButton() {
  document.querySelectorAll(".gallery-note-reopen").forEach((element) => element.remove());
  document.querySelectorAll(".gallery-note-title-anchor").forEach((element) => {
    element.classList.remove("gallery-note-title-anchor");
  });
}

function getGalleryNoteButtonHost() {
  const headings = Array.from(document.querySelectorAll(".page-template-content h1, .page-template-content h2"));
  return headings.find((heading) => heading.textContent.includes("于平凡中记录闪光")) || null;
}

function ensureGalleryNoteButton() {
  if (!isGalleryPage() || document.querySelector(".gallery-note-reopen")) return;

  const host = getGalleryNoteButtonHost();
  const button = document.createElement("button");
  button.className = "gallery-note-reopen";
  button.type = "button";
  button.setAttribute("aria-label", "重新查看相册便签");
  button.innerHTML = '<i class="fa-regular fa-envelope" aria-hidden="true"></i>';
  button.addEventListener("click", () => {
    removeGalleryNoteButton();
    showGalleryNoteIntro({ replay: true });
  });

  if (host) {
    host.classList.add("gallery-note-title-anchor");
    host.appendChild(button);
  } else {
    document.body.appendChild(button);
  }
}

function clearGalleryNoteIntro() {
  window.clearTimeout(galleryNoteIntroTimer);
  window.clearTimeout(galleryNoteIntroCleanupTimer);
  galleryNoteIntroTimer = null;
  galleryNoteIntroCleanupTimer = null;
  document.querySelectorAll(".gallery-note-intro").forEach((element) => element.remove());
  document.body.classList.remove("gallery-note-intro-active");
  removeGalleryNoteButton();
}

function createGalleryNoteIntroOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "gallery-note-intro";
  overlay.setAttribute("aria-live", "polite");

  const paper = document.createElement("div");
  paper.className = "gallery-note-paper";
  paper.setAttribute("role", "status");

  const copy = document.createElement("p");
  copy.innerHTML = galleryNoteText;

  paper.appendChild(copy);
  overlay.appendChild(paper);
  return overlay;
}

function getGalleryNoteExitTargetRect() {
  const button = document.querySelector(".gallery-note-reopen");
  if (button) return button.getBoundingClientRect();

  const host = getGalleryNoteButtonHost();
  if (!host) return null;

  const rect = host.getBoundingClientRect();
  const buttonSize = 38;
  const gap = 12;
  const targetLeft = Math.min(rect.right + gap, window.innerWidth - buttonSize - 16);
  return {
    left: targetLeft,
    right: targetLeft + buttonSize,
    top: rect.top + (rect.height - buttonSize) / 2,
    bottom: rect.top + (rect.height + buttonSize) / 2,
    width: buttonSize,
    height: buttonSize,
  };
}

function setGalleryNoteExitTarget(overlay) {
  const paper = overlay?.querySelector(".gallery-note-paper");
  const targetRect = getGalleryNoteExitTargetRect();
  if (!paper || !targetRect) return;

  const paperRect = paper.getBoundingClientRect();
  const paperCenterX = paperRect.left + paperRect.width / 2;
  const paperCenterY = paperRect.top + paperRect.height / 2;
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;

  overlay.style.setProperty("--gallery-note-exit-x", `${Math.round(targetCenterX - paperCenterX)}px`);
  overlay.style.setProperty("--gallery-note-exit-y", `${Math.round(targetCenterY - paperCenterY)}px`);
}

function showGalleryNoteIntro(options = {}) {
  if (!isGalleryPage()) {
    clearGalleryNoteIntro();
    return;
  }

  if (document.querySelector(".gallery-note-intro")) return;
  if (!options.replay && hasSeenGalleryNoteIntro()) {
    ensureGalleryNoteButton();
    return;
  }

  markGalleryNoteIntroSeen();
  removeGalleryNoteButton();

  const overlay = createGalleryNoteIntroOverlay();
  document.body.appendChild(overlay);
  document.body.classList.add("gallery-note-intro-active");

  galleryNoteIntroTimer = window.setTimeout(() => {
    ensureGalleryNoteButton();
    setGalleryNoteExitTarget(overlay);
    overlay.classList.add("is-leaving");
  }, 6500);

  galleryNoteIntroCleanupTimer = window.setTimeout(() => {
    overlay.remove();
    document.body.classList.remove("gallery-note-intro-active");
    ensureGalleryNoteButton();
  }, 7350);
}
function hasSeenHomeNoteIntro() {
  try {
    return sessionStorage.getItem(homeNoteIntroStorageKey) === "true";
  } catch (error) {
    return false;
  }
}

function markHomeNoteIntroSeen() {
  try {
    sessionStorage.setItem(homeNoteIntroStorageKey, "true");
  } catch (error) {}
}

function getHomeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "早上好！";
  if (hour < 18) return "下午好！";
  return "晚上好！";
}

function preventHomeNoteScroll(event) {
  event.preventDefault();
}

function preventHomeNoteKeyboardScroll(event) {
  const blockedKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", " "];
  if (blockedKeys.includes(event.key)) event.preventDefault();
}

function lockHomeNoteInteraction() {
  if (homeNoteInteractionLocked) return;
  homeNoteInteractionLocked = true;
  homeNoteScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  document.documentElement.classList.add("home-note-interaction-lock");
  document.body.style.position = "fixed";
  document.body.style.top = `-${homeNoteScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
  window.addEventListener("wheel", preventHomeNoteScroll, { passive: false });
  window.addEventListener("touchmove", preventHomeNoteScroll, { passive: false });
  window.addEventListener("keydown", preventHomeNoteKeyboardScroll, true);
}

function unlockHomeNoteInteraction() {
  if (!homeNoteInteractionLocked) return;
  homeNoteInteractionLocked = false;
  window.removeEventListener("wheel", preventHomeNoteScroll, { passive: false });
  window.removeEventListener("touchmove", preventHomeNoteScroll, { passive: false });
  window.removeEventListener("keydown", preventHomeNoteKeyboardScroll, true);
  document.documentElement.classList.remove("home-note-interaction-lock");
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  window.scrollTo(0, homeNoteScrollY);
}

function enterHomeNotePreroll() {
  document.documentElement.classList.add("home-note-preroll");
  lockHomeNoteInteraction();
}

function exitHomeNotePreroll() {
  document.documentElement.classList.remove("home-note-preroll");
  unlockHomeNoteInteraction();
}

function clearHomeNoteIntro() {
  window.clearTimeout(homeNoteIntroTimer);
  window.clearTimeout(homeNoteIntroCleanupTimer);
  homeNoteIntroTimer = null;
  homeNoteIntroCleanupTimer = null;
  document.querySelectorAll(".home-note-intro").forEach((element) => element.remove());
  document.body.classList.remove("home-note-intro-active");
  exitHomeNotePreroll();
}

function createHomeNoteIntroOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "home-note-intro";
  overlay.setAttribute("aria-live", "polite");

  const paper = document.createElement("div");
  paper.className = "home-note-paper";
  paper.setAttribute("role", "status");

  const copy = document.createElement("p");
  const greeting = document.createElement("span");
  const welcome = document.createElement("span");
  greeting.textContent = getHomeGreeting();
  welcome.textContent = "欢迎到访 Zixi 的自留地";
  copy.appendChild(greeting);
  copy.appendChild(welcome);

  paper.appendChild(copy);
  overlay.appendChild(paper);
  return overlay;
}

function showHomeNoteIntro() {
  if (!isHomePage()) {
    clearHomeNoteIntro();
    return;
  }

  if (hasSeenHomeNoteIntro() || document.querySelector(".home-note-intro")) {
    exitHomeNotePreroll();
    return;
  }
  enterHomeNotePreroll();
  markHomeNoteIntroSeen();

  const overlay = createHomeNoteIntroOverlay();
  document.body.appendChild(overlay);
  document.body.classList.add("home-note-intro-active");

  homeNoteIntroTimer = window.setTimeout(() => {
    overlay.classList.add("is-leaving");
  }, 5000);

  homeNoteIntroCleanupTimer = window.setTimeout(() => {
    overlay.remove();
    document.body.classList.remove("home-note-intro-active");
    exitHomeNotePreroll();
  }, 5850);
}
function canPreloadGallery() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return true;
  return !connection.saveData && !String(connection.effectiveType || "").endsWith("2g");
}

function normalizeGalleryPreloadFiles(files) {
  if (!Array.isArray(files)) return [];
  return files
    .map((file) => {
      if (typeof file === "string") {
        return `/images/gallery_compress/${encodeURIComponent(file)}`;
      }
      return file?.url || null;
    })
    .filter(Boolean);
}

async function preloadGalleryImage(url) {
  try {
    const response = await fetch(url, { cache: "force-cache", priority: "low" });
    if (!response.ok) return;
    await response.blob();
  } catch (error) {}
}

async function runGalleryPreloadQueue(urls) {
  const queue = urls.slice();
  const worker = async () => {
    while (queue.length && canPreloadGallery()) {
      await preloadGalleryImage(queue.shift());
    }
  };

  await Promise.all([worker(), worker()]);
}

async function startGalleryPreload() {
  if (galleryPreloadStarted || isGalleryPage() || !canPreloadGallery()) return;
  galleryPreloadStarted = true;

  try {
    const response = await fetch("/images/gallery_compress/photos.json", {
      cache: "force-cache",
      priority: "low",
    });
    if (!response.ok) return;
    const urls = normalizeGalleryPreloadFiles(await response.json());
    await runGalleryPreloadQueue(urls);
  } catch (error) {}
}

function scheduleGalleryPreload() {
  if (galleryPreloadStarted || isGalleryPage() || !canPreloadGallery()) return;
  const begin = () => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(startGalleryPreload, { timeout: 2500 });
    } else {
      window.setTimeout(startGalleryPreload, 1200);
    }
  };

  if (document.readyState === "complete") {
    begin();
  } else {
    window.addEventListener("load", begin, { once: true });
  }
}
function getSupabaseClient() {
  if (!supabaseClientPromise) {
    supabaseClientPromise = import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm")
      .then(({ createClient }) => createClient(authConfig.supabaseUrl, authConfig.supabaseKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "pkce",
        },
      }));
  }

  return supabaseClientPromise;
}

function getUserDisplayName(user) {
  if (!user) return "";
  return user.user_metadata?.user_name || user.user_metadata?.preferred_username || user.user_metadata?.name || user.email || "GitHub User";
}

function getUserAvatar(user) {
  return user?.user_metadata?.avatar_url || user?.user_metadata?.picture || "";
}

function createAuthControlItem(className) {
  const item = document.createElement("li");
  item.className = className;
  item.innerHTML = `
    <button class="blog-auth-button" type="button" data-auth-action="sign-in">
      <i class="fa-brands fa-github fa-fw"></i>
      <span data-auth-label>LOGIN</span>
    </button>
    <div class="blog-auth-menu" hidden>
      <div class="blog-auth-profile">
        <span class="blog-auth-avatar" aria-hidden="true"></span>
        <span class="blog-auth-name">未登录</span>
      </div>
      <button class="blog-auth-signout" type="button">退出登录</button>
    </div>
  `;

  item.querySelector(".blog-auth-button").addEventListener("click", handleAuthButtonClick);
  item.querySelector(".blog-auth-signout").addEventListener("click", signOut);

  return item;
}

function injectAuthControls() {
  const navbarList = document.querySelector(".navbar-list");
  if (navbarList && !document.querySelector(".blog-auth-nav")) {
    navbarList.appendChild(createAuthControlItem("navbar-item blog-auth-nav"));
  }

  const drawerList = document.querySelector(".drawer-navbar-list");
  if (drawerList && !document.querySelector(".blog-auth-drawer")) {
    drawerList.appendChild(createAuthControlItem("drawer-navbar-item text-base my-1.5 flex flex-col w-full blog-auth-drawer"));
  }
}

async function handleAuthButtonClick(event) {
  if (currentSession?.user) {
    const authItem = event.currentTarget.closest(".blog-auth-nav, .blog-auth-drawer");
    const menu = authItem?.querySelector(".blog-auth-menu");
    if (menu) menu.hidden = !menu.hidden;
    return;
  }

  await signInWithGitHub();
}

async function signInWithGitHub() {
  const supabase = await getSupabaseClient();
  await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: window.location.href.split("#")[0],
      scopes: "read:user user:email",
    },
  });
}

async function signOut() {
  const supabase = await getSupabaseClient();
  await supabase.auth.signOut();
  currentSession = null;
  updateAuthUI(null);
}

function updateAuthUI(session) {
  const user = session?.user || null;
  const authButtons = document.querySelectorAll(".blog-auth-button");
  const authLabels = document.querySelectorAll("[data-auth-label]");
  const authMenus = document.querySelectorAll(".blog-auth-menu");
  const authNames = document.querySelectorAll(".blog-auth-name");
  const authAvatars = document.querySelectorAll(".blog-auth-avatar");

  if (!authButtons.length) return;

  if (!user) {
    authButtons.forEach((button) => {
      button.dataset.authAction = "sign-in";
      button.classList.remove("is-signed-in");
    });
    authLabels.forEach((label) => {
      label.textContent = "LOGIN";
    });
    authMenus.forEach((menu) => {
      menu.hidden = true;
    });
    authNames.forEach((name) => {
      name.textContent = "未登录";
    });
    authAvatars.forEach((avatar) => {
      avatar.style.backgroundImage = "";
      avatar.textContent = "";
    });
    return;
  }

  const name = getUserDisplayName(user);
  const avatar = getUserAvatar(user);

  authButtons.forEach((button) => {
    button.dataset.authAction = "profile";
    button.classList.add("is-signed-in");
  });
  authLabels.forEach((label) => {
    label.textContent = name;
  });
  authNames.forEach((nameNode) => {
    nameNode.textContent = name;
  });
  authAvatars.forEach((avatarNode) => {
    avatarNode.textContent = avatar ? "" : name.slice(0, 1).toUpperCase();
    avatarNode.style.backgroundImage = avatar ? `url("${avatar}")` : "";
  });
}

async function initAuth() {
  injectAuthControls();
  updateAuthUI(currentSession);

  if (authInitialized) return;
  authInitialized = true;

  try {
    const supabase = await getSupabaseClient();
    const { data } = await supabase.auth.getSession();
    currentSession = data.session;
    updateAuthUI(currentSession);

    if (!authListenerInitialized) {
      authListenerInitialized = true;
      supabase.auth.onAuthStateChange((_event, session) => {
        currentSession = session;
        updateAuthUI(session);
        randomizeHomeHeroQuote();
        if (activePostContext) renderCommentArea(activePostContext, true);
        initSiteGuestbook(true);
      });
    }
  } catch (error) {
    console.warn("Supabase Auth 初始化失败", error);
    authInitialized = false;
  }
}

function getPostContext() {
  const article = document.querySelector(".post-page-container .article-content-container");
  const title = document.querySelector(".article-title h1");

  if (!article || !title) return null;

  const path = window.location.pathname.replace(/\/index\.html$/, "/");
  const normalizedPath = path.endsWith("/") ? path : `${path}/`;

  return {
    article,
    title: title.textContent.trim(),
    path: normalizedPath,
    url: `${window.location.origin}${normalizedPath}`,
  };
}

function readLikes() {
  try {
    return JSON.parse(localStorage.getItem(interactionConfig.likeStorageKey)) || {};
  } catch (error) {
    return {};
  }
}

function writeLikes(likes) {
  localStorage.setItem(interactionConfig.likeStorageKey, JSON.stringify(likes));
}

function isPostLiked(postPath) {
  return Boolean(readLikes()[postPath]);
}

function setPostLiked(postPath, liked) {
  const likes = readLikes();
  if (liked) {
    likes[postPath] = {
      likedAt: new Date().toISOString(),
    };
  } else {
    delete likes[postPath];
  }
  writeLikes(likes);
}

function updateLikeState(postPath, liked) {
  const likeButtons = document.querySelectorAll("[data-post-like-button]");
  const likeCounts = document.querySelectorAll("[data-post-like-count]");

  likeButtons.forEach((button) => {
    button.classList.toggle("is-liked", liked);
    button.setAttribute("aria-pressed", liked ? "true" : "false");
    button.title = liked ? "取消喜欢" : "喜欢这篇文章";

    const icon = button.querySelector("i.fa-heart");
    if (icon) {
      icon.classList.toggle("fa-solid", liked);
      icon.classList.toggle("fa-regular", !liked);
    }
  });

  likeCounts.forEach((count) => {
    count.textContent = liked ? "1" : "0";
  });
}

function toggleLike(postPath) {
  const nextLiked = !isPostLiked(postPath);
  setPostLiked(postPath, nextLiked);
  updateLikeState(postPath, nextLiked);
}

function createIssueUrl(context) {
  const title = encodeURIComponent(`Comment: ${context.title}`);
  const body = encodeURIComponent([
    `Page: ${context.url}`,
    "",
    "Write your comment here:",
    "",
  ].join("\n"));

  return `https://github.com/${interactionConfig.repo}/issues/new?title=${title}&body=${body}&labels=comment`;
}

function escapeHTML(value) {
  const element = document.createElement("div");
  element.textContent = value || "";
  return element.innerHTML;
}

function formatCommentTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function renderUserAvatar(userName, avatarUrl) {
  if (avatarUrl) {
    return `<span class="supabase-comment-avatar" style="background-image:url('${escapeHTML(avatarUrl)}')"></span>`;
  }

  return `<span class="supabase-comment-avatar">${escapeHTML((userName || "U").slice(0, 1).toUpperCase())}</span>`;
}

function createEngagementPanel(context) {
  if (document.querySelector(".post-engagement-panel")) return;

  const articleContent = context.article.querySelector(".article-content");
  if (!articleContent) return;

  const panel = document.createElement("div");
  panel.className = "post-engagement-panel";
  panel.innerHTML = `
    <button class="post-action-button post-like-button" type="button" data-post-like-button aria-pressed="false">
      <i class="fa-regular fa-heart"></i>
      <span>喜欢</span>
      <span class="post-action-count" data-post-like-count>0</span>
    </button>
    <button class="post-action-button post-comment-jump" type="button">
      <i class="fa-regular fa-comments"></i>
      <span>评论</span>
    </button>
    <a class="post-action-button post-github-comment" href="${createIssueUrl(context)}" target="_blank" rel="noopener">
      <i class="fa-brands fa-github"></i>
      <span>GitHub 留言</span>
    </a>
  `;

  articleContent.insertAdjacentElement("afterend", panel);

  panel.querySelector("[data-post-like-button]").addEventListener("click", () => {
    toggleLike(context.path);
  });

  panel.querySelector(".post-comment-jump").addEventListener("click", () => {
    jumpToComments();
  });
}

function enhancePostTools(context) {
  const toolsList = document.querySelector(".post-tools .article-tools-list");
  const commentTool = document.querySelector(".post-tools .go-comment");

  if (!toolsList || document.querySelector(".post-like-tool")) return;

  const likeTool = document.createElement("li");
  likeTool.className = "post-like-tool";
  likeTool.dataset.postLikeButton = "true";
  likeTool.setAttribute("role", "button");
  likeTool.setAttribute("tabindex", "0");
  likeTool.setAttribute("aria-pressed", "false");
  likeTool.title = "喜欢这篇文章";
  likeTool.innerHTML = '<i class="fa-regular fa-heart"></i>';

  likeTool.addEventListener("click", () => toggleLike(context.path));
  likeTool.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleLike(context.path);
    }
  });

  if (commentTool) {
    toolsList.insertBefore(likeTool, commentTool);
  } else {
    toolsList.appendChild(likeTool);
  }
}

function jumpToComments() {
  const target = document.querySelector("#comment-anchor");
  if (!target) return;

  const top = target.getBoundingClientRect().top + window.scrollY - 20;
  window.scrollTo({
    top,
    behavior: "smooth",
  });
}

function renderCommentArea(context, force = false) {
  const container = document.querySelector(".comments-container");
  if (!container) return;
  if (container.dataset.blogCommentsReady === "true" && !force) return;

  activePostContext = context;
  const user = currentSession?.user || null;
  const displayName = getUserDisplayName(user);
  const avatar = getUserAvatar(user);

  container.dataset.blogCommentsReady = "true";
  container.innerHTML = `
    <div id="comment-anchor" class="w-full h-2.5"></div>
    <div class="comment-area-title w-full my-1.5 md:my-2.5 text-xl md:text-3xl font-bold">
      评论
    </div>
    <div class="blog-comment-card supabase-comment-card">
      <div class="blog-comment-card-header">
        <div>
          <div class="blog-comment-eyebrow">Supabase Auth</div>
          <div class="blog-comment-title">用 GitHub 身份参与讨论</div>
        </div>
        ${user ? `
          <div class="supabase-comment-user">
            ${renderUserAvatar(displayName, avatar)}
            <span>${escapeHTML(displayName)}</span>
          </div>
        ` : `
          <button class="blog-comment-open supabase-comment-login" type="button">
            <i class="fa-brands fa-github"></i>
            <span>GitHub 登录</span>
          </button>
        `}
      </div>
      <p class="blog-comment-note">
        ${user ? "当前评论会使用你的 GitHub 昵称和头像。" : "请先登录 GitHub，再发布评论。登录状态会与顶部导航栏同步。"}
      </p>
      <div class="supabase-comment-composer" ${user ? "" : "hidden"}>
        <textarea class="supabase-comment-input" maxlength="1000" rows="4" placeholder="写下你的想法..."></textarea>
        <div class="supabase-comment-actions">
          <span class="supabase-comment-hint">最多 1000 字</span>
          <button class="post-action-button supabase-comment-submit" type="button">
            <i class="fa-regular fa-paper-plane"></i>
            <span>发布评论</span>
          </button>
        </div>
      </div>
      <div class="supabase-comment-status" role="status"></div>
      <div class="supabase-comment-list"></div>
    </div>
  `;

  const loginButton = container.querySelector(".supabase-comment-login");
  if (loginButton) loginButton.addEventListener("click", signInWithGitHub);

  const submitButton = container.querySelector(".supabase-comment-submit");
  if (submitButton) {
    submitButton.addEventListener("click", () => submitSupabaseComment(context));
  }

  loadSupabaseComments(context);
}

async function loadSupabaseComments(context) {
  const list = document.querySelector(".supabase-comment-list");
  const status = document.querySelector(".supabase-comment-status");
  if (!list || !status) return;

  status.textContent = "正在加载评论...";

  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from(interactionConfig.commentsTable)
      .select("id, body, user_name, user_avatar, created_at")
      .eq("post_path", context.path)
      .order("created_at", { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      list.innerHTML = `<div class="supabase-comment-empty">还没有评论，欢迎留下第一条。</div>`;
      status.textContent = "";
      return;
    }

    list.innerHTML = data.map((comment) => `
      <article class="supabase-comment-item">
        ${renderUserAvatar(comment.user_name, comment.user_avatar)}
        <div class="supabase-comment-body">
          <div class="supabase-comment-meta">
            <span>${escapeHTML(comment.user_name || "GitHub User")}</span>
            <time>${escapeHTML(formatCommentTime(comment.created_at))}</time>
          </div>
          <p>${escapeHTML(comment.body).replace(/\n/g, "<br>")}</p>
        </div>
      </article>
    `).join("");
    status.textContent = "";
  } catch (error) {
    console.warn("加载评论失败", error);
    status.textContent = "评论表还没有配置，或当前 RLS 策略不允许读取。请先在 Supabase 执行仓库里的 supabase/post_comments.sql。";
    list.innerHTML = "";
  }
}

async function submitSupabaseComment(context) {
  const user = currentSession?.user;
  const input = document.querySelector(".supabase-comment-input");
  const status = document.querySelector(".supabase-comment-status");
  const submitButton = document.querySelector(".supabase-comment-submit");

  if (!user) {
    await signInWithGitHub();
    return;
  }

  const body = input?.value.trim() || "";
  if (!body) {
    status.textContent = "请先输入评论内容。";
    return;
  }

  if (body.length > 1000) {
    status.textContent = "评论不能超过 1000 字。";
    return;
  }

  status.textContent = "正在发布...";
  if (submitButton) submitButton.disabled = true;

  try {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from(interactionConfig.commentsTable).insert({
      post_path: context.path,
      post_title: context.title,
      body,
      user_id: user.id,
      user_name: getUserDisplayName(user),
      user_avatar: getUserAvatar(user),
    });

    if (error) throw error;

    input.value = "";
    status.textContent = "评论已发布。";
    await loadSupabaseComments(context);
  } catch (error) {
    console.warn("发布评论失败", error);
    status.textContent = "发布失败。请确认 Supabase 已创建 post_comments 表并启用正确的 RLS 策略。";
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}



const homeHeroQuotes = [
  {
    title: "Stay Hungry, Stay Foolish.",
    subtitle: "\u6c42\u77e5\u82e5\u6e34\uff0c\u865a\u5fc3\u82e5\u611a",
    typedSubtitle: "\u6c42\u77e5\u82e5\u6e34^480\uff0c^260\u865a\u5fc3\u82e5\u611a",
  },
  {
    title: "Life happens for you, not to you.",
    subtitle: "\u4e07\u4e8b\u53d1\u751f\u7686\u6709\u5229\u4e8e\u6211",
    typedSubtitle: "\u4e07\u4e8b\u53d1\u751f^420\u7686\u6709\u5229\u4e8e\u6211",
  },
  {
    title: "Ready, fire, aim.",
    subtitle: "\u5148\u5f00\u67aa\uff0c\u518d\u7784\u51c6",
    typedSubtitle: "\u5148\u5f00\u67aa^520\uff0c^300\u518d\u7784\u51c6",
  },
  {
    title: "Don't ask for permission, ask for forgiveness",
    subtitle: "\u884c\u52a8\u679c\u65ad\uff0c\u51fa\u4e8b\u62c5\u8d23",
    typedSubtitle: "\u884c\u52a8\u679c\u65ad^420\uff0c\u51fa\u4e8b\u62c5\u8d23",
  },
];

const homeHeroTyping = {
  typeSpeed: 155,
  backSpeed: 52,
  backDelay: 2300,
  startDelay: 850,
};

function applyHomeHeroQuote(quote) {
  const description = document.querySelector(".home-banner-container .description");
  const subtitle = document.querySelector("#subtitle");
  if (!description || !subtitle) return;

  const titleNode = Array.from(description.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());

  if (titleNode) {
    titleNode.textContent = `\n            ${quote.title}\n            `;
  } else {
    description.insertBefore(document.createTextNode(`\n            ${quote.title}\n            `), description.firstChild);
  }

  const stableSubtitle = subtitle.cloneNode(false);
  stableSubtitle.id = "subtitle";
  subtitle.replaceWith(stableSubtitle);
  description.querySelectorAll(".typed-cursor").forEach((cursor) => cursor.remove());

  if (window.theme?.home_banner?.subtitle?.text) {
    window.theme.home_banner.title = quote.title;
    window.theme.home_banner.subtitle.text = [quote.subtitle];
  }

  if (window.Typed) {
    new Typed("#subtitle", {
      strings: [quote.typedSubtitle || quote.subtitle],
      typeSpeed: homeHeroTyping.typeSpeed,
      smartBackspace: window.theme?.home_banner?.subtitle?.smart_backspace || false,
      backSpeed: homeHeroTyping.backSpeed,
      backDelay: homeHeroTyping.backDelay,
      loop: window.theme?.home_banner?.subtitle?.loop || false,
      startDelay: homeHeroTyping.startDelay,
    });
  } else {
    stableSubtitle.textContent = quote.subtitle;
  }
}

function randomizeHomeHeroQuote() {
  if (!isHomePage()) return;

  const quote = homeHeroQuotes[Math.floor(Math.random() * homeHeroQuotes.length)];
  applyHomeHeroQuote(quote);
}
const guestbookEmojis = ["✨", "👏", "📷", "💡", "🌿", "🔥", "😊", "🚀", "☕", "🎧"];

function isHomePage() {
  return window.location.pathname === "/" || window.location.pathname === "/index.html";
}

const zixiBirthday = {
  year: 2005,
  month: 6,
  day: 29,
};

function isZixiBirthdayToday(date = new Date()) {
  return date.getMonth() + 1 === zixiBirthday.month && date.getDate() === zixiBirthday.day;
}

function showBirthdayCakeIntro() {
  if (!isHomePage() || !isZixiBirthdayToday()) return;
  if (document.body.dataset.zixiBirthdayCakeIntro === "playing") return;

  document.body.dataset.zixiBirthdayCakeIntro = "playing";
  const overlay = document.createElement("div");
  overlay.className = "birthday-cake-intro";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <div class="birthday-cake-intro-glow"></div>
    <div class="birthday-cake-intro-cake">🎂</div>
    <div class="birthday-cake-intro-text">Happy Birthday, Zixi</div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add("birthday-home-intro-active");

  window.setTimeout(() => overlay.classList.add("is-leaving"), 1850);
  window.setTimeout(() => {
    overlay.remove();
    document.body.classList.remove("birthday-home-intro-active");
    delete document.body.dataset.zixiBirthdayCakeIntro;
  }, 2450);
}

function isCommentsPage() {
  return window.location.pathname.replace(/\/index\.html$/, "/") === "/comments/";
}

function readSiteLikeCount() {
  const value = Number(localStorage.getItem(interactionConfig.siteLikeStorageKey));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function writeSiteLikeCount(count) {
  localStorage.setItem(interactionConfig.siteLikeStorageKey, String(Math.max(0, count)));
}

function getSiteLikeClientId() {
  let clientId = localStorage.getItem(interactionConfig.siteLikeClientKey);
  if (!clientId) {
    clientId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(interactionConfig.siteLikeClientKey, clientId);
  }
  return clientId;
}

async function fetchSiteLikeCount() {
  const supabase = await getSupabaseClient();
  const { count, error } = await supabase
    .from(interactionConfig.siteLikesTable)
    .select("id", { count: "exact", head: true })
    .eq("site_key", "home");

  if (error) throw error;
  return count || 0;
}

async function syncHomeLikeCount() {
  try {
    const count = await fetchSiteLikeCount();
    writeSiteLikeCount(count);
    renderHomeLikeCount(count, true);
  } catch (error) {
    console.warn("Supabase site_likes is not ready; using local like count.", error);
    renderHomeLikeCount(readSiteLikeCount(), true);
  }
}

async function persistHomeLike() {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.from(interactionConfig.siteLikesTable).insert({
    site_key: "home",
    client_id: getSiteLikeClientId(),
  });

  if (error) throw error;
  return fetchSiteLikeCount();
}

function animateHomeStatNumber(node, target, options = {}) {
  if (!node) return;
  const value = Math.max(0, Math.floor(Number(target) || 0));
  const duration = options.duration || Math.min(1800, 1150 + String(value).length * 160);
  const startTime = performance.now();
  const render = (number) => {
    const text = String(number);
    const valueNode = node.querySelector(".home-like-value");
    if (valueNode) {
      valueNode.textContent = text;
    } else {
      node.textContent = text;
    }
    if (node.dataset.homeLikesCount === "true") fitHomeLikeCount(node, number);
  };

  cancelAnimationFrame(Number(node.dataset.homeStatAnimationFrame) || 0);
  node.dataset.homeStatTarget = String(value);
  node.dataset.homeStatCount = "true";

  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || value === 0) {
    render(value);
    return;
  }

  render(0);

  const tick = (now) => {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 4);
    render(Math.round(value * eased));

    if (progress < 1) {
      node.dataset.homeStatAnimationFrame = String(requestAnimationFrame(tick));
    } else {
      render(value);
      delete node.dataset.homeStatAnimationFrame;
    }
  };

  node.dataset.homeStatAnimationFrame = String(requestAnimationFrame(tick));
}

function animateHomeStats() {
  if (!isHomePage()) return;
  document.querySelectorAll("[data-home-stat-count]:not([data-home-likes-count])").forEach((node) => {
    animateHomeStatNumber(node, node.dataset.homeStatTarget || node.textContent);
  });
}

function prepareHomePostsCount() {
  document.querySelectorAll('.statistics a[href="/archives"]').forEach((item) => {
    const number = item.querySelector(".number");
    const label = item.querySelector(".label");
    if (number) {
      number.dataset.homeStatCount = "true";
      number.dataset.homeStatTarget = number.dataset.homeStatTarget || number.textContent.trim() || "0";
    }
    if (label) label.textContent = "帖子";
  });
}

function fitHomeLikeCount(node, count) {
  const length = String(count).length;
  const size = Math.max(0.62, Math.min(1.5, 1.48 - Math.max(0, length - 2) * 0.12));
  node.style.fontSize = `${size}rem`;
}

function renderHomeLikeCount(count = readSiteLikeCount(), animate = false) {
  document.querySelectorAll("[data-home-likes-count]").forEach((node) => {
    node.dataset.homeStatTarget = String(count);
    node.dataset.homeStatCount = "true";
    fitHomeLikeCount(node, count);
    if (animate) {
      animateHomeStatNumber(node, count);
    } else {
      const value = node.querySelector(".home-like-value");
      if (value) value.textContent = String(count);
    }
  });
}

function createHomeBirthdayBurst(container) {
  const popper = document.createElement("span");
  popper.className = "home-birthday-popper";
  popper.textContent = "🎉";
  container.appendChild(popper);
  popper.addEventListener("animationend", () => popper.remove(), { once: true });

  for (let index = 0; index < 18; index += 1) {
    const confetti = document.createElement("span");
    confetti.className = "home-birthday-confetti";
    confetti.style.setProperty("--x", `${Math.round((Math.random() - 0.5) * 96)}px`);
    confetti.style.setProperty("--y", `${Math.round(-36 - Math.random() * 78)}px`);
    confetti.style.setProperty("--r", `${Math.round((Math.random() - 0.5) * 360)}deg`);
    confetti.style.setProperty("--h", `${Math.round(Math.random() * 360)}deg`);
    confetti.style.animationDelay = `${index * 18}ms`;
    container.appendChild(confetti);
    confetti.addEventListener("animationend", () => confetti.remove(), { once: true });
  }
}

function createHomeLikeBurst(container) {
  for (let index = 0; index < 9; index += 1) {
    const heart = document.createElement("span");
    heart.className = "home-like-burst-heart";
    heart.textContent = "\u2665";
    heart.style.setProperty("--x", `${Math.round((Math.random() - 0.5) * 58)}px`);
    heart.style.setProperty("--y", `${Math.round(-34 - Math.random() * 48)}px`);
    heart.style.setProperty("--r", `${Math.round((Math.random() - 0.5) * 36)}deg`);
    heart.style.animationDelay = `${index * 34}ms`;
    container.appendChild(heart);
    heart.addEventListener("animationend", () => heart.remove(), { once: true });
  }
}

async function incrementHomeLikes(item) {
  const optimisticCount = readSiteLikeCount() + 1;
  writeSiteLikeCount(optimisticCount);
  renderHomeLikeCount(optimisticCount);

  const number = item.querySelector("[data-home-likes-count]");
  if (number) {
    number.classList.remove("is-popping");
    void number.offsetWidth;
    number.classList.add("is-popping");
    if (isZixiBirthdayToday()) {
      createHomeBirthdayBurst(number);
    } else {
      createHomeLikeBurst(number);
    }
    window.setTimeout(() => number.classList.remove("is-popping"), 1000);
  }

  try {
    const persistedCount = await persistHomeLike();
    writeSiteLikeCount(persistedCount);
    renderHomeLikeCount(persistedCount);
  } catch (error) {
    console.warn("Failed to persist site like; kept local like count.", error);
  }
}

function initHomeLikes() {
  if (!isHomePage()) return;

  document.querySelectorAll('.statistics a[href="/tags"], .statistics .home-likes-stat').forEach((item) => {
    item.classList.add("home-likes-stat");
    item.removeAttribute("href");
    item.setAttribute("role", "button");
    item.setAttribute("tabindex", "0");
    const birthdayMode = isZixiBirthdayToday();
    item.classList.toggle("is-birthday-likes", birthdayMode);
    item.setAttribute("aria-label", birthdayMode ? "祝 Zixi 生日快乐" : "Like this blog");

    const number = item.querySelector(".number");
    const label = item.querySelector(".label");

    if (number && !number.dataset.homeLikesCount) {
      number.dataset.homeLikesCount = "true";
      number.classList.add("home-like-count");
      number.innerHTML = birthdayMode
        ? '<span class="home-like-value">0</span><span class="home-like-party-icon" aria-hidden="true">🎉</span>'
        : '<span class="home-like-value">0</span><i class="fa-solid fa-heart home-like-heart-icon" aria-hidden="true"></i>';
    } else if (number && number.dataset.homeLikeMode !== (birthdayMode ? "birthday" : "like")) {
      const value = number.querySelector(".home-like-value")?.textContent || number.textContent.trim() || "0";
      number.innerHTML = birthdayMode
        ? `<span class="home-like-value">${value}</span><span class="home-like-party-icon" aria-hidden="true">🎉</span>`
        : `<span class="home-like-value">${value}</span><i class="fa-solid fa-heart home-like-heart-icon" aria-hidden="true"></i>`;
    }

    if (number) number.dataset.homeLikeMode = birthdayMode ? "birthday" : "like";

    if (label) label.textContent = birthdayMode ? "生日快乐！" : "点赞";

    if (!item.dataset.homeLikesBound) {
      item.dataset.homeLikesBound = "true";
      item.addEventListener("click", (event) => {
        event.preventDefault();
        if (!event.target.closest("[data-home-likes-count]")) return;
        incrementHomeLikes(item);
      });
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          incrementHomeLikes(item);
        }
      });
    }
  });

  renderHomeLikeCount(readSiteLikeCount(), true);
  syncHomeLikeCount();
}

function getCurrentGuestbookUser() {
  const user = currentSession?.user || null;
  if (!user) return null;

  return {
    id: user.id,
    name: getUserDisplayName(user),
    avatar: getUserAvatar(user),
  };
}

async function fetchSiteCommentCount() {
  try {
    const supabase = await getSupabaseClient();
    const { count, error } = await supabase
      .from(interactionConfig.siteCommentsTable)
      .select("id", { count: "exact", head: true });

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.warn("留言数量加载失败", error);
    return 0;
  }
}

async function updateSiteCommentCount() {
  const countNodes = document.querySelectorAll("[data-site-comments-count]");
  if (!countNodes.length) return;

  const count = await fetchSiteCommentCount();
  countNodes.forEach((node) => {
    node.dataset.homeStatTarget = String(count);
    animateHomeStatNumber(node, count);
  });
}

function initHomeGuestbook() {
  if (!isHomePage()) return;

  prepareHomePostsCount();
  initHomeLikes();

  document.querySelectorAll('.statistics a[href="/categories"]').forEach((item) => {
    item.setAttribute("href", "/comments/");
    item.classList.add("site-comments-stat");
    const number = item.querySelector(".number");
    const label = item.querySelector(".label");
    if (number) {
      number.setAttribute("data-site-comments-count", "true");
      number.dataset.homeStatCount = "true";
      number.dataset.homeStatTarget = number.dataset.homeStatTarget || number.textContent.trim() || "0";
    }
    if (label) label.textContent = "评论";
  });

  document.querySelectorAll(".home-sidebar-container .sidebar-content").forEach((sidebar) => {
    if (sidebar.querySelector(".home-comment-button")) return;

    const button = document.createElement("button");
    button.className = "home-comment-button";
    button.type = "button";
    button.innerHTML = '<i class="fa-regular fa-message"></i><span>Comment</span>';
    button.addEventListener("click", openGuestbookModal);
    sidebar.appendChild(button);
  });

  ensureGuestbookModal();
  updateSiteCommentCount();
  animateHomeStats();
}

function ensureGuestbookModal() {
  if (document.querySelector(".guestbook-modal")) return;

  const modal = document.createElement("div");
  modal.className = "guestbook-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="guestbook-modal-backdrop" data-guestbook-close></div>
    <section class="guestbook-dialog" role="dialog" aria-modal="true" aria-labelledby="guestbook-title">
      <button class="guestbook-close" type="button" data-guestbook-close aria-label="关闭留言框">
        <i class="fa-regular fa-xmark"></i>
      </button>
      <div class="blog-comment-eyebrow">Guestbook</div>
      <h2 id="guestbook-title">给 Zixi 留言</h2>
      <p class="guestbook-description">留下你对博客、照片或文章的评价。登录状态会使用顶部 GitHub 账号。</p>
      <div class="guestbook-user-line"></div>
      <textarea class="guestbook-input" maxlength="800" rows="5" placeholder="写点什么..."></textarea>
      <div class="guestbook-emoji-row">
        ${guestbookEmojis.map((emoji) => `<button type="button" data-emoji="${emoji}">${emoji}</button>`).join("")}
      </div>
      <div class="guestbook-actions">
        <span class="guestbook-status" role="status"></span>
        <button class="post-action-button guestbook-submit" type="button">
          <i class="fa-regular fa-paper-plane"></i>
          <span>发送</span>
        </button>
      </div>
    </section>
  `;

  document.body.appendChild(modal);
  modal.querySelectorAll("[data-guestbook-close]").forEach((element) => {
    element.addEventListener("click", closeGuestbookModal);
  });
  modal.querySelectorAll("[data-emoji]").forEach((button) => {
    button.addEventListener("click", () => appendEmojiToGuestbook(button.dataset.emoji));
  });
  modal.querySelector(".guestbook-submit").addEventListener("click", () => submitSiteComment(null));
}

function openGuestbookModal() {
  const modal = document.querySelector(".guestbook-modal");
  if (!modal) return;

  renderGuestbookModalUser();
  modal.hidden = false;
  document.body.classList.add("guestbook-modal-open");
  requestAnimationFrame(() => modal.querySelector(".guestbook-input")?.focus());
}

function closeGuestbookModal() {
  const modal = document.querySelector(".guestbook-modal");
  if (!modal) return;

  modal.hidden = true;
  document.body.classList.remove("guestbook-modal-open");
}

function renderGuestbookModalUser() {
  const line = document.querySelector(".guestbook-user-line");
  if (!line) return;

  const user = getCurrentGuestbookUser();
  if (!user) {
    line.innerHTML = `
      <span>需要先登录 GitHub 才能发送留言。</span>
      <button class="blog-comment-open" type="button">GitHub 登录</button>
    `;
    line.querySelector("button").addEventListener("click", signInWithGitHub);
    return;
  }

  line.innerHTML = `
    ${renderUserAvatar(user.name, user.avatar)}
    <span>${escapeHTML(user.name)}</span>
  `;
}

function appendEmojiToGuestbook(emoji) {
  const input = document.querySelector(".guestbook-input");
  if (!input) return;

  const start = input.selectionStart || input.value.length;
  const end = input.selectionEnd || input.value.length;
  input.value = `${input.value.slice(0, start)}${emoji}${input.value.slice(end)}`;
  input.focus();
  input.selectionStart = input.selectionEnd = start + emoji.length;
}

async function submitSiteComment(parentId) {
  const user = getCurrentGuestbookUser();
  const input = parentId
    ? document.querySelector(`[data-reply-input="${parentId}"]`)
    : document.querySelector(".guestbook-input");
  const status = parentId
    ? document.querySelector(`[data-reply-status="${parentId}"]`)
    : document.querySelector(".guestbook-status");

  if (!user) {
    if (status) status.textContent = "请先登录 GitHub。";
    await signInWithGitHub();
    return;
  }

  const body = input?.value.trim() || "";
  if (!body) {
    if (status) status.textContent = "请先输入内容。";
    return;
  }

  if (body.length > 800) {
    if (status) status.textContent = "留言不能超过 800 字。";
    return;
  }

  if (status) status.textContent = "正在发送...";

  try {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from(interactionConfig.siteCommentsTable).insert({
      parent_id: parentId,
      body,
      user_id: user.id,
      user_name: user.name,
      user_avatar: user.avatar,
    });

    if (error) throw error;

    if (input) input.value = "";
    if (status) status.textContent = parentId ? "回复已发布。" : "留言已发送。";
    await updateSiteCommentCount();
    if (isCommentsPage()) await renderGuestbookHistory();
    if (!parentId) setTimeout(closeGuestbookModal, 450);
  } catch (error) {
    console.warn("留言发送失败", error);
    if (status) status.textContent = "发送失败。请确认已在 Supabase 执行 supabase/site_comments.sql。";
  }
}

async function fetchSiteComments() {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from(interactionConfig.siteCommentsTable)
    .select("id, parent_id, body, user_id, user_name, user_avatar, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function fetchSiteCommentLikes() {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from(interactionConfig.siteCommentLikesTable)
    .select("comment_id, user_id");

  if (error) throw error;
  return data || [];
}

function groupSiteComments(comments) {
  const roots = [];
  const replies = new Map();

  comments.forEach((comment) => {
    if (comment.parent_id) {
      const list = replies.get(comment.parent_id) || [];
      list.push(comment);
      replies.set(comment.parent_id, list);
    } else {
      roots.push(comment);
    }
  });

  return { roots, replies };
}

function buildLikeSummary(likes) {
  const counts = new Map();
  const likedByMe = new Set();
  const userId = currentSession?.user?.id;

  likes.forEach((like) => {
    counts.set(like.comment_id, (counts.get(like.comment_id) || 0) + 1);
    if (userId && like.user_id === userId) likedByMe.add(like.comment_id);
  });

  return { counts, likedByMe };
}

function renderSiteComment(comment, replies, likeSummary, isReply = false) {
  const count = likeSummary.counts.get(comment.id) || 0;
  const liked = likeSummary.likedByMe.has(comment.id);
  const replyList = replies.get(comment.id) || [];

  return `
    <article class="guestbook-history-item ${isReply ? "is-reply" : ""}">
      ${renderUserAvatar(comment.user_name, comment.user_avatar)}
      <div class="guestbook-history-body">
        <div class="guestbook-history-meta">
          <span>${escapeHTML(comment.user_name || "GitHub User")}</span>
          <time>${escapeHTML(formatCommentTime(comment.created_at))}</time>
        </div>
        <p>${escapeHTML(comment.body).replace(/\n/g, "<br>")}</p>
        <div class="guestbook-history-actions">
          <button type="button" data-comment-like="${comment.id}" class="guestbook-like-button ${liked ? "is-liked" : ""}">
            <i class="fa-${liked ? "solid" : "regular"} fa-heart"></i>
            <span>${count}</span>
          </button>
          ${isReply ? "" : `<button type="button" data-reply-toggle="${comment.id}" class="guestbook-reply-toggle">回复</button>`}
        </div>
        ${isReply ? "" : `
          <div class="guestbook-reply-box" data-reply-box="${comment.id}" hidden>
            <textarea data-reply-input="${comment.id}" maxlength="800" rows="3" placeholder="回复 ${escapeHTML(comment.user_name || "TA")}..."></textarea>
            <div class="guestbook-reply-actions">
              <span data-reply-status="${comment.id}"></span>
              <button type="button" class="post-action-button" data-reply-submit="${comment.id}">发送回复</button>
            </div>
          </div>
          <div class="guestbook-replies">
            ${replyList.slice().reverse().map((reply) => renderSiteComment(reply, replies, likeSummary, true)).join("")}
          </div>
        `}
      </div>
    </article>
  `;
}

async function renderGuestbookHistory() {
  const root = document.querySelector("#guestbook-history-root");
  if (!root) return;

  root.innerHTML = '<div class="guestbook-history-status">正在加载留言...</div>';

  try {
    const [comments, likes] = await Promise.all([fetchSiteComments(), fetchSiteCommentLikes()]);
    const { roots, replies } = groupSiteComments(comments);
    const likeSummary = buildLikeSummary(likes);

    root.innerHTML = `
      <div class="guestbook-history-header">
        <div>
          <div class="blog-comment-eyebrow">Comments</div>
          <h2>历史留言</h2>
        </div>
        <button class="post-action-button guestbook-history-new" type="button">
          <i class="fa-regular fa-message"></i>
          <span>写留言</span>
        </button>
      </div>
      <div class="guestbook-history-list">
        ${roots.length ? roots.map((comment) => renderSiteComment(comment, replies, likeSummary)).join("") : '<div class="guestbook-history-empty">还没有留言，欢迎留下第一条。</div>'}
      </div>
    `;

    root.querySelector(".guestbook-history-new")?.addEventListener("click", openGuestbookModal);
    root.querySelectorAll("[data-reply-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const box = root.querySelector(`[data-reply-box="${button.dataset.replyToggle}"]`);
        if (box) box.hidden = !box.hidden;
      });
    });
    root.querySelectorAll("[data-reply-submit]").forEach((button) => {
      button.addEventListener("click", () => submitSiteComment(button.dataset.replySubmit));
    });
    root.querySelectorAll("[data-comment-like]").forEach((button) => {
      button.addEventListener("click", () => toggleSiteCommentLike(button.dataset.commentLike));
    });
  } catch (error) {
    console.warn("历史留言加载失败", error);
    root.innerHTML = '<div class="guestbook-history-status">留言表还没有配置，或当前 RLS 策略不允许读取。请先在 Supabase 执行 supabase/site_comments.sql。</div>';
  }
}

async function toggleSiteCommentLike(commentId) {
  const user = getCurrentGuestbookUser();
  if (!user) {
    await signInWithGitHub();
    return;
  }

  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from(interactionConfig.siteCommentLikesTable)
      .select("id")
      .eq("comment_id", commentId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      const { error: deleteError } = await supabase
        .from(interactionConfig.siteCommentLikesTable)
        .delete()
        .eq("id", data.id);
      if (deleteError) throw deleteError;
    } else {
      const { error: insertError } = await supabase
        .from(interactionConfig.siteCommentLikesTable)
        .insert({ comment_id: commentId, user_id: user.id });
      if (insertError) throw insertError;
    }

    await renderGuestbookHistory();
  } catch (error) {
    console.warn("留言点赞失败", error);
  }
}

function initSiteGuestbook(force = false) {
  initHomeGuestbook();
  ensureGuestbookModal();
  renderGuestbookModalUser();

  if (isCommentsPage()) {
    renderGuestbookHistory();
  }
}
function initBlogInteractions() {
  scheduleGalleryPreload();
  showGalleryNoteIntro();
  showBirthdayCakeIntro();
  showHomeNoteIntro();
  randomizeHomeHeroQuote();
  initAuth();
  initSiteGuestbook();
  const context = getPostContext();
  if (!context) return;

  activePostContext = context;

  createEngagementPanel(context);
  enhancePostTools(context);
  renderCommentArea(context);
  updateLikeState(context.path, isPostLiked(context.path));
}

document.addEventListener("DOMContentLoaded", initBlogInteractions);

try {
  swup.hooks.on("page:view", initBlogInteractions);
} catch (error) {}
