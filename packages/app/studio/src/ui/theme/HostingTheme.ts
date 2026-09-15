export type HostingTheme = {
    background: string
    surface: string
    accent: string
    secondary: string
    text: string
    logo?: string
    backgroundImage?: string
}

const StorageKey = "opendaw-hosting-theme"
export const HostingThemeChanged = "opendaw-hosting-theme-changed"

export const DefaultHostingTheme: HostingTheme = {
    background: "#100b1e",
    surface: "#201833",
    accent: "#42e8ff",
    secondary: "#ff5bcf",
    text: "#edfaff"
}

const isColor = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)

export const loadHostingTheme = (): HostingTheme => {
    try {
        const saved = JSON.parse(localStorage.getItem(StorageKey) ?? "{}") as Partial<HostingTheme>
        return {
            ...DefaultHostingTheme,
            ...(isColor(saved.background) ? {background: saved.background} : {}),
            ...(isColor(saved.surface) ? {surface: saved.surface} : {}),
            ...(isColor(saved.accent) ? {accent: saved.accent} : {}),
            ...(isColor(saved.secondary) ? {secondary: saved.secondary} : {}),
            ...(isColor(saved.text) ? {text: saved.text} : {}),
            ...(typeof saved.logo === "string" ? {logo: saved.logo} : {}),
            ...(typeof saved.backgroundImage === "string" ? {backgroundImage: saved.backgroundImage} : {})
        }
    } catch {
        return {...DefaultHostingTheme}
    }
}

export const applyHostingTheme = (theme: HostingTheme): void => {
    const root = document.documentElement.style
    root.setProperty("--md-surface-ink", theme.background)
    root.setProperty("--md-surface-deep", theme.background)
    root.setProperty("--md-surface-panel", theme.surface)
    root.setProperty("--md-surface-panel-bright", theme.surface)
    root.setProperty("--md-primary-cyan", theme.accent)
    root.setProperty("--md-secondary-magenta", theme.secondary)
    root.setProperty("--color-background", theme.background)
    root.setProperty("--color-panel-background", theme.surface)
    root.setProperty("--color-panel-background-bright", theme.surface)
    root.setProperty("--color-panel-background-dark", theme.background)
    root.setProperty("--color-bright", theme.accent)
    root.setProperty("--color-blue", theme.accent)
    root.setProperty("--color-green", theme.accent)
    root.setProperty("--color-red", theme.secondary)
    root.setProperty("--color-magenta", theme.secondary)
    root.setProperty("--color-dark", theme.text)
    root.setProperty("--color-shadow", theme.text)
    root.setProperty("--hosting-background-image", theme.backgroundImage ? `url("${theme.backgroundImage}")` : "none")
}

export const saveHostingTheme = (theme: HostingTheme): void => {
    localStorage.setItem(StorageKey, JSON.stringify(theme))
    applyHostingTheme(theme)
    window.dispatchEvent(new Event(HostingThemeChanged))
}

export const resetHostingTheme = (): void => {
    localStorage.removeItem(StorageKey)
    applyHostingTheme(DefaultHostingTheme)
    window.dispatchEvent(new Event(HostingThemeChanged))
}
