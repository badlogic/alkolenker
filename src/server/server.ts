import bodyParser from "body-parser";
import * as chokidar from "chokidar";
import compression from "compression";
import cors from "cors";
import express from "express";
import * as fs from "fs";
import * as http from "http";
import multer from "multer";
import WebSocket, { WebSocketServer } from "ws";
import { sleep } from "../utils/utils.js";
import { PressRelease } from "../api.js";
import { fetchPressReleases } from "./extraction.js";

const port = process.env.PORT ?? 3333;

let pressReleases: PressRelease[] = [];
const seenReleases = new Set<string>();
const releaseKey = (release: PressRelease) => release.date + "-" + release.title;

(async () => {
    if (fs.existsSync("/data/pressreleases.json")) {
        // fs.unlinkSync("/data/pressreleases.json");
        const result = JSON.parse(fs.readFileSync("/data/pressreleases.json", "utf-8")) as PressRelease[];
        pressReleases.push(...result);
        for (const release of result) {
            seenReleases.add(releaseKey(release));
        }
    }

    const app = express();
    app.set("json spaces", 2);
    app.use(cors());
    app.use(compression());
    app.use(bodyParser.urlencoded({ extended: true }));

    app.get("/api/pressreleases", (req, res) => {
        res.json(pressReleases);
    });

    const server = http.createServer(app);
    server.listen(port, async () => {
        console.log(`App listening on port ${port}`);
    });

    setupLiveReload(server);

    await update();
    setInterval(update, 3600000);
})();

async function update() {
    console.log("Fetching latest releases");
    const urls = [
        { url: "https://www.polizei.gv.at/vbg/presse/aussendungen/presse.aspx", state: "Vorarlberg" },
        { url: "https://www.polizei.gv.at/tirol/presse/aussendungen/presse.aspx", state: "Tirol" },
        { url: "https://www.polizei.gv.at/ktn/presse/aussendungen/presse.aspx", state: "Kärnten" },
        { url: "https://www.polizei.gv.at/sbg/presse/aussendungen/presse.aspx", state: "Salzburg" },
        { url: "https://www.polizei.gv.at/wien/presse/aussendungen/presse.aspx", state: "Wien" },
        { url: "https://www.polizei.gv.at/ooe/presse/aussendungen/presse.aspx", state: "Oberösterreich" },
        { url: "https://www.polizei.gv.at/stmk/presse/aussendungen/presse.aspx", state: "Steiermark" },
        { url: "https://www.polizei.gv.at/bgld/presse/aussendungen/presse.aspx", state: "Burgenland" },
        { url: "https://www.polizei.gv.at/noe/presse/aussendungen/presse.aspx", state: "Niederösterreich" },
    ];
    for (const url of urls) {
        try {
            const releases = (await fetchPressReleases(url.url, url.state)).filter((release) => !seenReleases.has(releaseKey(release)));

            for (const release of releases) {
                seenReleases.add(releaseKey(release));
            }
            console.log(releases);
            pressReleases = [...releases, ...pressReleases];
        } catch (e) {
            console.log("Could not fetch " + url, e);
        }
    }
    fs.writeFileSync("/data/pressreleases.json", JSON.stringify(pressReleases, null, 2));
}

function setupLiveReload(server: http.Server) {
    const wss = new WebSocketServer({ server });
    const clients: Set<WebSocket> = new Set();
    wss.on("connection", (ws: WebSocket) => {
        clients.add(ws);
        ws.on("close", () => {
            clients.delete(ws);
        });
    });

    chokidar.watch("html/", { ignored: /(^|[\/\\])\../, ignoreInitial: true }).on("all", (event, path) => {
        clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(`File changed: ${path}`);
            }
        });
    });
    console.log("Initialized live-reload");
}
