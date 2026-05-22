# partypupils.com

The code that runs the Party Pupils music store. This guide is for someone who wants to 
run the site on their own computer and make changes to it with the help of [Claude Code](https://docs.claude.com/en/docs/claude-code).

You'll install a few free tools once, then describe changes in plain 
English and let Claude Code do the actual work.

---

## How the pieces fit together

Before the steps, here's what each tool is for in one sentence:

- **Git** — keeps a full history of every change to the code, so nothing is ever
  truly lost and you can always go back.
- **GitHub** — a website ([github.com](https://github.com)) that stores the code
  online so it's backed up and shared. The code lives at `gigamesh/partypupils`.
- **VS Code** — the app where the project files live on your computer. You'll mostly
  use it to open the project and run Claude Code inside it.
- **Claude Code** — an AI assistant that reads and edits the code for you. This is
  the tool you'll actually "talk to" to make changes.
- **Vercel** — the service that runs the *live* website at partypupils.com. When
  approved changes are saved to GitHub, Vercel automatically publishes them.

The flow: **edit with Claude Code → test on your computer → save to GitHub → Vercel publishes it.**

---

## Step 1 — Install the tools (one time only)

Do these in order. All are free.

1. **Terminal** — already on your Mac. Open it from `Applications → Utilities → Terminal`.
   This is a text window where you type commands. You'll paste a few commands below;
   press Return after each.

2. **Git** — in Terminal, type `git --version` and press Return. If macOS offers to
   install developer tools, accept it. (Windows: download from
   [git-scm.com](https://git-scm.com/downloads).)

3. **Node.js** — download the **LTS** version from
   [nodejs.org](https://nodejs.org) and run the installer. This lets the project run.

4. **pnpm** — in Terminal, run `npm install -g pnpm`. This installs the project's
   dependencies (the building blocks the site is made of).

5. **VS Code** — download from [code.visualstudio.com](https://code.visualstudio.com)
   and install it.

6. **Claude Code** — in Terminal, run `npm install -g @anthropic-ai/claude-code`.
   Then follow the short sign-in steps in the
   [Claude Code quickstart](https://docs.claude.com/en/docs/claude-code/quickstart).

---

## Step 2 — Get the code onto your computer

1. Open VS Code.
2. Press `Cmd+Shift+P`, type **Git: Clone**, and press Return.
3. Paste this and press Return:
   `https://github.com/gigamesh/partypupils.git`
4. Choose a folder to save it in (e.g. your `Documents` folder), then click
   **Open** when VS Code asks.

You now have a copy of the project on your computer. This copy is yours to
experiment with — nothing you do here affects the live site until you publish it.

---

## Step 3 — Add the decryption key

The project's secrets (database passwords, payment keys, and so on) live in the
`.env` and `.env.prod` files — and those *are* included in the project. But every
value in them is **encrypted**, so the files are useless on their own.

To unlock them you need one key. Ask the project owner for the contents of the
**`.env.keys`** file. In the **top level** of the project folder (the same folder
that contains `README.md`), create a new file named exactly `.env.keys` and paste
in what they sent you.

That single key is all you need — [dotenvx](https://dotenvx.com) uses it to unlock
the settings automatically whenever you run the site.

**Never commit, share, or post the `.env.keys` file. It is the master key to every
secret.**

---

## Step 4 — Run the site on your computer

In VS Code, open the built-in terminal with `` Ctrl+` `` (Control + backtick). You can open multiple terminal windows in VS Code, which is helpful when using Claude because you can have a conversation in one terminal while running thke project in another. 

To install the project, type this in a terminal and hit enter:

```
pnpm install
```

This downloads everything the project needs (takes a few minutes the first time).
Then run:

```
pnpm dev
```

If you want to run the project so that it uses your live production database, use this instead:

```
pnpm dev:prod
```

When it finishes starting, open [http://localhost:3000](http://localhost:3000) in
your browser. That's your private copy of the site. Leave this terminal running
while you work; press `Ctrl+C` to stop it.


> *Optional:* some payment features use the Stripe CLI. The site runs fine without
> it — if you need it, run `brew install stripe/stripe-cli/stripe`.

---

## Step 5 — Make changes with Claude Code

1. In a VS Code terminal, make sure you're in the project folder, then type
   `claude` and press Return.
2. Describe what you want in plain English, for example:
   *"Change the heading on the homepage to say 'New Release Out Now'."*
3. Claude Code will explain what it's going to do and make the edits.
4. Refresh [http://localhost:3000](http://localhost:3000) to see the result.

**Tips for good results:**

- **One change at a time.** Smaller requests are easier to check and undo.
- **Always test locally** (Step 4) before publishing.
- **Ask questions.** Claude Code can explain anything — "what does this file do?"
- **Let Claude handle Git.** Ask it to "save and publish my changes" and it will
  run the technical Git commands for you.
- **If something looks wrong,** tell Claude — e.g. "that broke the layout, please
  undo it." It can revert changes.

More guidance: [Claude Code best practices](https://www.anthropic.com/engineering/claude-code-best-practices).

---

## Step 6 — Publish your changes

When you're happy with a change and have tested it locally, ask Claude Code to
publish it (for example: *"commit these changes and push them to GitHub"*).

This saves your changes to GitHub. **Vercel** notices automatically and publishes
the update to the live site within a minute or two. You can watch deployments and
confirm they succeeded at [vercel.com](https://vercel.com) (ask the project owner
to add you to the Vercel project).

If a deployment fails, Vercel keeps the previous working version live — the site
won't break. Copy any error message and ask Claude Code to help fix it.

---

## If you get stuck

- Ask **Claude Code** directly — describe the problem in plain English, including
  any red error text.
- The site stopped responding? Stop it with `Ctrl+C` and run `pnpm dev` again.
- Still stuck? Contact the project owner.
