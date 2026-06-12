Bassline Burnout Scene Flow Prototype:

https://kirikomeow.github.io/CMPM120-Final-project/scene-flow-1.html

### Scene Flow Explanation

The scene flow prototype links to the real prototype scenes that already exist in this project. Players begin at the Main Title Scene. From there, clicking **Start Game** leads into the Cinematic / Opening Scene, and the cinematic then leads into the Gameplay Prototype. In the gameplay scene, the player reaches the **Good Ending** if they win the challenge, or the **Bad Ending** if they lose or fail. The **Credits Scene** can also be opened directly from the title/menu without finishing the game first.

The scene flow page also provides direct buttons for each scene so the grader can test every path quickly. These buttons represent the same transitions used in the prototype, such as starting the game, continuing after the cinematic, winning, losing, restarting, or opening credits.

Playable link:  
https://kirikomeow.github.io/CMPM120-Final-project/cinematics-prototype/

Source code:  
https://github.com/KIRIKOMEOW/CMPM120-Final-project

Team Roles
- Zhizhuo Xu — Production Lead
- Michael Pu Yang — Technology Lead
- Weichen Sun — Art Lead

About
This is the scene flow prototype for Bassline Burnout. It connects the title screen, loading scene, main menu, settings, credits, gameplay, crash screen, and leaderboard.

Scene Types
- Title scene before gameplay begins
- Loading/cinematic scene with animated text and icon
- Main menu with Start Game, Settings, Credits, and Exit
- Settings scene for volume control
- Credits scene reachable from the main menu
- Gameplay scene for the Bassline Burnout rhythm-driving runner
- Crash/game over scene with score, leaderboard, retry, and return options

Communication Between Scenes
The Settings scene saves volume with `localStorage` using `basslineBurnoutVolume`. The gameplay scene reads this value and applies it to beat sound volume.
The crash screen saves leaderboard scores with `localStorage` using `basslineBurnoutLeaderboard`.

Reachability
All major scenes are reachable. The main menu links to Settings, Credits, and Gameplay. Settings, Credits, Gameplay, and the crash screen all include ways to return or continue.

Transitions
The prototype uses camera fades between scenes. Gameplay also uses flash and shake effects during start and crash moments.

 Controls

- Click or tap to continue from the title screen
- Click or tap Start Game to enter gameplay
- Click or tap Touch to Play to start
- Use A/D or left/right arrows to move
- Hold Shift to drift
- After crashing, enter a name for the leaderboard
- Click or tap Touch to Retry to restart
