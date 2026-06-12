import React, { useEffect } from "react";
import { motion, useAnimation } from "framer-motion";
import { Bell, Volume2, Mic } from "lucide-react";

export default function PresenceSpectrum() {
  useEffect(() => {
    const link = document.createElement("link");
    link.href =
      "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-8 font-sans">
      <div
        style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        className="relative w-[390px] h-[844px] rounded-[44px] bg-[#0A0A0C] overflow-hidden shadow-2xl ring-1 ring-white/10 flex flex-col"
      >
        {/* Edge glow */}
        <motion.div
          className="absolute inset-0 z-0 pointer-events-none"
          animate={{
            boxShadow: [
              "inset 0 0 40px rgba(99,102,241,0.1), inset 0 0 80px rgba(236,72,153,0.05)",
              "inset 0 0 60px rgba(168,85,247,0.15), inset 0 0 100px rgba(249,115,22,0.08)",
              "inset 0 0 40px rgba(99,102,241,0.1), inset 0 0 80px rgba(236,72,153,0.05)",
            ],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Ambient gradient backgrounds */}
        <div className="absolute top-0 left-0 w-full h-[300px] z-0 pointer-events-none opacity-40">
          <motion.div
            className="absolute top-[-50px] left-[-50px] w-[200px] h-[200px] rounded-full bg-blue-600 blur-[80px]"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.5, 0.8, 0.5],
              x: [0, 20, 0],
              y: [0, 30, 0],
            }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute top-[20px] right-[-30px] w-[180px] h-[180px] rounded-full bg-fuchsia-500 blur-[80px]"
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.4, 0.7, 0.4],
              x: [0, -30, 0],
              y: [0, 40, 0],
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1,
            }}
          />
        </div>

        {/* Header */}
        <div className="relative z-10 flex items-center justify-between px-6 pt-14 pb-4">
          <button className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/70 backdrop-blur-md transition-colors hover:bg-white/10">
            <Bell size={18} />
          </button>
          <button className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/70 backdrop-blur-md transition-colors hover:bg-white/10">
            <Volume2 size={18} />
          </button>
        </div>

        {/* Centerpiece Presence */}
        <div className="relative z-10 flex flex-col items-center justify-center mt-6 mb-8">
          <div className="relative w-40 h-40 flex items-center justify-center">
            {/* Swirling glow layers */}
            <motion.div
              className="absolute w-full h-full rounded-full bg-gradient-to-tr from-blue-500 via-purple-500 to-pink-500 blur-[20px] mix-blend-screen"
              animate={{
                rotate: [0, 360],
                scale: [0.9, 1.1, 0.9],
              }}
              transition={{
                rotate: { duration: 8, repeat: Infinity, ease: "linear" },
                scale: { duration: 4, repeat: Infinity, ease: "easeInOut" },
              }}
            />
            <motion.div
              className="absolute w-[80%] h-[80%] rounded-full bg-gradient-to-bl from-orange-400 via-pink-500 to-purple-600 blur-[15px] mix-blend-screen"
              animate={{
                rotate: [360, 0],
                scale: [1, 1.2, 1],
              }}
              transition={{
                rotate: { duration: 10, repeat: Infinity, ease: "linear" },
                scale: {
                  duration: 5,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.5,
                },
              }}
            />
            <motion.div
              className="absolute w-[60%] h-[60%] rounded-full bg-white blur-[10px] opacity-80"
              animate={{
                scale: [0.9, 1.1, 0.9],
                opacity: [0.7, 1, 0.7],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>

          <div className="mt-8 flex flex-col items-center gap-1">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Empiri
            </h1>
            <motion.p
              className="text-sm font-medium text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400"
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              Listening...
            </motion.p>
          </div>
        </div>

        {/* Conversation */}
        <div className="relative z-10 flex-1 px-5 flex flex-col gap-4 overflow-y-auto pb-32">
          {/* Assistant Bubble */}
          <div className="self-start max-w-[85%] bg-white/5 border border-purple-500/20 rounded-2xl rounded-tl-sm px-5 py-3.5 backdrop-blur-xl shadow-lg shadow-purple-900/10">
            <p className="text-[15px] leading-relaxed text-white/90">
              I'm really glad you're back. How are you feeling today?
            </p>
          </div>

          {/* User Bubble */}
          <div className="self-end max-w-[85%] bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-blue-400/30 rounded-2xl rounded-tr-sm px-5 py-3.5 backdrop-blur-xl shadow-lg shadow-blue-900/10">
            <p className="text-[15px] leading-relaxed text-white">
              A bit tired, honestly.
            </p>
          </div>

          {/* Assistant Bubble */}
          <div className="self-start max-w-[85%] bg-white/5 border border-pink-500/20 rounded-2xl rounded-tl-sm px-5 py-3.5 backdrop-blur-xl shadow-lg shadow-pink-900/10">
            <p className="text-[15px] leading-relaxed text-white/90">
              That's okay. Let's take it slow — I'm right here with you.
            </p>
          </div>

          {/* Typing Indicator */}
          <div className="self-start bg-white/5 border border-white/10 rounded-2xl rounded-tl-sm px-4 py-4 backdrop-blur-xl flex items-center gap-1.5 shadow-lg">
            <motion.div
              className="w-1.5 h-1.5 rounded-full bg-white/50"
              animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0,
              }}
            />
            <motion.div
              className="w-1.5 h-1.5 rounded-full bg-white/50"
              animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.2,
              }}
            />
            <motion.div
              className="w-1.5 h-1.5 rounded-full bg-white/50"
              animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.4,
              }}
            />
          </div>
        </div>

        {/* Bottom Input Area */}
        <div className="absolute bottom-0 w-full p-5 bg-gradient-to-t from-[#0A0A0C] via-[#0A0A0C]/90 to-transparent z-20 pb-8">
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-white/5 border border-purple-500/30 rounded-full h-12 px-5 flex items-center backdrop-blur-xl shadow-[0_0_15px_rgba(168,85,247,0.1)]">
              <span className="text-white/40 text-[15px]">
                Message Empiri...
              </span>
            </div>
            <button className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-500 to-purple-600 flex items-center justify-center text-white shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-transform hover:scale-105 active:scale-95">
              <Mic size={20} className="fill-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
