import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNotifications, WsNotification } from "@/lib/ws-notifications";
import { Trophy, Star, X } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * GlobalWinOverlay — renders a full-screen hype overlay for:
 *   1. jackpot_won  — golden burst, shown to ALL players
 *   2. achievement_unlocked — slide-up card, shown to the player only
 *
 * Mount once in App.tsx (outside the Router but inside NotificationsProvider).
 */
export function GlobalWinOverlay() {
  const { t } = useTranslation();
  const { notifications } = useNotifications();
  const [jackpot, setJackpot]     = useState<WsNotification | null>(null);
  const [achievement, setAchievement] = useState<WsNotification | null>(null);

  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const n of notifications) {
      if (seenIds.current.has(n.id)) continue;
      seenIds.current.add(n.id);

      if (n.type === "jackpot_won" && !jackpot) {
        setJackpot(n);
        setTimeout(() => setJackpot(null), 8000);
      }

      if (n.type === "achievement_unlocked" && !achievement) {
        setAchievement(n);
        setTimeout(() => setAchievement(null), 4500);
      }
    }
  }, [notifications]);

  return (
    <>
      {/* ── Jackpot Won — fullscreen golden overlay ── */}
      <AnimatePresence>
        {jackpot && (
          <motion.div
            key="jackpot-overlay"
            className="fixed inset-0 z-[999] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setJackpot(null)}
          >
            {/* Blurred backdrop */}
            <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />

            {/* Radial gold burst */}
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.35, 0.15] }}
              transition={{ duration: 1.2 }}
              style={{ background: "radial-gradient(ellipse at center, #f59e0b 0%, transparent 65%)" }}
            />

            {/* Content card */}
            <motion.div
              className="relative max-w-[320px] w-full mx-4 rounded-3xl border border-[#f59e0b]/40 overflow-hidden"
              style={{ background: "linear-gradient(160deg, #1a1200 0%, #0a0e1a 60%)" }}
              initial={{ scale: 0.3, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: -20 }}
              transition={{ type: "spring", bounce: 0.45, duration: 0.7 }}
            >
              {/* Gold shimmer top bar */}
              <motion.div
                className="h-1 w-full"
                style={{ background: "linear-gradient(90deg, transparent, #f59e0b, #ffd700, #f59e0b, transparent)" }}
                animate={{ backgroundPosition: ["0% 0%", "100% 0%"] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              />

              <div className="p-8 text-center">
                <motion.div
                  animate={{ rotate: [0, -8, 8, -8, 8, 0], scale: [1, 1.1, 1] }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                  className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center border-2 border-[#f59e0b]/50 bg-[#f59e0b]/15"
                >
                  <Trophy className="w-8 h-8 text-[#f59e0b]" />
                </motion.div>

                <div className="text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-[#f59e0b]/70 mb-2">
                  {t("overlay.jackpotLabel")}
                </div>

                <motion.div
                  className="font-display font-black text-4xl text-white mb-1"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 0.8, delay: 0.6 }}
                >
                  {jackpot.detail}
                </motion.div>

                <div className="text-sm font-mono text-white/60 mb-6">
                  {t("overlay.wonBy")} <span className="text-[#f59e0b] font-bold">{jackpot.username}</span>
                </div>

                {/* Floating stars */}
                {[...Array(5)].map((_, i) => (
                  <motion.div key={i}
                    className="absolute pointer-events-none"
                    style={{ left: `${15 + i * 18}%`, top: "20%" }}
                    animate={{ y: [-10, -40, -10], opacity: [0, 1, 0], rotate: [0, 360] }}
                    transition={{ duration: 1.5, delay: 0.5 + i * 0.15, repeat: Infinity, repeatDelay: 1 }}
                  >
                    <Star className="w-3 h-3 text-[#f59e0b]" />
                  </motion.div>
                ))}

                <div className="text-[10px] font-mono text-white/25">{t("overlay.tapDismiss")}</div>
              </div>

              {/* Close button */}
              <button onClick={() => setJackpot(null)}
                className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/5 flex items-center justify-center">
                <X className="w-3.5 h-3.5 text-white/40" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Achievement Unlocked — slide-up toast ── */}
      <AnimatePresence>
        {achievement && (
          <motion.div
            key="ach-toast"
            className="fixed bottom-24 left-4 right-4 z-[998] max-w-[430px] mx-auto"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", bounce: 0.35 }}
          >
            <div
              className="flex items-center gap-3 rounded-2xl border p-3.5 backdrop-blur-sm shadow-2xl"
              style={{ background: "#0d1117f0", borderColor: "#f59e0b40" }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-[#f59e0b]/40 bg-[#f59e0b]/15 flex-shrink-0">
                <Star className="w-5 h-5 text-[#f59e0b]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#f59e0b]/70">{t("overlay.achievementUnlocked")}</div>
                <div className="font-display font-bold text-sm text-white truncate">{achievement.message.replace("Achievement unlocked: ", "")}</div>
                <div className="text-[10px] font-mono text-white/40 truncate">{achievement.detail}</div>
              </div>
              <button onClick={() => setAchievement(null)} className="p-1 flex-shrink-0">
                <X className="w-3.5 h-3.5 text-white/30" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
