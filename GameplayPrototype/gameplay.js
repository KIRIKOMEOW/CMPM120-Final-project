(function () {
  const Phaser = window.Phaser;

  if (!Phaser || !Phaser.VERSION?.startsWith("4.")) {
    throw new Error("Phaser 4 engine was not loaded from ./lib/phaser.js");
  }

  const BPM = 120;
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
        const exit = document.exitFullscreen || document.webkitExitFullscreen;

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
      this.beatIndex = 0;
      this.elapsedMs = 0;
      this.callbacks = [];
      this.audioContext = null;
      this.isRunning = false;
    }

    onBeat(callback) {
      this.callbacks.push(callback);
    }

    async start() {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;

      if (AudioContextClass && !this.audioContext) {
        this.audioContext = new AudioContextClass();
      }

      if (this.audioContext?.state === "suspended") {
        await this.audioContext.resume();
      }

      this.elapsedMs = 0;
      this.beatIndex = 0;
      this.isRunning = true;
    }

    update(deltaMs) {
      if (!this.isRunning) return;

      this.elapsedMs += deltaMs;

      while (this.elapsedMs >= this.beatIndex * this.beatIntervalMs) {
        this.emitBeat(this.beatIndex);
        this.beatIndex += 1;
      }
    }

    stop() {
      this.isRunning = false;
      this.callbacks = [];
    }

    emitBeat(index) {
      const strong = index % 4 === 0;
      const color = strong ? 0x35f4ff : index % 2 === 0 ? 0xff2bd6 : 0xfff45b;

      const beat = {
        index: index,
        strong: strong,
        color: color,
        intensity: strong ? 1.35 : 1,
      };

      this.playBeatSound(beat);
      this.callbacks.forEach((callback) => callback(beat));
    }

    playBeatSound(beat) {
      if (!this.audioContext) return;

      const now = this.audioContext.currentTime;
      const volume = Math.max(getGameVolume(), 0.001);

      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.type = beat.strong ? "sine" : "triangle";
      osc.frequency.setValueAtTime(beat.strong ? 120 : 220, now);
      osc.frequency.exponentialRampToValueAtTime(beat.strong ? 42 : 110, now + 0.14);
      gain.gain.setValueAtTime((beat.strong ? 0.2 : 0.08) * volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      osc.start(now);
      osc.stop(now + 0.18);
    }

    playNotePickupSound() {
      if (!this.audioContext) return;

      const now = this.audioContext.currentTime;
      const volume = Math.max(getGameVolume(), 0.001);
      const notes = [659.25, 880, 1174.66];

      notes.forEach((frequency, index) => {
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        const start = now + index * 0.035;

        osc.type = "square";
        osc.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.06 * volume, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.11);

        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        osc.start(start);
        osc.stop(start + 0.12);
      });
    }

    playCrashSound() {
      if (!this.audioContext) return;

      const now = this.audioContext.currentTime;
      const volume = Math.max(getGameVolume(), 0.001);

      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.35);
      gain.gain.setValueAtTime(0.25 * volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      osc.start(now);
      osc.stop(now + 0.38);
    }
  }

  const PLAYER_WIDTH = 70;
  const PLAYER_HEIGHT = 96;
  const PLAYER_ACCEL = 1450;
  const PLAYER_DRAG = 1250;
  const PLAYER_MAX_SPEED = 520;
  const DRIFT_MAX_SPEED = 650;

  class PlayerCar extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
      super(scene, x, y);

      this.scene = scene;
      this.minRoadX = 0;
      this.maxRoadX = scene.scale.width;
      this.driftEnergy = 0;

      this.glow = scene.add.rectangle(0, 4, PLAYER_WIDTH + 28, PLAYER_HEIGHT + 34, 0x35f4ff, 0.18);
      this.glow.setBlendMode(Phaser.BlendModes.ADD);

      this.bodySprite = scene.add.image(0, 0, ASSET_KEYS.player);
      this.bodySprite.setDisplaySize(PLAYER_WIDTH, PLAYER_HEIGHT);

      this.add([this.glow, this.bodySprite]);
      scene.add.existing(this);
      scene.physics.add.existing(this);

      this.body.setSize(PLAYER_WIDTH * 0.72, PLAYER_HEIGHT * 0.78);
      this.body.setOffset(-PLAYER_WIDTH * 0.36, -PLAYER_HEIGHT * 0.39);
      this.body.setCollideWorldBounds(false);
      this.body.setDragX(PLAYER_DRAG);
      this.body.setMaxVelocity(DRIFT_MAX_SPEED, 0);
    }

    setRoadBounds(left, right) {
      const half = PLAYER_WIDTH * 0.48;
      this.minRoadX = left + half;
      this.maxRoadX = right - half;
      this.constrainToRoad();
    }

    update(cursors, keys, deltaMs, touchControl) {
      const delta = deltaMs / 1000;

      const keyboardLeft = cursors.left.isDown || keys.left.isDown;
      const keyboardRight = cursors.right.isDown || keys.right.isDown;

      let direction = (keyboardRight ? 1 : 0) - (keyboardLeft ? 1 : 0);
      let drifting = keys.shift.isDown && direction !== 0;

      const touchActive = touchControl.active && Number.isFinite(touchControl.targetX);

      if (touchActive) {
        const targetX = Phaser.Math.Clamp(touchControl.targetX, this.minRoadX, this.maxRoadX);
        const distance = targetX - this.x;

        if (Math.abs(distance) > 8) {
          direction = Math.sign(distance);

          this.body.setVelocityX(
            Phaser.Math.Linear(this.body.velocity.x, distance * 7.5, 0.18)
          );
        } else {
          direction = 0;
          this.body.setVelocityX(Phaser.Math.Linear(this.body.velocity.x, 0, 0.25));
        }

        drifting = Math.abs(distance) > 70;
      }

      this.body.setDragX(drifting ? 260 : PLAYER_DRAG);
      this.body.setMaxVelocity(drifting ? DRIFT_MAX_SPEED : PLAYER_MAX_SPEED, 0);

      if (!touchActive) {
        if (direction !== 0) {
          this.body.setAccelerationX(direction * PLAYER_ACCEL);
        } else {
          this.body.setAccelerationX(0);
        }
      } else {
        this.body.setAccelerationX(0);
      }

      this.driftEnergy = Phaser.Math.Clamp(
        this.driftEnergy + (drifting ? 1.8 : -2.6) * delta,
        0,
        1
      );

      const speedLean = Phaser.Math.Clamp(this.body.velocity.x / DRIFT_MAX_SPEED, -1, 1);

      this.rotation = Phaser.Math.Linear(
        this.rotation,
        speedLean * (drifting ? 0.42 : 0.22),
        0.18
      );

      this.glow.alpha = 0.12 + this.driftEnergy * 0.32;
      this.glow.scaleX = 1 + this.driftEnergy * 0.25;

      this.constrainToRoad();

      return drifting;
    }

    constrainToRoad() {
      const clampedX = Phaser.Math.Clamp(this.x, this.minRoadX, this.maxRoadX);

      if (clampedX !== this.x) {
        this.x = clampedX;
        this.body.velocity.x = 0;
        this.body.setAccelerationX(0);
      }
    }

    onBeat(beat) {
      this.scene.tweens.add({
        targets: this.glow,
        alpha: 0.48 * beat.intensity,
        scaleX: 1.35,
        scaleY: 1.18,
        duration: 70,
        yoyo: true,
        ease: "Sine.easeOut",
      });
    }

    markPerfectDrift() {
      this.scene.tweens.add({
        targets: this.bodySprite,
        scaleX: this.bodySprite.scaleX * 1.08,
        scaleY: this.bodySprite.scaleY * 1.05,
        duration: 55,
        yoyo: true,
        ease: "Quad.easeOut",
      });
    }
  }

  class Obstacle extends Phaser.GameObjects.Image {
    constructor(scene, x, y, type, speed, beatColor, level) {
      const texture = type === "truck" ? ASSET_KEYS.npcTruck : ASSET_KEYS.npcCar;
      super(scene, x, y, texture);

      this.type = type;
      this.passed = false;
      this.baseSpeed = speed;
      this.level = level;

      const scale = 1 + level * 0.055;

      if (type === "truck") {
        this.setDisplaySize(88 * scale, 138 * scale);
        this.collisionWidth = 70 * scale;
        this.collisionHeight = 118 * scale;
      } else {
        this.setDisplaySize(78 * scale, 108 * scale);
        this.collisionWidth = 58 * scale;
        this.collisionHeight = 88 * scale;
      }

      scene.add.existing(this);
      scene.physics.add.existing(this);

      this.body.setImmovable(true);
      this.body.setVelocityY(speed);
      this.body.setSize(this.collisionWidth, this.collisionHeight);

      this.glow = scene.add.rectangle(x, y, this.displayWidth + 22, this.displayHeight + 22, beatColor, 0.16);
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

  class NotePickup extends Phaser.GameObjects.Image {
    constructor(scene, x, y, speed, beatColor) {
      super(scene, x, y, ASSET_KEYS.note);

      this.setDisplaySize(42, 42);
      this.setTint(beatColor);

      scene.add.existing(this);
      scene.physics.add.existing(this);

      this.body.setImmovable(true);
      this.body.setVelocityY(speed);
      this.body.setSize(34, 34);

      this.glow = scene.add.rectangle(x, y, 56, 56, beatColor, 0.16);
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
        .text(width / 2, height * 0.32, "BASSLINE BURNOUT", {
          fontFamily: "Arial Black, Arial",
          fontSize: "56px",
          color: "#35f4ff",
          stroke: "#ff2bd6",
          strokeThickness: 3,
        })
        .setOrigin(0.5);

      this.add
        .text(width / 2, height * 0.46, "TRAFFIC RHYTHM RUNNER", {
          fontFamily: "Arial",
          fontSize: "22px",
          color: "#fff45b",
          letterSpacing: 4,
        })
        .setOrigin(0.5);

      const prompt = this.add
        .text(width / 2, height * 0.66, "Touch to Play", {
          fontFamily: "Arial",
          fontSize: "24px",
          color: "#ffffff",
          backgroundColor: "#111827",
          padding: { x: 18, y: 10 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      const backButton = this.add
        .text(width / 2, height * 0.82, "Back to Main Menu", {
          fontFamily: "Arial",
          fontSize: "20px",
          color: "#ffffff",
          backgroundColor: "#111827",
          padding: { x: 18, y: 10 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      const fullscreenButton = this.add
        .text(width - 24, height - 24, "Fullscreen", {
          fontFamily: "Arial",
          fontSize: "18px",
          color: "#ffffff",
          backgroundColor: "#111827",
          padding: { x: 14, y: 8 },
        })
        .setOrigin(1, 1)
        .setDepth(20)
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

      prompt.on("pointerdown", startGame);
      this.input.keyboard.once("keydown-SPACE", startGame);
      fullscreenButton.on("pointerdown", () => toggleFullscreen());

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

  const BASE_ROAD_WIDTH = 560;
  const MIN_ROAD_WIDTH = 330;
  const BASE_SCROLL_SPEED = 250;
  const MAX_SCROLL_SPEED = 720;
  const LEVEL_DURATION_MS = 15000;
  const SPAWN_Y = -90;
  const NOTE_REWARD_SCORE = 250;
  const LEVEL_COUNT = 6;

  class GameScene extends Phaser.Scene {
    constructor() {
      super("GameScene");
    }

    preload() {
      preloadGameplayAssets(this);
    }

    create() {
      this.score = 0;
      this.combo = 0;
      this.bestCombo = 0;
      this.elapsedMs = 0;
      this.level = 1;
      this.scrollSpeed = BASE_SCROLL_SPEED;
      this.isGameOver = false;
      this.lastBeatWithDrift = -99;

      this.createWorld();
      this.createPlayer();
      this.createInput();
      this.createUI();
      this.createBeatSystem();
      this.createColliders();
      this.applyLevelSettings(true);
    }

    update(_time, delta) {
      if (this.isGameOver) return;

      this.elapsedMs += delta;
      this.beatManager.update(delta);

      const newLevel = Math.min(
        LEVEL_COUNT,
        1 + Math.floor(this.elapsedMs / LEVEL_DURATION_MS)
      );

      if (newLevel !== this.level) {
        this.level = newLevel;
        this.applyLevelSettings(false);
      }

      this.scrollSpeed = Math.min(
        MAX_SCROLL_SPEED,
        BASE_SCROLL_SPEED + this.level * 55 + this.elapsedMs * 0.012
      );

      this.updateBackground(delta);
      this.updateSpeedLines(delta);

      const drifting = this.player.update(
        this.cursors,
        this.keys,
        delta,
        this.touchControl
      );

      if (drifting) {
        this.lastBeatWithDrift = this.beatManager.beatIndex;
      }

      this.updateObstacles();
      this.updateNotes();

      this.score += Math.floor(delta * 0.025 * this.level);
      this.updateUI();
    }

    createWorld() {
      const { width, height } = this.scale;

      this.background = this.add.tileSprite(
        width / 2,
        height / 2,
        width,
        height,
        ASSET_KEYS.background
      );

      this.configureBackground();

      this.roadX = width / 2;
      this.roadWidth = BASE_ROAD_WIDTH;
      this.roadLeft = this.roadX - this.roadWidth / 2;
      this.roadRight = this.roadX + this.roadWidth / 2;

      this.roadFill = this.add.rectangle(this.roadX, height / 2, this.roadWidth, height, 0x050611, 0.32);
      this.roadFill.setDepth(0.5);

      this.edgeGlowLeft = this.add.rectangle(this.roadLeft, height / 2, 10, height, 0xff2bd6, 0.55);
      this.edgeGlowRight = this.add.rectangle(this.roadRight, height / 2, 10, height, 0x35f4ff, 0.55);

      this.edgeGlowLeft.setBlendMode(Phaser.BlendModes.ADD);
      this.edgeGlowRight.setBlendMode(Phaser.BlendModes.ADD);
      this.edgeGlowLeft.setDepth(1);
      this.edgeGlowRight.setDepth(1);

      this.beatFlash = this.add.rectangle(width / 2, height / 2, width, height, 0x35f4ff, 0);
      this.beatFlash.setBlendMode(Phaser.BlendModes.ADD);
      this.beatFlash.setDepth(8);

      this.laneLines = [];
      this.speedLines = [];

      for (let i = 0; i < 4; i += 1) {
        const line = this.add.rectangle(width / 2, 0, 4, 80, 0xffffff, 0.28);
        line.setDepth(1.5);
        this.laneLines.push(line);
      }

      for (let i = 0; i < 34; i += 1) {
        const x = Phaser.Math.Between(20, width - 20);
        const y = Phaser.Math.Between(0, height);

        const line = this.add.rectangle(
          x,
          y,
          3,
          Phaser.Math.Between(24, 70),
          0x35f4ff,
          0.2
        );

        line.setDepth(1.2);
        this.speedLines.push(line);
      }
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

    createPlayer() {
      this.player = new PlayerCar(this, this.scale.width / 2, this.scale.height - 105);
      this.player.setRoadBounds(this.roadLeft, this.roadRight);
      this.player.setDepth(5);
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
        this.touchControl.targetX = Phaser.Math.Clamp(pointer.x, this.roadLeft, this.roadRight);
      };

      this.input.on("pointerdown", updateTouchTarget);

      this.input.on("pointermove", (pointer) => {
        if (pointer.isDown) {
          updateTouchTarget(pointer);
        }
      });

      this.input.on("pointerup", () => {
        this.touchControl.active = false;
      });

      this.input.on("pointerupoutside", () => {
        this.touchControl.active = false;
      });
    }

    createUI() {
      this.uiText = this.add.text(54, 18, "", {
        fontFamily: "Arial",
        fontSize: "20px",
        color: "#ffffff",
        lineSpacing: 8,
      });

      this.uiText.setDepth(20);

      this.levelText = this.add.text(this.scale.width / 2, 36, "", {
        fontFamily: "Arial Black, Arial",
        fontSize: "24px",
        color: "#fff45b",
        stroke: "#000000",
        strokeThickness: 3,
      });

      this.levelText.setOrigin(0.5);
      this.levelText.setDepth(20);

      this.beatDot = this.add.image(30, 112, ASSET_KEYS.rhythm);
      this.beatDot.setDisplaySize(28, 28);
      this.beatDot.setDepth(20);

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

      this.physics.add.overlap(this.player, this.obstacles, () => this.handleCrash());
      this.physics.add.overlap(this.player, this.notes, (_player, note) => this.collectNote(note));
    }

    applyLevelSettings(firstTime) {
      const { height } = this.scale;

      this.roadWidth = Math.max(MIN_ROAD_WIDTH, BASE_ROAD_WIDTH - (this.level - 1) * 46);
      this.roadLeft = this.roadX - this.roadWidth / 2;
      this.roadRight = this.roadX + this.roadWidth / 2;

      this.roadFill.setDisplaySize(this.roadWidth, height);
      this.roadFill.setPosition(this.roadX, height / 2);

      this.edgeGlowLeft.setPosition(this.roadLeft, height / 2);
      this.edgeGlowRight.setPosition(this.roadRight, height / 2);

      this.player?.setRoadBounds(this.roadLeft, this.roadRight);
      this.updateLaneLines();

      this.levelText.setText(`LEVEL ${this.level}`);

      if (!firstTime) {
        this.cameras.main.flash(220, 255, 244, 91);
        this.cameras.main.shake(140, 0.006);

        this.tweens.add({
          targets: this.levelText,
          scale: 1.42,
          duration: 140,
          yoyo: true,
          ease: "Back.easeOut",
        });
      }
    }

    updateLaneLines() {
      const laneCount = 5;
      const laneWidth = this.roadWidth / laneCount;

      this.laneLines.forEach((line, index) => {
        line.x = this.roadLeft + laneWidth * (index + 1);
        line.y = 0;
      });
    }

    updateBackground(delta) {
      this.background.tilePositionY -=
        (this.scrollSpeed * delta * 0.001) / this.backgroundTileScale;
    }

    updateSpeedLines(delta) {
      const { height } = this.scale;
      const movement = this.scrollSpeed * delta * 0.001;
      const laneCount = 5;
      const laneWidth = this.roadWidth / laneCount;

      this.laneLines.forEach((line, index) => {
        line.y += movement * 1.35;
        line.x = this.roadLeft + laneWidth * (index + 1);

        if (line.y > height + 80) {
          line.y = -80;
        }
      });

      this.speedLines.forEach((line) => {
        line.y += movement * (1.6 + this.level * 0.2);
        line.alpha = 0.08 + this.level * 0.045;

        if (line.y > height + 80) {
          line.y = Phaser.Math.Between(-140, -20);
          line.x = Phaser.Math.Between(this.roadLeft + 10, this.roadRight - 10);
        }
      });
    }

    onBeat(beat) {
      const blockedLanes = this.spawnObstaclePattern(beat);

      this.spawnNote(beat, blockedLanes);
      this.pulseWorld(beat);
      this.player.onBeat(beat);

      const driftWasOnBeat = this.lastBeatWithDrift >= this.beatManager.beatIndex - 1;

      if (driftWasOnBeat) {
        this.combo += 1;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        this.score += beat.strong ? 160 : 90;
        this.player.markPerfectDrift();
        this.pulseUI(0xfff45b);
      }
    }

    spawnObstaclePattern(beat) {
      const blockedLanes = [];
      const spawnChance = Math.min(0.96, 0.58 + this.level * 0.075);

      if (Math.random() > spawnChance) {
        return blockedLanes;
      }

      const count =
        this.level >= 5 && beat.strong
          ? 3
          : this.level >= 3 && beat.index % 3 === 0
            ? 2
            : 1;

      const laneCount = 5;
      const playerLane = this.getLaneFromX(this.player.x);

      for (let i = 0; i < count; i += 1) {
        let lane;

        if (this.level >= 3 && Math.random() < 0.5 && i === 0) {
          lane = Phaser.Math.Clamp(playerLane + Phaser.Math.Between(-1, 1), 0, laneCount - 1);
        } else {
          lane = Phaser.Math.Between(0, laneCount - 1);
        }

        let guard = 0;

        while (blockedLanes.includes(lane) && guard < 8) {
          lane = Phaser.Math.Between(0, laneCount - 1);
          guard += 1;
        }

        blockedLanes.push(lane);
        this.spawnObstacle(beat, lane);
      }

      return blockedLanes;
    }

    spawnObstacle(beat, lane) {
      const laneCount = 5;
      const laneWidth = this.roadWidth / laneCount;
      const x = this.roadLeft + laneWidth * lane + laneWidth / 2;
      const type = this.level >= 2 && Math.random() < 0.34 ? "truck" : "car";

      const obstacle = new Obstacle(
        this,
        x,
        SPAWN_Y,
        type,
        this.scrollSpeed,
        beat.color,
        this.level
      );

      this.obstacles.add(obstacle);
      obstacle.setScrollSpeed(this.scrollSpeed);
    }

    spawnNote(beat, blockedLanes) {
      if (beat.index % 2 !== 1) return;

      const laneCount = 5;
      const laneWidth = this.roadWidth / laneCount;
      const openLanes = [];

      for (let i = 0; i < laneCount; i += 1) {
        if (!blockedLanes.includes(i)) {
          openLanes.push(i);
        }
      }

      if (openLanes.length === 0) return;

      const lane = Phaser.Utils.Array.GetRandom(openLanes);
      const x = this.roadLeft + laneWidth * lane + laneWidth / 2;

      const note = new NotePickup(this, x, SPAWN_Y - 45, this.scrollSpeed, beat.color);

      this.notes.add(note);
      note.setScrollSpeed(this.scrollSpeed);
    }

    getLaneFromX(x) {
      const laneCount = 5;
      const laneWidth = this.roadWidth / laneCount;

      return Phaser.Math.Clamp(
        Math.floor((x - this.roadLeft) / laneWidth),
        0,
        laneCount - 1
      );
    }

    updateObstacles() {
      this.obstacles.getChildren().forEach((obstacle) => {
        if (!obstacle.active) return;

        obstacle.setScrollSpeed(this.scrollSpeed);
        obstacle.preUpdate();

        if (!obstacle.passed && obstacle.y > this.player.y + 60) {
          obstacle.passed = true;
          this.combo += 1;
          this.bestCombo = Math.max(this.bestCombo, this.combo);
          this.score += 100 + this.combo * 8 + this.level * 18;
          this.pulseUI(0x35f4ff);
        }

        if (obstacle.y > this.scale.height + 130) {
          obstacle.destroy();
        }
      });
    }

    updateNotes() {
      this.notes.getChildren().forEach((note) => {
        if (!note.active) return;

        note.setScrollSpeed(this.scrollSpeed);
        note.preUpdate();

        if (note.y > this.scale.height + 100) {
          note.destroy();
        }
      });
    }

    collectNote(note) {
      if (!note?.active) return;

      this.score += NOTE_REWARD_SCORE + this.level * 30;
      this.beatManager.playNotePickupSound();
      this.pulseUI(0xfff45b);
      note.destroy();
    }

    pulseWorld(beat) {
      this.beatFlash.setFillStyle(beat.color, beat.strong ? 0.22 : 0.13);
      this.beatFlash.alpha = beat.strong ? 0.22 : 0.13;

      this.tweens.add({
        targets: this.beatFlash,
        alpha: 0,
        duration: 170,
        ease: "Quad.easeOut",
      });

      this.tweens.add({
        targets: [this.edgeGlowLeft, this.edgeGlowRight],
        scaleX: beat.strong ? 2.5 : 1.8,
        alpha: beat.strong ? 0.8 : 0.58,
        duration: 80,
        yoyo: true,
        ease: "Quad.easeOut",
      });

      this.pulseUI(beat.color);
    }

    pulseUI(color) {
      this.beatDot.setTint(color);
      this.tweens.killTweensOf([this.uiText, this.beatDot]);

      this.uiText.setScale(1);
      this.beatDot.setScale(1);

      this.tweens.add({
        targets: this.uiText,
        scale: 1.06,
        duration: 70,
        yoyo: true,
        ease: "Quad.easeOut",
      });

      this.tweens.add({
        targets: this.beatDot,
        scale: 1.18,
        duration: 70,
        yoyo: true,
        ease: "Quad.easeOut",
      });
    }

    updateUI() {
      this.uiText.setText(
        `Score ${this.score}\nCombo ${this.combo}\nLevel ${this.level}\nSpeed ${Math.floor(this.scrollSpeed)}`
      );

      this.levelText.setText(`LEVEL ${this.level}`);
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
        .map((entry, index) => `${index + 1}. ${entry.name} - ${entry.score}`)
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
          padding: { x: 18, y: 10 },
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

      retry.on("pointerdown", restartGame);
      this.input.keyboard.once("keydown-SPACE", restartGame);

      const backButton = this.add
        .text(width / 2, height * 0.88, "Back to Main Menu", {
          fontFamily: "Arial",
          fontSize: "22px",
          color: "#ffffff",
          backgroundColor: "#111827",
          padding: { x: 18, y: 10 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

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