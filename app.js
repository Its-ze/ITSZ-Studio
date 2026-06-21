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
const JPEG_EXTENSIONS = new Set([".jpe", ".jpeg", ".jpg"]);
const RAW_EXTENSIONS = new Set([
  ".3fr", ".arw", ".cr2", ".cr3", ".crw", ".dng", ".erf", ".fff", ".hif",
  ".iiq", ".kdc", ".mef", ".mos", ".mrw", ".nef", ".nrw", ".orf", ".pef",
  ".ptx", ".raf", ".raw", ".rw2", ".rwl", ".sr2", ".srf", ".srw", ".x3f",
]);
const RAW_PAIR_SETTINGS_KEY = "itszStudio.rawPairing";
const RECOGNITION_CACHE_KEY = "itszStudio.recognitionCache.v1";
const GALLERY_SETTINGS_KEY = "itszStudio.gallerySettings.v1";
const RECOGNITION_CACHE_LIMIT = 5000;

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
  rawPairing: {
    enabled: true,
    defaultSide: "jpg",
  },
  gallery: {
    query: "",
    sortBy: "recent",
    filterBy: "all",
    viewMode: "list",
  },
  recognitionCache: {
    version: 1,
    entries: {},
  },
  recognitionRunning: false,
  activeTool: "move",
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
  loadRawPairingSettings();
  loadGallerySettings();
  loadRecognitionCache();
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
    pairRawJpgToggle: document.getElementById("pairRawJpgToggle"),
    rawPairDefaultSelect: document.getElementById("rawPairDefaultSelect"),
    rawPairStatus: document.getElementById("rawPairStatus"),
    gallerySearchInput: document.getElementById("gallerySearchInput"),
    gallerySortSelect: document.getElementById("gallerySortSelect"),
    galleryFilterSelect: document.getElementById("galleryFilterSelect"),
    galleryViewButtons: Array.from(document.querySelectorAll("[data-gallery-view]")),
    analyzeGalleryButton: document.getElementById("analyzeGalleryButton"),
    clearRecognitionCacheButton: document.getElementById("clearRecognitionCacheButton"),
    recognitionStatus: document.getElementById("recognitionStatus"),
    analyzeCurrentButton: document.getElementById("analyzeCurrentButton"),
    activePeopleInput: document.getElementById("activePeopleInput"),
    addPersonButton: document.getElementById("addPersonButton"),
    removePeopleButton: document.getElementById("removePeopleButton"),
    recognitionConfidence: document.getElementById("recognitionConfidence"),
    recognitionTags: document.getElementById("recognitionTags"),
    activePeopleList: document.getElementById("activePeopleList"),
    updateAutoCheckToggle: document.getElementById("updateAutoCheckToggle"),
    checkUpdatesButton: document.getElementById("checkUpdatesButton"),
    downloadUpdateButton: document.getElementById("downloadUpdateButton"),
    installUpdateButton: document.getElementById("installUpdateButton"),
    presetButtons: Array.from(document.querySelectorAll("[data-preset]")),
    cropButtons: Array.from(document.querySelectorAll("[data-crop]")),
    editRanges: Array.from(document.querySelectorAll("[data-edit-range]")),
    cropRanges: Array.from(document.querySelectorAll("[data-crop-range]")),
    workspaceToolButtons: Array.from(document.querySelectorAll("[data-work-tool]")),
    currentToolName: document.getElementById("currentToolName"),
    canvasStatus: document.getElementById("canvasStatus"),
    documentTabName: document.getElementById("documentTabName"),
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
    detailPair: document.getElementById("detailPair"),
    layerStatus: document.getElementById("layerStatus"),
    layersList: document.getElementById("layersList"),
    historyStatus: document.getElementById("historyStatus"),
    historyList: document.getElementById("historyList"),
    histogramCanvas: document.getElementById("histogramCanvas"),
    histogramPeak: document.getElementById("histogramPeak"),
    viewZoom: document.getElementById("viewZoom"),
    viewRotation: document.getElementById("viewRotation"),
    viewFlip: document.getElementById("viewFlip"),
  });
}

function loadRawPairingSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(RAW_PAIR_SETTINGS_KEY) || "{}");
    state.rawPairing = {
      enabled: saved.enabled !== false,
      defaultSide: saved.defaultSide === "raw" ? "raw" : "jpg",
    };
  } catch {
    state.rawPairing = {
      enabled: true,
      defaultSide: "jpg",
    };
  }
}

function saveRawPairingSettings() {
  localStorage.setItem(RAW_PAIR_SETTINGS_KEY, JSON.stringify(state.rawPairing));
}

function loadGallerySettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(GALLERY_SETTINGS_KEY) || "{}");
    state.gallery = {
      ...state.gallery,
      query: typeof saved.query === "string" ? saved.query : "",
      sortBy: ["recent", "name", "scene", "people", "size"].includes(saved.sortBy) ? saved.sortBy : "recent",
      filterBy: ["all", "nature", "people", "known-people", "city", "night", "document", "untagged"].includes(saved.filterBy) ? saved.filterBy : "all",
      viewMode: saved.viewMode === "grid" ? "grid" : "list",
    };
  } catch {
    state.gallery = {
      query: "",
      sortBy: "recent",
      filterBy: "all",
      viewMode: "list",
    };
  }
}

function saveGallerySettings() {
  localStorage.setItem(GALLERY_SETTINGS_KEY, JSON.stringify(state.gallery));
}

function loadRecognitionCache() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECOGNITION_CACHE_KEY) || "{}");
    state.recognitionCache = {
      version: 1,
      entries: saved && typeof saved.entries === "object" && saved.entries ? saved.entries : {},
    };
  } catch {
    state.recognitionCache = { version: 1, entries: {} };
  }
}

function saveRecognitionCache() {
  const entries = Object.entries(state.recognitionCache.entries || {});
  if (entries.length > RECOGNITION_CACHE_LIMIT) {
    entries
      .sort(([, left], [, right]) => Number(right.analyzedAt || 0) - Number(left.analyzedAt || 0))
      .slice(RECOGNITION_CACHE_LIMIT)
      .forEach(([key]) => delete state.recognitionCache.entries[key]);
  }
  localStorage.setItem(RECOGNITION_CACHE_KEY, JSON.stringify(state.recognitionCache));
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
  els.pairRawJpgToggle.addEventListener("change", () => {
    updateRawPairing({
      enabled: els.pairRawJpgToggle.checked,
    });
  });
  els.rawPairDefaultSelect.addEventListener("change", () => {
    updateRawPairing({
      defaultSide: els.rawPairDefaultSelect.value === "raw" ? "raw" : "jpg",
    });
  });
  els.gallerySearchInput.addEventListener("input", () => {
    updateGallerySettings({ query: els.gallerySearchInput.value });
  });
  els.gallerySortSelect.addEventListener("change", () => {
    updateGallerySettings({ sortBy: els.gallerySortSelect.value });
  });
  els.galleryFilterSelect.addEventListener("change", () => {
    updateGallerySettings({ filterBy: els.galleryFilterSelect.value });
  });
  els.galleryViewButtons.forEach((button) => {
    button.addEventListener("click", () => updateGallerySettings({ viewMode: button.dataset.galleryView }));
  });
  els.analyzeGalleryButton.addEventListener("click", analyzeGalleryImages);
  els.clearRecognitionCacheButton.addEventListener("click", clearRecognitionCache);
  els.analyzeCurrentButton.addEventListener("click", analyzeActiveRecognition);
  els.addPersonButton.addEventListener("click", addPersonToActive);
  els.removePeopleButton.addEventListener("click", clearPeopleFromActive);
  els.activePeopleInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addPersonToActive();
    }
  });
  els.checkUpdatesButton.addEventListener("click", checkForUpdates);
  els.downloadUpdateButton.addEventListener("click", downloadUpdate);
  els.installUpdateButton.addEventListener("click", installUpdate);
  els.updateAutoCheckToggle.addEventListener("change", () => {
    setUpdateAutoCheck(els.updateAutoCheckToggle.checked);
  });

  els.workspaceToolButtons.forEach((button) => {
    button.addEventListener("click", () => activateWorkspaceTool(button.dataset.workTool));
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
    if (key === "v") setWorkspaceTool("move");
    if (key === "h") setWorkspaceTool("hand");
    if (key === "c") activateWorkspaceTool("crop");
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

function setWorkspaceTool(tool) {
  state.activeTool = tool || "move";
  renderWorkspaceTool();
}

function activateWorkspaceTool(tool) {
  if (!tool) return;
  setWorkspaceTool(tool);
  if (tool === "crop") {
    if (getActive() && !getEdit().crop.enabled) setCropMode("original");
    return;
  }
  if (tool === "auto") {
    applyPreset("auto");
    return;
  }
  if (tool === "denoise") {
    autoDenoiseActive();
    return;
  }
  if (tool === "rotate") {
    rotateBy(90);
    return;
  }
  if (tool === "export") {
    saveEditedCopy();
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

  return makeImageEntry({
    name,
    note,
    src,
    type: "image/jpeg",
    size: estimateDataUrlSize(src),
    modified,
    width: canvas.width,
    height: canvas.height,
    previewSupported: true,
    sample: true,
  });
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

function stemFromName(name) {
  return String(name || "").replace(/\.[^.]+$/, "");
}

function normalizedDirectory(value) {
  const text = String(value || "").replace(/\\/g, "/");
  const slash = text.lastIndexOf("/");
  return slash >= 0 ? text.slice(0, slash).toLowerCase() : "";
}

function pairRoleForImage(image) {
  const extension = extensionFromName(image?.name);
  if (JPEG_EXTENSIONS.has(extension)) return "jpg";
  if (RAW_EXTENSIONS.has(extension)) return "raw";
  return "";
}

function pairKeyForImage(image) {
  const role = pairRoleForImage(image);
  if (!role || image?.sample) return "";
  const location = image.relativePath || image.sourcePath || image.name;
  return `${normalizedDirectory(location)}::${stemFromName(image.name).toLowerCase()}`;
}

function buildRawPairGroups() {
  const groups = new Map();
  state.images.forEach((image) => {
    const role = pairRoleForImage(image);
    const key = pairKeyForImage(image);
    if (!role || !key) return;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        raw: [],
        jpg: [],
      });
    }
    groups.get(key)[role].push(image);
  });
  return groups;
}

function selectPairImage(group) {
  const defaultSide = state.rawPairing.defaultSide === "raw" ? "raw" : "jpg";
  const primary = group[defaultSide][0];
  const fallback = defaultSide === "raw" ? group.jpg[0] : group.raw[0];
  return primary || fallback || null;
}

function getPairedLibraryImages() {
  state.images.forEach((image) => {
    delete image.pairInfo;
    applyCachedRecognition(image);
  });

  if (!state.rawPairing.enabled) {
    return state.images;
  }

  const groups = buildRawPairGroups();
  const emitted = new Set();
  const visible = [];

  state.images.forEach((image) => {
    const key = pairKeyForImage(image);
    const group = key ? groups.get(key) : null;
    const isPair = group && group.raw.length && group.jpg.length;
    if (!isPair) {
      visible.push(image);
      return;
    }

    if (emitted.has(key)) return;
    emitted.add(key);
    const selected = selectPairImage(group);
    if (!selected) return;
    selected.pairInfo = {
      key,
      raw: group.raw[0],
      jpg: group.jpg[0],
      role: selected === group.raw[0] ? "raw" : "jpg",
    };
    visible.push(selected);
  });

  return visible;
}

function getLibraryImages() {
  return sortGalleryImages(filterGalleryImages(getPairedLibraryImages()));
}

function filterGalleryImages(images) {
  const query = state.gallery.query.trim().toLowerCase();
  return images.filter((image) => {
    const recognition = image.recognition || getCachedRecognition(image);
    if (!matchesGalleryFilter(image, recognition, state.gallery.filterBy)) return false;
    if (!query) return true;
    return recognitionSearchText(image, recognition).includes(query);
  });
}

function sortGalleryImages(images) {
  const sorted = [...images];
  sorted.sort((left, right) => {
    if (state.gallery.sortBy === "name") return left.name.localeCompare(right.name);
    if (state.gallery.sortBy === "scene") {
      const scene = recognitionScene(left).localeCompare(recognitionScene(right));
      return scene || left.name.localeCompare(right.name);
    }
    if (state.gallery.sortBy === "people") {
      const people = recognitionPeopleText(left).localeCompare(recognitionPeopleText(right));
      return people || left.name.localeCompare(right.name);
    }
    if (state.gallery.sortBy === "size") return Number(right.size || 0) - Number(left.size || 0);
    return Number(right.modified || 0) - Number(left.modified || 0);
  });
  return sorted;
}

function matchesGalleryFilter(image, recognition, filterBy) {
  if (filterBy === "all") return true;
  if (filterBy === "untagged") return !recognition;
  if (filterBy === "known-people") return Boolean(recognition?.people?.length);
  if (filterBy === "people") return Boolean(recognition?.peopleLikely || recognition?.people?.length);
  return Boolean(recognition?.labels?.includes(filterBy) || recognition?.sceneKey === filterBy);
}

function recognitionSearchText(image, recognition) {
  const parts = [
    image.name,
    image.type,
    image.relativePath,
    image.sourcePath,
    recognition?.scene,
    ...(recognition?.labels || []),
    ...(recognition?.people || []),
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function recognitionScene(image) {
  return String((image.recognition || getCachedRecognition(image))?.scene || "Unanalyzed");
}

function recognitionPeopleText(image) {
  const recognition = image.recognition || getCachedRecognition(image);
  if (recognition?.people?.length) return recognition.people.join(", ");
  return recognition?.peopleLikely ? "People" : "No people";
}

function getPairCounts() {
  let pairs = 0;
  for (const group of buildRawPairGroups().values()) {
    if (group.raw.length && group.jpg.length) pairs += 1;
  }
  return {
    pairs,
    visible: getPairedLibraryImages().length,
    total: state.images.length,
  };
}

function findVisibleIndexForImageId(imageId) {
  const images = getLibraryImages();
  return images.findIndex((image) => image.id === imageId || image.pairInfo?.raw?.id === imageId || image.pairInfo?.jpg?.id === imageId);
}

function setActiveByImageId(imageId) {
  const index = findVisibleIndexForImageId(imageId);
  state.activeIndex = index >= 0 ? index : Math.min(state.activeIndex, Math.max(0, getLibraryImages().length - 1));
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

function recognitionKeyForDetails(details) {
  const location = details.sourcePath || details.relativePath || details.name || "photo";
  const modified = Number(details.modified || 0);
  const size = Number(details.size || 0);
  const dimensions = `${Number(details.width || 0)}x${Number(details.height || 0)}`;
  return [location, size, modified, dimensions].join("|").toLowerCase();
}

function getCachedRecognition(image) {
  return image?.recognitionKey ? state.recognitionCache.entries[image.recognitionKey] || null : null;
}

function applyCachedRecognition(image) {
  if (!image) return null;
  image.recognition = getCachedRecognition(image);
  return image.recognition;
}

function saveRecognitionForImage(image, recognition, options = {}) {
  if (!image?.recognitionKey || !recognition) return;
  const previous = getCachedRecognition(image);
  const people = options.mergePeople === false
    ? (recognition.people || []).map(normalizePersonName).filter(Boolean)
    : Array.from(new Set([
      ...(previous?.people || []),
      ...(recognition.people || []),
    ].map(normalizePersonName).filter(Boolean))).sort((left, right) => left.localeCompare(right));

  const next = {
    ...recognition,
    people,
    analyzedAt: recognition.analyzedAt || Date.now(),
  };
  state.recognitionCache.entries[image.recognitionKey] = next;
  image.recognition = next;
  saveRecognitionCache();
}

function makeImageEntry(details) {
  const entry = {
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
    recognitionKey: details.recognitionKey || recognitionKeyForDetails(details),
    recognition: null,
    edit: makeDefaultEdit(),
    sample: Boolean(details.sample),
  };
  applyCachedRecognition(entry);
  return entry;
}

function addImportedImages(imported) {
  const clean = imported.filter(Boolean);
  if (!clean.length) return;

  const hadOnlySamples = state.images.every((image) => image.sample);
  state.images = hadOnlySamples ? clean : [...state.images, ...clean];
  setActiveByImageId(clean[0].id);
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
  renderGalleryState();
  renderRecognitionState();
  renderUpdateState();
  renderStudioPanels();
  renderWorkspaceTool();
  updateButtons();

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function renderLists() {
  const images = getLibraryImages();
  const pairCounts = getPairCounts();
  const pairedHiddenCount = pairCounts.total - pairCounts.visible;
  const filteredCount = pairCounts.visible - images.length;
  els.imageCount.textContent = String(images.length);
  els.collectionStatus.textContent = [
    `${images.length} visible`,
    filteredCount ? `${filteredCount} filtered` : "",
    pairedHiddenCount ? `${pairedHiddenCount} paired` : "",
  ].filter(Boolean).join(", ");
  els.thumbRail.classList.toggle("gridView", state.gallery.viewMode === "grid");
  els.thumbRail.replaceChildren(...(images.length ? images.map((image, index) => createThumb(image, index)) : [createEmptyGalleryMessage()]));
  els.filmstrip.replaceChildren(...images.map((image, index) => createStripButton(image, index)));
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
  const recognition = image.recognition || getCachedRecognition(image);
  meta.textContent = recognition?.scene
    ? `${recognition.scene} - ${Math.round((recognition.confidence || 0) * 100)}%`
    : image.pairInfo
    ? `RAW + JPG - using ${image.pairInfo.role.toUpperCase()}`
    : image.width && image.height ? `${image.width} x ${image.height}` : image.type;

  const chips = createRecognitionChips(recognition, { max: 3, compact: true });
  if (image.pairInfo) {
    const badge = document.createElement("div");
    badge.className = "pairBadge";
    badge.textContent = "paired";
    copy.append(name, meta, badge, chips);
  } else {
    copy.append(name, meta, chips);
  }

  button.append(img, copy);
  return button;
}

function createEmptyGalleryMessage() {
  const empty = document.createElement("div");
  empty.className = "emptyGallery";
  empty.textContent = "No matches";
  return empty;
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
  els.activeName.textContent = active
    ? active.pairInfo ? `${active.name} - RAW + JPG` : active.name
    : "No image";
  els.detailName.textContent = active ? active.name : "-";
  els.detailPixels.textContent = active && active.previewSupported === false
    ? "Preview unavailable"
    : active && active.width && active.height ? `${active.width} x ${active.height}` : "-";
  els.detailType.textContent = active ? active.type : "-";
  els.detailSize.textContent = active ? formatBytes(active.size) : "-";
  els.detailModified.textContent = active ? formatDate(active.modified) : "-";
  els.detailPair.textContent = active?.pairInfo
    ? `Using ${active.pairInfo.role.toUpperCase()} - RAW ${active.pairInfo.raw.name}, JPG ${active.pairInfo.jpg.name}`
    : "-";
  renderStudioPanels();
}

function renderStudioPanels() {
  const active = getActive();
  const edit = getEdit();
  const activeName = active ? active.name : "No document";
  const pixels = active?.previewSupported === false
    ? "Preview unavailable"
    : active?.width && active?.height ? `${active.width} x ${active.height}` : "-";
  const edited = active && !isDefaultEdit(edit);

  els.documentTabName.textContent = activeName;
  els.canvasStatus.textContent = active
    ? `${pixels} - ${normalizeRotation(state.rotation)} deg - ${edited ? "Edited" : "Original"}`
    : "No image";

  renderLayersPanel(active, edit);
  renderHistoryPanel(active, edit);
}

function renderLayersPanel(active, edit) {
  const rows = [];
  if (active?.pairInfo) {
    rows.push({
      icon: "layers",
      title: "RAW + JPG Pair",
      meta: `Using ${active.pairInfo.role.toUpperCase()}`,
      active: false,
    });
  }
  rows.push({
    icon: "image",
    title: active ? "Background" : "Background",
    meta: active ? active.name : "No image loaded",
    active: Boolean(active),
  });
  if (active && !isDefaultEdit(edit)) {
    rows.push({
      icon: "sliders-horizontal",
      title: "Adjustments",
      meta: adjustmentSummary(edit),
      active: true,
    });
  }
  if (active && edit.crop.enabled) {
    rows.push({
      icon: "crop",
      title: "Crop Mask",
      meta: `${edit.crop.aspect}, ${edit.crop.size}%`,
      active: true,
    });
  }

  els.layerStatus.textContent = `${rows.length} layer${rows.length === 1 ? "" : "s"}`;
  els.layersList.replaceChildren(...rows.map((row) => createPanelRow("layerRow", row)));
  if (window.lucide) window.lucide.createIcons();
}

function renderHistoryPanel(active, edit) {
  const rows = [];
  rows.push({
    icon: "file-image",
    title: active ? "Open Document" : "No Document",
    meta: active ? active.name : "Empty workspace",
    active: false,
  });
  if (active && state.editHistory.length) {
    rows.push({
      icon: "undo-2",
      title: `${state.editHistory.length} Undo Step${state.editHistory.length === 1 ? "" : "s"}`,
      meta: "Previous edit states",
      active: false,
    });
  }
  rows.push({
    icon: edit.crop.enabled ? "crop" : "sliders-horizontal",
    title: active && !isDefaultEdit(edit) ? "Current Edit" : "Current State",
    meta: active ? adjustmentSummary(edit) : "Waiting for image",
    active: Boolean(active),
  });

  els.historyStatus.textContent = active && state.editHistory.length ? `${state.editHistory.length} undo` : "Current";
  els.historyList.replaceChildren(...rows.map((row) => createPanelRow("historyRow", row)));
  if (window.lucide) window.lucide.createIcons();
}

function createPanelRow(className, row) {
  const element = document.createElement("div");
  element.className = `${className}${row.active ? " active" : ""}`;

  const visible = document.createElement("span");
  visible.className = "visibilityDot";
  visible.setAttribute("aria-hidden", "true");

  const icon = document.createElement("i");
  icon.setAttribute("data-lucide", row.icon);

  const copy = document.createElement("span");
  copy.className = "panelRowCopy";

  const title = document.createElement("strong");
  title.textContent = row.title;

  const meta = document.createElement("small");
  meta.textContent = row.meta;

  copy.append(title, meta);
  element.append(visible, icon, copy);
  return element;
}

function adjustmentSummary(edit) {
  const parts = [];
  if (edit.exposure !== DEFAULT_EDIT.exposure) parts.push(`Exp ${edit.exposure}`);
  if (edit.contrast !== DEFAULT_EDIT.contrast) parts.push(`Con ${edit.contrast}`);
  if (edit.saturation !== DEFAULT_EDIT.saturation) parts.push(`Color ${edit.saturation}`);
  if (edit.warmth !== DEFAULT_EDIT.warmth) parts.push(`Warm ${signedValue(edit.warmth)}`);
  if (edit.tint !== DEFAULT_EDIT.tint) parts.push(`Tint ${signedValue(edit.tint)}`);
  if (edit.denoise !== DEFAULT_EDIT.denoise) parts.push(`Noise ${edit.denoise}`);
  if (edit.crop.enabled) parts.push(`Crop ${edit.crop.aspect}`);
  return parts.length ? parts.slice(0, 3).join(" / ") : "Original";
}

function renderWorkspaceTool() {
  const labels = {
    move: "Move",
    hand: "Hand",
    crop: "Crop",
    auto: "Auto Adjust",
    denoise: "Denoise",
    rotate: "Rotate",
    export: "Save Copy",
  };
  els.currentToolName.textContent = labels[state.activeTool] || "Move";
  els.workspaceToolButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.workTool === state.activeTool);
  });
  els.stage.classList.toggle("handTool", state.activeTool === "hand");
}

function renderViewState() {
  renderTransform();
  const zoom = `${Math.round(state.zoom * 100)}%`;
  els.activeZoom.textContent = zoom;
  els.viewZoom.textContent = zoom;
  els.viewRotation.textContent = `${normalizeRotation(state.rotation)} deg`;
  els.viewFlip.textContent = getFlipLabel();
  renderStudioPanels();
}

function renderEditState() {
  const active = getActive();
  const edit = getEdit();
  els.activeImage.style.filter = active ? buildPreviewFilter(edit) : "none";
  els.vignetteOverlay.style.opacity = active ? String(edit.vignette / 100) : "0";
  renderEditControls(edit);
  renderCropOverlay(edit);
  renderStudioPanels();
  updateButtons();
}

function renderBatchStatus() {
  els.batchStatus.textContent = state.batchStatus;
}

function renderLibraryState() {
  const info = state.libraryInfo;
  const camera = info.camera;
  const enabled = Boolean(info.enabled);
  const pairCounts = getPairCounts();

  els.homeStatus.textContent = info.status;
  els.homePath.textContent = info.homeFolder ? shortenPath(info.homeFolder) : "No folder set";
  els.homePath.title = info.homeFolder || "No folder set";
  els.cameraStatus.textContent = camera ? "Detected" : info.cameraStatus;
  els.deleteCameraOriginalsToggle.checked = Boolean(info.deleteOriginals);
  els.deleteCameraOriginalsToggle.disabled = !enabled || info.importing;
  els.pairRawJpgToggle.checked = Boolean(state.rawPairing.enabled);
  els.rawPairDefaultSelect.value = state.rawPairing.defaultSide;
  els.rawPairDefaultSelect.disabled = !state.rawPairing.enabled;
  els.rawPairStatus.textContent = state.rawPairing.enabled
    ? `${pairCounts.pairs} pair${pairCounts.pairs === 1 ? "" : "s"}`
    : "Off";

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

function renderGalleryState() {
  els.gallerySearchInput.value = state.gallery.query;
  els.gallerySortSelect.value = state.gallery.sortBy;
  els.galleryFilterSelect.value = state.gallery.filterBy;
  els.galleryViewButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.galleryView === state.gallery.viewMode);
  });

  const cached = state.images.filter((image) => image.recognition || getCachedRecognition(image)).length;
  const visible = getLibraryImages().length;
  els.recognitionStatus.textContent = state.recognitionRunning ? "Analyzing" : `${cached}/${state.images.length} cached`;
  els.analyzeGalleryButton.disabled = state.recognitionRunning || !state.images.length;
  els.clearRecognitionCacheButton.disabled = state.recognitionRunning || !Object.keys(state.recognitionCache.entries || {}).length;
  els.gallerySearchInput.disabled = state.recognitionRunning;
  els.gallerySortSelect.disabled = state.recognitionRunning;
  els.galleryFilterSelect.disabled = state.recognitionRunning;
  els.imageCount.title = `${visible} visible from ${state.images.length} total`;
}

function renderRecognitionState() {
  const active = getActive();
  const recognition = active?.recognition || getCachedRecognition(active);
  const hasActive = Boolean(active);
  const confidence = recognition ? `${Math.round((recognition.confidence || 0) * 100)}% ${recognition.scene}` : "Unanalyzed";

  els.recognitionConfidence.textContent = hasActive ? confidence : "-";
  replaceChips(els.recognitionTags, createRecognitionChips(recognition, { max: 8 }));
  els.activePeopleList.replaceChildren(...createPeopleChips(recognition?.people || []));
  els.activePeopleInput.disabled = !hasActive || state.recognitionRunning;
  els.addPersonButton.disabled = !hasActive || state.recognitionRunning;
  els.removePeopleButton.disabled = !hasActive || state.recognitionRunning || !recognition?.people?.length;
  els.analyzeCurrentButton.disabled = !hasActive || state.recognitionRunning;
}

function createRecognitionChips(recognition, options = {}) {
  const list = document.createElement("div");
  list.className = options.compact ? "chipList compact" : "chipList";
  if (!recognition) {
    if (!options.compact) {
      const chip = document.createElement("span");
      chip.className = "tagChip muted";
      chip.textContent = "unanalyzed";
      list.append(chip);
    }
    return list;
  }

  const labels = [
    recognition.scene,
    ...(recognition.labels || []),
    ...(recognition.people || []).map((person) => `person: ${person}`),
  ].filter(Boolean);
  labels.slice(0, options.max || 6).forEach((label) => {
    const chip = document.createElement("span");
    chip.className = "tagChip";
    chip.textContent = label;
    list.append(chip);
  });
  return list;
}

function createPeopleChips(people) {
  if (!people.length) {
    const chip = document.createElement("span");
    chip.className = "tagChip muted";
    chip.textContent = "no saved people";
    return [chip];
  }
  return people.map((person) => {
    const chip = document.createElement("span");
    chip.className = "tagChip person";
    chip.textContent = person;
    return chip;
  });
}

function replaceChips(container, chips) {
  container.replaceChildren(...Array.from(chips.children));
}

function updateRawPairing(patch) {
  const active = getActive();
  state.rawPairing = {
    ...state.rawPairing,
    ...patch,
    defaultSide: patch.defaultSide === "raw" ? "raw" : patch.defaultSide === "jpg" ? "jpg" : state.rawPairing.defaultSide,
  };
  saveRawPairingSettings();
  if (active) setActiveByImageId(active.id);
  state.editHistory = [];
  resetView(false);
  render();
}

function updateGallerySettings(patch) {
  const active = getActive();
  state.gallery = {
    ...state.gallery,
    ...patch,
    query: typeof patch.query === "string" ? patch.query : state.gallery.query,
    sortBy: ["recent", "name", "scene", "people", "size"].includes(patch.sortBy) ? patch.sortBy : state.gallery.sortBy,
    filterBy: ["all", "nature", "people", "known-people", "city", "night", "document", "untagged"].includes(patch.filterBy) ? patch.filterBy : state.gallery.filterBy,
    viewMode: patch.viewMode === "grid" ? "grid" : patch.viewMode === "list" ? "list" : state.gallery.viewMode,
  };
  saveGallerySettings();
  if (active) setActiveByImageId(active.id);
  state.activeIndex = Math.min(state.activeIndex, Math.max(0, getLibraryImages().length - 1));
  resetView(false);
  render();
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

async function analyzeGalleryImages() {
  if (state.recognitionRunning || !state.images.length) return;
  state.recognitionRunning = true;
  renderGalleryState();
  renderRecognitionState();
  try {
    const images = state.images;
    let analyzed = 0;
    for (const image of images) {
      try {
        els.recognitionStatus.textContent = `${analyzed + 1}/${images.length}`;
        await analyzeAndCacheImage(image);
        analyzed += 1;
      } catch (error) {
        console.error(error);
      }
    }
    setActiveByImageId(getActive()?.id);
    render();
  } finally {
    state.recognitionRunning = false;
    renderGalleryState();
    renderRecognitionState();
  }
}

async function analyzeActiveRecognition() {
  const active = getActive();
  if (!active || state.recognitionRunning) return;
  state.recognitionRunning = true;
  renderGalleryState();
  renderRecognitionState();
  try {
    await analyzeAndCacheImage(active);
    render();
  } catch (error) {
    console.error(error);
  } finally {
    state.recognitionRunning = false;
    renderGalleryState();
    renderRecognitionState();
  }
}

async function analyzeAndCacheImage(image) {
  const recognition = await buildRecognitionForImage(image);
  saveRecognitionForImage(image, recognition);
  return recognition;
}

async function buildRecognitionForImage(image) {
  if (!image.previewSupported) {
    return makeRecognitionResult({
      scene: "Raw/Preview",
      sceneKey: "document",
      labels: ["unpreviewed", extensionFromName(image.name).replace(".", "") || "photo"],
      confidence: 0.42,
      peopleLikely: false,
      faceCount: 0,
    });
  }

  const sample = await sampleImageMetrics(image);
  const metrics = analyzeRecognitionMetrics(sample.data, sample.size);
  const scene = classifyRecognitionScene(metrics, image);
  return makeRecognitionResult({
    ...scene,
    metrics,
    peopleLikely: metrics.skinRatio > 0.055 || metrics.centerSkinRatio > 0.045,
    faceCount: estimateFaceCount(metrics),
    confidence: scene.confidence,
  });
}

function makeRecognitionResult(result) {
  const labels = Array.from(new Set([
    result.sceneKey,
    ...(result.labels || []),
    result.peopleLikely ? "people" : "",
    result.faceCount ? "faces" : "",
  ].filter(Boolean)));

  return {
    version: 1,
    scene: result.scene || "Photo",
    sceneKey: result.sceneKey || "photo",
    labels,
    peopleLikely: Boolean(result.peopleLikely),
    faceCount: Number(result.faceCount) || 0,
    confidence: clamp(Number(result.confidence) || 0.5, 0.1, 0.98),
    metrics: result.metrics || {},
    people: result.people || [],
    analyzedAt: Date.now(),
  };
}

function analyzeRecognitionMetrics(data, size) {
  let red = 0;
  let green = 0;
  let blue = 0;
  let saturation = 0;
  let luma = 0;
  let greenPixels = 0;
  let bluePixels = 0;
  let skyPixels = 0;
  let skinPixels = 0;
  let centerSkinPixels = 0;
  let grayPixels = 0;
  let warmPixels = 0;
  let darkPixels = 0;
  let brightPixels = 0;
  let edgeEnergy = 0;
  let centerPixels = 0;
  const total = size * size;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const lum = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const inCenter = x > size * 0.25 && x < size * 0.75 && y > size * 0.14 && y < size * 0.72;

      red += r;
      green += g;
      blue += b;
      saturation += sat;
      luma += lum;
      if (g > r * 1.08 && g > b * 1.08 && sat > 0.16) greenPixels += 1;
      if (b > r * 1.08 && b > g * 1.03 && sat > 0.12) bluePixels += 1;
      if (b > 92 && g > 84 && b > r * 1.08 && lum > 86) skyPixels += 1;
      if (r > 72 && g > 44 && b > 28 && r > g * 1.05 && g > b * 1.04 && sat > 0.18 && sat < 0.72) {
        skinPixels += 1;
        if (inCenter) centerSkinPixels += 1;
      }
      if (sat < 0.13) grayPixels += 1;
      if (r > g * 1.08 && r > b * 1.16 && sat > 0.25) warmPixels += 1;
      if (lum < 58) darkPixels += 1;
      if (lum > 202) brightPixels += 1;
      if (inCenter) centerPixels += 1;

      if (x > 0 && y > 0) {
        const left = lumaAt(data, index - 4);
        const up = lumaAt(data, index - size * 4);
        edgeEnergy += Math.min(80, Math.abs(lum - left) + Math.abs(lum - up));
      }
    }
  }

  return {
    avgRed: red / total,
    avgGreen: green / total,
    avgBlue: blue / total,
    avgLuma: luma / total,
    avgSaturation: saturation / total,
    greenRatio: greenPixels / total,
    blueRatio: bluePixels / total,
    skyRatio: skyPixels / total,
    skinRatio: skinPixels / total,
    centerSkinRatio: centerPixels ? centerSkinPixels / centerPixels : 0,
    grayRatio: grayPixels / total,
    warmRatio: warmPixels / total,
    darkRatio: darkPixels / total,
    brightRatio: brightPixels / total,
    edgeScore: edgeEnergy / Math.max(1, total - size * 2),
  };
}

function classifyRecognitionScene(metrics, image) {
  const labels = [];
  const nameText = `${image.name} ${image.relativePath || ""}`.toLowerCase();
  if (metrics.greenRatio > 0.17 || (metrics.greenRatio + metrics.skyRatio > 0.28 && metrics.avgSaturation > 0.15)) {
    labels.push("outdoors");
    if (metrics.skyRatio > 0.08) labels.push("sky");
    if (metrics.greenRatio > 0.22) labels.push("trees");
    return {
      scene: metrics.blueRatio > 0.18 ? "Nature / Water" : "Nature",
      sceneKey: "nature",
      labels,
      confidence: clamp(0.56 + metrics.greenRatio + metrics.skyRatio * 0.8, 0.48, 0.94),
    };
  }
  if (metrics.darkRatio > 0.46 || metrics.avgLuma < 68 || /night|dark|concert|neon/.test(nameText)) {
    labels.push("low light");
    if (metrics.warmRatio > 0.08 || metrics.blueRatio > 0.08) labels.push("lights");
    return {
      scene: metrics.edgeScore > 15 ? "Night / City" : "Night",
      sceneKey: "night",
      labels,
      confidence: clamp(0.58 + metrics.darkRatio * 0.7, 0.5, 0.93),
    };
  }
  if (metrics.skinRatio > 0.07 || metrics.centerSkinRatio > 0.05) {
    labels.push("people");
    if (metrics.centerSkinRatio > 0.08) labels.push("portrait");
    return {
      scene: metrics.centerSkinRatio > 0.08 ? "Portrait" : "People",
      sceneKey: "people",
      labels,
      confidence: clamp(0.48 + metrics.skinRatio * 2.2 + metrics.centerSkinRatio, 0.45, 0.9),
    };
  }
  if ((metrics.grayRatio > 0.42 && metrics.edgeScore > 14) || /street|building|city|urban|architecture/.test(nameText)) {
    labels.push("structure");
    if (metrics.edgeScore > 18) labels.push("detail");
    return {
      scene: "City / Structure",
      sceneKey: "city",
      labels,
      confidence: clamp(0.48 + metrics.grayRatio * 0.55 + metrics.edgeScore / 80, 0.44, 0.86),
    };
  }
  if ((metrics.brightRatio > 0.32 && metrics.grayRatio > 0.38) || /scan|doc|receipt|paper|note/.test(nameText)) {
    labels.push("paper");
    return {
      scene: "Document",
      sceneKey: "document",
      labels,
      confidence: clamp(0.54 + metrics.brightRatio * 0.5, 0.45, 0.88),
    };
  }
  if (metrics.warmRatio > 0.18 && metrics.avgSaturation > 0.2) {
    labels.push("warm color");
    return {
      scene: "Indoor / Object",
      sceneKey: "object",
      labels,
      confidence: clamp(0.48 + metrics.warmRatio, 0.42, 0.8),
    };
  }
  return {
    scene: "Photo",
    sceneKey: "photo",
    labels: metrics.avgSaturation < 0.12 ? ["neutral"] : ["general"],
    confidence: 0.5,
  };
}

function estimateFaceCount(metrics) {
  if (metrics.skinRatio < 0.045 && metrics.centerSkinRatio < 0.035) return 0;
  if (metrics.skinRatio > 0.22) return 3;
  if (metrics.skinRatio > 0.12) return 2;
  return 1;
}

function normalizePersonName(value) {
  return String(value || "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64);
}

async function addPersonToActive() {
  const active = getActive();
  if (!active) return;
  const names = els.activePeopleInput.value
    .split(/[,;]+/)
    .map(normalizePersonName)
    .filter(Boolean);
  if (!names.length) return;
  const recognition = active.recognition || getCachedRecognition(active) || makeRecognitionResult({
    scene: "People",
    sceneKey: "people",
    labels: ["people"],
    confidence: 0.6,
    peopleLikely: true,
    faceCount: 1,
  });
  saveRecognitionForImage(active, {
    ...recognition,
    people: names,
    peopleLikely: true,
    labels: Array.from(new Set([...(recognition.labels || []), "people", "faces"])),
  });
  els.activePeopleInput.value = "";
  render();
}

function clearPeopleFromActive() {
  const active = getActive();
  const recognition = active?.recognition || getCachedRecognition(active);
  if (!active || !recognition) return;
  saveRecognitionForImage(active, {
    ...recognition,
    people: [],
  }, { mergePeople: false });
  render();
}

function clearRecognitionCache() {
  state.recognitionCache = { version: 1, entries: {} };
  state.images.forEach((image) => {
    image.recognition = null;
  });
  saveRecognitionCache();
  render();
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
    if (state.activeTool === "crop") setWorkspaceTool("move");
    return;
  }

  setWorkspaceTool("crop");
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

  const activeSourceIndexes = active.pairInfo
    ? [active.pairInfo.raw, active.pairInfo.jpg].map((image) => state.images.indexOf(image)).filter((index) => index >= 0)
    : [state.images.indexOf(active)].filter((index) => index >= 0);
  const insertAt = activeSourceIndexes.length ? Math.max(...activeSourceIndexes) + 1 : state.images.length;
  state.images.splice(insertAt, 0, editedImage);
  setActiveByImageId(editedImage.id);
  state.editHistory = [];
  resetView(false);
  render();
}

async function autoBatchEdit() {
  const images = getLibraryImages();
  if (!images.length || state.batchRunning) return;
  setBatchRunning(true);
  state.editHistory = [];
  try {
    const count = images.length;
    for (let index = 0; index < count; index += 1) {
      const image = images[index];
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
  const images = getLibraryImages();
  const currentLook = adjustmentOnly(getEdit());
  images.forEach((image) => {
    ensureImageEdit(image);
    image.edit = {
      ...image.edit,
      ...currentLook,
      crop: { ...image.edit.crop },
    };
  });
  state.editHistory = [];
  render();
  setBatchStatus(`${images.length} matched`);
}

async function makeBatchCopies() {
  const visibleImages = getLibraryImages();
  if (!visibleImages.length || state.batchRunning) return;
  setBatchRunning(true);
  state.editHistory = [];
  try {
    const originals = visibleImages.slice();
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
  const images = getLibraryImages();
  if (!images.length || state.batchRunning) return;
  images.forEach((image) => {
    image.edit = makeDefaultEdit();
  });
  state.editHistory = [];
  render();
  setBatchStatus(`${images.length} reset`);
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
  const images = getLibraryImages();
  const hasImages = images.length > 0;
  const multi = images.length > 1;
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
  els.workspaceToolButtons.forEach((button) => {
    button.disabled = state.batchRunning || (!hasImages && button.dataset.workTool !== "open");
  });
  els.previousButton.disabled = disabled || !multi;
  els.nextButton.disabled = disabled || !multi;
  els.undoEditButton.disabled = disabled || state.editHistory.length === 0;
}

function setActive(index) {
  if (!getLibraryImages()[index]) return;
  state.activeIndex = index;
  state.editHistory = [];
  resetView(false);
  render();
}

function moveActive(delta) {
  const images = getLibraryImages();
  if (images.length < 2) return;
  const next = (state.activeIndex + delta + images.length) % images.length;
  setActive(next);
}

function removeActive() {
  const active = getActive();
  if (!active) return;
  const removeIds = new Set(active.pairInfo
    ? [active.pairInfo.raw.id, active.pairInfo.jpg.id]
    : [active.id]);
  state.images = state.images.filter((image) => !removeIds.has(image.id));
  if (!state.images.length) loadSampleAlbum();
  state.activeIndex = Math.min(state.activeIndex, getLibraryImages().length - 1);
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
  return getLibraryImages()[state.activeIndex] || null;
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
