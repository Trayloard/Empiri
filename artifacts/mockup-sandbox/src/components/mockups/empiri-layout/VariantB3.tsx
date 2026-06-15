import { useState } from "react";

const ACCENT = "#a78bfa";
const ACCENT_LOW = "rgba(167,139,250,0.30)";
const BG = "linear-gradient(160deg,#0c0917 0%,#110c20 55%,#090d18 100%)";
const GLASS = "rgba(255,255,255,0.07)";
const GLASS_B = "rgba(255,255,255,0.10)";

const msgs = [
  { role: "assistant", text: "Guten Abend — ich freue mich, von dir zu hören." },
  { role: "user", text: "Heute war's eigentlich okay. Ich hab endlich mal Zeit für mich gehabt." },
  { role: "assistant", text: "Das klingt schön. Was hast du mit der Zeit gemacht?" },
  { role: "user", text: "Buch lesen, ein bisschen spazieren. Nichts Großes." },
  { role: "assistant", text: "Gerade das Kleine macht oft den Unterschied. Welches Buch?" },
  { role: "user", text: "Piranesi von Susanna Clarke. Sehr seltsam, sehr gut." },
  { role: "assistant", text: "Das kenne ich — diese Stille im Labyrinth. Passt zu dir." },
  { role: "user", text: "Ja, irgendwie schon." },
];

export function VariantB3() {
  const [orbX, setOrbX] = useState(38);
  const [dragging, setDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startOrbX, setStartOrbX] = useState(0);

  const onOrbDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    setStartX(e.clientX);
    setStartOrbX(orbX);
  };
  const onMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const nx = Math.max(24, Math.min(366, startOrbX + (e.clientX - startX)));
    setOrbX(nx);
  };
  const onUp = () => setDragging(false);

  return (
    <div
      onMouseMove={onMove}
      onMouseUp={onUp}
      onMouseLeave={onUp}
      style={{
        width: 390, height: 844,
        background: BG,
        fontFamily: "system-ui,-apple-system,sans-serif",
        overflow: "hidden", position: "relative",
        userSelect: "none",
        cursor: dragging ? "grabbing" : "default",
      }}
    >
      {/* Header bar — compact, avatar-style */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        height: 76, zIndex: 20,
        background: "linear-gradient(to bottom,rgba(12,9,23,0.97) 70%,transparent 100%)",
        display: "flex", alignItems: "flex-end",
        padding: "0 16px 10px",
        gap: 10,
      }}>
        {/* Avatar orb */}
        <div
          onMouseDown={onOrbDown}
          style={{
            width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
            background: "radial-gradient(circle at 38% 36%,#c084fc 0%,#7c3aed 42%,#312e81 82%,#1e1b4b 100%)",
            boxShadow: `0 4px 18px rgba(139,92,246,0.5), inset 0 1px 1px rgba(255,255,255,0.22)`,
            cursor: "ew-resize",
            position: "relative",
          }}
        >
          <div style={{
            position: "absolute", inset: -4, borderRadius: "50%",
            border: `1.5px solid ${ACCENT_LOW}`,
            animation: "pulse 2.6s ease-in-out infinite",
            pointerEvents: "none",
          }} />
        </div>

        {/* Name + mood */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#f0eaff", letterSpacing: -0.2 }}>Empiri</span>
          <span style={{ fontSize: 12, color: ACCENT, fontWeight: 500, opacity: 0.85 }}>Hier für dich ✨</span>
        </div>

        {/* Right-side controls — 3 buttons in a row, easy thumb reach */}
        <div style={{ display: "flex", gap: 6 }}>
          {[
            {
              active: true,
              icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            },
            {
              active: false,
              icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
            },
            {
              active: false,
              icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            },
          ].map(({ active, icon }, i) => (
            <button key={i} style={{
              width: 38, height: 38, borderRadius: 12,
              background: active ? "rgba(139,92,246,0.18)" : GLASS,
              border: `1px solid ${active ? ACCENT_LOW : GLASS_B}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
              opacity: active ? 1 : 0.75,
            }}>
              {icon}
            </button>
          ))}
        </div>
      </div>

      {/* Ambient glow from orb position in header */}
      <div style={{
        position: "absolute",
        left: orbX - 60, top: 10,
        width: 120, height: 120, borderRadius: "50%",
        background: "radial-gradient(circle,rgba(139,92,246,0.14) 0%,transparent 70%)",
        pointerEvents: "none",
        transition: dragging ? "none" : "left 0.1s",
      }} />

      {/* Chat — maximum space */}
      <div style={{
        position: "absolute", top: 76, left: 0, right: 0, bottom: 120,
        overflowY: "auto", padding: "6px 14px 4px",
      }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 9 }}>
            <div style={{
              maxWidth: "80%", padding: "9px 13px",
              borderRadius: m.role === "user" ? "17px 17px 4px 17px" : "17px 17px 17px 4px",
              background: m.role === "user" ? "linear-gradient(135deg,#7c3aed,#6d28d9)" : GLASS,
              border: m.role === "user" ? "none" : `1px solid ${GLASS_B}`,
              color: "#f0eaff", fontSize: 14.5, lineHeight: 1.52,
            }}>
              {m.text}
            </div>
          </div>
        ))}
        {/* Typing */}
        <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 9 }}>
          <div style={{
            padding: "9px 14px", borderRadius: "17px 17px 17px 4px",
            background: GLASS, border: `1px solid ${GLASS_B}`,
            display: "flex", gap: 4, alignItems: "center",
          }}>
            {[0, 0.3, 0.6].map((delay, i) => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: 3, background: ACCENT,
                animation: `dot 1.2s ease-in-out ${delay}s infinite`,
              }} />
            ))}
          </div>
        </div>
      </div>

      {/* Input — clean, flush bottom */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        background: "linear-gradient(to top,rgba(12,9,23,1) 55%,transparent 100%)",
        padding: "8px 14px 30px",
        zIndex: 20,
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: GLASS, border: `1px solid rgba(255,255,255,0.13)`,
          borderRadius: 28, padding: "10px 10px 10px 18px",
        }}>
          <input
            placeholder="Schreib etwas…"
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#f0eaff", fontSize: 15 }}
          />
          <button style={{
            width: 36, height: 36, borderRadius: 18,
            background: "rgba(139,92,246,0.18)", border: `1px solid ${ACCENT_LOW}`,
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c084fc" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
          <button style={{
            width: 40, height: 40, borderRadius: 20,
            background: "linear-gradient(135deg,#7c3aed,#6d28d9)", border: "none",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pulse{0%,100%{opacity:0.25;transform:scale(1)}50%{opacity:0.6;transform:scale(1.08)}}
        @keyframes dot{0%,80%,100%{transform:scale(0.7);opacity:0.4}40%{transform:scale(1);opacity:1}}
      `}</style>
    </div>
  );
}
