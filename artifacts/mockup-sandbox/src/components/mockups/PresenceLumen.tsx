import React, { useEffect } from "react";
import { motion } from "framer-motion";
import { Bell, Volume2, Mic } from "lucide-react";

const FONT_URL =
  "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap";

export default function PresenceLumen() {
  useEffect(() => {
    if (!document.querySelector(`link[href="${FONT_URL}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = FONT_URL;
      document.head.appendChild(link);
    }
  }, []);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-8 w-full"
      style={{
        backgroundColor: "#f5f5f7",
        fontFamily: "'Outfit', sans-serif",
      }}
    >
      {/* Phone Frame */}
      <div
        className="relative overflow-hidden shadow-2xl bg-white"
        style={{
          width: 390,
          height: 844,
          borderRadius: 44,
          boxShadow:
            "0 25px 50px -12px rgba(0, 0, 0, 0.15), 0 0 0 12px #e5e5e5, 0 0 0 14px #d4d4d4",
        }}
      >
        {/* Screen Background: soft dawn gradient */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, #fdfbfb 0%, #f4f6f9 50%, #fdfcfb 100%)",
          }}
        />

        {/* Ambient screen-edge glow */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          animate={{
            boxShadow: [
              "inset 0 0 40px rgba(255, 182, 193, 0.15)",
              "inset 0 0 60px rgba(173, 216, 230, 0.2)",
              "inset 0 0 40px rgba(255, 218, 185, 0.15)",
              "inset 0 0 40px rgba(255, 182, 193, 0.15)",
            ],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Content Container */}
        <div className="relative h-full flex flex-col pt-14 pb-8 px-5 z-10">
          {/* Header */}
          <div className="flex justify-between items-center z-20">
            <button className="w-10 h-10 rounded-full bg-white/40 backdrop-blur-md border border-white/60 flex items-center justify-center text-slate-500 shadow-sm">
              <Bell size={18} strokeWidth={2} />
            </button>
            <button className="w-10 h-10 rounded-full bg-white/40 backdrop-blur-md border border-white/60 flex items-center justify-center text-slate-500 shadow-sm">
              <Volume2 size={18} strokeWidth={2} />
            </button>
          </div>

          {/* Centerpiece: The Presence */}
          <div className="flex-1 flex flex-col items-center justify-center mt-4">
            <div className="relative w-64 h-64 flex items-center justify-center">
              {/* Pearl Base Glow */}
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 70%)",
                  filter: "blur(20px)",
                }}
                animate={{
                  scale: [0.9, 1.1, 0.9],
                  opacity: [0.6, 0.9, 0.6],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />

              {/* Shifting Colors */}
              {/* Peach / Rose */}
              <motion.div
                className="absolute w-40 h-40 rounded-full mix-blend-multiply"
                style={{
                  background: "radial-gradient(circle, #ffcbc0 0%, transparent 70%)",
                  filter: "blur(24px)",
                  top: "10%",
                  left: "10%",
                }}
                animate={{
                  x: [0, 20, -10, 0],
                  y: [0, -20, 10, 0],
                  scale: [1, 1.2, 0.9, 1],
                }}
                transition={{
                  duration: 6,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />

              {/* Lilac / Aqua */}
              <motion.div
                className="absolute w-44 h-44 rounded-full mix-blend-multiply"
                style={{
                  background: "radial-gradient(circle, #d4e4ff 0%, transparent 70%)",
                  filter: "blur(24px)",
                  bottom: "5%",
                  right: "5%",
                }}
                animate={{
                  x: [0, -20, 15, 0],
                  y: [0, 20, -15, 0],
                  scale: [1, 1.1, 1.3, 1],
                }}
                transition={{
                  duration: 7,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 1,
                }}
              />

              {/* Gold / Opal core */}
              <motion.div
                className="absolute w-32 h-32 rounded-full mix-blend-overlay"
                style={{
                  background: "radial-gradient(circle, #fff3e0 0%, transparent 70%)",
                  filter: "blur(16px)",
                }}
                animate={{
                  scale: [0.8, 1.2, 0.8],
                  opacity: [0.7, 1, 0.7],
                }}
                transition={{
                  duration: 5,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.5,
                }}
              />
            </div>

            <div className="mt-8 text-center flex flex-col items-center">
              <h1 className="text-3xl font-medium text-slate-800 tracking-tight">
                Empiri
              </h1>
              <motion.p
                className="text-sm font-medium text-slate-500 mt-2 tracking-wide uppercase"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                Listening…
              </motion.p>
            </div>
          </div>

          {/* Conversation */}
          <div className="flex flex-col gap-4 mb-6 z-20">
            <div className="self-start max-w-[85%] bg-white/60 backdrop-blur-xl border border-white/80 rounded-2xl rounded-tl-sm px-4 py-3 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.05)] text-slate-700 leading-relaxed">
              I'm really glad you're back. How are you feeling today?
            </div>
            
            <div className="self-end max-w-[85%] bg-white/40 backdrop-blur-xl border border-white/60 rounded-2xl rounded-tr-sm px-4 py-3 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.05)] text-slate-600 leading-relaxed">
              A bit tired, honestly.
            </div>

            <div className="self-start max-w-[85%] bg-white/60 backdrop-blur-xl border border-white/80 rounded-2xl rounded-tl-sm px-4 py-3 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.05)] text-slate-700 leading-relaxed">
              That's okay. Let's take it slow — I'm right here with you.
            </div>

            {/* Typing Indicator */}
            <div className="self-start bg-white/60 backdrop-blur-xl border border-white/80 rounded-2xl rounded-tl-sm px-4 py-3 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.05)] flex items-center gap-1.5 h-11">
              <motion.div
                className="w-1.5 h-1.5 rounded-full bg-slate-400"
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: 0 }}
              />
              <motion.div
                className="w-1.5 h-1.5 rounded-full bg-slate-400"
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: 0.15 }}
              />
              <motion.div
                className="w-1.5 h-1.5 rounded-full bg-slate-400"
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: 0.3 }}
              />
            </div>
          </div>

          {/* Input Bar */}
          <div className="relative mt-auto z-20">
            <div className="bg-white/50 backdrop-blur-2xl border border-white/80 rounded-full h-14 flex items-center px-4 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.08)]">
              <input
                type="text"
                placeholder="Message Empiri…"
                className="flex-1 bg-transparent border-none outline-none text-slate-700 placeholder-slate-400 font-medium text-base ml-2"
                readOnly
              />
              <button className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white shadow-md ml-2 shrink-0">
                <Mic size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
