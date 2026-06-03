# Architecture

This diagram shows the main custom classes in our final game project and how they relate to Phaser-provided classes.

```mermaid
classDiagram
    class PhaserScene {
        <<Phaser.Scene>>
        +preload()
        +create()
        +update()
    }

    class PhaserContainer {
        <<Phaser.GameObjects.Container>>
    }

    class PhaserImage {
        <<Phaser.GameObjects.Image>>
    }

    class PhaserGame {
        <<Phaser.Game>>
    }

    class BasslineBurnout_Intro {
        +constructor()
        +preload()
        +create()
        +update()
    }

    class LoadingScreen {
        +constructor()
        +preload()
        +create()
        +update()
    }

    class MainMenu {
        +constructor()
        +preload()
        +create()
        +update()
    }

    class SettingsScene {
        +constructor()
        +preload()
        +create()
        +update()
    }

    class CreditsScene {
        +constructor()
        +preload()
        +create()
        +update()
    }

    class MenuScene {
        +constructor()
        +preload()
        +create()
        +createBackground(width, height)
    }

    class GameScene {
        +constructor()
        +preload()
        +create()
        +update(time, delta)
        +createTextures()
        +createWorld()
        +createPlayer()
        +createInput()
        +createUI()
        +createBeatSystem()
        +createColliders()
        +onBeat(beat)
        +spawnObstacle(beat)
        +spawnNote(beat, blockedLane)
        +collectNote(note)
        +pulseWorld(beat)
        +pulseUI(color)
        +updateBackground(delta)
        +configureBackground()
        +updateUI()
        +handleCrash()
    }

    class GameOverScene {
        +constructor()
        +init(data)
        +create()
    }

    class BeatManager {
        +constructor(scene, bpm)
        +onBeat(callback)
        +start()
        +update(deltaMs)
        +stop()
        +getElapsedMs(deltaMs)
        +emitBeat(index)
        +createAudioContext()
        +playBeatSound(beat)
        +playKick(time, strong)
        +playBass(time, index)
        +playMusicLayer(time, beat)
        +playChord(time, index)
        +playArp(time, index)
        +playNotePickupSound()
        +playHat(time)
        +playCrashSound()
        +playCrashNoise(time, volume)
        +playCrashDrop(time, volume)
        +playCrashRing(time, volume)
    }

    class PlayerCar {
        +constructor(scene, x, y)
        +setRoadBounds(left, right, height)
        +update(cursors, keys, deltaMs, touchControl)
        +constrainToRoad()
        +onBeat(beat)
        +markPerfectDrift(beatIndex)
        +createDriftParticles()
        +updateParticles(drifting, speedLean)
        +destroy(fromScene)
    }

    class Obstacle {
        +constructor(scene, x, y, type, speed, beatColor)
        +getSize(type)
        +getVisual(size)
        +setVisualRotation(rotation)
        +preUpdate()
        +setScrollSpeed(speed)
        +destroy(fromScene)
    }

    class NotePickup {
        +constructor(scene, x, y, speed, beatColor)
        +preUpdate()
        +setScrollSpeed(speed)
        +destroy(fromScene)
    }

    PhaserScene <|-- BasslineBurnout_Intro
    PhaserScene <|-- LoadingScreen
    PhaserScene <|-- MainMenu
    PhaserScene <|-- SettingsScene
    PhaserScene <|-- CreditsScene
    PhaserScene <|-- MenuScene
    PhaserScene <|-- GameScene
    PhaserScene <|-- GameOverScene

    PhaserContainer <|-- PlayerCar
    PhaserImage <|-- Obstacle
    PhaserImage <|-- NotePickup

    PhaserGame --> PhaserScene : runs scene list

    BasslineBurnout_Intro --> LoadingScreen : starts after intro click
    LoadingScreen --> MainMenu : opens main menu
    MainMenu --> SettingsScene : opens settings
    MainMenu --> CreditsScene : opens credits
    SettingsScene --> MainMenu : returns to menu
    CreditsScene --> MainMenu : returns to menu
    MainMenu --> MenuScene : opens gameplay prototype

    MenuScene --> GameScene : starts gameplay
    GameScene *-- BeatManager : controls rhythm/audio
    GameScene *-- PlayerCar : creates player
    GameScene *-- Obstacle : spawns obstacles
    GameScene *-- NotePickup : spawns collectible notes
    GameScene --> GameOverScene : starts after crash
    GameOverScene --> GameScene : retries run
    MenuScene --> MainMenu : returns to main menu
    GameOverScene --> MainMenu : returns to main menu
```

## Notes

All scene classes extend the Phaser-provided Phaser.Scene class.

BasslineBurnout_Intro, LoadingScreen, MainMenu, SettingsScene, and CreditsScene form the cinematic, title, settings, and credits flow.

MenuScene, GameScene, and GameOverScene form the gameplay prototype flow.

PlayerCar extends Phaser.GameObjects.Container because it combines the player car image, physics body, drift behavior, glow behavior, and particle effects into one reusable player object.

Obstacle extends Phaser.GameObjects.Image because obstacles now use image assets such as npc_car.png and npc_truck.png.

NotePickup extends Phaser.GameObjects.Image because collectible rhythm notes use note.png.

BeatManager is a custom helper class, not a Phaser scene. GameScene uses it to control beat timing, generated Web Audio music, note pickup sounds, crash sounds, and rhythm callbacks.

The diagram includes team-authored methods and important Phaser lifecycle methods we override, including preload(), create(), update(), and destroy().
