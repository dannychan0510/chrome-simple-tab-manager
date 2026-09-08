# Store assets

These images were rendered from the extension's real popup markup and styles.
They use fixed example domains and do not contain browser profile data, account
details, history, bookmarks, or real browsing activity.

Run the following command to rebuild them:

```sh
npm run store-assets
```

The renderer needs Chrome or Chromium. Set `CHROME_BIN` if it is not installed
in a standard macOS or Linux location.

## Files

- `store-icon-128.png`: Store icon.
- `screenshots/*.png`: Five 1280x800 listing screenshots.
- `promotional/small-promo-440x280.png`: Chrome small promotional tile.
- `promotional/marquee-1400x560.png`: Optional Chrome marquee image.

The screenshots are suitable for both store listings when their current upload
rules accept 1280x800 PNG files.
