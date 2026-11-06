# Share and grow Terrain Sessions

The public play URL is https://hyjing.github.io/crystal-ski-simulator/. Share that link, rather than asking players to clone source. The in-game Share button copies the selected resort / route; social preview metadata uses an existing in-game screenshot, not a promise of higher visual fidelity.

## First release campaign

1. Start with 10–20 ski friends. Ask for device / browser, time to reach the first run, input problems and one favorite moment. Record feedback in repository issues without personal identifiers. Keep cold-load time, first-run completion and major bugs as the release criteria; no telemetry is installed automatically.
2. Use the current 24-second in-game demo, or capture a new short run that shows a recognizable lift / trail, turns, snow tracks and one clean jump. Put “Play in browser / no download” and the play URL in the post. Footage should match the deployed version; do not reuse another game's reference video. The current clip includes Crystal skiing, Whistler skiing and a sunset overview.
3. Post a native short video on your preferred social account, plus a concise project explanation in relevant ski / local resort / indie-game communities where self-promotion is allowed. Check each community's current rules before posting. Ask for route / control feedback. Do not mass-message people or imply resort endorsement.
4. Make one public release with a short changelog, controls and known limitations. Keep feedback focused for a week, fix the major blockers, then publish a second clip showing the improvements. An itch.io browser-game page is a possible discovery channel, subject to its current upload requirements; it has not been created here.

Suggested Chinese post:

> 我做了一个在真实山体上滑雪的浏览器小游戏，支持电脑和手机。现在可以探索 Crystal、Snoqualmie 和 Whistler / Blackcomb，连弯、留滑痕、腾空做动作。还在打磨，想请雪友试试转弯手感和雪道还原！免下载，打开链接就能玩： https://hyjing.github.io/crystal-ski-simulator/

Suggested English post:

> I’m building a browser ski game on real terrain, with mapped runs at Crystal, Snoqualmie and Whistler / Blackcomb. Carve, leave tracks, try a jump, or explore with the drone. It’s an early prototype with desktop and touch controls—I'd love feedback on the feel and routes. Play: https://hyjing.github.io/crystal-ski-simulator/

## Before a large traffic push

Use a supported phone and laptop to measure cold-load time and sustained frame time. Automated tests do not establish mobile performance. Optimize / compress the largest map and texture assets and confirm caching. Only the selected resort pack is requested, but distant scenery still adds transfer / GPU memory. Keep account permissions tight, HTTPS enabled and a rollback release ready; consult [SECURITY.md](../SECURITY.md). Large traffic may justify a CDN / hosting migration. No paid advertising, external posting, analytics collection, domain purchase or new hosting account has been performed.
