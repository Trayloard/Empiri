import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';

export const SCENE_DURATIONS = {
  intro: 5500,
  voice: 7500,
  chat: 8000,
  mood: 6000,
  outro: 6000,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  intro: Scene1,
  voice: Scene2,
  chat: Scene3,
  mood: Scene4,
  outro: Scene5,
};

const SCENE_START_SEC: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  let cumulativeMs = 0;
  for (const [key, ms] of Object.entries(SCENE_DURATIONS)) {
    out[key] = cumulativeMs / 1000;
    cumulativeMs += ms;
  }
  return out;
})();

const AUDIO_SEEK_EPSILON_SEC = 0.18;

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  muted = false,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  muted?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '') as keyof typeof SCENE_DURATIONS;
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.45;
    const targetTime = SCENE_START_SEC[baseSceneKey] ?? 0;
    if (Math.abs(audio.currentTime - targetTime) > AUDIO_SEEK_EPSILON_SEC) {
      audio.currentTime = targetTime;
    }
    audio.play().catch(() => {});
  }, [currentSceneKey, baseSceneKey, muted]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0A0A0C] text-white" style={{ fontFamily: 'var(--font-body)' }}>

      {/* Persistent Background Ambient Glow */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <motion.div
          className="absolute rounded-full opacity-[0.35] blur-[100px]"
          style={{
            background: 'radial-gradient(circle, #5B8CFF, transparent 70%)',
            width: '120vw', height: '120vh',
            top: '-30%', left: '-30%'
          }}
          animate={{
            scale: sceneIndex === 1 ? 1.1 : sceneIndex === 3 ? 1.2 : 1,
            opacity: sceneIndex === 1 ? 0.45 : 0.35,
            x: ['0%', '5%', '-5%'],
            y: ['0%', '10%', '-5%']
          }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute rounded-full opacity-[0.25] blur-[120px]"
          style={{
            background: 'radial-gradient(circle, #A855F7, transparent 70%)',
            width: '130vw', height: '130vh',
            bottom: '-40%', right: '-30%'
          }}
          animate={{
            scale: sceneIndex === 1 ? 1.15 : sceneIndex === 3 ? 1.0 : 1,
            opacity: sceneIndex === 1 ? 0.35 : 0.25,
            x: ['0%', '-8%', '5%'],
            y: ['0%', '-5%', '10%']
          }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute rounded-full opacity-[0.2] blur-[130px]"
          style={{
            background: 'radial-gradient(circle, #EC4899, transparent 70%)',
            width: '100vw', height: '100vh',
            top: '30%', left: '10%'
          }}
          animate={{
            scale: [0.9, 1.1, 1],
            x: ['0%', '10%', '-10%'],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Central Persistent Orb Layer (Midground) */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
        animate={{
          width: ['30vw', '25vw', '20vw', '35vw', '25vw'][sceneIndex] || '30vw',
          height: ['30vw', '25vw', '20vw', '35vw', '25vw'][sceneIndex] || '30vw',
          x: ['-50%', '-50%', '50%', '-50%', '-50%'][sceneIndex] || '-50%',
          y: ['-50%', '-25%', '-50%', '-50%', '-70%'][sceneIndex] || '-50%',
          opacity: [0.8, 1, 0.4, 0.9, 0.2][sceneIndex] ?? 0,
          scale: [1, 1.2, 0.8, 1.1, 1][sceneIndex] || 1
        }}
        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="relative w-full h-full">
          {/* Core */}
          <motion.div className="absolute inset-[20%] rounded-full bg-white opacity-80 blur-[20px]"
            animate={{ scale: sceneIndex === 1 ? [0.9, 1.1, 0.9] : [0.95, 1.05, 0.95] }}
            transition={{ duration: sceneIndex === 1 ? 1 : 3, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Blue layer */}
          <motion.div className="absolute inset-[-10%] rounded-full bg-[#5B8CFF] opacity-60 blur-[35px]"
            animate={{ x: ['-5%', '5%', '-5%'], y: ['-5%', '5%', '-5%'] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Purple layer */}
          <motion.div className="absolute inset-[0%] rounded-full bg-[#A855F7] opacity-60 blur-[30px]"
            animate={{ x: ['5%', '-5%', '5%'], y: ['5%', '-5%', '5%'] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Pink layer */}
          <motion.div className="absolute inset-[5%] rounded-full bg-[#EC4899] opacity-50 blur-[25px]"
            animate={{ x: ['-5%', '5%', '-5%'], y: ['5%', '-5%', '5%'] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Orange layer */}
          <motion.div className="absolute inset-[10%] rounded-full bg-[#FB923C] opacity-40 blur-[25px]"
            animate={{ x: ['5%', '-5%', '5%'], y: ['-5%', '5%', '-5%'] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </motion.div>

      <AnimatePresence mode="popLayout">
        {SceneComponent && <SceneComponent key={currentSceneKey} />}
      </AnimatePresence>

      <audio
        ref={audioRef}
        src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`}
        preload="auto"
        autoPlay
        muted={muted}
      />
    </div>
  );
}
