# How to run the Wasabi apps

There are **three separate .NET backends**. Port **5000 is always the Wasabi Apps homepage** (login page). Do not run the NutriCost Node server on 5000.

## Ports (fixed in code)

| URL | App | Run this |
|-----|-----|----------|
| **http://localhost:5000** | **Wasabi Apps homepage** (login, then open NutriCost or Timeline) | `cd wasabi-apps\backend` then `dotnet run` |
| **http://localhost:5001** | NutriCost (recipes & costing) | `cd NutriCost\backend` then `dotnet run` |
| **http://localhost:5002** | Timeline (critical path) | `cd wasabi-critical-path\backend` then `dotnet run` |

## Run the homepage first

1. Start the **homepage** (required for login and app links):
   ```bash
   cd c:\Dev\wasabi-apps\backend
   dotnet run
   ```
   You should see it listening on **http://localhost:5000**.

2. Open **http://localhost:5000** in your browser. You should see the **Wasabi Apps** login page (“Sign in to your Wasabi workspace…”). Sign in (or register first via the API), then click **NutriCost** or **Timeline** to open that app.

3. To use NutriCost or Timeline, start those backends too (in separate terminals):
   ```bash
   cd c:\Dev\NutriCost\backend
   dotnet run
   ```
   ```bash
   cd c:\Dev\wasabi-critical-path\backend
   dotnet run
   ```

## If you see NutriCost at http://localhost:5000

That usually means the **NutriCost Node server** (`node server.js` in the NutriCost folder) is running instead of (or as well as) the Wasabi Apps backend. The Node server was changed to use **port 5003** so it no longer clashes with the homepage.

- **Correct:** Run `dotnet run` from **wasabi-apps\backend** → **http://localhost:5000** = homepage.
- **Wrong:** Running `node server.js` from the NutriCost folder used to use 5000; it now uses **5003** so the homepage can use 5000.

## Optional: NutriCost UI only (no .NET API)

From the `NutriCost` folder run:

```bash
node server.js
```

Then open **http://localhost:5003**. This serves only the NutriCost UI (no API, no login gate). For the full setup with homepage and auth, use the .NET backends as above.
