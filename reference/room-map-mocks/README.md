# Room map mocks

The interactive 3D room map (tables on a sphere, people orbit inside them; drag to turn, scroll to zoom, tap to select) redrawn in the Boston T look from the host screen. These are static pages with sample data; nothing talks to the server. They reuse `wall/host.css` read-only for the look. The 3D drawing here is a stand-in for `wall/view3d.js`, which is Jun's.

- `room-map.html`: the map signed in as Maya, with suggestions and the groups.
- `table.html`: a table selected: who is there, what it needs, links, how to join.
- `person.html`: a person selected: skills, who they know, a suggested intro.
- `phone.html`: the same map on a phone, with a bottom sheet.

Open `index.html` to see them. Not for merging into `wall/`, which is Jun's.
