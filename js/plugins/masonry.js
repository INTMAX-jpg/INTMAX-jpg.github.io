export function initMasonry() {
  var loadingPlaceholder = document.querySelector(".loading-placeholder");
  var masonryContainer = document.querySelector("#masonry-container");
  if (!loadingPlaceholder || !masonryContainer) return;

  var masonry = null;
  var layoutTimer = null;
  var eagerCount = 3;
  var maxConcurrentLoads = 3;
  var loadingQueue = [];
  var activeLoads = 0;
  var loadProgress = null;
  var progressHideTimer = null;
  var progressUpdateTimer = null;

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
    });
  }

  function createGalleryItem(file, index) {
    var item = document.createElement("div");
    item.className = "masonry-item masonry-item-loading";

    var shell = document.createElement("div");
    shell.className = "masonry-image-shell loading";
    shell.style.setProperty("--gallery-ratio", getPlaceholderRatio(index));

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
      item.classList.remove("masonry-item-loading");
      item.classList.add("masonry-item-loaded");
      shell.classList.remove("loading");
      settleImageLoad(img, true);
      scheduleLayout();
    });

    img.addEventListener("error", function () {
      item.classList.remove("masonry-item-loading");
      item.classList.add("masonry-item-error");
      shell.classList.remove("loading");
      settleImageLoad(img, false);
      scheduleLayout();
    });

    shell.appendChild(img);
    item.appendChild(shell);
    return item;
  }

  function getPlaceholderRatio(index) {
    var ratios = ["4 / 3", "3 / 4", "1 / 1", "5 / 4", "4 / 5", "16 / 10"];
    return ratios[index % ratios.length];
  }

  function getGalleryFiles() {
    return fetch("/images/gallery_compress/photos.json", { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("No local gallery manifest");
        return response.json();
      })
      .then(normalizeManifestFiles)
      .catch(function () {
        var repoApi =
          "https://api.github.com/repos/INTMAX-jpg/INTMAX-jpg.github.io/contents/images/gallery_compress";
        return fetch(repoApi, { cache: "no-store" })
          .then(function (response) {
            if (!response.ok) throw new Error("No GitHub gallery_compress directory");
            return response.json();
          })
          .then(normalizeGithubFiles)
          .catch(function () {
            return [];
          });
      });
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
          };
        }

        if (file && file.name && file.url) {
          return {
            name: file.name,
            url: file.url,
            size: Number(file.size) || 0,
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

  function renderGalleryMessage(message) {
    masonryContainer.innerHTML =
      '<p class="gallery-empty text-third-text-color">' + message + "</p>";
    masonryContainer.dataset.galleryLoaded = "true";
  }

  function revealMasonryContainer() {
    loadingPlaceholder.style.opacity = 0;
    setTimeout(function () {
      loadingPlaceholder.style.display = "none";
    }, 100);
    masonryContainer.style.display = "block";
    masonryContainer.style.opacity = 1;
  }

  function initializeMasonryLayout() {
    if (!masonryContainer.querySelector(".masonry-item")) return;

    masonry = new MiniMasonry({
      baseWidth: window.innerWidth >= 768 ? 255 : 150,
      container: masonryContainer,
      gutterX: 10,
      gutterY: 10,
      surroundingGutter: false,
    });
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
    img.src = img.dataset.src;
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
    loadProgress = {
      status: status,
      total: files.length,
      completed: 0,
      failed: 0,
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
    status.classList.remove("complete");
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
    if (!loaded) loadProgress.failed += 1;
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
      progress.status.textContent =
        "相册已加载完成，共 " +
        progress.total +
        " 张照片" +
        (progress.failed ? "，" + progress.failed + " 张加载失败" : "");
      progress.status.classList.add("complete");
      clearInterval(progressUpdateTimer);
      progressHideTimer = setTimeout(function () {
        progress.status.hidden = true;
      }, 2400);
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

  function formatRemainingTime(seconds) {
    if (!seconds || seconds < 10) return "几秒";
    if (seconds < 60) return seconds + " 秒";
    if (seconds < 3600) return Math.ceil(seconds / 60) + " 分钟";
    return Math.ceil(seconds / 3600) + " 小时";
  }

  function scheduleLayout() {
    if (!masonry) return;
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(function () {
      masonry.layout();
    }, 80);
  }
}

if (data.masonry) {
  try {
    swup.hooks.on("page:view", initMasonry);
  } catch (e) {}

  document.addEventListener("DOMContentLoaded", initMasonry);
}
