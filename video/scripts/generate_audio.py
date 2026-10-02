import math
import struct
import wave
import random

SAMPLE_RATE = 44100

def write_wav(filename, samples, sample_rate=SAMPLE_RATE):
    with wave.open(filename, 'w') as wf:
        wf.setnchannels(2)  # Stereo
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        # Convert float samples (-1.0 to 1.0) to 16-bit signed ints
        raw_data = bytearray()
        for left, right in samples:
            left_val = max(-32767, min(32767, int(left * 32767.0)))
            right_val = max(-32767, min(32767, int(right * 32767.0)))
            raw_data.extend(struct.pack('<hh', left_val, right_val))
        wf.writeframes(raw_data)

def generate_ambient_track(duration=30.0):
    total_samples = int(duration * SAMPLE_RATE)
    samples = []
    
    for i in range(total_samples):
        t = i / SAMPLE_RATE
        
        # Base envelope: gentle fade in, subtle swell, calm fade out
        if t < 2.0:
            env = t / 2.0
        elif t > 28.0:
            env = max(0.0, (30.0 - t) / 2.0)
        else:
            env = 1.0
            
        # Dramatic arc envelope
        # t=0..4: quiet tension (0.12)
        # t=4..7.5: reveal swell (0.18)
        # t=7.5..13: focus tension with subtle 55Hz & 82.5Hz (0.22)
        # t=13..15: build up (0.25)
        # t=15..25: warm resolved payoff with 55Hz, 110Hz, 165Hz (0.24)
        # t=25..30: calm resolution (0.15)
        if t < 4.0:
            section_gain = 0.14
        elif t < 7.5:
            section_gain = 0.14 + 0.06 * ((t - 4.0) / 3.5)
        elif t < 13.0:
            section_gain = 0.20
        elif t < 15.0:
            section_gain = 0.20 + 0.05 * ((t - 13.0) / 2.0)
        elif t < 25.0:
            section_gain = 0.22 - 0.04 * ((t - 15.0) / 10.0)
        else:
            section_gain = 0.15 * max(0.0, (30.0 - t) / 5.0)
            
        gain = env * section_gain
        
        # Sub-bass sine: 55Hz (A1)
        sub = math.sin(2 * math.pi * 55.0 * t)
        
        # Warm harmonic: 110Hz (A2) with slow phase modulation
        harm1 = 0.45 * math.sin(2 * math.pi * 110.0 * t + 0.2 * math.sin(2 * math.pi * 0.1 * t))
        
        # Subtle fifth: 165Hz (E3) in payoff section (t >= 14.0)
        harm2 = 0.0
        if t >= 13.5:
            fifth_gain = min(1.0, (t - 13.5) / 2.0)
            harm2 = 0.25 * fifth_gain * math.sin(2 * math.pi * 165.0 * t)
            
        # Subtle high-frequency texture / gentle tape hiss
        noise = (random.random() * 2.0 - 1.0) * 0.008
        
        # Stereo widening
        left = gain * (sub * 0.7 + harm1 * 0.8 + harm2 * 0.7 + noise)
        right = gain * (sub * 0.7 + harm1 * 0.75 + harm2 * 0.85 - noise)
        
        samples.append((left, right))
        
    return samples

def generate_key_clicks(num_clicks, duration):
    total_samples = int(duration * SAMPLE_RATE)
    samples = [[0.0, 0.0] for _ in range(total_samples)]
    
    interval = total_samples / max(1, num_clicks)
    for c in range(num_clicks):
        start_idx = int(c * interval + (random.random() - 0.5) * (interval * 0.3))
        start_idx = max(0, min(total_samples - 500, start_idx))
        
        # Click sound: 8ms burst of filtered noise + high pop
        click_len = int(0.008 * SAMPLE_RATE)
        freq = 1800 + (c % 5) * 120
        for k in range(click_len):
            idx = start_idx + k
            if idx >= total_samples:
                break
            decay = math.exp(-k / (SAMPLE_RATE * 0.002))
            val = decay * 0.25 * (math.sin(2 * math.pi * freq * (k / SAMPLE_RATE)) + (random.random() - 0.5) * 0.5)
            pan = 0.4 + 0.2 * random.random()
            samples[idx][0] += val * (1.0 - pan)
            samples[idx][1] += val * pan
            
    return samples

def generate_whoosh(duration=0.65):
    total_samples = int(duration * SAMPLE_RATE)
    samples = []
    for i in range(total_samples):
        t = i / SAMPLE_RATE
        progress = t / duration
        # Arch envelope
        env = math.sin(math.pi * progress) ** 2
        # Frequency sweep from 200Hz to 800Hz and back
        freq = 300 + 400 * math.sin(math.pi * progress)
        noise = (random.random() * 2.0 - 1.0) * 0.15
        tone = math.sin(2 * math.pi * freq * t) * 0.12
        val = env * (noise + tone) * 0.35
        # Gentle stereo sweep left to right
        left = val * (1.0 - progress * 0.6)
        right = val * (0.4 + progress * 0.6)
        samples.append((left, right))
    return samples

def generate_confirm_chime(duration=0.9):
    total_samples = int(duration * SAMPLE_RATE)
    samples = []
    f1 = 523.25  # C5
    f2 = 659.25  # E5
    f3 = 783.99  # G5
    for i in range(total_samples):
        t = i / SAMPLE_RATE
        # Fast attack, slow exponential release
        decay1 = math.exp(-t * 4.5)
        decay2 = math.exp(-max(0.0, t - 0.08) * 4.0) if t >= 0.08 else 0.0
        decay3 = math.exp(-max(0.0, t - 0.16) * 3.5) if t >= 0.16 else 0.0
        
        s1 = 0.25 * decay1 * math.sin(2 * math.pi * f1 * t)
        s2 = 0.22 * decay2 * math.sin(2 * math.pi * f2 * t)
        s3 = 0.18 * decay3 * math.sin(2 * math.pi * f3 * t)
        
        val = s1 + s2 + s3
        samples.append((val * 0.85, val * 0.95))
    return samples

if __name__ == '__main__':
    print("Generating cinematic audio assets for Sentinel Terminal...")
    ambient = generate_ambient_track(30.0)
    write_wav("video/public/audio/ambient_soundtrack.wav", ambient)
    print("Ambient soundtrack created: 30s")
    
    typing1 = generate_key_clicks(12, 0.45)
    write_wav("video/public/audio/typing_cmd1.wav", typing1)
    
    typing2 = generate_key_clicks(36, 1.25)
    write_wav("video/public/audio/typing_intent.wav", typing2)
    
    whoosh = generate_whoosh(0.7)
    write_wav("video/public/audio/whoosh_transition.wav", whoosh)
    
    chime = generate_confirm_chime(1.0)
    write_wav("video/public/audio/confirm_chime.wav", chime)
    print("All audio assets successfully synthesized!")
