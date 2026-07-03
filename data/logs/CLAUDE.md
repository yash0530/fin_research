# data/logs/ — daemon logs

Runtime logs (gitignored content): `scheduler.log` / `scheduler.err.log` from the
scheduler daemon. NOTE (Jul 3 incident): the daemon must run from a TCC-granted
context — launchd agents cannot read ~/Desktop without a Files-and-Folders/Full-Disk
grant for node (see EXEC_PLAN.md status log for the permanent-fix options).
