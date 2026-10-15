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

## Explainer (third composition)

`npx remotion render Explainer out/explainer.mp4` renders a 30 s "how FourFig
works" piece in pure motion graphics. No footage: the app's screens are rebuilt
as animated vector UI in its own style (`src/explainer/ui.tsx`).

| frames | beat |
|---|---|
| 0–120 | kinetic hook: "Your side hustle, one step at a time." → lime circle wipe |
| 120–300 | 01 Follow the path: journey nodes check off, current stage lights up, its card lifts out |
| 300–450 | 02 Do the next move: the card becomes a checklist, +XP chips, stage cleared, streak, confetti |
| 450–630 | 03 Turn clients into regulars: save who paid, tap Ask for a repeat, message sends |
| 630–780 | 04 Watch it add up: chart ranges switch, logging a win steps it up, milestone unlocks |
| 780–900 | end card: FourFig, "Your side hustle, mapped.", Coming soon |

Music: `scripts/generate-explainer-audio.py` (original house bed, 120 BPM) →
`public/explainer/music.mp3`. SFX reuse the trailer and promo libraries; cues
live in `src/explainer/ExplainerAudio.tsx` and read `EB` beats.

## Iso (fourth composition)

`npx remotion render Iso out/iso.mp4 --gl=angle` renders an 18 s premium
isometric 3D piece: a single floating diorama tile in a dark void that
builds itself. It is real 3D (Three.js through `@remotion/three`) with an
orthographic camera at 30° elevation and a slow 15° orbit. On a machine with
no GPU, use `--gl=swangle`.

| frames | shot |
|---|---|
| 0–90 | apartment corner, 9:47 PM, only the desk lamp lit, figure slumped · "after work." |
| 90–180 | laptop glows gold, a gold line runs to the first stone, figure sits up and stands |
| 180–330 | a stone lands per step; studio, storefront handoff, mailbox each glow gold; progress rail fills · "one step at a time." |
| 330–450 | towers extrude floor by floor, elevated track lays itself, lamps light in a chain, the monument fills |
| 450–540 | pull back and up, the tile turns a few degrees and rests · FourFig, "your side income, mapped out." |

All timing lives in `src/iso/cues.json`, which both the scene and the audio
script read. Materials and palette are in `src/iso/look.ts`, scene parts in
`src/iso/parts.tsx`, and the camera and figure route in `src/iso/IsoWorld.tsx`.
Sound: `python3 scripts/generate-iso-audio.py` → `public/iso/soundtrack.mp3`
(ambient hum, a stone click per placement, milestone chimes, a building pad and
a resolved D major chord).

## ExplainerVO (narrated explainer)

`npx remotion render ExplainerVO out/explainer-vo.mp4` renders the Explainer
picture with a voiceover. The music drops by about 8 dB under each line, and
captions appear word by word in sync with the voice. Captions are skipped on
the hook and the end card, where the same words are already on screen.

The voice is synthesized with Kokoro-82M (open weights, Apache 2.0) through
`kokoro-onnx`. The script lives in `scripts/generate-voiceover.py`, one clip per
sentence, each fitted inside its scene. Running it writes
`public/voiceover/*.mp3` and the timings in `src/voiceover/vo.json`:

    pip install kokoro-onnx soundfile
    # kokoro-v1.0.onnx + voices-v1.0.bin from huggingface.co/fastrtc/kokoro-onnx
    KOKORO_DIR=/path/to/models python3 scripts/generate-voiceover.py   # VO_VOICE=am_michael for a male voice

| time | line |
|---|---|
| 0.25 s | Your side hustle. One step at a time. |
| 4.25 s | FourFig turns your idea into a simple path, so you always know what's next. |
| 10.25 s | Each stage is a few small moves. Pick a person. Write an offer. Hit send. |
| 15.25 s | When someone pays you, save their name. One tap asks them to book again. |
| 21.25 s | Log every win, and watch it add up. |
| 26.25 s | FourFig. Your side hustle, mapped. |

## Story (brand-new spot, male voiceover)

`npx remotion render Story out/story.mp4` renders a 30 s spot in six art styles,
cut to a male voiceover (Kokoro `am_michael`). The voice drives the edit:
`python3 scripts/generate-voiceover.py story` writes one clip per sentence, and
each scene lasts as long as its lines need. The scene windows go into
`src/story/vo.json`, which picture, captions, sound effects and music all read.
`python3 scripts/generate-story-audio.py` builds the music bed, whose
instrumentation changes at each scene boundary.

| style | voiceover | transition in |
|---|---|---|
| paper cutout, stop motion on twos | "You've got a skill. You design. You fix. You cook. You teach." | (opens) |
| blueprint | "But turning it into a side hustle? Nobody hands you the plan." | torn paper |
| Bauhaus poster | "FourFig does. One clear path, broken into small steps you can actually finish." | iris |
| risograph print | "Find your first client. Make the ask. Get paid. Then do it again." | blinds |
| 70s groovy | "Log every win. Keep your streak. Watch your progress stack up." | sunrise |
| FourFig end card | "FourFig. Your side hustle, mapped." | split |

The delivered copy was loudness-normalized after rendering with
`ffmpeg -i out/story.mp4 -c:v copy -af loudnorm=I=-14:TP=-1.5:LRA=11 -c:a aac -b:a 256k story-14lufs.mp4`.

## Fight (stickman fight, meme format)

`npx remotion render Fight out/fight.mp4` renders a 27 s arcade-style stickman
fight with a twist. The caption "me sending ONE email for my side hustle:" sits
on top while ME fights OVERTHINKING: combos, thought-fireballs ("WHAT IF IT'S
CRINGE"), a grayscale low point, a SEND IT super move and a K.O. Then there's a
hard cut to "what actually happened:", where a guy clicks Send on one email and
the app says Step complete. The deadpan narrator says "It was one email.", and
the end card says "FourFig. We'll walk you through the scary parts."

- `src/fight/rig.tsx`: the stickman rig (forward kinematics) and its pose library
- `src/fight/choreo.ts`: keyframed choreography for both fighters, hits, impact frames, projectiles and beats (`FB`), plus the `BRAND` constant
- `src/fight/Arena.tsx`: the camera (follow, zoom punches, shake), afterimages, sparks, speed lines and HUD
- `src/fight/Reality.tsx`, `src/fight/EndCard.tsx`: the reveal and the end card
- `scripts/generate-fight-audio.py`: the score (drum and bass, low point, comeback, jingle) and all fight sound effects
- `scripts/generate-fight-voice.py`: the announcer (Kokoro `am_fenrir`, pitched down, hall reverb) and the narrator (`am_michael`)

To change the brand name, edit `BRAND` in `choreo.ts`, plus the `end` line in
`generate-fight-voice.py`, then rerun that script.

## WhatIf (gravity simulation)

`npx remotion render WhatIf out/whatif.mp4 --gl=angle` renders a 41 s
"What if" simulation in the low-poly 3D documentary format: what if gravity got
5% weaker every second? On a machine with no GPU, use `--gl=swangle`.

- `src/whatif/timeline.ts`: gravity holds at 100% for 3 s, then drops 5 points a second to zero at 23 s. Air pressure then falls from 31.5 s to 37 s. Also holds the HUD descriptors.
- `src/whatif/sim.ts`: deterministic physics integrated at 60 Hz under g(t): walking and jumping people (at zero g every step lifts them off), ballistic fountain jets, cars launched by speed bumps, falling leaves, river blobs, and balloons that swell and pop as the air thins
- `src/whatif/World.tsx`: the plaza, river, bridge, buildings, live gravity sign, camera path, and a sky that turns black as the air leaves
- `src/whatif/WhatIf.tsx`: serif captions with gold highlight words, plus the GRAVITY and AIR PRESSURE gauges
- `scripts/generate-whatif-voice.py`: narration (Kokoro `bm_george`), each line pinned to the second its number appears
- `scripts/generate-whatif-audio.py`: the score and city ambience, ducked under the voice. The bed is muffled to silence as the air goes, since sound needs air.

## Pov (first person, no narration)

"POV: gravity is switching off". A 66 s first-person piece with no
commentary and almost no text: one opening line, a tiny g and altitude readout,
and one closing line.

1. **Python track:** `python3 scripts/generate-pov-path.py` simulates the viewer and writes `src/pov/track.json`: walking, leaps that grow as g fades (100% at 4 s, 0 at 32 s), the last leap that never lands, then the updraft to about 125 km. It stores the per-frame camera, steps, take-offs and landings, plus head bob and landing shake.
2. **Sound:** `python3 scripts/generate-pov-audio.py` builds `public/pov/bed.mp3` from that same track. It has footsteps, landings, wind (climb speed times air density), the score, city ambience that fades with altitude, breathing and a heartbeat.
3. **Picture:** `src/pov/`:
   - procedural city (about 3,500 buildings, roofs, trees, traffic);
   - an Earth cap on the true curvature;
   - an altitude-aware sky dome, sun and stars;
   - a cloud deck and fly-through puffs;
   - a plaza crowd (`crowd.ts`, `Human.tsx`): 41 articulated people with faces that blink, glance at you and gape as gravity fails. They are simulated together on routes planned clear of every prop, so nobody walks through a cart, a bench, each other or you, and they float off at zero g. Two of them meet your eye: a balloon seller who waves as you pass the cart, and a woman by the river who watches you come down beside her and float away;
   - your arms and legs;
   - debris, wind streaks, motes and landing dust;
   - golden hour with bloom (`Post.tsx`): lit windows, neon edges, LED screens and beacons on the towers, glowing lamps, fairy lights, an LED rail by the river (`Plaza.tsx`);
   - gravity pulses at 0.9 s, 4 s and every further 20% of g (`Spectacle.tsx`): a ripple through the picture, a dust ring and wall rolling out across the city, lights browning out as it passes, a bass hit; a pigeon flock bursting up at the first one; pebbles, leaves and glints lifting off the ground as g fades;
   - an aurora along the curve of the planet and meteors below you at the end (`Space.tsx`);
   - a lens flare hidden behind buildings, chromatic aberration, frost, eyelids and a heartbeat vignette.

Render it in chunks, muted, then add the bed:

    npx remotion render Pov out/pov-a.mp4 --frames=0-659    --muted --gl=angle
    npx remotion render Pov out/pov-b.mp4 --frames=660-1319 --muted --gl=angle
    npx remotion render Pov out/pov-c.mp4 --frames=1320-1979 --muted --gl=angle
    ffmpeg -f concat -safe 0 -i list.txt -i public/pov/bed.mp3 -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k pov.mp4

## Hole (first person, a fall through the Earth)

"POV: you jump into a hole through the Earth". A 72 s first-person piece with
no narration. Short on-screen facts appear as you pass each landmark, with a
live readout of depth, temperature, gravity, speed and the real time since you
jumped.

1. **Physics and track:** `python3 scripts/generate-hole-path.py` integrates the PREM density model. It gives gravity rising to 1.09 g at the core-mantle boundary, a top speed of 35,708 km/h at the centre, and 38 minutes to the far side. It then compresses the fall into the video with depth keys and writes `src/hole/track.json`, which holds:
   - the per-frame camera;
   - the readouts;
   - where each set piece sits along the shaft;
   - tables from the walls' scroll to real depth.

   In the shaft the camera never goes more than 80 m down; the walls scroll past it instead.
2. **Sound:** `python3 scripts/generate-hole-audio.py` builds `public/hole/bed.mp3` from that track. Everything is synthesised:
   - onlookers and their gasp;
   - wind that follows your speed;
   - lamps whipping past;
   - the metro train;
   - crystal chimes in the cave;
   - the mantle's roar;
   - lightning in the core;
   - a silence at the centre;
   - waves, crickets and a guitar by the fire on the island;
   - a score that builds with the fall.
3. **Picture:** `src/hole/`:
   - the shaft and the outer core's cavern are ray-cast on one full-screen quad (`shaftShader.ts`, `Shaft.tsx`). The layers are soil, sedimentary strata, granite, gneiss, olive peridotite with diamonds, blue ringwoodite, the glowing lower mantle, liquid iron and the white-hot inner core. Each layer sits where its real depth falls, it is motion-blurred along the fall, and it is lit by daylight, spiralling service lamps (they die where the rock gets hot) and incandescence;
   - set pieces (`pieces/`): a metro train crossing the shaft just below you, a dinosaur skeleton in the strata, a cave of giant crystals, five lit mine levels, and in the core the magnetic field as glowing loops, lightning, convection plumes, drifting drops of iron and the inner core's crystals;
   - the plaza from the Pov piece with the hole where the fountain was: onlookers watching you (two lean over the rope to see you drop), a DO NOT JUMP sign, your sneakers at the edge and your arms in the dive (`Spectators.tsx`, `HoleBody.tsx`);
   - the far side (`Island.tsx`): a beach at night with the sea under the moon, palms, the Milky Way and a bonfire whose people turn to stare when you pop out;
   - overlays (`Overlay.tsx`): the title, the readout with a cut-away Earth, the fact cards, the white-out at the centre and "would you jump?".

Render it in six chunks of 360 frames, muted, then add the bed (the chunked render needs `--timeout=240000` on software GL):

    npx remotion render Hole out/hole/part-0.mp4 --frames=0-359 --muted --gl=angle
    ...
    ffmpeg -f concat -safe 0 -i list.txt -i public/hole/bed.mp3 -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k hole.mp4

## BlackHole (first person, a fall into Sagittarius A*)

"POV: you fall into a black hole". A 70 s first-person piece with no
narration: the black hole at the centre of our galaxy, ray-traced, seen
through your helmet's visor. The numbers on the HUD come from the
Schwarzschild metric.

1. **Physics and track:** `python3 scripts/generate-bh-path.py` writes `src/blackhole/track.json`:
   - the per-frame camera, in units of the Schwarzschild radius (12.7 million km);
   - your velocity relative to observers hovering where you are, for the aberration;
   - the readouts: distance to the horizon, speed, the thrust it takes to hover (up to 4×10¹³ g a micrometre up), the tidal stretch, your clock and Earth's (8 years go by while you hover for 16 seconds), and the time left to the singularity (66.5 s at most from the horizon).
2. **Sky:** `python3 scripts/generate-bh-sky.py` bakes the galactic-centre sky into a cube map (`public/blackhole/sky_*.jpg`): the Milky Way's band with dust lanes, red streamers of ionised gas, millions of faint stars.
3. **Sound:** `python3 scripts/generate-bh-audio.py` builds `public/blackhole/bed.mp3`. Everything is synthesised:
   - an organ score with an arpeggio that builds into the brake;
   - your breathing in the helmet and your heartbeat;
   - the disk's roar and the thrusters;
   - a clock ticking Earth's time that speeds up into a buzz while you hover;
   - the whine of blueshifted light;
   - the silence when the thrusters cut and the bell at the horizon;
   - the groaning and tearing at the end.
4. **Picture:** `src/blackhole/`:
   - `bhShader.ts` traces each pixel's light ray back through curved spacetime on one full-screen quad. It integrates the orbit equation u'' = 1.5u² − u in the ray's own plane and records each crossing of the disk's plane in a fixed slot, so the texture footprints stay smooth. It shades the thin disk with Doppler and gravitational shifts (orbiting at up to half the speed of light), the lensed far side, the photon ring, and the sky with anisotropically filtered stars. Inside the horizon it draws the gas that fell in ahead of you, streaming in towards the centre;
   - `BHPost.tsx`: bloom, then spaghettification (the picture pulled out along the fall and squeezed across it, with colours splitting) and the tear;
   - `Hud.tsx`: the visor, the status line, the instruments, a top-down map, the fact cards, the title and "would you go in?"; `Suit.tsx`: your arms stretching out ahead of you in the last seconds.

Render it in six chunks of 350 frames, muted (software GL needs `--timeout=240000`), then add the bed:

    npx remotion render BlackHole out/bh/part-0.mp4 --frames=0-349 --muted --gl=angle
    ...
    ffmpeg -f concat -safe 0 -i list.txt -i public/blackhole/bed.mp3 -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k blackhole.mp4

## Pinball (first person, the life of a pinball)

"POV: you're a pinball". An 86.6 s first-person comedy with no voice: a ball's
whole life on a cartoon monster-themed table, from the plunger to the drain,
told in on-screen words and synthesised sound. Then, at 70 s, it cuts with no
warning to a beach where the sea pulls back and a tsunami comes in (the meme
where a video about something else suddenly turns into that).

1. **Physics:** `scripts/pinball_sim.py` simulates a standard playfield tilted 6.5°:
   - a 27 mm steel ball rolling (5/7 g sin θ);
   - walls, the top arch, pop bumpers that kick, slingshots;
   - flippers swung by their solenoids, drop targets, a one-way gate;
   - ball-to-ball collisions for the multiball.
2. **Track:** `python3 scripts/generate-pinball-path.py` writes `src/pinball/track.json`.
   - It plays the story with search-found flips: launch, skill shot, the bumpers, the right flipper up the monster's tongue (a ramp), chomped and held while two more balls launch, burped out, a flipper shot into the jackpot bumper, the player shoves the machine (TILT, the flippers die), down the middle, the drain, the trough, and the eject back into the shooter lane.
   - It maps video time to pinball time: slow motion where it's fast, and a cold-open freeze frame plus a rewind at the start.
   - It also writes the ball-cam's look direction, every ball, the flippers and every event (for picture and sound).
3. **Sound:** `python3 scripts/generate-pinball-audio.py` builds `public/pinball/bed.mp3` (and `out/pinball/bed.wav` for mastering). Everything is synthesised:
   - background music under nearly everything: an island-funk band in F at 128 BPM, all synthesised (drums with swung 16ths, a plucked bass guitar and ukulele from Karplus-Strong strings, clav, horns, and a whistled tune). It stops for the record scratch, goes muffled inside the monster, and tape-stops at the TILT. A sad violin and piano carry it to the next coin, then the groove creeps back in and builds to a drop that never comes;
   - a sound for every physics event, pitched down in the slow motion;
   - the set pieces: the chomp, the chewing, the burp, the multiball siren, the jackpot fanfare, the buzzers, the power-down, a sad trombone, a falling whistle into the trough, the game-over jingle, coins and the eject;
   - the VHS rewind, a time-card jingle, and pops and whooshes for the captions (from `src/pinball/script.json`);
   - the ending, timed from `src/tsunami/cues.json`: surf and gulls, the wash fizzing round your feet, the backwash rattling shells, the whole sea draining away, a low drone, ringing ears and a heartbeat in the zoom, footsteps running past, the rumble and the roar, a braam, strings, choir and taiko, and a hard cut to silence.
4. **Picture:** `src/pinball/`:
   - `art.ts` draws the 4096×8192 playfield print. It has road markings for a reader who is a ball ("YOU GOT THIS", "NO BRAKES", "THE VOID"), printed eyeballs, tentacles and slime, and the baked shadows of everything that stands on it. It also draws the walls' art, a clear-coat scratch tile and the trough's circuit board;
   - `Table.tsx`, `Parts.tsx`, `Monster.tsx`, `Backbox.tsx`, `Dmd.ts`, `Lights.tsx` build the machine. Bumpers, flippers and balls have googly eyes that turn to look at you. The monster's tongue is the ramp and its mouth has an inside. A dot-matrix display tells the story, the lamps run light shows, and the TILT kills the lights;
   - `camera.ts` holds the pose for every frame: the third-person cold open, the ball-cam, the plunger pulling you back, shakes on hits, and a lens that widens with speed;
   - `PinballWorld.tsx` renders the table into a cube from the ball every frame, so the chrome reflects it;
   - `PinPost.tsx` adds motion blur (reprojected from the logarithmic depth buffer), bloom, and grades for the freeze frame, the VHS rewind and the TILT;
   - `Overlay.tsx` draws the few words there are: the title, eight of the ball's thoughts, one fun fact, and "here we go again" (no comic sound words, no stamps, no meme over the cold open).

5. **The ending:** `src/tsunami/` is its own composition (`Tsunami`, 16.6 s), in the 3D style of the other first-person pieces:
   - `world.ts` holds the maths: a crescent bay with headlands and a sandbar, the sea level (a last wash over your feet, then the drawback, 4 m down and 230 m out), the wave (a white line at 2.4 km that grows into a 31 m wall), the camera (looking down at your feet in the wash, the zoom on the horizon, turning round, the whip back) and everyone's paths;
   - `Sea.tsx` rebuilds the sea every frame as one height field from your feet to 16 km out, with rows bunched round you and round the wave's face. Its shader does the see-through shallows and the lace of foam, the glitter, the dark face with the light glowing green through its top, the crest's foam and the spray;
   - `Terrain.tsx` (the sand, the sea floor with ripples, caustics and tide pools, the jungle), `Props.tsx` (palms, the lifeguard tower with its TSUNAMI HAZARD ZONE sign, a sandcastle, a beach ball the sea takes with it, boats that fall over and then ride up the wave, rocks, coral, weed and flopping fish), `People.tsx` (the faced people from `src/pov/Human.tsx`, which can now run, point, wave both arms and sleep), `Gulls.tsx` and `You.tsx` (your feet).

Render the pinball in three chunks of 700 frames and the ending in two, all muted (with software GL use `--gl=swangle --timeout=900000`: each tab takes several minutes to build its textures and compile its shaders), then join them with the concat filter and lay the bed under them:

    npx remotion render Pinball out/pb/part-0.mp4 --frames=0-699 --muted --gl=angle
    ...
    npx remotion render Tsunami out/ts/part-0.mp4 --frames=0-248 --muted --gl=angle
    npx remotion render Tsunami out/ts/part-1.mp4 --frames=249-497 --muted --gl=angle
    ffmpeg -i out/pb/part-0.mp4 -i out/pb/part-1.mp4 -i out/pb/part-2.mp4 -i out/ts/part-0.mp4 -i out/ts/part-1.mp4 -i out/pinball/bed.wav \
      -filter_complex "[0:v][1:v][2:v][3:v][4:v]concat=n=5:v=1:a=0[v]" -map "[v]" -map 5:a -c:v libx264 -crf 18 -c:a aac -b:a 256k pinball.mp4

The delivered cut (83.5 s) is tighter at the start: after the record scratch it holds the freeze frame for only half a second, plays the 1 s VHS rewind, and goes straight to the title. In composition frames it keeps 0-40, 90-119 and 164 onward (the soundtrack at the same times, from 5.45 s for the title's kick, with 6 ms fades at the joins).

## Coaster (first person, a dive coaster with your little sister)

"POV: your little sister wanted the front row". A 72.3 s first-person ride with no voice and almost no
words: a dive coaster at golden hour, front row, with your seven-year-old sister in the seat beside you.
You are terrified; she is bored. She grins in the station, yawns on the lift, blows a bubblegum bubble
while you hang over the vertical drop (it pops on her face as the brake lets go), gives you a deadpan
thumbs-up upside down, gets soaked at the splashdown, and grins at you in the brakes. Then the ride
photo comes up at the exit booth: everyone screaming, you loudest of all, her in the middle with her arms
up, bored, gum all over her face. The camera pushes in on the two of you, you look down at her: "again?".

1. **Track:** `scripts/coaster_track.py` builds track the way coaster designers do, by the forces on the
   riders: a moving frame (along, up, right) turned by an angular rate, with force-vector sections that
   ask for a given g into the seat and sideways at the speed the train will have there, plus yaws,
   pitches, rolls, banked turns and a Bézier closer. `scripts/coaster_layout.py` lays out the ride:
   out of the station onto a chain lift (57 m), a turnaround, the holding brake over a vertical drop,
   a tunnel, an Immelmann, a diving turn, a splashdown trough, a zero-g roll, a swoop over the lake,
   an airtime hop and the brakes back into the station (798.5 m).
2. **Ride:** `python3 scripts/generate-coaster-path.py` writes `src/coaster/track.json`:
   - the train (three rows of six) pushed out by tyres, pulled up the lift by the chain, held 3.4 s
     at the edge, then rolling under gravity with rolling resistance and drag, slowed by the water in
     the trough and stopped by the magnetic brakes (32 m/s at the bottom, 4.5 g in the pull-outs, -1 g
     of airtime);
   - per frame: where the front row is, its speed and the g's it feels, and the moments (cues) the
     picture and the sound are timed from;
   - the supports: columns and arms placed clear of the track and each other, piers in the lake;
   - the site: the lake, the cut the tunnel runs through.
3. **Sound:** `python3 scripts/generate-coaster-audio.py` builds `public/coaster/bed.mp3` (and
   `out/coaster/bed.wav` for mastering), all synthesised: a festival track in F minor at 128 BPM muffled
   through the station's speakers, opening up and building all the way up the lift (the chain's
   ratchet clacks in time), stopping dead at the holding brake, and dropping with the train; wind and
   wheel roar from the speed, the tunnel, the splash, screams behind you, the bubble stretching and
   popping, the camera flash, the brakes tape-stopping the song, and the ending's ding and marimba.
4. **Picture:** `src/coaster/`:
   - `track.ts` and `world.ts` read the ride and hold the timing: where you look (your sister, the drop,
     her again upside down...), your head pushed about by the g's, the lens widening with speed;
   - `Track3D.tsx` (rails with worn tops, the spine, ties, the chain, the brakes, the supports),
     `Train.tsx` (cars, seats, vest restraints that come down in the station), `Station.tsx` (the
     building, gates, the floor that drops away, people in the queue, the operator's thumbs-up),
     `Terrain.tsx`, `Rides.tsx` (a Ferris wheel, a drop tower, swings, a carousel, a pirate ship, a
     wooden coaster, water slides), `Scenery.tsx` (trees, lamps, stalls, the crowd, the car park, hills
     and a city), `Effects.tsx` (the splashdown: foam thrown from the scoop with air drag into two walls,
     a bow burst and rain over the front rows; the on-ride camera and its flash);
   - `face/` builds the faces: a sculpted head that deforms per frame for expressions (jaw, smile,
     squint, brows, lids, pucker, chewing), eyes behind lids cut from the skin, an open mouth with teeth
     and tongue, strand brows and lashes, painted skin with freckles, and the popped bubblegum as a
     glossy film on her skin; `Rider.tsx` and `Person3D.tsx` give them bodies, hands and hair that swings
     with the g's (`dynamics.ts`), and `riders.ts` scripts everyone's face, look and arms;
   - `CoasterPost.tsx` adds motion blur from the camera's movement (riders masked out), bloom, water
     drops on the lens after the splash, the flash and the grey-out at high g;
   - `Ending.tsx` is the exit booth and the photo on its screen, and `Overlay.tsx` the only words: the
     title and "again?".
5. **The ride photo** is its own still (`CoasterPhoto`, the on-ride camera on its mast at the bottom of
   the drop, with your face in it), rendered once and shown on the booth's screen:

       npx remotion still CoasterPhoto out/coaster/photo.png --scale=2 --gl=angle
       python3 scripts/coaster-photo.py out/coaster/photo.png   # public/coaster/photo.jpg, with the ride's badge

Render in four chunks, muted (with software GL use `--gl=swangle --timeout=900000`; there a frame takes
6-9 s per tab, so rendering to a JPEG sequence with `--sequence --image-format=jpeg` lets an interrupted
run pick up where it stopped), join them and lay the bed under them, mastered to -15 LUFS:

    npx remotion render Coaster out/coaster/part-0.mp4 --frames=0-542 --muted --gl=angle
    npx remotion render Coaster out/coaster/part-1.mp4 --frames=543-1085 --muted --gl=angle
    npx remotion render Coaster out/coaster/part-2.mp4 --frames=1086-1628 --muted --gl=angle
    npx remotion render Coaster out/coaster/part-3.mp4 --frames=1629-2169 --muted --gl=angle
    ffmpeg -i out/coaster/part-0.mp4 -i out/coaster/part-1.mp4 -i out/coaster/part-2.mp4 -i out/coaster/part-3.mp4 -i out/coaster/bed.wav \
      -filter_complex "[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0[v];[4:a]volume=5.2dB,alimiter=limit=0.6:attack=5:release=60:level=disabled[a]" \
      -map "[v]" -map "[a]" -c:v libx264 -crf 18 -c:a aac -b:a 256k coaster.mp4

## Wedding (first person, the drone carrying the wedding rings)

"POV: you're the drone carrying the wedding rings". A 72 s first-person flight with no voice and no
words but the title: a lakeside wedding at golden hour, seen from a drone a nine-year-old ring bearer is
flying (tongue out, his golden retriever beside him), the ring box swinging under it on a satin ribbon.
Liftoff, eye to eye with the kid, then the reveal of the ceremony; down the aisle while the guests hold up
their phones; the groom reaches for the box and it yanks away; it dips over the guests (a hat flips off
over the lens), hovers in the officiant's face in total silence, turns to the groom's glare and the
bride's awkward little wave, then goes full throttle straight up into the sunset. It dives at the tent
past a spinning waiter, threads the tables, buzzes the DJ, swings under the chandelier, and goes, in
slow motion, through the champagne tower and into the cake. The feed breaks up. When it comes back, the
camera is lying in the cake with frosting on the lens and faces leaning in over it: the baker (who
faints), the bride, the groom, the kid. The groom glares at the kid, digs the ribbon out of the cake and
holds it up to the lens: nothing on it. The kid points; the camera turns: the dog, on a chair at the
cake table, frosting on its nose, the ring box in its mouth. It tilts its head.

1. **Flight:** `python3 scripts/generate-wedding-path.py` writes `src/wedding/flight.json`:
   - the venue's layout (the lake shore, the arch, the aisle and its rows of chairs, who sits where, the
     tent and its tables, the champagne tower, the cake, the dog's chair at the end);
   - the drone's path, keyed in world time and interpolated monotone (pchip), with video time mapped
     onto world time through two slow-motion windows (the tower at 0.12x, the cake at 0.15x) and a jump
     while the feed is black; the camera's FPV roll from the drone's lateral acceleration, the ring box
     as a damped pendulum on its ribbon, the lens wide in the cake, then the zoom onto the dog;
   - every cue the picture and the sound are timed from, in video and in world time;
   - a clearance report: the drone and the box against every head, chair, pole and glass they must
     miss.
2. **Sound:** `python3 scripts/generate-wedding-audio.py` builds `public/wedding/bed.mp3` (and
   `out/wedding/bed.wav` for mastering), all synthesised: a string quartet playing Pachelbel's Canon in D
   (tempo set so its second and third times round land on the reveal and the couple), slipping and
   losing its place as the drone misbehaves, stopping dead at the officiant (a cricket, a cough, grandma
   losing it); the props' buzz from the thrust the path needs, the wind from its speed; a riser into the
   DJ's house remix of the canon at the top of the climb, the air horn, the chandelier's crystals; the
   slow motion as tape at half speed with a heartbeat, the tower shattering, the cake's splat and the
   music dying in it; the props clogged and winding down, the feed's glitch; then the hush round the
   cake through the frosting, the baker going down, the digging, the gimbal whirring round, an
   orchestra hit on the zoom, the dog's little "hm?", the room's "aww" and the canon's last cadence.
3. **Picture:** `src/wedding/`:
   - `flight.ts` reads the flight (camera, box, cues, world time per frame);
   - `Sky.tsx`, `Land.tsx` (the lake with the mountains reflected in it, the mountains, the striped lawn,
     the balustrade, cypresses and olives, vines, the villa), `Flowers.tsx`, `Ceremony.tsx` (the arch
     with its chiffon and roses, gold chairs, urns, the runner and petals, lanterns), `Tent.tsx` (roof,
     valance, poles, floors, tables laid for dinner, festoons, the chandelier, the DJ booth), `Treats.tsx`
     (the champagne tower and the four-tier cake);
   - `Figure.tsx` gives everyone a body (outfits painted onto the torso, skirts and the gown with its
     train, the bride's veil, two-bone arms with hands, props: phones, the officiant's book, the bottle,
     the baker's spatula, the waiter's tray), with the sculpted heads from `src/coaster/face/`;
     `cast.ts` is who they are and what they wear, and `People.tsx` scripts every face, look and arm:
     the guests watching, ducking and filming, the couple, the officiant, the staff, and the ending;
   - `Dog.tsx` (the golden retriever with its bow tie, the ring box), `Drone.tsx` (the prop guards in the
     corners of the picture, the box on its ribbon, the grass blown flat), `Effects.tsx` (the tower's
     glasses breaking tier by tier and the champagne, the cake bursting, what's left of it, the hat);
   - `WeddingPost.tsx` adds motion blur, bloom, the lens's barrel distortion, champagne drops on it, the
     frosting and the feed breaking up; `Overlay.tsx` is the title.

The render is long under software GL (`--gl=swangle`, 20-35 s a frame per process), so bundle once and
render a resumable JPEG sequence in batches (each pass renders only the frames not yet on disk), then lay
the bed under it, mastered to -15 LUFS:

    npx remotion bundle --out-dir=out/wedding/bundle
    npx remotion render out/wedding/bundle Wedding out/wedding/frames --sequence --image-format=jpeg \
      --jpeg-quality=95 --frames=0-539 --gl=swangle --timeout=900000 --concurrency=1   # and so on to 2159
    ffmpeg -framerate 30 -i out/wedding/seq/f%04d.jpeg -i out/wedding/bed.wav \
      -af "acompressor=threshold=-26dB:ratio=2.2:attack=25:release=350:knee=6,volume=9.8dB,alimiter=limit=0.89:attack=5:release=60:level=disabled" \
      -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -b:a 256k wedding.mp4

(`out/wedding/seq/` holds the frames renamed to `f0000.jpeg`...: Remotion pads the names to the length
of each range's last frame.)

## Looks (first person, the school photographer in the looksmaxing era)

"POV: you're the school photographer in the looksmaxing era". A 70 s first-person video with no voice
and no words but the title (and a yearbook's): picture day in the school gym, seen through the camera on
its tripod. One kid after another walks in from the line, sits on the stool, the focus locks on his face,
the photographer's hand gestures "chin up" in front of the lens, and the kid does "the face" — and every
time, in his head, it's a sigma edit: the picture drains to a cold black and white, slows to 0.38x,
letterboxes, kicks and shakes on the beat of a drift-phonk drop while the camera turns into a music-video
camera (low, pushing in, tilted). Then the FLASH, and the photo as it actually came out, held as a print:
the mewer's jaw jutting like a bulldog's, hunter eyes shut, the gum kid caught mid-chew, glass skin a
white glare, the one normal kid's perfect smile (no edit for her), the height-maxer up on the stool in
lift shoes caught mid-wobble (then over he goes, and up again with a thumbs-up), and the mogger, who
walks in in slow motion with his friend's leaf blower in his hair, takes off his sunglasses, flips his
hair — and it lands over his face as the blower dies. Then the photographer lifts the camera off the
tripod, whips it round to his own face, checks nobody's looking, does the face — and the friend with the
leaf blower gets his comb-over. The yearbook: all of them, a "no photo" silhouette for the friend, and a
slow zoom onto the photographer's own.

1. **Timeline:** `python3 scripts/generate-looks-timeline.py` writes `src/looks/timeline.json`: every
   beat of every kid in video seconds and in world seconds (world time slows to 0.38x in each edit and
   stops while a photo is held), and per frame the world time, the edit amount and the hold.
2. **Sound:** `python3 scripts/generate-looks-audio.py` builds `public/looks/bed.mp3` (and
   `out/looks/bed.wav` for mastering), all synthesised: the gym (its tone, chatter down the far end,
   sneakers, a ball, a whistle); a cheesy picture-day ukulele and glockenspiel bed that tape-stops into
   every edit and picks up where it stopped; the edits' drift phonk (a distorted 808, the cowbell riff,
   hats, claps, a dark pad; it warbles when the height-maxer wobbles), cut dead by each flash: the strobe's
   pop, the shutter, the flash whining as it recharges; footsteps (lift shoes clunk), the stool, the lens
   zooming, the focus beeps, the gum's chewing slowed down in the edit, the leaf blower (slowed with the
   world, then sputtering out), and each photo's sting: a sad trombone, one cricket, a squelch, a glint,
   a warm ding, the stool crashing over and a slide whistle, a record scratch.
3. **Picture:** `src/looks/`:
   - `Gym.tsx` (the maple court, cinderblock walls in the school colours, pads, trusses and lamps,
     bleachers, hoops, the mottled backdrop, the posing stool with its footrest, softboxes, the laptop
     table) and `LooksWorld.tsx` (the softboxes as area lights with a shadow-casting spot in the key,
     a hair light that turns cold and hard in the edits, the strobes on the flash);
   - the people: the wedding's `Figure.tsx` with a portrait bust (sloped shoulders, a real neck, collars,
     hoods and chains draped on the body) and the coaster's sculpted heads made for close-ups (rounder
     crania, square jaws, bigger ears, lips with a cupid's bow, a lash line, the lid's shadow on the eye,
     glass skin, braces, a jaw that juts); `Hair.tsx` grows real haircuts from hair cards over the scalp
     (a textured crop, twists, curtains, a bowl cut, the flow that blows back and flips, a ponytail, a bun
     with a pencil, the comb-over that lifts into a fin) lit with a strand highlight; `cast.ts` is who
     they are, `Kids.tsx` what each of them does and when, `Props.tsx` the leaf blower, the sunglasses,
     the clipboard and the glare;
   - `camera.ts` is the camera's direction; `LooksPost.tsx` the lens (half-resolution depth of field,
     motion blur, bloom, FXAA) and the grade (the edit, the flash, the print on a dark table);
     `Overlay.tsx` the title, the viewfinder and the yearbook page (its photos are stills of the holds,
     `public/looks/photo-*.jpg`).

The render under software GL (`--gl=swangle`) takes about 3 s a frame: bundle once, render a resumable
JPEG sequence in batches, then lay the bed under it, mastered to -15 LUFS:

    npx remotion bundle --out-dir=out/looks/bundle
    npx remotion render out/looks/bundle Looks out/looks/frames --sequence --image-format=jpeg \
      --jpeg-quality=95 --frames=0-524 --gl=swangle --timeout=900000 --concurrency=1   # and so on to 2099
    ffmpeg -framerate 30 -i out/looks/seq/f%04d.jpeg -i out/looks/bed.wav \
      -af "acompressor=threshold=-26dB:ratio=2.2:attack=25:release=350:knee=6,volume=9.8dB,alimiter=limit=0.89:attack=5:release=60:level=disabled" \
      -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -b:a 256k looks.mp4

To refresh the yearbook's photos after a change, render the holds with `{"still": 1}` (no print, no
flash, no viewfinder) and crop them to 4:5.
