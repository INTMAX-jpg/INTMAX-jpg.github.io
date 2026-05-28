export function initMasonry() {
  var loadingPlaceholder = document.querySelector(".loading-placeholder");
  var masonryContainer = document.querySelector("#masonry-container");
  if (!loadingPlaceholder || !masonryContainer) return;

  var masonry = null;
  var layoutTimer = null;
  var eagerCount = 6;

  loadingPlaceholder.style.display = "block";
  masonryContainer.style.display = "none";

  loadGalleryImages()
    .then(function () {
      revealMasonryContainer();
      initializeMasonryLayout();
      startProgressiveImageLoading();
    })
    .catch(function () {
      renderGalleryMessage("Photo loading failed. Please check images/gallery/.");
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
        renderGalleryMessage("No photos yet. Put your images in images/gallery/.");
        return;
      }

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
      scheduleLayout();
    });

    img.addEventListener("error", function () {
      item.classList.remove("masonry-item-loading");
      item.classList.add("masonry-item-error");
      shell.classList.remove("loading");
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
    var repoApi =
      "https://api.github.com/repos/INTMAX-jpg/INTMAX-jpg.github.io/contents/images/gallery";
    return fetch(repoApi, { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("No GitHub gallery directory");
        return response.json();
      })
      .then(function (items) {
        return normalizeGithubFiles(items);
      })
      .catch(function () {
        return fetch("/images/gallery/photos.json", { cache: "no-store" })
          .then(function (response) {
            if (!response.ok) return [];
            return response.json();
          })
          .then(normalizeManifestFiles)
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
          url: "/images/gallery/" + encodeURIComponent(item.name),
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
            url: "/images/gallery/" + encodeURIComponent(file),
          };
        }

        if (file && file.name && file.url) {
          return file;
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
    var images = Array.prototype.slice.call(
      masonryContainer.querySelectorAll(".masonry-item img[data-src]"),
    );

    images.slice(0, eagerCount).forEach(loadImage);

    if (!("IntersectionObserver" in window)) {
      images.slice(eagerCount).forEach(loadImage);
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          var img = entry.target.querySelector("img[data-src]");
          if (img) loadImage(img);
        });
      },
      { rootMargin: "900px 0px" },
    );

    images.slice(eagerCount).forEach(function (img) {
      observer.observe(img.closest(".masonry-item"));
    });
  }

  function loadImage(img) {
    if (!img || img.src) return;
    img.src = img.dataset.src;
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
