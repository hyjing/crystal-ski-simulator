"""Render four original soft-jazz loops with NumPy and FFmpeg."""
from pathlib import Path
import subprocess

import numpy as np

RATE = 44100
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "assets" / "music"
OUTPUT.mkdir(parents=True, exist_ok=True)

# Two-handed, rootless piano voicings over independent bass roots.
PROGRESSIONS = [
    [(41,[57,60,64,67]),(38,[53,57,60,64]),(43,[53,57,58,62]),(36,[52,57,58,62]),
     (45,[55,59,60,64]),(38,[54,57,60,65]),(43,[53,57,58,65]),(36,[52,57,58,62])],
    [(48,[52,55,59,62]),(45,[55,59,60,64]),(38,[53,57,60,64]),(43,[53,57,59,64]),
     (40,[55,59,62,66]),(45,[55,58,61,65]),(38,[53,57,60,64]),(43,[53,57,59,64])],
    [(46,[57,60,62,65]),(43,[53,57,58,62]),(36,[52,55,58,62]),(41,[51,57,62,67]),
     (39,[53,55,58,62]),(44,[54,60,62,65]),(36,[51,55,58,62]),(41,[51,55,57,62])],
    [(43,[54,57,59,62]),(40,[55,59,62,66]),(45,[55,59,60,64]),(38,[54,59,60,64]),
     (47,[57,61,62,66]),(40,[56,59,62,67]),(45,[55,59,60,64]),(38,[54,57,60,64])],
]
TRACKS = [
    ("first-chair-jazz", 86, 19, 0, True),
    ("bluebird-jazz", 98, 28, 1, False),
    ("tree-line-jazz", 76, 37, 2, True),
    ("last-light-jazz", 69, 46, 3, True),
]


def render(name, bpm, seed, progression, swing):
    rng = np.random.default_rng(seed)
    chords = PROGRESSIONS[progression]
    beat = 60 / bpm
    length = round(RATE * beat * 128)
    stereo = np.zeros((length, 2), dtype=np.float32)

    def time(seconds):
        return np.arange(max(2, round(seconds * RATE))) / RATE

    def add(position, signal, level, pan=0):
        start = round(position * beat * RATE) % length
        signal = (signal * level)[:, None] * np.sqrt([(1 - pan) / 2, (1 + pan) / 2])
        head = min(len(signal), length - start)
        stereo[start:start + head] += signal[:head]
        stereo[:len(signal) - head] += signal[head:]

    def note(position, midi, beats, voice, level, pan=0):
        t = time(beats * beat + .14)
        phase = 2 * np.pi * 440 * 2 ** ((midi - 69) / 12) * t
        release = np.exp(-16 * np.maximum(0, t - beats * beat)) * np.clip((t[-1] - t) / .035, 0, 1)
        if voice == "bass":
            signal = (np.sin(phase) + .31*np.sin(2*phase) + .12*np.sin(3*phase)*np.exp(-6*t)) * np.exp(-1.45*t)
            attack = .014
        else:
            signal = np.zeros_like(t)
            for harmonic, amplitude in enumerate([1, .30, .18, .10, .045, .026], 1):
                partial = phase * harmonic * (1 + .00009 * harmonic**2)
                signal += amplitude * np.sin(partial) * np.exp(-(1.05 + harmonic * .57) * t)
            signal += .14*np.sin(phase*1.0018)*np.exp(-1.55*t)
            add(position + .036 / beat, signal * release * np.minimum(t / .013, 1), level * .13, -pan)
            add(position + .081 / beat, signal * release * np.minimum(t / .013, 1), level * .062, pan)
            attack = .009
        add(position, signal * release * np.minimum(t / attack, 1), level, pan)

    brush_t = time(.42)
    brush = rng.normal(size=len(brush_t))
    brush = np.diff(brush, prepend=0) * np.sin(np.pi * brush_t / .42)**1.6 * np.exp(-2*brush_t)
    tap_t = time(.19)
    tap = rng.normal(size=len(tap_t))
    tap = np.diff(tap, prepend=0) * np.exp(-24*tap_t) + .45*np.sin(2*np.pi*165*tap_t)*np.exp(-32*tap_t)
    tap *= np.minimum(tap_t / .004, 1)
    bass_t = time(.22)
    soft_kick = np.sin(2*np.pi*(51*bass_t + .8*(1-np.exp(-23*bass_t))))*np.exp(-20*bass_t)
    soft_kick *= np.minimum(bass_t / .006, 1)
    phrases = [[(0,2),(1.5,1),(2.5,3)],[(.5,3),(1.5,2),(3,1)],
               [(0,1),(1,2),(2.5,3),(3.5,2)],[(.5,2),(2,1),(3,0)]]
    for bar in range(32):
        root, voicing = chords[bar % 8]
        next_root = chords[(bar+1) % 8][0]
        start = bar*4
        off = .66 if swing else .5
        bass_notes = [(0,root),(2,root+7)] if progression == 3 else [(0,root),(1,root+12),(2,root+7),(3,next_root+(1 if next_root < root else -1))]
        for position, pitch in bass_notes:
            note(start+position+.013, pitch, 1.35 if progression==3 else .83, "bass", .16, -.17)
        chords_at = [(.0,1.75),(2+off,1.10)] if bar%2==0 else [(.66,1.15),(2,1.7)]
        for position, duration in chords_at:
            for j, pitch in enumerate(voicing):
                note(start+position+j*.021, pitch, duration, "piano", .040 if j==0 else .034, -.25+j*.15)
        if bar%8!=7 or bar>=16:
            phrase = phrases[(bar + progression + bar//8) % len(phrases)]
            for index, (position, tone) in enumerate(phrase):
                if position%1:
                    position = int(position)+off
                melody = voicing[tone] + (12 if tone<3 else 0)
                duration = .7 if index < len(phrase)-1 else 1.2
                note(start+position+.035, melody, duration, "piano", .075 + rng.uniform(-.015,.009), .22)
        for position in [0, 2 if swing else 2.5]:
            add(start+position, soft_kick, .065)
        for position in [1, 3]:
            add(start+position-.13, brush, .021, -.32)
            add(start+position+.012, tap, .032, -.22)
            add(start+position+off, brush, .014, .28)

    rms = np.sqrt(np.mean(stereo**2))
    stereo = np.tanh(stereo * (.080 / rms))
    subprocess.run(["ffmpeg","-y","-hide_banner","-loglevel","error","-f","f32le","-ar",str(RATE),"-ac","2",
                    "-i","pipe:0","-c:a","libmp3lame","-b:a","96k",str(OUTPUT / f"{name}.mp3")],
                   input=stereo.astype("<f4").tobytes(), check=True)


if __name__ == "__main__":
    for track in TRACKS:
        render(*track)
