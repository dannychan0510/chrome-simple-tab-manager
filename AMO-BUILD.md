# Mozilla reviewer build instructions

Simple Tab Manager 2.0.0 is built with Node.js and npm. Use Node.js 22.x and
npm 10.x or newer on macOS or Linux. Network access is needed only for
`npm ci` to download the exact packages recorded in `package-lock.json`.

From the root of this source archive, run:

```sh
npm ci
npm run build-for-amo
npm run verify
```

The Firefox package is written to `dist/firefox`. Compare that directory with
the submitted extension archive.

The build does not minify, bundle, transpile, or obfuscate JavaScript. It:

1. Copies the JavaScript, HTML, and CSS source files listed in
   `scripts/build.mjs`.
2. Writes `manifests/firefox.json` as `dist/firefox/manifest.json`.
3. Copies two IBM Plex Sans WOFF2 files from the locked
   `@fontsource/ibm-plex-sans` npm package.
4. Uses the locked Sharp npm package to render 16, 32, 48, and 128 pixel PNG
   icons from `src/assets/icon.svg`.
5. Copies the complete IBM Plex Sans SIL Open Font License into the package.

`npm run verify` also runs all tests and rejects missing files, extra package
files, version differences, remote asset references, an incomplete font
license, or icons with incorrect dimensions.
