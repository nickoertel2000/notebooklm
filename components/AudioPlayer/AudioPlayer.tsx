"use client"

import { useEffect, useRef, useState } from "react"
import "material-symbols/outlined.css"
import styles from "./AudioPlayer.module.scss"

// Auswählbare Wiedergabegeschwindigkeiten (siehe Vorgabe).
const SPEEDS = [0.5, 0.8, 1.0, 1.2, 1.5, 1.8, 2.0]

function formatTime(s: number): string {
  if (!Number.isFinite(s)) return "0:00"
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, "0")}`
}

function speedLabel(rate: number): string {
  return `${rate.toFixed(1).replace(".", ",")}-fach`
}

type AudioPlayerProps = {
  title: string
  src: string
  onClose: () => void
}

export default function AudioPlayer({ title, src, onClose }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [rate, setRate] = useState(1.0)
  const [speedOpen, setSpeedOpen] = useState(false)

  // Beim Wechsel der Quelle (anderes Audio gewählt) gewählte Geschwindigkeit
  // wieder anwenden und von vorne starten.
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.playbackRate = rate
    a.play().catch(() => {})
    // rate bewusst nicht in Deps: nur bei Quellenwechsel neu starten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  // Geschwindigkeits-Menü bei Klick außerhalb schließen.
  useEffect(() => {
    if (!speedOpen) return
    const close = () => setSpeedOpen(false)
    document.addEventListener("click", close)
    return () => document.removeEventListener("click", close)
  }, [speedOpen])

  function togglePlay() {
    const a = audioRef.current
    if (!a) return
    if (a.paused) a.play().catch(() => {})
    else a.pause()
  }

  function skip(delta: number) {
    const a = audioRef.current
    if (!a) return
    const max = a.duration || duration || 0
    a.currentTime = Math.min(Math.max(0, a.currentTime + delta), max)
  }

  function seek(value: number) {
    const a = audioRef.current
    if (!a) return
    a.currentTime = value
    setCurrent(value)
  }

  function changeRate(r: number) {
    const a = audioRef.current
    if (a) a.playbackRate = r
    setRate(r)
    setSpeedOpen(false)
  }

  return (
    <div className={styles.player}>
      <audio
        ref={audioRef}
        src={src}
        autoPlay
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => setPlaying(false)}
      />

      <div className={styles.top}>
        <span className={styles.title}>{title}</span>
        <button className={styles.iconBtn} onClick={onClose} aria-label="Player schließen">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <input
        className={styles.seek}
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={current}
        onChange={(e) => seek(Number(e.target.value))}
        aria-label="Wiedergabeposition"
        style={{ "--seek-pct": `${duration > 0 ? (current / duration) * 100 : 0}%` } as React.CSSProperties}
      />

      <div className={styles.time}>
        {formatTime(current)} / {formatTime(duration)}
      </div>

      <div className={styles.controls}>
        <div className={styles.speedWrap} onClick={(e) => e.stopPropagation()}>
          <button className={styles.speedBtn} onClick={() => setSpeedOpen((o) => !o)}>
            {speedLabel(rate)}
          </button>
          {speedOpen && (
            <div className={styles.speedMenu} role="menu">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  className={`${styles.speedItem} ${s === rate ? styles.speedItemActive : ""}`}
                  onClick={() => changeRate(s)}
                >
                  <span className="material-symbols-outlined">play_circle</span>
                  {speedLabel(s)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.transport}>
          <button className={styles.iconBtn} onClick={() => skip(-10)} aria-label="10 Sekunden zurück">
            <span className="material-symbols-outlined">replay_10</span>
          </button>
          <button className={styles.playBtn} onClick={togglePlay} aria-label={playing ? "Pause" : "Wiedergabe"}>
            <span className="material-symbols-outlined">{playing ? "pause" : "play_arrow"}</span>
          </button>
          <button className={styles.iconBtn} onClick={() => skip(10)} aria-label="10 Sekunden vor">
            <span className="material-symbols-outlined">forward_10</span>
          </button>
        </div>

        {/* Platzhalter rechts, damit die Transport-Steuerung mittig bleibt. */}
        <div className={styles.spacer} />
      </div>
    </div>
  )
}
