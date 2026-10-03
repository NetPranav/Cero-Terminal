import { describe, it, expect } from 'vitest';
import { SecurityEngine } from './SecurityEngine';


describe('Screen, camera and microphone capture', () => {
  it.each([
    'screencapture -x shot.png',
    'grim -g "$(slurp)" out.png',
    'scrot out.png',
    'gnome-screenshot -f a.png',
    'import -window root a.png',
    'ffmpeg -f avfoundation -i "0" cam.mp4',
    'imagesnap photo.jpg',
  ])('%s always asks', (cmd) => {
    const risk = new SecurityEngine().analyzeCommand(cmd);
    expect(risk.requiresConsent).toBe(true);
    expect(risk.categories).toContain('privacy-capture');
  });
});
