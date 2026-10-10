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
