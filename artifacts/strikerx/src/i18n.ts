import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import ru from "./locales/ru.json";
import uk from "./locales/uk.json";
import be from "./locales/be.json";
import ro from "./locales/ro.json";
import ar from "./locales/ar.json";
import pl from "./locales/pl.json";
import bg from "./locales/bg.json";
import sr from "./locales/sr.json";
import pt from "./locales/pt.json";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English",     dir: "ltr" },
  { code: "ru", label: "Русский",     dir: "ltr" },
  { code: "uk", label: "Українська",  dir: "ltr" },
  { code: "be", label: "Беларуская",  dir: "ltr" },
  { code: "ro", label: "Română",      dir: "ltr" },
  { code: "ar", label: "العربية",     dir: "rtl" },
  { code: "pl", label: "Polski",      dir: "ltr" },
  { code: "bg", label: "Български",   dir: "ltr" },
  { code: "sr", label: "Српски",      dir: "ltr" },
  { code: "pt", label: "Português",   dir: "ltr" },
] as const;

export type LangCode = typeof SUPPORTED_LANGUAGES[number]["code"];
export const RTL_LANGUAGES: LangCode[] = ["ar"];

export function getLangDir(code: string): "ltr" | "rtl" {
  return RTL_LANGUAGES.includes(code as LangCode) ? "rtl" : "ltr";
}

export const LANG_STORAGE_KEY = "strikerx_lang";

export function getSavedLang(): string | null {
  try { return localStorage.getItem(LANG_STORAGE_KEY); } catch { return null; }
}
export function saveLangLocally(code: string) {
  try { localStorage.setItem(LANG_STORAGE_KEY, code); } catch {}
}

i18n.use(initReactI18next).init({
  resources: { en, ru, uk, be, ro, ar, pl, bg, sr, pt },
  lng: getSavedLang() ?? "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  defaultNS: "translation",
});

export default i18n;
