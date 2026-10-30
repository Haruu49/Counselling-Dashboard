# Icons

Interface icons come from [Lucide](https://lucide.dev) (ISC licence), loaded from a
pinned CDN build in `index.html` and rendered by `lucide.createIcons()`.

Icons are placed in markup as `<i data-lucide="name">` through the `icon()` helper in
`js/ui.js`, so swapping the icon set later means changing one function.

`logo-mark.svg` in this folder is the brand mark, kept as a local file because it is
specific to this project rather than part of the icon set. `assets/images/favicon.svg`
is the same mark sized for a browser tab.
