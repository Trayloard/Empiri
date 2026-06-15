import { useState } from "react";

export function VariantB() {
  const [orbPos, setOrbPos] = useState({ x: 290, y: 160 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ mx: 0, my: 0, ox: 0, oy: 0 });

  const messages = [
    { role: "assistant", text: "Hey, wie war dein Tag heute?" },
    { role: "user", text: "Eigentlich ganz okay, aber ich bin ein bisschen müde." },
    { role: "assistant", text: "Das kenne ich – manchmal reicht ein kleines Gespräch, um wieder aufzutanken. Was hat dich heute beschäftigt?" },
    { role: "user", text: "Ich hatte viele Meetings und kaum Pause dazwischen." },
    { role: "assistant", text: "Das klingt anstrengend. Wie fühlst du dich jetzt gerade?" },
    { role: "user", text: "Ein bisschen besser, seit wir reden." },
  ];

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    setDragStart({ mx: e.clientX, my: e.clientY, ox: orbPos.x, oy: orbPos.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.mx;
    const dy = e.clientY - dragStart.my;
    setOrbPos({
      x: Math.max(30, Math.min(340, dragStart.ox + dx)),
      y: Math.max(80, Math.min(580, dragStart.oy + dy)),
    });
  };

  const handleMouseUp = () => setDragging(false);

  return (
    <div
      className="flex flex-col select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        width: 390,
        height: 844,
        background: "linear-gradient(160deg, #0e0b1a 0%, #120d22 60%, #0b0f1a 100%)",
        fontFamily: "system-ui, -apple-system, sans-serif",
        overflow: "hidden",
        position: "relative",
        cursor: dragging ? "grabbing" : "default",
      }}
    >
      {/* Ambient glow that follows the orb */}
      <div
        style={{
          position: "absolute",
          left: orbPos.x - 60,
          top: orbPos.y - 60,
          width: 140,
          height: 140,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 72%)",
          pointerEvents: "none",
          transition: dragging ? "none" : "left 0.3s ease, top 0.3s ease",
        }}
      />

      {/* Chat area (full height, behind orb) */}
      <div style={{ position: "absolute", top: 60, left: 0, right: 0, bottom: 160, overflowY: "auto", padding: "8px 14px" }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: m.role === "user" ? "flex-end" : "flex-start",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                maxWidth: "78%",
                padding: "10px 14px",
                borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                background: m.role === "user"
                  ? "linear-gradient(135deg, #7c3aed, #6d28d9)"
                  : "rgba(255,255,255,0.07)",
                border: m.role === "user" ? "none" : "1px solid rgba(255,255,255,0.09)",
                color: "#f0eaff",
                fontSize: 14.5,
                lineHeight: 1.5,
              }}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>

      {/* Status bar */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0,
        height: 56,
        paddingTop: 16,
        paddingLeft: 20,
        paddingRight: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "linear-gradient(to bottom, rgba(14,11,26,0.95) 0%, transparent 100%)",
        zIndex: 10,
      }}>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>9:41</span>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", fontWeight: 600, letterSpacing: 0.3 }}>Empiri</span>
        <div style={{ display: "flex", gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255,255,255,0.4)" stroke="none">
            <path d="M1 6l5 5 5-5"/>
          </svg>
        </div>
      </div>

      {/* Floating draggable orb */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          position: "absolute",
          left: orbPos.x - 35,
          top: orbPos.y - 35,
          width: 70,
          height: 70,
          borderRadius: "50%",
          background: "radial-gradient(circle at 38% 36%, #c084fc 0%, #7c3aed 40%, #312e81 80%, #1e1b4b 100%)",
          boxShadow: dragging
            ? "0 12px 40px rgba(139,92,246,0.55), inset 0 1px 1px rgba(255,255,255,0.25)"
            : "0 6px 24px rgba(139,92,246,0.40), inset 0 1px 1px rgba(255,255,255,0.25)",
          cursor: "grab",
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: dragging ? "none" : "left 0.08s, top 0.08s, box-shadow 0.2s",
          transform: dragging ? "scale(1.08)" : "scale(1)",
        }}
      >
        {/* drag hint dots */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, opacity: 0.5 }}>
          {[0,1,2].map(row => (
            <div key={row} style={{ display: "flex", gap: 3 }}>
              {[0,1].map(col => (
                <div key={col} style={{ width: 3, height: 3, borderRadius: 1.5, background: "rgba(255,255,255,0.7)" }} />
              ))}
            </div>
          ))}
        </div>
        {/* pulse ring */}
        <div style={{
          position: "absolute",
          inset: -7,
          borderRadius: "50%",
          border: "1.5px solid rgba(167,139,250,0.35)",
          animation: "pulse 2.4s ease-in-out infinite",
          pointerEvents: "none",
        }} />
      </div>

      {/* Name label near orb */}
      <div style={{
        position: "absolute",
        left: orbPos.x - 24,
        top: orbPos.y + 40,
        fontSize: 11,
        color: "rgba(167,139,250,0.75)",
        fontWeight: 600,
        letterSpacing: 0.4,
        pointerEvents: "none",
        zIndex: 20,
        transition: dragging ? "none" : "left 0.08s, top 0.08s",
      }}>
        Empiri
      </div>

      {/* Bottom: input + nav bar */}
      <div style={{
        position: "absolute",
        bottom: 0, left: 0, right: 0,
        background: "linear-gradient(to top, rgba(14,11,26,1) 60%, transparent 100%)",
        padding: "8px 14px 0",
        zIndex: 30,
      }}>
        {/* Input bar */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 28,
          padding: "10px 12px 10px 18px",
          marginBottom: 8,
        }}>
          <input
            placeholder="Nachricht…"
            style={{
              flex: 1, background: "none", border: "none", outline: "none",
              color: "#f0eaff", fontSize: 15,
            }}
          />
          <button style={{
            width: 36, height: 36, borderRadius: 18,
            background: "rgba(139,92,246,0.2)",
            border: "1px solid rgba(139,92,246,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c084fc" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
          <button style={{
            width: 36, height: 36, borderRadius: 18,
            background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
            border: "none",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>

        {/* Nav bar */}
        <div style={{
          display: "flex",
          justifyContent: "space-around",
          paddingBottom: 24,
          paddingTop: 4,
        }}>
          {[
            {
              label: "Benachrichtigung",
              active: true,
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              ),
            },
            {
              label: "Stimme",
              active: false,
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              ),
            },
            {
              label: "Einstellungen",
              active: false,
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              ),
            },
          ].map(({ label, active, icon }) => (
            <button key={label} style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              background: "none", border: "none", cursor: "pointer",
              opacity: active ? 1 : 0.6,
            }}>
              <div style={{
                width: 46, height: 46, borderRadius: 15,
                background: active ? "rgba(139,92,246,0.18)" : "rgba(255,255,255,0.06)",
                border: active ? "1px solid rgba(139,92,246,0.4)" : "1px solid rgba(255,255,255,0.09)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {icon}
              </div>
              <span style={{ fontSize: 10, color: active ? "#a78bfa" : "rgba(255,255,255,0.4)", fontWeight: 500 }}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:0.3;transform:scale(1)} 50%{opacity:0.7;transform:scale(1.06)} }`}</style>
    </div>
  );
}
