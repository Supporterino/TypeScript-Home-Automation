# Display typeface — Plus Jakarta Sans (subset)

Self-hosted display face for the Ambient Glass design system. Body/UI text uses
the system stack; only headings and numeric readouts use this font.

- **File:** `plus-jakarta-sans-latin.woff2`
- **Family:** Plus Jakarta Sans
- **Weights:** variable, axis restricted to `wght 500–700`
- **Subset:** Basic Latin + Latin-1 Supplement, General Punctuation, ™, → (arrow)
- **License:** SIL Open Font License 1.1 (bundled alongside this file as `OFL.txt`)
- **Origin:** `https://github.com/google/fonts/raw/main/ofl/plusjakartasans/PlusJakartaSans%5Bwght%5D.ttf`

The file is a subset build of the upstream variable font; it is committed so
the build needs no network and no font dependency is added to `package.json`.
`build:web-ui` emits it as a content-hashed `.woff2` referenced from
`../styles/tokens.css`.

## Reproduction

Requires `fonttools` (with `brotli`/`woff2` support).

```bash
curl -L -o PlusJakartaSans.ttf \
  "https://github.com/google/fonts/raw/main/ofl/plusjakartasans/PlusJakartaSans%5Bwght%5D.ttf"

# Restrict the variable axis to the two weights the UI uses.
python -m fontTools.varLib.instancer PlusJakartaSans.ttf wght=500:700 \
  -o PlusJakartaSans-500-700.ttf

# Subset to the glyphs the UI can render, outputting woff2.
pyftsubset PlusJakartaSans-500-700.ttf --flavor=woff2 \
  --output-file=plus-jakarta-sans-latin.woff2 \
  --unicodes="U+0000-00FF,U+2000-206F,U+2122,U+2192" \
  --layout-features='*' --name-IDs='*' --no-hinting
```
