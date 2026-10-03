import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { AudioSlot } from "./audio/AudioSlot";
import { FilmLayers } from "./components/FilmLayers";
import { SafeAreaGuides } from "./components/SafeAreaGuides";
import { SceneId, T } from "./timeline";
import { SceneProps } from "./scenes/types";
import { Act1Alarm } from "./scenes/Act1Alarm";
import { Act1EveryMorning } from "./scenes/Act1EveryMorning";
import { Act1SameCommute } from "./scenes/Act1SameCommute";
import { Act1SameDesk } from "./scenes/Act1SameDesk";
import { Act1Spent } from "./scenes/Act1Spent";
import { Act1SameLife } from "./scenes/Act1SameLife";
import { Act1Blackout } from "./scenes/Act1Blackout";
import { Act2FlashWords } from "./scenes/Act2FlashWords";
import { Act2Balance } from "./scenes/Act2Balance";
import { Act2CrackedClock } from "./scenes/Act2CrackedClock";
import { Act2InkBleed } from "./scenes/Act2InkBleed";
import { Act3StillWaiting } from "./scenes/Act3StillWaiting";
import { Act3Search } from "./scenes/Act3Search";
import { Act3LookNoFurther } from "./scenes/Act3LookNoFurther";
import { Act3Journey } from "./scenes/Act3Journey";
import { Act3Outreach } from "./scenes/Act3Outreach";
import { Act3Progress } from "./scenes/Act3Progress";
import { Act3Checklist } from "./scenes/Act3Checklist";
import { Act4AlarmGold } from "./scenes/Act4AlarmGold";
import { Act4WakeUp } from "./scenes/Act4WakeUp";
import { Act4Title } from "./scenes/Act4Title";
import { Act4TitleGlitch } from "./scenes/Act4TitleGlitch";
import { Act4FadeOut } from "./scenes/Act4FadeOut";

export type TeaserProps = {
  /** Overlay the platform safe zones (dev only). */
  showSafeArea: boolean;
};

/** Scene id → component. Frame ranges live in src/timeline.ts. */
const SCENES: Record<SceneId, React.FC<SceneProps>> = {
  alarm: Act1Alarm,
  everyMorning: Act1EveryMorning,
  sameCommute: Act1SameCommute,
  sameDesk: Act1SameDesk,
  spent: Act1Spent,
  sameLife: Act1SameLife,
  blackout: Act1Blackout,
  flashWords: Act2FlashWords,
  balance: Act2Balance,
  crackedClock: Act2CrackedClock,
  inkBleed: Act2InkBleed,
  stillWaiting: Act3StillWaiting,
  search: Act3Search,
  lookNoFurther: Act3LookNoFurther,
  journey: Act3Journey,
  outreach: Act3Outreach,
  progress: Act3Progress,
  checklist: Act3Checklist,
  alarmGold: Act4AlarmGold,
  wakeUp: Act4WakeUp,
  title: Act4Title,
  titleGlitch: Act4TitleGlitch,
  fadeOut: Act4FadeOut,
};

export const Teaser: React.FC<TeaserProps> = ({ showSafeArea }) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    {(Object.keys(SCENES) as SceneId[]).map((id) => {
      const Scene = SCENES[id];
      return (
        <Sequence key={id} name={id} from={T[id].from} durationInFrames={T[id].duration}>
          <Scene duration={T[id].duration} />
        </Sequence>
      );
    })}
    <FilmLayers />
    <AudioSlot />
    {showSafeArea ? <SafeAreaGuides /> : null}
  </AbsoluteFill>
);
