# Splitfairy logo

**The idea:** a fairy's sparkle, cut into two identical halves. The halves are exact 180° copies, so nobody gets the bigger piece.

The presentation board is in `board/`: open `splitfairy-board.html`, or look at the slide PNGs.

## Parts

| File | Use |
|---|---|
| `svg/splitfairy-horizontal.svg` | Default logo: headers, website, documents |
| `svg/splitfairy-stacked.svg` | Square-ish spaces: splash screen, sign-in, social cards |
| `svg/splitfairy-symbol.svg` | The sparkle alone, when the name is already nearby |
| `svg/splitfairy-symbol-small.svg` | The sparkle at 32 px and below (fuller body, wider cut) |
| `svg/splitfairy-wordmark.svg` | The name alone, where the sparkle is already visible |
| `*-reversed.svg` | Cream on teal or dark backgrounds (cut opened slightly so it doesn't fill in) |
| `*-black.svg`, `*-white.svg` | One-colour versions for print, stamps and embroidery |
| `web/` | favicon.ico/svg, PWA icons (192, 512, maskable), apple-touch icon, manifest, `<head>` snippet |

## Colour

| Name | HEX | RGB | CMYK (approx.) | Role |
|---|---|---|---|---|
| Fairy Teal | `#153f40` | 21 63 64 | 67 2 0 75 | Logo, primary |
| Cream | `#f5e8ca` | 245 232 202 | 0 5 18 4 | Logo on teal and dark backgrounds |
| Coral | `#e58465` | 229 132 101 | 0 42 56 10 | Accent only, never the logo |
| Paper | `#f7f3e9` | 247 243 233 | 0 2 6 3 | App background |

Contrast: teal on paper 10.4:1, cream on the dark-mode background `#152521` 13.1:1. Coral on paper is only 2.4:1, so keep it for decoration. The CMYK values are straight conversions; proof them on press and pick Pantone matches from a physical swatch book.

## Clear space and minimum size

- Clear space on every side is at least **X**, where X is a quarter of the symbol's height (about the length of one sparkle point).
- Symbol: at least 16 px. Use `symbol-small` at 32 px and below.
- Horizontal lockup: at least 96 px wide on screen, 25 mm in print. Below that, use the symbol alone.

## Backgrounds

- Light (paper, white, cream): teal logo.
- Teal, dark mode, photos with a calm dark area: cream (`-reversed`) or white logo.
- Busy photos: put the logo on a solid teal or paper tile.

## Don't

- Close the cut, rotate it, or make one half bigger. The equal cut is the whole idea.
- Colour the two halves differently.
- Recolour the logo coral, add gradients, shadows or outlines.
- Re-type the name: the wordmark is outlined Outfit with adjusted spacing between "split" and "fairy".
- Stretch, squash, or change the size relationship in the lockups.

## Type

The wordmark is **Outfit** Bold ("split") and Regular ("fairy"), converted to outlines. Outfit is licensed under the SIL Open Font License, which allows use in a logo. The app's UI text continues in DM Sans.

## Source

`source/build.py` draws the sparkle from a few parameters and rebuilds every master SVG. It needs Python with `fonttools` and `uharfbuzz`, plus Outfit TTFs in `fonts/`.

## Open items

- Get a professional trademark search before a public launch. This design has not been cleared.
- The app uses these files in `public/` (icon, favicons, PWA icons) and draws the small-size sparkle inline in the header (`apps/web/src/common.tsx`). If the mark changes, update both.
