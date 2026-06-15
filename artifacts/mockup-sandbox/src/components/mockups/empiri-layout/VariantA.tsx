export function VariantA() {
  const messages = [
    { role: "assistant", text: "Hey, wie war dein Tag heute?" },
    { role: "user", text: "Eigentlich ganz okay, aber ich bin ein bisschen müde." },
    { role: "assistant", text: "Das kenne ich – manchmal reicht ein kleines Gespräch, um wieder aufzutanken. Was hat dich heute beschäftigt?" },
    { role: "user", text: "Ich hatte viele Meetings und kaum Pause dazwischen." },
    { role: "assistant", text: "Das klingt anstrengend. Wie fühlst du dich jetzt gerade?" },
  ];

  return (
    <div
      className="flex flex-col"
      style={{
        width: 390,
        height: 844,
        background: "linear-gradient(160deg, #0e0b1a 0%, #120d22 60%, #0b0f1a 100%)",
        fontFamily: "system-ui, -apple-system, sans-serif",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Ambient glow behind orb */}
      <div
        style={{
          position: "absolute",
          top: 30,
          left: "50%",
          transform: "translateX(-50%)",
          width: 160,
          height: 160,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.22) 0%, transparent 72%)",
          pointerEvents: "none",
        }}
      />

      {/* Top bar: notification bell left, voice right — slim & unobtrusive */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 52,
          paddingLeft: 20,
          paddingRight: 20,
          paddingBottom: 4,
        }}
      >
        <button
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </button>
        <button
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        </button>
      </div>

      {/* Compact presence header */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 4, paddingBottom: 12 }}>
        {/* Orb — smaller so chat gets room */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: "radial-gradient(circle at 38% 36%, #c084fc 0%, #7c3aed 40%, #312e81 80%, #1e1b4b 100%)",
            boxShadow: "0 0 32px rgba(139,92,246,0.45), inset 0 1px 1px rgba(255,255,255,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            position: "relative",
          }}
        >
          {/* pulse ring */}
          <div style={{
            position: "absolute",
            inset: -6,
            borderRadius: "50%",
            border: "1.5px solid rgba(167,139,250,0.3)",
            animation: "pulse 2.4s ease-in-out infinite",
          }} />
        </div>
        <div style={{ marginTop: 8, color: "#f0eaff", fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>
          Empiri
        </div>
        <div style={{ marginTop: 2, fontSize: 12.5, color: "#a78bfa", letterSpacing: 0.1 }}>
          Hier für dich
        </div>
      </div>

      {/* Chat area — takes remaining space */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 8px" }}>
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
        {/* Typing indicator */}
        <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 10 }}>
          <div style={{
            padding: "10px 16px",
            borderRadius: "18px 18px 18px 4px",
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.09)",
            display: "flex",
            gap: 4,
            alignItems: "center",
          }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: 3,
                background: "#a78bfa",
                opacity: 0.5 + i * 0.2,
              }} />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom toolbar: settings + input grouped together */}
      <div style={{ padding: "0 14px 8px" }}>
        {/* Input bar */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 28,
          padding: "10px 12px 10px 18px",
        }}>
          <input
            placeholder="Nachricht…"
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              color: "#f0eaff",
              fontSize: 15,
            }}
          />
          {/* Mic button */}
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
          {/* Send button */}
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

        {/* Settings toolbar row */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          gap: 16,
          marginTop: 10,
          marginBottom: 6,
        }}>
          {[
            { icon: "settings", label: "Einstellungen", active: false },
            { icon: "user", label: "Profil", active: false },
          ].map(({ icon, label, active }) => (
            <button key={label} style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              background: "none", border: "none", cursor: "pointer",
              opacity: active ? 1 : 0.55,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 14,
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {icon === "settings" ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                  </svg>
                )}
              </div>
              <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:0.3;transform:scale(1)} 50%{opacity:0.7;transform:scale(1.06)} }`}</style>
    </div>
  );
}
