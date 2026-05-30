const interactionConfig = {
  repo: "INTMAX-jpg/INTMAX-jpg.github.io",
  likeStorageKey: "ZIXI_BLOG_LOCAL_LIKES",
  commentsTable: "post_comments",
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
        if (activePostContext) renderCommentArea(activePostContext, true);
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

function initBlogInteractions() {
  initAuth();
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
