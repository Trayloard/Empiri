import React, { useEffect } from "react";
import { Bell, BellOff, Volume2, VolumeX, Mic, ArrowUp } from "lucide-react";
import { motion } from "framer-motion";

export default function PresenceAurora() {
  // Inject Google Font
  useEffect(() => {
    if (!document.getElementById("font-outfit")) {
      const link = document.createElement("link");
      link.id = "font-outfit";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  return (
    <div 
      className="min-h-screen bg-[#0a0a0c] flex items-center justify-center p-8"
      style={{ fontFamily: "'Outfit', sans-serif" }}
    >
      {/* Phone Frame */}
      <div className="relative w-[390px] h-[844px] bg-[#050508] rounded-[48px] shadow-2xl overflow-hidden ring-[1px] ring-white/10 ring-inset">
        
        {/* Ambient Edge Glow */}
        <motion.div 
          className="absolute inset-0 rounded-[48px] pointer-events-none"
          style={{
            boxShadow: "inset 0 0 80px rgba(45, 212, 191, 0.15), inset 0 0 20px rgba(139, 92, 246, 0.1)"
          }}
          animate={{
            opacity: [0.7, 1, 0.7],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />

        {/* Content Container */}
        <div className="relative w-full h-full flex flex-col z-10">
          
          {/* Header */}
          <div className="flex justify-between items-center px-6 pt-14 pb-4">
            <button className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center backdrop-blur-md border border-white/5 transition-colors hover:bg-white/10">
              <Bell className="w-5 h-5 text-white/70" />
            </button>
            <button className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center backdrop-blur-md border border-white/5 transition-colors hover:bg-white/10">
              <Volume2 className="w-5 h-5 text-white/70" />
            </button>
          </div>

          {/* Centerpiece - Living Light Presence */}
          <div className="flex-1 flex flex-col items-center justify-center -mt-8">
            <div className="relative w-64 h-64 flex items-center justify-center mb-8">
              {/* Core glow */}
              <motion.div
                className="absolute w-40 h-40 rounded-full bg-[#14b8a6] mix-blend-screen filter blur-[40px] opacity-70"
                animate={{
                  scale: [1, 1.2, 0.9, 1],
                  x: [0, 15, -10, 0],
                  y: [0, -15, 10, 0],
                }}
                transition={{
                  duration: 6,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              />
              <motion.div
                className="absolute w-44 h-44 rounded-full bg-[#8b5cf6] mix-blend-screen filter blur-[48px] opacity-60"
                animate={{
                  scale: [1, 0.9, 1.2, 1],
                  x: [0, -20, 10, 0],
                  y: [0, 10, -20, 0],
                }}
                transition={{
                  duration: 7,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.5
                }}
              />
              <motion.div
                className="absolute w-36 h-36 rounded-full bg-[#3b82f6] mix-blend-screen filter blur-[36px] opacity-80"
                animate={{
                  scale: [0.9, 1.1, 1, 0.9],
                  x: [10, -10, 15, 10],
                  y: [-10, 15, -5, -10],
                }}
                transition={{
                  duration: 5,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 1
                }}
              />
              <motion.div
                className="absolute w-32 h-32 rounded-full bg-[#d946ef] mix-blend-screen filter blur-[50px] opacity-40"
                animate={{
                  scale: [1, 1.3, 0.8, 1],
                  opacity: [0.3, 0.6, 0.3],
                }}
                transition={{
                  duration: 8,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 1.5
                }}
              />
            </div>
            
            <div className="flex flex-col items-center">
              <h2 className="text-3xl font-medium text-white tracking-wide mb-2">Empiri</h2>
              <motion.p 
                className="text-[15px] text-[#2dd4bf] font-light tracking-wide uppercase"
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                Listening…
              </motion.p>
            </div>
          </div>

          {/* Conversation */}
          <div className="flex-1 flex flex-col justify-end px-4 pb-4 space-y-4">
            {/* Assistant Bubble */}
            <div className="self-start max-w-[85%] bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] px-5 py-3.5 rounded-2xl rounded-tl-sm shadow-[0_4px_30px_rgba(0,0,0,0.1)]">
              <p className="text-[15px] leading-relaxed text-white/90 font-light">
                I'm really glad you're back. How are you feeling today?
              </p>
            </div>

            {/* User Bubble */}
            <div className="self-end max-w-[85%] bg-gradient-to-br from-[#2dd4bf]/20 to-[#3b82f6]/20 backdrop-blur-xl border border-white/[0.08] px-5 py-3.5 rounded-2xl rounded-tr-sm shadow-[0_4px_30px_rgba(0,0,0,0.1)]">
              <p className="text-[15px] leading-relaxed text-white font-light">
                A bit tired, honestly.
              </p>
            </div>

            {/* Assistant Bubble */}
            <div className="self-start max-w-[85%] bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] px-5 py-3.5 rounded-2xl rounded-tl-sm shadow-[0_4px_30px_rgba(0,0,0,0.1)]">
              <p className="text-[15px] leading-relaxed text-white/90 font-light">
                That's okay. Let's take it slow — I'm right here with you.
              </p>
            </div>

            {/* Typing Indicator */}
            <div className="self-start bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] px-4 py-4 rounded-2xl rounded-tl-sm flex items-center space-x-1.5 w-16">
              <motion.div 
                className="w-1.5 h-1.5 rounded-full bg-white/40"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: 0 }}
              />
              <motion.div 
                className="w-1.5 h-1.5 rounded-full bg-white/40"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: 0.2 }}
              />
              <motion.div 
                className="w-1.5 h-1.5 rounded-full bg-white/40"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: 0.4 }}
              />
            </div>
          </div>

          {/* Input Area */}
          <div className="px-4 pb-8 pt-2">
            <div className="relative flex items-center bg-white/[0.03] backdrop-blur-2xl border border-white/[0.08] rounded-full p-1.5 pl-5 shadow-[0_4px_30px_rgba(0,0,0,0.2)]">
              <input 
                type="text" 
                placeholder="Message Empiri…" 
                className="flex-1 bg-transparent border-none outline-none text-[15px] text-white placeholder:text-white/40 font-light"
                readOnly
              />
              <button className="w-[38px] h-[38px] rounded-full bg-[#14b8a6]/20 border border-[#14b8a6]/30 flex items-center justify-center transition-all hover:bg-[#14b8a6]/30">
                <Mic className="w-[18px] h-[18px] text-[#2dd4bf]" />
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
