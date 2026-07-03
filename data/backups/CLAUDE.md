# data/backups/ — daily DB snapshots

`engine-YYYY-MM-DD.db` files written by the `backup` job (VACUUM INTO after the
morning chain; newest 14 kept, pruned automatically). Contents are gitignored.
Restore = stop the daemon, copy a snapshot over `data/engine.db`, restart.
