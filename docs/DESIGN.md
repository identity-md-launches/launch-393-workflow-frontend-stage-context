# Trickle design record

## Overview

Trickle is a single-page interface for a small Sepolia staking experiment. The design uses warm paper surfaces, dark olive text, quiet green stream state, and a large serif introduction. The primary task is the connected wallet's approval and stake flow; secondary actions remain neutral. Public stream context precedes the two working sections: position management and reward contributions.

The source of truth is `web/src/styles.css`, with structure and the local `AmountField` component in `web/src/App.tsx`. This document is under `docs/` because the higher-priority write scope does not permit root `DESIGN.md`.

## Colors

All source values use hexadecimal CSS primitives mapped to semantic roles.

| Semantic token | Value | Use |
| --- | --- | --- |
| `--page` | `#f5f4ee` | Page canvas |
| `--surface` | `#fffefa` | Panels, fields, neutral controls |
| `--subtle` | `#eeede5` | Carry inset, mode switch, disabled controls |
| `--border` | `#d8d9cb` | Dividers and structural borders |
| `--ink` | `#252e23` | Body, headings and main numbers |
| `--muted` | `#666c5c` | Descriptions, units and metadata |
| `--accent`, `--focus` | `#3e5426` | Primary action, links, visible focus |
| `--accent-hover` | `#30411d` | Primary hover fill |
| `--accent-text` | `#fffefa` | Primary button text |
| `--stream` | `#e8eddc` | Public stream panel |
| `--stream-fill` | `#4a642f` | Decorative remaining-duration bar and status dot |
| `--error` | `#922f24` | Action and field errors |
| `--error-bg` | `#fcf0e9` | Error notice surface |

The primitive green/neutral/red values live at `:root`; components use semantic roles. State always includes text. There is one light theme. Measured rendered contrast: muted on page 4.93:1, muted on stream 4.55:1, main text on stream 11.77:1, primary button text 8.32:1, error text on panel 7.84:1. See `frontend/interaction-results.json` for actual RGB pairs. These samples do not constitute a complete accessibility certification.

## Typography

- UI family: `'Segoe UI', 'Helvetica Neue', Arial, sans-serif`. Body 1rem / 1.5, weight 400. Labels .875rem; captions .8125rem / 1.6. No downloaded font assets; the actual fallback varies by platform.
- Main heading: Georgia, Times New Roman, serif, weight 400, italic second line; `clamp(2.8rem, 5.5vw, 4.3rem)`, line-height 1.06, tracking -.06em.
- Section headings: 1.375rem / 1.25, weight 600, tracking -.035em; 1.2rem at the smallest breakpoint. Secondary onboarding heading 1rem.
- Hero number: `clamp(2.1rem, 4.5vw, 3.2rem)` / 1.3, with responsive overrides. Wallet figures 1.65rem, scaled down in constrained layouts. Amount inputs 1.5rem, above the mobile 16px floor.
- Numeric values use tabular figures. `bigint` quantities are truncated for display without floating-point conversion; small positive values use a less-than threshold. Exact unrounded balance/stake values are available through native titles and the Max control. Inputs retain full precision.
- Headings balance; prose uses pretty wrapping; identifiers can break. Long descriptions have a 60ch measure. No custom or synthesized webfont weights are required. Font synthesis is disabled.

## Layout

`.shell` is at most 1104px, with 32px side padding. The header is a wrapping flex row. The introduction separates the task statement from a short test-network explanation. The stream panel has a 1.25:1 grid with a 64px gap; the work area has a 1.12:1 grid with a 24px gap. Panel padding is normally 28px. Sections use 20–28px internal separation; the introduction has 56px/42px block padding.

At 55rem, gaps and panel padding reduce. At 44rem, the stream and workspace become single-column, the introduction stacks, and shell padding becomes 20px. At 24rem, shell padding is 16px, panel padding 18px, and type/buttons adapt; the header network badge hides while Sepolia remains stated in page copy. Connected header controls wrap. Nothing uses fixed-height text containers or viewport-fixed transaction overlays.

Browser checks covered 320, 390, 704, 880 and 1280 CSS pixels, with no horizontal overflow. A 200% root text-size test also passed. That is text enlargement, not native browser zoom. English LTR is the only implemented locale.

## Elevation & Depth

The design is flat: structural 1px borders, tonal panels and whitespace, with no drop shadows, backdrops or modals. The skip link is the only element with an elevated stacking layer. The stream bar is decorative and has equivalent written timing information.

## Shapes

Panels use a 16px radius; notices 12px; controls, input groups and carry inset 8px. Status pills are fully rounded. The small drop mark is an inline SVG with a current-color fill and a matching data-URL favicon. There are no third-party illustrations or raster UI assets.

## Components

| Pattern / source | Variants and behavior |
| --- | --- |
| `AmountField`, `App.tsx` | Bound label, decimal keyboard, explicit token unit, optional Max, inline error with `aria-invalid` and `aria-describedby`; invalid submit returns focus to the input. |
| Buttons, `styles.css` | Neutral base, `.primary`, `.quiet`, `.text-button`, `.max`, `.wide`; native disabled state. Minimum target 44px except mode/Max controls at 40px. Primary fill is reserved for approval/stake/withdraw. |
| `.mode-switch` | Two native buttons with `aria-pressed`, inside a labeled group; changes the position form between stake and withdraw. |
| `.panel`, `.section-heading` | Public stream and working sections; consistent headings and spacing. |
| `.notice`, `.field-error` | Recoverable wallet/RPC/config errors and field validation; text supplements color. |
| `.transaction-status` | Persistent polite status and alert regions, transaction explorer link, confirmation retry control. Busy state locks transactions. No disappearing toasts. |
| Native `details` | Progressive disclosure for full deployed contract addresses, source commit and manifest link. |
| `:focus-visible` | 3px accent outline, 4px offset; inputs use a tighter offset. Forced-colors mode uses system Highlight. |

Motion is limited to a 120ms color/press transition under `prefers-reduced-motion: no-preference`; button press uses scale .96 with `cubic-bezier(.2,0,0,1)`. There is no load animation or autoplay. Hover styles apply only to hover-capable devices. Native HTML provides keyboard behavior and visible labels.

## Do's and Don'ts

- Start another section with `.panel` and `.section-heading`; use semantic headings in reading order and the existing spacing/type roles.
- Use the green primary fill for the next position action and neutral controls for peers. Explain transaction effects before the action.
- Keep amounts in bigint until formatting. Show unavailable values as a dash, and keep failed/stale reads visible while disabling transaction controls.
- Keep runtime deployment values in the exported manifest. ABI or address changes require a new validated handoff, build and inventory.
- Retain responsive wrapping, native controls, full-address disclosure, test-token language, and direct descriptions of donation/carry behavior.
- Do not turn the normalized rate into APR, a projected return, or a price claim. Do not introduce a theme, font service, modal system or animation library merely for visual variation.

## Guidance attribution

Applied the pinned Better Interface reference, adapted from Jakub Krehel's [Better Interface](https://github.com/jakubkrehel/skills/tree/267330e1adfc66a718fb65fa6918c1f06d0a689e/skills/better-interface), commit `267330e1adfc66a718fb65fa6918c1f06d0a689e` (MIT). Documentation method adapted from Paul Bakaus's [Impeccable document reference](https://github.com/pbakaus/impeccable/blob/9d715cc4f5564a990ca8345abfdd5df6dc9b41c8/skill/reference/document.md), commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8` (Apache-2.0). The guide itself is not redistributed here.
