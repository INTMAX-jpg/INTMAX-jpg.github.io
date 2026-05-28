export function initMasonry() {
  var loadingPlaceholder = document.querySelector(".loading-placeholder");
  var masonryContainer = document.querySelector("#masonry-container");
  if (!loadingPlaceholder || !masonryContainer) return;

  loadingPlaceholder.style.display = "block";
  masonryContainer.style.display = "none";

  loadGalleryImages()
    .catch(function () {
      renderGalleryMessage("Photo loading failed. Please check images/gallery/.");
    })
    .finally(function () {
      prepareMasonryLayout();
    });

  function loadGalleryImages() {
    if (masonryContainer.dataset.galleryLoaded === "true") {
      return Promise.resolve();
    }

    var existingImages = masonryContainer.querySelectorAll(".masonry-item img");
    if (existingImages.length > 0) {
      masonryContainer.dataset.galleryLoaded = "true";
      return Promise.resolve();
    }

    return getGalleryFiles().then(function (files) {
      if (!files.length) {
        renderGalleryMessage("No photos yet. Put your images in images/gallery/.");
        return;
      }

      var fragment = document.createDocumentFragment();
      files.forEach(function (file) {
        var item = document.createElement("div");
        item.className = "masonry-item";

        var img = document.createElement("img");
        img.src = file.url;
        img.alt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
        img.loading = "lazy";
        img.decoding = "async";

        item.appendChild(img);
        fragment.appendChild(item);
      });

      masonryContainer.appendChild(fragment);
      masonryContainer.dataset.galleryLoaded = "true";
    });
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

  function prepareMasonryLayout() {
    var images = document.querySelectorAll(
      "#masonry-container .masonry-item img",
    );
    var loadedCount = 0;

    if (!images.length) {
      initializeMasonryLayout(false);
      return;
    }

    function onImageLoad() {
      loadedCount++;
      if (loadedCount === images.length) {
        initializeMasonryLayout(true);
      }
    }

    for (var i = 0; i < images.length; i++) {
      var img = images[i];
      if (img.complete) {
        onImageLoad();
      } else {
        img.addEventListener("load", onImageLoad);
        img.addEventListener("error", onImageLoad);
      }
    }

    if (loadedCount === images.length) {
      initializeMasonryLayout(true);
    }
  }

  function initializeMasonryLayout(hasImages) {
    loadingPlaceholder.style.opacity = 0;
    setTimeout(() => {
      loadingPlaceholder.style.display = "none";
      masonryContainer.style.display = "block";
      if (!hasImages) {
        masonryContainer.style.opacity = 1;
        return;
      }

      var screenWidth = window.innerWidth;
      var baseWidth;
      if (screenWidth >= 768) {
        baseWidth = 255;
      } else {
        baseWidth = 150;
      }
      var masonry = new MiniMasonry({
        baseWidth: baseWidth,
        container: masonryContainer,
        gutterX: 10,
        gutterY: 10,
        surroundingGutter: false,
      });
      masonry.layout();
      masonryContainer.style.opacity = 1;
    }, 100);
  }
}

if (data.masonry) {
  try {
    swup.hooks.on("page:view", initMasonry);
  } catch (e) {}

  document.addEventListener("DOMContentLoaded", initMasonry);
}
