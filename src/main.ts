import './styles.css';

type ThemeMode = 'archive' | 'night';

const triggerKeys = [
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
  'D0',
  'D1',
  'D2',
  'D3',
  'D4',
  'D5',
  'D6',
  'D7',
  'D8',
  'D9',
] as const;

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing app root');
}

app.innerHTML = `
  <section class="instrument" aria-label="Key trigger countdown">
    <div class="chart-layer" aria-hidden="true"></div>
    <header class="masthead">
      <div>
        <p class="eyebrow">KEY TRIGGER INSTRUMENT</p>
        <h1>Countdown</h1>
      </div>
      <div class="theme-switch" aria-label="Theme">
        <button class="theme-option is-active" data-theme="archive" type="button">Archive</button>
        <button class="theme-option" data-theme="night" type="button">Night</button>
      </div>
    </header>

    <div class="control-grid">
      <label class="field">
        <span>Trigger</span>
        <select id="triggerKey"></select>
      </label>

      <label class="field">
        <span>Seconds</span>
        <input id="secondsInput" inputmode="numeric" value="9" />
      </label>

      <label class="field">
        <span>Signal</span>
        <input id="signalInput" inputmode="numeric" value="2" />
      </label>
    </div>

    <div class="readout" aria-live="polite">
      <p id="statusLabel">Standby</p>
      <div id="timeDisplay">STOPPED</div>
    </div>

    <div class="actions">
      <button id="startBtn" class="primary-action" type="button">Start</button>
      <button id="stopBtn" class="secondary-action" type="button">Stop</button>
    </div>
  </section>
`;

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }

  return element;
}

const triggerSelect = requireElement<HTMLSelectElement>('#triggerKey');
const secondsInput = requireElement<HTMLInputElement>('#secondsInput');
const signalInput = requireElement<HTMLInputElement>('#signalInput');
const statusLabel = requireElement<HTMLParagraphElement>('#statusLabel');
const timeDisplay = requireElement<HTMLDivElement>('#timeDisplay');
const startBtn = requireElement<HTMLButtonElement>('#startBtn');
const stopBtn = requireElement<HTMLButtonElement>('#stopBtn');
const audio = new Audio('/tick.wav');

for (const key of triggerKeys) {
  const option = document.createElement('option');
  option.value = key;
  option.textContent = key;
  triggerSelect.append(option);
}

triggerSelect.value = 'F1';

let intervalId: number | undefined;
let timeLeft = 0;

function parsePositiveSeconds(input: HTMLInputElement): number | null {
  const parsed = Number.parseInt(input.value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseSignalSecond(): number | null {
  const parsed = Number.parseInt(signalInput.value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function setStatus(status: string): void {
  statusLabel.textContent = status;
}

function setDisplay(value: string | number): void {
  timeDisplay.textContent = String(value);
}

function playSignal(): void {
  audio.currentTime = 0;
  audio.play().catch(() => {
    setStatus('Audio waiting');
  });
}

function isRunning(): boolean {
  return intervalId !== undefined;
}

function stopTimer(): void {
  if (intervalId !== undefined) {
    window.clearInterval(intervalId);
    intervalId = undefined;
  }
}

function startCountdown(): void {
  const seconds = parsePositiveSeconds(secondsInput);

  if (seconds === null) {
    setStatus('Invalid seconds');
    secondsInput.focus();
    return;
  }

  timeLeft = seconds;
  setDisplay(timeLeft);
  setStatus('Counting');

  if (!isRunning()) {
    intervalId = window.setInterval(tick, 1000);
  }
}

function tick(): void {
  if (timeLeft > 0) {
    timeLeft -= 1;
    setDisplay(timeLeft);

    const signalSecond = parseSignalSecond();

    if (signalSecond !== null && timeLeft <= signalSecond) {
      playSignal();
    }

    return;
  }

  const seconds = parsePositiveSeconds(secondsInput);

  if (seconds === null) {
    stopTimer();
    setDisplay('STOPPED');
    setStatus('Invalid seconds');
    secondsInput.focus();
    return;
  }

  timeLeft = seconds;
  setDisplay(timeLeft);
  setStatus('Restarting');
}

function stopCountdown(): void {
  stopTimer();
  setDisplay('STOPPED');
  setStatus('Standby');
}

function normalizeKeyboardEvent(event: KeyboardEvent): string {
  if (/^F([1-9]|1[0-2])$/.test(event.key)) {
    return event.key;
  }

  if (/^[0-9]$/.test(event.key)) {
    return `D${event.key}`;
  }

  return event.key.toUpperCase();
}

function handleTrigger(candidateKey: string): void {
  if (candidateKey === triggerSelect.value && isRunning()) {
    startCountdown();
  }
}

function setTheme(theme: ThemeMode): void {
  document.documentElement.dataset.atlasMode = theme;

  for (const button of document.querySelectorAll<HTMLButtonElement>('.theme-option')) {
    button.classList.toggle('is-active', button.dataset.theme === theme);
  }
}

async function setupNativeKeyboardListener(): Promise<void> {
  if (!('__TAURI_INTERNALS__' in window)) {
    return;
  }

  const { listen } = await import('@tauri-apps/api/event');
  await listen<string>('global-key-pressed', (event) => handleTrigger(event.payload));
}

startBtn.addEventListener('click', startCountdown);
stopBtn.addEventListener('click', stopCountdown);
window.addEventListener('keydown', (event) => handleTrigger(normalizeKeyboardEvent(event)));

for (const button of document.querySelectorAll<HTMLButtonElement>('.theme-option')) {
  button.addEventListener('click', () => setTheme(button.dataset.theme === 'night' ? 'night' : 'archive'));
}

setTheme('archive');
setupNativeKeyboardListener().catch(() => setStatus('Keyboard listener unavailable'));
