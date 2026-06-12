import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000),
      setTimeout(() => setPhase(2), 2200),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-30"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.5 }}
    >
      {/* Background vignette for text readability */}
      <div className="absolute inset-0 bg-black/40" />

      <motion.div 
        className="relative flex flex-col items-center"
        initial={{ scale: 0.9, opacity: 0, filter: 'blur(20px)' }}
        animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="text-[8vw] font-extrabold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-[#5B8CFF] via-[#A855F7] to-[#EC4899] z-10 relative">
          Empiri
        </h1>
        
        {/* Glow behind wordmark */}
        <motion.div
          className="absolute -inset-10 bg-white/10 blur-[40px] rounded-full -z-0"
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>
      
      <motion.p 
        className="text-[2.2vw] text-white mt-4 font-semibold tracking-wide"
        initial={{ opacity: 0, y: 20 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 1, ease: 'easeOut' }}
      >
        The AI companion that lives.
      </motion.p>
      
      <motion.div
        className="mt-[10vh] px-8 py-3 rounded-full border border-white/20 bg-white/5 backdrop-blur-md"
        initial={{ opacity: 0, y: 20 }}
        animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 1, ease: 'easeOut' }}
      >
        <span className="text-[1.2vw] text-white/80 font-medium tracking-widest uppercase">AVAILABLE NOW</span>
      </motion.div>
    </motion.div>
  );
}