# ITSZ's Studio

Photo viewer and editor with local web preview, desktop packaging, batch tools, denoise, installer builds, and update checks.

## Current Features

- Open multiple local images with the toolbar or drag and drop.
- Set a desktop home folder, load that folder into the library, and open it from the app.
- Detect filesystem-mounted cameras or SD cards with photo folders and ask whether to import.
- Import camera photos into the home folder with an optional delete-originals-after-copy checkbox.
- Recognizes common photo extensions including JPEG, PNG, WebP, AVIF, HEIC/HEIF, TIFF, DNG, CR2/CR3, NEF, ARW, RAF, ORF, RW2, and other camera RAW variants.
- Browse images from the side library or bottom filmstrip.
- Zoom, fit, actual size, pan, rotate, flip, and reset the active view.
- Apply quick looks: Natural, Auto, Vivid, B&W, Warm, and Cool.
- Adjust exposure, contrast, color, warmth, tint, fade, vignette, and denoise with live preview.
- Auto Denoise estimates noise on the active photo and bakes cleanup into applied/exported JPEGs.
- Crop by original, square, portrait, or wide ratios with size and position controls.
- Undo edits, reset edits, apply the current edit back into the library, or save an edited JPEG copy.
- Batch tools: Auto All, Match Look, Make Copies, and Reset All.
- Desktop update panel with manual check, download, install, and auto-check toggle when packaged.
- Inspect filename, dimensions, type, size, modified time, zoom, rotation, flip state, and brightness histogram.
- Windows NSIS installer, Windows portable build, and Linux AppImage/deb/rpm release workflow.
- GitHub Pages download site scaffold in `site/`.

## Run

Open `index.html` directly in a browser.

The app starts with generated sample images. Opening your own photos replaces those samples.

Home-folder and camera import features run in the packaged desktop app because they need local filesystem access.

## Desktop Build

```powershell
npm install
npm run validate
npm run dist:win
```

The Windows installer output lands in `release/`. Linux packages are built by the GitHub Actions workflow on Ubuntu:

```powershell
npm run dist:linux
```

## GitHub Release Flow

Use `scripts/save-github-token.ps1` to save a GitHub token encrypted under `.secrets/`, or set `GITHUB_TOKEN` in the current shell. Then run `scripts/create-public-github-repo.ps1`. It creates a public GitHub repo, pushes the project, and tries to enable GitHub Pages. Push a tag like `v0.1.0` to build installers and deploy the download site.
