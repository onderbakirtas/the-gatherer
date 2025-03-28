// Language manager for translations
export class LanguageManager {
  private static instance: LanguageManager;
  private translations: Record<string, any> = {};
  private currentLanguage: string = 'tr';
  private onLanguageChangeCallbacks: Array<() => void> = [];

  private constructor() {
    // Private constructor to enforce singleton
  }

  public static getInstance(): LanguageManager {
    if (!LanguageManager.instance) {
      LanguageManager.instance = new LanguageManager();
    }
    return LanguageManager.instance;
  }

  public async init(): Promise<void> {
    // Load saved language preference or default to English
    const savedLanguage = localStorage.getItem('language');
    if (savedLanguage) {
      this.currentLanguage = savedLanguage;
    }

    // Load translations for current language
    await this.loadTranslations(this.currentLanguage);
  }

  public async loadTranslations(language: string): Promise<void> {
    try {
      const response = await fetch(`/locales/${language}/translation.json`);
      if (!response.ok) {
        console.error(`Failed to load translations for ${language}`);
        // If failed and not English, try to fall back to English
        if (language !== 'en') {
          await this.loadTranslations('en');
        }
        return;
      }

      this.translations = await response.json();
      this.currentLanguage = language;
      localStorage.setItem('language', language);

      // Notify all subscribers about language change
      this.notifyLanguageChanged();
    } catch (error) {
      console.error('Error loading translations:', error);
      // If error and not English, try to fall back to English
      if (language !== 'en') {
        await this.loadTranslations('en');
      }
    }
  }

  public getTranslation(key: string): string {
    // Split the key by dots to navigate the nested structure
    const keys = key.split('.');
    let result = this.translations;

    // Navigate through the keys
    for (const k of keys) {
      if (result && result[k] !== undefined) {
        result = result[k];
      } else {
        console.warn(`Translation key not found: ${key}`);
        return key; // Return the key itself as fallback
      }
    }

    // Return the translation or the key if not found
    return typeof result === 'string' ? result : key;
  }

  public getCurrentLanguage(): string {
    return this.currentLanguage;
  }

  public onLanguageChange(callback: () => void): void {
    this.onLanguageChangeCallbacks.push(callback);
  }

  private notifyLanguageChanged(): void {
    for (const callback of this.onLanguageChangeCallbacks) {
      callback();
    }
  }
}

// Shorthand function for getting translations
export function t(key: string): string {
  return LanguageManager.getInstance().getTranslation(key);
}