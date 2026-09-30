# Captain's Shield Retro

A simple online board for a team meeting where you look back on the last few weeks of work and agree on what to do better next time. Teams often call this meeting a retrospective (or retro for short). The superhero theme is there to make the meeting more fun. The format is inspired by TeamRetro's Captain America Agile Mission Retrospective template.

**Live site:** https://herodot91.github.io/captains-shield-retro/

## How to use it

One person, the facilitator, runs the meeting on a shared screen and moves the team through six steps:

1. **Check in** (about 5 minutes): everyone says how they feel today, and the team checks whether the tasks from last time got done.
2. **Write notes** (about 15 minutes): each person writes short notes in four boxes: what helped us, what we did well, what caused problems, and ideas for next time. Other people's notes stay hidden until everyone has finished.
3. **Read and group** (about 10 minutes): all notes are shown. Put notes that say the same thing together.
4. **Vote** (about 5 minutes): everyone gets 3 stars to give to the notes that matter most.
5. **Make a plan** (about 10 minutes): turn the top notes into tasks. Each task gets one person responsible and a due date.
6. **Say thanks** (about 5 minutes): thank the teammates who helped, then download or copy a summary of the meeting.

Each step has an optional countdown timer, and you can choose to hide who wrote each note.

**The superhero words:** a *mission* is one meeting, *heroes* are team members, *stars* are votes, and *mission orders* are the tasks you agree to do.

## Built with

| Tool or language | Used for |
| --- | --- |
| HTML5 | Page structure |
| CSS3 | Layout with grid and flexbox, light and dark themes with custom properties |
| JavaScript (ES2020) | App logic: board state, stacking, voting, timers and exports |
| React 18 + htm | UI components without a build step |

## The four boxes

| Box on the board | Question on the board | In plain words |
| --- | --- | --- |
| The Shield | What protected us? | What helped us |
| Super-Soldier Serum | What made us stronger? | What we did well |
| Hydra | What threatened the mission? | What caused problems |
| Next Mission | What should we do next? | Ideas for next time |

The six steps also have themed names in the app: Assemble, Report in, Debrief, Vote, Plan the mission and Salute.

## Two ways to run it

- **This website** saves everything in your browser only, so run the meeting from one shared screen: the facilitator types and the team calls out their notes. **Reset to the examples** brings back the demo meetings.
- **The Claude-hosted version** (a claude.ai artifact) adds live multi-device features: everyone writes and votes from their own device, notes stay hidden until the reveal, you can see who is online and typing, and only people who can edit the page get the facilitator controls.

## Project files

| File | Contents |
| --- | --- |
| `index.html` | Page shell, fonts and libraries |
| `styles.css` | All styles and the light and dark color tokens |
| `app.js` | The app: components, stages, local storage and the PDF report |

There is no build step. To run it locally, serve the folder with any static server, for example:

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

## Credits

This is a fan-made project, not affiliated with Marvel or TeamRetro.
