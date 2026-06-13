const DEFAULT_EDIT = Object.freeze({
  exposure: 100,
  contrast: 100,
  saturation: 100,
  warmth: 0,
  tint: 0,
  fade: 0,
  vignette: 0,
  denoise: 0,
  crop: Object.freeze({
    enabled: false,
    aspect: "original",
    size: 100,
    x: 50,
    y: 50,
  }),
});

const PRESETS = {
  natural: {
    exposure: 100,
    contrast: 100,
    saturation: 100,
    warmth: 0,
    tint: 0,
    fade: 0,
    vignette: 0,
    denoise: 0,
  },
  auto: {
    exposure: 108,
    contrast: 112,
    saturation: 108,
    warmth: 6,
    tint: 0,
    fade: 0,
    vignette: 8,
    denoise: 14,
  },
  vivid: {
    exposure: 104,
    contrast: 122,
    saturation: 138,
    warmth: 4,
    tint: 2,
    fade: 0,
    vignette: 12,
    denoise: 8,
  },
  bw: {
    exposure: 104,
    contrast: 126,
    saturation: 0,
    warmth: 0,
    tint: 0,
    fade: 8,
    vignette: 16,
    denoise: 18,
  },
  warm: {
    exposure: 104,
    contrast: 108,
    saturation: 112,
    warmth: 52,
    tint: 8,
    fade: 4,
    vignette: 10,
    denoise: 8,
  },
  cool: {
    exposure: 100,
    contrast: 112,
    saturation: 106,
    warmth: -48,
    tint: -8,
    fade: 2,
    vignette: 10,
    denoise: 8,
  },
};

const PHOTO_EXTENSIONS = new Set([
  ".3fr", ".arw", ".avif", ".bmp", ".cr2", ".cr3", ".crw", ".dib", ".dng",
  ".erf", ".fff", ".gif", ".heic", ".heif", ".hif", ".iiq", ".j2k", ".jpe",
  ".jpeg", ".jpg", ".jpf", ".jp2", ".jxl", ".kdc", ".mef", ".mos", ".mrw",
  ".nef", ".nrw", ".orf", ".pef", ".png", ".ptx", ".raf", ".raw", ".rw2",
  ".rwl", ".sr2", ".srf", ".srw", ".svg", ".tif", ".tiff", ".webp", ".x3f",
]);

const PREVIEW_EXTENSIONS = new Set([".avif", ".bmp", ".dib", ".gif", ".jpe", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);

const state = {
  images: [],
  activeIndex: 0,
  editHistory: [],
  batchStatus: "Ready",
  batchRunning: false,
  updateInfo: {
    enabled: false,
    status: "Desktop app only",
    version: "web preview",
    available: false,
    downloaded: false,
    autoCheck: false,
  },
  libraryInfo: {
    enabled: false,
    homeFolder: "",
    status: "Desktop app only",
    deleteOriginals: false,
    camera: null,
    cameraStatus: "Desktop app only",
    importing: false,
  },
  zoom: 1,
  rotation: 0,
  flipX: 1,
  flipY: 1,
  panX: 0,
  panY: 0,
  dragging: false,
  dragStart: null,
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  bindEvents();
  loadSampleAlbum();
  render();
  initDesktopUpdates();
  initDesktopLibrary();

  if (window.lucide) {
    window.lucide.createIcons();
  }
});

function bindElements() {
  Object.assign(els, {
    fileInput: document.getElementById("fileInput"),
    openButton: document.getElementById("openButton"),
    exportButton: document.getElementById("exportButton"),
    previousButton: document.getElementById("previousButton"),
    nextButton: document.getElementById("nextButton"),
    zoomOutButton: document.getElementById("zoomOutButton"),
    zoomInButton: document.getElementById("zoomInButton"),
    fitButton: document.getElementById("fitButton"),
    actualButton: document.getElementById("actualButton"),
    rotateLeftButton: document.getElementById("rotateLeftButton"),
    rotateRightButton: document.getElementById("rotateRightButton"),
    flipHorizontalButton: document.getElementById("flipHorizontalButton"),
    flipVerticalButton: document.getElementById("flipVerticalButton"),
    resetButton: document.getElementById("resetButton"),
    undoEditButton: document.getElementById("undoEditButton"),
    removeButton: document.getElementById("removeButton"),
    applyEditButton: document.getElementById("applyEditButton"),
    autoDenoiseButton: document.getElementById("autoDenoiseButton"),
    resetEditsButton: document.getElementById("resetEditsButton"),
    autoBatchButton: document.getElementById("autoBatchButton"),
    matchBatchButton: document.getElementById("matchBatchButton"),
    copiesBatchButton: document.getElementById("copiesBatchButton"),
    resetBatchButton: document.getElementById("resetBatchButton"),
    setHomeButton: document.getElementById("setHomeButton"),
    loadHomeButton: document.getElementById("loadHomeButton"),
    openHomeFolderButton: document.getElementById("openHomeFolderButton"),
    scanCameraButton: document.getElementById("scanCameraButton"),
    importCameraButton: document.getElementById("importCameraButton"),
    ignoreCameraButton: document.getElementById("ignoreCameraButton"),
    deleteCameraOriginalsToggle: document.getElementById("deleteCameraOriginalsToggle"),
    updateAutoCheckToggle: document.getElementById("updateAutoCheckToggle"),
    checkUpdatesButton: document.getElementById("checkUpdatesButton"),
    downloadUpdateButton: document.getElementById("downloadUpdateButton"),
    installUpdateButton: document.getElementById("installUpdateButton"),
    presetButtons: Array.from(document.querySelectorAll("[data-preset]")),
    cropButtons: Array.from(document.querySelectorAll("[data-crop]")),
    editRanges: Array.from(document.querySelectorAll("[data-edit-range]")),
    cropRanges: Array.from(document.querySelectorAll("[data-crop-range]")),
    collectionStatus: document.getElementById("collectionStatus"),
    imageCount: document.getElementById("imageCount"),
    thumbRail: document.getElementById("thumbRail"),
    filmstrip: document.getElementById("filmstrip"),
    stage: document.getElementById("stage"),
    activeImage: document.getElementById("activeImage"),
    cropOverlay: document.getElementById("cropOverlay"),
    cropFrame: document.getElementById("cropFrame"),
    vignetteOverlay: document.getElementById("vignetteOverlay"),
    activeName: document.getElementById("activeName"),
    activeZoom: document.getElementById("activeZoom"),
    editStatus: document.getElementById("editStatus"),
    batchStatus: document.getElementById("batchStatus"),
    homeStatus: document.getElementById("homeStatus"),
    homePath: document.getElementById("homePath"),
    cameraStatus: document.getElementById("cameraStatus"),
    cameraPrompt: document.getElementById("cameraPrompt"),
    updateStatus: document.getElementById("updateStatus"),
    updateVersion: document.getElementById("updateVersion"),
    exposureValue: document.getElementById("exposureValue"),
    contrastValue: document.getElementById("contrastValue"),
    saturationValue: document.getElementById("saturationValue"),
    warmthValue: document.getElementById("warmthValue"),
    tintValue: document.getElementById("tintValue"),
    fadeValue: document.getElementById("fadeValue"),
    vignetteValue: document.getElementById("vignetteValue"),
    denoiseValue: document.getElementById("denoiseValue"),
    cropSizeValue: document.getElementById("cropSizeValue"),
    cropXValue: document.getElementById("cropXValue"),
    cropYValue: document.getElementById("cropYValue"),
    detailName: document.getElementById("detailName"),
    detailPixels: document.getElementById("detailPixels"),
    detailType: document.getElementById("detailType"),
    detailSize: document.getElementById("detailSize"),
    detailModified: document.getElementById("detailModified"),
    histogramCanvas: document.getElementById("histogramCanvas"),
    histogramPeak: document.getElementById("histogramPeak"),
    viewZoom: document.getElementById("viewZoom"),
    viewRotation: document.getElementById("viewRotation"),
    viewFlip: document.getElementById("viewFlip"),
  });
}

function bindEvents() {
  els.openButton.addEventListener("click", () => els.fileInput.click());
  els.exportButton.addEventListener("click", saveEditedCopy);
  els.fileInput.addEventListener("change", (event) => importFiles(event.target.files));

  els.previousButton.addEventListener("click", () => moveActive(-1));
  els.nextButton.addEventListener("click", () => moveActive(1));
  els.zoomOutButton.addEventListener("click", () => zoomBy(0.84));
  els.zoomInButton.addEventListener("click", () => zoomBy(1.19));
  els.fitButton.addEventListener("click", fitToStage);
  els.actualButton.addEventListener("click", () => setZoom(1));
  els.rotateLeftButton.addEventListener("click", () => rotateBy(-90));
  els.rotateRightButton.addEventListener("click", () => rotateBy(90));
  els.flipHorizontalButton.addEventListener("click", () => {
    state.flipX *= -1;
    renderViewState();
  });
  els.flipVerticalButton.addEventListener("click", () => {
    state.flipY *= -1;
    renderViewState();
  });
  els.resetButton.addEventListener("click", resetView);
  els.undoEditButton.addEventListener("click", undoEdit);
  els.removeButton.addEventListener("click", removeActive);
  els.applyEditButton.addEventListener("click", applyEditsToLibrary);
  els.autoDenoiseButton.addEventListener("click", autoDenoiseActive);
  els.resetEditsButton.addEventListener("click", resetEdits);
  els.autoBatchButton.addEventListener("click", autoBatchEdit);
  els.matchBatchButton.addEventListener("click", matchBatchToCurrent);
  els.copiesBatchButton.addEventListener("click", makeBatchCopies);
  els.resetBatchButton.addEventListener("click", resetBatchEdits);
  els.setHomeButton.addEventListener("click", chooseHomeFolder);
  els.loadHomeButton.addEventListener("click", loadHomeFolder);
  els.openHomeFolderButton.addEventListener("click", openHomeFolder);
  els.scanCameraButton.addEventListener("click", scanForCameras);
  els.importCameraButton.addEventListener("click", importDetectedCamera);
  els.ignoreCameraButton.addEventListener("click", ignoreDetectedCamera);
  els.deleteCameraOriginalsToggle.addEventListener("change", () => {
    setDeleteCameraOriginals(els.deleteCameraOriginalsToggle.checked);
  });
  els.checkUpdatesButton.addEventListener("click", checkForUpdates);
  els.downloadUpdateButton.addEventListener("click", downloadUpdate);
  els.installUpdateButton.addEventListener("click", installUpdate);
  els.updateAutoCheckToggle.addEventListener("change", () => {
    setUpdateAutoCheck(els.updateAutoCheckToggle.checked);
  });

  els.presetButtons.forEach((button) => {
    button.addEventListener("click", () => applyPreset(button.dataset.preset));
  });

  els.cropButtons.forEach((button) => {
    button.addEventListener("click", () => setCropMode(button.dataset.crop));
  });

  els.editRanges.forEach((range) => {
    range.addEventListener("input", () => {
      setEditPatch({ [range.dataset.editRange]: Number(range.value) });
    });
  });

  els.cropRanges.forEach((range) => {
    range.addEventListener("input", () => {
      const edit = getEdit();
      setEditPatch({
        crop: {
          ...edit.crop,
          enabled: true,
          [range.dataset.cropRange]: Number(range.value),
        },
      });
    });
  });

  els.activeImage.addEventListener("load", () => {
    const active = getActive();
    if (!active) return;
    active.width = els.activeImage.naturalWidth;
    active.height = els.activeImage.naturalHeight;
    fitToStage();
    renderLists();
    renderDetails();
    renderEditState();
    renderHistogram();
  });

  els.stage.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomBy(event.deltaY > 0 ? 0.9 : 1.1);
  }, { passive: false });

  els.stage.addEventListener("pointerdown", (event) => {
    if (!getActive()) return;
    state.dragging = true;
    state.dragStart = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      panX: state.panX,
      panY: state.panY,
    };
    els.stage.classList.add("dragging");
    els.stage.setPointerCapture(event.pointerId);
  });

  els.stage.addEventListener("pointermove", (event) => {
    if (!state.dragging || !state.dragStart) return;
    state.panX = state.dragStart.panX + event.clientX - state.dragStart.x;
    state.panY = state.dragStart.panY + event.clientY - state.dragStart.y;
    renderTransform();
  });

  els.stage.addEventListener("pointerup", endDrag);
  els.stage.addEventListener("pointercancel", endDrag);

  ["dragenter", "dragover"].forEach((eventName) => {
    els.stage.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.stage.classList.add("dragHover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    els.stage.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.stage.classList.remove("dragHover");
    });
  });

  els.stage.addEventListener("drop", (event) => {
    importFiles(event.dataTransfer.files);
  });

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    const commandOpen = (event.ctrlKey || event.metaKey) && key === "o";
    const commandSave = (event.ctrlKey || event.metaKey) && key === "s";
    const commandUndo = (event.ctrlKey || event.metaKey) && key === "z";

    if (commandOpen) {
      event.preventDefault();
      els.fileInput.click();
      return;
    }

    if (commandSave) {
      event.preventDefault();
      saveEditedCopy();
      return;
    }

    if (commandUndo) {
      event.preventDefault();
      undoEdit();
      return;
    }

    if (event.target && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
    if (key === "arrowleft") moveActive(-1);
    if (key === "arrowright") moveActive(1);
    if (key === "+" || key === "=") zoomBy(1.14);
    if (key === "-") zoomBy(0.88);
    if (key === "0") resetView();
  });

  window.addEventListener("resize", () => {
    if (getActive()) fitToStage();
  });
}

function endDrag(event) {
  if (state.dragStart && event.pointerId === state.dragStart.pointerId) {
    state.dragging = false;
    state.dragStart = null;
    els.stage.classList.remove("dragging");
  }
}

function loadSampleAlbum() {
  const now = Date.now();
  state.images = [
    makeSampleImage("Studio Reference 01", "Warm desk", now - 86000000, drawDeskSample),
    makeSampleImage("Studio Reference 02", "Neon alley", now - 43000000, drawNeonSample),
    makeSampleImage("Studio Reference 03", "Mountain light", now - 12000000, drawMountainSample),
  ];
  state.activeIndex = 0;
}

function makeSampleImage(name, note, modified, drawFn) {
  const canvas = document.createElement("canvas");
  canvas.width = 1800;
  canvas.height = 1200;
  const ctx = canvas.getContext("2d");
  drawFn(ctx, canvas.width, canvas.height);
  const src = canvas.toDataURL("image/jpeg", 0.9);

  return {
    id: makeId(),
    name,
    note,
    src,
    type: "image/jpeg",
    size: estimateDataUrlSize(src),
    modified,
    width: canvas.width,
    height: canvas.height,
    edit: makeDefaultEdit(),
    sample: true,
  };
}

function drawDeskSample(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#221d19");
  gradient.addColorStop(0.45, "#654c38");
  gradient.addColorStop(1, "#151919");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(245, 207, 139, 0.13)";
  for (let x = 0; x < width; x += 42) ctx.fillRect(x, 0, 1, height);
  for (let y = 0; y < height; y += 42) ctx.fillRect(0, y, width, 1);

  ctx.fillStyle = "#d7c3a3";
  roundedRect(ctx, 232, 184, 932, 624, 24);
  ctx.fill();
  ctx.fillStyle = "#1a1d1c";
  roundedRect(ctx, 300, 250, 794, 492, 12);
  ctx.fill();
  ctx.fillStyle = "#39d8be";
  ctx.globalAlpha = 0.62;
  roundedRect(ctx, 362, 310, 316, 52, 8);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#ff6b4a";
  roundedRect(ctx, 1238, 618, 264, 264, 132);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.32)";
  roundedRect(ctx, 1284, 676, 132, 34, 17);
  ctx.fill();

  drawNoise(ctx, width, height, 0.055);
}

function drawNeonSample(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#070909");
  gradient.addColorStop(0.55, "#17211d");
  gradient.addColorStop(1, "#251513");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 22; i += 1) {
    ctx.fillStyle = `rgba(57,216,190,${0.05 + i * 0.004})`;
    ctx.fillRect(120 + i * 36, 0, 12, height);
  }

  ctx.shadowBlur = 42;
  ctx.shadowColor = "#39d8be";
  ctx.strokeStyle = "#39d8be";
  ctx.lineWidth = 12;
  ctx.strokeRect(250, 204, 430, 612);
  ctx.shadowColor = "#ff6b4a";
  ctx.strokeStyle = "#ff6b4a";
  ctx.strokeRect(1048, 306, 362, 420);
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#0d0f0e";
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(width, height);
  ctx.lineTo(1120, 764);
  ctx.lineTo(702, 764);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(240,189,73,0.48)";
  ctx.lineWidth = 4;
  for (let y = 810; y < height; y += 74) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y - 80);
    ctx.stroke();
  }

  drawNoise(ctx, width, height, 0.072);
}

function drawMountainSample(ctx, width, height) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#f3c565");
  sky.addColorStop(0.42, "#705846");
  sky.addColorStop(1, "#101312");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255, 247, 221, 0.78)";
  roundedRect(ctx, 1240, 178, 146, 146, 73);
  ctx.fill();

  ctx.fillStyle = "#332b28";
  drawMountain(ctx, [0, 920, 290, 456, 690, 940]);
  ctx.fillStyle = "#1d2623";
  drawMountain(ctx, [350, 968, 900, 344, 1450, 982]);
  ctx.fillStyle = "#101514";
  drawMountain(ctx, [980, 990, 1440, 512, 1800, 992]);

  ctx.fillStyle = "rgba(57, 216, 190, 0.2)";
  ctx.fillRect(0, 982, width, 218);
  ctx.fillStyle = "rgba(244,241,232,0.16)";
  for (let y = 1005; y < height; y += 34) {
    ctx.fillRect(0, y, width, 2);
  }

  drawNoise(ctx, width, height, 0.05);
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawMountain(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  ctx.lineTo(points[2], points[3]);
  ctx.lineTo(points[4], points[5]);
  ctx.lineTo(points[4], 1200);
  ctx.lineTo(points[0], 1200);
  ctx.closePath();
  ctx.fill();
}

function drawNoise(ctx, width, height, opacity) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const value = (Math.random() - 0.5) * 255 * opacity;
    data[i] += value;
    data[i + 1] += value;
    data[i + 2] += value;
  }
  ctx.putImageData(imageData, 0, 0);
}

function extensionFromName(name) {
  const dot = String(name || "").lastIndexOf(".");
  return dot >= 0 ? String(name).slice(dot).toLowerCase() : "";
}

function isSupportedPhotoFile(file) {
  const type = String(file?.type || "");
  return Boolean(file && (type.startsWith("image/") || PHOTO_EXTENSIONS.has(extensionFromName(file.name))));
}

function isPreviewableName(name, type = "") {
  const extension = extensionFromName(name);
  if (extension) return PREVIEW_EXTENSIONS.has(extension);
  return type.startsWith("image/");
}

function escapeSvgText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function makePlaceholderSrc(name, type = "photo") {
  const label = extensionFromName(name).replace(".", "").toUpperCase() || "PHOTO";
  const safeName = escapeSvgText(name || type);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="460" viewBox="0 0 720 460">
    <rect width="720" height="460" fill="#101211"/>
    <rect x="34" y="34" width="652" height="392" rx="22" fill="#171b19" stroke="#39d8be" stroke-opacity=".42" stroke-width="3"/>
    <circle cx="360" cy="194" r="78" fill="#233530" stroke="#39d8be" stroke-width="12"/>
    <circle cx="360" cy="194" r="34" fill="#0d1110"/>
    <text x="360" y="310" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#f4f7f3">${escapeSvgText(label)}</text>
    <text x="360" y="352" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#9ba59f">${safeName}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function makeImageEntry(details) {
  return {
    id: makeId(),
    name: details.name,
    src: details.src,
    type: details.type || "image",
    size: details.size || 0,
    modified: details.modified || Date.now(),
    width: details.width || 0,
    height: details.height || 0,
    sourcePath: details.sourcePath || "",
    relativePath: details.relativePath || "",
    previewSupported: details.previewSupported !== false,
    edit: makeDefaultEdit(),
    sample: Boolean(details.sample),
  };
}

function addImportedImages(imported) {
  const clean = imported.filter(Boolean);
  if (!clean.length) return;

  const hadOnlySamples = state.images.every((image) => image.sample);
  state.images = hadOnlySamples ? clean : [...state.images, ...clean];
  state.activeIndex = hadOnlySamples ? 0 : state.images.length - clean.length;
  state.editHistory = [];
  resetView(false);
  render();
}

async function importFiles(fileList) {
  const files = Array.from(fileList || []).filter(isSupportedPhotoFile);
  if (!files.length) return;

  const imported = await Promise.all(files.map(readImageFile));
  addImportedImages(imported);
  els.fileInput.value = "";
}

function readImageFile(file) {
  return new Promise((resolve) => {
    if (!isPreviewableName(file.name, file.type)) {
      resolve(makeImageEntry({
        name: file.name,
        src: makePlaceholderSrc(file.name, file.type || "photo"),
        type: file.type || "camera photo",
        size: file.size,
        modified: file.lastModified,
        previewSupported: false,
      }));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        resolve(makeImageEntry({
          name: file.name,
          src: reader.result,
          type: file.type || "image",
          size: file.size,
          modified: file.lastModified,
          width: image.naturalWidth,
          height: image.naturalHeight,
          previewSupported: true,
        }));
      };
      image.onerror = () => {
        resolve(makeImageEntry({
          name: file.name,
          src: makePlaceholderSrc(file.name, file.type || "photo"),
          type: file.type || "camera photo",
          size: file.size,
          modified: file.lastModified,
          previewSupported: false,
        }));
      };
      image.src = reader.result;
    };
    reader.onerror = () => {
      resolve(makeImageEntry({
        name: file.name,
        src: makePlaceholderSrc(file.name, file.type || "photo"),
        type: file.type || "camera photo",
        size: file.size,
        modified: file.lastModified,
        previewSupported: false,
      }));
    };
    reader.readAsDataURL(file);
  });
}

function render() {
  const active = getActive();
  if (active) ensureImageEdit(active);
  els.activeImage.src = active ? active.src : "";
  els.activeImage.alt = active ? active.name : "";
  renderLists();
  renderDetails();
  renderViewState();
  renderEditState();
  renderBatchStatus();
  renderLibraryState();
  renderUpdateState();
  updateButtons();

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function renderLists() {
  els.imageCount.textContent = String(state.images.length);
  els.collectionStatus.textContent = `${state.images.length} image${state.images.length === 1 ? "" : "s"}`;
  els.thumbRail.replaceChildren(...state.images.map((image, index) => createThumb(image, index)));
  els.filmstrip.replaceChildren(...state.images.map((image, index) => createStripButton(image, index)));
}

function createThumb(image, index) {
  const button = document.createElement("button");
  button.className = `thumbButton${index === state.activeIndex ? " active" : ""}`;
  button.type = "button";
  button.title = image.name;
  button.addEventListener("click", () => setActive(index));

  const img = document.createElement("img");
  img.src = image.src;
  img.alt = "";

  const copy = document.createElement("div");
  copy.className = "thumbCopy";

  const name = document.createElement("div");
  name.className = "thumbName";
  name.textContent = image.name;

  const meta = document.createElement("div");
  meta.className = "thumbMeta";
  meta.textContent = image.width && image.height ? `${image.width} x ${image.height}` : image.type;

  copy.append(name, meta);
  button.append(img, copy);
  return button;
}

function createStripButton(image, index) {
  const button = document.createElement("button");
  button.className = `stripButton${index === state.activeIndex ? " active" : ""}`;
  button.type = "button";
  button.title = image.name;
  button.addEventListener("click", () => setActive(index));

  const img = document.createElement("img");
  img.src = image.src;
  img.alt = "";

  button.append(img);
  return button;
}

function renderDetails() {
  const active = getActive();
  els.activeName.textContent = active ? active.name : "No image";
  els.detailName.textContent = active ? active.name : "-";
  els.detailPixels.textContent = active && active.previewSupported === false
    ? "Preview unavailable"
    : active && active.width && active.height ? `${active.width} x ${active.height}` : "-";
  els.detailType.textContent = active ? active.type : "-";
  els.detailSize.textContent = active ? formatBytes(active.size) : "-";
  els.detailModified.textContent = active ? formatDate(active.modified) : "-";
}

function renderViewState() {
  renderTransform();
  const zoom = `${Math.round(state.zoom * 100)}%`;
  els.activeZoom.textContent = zoom;
  els.viewZoom.textContent = zoom;
  els.viewRotation.textContent = `${normalizeRotation(state.rotation)} deg`;
  els.viewFlip.textContent = getFlipLabel();
}

function renderEditState() {
  const active = getActive();
  const edit = getEdit();
  els.activeImage.style.filter = active ? buildPreviewFilter(edit) : "none";
  els.vignetteOverlay.style.opacity = active ? String(edit.vignette / 100) : "0";
  renderEditControls(edit);
  renderCropOverlay(edit);
  updateButtons();
}

function renderBatchStatus() {
  els.batchStatus.textContent = state.batchStatus;
}

function renderLibraryState() {
  const info = state.libraryInfo;
  const camera = info.camera;
  const enabled = Boolean(info.enabled);

  els.homeStatus.textContent = info.status;
  els.homePath.textContent = info.homeFolder ? shortenPath(info.homeFolder) : "No folder set";
  els.homePath.title = info.homeFolder || "No folder set";
  els.cameraStatus.textContent = camera ? "Detected" : info.cameraStatus;
  els.deleteCameraOriginalsToggle.checked = Boolean(info.deleteOriginals);
  els.deleteCameraOriginalsToggle.disabled = !enabled || info.importing;

  if (camera) {
    const count = `${camera.photoCount} photo file${camera.photoCount === 1 ? "" : "s"}`;
    const samples = camera.sampleNames?.length ? `: ${camera.sampleNames.join(", ")}` : "";
    els.cameraPrompt.textContent = info.homeFolder
      ? `Import ${count} from ${camera.name}${samples}`
      : `Set a home folder before importing ${count} from ${camera.name}.`;
  } else if (enabled) {
    els.cameraPrompt.textContent = "Plug in a camera or SD card.";
  } else {
    els.cameraPrompt.textContent = "Camera import runs in the desktop app.";
  }

  els.setHomeButton.disabled = !enabled || info.importing;
  els.loadHomeButton.disabled = !enabled || !info.homeFolder || info.importing;
  els.openHomeFolderButton.disabled = !enabled || !info.homeFolder || info.importing;
  els.scanCameraButton.disabled = !enabled || info.importing;
  els.importCameraButton.disabled = !enabled || !camera || !info.homeFolder || info.importing;
  els.ignoreCameraButton.disabled = !enabled || !camera || info.importing;
}

function renderUpdateState() {
  const update = state.updateInfo;
  els.updateStatus.textContent = update.status;
  els.updateVersion.textContent = `Installed version: ${update.version}`;
  els.updateAutoCheckToggle.checked = Boolean(update.autoCheck);
  els.updateAutoCheckToggle.disabled = !update.enabled;
  els.checkUpdatesButton.disabled = !update.enabled;
  els.downloadUpdateButton.disabled = !update.enabled || !update.available || update.downloaded;
  els.installUpdateButton.disabled = !update.enabled || !update.downloaded;
}

async function initDesktopLibrary() {
  const library = window.itszLibrary;
  if (!library) {
    state.libraryInfo = {
      ...state.libraryInfo,
      enabled: false,
      status: "Desktop app only",
      cameraStatus: "Desktop app only",
      camera: null,
    };
    renderLibraryState();
    return;
  }

  library.onCameraDetected((camera) => {
    state.libraryInfo = {
      ...state.libraryInfo,
      enabled: true,
      camera,
      cameraStatus: "Detected",
    };
    renderLibraryState();
  });

  try {
    const info = await library.getInfo();
    state.libraryInfo = {
      ...state.libraryInfo,
      ...info,
      enabled: true,
      cameraStatus: "Waiting",
    };
  } catch (error) {
    console.error(error);
    state.libraryInfo = {
      ...state.libraryInfo,
      enabled: false,
      status: "Library unavailable",
      cameraStatus: "Unavailable",
    };
  }
  renderLibraryState();
}

async function chooseHomeFolder() {
  if (!window.itszLibrary) return;
  try {
    const info = await window.itszLibrary.chooseHomeFolder();
    state.libraryInfo = {
      ...state.libraryInfo,
      ...info,
      enabled: true,
    };
  } catch (error) {
    console.error(error);
    state.libraryInfo.status = "Home setup failed";
  }
  renderLibraryState();
}

async function openHomeFolder() {
  if (!window.itszLibrary) return;
  try {
    const result = await window.itszLibrary.openHomeFolder();
    state.libraryInfo.status = result.status || "Opened home folder";
  } catch (error) {
    console.error(error);
    state.libraryInfo.status = "Open failed";
  }
  renderLibraryState();
}

async function loadHomeFolder() {
  if (!window.itszLibrary || state.libraryInfo.importing) return;
  state.libraryInfo.status = "Loading home";
  renderLibraryState();
  try {
    const result = await window.itszLibrary.loadHomeFolder();
    state.libraryInfo = {
      ...state.libraryInfo,
      homeFolder: result.homeFolder || state.libraryInfo.homeFolder,
      status: result.status || "Home loaded",
      enabled: true,
    };
    await importDesktopRecords(result.records || []);
  } catch (error) {
    console.error(error);
    state.libraryInfo.status = "Home load failed";
  }
  renderLibraryState();
}

async function scanForCameras() {
  if (!window.itszLibrary || state.libraryInfo.importing) return;
  state.libraryInfo.cameraStatus = "Scanning";
  renderLibraryState();
  try {
    const cameras = await window.itszLibrary.scanCameras();
    state.libraryInfo = {
      ...state.libraryInfo,
      camera: cameras[0] || null,
      cameraStatus: cameras.length ? "Detected" : "No camera",
    };
  } catch (error) {
    console.error(error);
    state.libraryInfo.cameraStatus = "Scan failed";
  }
  renderLibraryState();
}

async function setDeleteCameraOriginals(deleteOriginals) {
  if (!window.itszLibrary) return;
  state.libraryInfo.deleteOriginals = Boolean(deleteOriginals);
  renderLibraryState();
  try {
    const info = await window.itszLibrary.setDeleteOriginals(deleteOriginals);
    state.libraryInfo = {
      ...state.libraryInfo,
      ...info,
      enabled: true,
    };
  } catch (error) {
    console.error(error);
    state.libraryInfo.status = "Delete setting failed";
  }
  renderLibraryState();
}

async function ignoreDetectedCamera() {
  if (!window.itszLibrary || !state.libraryInfo.camera) return;
  const cameraId = state.libraryInfo.camera.id;
  state.libraryInfo.camera = null;
  state.libraryInfo.cameraStatus = "Ignored";
  renderLibraryState();
  await window.itszLibrary.ignoreCamera(cameraId);
}

async function importDetectedCamera() {
  if (!window.itszLibrary || !state.libraryInfo.camera || state.libraryInfo.importing) return;

  if (!state.libraryInfo.homeFolder) {
    await chooseHomeFolder();
    if (!state.libraryInfo.homeFolder) return;
  }

  state.libraryInfo.importing = true;
  state.libraryInfo.cameraStatus = "Importing";
  renderLibraryState();

  try {
    const result = await window.itszLibrary.importCamera({
      deviceId: state.libraryInfo.camera.id,
      deleteOriginals: state.libraryInfo.deleteOriginals,
    });
    const deleteText = result.deleted ? `, deleted ${result.deleted}` : "";
    const failText = result.failed ? `, ${result.failed} failed` : "";
    state.libraryInfo.status = `Imported ${result.copied}${deleteText}${failText}`;
    state.libraryInfo.cameraStatus = "Imported";
    state.libraryInfo.camera = null;
    await importDesktopRecords(result.records || []);
  } catch (error) {
    console.error(error);
    state.libraryInfo.cameraStatus = "Import failed";
    state.libraryInfo.status = error.message || "Camera import failed";
  } finally {
    state.libraryInfo.importing = false;
    renderLibraryState();
  }
}

async function importDesktopRecords(records) {
  if (!records.length) return;
  const imported = await Promise.all(records.map(readDesktopPhotoRecord));
  addImportedImages(imported);
}

function readDesktopPhotoRecord(record) {
  return new Promise((resolve) => {
    const previewSupported = record.previewSupported !== false;
    const src = record.src || makePlaceholderSrc(record.name, record.type || "photo");
    if (!previewSupported) {
      resolve(makeImageEntry({
        ...record,
        src,
        previewSupported: false,
      }));
      return;
    }

    const image = new Image();
    image.onload = () => {
      resolve(makeImageEntry({
        ...record,
        src,
        width: image.naturalWidth,
        height: image.naturalHeight,
        previewSupported: true,
      }));
    };
    image.onerror = () => {
      resolve(makeImageEntry({
        ...record,
        src: makePlaceholderSrc(record.name, record.type || "photo"),
        previewSupported: false,
      }));
    };
    image.src = src;
  });
}

function setBatchStatus(message) {
  state.batchStatus = message;
  renderBatchStatus();
}

function setBatchRunning(isRunning) {
  state.batchRunning = isRunning;
  updateButtons();
}

async function initDesktopUpdates() {
  const updater = window.itszUpdates;
  if (!updater) {
    state.updateInfo = {
      ...state.updateInfo,
      enabled: false,
      status: "Desktop app only",
      version: "web preview",
      available: false,
      downloaded: false,
    };
    renderUpdateState();
    return;
  }

  updater.onStatus((event) => {
    state.updateInfo = {
      ...state.updateInfo,
      ...event,
      enabled: true,
    };
    renderUpdateState();
  });

  try {
    const info = await updater.getInfo();
    state.updateInfo = {
      ...state.updateInfo,
      ...info,
      enabled: true,
    };
  } catch (error) {
    console.error(error);
    state.updateInfo = {
      ...state.updateInfo,
      enabled: false,
      status: "Updater unavailable",
    };
  }
  renderUpdateState();
}

async function checkForUpdates() {
  if (!window.itszUpdates) return;
  state.updateInfo.status = "Checking";
  renderUpdateState();
  await window.itszUpdates.check();
}

async function downloadUpdate() {
  if (!window.itszUpdates) return;
  state.updateInfo.status = "Downloading";
  renderUpdateState();
  await window.itszUpdates.download();
}

async function installUpdate() {
  if (!window.itszUpdates) return;
  state.updateInfo.status = "Installing";
  renderUpdateState();
  await window.itszUpdates.install();
}

async function setUpdateAutoCheck(autoCheck) {
  if (!window.itszUpdates) return;
  try {
    const info = await window.itszUpdates.setAutoCheck(autoCheck);
    state.updateInfo = {
      ...state.updateInfo,
      ...info,
      enabled: true,
    };
    renderUpdateState();
  } catch (error) {
    console.error(error);
    state.updateInfo.status = "Setting failed";
    renderUpdateState();
  }
}

function renderEditControls(edit) {
  const values = {
    exposure: edit.exposure,
    contrast: edit.contrast,
    saturation: edit.saturation,
    warmth: edit.warmth,
    tint: edit.tint,
    fade: edit.fade,
    vignette: edit.vignette,
    denoise: edit.denoise,
  };

  els.editRanges.forEach((range) => {
    const key = range.dataset.editRange;
    range.value = String(values[key]);
  });

  els.exposureValue.textContent = String(edit.exposure);
  els.contrastValue.textContent = String(edit.contrast);
  els.saturationValue.textContent = String(edit.saturation);
  els.warmthValue.textContent = signedValue(edit.warmth);
  els.tintValue.textContent = signedValue(edit.tint);
  els.fadeValue.textContent = String(edit.fade);
  els.vignetteValue.textContent = String(edit.vignette);
  els.denoiseValue.textContent = String(edit.denoise);

  els.cropRanges.forEach((range) => {
    const key = range.dataset.cropRange;
    range.value = String(edit.crop[key]);
  });
  els.cropSizeValue.textContent = String(edit.crop.size);
  els.cropXValue.textContent = String(edit.crop.x);
  els.cropYValue.textContent = String(edit.crop.y);

  const presetName = detectPreset(edit);
  els.presetButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.preset === presetName);
  });
  els.cropButtons.forEach((button) => {
    const isActive = edit.crop.enabled ? button.dataset.crop === edit.crop.aspect : button.dataset.crop === "off";
    button.classList.toggle("active", isActive);
  });

  els.editStatus.textContent = isDefaultEdit(edit) ? "Original" : "Edited";
}

function renderCropOverlay(edit) {
  const active = getActive();
  const isEnabled = Boolean(active && edit.crop.enabled);
  els.stage.classList.toggle("cropActive", isEnabled);
  if (!isEnabled) return;

  const bounds = els.stage.getBoundingClientRect();
  const aspect = getCropAspect(edit.crop.aspect, active.width / active.height);
  const maxWidth = bounds.width * 0.78;
  const maxHeight = bounds.height * 0.78;
  let frameWidth = maxWidth;
  let frameHeight = frameWidth / aspect;
  if (frameHeight > maxHeight) {
    frameHeight = maxHeight;
    frameWidth = frameHeight * aspect;
  }

  const sizeFactor = edit.crop.size / 100;
  frameWidth *= sizeFactor;
  frameHeight *= sizeFactor;

  const left = clamp((bounds.width - frameWidth) * (edit.crop.x / 100), 0, Math.max(0, bounds.width - frameWidth));
  const top = clamp((bounds.height - frameHeight) * (edit.crop.y / 100), 0, Math.max(0, bounds.height - frameHeight));

  els.cropFrame.style.setProperty("--crop-left", `${left}px`);
  els.cropFrame.style.setProperty("--crop-top", `${top}px`);
  els.cropFrame.style.setProperty("--crop-width", `${frameWidth}px`);
  els.cropFrame.style.setProperty("--crop-height", `${frameHeight}px`);
}

function renderTransform() {
  els.activeImage.style.transform = [
    "translate(-50%, -50%)",
    `translate(${state.panX}px, ${state.panY}px)`,
    `rotate(${state.rotation}deg)`,
    `scale(${state.zoom * state.flipX}, ${state.zoom * state.flipY})`,
  ].join(" ");
}

function getEdit() {
  const active = getActive();
  if (!active) return makeDefaultEdit();
  ensureImageEdit(active);
  return active.edit;
}

function ensureImageEdit(image) {
  if (!image.edit) {
    image.edit = makeDefaultEdit();
  }
}

function makeDefaultEdit() {
  return {
    exposure: DEFAULT_EDIT.exposure,
    contrast: DEFAULT_EDIT.contrast,
    saturation: DEFAULT_EDIT.saturation,
    warmth: DEFAULT_EDIT.warmth,
    tint: DEFAULT_EDIT.tint,
    fade: DEFAULT_EDIT.fade,
    vignette: DEFAULT_EDIT.vignette,
    denoise: DEFAULT_EDIT.denoise,
    crop: {
      enabled: DEFAULT_EDIT.crop.enabled,
      aspect: DEFAULT_EDIT.crop.aspect,
      size: DEFAULT_EDIT.crop.size,
      x: DEFAULT_EDIT.crop.x,
      y: DEFAULT_EDIT.crop.y,
    },
  };
}

function cloneEdit(edit) {
  return {
    ...edit,
    crop: { ...edit.crop },
  };
}

function setEditPatch(patch) {
  const active = getActive();
  if (!active) return;
  ensureImageEdit(active);

  const before = cloneEdit(active.edit);
  const next = {
    ...active.edit,
    ...patch,
    crop: patch.crop ? { ...active.edit.crop, ...patch.crop } : { ...active.edit.crop },
  };

  if (editsEqual(before, next)) return;
  pushEditHistory(before);
  active.edit = next;
  renderEditState();
  renderDetails();
}

function pushEditHistory(edit) {
  state.editHistory.push(cloneEdit(edit));
  if (state.editHistory.length > 40) {
    state.editHistory.shift();
  }
}

function undoEdit() {
  const active = getActive();
  if (!active || state.editHistory.length === 0) return;
  active.edit = state.editHistory.pop();
  renderEditState();
  renderDetails();
}

function resetEdits() {
  const active = getActive();
  if (!active || isDefaultEdit(active.edit)) return;
  pushEditHistory(active.edit);
  active.edit = makeDefaultEdit();
  renderEditState();
  renderDetails();
}

function applyPreset(presetName) {
  const preset = PRESETS[presetName];
  if (!preset) return;
  setEditPatch(preset);
}

function setCropMode(mode) {
  const edit = getEdit();
  if (mode === "off") {
    setEditPatch({
      crop: {
        ...edit.crop,
        enabled: false,
      },
    });
    return;
  }

  setEditPatch({
    crop: {
      ...edit.crop,
      enabled: true,
      aspect: mode,
    },
  });
}

async function autoDenoiseActive() {
  const active = getActive();
  if (!active || state.batchRunning) return;
  try {
    setBatchStatus("Checking noise");
    const denoise = await analyzeDenoiseAmount(active);
    setEditPatch({ denoise });
    setBatchStatus(`Denoise ${denoise}`);
  } catch (error) {
    console.error(error);
    setBatchStatus("Denoise failed");
  }
}

async function saveEditedCopy() {
  const rendered = await renderEditedImage();
  if (!rendered) return;

  const link = document.createElement("a");
  link.href = rendered.src;
  link.download = rendered.name;
  document.body.append(link);
  link.click();
  link.remove();
}

async function applyEditsToLibrary() {
  const active = getActive();
  const rendered = await renderEditedImage();
  if (!active || !rendered) return;

  const editedImage = {
    id: makeId(),
    name: rendered.name,
    src: rendered.src,
    type: "image/jpeg",
    size: estimateDataUrlSize(rendered.src),
    modified: Date.now(),
    width: rendered.width,
    height: rendered.height,
    edit: makeDefaultEdit(),
    sample: false,
  };

  state.images.splice(state.activeIndex + 1, 0, editedImage);
  state.activeIndex += 1;
  state.editHistory = [];
  resetView(false);
  render();
}

async function autoBatchEdit() {
  if (!state.images.length || state.batchRunning) return;
  setBatchRunning(true);
  state.editHistory = [];
  try {
    const count = state.images.length;
    for (let index = 0; index < count; index += 1) {
      const image = state.images[index];
      setBatchStatus(`Auto ${index + 1}/${count}`);
      ensureImageEdit(image);
      const autoEdit = await analyzeAutoEdit(image);
      image.edit = {
        ...image.edit,
        ...autoEdit,
        crop: { ...image.edit.crop },
      };
    }
    render();
    setBatchStatus(`${count} auto-edited`);
  } catch (error) {
    console.error(error);
    setBatchStatus("Auto failed");
  } finally {
    setBatchRunning(false);
  }
}

function matchBatchToCurrent() {
  const active = getActive();
  if (!active || state.batchRunning) return;
  const currentLook = adjustmentOnly(getEdit());
  state.images.forEach((image) => {
    ensureImageEdit(image);
    image.edit = {
      ...image.edit,
      ...currentLook,
      crop: { ...image.edit.crop },
    };
  });
  state.editHistory = [];
  render();
  setBatchStatus(`${state.images.length} matched`);
}

async function makeBatchCopies() {
  if (!state.images.length || state.batchRunning) return;
  setBatchRunning(true);
  state.editHistory = [];
  try {
    const originals = state.images.slice();
    const copies = [];
    for (let index = 0; index < originals.length; index += 1) {
      const image = originals[index];
      ensureImageEdit(image);
      setBatchStatus(`Copies ${index + 1}/${originals.length}`);
      const rendered = await renderImageWithEdit(image, image.edit);
      copies.push({
        id: makeId(),
        name: rendered.name,
        src: rendered.src,
        type: "image/jpeg",
        size: estimateDataUrlSize(rendered.src),
        modified: Date.now(),
        width: rendered.width,
        height: rendered.height,
        edit: makeDefaultEdit(),
        sample: false,
      });
    }
    const firstCopyIndex = state.images.length;
    state.images.push(...copies);
    state.activeIndex = firstCopyIndex;
    resetView(false);
    render();
    setBatchStatus(`${copies.length} copies made`);
  } catch (error) {
    console.error(error);
    setBatchStatus("Copy failed");
  } finally {
    setBatchRunning(false);
  }
}

function resetBatchEdits() {
  if (!state.images.length || state.batchRunning) return;
  state.images.forEach((image) => {
    image.edit = makeDefaultEdit();
  });
  state.editHistory = [];
  render();
  setBatchStatus(`${state.images.length} reset`);
}

async function analyzeAutoEdit(sourceImage) {
  const sample = await sampleImageMetrics(sourceImage);
  const data = sample.data;
  const sampleSize = sample.size;
  const luminance = [];
  let red = 0;
  let green = 0;
  let blue = 0;
  let saturation = 0;

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
    luminance.push(luma);
    red += r;
    green += g;
    blue += b;
    saturation += max === 0 ? 0 : (max - min) / max;
  }

  luminance.sort((a, b) => a - b);
  const count = luminance.length || 1;
  const avgLuma = luminance.reduce((sum, value) => sum + value, 0) / count;
  const low = luminance[Math.floor(count * 0.05)] ?? avgLuma;
  const high = luminance[Math.floor(count * 0.95)] ?? avgLuma;
  const span = high - low;
  const avgRed = red / count;
  const avgGreen = green / count;
  const avgBlue = blue / count;
  const avgSaturation = saturation / count;

  return {
    exposure: Math.round(clamp(100 + (128 - avgLuma) * 0.42, 78, 132)),
    contrast: Math.round(clamp(100 + (152 - span) * 0.34, 88, 138)),
    saturation: Math.round(clamp(avgSaturation < 0.16 ? 118 : avgSaturation > 0.52 ? 96 : 108, 80, 130)),
    warmth: Math.round(clamp((avgBlue - avgRed) * 0.22, -22, 22)),
    tint: Math.round(clamp((avgGreen - (avgRed + avgBlue) / 2) * -0.16, -14, 14)),
    fade: 0,
    vignette: 6,
    denoise: estimateDenoiseFromSample(data, sampleSize),
  };
}

async function analyzeDenoiseAmount(sourceImage) {
  const sample = await sampleImageMetrics(sourceImage);
  return estimateDenoiseFromSample(sample.data, sample.size);
}

async function sampleImageMetrics(sourceImage) {
  const image = await loadImage(sourceImage.src);
  const sampleSize = 120;
  const canvas = document.createElement("canvas");
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, sampleSize, sampleSize);
  return {
    data: ctx.getImageData(0, 0, sampleSize, sampleSize).data,
    size: sampleSize,
  };
}

function estimateDenoiseFromSample(data, size) {
  let noise = 0;
  let count = 0;
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const index = (y * size + x) * 4;
      const center = lumaAt(data, index);
      const horizontal = Math.abs(center - (lumaAt(data, index - 4) + lumaAt(data, index + 4)) / 2);
      const vertical = Math.abs(center - (lumaAt(data, index - size * 4) + lumaAt(data, index + size * 4)) / 2);
      noise += Math.min(64, (horizontal + vertical) / 2);
      count += 1;
    }
  }

  const averageNoise = count ? noise / count : 0;
  return Math.round(clamp((averageNoise - 1.2) * 7.2, 0, 72));
}

function lumaAt(data, index) {
  return data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
}

async function renderEditedImage() {
  const active = getActive();
  if (!active) return null;
  return renderImageWithEdit(active, getEdit(), {
    rotation: normalizeRotation(state.rotation),
    flipX: state.flipX,
    flipY: state.flipY,
  });
}

async function renderImageWithEdit(sourceImage, edit, transform = {}) {
  const rotation = transform.rotation ?? 0;
  const flipX = transform.flipX ?? 1;
  const flipY = transform.flipY ?? 1;
  const image = await loadImage(sourceImage.src);
  const crop = getCropRect(sourceImage, edit);
  const rotated = rotation % 180 === 90;
  const outputWidth = Math.max(1, Math.round(rotated ? crop.sh : crop.sw));
  const outputHeight = Math.max(1, Math.round(rotated ? crop.sw : crop.sh));
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext("2d");

  ctx.save();
  ctx.filter = buildFilter(edit);
  ctx.translate(outputWidth / 2, outputHeight / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(flipX, flipY);
  ctx.drawImage(
    image,
    crop.sx,
    crop.sy,
    crop.sw,
    crop.sh,
    -crop.sw / 2,
    -crop.sh / 2,
    crop.sw,
    crop.sh,
  );
  ctx.restore();

  applyDenoiseToCanvas(ctx, outputWidth, outputHeight, edit.denoise);
  drawExportVignette(ctx, outputWidth, outputHeight, edit.vignette);

  return {
    src: canvas.toDataURL("image/jpeg", 0.92),
    width: outputWidth,
    height: outputHeight,
    name: editedFileName(sourceImage.name),
  };
}

function getCropRect(image, edit) {
  if (!edit.crop.enabled) {
    return { sx: 0, sy: 0, sw: image.width, sh: image.height };
  }

  const aspect = getCropAspect(edit.crop.aspect, image.width / image.height);
  let cropWidth = image.width;
  let cropHeight = cropWidth / aspect;
  if (cropHeight > image.height) {
    cropHeight = image.height;
    cropWidth = cropHeight * aspect;
  }

  cropWidth *= edit.crop.size / 100;
  cropHeight *= edit.crop.size / 100;

  const centerX = image.width * (edit.crop.x / 100);
  const centerY = image.height * (edit.crop.y / 100);
  const sx = clamp(centerX - cropWidth / 2, 0, image.width - cropWidth);
  const sy = clamp(centerY - cropHeight / 2, 0, image.height - cropHeight);

  return {
    sx,
    sy,
    sw: cropWidth,
    sh: cropHeight,
  };
}

function getCropAspect(aspect, originalAspect) {
  if (aspect === "square") return 1;
  if (aspect === "portrait") return 4 / 5;
  if (aspect === "wide") return 16 / 9;
  return originalAspect || 1;
}

function buildFilter(edit) {
  const fade = edit.fade / 100;
  const exposure = clamp(edit.exposure + fade * 10, 20, 200);
  const contrast = clamp(edit.contrast - fade * 28, 20, 220);
  const saturation = clamp(edit.saturation - fade * 24, 0, 260);
  const sepia = clamp(Math.max(0, edit.warmth) * 0.36 + edit.fade * 0.22, 0, 80);
  const hue = edit.tint * 0.26 - Math.max(0, -edit.warmth) * 0.22;

  return [
    `brightness(${exposure}%)`,
    `contrast(${contrast}%)`,
    `saturate(${saturation}%)`,
    `sepia(${sepia}%)`,
    `hue-rotate(${hue}deg)`,
  ].join(" ");
}

function buildPreviewFilter(edit) {
  const denoiseBlur = edit.denoise ? ` blur(${Math.min(0.5, edit.denoise * 0.006)}px)` : "";
  return `${buildFilter(edit)}${denoiseBlur}`;
}

function applyDenoiseToCanvas(ctx, width, height, amount) {
  if (!amount || width < 3 || height < 3) return;
  const strength = clamp(amount / 100, 0, 1);
  const threshold = 18 + amount * 1.6;
  const imageData = ctx.getImageData(0, 0, width, height);
  const source = new Uint8ClampedArray(imageData.data);
  const target = imageData.data;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      const centerLuma = lumaAt(source, index);
      let red = source[index];
      let green = source[index + 1];
      let blue = source[index + 2];
      let weight = 1;

      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          if (ox === 0 && oy === 0) continue;
          const neighborIndex = ((y + oy) * width + x + ox) * 4;
          const diff = Math.abs(centerLuma - lumaAt(source, neighborIndex));
          if (diff > threshold) continue;
          const neighborWeight = 1 - diff / threshold;
          red += source[neighborIndex] * neighborWeight;
          green += source[neighborIndex + 1] * neighborWeight;
          blue += source[neighborIndex + 2] * neighborWeight;
          weight += neighborWeight;
        }
      }

      const smoothRed = red / weight;
      const smoothGreen = green / weight;
      const smoothBlue = blue / weight;
      const mix = strength * 0.78;
      target[index] = source[index] * (1 - mix) + smoothRed * mix;
      target[index + 1] = source[index + 1] * (1 - mix) + smoothGreen * mix;
      target[index + 2] = source[index + 2] * (1 - mix) + smoothBlue * mix;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function drawExportVignette(ctx, width, height, amount) {
  if (!amount) return;
  const gradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.22,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.68,
  );
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, `rgba(0,0,0,${amount / 110})`);
  ctx.save();
  ctx.filter = "none";
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function detectPreset(edit) {
  const editBase = adjustmentOnly(edit);
  return Object.entries(PRESETS).find(([, preset]) => editsEqual(editBase, preset))?.[0] || "";
}

function adjustmentOnly(edit) {
  return {
    exposure: edit.exposure,
    contrast: edit.contrast,
    saturation: edit.saturation,
    warmth: edit.warmth,
    tint: edit.tint,
    fade: edit.fade,
    vignette: edit.vignette,
    denoise: edit.denoise,
  };
}

function isDefaultEdit(edit) {
  return editsEqual(edit, makeDefaultEdit());
}

function editsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function editedFileName(name) {
  const baseName = name.replace(/\.[^.]+$/, "") || "photo";
  return `${baseName.replace(/[<>:"/\\|?*]+/g, "-")}-itsz-edit.jpg`;
}

function signedValue(value) {
  return value > 0 ? `+${value}` : String(value);
}

function renderHistogram() {
  const canvas = els.histogramCanvas;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0b0c0b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!getActive() || !els.activeImage.complete) {
    els.histogramPeak.textContent = "-";
    return;
  }

  const sampleCanvas = document.createElement("canvas");
  const sampleSize = 180;
  sampleCanvas.width = sampleSize;
  sampleCanvas.height = sampleSize;
  const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
  sampleCtx.drawImage(els.activeImage, 0, 0, sampleSize, sampleSize);

  const pixels = sampleCtx.getImageData(0, 0, sampleSize, sampleSize).data;
  const bins = new Array(64).fill(0);
  for (let i = 0; i < pixels.length; i += 4) {
    const brightness = pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
    bins[Math.min(63, Math.floor(brightness / 4))] += 1;
  }

  const max = Math.max(...bins, 1);
  const barWidth = canvas.width / bins.length;
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, "#39d8be");
  gradient.addColorStop(0.55, "#f0bd49");
  gradient.addColorStop(1, "#ff6b4a");

  ctx.fillStyle = gradient;
  bins.forEach((bin, index) => {
    const height = Math.max(2, (bin / max) * (canvas.height - 18));
    ctx.fillRect(index * barWidth, canvas.height - height, Math.ceil(barWidth) - 1, height);
  });

  const peakIndex = bins.indexOf(max);
  els.histogramPeak.textContent = `${Math.round((peakIndex / 63) * 100)}%`;
}

function updateButtons() {
  const hasImages = state.images.length > 0;
  const multi = state.images.length > 1;
  const disabled = !hasImages || state.batchRunning;
  [
    els.exportButton,
    els.previousButton,
    els.nextButton,
    els.zoomOutButton,
    els.zoomInButton,
    els.fitButton,
    els.actualButton,
    els.rotateLeftButton,
    els.rotateRightButton,
    els.flipHorizontalButton,
    els.flipVerticalButton,
    els.resetButton,
    els.removeButton,
    els.applyEditButton,
    els.autoDenoiseButton,
    els.resetEditsButton,
    els.autoBatchButton,
    els.matchBatchButton,
    els.copiesBatchButton,
    els.resetBatchButton,
  ].forEach((button) => {
    button.disabled = disabled;
  });
  [...els.presetButtons, ...els.cropButtons, ...els.editRanges, ...els.cropRanges].forEach((control) => {
    control.disabled = disabled;
  });
  els.previousButton.disabled = disabled || !multi;
  els.nextButton.disabled = disabled || !multi;
  els.undoEditButton.disabled = disabled || state.editHistory.length === 0;
}

function setActive(index) {
  if (!state.images[index]) return;
  state.activeIndex = index;
  state.editHistory = [];
  resetView(false);
  render();
}

function moveActive(delta) {
  if (state.images.length < 2) return;
  const next = (state.activeIndex + delta + state.images.length) % state.images.length;
  setActive(next);
}

function removeActive() {
  if (!getActive()) return;
  state.images.splice(state.activeIndex, 1);
  if (!state.images.length) loadSampleAlbum();
  state.activeIndex = Math.min(state.activeIndex, state.images.length - 1);
  state.editHistory = [];
  resetView(false);
  render();
}

function resetView(shouldRender = true) {
  state.zoom = 1;
  state.rotation = 0;
  state.flipX = 1;
  state.flipY = 1;
  state.panX = 0;
  state.panY = 0;
  if (shouldRender) renderViewState();
}

function fitToStage() {
  const active = getActive();
  if (!active || !active.width || !active.height) return;
  const bounds = els.stage.getBoundingClientRect();
  const usableWidth = Math.max(1, bounds.width - 52);
  const usableHeight = Math.max(1, bounds.height - 52);
  const rotated = Math.abs(normalizeRotation(state.rotation)) % 180 === 90;
  const imageWidth = rotated ? active.height : active.width;
  const imageHeight = rotated ? active.width : active.height;
  state.zoom = clamp(Math.min(usableWidth / imageWidth, usableHeight / imageHeight), 0.04, 4);
  state.panX = 0;
  state.panY = 0;
  renderViewState();
}

function setZoom(value) {
  state.zoom = clamp(value, 0.05, 8);
  renderViewState();
}

function zoomBy(multiplier) {
  if (!getActive()) return;
  setZoom(state.zoom * multiplier);
}

function rotateBy(degrees) {
  if (!getActive()) return;
  state.rotation += degrees;
  fitToStage();
}

function getActive() {
  return state.images[state.activeIndex] || null;
}

function getFlipLabel() {
  if (state.flipX === 1 && state.flipY === 1) return "Normal";
  if (state.flipX === -1 && state.flipY === -1) return "Both";
  if (state.flipX === -1) return "H Flip";
  return "V Flip";
}

function normalizeRotation(degrees) {
  return ((degrees % 360) + 360) % 360;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function estimateDataUrlSize(src) {
  const base64 = src.split(",")[1] || "";
  return Math.round((base64.length * 3) / 4);
}

function shortenPath(value) {
  const text = String(value || "");
  if (text.length <= 34) return text;
  return `${text.slice(0, 14)}...${text.slice(-17)}`;
}

function makeId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `image-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDate(timestamp) {
  if (!timestamp) return "-";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
