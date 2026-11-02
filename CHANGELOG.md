# Changelog

Notable changes to Canvasly. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-02

The first public release, and the first version of
[`@anassav/canvasly-shared`](packages/shared/README.md).

### Added

**Canvas and objects**

- Infinite canvas with zoom, pan, snapping, grouping, locking, undo and redo
- Stickies, text, 18 shape kinds with corner rounding, frames, tables, and bar, line, area, pie and donut charts
- 15 templates, inserted into a board or used to start one
- Figma-style layers panel with collapsible groups that can be renamed

**Text**

- Text boxes that fit their content, and wrap once a width is set
- 28 self-hosted fonts, formatting, alignment, lists, links, color, highlight and background
- Keyboard shortcuts for formatting, in the selection and while typing

**Lines and drawing**

- Connect dots: drag to draw a curved arrow that attaches to the nearest side, or click to add a joined copy
- Straight, elbow and curved routes, five end styles, dashes, thickness, bending and labels
- Pen and highlighter with custom-color presets, smart shape recognition, a cutting eraser, a stroke eraser and a lasso

**Files**

- PDFs as one object with page turning, extraction of a page, a range or the entire document, and download
- A drop overlay for dragging in images and PDFs
- Paste from other apps, keeping text, shapes and images; Canva elements keep their positions and styles
- Export to PNG, PDF and portable JSON, and import from JSON

**Collaboration and sharing**

- Real-time editing through Yjs: live cursors, presence, follow mode, per-user undo and offline edits
- Owner, editor and viewer roles enforced on the server, with changes applying live
- Invites, public view links and editor links
- Threaded comments, pinned to the board
- Presentation mode from frames

**Accounts**

- Email and password, optional Google sign-in, and optional verification, reset and invite emails through Resend
- A home page with sharing from board cards, counts, search, filters and sorting

**Interface**

- Dark mode, touch and phone support, right-click menus and a shortcuts dialog

**Project**

- Deployment to Cloudflare Workers Free with CI, CodeQL and Dependabot
- User guide, architecture and deployment docs, and reproducible screenshots

### Fixed

These are fixes found while preparing this release.

- Near-black colors other than the default black, such as text pasted from Canva, were nearly invisible in dark mode
- Sticky notes could break a word in two when a slightly smaller font would have kept it whole
- Text in shapes with little room for it, such as diamonds and cylinders, came out tiny
- Elbow lines leaving and entering the same side ran back through their own shape
- Boards made from a template showed as empty on the home page, even after being opened
- Anyone invited before the share dialog finished loading disappeared from its list
- Double-clicking a line's middle handle could open the label editor if the screen hadn't redrawn yet

[1.0.0]: https://github.com/AnasSAV/Canvasly/releases/tag/v1.0.0
