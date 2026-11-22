# Room map mocks

The interactive room map (what a signed-in person sees) redrawn in the Boston T look from the host screen. These are static pages with sample data; nothing talks to the server. They reuse `wall/host.css` and `wall/room_layout.js` read-only, so they stay in step with the host screen.

- `room-map.html`: the map signed in as Maya, with suggestions and the groups.
- `table.html`: a table selected: who is there, what it needs, links, how to join.
- `person.html`: a person selected: skills, who they know, a suggested intro.
- `phone.html`: the same map on a phone, with a bottom sheet.

Open `index.html` to see them. Not for merging into `wall/`, which is Jun's.
