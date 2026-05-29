(function () {
  const Phaser = window.Phaser;

  if (!Phaser || !Phaser.VERSION?.startsWith("4.")) {
    throw new Error("Phaser 4 engine was not loaded from ./lib/phaser.js");
  }

  const BPM = 120;
  const STRONG_BEAT_EVERY = 4;
  const VOLUME_KEY = "basslineBurnoutVolume";
  const DEFAULT_VOLUME = 0.3;
  const MAIN_MENU_URL = "../cinematics-prototype/index.html?scene=mainMenu";
  const LEADERBOARD_KEY = "basslineBurnoutLeaderboard";

  function getGameVolume() {
    const savedValue = localStorage.getItem(VOLUME_KEY);
    if (savedValue === null) {
      return DEFAULT_VOLUME;
    }

    const saved = Number(savedValue);
    if (Number.isFinite(saved)) {
      return Math.max(0, Math.min(1, saved));
    }
    return DEFAULT_VOLUME;
  }
  function getLeaderboard() {
    const saved = localStorage.getItem(LEADERBOARD_KEY);

    if (!saved) {
      return [];
    }

    try {
      return JSON.parse(saved);
    } catch {
      return [];
    }
  }

  function saveLeaderboardScore(name, score) {
    const cleanName = (name || "Player").trim().slice(0, 12) || "Player";

    const leaderboard = getLeaderboard();
    leaderboard.push({
      name: cleanName,
      score: score,
    });

    leaderboard.sort((a, b) => b.score - a.score);

    const topScores = leaderboard.slice(0, 5);
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(topScores));

    return topScores;
  }
  function isFullscreen() {
    return document.fullscreenElement || document.webkitFullscreenElement;
  }

  async function toggleFullscreen() {
    try {
      if (isFullscreen()) {
        const exit =
          document.exitFullscreen ||
          document.webkitExitFullscreen;

        if (exit) {
          await exit.call(document);
        }
        return;
      }

      const element = document.documentElement;
      const request =
        element.requestFullscreen ||
        element.webkitRequestFullscreen ||
        element.msRequestFullscreen;

      if (request) {
        await request.call(element);
      }

      try {
        await screen.orientation?.lock?.("landscape");
      } catch (error) {
        // Some mobile browsers do not allow orientation lock.
      }
    } catch (error) {
      console.log("Fullscreen is not supported on this browser.", error);
    }
  }

  class BeatManager {
    constructor(scene, bpm = BPM) {
      this.scene = scene;
      this.bpm = bpm;
      this.beatIntervalMs = 60000 / bpm;
      this.beatIntervalSec = this.beatIntervalMs / 1000;
      this.beatIndex = 0;
      this.callbacks = [];
      this.audioContext = null;
      this.startAudioTime = 0;
      this.fallbackElapsedMs = 0;
      this.isRunning = false;
    }

    onBeat(callback) {
      this.callbacks.push(callback);
    }

    async start() {
      this.audioContext = this.createAudioContext();

      if (this.audioContext?.state === "suspended") {
        await this.audioContext.resume();
      }

      this.beatIndex = 0;
      this.fallbackElapsedMs = 0;
      this.startAudioTime = this.audioContext
        ? this.audioContext.currentTime + 0.04
        : 0;
      this.isRunning = true;
    }

    update(deltaMs) {
      if (!this.isRunning) return;

      const elapsedMs = this.getElapsedMs(deltaMs);

      while (elapsedMs >= this.beatIndex * this.beatIntervalMs) {
        this.emitBeat(this.beatIndex);
        this.beatIndex += 1;
      }
    }

    stop() {
      this.isRunning = false;
      this.callbacks = [];
    }

    getElapsedMs(deltaMs) {
      if (!this.audioContext) {
        this.fallbackElapsedMs += deltaMs;
        return this.fallbackElapsedMs;
      }

      return Math.max(0, (this.audioContext.currentTime - this.startAudioTime) * 1000);
    }

    emitBeat(index) {
      const strong = index % STRONG_BEAT_EVERY === 0;
      const color = strong ? 0x35f4ff : index % 2 === 0 ? 0xff2bd6 : 0xfff45b;
      const intensity = strong ? 1.35 : 1;
      const beat = { index, strong, color, intensity };

      this.playBeatSound(beat);
      this.callbacks.forEach((callback) => callback(beat));
    }

    createAudioContext() {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      return new AudioContextClass();
    }

    playBeatSound(beat) {
      if (!this.audioContext) return;

      const now = this.audioContext.currentTime;
      this.playKick(now, beat.strong);
      this.playHat(now + this.beatIntervalSec * 0.5);
      this.playMusicLayer(now, beat);

      if (beat.strong || beat.index % 2 === 0) {
        this.playBass(now, beat.index);
      }
    }

    playKick(time, strong) {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(strong ? 120 : 90, time);
      osc.frequency.exponentialRampToValueAtTime(42, time + 0.16);
      const volume = Math.max(getGameVolume(), 0.001);
      gain.gain.setValueAtTime((strong ? 0.22 : 0.16) * volume, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      osc.start(time);
      osc.stop(time + 0.2);
    }

    playBass(time, index) {
      const notes = [55, 65.41, 73.42, 49];
      const osc = this.audioContext.createOscillator();
      const filter = this.audioContext.createBiquadFilter();
      const gain = this.audioContext.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(notes[index % notes.length], time);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(420, time);
      const volume = Math.max(getGameVolume(), 0.001);
      gain.gain.setValueAtTime(0.055 * volume, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.28);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.audioContext.destination);
      osc.start(time);
      osc.stop(time + 0.3);
    }

    playMusicLayer(time, beat) {
      if (beat.strong) {
        this.playChord(time, beat.index);
      }

      this.playArp(time + this.beatIntervalSec * 0.25, beat.index);

      if (beat.index % 2 === 1) {
        this.playArp(time + this.beatIntervalSec * 0.75, beat.index + 2);
      }
    }

    playChord(time, index) {
      const chords = [
        [220, 277.18, 329.63],
        [196, 246.94, 293.66],
        [164.81, 207.65, 246.94],
        [174.61, 220, 261.63],
      ];
      const chord = chords[Math.floor(index / STRONG_BEAT_EVERY) % chords.length];
      const volume = Math.max(getGameVolume(), 0.001);

      chord.forEach((frequency, noteIndex) => {
        const osc = this.audioContext.createOscillator();
        const filter = this.audioContext.createBiquadFilter();
        const gain = this.audioContext.createGain();
        const startTime = time + noteIndex * 0.018;

        osc.type = "triangle";
        osc.frequency.setValueAtTime(frequency, startTime);
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(980, startTime);
        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.exponentialRampToValueAtTime(0.035 * volume, startTime + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.62);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.audioContext.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.66);
      });
    }

    playArp(time, index) {
      const notes = [440, 493.88, 554.37, 659.25, 739.99, 659.25, 554.37, 493.88];
      const osc = this.audioContext.createOscillator();
      const filter = this.audioContext.createBiquadFilter();
      const gain = this.audioContext.createGain();
      const volume = Math.max(getGameVolume(), 0.001);

      osc.type = "square";
      osc.frequency.setValueAtTime(notes[index % notes.length], time);
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(1600, time);
      filter.Q.setValueAtTime(5.5, time);
      gain.gain.setValueAtTime(0.001, time);
      gain.gain.exponentialRampToValueAtTime(0.028 * volume, time + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.105);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.audioContext.destination);
      osc.start(time);
      osc.stop(time + 0.12);
    }

    playHat(time) {
      const bufferSize = Math.floor(this.audioContext.sampleRate * 0.035);
      const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
      const output = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i += 1) {
        output[i] = Math.random() * 2 - 1;
      }

      const noise = this.audioContext.createBufferSource();
      const filter = this.audioContext.createBiquadFilter();
      const gain = this.audioContext.createGain();

      noise.buffer = buffer;
      filter.type = "highpass";
      filter.frequency.setValueAtTime(5200, time);
      const volume = Math.max(getGameVolume(), 0.001);
      gain.gain.setValueAtTime(0.035 * volume, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.audioContext.destination);
      noise.start(time);
      noise.stop(time + 0.045);
    }

    playCrashSound() {
      if (!this.audioContext) return;

      const now = this.audioContext.currentTime;
      const volume = Math.max(getGameVolume(), 0.001);
      this.playCrashNoise(now, volume);
      this.playCrashDrop(now, volume);
      this.playCrashRing(now + 0.02, volume);
    }

    playCrashNoise(time, volume) {
      const bufferSize = Math.floor(this.audioContext.sampleRate * 0.32);
      const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
      const output = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i += 1) {
        const decay = 1 - i / bufferSize;
        output[i] = (Math.random() * 2 - 1) * decay;
      }

      const noise = this.audioContext.createBufferSource();
      const filter = this.audioContext.createBiquadFilter();
      const gain = this.audioContext.createGain();

      noise.buffer = buffer;
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(2600, time);
      filter.frequency.exponentialRampToValueAtTime(360, time + 0.26);
      gain.gain.setValueAtTime(0.26 * volume, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.audioContext.destination);
      noise.start(time);
      noise.stop(time + 0.32);
    }

    playCrashDrop(time, volume) {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(190, time);
      osc.frequency.exponentialRampToValueAtTime(36, time + 0.22);
      gain.gain.setValueAtTime(0.2 * volume, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      osc.start(time);
      osc.stop(time + 0.26);
    }

    playCrashRing(time, volume) {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(720, time);
      osc.frequency.exponentialRampToValueAtTime(120, time + 0.16);
      gain.gain.setValueAtTime(0.11 * volume, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      osc.start(time);
      osc.stop(time + 0.19);
    }
  }

  const MAX_X_SPEED = 360;
  const DRIFT_MAX_X_SPEED = 520;
  const NORMAL_ACCEL = 1200;
  const DRIFT_ACCEL = 760;
  const NORMAL_DRAG = 1100;
  const DRIFT_DRAG = 260;
  const CAR_WIDTH = 34;
  const CAR_HEIGHT = 58;
  const MAX_GLOW_SCALE_X = 1.42;

  class PlayerCar extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
      super(scene, x, y);

      this.scene = scene;
      this.driftEnergy = 0;
      this.lastDriftBeat = -99;
      this.minRoadX = null;
      this.maxRoadX = null;

      this.glow = scene.add.rectangle(0, 2, CAR_WIDTH + 20, CAR_HEIGHT + 22, 0x00eaff, 0.16);
      this.bodyRect = scene.add.rectangle(0, 0, CAR_WIDTH, CAR_HEIGHT, 0x21f7ff, 1);
      this.cabin = scene.add.rectangle(0, -10, CAR_WIDTH - 12, CAR_HEIGHT - 30, 0x08152a, 0.85);
      this.nose = scene.add.rectangle(0, -CAR_HEIGHT / 2 + 5, CAR_WIDTH - 8, 7, 0xff2bd6, 1);

      this.add([this.glow, this.bodyRect, this.cabin, this.nose]);
      scene.add.existing(this);
      scene.physics.add.existing(this);

      this.body.setSize(CAR_WIDTH, CAR_HEIGHT);
      this.body.setCollideWorldBounds(true);
      this.body.setDragX(NORMAL_DRAG);
      this.body.setMaxVelocity(DRIFT_MAX_X_SPEED, 0);

      this.createDriftParticles();
    }

    setRoadBounds(left, right, height) {
      const maxVisualWidth = (CAR_WIDTH + 20) * MAX_GLOW_SCALE_X;
      const visualHalfWidth = maxVisualWidth / 2;

      this.minRoadX = left + visualHalfWidth;
      this.maxRoadX = right - visualHalfWidth;
      this.body.setBoundsRectangle(
        new Phaser.Geom.Rectangle(
          this.minRoadX,
          0,
          this.maxRoadX - this.minRoadX + CAR_WIDTH,
          height
        )
      );
    }

    update(cursors, keys, deltaMs, touchControl) {
      const delta = deltaMs / 1000;

      const keyboardLeft = cursors.left.isDown || keys.left.isDown;
      const keyboardRight = cursors.right.isDown || keys.right.isDown;

      let direction = (keyboardRight ? 1 : 0) - (keyboardLeft ? 1 : 0);
      let drifting = keys.shift.isDown && direction !== 0;

      const touchActive =
        touchControl &&
        touchControl.active &&
        Number.isFinite(touchControl.targetX);

      if (touchActive) {
        const targetX = Phaser.Math.Clamp(
          touchControl.targetX,
          this.minRoadX,
          this.maxRoadX
        );

        const distance = targetX - this.x;

        if (Math.abs(distance) > 8) {
          direction = Math.sign(distance);

          const targetVelocity = Phaser.Math.Clamp(
            distance * 8,
            -DRIFT_MAX_X_SPEED,
            DRIFT_MAX_X_SPEED
          );

          this.body.setVelocityX(
            Phaser.Math.Linear(this.body.velocity.x, targetVelocity, 0.2)
          );
        } else {
          direction = 0;
          this.body.setVelocityX(
            Phaser.Math.Linear(this.body.velocity.x, 0, 0.25)
          );
        }

        drifting = Math.abs(distance) > 55;
      }

      this.body.setDragX(drifting ? DRIFT_DRAG : NORMAL_DRAG);
      this.body.setMaxVelocity(drifting ? DRIFT_MAX_X_SPEED : MAX_X_SPEED, 0);

      if (!touchActive) {
        if (direction !== 0) {
          this.body.setAccelerationX(
            direction * (drifting ? DRIFT_ACCEL : NORMAL_ACCEL)
          );
        } else {
          this.body.setAccelerationX(0);
        }
      } else {
        this.body.setAccelerationX(0);
      }

      this.driftEnergy = Phaser.Math.Clamp(
        this.driftEnergy + (drifting ? 1 : -1.6) * delta,
        0,
        1
      );

      const speedLean = Phaser.Math.Clamp(
        this.body.velocity.x / DRIFT_MAX_X_SPEED,
        -1,
        1
      );

      const targetRotation = speedLean * (drifting ? 0.44 : 0.22);
      this.rotation = Phaser.Math.Linear(
        this.rotation,
        targetRotation,
        drifting ? 0.16 : 0.22
      );

      this.glow.alpha = 0.14 + this.driftEnergy * 0.24;
      this.glow.scaleX = 1 + this.driftEnergy * 0.24;

      this.updateParticles(drifting, speedLean);
      this.constrainToRoad();

      return drifting;
    }

    constrainToRoad() {
      if (this.minRoadX === null || this.maxRoadX === null) return;

      const clampedX = Phaser.Math.Clamp(this.x, this.minRoadX, this.maxRoadX);
      if (clampedX === this.x) return;

      this.x = clampedX;
      this.body.velocity.x = 0;
      this.body.setAccelerationX(0);
    }

    onBeat(beat) {
      this.scene.tweens.add({
        targets: this.glow,
        alpha: 0.48 * beat.intensity,
        scaleX: 1.42,
        scaleY: 1.22,
        duration: 70,
        yoyo: true,
        ease: "Sine.easeOut",
      });
    }

    markPerfectDrift(beatIndex) {
      this.lastDriftBeat = beatIndex;
      this.scene.tweens.add({
        targets: this.bodyRect,
        scaleX: 1.12,
        scaleY: 1.05,
        duration: 55,
        yoyo: true,
        ease: "Quad.easeOut",
      });
    }

    createDriftParticles() {
      const spark = this.scene.add.particles(0, 0, "spark", {
        lifespan: { min: 180, max: 420 },
        speed: { min: 70, max: 190 },
        scale: { start: 0.9, end: 0 },
        alpha: { start: 0.85, end: 0 },
        tint: [0x35f4ff, 0xff2bd6, 0xfff45b],
        blendMode: "ADD",
        emitting: false,
      });

      spark.startFollow(this, 0, CAR_HEIGHT / 2 - 2);
      this.sparkEmitter = spark;
    }

    updateParticles(drifting, speedLean) {
      this.sparkEmitter.emitting = drifting;
      this.sparkEmitter.setParticleSpeed(
        -70 - Math.abs(speedLean) * 80,
        70 + Math.abs(speedLean) * 160
      );
      this.sparkEmitter.setAngle({
        min: 75 + speedLean * 35,
        max: 105 + speedLean * 35,
      });
      this.sparkEmitter.setFrequency(drifting ? 18 : 80);
    }

    destroy(fromScene) {
      this.sparkEmitter?.destroy();
      super.destroy(fromScene);
    }
  }

  const OBSTACLE_COLORS = {
    block: 0xff2b6d,
    wall: 0x35f4ff,
    laser: 0xfff45b,
  };

  class Obstacle extends Phaser.GameObjects.Rectangle {
    constructor(scene, x, y, type, speed, beatColor) {
      const size = Obstacle.getSize(type);
      super(scene, x, y, size.width, size.height, OBSTACLE_COLORS[type] ?? beatColor, 0.95);

      this.type = type;
      this.passed = false;
      this.baseSpeed = speed;

      scene.add.existing(this);
      scene.physics.add.existing(this);
      this.body.setImmovable(true);
      this.body.setVelocityY(speed);
      this.body.setSize(size.width, size.height);
      this.setStrokeStyle(type === "laser" ? 2 : 3, beatColor, 1);
      this.setBlendMode(Phaser.BlendModes.ADD);

      this.glow = scene.add.rectangle(x, y, size.width + 18, size.height + 18, beatColor, 0.14);
      this.glow.setBlendMode(Phaser.BlendModes.ADD);

      scene.tweens.add({
        targets: [this, this.glow],
        scaleX: type === "laser" ? 1.06 : 1.12,
        scaleY: type === "laser" ? 1.2 : 1.12,
        duration: 80,
        yoyo: true,
        ease: "Quad.easeOut",
      });
    }

    static getSize(type) {
      if (type === "wall") return { width: 150, height: 28 };
      if (type === "laser") return { width: 86, height: 14 };
      return { width: 46, height: 46 };
    }

    preUpdate() {
      if (this.glow?.active) {
        this.glow.setPosition(this.x, this.y);
        this.glow.setRotation(this.rotation);
      }
    }

    setScrollSpeed(speed) {
      this.baseSpeed = speed;
      this.body.setVelocityY(speed);
    }

    destroy(fromScene) {
      this.glow?.destroy();
      super.destroy(fromScene);
    }
  }
  class MenuScene extends Phaser.Scene {
    constructor() {
      super("MenuScene");
    }

    create() {
      const { width, height } = this.scale;

      this.createBackground(width, height);

      const title = this.add
        .text(width / 2, height * 0.34, "MUSIC DRIFT", {
          fontFamily: "Arial Black, Arial",
          fontSize: "64px",
          color: "#35f4ff",
          stroke: "#ff2bd6",
          strokeThickness: 3,
        })
        .setOrigin(0.5);

      this.add
        .text(width / 2, height * 0.48, "RUNNER PROTOTYPE", {
          fontFamily: "Arial",
          fontSize: "22px",
          color: "#fff45b",
          letterSpacing: 4,
        })
        .setOrigin(0.5);

      const prompt = this.add
        .text(width / 2, height * 0.68, "Touch to Play", {
          fontFamily: "Arial",
          fontSize: "24px",
          color: "#ffffff",
          backgroundColor: "#111827",
          padding: {
            x: 18,
            y: 10,
          },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      const fullscreenButton = this.add
        .text(width - 24, height - 24, "Fullscreen", {
          fontFamily: "Arial",
          fontSize: "18px",
          color: "#ffffff",
          backgroundColor: "#111827",
          padding: {
            x: 14,
            y: 8,
          },
        })
        .setOrigin(1, 1)
        .setDepth(20)
        .setInteractive({ useHandCursor: true });

      fullscreenButton.on("pointerover", () => {
        fullscreenButton.setStyle({ color: "#fff45b" });
      });

      fullscreenButton.on("pointerout", () => {
        fullscreenButton.setStyle({ color: "#ffffff" });
      });

      fullscreenButton.on("pointerdown", () => {
        toggleFullscreen();
      });
      const backButton = this.add
        .text(width / 2, height * 0.82, "Back to Main Menu", {
          fontFamily: "Arial",
          fontSize: "20px",
          color: "#ffffff",
          backgroundColor: "#111827",
          padding: {
            x: 18,
            y: 10,
          },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      this.tweens.add({
        targets: title,
        scale: 1.04,
        duration: 500,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });

      this.tweens.add({
        targets: prompt,
        alpha: 0.45,
        duration: 420,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });

      let hasStarted = false;

      const startGame = () => {
        if (hasStarted) return;
        hasStarted = true;

        this.cameras.main.flash(180, 53, 244, 255);
        this.time.delayedCall(120, () => this.scene.start("GameScene"));
      };

      prompt.on("pointerover", () => {
        prompt.setStyle({ color: "#fff45b" });
      });

      prompt.on("pointerout", () => {
        prompt.setStyle({ color: "#ffffff" });
      });

      prompt.on("pointerdown", startGame);

      this.input.keyboard.once("keydown-SPACE", startGame);

      backButton.on("pointerover", () => {
        backButton.setStyle({ color: "#fff45b" });
      });

      backButton.on("pointerout", () => {
        backButton.setStyle({ color: "#ffffff" });
      });

      backButton.on("pointerdown", () => {
        this.cameras.main.fadeOut(350, 0, 0, 0);

        this.cameras.main.once("camerafadeoutcomplete", () => {
          window.location.href = MAIN_MENU_URL;
        });
      });
    }

    createBackground(width, height) {
      const graphics = this.add.graphics();
      graphics.fillStyle(0x050611, 1);
      graphics.fillRect(0, 0, width, height);

      for (let x = 80; x < width; x += 80) {
        graphics.lineStyle(1, 0x17304a, 0.45);
        graphics.lineBetween(x, 0, x, height);
      }

      for (let y = 40; y < height; y += 40) {
        graphics.lineStyle(1, 0x2a1450, 0.35);
        graphics.lineBetween(0, y, width, y);
      }
    }
  }

  const WORLD_SCROLL_SPEED = 220;
  const SPEED_GAIN_PER_BEAT = 3.2;
  const MAX_SCROLL_SPEED = 470;
  const SPEED_GAIN_PER_SECOND = 16;
  const ROAD_WIDTH = 560;
  const SPAWN_Y = -60;
  const SAFE_ZONE_RADIUS = 92;

  class GameScene extends Phaser.Scene {
    constructor() {
      super("GameScene");
    }

    create() {
      this.score = 0;
      this.combo = 0;
      this.bestCombo = 0;
      this.lastBeatWithDrift = -99;
      this.scrollSpeed = WORLD_SCROLL_SPEED;
      this.isGameOver = false;

      this.createTextures();
      this.createWorld();
      this.createPlayer();
      this.createUI();
      this.createInput();
      this.createBeatSystem();
      this.createColliders();
    }

    update(_time, delta) {
      if (this.isGameOver) return;

      this.beatManager.update(delta);

      this.scrollSpeed = Math.min(
        MAX_SCROLL_SPEED,
        this.scrollSpeed + SPEED_GAIN_PER_SECOND * (delta / 1000)
      );

      this.updateBackground(delta);

      const drifting = this.player.update(
        this.cursors,
        this.keys,
        delta,
        this.touchControl
      );

      this.obstacles.getChildren().forEach((obstacle) => {
        if (!obstacle.active) return;

        obstacle.setScrollSpeed(this.scrollSpeed);
        obstacle.preUpdate();

        if (!obstacle.passed && obstacle.y > this.player.y + 40) {
          obstacle.passed = true;
          this.combo += 1;
          this.bestCombo = Math.max(this.bestCombo, this.combo);
          this.score += 100 + this.combo * 8;
          this.pulseUI(0x35f4ff);
        }

        if (obstacle.y > this.scale.height + 100) {
          obstacle.destroy();
        }
      });

      this.score += Math.floor(delta * 0.02);
      this.updateUI();
    }

    createTextures() {
      const spark = this.add.graphics();
      spark.fillStyle(0xffffff, 1);
      spark.fillCircle(5, 5, 5);
      spark.generateTexture("spark", 10, 10);
      spark.destroy();
    }

    createWorld() {
      const { width, height } = this.scale;
      this.roadX = width / 2;
      this.roadLeft = this.roadX - ROAD_WIDTH / 2;
      this.roadRight = this.roadX + ROAD_WIDTH / 2;

      this.background = this.add.graphics();
      this.beatFlash = this.add.rectangle(width / 2, height / 2, width, height, 0x35f4ff, 0);
      this.beatFlash.setBlendMode(Phaser.BlendModes.ADD);

      this.edgeGlowLeft = this.add.rectangle(this.roadLeft, height / 2, 10, height, 0xff2bd6, 0.45);
      this.edgeGlowRight = this.add.rectangle(this.roadRight, height / 2, 10, height, 0x35f4ff, 0.45);
      this.edgeGlowLeft.setBlendMode(Phaser.BlendModes.ADD);
      this.edgeGlowRight.setBlendMode(Phaser.BlendModes.ADD);

      this.gridOffset = 0;
      this.spectrumBars = Array.from({ length: 28 }, (_, index) => {
        const x = 42 + index * 32;
        return this.add.rectangle(x, height - 16, 14, 26, index % 2 ? 0xff2bd6 : 0x35f4ff, 0.34);
      });

      this.drawBackground();
    }

    createPlayer() {
      this.player = new PlayerCar(this, this.scale.width / 2, this.scale.height - 105);
      this.player.setRoadBounds(this.roadLeft, this.roadRight, this.scale.height);
    }

    createInput() {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keys = this.input.keyboard.addKeys({
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      });

      this.touchControl = {
        active: false,
        targetX: this.scale.width / 2,
      };

      const updateTouchTarget = (pointer) => {
        this.touchControl.active = true;
        this.touchControl.targetX = Phaser.Math.Clamp(
          pointer.x,
          this.roadLeft,
          this.roadRight
        );
      };

      this.input.on("pointerdown", updateTouchTarget);

      this.input.on("pointermove", (pointer) => {
        if (!pointer.isDown) return;
        updateTouchTarget(pointer);
      });

      this.input.on("pointerup", () => {
        this.touchControl.active = false;
      });

      this.input.on("pointerupoutside", () => {
        this.touchControl.active = false;
      });
    }

    createUI() {
      this.uiText = this.add.text(24, 20, "", {
        fontFamily: "Arial",
        fontSize: "20px",
        color: "#ffffff",
        lineSpacing: 8,
      });
      this.uiText.setDepth(10);

      this.beatDot = this.add.circle(28, 114, 8, 0x35f4ff, 1);
      this.beatDot.setDepth(10);
      this.updateUI();
    }

    createBeatSystem() {
      this.beatManager = new BeatManager(this, BPM);
      this.beatManager.onBeat((beat) => this.onBeat(beat));
      this.beatManager.start();
    }

    createColliders() {
      this.obstacles = this.physics.add.group({ runChildUpdate: false });
      this.physics.add.overlap(this.player, this.obstacles, () => this.handleCrash());
    }

    onBeat(beat) {
      this.spawnObstacle(beat);
      this.pulseWorld(beat);
      this.player.onBeat(beat);

      const driftWasOnBeat = this.lastBeatWithDrift >= this.beatManager.beatIndex - 1;
      if (driftWasOnBeat) {
        this.combo += 1;
        this.score += beat.strong ? 160 : 90;
        this.player.markPerfectDrift(beat.index);
        this.pulseUI(0xfff45b);
      }
    }

    spawnObstacle(beat) {
      const types = ["block", "block", "wall", "laser"];
      const type = Phaser.Utils.Array.GetRandom(types);
      const laneCount = 5;
      const laneWidth = ROAD_WIDTH / laneCount;
      const lane = Phaser.Math.Between(0, laneCount - 1);
      const x = this.roadLeft + laneWidth * lane + laneWidth / 2;

      if (Math.abs(x - this.player.x) < SAFE_ZONE_RADIUS && beat.strong) {
        return;
      }

      const obstacle = new Obstacle(this, x, SPAWN_Y, type, this.scrollSpeed, beat.color);
      this.obstacles.add(obstacle);
      obstacle.setScrollSpeed(this.scrollSpeed);

      if (type === "laser") {
        obstacle.rotation = Phaser.Math.DegToRad(Phaser.Math.Between(-12, 12));
        obstacle.body.setSize(obstacle.width, obstacle.height);
      }
    }

    pulseWorld(beat) {
      this.beatFlash.setFillStyle(beat.color, beat.strong ? 0.22 : 0.13);
      this.tweens.add({
        targets: this.beatFlash,
        alpha: 0,
        duration: 170,
        ease: "Quad.easeOut",
      });

      this.tweens.add({
        targets: [this.edgeGlowLeft, this.edgeGlowRight],
        scaleX: beat.strong ? 2.4 : 1.7,
        alpha: beat.strong ? 0.78 : 0.58,
        duration: 80,
        yoyo: true,
        ease: "Quad.easeOut",
      });

      this.spectrumBars.forEach((bar, index) => {
        const height = Phaser.Math.Between(16, beat.strong ? 110 : 72);
        this.tweens.add({
          targets: bar,
          height,
          alpha: 0.22 + (index % 3) * 0.14,
          duration: 80,
          yoyo: true,
          ease: "Sine.easeOut",
        });
      });

      this.pulseUI(beat.color);
    }

    pulseUI(color) {
      this.beatDot.setFillStyle(color, 1);
      this.tweens.add({
        targets: [this.uiText, this.beatDot],
        scale: 1.12,
        duration: 70,
        yoyo: true,
        ease: "Quad.easeOut",
      });
    }

    updateBackground(delta) {
      this.gridOffset = (this.gridOffset + this.scrollSpeed * delta * 0.001) % 48;
      this.drawBackground();
    }

    drawBackground() {
      const { width, height } = this.scale;

      this.background.clear();
      this.background.fillStyle(0x050611, 1);
      this.background.fillRect(0, 0, width, height);
      this.background.fillStyle(0x090b20, 1);
      this.background.fillRect(this.roadLeft, 0, ROAD_WIDTH, height);

      for (let x = this.roadLeft; x <= this.roadRight; x += ROAD_WIDTH / 5) {
        this.background.lineStyle(1, 0x1b5e82, 0.42);
        this.background.lineBetween(x, 0, x, height);
      }

      for (let y = -48; y < height + 48; y += 48) {
        this.background.lineStyle(1, 0x281b62, 0.48);
        this.background.lineBetween(this.roadLeft, y + this.gridOffset, this.roadRight, y + this.gridOffset);
      }

      this.background.lineStyle(3, 0xff2bd6, 0.8);
      this.background.lineBetween(this.roadLeft, 0, this.roadLeft, height);
      this.background.lineStyle(3, 0x35f4ff, 0.8);
      this.background.lineBetween(this.roadRight, 0, this.roadRight, height);
    }

    updateUI() {
      this.uiText.setText(`Score ${this.score}\nCombo ${this.combo}\nBPM ${BPM}`);
    }

    handleCrash() {
      if (this.isGameOver) return;

      this.isGameOver = true;
      this.combo = 0;
      this.beatManager.playCrashSound();
      this.beatManager.stop();
      this.physics.pause();
      this.cameras.main.shake(260, 0.018);
      this.cameras.main.flash(180, 255, 43, 109);

      this.tweens.add({
        targets: this.player,
        scale: 1.35,
        alpha: 0.1,
        rotation: this.player.rotation + 0.8,
        duration: 250,
        ease: "Back.easeIn",
      });

      this.time.delayedCall(420, () => {
        this.scene.start("GameOverScene", {
          score: this.score,
          combo: this.bestCombo,
        });
      });
    }
  }

  class GameOverScene extends Phaser.Scene {
    constructor() {
      super("GameOverScene");
    }

    init(data) {
      this.score = data.score ?? 0;
      this.combo = data.combo ?? 0;
    }

    create() {
      const { width, height } = this.scale;

      const playerName = window.prompt("Enter your name for the leaderboard:", "Player");
      const leaderboard = saveLeaderboardScore(playerName, this.score);

      this.cameras.main.setBackgroundColor("#070713");

      this.add
        .text(width / 2, height * 0.16, "CRASHED", {
          fontFamily: "Arial Black, Arial",
          fontSize: "54px",
          color: "#ff2b6d",
          stroke: "#ffffff",
          strokeThickness: 2,
        })
        .setOrigin(0.5);

      this.add
        .text(width / 2, height * 0.30, `Score ${this.score}\nBest Combo ${this.combo}`, {
          fontFamily: "Arial",
          fontSize: "24px",
          color: "#35f4ff",
          align: "center",
          lineSpacing: 10,
        })
        .setOrigin(0.5);

      const leaderboardText = leaderboard
        .map((entry, index) => {
          return `${index + 1}. ${entry.name} - ${entry.score}`;
        })
        .join("\n");

      this.add
        .text(width / 2, height * 0.50, `Leaderboard\n${leaderboardText}`, {
          fontFamily: "Arial",
          fontSize: "22px",
          color: "#fff45b",
          align: "center",
          lineSpacing: 8,
        })
        .setOrigin(0.5);

      const retry = this.add
        .text(width / 2, height * 0.74, "Touch to Retry", {
          fontFamily: "Arial",
          fontSize: "24px",
          color: "#ffffff",
          backgroundColor: "#111827",
          padding: {
            x: 18,
            y: 10,
          },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      this.tweens.add({
        targets: retry,
        scale: 1.06,
        alpha: 0.55,
        duration: 420,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });

      const restartGame = () => {
        this.cameras.main.flash(160, 53, 244, 255);
        this.time.delayedCall(100, () => this.scene.start("GameScene"));
      };

      retry.on("pointerover", () => {
        retry.setStyle({ color: "#fff45b" });
      });

      retry.on("pointerout", () => {
        retry.setStyle({ color: "#ffffff" });
      });

      retry.on("pointerdown", restartGame);

      this.input.keyboard.once("keydown-SPACE", restartGame);

      const backButton = this.add
        .text(width / 2, height * 0.88, "Back to Main Menu", {
          fontFamily: "Arial",
          fontSize: "22px",
          backgroundColor: "#111827",
          padding: {
            x: 18,
            y: 10,
          },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      backButton.on("pointerover", () => {
        backButton.setStyle({ color: "#fff45b" });
      });

      backButton.on("pointerout", () => {
        backButton.setStyle({ color: "#ffffff" });
      });

      backButton.on("pointerdown", () => {
        this.cameras.main.fadeOut(350, 0, 0, 0);

        this.cameras.main.once("camerafadeoutcomplete", () => {
          window.location.href = MAIN_MENU_URL;
        });
      });
    }
  }

  const config = {
    type: Phaser.AUTO,
    parent: "game",
    width: 960,
    height: 540,
    backgroundColor: "#050611",
    pixelArt: false,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: "arcade",
      arcade: {
        debug: false,
      },
    },
    scene: [MenuScene, GameScene, GameOverScene],
  };

  window.game = new Phaser.Game(config);

  window.addEventListener("resize", () => {
    window.game.scale.refresh();
  });

  window.addEventListener("orientationchange", () => {
    setTimeout(() => {
      window.game.scale.refresh();
    }, 300);
  });
})();
