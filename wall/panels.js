const Panels = (() => {
  const find = id => document.getElementById(id);
  const insights = find("room-insights");
  const compact = matchMedia("(max-width: 800px)");
  if (compact.matches) insights.open = false;
  insights.addEventListener("toggle", () => window.dispatchEvent(new Event("resize")));

  const activity = [];
  const strip = find("wall-icebreaker");
  const formatTime = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  let current;
  let hideTimer;

  function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }

  function list(id, values, empty) {
    find(id).replaceChildren(...(values.length ? values : [empty]).map(text => element("li", text)));
  }

  function stats(data) {
    const station = { 1: "Entrance", 2: "Table 2" }[data?.busiest_station];
    const facts = [
      ["Here now", data?.here], ["Tables", data?.groups],
      ["Links today", data?.links_today], ["Busiest station", station],
    ];
    find("room-stats").replaceChildren(...facts.map(([label, value]) => {
      const item = document.createElement("div");
      item.append(element("dt", label), element("dd", value ?? "—"));
      return item;
    }));
    const chart = find("scan-chart");
    const buckets = data?.scans_10min ?? [];
    if (!buckets.length) {
      chart.replaceChildren(element("p", data ? "No scans yet" : "Stats unavailable"));
      return;
    }
    const max = Math.max(1, ...buckets.map(bucket => bucket.count));
    chart.replaceChildren(...buckets.map(bucket => {
      const time = formatTime.format(new Date(bucket.bucket));
      const bar = element("span", "");
      bar.title = `${time} · ${bucket.count} scans`;
      bar.setAttribute("aria-label", bar.title);
      bar.setAttribute("role", "img");
      bar.style.height = `${Math.max(3, 100 * bucket.count / max)}%`;
      return bar;
    }));
  }

  function tables(groups) {
    list("top-tables", groups.slice(0, 5).map(group => `${group.name} · ${group.points} pts`), "No tables yet");
  }

  function needs(rows) {
    list("open-needs", rows.filter(row => row.handled_by == null).slice(0, 4)
      .map(row => `${row.table} · ${row.need}`), "No open requests");
  }

  function log(text) {
    if (text) activity.unshift(text);
    activity.length = Math.min(activity.length, 4);
    list("room-activity", activity, "Waiting for a check-in");
  }

  function checkIn(person, group, suggestion) {
    clearTimeout(hideTimer);
    current = group ? { personId: person.id, groupId: group.id } : undefined;
    const title = `${person.name} checked in`;
    strip.textContent = group ? `${title} · ${group.name}: ${suggestion.reason}` : title;
    strip.hidden = false;
    hideTimer = setTimeout(() => {
      current = undefined;
      strip.hidden = true;
    }, 10000);
    log(title);
  }

  function icebreaker(data) {
    if (current?.personId === data.person_id && current.groupId === data.group_id) {
      strip.textContent = data.text;
    }
  }

  stats();
  tables([]);
  needs([]);
  log();
  return { stats, tables, needs, log, checkIn, icebreaker };
})();
