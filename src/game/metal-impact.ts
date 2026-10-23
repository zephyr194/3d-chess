export function playMetalClash(context: AudioContext) {
  const now = context.currentTime;
  for (const [frequency, duration, volume] of [[880, .26, .045], [1423, .19, .03], [2377, .12, .017]]) {
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * .91, now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * .065), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  const strike = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
  strike.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.value = 2300;
  filter.Q.value = .7;
  gain.gain.value = .085;
  strike.connect(filter).connect(gain).connect(context.destination);
  strike.start(now);
}
