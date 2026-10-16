import i18n from 'i18next'
import { initReactI18next, useTranslation } from 'react-i18next'
import type { Lang, Text } from '../rules/types'
import { en, fr, mfe } from './locales'

const STORAGE_KEY = 'cc.lang'
export const LANGS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'fr', label: 'FR' },
  { value: 'mfe', label: 'KR' },
]

function savedLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'en' || v === 'fr' || v === 'mfe') return v
  } catch {
    // storage unavailable: fall back to English
  }
  return 'en'
}

export function saveLang(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // not critical
  }
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr }, mfe: { translation: mfe } },
  lng: savedLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

/** Picks the current language from a rules-file Text, falling back to English. */
export function useText() {
  const { i18n: inst } = useTranslation()
  const lang = inst.language as Lang
  return (text: Text) => text[lang] || text.en
}

export default i18n
