async function loadManifest() {
  const status = document.getElementById("releaseStatus");
  const version = document.getElementById("versionLabel");
  const windows = document.getElementById("windowsDownload");
  const linux = document.getElementById("linuxDownload");

  try {
    const response = await fetch("./downloads/updates.json", { cache: "no-store" });
    const manifest = await response.json();
    version.textContent = `Latest version ${manifest.version}`;
    status.textContent = `Generated ${new Date(manifest.generatedAt).toLocaleString()}`;
    if (manifest.installers?.windows?.installer) windows.href = manifest.installers.windows.installer;
    if (manifest.installers?.linux?.appImage || manifest.installers?.linux?.deb) {
      linux.href = manifest.installers.linux.deb || manifest.installers.linux.appImage;
    }
  } catch {
    status.textContent = "Release manifest is not published yet.";
  }
}

loadManifest();
