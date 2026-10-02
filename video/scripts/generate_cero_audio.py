import math
import struct
import wave
import random
import os

SAMPLE_RATE = 44100

def write_wav(filename, samples, sample_rate=SAMPLE_RATE):
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    with wave.open(filename, 'w') as wf:
        wf.setnchannels(2)  # Stereo
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        raw_data = bytearray()
        for left, right in samples:
            left_val = max(-32767, min(32767, int(left * 32767.0)))
            right_val = max(-32767, min(32767, int(right * 32767.0)))
            raw_data.extend(struct.pack('<hh', left_val, right_val))
        wf.writeframes(raw_data)
    print(f"Generated {filename}")

def generate_cero_soundtrack(duration=30.0):
    total_samples = int(duration * SAMPLE_RATE)
    samples = []
    
    for i in range(total_samples):
        t = i / SAMPLE_RATE
        
        # Section Gains & Ducking
        # 0.0 - 2.5: Opening Identity (quiet anticipation)
        # 2.5 - 7.0: Natural language prompt (subtle curiosity, ducked for typing)
        # 7.0 - 10.5: Multi-step execution (rhythmic momentum)
        # 10.5 - 14.0: System awareness (port query, focused tension)
        # 14.0 - 17.5: Approval gate (ducked for UI focus)
        # 17.5 - 19.0: Success release (bright chord release)
        # 19.0 - 23.5: Workflow creation (expansion harmonic energy)
        # 23.5 - 26.5: Cross-platform (wide confidence)
        # 26.5 - 30.0: Closing resolution (tonal calm, fade to quiet)
        
        if t < 2.5:
            # Low ambient swell
            env = (t / 2.5) * 0.16
        elif t < 7.0:
            # Ducked under typing
            env = 0.13
        elif t < 10.5:
            # Building momentum
            env = 0.14 + 0.08 * ((t - 7.0) / 3.5)
        elif t < 14.0:
            # Port tension
            env = 0.18
        elif t < 17.5:
            # Ducked for approval gate
            env = 0.12
        elif t < 19.0:
            # Success payoff swell
            env = 0.22
        elif t < 23.5:
            # Workflow expansion
            env = 0.20 + 0.04 * math.sin((t - 19.0) * 0.8)
        elif t < 26.5:
            # Cross-platform full harmonic
            env = 0.24
        elif t < 28.5:
            # Resolving
            env = 0.18 * ((28.5 - t) / 2.0)
        else:
            # Final 1.5s stillness / quiet tail
            env = max(0.0, (30.0 - t) / 1.5) * 0.06
            
        # Core Frequencies: D Minor / A Drone (Precision, Technical, Modern)
        # D2 = 73.42 Hz, A2 = 110 Hz, D3 = 146.83 Hz, F3 = 174.61 Hz, A3 = 220 Hz
        root = 73.42
        
        # Sub drone
        sub = math.sin(2 * math.pi * (root / 2) * t) * 0.7
        # Fundamental
        fund = math.sin(2 * math.pi * root * t) * 0.6
        # Harmonic 5th (A2)
        fifth = math.sin(2 * math.pi * 110.0 * t + 0.1 * math.sin(0.4 * t)) * 0.4
        
        # Soft evolving pad chords for later sections
        chord = 0.0
        if t >= 7.0:
            chord += math.sin(2 * math.pi * 146.83 * t) * 0.25 # D3
        if t >= 17.5:
            chord += math.sin(2 * math.pi * 174.61 * t) * 0.2  # F3
            chord += math.sin(2 * math.pi * 220.0 * t) * 0.25  # A3
        if t >= 23.5:
            chord += math.sin(2 * math.pi * 293.66 * t) * 0.18 # D4
            
        # Subtle analog tape texture
        noise = (random.random() * 2.0 - 1.0) * 0.005
        
        # Subtle slow stereo pan
        pan = 0.5 + 0.08 * math.sin(0.5 * math.pi * t)
        
        total = env * (sub + fund + fifth + chord + noise)
        left = total * (1.0 - pan * 0.5)
        right = total * (0.5 + pan * 0.5)
        
        samples.append((left, right))
        
    return samples

def generate_synchronized_typing(duration, num_keystrokes, has_enter=True):
    total_samples = int(duration * SAMPLE_RATE)
    samples = [[0.0, 0.0] for _ in range(total_samples)]
    
    interval = (total_samples - int(0.1 * SAMPLE_RATE)) / max(1, num_keystrokes)
    
    for k in range(num_keystrokes):
        # Slightly humanized timing jitter (+/- 15%)
        jitter = (random.random() - 0.5) * 0.3 * interval
        start_idx = int(k * interval + jitter)
        start_idx = max(0, min(total_samples - 600, start_idx))
        
        is_enter = (k == num_keystrokes - 1) and has_enter
        
        click_dur = 0.018 if is_enter else 0.007
        click_len = int(click_dur * SAMPLE_RATE)
        freq = 1200.0 if is_enter else (1800.0 + (k % 7) * 110.0)
        
        for idx in range(click_len):
            cur = start_idx + idx
            if cur >= total_samples:
                break
            decay_rate = 0.005 if is_enter else 0.0018
            decay = math.exp(-idx / (SAMPLE_RATE * decay_rate))
            noise = (random.random() - 0.5) * 0.4
            tone = math.sin(2 * math.pi * freq * (idx / SAMPLE_RATE))
            val = decay * (tone + noise) * (0.35 if is_enter else 0.22)
            
            pan = 0.45 + (k % 5) * 0.025
            samples[cur][0] += val * (1.0 - pan)
            samples[cur][1] += val * pan
            
    return samples

def generate_refined_click(duration=0.15):
    total_samples = int(duration * SAMPLE_RATE)
    samples = []
    for i in range(total_samples):
        t = i / SAMPLE_RATE
        decay = math.exp(-t * 80.0)
        # 2200Hz punch + 600Hz body
        tone = math.sin(2 * math.pi * 2200.0 * t) * 0.6 + math.sin(2 * math.pi * 600.0 * t) * 0.4
        noise = (random.random() - 0.5) * 0.25
        val = decay * (tone + noise) * 0.45
        samples.append((val, val * 0.95))
    return samples

def generate_step_tick(duration=0.1):
    total_samples = int(duration * SAMPLE_RATE)
    samples = []
    for i in range(total_samples):
        t = i / SAMPLE_RATE
        decay = math.exp(-t * 90.0)
        tone = math.sin(2 * math.pi * 3200.0 * t) * 0.5 + math.sin(2 * math.pi * 1800.0 * t) * 0.3
        val = decay * tone * 0.25
        samples.append((val * 0.8, val))
    return samples

def generate_success_confirmation(duration=0.9):
    total_samples = int(duration * SAMPLE_RATE)
    samples = []
    f1 = 587.33  # D5
    f2 = 739.99  # F#5
    f3 = 880.00  # A5
    f4 = 1174.66 # D6
    for i in range(total_samples):
        t = i / SAMPLE_RATE
        decay1 = math.exp(-t * 3.8)
        decay2 = math.exp(-max(0.0, t - 0.06) * 3.5) if t >= 0.06 else 0.0
        decay3 = math.exp(-max(0.0, t - 0.12) * 3.2) if t >= 0.12 else 0.0
        decay4 = math.exp(-max(0.0, t - 0.18) * 2.8) if t >= 0.18 else 0.0
        
        s1 = 0.22 * decay1 * math.sin(2 * math.pi * f1 * t)
        s2 = 0.18 * decay2 * math.sin(2 * math.pi * f2 * t)
        s3 = 0.18 * decay3 * math.sin(2 * math.pi * f3 * t)
        s4 = 0.14 * decay4 * math.sin(2 * math.pi * f4 * t)
        
        val = s1 + s2 + s3 + s4
        samples.append((val * 0.85, val * 0.95))
    return samples

def generate_panel_morph(duration=0.55):
    total_samples = int(duration * SAMPLE_RATE)
    samples = []
    for i in range(total_samples):
        t = i / SAMPLE_RATE
        prog = t / duration
        env = math.sin(math.pi * prog) ** 1.8
        freq = 180.0 + 350.0 * math.sin(math.pi * prog)
        tone = math.sin(2 * math.pi * freq * t) * 0.2
        noise = (random.random() * 2.0 - 1.0) * 0.08
        val = env * (tone + noise) * 0.28
        left = val * (1.0 - prog * 0.5)
        right = val * (0.5 + prog * 0.5)
        samples.append((left, right))
    return samples

def generate_mechanical_activation(duration=0.35):
    total_samples = int(duration * SAMPLE_RATE)
    samples = []
    for i in range(total_samples):
        t = i / SAMPLE_RATE
        decay = math.exp(-t * 18.0)
        # Deep sub tap
        sub = math.sin(2 * math.pi * 85.0 * t) * 0.5
        click = math.sin(2 * math.pi * 1400.0 * t) * 0.3 * math.exp(-t * 120.0)
        val = decay * (sub + click) * 0.38
        samples.append((val, val))
    return samples

if __name__ == '__main__':
    audio_dir = "public/audio"
    
    # 1. Continuous master soundtrack
    write_wav(f"{audio_dir}/cero_soundtrack.wav", generate_cero_soundtrack(30.0))
    
    # 2. Synchronized typing clips for each exact beat
    # Beat 2: Natural Language Command (~2.6s, ~48 keystrokes)
    write_wav(f"{audio_dir}/cero_typing_nl.wav", generate_synchronized_typing(2.6, 46, has_enter=True))
    
    # Beat 3: Port command (~1.0s, ~20 keystrokes)
    write_wav(f"{audio_dir}/cero_typing_port.wav", generate_synchronized_typing(1.0, 18, has_enter=True))
    
    # Beat 4: Close command (~0.7s, ~14 keystrokes)
    write_wav(f"{audio_dir}/cero_typing_close.wav", generate_synchronized_typing(0.7, 14, has_enter=True))
    
    # Beat 6: Workflow prompt (~0.9s, ~18 keystrokes)
    write_wav(f"{audio_dir}/cero_typing_flow.wav", generate_synchronized_typing(0.9, 18, has_enter=True))
    
    # 3. Micro interaction SFX
    write_wav(f"{audio_dir}/cero_click.wav", generate_refined_click(0.15))
    write_wav(f"{audio_dir}/cero_step_tick.wav", generate_step_tick(0.1))
    write_wav(f"{audio_dir}/cero_success.wav", generate_success_confirmation(0.9))
    write_wav(f"{audio_dir}/cero_morph.wav", generate_panel_morph(0.55))
    write_wav(f"{audio_dir}/cero_activate.wav", generate_mechanical_activation(0.35))
    
    print("All CERO audio assets generated successfully!")
