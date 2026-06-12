import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 600), // input appears
      setTimeout(() => setPhase(2), 1500), // user sends
      setTimeout(() => setPhase(3), 2500), // assistant typing
      setTimeout(() => setPhase(4), 4000), // assistant responds
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center px-[10vw] z-20"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="w-[45vw] flex flex-col justify-end h-[60vh] gap-6 pb-[10vh]">
        
        {/* User Message */}
        {phase >= 2 && (
          <motion.div 
            className="self-end max-w-[80%]"
            initial={{ opacity: 0, y: 20, scale: 0.9, originX: 1, originY: 1 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            <div className="bg-gradient-to-br from-[#5B8CFF] to-[#A855F7] px-6 py-4 rounded-3xl rounded-br-sm shadow-[0_0_20px_rgba(91,140,255,0.2)] border border-[#8CAAFF]/30">
              <p className="text-[1.5vw] text-white font-medium">I had a really long day today. Just feeling drained.</p>
            </div>
          </motion.div>
        )}

        {/* Assistant Typing / Response */}
        {phase >= 3 && (
          <motion.div 
            className="self-start max-w-[85%]"
            initial={{ opacity: 0, y: 20, scale: 0.9, originX: 0, originY: 1 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            <div className="bg-white/5 border border-white/10 backdrop-blur-2xl px-6 py-4 rounded-3xl rounded-bl-sm">
              {phase === 3 ? (
                <div className="flex gap-2 items-center py-2 h-[1.5vw]">
                  <motion.div className="w-[0.6vw] h-[0.6vw] rounded-full bg-white/50" animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0 }} />
                  <motion.div className="w-[0.6vw] h-[0.6vw] rounded-full bg-white/50" animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }} />
                  <motion.div className="w-[0.6vw] h-[0.6vw] rounded-full bg-white/50" animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }} />
                </div>
              ) : (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[1.5vw] text-white/90 font-medium leading-relaxed">
                  I'm sorry to hear that. I'm right here. Want to just vent about it?
                </motion.p>
              )}
            </div>
          </motion.div>
        )}
      </div>
      
      {/* Input Bar (mock) */}
      <motion.div 
        className="absolute bottom-[8vh] left-[10vw] w-[45vw] h-[6vh] bg-white/5 border border-white/10 backdrop-blur-2xl rounded-full flex items-center px-6 gap-4"
        initial={{ opacity: 0, y: 30 }}
        animate={phase >= 1 ? { opacity: phase >= 2 ? 0.6 : 1, y: 0 } : { opacity: 0, y: 30 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="w-6 h-6 rounded-full border border-white/30 flex items-center justify-center">
          <div className="w-3 h-3 bg-white/30 rounded-sm" />
        </div>
        <p className="text-[1.2vw] text-white/30 flex-1">
          {phase === 1 ? "I had a really long day today..." : "Message Empiri..."}
        </p>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#5B8CFF] to-[#A855F7] flex items-center justify-center opacity-80">
          <div className="w-3 h-3 border-t-2 border-r-2 border-white rotate-[-45deg] -mb-1" />
        </div>
      </motion.div>

      {/* Decorative floating text */}
      <motion.div 
        className="absolute right-[15vw] top-[40vh]"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.2, duration: 1 }}
      >
        <h2 className="text-[3.5vw] font-bold leading-tight tracking-tight">
          A conversation<br />that flows.
        </h2>
      </motion.div>
    </motion.div>
  );
}