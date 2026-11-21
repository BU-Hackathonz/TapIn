"""Point values and time rules (Playbook: Points (exact))."""
FIRST_CHECKIN = 1          # to the person, first check-in of the day
NEW_CONNECTION = 5         # to each of the two people
JOIN_GROUP = 10            # to the joiner
MEMBER_WELCOME = 5         # to each current member, and x members to the group
WELCOME_BONUS_BELOW = 2    # joiner with fewer connections than this doubles the group's points
HERE_HOURS = 3             # "here now" and "active group" window
TIMEZONE = "America/New_York"  # what counts as "today"
