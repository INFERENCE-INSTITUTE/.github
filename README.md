# .github

Organisation defaults for Inference Institute. The file that matters is
[`profile/README.md`](profile/README.md) — GitHub renders it on
[the organisation page](https://github.com/INFERENCE-INSTITUTE).

## The banner

`profile/assets/banner-dark.svg` and `banner-light.svg` are generated, not
hand-edited. The README picks between them with `<picture>` and
`prefers-color-scheme`.

```
node scripts/gen-banner.mjs
```

Two things about them are worth knowing before changing anything.

**The type is baked to outlines.** GitHub renders README images as documents
through a proxy, which means no webfont ever loads — an SVG with `<text>` in it
is set in whatever the reader happens to have installed. The wordmark is real
Jost and the metadata is real IBM Plex Mono, converted to paths at build time so
the lockup is the lockup on every machine. The generator reads the TTFs from
`.build/`, which is not committed; it prints where to fetch them if they are
missing.

**Everything that moves is CSS inside the SVG.** Script does not run in an
`<img>` and would be stripped anyway. The animation is one idea, which is the
one the mark encodes: a field of dots sits at rest, a scan passes across it, and
what the scan touches resolves. Signal read out of noise. Readers who have asked
for reduced motion get a composed still frame rather than a frozen mid-animation
one.

The palette, the mark geometry and the lockup rule are mirrored from the site
repository. If the brand moves, they move there first.
