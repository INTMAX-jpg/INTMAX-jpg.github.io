const galleryMasonryInstances = new WeakMap();
const galleryLikeConfig = {
  storageKey: "ZIXI_GALLERY_LIKE_COUNTS",
  visitStorageKey: "ZIXI_GALLERY_VISIT_LIKES",
  table: "gallery_likes",
  supabaseUrl: "https://lfjmmzvabkpneglaevvi.supabase.co",
  supabaseKey: "sb_publishable_H5yhsQ854nw7VJuQXS1EJg_PYdGaMyC",
};
let galleryLikeClientPromise = null;
const galleryCache = window.__GALLERY_CACHE__ || {
  filesPromise: null,
  files: null,
  preloadedImages: new Map(),
  preloadStarted: false,
  preloadInitialPromise: null,
  preloadAllStarted: false,
  preloadAllPromise: null,
};
const galleryPreloadImageLimit = 8;
let masonryPagePreloadStarted = false;
let galleryWarmupScheduled = false;

window.__GALLERY_CACHE__ = galleryCache;

if (!(galleryCache.preloadedImages instanceof Map)) {
  galleryCache.preloadedImages = new Map();
}

function isGalleryPage() {
  return window.location.pathname.startsWith("/masonry");
}

function getGalleryFiles() {
  if (galleryCache.files) {
    return Promise.resolve(galleryCache.files);
  }

  if (galleryCache.filesPromise) {
    return galleryCache.filesPromise;
  }

  galleryCache.filesPromise = fetch("/images/gallery_compress/photos.json")
    .then(function (response) {
      if (!response.ok) throw new Error("No local gallery manifest");
      return response.json();
    })
    .then(normalizeManifestFiles)
    .catch(function () {
      var repoApi =
        "https://api.github.com/repos/INTMAX-jpg/INTMAX-jpg.github.io/contents/images/gallery_compress";
      return fetch(repoApi)
        .then(function (response) {
          if (!response.ok) throw new Error("No GitHub gallery_compress directory");
          return response.json();
        })
        .then(normalizeGithubFiles)
        .catch(function () {
          return [];
        });
    })
    .then(function (files) {
      galleryCache.files = files;
      return files;
    });

  return galleryCache.filesPromise;
}

function normalizeGithubFiles(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter(function (item) {
      return item.type === "file" && isImageFile(item.name);
    })
    .map(function (item) {
      return {
        name: item.name,
        url: "/images/gallery_compress/" + encodeURIComponent(item.name),
        size: Number(item.size) || 0,
        width: Number(item.width) || 0,
        height: Number(item.height) || 0,
      };
    });
}

function normalizeManifestFiles(files) {
  if (!Array.isArray(files)) return [];
  return files
    .map(function (file) {
      if (typeof file === "string") {
        return {
          name: file,
          url: "/images/gallery_compress/" + encodeURIComponent(file),
          size: 0,
          width: 0,
          height: 0,
        };
      }

      if (file && file.name && file.url) {
        return {
          name: file.name,
          url: file.url,
          size: Number(file.size) || 0,
          width: Number(file.width) || 0,
          height: Number(file.height) || 0,
        };
      }

      return null;
    })
    .filter(function (file) {
      return file && isImageFile(file.name);
    });
}

function isImageFile(name) {
  return /\.(avif|gif|jpe?g|png|webp)$/i.test(name);
}

function canPreloadGallery() {
  var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return true;
  return !connection.saveData && !String(connection.effectiveType || "").endsWith("2g");
}

function ensurePreloadedGalleryImage(url) {
  if (!url) return Promise.resolve(null);

  var preloadImage = galleryCache.preloadedImages.get(url);
  if (preloadImage && preloadImage.complete && preloadImage.naturalWidth > 0) {
    return Promise.resolve(preloadImage);
  }
  if (preloadImage && preloadImage.__galleryPreloadPromise) {
    return preloadImage.__galleryPreloadPromise;
  }

  preloadImage = preloadImage || new Image();
  preloadImage.decoding = "async";
  preloadImage.loading = "eager";

  preloadImage.__galleryPreloadPromise = new Promise(function (resolve) {
    preloadImage.onload = function () {
      resolve(preloadImage);
    };
    preloadImage.onerror = function () {
      galleryCache.preloadedImages.delete(url);
      resolve(null);
    };
  });

  galleryCache.preloadedImages.set(url, preloadImage);
  if (!preloadImage.src) preloadImage.src = url;

  return preloadImage.__galleryPreloadPromise;
}

function preloadGalleryImageBatch(files, concurrency) {
  var queue = Array.isArray(files) ? files.slice() : [];
  var workerCount = Math.max(1, Number(concurrency) || 2);
  var workers = [];

  function worker() {
    var file = queue.shift();
    if (!file || !canPreloadGallery()) return Promise.resolve();
    return ensurePreloadedGalleryImage(file.url).then(worker);
  }

  for (var i = 0; i < workerCount; i += 1) {
    workers.push(worker());
  }

  return Promise.all(workers);
}

export function preloadGalleryData(options) {
  var settings = options || {};
  var limit = Number.isFinite(settings.limit) ? settings.limit : galleryPreloadImageLimit;
  var concurrency = settings.concurrency || 2;

  if (!settings.force && galleryCache.preloadInitialPromise) {
    return galleryCache.preloadInitialPromise;
  }
  galleryCache.preloadStarted = true;

  galleryCache.preloadInitialPromise = getGalleryFiles().then(function (files) {
    var initialFiles = files.slice(0, limit);
    return preloadGalleryImageBatch(initialFiles, concurrency).then(function () {
      return files;
    });
  });

  return galleryCache.preloadInitialPromise;
}

export function preloadAllGalleryImages(options) {
  var settings = options || {};
  if (galleryCache.preloadAllPromise) return galleryCache.preloadAllPromise;
  galleryCache.preloadAllStarted = true;

  var initialWarmup = galleryCache.preloadInitialPromise || preloadGalleryData({
    limit: galleryPreloadImageLimit,
    concurrency: settings.concurrency || 2,
  });

  galleryCache.preloadAllPromise = initialWarmup.then(function () {
    return getGalleryFiles().then(function (files) {
      var limit = Number.isFinite(settings.limit) ? settings.limit : files.length;
      return preloadGalleryImageBatch(files.slice(0, limit), settings.concurrency || 2).then(function () {
        return files;
      });
    });
  });

  return galleryCache.preloadAllPromise;
}

function preloadMasonryPage() {
  if (masonryPagePreloadStarted) return;
  masonryPagePreloadStarted = true;

  try {
    if (window.swup && typeof window.swup.preload === "function") {
      window.swup.preload("/masonry/");
      return;
    }
    if (typeof swup !== "undefined" && typeof swup.preload === "function") {
      swup.preload("/masonry/");
      return;
    }
  } catch (e) {}

  try {
    fetch("/masonry/", { credentials: "same-origin" }).catch(function () {});
  } catch (e) {}
}

export function scheduleGalleryWarmup() {
  if (galleryWarmupScheduled || isGalleryPage() || !canPreloadGallery()) return;
  galleryWarmupScheduled = true;

  var begin = function () {
    var warmup = function () {
      preloadMasonryPage();
      preloadGalleryData({ limit: galleryPreloadImageLimit, concurrency: 2 }).then(function () {
        preloadAllGalleryImages({ concurrency: 2 });
      });
    };

    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(warmup, { timeout: 2500 });
    } else {
      window.setTimeout(warmup, 1200);
    }
  };

  if (document.readyState === "complete") {
    begin();
  } else {
    window.addEventListener("load", begin, { once: true });
  }
}

function initGalleryRuntime() {
  if (isGalleryPage()) {
    preloadGalleryData({ limit: galleryPreloadImageLimit, concurrency: 2 });
    initMasonry();
    return;
  }

  scheduleGalleryWarmup();
}

export function initMasonry() {
  var loadingPlaceholder = document.querySelector(".loading-placeholder");
  var masonryContainer = document.querySelector("#masonry-container");
  if (!loadingPlaceholder || !masonryContainer) return;

  var masonry = null;
  var layoutTimer = null;
  var eagerCount = 3;
  var maxConcurrentLoads = 3;
  var maxImageRetries = 2;
  var loadingQueue = [];
  var activeLoads = 0;
  var loadProgress = null;
  var progressHideTimer = null;
  var progressUpdateTimer = null;
  var resizeLayoutTimer = null;
  var layoutFrame = null;
  var layoutObserver = null;
  var currentBaseWidth = 0;
  var renderAuditTimers = [];
  var likeCountsHydrationPromise = null;
  var likeCountsHydrationTimer = null;
  var galleryLoadAnalyticsSent = false;

  var existingInstance = galleryMasonryInstances.get(masonryContainer);
  if (existingInstance) {
    existingInstance.refresh();
    return;
  }
  galleryMasonryInstances.set(masonryContainer, {
    refresh: refreshMasonryInstance,
  });

  loadingPlaceholder.style.display = "block";
  masonryContainer.style.display = "none";

  loadGalleryImages()
    .then(function () {
      revealMasonryContainer();
      initializeMasonryLayout();
      startProgressiveImageLoading();
    })
    .catch(function () {
      renderGalleryMessage("Photo loading failed. Please check images/gallery_compress/.");
      revealMasonryContainer();
    });

  function refreshMasonryInstance() {
    loadingPlaceholder.style.display = "none";
    masonryContainer.style.display = "block";
    masonryContainer.style.opacity = 1;
    revealGalleryContinued();

    if (!masonry) {
      initializeMasonryLayout();
    } else {
      stabilizeLayout();
    }

    pumpLoadingQueue();
    scheduleGalleryLikeCountHydration(160);
  }

  function loadGalleryImages() {
    if (masonryContainer.dataset.galleryLoaded === "true") {
      return Promise.resolve();
    }

    var existingItems = masonryContainer.querySelectorAll(".masonry-item");
    if (existingItems.length > 0) {
      masonryContainer.dataset.galleryLoaded = "true";
      return Promise.resolve();
    }

    return getGalleryFiles().then(function (files) {
      if (!files.length) {
        renderGalleryMessage("No photos yet. Put your images in images/gallery_compress/.");
        return;
      }

      initializeLoadProgress(files);

      var fragment = document.createDocumentFragment();
      files.forEach(function (file, index) {
        fragment.appendChild(createGalleryItem(file, index));
      });

      masonryContainer.appendChild(fragment);
      masonryContainer.dataset.galleryLoaded = "true";
      primeGalleryLikeCountsFromLocal();
      scheduleGalleryLikeCountHydration(260);
    });
  }

  function createGalleryItem(file, index) {
    var item = document.createElement("div");
    item.className = "masonry-item masonry-item-loading";

    var shell = document.createElement("div");
    shell.className = "masonry-image-shell loading";
    shell.style.setProperty("--gallery-ratio", getFileRatio(file, index));

    var img = document.createElement("img");
    img.alt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
    img.decoding = "async";
    img.loading = index < eagerCount ? "eager" : "lazy";
    img.dataset.src = file.url;
    img.dataset.size = file.size || 0;
    if (index < 2) {
      img.fetchPriority = "high";
    }

    img.addEventListener("load", function () {
      if (img.naturalWidth && img.naturalHeight) {
        shell.style.setProperty(
          "--gallery-ratio",
          img.naturalWidth + " / " + img.naturalHeight,
        );
      }
      waitForImageDecode(img).then(function () {
        markImageRendered(img, item, shell);
      });
    });

    img.addEventListener("error", function () {
      handleImageError(img, item, shell);
    });

    shell.appendChild(img);
    shell.appendChild(createGalleryLikeButton(file));
    item.appendChild(shell);
    return item;
  }

  function createGalleryLikeButton(file) {
    var imageKey = getGalleryLikeImageKey(file);
    var button = document.createElement("button");
    button.className = "gallery-photo-like";
    button.type = "button";
    button.dataset.galleryLikeKey = imageKey;
    button.setAttribute("aria-label", "\u4e3a\u8fd9\u5f20\u7167\u7247\u70b9\u8d5e");
    button.setAttribute("aria-pressed", hasLikedGalleryImage(imageKey) ? "true" : "false");
    button.innerHTML = '<i class="fa-solid fa-heart" aria-hidden="true"></i><span class="gallery-photo-like-count" role="status" aria-live="polite"></span>';
    button.classList.toggle("is-liked", hasLikedGalleryImage(imageKey));

    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      handleGalleryPhotoLike(button, imageKey);
    });

    return button;
  }

  function getGalleryLikeImageKey(file) {
    var raw = file && (file.url || file.name) ? file.url || file.name : "unknown";
    return String(raw).replace(/^https?:\/\/[^/]+/i, "").split("?")[0];
  }

  function readGalleryLikeCounts() {
    try {
      return JSON.parse(localStorage.getItem(galleryLikeConfig.storageKey) || "{}");
    } catch (error) {
      return {};
    }
  }

  function writeGalleryLikeCounts(counts) {
    try {
      localStorage.setItem(galleryLikeConfig.storageKey, JSON.stringify(counts));
    } catch (error) {}
  }

  function readGalleryVisitLikes() {
    try {
      return JSON.parse(sessionStorage.getItem(galleryLikeConfig.visitStorageKey) || "{}");
    } catch (error) {
      return {};
    }
  }

  function writeGalleryVisitLikes(likes) {
    try {
      sessionStorage.setItem(galleryLikeConfig.visitStorageKey, JSON.stringify(likes));
    } catch (error) {}
  }

  function hasLikedGalleryImage(imageKey) {
    return readGalleryVisitLikes()[imageKey] === true;
  }

  function markGalleryImageLiked(imageKey) {
    var likes = readGalleryVisitLikes();
    likes[imageKey] = true;
    writeGalleryVisitLikes(likes);
  }

  function readLocalGalleryLikeCount(imageKey) {
    var counts = readGalleryLikeCounts();
    return Math.max(0, Number(counts[imageKey]) || 0);
  }

  function writeLocalGalleryLikeCount(imageKey, count) {
    var counts = readGalleryLikeCounts();
    counts[imageKey] = Math.max(0, Number(count) || 0);
    writeGalleryLikeCounts(counts);
  }

  function getGalleryLikeButtons() {
    return Array.prototype.slice.call(masonryContainer.querySelectorAll(".gallery-photo-like[data-gallery-like-key]"));
  }

  function setGalleryLikeButtonCount(button, count) {
    var value = Math.max(0, Number(count) || 0);
    button.dataset.galleryLikeCount = String(value);
  }

  function primeGalleryLikeCountsFromLocal() {
    getGalleryLikeButtons().forEach(function (button) {
      setGalleryLikeButtonCount(button, readLocalGalleryLikeCount(button.dataset.galleryLikeKey));
    });
  }

  function scheduleGalleryLikeCountHydration(delay) {
    clearTimeout(likeCountsHydrationTimer);
    likeCountsHydrationTimer = setTimeout(function () {
      hydrateGalleryLikeCounts();
    }, delay || 0);
  }

  async function hydrateGalleryLikeCounts() {
    if (likeCountsHydrationPromise) return likeCountsHydrationPromise;

    var buttons = getGalleryLikeButtons();
    var imageKeys = Array.from(new Set(buttons.map(function (button) {
      return button.dataset.galleryLikeKey;
    }).filter(Boolean)));

    if (!imageKeys.length) return Promise.resolve({});

    primeGalleryLikeCountsFromLocal();

    likeCountsHydrationPromise = getGalleryLikeClient()
      .then(function (supabase) {
        return supabase
          .from(galleryLikeConfig.table)
          .select("image_key")
          .in("image_key", imageKeys)
          .range(0, 9999);
      })
      .then(function (result) {
        if (result.error) throw result.error;

        var counts = {};
        imageKeys.forEach(function (imageKey) {
          counts[imageKey] = 0;
        });
        (result.data || []).forEach(function (row) {
          if (!row || !row.image_key) return;
          counts[row.image_key] = (counts[row.image_key] || 0) + 1;
        });

        buttons.forEach(function (button) {
          var imageKey = button.dataset.galleryLikeKey;
          var count = counts[imageKey] || 0;
          setGalleryLikeButtonCount(button, count);
          writeLocalGalleryLikeCount(imageKey, count);
        });

        return counts;
      })
      .catch(function (error) {
        console.warn("Gallery like counts are using local fallback.", error);
        primeGalleryLikeCountsFromLocal();
        return {};
      })
      .finally(function () {
        likeCountsHydrationPromise = null;
      });

    return likeCountsHydrationPromise;
  }

  function getGalleryLikeClient() {
    if (!galleryLikeClientPromise) {
      galleryLikeClientPromise = import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm")
        .then(function (module) {
          return module.createClient(galleryLikeConfig.supabaseUrl, galleryLikeConfig.supabaseKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
        });
    }
    return galleryLikeClientPromise;
  }

  function getGalleryVisitId() {
    var key = "ZIXI_GALLERY_VISIT_ID";
    var id = sessionStorage.getItem(key);
    if (!id) {
      id = window.crypto?.randomUUID?.() || String(Date.now()) + "-" + Math.random().toString(36).slice(2);
      sessionStorage.setItem(key, id);
    }
    return id;
  }

  async function fetchGalleryLikeCount(imageKey) {
    var supabase = await getGalleryLikeClient();
    var result = await supabase
      .from(galleryLikeConfig.table)
      .select("id", { count: "exact", head: true })
      .eq("image_key", imageKey);
    if (result.error) throw result.error;
    return result.count || 0;
  }

  async function persistGalleryLike(imageKey) {
    var supabase = await getGalleryLikeClient();
    var result = await supabase.from(galleryLikeConfig.table).insert({
      image_key: imageKey,
      visit_id: getGalleryVisitId(),
    });
    if (result.error) throw result.error;
    return fetchGalleryLikeCount(imageKey);
  }

  function expandGalleryLikeButton(button) {
    button.classList.add("is-expanded");
    clearTimeout(Number(button.dataset.retractTimer) || 0);
    button.dataset.retractTimer = String(setTimeout(function () {
      button.classList.remove("is-expanded", "is-count-visible");
    }, 1000));
  }

  function showGalleryLikeCount(button, count) {
    var countNode = button.querySelector(".gallery-photo-like-count");
    if (!countNode) return;
    countNode.textContent = String(Math.max(0, Number(count) || 0));
    expandGalleryLikeButton(button);
    button.classList.remove("is-count-visible");
    void button.offsetWidth;
    button.classList.add("is-count-visible");
  }

  function playGalleryLikeBurst(button) {
    button.classList.remove("is-popping");
    void button.offsetWidth;
    button.classList.add("is-popping");
    setTimeout(function () {
      button.classList.remove("is-popping");
    }, 520);
  }

  async function handleGalleryPhotoLike(button, imageKey) {
    if (button.dataset.likeBusy === "true") return;

    expandGalleryLikeButton(button);

    if (hasLikedGalleryImage(imageKey)) {
      showGalleryLikeCount(button, Number(button.dataset.galleryLikeCount) || readLocalGalleryLikeCount(imageKey));
      scheduleGalleryLikeCountHydration(0);
      return;
    }

    button.dataset.likeBusy = "true";
    markGalleryImageLiked(imageKey);
    button.classList.add("is-liked");
    button.setAttribute("aria-pressed", "true");
    playGalleryLikeBurst(button);

    var baseCount = Math.max(Number(button.dataset.galleryLikeCount) || 0, readLocalGalleryLikeCount(imageKey));
    var count = baseCount + 1;
    setGalleryLikeButtonCount(button, count);
    writeLocalGalleryLikeCount(imageKey, count);
    showGalleryLikeCount(button, count);

    try {
      count = await persistGalleryLike(imageKey);
      setGalleryLikeButtonCount(button, count);
      writeLocalGalleryLikeCount(imageKey, count);
    } catch (error) {
      console.warn("Gallery likes are using local fallback.", error);
      setGalleryLikeButtonCount(button, count);
      writeLocalGalleryLikeCount(imageKey, count);
    } finally {
      button.dataset.likeBusy = "false";
    }
  }

  function waitForImageDecode(img) {
    if (!img.decode) return Promise.resolve();

    return Promise.race([
      img.decode().catch(function () {}),
      new Promise(function (resolve) {
        setTimeout(resolve, 1800);
      }),
    ]);
  }

  function markImageRendered(img, item, shell) {
    if (img.dataset.rendered === "true") return;
    img.dataset.rendered = "true";
    item.classList.remove("masonry-item-loading");
    item.classList.add("masonry-item-loaded");
    shell.classList.remove("loading");
    settleImageLoad(img, true);
    stabilizeLayout();
  }
  function getFileRatio(file, index) {
    if (file.width && file.height) {
      return file.width + " / " + file.height;
    }
    return getPlaceholderRatio(index);
  }

  function getPlaceholderRatio(index) {
    var ratios = ["4 / 3", "3 / 4", "1 / 1", "5 / 4", "4 / 5", "16 / 10"];
    return ratios[index % ratios.length];
  }

  function renderGalleryMessage(message) {
    masonryContainer.innerHTML =
      '<p class="gallery-empty text-third-text-color">' + message + "</p>";
    masonryContainer.dataset.galleryLoaded = "true";
  }

  function revealGalleryContinued() {
    var continued = document.querySelector(".gallery-continued");
    if (!continued) {
      continued = document.createElement("p");
      continued.className = "gallery-continued";
      continued.textContent = "--To be continued--";
      masonryContainer.insertAdjacentElement("afterend", continued);
    }
    continued.hidden = false;
  }

  function revealMasonryContainer() {
    loadingPlaceholder.style.opacity = 0;
    setTimeout(function () {
      loadingPlaceholder.style.display = "none";
    }, 100);
    masonryContainer.style.display = "block";
    masonryContainer.style.opacity = 1;
    revealGalleryContinued();
  }

  function initializeMasonryLayout() {
    if (!masonryContainer.querySelector(".masonry-item")) return;

    if (!isMasonryContainerReady()) {
      scheduleLayout(120);
      return;
    }

    createMasonryLayout();
    installMasonryRelayoutHooks();
    stabilizeLayout();
  }

  function isMasonryContainerReady() {
    return (
      masonryContainer.isConnected &&
      masonryContainer.style.display !== "none" &&
      masonryContainer.clientWidth > 0
    );
  }

  function getMasonryBaseWidth() {
    return masonryContainer.clientWidth >= 768 ? 255 : 150;
  }

  function createMasonryLayout() {
    if (masonry && typeof masonry.destroy === "function") {
      masonry.destroy();
    }

    currentBaseWidth = getMasonryBaseWidth();
    masonry = new MiniMasonry({
      baseWidth: currentBaseWidth,
      container: masonryContainer,
      gutterX: 10,
      gutterY: 10,
      surroundingGutter: false,
    });
  }

  function ensureMasonryLayout() {
    if (!isMasonryContainerReady()) {
      scheduleLayout(120);
      return;
    }

    var nextBaseWidth = getMasonryBaseWidth();
    if (!masonry || nextBaseWidth !== currentBaseWidth) {
      createMasonryLayout();
      return;
    }

    masonry.layout();
  }

  function startProgressiveImageLoading() {
    loadingQueue = Array.prototype.slice.call(
      masonryContainer.querySelectorAll(".masonry-item img[data-src]"),
    );
    activeLoads = 0;
    pumpLoadingQueue();
  }

  function loadImage(img) {
    if (!img || img.src) return;
    img.loading = "eager";
    img.dataset.loadStartedAt = performance.now();

    var preloadedImage = galleryCache.preloadedImages.get(img.dataset.src);
    if (preloadedImage && preloadedImage.complete && preloadedImage.naturalWidth > 0) {
      img.src = preloadedImage.src;
      var item = img.closest(".masonry-item");
      var shell = img.closest(".masonry-image-shell");
      requestAnimationFrame(function () {
        if (!item || !shell || img.dataset.rendered === "true") return;
        if (img.naturalWidth && img.naturalHeight) {
          shell.style.setProperty("--gallery-ratio", img.naturalWidth + " / " + img.naturalHeight);
        } else {
          shell.style.setProperty("--gallery-ratio", preloadedImage.naturalWidth + " / " + preloadedImage.naturalHeight);
        }
        waitForImageDecode(img).then(function () {
          markImageRendered(img, item, shell);
        });
      });
      return;
    }

    img.src = img.dataset.src;
  }

  function retryImageLoad(img) {
    var retryCount = Number(img.dataset.retryCount) || 0;
    img.dataset.retryCount = retryCount + 1;
    img.dataset.loadStartedAt = performance.now();
    img.removeAttribute("src");
    setTimeout(function () {
      img.src = img.dataset.src + (img.dataset.src.indexOf("?") >= 0 ? "&" : "?") + "retry=" + img.dataset.retryCount;
    }, 260 * img.dataset.retryCount);
  }

  function handleImageError(img, item, shell) {
    var retryCount = Number(img.dataset.retryCount) || 0;
    if (retryCount < maxImageRetries) {
      item.classList.add("masonry-item-loading");
      item.classList.remove("masonry-item-error");
      shell.classList.add("loading");
      retryImageLoad(img);
      return;
    }

    item.classList.remove("masonry-item-loading");
    item.classList.add("masonry-item-error");
    shell.classList.remove("loading");
    settleImageLoad(img, false);
    removeFailedGalleryItem(item);
  }

  function removeFailedGalleryItem(item) {
    item.style.display = "none";
    setTimeout(function () {
      item.remove();
      stabilizeLayout();
    }, 120);
  }

  function pumpLoadingQueue() {
    while (activeLoads < maxConcurrentLoads && loadingQueue.length) {
      var nextImage = loadingQueue.shift();
      if (!nextImage || nextImage.src || nextImage.dataset.loadSettled === "true") {
        continue;
      }
      activeLoads += 1;
      loadImage(nextImage);
    }
  }

  function initializeLoadProgress(files) {
    var status = getLoadStatusElement();
    clearTimeout(progressHideTimer);
    clearInterval(progressUpdateTimer);
    clearRenderAuditTimers();
    loadProgress = {
      status: status,
      total: files.length,
      completed: 0,
      failed: 0,
      loaded: 0,
      completedBytes: 0,
      knownTotalBytes: files.reduce(function (total, file) {
        return total + (Number(file.size) || 0);
      }, 0),
      knownFileCount: files.filter(function (file) {
        return Number(file.size) > 0;
      }).length,
      startedAt: performance.now(),
    };
    status.hidden = false;
    status.classList.remove("complete", "is-fading");
    updateLoadStatus();
    progressUpdateTimer = setInterval(updateLoadStatus, 1000);
  }

  function getLoadStatusElement() {
    var status = document.querySelector(".gallery-load-status");
    if (status) return status;

    status = document.createElement("p");
    status.className = "gallery-load-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    loadingPlaceholder.insertAdjacentElement("afterend", status);
    return status;
  }

  function settleImageLoad(img, loaded) {
    if (!loadProgress || img.dataset.loadSettled === "true") return;
    img.dataset.loadSettled = "true";
    activeLoads = Math.max(0, activeLoads - 1);
    loadProgress.completed += 1;
    if (loaded) {
      loadProgress.loaded += 1;
    } else {
      loadProgress.failed += 1;
    }
    loadProgress.completedBytes += getImageSize(img);
    updateLoadStatus();
    pumpLoadingQueue();
  }

  function getImageSize(img) {
    var declaredSize = Number(img.dataset.size) || 0;
    if (declaredSize) return declaredSize;

    if (!performance.getEntriesByName) return 0;
    var entries = performance.getEntriesByName(img.currentSrc || img.src);
    var entry = entries[entries.length - 1];
    return entry ? entry.encodedBodySize || entry.transferSize || 0 : 0;
  }

  function updateLoadStatus() {
    if (!loadProgress) return;
    var progress = loadProgress;
    if (!progress.status.isConnected) {
      clearInterval(progressUpdateTimer);
      return;
    }
    var remainingCount = progress.total - progress.completed;

    if (remainingCount <= 0) {
      var pendingRenderCount = auditGalleryRenderState();
      if (pendingRenderCount > 0) {
        progress.status.textContent = "相册正在完成最后的渲染校准，剩余 " + pendingRenderCount + " 张照片";
        scheduleRenderAudit(360);
        stabilizeLayout();
        return;
      }

      progress.status.textContent = progress.failed
        ? "相册已显示 " + progress.loaded + " 张照片，" + progress.failed + " 张加载失败，已自动跳过"
        : "相册已加载完成，共 " + progress.loaded + " 张照片";
      reportGalleryLoadComplete(progress);
      progress.status.classList.add("complete");
      scheduleGalleryLikeCountHydration(0);
      clearInterval(progressUpdateTimer);
      progressHideTimer = setTimeout(function () {
        progress.status.classList.add("is-fading");
      }, progress.failed ? 4200 : 2400);
      stabilizeLayout();
      scheduleRenderAudit(160);
      scheduleRenderAudit(720);
      scheduleRenderAudit(1600);
      return;
    }

    if (progress.completed < 2 || !progress.completedBytes) {
      progress.status.textContent =
        "正在检测当前网速，已加载 " +
        progress.completed +
        "/" +
        progress.total +
        " 张照片…";
      return;
    }

    var elapsedSeconds = Math.max(
      (performance.now() - progress.startedAt) / 1000,
      1,
    );
    var averageKnownSize = progress.knownFileCount
      ? progress.knownTotalBytes / progress.knownFileCount
      : progress.completedBytes / progress.completed;
    var estimatedTotalBytes = progress.knownTotalBytes
      ? progress.knownTotalBytes +
        averageKnownSize * (progress.total - progress.knownFileCount)
      : averageKnownSize * progress.total;
    var bytesPerSecond = progress.completedBytes / elapsedSeconds;
    var remainingBytes = Math.max(
      estimatedTotalBytes - progress.completedBytes,
      0,
    );
    var remainingSeconds = bytesPerSecond
      ? Math.ceil(remainingBytes / bytesPerSecond)
      : 0;
    var prefix =
      remainingSeconds >= 60 || bytesPerSecond < 1.5 * 1024 * 1024
        ? "当前网速较慢，"
        : "相册正在加载，";

    progress.status.textContent =
      prefix +
      "预计完成加载还需要约 " +
      formatRemainingTime(remainingSeconds) +
      "（" +
      progress.completed +
      "/" +
      progress.total +
      "）";
  }

  function reportGalleryLoadComplete(progress) {
    if (galleryLoadAnalyticsSent || !progress) return;
    galleryLoadAnalyticsSent = true;
    try {
      window.dispatchEvent(new CustomEvent("zixi:gallery-load-complete", {
        detail: {
          load_ms: Math.round(performance.now() - progress.startedAt),
          total: progress.total,
          loaded: progress.loaded,
          failed: progress.failed,
          completed_bytes: progress.completedBytes,
          known_total_bytes: progress.knownTotalBytes,
        },
      }));
    } catch (error) {}
  }

  function auditGalleryRenderState() {
    var pending = 0;
    var images = masonryContainer.querySelectorAll(".masonry-item img");

    images.forEach(function (img) {
      var item = img.closest(".masonry-item");
      var shell = img.closest(".masonry-image-shell");
      if (!item || item.classList.contains("masonry-item-error")) return;

      if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
        if (shell) {
          shell.style.setProperty(
            "--gallery-ratio",
            img.naturalWidth + " / " + img.naturalHeight,
          );
        }
        markImageRendered(img, item, shell || item);
        return;
      }

      pending += 1;
      item.classList.add("masonry-item-loading");
      if (shell) shell.classList.add("loading");

      if (img.dataset.src && !img.src) {
        loadingQueue.unshift(img);
      }
    });

    pumpLoadingQueue();
    return pending;
  }

  function clearRenderAuditTimers() {
    renderAuditTimers.forEach(function (timer) {
      clearTimeout(timer);
    });
    renderAuditTimers = [];
  }

  function scheduleRenderAudit(delay) {
    var timer = setTimeout(function () {
      renderAuditTimers = renderAuditTimers.filter(function (entry) {
        return entry !== timer;
      });
      if (!masonryContainer.isConnected) return;
      var pending = auditGalleryRenderState();
      stabilizeLayout();
      if (pending > 0) scheduleRenderAudit(900);
    }, delay || 240);

    renderAuditTimers.push(timer);
  }
  function formatRemainingTime(seconds) {
    if (!seconds || seconds < 10) return "几秒";
    if (seconds < 60) return seconds + " 秒";
    if (seconds < 3600) return Math.ceil(seconds / 60) + " 分钟";
    return Math.ceil(seconds / 3600) + " 小时";
  }

  function installMasonryRelayoutHooks() {
    if (masonryContainer.dataset.resizeHooked === "true") return;
    masonryContainer.dataset.resizeHooked = "true";

    window.addEventListener("resize", function () {
      clearTimeout(resizeLayoutTimer);
      resizeLayoutTimer = setTimeout(stabilizeLayout, 120);
    });

    if ("ResizeObserver" in window) {
      layoutObserver = new ResizeObserver(function () {
        clearTimeout(resizeLayoutTimer);
        resizeLayoutTimer = setTimeout(stabilizeLayout, 80);
      });
      layoutObserver.observe(masonryContainer);
      if (masonryContainer.parentElement) {
        layoutObserver.observe(masonryContainer.parentElement);
      }
    }
  }

  function stabilizeLayout() {
    if (!masonryContainer.isConnected) return;

    if (!isMasonryContainerReady()) {
      scheduleLayout(140);
      return;
    }

    if (layoutFrame) cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(function () {
      ensureMasonryLayout();
    });

    [120, 360, 760, 1200].forEach(function (delay) {
      setTimeout(function () {
        if (masonryContainer.isConnected) ensureMasonryLayout();
      }, delay);
    });
  }

  function scheduleLayout(delay) {
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(function () {
      if (!masonryContainer.isConnected) return;
      if (!masonry) {
        initializeMasonryLayout();
        return;
      }
      ensureMasonryLayout();
    }, delay || 80);
  }
}

try {
  swup.hooks.on("page:view", initGalleryRuntime);
} catch (e) {}

window.__ZIXI_GALLERY__ = {
  cache: galleryCache,
  getGalleryFiles: getGalleryFiles,
  preloadGalleryData: preloadGalleryData,
  preloadAllGalleryImages: preloadAllGalleryImages,
  preloadMasonryPage: preloadMasonryPage,
  scheduleGalleryWarmup: scheduleGalleryWarmup,
  initMasonry: initMasonry,
};

document.addEventListener("DOMContentLoaded", initGalleryRuntime);
