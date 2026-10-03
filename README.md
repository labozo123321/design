# Teaser (vertical horror-to-UI trailer)

A 36 second, 1080×1920, 30 fps teaser trailer built entirely in code with
[Remotion](https://www.remotion.dev): shapes, gradients, SVG filters, CSS and
text. No footage, no images, no music in the repo.

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
(CRF 23, grain held for 2 frames, BT.709) give a master of roughly 150 MB.
Pass `--crf=18` for a heavier master or `--crf=26` for a lighter upload. Grain
strength per act lives in `GRAIN_KEYS` (`src/components/FilmLayers.tsx`); grain
size and its frame hold are props on `<Grain/>`.

## File tree

```
.
├── package.json
├── remotion.config.ts          render defaults (h264, CRF 23, BT.709)
├── tsconfig.json
├── public/
│   ├── score.mp3               (you add it) optional score
│   └── sfx/                    (you add them) optional sound effects
└── src/
    ├── index.ts                registerRoot
    ├── Root.tsx                <Composition id="Teaser" …>
    ├── Teaser.tsx              scene list → <Sequence>s, film layers, audio slot
    ├── timeline.ts             ★ every frame number: scenes, beats, SFX cues
    ├── theme.ts                APP_NAME, palette, safe zones
    ├── fonts.ts                @remotion/google-fonts loading
    ├── audio/
    │   └── AudioSlot.tsx       commented-out <Audio> slot + cue sheet
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

## Sound (optional)

`src/audio/AudioSlot.tsx` holds a commented-out `<Audio>` for
`public/score.mp3` (with volume automation: silent through the 300–330
blackout and the 530–540 bass drop) plus one commented `<Sequence><Audio/></Sequence>`
per cue. Uncomment the two imports at the top and the elements you need.

| frame | file | cue |
|---|---|---|
| 15 | sfx/alarm-beep-distorted.mp3 | alarm beep, distorted |
| 45 | sfx/hit-cut.mp3 | (optional) hit on the hard cut |
| 200 | sfx/thud-heavy.mp3 | SPENT stamp, heavy thud |
| 240 | sfx/glitch-in.mp3 | (optional) glitch slice transition |
| 270 | sfx/glitch-forever.mp3 | (optional) "same life. forever." |
| 300–330 | none | silence |
| 330, 339, 347, 354, 360, 366, 371, 375, 379, 382, 385, 387 | sfx/hit-1…4.mp3 | percussive hit per flash frame |
| 462, 474, 486 | sfx/crack.mp3 | (optional) glass crack bursts |
| 530–540 | none | bass drop silence |
| 538 | sfx/whoosh-reversed.mp3 | reversed whoosh |
| 655 | sfx/click.mp3 | the period lands |
| 744 | sfx/tap.mp3 | (optional) cursor tap |
| 780 | sfx/whip.mp3 | (optional) whip pan |
| 825 | sfx/chime-confirm.mp3 | confirm chime |
| 1022 | sfx/glitch-stinger.mp3 | glitch stinger |

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
