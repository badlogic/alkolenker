import { PressRelease } from "../api";
import * as cheerio from "cheerio";

export async function fetchPressReleases(baseUrl: string, state: string): Promise<PressRelease[]> {
    const fetchPage = async (url: string): Promise<string> => {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.text();
    };

    const fetchText = async (url: string): Promise<string> => {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const $ = cheerio.load(await response.text());
        const textParts: string[] = [];
        $(".text_ohne > p").each((_, element) => {
            textParts.push($(element).html()!.replaceAll("<br>", "\n\n").replaceAll("</br>", "\n\n").trim());
        });
        return textParts.join("\n\n");
    };

    const extractReleases = async (html: string): Promise<PressRelease[]> => {
        const $ = cheerio.load(html);
        const releases: PressRelease[] = [];

        $(".uebersicht_pa").each((_, element) => {
            const dateText = $(element).find(".pa_nr p").text().trim();
            const date = dateText.split("vom")[1].trim().split(",")[0];
            const title = $(element).find(".pa_ueberschrift h3").text().trim();
            const url = $(element).find(".pa_weiter p a").attr("href") || "";
            releases.push({ date, title, text: "", url, state });
        });

        for (const release of releases) {
            release.text = await fetchText(release.url);
        }
        return releases;
    };

    let allReleases: PressRelease[] = [];

    for (let pageNum = 0; pageNum < 12; pageNum++) {
        const url = `${baseUrl}?pro=${pageNum}`;
        const html = await fetchPage(url);
        const releases = await extractReleases(html);
        allReleases = allReleases.concat(releases);
    }

    return allReleases;
}
