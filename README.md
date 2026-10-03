# Teaser (vertical horror-to-UI trailer)

A 36 second, 1080×1920, 30 fps teaser trailer built entirely in code with
[Remotion](https://www.remotion.dev): shapes, gradients, SVG filters, CSS and
text. No footage, no images, and the music and sound effects are synthesised by a script in the repo.

The product name appears in exactly one place: `APP_NAME` in `src/theme.ts`,
rendered only on the title card.

## Install and render

```bash
npm install
npm run studio                              # live preview at http://localhost:3000
npx remotion render Teaser out/teaser.mp4   # final render (same as: npm run render)
```

Useful extras:

```bash
npx remotion still Teaser out/frame.png --frame=200     # one frame
npx remotion render Teaser out/teaser.mp4 --props='{"showSafeArea":true}'   # safe-zone overlay
npm run typecheck
```

Fonts (Instrument Serif, Inter Tight, IBM Plex Mono) load through
`@remotion/google-fonts`, so studio and render need internet access.

Animated grain is the most expensive thing in the file to encode. The defaults
(CRF 23, grain held for 2 frames, BT.709) give a master of about 170 MB.
Pass `--crf=18` for a heavier master or `--crf=26` for a lighter upload. Grain
strength per act lives in `GRAIN_KEYS` (`src/components/FilmLayers.tsx`); grain
size and its frame hold are props on `<Grain/>`.

## File tree

```
.
├── package.json
├── remotion.config.ts          render defaults (h264, CRF 23, BT.709)
├── tsconfig.json
├── scripts/generate-audio.py   synthesises the score + all SFX
├── public/
│   ├── score.mp3               generated score
│   └── sfx/                    generated sound effects
└── src/
    ├── index.ts                registerRoot
    ├── Root.tsx                <Composition id="Teaser" …>
    ├── Teaser.tsx              scene list → <Sequence>s, film layers, audio slot
    ├── timeline.ts             ★ every frame number: scenes, beats, SFX cues
    ├── theme.ts                APP_NAME, palette, safe zones
    ├── fonts.ts                @remotion/google-fonts loading
    ├── audio/
    │   └── AudioSlot.tsx       score + SFX cue table and mix
    ├── lib/
    │   ├── anim.ts             ramp(), EASE per style, step easing, spring presets
    │   ├── noise.ts            seeded value noise, camera shake, stepped random
    │   ├── geometry.ts         seven-segment + clock bars (powers the 6:00 morph)
    │   ├── paths.ts            smooth path + arc lengths, crack generator
    │   └── ids.ts              unique SVG ids
    ├── components/
    │   ├── Grain.tsx           animated feTurbulence film grain + dust/scratches
    │   ├── Scanlines.tsx       scanlines + rolling VHS tracking band
    │   ├── Vignette.tsx        barrel-shaped vignette
    │   ├── ChromaticText.tsx   red/cyan offset text layers
    │   ├── GlitchSlice.tsx     slice displacement + RGB split + pixel mosaic (one SVG filter)
    │   ├── AlarmDigits.tsx     SVG seven-segment alarm display (+ BarShape)
    │   ├── WallClock.tsx       noir wall clock, smeared hands, glass cracks
    │   ├── InkBleed.tsx        gooey turbulent ink mask
    │   ├── LightLeak.tsx       warm leak blooms + overexposure burn
    │   ├── Cursor.tsx          arrow cursor, spring paths, click ripples
    │   ├── GlassCard.tsx       frosted glass surface
    │   ├── PhoneFrame.tsx      phone mockup with island
    │   ├── WhipPan.tsx         whip pan with directional (x-only) blur
    │   ├── Checkmark.tsx       stroke-drawn check / circle check
    │   ├── Type.tsx            TextColumn (safe), LetterReveal, TypedText
    │   ├── NoirLight.tsx       one hard key light
    │   ├── SoftBackdrop.tsx    off-white / navy UI backdrops
    │   ├── RecHud.tsx          REC dot, CAM label, security-cam timestamp
    │   ├── FilmLayers.tsx      per-act grain/scanlines/vignette/HUD on top of everything
    │   ├── TitleLockup.tsx     gold wordmark (auto-fit), rules, COMING SOON
    │   └── SafeAreaGuides.tsx  dev overlay
    └── scenes/                 one file per scene
        ├── Act1Alarm.tsx           0–45
        ├── Act1EveryMorning.tsx   45–90
        ├── Act1SameCommute.tsx    90–135
        ├── Act1SameDesk.tsx      135–180
        ├── Act1Spent.tsx         180–240
        ├── Act1SameLife.tsx      240–300
        ├── Act1Blackout.tsx      300–330
        ├── Act2FlashWords.tsx    330–390
        ├── Act2Balance.tsx       390–450
        ├── Act2CrackedClock.tsx  450–510
        ├── Act2InkBleed.tsx      510–540
        ├── Act3StillWaiting.tsx  540–585
        ├── Act3Search.tsx        585–630
        ├── Act3LookNoFurther.tsx 630–660
        ├── Act3Journey.tsx       660–735
        ├── Act3Outreach.tsx      735–780
        ├── Act3Progress.tsx      780–810
        ├── Act3Checklist.tsx     810–840
        ├── Act4AlarmGold.tsx     840–900
        ├── Act4WakeUp.tsx        900–960
        ├── Act4Title.tsx         960–1020
        ├── Act4TitleGlitch.tsx  1020–1060
        ├── Act4FadeOut.tsx      1060–1080
        └── types.ts
```

## Retiming

Everything lives in `src/timeline.ts`.

**`SCENE_LENGTHS`**: scene order and length in frames. Changing one length
ripples every later scene, the total duration, the act boundaries and the SFX
cue frames.

| scene | length | default frames |
|---|---|---|
| alarm | 45 | 0–45 |
| everyMorning | 45 | 45–90 |
| sameCommute | 45 | 90–135 |
| sameDesk | 45 | 135–180 |
| spent | 60 | 180–240 |
| sameLife | 60 | 240–300 |
| blackout | 30 | 300–330 |
| flashWords | 60 | 330–390 |
| balance | 60 | 390–450 |
| crackedClock | 60 | 450–510 |
| inkBleed | 30 | 510–540 |
| stillWaiting | 45 | 540–585 |
| search | 45 | 585–630 |
| lookNoFurther | 30 | 630–660 |
| journey | 75 | 660–735 |
| outreach | 45 | 735–780 |
| progress | 30 | 780–810 |
| checklist | 30 | 810–840 |
| alarmGold | 60 | 840–900 |
| wakeUp | 60 | 900–960 |
| title | 60 | 960–1020 |
| titleGlitch | 40 | 1020–1060 |
| fadeOut | 20 | 1060–1080 |

**`BEATS`**: scene-local moments that picture and sound share, e.g.
`alarmBeeps` (15…), `spentImpact` (20), `foreverAt`/`foreverLen` (30/5),
`recStop` (22), `crackBursts` (12, 24, 36), `inkWhoosh` (28),
`periodClick` (25), `outreachTap` (9), `outreachSent` (37),
`checklistTicks` (4, 7, 10), `confirmChime` (15), `titleGlitch` (2, 3 frames long).

**`FLASH_HITS`**: the flash-frame words, their offsets and lengths (2–4 frames).

**`SFX`**: absolute cue frames derived from the above. Don't edit these
directly; move the beat or the scene instead.

`T.<scene>` gives `{ from, to, duration }` for any scene; `ACTS` gives the four acts.

## Sound

The soundtrack is original and fully synthesised in code by
`scripts/generate-audio.py` (oscillators, noise, filters, convolution reverb;
no samples, no licensed music) into `public/score.mp3` and `public/sfx/*.mp3`.
Regenerate with `pip install numpy scipy && python3 scripts/generate-audio.py`.

- **Score**: dread drone, heartbeat, accelerating clock ticks and dying
  fluorescent hum (Act 1); hard silence for the blackout; accelerating pulse and
  riser (Act 2) into a bass-drop silence; a warm bloom then a 120 BPM
  Am · F · C · G groove with side-chain pump (Act 3); dark pad turning into a
  wide major resolve, bells and a sub under the title (Act 4). Silent at both
  ends so the loop is clean.
- **SFX**: every cue in `CUES` (`src/audio/AudioSlot.tsx`) reads its frame
  from `SFX` in `src/timeline.ts`, so retiming a scene moves its sounds. The
  score is one track written to the default timing; regenerate it if you retime.
- **Mix**: per-cue volumes plus `MASTER`; the default render peaks at about
  -1.2 dBFS and -16.5 LUFS.

| frame | sound |
|---|---|
| 15 | distorted alarm beeps |
| 45 | low hit on the hard cut |
| 200 | SPENT stamp thud |
| 240, 270 | glitch bursts |
| 300–330 | silence |
| 330 … 387 | percussive hit on every flash frame |
| 437, 450 | balance glitch, glitch-in |
| 462, 474, 486 | glass cracks |
| 513 → 540 | reversed whoosh building into the turn (score silent 530–540) |
| 596, 628 | cursor clicks; 598 typing; 619–625 strike-throughs |
| 630, 660, 725 | iris / tilt-in / zoom swooshes; 635 typing |
| 655 | the period lands |
| 682 … 706 | journey nodes (ascending notes); 712 button pop |
| 744 | tap; 772 "Sent" |
| 780 | whip; 791, 794 chips; 795 card flip |
| 814, 817, 820 | checklist ticks; 825 confirm chime |
| 840 | boom on the cut to black |
| 960 | title hit with shimmer |
| 1022 | glitch stinger |

## Transitions used

| at | transition |
|---|---|
| 45 | hard cut on a sound hit (jolt + exposure kick) |
| 90 | match cut: the 6:00 LED segments morph into the wall clock |
| 135 | hard cut |
| 180 | flicker-out of lights (corridor dies toward camera) |
| 240 | glitch slice displacement (also 450) |
| 300 | cut to blackout |
| 330 | flash frames |
| 510 | ink-bleed mask |
| 540 | light leak bloom (burns out to the UI's off-white) |
| 585 | slide-up |
| 630 | iris / circle mask from the cursor's click |
| 660 | 3D perspective tilt-in |
| 735 | zoom-through into the button |
| 780 | whip pan with directional motion blur |
| 810 | card-stack push |
| 840 | hard cut to black |

## Loop

Frame 0 is black with a whisper of grain. The title fades out by 1073 and the
global grain eases back to that same level (`GRAIN_SEAM` in
`FilmLayers.tsx`), so frame 1079 flows into frame 0.

## Safe zones

Text stays inside 90px of every edge and clear of the bottom 300px and right
140px. `TextColumn` keeps centred copy in a symmetric 140–940px column.
Render with `--props='{"showSafeArea":true}'` (or toggle the prop in the
studio) to see the guides.

## Promo (second composition)

`npx remotion render Promo out/promo.mp4` renders a 30 s upbeat promo
(1080×1920, 120 BPM; one beat = 15 frames) that uses the real app recording in
`public/app/demo.mp4`:

| frames | style | app footage |
|---|---|---|
| 0–150 | original 8-bit platformer: pixel hero, "$" coin blocks on the beat | none |
| 150–390 | comic book: halftone, captions, bubbles, STAGE CLEARED burst | Journey |
| 390–570 | sticker scrapbook: tape, marker loop on "Ask for a repeat", stickers | Jobs |
| 570–720 | pixel boss fight: logging a win lands the final blow | Money, "Add income" view only |
| 720–900 | confetti finale: FourFig wordmark, COMING SOON | none |

Code lives in `src/promo/` (timeline, scenes, pixel/comic/scrapbook/confetti
kits). The recorded status bar is replaced with a clean one, and the Money
tab's test totals are never shown. Music and SFX come from
`scripts/generate-promo-audio.py` (original, synthesised) into `public/promo/`.
