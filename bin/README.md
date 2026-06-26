# Bundled binaries

Run the binary preparation script before running `npm run dist`:

```sh
npm run binaries:prepare
```

It downloads the current platform's standalone `yt-dlp` release asset and copies the `ffmpeg-static` binary into this folder.

Recommended layout:

- `bin/darwin-arm64/yt-dlp`
- `bin/darwin-arm64/ffmpeg`
- `bin/darwin-x64/yt-dlp`
- `bin/darwin-x64/ffmpeg`
- `bin/win32-x64/yt-dlp.exe`
- `bin/win32-x64/ffmpeg.exe`

During development, the app also falls back to `yt-dlp` and `ffmpeg` on `PATH`.
