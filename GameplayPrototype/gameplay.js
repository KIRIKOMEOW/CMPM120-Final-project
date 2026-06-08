(function () {
  const Phaser = window.Phaser;

  if (!Phaser || !Phaser.VERSION?.startsWith("4.")) {
    throw new Error("Phaser 4 engine was not loaded from ./lib/phaser.js");
  }

  const BPM = 150;
  const STRONG_BEAT_EVERY = 4;
  const VOLUME_KEY = "basslineBurnoutVolume";
  const DEFAULT_VOLUME = 0.3;
  const MAIN_MENU_URL = "../cinematics-prototype/index.html?scene=mainMenu";
  const LEADERBOARD_KEY = "basslineBurnoutLeaderboard";
  const ASSET_KEYS = {
    background: "road-background",
    note: "ui-note",
    npcCar: "npc-car",
    npcTruck: "npc-truck",
    player: "player-car",
    rhythm: "ui-rhythm",
  };
  const ASSET_PATHS = {
    [ASSET_KEYS.background]: "../assets/background.png",
    [ASSET_KEYS.note]: "../assets/note.png",
    [ASSET_KEYS.npcCar]: "../assets/npc_car.png",
    [ASSET_KEYS.npcTruck]: "../assets/npc_truck.png",
    [ASSET_KEYS.player]: "../assets/player.png",
    [ASSET_KEYS.rhythm]: "../assets/rhythm.png",
  };

  function preloadGameplayAssets(scene) {
    Object.entries(ASSET_PATHS).forEach(([key, path]) => {
      if (!scene.textures.exists(key)) {
        scene.load.image(key, path);
      }
    });
  }

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

    playNotePickupSound() {
      if (!this.audioContext) return;

      const now = this.audioContext.currentTime;
      const volume = Math.max(getGameVolume(), 0.001);
      const notes = [659.25, 880, 1174.66];

      notes.forEach((frequency, index) => {
        const startTime = now + index * 0.035;
        const osc = this.audioContext.createOscillator();
        const filter = this.audioContext.createBiquadFilter();
        const gain = this.audioContext.createGain();

        osc.type = index === notes.length - 1 ? "triangle" : "square";
        osc.frequency.setValueAtTime(frequency, startTime);
        osc.frequency.exponentialRampToValueAtTime(frequency * 1.08, startTime + 0.055);
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(1800 + index * 420, startTime);
        filter.Q.setValueAtTime(4.5, startTime);
        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.exponentialRampToValueAtTime(0.08 * volume, startTime + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.audioContext.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.13);
      });
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
  const CAR_WIDTH = 42;
  const CAR_HEIGHT = 60;
  const MAX_GLOW_SCALE_X = 1.42;

  class PlayerCar extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
      super(scene, x, y);

      this.scene = scene;
      this.driftEnergy = 0;
      this.lastDriftBeat = -99;
      this.minRoadX = null;
      this.maxRoadX = null;

      this.glow = scene.add.rectangle(0, 2, CAR_WIDTH + 20, CAR_HEIGHT + 22, 0x00eaff, 0);

      this.shieldAura = scene.add.rectangle(
        0,
        0,
        CAR_WIDTH + 30,
        CAR_HEIGHT + 34,
        0x35f4ff,
        0.18
      );

      this.shieldAura.setStrokeStyle(3, 0x35f4ff, 0.95);
      this.shieldAura.setAlpha(0);

      this.bodySprite = scene.add.image(0, 0, ASSET_KEYS.player);
      this.bodySprite.setDisplaySize(CAR_WIDTH, CAR_HEIGHT);
      this.bodyRect = this.bodySprite;

      this.add([this.glow, this.shieldAura, this.bodySprite]);
      scene.add.existing(this);
      scene.physics.add.existing(this);

      const playerHitboxWidth = CAR_WIDTH * 0.7;
      const playerHitboxHeight = CAR_HEIGHT * 0.8;

      this.body.setSize(playerHitboxWidth, playerHitboxHeight);
      this.body.setOffset(
        -playerHitboxWidth / 2,
        -playerHitboxHeight / 2
      );
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
      if (this.hasShieldVisual && this.shieldAura) {
        this.shieldAura.rotation += delta * 1.6;
      }

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
    setShieldActive(active) {
      if (!this.shieldAura) return;

      this.hasShieldVisual = active;
      this.shieldAura.setAlpha(active ? 0.5 : 0);
      this.shieldAura.setScale(1);
    }

    pulseShield() {
      if (!this.shieldAura) return;

      this.scene.tweens.killTweensOf(this.shieldAura);
      this.shieldAura.setAlpha(0.75);
      this.shieldAura.setScale(1);

      this.scene.tweens.add({
        targets: this.shieldAura,
        scaleX: 1.18,
        scaleY: 1.12,
        alpha: 0.45,
        duration: 220,
        yoyo: true,
        ease: "Sine.easeOut",
      });
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

  class Obstacle extends Phaser.GameObjects.Image {
    constructor(scene, x, y, type, speed, beatColor) {
      const visual = Obstacle.getVisual(type);
      super(scene, x, y, visual.texture);

      this.type = type;
      this.passed = false;
      this.baseSpeed = speed;
      this.collisionWidth = visual.collisionWidth;
      this.collisionHeight = visual.collisionHeight;

      this.setDisplaySize(visual.width, visual.height);

      scene.add.existing(this);
      scene.physics.add.existing(this);

      this.body.setImmovable(true);
      this.body.setAllowGravity(false);
      this.body.setVelocityY(speed);

      const scaledBodyWidth = visual.collisionWidth / this.scaleX;
      const scaledBodyHeight = visual.collisionHeight / this.scaleY;

      this.body.setSize(scaledBodyWidth, scaledBodyHeight);
      this.body.setOffset(
        (this.width - scaledBodyWidth) / 2,
        (this.height - scaledBodyHeight) / 2
      );

      this.glow = scene.add.rectangle(
        x,
        y,
        visual.width + 18,
        visual.height + 18,
        beatColor,
        0
      );

      this.glow.setBlendMode(Phaser.BlendModes.ADD);
      this.glow.setDepth(1);
      this.setDepth(2);
    }

    static getVisual(type) {
      if (type === "sideTruck") {
        return {
          texture: ASSET_KEYS.npcTruck,
          width: 130,
          height: 64,
          collisionWidth: 108,
          collisionHeight: 38,
        };
      }

      if (type === "wall") {
        return {
          texture: ASSET_KEYS.npcTruck,
          width: 72,
          height: 130,
          collisionWidth: 38,
          collisionHeight: 108,
        };
      }

      if (type === "laser") {
        return {
          texture: ASSET_KEYS.npcTruck,
          width: 66,
          height: 120,
          collisionWidth: 36,
          collisionHeight: 98,
        };
      }

      return {
        texture: ASSET_KEYS.npcCar,
        width: 52,
        height: 72,
        collisionWidth: 34,
        collisionHeight: 56,
      };
    }

    preUpdate() {
      if (this.glow?.active) {
        this.glow.setPosition(this.x, this.y);
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

    preload() {
      preloadGameplayAssets(this);
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
        .text(width / 2, height * 0.60, "START LEVELS", {
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
      const endlessButton = this.add
        .text(width / 2, height * 0.72, "ENDLESS MODE", {
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
        .text(width / 2, height * 0.88, "Back to Main Menu", {
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

      const startGame = (mode) => {
        if (hasStarted) return;
        hasStarted = true;

        this.cameras.main.flash(180, 53, 244, 255);
        this.time.delayedCall(120, () => {
          this.scene.start("GameScene", { mode });
        });
      };

      prompt.on("pointerover", () => {
        prompt.setStyle({ color: "#fff45b" });
      });

      prompt.on("pointerout", () => {
        prompt.setStyle({ color: "#ffffff" });
      });

      prompt.on("pointerdown", () => {
        startGame("levels");
      });
      endlessButton.on("pointerover", () => {
        endlessButton.setStyle({ color: "#fff45b" });
      });

      endlessButton.on("pointerout", () => {
        endlessButton.setStyle({ color: "#ffffff" });
      });

      endlessButton.on("pointerdown", () => {
        startGame("normalEndless");
      });

      this.input.keyboard.once("keydown-SPACE", () => {
        startGame("levels");
      });

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
      const background = this.add.image(width / 2, height / 2, ASSET_KEYS.background);
      const source = this.textures.get(ASSET_KEYS.background).getSourceImage();
      const scale = Math.max(width / source.width, height / source.height);

      background.setDisplaySize(source.width * scale, source.height * scale);
      background.setAlpha(0.42);
    }
  }

  const WORLD_SCROLL_SPEED = 220;
  const ROAD_WIDTH = 560;
  const SPAWN_Y = -60;
  const SAFE_ZONE_RADIUS = 92;
  const NOTE_REWARD_SCORE = 250;
  const SHOCKWAVE_CHARGE_NEEDED = 5;
  const SHOCKWAVE_CLEAR_SCORE = 60;

  const LEVELS = [
    {
      name: "LEVEL 1",
      title: "OPEN ROAD",
      goal: "",
      tutorialTitle: "SKILL 1: SHIELD",
      tutorialText: "Collect notes to activate shield.\nA blue aura appears on your car.\nShield blocks one crash automatically.",
      durationMs: 15000,
      roadWidth: 560,
      startSpeed: 260,
      maxSpeed: 470,
      speedGain: 18,
      spawnEveryBeats: 3,
      spawnChance: 0.55,
      truckChance: 0,
      pressureChance: 0,
    },
    {
      name: "LEVEL 2",
      title: "TRUCK TRAFFIC",
      goal: "Large vehicles join the road.",
      tutorialTitle: "SKILL 2: SHOCKWAVE",
      tutorialText: "Collect 5 notes to charge Shockwave.\nTap the bottom-right button to clear traffic.",
      durationMs: 18000,
      roadWidth: 520,
      startSpeed: 320,
      maxSpeed: 560,
      speedGain: 26,
      spawnEveryBeats: 2,
      spawnChance: 0.68,
      truckChance: 0.28,
      pressureChance: 0.1,
    },
    {
      name: "LEVEL 3",
      title: "LANE PRESSURE",
      goal: "Traffic starts aiming near your lane.",
      tutorialTitle: "SKILL 3: PERFECT DRIFT",
      tutorialText: "Drag farther to drift.\nDrift on the beat to build combo and score faster.",
      durationMs: 20000,
      roadWidth: 480,
      startSpeed: 380,
      maxSpeed: 650,
      speedGain: 34,
      spawnEveryBeats: 2,
      spawnChance: 0.78,
      truckChance: 0.36,
      pressureChance: 0.45,
    },
    {
      name: "LEVEL 4",
      title: "NARROW RUN",
      goal: "The road gets tighter.",
      tutorialTitle: "WARNING: NARROW ROAD",
      tutorialText: "The road gets tighter.\nWatch the lanes and save your Shockwave.",
      durationMs: 22000,
      roadWidth: 430,
      startSpeed: 440,
      maxSpeed: 740,
      speedGain: 42,
      spawnEveryBeats: 2,
      spawnChance: 0.86,
      truckChance: 0.45,
      pressureChance: 0.55,
    },
    {
      name: "LEVEL 5",
      title: "BURNOUT RUSH",
      goal: "Final traffic wave.",
      tutorialTitle: "FINAL LEVEL",
      tutorialText: "Traffic is fast and dense.\nSurvive this to unlock Extreme Mode.",
      durationMs: 24000,
      roadWidth: 390,
      startSpeed: 500,
      maxSpeed: 850,
      speedGain: 52,
      spawnEveryBeats: 1,
      spawnChance: 0.88,
      truckChance: 0.5,
      pressureChance: 0.68,
    },
  ];
  const NORMAL_ENDLESS_LEVEL = {
    name: "ENDLESS MODE",
    title: "LONG DRIVE",
    goal: "Speed slowly rises until you crash.",
    durationMs: Infinity,
    roadWidth: 520,
    startSpeed: 250,
    maxSpeed: Infinity,
    speedGain: 28,
    spawnEveryBeats: 2,
    spawnChance: 0.65,
    truckChance: 0.22,
    pressureChance: 0.18,
  };
  const ENDLESS_LEVEL = {
    name: "EXTREME MODE",
    title: "NO SPEED LIMIT",
    goal: "Speed keeps rising until you crash.",
    durationMs: Infinity,
    roadWidth: 360,
    startSpeed: 620,
    maxSpeed: Infinity,
    speedGain: 72,
    spawnEveryBeats: 1,
    spawnChance: 0.92,
    truckChance: 0.58,
    pressureChance: 0.72,
  };

  const ENDLESS_SCORE_BONUS_PER_SECOND = 18;

  class NotePickup extends Phaser.GameObjects.Image {
    constructor(scene, x, y, speed, beatColor) {
      super(scene, x, y, ASSET_KEYS.note);

      this.baseSpeed = speed;

      this.setDisplaySize(30, 30);
      this.setTint(beatColor);
      scene.add.existing(this);
      scene.physics.add.existing(this);
      this.body.setImmovable(true);
      this.body.setVelocityY(speed);
      this.body.setSize(28, 28);

      this.glow = scene.add.rectangle(x, y, 40, 40, beatColor, 0);
      this.glow.setBlendMode(Phaser.BlendModes.ADD);
      this.glow.setDepth(1);
      this.setDepth(2);
    }

    preUpdate() {
      if (this.glow?.active) {
        this.glow.setPosition(this.x, this.y);
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

  class GameScene extends Phaser.Scene {
    constructor() {
      super("GameScene");
    }

    init(data) {
      this.startMode = data?.mode || "levels";
    }

    preload() {
      preloadGameplayAssets(this);
    }

    create() {
      this.score = 0;
      this.combo = 0;
      this.bestCombo = 0;
      this.lastBeatWithDrift = -99;
      this.isGameOver = false;
      this.waitingForNextLevel = false;
      this.isEndlessMode = this.startMode === "normalEndless";
      this.endlessTimeMs = 0;

      this.hasShield = false;
      this.shockwaveCharge = 0;
      this.shockwaveReady = false;

      if (this.isEndlessMode) {
        this.levelIndex = -1;
        this.level = 0;
        this.currentLevel = NORMAL_ENDLESS_LEVEL;
        this.currentRoadWidth = this.currentLevel.roadWidth;
        this.levelTimeLeftMs = Infinity;
        this.scrollSpeed = this.currentLevel.startSpeed;
      } else {
        this.levelIndex = 0;
        this.level = 1;
        this.currentLevel = LEVELS[this.levelIndex];
        this.currentRoadWidth = this.currentLevel.roadWidth;
        this.levelTimeLeftMs = this.currentLevel.durationMs;
        this.scrollSpeed = this.currentLevel.startSpeed;
      }

      this.createTextures();
      this.createWorld();
      this.createPlayer();
      this.createUI();
      this.createInput();
      this.createBeatSystem();
      this.createColliders();

      this.applyLevelDesign(true);
      if (!this.isEndlessMode) {
        this.showStartTutorialPanel();
      }
    }

    update(_time, delta) {
      if (this.isGameOver || this.waitingForNextLevel) return;

      if (this.isEndlessMode) {
        this.endlessTimeMs += delta;
      } else {
        this.levelTimeLeftMs -= delta;

        if (this.levelTimeLeftMs <= 0) {
          this.completeLevel();
          return;
        }
      }

      this.beatManager.update(delta);

      if (this.isEndlessMode) {
        this.scrollSpeed += this.currentLevel.speedGain * (delta / 1000);
        this.score += Math.floor(ENDLESS_SCORE_BONUS_PER_SECOND * (delta / 1000));
      } else {
        this.scrollSpeed = Math.min(
          this.currentLevel.maxSpeed,
          this.scrollSpeed + this.currentLevel.speedGain * (delta / 1000)
        );
      }

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

      this.notes.getChildren().forEach((note) => {
        if (!note.active) return;

        note.setScrollSpeed(this.scrollSpeed);
        note.preUpdate();

        if (note.y > this.scale.height + 100) {
          note.destroy();
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
      this.roadLeft = this.roadX - this.currentRoadWidth / 2;
      this.roadRight = this.roadX + this.currentRoadWidth / 2;

      this.background = this.add.tileSprite(width / 2, height / 2, width, height, ASSET_KEYS.background);
      this.backgroundTileScale = 1;
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

      this.configureBackground();
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
      this.uiText = this.add.text(54, 20, "", {
        fontFamily: "Arial",
        fontSize: "20px",
        color: "#ffffff",
        lineSpacing: 8,
      });
      this.uiText.setDepth(10);

      this.beatDot = this.add.image(30, 108, ASSET_KEYS.rhythm);
      this.beatDot.setDisplaySize(24, 24);
      this.beatDotBaseScaleX = this.beatDot.scaleX;
      this.beatDotBaseScaleY = this.beatDot.scaleY;
      this.skillButton = this.add.text(
        this.scale.width - 28,
        this.scale.height - 28,
        "SHOCKWAVE\n0/5",
        {
          fontFamily: "Arial Black, Arial",
          fontSize: "18px",
          color: "#050611",
          backgroundColor: "#35f4ff",
          align: "center",
          padding: {
            x: 14,
            y: 10,
          },
        }
      );

      this.skillButton.setOrigin(1, 1);
      this.skillButton.setDepth(30);
      this.skillButton.setInteractive({ useHandCursor: true });

      this.skillButton.on("pointerdown", (_pointer, _localX, _localY, event) => {
        event?.stopPropagation?.();
        this.useShockwave();
      });
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
      this.notes = this.physics.add.group({ runChildUpdate: false });
      this.physics.add.overlap(this.player, this.obstacles, (_player, obstacle) => {
        this.handleCrash(obstacle);
      });
      this.physics.add.overlap(this.player, this.notes, (_player, note) => this.collectNote(note));
    }
    completeLevel() {
      if (this.waitingForNextLevel) return;

      this.waitingForNextLevel = true;
      this.beatManager.stop();
      this.physics.pause();
      this.clearTrafficForLevelStart();

      if (this.levelIndex >= LEVELS.length - 1) {
        this.showFinalClearPanel();
      } else {
        this.showNextLevelPanel();
      }
    }

    clearTrafficForLevelStart() {
      this.obstacles.getChildren().forEach((obstacle) => {
        obstacle.destroy();
      });

      this.notes.getChildren().forEach((note) => {
        note.destroy();
      });
    }
    showStartTutorialPanel() {
      const { width, height } = this.scale;

      this.waitingForNextLevel = true;
      this.beatManager.stop();
      this.physics.pause();

      this.nextLevelPanel = this.add.container(width / 2, height / 2);
      this.nextLevelPanel.setDepth(1000);

      const panel = this.add.rectangle(0, 0, 600, 330, 0x050611, 0.94);
      panel.setStrokeStyle(4, 0x35f4ff);

      const title = this.add.text(0, -105, `${this.currentLevel.name}\n${this.currentLevel.title}`, {
        fontFamily: "Arial Black, Arial",
        fontSize: "34px",
        color: "#35f4ff",
        stroke: "#000000",
        strokeThickness: 5,
        align: "center",
      });
      title.setOrigin(0.5);

      const info = this.add.text(
        0,
        -15,
        `${this.currentLevel.goal}\n\n${this.currentLevel.tutorialTitle}\n${this.currentLevel.tutorialText}`,
        {
          fontFamily: "Arial",
          fontSize: "20px",
          color: "#ffffff",
          align: "center",
          lineSpacing: 8,
        }
      );
      info.setOrigin(0.5);

      const button = this.add.text(0, 105, "START LEVEL 1", {
        fontFamily: "Arial Black, Arial",
        fontSize: "24px",
        color: "#050611",
        backgroundColor: "#35f4ff",
        padding: {
          x: 24,
          y: 12,
        },
      });
      button.setOrigin(0.5);
      button.setInteractive({ useHandCursor: true });

      button.on("pointerdown", () => {
        this.nextLevelPanel.destroy();
        this.waitingForNextLevel = false;
        this.physics.resume();

        this.beatManager = new BeatManager(this, BPM);
        this.beatManager.onBeat((beat) => this.onBeat(beat));
        this.beatManager.start();

        this.cameras.main.flash(180, 53, 244, 255);
      });

      this.nextLevelPanel.add([panel, title, info, button]);
    }

    showNextLevelPanel() {
      const { width, height } = this.scale;
      const nextLevel = LEVELS[this.levelIndex + 1];

      this.nextLevelPanel = this.add.container(width / 2, height / 2);
      this.nextLevelPanel.setDepth(1000);

      const panel = this.add.rectangle(0, 0, 560, 320, 0x050611, 0.92);
      panel.setStrokeStyle(4, 0xfff45b);

      const title = this.add.text(0, -105, `${this.currentLevel.name} CLEAR`, {
        fontFamily: "Arial Black, Arial",
        fontSize: "38px",
        color: "#fff45b",
        stroke: "#000000",
        strokeThickness: 5,
        align: "center",
      });
      title.setOrigin(0.5);

      const info = this.add.text(
        0,
        -40,
        `Next: ${nextLevel.name}\n${nextLevel.title}\n${nextLevel.goal}\n\n${nextLevel.tutorialTitle}\n${nextLevel.tutorialText}`,
        {
          fontFamily: "Arial",
          fontSize: "19px",
          color: "#ffffff",
          align: "center",
          lineSpacing: 8,
        }
      );
      info.setOrigin(0.5);

      const button = this.add.text(0, 95, `NEXT ${nextLevel.name}`, {
        fontFamily: "Arial Black, Arial",
        fontSize: "24px",
        color: "#050611",
        backgroundColor: "#fff45b",
        padding: {
          x: 24,
          y: 12,
        },
      });
      button.setOrigin(0.5);
      button.setInteractive({ useHandCursor: true });

      button.on("pointerover", () => {
        button.setStyle({ color: "#ff2bd6" });
      });

      button.on("pointerout", () => {
        button.setStyle({ color: "#050611" });
      });

      button.on("pointerdown", () => {
        this.startNextLevel();
      });

      this.nextLevelPanel.add([panel, title, info, button]);

      this.cameras.main.flash(220, 255, 244, 91);
    }

    startNextLevel() {
      if (this.nextLevelPanel) {
        this.nextLevelPanel.destroy();
      }

      this.levelIndex += 1;
      this.level = this.levelIndex + 1;
      this.currentLevel = LEVELS[this.levelIndex];
      this.currentRoadWidth = this.currentLevel.roadWidth;
      this.levelTimeLeftMs = this.currentLevel.durationMs;
      this.scrollSpeed = this.currentLevel.startSpeed;
      this.waitingForNextLevel = false;

      this.applyLevelDesign(false);

      this.player.setPosition(this.scale.width / 2, this.scale.height - 105);
      this.player.body.setVelocity(0, 0);
      this.player.body.setAcceleration(0, 0);

      this.physics.resume();

      this.beatManager = new BeatManager(this, BPM);
      this.beatManager.onBeat((beat) => this.onBeat(beat));
      this.beatManager.start();

      this.cameras.main.flash(240, 53, 244, 255);
    }

    applyLevelDesign(firstTime) {
      const { height } = this.scale;

      this.currentRoadWidth = this.currentLevel.roadWidth;
      this.roadLeft = this.roadX - this.currentRoadWidth / 2;
      this.roadRight = this.roadX + this.currentRoadWidth / 2;

      this.edgeGlowLeft.setPosition(this.roadLeft, height / 2);
      this.edgeGlowRight.setPosition(this.roadRight, height / 2);
      if (this.isEndlessMode) {
        this.edgeGlowLeft.setFillStyle(0xff2b6d, 0.75);
        this.edgeGlowRight.setFillStyle(0xfff45b, 0.75);
      }

      if (this.player) {
        this.player.setRoadBounds(this.roadLeft, this.roadRight, height);
      }

      if (!firstTime) {
        this.combo = 0;
        this.cameras.main.shake(120, 0.005);
      }
    }

    showFinalClearPanel() {
      const { width, height } = this.scale;

      this.nextLevelPanel = this.add.container(width / 2, height / 2);
      this.nextLevelPanel.setDepth(1000);

      const panel = this.add.rectangle(0, 0, 620, 360, 0x050611, 0.95);
      panel.setStrokeStyle(4, 0xff2b6d);

      const title = this.add.text(0, -125, "ALL LEVELS CLEAR", {
        fontFamily: "Arial Black, Arial",
        fontSize: "36px",
        color: "#35f4ff",
        stroke: "#000000",
        strokeThickness: 5,
        align: "center",
      });
      title.setOrigin(0.5);

      const warning = this.add.text(
        0,
        -45,
        "WARNING: EXTREME MODE UNLOCKED\nSpeed will keep increasing until you crash.\nDo you want to challenge it?",
        {
          fontFamily: "Arial",
          fontSize: "22px",
          color: "#ffffff",
          align: "center",
          lineSpacing: 8,
        }
      );
      warning.setOrigin(0.5);

      const challenge = this.add.text(-135, 100, "CHALLENGE", {
        fontFamily: "Arial Black, Arial",
        fontSize: "22px",
        color: "#050611",
        backgroundColor: "#ff2b6d",
        padding: {
          x: 22,
          y: 12,
        },
      });
      challenge.setOrigin(0.5);
      challenge.setInteractive({ useHandCursor: true });

      const finish = this.add.text(135, 100, "FINISH RUN", {
        fontFamily: "Arial Black, Arial",
        fontSize: "22px",
        color: "#050611",
        backgroundColor: "#35f4ff",
        padding: {
          x: 22,
          y: 12,
        },
      });
      finish.setOrigin(0.5);
      finish.setInteractive({ useHandCursor: true });

      challenge.on("pointerdown", () => {
        this.startEndlessMode();
      });

      finish.on("pointerdown", () => {
        this.scene.start("GameOverScene", {
          score: this.score,
          combo: this.bestCombo,
        });
      });

      this.nextLevelPanel.add([panel, title, warning, challenge, finish]);

      this.cameras.main.flash(240, 255, 43, 109);
    }
    startEndlessMode() {
      if (this.nextLevelPanel) {
        this.nextLevelPanel.destroy();
      }

      this.isEndlessMode = true;
      this.waitingForNextLevel = false;
      this.level = LEVELS.length + 1;
      this.currentLevel = ENDLESS_LEVEL;
      this.currentRoadWidth = ENDLESS_LEVEL.roadWidth;
      this.levelTimeLeftMs = Infinity;
      this.endlessTimeMs = 0;
      this.scrollSpeed = ENDLESS_LEVEL.startSpeed;
      this.combo = 0;

      this.applyLevelDesign(false);

      this.player.setPosition(this.scale.width / 2, this.scale.height - 105);
      this.player.body.setVelocity(0, 0);
      this.player.body.setAcceleration(0, 0);

      this.physics.resume();

      this.beatManager = new BeatManager(this, BPM);

      this.beatManager.onBeat((beat) => this.onBeat(beat));
      this.beatManager.start();

      this.cameras.main.flash(300, 255, 43, 109);
      this.cameras.main.shake(220, 0.012);
    }
    getLaneFromX(x) {
      const laneCount = 5;
      const laneWidth = this.currentRoadWidth / laneCount;

      return Phaser.Math.Clamp(
        Math.floor((x - this.roadLeft) / laneWidth),
        0,
        laneCount - 1
      );
    }

    onBeat(beat) {
      const blockedLane = this.spawnObstacle(beat);
      this.spawnNote(beat, blockedLane);
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
      if (beat.index % this.currentLevel.spawnEveryBeats !== 0) {
        return null;
      }

      if (Math.random() > this.currentLevel.spawnChance) {
        return null;
      }

      const laneCount = 5;
      const laneWidth = this.currentRoadWidth / laneCount;

      let lane;

      if (Math.random() < this.currentLevel.pressureChance) {
        const playerLane = this.getLaneFromX(this.player.x);
        lane = Phaser.Math.Clamp(
          playerLane + Phaser.Math.Between(-1, 1),
          0,
          laneCount - 1
        );
      } else {
        lane = Phaser.Math.Between(0, laneCount - 1);
      }

      const x = this.roadLeft + laneWidth * lane + laneWidth / 2;

      const safeRadius =
        this.level <= 2
          ? SAFE_ZONE_RADIUS
          : SAFE_ZONE_RADIUS * 0.45;

      if (Math.abs(x - this.player.x) < safeRadius && beat.strong) {
        return null;
      }

      let type = "block";

      if (Math.random() < this.currentLevel.truckChance) {
        type = Phaser.Utils.Array.GetRandom(["wall", "laser", "sideTruck"]);
      }

      const obstacle = new Obstacle(this, x, SPAWN_Y, type, this.scrollSpeed, beat.color);
      this.obstacles.add(obstacle);
      obstacle.setScrollSpeed(this.scrollSpeed);

      return lane;
    }
    spawnNote(beat, blockedLane) {
      if (beat.index % 2 !== 1) return;

      const laneCount = 5;
      const laneWidth = this.currentRoadWidth / laneCount;
      let lane = Phaser.Math.Between(0, laneCount - 1);

      if (lane === blockedLane) {
        lane = (lane + Phaser.Math.Between(1, laneCount - 1)) % laneCount;
      }

      const x = this.roadLeft + laneWidth * lane + laneWidth / 2;
      const note = new NotePickup(this, x, SPAWN_Y - 34, this.scrollSpeed, beat.color);

      this.notes.add(note);
      note.setScrollSpeed(this.scrollSpeed);
    }

    collectNote(note) {
      if (!note?.active) return;

      this.score += NOTE_REWARD_SCORE;

      this.hasShield = true;
      this.player.setShieldActive(true);
      this.player.pulseShield();

      this.shockwaveCharge = Math.min(
        SHOCKWAVE_CHARGE_NEEDED,
        this.shockwaveCharge + 1
      );

      if (this.shockwaveCharge >= SHOCKWAVE_CHARGE_NEEDED) {
        this.shockwaveReady = true;
      }

      this.beatManager.playNotePickupSound();
      this.pulseUI(0xfff45b);
      note.destroy();
    }
    useShockwave() {
      if (!this.shockwaveReady || this.isGameOver || this.waitingForNextLevel) {
        return;
      }

      this.shockwaveReady = false;
      this.shockwaveCharge = 0;

      this.obstacles.getChildren().forEach((obstacle) => {
        if (!obstacle.active) return;

        if (obstacle.y > -80 && obstacle.y < this.scale.height + 40) {
          obstacle.destroy();
          this.score += SHOCKWAVE_CLEAR_SCORE;
        }
      });

      this.cameras.main.flash(180, 53, 244, 255);
      this.cameras.main.shake(140, 0.008);
      this.pulseUI(0x35f4ff);
      this.updateUI();
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
      this.beatDot.setTint(color);
      this.tweens.killTweensOf([this.uiText, this.beatDot]);
      this.uiText.setScale(1);
      this.beatDot.setScale(this.beatDotBaseScaleX, this.beatDotBaseScaleY);

      this.tweens.add({
        targets: this.uiText,
        scale: 1.06,
        duration: 70,
        yoyo: true,
        ease: "Quad.easeOut",
      });

      this.tweens.add({
        targets: this.beatDot,
        scaleX: this.beatDotBaseScaleX * 1.08,
        scaleY: this.beatDotBaseScaleY * 1.08,
        duration: 70,
        yoyo: true,
        ease: "Quad.easeOut",
      });
    }

    updateBackground(delta) {
      this.gridOffset = (this.gridOffset + this.scrollSpeed * delta * 0.001) % 48;
      this.background.tilePositionY -= (this.scrollSpeed * delta * 0.001) / this.backgroundTileScale;
    }

    configureBackground() {
      const { width, height } = this.scale;
      const source = this.textures.get(ASSET_KEYS.background).getSourceImage();
      const scale = Math.max(width / source.width, height / source.height);

      this.background.setSize(width, height);
      this.background.setPosition(width / 2, height / 2);
      this.background.setTileScale(scale, scale);
      this.backgroundTileScale = scale;
    }

    updateUI() {
      if (this.isEndlessMode) {
        const survivalTime = Math.floor(this.endlessTimeMs / 1000);

        this.uiText.setText(
          `Score ${this.score}\nCombo ${this.combo}\n${this.currentLevel.name}\nSurvive ${survivalTime}s\nSpeed ${Math.floor(this.scrollSpeed)}\nShield ${this.hasShield ? "READY" : "NONE"}\nBPM ${BPM}`
        );
      } else {
        const timeLeft = Math.max(0, Math.ceil(this.levelTimeLeftMs / 1000));

        this.uiText.setText(
          `Score ${this.score}\nCombo ${this.combo}\n${this.currentLevel.name}\nTime ${timeLeft}s\nShield ${this.hasShield ? "READY" : "NONE"}\nBPM ${BPM}`
        );
      }

      if (this.skillButton) {
        if (this.shockwaveReady) {
          this.skillButton.setText("SHOCKWAVE\nREADY");
          this.skillButton.setStyle({
            color: "#050611",
            backgroundColor: "#fff45b",
          });
        } else {
          this.skillButton.setText(`SHOCKWAVE\n${this.shockwaveCharge}/${SHOCKWAVE_CHARGE_NEEDED}`);
          this.skillButton.setStyle({
            color: "#050611",
            backgroundColor: "#35f4ff",
          });
        }
      }
    }

    handleCrash(obstacle) {
      if (this.isGameOver) return;

      if (this.hasShield) {
        this.hasShield = false;
        this.player.setShieldActive(false);
        this.combo = 0;


        if (obstacle?.active) {
          obstacle.destroy();
        }

        this.cameras.main.flash(180, 53, 244, 255);
        this.cameras.main.shake(180, 0.01);
        this.pulseUI(0x35f4ff);
        this.updateUI();
        return;
      }

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
