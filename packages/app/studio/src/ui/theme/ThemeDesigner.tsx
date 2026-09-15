import css from "./ThemeDesigner.sass?inline"
import {createElement} from "@opendaw/lib-jsx"
import {Html} from "@opendaw/lib-dom"
import {Dialog} from "@/ui/components/Dialog"
import {Surface} from "@/ui/surface/Surface"
import {IconSymbol} from "@opendaw/studio-enums"
import {applyHostingTheme, DefaultHostingTheme, HostingTheme, loadHostingTheme, resetHostingTheme, saveHostingTheme} from "./HostingTheme"

const className = Html.adoptStyleSheet(css, "ThemeDesigner")
const MaxImageBytes = 1_500_000

const readImage = async (file: File): Promise<string> => {
    if (!file.type.startsWith("image/")) {throw new Error("Please choose an image file.")}
    if (file.size > MaxImageBytes) {throw new Error("Images must be smaller than 1.5 MB.")}
    return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error("The image could not be read."))
        reader.onload = () => resolve(String(reader.result))
        reader.readAsDataURL(file)
    })
}

export const showThemeDesigner = (): void => {
    let draft: HostingTheme = loadHostingTheme()
    const error = <div style={{minHeight: "1.2em", color: "var(--color-red)", fontSize: "0.8em"}}/>
    const previewLogo = <img className="preview-logo" alt="Custom logo"/>
    const logoPreview = <img alt="Logo preview"/>
    const backgroundPreview = <img alt="Background preview"/>
    const setPreview = () => {
        applyHostingTheme(draft)
        previewLogo.src = draft.logo ?? "/images/metal-duck-studio-logo-600.webp"
        logoPreview.src = draft.logo ?? ""
        backgroundPreview.src = draft.backgroundImage ?? ""
        logoPreview.hidden = !draft.logo
        backgroundPreview.hidden = !draft.backgroundImage
    }
    const colorInput = (label: string, key: keyof Pick<HostingTheme, "background" | "surface" | "accent" | "secondary" | "text">) => {
        const input = <input type="color" value={draft[key]} aria-label={label}/>
        input.oninput = () => {draft = {...draft, [key]: input.value}; setPreview()}
        return <label><span>{label}</span>{input}</label>
    }
    const uploadInput = (label: string, key: "logo" | "backgroundImage", preview: HTMLImageElement) => {
        const input = <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" aria-label={label}/>
        input.onchange = async () => {
            const file = input.files?.[0]
            if (!file) {return}
            try {
                draft = {...draft, [key]: await readImage(file)}
                error.textContent = ""
                setPreview()
            } catch (reason) {
                error.textContent = reason instanceof Error ? reason.message : String(reason)
            }
        }
        const remove = <button className="remove-image" onclick={() => {draft = {...draft, [key]: undefined}; setPreview()}}>Remove image</button>
        return <div className="upload"><label><span>{label}</span>{input}</label>{preview}{remove}</div>
    }
    const dialog: HTMLDialogElement = (
        <Dialog headline="Theme Designer" icon={IconSymbol.Vaporisateur} cancelable={true}
                onCancel={() => applyHostingTheme(loadHostingTheme())}
                buttons={[{
                    text: "Reset", onClick: () => {
                        draft = {...DefaultHostingTheme}
                        resetHostingTheme()
                        dialog.close()
                    }
                }, {text: "Cancel", onClick: handler => handler.close()}, {
                    text: "Save theme", primary: true, onClick: handler => {
                        try {
                            saveHostingTheme(draft)
                            handler.close()
                        } catch {
                            error.textContent = "Your browser could not save this theme. Try a smaller image."
                        }
                    }
                }]}>
            <div className={className}>
                <p>Personalize this hosted studio. Changes are previewed live and saved in this browser.</p>
                <div className="color-grid">
                    {colorInput("Canvas", "background")}
                    {colorInput("Surface", "surface")}
                    {colorInput("Accent", "accent")}
                    {colorInput("Secondary", "secondary")}
                    {colorInput("Text", "text")}
                </div>
                <div className="uploads">
                    {uploadInput("Studio logo", "logo", logoPreview)}
                    {uploadInput("Dashboard background", "backgroundImage", backgroundPreview)}
                </div>
                <div className="preview">
                    <div className="preview-brand">{previewLogo}<span>Your hosted studio</span></div>
                    <span className="preview-action">Create a project</span>
                </div>
                {error}
            </div>
        </Dialog>
    )
    setPreview()
    Surface.get().flyout.appendChild(dialog)
    dialog.showModal()
}
