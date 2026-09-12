import css from "./Footer.sass?inline"
import {createElement, Frag, LocalLink, replaceChildren} from "@opendaw/lib-jsx"
import {isDefined, isNotNull, Lifecycle, Nullable, Terminator, TimeSpan} from "@opendaw/lib-std"
import {StudioService} from "@/service/StudioService"
import {Surface} from "@/ui/surface/Surface"
import {AnimationFrame, Events, Html} from "@opendaw/lib-dom"
import {Runtime} from "@opendaw/lib-runtime"
import {FooterLabel} from "@/service/FooterLabel"
import {MissingAssetEntry, ProjectMeta, ProjectProfile, StudioPreferences} from "@opendaw/studio-core"
import {Colors} from "@opendaw/studio-enums"
import {AudioData} from "@opendaw/lib-dsp"
import {FooterItem} from "@/ui/FooterItem"
import {EngineAddresses} from "@opendaw/studio-adapters"
import {LatencyWarning} from "@/ui/LatencyWarning"
import {MissingAssetsWarning} from "@/ui/MissingAssetsWarning"

const className = Html.adoptStyleSheet(css, "footer")

type Construct = { lifecycle: Lifecycle, service: StudioService }

export const Footer = ({lifecycle, service}: Construct) => {
    const {audioContext, buildInfo, engine, projectProfileService} = service
    return (
        <footer className={className}>
            <FooterItem title="Online" onInit={({value}) => {
                const updateOnline = () => value.textContent = navigator.onLine ? "Yes" : "No"
                lifecycle.ownAll(
                    Events.subscribe(window, "online", updateOnline),
                    Events.subscribe(window, "offline", updateOnline))
                updateOnline()
            }}/>
            <FooterItem className="name" title="Project"
                        onInit={({component, value}) => {
                            const profileLifecycle = lifecycle.own(new Terminator())
                            lifecycle.ownAll(
                                Events.subscribeDblDwn(component, event => {
                                    const optProfile = projectProfileService.getValue()
                                    if (optProfile.isEmpty()) {return}
                                    const profile = optProfile.unwrap()
                                    const name = profile.meta.name
                                    if (isDefined(name)) {
                                        Surface.get(component).requestFloatingTextInput(event, name)
                                            .then(name => profile.updateMetaData("name", name))
                                    }
                                }),
                                projectProfileService.catchupAndSubscribe(optProfile => {
                                    profileLifecycle.terminate()
                                    if (optProfile.nonEmpty()) {
                                        const profile = optProfile.unwrap()
                                        const observer = (meta: ProjectMeta) => value.textContent = meta.name
                                        profileLifecycle.own(profile.subscribeMetaData(observer))
                                        observer(profile.meta)
                                    } else {
                                        value.textContent = "âï¸Ž"
                                    }
                                }))
                        }}/>
            <FooterItem title="Missing Assets" className="missing-assets"
                        onInit={({component, value}) => {
                            const profileLifecycle = lifecycle.own(new Terminator())
                            const state: { panel: Nullable<HTMLElement>, open: boolean } = {panel: null, open: false}
                            const closePanel = () => {state.panel?.remove(); state.panel = null}
                            // Re-rendered (not patched) whenever the entry list changes, including right after
                            // the user resolves one — stays open across that, closes on its own once empty.
                            const render = (entries: ReadonlyArray<MissingAssetEntry>, profile: ProjectProfile) => {
                                component.classList.toggle("hidden", entries.length === 0)
                                value.textContent = entries.length === 0 ? "" : String(entries.length)
                                closePanel()
                                if (!state.open || entries.length === 0) {
                                    state.open = false
                                    return
                                }
                                const panel: HTMLElement = (
                                    <MissingAssetsWarning anchor={component} entries={entries} onResolve={async entry => {
                                        const assetService = entry.kind === "sample"
                                            ? service.sampleService : service.soundfontService
                                        const manager = entry.kind === "sample"
                                            ? service.sampleManager : service.soundfontManager
                                        const resolved = await assetService.resolveOne(entry.uuid, entry.fileName, manager)
                                        if (resolved) {profile.resolveMissingAsset(entry.uuid)}
                                        return resolved
                                    }}/>
                                )
                                state.panel = panel
                                component.appendChild(panel)
                            }
                            lifecycle.ownAll(
                                Events.subscribe(component, "click", () => {
                                    state.open = !state.open
                                    projectProfileService.getValue().ifSome(profile =>
                                        render(profile.missingAssets, profile))
                                }),
                                {terminate: closePanel},
                                projectProfileService.catchupAndSubscribe(optProfile => {
                                    profileLifecycle.terminate()
                                    state.open = false
                                    component.classList.add("hidden")
                                    value.textContent = ""
                                    if (optProfile.isEmpty()) {return}
                                    const profile = optProfile.unwrap()
                                    profileLifecycle.own(profile.catchupAndSubscribeMissingAssets(entries =>
                                        render(entries, profile)))
                                }))
                        }}/>
            <FooterItem title="SampleRate">{audioContext.sampleRate}</FooterItem>
            <FooterItem title="Latency" minWidth="6ch"
                        onInit={({component, value}) => {
                            const threshold = () =>
                                StudioPreferences.settings.engine["latency-warning-threshold"] / 1000.0
                            const state: { warning: Nullable<HTMLElement>, dismissed: boolean } =
                                {warning: null, dismissed: false}
                            const hide = () => {
                                state.warning?.remove()
                                state.warning = null
                            }
                            const show = () => {
                                if (isNotNull(state.warning) || state.dismissed) {return}
                                const warning: HTMLElement = (
                                    <LatencyWarning anchor={component} dismiss={() => {
                                        state.dismissed = true
                                        hide()
                                    }}/>
                                )
                                state.warning = warning
                                component.appendChild(warning)
                            }
                            lifecycle.ownAll(
                                Runtime.scheduleInterval(() => {
                                    const outputLatency = audioContext.outputLatency
                                    if (outputLatency > 0.0) {
                                        value.textContent = `${(outputLatency * 1000.0).toFixed(1)}ms`
                                        value.style.color = outputLatency > threshold()
                                            ? Colors.orange.toString() : ""
                                    }
                                    if (outputLatency > threshold()) {show()} else {hide()}
                                }, 1000),
                                {terminate: hide}
                            )
                        }}>N/A</FooterItem>
            <FooterItem title="CPU Load" minWidth="4ch"
                        onInit={({component, value}) => {
                            lifecycle.own(engine.preferences.catchupAndSubscribe(enabled => {
                                component.classList.toggle("hidden", !enabled)
                            }, "debug", "dspLoadMeasurement"))
                            lifecycle.own(engine.cpuLoad.catchupAndSubscribe(owner => {
                                const percent = Math.min(owner.getValue(), 100)
                                value.textContent = `${percent}%`
                                value.style.color = percent >= 100 ? Colors.red.toString()
                                    : percent > 75 ? Colors.orange.toString() : ""
                            }))
                        }}>0%</FooterItem>
            <FooterItem title="Memory" minWidth="7ch"
                        onInit={({value}) => {
                            const runtime = lifecycle.own(new Terminator())
                            const megabytes = (bytes: number) => (bytes / (1024 * 1024)).toFixed(0)
                            lifecycle.own(projectProfileService.catchupAndSubscribe(optProfile => {
                                runtime.terminate()
                                if (optProfile.isEmpty()) {
                                    value.textContent = "N/A"
                                    return
                                }
                                const {project} = optProfile.unwrap()
                                runtime.own(project.liveStreamReceiver
                                    .subscribeFloats(EngineAddresses.HEAP, values =>
                                        value.textContent =
                                            `${megabytes(values[0])}/${megabytes(values[2])}M`))
                            }))
                        }}>N/A</FooterItem>
            <FooterItem title="FPS"
                        onInit={({component, value}) => {
                            const lifeSpan = lifecycle.own(new Terminator())
                            lifecycle.own(StudioPreferences.catchupAndSubscribe(show => {
                                component.classList.toggle("hidden", !show)
                                if (show) {
                                    let frame = 0 | 0
                                    let lastTime = Date.now()
                                    lifeSpan.own(AnimationFrame.add(() => {
                                        if (Date.now() - lastTime >= 1000) {
                                            value.textContent = String(frame)
                                            lastTime = Date.now()
                                            frame = 0
                                        } else {frame++}
                                    }))
                                } else {
                                    lifeSpan.terminate()
                                }
                            }, "debug", "footer-show-fps-meter"))
                        }}>0</FooterItem>
            <FooterItem title="Samples (GC)"
                        onInit={({component, value}) => {
                            const lifeSpan = lifecycle.own(new Terminator())
                            lifecycle.own(StudioPreferences.catchupAndSubscribe(show => {
                                component.classList.toggle("hidden", !show)
                                if (show) {
                                    lifeSpan.own(Runtime.scheduleInterval(() => {
                                        value.textContent = AudioData.count().toString()
                                    }, 1000))
                                } else {
                                    lifeSpan.terminate()
                                }
                            }, "debug", "footer-show-samples-memory"))
                        }}>0</FooterItem>
            <div style={{display: "contents"}}
                 onInit={element => {
                     const lifeSpan = lifecycle.own(new Terminator())
                     lifecycle.own(StudioPreferences.catchupAndSubscribe(show => {
                         element.classList.toggle("hidden", !show)
                         if (show) {
                             replaceChildren(element, (
                                 <Frag>
                                     <FooterItem title="Build Version">{buildInfo.uuid}</FooterItem>
                                     <FooterItem title="Build Time"
                                                 onInit={({value}) => {
                                                     const buildDateMillis = new Date(buildInfo.date).getTime()
                                                     const update = () => value.textContent =
                                                         TimeSpan.millis(buildDateMillis - new Date().getTime()).toUnitString()
                                                     lifeSpan.own(Runtime.scheduleInterval(update, 1000))
                                                     update()
                                                 }}/>
                                 </Frag>
                             ))
                         } else {
                             replaceChildren(element)
                             lifeSpan.terminate()
                         }
                     }, "debug", "footer-show-build-infos"))
                 }}/>
            <FooterItem title="Users"
                        onInit={({value}) => {
                            value.textContent = "local"
                        }}>#</FooterItem>
            <div style={{display: "contents"}}
                 onInit={element => service.registerFooter((): FooterLabel => {
                     let titleRef!: HTMLElement
                     let valueRef!: HTMLElement
                     const item: HTMLElement = <FooterItem title="" onInit={({title, value}) => {
                         titleRef = title
                         valueRef = value
                     }}/>
                     element.appendChild(item)
                     return {
                         setTitle: (text: string) => titleRef.textContent = text,
                         setValue: (text: string) => valueRef.textContent = text,
                         terminate: () => {if (item.isConnected) {item.remove()}}
                     } satisfies FooterLabel
                 })}/>
            <div style={{flex: "1"}}/>
            <div style={{color: 'var(--md-primary-cyan)'}}>
                <LocalLink href="/privacy">Privacy</LocalLink> · <LocalLink href="/imprint">Imprint</LocalLink>
                <span style={{marginLeft: '0.75rem'}}>Metal-Duck Studio — write loud. mix neon.</span>
            </div>
        </footer>
    )
}



