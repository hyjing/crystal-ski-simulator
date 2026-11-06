# Sharing and deployment

Play: https://hyjing.github.io/crystal-ski-simulator/

Source: https://github.com/hyjing/crystal-ski-simulator

The game is a static browser application. Sharing the Pages link lets friends play without a GitHub account or development tools. The repository link shares source and documentation.

## Deployment

`.github/workflows/pages.yml` tests and builds `main`, then publishes only `dist/` to GitHub Pages. `CRYSTAL_BASE_PATH=/crystal-ski-simulator/` keeps model / terrain / texture paths inside the project URL. The local development base remains `/`. GitHub Pages must use the GitHub Actions publishing source.

The build job has read-only repository access; only the deploy job receives Pages write and OIDC permissions. Deployment uses GitHub's temporary workflow token, not a personal access token. Pull requests run checks but do not deploy. No API key is required to play: geographic resources and character assets are bundled with the site.

To test the project path locally:

```sh
CRYSTAL_BASE_PATH=/crystal-ski-simulator/ npm run build
CRYSTAL_BASE_PATH=/crystal-ski-simulator/ npm run preview
```

Open `http://127.0.0.1:4173/crystal-ski-simulator/`. To build for the root path again, run `npm run build`.

## Privacy and resource attribution

The application has no account system, analytics SDK, microphone, location access or score upload. Wardrobe colors, ski profile and NPC visibility are saved locally under `crystal-gear-v1`; there is no score upload. Weather is a visual preset. The optional development recorder captures the game canvas and is excluded from production. External font requests have been removed; the browser uses available system fonts. The hosting provider still receives normal request metadata. Production builds apply a same-origin meta CSP; see [SECURITY.md](../SECURITY.md).

Public geographic references describe the resort and surrounding mountains, not a player's location history. Asset sources and permissions are documented in [ASSETS.md](ASSETS.md). The reference video supplied during development is not included in this repository; the included demo is captured from this game.

The pre-publication review scans both the committed history and working tree for credentials, checks private paths and media metadata, and replaces local author / committer identity with the GitHub username and noreply email. A private history backup remains outside the repository. Automated scanning reduces risk but is not a formal security certification. Never commit credentials, local account files or private recordings; `.env*`, build output, dependencies and logs remain ignored.


The Share button copies a validated resort / route deep link. A manual-copy dialog is provided when clipboard access is unavailable. Open Graph / Twitter card metadata points to an existing in-game screenshot bundled as `public/social-card.png`; it is not a new gameplay capture. No social post is sent automatically. Promotion guidance is in [GROWTH.md](GROWTH.md).
