class BasslineBurnout_Intro extends Phaser.Scene {
    constructor() {
        super({ key: 'basslineBurnout_Intro' });
    }
    preload() {
        this.load.path = 'assets/';
        this.load.image('titleWheel1','titleWheel1.gif');
        this.load.audio('introVroom', 'vroom.wav');
        this.load.audio('titleBackground', 'titleBackground.wav');

    };
    create() {
        let titleMusic = this.sound.add('titleBackground', { loop: true, volume: 0.5 });
        titleMusic.play();
        let titleText = this.add.text(960, 500, 'Bassline Burnout', {
            font: '70px impact',
            fill: '#ffffff' 
        }).setOrigin(0.5).setAlpha(0);

        let clickPrompt = this.add.text(960, 2000, 'Click to Start', {
            font: '40px impact',
            fill: '#ffffff'
        }).setOrigin(0.5).setAlpha(0);

        let titleWheel1 = this.add.image(600, 500, 'titleWheel1').setScale(0.5).setAlpha(0);
        let titleWheel2 = this.add.image(1320, 500, 'titleWheel1').setScale(0.5).setAlpha(0);
        let introVroom = this.sound.add('introVroom');
        
        this.tweens.add({
            targets: titleText,
            alpha: 1,
            duration: 3000,
            ease: 'Power1',
        });
        this.tweens.add({
            targets: titleWheel1,
            alpha: 1,
            duration: 3000,
            ease: 'Power1',
        });
        this.tweens.add({
            targets: titleWheel1,            angle: 1080,
            duration: 3000,
            ease: 'Linear',
            repeat: -1
        });
         this.tweens.add({
            targets: titleWheel2,
            alpha: 1,
            duration: 3000,
            ease: 'Power1',
        });
        this.tweens.add({
            targets: titleWheel2,            angle: -1080,
            duration: 3000,
            ease: 'Linear',
            repeat: -1
        });
        this.tweens.add({
            targets: clickPrompt,
            alpha: 1,
            duration: 3000,
            ease: 'Power1',
            delay: 3000
        });
        this.tweens.add({
            targets: clickPrompt,
            x: 960,
            y: 700,
            duration: 1000,
            ease: 'Power1',
            delay: 3000
        });
        this.tweens.add({
            targets: clickPrompt,
            alpha: 0.7,
            duration: 1500,
            ease: 'Power1',
            repeat: -1,
            yoyo: true,
        });

        this.input.once('pointerdown', () => {
            introVroom.play();
            this.cameras.main.fadeOut(2000, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                console.log('Transitioning to loading screen');
                this.scene.start('loadingScreen');
            });
        });
    };

    update() {};

};

class LoadingScreen extends Phaser.Scene {
    constructor() {
        super({ key: 'loadingScreen' });
    }   
    preload() {
        this.load.path = 'assets/';
        this.load.spritesheet('loadingIcon', 'loadIcon.png', { frameWidth: 200, frameHeight: 200 });
    }
    create() {
        this.cameras.main.setBackgroundColor('#c7c7c7');
        this.cameras.main.fadeIn(2000, 0, 0, 0);
        let loadingText = this.add.text(2340, 1000, 'Loading......', {
            font: '100px impact',
            fill: '#000000'
        }).setOrigin(0.5).setAlpha(0);

        let loadingIcon = this.anims.create({
            key: 'playGif',
            frames: this.anims.generateFrameNumbers('loadingIcon' , { start: 0, end: 35 }),
            frameRate: 36,
            repeat: -1
        });

        let loadingSprite = this.add.sprite(2000, 950, 'loadingIcon').setScale(1).setAlpha(0);
        loadingSprite.play('playGif');
        this.tweens.add({
            targets: loadingText,
            alpha: 1,
            duration: 3000,
            ease: 'Power1'
        });
        this.tweens.add({
            targets: loadingSprite,
            alpha: 1,
            duration: 3000,
            ease: 'Power1'
        });
        this.tweens.add({
            targets: loadingText,
            x: 470,
            y: 1000,
            duration: 1500,
            ease: 'Power1',
        });
        this.tweens.add({
            targets: loadingSprite,
            x: 130,
            y: 950,
            duration: 1500,
            ease: 'Power1',
        });

        this.time.addEvent({
            delay: 5000,
            callback: () => {
                this.cameras.main.fadeOut(2000, 0, 0, 0);
                this.cameras.main.once('camerafadeoutcomplete', () => {
                    console.log('Transitioning to main menu');
                    this.scene.start('mainMenu');

                });
            }
        });
          

    };
    update() {}
};

class MainMenu extends Phaser.Scene {
    constructor() {
        super({ key: 'mainMenu' });
    }
    preload() {
        this.load.path = 'assets/';
        this.load.image('mainMenuBackground', 'menu.png');
        this.load.audio('buttonSound', 'button sound.wav');
        this.load.audio('buttonDing', 'button ding.wav');
    };
    create() {
        this.cameras.main.setBackgroundColor('#c7c7c7');
        this.cameras.main.fadeIn(2000, 0, 0, 0);
        let menuBackground = this.add.image(960, 540, 'mainMenuBackground').setScale(1).setAlpha(0);
        this.tweens.add({
            targets: menuBackground,
            alpha: 1,
            duration: 2000,
            ease: 'Power1',
        });
        let menuBar = this.add.rectangle(-250, 540, 500, 1080, 0x000000).setAlpha(0);
        this.tweens.add({
            targets: menuBar,
            alpha: 0.7,
            x:250,
            y: 540,
            duration: 2000,
            ease: 'Power1',
        });
        let menuTitle = this.add.text(-250, 300, 'Bassline Burnout', {
            font: '60px impact',
            fill: '#ffffff'
        }).setOrigin(0.5).setAlpha(0);

        let menuOptions = this.add.text(-250, 600, 'Start Game\nSettings\nCredits\nExit', {
            
            font: '50px impact',
            fill: '#ffffff'
        }).setOrigin(0.5).setAlpha(0).setLineSpacing(30);

        let startButton = this.add.rectangle(-250, 475, 500, 50, 0xffffff).setAlpha(0.3).setInteractive();

        startButton.on('pointerover', () => {
            startButton.setAlpha(0.6);
            this.sound.play('buttonSound', { volume: 0.5 });
        });
        startButton.on('pointerout', () => {
            startButton.setAlpha(0.3);
        });
        
        let settingsButton = this.add.rectangle(-250, 560, 500, 50, 0xffffff).setAlpha(0.3).setInteractive();

        settingsButton.on('pointerover', () => {
            settingsButton.setAlpha(0.6);
            this.sound.play('buttonSound', { volume: 0.5 });
        });
        settingsButton.on('pointerout', () => {
            settingsButton.setAlpha(0.3);
        });

        let creditsButton = this.add.rectangle(-250, 645, 500, 50, 0xffffff).setAlpha(0.3).setInteractive();

        creditsButton.on('pointerover', () => {
            creditsButton.setAlpha(0.6);
            this.sound.play('buttonSound', { volume: 0.5 });
        });
        creditsButton.on('pointerout', () => {
            creditsButton.setAlpha(0.3);
        });
        creditsButton.on('pointerdown', () => {
            this.sound.play('buttonDing', { volume: 0.5 });
            this.cameras.main.fadeOut(2000, 0, 0, 0);
                this.cameras.main.once('camerafadeoutcomplete', () => {
                     this.scene.start('creditsScene');
                });
        });

        let exitButton = this.add.rectangle(-250, 730, 500, 50, 0xffffff).setAlpha(0.3).setInteractive();
        exitButton.on('pointerover', () => {
            exitButton.setAlpha(0.6);
            this.sound.play('buttonSound', { volume: 0.5 });
        });
        exitButton.on('pointerout', () => {
            exitButton.setAlpha(0.3);
        });


        this.tweens.add({
            targets: menuTitle,
            alpha: 1,
            x: 250,
            y: 300, 
            duration: 1000,
            delay: 2000,
            ease: 'Power1',
        });

        this.tweens.add({
            targets: menuOptions,
            alpha: 1,
            x: 200,
            y: 600,
            duration: 1000,
            delay: 2500,
            ease: 'Power1',
        });

        this.tweens.add({
            targets: [startButton, settingsButton, creditsButton, exitButton],
            x: 250,
            duration: 1000,
            delay: 2500,
            ease: 'Power1',
        });

    };
    update() {};
};

class CreditsScene extends Phaser.Scene {
    constructor() {
        super({ key: 'creditsScene' });
    }
    preload() {};
    create() {
        this.cameras.main.setBackgroundColor('#c7c7c7');
        this.cameras.main.fadeIn(2000, 0, 0, 0);
        let creditsText = this.add.text(960, 540, 'Game Design: Weichen Sun\nProgramming: Weichen Sun\nArt: Weichen Sun\nWheel gif: https://giphy.com/explore/spinning-tire-stickers \nLoading gif: https://giphy.com/explore/%D8%AA%D9%81%D8%AD%D9%8A%D8%B7-stickers\nStart game image:https://www.latimes.com/california/story/2022-12-29/los-angeles-times-photojournalist-looks-back-at-a-street-takeover-in-compton\nMusic: https://bvker.com/?srsltid=AfmBOorJpVGjx1fXznsu1p74DxMP1155bEkyl-Olk2oe-9aE5Y1z1fXP', {
            font: '20px impact',
            fill: '#000000'
        }).setOrigin(0.5).setLineSpacing(20);
    };
    update() {};
};

let config = {
    type: Phaser.WEBGL,
     scale: {
        mode: Phaser.Scale.FIT, // FIT or ENVELOP
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 1920, // Logical width
        height: 1080, // Logical height
    },
    backgroundColor: '#000000',
    scene: [BasslineBurnout_Intro, LoadingScreen, MainMenu, CreditsScene]
};

let game = new Phaser.Game(config);

