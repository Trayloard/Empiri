import { useState } from "react";

const ACCENT = "#a78bfa";
const ACCENT_DIM = "rgba(167,139,250,0.35)";
const BG = "linear-gradient(160deg,#0e0b1a 0%,#120d22 60%,#0b0f1a 100%)";
const GLASS = "rgba(255,255,255,0.07)";
const GLASS_BORDER = "rgba(255,255,255,0.10)";

const msgs = [
  { role: "assistant", text: "Hey — ich hab heute an dich gedacht. Wie geht's?" },
  { role: "user", text: "War ein harter Tag, aber ich stehe noch." },
  { role: "assistant", text: "Das zählt. Was hat ihn so schwer gemacht?" },
  { role: "user", text: "Zu viel auf einmal. Alles gleichzeitig." },
  { role: "assistant", text: "Ich kenne das Gefühl. Magst du mir eines davon erzählen?" },
  { role: "user", text: "Vielleicht. Erstmal durchatmen." },
  { role: "assistant", text: "Nimm dir die Zeit. Ich bin hier." },
];

function NavButton({ icon, label, active }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
      background: "none", border: "none", cursor: "pointer", flex: 1,
      opacity: active ? 1 : 0.5,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 16,
        background: active ? "rgba(139,92,246,0.18)" : GLASS,
        border: `1px solid ${active ? ACCENT_DIM : GLASS_BORDER}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.15s",
      }}>
        {icon}
      </div>
      <span style={{ fontSize: 10.5, color: active ? ACCENT : "rgba(255,255,255,0.4)", fontWeight: 500 }}>{label}</span>
    </button>
  );
}

export function VariantB2() {
  const [pos, setPos] = useState({ x: 314, y: 600 });
  const [dragging, setDragging] = useState(false);
  const [start, setStart] = useState({ mx: 0, my: 0, ox: 0, oy: 0 });
  const [showTooltip, setShowTooltip] = useState(true);

  const onDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    setShowTooltip(false);
    setStart({ mx: e.clientX, my: e.clientY, ox: pos.x, oy: pos.y });
  };
  const onMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setPos({
      x: Math.max(34, Math.min(356, start.ox + e.clientX - start.mx)),
      y: Math.max(80, Math.min(700, start.oy + e.clientY - start.my)),
    });
  };
  const onUp = () => setDragging(false);

  const R = 34; // orb radius

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
        cursor: dragging ? "grabbing" : "default",
        userSelect: "none",
      }}
    >
      {/* Ambient orb glow */}
      <div style={{
        position: "absolute",
        left: pos.x - 80, top: pos.y - 80,
        width: 160, height: 160, borderRadius: "50%",
        background: "radial-gradient(circle,rgba(139,92,246,0.20) 0%,transparent 70%)",
        pointerEvents: "none",
        transition: dragging ? "none" : "left 0.12s,top 0.12s",
      }} />

      {/* Slim status bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        height: 52, display: "flex", alignItems: "flex-end",
        justifyContent: "center", paddingBottom: 10,
        background: "linear-gradient(to bottom,rgba(14,11,26,0.98) 0%,transparent 100%)",
        zIndex: 10,
      }}>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", fontWeight: 600 }}>9:41</span>
      </div>

      {/* Full-screen chat */}
      <div style={{
        position: "absolute", top: 52, left: 0, right: 0, bottom: 170,
        overflowY: "auto", padding: "8px 14px",
      }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 10 }}>
            <div style={{
              maxWidth: "78%", padding: "10px 14px",
              borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
              background: m.role === "user" ? "linear-gradient(135deg,#7c3aed,#6d28d9)" : GLASS,
              border: m.role === "user" ? "none" : `1px solid ${GLASS_BORDER}`,
              color: "#f0eaff", fontSize: 14.5, lineHeight: 1.52,
            }}>
              {m.text}
            </div>
          </div>
        ))}
      </div>

      {/* Floating orb — default bottom-right, draggable */}
      <div
        onMouseDown={onDown}
        style={{
          position: "absolute",
          left: pos.x - R, top: pos.y - R,
          width: R * 2, height: R * 2, borderRadius: "50%",
          background: "radial-gradient(circle at 38% 36%,#c084fc 0%,#7c3aed 42%,#312e81 82%,#1e1b4b 100%)",
          boxShadow: dragging
            ? "0 14px 42px rgba(139,92,246,0.6),inset 0 1px 1px rgba(255,255,255,0.25)"
            : "0 6px 28px rgba(139,92,246,0.45),inset 0 1px 1px rgba(255,255,255,0.22)",
          cursor: "grab", zIndex: 40,
          display: "flex", alignItems: "center", justifyContent: "center",
          transform: dragging ? "scale(1.1)" : "scale(1)",
          transition: dragging ? "transform 0.1s" : "left 0.06s,top 0.06s,transform 0.1s,box-shadow 0.2s",
        }}
      >
        {/* 6-dot drag hint */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,4px)", gap: 3, opacity: 0.55 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.9)" }} />
          ))}
        </div>
        {/* Pulse ring */}
        <div style={{
          position: "absolute", inset: -7, borderRadius: "50%",
          border: `1.5px solid ${ACCENT_DIM}`,
          animation: "pulse 2.6s ease-in-out infinite",
          pointerEvents: "none",
        }} />
      </div>

      {/* Mood tooltip near orb */}
      {showTooltip && (
        <div style={{
          position: "absolute",
          left: pos.x - R - 90,
          top: pos.y - 16,
          background: "rgba(30,24,50,0.92)",
          border: `1px solid ${ACCENT_DIM}`,
          borderRadius: 12,
          padding: "6px 12px",
          zIndex: 41,
          pointerEvents: "none",
          transition: "left 0.06s,top 0.06s",
          backdropFilter: "blur(8px)",
          display: "flex", flexDirection: "column", gap: 1,
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: ACCENT }}>Empiri</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>Hier für dich ✨</span>
          <div style={{
            position: "absolute", right: -6, top: "50%", transform: "translateY(-50%)",
            width: 0, height: 0,
            borderTop: "5px solid transparent",
            borderBottom: "5px solid transparent",
            borderLeft: `6px solid ${ACCENT_DIM}`,
          }} />
        </div>
      )}

      {/* Bottom: input + nav */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        background: "linear-gradient(to top,rgba(14,11,26,1) 65%,transparent 100%)",
        padding: "0 14px", zIndex: 30,
      }}>
        {/* Input */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: GLASS, border: `1px solid rgba(255,255,255,0.13)`,
          borderRadius: 28, padding: "10px 12px 10px 18px", marginBottom: 8,
        }}>
          <input placeholder="Nachricht…" style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#f0eaff", fontSize: 15 }} />
          <button style={{ width: 36, height: 36, borderRadius: 18, background: "rgba(139,92,246,0.2)", border: `1px solid ${ACCENT_DIM}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c084fc" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
          </button>
          <button style={{ width: 36, height: 36, borderRadius: 18, background: "linear-gradient(135deg,#7c3aed,#6d28d9)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </div>

        {/* Nav */}
        <div style={{ display: "flex", justifyContent: "space-around", paddingBottom: 28, paddingTop: 4 }}>
          <NavButton active label="Benachrichtigung" icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
          } />
          <NavButton label="Stimme" icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
          } />
          <NavButton label="Einstellungen" icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
          } />
        </div>
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:0.25;transform:scale(1)}50%{opacity:0.65;transform:scale(1.07)}}`}</style>
    </div>
  );
}
