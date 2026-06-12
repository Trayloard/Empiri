import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),
      setTimeout(() => setPhase(2), 2200),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-20"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 1.2 }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0C] to-transparent opacity-60" />
      
      <motion.div className="relative z-30 text-center mt-[20vh]">
        <motion.h1 
          className="text-[5vw] font-bold tracking-tight text-white leading-tight"
          initial={{ opacity: 0, y: 40, filter: 'blur(15px)' }}
          animate={phase >= 1 ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 0, y: 40, filter: 'blur(15px)' }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        >
          A new kind of<br />presence.
        </motion.h1>
        
        <motion.p 
          className="text-[2vw] text-white/50 mt-6 font-medium"
          initial={{ opacity: 0, filter: 'blur(10px)' }}
          animate={phase >= 2 ? { opacity: 1, filter: 'blur(0px)' } : { opacity: 0, filter: 'blur(10px)' }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        >
          Meet Empiri.
        </motion.p>
      </motion.div>
    </motion.div>
  );
}