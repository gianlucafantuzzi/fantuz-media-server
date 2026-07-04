# Frontend Style Guide

## Design Philosophy

The interface should feel like a **high-end music player** rather than an administrative dashboard.

Keywords:

* Minimal
* Calm
* Elegant
* Premium
* Dark
* Spacious
* Album artwork is the hero
* Typography over decoration

Avoid:

* Bright saturated colors
* Heavy gradients
* Rounded cartoonish controls
* Excessive shadows
* Glassmorphism
* Neon effects

The logo should remain the brightest colored element.

---

# Icons & Images

The ./frontend/images directory is used to store all icons and images used in the UI. In particular:

* The logo of the application is in ./frontend/images/FantuzMediaServerLogo.png
* The horizontal version of the logo to be used in the top bar is in ./frontend/images/FantuzMediaServerLogoHorizontal.png
* The logo icon for the application is in ./fontend/images/FantuzMediaServerLogoIcon.png

All the images get deployed in the ./deploy/frontend/images directory.

---

# Color Palette

## Background

Primary background

```text
#0F1114
```

Very dark charcoal, not pure black.

Secondary background (cards/sidebar)

```text
#171A1F
```

Panels

```text
#20242A
```

Top bar

```text
#000000
```

---

## Accent Color

Use the logo's cyan/teal.

Approximate value:

```text
#2FC8C9
```

Hover

```text
#42D8D9
```

Pressed

```text
#22B0B1
```

This should be the primary action color throughout the application.

---

## Text

Primary

```text
#F5F7F8
```

Secondary

```text
#B5BDC4
```

Muted

```text
#7E8790
```

Disabled

```text
#5A626B
```

---

## Borders

Very subtle.

```text
#2B3138
```

Avoid obvious outlines.

---

## Success

```text
#41C97B
```

Warnings

```text
#E3B341
```

Errors

```text
#D95C5C
```

---

# Typography

Use a clean sans-serif.

Recommended:

* Inter
* Manrope
* IBM Plex Sans

Avoid:

* Serif fonts
* Condensed fonts
* Decorative fonts

Hierarchy

```
Album title
22 px
600 weight

Artist
16 px
500

Metadata
13 px
400

Small captions
12 px
```

---

# Buttons

* Primary
    * Dark background
    * Teal fill
    * White text
    * Hover should slightly brighten
* Secondary
    * Transparent
    * Thin border
    * Hover changes border to teal

---

# Icons

Use simple outline icons.

Examples:

* Lucide
* Heroicons

Icons should normally be:

```text
#B5BDC4
```

Only become teal when active.

---

# Album Cards

Background

```text
#171A1F
```

8–10 px radius.

Very soft shadow.

Artwork occupies about 75% of the card.

Metadata underneath.

Hover:

* raise slightly
* brighten border
* subtle shadow

No animations longer than about 150 ms.

---

# Sidebar

Very dark.

Active item:

* teal icon
* white text
* subtle teal left border

---

# Search Bar

Large.

Rounded.

Dark.

When focused:

* teal outline
* no glow

---

# Tables

Avoid heavy grid lines.

Instead use spacing.

Hover row:

```
#20242A
```

Selection:

Very subtle teal tint.

---

# Player Bar

Fixed bottom.

Dark.

The Play button should be the only filled accent-colored control.

---

# Artwork

Artwork should provide the color.

The UI itself should stay neutral.

The goal is:

```
Dark UI
↓

Artwork provides colour

↓

Teal provides navigation
```

---

# Motion

Fast.

100–150 ms.

Ease-out.

Examples:

* hover
* album selection
* sidebar opening

Avoid bouncy animations.

---

# Spacing

Prefer generous whitespace.

```
8 px grid

Margins:

16
24
32
48
```

Never cram information together.

---

# Overall Mood

Think somewhere between:

* Plex (premium polish)
* Roon (music-first presentation)
* Apple Music in Dark Mode (clean typography)

…but **simpler** than any of them.

The user should feel that the software "gets out of the way" and lets the music collection take center stage.

---

## Design Principles for the Agent

* Use a dark theme with neutral charcoal backgrounds; never use pure black.
* Use the logo's teal (#2FC8C9) as the sole primary accent color.
* Album artwork should be the dominant visual element; the UI should frame it rather than compete with it.
* Prefer clean typography, generous spacing, and subtle borders over heavy decoration.
* Keep animations short and understated.
* Avoid skeuomorphism, glassmorphism, neon effects, excessive gradients, and high-contrast color palettes.
* The overall impression should be elegant, calm, and focused on music rather than on the interface itself.
