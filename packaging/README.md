# Packaging

Installers are built by [`.github/workflows/release.yml`](../.github/workflows/release.yml) with
electron-builder, using the settings under `build` in [`package.json`](../package.json). The files
here are for people who package ClerdoDraft themselves, and for installation notes.

| Folder | Contents |
|---|---|
| [`linux/`](linux) | Desktop entry and AppStream metadata, for distributions and Flatpak |
| [`windows/`](windows) | Installation notes, including silent installs |
| [`macos/`](macos) | Installation notes |

The app icon in every size is in [`assets/app-icon`](../assets/app-icon).

The web app is published by [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) on each
push to `main`, and works offline once opened.
