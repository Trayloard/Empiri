import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500), // listening
      setTimeout(() => setPhase(2), 2500), // thinking
      setTimeout(() => setPhase(3), 4000), // speaking
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const getStatusText = () => {
    if (phase === 0) return "";
    if (phase === 1) return "Listening...";
    if (phase === 2) return "Thinking...";
    return "Speaking...";
  };

  const getStatusColor = () => {
    if (phase === 2) return "#A855F7"; // purple for thinking
    if (phase === 3) return "#EC4899"; // pink for speaking
    return "#5B8CFF"; // blue for listening
  };

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-end pb-[15vh] z-20"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
    >
      <motion.div 
        className="text-[2vw] font-medium tracking-wide"
        style={{ color: getStatusColor() }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        {getStatusText()}
      </motion.div>
      
      {/* Sound waves visualization during listening/speaking */}
      {phase >= 1 && (
        <div className="flex items-center justify-center gap-3 mt-6 h-12">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div 
              key={i}
              className="w-1.5 rounded-full"
              style={{ backgroundColor: getStatusColor() }}
              initial={{ height: 4 }}
              animate={{ 
                height: phase === 2 ? 8 : [4, 15 + Math.random() * 25, 4], // calm when thinking, active when listening/speaking
                opacity: phase === 2 ? 0.5 : 1
              }}
              transition={{ 
                duration: phase === 2 ? 1 : 0.3 + Math.random() * 0.2, 
                repeat: Infinity, 
                delay: phase === 2 ? 0 : i * 0.05 
              }}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}