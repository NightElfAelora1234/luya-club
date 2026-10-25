"""Generate the 90 s South China Sea loop used by the fishing scene.

Fully synthesised (no external samples): warm pad, guzheng-like plucks, soft
sub bass and a slow ocean wash at 80 BPM. The last two seconds are crossfaded
with the head so the file loops without a seam.
"""
import numpy as np
import wave
from pathlib import Path

SR = 44100
DUR = 90.0
N = int(SR * DUR)
T = np.arange(N) / SR
rng = np.random.default_rng(20261025)
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "audio"
OUT.mkdir(parents=True, exist_ok=True)

def note(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)

def env_ar(t, dur, attack=0.8, release=1.6):
    a = np.clip(t / max(1e-4, attack), 0, 1)
    a = a * a * (3 - 2 * a)
    r = np.clip((dur - t) / max(1e-4, release), 0, 1)
    r = r * r * (3 - 2 * r)
    return a * r

# --- harmony: 30 bars at 80 BPM (3.0 s each) --------------------------------
# Cmaj9 | Am9 | Fmaj9 | G6/9 | Em7   (six passes = 90 s)
CHORDS = [
    [48, 55, 60, 64, 67],  # C3 G3 C4 E4 G4
    [45, 52, 57, 60, 62],  # A2 E3 A3 C4 D4
    [41, 48, 55, 59, 64],  # F2 C3 G3 B3 E4
    [43, 50, 55, 59, 62],  # G2 D3 G3 B3 D4
    [40, 47, 52, 55, 59],  # E2 B2 E3 G3 B3
]
BAR = 3.0
BARS = 30
pad = np.zeros((2, N), dtype=np.float64)
bass = np.zeros((2, N), dtype=np.float64)
mel = np.zeros((2, N), dtype=np.float64)

for bar in range(BARS):
    chord = CHORDS[bar % len(CHORDS)]
    t0 = bar * BAR
    t1 = min(DUR, t0 + BAR + 1.4)
    start = int(t0 * SR)
    count = int((t1 - t0) * SR)
    tt = np.arange(count) / SR
    e = env_ar(tt, BAR + 1.4, 0.9, 1.6)
    pan_l = 0.0
    for j, m in enumerate(chord):
        f = note(m)
        # detuned, soft triangle-ish pad
        det = 1.0 + (j - 2) * 0.0007
        for side, sgn in ((0, -1), (1, 1)):
            phase = rng.uniform(0, 2 * np.pi)
            sig = (np.sin(2 * np.pi * f * det * tt + phase)
                   + 0.32 * np.sin(2 * np.pi * f * 2 * det * tt + 0.4)
                   + 0.16 * np.sin(2 * np.pi * f * 0.5 * det * tt + 1.1))
            amp = 0.035 / (1 + 0.12 * j)
            if side == 1:
                sig *= 0.94
            pad[side, start:start + count] += sig * e * amp
    # bass root + fifth, very soft
    f = note(chord[0] - 12)
    be = env_ar(tt, BAR + 0.8, 0.35, 0.9)
    for side in (0, 1):
        bass[side, start:start + count] += np.sin(2 * np.pi * f * tt + 0.2) * be * 0.055
    # low fifth every other bar
    if bar % 2 == 0:
        f2 = note(chord[1] - 12)
        bass[0, start:start + count] += np.sin(2 * np.pi * f2 * tt + 0.8) * be * 0.025

# gentle low-pass on pad/bass (FFT, circular so the loop stays periodic)
def fft_lp(x, cutoff, slope=2.0):
    X = np.fft.rfft(x, axis=1)
    f = np.fft.rfftfreq(x.shape[1], 1 / SR)
    H = 1.0 / (1.0 + (f / cutoff) ** slope)
    return np.fft.irfft(X * H, n=x.shape[1], axis=1)

pad = fft_lp(pad, 1800, 1.6)
bass = fft_lp(bass, 220, 2.0)

# --- guzheng-like plucks ----------------------------------------------------
def pluck(freq, dur=3.2, amp=0.12):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    out = np.zeros(n)
    # attack + fast pick noise
    att = np.clip(tt / 0.006, 0, 1)
    # slightly stretched low string
    for h in range(1, 9):
        hf = freq * h * (1 + 0.0008 * h * h)
        decay = np.exp(-tt * (1.15 + 0.55 * h))
        out += (0.9 / (h ** 1.25)) * np.sin(2 * np.pi * hf * tt + h * 0.3) * decay
    # pick transient
    pick = np.exp(-tt * 42) * rng.normal(0, 1, n) * 0.12
    out = (out * att + pick) * amp
    # tiny lowpass by moving average
    out = np.convolve(out, np.ones(3) / 3, mode='same')
    return out

# pentatonic phrase: D4 E4 G4 A4 C5 D5 E5 G5 A5
MEL = [
    (0, 69, .65), (2.0, 74, .55), (4.0, 76, .70), (6.5, 74, .42),
    (9.0, 72, .58), (11.0, 69, .60), (13.0, 67, .45),
    (18.0, 64, .55), (20.0, 69, .65), (22.5, 72, .52), (24.0, 74, .62),
    (27.0, 79, .48), (30.0, 76, .55), (32.0, 74, .45),
    (36.0, 72, .55), (38.0, 69, .60), (40.0, 67, .50), (42.0, 64, .45),
    (45.0, 69, .60), (47.0, 72, .55), (48.5, 74, .60), (51.0, 76, .48),
    (54.0, 74, .55), (56.0, 72, .48), (58.0, 69, .58), (60.0, 67, .42),
    (63.0, 62, .50), (65.0, 64, .55), (67.0, 67, .60), (69.0, 69, .55),
    (72.0, 72, .60), (74.0, 74, .52), (76.0, 76, .58), (78.0, 79, .44),
    (82.0, 76, .55), (84.0, 74, .48), (86.0, 72, .52), (88.0, 69, .45),
]
for i, (when, midi, amp) in enumerate(MEL):
    if when >= DUR - 0.1:
        continue
    sig = pluck(note(midi), 4.5, amp * 0.20)
    start = int(when * SR)
    n = min(len(sig), N - start)
    if n <= 0:
        continue
    pan = 0.5 + 0.18 * np.sin(i * 1.7)
    mel[0, start:start + n] += sig[:n] * (1 - pan)
    mel[1, start:start + n] += sig[:n] * pan

# --- slow ocean wash --------------------------------------------------------
def pink_noise(n):
    w = rng.normal(0, 1, n)
    X = np.fft.rfft(w)
    f = np.fft.rfftfreq(n)
    f[0] = f[1]
    X *= 1 / np.sqrt(f)
    out = np.fft.irfft(X, n=n)
    return out / (np.max(np.abs(out)) + 1e-9)

ocean = np.zeros((2, N))
for side in (0, 1):
    n = pink_noise(N)
    # slow waves + a distant lap
    lfo = 0.55 + 0.45 * np.sin(2 * np.pi * (0.035 + side * 0.004) * T + side * 0.8)
    lap = 0.5 + 0.5 * np.sin(2 * np.pi * 0.085 * T + 1.1)
    ocean[side] = n * (0.8 * lfo + 0.2 * lap) * 0.035
ocean = fft_lp(ocean, 900, 1.2)
ocean[0] *= 1.0
ocean[1] *= 0.92

# --- reverb (circular convolution, so the 90 s loop is seamless) -----------
def make_ir(seconds=2.8, decay=5.5):
    n = int(seconds * SR)
    ir = rng.normal(0, 1, (2, n))
    tt = np.arange(n) / SR
    ir *= np.exp(-tt * decay)
    ir = fft_lp(ir, 3800, 1.0)
    ir /= np.max(np.abs(ir)) + 1e-9
    return ir

def convolve_loop(sig, ir, wet=0.24):
    n = sig.shape[1]
    for side in (0, 1):
        irp = np.zeros(n)
        irp[:len(ir[side])] = ir[side]
        # circular convolution preserves the loop
        sig[side] += wet * np.fft.irfft(np.fft.rfft(sig[side]) * np.fft.rfft(irp), n=n)
    return sig

# reverb bus: pad+melody+ocean, keep bass dry
wet = pad + mel + ocean
ir = make_ir()
wet = convolve_loop(wet, ir, 0.24)
mix = wet + bass
# subtle stereo width on pad already via detune; normalize
mix *= 0.78 / (np.max(np.abs(mix)) + 1e-9)
# avoid DC and very low rumble
mix = fft_lp(mix, 12000, 2.2)

# --- seamless loop: crossfade the final 2 s into the head ------------------
xf = int(2.0 * SR)
fade = np.linspace(0, 1, xf) ** 2
# at the very end the signal equals the very start (equal-gain crossfade)
for c in (0, 1):
    mix[c, -xf:] = mix[c, -xf:] * (1 - fade) + mix[c, :xf] * fade
# force exact boundary continuity
mix[:, -1] = mix[:, 0]

# write WAV
pcm = np.clip(mix.T, -1, 1)
pcm = (pcm * 32767).astype(np.int16)
wav_path = OUT / 'south-china-sea-90s.wav'
with wave.open(str(wav_path), 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('wav', wav_path, wav_path.stat().st_size, 'duration', N / SR)
