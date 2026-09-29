# Captain's Shield Retro

A hero-themed retrospective board for agile teams. Each sprint is a mission: the squad checks in, reports what protected and strengthened them, names the threats, votes with stars and leaves with mission orders and a PDF report. The format is inspired by TeamRetro's Captain America Agile Mission Retrospective template.

**Live site:** https://herodot91.github.io/captains-shield-retro/

## Built with

| Tool or language | Used for |
| --- | --- |
| HTML5 | Page structure |
| CSS3 | Layout with grid and flexbox, light and dark themes with custom properties |
| JavaScript (ES2020) | App logic: board state, stacking, voting, timers and exports |
| React 18 + htm | UI components without a build step |
| jsPDF | The downloadable PDF mission report |
| Google Fonts | Big Shoulders Display, Public Sans and IBM Plex Mono |
| localStorage | Saving boards in the browser |
| GitHub Pages | Hosting |
| Claude Code | Development |

## The four sections

| Section | Question |
| --- | --- |
| The Shield | What protected us? |
| Super-Soldier Serum | What made us stronger? |
| Hydra | What threatened the mission? |
| Next Mission | What should we do next? |

## How a retro runs

1. **Assemble** (5 min): check in with a readiness level and review the orders from the last mission.
2. **Report in** (15 min): write notes in all four sections. Other people's notes show as classified until the debrief.
3. **Debrief** (10 min): reveal the notes and stack similar ones, by drag and drop or with the Stack button.
4. **Vote** (5 min): each hero gets 3 stars. Totals stay sealed until planning.
5. **Plan the mission** (10 min): discuss items in star order and turn them into mission orders with an owner and a due date.
6. **Salute** (5 min): thank people in the Hall of Heroes, then copy the summary or download the PDF mission report.

Each stage has an optional countdown timer, and a mission can hide who wrote each note.

## Two ways to run it

- **This GitHub Pages copy** runs entirely in the browser. Missions, notes, votes and orders are saved in that browser's local storage, so run the retro from one shared screen: the facilitator drives and the team calls out their notes. **Reset to the examples** restores the demo missions.
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
