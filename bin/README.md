# Bundled binaries

Run the binary preparation script before running `npm run dist`:

```sh
npm run binaries:prepare
```

It downloads the pinned yt-dlp release asset, copies the `ffmpeg-static` binary,
and vendors the pinned `ytmusicapi` Python package plus dependencies into this
folder.

To use a different yt-dlp version:

```sh
YT_DLP_VERSION=2026.06.09 npm run binaries:prepare
```

Set `YT_DLP_VERSION=latest` to query GitHub for the newest release (requires `GITHUB_TOKEN` in CI).

Recommended layout:

- `bin/darwin-arm64/yt-dlp`
- `bin/darwin-arm64/ffmpeg`
- `bin/darwin-arm64/python/ytmusicapi`
- `bin/darwin-x64/yt-dlp`
- `bin/darwin-x64/ffmpeg`
- `bin/darwin-x64/python/ytmusicapi`
- `bin/win32-x64/yt-dlp.exe`
- `bin/win32-x64/ffmpeg.exe`
- `bin/win32-x64/python/ytmusicapi`

During development, the app also falls back to `yt-dlp` and `ffmpeg` on `PATH`.
For YouTube Music, the app prepends the bundled `python` directory to
`PYTHONPATH` before falling back to packages installed in the user's Python
environment.
