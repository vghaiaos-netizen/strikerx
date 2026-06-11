import { useState } from "react";
import { motion } from "framer-motion";
import { SUPPORTED_LANGUAGES, type LangCode } from "@/i18n";

interface LanguagePickerProps {
  onSelect: (code: LangCode) => void;
}

export default function LanguagePicker({ onSelect }: LanguagePickerProps) {
  const [selected, setSelected] = useState<LangCode | null>(null);

  return (
    <div className="min-h-screen bg-[#060a14] flex flex-col items-center justify-center px-6 py-8"
      style={{ fontFamily: "'Inter', sans-serif" }}>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-3xl mb-3">⚽</div>
          <div className="font-black text-2xl tracking-widest text-[#00ff88]"
            style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            STRIKERX
          </div>
        </div>

        {/* Title */}
        <h1 className="text-center text-white font-bold text-xl mb-1.5">
          Choose Your Language
        </h1>
        <p className="text-center text-white/40 text-[13px] mb-6 leading-relaxed">
          Select your preferred language.{"\n"}You can change this later in your profile.
        </p>

        {/* Language grid */}
        <div className="grid grid-cols-2 gap-2 mb-6">
          {SUPPORTED_LANGUAGES.map(({ code, label, dir }) => {
            const isSelected = selected === code;
            return (
              <motion.button
                key={code}
                whileTap={{ scale: 0.96 }}
                onClick={() => setSelected(code as LangCode)}
                className={`py-3.5 px-4 rounded-2xl border text-left transition-all ${
                  isSelected
                    ? "border-[#00ff88] bg-[#00ff88]/10 text-white"
                    : "border-white/10 bg-white/3 text-white/70 hover:border-white/25"
                }`}
                dir={dir}
              >
                <div className={`font-semibold text-sm ${isSelected ? "text-[#00ff88]" : ""}`}>
                  {label}
                </div>
                <div className="text-[10px] font-mono mt-0.5 opacity-40">{code.toUpperCase()}</div>
              </motion.button>
            );
          })}
        </div>

        {/* Continue button */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          disabled={!selected}
          onClick={() => selected && onSelect(selected)}
          className={`w-full h-12 rounded-2xl font-bold tracking-widest transition-all ${
            selected
              ? "bg-[#00ff88] text-[#060a14] hover:bg-[#00ff88]/90"
              : "bg-white/8 text-white/25 cursor-not-allowed"
          }`}
          style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.15em" }}
        >
          CONTINUE
        </motion.button>
      </motion.div>
    </div>
  );
}
