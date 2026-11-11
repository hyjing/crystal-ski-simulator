"""Render the game's original instrumental loops (NumPy and FFmpeg required)."""
from pathlib import Path
import subprocess

import numpy as np

RATE = 44100
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "assets" / "music"
OUTPUT.mkdir(parents=True, exist_ok=True)

# Root pitches and chord intervals, one chord per bar.
TRACKS = [
    ("first-chair", 108, 19, [(45, [0, 3, 7, 10]), (41, [0, 4, 7, 11]), (48, [0, 4, 7, 11]), (43, [0, 4, 7, 9])], .65),
    ("bluebird", 122, 28, [(42, [0, 3, 7, 10]), (38, [0, 4, 7, 11]), (45, [0, 4, 7, 11]), (40, [0, 4, 7, 9])], .85),
    ("tree-line", 94, 37, [(50, [0, 3, 7, 10]), (46, [0, 4, 7, 11]), (41, [0, 4, 7, 11]), (48, [0, 4, 7, 9])], .48),
    ("last-light", 84, 46, [(43, [0, 3, 7, 10]), (46, [0, 4, 7, 11]), (50, [0, 3, 7, 10]), (48, [0, 3, 7, 10])], .35),
]


def render(name, bpm, seed, chords, drums):
    rng = np.random.default_rng(seed)
    beat = 60 / bpm
    length = round(RATE * beat * 128)
    stereo = np.zeros((length, 2), dtype=np.float32)

    def time(duration):
        return np.arange(round(duration * RATE)) / RATE

    def add(position, signal, level, pan=0):
        start = round(position * beat * RATE) % length
        signal = (signal * level)[:, None] * np.sqrt([(1 - pan) / 2, (1 + pan) / 2])
        head = min(len(signal), length - start)
        stereo[start:start + head] += signal[:head]
        stereo[:len(signal) - head] += signal[head:]

    def note(position, midi, duration, kind, level, pan=0):
        t = time(duration * beat)
        phase = 2 * np.pi * 440 * 2 ** ((midi - 69) / 12) * t
        if kind == "pad":
            env = np.sin(np.pi * t / (duration * beat)) ** 1.7
            signal = (np.sin(phase) + .32 * np.sin(phase * 1.003) + .26 * np.sin(phase * 2.001)) * env
        elif kind == "bass":
            env = np.minimum(t / .018, 1) * np.clip((t[-1] - t) / .09, 0, 1) * np.exp(-t * 1.4)
            signal = (np.sin(phase) + .3 * np.sin(phase * 2) + .12 * np.sin(phase * 3)) * env
        else:
            env = np.minimum(t / .008, 1) * np.exp(-t * (3.8 if seed == 46 else 5.8))
            env *= np.clip((t[-1] - t) / .08, 0, 1)
            signal = np.sin(phase + np.sin(phase * 2) * .65 * np.exp(-9 * t)) * env
            for delay, wet in [(0.75, .26), (1.5, .12), (2.25, .07)]:
                add(position + delay, signal, level * wet, -pan if delay != 1.5 else pan)
        add(position, signal, level, pan)

    kick_time = time(.26)
    kick = np.sin(2 * np.pi * (48 * kick_time + 2 * (1 - np.exp(-35 * kick_time)))) * np.exp(-18 * kick_time)
    kick *= np.minimum(kick_time / .003, 1)
    snare_time = time(.19)
    snare = (np.diff(rng.normal(size=len(snare_time) + 1)) * .33 + .4 * np.sin(2 * np.pi * 178 * snare_time)) * np.exp(-23 * snare_time)
    hat_time = time(.09)
    hat = np.diff(rng.normal(size=len(hat_time) + 1)) * np.exp(-50 * hat_time)
    patterns = {
        19: [(0, 0), (.75, 2), (1.5, 1), (2.5, 3), (3.25, 2)],
        28: [(0, 0), (.5, 1), (1.25, 2), (2, 1), (2.75, 3), (3.5, 2)],
        37: [(.25, 2), (1.5, 1), (2.75, 3)],
        46: [(0, 1), (1.75, 3), (3, 2)],
    }
    for bar in range(32):
        root, intervals = chords[bar % 4]
        start = bar * 4
        open_section = bar // 8 in (1, 3)
        for i, interval in enumerate(intervals):
            note(start - .35, root + 12 + interval, 4.9, "pad", .04, (i - 1.5) * .43)
        for position, octave in [(0, 0), (1.5, 0), (2.5, 0), (3.5, 7)]:
            if seed == 46 and position in (1.5, 3.5):
                continue
            note(start + position, root - 12 + octave, .95, "bass", .14)
        for i, (position, degree) in enumerate(patterns[seed]):
            octave = 24 if open_section or i == 0 else 12
            pitch = root + octave + intervals[(degree + (bar // 4 % 2)) % 4]
            note(start + position, pitch, 2.4, "keys", .066 + .015 * open_section, (-1) ** i * .35)
        if open_section and bar % 2 == 0:
            note(start + 2, root + 24 + intervals[2], 3.2, "keys", .048, -.52)
        for offset in ([0, 1.5, 2, 3.5] if seed == 28 else [0, 2.5] if seed != 46 else [0]):
            add(start + offset, kick, .29 * drums)
        for offset in ([1, 3] if seed != 46 else [3]):
            add(start + offset + .012, snare, .16 * drums, .09)
        for i in range(8 if open_section else 4):
            position = i * .5 if open_section else i + .5
            add(start + position + (i % 2) * .025, hat, .027 * drums * rng.uniform(.65, 1.25), (-1) ** i * .46)

    stereo = np.tanh(stereo * 1.7)
    subprocess.run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "f32le",
        "-ar", str(RATE), "-ac", "2", "-i", "pipe:0", "-c:a", "libmp3lame",
        "-b:a", "96k", str(OUTPUT / f"{name}.mp3"),
    ], input=stereo.astype("<f4").tobytes(), check=True)


if __name__ == "__main__":
    for track in TRACKS:
        render(*track)
