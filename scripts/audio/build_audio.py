#!/usr/bin/env python3
"""
Baut die Spiel-Sounds (assets/audio/**) aus freien Aufnahmen + Synthese.

Quelle: Red-Eclipse-Soundpaket (https://github.com/redeclipse/sounds, CC-BY-SA 4.0 /
CC-BY 3.0 / CC0 je Verzeichnis — Details in assets/audio/CREDITS.md). Jede Datei wird
mono gemischt, getrimmt, per Tonhöhe/EQ/Hüllkurve umgeformt, mit synthetischen
Schichten (Tiefton-Punch, Knall-Transiente, Mechanik-Klick) kombiniert, auf -1 dBFS
normalisiert und als Ogg Vorbis (Chromium/Firefox) + AAC/M4A (Safari) kodiert.

Aufruf (Entwickler-Werkzeug, nicht Teil des Builds):
  python3 -m venv /tmp/venv && /tmp/venv/bin/pip install numpy scipy
  git clone --depth 1 https://github.com/redeclipse/sounds /tmp/re-sounds
  /tmp/venv/bin/python scripts/audio/build_audio.py /tmp/re-sounds assets/audio

Benötigt ffmpeg mit libvorbis + aac im PATH. Ergebnis ist deterministisch (feste Seeds).
"""
from __future__ import annotations

import os
import subprocess
import sys

import numpy as np
from scipy import signal

SR = 44100
AMB_SR = 32000
SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/re-sounds'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'assets/audio'
ONLY = sys.argv[3] if len(sys.argv) > 3 else ''

USED: dict[str, set[str]] = {}
_current: list[str] = []


# ----------------------------------------------------------------------------- Grundbausteine

def load(rel: str, sr: int = SR) -> np.ndarray:
    """Quelle laden (mono, float32)."""
    if _current:
        USED.setdefault(rel, set()).add(_current[-1])
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', os.path.join(SRC, rel), '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def secs(t: float, sr: int = SR) -> int:
    return int(round(t * sr))


def cut(x: np.ndarray, t0: float, t1: float | None = None, sr: int = SR) -> np.ndarray:
    return x[secs(t0, sr): (secs(t1, sr) if t1 is not None else len(x))].copy()


def trim_start(x: np.ndarray, thr_db: float = -45, pre: float = 0.002) -> np.ndarray:
    peak = np.max(np.abs(x)) + 1e-12
    idx = np.nonzero(np.abs(x) > peak * 10 ** (thr_db / 20))[0]
    if len(idx) == 0:
        return x
    return x[max(0, idx[0] - secs(pre)):].copy()


def trim_end(x: np.ndarray, thr_db: float = -60) -> np.ndarray:
    peak = np.max(np.abs(x)) + 1e-12
    idx = np.nonzero(np.abs(x) > peak * 10 ** (thr_db / 20))[0]
    if len(idx) == 0:
        return x
    return x[: idx[-1] + 1].copy()


def fade(x: np.ndarray, fin: float = 0.002, fout: float = 0.03, sr: int = SR) -> np.ndarray:
    y = x.copy()
    a, b = min(len(y), secs(fin, sr)), min(len(y), secs(fout, sr))
    if a > 1:
        y[:a] *= np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    if b > 1:
        y[-b:] *= np.cos(np.linspace(0, np.pi / 2, b)) ** 2
    return y


def pitch(x: np.ndarray, f: float) -> np.ndarray:
    """Tonband-Tonhöhe (ändert auch die Länge)."""
    if abs(f - 1) < 1e-4:
        return x.copy()
    down = int(round(1000 * f))
    g = np.gcd(1000, down)
    return signal.resample_poly(x, 1000 // g, down // g)


def _sos(kind: str, f, order: int = 2, sr: int = SR):
    return signal.butter(order, f, btype=kind, fs=sr, output='sos')


def hp(x, f, order=2, sr=SR):
    return signal.sosfilt(_sos('highpass', f, order, sr), x)


def lp(x, f, order=2, sr=SR):
    return signal.sosfilt(_sos('lowpass', min(f, sr / 2 - 100), order, sr), x)


def bp(x, f0, f1, order=2, sr=SR):
    return signal.sosfilt(_sos('bandpass', [f0, min(f1, sr / 2 - 100)], order, sr), x)


def peq(x, f, gain_db, q=1.0, sr=SR):
    """RBJ-Glockenfilter."""
    a = 10 ** (gain_db / 40)
    w = 2 * np.pi * f / sr
    al = np.sin(w) / (2 * q)
    b = [1 + al * a, -2 * np.cos(w), 1 - al * a]
    aa = [1 + al / a, -2 * np.cos(w), 1 - al / a]
    return signal.lfilter(b, aa, x)


def shelf(x, f, gain_db, high=True, sr=SR):
    """RBJ-Kuhschwanzfilter (S = 1)."""
    a = 10 ** (gain_db / 40)
    w = 2 * np.pi * f / sr
    cs, al = np.cos(w), np.sin(w) / 2 * np.sqrt(2)
    sa = 2 * np.sqrt(a) * al
    if high:
        b = [a * ((a + 1) + (a - 1) * cs + sa), -2 * a * ((a - 1) + (a + 1) * cs), a * ((a + 1) + (a - 1) * cs - sa)]
        aa = [(a + 1) - (a - 1) * cs + sa, 2 * ((a - 1) - (a + 1) * cs), (a + 1) - (a - 1) * cs - sa]
    else:
        b = [a * ((a + 1) - (a - 1) * cs + sa), 2 * a * ((a - 1) - (a + 1) * cs), a * ((a + 1) - (a - 1) * cs - sa)]
        aa = [(a + 1) + (a - 1) * cs + sa, -2 * ((a - 1) + (a + 1) * cs), (a + 1) + (a - 1) * cs - sa]
    return signal.lfilter(b, aa, x)


def tvec(n: int, sr: int = SR) -> np.ndarray:
    return np.arange(n) / sr


def decay_after(x: np.ndarray, hold: float, tau: float, sr: int = SR) -> np.ndarray:
    """Ab `hold` Sekunden exponentiell ausklingen lassen (Nachhall kürzen)."""
    t = tvec(len(x), sr)
    env = np.where(t < hold, 1.0, np.exp(-(t - hold) / tau))
    return x * env


def fit(x: np.ndarray, length: float, sr: int = SR) -> np.ndarray:
    n = secs(length, sr)
    if len(x) >= n:
        return x[:n].copy()
    return np.concatenate([x, np.zeros(n - len(x))])


def noise(dur: float, seed: int, sr: int = SR) -> np.ndarray:
    return np.random.default_rng(seed).uniform(-1, 1, secs(dur, sr))


def sweep(dur: float, f0: float, f1: float, glide: float, tau: float, sr: int = SR) -> np.ndarray:
    """Sinus mit exponentiellem Frequenzabfall f0 → f1 (Zeitkonstante glide) und Abklingen tau."""
    t = tvec(secs(dur, sr), sr)
    f = f1 + (f0 - f1) * np.exp(-t / glide)
    ph = 2 * np.pi * np.cumsum(f) / sr
    return np.sin(ph) * np.exp(-t / tau)


def tone(dur: float, freqs, tau: float, attack: float = 0.004, sr: int = SR, partial_decay=None) -> np.ndarray:
    """Summe von Sinus-Teiltönen [(f, gain)] mit Anschlag und Abklingen."""
    t = tvec(secs(dur, sr), sr)
    y = np.zeros_like(t)
    for i, fg in enumerate(freqs):
        f, g = fg
        k = tau if partial_decay is None else tau * partial_decay ** i
        y += g * np.sin(2 * np.pi * f * t) * np.exp(-t / k)
    att = np.clip(t / max(attack, 1e-4), 0, 1)
    return y * att


def burst(dur: float, tau: float, seed: int, lo: float | None = None, hi: float | None = None, sr: int = SR) -> np.ndarray:
    """Rausch-Transiente (Knall/Klick)."""
    n = noise(dur, seed, sr) * np.exp(-tvec(secs(dur, sr), sr) / tau)
    if lo and hi:
        return bp(n, lo, hi, sr=sr)
    if lo:
        return hp(n, lo, sr=sr)
    if hi:
        return lp(n, hi, sr=sr)
    return n


def sat(x: np.ndarray, drive: float) -> np.ndarray:
    if drive <= 0:
        return x
    p = np.max(np.abs(x)) + 1e-12
    return np.tanh(drive * x / p) / np.tanh(drive) * p


def norm(x: np.ndarray, peak_db: float = -1.0) -> np.ndarray:
    p = np.max(np.abs(x)) + 1e-12
    return x / p * 10 ** (peak_db / 20)


def rms_norm(x: np.ndarray, db: float) -> np.ndarray:
    r = np.sqrt(np.mean(x ** 2)) + 1e-12
    return x / r * 10 ** (db / 20)


def mix(parts, sr: int = SR) -> np.ndarray:
    """parts: (signal, gain, offset_s) — Signale werden vorher auf Spitze 1 normiert."""
    n = max(secs(o, sr) + len(s) for s, g, o in parts)
    y = np.zeros(n)
    for s, g, o in parts:
        i = secs(o, sr)
        y[i:i + len(s)] += g * s / (np.max(np.abs(s)) + 1e-12)
    return y


def echoes(x: np.ndarray, taps, sr: int = SR, lp_hz: float = 3000) -> np.ndarray:
    """Diskrete, tiefpassgefilterte Echos [(delay_s, gain)] (Entfernung/Gebäude)."""
    n = len(x) + secs(max(d for d, _ in taps), sr)
    y = np.zeros(n)
    y[: len(x)] += x
    wet = lp(x, lp_hz, sr=sr)
    for d, g in taps:
        i = secs(d, sr)
        y[i:i + len(x)] += g * wet
    return y


def seamless_loop(x: np.ndarray, length: float, xfade: float, start: float = 0.0, sr: int = SR) -> np.ndarray:
    """Nahtlose Schleife: Ende (length..length+xfade) wird in den Anfang überblendet."""
    s = secs(start, sr)
    L, X = secs(length, sr), secs(xfade, sr)
    seg = x[s:s + L + X]
    if len(seg) < L + X:
        raise ValueError('Quelle zu kurz für Schleife')
    head, mid, tail = seg[:X], seg[X:L], seg[L:L + X]
    k = np.linspace(0, np.pi / 2, X)
    blend = tail * np.cos(k) + head * np.sin(k)
    return np.concatenate([mid, blend])


# ----------------------------------------------------------------------------- Ausgabe

def write(name: str, x: np.ndarray, kind: str = 'sfx', peak_db: float = -1.5) -> None:
    sr = AMB_SR if kind == 'amb' else SR
    y = norm(x, peak_db) if kind != 'amb-raw' else x
    if kind == 'amb-raw':
        sr = AMB_SR
    if kind == 'sfx':
        y = fade(y, 0.0005, 0.01)
    pcm = np.clip(y, -1, 1).astype('<f4').tobytes()
    path = os.path.join(OUT, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if kind.startswith('amb'):
        ogg = ['-c:a', 'libvorbis', '-q:a', '1']
        aac = ['-c:a', 'aac', '-b:a', '48k']
    else:
        ogg = ['-c:a', 'libvorbis', '-q:a', '3']
        aac = ['-c:a', 'aac', '-b:a', '80k']
    base = ['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(sr), '-ac', '1', '-i', '-', '-map_metadata', '-1']
    subprocess.run(base + ogg + [path + '.ogg'], input=pcm, check=True)
    subprocess.run(base + aac + ['-movflags', '+faststart', path + '.m4a'], input=pcm, check=True)
    print(f'{name:34s} {len(y) / sr:6.2f}s')


def job(name: str):
    """Dekorator-Ersatz: merkt sich die Ausgabe für die Quellenliste."""
    _current.append(name)
    return name


# ----------------------------------------------------------------------------- Waffen

def gun(name: str, src: str, *, p: float = 1.0, hp_hz: float = 90, lp_hz: float | None = None, eq=(),
        hold: float = 0.06, tau: float = 0.12, length: float = 0.6, punch=None, crack=None, mech=None,
        drive: float = 1.2, seed: int = 1, low_shelf: float = 0.0, high_shelf: float = 0.0) -> None:
    job(name)
    x = trim_start(load(src), -30)
    x = pitch(x, p)
    x = hp(x, hp_hz)
    if lp_hz:
        x = lp(x, lp_hz, 2)
    for f, g, q in eq:
        x = peq(x, f, g, q)
    if low_shelf:
        x = shelf(x, 180, low_shelf, high=False)
    if high_shelf:
        x = shelf(x, 4000, high_shelf, high=True)
    x = decay_after(x, hold, tau)
    parts = [(x, 1.0, 0.0)]
    if punch:  # (f0, f1, glide, tau, gain)
        f0, f1, gl, ta, g = punch
        parts.append((sweep(ta * 6, f0, f1, gl, ta), g, 0.0))
    if crack:  # (gain, lo_hz, tau)
        g, lo, ta = crack
        parts.append((burst(ta * 8, ta, seed, lo=lo), g, 0.0))
    if mech:  # (gain, delay, freq)
        g, d, f = mech
        click = burst(0.03, 0.004, seed + 7, lo=2500) + 0.5 * tone(0.03, [(f, 1.0)], 0.006, 0.0005)
        parts.append((click, g, d))
    y = mix(parts)
    y = sat(y, drive)
    y = fade(fit(y, length), 0.0005, min(0.08, length * 0.3))
    write(f'weapons/{name}', y)


def suppressed(name: str, src: str, *, p: float = 1.0, lp_hz: float = 1900, length: float = 0.32, seed: int = 3,
               mech_f: float = 3400, body: float = 0.55) -> None:
    job(name)
    x = trim_start(load(src), -30)
    x = pitch(x, p)
    x = lp(hp(x, 160), lp_hz, 4)
    x = decay_after(x, 0.012, 0.045)
    pfft = bp(noise(0.12, seed) * np.exp(-tvec(secs(0.12)) / 0.022), 500, 2600)
    thump = sweep(0.12, 210, 90, 0.02, 0.025)
    click = burst(0.03, 0.003, seed + 1, lo=3000) + 0.6 * tone(0.03, [(mech_f, 1.0), (mech_f * 1.47, 0.5)], 0.008, 0.0005)
    y = mix([(x, body, 0.0), (pfft, 0.8, 0.0), (thump, 0.45, 0.0), (click, 0.5, 0.028)])
    y = fade(fit(sat(y, 0.8), length), 0.0005, 0.06)
    write(f'weapons/{name}', y)


def far(name: str, src: str, *, p: float = 1.0, lp_hz: float = 3200, length: float = 1.2, tail: float = 0.35) -> None:
    job(name)
    x = trim_start(load(src), -30)
    x = pitch(x, p)
    x = lp(hp(x, 120), lp_hz, 2)
    x = decay_after(x, 0.05, tail)
    y = echoes(x, [(0.11, 0.35), (0.23, 0.22), (0.41, 0.12)], lp_hz=lp_hz * 0.6)
    y = fade(fit(y, length), 0.003, 0.25)
    write(f'weapons/{name}', y)


def build_guns() -> None:
    P1, P2, P3 = 'weapons/pistol/primary.ogg', 'weapons/pistol/primary2.ogg', 'weapons/pistol/primary3.ogg'
    PS1, PS2 = 'weapons/pistol/secondary.ogg', 'weapons/pistol/secondary2.ogg'
    S1, S2, S3 = 'weapons/smg/primary.ogg', 'weapons/smg/primary2.ogg', 'weapons/smg/primary3.ogg'
    SS1, SS2 = 'weapons/smg/secondary.ogg', 'weapons/smg/secondary2.ogg'
    R1, R2, R3 = 'weapons/rifle/primary.ogg', 'weapons/rifle/primary2.ogg', 'weapons/rifle/primary3.ogg'
    RS1, RS2, RS3 = 'weapons/rifle/secondary.ogg', 'weapons/rifle/secondary2.ogg', 'weapons/rifle/secondary3.ogg'
    G1, G2, G3 = 'weapons/shotgun/primary.ogg', 'weapons/shotgun/primary2.ogg', 'weapons/shotgun/primary3.ogg'

    # --- Pistolen: kurz, knackig; Deagle schwer
    for i, s in enumerate([P1, P2]):
        gun(f'glock_{i + 1}', s, p=1.1, hp_hz=180, eq=[(2800, 3, 1.2)], hold=0.03, tau=0.07, length=0.42,
            crack=(0.5, 2500, 0.006), mech=(0.22, 0.035, 4200), punch=(320, 140, 0.01, 0.03, 0.35), seed=10 + i)
    for i, s in enumerate([P1, P3]):
        gun(f'usp_{i + 1}', s, p=0.96, hp_hz=120, eq=[(900, 3, 1.0)], hold=0.04, tau=0.09, length=0.5,
            crack=(0.4, 2000, 0.008), punch=(260, 110, 0.012, 0.04, 0.5), mech=(0.2, 0.04, 3600), seed=20 + i)
        suppressed(f'usp_sil_{i + 1}', s, p=0.92, lp_hz=1800, seed=24 + i, mech_f=3600)
    for i, s in enumerate([P2, P3]):
        gun(f'p228_{i + 1}', s, p=1.03, hp_hz=150, eq=[(1600, 4, 1.0)], hold=0.035, tau=0.08, length=0.45,
            crack=(0.45, 2200, 0.007), punch=(300, 130, 0.01, 0.035, 0.4), mech=(0.2, 0.035, 3900), seed=30 + i)
    for i, s in enumerate([PS1, PS2]):
        gun(f'deagle_{i + 1}', s, p=0.78, hp_hz=60, low_shelf=5, eq=[(700, 3, 0.9)], hold=0.08, tau=0.2, length=0.95,
            crack=(0.65, 1800, 0.012), punch=(180, 55, 0.02, 0.09, 0.9), mech=(0.18, 0.06, 2800), drive=1.8, seed=40 + i)
    for i, s in enumerate([P3, P2]):
        gun(f'elite_{i + 1}', s, p=1.14, hp_hz=200, eq=[(3200, 4, 1.4)], hold=0.03, tau=0.065, length=0.4,
            crack=(0.5, 2800, 0.005), punch=(340, 150, 0.008, 0.028, 0.3), mech=(0.25, 0.03, 4500), seed=50 + i)
    for i, s in enumerate([P1, P3]):
        gun(f'fiveseven_{i + 1}', s, p=1.24, hp_hz=260, high_shelf=4, hold=0.025, tau=0.06, length=0.38,
            crack=(0.6, 3500, 0.004), punch=(380, 170, 0.008, 0.025, 0.25), mech=(0.22, 0.03, 5000), seed=60 + i)

    # --- MPs: schnell, kurzer Ausklang
    for i, s in enumerate([S1, S2]):
        gun(f'mp5_{i + 1}', s, p=1.06, hp_hz=140, eq=[(1800, 3, 1.0)], hold=0.03, tau=0.07, length=0.36,
            crack=(0.4, 2500, 0.006), punch=(280, 120, 0.01, 0.03, 0.4), seed=70 + i)
    for i, s in enumerate([S1, S3]):
        suppressed(f'tmp_{i + 1}', s, p=1.12, lp_hz=2300, length=0.26, seed=80 + i, mech_f=4200, body=0.7)
    for i, s in enumerate([S2, S3]):
        gun(f'p90_{i + 1}', s, p=1.22, hp_hz=200, high_shelf=1, eq=[(3500, 3, 1.5)], hold=0.025, tau=0.055, length=0.3,
            crack=(0.55, 3200, 0.004), punch=(360, 160, 0.008, 0.022, 0.25), seed=90 + i)
    for i, s in enumerate([S3, S1]):
        gun(f'mac10_{i + 1}', s, p=1.12, hp_hz=200, eq=[(1300, 5, 1.6), (4200, -3, 1.0)], hold=0.025, tau=0.06, length=0.32,
            crack=(0.4, 2000, 0.005), punch=(300, 140, 0.008, 0.025, 0.3), drive=2.2, seed=100 + i)
    for i, s in enumerate([SS1, SS2]):
        gun(f'ump45_{i + 1}', s, p=0.92, hp_hz=90, low_shelf=3, eq=[(600, 3, 1.0)], hold=0.035, tau=0.09, length=0.42,
            crack=(0.35, 1800, 0.008), punch=(220, 90, 0.012, 0.045, 0.55), seed=110 + i)

    # --- Schrotflinten: breit, tief, langer Ausklang
    for i, s in enumerate([G1, G2]):
        gun(f'm3_{i + 1}', s, p=0.9, hp_hz=50, low_shelf=6, hold=0.09, tau=0.22, length=1.0,
            crack=(0.55, 1500, 0.015), punch=(150, 45, 0.025, 0.12, 1.0), drive=1.8, seed=120 + i)
    for i, s in enumerate([G2, G3]):
        gun(f'xm1014_{i + 1}', s, p=1.02, hp_hz=70, low_shelf=4, hold=0.06, tau=0.14, length=0.7,
            crack=(0.5, 1800, 0.012), punch=(170, 55, 0.02, 0.08, 0.8), drive=1.6, seed=130 + i)

    # --- Gewehre
    for i, s in enumerate([R1, R2]):
        gun(f'ak47_{i + 1}', s, p=0.86, hp_hz=60, low_shelf=5, eq=[(450, 3, 0.8), (2400, 2, 1.0)], hold=0.06, tau=0.16, length=0.75,
            crack=(0.7, 1800, 0.01), punch=(190, 60, 0.018, 0.07, 0.6), drive=1.9, seed=140 + i)
    for i, s in enumerate([RS1, RS2]):
        gun(f'm4a1_{i + 1}', s, p=1.04, hp_hz=110, eq=[(1500, 3, 1.0), (5000, 2, 1.2)], hold=0.045, tau=0.12, length=0.6,
            crack=(0.6, 2400, 0.008), punch=(230, 80, 0.014, 0.05, 0.45), drive=1.4, seed=150 + i)
        suppressed(f'm4a1_sil_{i + 1}', s, p=0.95, lp_hz=1500, length=0.38, seed=155 + i, mech_f=3000, body=0.7)
    for i, s in enumerate([R2, R3]):
        gun(f'famas_{i + 1}', s, p=1.12, hp_hz=150, eq=[(2600, 4, 1.2)], hold=0.035, tau=0.1, length=0.5,
            crack=(0.5, 2800, 0.006), punch=(260, 100, 0.012, 0.04, 0.5), seed=160 + i)
    for i, s in enumerate([R3, R1]):
        gun(f'galil_{i + 1}', s, p=0.97, hp_hz=90, eq=[(800, 4, 0.9)], hold=0.05, tau=0.13, length=0.62,
            crack=(0.5, 2000, 0.009), punch=(210, 75, 0.015, 0.06, 0.7), drive=1.6, seed=170 + i)
    for i, s in enumerate([RS2, RS3]):
        gun(f'sg552_{i + 1}', s, p=1.0, hp_hz=100, eq=[(1100, 4, 1.1)], hold=0.045, tau=0.12, length=0.6,
            crack=(0.5, 2200, 0.008), punch=(220, 80, 0.014, 0.05, 0.6), seed=180 + i)
    for i, s in enumerate([RS3, RS1]):
        gun(f'aug_{i + 1}', s, p=1.08, hp_hz=130, eq=[(2000, 3, 1.0)], high_shelf=2, hold=0.04, tau=0.11, length=0.55,
            crack=(0.55, 2600, 0.007), punch=(240, 90, 0.013, 0.045, 0.55), seed=190 + i)

    # --- Scharfschützen: AWP sehr laut und tief, Scout trocken peitschend
    for i, s in enumerate([R1, R3]):
        gun(f'awp_{i + 1}', s, p=0.72, hp_hz=35, low_shelf=7, eq=[(300, 4, 0.7)], hold=0.12, tau=0.45, length=1.7,
            crack=(0.9, 1500, 0.02), punch=(140, 38, 0.03, 0.2, 1.1), drive=2.4, seed=200 + i)
    for i, s in enumerate([RS1, RS3]):
        gun(f'scout_{i + 1}', s, p=1.14, hp_hz=120, high_shelf=3, eq=[(3000, 3, 1.0)], hold=0.05, tau=0.22, length=1.0,
            crack=(0.8, 3000, 0.008), punch=(260, 80, 0.012, 0.05, 0.5), drive=1.5, seed=210 + i)
    for i, s in enumerate([R2, R1]):
        gun(f'g3sg1_{i + 1}', s, p=0.84, hp_hz=60, low_shelf=4, hold=0.07, tau=0.2, length=0.85,
            crack=(0.6, 1700, 0.012), punch=(170, 55, 0.02, 0.08, 0.8), drive=1.8, seed=220 + i)
    for i, s in enumerate([RS2, RS1]):
        gun(f'sg550_{i + 1}', s, p=0.94, hp_hz=80, low_shelf=3, eq=[(1400, 3, 1.0)], hold=0.06, tau=0.18, length=0.8,
            crack=(0.6, 2000, 0.01), punch=(190, 65, 0.018, 0.07, 0.7), drive=1.6, seed=230 + i)

    # --- MG
    for i, s in enumerate([R3, R2]):
        gun(f'm249_{i + 1}', s, p=0.9, hp_hz=60, low_shelf=5, eq=[(500, 4, 0.8)], hold=0.04, tau=0.11, length=0.5,
            crack=(0.55, 1600, 0.009), punch=(180, 60, 0.015, 0.06, 0.85), drive=2.0, seed=240 + i)

    # --- Fernklänge je Klasse (gefiltert, Gebäude-Echos)
    far('far_pistol_1', 'weapons/pistol/primaryfar2.ogg', p=1.05, lp_hz=3500, length=1.0, tail=0.25)
    far('far_pistol_2', 'weapons/pistol/primaryfar3.ogg', p=1.0, lp_hz=3300, length=1.0, tail=0.25)
    far('far_smg_1', 'weapons/smg/primaryfar2.ogg', p=1.05, lp_hz=3400, length=0.9, tail=0.22)
    far('far_smg_2', 'weapons/smg/primaryfar3.ogg', p=1.0, lp_hz=3200, length=0.9, tail=0.22)
    far('far_rifle_1', 'weapons/rifle/primaryfar2.ogg', p=0.92, lp_hz=2800, length=1.3, tail=0.4)
    far('far_rifle_2', 'weapons/rifle/secondaryfar2.ogg', p=0.95, lp_hz=2800, length=1.3, tail=0.4)
    far('far_shotgun_1', 'weapons/shotgun/primaryfar2.ogg', p=0.9, lp_hz=2400, length=1.4, tail=0.45)
    far('far_shotgun_2', 'weapons/shotgun/primaryfar3.ogg', p=0.88, lp_hz=2400, length=1.4, tail=0.45)
    far('far_sniper_1', 'weapons/rifle/primaryfar3.ogg', p=0.75, lp_hz=2200, length=1.8, tail=0.7)
    far('far_sniper_2', 'weapons/rifle/secondaryfar3.ogg', p=0.78, lp_hz=2200, length=1.8, tail=0.7)


def build_mechanics() -> None:
    # Trockenklick (Schlagbolzen auf leeres Patronenlager)
    job('dryfire')
    c = mix([(burst(0.03, 0.002, 301, lo=2500), 0.8, 0.0), (tone(0.04, [(3100, 1.0), (5200, 0.5)], 0.006, 0.0003), 0.6, 0.0),
             (burst(0.03, 0.003, 302, lo=1500), 0.35, 0.022)])
    write('weapons/dryfire', fit(c, 0.07))

    def seg(src, t0, t1, p=1.0, hp_hz=120, lp_hz=None, gain_db=0.0):
        x = pitch(cut(load(src), t0, t1), p)
        x = hp(x, hp_hz)
        if lp_hz:
            x = lp(x, lp_hz)
        return fade(x, 0.002, 0.02)

    job('draw_pistol')
    write('weapons/draw_pistol', mix([(seg('weapons/switch.ogg', 0.0, 0.14), 1.0, 0.0), (seg('weapons/pistol/reload.ogg', 0.83, 1.05, 1.1), 0.7, 0.12)]))
    job('draw_rifle')
    write('weapons/draw_rifle', seg('weapons/smg/switch.ogg', 0.06, 0.56))
    job('draw_knife')
    write('weapons/draw_knife', fade(fit(trim_start(pitch(load('weapons/sword/switch.ogg'), 1.1)), 0.42), 0.002, 0.12))
    job('draw_nade')
    write('weapons/draw_nade', seg('weapons/grenade/switch.ogg', 0.04, 0.16, 0.95))
    job('reload_pistol')
    write('weapons/reload_pistol', fade(trim_end(cut(load('weapons/pistol/reload.ogg'), 0.0, 1.25)), 0.002, 0.05))
    job('reload_smg')
    write('weapons/reload_smg', fade(cut(load('weapons/smg/reload.ogg'), 0.02, 1.25), 0.002, 0.08))
    job('reload_rifle')
    write('weapons/reload_rifle', fade(cut(load('weapons/rifle/reload.ogg'), 0.05, 1.9), 0.002, 0.08))
    job('reload_sniper')
    write('weapons/reload_sniper', fade(pitch(cut(load('weapons/rifle/reload2.ogg'), 0.05, 1.95), 0.9), 0.002, 0.08))
    job('reload_mg')
    write('weapons/reload_mg', fade(lp(pitch(cut(load('weapons/rifle/reload.ogg'), 0.05, 1.95), 0.8), 5000), 0.002, 0.08))
    job('reload_shell')
    write('weapons/reload_shell', fade(hp(cut(load('weapons/shotgun/reload.ogg'), 0.54, 0.96), 150), 0.002, 0.05))
    job('bolt')
    write('weapons/bolt', fade(hp(pitch(cut(load('weapons/rifle/reload.ogg'), 1.3, 1.85), 0.9), 120), 0.002, 0.05))
    job('pump')
    back = lp(pitch(cut(load('weapons/smg/switch.ogg'), 0.07, 0.3), 0.75), 3500)
    fwd = lp(pitch(cut(load('weapons/smg/switch.ogg'), 0.38, 0.62), 0.8), 3500)
    write('weapons/pump', mix([(fade(back, 0.002, 0.03), 1.0, 0.0), (fade(fwd, 0.002, 0.03), 0.9, 0.2)]))
    job('pickup')
    write('weapons/pickup', mix([(seg('weapons/switch.ogg', 0.0, 0.14), 1.0, 0.0), (seg('weapons/smg/switch.ogg', 0.38, 0.56, 1.1), 0.6, 0.06)]))
    job('buy')
    write('ui/buy', mix([(seg('weapons/smg/switch.ogg', 0.07, 0.3, 1.05), 1.0, 0.0), (seg('interface/press.ogg', 0.0, 0.15), 0.35, 0.0)]))


def build_knife() -> None:
    for i, s in enumerate(['weapons/sword/primary.ogg', 'weapons/sword/primary2.ogg']):
        job(f'knife_slash_{i + 1}')
        x = hp(pitch(trim_start(load(s), -30), 1.35 + 0.08 * i), 500)
        write(f'weapons/knife_slash_{i + 1}', fade(decay_after(fit(x, 0.38), 0.12, 0.08), 0.002, 0.06))
    job('knife_stab')
    x = hp(pitch(trim_start(load('weapons/sword/secondary.ogg'), -30), 1.15), 300)
    write('weapons/knife_stab', fade(decay_after(fit(x, 0.45), 0.15, 0.1), 0.002, 0.06))
    for i, s in enumerate(['weapons/thwack.ogg', 'weapons/thwack2.ogg']):
        job(f'knife_hit_{i + 1}')
        x = lp(pitch(trim_start(load(s)), 0.9), 2500)
        write(f'weapons/knife_hit_{i + 1}', fade(fit(x, 0.28), 0.001, 0.05))
    for i, p in enumerate([1.2, 1.4]):
        job(f'knife_wall_{i + 1}')
        y = mix([(pitch(trim_start(load('weapons/tink.ogg')), p), 1.0, 0.0), (lp(pitch(load('weapons/thud3.ogg'), 1.3), 3000), 0.5, 0.0)])
        write(f'weapons/knife_wall_{i + 1}', fade(fit(y, 0.3), 0.001, 0.06))


def build_grenades() -> None:
    job('nade_pin')
    pin = hp(cut(load('weapons/grenade/switch.ogg'), 0.04, 0.155), 400)
    ring = tone(0.25, [(4300, 1.0), (6100, 0.5)], 0.05, 0.001)
    write('weapons/nade_pin', mix([(fade(pin, 0.001, 0.02), 1.0, 0.0), (ring, 0.25, 0.09)]))
    job('nade_throw')
    write('weapons/nade_throw', fade(pitch(trim_start(load('ambience/bart/whoosh.ogg')), 0.85), 0.01, 0.08))
    for i, p in enumerate([0.7, 0.8, 0.62]):
        job(f'nade_bounce_{i + 1}')
        y = mix([(pitch(trim_start(load('weapons/tink.ogg')), p), 0.8, 0.0), (lp(pitch(trim_start(load('weapons/thud.ogg')), 1.1 + 0.1 * i), 2500), 0.7, 0.0)])
        write(f'weapons/nade_bounce_{i + 1}', fade(fit(decay_after(y, 0.03, 0.06), 0.28), 0.001, 0.05))

    for i, (s, b) in enumerate([('weapons/explode.ogg', 'weapons/bigblast.ogg'), ('weapons/explode2.ogg', 'weapons/bigblast2.ogg')]):
        job(f'he_near_{i + 1}')
        main = trim_start(load(s), -30)
        low = lp(trim_start(load(b), -30), 300, 4)
        sub = sweep(1.4, 90, 28, 0.08, 0.35)
        deb = hp(load('sfx/debris3.ogg'), 800)
        y = mix([(main, 1.0, 0.0), (low, 0.6, 0.0), (sub, 0.9, 0.0), (burst(0.2, 0.02, 400 + i, lo=1200), 0.6, 0.0), (deb, 0.18, 0.35)])
        write(f'weapons/he_near_{i + 1}', fade(fit(sat(y, 2.0), 2.3), 0.001, 0.5))
    for i, s in enumerate(['weapons/explodefar2.ogg', 'weapons/explodefar3.ogg']):
        job(f'he_far_{i + 1}')
        x = lp(trim_start(load(s), -30), 1600)
        y = echoes(x, [(0.15, 0.4), (0.38, 0.25), (0.7, 0.12)], lp_hz=900)
        write(f'weapons/he_far_{i + 1}', fade(fit(y, 2.6), 0.003, 0.6))

    job('flash_bang')
    x = pitch(trim_start(load('weapons/smallblast.ogg'), -30), 1.25)
    y = mix([(x, 1.0, 0.0), (burst(0.25, 0.025, 410, lo=1200), 1.0, 0.0), (sweep(0.4, 260, 70, 0.02, 0.06), 0.5, 0.0)])
    write('weapons/flash_bang', fade(fit(sat(y, 2.2), 1.2), 0.001, 0.3), peak_db=-3)

    job('smoke_hiss')
    h1 = hp(load('sfx/extinguish.ogg'), 300)
    h2 = hp(load('sfx/extinguish2.ogg'), 300)
    h3 = hp(load('sfx/extinguish3.ogg'), 300)
    hiss = mix([(fade(h1, 0.05, 0.3), 1.0, 0.0), (fade(h2, 0.3, 0.3), 1.0, 0.7), (fade(h3, 0.3, 0.3), 1.0, 1.4), (fade(h1, 0.3, 0.5), 0.9, 2.1)])
    pop = mix([(burst(0.12, 0.01, 420, lo=600), 1.0, 0.0), (sweep(0.15, 300, 120, 0.01, 0.03), 0.6, 0.0)])
    t = tvec(len(hiss))
    hiss = hiss * np.clip(t / 0.15, 0, 1) * np.where(t < 2.2, 1, np.exp(-(t - 2.2) / 0.5))
    write('weapons/smoke_hiss', fade(mix([(pop, 0.7, 0.0), (hiss, 1.0, 0.03)]), 0.001, 0.3))

    # Tinnitus nach Blendgranate (Schwebung zweier Töne + Hauch Rauschen)
    job('ear_ring')
    t = tvec(secs(4.0))
    ring = (np.sin(2 * np.pi * 3520 * t) + 0.8 * np.sin(2 * np.pi * 3547 * t) + 0.25 * np.sin(2 * np.pi * 7040 * t))
    ring += 0.08 * hp(noise(4.0, 430), 5000)
    ring *= np.clip(t / 0.05, 0, 1) * np.exp(-t / 1.8)
    write('weapons/ear_ring', fade(ring, 0.01, 0.4), peak_db=-6)


def build_c4() -> None:
    # Tastenfeld (DTMF-artig, drei Tasten)
    for i, (lo_f, hi_f) in enumerate([(770, 1336), (852, 1477), (697, 1209)]):
        job(f'c4_press_{i + 1}')
        y = tone(0.11, [(lo_f, 0.7), (hi_f, 1.0)], 0.08, 0.002)
        y = fade(fit(y, 0.09), 0.001, 0.015)
        click = burst(0.02, 0.002, 500 + i, lo=3000)
        write(f'weapons/c4_press_{i + 1}', mix([(click, 0.5, 0.0), (y, 1.0, 0.004)]))
    job('c4_beep')
    t = tvec(secs(0.13))
    b = np.sign(np.sin(2 * np.pi * 2960 * t)) * 0.25 + np.sin(2 * np.pi * 2960 * t)
    b = lp(b, 7000) * np.clip(t / 0.003, 0, 1) * np.where(t < 0.09, 1, np.exp(-(t - 0.09) / 0.012))
    write('weapons/c4_beep', fade(b, 0.001, 0.01))
    job('c4_planted')
    latch = hp(cut(load('weapons/switch.ogg'), 0.0, 0.14), 200)
    y = mix([(latch, 1.0, 0.0), (tone(0.1, [(2960, 1.0)], 0.06), 0.6, 0.12), (tone(0.1, [(2960, 1.0)], 0.06), 0.6, 0.26)])
    write('weapons/c4_planted', y)
    job('c4_defuse')
    a = hp(cut(load('weapons/pistol/reload.ogg'), 0.0, 0.32), 200)
    b2 = hp(cut(load('weapons/smg/reload.ogg'), 0.55, 0.8), 200)
    write('weapons/c4_defuse', mix([(fade(a, 0.002, 0.03), 1.0, 0.0), (fade(b2, 0.002, 0.03), 0.8, 0.3)]))
    job('c4_defused')
    snip = mix([(burst(0.03, 0.003, 510, lo=3500), 1.0, 0.0), (burst(0.03, 0.003, 511, lo=3500), 0.8, 0.05)])
    down = tone(0.35, [(1480, 1.0), (2960, 0.3)], 0.12, 0.003)
    write('weapons/c4_defused', mix([(snip, 0.9, 0.0), (down, 0.5, 0.12)]))
    job('c4_explode')
    big = trim_start(load('weapons/bigblast.ogg'), -30)
    ex = pitch(trim_start(load('weapons/explode3.ogg'), -30), 0.85)
    mine = pitch(trim_start(load('weapons/mine/explode2.ogg'), -30), 0.8)
    sub = sweep(3.0, 70, 22, 0.15, 0.8)
    y = mix([(big, 1.0, 0.0), (ex, 0.8, 0.0), (mine, 0.6, 0.03), (sub, 1.0, 0.0), (hp(load('sfx/debris3.ogg'), 600), 0.2, 0.5),
             (hp(pitch(load('sfx/debris.ogg'), 0.8), 600), 0.15, 0.9)])
    write('weapons/c4_explode', fade(fit(sat(y, 2.5), 4.2), 0.001, 1.2))
    job('c4_explode_far')
    x = lp(pitch(trim_start(load('weapons/explodefar3.ogg'), -30), 0.8), 800)
    write('weapons/c4_explode_far', fade(fit(echoes(x, [(0.2, 0.45), (0.5, 0.3), (0.9, 0.15)], lp_hz=600), 3.4), 0.003, 0.8))


def build_impacts() -> None:
    for i, (s, t0, t1, p) in enumerate([('sfx/debris.ogg', 0.08, 0.3, 1.1), ('sfx/debris3.ogg', 0.0, 0.22, 1.2), ('sfx/debris2.ogg', 0.0, 0.13, 1.0)]):
        job(f'imp_concrete_{i + 1}')
        x = hp(pitch(trim_start(cut(load(s), t0, t1)), p), 300)
        y = mix([(x, 1.0, 0.0), (burst(0.05, 0.006, 600 + i, lo=1500), 0.8, 0.0), (sweep(0.06, 400, 150, 0.01, 0.015), 0.3, 0.0)])
        write(f'impacts/imp_concrete_{i + 1}', fade(fit(y, 0.25), 0.0005, 0.05))
    for i, p in enumerate([1.0, 1.2, 0.85]):
        job(f'imp_metal_{i + 1}')
        x = hp(pitch(trim_start(load('weapons/tink.ogg')), p), 400)
        write(f'impacts/imp_metal_{i + 1}', fade(fit(mix([(x, 1.0, 0.0), (burst(0.03, 0.003, 610 + i, lo=3000), 0.5, 0.0)]), 0.28), 0.0005, 0.06))
    for i, s in enumerate(['weapons/thud.ogg', 'weapons/thud2.ogg']):
        job(f'imp_wood_{i + 1}')
        x = peq(lp(pitch(trim_start(load(s)), 0.75), 3000), 300, 4, 1.0)
        y = mix([(x, 1.0, 0.0), (burst(0.03, 0.004, 620 + i, 800, 4000), 0.5, 0.0)])
        write(f'impacts/imp_wood_{i + 1}', fade(fit(y, 0.22), 0.0005, 0.05))
    for i, s in enumerate(['weapons/thwack2.ogg', 'weapons/thwack3.ogg']):
        job(f'imp_flesh_{i + 1}')
        x = lp(pitch(trim_start(load(s)), 0.8), 1800)
        write(f'impacts/imp_flesh_{i + 1}', fade(fit(x, 0.2), 0.0005, 0.05))
    for i, p in enumerate([1.0, 1.15, 0.9]):
        job(f'ricochet_{i + 1}')
        write(f'impacts/ricochet_{i + 1}', fade(hp(pitch(trim_start(load('weapons/ricochet.ogg')), p), 300), 0.001, 0.05))
    for i, s in enumerate(['weapons/whizz.ogg', 'weapons/singe.ogg', 'weapons/singe2.ogg']):
        job(f'flyby_{i + 1}')
        x = hp(trim_start(load(s), -35), 400)
        write(f'impacts/flyby_{i + 1}', fade(x, 0.01, 0.06))
    job('headshot')
    bell = tone(0.45, [(2630, 1.0), (3950, 0.6), (6210, 0.35), (8400, 0.15)], 0.16, 0.0005, partial_decay=0.75)
    tk = pitch(trim_start(load('weapons/tink.ogg')), 1.3)
    write('impacts/headshot', mix([(bell, 1.0, 0.0), (tk, 0.5, 0.0), (burst(0.02, 0.002, 630, lo=4000), 0.4, 0.0)]))
    for i in range(6):
        job(f'shell_{i + 1}')
        s = f'sfx/shell{"" if i == 0 else i + 1}.ogg'
        write(f'impacts/shell_{i + 1}', fade(trim_start(load(s)), 0.0005, 0.02))
    for i, s in enumerate(['sfx/shell.ogg', 'sfx/shell3.ogg']):
        job(f'shell_shotgun_{i + 1}')
        x = lp(pitch(trim_start(load(s)), 0.62), 3500)
        write(f'impacts/shell_shotgun_{i + 1}', fade(x, 0.0005, 0.02))


def build_player() -> None:
    steps = ['player/concstep.ogg', 'player/concstep2.ogg', 'player/concstep3.ogg', 'player/concstep4.ogg']

    def base(i):
        return hp(trim_start(load(steps[i]), -35), 70)

    for i in range(4):
        job(f'step_concrete_{i + 1}')
        write(f'player/step_concrete_{i + 1}', fade(base(i), 0.0005, 0.02))
        job(f'step_tile_{i + 1}')
        x = peq(shelf(pitch(base(i), 1.18), 3000, 4), 2500, 3, 1.5)
        write(f'player/step_tile_{i + 1}', fade(mix([(x, 1.0, 0.0), (burst(0.02, 0.002, 700 + i, lo=4000), 0.35, 0.0)]), 0.0005, 0.02))
        job(f'step_wood_{i + 1}')
        x = peq(lp(pitch(base(i), 0.8), 2500), 220, 7, 1.3)
        write(f'player/step_wood_{i + 1}', fade(mix([(x, 1.0, 0.0), (sweep(0.12, 180, 120, 0.02, 0.04), 0.35, 0.0)]), 0.0005, 0.03))
        job(f'step_metal_{i + 1}')
        x = base(i)
        ringing = tone(0.35, [(540 + 30 * i, 1.0), (1270 + 50 * i, 0.7), (2330, 0.45), (3720, 0.25)], 0.07, 0.001, partial_decay=0.8)
        tk = lp(pitch(trim_start(load('weapons/tink.ogg')), 0.5 + 0.04 * i), 4000)
        write(f'player/step_metal_{i + 1}', fade(fit(mix([(x, 1.0, 0.0), (ringing, 0.35, 0.002), (tk, 0.22, 0.0)]), 0.32), 0.0005, 0.06))
        job(f'step_grate_{i + 1}')
        rattle = mix([(burst(0.03, 0.003, 710 + i * 3 + k, lo=2000), 0.6 - 0.15 * k, 0.012 * k + 0.004 * i) for k in range(3)])
        ringing = tone(0.25, [(860 + 40 * i, 1.0), (1930, 0.6), (3100, 0.4)], 0.04, 0.001, partial_decay=0.8)
        write(f'player/step_grate_{i + 1}', fade(fit(mix([(x, 0.9, 0.0), (rattle, 0.6, 0.0), (ringing, 0.25, 0.002)]), 0.28), 0.0005, 0.05))
        job(f'step_gravel_{i + 1}')
        rng = np.random.default_rng(720 + i)
        grit = np.zeros(secs(0.2))
        for _ in range(55):
            at = int(rng.uniform(0, 0.13) * SR)
            g = rng.uniform(0.2, 1.0) * np.exp(-at / SR / 0.06)
            grain = burst(0.006, 0.0012, int(rng.integers(1, 10 ** 6)), lo=1200)
            grit[at:at + len(grain)] += g * grain[: len(grit) - at]
        weight = lp(base(i), 700)
        write(f'player/step_gravel_{i + 1}', fade(mix([(grit, 1.0, 0.0), (weight, 0.55, 0.0)]), 0.0005, 0.03))
    job('land')
    thump = lp(pitch(base(0), 0.8), 1500)
    write('player/land', mix([(thump, 1.0, 0.0), (base(2), 0.7, 0.018), (hp(load('player/land.ogg'), 80), 0.5, 0.0)]))
    for i in range(6):
        job(f'pain_{i + 1}')
        s = f'player/pain{"" if i == 0 else i + 1}.ogg'
        write(f'player/pain_{i + 1}', fade(trim_end(trim_start(load(s))), 0.001, 0.04))
    for i in range(5):
        job(f'death_{i + 1}')
        s = f'player/death{"" if i == 0 else i + 1}.ogg'
        write(f'player/death_{i + 1}', fade(trim_end(trim_start(load(s))), 0.001, 0.08))


def radio_band(x: np.ndarray) -> np.ndarray:
    return sat(bp(x, 350, 3200, 2), 2.0)


def build_ui() -> None:
    for name, s in [('click', 'interface/press.ogg'), ('back', 'interface/back.ogg'), ('change', 'interface/change.ogg'), ('chat', 'sfx/chat.ogg')]:
        job(f'ui_{name}')
        write(f'ui/{name}', fade(trim_end(trim_start(load(s)), -50), 0.0005, 0.02))
    job('hitmarker')
    write('ui/hitmarker', mix([(tone(0.04, [(2100, 1.0), (4200, 0.3)], 0.012, 0.0005), 1.0, 0.0), (burst(0.01, 0.0015, 800, lo=3000), 0.3, 0.0)]))
    job('kill')
    write('ui/kill', mix([(tone(0.12, [(1650, 1.0), (3300, 0.25)], 0.04, 0.001), 1.0, 0.0), (tone(0.16, [(2470, 1.0), (4940, 0.2)], 0.05, 0.001), 0.8, 0.07)]))
    job('radio')
    sq_on = radio_band(burst(0.06, 0.03, 810))
    beep = radio_band(tone(0.07, [(1200, 1.0)], 0.2, 0.003))
    tail = radio_band(noise(0.18, 811) * 0.25) * np.exp(-tvec(secs(0.18)) / 0.06)
    write('ui/radio', mix([(sq_on, 0.6, 0.0), (fade(beep, 0.002, 0.01), 0.7, 0.02), (tail, 0.35, 0.09)]))
    job('round_start')
    a = fade(fit(radio_band(tone(0.14, [(660, 1.0), (1320, 0.2)], 0.4, 0.004)), 0.12), 0.002, 0.02)
    b = fade(fit(radio_band(tone(0.2, [(880, 1.0), (1760, 0.2)], 0.4, 0.004)), 0.18), 0.002, 0.04)
    write('ui/round_start', mix([(radio_band(burst(0.05, 0.02, 820)), 0.4, 0.0), (a, 0.8, 0.03), (b, 0.8, 0.18)]))

    def chime(notes, step, tau):
        parts = []
        for k, f in enumerate(notes):
            parts.append((tone(1.2, [(f, 1.0), (2 * f, 0.25), (3 * f, 0.08)], tau, 0.008), 1.0, k * step))
        y = mix(parts)
        return fade(y + 0.25 * np.concatenate([np.zeros(secs(0.09)), lp(y, 2500)])[: len(y)], 0.002, 0.2)
    job('round_win')
    write('ui/round_win', chime([523.25, 659.25, 783.99], 0.11, 0.28), peak_db=-3)
    job('round_lose')
    write('ui/round_lose', chime([392.0, 311.13], 0.16, 0.32), peak_db=-3)


def build_ambience() -> None:
    def native(name, src, p=1.0, hp_hz=40, lp_hz=None, gain_db=-14):
        job(name)
        x = load(src, AMB_SR)
        if p != 1.0:
            x = pitch(x, p)
        x = hp(x, hp_hz, sr=AMB_SR)
        if lp_hz:
            x = lp(x, lp_hz, sr=AMB_SR)
        write(f'ambience/{name}', np.clip(rms_norm(x, gain_db), -0.95, 0.95), 'amb-raw')

    def cutloop(name, src, length, xf=2.0, start=0.0, hp_hz=40, lp_hz=None, gain_db=-16):
        job(name)
        x = load(src, AMB_SR)
        x = hp(x, hp_hz, sr=AMB_SR)
        if lp_hz:
            x = lp(x, lp_hz, sr=AMB_SR)
        y = seamless_loop(x, length, xf, start, AMB_SR)
        write(f'ambience/{name}', np.clip(rms_norm(y, gain_db), -0.95, 0.95), 'amb-raw')

    # Hallen-Grundton: Maschinenraum + Netzbrummen
    job('hallhum')
    room = seamless_loop(lp(load('ambience/machine_room_1.ogg', AMB_SR), 2500, sr=AMB_SR), 12.0, 1.5, 0.5, AMB_SR)
    hum = load('ambience/hum.ogg', AMB_SR)
    hum = np.tile(hum, int(np.ceil(len(room) / len(hum))) + 1)[: len(room)]
    write('ambience/hallhum', np.clip(rms_norm(room / np.max(np.abs(room)) + 0.35 * hum / np.max(np.abs(hum)), -16), -0.95, 0.95), 'amb-raw')
    native('ventilation', 'ambience/server2.ogg', lp_hz=6000, gain_db=-18)
    native('machine', 'ambience/hammering_machine.ogg', gain_db=-16)
    native('conveyor', 'ambience/grinds_my_gears.ogg', lp_hz=7000, gain_db=-17)
    native('forklift', 'ambience/engine_slow1.ogg', gain_db=-15)
    native('compressor', 'ambience/pump_majig.ogg', gain_db=-16)
    native('buzz', 'ambience/electro.ogg', hp_hz=80, gain_db=-20)
    native('drip', 'ambience/leak_metalic.ogg', gain_db=-22)
    native('alarmfar', 'ambience/alarm_far.ogg', gain_db=-18)
    native('rain', 'ambience/morph/rain.ogg', gain_db=-18)
    native('cold', 'ambience/hum.ogg', p=0.85, lp_hz=1200, gain_db=-17)
    cutloop('wind', 'ambience/windy_industry.ogg', 16.0, 2.0, 1.0, gain_db=-17)
    cutloop('birds', 'ambience/forest1.ogg', 16.0, 2.0, 1.0, hp_hz=300, gain_db=-22)
    cutloop('traffic', 'ambience/distant_cars.ogg', 18.0, 2.0, 2.0, gain_db=-20)
    cutloop('tunnel', 'ambience/wastewind.ogg', 16.0, 2.0, 2.0, gain_db=-18)
    # Radio: unverständliche Musik/Sprache aus einem kleinen Lautsprecher (synthetisch)
    job('radio')
    rng = np.random.default_rng(900)
    dur = 8.0
    y = np.zeros(secs(dur, AMB_SR))
    tt = tvec(len(y), AMB_SR)
    beat = 0.0
    while beat < dur - 0.4:
        f = float(rng.choice([220, 247, 262, 294, 330, 392, 440]))
        d = float(rng.choice([0.2, 0.2, 0.4]))
        i0, n = secs(beat, AMB_SR), secs(d, AMB_SR)
        tt0 = tvec(n, AMB_SR)
        note = (np.sin(2 * np.pi * f * tt0) + 0.5 * np.sin(2 * np.pi * 2 * f * tt0) + 0.3 * np.sin(2 * np.pi * 3 * f * tt0)) * np.exp(-tt0 / (d * 0.6))
        y[i0:i0 + n] += note[: len(y) - i0]
        beat += d
    y = y * (0.7 + 0.3 * np.sin(2 * np.pi * 0.5 * tt))
    y += 0.12 * noise(dur, 901, AMB_SR)
    y = sat(bp(y, 400, 2800, 2, AMB_SR), 1.5)
    xf = secs(0.5, AMB_SR)
    k = np.linspace(0, np.pi / 2, xf)
    y[:xf] = y[:xf] * np.sin(k) + y[-xf:] * np.cos(k)
    y = y[:-xf]
    write('ambience/radio', np.clip(rms_norm(y, -20), -0.95, 0.95), 'amb-raw')


def build_life() -> None:
    job('life_reverse')
    t = tvec(secs(2.8))
    beeps = np.zeros_like(t)
    for k in range(4):
        i0 = secs(k * 0.7)
        b = tone(0.35, [(1040, 1.0), (2080, 0.3), (3120, 0.15)], 1.0, 0.004)
        b = fade(b, 0.004, 0.02)
        beeps[i0:i0 + len(b)] += b[: len(beeps) - i0]
    eng = lp(load('ambience/engine1.ogg'), 900)
    eng = np.tile(eng, 2)[: len(t)]
    write('ambience/life_reverse', fade(mix([(beeps, 1.0, 0.0), (eng, 0.35, 0.0)]), 0.05, 0.2))
    for i, p in enumerate([0.55, 0.68]):
        job(f'life_clank_{i + 1}')
        y = mix([(pitch(trim_start(load('weapons/tink.ogg')), p), 1.0, 0.0), (lp(pitch(load('weapons/thud2.ogg'), 0.7), 2500), 0.7, 0.0),
                 (pitch(trim_start(load('weapons/tink.ogg')), p * 1.3), 0.4, 0.09)])
        write(f'ambience/life_clank_{i + 1}', fade(y, 0.001, 0.05))
    job('life_pallet')
    y = mix([(lp(pitch(load('weapons/thud2.ogg'), 0.55), 2200), 1.0, 0.0), (lp(pitch(load('sfx/debris3.ogg'), 0.7), 3000), 0.6, 0.04),
             (lp(pitch(load('weapons/thud.ogg'), 0.6), 2000), 0.6, 0.16)])
    write('ambience/life_pallet', fade(y, 0.001, 0.08))
    job('life_chime')
    parts = []
    for k, f in enumerate([783.99, 659.25, 523.25]):
        parts.append((tone(1.6, [(f, 1.0), (2.76 * f, 0.3), (5.4 * f, 0.1)], 0.6, 0.004, partial_decay=0.6), 1.0, k * 0.45))
    y = mix(parts)
    y = bp(y, 300, 4000)
    write('ambience/life_chime', fade(y + 0.3 * np.concatenate([np.zeros(secs(0.12)), y])[: len(y)], 0.002, 0.3))
    job('life_pigeons')
    t = tvec(secs(1.3))
    flap = bp(noise(1.3, 950), 700, 4000) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 13 * t))) * np.exp(-t / 0.5)
    whoosh = pitch(trim_start(load('ambience/bart/whoosh2.ogg')), 0.8)
    write('ambience/life_pigeons', fade(mix([(flap, 1.0, 0.0), (whoosh, 0.4, 0.1)]), 0.005, 0.15))
    job('life_horn')
    t = tvec(secs(1.4))
    saw = lambda f: 2 * ((t * f) % 1) - 1  # noqa: E731
    horn = lp(saw(233) + saw(294) * 0.8 + saw(235.5) * 0.6, 1800, 2)
    env = np.clip(t / 0.03, 0, 1) * np.where(t < 0.38, 1, 0.0) + np.where((t > 0.52) & (t < 1.2), 1, 0.0) * np.clip((t - 0.52) / 0.03, 0, 1)
    env = signal.lfilter([0.02], [1, -0.98], env)
    write('ambience/life_horn', fade(echoes(horn * env, [(0.18, 0.3), (0.42, 0.15)], lp_hz=1200), 0.005, 0.3))
    job('life_door')
    write('ambience/life_door', fade(trim_start(load('ambience/door.ogg')), 0.001, 0.08))


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    steps = {
        'guns': build_guns, 'mech': build_mechanics, 'knife': build_knife, 'nades': build_grenades, 'c4': build_c4,
        'impacts': build_impacts, 'player': build_player, 'ui': build_ui, 'ambience': build_ambience, 'life': build_life,
    }
    for k, fn in steps.items():
        if ONLY and k not in ONLY.split(','):
            continue
        fn()
    if ONLY:
        return
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sources-used.txt'), 'w') as f:
        for src in sorted(USED):
            f.write(f'{src}: {", ".join(sorted(USED[src]))}\n')


if __name__ == '__main__':
    main()
