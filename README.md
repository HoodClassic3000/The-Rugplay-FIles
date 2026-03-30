<div align="center">
  <img src="frontend/public/RFlogo.png" alt="The Rugplay Files Logo" width="250" />
</div>

# The Rugplay Files

## About
This is just a project I made to track alt accounts and clusters on rugplay. I am just a data nerd and this website is intended for data collection and processing.

## Features
- Alt detection algorithms and mastermind clustering
- Automated collection of live trades and transfers
- CLI tool to process logs into database snapshots
- Static frontend interface to view rankings

## How Data is Collected
Using a user script we collect data from rugplay and enrich it.

**IMPORTANT RATE LIMIT NOTE:** All API calls within this tool follow a strict 11-second rate limit. I request that anyone who intends to use any part of this project please respect these rate limits and do not alter them. Doing so causes excessive use of the Rugplay servers and goes completely against the wishes of the Rugplay admins and maintainers.

Please note that data scoring and collection has been and is being refined over time, therefore some data may be very inaccurate or inconsistent to other user data depending on when and how they were collected and processed.

## How to Setup the Repo for Self Use
1. Clone the repo and ensure you have [Bun](https://bun.sh/) installed.
2. Run `bun install` in both the `cli` and `frontend` folders.
3. Put your API token in `cli/.env` under `RUGPLAY_COOKIE`.
4. Run `bun run start` in the `cli` folder to natively execute the pipeline and ingest data.
5. Run `bun run dev` in the `frontend` folder to view the site locally.

## How to Setup the User Script
1. Install Tampermonkey on your browser
2. Add a new script and copy the contents of `userscript/rugplay-alt-collector.user.js` into it
3. Browse rugplay and leave a tab open to accumulate background logs
4. Use the script menu to export your JSON log file into the `logs` folder of this repo

## Log Submission
You can submit your own logs to help expand the database by opening a [New Log Submission Issue](../../issues/new/choose) on GitHub. Logs can be submitted as a processed snapshot or as a raw log by dragging and dropping the json file into the automated form. Just keep in mind that all submissions are completely subject to me (HoodClassics) accepting them.

## Contributions
Contributions to the codebase, website or data pipeline, scoring or new alt detection methods are welcomed and subject to acceptance by me.

## Future Plans
My future plans are to incorporate other metrics and not just Alt detection. I am just a data nerd and this website is intended for data collection and processing. I do intend to add other stats tracking in the future, as well as many other features.
