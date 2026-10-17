/**
 * FlowDoro - Pomodoro Focus Timer
 * Full implementation: Auto Cycle, SVG Circular Progress,
 * Web Audio Ambient Sound Generator (Waves, Rain, Birds), Alarm Chimes,
 * Realtime Browser Tab Title, Session Counter, and Theme Transitions.
 */

// --- 1. Configuration Constants ---
const FOCUS_DURATION = 25 * 60; // 25 minutes in seconds (1500)
const BREAK_DURATION = 5 * 60;  // 5 minutes in seconds (300)
const CIRCUMFERENCE = 2 * Math.PI * 150; // ≈ 942.478

// --- 2. Application State ---
const state = {
  theme: 'dark', // 'dark' | 'light'
  mode: 'focus', // 'focus' | 'break'
  timeRemaining: FOCUS_DURATION,
  totalDuration: FOCUS_DURATION,
  isRunning: false,
  timerInterval: null,
  endTime: null, // used for drift compensation
  completedSessions: 0,
  
  sound: {
    selected: 'none', // 'none' | 'waves' | 'rain' | 'birds' | 'campfire'
    volume: 0.6,
    isMuted: false,
    previousVolume: 0.6
  }
};

// --- 3. DOM Elements ---
const el = {
  body: document.body,
  btnThemeToggle: document.getElementById('btn-theme-toggle'),
  themeLabel: document.getElementById('theme-label'),
  timeDisplay: document.getElementById('time-display'),
  statusText: document.getElementById('timer-status-text'),
  progressRingBar: document.getElementById('progress-ring-bar'),
  modeIndicator: document.getElementById('mode-indicator'),
  modeIcon: document.getElementById('mode-icon'),
  modeText: document.getElementById('mode-text'),
  
  btnToggle: document.getElementById('btn-toggle'),
  btnToggleLabel: document.getElementById('btn-toggle-label'),
  iconPlay: document.getElementById('icon-play'),
  iconPause: document.getElementById('icon-pause'),
  btnReset: document.getElementById('btn-reset'),
  
  sessionCount: document.getElementById('session-count'),
  sessionDots: document.getElementById('session-dots'),
  btnResetSessions: document.getElementById('btn-reset-sessions'),
  
  soundChips: document.querySelectorAll('.sound-chip'),
  soundStatusPill: document.getElementById('current-sound-status'),
  btnMute: document.getElementById('btn-mute'),
  volIconHigh: document.getElementById('vol-icon-high'),
  volIconMuted: document.getElementById('vol-icon-muted'),
  volumeSlider: document.getElementById('volume-slider'),
  volumeText: document.getElementById('volume-text'),
  toast: document.getElementById('toast')
};

// --- 4. High-Fidelity Nature Ambient Sound Engine & Chimes ---
const AUDIO_SOURCES = {
  waves: 'sounds/waves.mp3',
  rain: 'sounds/rain.mp3',
  birds: 'sounds/forest.mp3',
  campfire: 'sounds/fireplace.mp3'
};

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.currentAudio = null;
    this.audioPool = {};
    this.currentType = 'none';
    this.isAutoplayBlocked = false;
    this.unlockBound = false;
    this._unlockHandler = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  getAudio(type) {
    if (!AUDIO_SOURCES[type]) return null;
    if (!this.audioPool[type]) {
      const audio = new Audio(AUDIO_SOURCES[type]);
      audio.loop = true;
      audio.preload = 'auto';
      this.audioPool[type] = audio;
    }
    return this.audioPool[type];
  }

  updateMasterVolume() {
    const vol = state.sound.isMuted ? 0 : state.sound.volume;
    if (this.currentAudio) {
      this.currentAudio.volume = vol;
    }
  }

  stopAmbient() {
    this.isAutoplayBlocked = false;
    this.unbindUnlockGesture();
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch (e) {}
      this.currentAudio = null;
    }
    this.currentType = 'none';
  }

  isPlaying() {
    return Boolean(this.currentAudio && !this.currentAudio.paused && !this.isAutoplayBlocked);
  }

  getLabelForType(type) {
    const labels = {
      waves: '🌊 파도 소리 재생 중',
      rain: '🌧️ 빗소리 재생 중',
      birds: '🐦 새소리 재생 중',
      campfire: '🔥 장작불 소리 재생 중'
    };
    return labels[type] || '사운드 재생 중';
  }

  playAmbient(type) {
    this.init();

    if (!type || type === 'none') {
      this.stopAmbient();
      this.updateStatusUI('사운드 끔', false, false);
      return;
    }

    // 이미 같은 사운드가 실제로 재생 중인 경우 볼륨 및 UI만 확인
    if (this.currentAudio && this.currentType === type && this.isPlaying()) {
      this.updateMasterVolume();
      this.updateStatusUI(this.getLabelForType(type), true, false);
      return;
    }

    // 다른 사운드로 전환 시 이전 사운드 일시정지
    if (this.currentAudio && this.currentType !== type) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch (e) {}
    }

    const audio = this.getAudio(type);
    if (!audio) return;

    this.currentAudio = audio;
    this.currentType = type;
    audio.volume = state.sound.isMuted ? 0 : state.sound.volume;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          this.isAutoplayBlocked = false;
          this.unbindUnlockGesture();
          this.updateStatusUI(this.getLabelForType(type), true, false);
        })
        .catch(err => {
          console.warn('Autoplay prevented by browser policy; waiting for user gesture:', err);
          this.isAutoplayBlocked = true;
          this.handleAutoplayBlocked(type);
        });
    } else {
      this.isAutoplayBlocked = false;
      this.updateStatusUI(this.getLabelForType(type), true, false);
    }
  }

  handleAutoplayBlocked(type) {
    this.updateStatusUI('🔊 화면 클릭 시 사운드 재생', false, true);
    showToast('🔊 화면 아무 곳이나 클릭하시면 사운드가 바로 이어집니다.');
    this.bindUnlockGesture();
  }

  bindUnlockGesture() {
    if (this.unlockBound) return;
    this.unlockBound = true;

    this._unlockHandler = () => {
      this.init();
      if (this.currentAudio && (this.currentAudio.paused || this.isAutoplayBlocked)) {
        this.currentAudio.play()
          .then(() => {
            this.isAutoplayBlocked = false;
            this.updateStatusUI(this.getLabelForType(this.currentType), true, false);
          })
          .catch(err => {
            console.warn('Playback retry on gesture failed:', err);
          });
      } else if (state.sound.selected !== 'none') {
        this.playAmbient(state.sound.selected);
      }
      this.unbindUnlockGesture();
    };

    // window 전체에 캡처 단계로 이벤트 감지 (어떤 버튼이나 배경을 눌러도 즉시 소리 잠금 해제)
    window.addEventListener('click', this._unlockHandler, { capture: true, once: false });
    window.addEventListener('pointerdown', this._unlockHandler, { capture: true, once: false });
    window.addEventListener('keydown', this._unlockHandler, { capture: true, once: false });
    window.addEventListener('touchstart', this._unlockHandler, { capture: true, once: false });
  }

  unbindUnlockGesture() {
    if (this._unlockHandler) {
      window.removeEventListener('click', this._unlockHandler, { capture: true });
      window.removeEventListener('pointerdown', this._unlockHandler, { capture: true });
      window.removeEventListener('keydown', this._unlockHandler, { capture: true });
      window.removeEventListener('touchstart', this._unlockHandler, { capture: true });
      this._unlockHandler = null;
    }
    this.unlockBound = false;
  }

  updateStatusUI(text, isPlaying, isWaitingClick = false) {
    if (!el.soundStatusPill) return;
    el.soundStatusPill.textContent = text;
    el.soundStatusPill.classList.toggle('playing', isPlaying);
    el.soundStatusPill.classList.toggle('needs-click', isWaitingClick);
  }

  /**
   * Play crystal-clear session completion chime
   * @param {string} mode - 'focus' (session done) or 'break' (break done)
   */
  playSessionChime(mode) {
    this.init();
    const now = this.ctx.currentTime;
    const chimeMaster = this.ctx.createGain();
    chimeMaster.connect(this.ctx.destination);
    
    // Set alarm volume (respect mute, or minimum audible)
    const vol = state.sound.isMuted ? 0.3 : Math.max(state.sound.volume, 0.4);
    chimeMaster.gain.setValueAtTime(vol, now);

    if (mode === 'focus') {
      // Warm, relaxing dual-tone bell chime (Focus completed!)
      const notes = [
        { f: 523.25, time: 0 },    // C5
        { f: 659.25, time: 0.25 }, // E5
        { f: 783.99, time: 0.5 },  // G5
        { f: 1046.50, time: 0.75 } // C6
      ];

      notes.forEach(n => {
        this.ringBell(n.f, now + n.time, 1.8, chimeMaster);
      });
    } else {
      // Energetic, uplifting 3-tone arpeggio (Break finished, ready to focus!)
      const notes = [
        { f: 440.00, time: 0 },    // A4
        { f: 554.37, time: 0.18 }, // C#5
        { f: 659.25, time: 0.36 }, // E5
        { f: 880.00, time: 0.54 }  // A5
      ];

      notes.forEach(n => {
        this.ringBell(n.f, now + n.time, 1.5, chimeMaster);
      });
    }
  }

  ringBell(freq, startTime, duration, targetNode) {
    const osc = this.ctx.createOscillator();
    const harmonic = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    harmonic.type = 'triangle';
    harmonic.frequency.setValueAtTime(freq * 2.01, startTime); // soft chime overtone

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.35, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    harmonic.connect(gain);
    gain.connect(targetNode);

    osc.start(startTime);
    harmonic.start(startTime);
    osc.stop(startTime + duration);
    harmonic.stop(startTime + duration);
  }
}

const audio = new SoundEngine();

// --- 5. State Persistence (localStorage) ---
const STORAGE_KEYS = {
  SESSIONS: 'pomodoro_sessions',
  TIMER_STATE: 'pomodoro_timer_state',
  THEME: 'pomodoro_theme'
};

// Theme Management (Light / Dark)
function setTheme(theme, save = true) {
  state.theme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);

  if (el.btnThemeToggle) {
    const isDark = state.theme === 'dark';
    el.btnThemeToggle.setAttribute('aria-label', isDark ? '라이트 모드로 전환' : '다크 모드로 전환');
    el.btnThemeToggle.title = isDark ? '라이트 모드로 전환 (T)' : '다크 모드로 전환 (T)';
  }
  if (el.themeLabel) {
    el.themeLabel.textContent = state.theme === 'dark' ? '라이트' : '다크';
  }

  if (save) {
    localStorage.setItem(STORAGE_KEYS.THEME, state.theme);
    saveState();
  }
}

function toggleTheme() {
  const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
  setTheme(nextTheme, true);
  showToast(nextTheme === 'light' ? '☀️ 산뜻한 라이트 모드로 전환되었습니다.' : '🌙 아늑한 다크 모드로 전환되었습니다.');
}

let isRestoringState = false;

function saveState() {
  if (isRestoringState) return; // 복원 중에는 덮어쓰지 않음
  try {
    const payload = {
      theme: state.theme,
      mode: state.mode,
      timeRemaining: state.timeRemaining,
      totalDuration: state.totalDuration,
      isRunning: state.isRunning,
      endTime: state.endTime,
      savedAt: Date.now(),
      sound: {
        selected: state.sound.selected,
        volume: state.sound.volume,
        isMuted: state.sound.isMuted,
        isPlaying: audio.isPlaying()
      }
    };
    localStorage.setItem(STORAGE_KEYS.TIMER_STATE, JSON.stringify(payload));
  } catch (err) {
    console.warn('Failed to save Pomodoro state to localStorage:', err);
  }
}

function restoreTimerState() {
  isRestoringState = true;
  try {
    // Legacy fallback check
    const raw = localStorage.getItem(STORAGE_KEYS.TIMER_STATE) || localStorage.getItem('flowdoro_timer_state');
    if (!raw) {
      const initialTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
      setTheme(initialTheme, false);
      isRestoringState = false;
      return false;
    }
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') {
      const initialTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
      setTheme(initialTheme, false);
      isRestoringState = false;
      return false;
    }

    // 0. Restore Theme (Light / Dark)
    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || saved.theme || 'dark';
    setTheme(savedTheme, false);

    // 1. Restore mode & UI Theme
    const mode = saved.mode === 'break' ? 'break' : 'focus';
    state.mode = mode;
    state.totalDuration = saved.totalDuration || (mode === 'focus' ? FOCUS_DURATION : BREAK_DURATION);

    el.body.className = mode === 'focus' ? 'mode-focus' : 'mode-break';
    el.modeIcon.textContent = mode === 'focus' ? '🎯' : '☕';
    el.modeText.textContent = mode === 'focus' ? '집중 시간 (25분)' : '휴식 시간 (5분)';
    el.progressRingBar.style.stroke = mode === 'focus' ? 'url(#focus-gradient)' : 'url(#break-gradient)';

    // 2. Restore sound preferences without triggering early save
    if (saved.sound) {
      if (typeof saved.sound.volume === 'number') {
        state.sound.volume = saved.sound.volume;
        setVolume(saved.sound.volume);
      }
      if (saved.sound.isMuted) {
        mute();
      }
      if (saved.sound.selected && saved.sound.selected !== 'none') {
        state.sound.selected = saved.sound.selected;
        el.soundChips.forEach(chip => {
          const isTarget = chip.getAttribute('data-sound') === saved.sound.selected;
          chip.classList.toggle('active', isTarget);
          chip.setAttribute('aria-checked', isTarget ? 'true' : 'false');
        });
      }
    }

    // 3. Handle Running vs Paused Timer
    if (saved.isRunning && saved.endTime) {
      const now = Date.now();
      const remainingMs = saved.endTime - now;
      const remainingSec = Math.ceil(remainingMs / 1000);

      if (remainingSec > 0) {
        // Still has time remaining -> resume running!
        state.timeRemaining = remainingSec;
        updateDisplay();
        isRestoringState = false; // 복원 완료, 타이머 구동 허용
        startTimer();
        showToast(`🔄 이전 세션을 이어서 진행합니다. (남은 시간: ${formatTime(state.timeRemaining)})`);
        return true;
      } else {
        // Timer finished while browser was closed!
        if (mode === 'focus') {
          incrementSessionCount();
          state.mode = 'break';
          state.totalDuration = BREAK_DURATION;
          state.timeRemaining = BREAK_DURATION;
          el.body.className = 'mode-break';
          el.modeIcon.textContent = '☕';
          el.modeText.textContent = '휴식 시간 (5분)';
          el.progressRingBar.style.stroke = 'url(#break-gradient)';
          updateDisplay();
          showToast('🎉 브라우저가 닫힌 동안 25분 집중이 완료되었습니다! 5분 휴식을 시작해보세요.');
        } else {
          state.mode = 'focus';
          state.totalDuration = FOCUS_DURATION;
          state.timeRemaining = FOCUS_DURATION;
          el.body.className = 'mode-focus';
          el.modeIcon.textContent = '🎯';
          el.modeText.textContent = '집중 시간 (25분)';
          el.progressRingBar.style.stroke = 'url(#focus-gradient)';
          updateDisplay();
          showToast('💪 브라우저가 닫힌 동안 휴식이 끝났습니다! 새로운 25분 집중을 시작해보세요.');
        }
        isRestoringState = false;
        saveState();
        return true;
      }
    } else {
      // Timer was paused or idle
      if (typeof saved.timeRemaining === 'number' && saved.timeRemaining > 0 && saved.timeRemaining <= state.totalDuration) {
        state.timeRemaining = saved.timeRemaining;
        state.isRunning = false;
        if (saved.timeRemaining < state.totalDuration) {
          el.iconPlay.classList.remove('hide');
          el.iconPause.classList.add('hide');
          el.btnToggleLabel.textContent = '계속하기';
          el.btnToggle.setAttribute('aria-label', '타이머 계속하기');
          el.statusText.textContent = '이전 일시정지 상태를 복원했습니다.';
          showToast(`⏸️ 이전 일시정지 상태를 복원했습니다. (남은 시간: ${formatTime(state.timeRemaining)})`);
        }
        updateDisplay();

        // 브라우저 닫기 전 사운드가 켜져 있었다면 복원 시 재생 시도
        if (saved.sound && saved.sound.isPlaying && state.sound.selected !== 'none') {
          audio.playAmbient(state.sound.selected);
        }

        isRestoringState = false;
        saveState();
        return true;
      }
    }
  } catch (err) {
    console.warn('Failed to restore Pomodoro state from localStorage:', err);
  } finally {
    isRestoringState = false;
  }
  return false;
}

function loadSessionCount() {
  const saved = localStorage.getItem(STORAGE_KEYS.SESSIONS);
  state.completedSessions = saved ? parseInt(saved, 10) : 0;
  updateSessionCountUI();
}

function incrementSessionCount() {
  state.completedSessions++;
  localStorage.setItem(STORAGE_KEYS.SESSIONS, state.completedSessions.toString());
  updateSessionCountUI();
}

function resetSessionCount() {
  if (state.completedSessions === 0) return;
  if (confirm('완료한 세션 카운트를 0으로 초기화하시겠습니까?')) {
    state.completedSessions = 0;
    localStorage.removeItem(STORAGE_KEYS.SESSIONS);
    updateSessionCountUI();
    showToast('세션 카운트가 초기화되었습니다.');
  }
}

function updateSessionCountUI() {
  el.sessionCount.textContent = state.completedSessions;
  el.sessionDots.innerHTML = '';
  // Show up to 10 visual progress dots
  const dotCount = Math.min(state.completedSessions, 10);
  for (let i = 0; i < dotCount; i++) {
    const dot = document.createElement('span');
    dot.className = 'session-dot';
    el.sessionDots.appendChild(dot);
  }
}

// --- 6. Timer Core Logic (Drift-Compensated) ---
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateDisplay() {
  // Update Center Digits
  const timeStr = formatTime(state.timeRemaining);
  el.timeDisplay.textContent = timeStr;

  // Update SVG Progress Ring
  // Progress fraction: 1 (at full remaining) down to 0 (at 00:00)
  const fraction = state.timeRemaining / state.totalDuration;
  // Offset moves from 0 (full circle) to CIRCUMFERENCE (empty circle)
  const offset = CIRCUMFERENCE * (1 - fraction);
  el.progressRingBar.style.strokeDashoffset = offset.toFixed(2);

  // Update Browser Tab Title
  updateTabTitle(timeStr);
}

function updateTabTitle(timeStr) {
  if (state.isRunning) {
    if (state.mode === 'focus') {
      document.title = `(${timeStr}) 🎯 집중 - Pomodoro`;
    } else {
      document.title = `(${timeStr}) ☕ 휴식 - Pomodoro`;
    }
  } else if (state.timeRemaining < state.totalDuration && state.timeRemaining > 0) {
    document.title = `⏸️ (${timeStr}) 일시정지 - Pomodoro`;
  } else {
    document.title = 'Pomodoro - 몰입을 위한 포모도로 타이머';
  }
}

function startTimer() {
  audio.init();
  state.isRunning = true;
  state.endTime = Date.now() + state.timeRemaining * 1000;

  // Auto-play selected ambient sound on start if user picked one
  if (state.sound.selected !== 'none') {
    if (!audio.isPlaying()) {
      audio.playAmbient(state.sound.selected);
    }
  }

  // UI state
  el.iconPlay.classList.add('hide');
  el.iconPause.classList.remove('hide');
  el.btnToggleLabel.textContent = '일시정지';
  el.btnToggle.setAttribute('aria-label', '타이머 일시정지');
  el.statusText.textContent = state.mode === 'focus' ? '몰입하여 집중하는 중...' : '잠시 휴식을 취하세요.';

  saveState();

  // Interval loop with drift compensation
  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    const now = Date.now();
    const remainingMs = Math.max(0, state.endTime - now);
    const newSec = Math.ceil(remainingMs / 1000);

    if (newSec !== state.timeRemaining) {
      state.timeRemaining = newSec;
      saveState(); // persist every second
    }

    updateDisplay();

    if (state.timeRemaining <= 0) {
      clearInterval(state.timerInterval);
      handleSessionComplete();
    }
  }, 250);

  updateDisplay();
}

function pauseTimer() {
  state.isRunning = false;
  clearInterval(state.timerInterval);

  el.iconPlay.classList.remove('hide');
  el.iconPause.classList.add('hide');
  el.btnToggleLabel.textContent = '계속하기';
  el.btnToggle.setAttribute('aria-label', '타이머 계속하기');
  el.statusText.textContent = '일시정지 상태입니다.';

  saveState();
  updateDisplay();
}

function toggleTimer() {
  if (state.isRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function resetTimer() {
  pauseTimer();
  state.timeRemaining = state.totalDuration;
  el.btnToggleLabel.textContent = '시작하기';
  el.statusText.textContent = state.mode === 'focus' ? '집중할 준비가 되셨나요?' : '휴식을 시작할 준비가 되셨나요?';
  saveState();
  updateDisplay();
}

/**
 * Auto-transition when session completes
 */
function handleSessionComplete() {
  if (state.mode === 'focus') {
    // 25분 집중 종료 -> 5분 휴식으로 전환
    incrementSessionCount();
    audio.playSessionChime('focus');
    showToast('🎉 25분 집중 완료! 5분 휴식을 시작합니다.');

    // Switch to break mode
    switchMode('break', true);
  } else {
    // 5분 휴식 종료 -> 25분 집중으로 전환
    audio.playSessionChime('break');
    showToast('💪 5분 휴식 종료! 새로운 25분 집중을 시작합니다.');

    // Switch to focus mode
    switchMode('focus', true);
  }
  saveState();
}

function switchMode(newMode, autoStart = false) {
  state.mode = newMode;

  if (newMode === 'focus') {
    state.totalDuration = FOCUS_DURATION;
    state.timeRemaining = FOCUS_DURATION;
    el.body.className = 'mode-focus';
    el.modeIcon.textContent = '🎯';
    el.modeText.textContent = '집중 시간 (25분)';
  } else {
    state.totalDuration = BREAK_DURATION;
    state.timeRemaining = BREAK_DURATION;
    el.body.className = 'mode-break';
    el.modeIcon.textContent = '☕';
    el.modeText.textContent = '휴식 시간 (5분)';
  }

  // Set SVG track/bar attributes
  el.progressRingBar.style.stroke = state.mode === 'focus' ? 'url(#focus-gradient)' : 'url(#break-gradient)';

  resetTimer();
  saveState();

  if (autoStart) {
    startTimer();
  }
}

// --- 7. White Noise Station Controls ---
function setupSoundStation() {
  // Sound Selection Chips
  el.soundChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const soundType = chip.getAttribute('data-sound');
      setSoundType(soundType);
    });
  });

  // Sound Status Pill Click: 바로 재생 또는 토글
  if (el.soundStatusPill) {
    el.soundStatusPill.addEventListener('click', () => {
      if (state.sound.selected !== 'none') {
        if (audio.isPlaying()) {
          setSoundType(state.sound.selected); // 이미 재생 중이면 끄기
        } else {
          audio.init();
          audio.playAmbient(state.sound.selected); // 정지 또는 대기 중이면 즉시 재생
        }
      } else {
        setSoundType('waves');
      }
    });
  }

  // Volume Slider
  el.volumeSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    setVolume(val / 100);
    if (state.sound.isMuted && val > 0) {
      unmute();
    }
  });

  // Mute Button
  el.btnMute.addEventListener('click', toggleMute);
}

function setSoundType(type) {
  // 현재 실제로 소리가 재생 중인 상태에서 동일한 버튼을 누르면 끄기('none')
  // 만약 자동재생 차단 등으로 소리가 멈춰 있던 상태라면 해당 버튼을 누를 때 즉시 재생 시작!
  const isCurrentlyPlayingThis = (state.sound.selected === type) && audio.isPlaying();
  const nextType = isCurrentlyPlayingThis ? 'none' : type;
  state.sound.selected = nextType;

  // Update UI chips
  el.soundChips.forEach(chip => {
    const isTarget = chip.getAttribute('data-sound') === nextType;
    chip.classList.toggle('active', isTarget);
    chip.setAttribute('aria-checked', isTarget ? 'true' : 'false');
  });

  // Play audio or stop
  audio.playAmbient(nextType);
  saveState();
}

function setVolume(fraction) {
  state.sound.volume = fraction;
  audio.updateMasterVolume();

  const percentage = Math.round(fraction * 100);
  el.volumeSlider.value = percentage;
  el.volumeSlider.style.setProperty('--slider-val', `${percentage}%`);
  el.volumeText.textContent = `${percentage}%`;
  saveState();
}

function toggleMute() {
  audio.init();
  if (state.sound.isMuted) {
    unmute();
  } else {
    mute();
  }
}

function mute() {
  state.sound.previousVolume = state.sound.volume;
  state.sound.isMuted = true;
  audio.updateMasterVolume();

  el.btnMute.classList.add('is-muted');
  el.volIconHigh.classList.add('hide');
  el.volIconMuted.classList.remove('hide');
  el.volumeText.textContent = '0%';
  showToast('음소거됨 🔇');
  saveState();
}

function unmute() {
  state.sound.isMuted = false;
  state.sound.volume = state.sound.previousVolume > 0 ? state.sound.previousVolume : 0.6;
  audio.updateMasterVolume();

  el.btnMute.classList.remove('is-muted');
  el.volIconHigh.classList.remove('hide');
  el.volIconMuted.classList.add('hide');
  setVolume(state.sound.volume);
  showToast('음소거 해제 🔊');
  saveState();
}

// --- 8. Toast Helper ---
let toastTimeout = null;
function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    el.toast.classList.remove('show');
  }, 3200);
}

// --- 9. Keyboard Shortcuts & Visibility Recovery ---
function setupShortcuts() {
  window.addEventListener('keydown', (e) => {
    // Avoid triggering shortcuts if user is focused on interactive inputs
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

    if (e.code === 'Space') {
      e.preventDefault();
      toggleTimer();
    } else if (e.code === 'KeyR') {
      e.preventDefault();
      resetTimer();
    } else if (e.code === 'KeyM') {
      e.preventDefault();
      toggleMute();
    } else if (e.code === 'KeyT') {
      e.preventDefault();
      toggleTheme();
    }
  });

  // Re-synchronize when user returns to tab
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.isRunning) {
      const now = Date.now();
      const remainingMs = Math.max(0, state.endTime - now);
      state.timeRemaining = Math.ceil(remainingMs / 1000);
      updateDisplay();
    }
  });
}

// --- 10. Initialization ---
function initApp() {
  loadSessionCount();
  setupSoundStation();
  setupShortcuts();

  // Button Listeners
  if (el.btnThemeToggle) {
    el.btnThemeToggle.addEventListener('click', toggleTheme);
  }
  el.btnToggle.addEventListener('click', toggleTimer);
  el.btnReset.addEventListener('click', resetTimer);
  el.btnResetSessions.addEventListener('click', resetSessionCount);

  // Set initial stroke-dasharray
  el.progressRingBar.style.strokeDasharray = `${CIRCUMFERENCE} ${CIRCUMFERENCE}`;

  // Restore previous timer, mode, and sound state from localStorage
  const restored = restoreTimerState();

  if (!restored) {
    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
    setTheme(savedTheme, false);
    setVolume(0.6);
    updateDisplay();
    saveState();
  }

  // Save on window close / navigation / tab hide
  window.addEventListener('beforeunload', saveState);
  window.addEventListener('pagehide', saveState);
}

// Run when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);
