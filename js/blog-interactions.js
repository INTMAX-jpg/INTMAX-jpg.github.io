const interactionConfig = {
  repo: "INTMAX-jpg/INTMAX-jpg.github.io",
  likeStorageKey: "ZIXI_BLOG_LOCAL_LIKES",
};

const authConfig = {
  supabaseUrl: "https://lfjmmzvabkpneglaevvi.supabase.co",
  supabaseKey: "sb_publishable_H5yhsQ854nw7VJuQXS1EJg_PYdGaMyC",
};

let supabaseClientPromise = null;
let currentSession = null;
let authInitialized = false;
let authListenerInitialized = false;

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

function renderCommentArea(context) {
  const container = document.querySelector(".comments-container");
  if (!container || container.dataset.blogCommentsReady === "true") return;

  container.dataset.blogCommentsReady = "true";
  container.innerHTML = `
    <div id="comment-anchor" class="w-full h-2.5"></div>
    <div class="comment-area-title w-full my-1.5 md:my-2.5 text-xl md:text-3xl font-bold">
      评论
    </div>
    <div class="blog-comment-card">
      <div class="blog-comment-card-header">
        <div>
          <div class="blog-comment-eyebrow">GitHub Issues</div>
          <div class="blog-comment-title">留下你的想法</div>
        </div>
        <a class="blog-comment-open" href="${createIssueUrl(context)}" target="_blank" rel="noopener">
          <i class="fa-brands fa-github"></i>
          <span>打开 GitHub</span>
        </a>
      </div>
      <p class="blog-comment-note">
        评论会与当前文章链接到 GitHub Issues。若下方嵌入区没有出现，请先在 GitHub 中留言，或安装 utterances 应用以启用站内评论。
      </p>
      <div class="utterances-root"></div>
    </div>
  `;

  loadUtterances();
}

function loadUtterances() {
  const root = document.querySelector(".utterances-root");
  if (!root || root.dataset.utterancesLoaded === "true") return;

  root.dataset.utterancesLoaded = "true";

  const script = document.createElement("script");
  script.src = "https://utteranc.es/client.js";
  script.async = true;
  script.crossOrigin = "anonymous";
  script.setAttribute("repo", interactionConfig.repo);
  script.setAttribute("issue-term", "pathname");
  script.setAttribute("label", "comment");
  script.setAttribute("theme", getUtterancesTheme());
  root.appendChild(script);
}

function getUtterancesTheme() {
  const themeName = document.documentElement.getAttribute("data-theme");
  return themeName === "dark" ? "github-dark" : "github-light";
}

function initBlogInteractions() {
  initAuth();
  const context = getPostContext();
  if (!context) return;

  createEngagementPanel(context);
  enhancePostTools(context);
  renderCommentArea(context);
  updateLikeState(context.path, isPostLiked(context.path));
}

document.addEventListener("DOMContentLoaded", initBlogInteractions);

try {
  swup.hooks.on("page:view", initBlogInteractions);
} catch (error) {}
